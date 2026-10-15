"""Runs one learner program, the same way in the browser (Pyodide) and at build time (CPython).

The page's run worker (src/engine/run.worker.ts) and the content build's Python worker
(scripts/content/pyworker.py) both import this file and call run(). Everything that decides what a
program prints lives here, so the expected outputs made at build time are what the browser prints.

- The program's files are written to a fresh working folder, with any files a test gives it.
- input() prints its prompt, reads the next line of the test's input and echoes it with a line
  break, as a terminal shows what you type. So the output reads like the MOOC's example runs.
  When the input runs out, input() raises EOFError, as Python does at the end of a file.
- A test can run the program (`__name__ == "__main__"`), or load it as a module named after its
  file (so code under `if __name__ == "__main__":` doesn't run) and then run the test's own code,
  `call`, in the program's namespace. Like the interactive interpreter, a call whose last statement
  is an expression prints that expression's repr, unless it is None.
- A crash prints Python's own traceback, with only the frames in the learner's files (lines in
  Python's own modules differ between Pyodide and CPython, so they are left out).
- Output is capped; the run stops when the program prints more than the cap.
- A program that uses pygame gets a window without a screen (src/engine/arena_pygame.py): its
  frames go to the sink as they're shown, and the result says how the window ended.
"""

import ast
import builtins
import io
import linecache
import os
import re
import shutil
import sys
import traceback
import types

OUTPUT_LIMIT = 64 * 1024
TEST_FILE = "<test>"
_PYGAME = re.compile(r"^[ \t]*(?:import[ \t]+pygame\b|from[ \t]+pygame\b)", re.M)


def uses_pygame(files):
    """Whether any of the program's files imports pygame (the run worker loads pygame for it first)."""
    return any(isinstance(text, str) and _PYGAME.search(text) for text in files.values())


class OutputLimit(BaseException):
    """Raised when the program prints more than the cap (a BaseException, so `except Exception` can't catch it)."""


class _Writer(io.TextIOBase):
    def __init__(self, stream, sink, counter):
        self._stream = stream
        self._sink = sink
        self._counter = counter

    @property
    def encoding(self):
        return "utf-8"

    @property
    def errors(self):
        return "strict"

    def writable(self):
        return True

    def isatty(self):
        return False

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError(f"write() argument must be str, not {type(text).__name__}")
        if not text:
            return 0
        room = OUTPUT_LIMIT - self._counter[0]
        if len(text) > room:
            if room > 0:
                self._sink(self._stream, text[:room])
            self._counter[0] = OUTPUT_LIMIT
            raise OutputLimit()
        self._counter[0] += len(text)
        self._sink(self._stream, text)
        return len(text)

    def flush(self):
        pass


class _Input(io.TextIOBase):
    """The test's input, read a line at a time."""

    def __init__(self, text):
        self._lines = io.StringIO(text.replace("\r\n", "\n"))

    def readable(self):
        return True

    def isatty(self):
        return False

    def readline(self, size=-1):
        return self._lines.readline(size)

    def read(self, size=-1):
        return self._lines.read(size)

    def __iter__(self):
        return iter(self._lines.readline, "")


def _safe_name(path):
    """A file name a test may use: relative, no '..', no leading slash."""
    parts = path.replace("\\", "/").split("/")
    if not path or path.startswith("/") or any(p in ("", ".", "..") for p in parts):
        raise ValueError(f"bad file name: {path!r}")
    return os.path.join(*parts)


def _write_file(root, path, data):
    full = os.path.join(root, _safe_name(path))
    os.makedirs(os.path.dirname(full) or root, exist_ok=True)
    if isinstance(data, str):
        with open(full, "w", encoding="utf-8", newline="") as f:
            f.write(data)
    else:
        # In Pyodide a file's bytes arrive as a JavaScript Uint8Array.
        if hasattr(data, "to_bytes"):
            data = data.to_bytes()
        with open(full, "wb") as f:
            f.write(bytes(data))


def _files_in(root, skip):
    """Every file left in the working folder (not the program's own .py files): text, or bytes when it isn't UTF-8."""
    found = {}
    for folder, dirs, names in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d != "__pycache__")
        for name in sorted(names):
            full = os.path.join(folder, name)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            if rel in skip:
                continue
            with open(full, "rb") as f:
                data = f.read()
            try:
                found[rel] = data.decode("utf-8")
            except UnicodeDecodeError:
                found[rel] = data
    return found


def _own_traceback(tb, own):
    """The traceback without the frames outside the learner's files (this harness's, Python's own modules')."""
    frames = []
    while tb is not None:
        if tb.tb_frame.f_code.co_filename in own:
            frames.append(tb)
        tb = tb.tb_next
    result = None
    for t in reversed(frames):
        result = types.TracebackType(result, t.tb_frame, t.tb_lasti, t.tb_lineno)
    return result


