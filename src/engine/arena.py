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
- When the program ends, its objects are freed as Python frees them at exit, so a file it didn't
  close is written out, and what a __del__ prints is part of this run's output. What it changed in
  the interpreter (hooks, warnings filters, its profiler, gc's settings) ends with it.
- A program that uses pygame gets a window without a screen (src/engine/arena_pygame.py): its
  frames go to the sink as they're shown, and the result says how the window ended.
"""

import ast
import builtins
import gc
import io
import linecache
import operator
import os
import re
import shutil
import sys
import traceback
import types
import warnings

OUTPUT_LIMIT = 64 * 1024
TEST_FILE = "<test>"
# Python's own sys.getrecursionlimit and sys.setrecursionlimit: during a run the program gets others (see run()).
_get_limit = sys.getrecursionlimit
_set_limit = sys.setrecursionlimit
# A line that imports pygame, alone or in a list (`import sys, pygame`, `import os, pygame as pg`, `from pygame
# import ...`). src/engine/pygame-import.ts has the same expression for the page and the build.
_PYGAME = re.compile(r"^[ \t]*(?:import[ \t]+(?:[\w.]+(?:[ \t]+as[ \t]+\w+)?[ \t]*,[ \t]*)*pygame\b|from[ \t]+pygame\b)", re.M)


def uses_pygame(files):
    """Whether any of the program's files imports pygame (the run worker loads pygame for it first)."""
    return any(isinstance(text, str) and _PYGAME.search(text) for text in files.values())


class OutputLimit(BaseException):
    """Raised when the program prints more than the cap (a BaseException, so `except Exception` can't catch it)."""


class _Writer(io.TextIOBase):
    """One of the program's output streams. counter is shared by both streams: [characters printed,
    whether the cap cut the output] (the program may catch OutputLimit and go on, but its output was cut)."""

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
        # Printing costs the program two frames of its recursion limit: this one, and one to spare that lets
        # it set the limit back. The code below gets room of its own: it differs between the page and the
        # build (a sink in JavaScript or in Python), and a program that prints near its limit must print the
        # same in both.
        limit = _get_limit()
        fits = True
        try:
            _set_limit(limit)
        except RecursionError:
            fits = False
        if not fits:
            # Raised outside the except, so the error the program was handling when it printed shows before it,
            # as in Python ("During handling of the above exception, another exception occurred").
            raise RecursionError("maximum recursion depth exceeded")
        _set_limit(limit + 50)
        try:
            room = OUTPUT_LIMIT - self._counter[0]
            if len(text) > room:
                if room > 0:
                    self._sink(self._stream, text[:room])
                self._counter[0] = OUTPUT_LIMIT
                self._counter[1] = True
                raise OutputLimit()
            self._counter[0] += len(text)
            self._sink(self._stream, text)
        finally:
            _set_limit(limit)
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


def _traceback(tb, keep):
    """The traceback with only the frames whose file name keep(name) is true for."""
    frames = []
    while tb is not None:
        if keep(tb.tb_frame.f_code.co_filename):
            frames.append(tb)
        tb = tb.tb_next
    result = None
    for t in reversed(frames):
        result = types.TracebackType(result, t.tb_frame, t.tb_lasti, t.tb_lineno)
    return result


def _own_traceback(tb, own):
    """The traceback without the frames outside the learner's files (this harness's, Python's own modules')."""
    return _traceback(tb, own.__contains__)


def _strip_frames(exc, own):
    """Strips the frames outside the program's files from an exception, the ones it was raised from or while
    handling, and the ones in an exception group. A loop, not recursion: a program can chain thousands."""
    seen = set()
    todo = [exc]
    while todo:
        e = todo.pop()
        if e is None or id(e) in seen:
            continue
        seen.add(id(e))
        e.__traceback__ = _own_traceback(e.__traceback__, own)
        todo += [e.__cause__, e.__context__]
        if isinstance(e, BaseExceptionGroup):
            todo += e.exceptions


def _innermost_file(tb):
    last = None
    while tb is not None:
        last = tb.tb_frame.f_code.co_filename
        tb = tb.tb_next
    return last


# Pyodide's error numbers are Emscripten's, not Linux's: a missing file is [Errno 44] there and
# [Errno 2] on a computer. Tracebacks show the numbers CPython on Linux (and macOS) shows. An error
# the program catches keeps Emscripten's number (`print(e)`, `e.errno`): Pyodide's errno module,
# os.strerror() and the choice of OSError's subclass all use those numbers, so changing it there
# would break `e.errno == errno.ENOENT`. content/README.md tells authors not to print it.
_EMSCRIPTEN_ERRNO = {44: 2, 31: 21, 20: 17, 54: 20, 2: 13, 55: 39, 28: 22, 63: 1}


def _linux_errno(text):
    if sys.platform != "emscripten":
        return text
    return re.sub(r"\[Errno (\d+)\]", lambda m: f"[Errno {_EMSCRIPTEN_ERRNO.get(int(m.group(1)), int(m.group(1)))}]", text)


def _report(e, own, root, errors):
    """Prints an exception as Python does, with only the frames in the program's own files."""
    # A syntax error in main.py has no frame of the program's own, so it prints as Python prints it for a script.
    _strip_frames(e, own)
    text = _linux_errno("".join(traceback.format_exception(e)))
    text = text.replace(root + os.sep, "").replace(root + "/", "")
    try:
        errors.write(text)
    except OutputLimit:
        pass


def _cache_lines(name, text):
    """Puts a source's lines in linecache under the name its code is compiled with, split as Python reads a
    file. With no time stamp, linecache never checks them against a file."""
    lines = io.StringIO(text, newline=None).readlines()
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    linecache.cache[name] = (len(text), None, lines, name)


_FILE_TYPES = (io.TextIOWrapper, io.BufferedWriter, io.BufferedRandom)


def _flush_files():
    """Writes out what the program wrote to files it left open. Freeing them does that too, but garbage
    collection frees a cycle's objects in no set order, and can close a file's buffer before the file, so
    the file's last text is lost. An open file refers to its type, so the objects that refer to the file
    types are found without going through every object in Python, and what was alive before the run is
    frozen (gc.freeze), so these are the program's. `is`, not `in`: an `==` could run the program's code."""
    for obj in gc.get_referrers(*_FILE_TYPES):
        if any(type(obj) is t for t in _FILE_TYPES):
            try:
                if not obj.closed:
                    obj.flush()
            except BaseException:  # noqa: BLE001 - a file that can't be written is left as it is, as Python leaves it
                pass


def _depth(frame):
    """How many frames deep a frame is: Python's recursion limit counts them."""
    n = 0
    while frame is not None:
        n += 1
        frame = frame.f_back
    return n


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
            break
        except BaseException as e:  # noqa: BLE001
            e.__traceback__ = _own_traceback(e.__traceback__, {"<stdin>"})
            # The traceback is made with room to spare, whatever recursion limit the statements set.
            limit = _get_limit()
            _set_limit(limit + 50)
            try:
                text = "".join(traceback.format_exception(e))
            finally:
                _set_limit(limit)
            try:
                sys.stderr.write(text)
            except OutputLimit:
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
    whether the output cap cut the output, the files left in the folder, where the call's output starts in
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

    counter = [0, False]
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
        "main": sys.modules.get("__main__"),
        "recursion": sys.getrecursionlimit(),
        "getrecursionlimit": sys.getrecursionlimit,
        "setrecursionlimit": sys.setrecursionlimit,
        "gc": gc.callbacks[:],
        "gc_debug": gc.get_debug(),
        "gc_enabled": gc.isenabled(),
        "profile": sys.getprofile(),
        "trace": sys.gettrace(),
        "digits": sys.get_int_max_str_digits(),
        "tools": [sys.monitoring.get_tool(i) for i in range(6)],
        "garbage": len(gc.garbage),
        "displayhook": sys.displayhook,
        "excepthook": sys.excepthook,
        "unraisablehook": sys.unraisablehook,
    }
    stdin = _Input(spec.get("stdin") or "")
    writer = _Writer("stdout", out, counter)
    errors = _Writer("stderr", out, counter)
    state = {"loading": False, "loadInput": False}

    def arena_input(*args, **kwargs):
        # Python's input() takes the prompt only by position, and says so as here.
        if kwargs:
            raise TypeError("input() takes no keyword arguments")
        if len(args) > 1:
            raise TypeError(f"input expected at most 1 argument, got {len(args)}")
        prompt = args[0] if args else ""
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
    # depths, so without this a RecursionError would come at a different depth in each. The program reads
    # and sets the limit counted the same way: it sees Python's 1000, and reads back the limit it set.
    depth = _depth(sys._getframe())
    _set_limit(1000 + depth)
    asked = [1000]
    # The files of the code that runs the program: this harness and the build's worker.
    outside = set()
    frame = sys._getframe()
    while frame is not None:
        outside.add(frame.f_code.co_filename)
        frame = frame.f_back

    def getrecursionlimit(*args, **kwargs):
        # As Python's own, which takes no arguments and says so as here.
        if kwargs:
            raise TypeError("sys.getrecursionlimit() takes no keyword arguments")
        if args:
            raise TypeError(f"sys.getrecursionlimit() takes no arguments ({len(args)} given)")
        return asked[0]

    def setrecursionlimit(*args, **kwargs):
        if kwargs:
            raise TypeError("sys.setrecursionlimit() takes no keyword arguments")
        if len(args) != 1:
            raise TypeError(f"sys.setrecursionlimit() takes exactly one argument ({len(args)} given)")
        limit = operator.index(args[0])
        if not -(2**31) <= limit < 2**31:
            raise OverflowError("Python int too large to convert to C int")
        if limit < 1:
            raise ValueError("recursion limit must be greater or equal than 1")
        here = _depth(sys._getframe(1)) - depth
        if here >= limit:
            raise RecursionError(f"cannot set the recursion limit to {limit} at the recursion depth {here}: the limit is too low")
        # Python's check counts this function's frame too, so a limit just one above the caller's depth gets a frame
        # more. A limit far beyond any depth a program reaches is kept within what Python takes, with `depth` added.
        _set_limit(min(max(limit, here + 2), 2**30) + depth)
        asked[0] = limit

    def showwarnmsg(msg):
        # As Python's own, but a warning in another of the program's files names it without the working
        # folder, as a traceback does (the folder differs between the page and the build). One made in the
        # code that runs the program (while its objects are freed at its end, or with a stacklevel above its
        # first line) names no file, as Python's does when none of a program's code is running.
        if msg.filename in outside:
            msg = warnings.WarningMessage(msg.message, msg.category, "<sys>", 0, msg.file, "")
        file = sys.stderr if msg.file is None else msg.file
        if file is not None:
            try:
                file.write(warnings._formatwarnmsg(msg).replace(root + os.sep, ""))
            except OSError:
                pass

    result = {"exit": 0, "truncated": False, "files": {}, "callStart": None, "callError": False, "loadInput": False, "callValue": None, "repl": None, "window": None}
    # The warnings filters the program sets end with it.
    caught = warnings.catch_warnings()
    caught.__enter__()
    # Everything alive now (Pyodide, Python's own modules) is left out of garbage collection until the
    # program has ended, so the work at its end only looks at the program's objects (a full collection
    # takes over 10 ms in the browser). That work still grows with them: freeing two million lists takes
    # about as long as making them, as when Python ends.
    gc.freeze()
    window = None
    closed = ()
    try:
        if spec.get("window") is not None or (spec.get("repl") is None and uses_pygame(files)):
            import arena_pygame

            # After gc.freeze(): the window and the pictures it keeps are freed with the program's objects.
            window = arena_pygame.start(spec.get("window") or {}, lambda frame: sink("frame", frame))
            closed = (arena_pygame.WindowClosed,)
        os.chdir(root)
        sys.path.insert(0, root)
        sys.argv = [main] + list(spec.get("args") or [])
        sys.stdin = stdin
        sys.stdout = writer
        sys.stderr = errors
        builtins.input = arena_input
        sys.getrecursionlimit = getrecursionlimit
        sys.setrecursionlimit = setrecursionlimit
        # What Python's own showwarning calls with the whole warning, so its tracemalloc hint still shows
        # (catch_warnings puts Python's back).
        warnings._showwarnmsg_impl = showwarnmsg
        try:
            module = types.ModuleType("__main__" if call is None else os.path.splitext(main)[0])
            module.__dict__.update({"__file__": main, "__builtins__": builtins})
            namespace = module.__dict__
            # Python's own modules find the program as __main__, as with `python main.py` (pickle, doctest,
            # unittest.main() look there). A call test's program is the module it's loaded as, and the
            # learner's other files can `import main` and get this same module.
            sys.modules[module.__name__] = module
            if spec.get("repl") is not None:
                _repl(spec["repl"], namespace, out_chars, result)
            else:
                # Its own lines, for a warning or a traceback: the warnings module reads linecache without
                # checking it against the file, and an earlier program's traceback can have left its own
                # main.py there.
                _cache_lines(main, files.get(main, ""))
                code = compile(files.get(main, ""), main, "exec")
                state["loading"] = call is not None
                exec(code, namespace)
                state["loading"] = False
                if call is not None:
                    result["callStart"] = stdout_chars[0]
                    # The test's lines show in a traceback, as the program's do.
                    _cache_lines(TEST_FILE, call)
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
                # Python prints the message, or only the line break when it can't be made into text.
                try:
                    message = str(code)
                except BaseException:  # noqa: BLE001
                    message = ""
                try:
                    errors.write(message + "\n")
                except OutputLimit:
                    pass
                result["exit"] = 1
        except OutputLimit:
            result["exit"] = 1
        except closed:
            # The program kept drawing after its window was closed: it ends there, as if closed by hand.
            pass
        except BaseException as e:  # noqa: BLE001 - every crash is reported like Python reports it
            # The traceback is made with the harness's own limit: a program's may leave no room for it.
            _set_limit(1000 + depth)
            result["exit"] = 1
            if call is not None and result["callStart"] is not None and _innermost_file(e.__traceback__) == TEST_FILE:
                result["callError"] = True
            result["loadInput"] = state["loadInput"]
            _report(e, own, root, errors)
    finally:
        # The program's profile and trace functions and its gc settings end with it: the harness's own work
        # below is none of theirs (gc's debug output has times in it, and counts of the page's or the build's
        # objects). The work below has the harness's own limit too.
        sys.setprofile(saved["profile"])
        sys.settrace(saved["trace"])
        for tool, had in enumerate(saved["tools"]):
            # A sys.monitoring tool the program took: freeing it drops its events and callbacks too.
            if had is None and sys.monitoring.get_tool(tool) is not None:
                sys.monitoring.free_tool_id(tool)
        gc.set_debug(saved["gc_debug"])
        (gc.enable if saved["gc_enabled"] else gc.disable)()
        # What gc.DEBUG_SAVEALL kept of the program's goes with its other objects.
        del gc.garbage[saved["garbage"]:]
        _set_limit(1000 + depth)
        if window is not None:
            import arena_pygame

            try:
                result["window"] = window.finish()
            finally:
                arena_pygame.stop()
        # Then what Python does when a program ends, while its output and input are still this run's: the
        # files it left open are written out, the streams go back to the ones it started with and the
        # interactive interpreter's last value is dropped (the hosts have none of their own), its modules are
        # forgotten (Python's own stay loaded, which only saves time) and its objects are freed. So the files
        # read below have all it wrote, and what a __del__ prints shows here, not in a later run (or in the
        # build worker's channel to the build).
        _flush_files()
        sys.stdin, sys.stdout, sys.stderr = stdin, writer, errors
        vars(builtins).pop("_", None)
        if saved["main"] is not None:
            sys.modules["__main__"] = saved["main"]
        for name in set(sys.modules) - saved["modules"]:
            mod = sys.modules.get(name)
            path = getattr(mod, "__file__", None) or ""
            if mod is None or name == os.path.splitext(main)[0] or (path and os.path.realpath(path).startswith(root + os.sep)):
                sys.modules.pop(name, None)
        # Python frees them with none of its code running, so an error in a finalizer then (such as a warning
        # the program's filters make an error) shows no line of the code that runs the program. Python takes a
        # hook of None to mean its own.
        hook = sys.unraisablehook

        def unraisable(u):
            u = type(u)((u.exc_type, u.exc_value, _traceback(u.exc_traceback, lambda name: name not in outside), u.err_msg, u.object))
            (sys.__unraisablehook__ if hook is None else hook)(u)

        sys.unraisablehook = unraisable
        module = namespace = value = code = window = None
        gc.collect()
        # Then Python's own hooks and warnings filters come back. The program's saw its last collection, as
        # when Python ends, and what only they kept alive is freed now (else a later run would print it),
        # still without the harness's lines.
        gc.callbacks[:] = saved["gc"]
        sys.displayhook = saved["displayhook"]
        sys.excepthook = saved["excepthook"]
        hook = saved["unraisablehook"]
        caught.__exit__(None, None, None)
        gc.collect()
        sys.unraisablehook = saved["unraisablehook"]
        gc.unfreeze()
        sys.stdin = saved["stdin"]
        sys.stdout = saved["stdout"]
        sys.stderr = saved["stderr"]
        sys.argv = saved["argv"]
        sys.path[:] = saved["path"]
        builtins.input = saved["input"]
        sys.getrecursionlimit = saved["getrecursionlimit"]
        sys.setrecursionlimit = saved["setrecursionlimit"]
        sys.setrecursionlimit(saved["recursion"])
        sys.set_int_max_str_digits(saved["digits"])
        os.chdir(saved["cwd"])
        # The program's lines leave linecache with it.
        for name in [n for n in linecache.cache if n in own or n.startswith(root + os.sep)]:
            del linecache.cache[name]
    result["truncated"] = counter[1]
    result["files"] = _files_in(root, set(files))
    shutil.rmtree(root, ignore_errors=True)
    return result