def _strip_frames(exc, own, seen=None):
    seen = seen if seen is not None else set()
    if exc is None or id(exc) in seen:
        return
    seen.add(id(exc))
    exc.__traceback__ = _own_traceback(exc.__traceback__, own)
    _strip_frames(exc.__cause__, own, seen)
    _strip_frames(exc.__context__, own, seen)


def _innermost_file(tb):
    last = None
    while tb is not None:
        last = tb.tb_frame.f_code.co_filename
        tb = tb.tb_next
    return last


# Pyodide's error numbers are Emscripten's, not Linux's: a missing file is [Errno 44] there and
# [Errno 2] on a computer. Tracebacks show the numbers CPython on Linux (and macOS) shows.
_EMSCRIPTEN_ERRNO = {44: 2, 31: 21, 20: 17, 54: 20, 2: 13, 55: 39, 28: 22, 63: 1}


def _linux_errno(text):
    if sys.platform != "emscripten":
        return text
    return re.sub(r"\[Errno (\d+)\]", lambda m: f"[Errno {_EMSCRIPTEN_ERRNO.get(int(m.group(1)), int(m.group(1)))}]", text)


def _report(e, own, root, errors, result):
    """Prints an exception as Python does, with only the frames in the program's own files."""
    # A syntax error in main.py has no frame of the program's own, so it prints as Python prints it for a script.
    _strip_frames(e, own)
    text = _linux_errno("".join(traceback.format_exception(e)))
    text = text.replace(root + os.sep, "").replace(root + "/", "")
    try:
        errors.write(text)
    except OutputLimit:
        result["truncated"] = True


def _repl(statements, namespace, out_chars, result):
    """Runs statements as the interactive interpreter does (an expression's value is printed), noting
    where each one's output ends in result["repl"]. An exception prints its traceback and the session goes on."""
    marks = []
    for i, source in enumerate(statements):
        try:
            exec(compile(source, "<stdin>", "single"), namespace)
        except SystemExit:
            marks.append(out_chars[0])
            break
        except OutputLimit:
            result["truncated"] = True
            break
        except BaseException as e:  # noqa: BLE001
            e.__traceback__ = _own_traceback(e.__traceback__, {"<stdin>"})
            try:
                sys.stderr.write("".join(traceback.format_exception(e)))
            except OutputLimit:
                result["truncated"] = True
                break
        marks.append(out_chars[0])
    result["repl"] = marks


def run(spec, sink, workdir):
    """Run one program.

    spec: {"files": {name: text}, "main": "main.py", "stdin": str, "given": {name: str | bytes},
           "args": [str], "call": str | None, "repl": [str] | None, "window": {...} | None}
    With "repl", the statements run as in the interactive interpreter instead of the program (the
    content build checks the >>> examples of lessons this way). "window" is the pygame window's
    frames and events (see arena_pygame.Window); a program that imports pygame gets a window anyway.
    sink(stream, text): receives everything printed, "stdout" or "stderr", in order; and each frame
    of a pygame window as ("frame", {"index", "log", "png", "title"}).
    workdir: an empty folder that doesn't exist yet; it is removed afterwards.

    Returns {"exit": int, "truncated": bool, "files": {...}, "callStart": int | None,
             "callError": bool, "loadInput": bool, "callValue": "none" | "value" | None,
             "window": {...} | None}: the exit code,
    whether the output cap stopped it, the files left in the folder, where the call's output starts in
    stdout (call tests: what loading the program printed comes before it), whether a call test couldn't
    call the learner's code at all (the error is in the test's own line, such as a missing function),
    whether loading the program for a call test tried to read input, and what the call's last
    expression gave: None ("none"), another value ("value"), or no last expression at all (None);
    and for a pygame program, its window: how many frames it showed, its size and title, how it
    ended ("program": the program ended, "closed": it ended when its window was closed, "stopped":
    it kept drawing after that) and the last frame's text.
    """
    files = spec.get("files") or {}
    main = spec.get("main") or "main.py"
    call = spec.get("call")
    os.makedirs(workdir)
    root = os.path.realpath(workdir)
    for name, text in (spec.get("given") or {}).items():
        _write_file(root, name, text)
    for name, text in files.items():
        _write_file(root, name, text)
    # The names the program's code objects carry: main.py as given, other files by their full path (as imported).
    own = {main, TEST_FILE} | {os.path.join(root, _safe_name(n)) for n in files}

    counter = [0]
    stdout_chars = [0]
    out_chars = [0]

    def out(stream, text):
        if stream == "stdout":
            stdout_chars[0] += len(text)
        out_chars[0] += len(text)
        sink(stream, text)

    saved = {
        "stdin": sys.stdin,
        "stdout": sys.stdout,
        "stderr": sys.stderr,
        "argv": sys.argv,
        "path": list(sys.path),
        "cwd": os.getcwd(),
        "input": builtins.input,
        "modules": set(sys.modules),
        "recursion": sys.getrecursionlimit(),
    }
    stdin = _Input(spec.get("stdin") or "")
    writer = _Writer("stdout", out, counter)
    errors = _Writer("stderr", out, counter)
    state = {"loading": False, "loadInput": False}

    def arena_input(prompt=""):
        if state["loading"]:
            state["loadInput"] = True
        if prompt != "":
            sys.stdout.write(str(prompt))
        line = stdin.readline()
        if line == "":
            raise EOFError("EOF when reading a line")
        if line.endswith("\n"):
            line = line[:-1]
        sys.stdout.write(line + "\n")
        return line

    # The recursion limit counts from here as it would from a script's first line: `python main.py` runs
    # the program's module code as the first frame. Pyodide and the build's worker call run() at different
    # depths, so without this a RecursionError would come at a different depth in each.
    depth = 0
    frame = sys._getframe()
    while frame is not None:
        depth += 1
        frame = frame.f_back
    sys.setrecursionlimit(1000 + depth)

    result = {"exit": 0, "truncated": False, "files": {}, "callStart": None, "callError": False, "loadInput": False, "callValue": None, "repl": None, "window": None}
    window = None
    closed = ()
    if spec.get("window") is not None or (spec.get("repl") is None and uses_pygame(files)):
        import arena_pygame

        window = arena_pygame.start(spec.get("window") or {}, lambda frame: sink("frame", frame))
        closed = (arena_pygame.WindowClosed,)
    try:
        os.chdir(root)
        sys.path.insert(0, root)
        sys.argv = [main] + list(spec.get("args") or [])
        sys.stdin = stdin
        sys.stdout = writer
        sys.stderr = errors
        builtins.input = arena_input
        try:
            module = types.ModuleType("__main__" if call is None else os.path.splitext(main)[0])
            module.__dict__.update({"__file__": main, "__builtins__": builtins})
            namespace = module.__dict__
            if spec.get("repl") is not None:
                _repl(spec["repl"], namespace, out_chars, result)
            else:
                if call is not None:
                    # The learner's other files can `import main` and get this same module.
                    sys.modules[module.__name__] = module
                code = compile(files.get(main, ""), main, "exec")
                state["loading"] = call is not None
                exec(code, namespace)
                state["loading"] = False
                if call is not None:
                    result["callStart"] = stdout_chars[0]
                    # The test's lines show in a traceback, as the program's do.
                    linecache.cache[TEST_FILE] = (len(call), None, call.splitlines(True), TEST_FILE)
                    tree = ast.parse(call, TEST_FILE, "exec")
                    last = tree.body[-1] if tree.body and isinstance(tree.body[-1], ast.Expr) else None
                    if last is not None:
                        tree.body.pop()
                    exec(compile(tree, TEST_FILE, "exec"), namespace)
                    if last is not None:
                        value = eval(compile(ast.Expression(last.value), TEST_FILE, "eval"), namespace)
                        result["callValue"] = "none" if value is None else "value"
                        if value is not None:
                            sys.stdout.write(repr(value) + "\n")
        except SystemExit as e:
            code = e.code
            if code is None:
                result["exit"] = 0
            elif isinstance(code, int):
                result["exit"] = code & 0xFF if code >= 0 else (256 + code) & 0xFF
            else:
                errors.write(str(code) + "\n")
                result["exit"] = 1
        except OutputLimit:
            result["truncated"] = True
            result["exit"] = 1
        except closed:
            # The program kept drawing after its window was closed: it ends there, as if closed by hand.
            pass
        except BaseException as e:  # noqa: BLE001 - every crash is reported like Python reports it
            result["exit"] = 1
            if call is not None and result["callStart"] is not None and _innermost_file(e.__traceback__) == TEST_FILE:
                result["callError"] = True
            result["loadInput"] = state["loadInput"]
            _report(e, own, root, errors, result)
    finally:
        if window is not None:
            import arena_pygame

            try:
                result["window"] = window.finish()
            finally:
                arena_pygame.stop()
        sys.stdin = saved["stdin"]
        sys.stdout = saved["stdout"]
        sys.stderr = saved["stderr"]
        sys.argv = saved["argv"]
        sys.path[:] = saved["path"]
        builtins.input = saved["input"]
        sys.setrecursionlimit(saved["recursion"])
        os.chdir(saved["cwd"])
        # The program's own modules are forgotten (Python's own stay loaded, which only saves time).
        for name in set(sys.modules) - saved["modules"]:
            mod = sys.modules.get(name)
            path = getattr(mod, "__file__", None) or ""
            if mod is None or name == os.path.splitext(main)[0] or (path and os.path.realpath(path).startswith(root + os.sep)):
                sys.modules.pop(name, None)
    result["files"] = _files_in(root, set(files))
    shutil.rmtree(root, ignore_errors=True)
    return result

