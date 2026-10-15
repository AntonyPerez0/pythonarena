// Tests of the harness (src/engine/arena.py) that runs every program: on the page in Pyodide, in the content build
// on the reference CPython. Each program runs in both, one after another in one interpreter as the page runs them,
// and must print the same in both, and what `python main.py` prints: the end of a run (sys.exit, the output cap, a
// long chain of exceptions), warnings, files left open, __del__ and what else Python does as a program ends, the
// interpreter-wide settings a program changes, the program as __main__, the recursion limit and input().
// Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { pythonPool, referencePython } from "./content/python.mjs";
import { pyodidePool } from "./content/pyodide.mjs";

let python = null;
try {
  python = referencePython();
} catch (e) {
  if (process.env.CI) throw e;
  console.warn(`harness: skipped (${e.message})`);
}
// One worker each, so the programs of a test run one after another in the same interpreter.
const cpython = python ? pythonPool({ exe: python.exe, size: 1, timeLimitMs: 20_000 }) : null;
const pyodide = python ? pyodidePool({ size: 1, timeLimitMs: 60_000 }) : null;
test.after(() => {
  cpython?.close();
  pyodide?.close();
});
const it = (name, fn) => test(name, { skip: !python && "no reference CPython" }, fn);

/** Runs a program (main.py's text, or its files) in CPython and in Pyodide, checks that both end the same, and gives CPython's result. */
async function run(files, more = {}) {
  const spec = { files: typeof files === "string" ? { "main.py": files } : files, main: "main.py", stdin: "", given: {}, args: [], ...more };
  const [a, b] = await Promise.all([cpython.run(spec), pyodide.run(spec)]);
  for (const k of ["output", "exit", "truncated", "files", "callValue"]) assert.deepEqual(b[k], a[k], `${k} differs between CPython and Pyodide`);
  return a;
}

it("sys.exit with a message after the output cap ends the run, cut, with exit code 1", async () => {
  // A bare except catches the cap's stop too; the message then has no room left.
  let r = await run("import sys\nn = 0\ntry:\n    while True:\n        n += 1\n        print(n)\nexcept:\n    sys.exit(\"Something went wrong\")\n");
  assert.equal(r.exit, 1);
  assert.equal(r.truncated, true);
  assert.equal(r.output.length, 64 * 1024);
  r = await run("import sys\nprint(\"x\" * 65535)\nsys.exit(\"Invalid input\")\n");
  assert.equal(r.exit, 1);
  assert.equal(r.truncated, true);
  assert.equal(r.output, "x".repeat(65535) + "\n");
});

it("a program that catches the cap's stop and ends normally still counts as cut", async () => {
  const r = await run("try:\n    while True:\n        print(\"spam\")\nexcept BaseException:\n    pass\n");
  assert.equal(r.exit, 0);
  assert.equal(r.truncated, true);
});

it("sys.exit with a message that can't be made into text prints only the line break, as Python does", async () => {
  const r = await run("import sys\n\n\nclass Code:\n    def __str__(self):\n        raise ValueError(\"no\")\n\n\nsys.exit(Code())\n");
  assert.equal(r.exit, 1);
  assert.equal(r.output, "\n");
});

it("a warning shows its own program's line, also after an earlier program's crash", async () => {
  assert.equal((await run("total = 10 / 0\n")).exit, 1);
  let r = await run("x = 5\nif x is 5:\n    print(\"five\")\n");
  assert.equal(r.output, "main.py:2: SyntaxWarning: \"is\" with 'int' literal. Did you mean \"==\"?\n  if x is 5:\nfive\n");
  r = await run("print(\"\\d\")\n");
  assert.equal(r.output, 'main.py:1: SyntaxWarning: "\\d" is an invalid escape sequence. Such sequences will not work in the future. Did you mean "\\\\d"? A raw string is also an option.\n  print("\\d")\n\\d\n');
});

it("the warnings filters a program sets end with it, and a warning in another file names it without the folder", async () => {
  assert.equal((await run("import warnings\nwarnings.simplefilter(\"error\")\nprint(\"strict\")\n")).output, "strict\n");
  let r = await run("x = 5\nif x is 5:\n    print(\"five\")\n");
  assert.equal(r.exit, 0);
  assert.match(r.output, /^main\.py:2: SyntaxWarning: /);
  r = await run({ "main.py": "import helper\n\nprint(helper.same(5))\n", "helper.py": "def same(x):\n    return x is 5\n" });
  assert.equal(r.output, "helper.py:2: SyntaxWarning: \"is\" with 'int' literal. Did you mean \"==\"?\n  return x is 5\nTrue\n");
});

it("a warning about an object keeps Python's hint about tracemalloc", async () => {
  const r = await run("import warnings\nwarnings.simplefilter(\"default\")\n\n\ndef save(text):\n    f = open(\"out.txt\", \"w\", encoding=\"utf-8\")\n    f.write(text)\n\n\nsave(\"x\")\nprint(\"end\")\n");
  assert.equal(
    r.output,
    "main.py:10: ResourceWarning: unclosed file <_io.TextIOWrapper name='out.txt' mode='w' encoding='utf-8'>\n  save(\"x\")\nResourceWarning: Enable tracemalloc to get the object allocation traceback\nend\n",
  );
});

it("a warning made while the program's objects are freed, or above its first line, names no file, as Python's does", async () => {
  const unclosed = "<_io.TextIOWrapper name='out.txt' mode='w' encoding='utf-8'>";
  const left = (filter) => `import warnings\nwarnings.simplefilter("${filter}")\nf = open("out.txt", "w", encoding="utf-8")\nf.write("hi")\nprint("end")\n`;
  let r = await run(left("always"));
  assert.equal(r.output, `end\n<sys>:0: ResourceWarning: unclosed file ${unclosed}\n`);
  assert.deepEqual(r.files, { "out.txt": "hi" });
  r = await run(left("error"));
  assert.equal(r.output, `end\nException ignored while finalizing file <_io.FileIO name='out.txt' mode='wb' closefd=True>:\nResourceWarning: unclosed file ${unclosed}\n`);
  // A hook of the program's keeps its names alive until the hook goes: the file is freed then, the same way.
  r = await run(left("always").replace("print(", "import sys\n\nsys.displayhook = lambda value: None\nprint("));
  assert.equal(r.output, `end\n<sys>:0: ResourceWarning: unclosed file ${unclosed}\n`);
  // A coroutine left in a variable warns with Python's own filters.
  r = await run("async def greet():\n    print(\"hi\")\n\n\ntask = greet()\nprint(\"end\")\n");
  assert.equal(r.output, "end\n<sys>:0: RuntimeWarning: coroutine 'greet' was never awaited\n");
  r = await run("import warnings\n\nwarnings.warn(\"careful\", stacklevel=2)\nprint(\"end\")\n");
  assert.equal(r.output, "<sys>:0: UserWarning: careful\nend\n");
});

it("files a program leaves open have all it wrote, as when Python ends", async () => {
  // The functions put the program's names in a reference cycle: freeing it can close a file's buffer before the file.
  const r = await run(
    "import csv\n\n\ndef note(f, text):\n    f.write(text + \"\\n\")\n\n\nf = open(\"out.txt\", \"w\")\nnote(f, \"hello\")\nb = f.buffer\nfiles = [open(f\"part{i}.txt\", \"w\") for i in range(2)]\nfor i, part in enumerate(files):\n    part.write(f\"part {i}\")\nw = csv.writer(open(\"data.csv\", \"w\", newline=\"\"))\nw.writerow([\"a\", 1])\nopen(\"raw.bin\", \"wb\").write(b\"bytes\")\nprint(1 / 0)\n",
  );
  assert.equal(r.exit, 1);
  assert.deepEqual(r.files, { "data.csv": "a,1\r\n", "out.txt": "hello\n", "part0.txt": "part 0", "part1.txt": "part 1", "raw.bin": "bytes" });
  const helper = await run({ "main.py": "import helper\n\nhelper.save(\"x\")\n", "helper.py": "log = open(\"log.txt\", \"w\")\n\n\ndef save(text):\n    log.write(text + \"\\n\")\n" });
  assert.deepEqual(helper.files, { "log.txt": "x\n" });
  const called = await run("log = open(\"log.txt\", \"w\")\n\n\ndef save(text):\n    log.write(text)\n", { call: "save(\"hi\")" });
  assert.deepEqual(called.files, { "log.txt": "hi" });
});

it("what a __del__ prints when the program ends is part of its run, not of a later one", async () => {
  const r = await run(
    "class Account:\n    count = 0\n\n    def __init__(self, name):\n        self.name = name\n        Account.count += 1\n\n    def __del__(self):\n        Account.count -= 1\n        print(\"closed\", self.name, Account.count, bank)\n\n\nbank = \"Bank\"\na = Account(\"a\")\nb = Account(\"b\")\nprint(\"end\")\n",
  );
  assert.equal(r.output, "end\nclosed a 1 Bank\nclosed b 0 Bank\n");
  assert.equal((await run("items = [[i] for i in range(100000)]\nprint(\"next\")\n")).output, "next\n");
});

it("the program is __main__, so pickle, doctest and unittest find it", async () => {
  const r = await run(
    "import doctest\nimport pickle\nimport sys\nfrom dataclasses import dataclass\n\n\n@dataclass\nclass Point:\n    x: int\n\n\ndef double(n):\n    \"\"\"\n    >>> double(2)\n    4\n    \"\"\"\n    return n * 2\n\n\nprint(sys.modules[\"__main__\"].__file__)\nprint(pickle.loads(pickle.dumps(Point(1))))\nprint(doctest.testmod())\n",
  );
  assert.equal(r.output, "main.py\nPoint(x=1)\nTestResults(failed=0, attempted=1)\n");
  // unittest says how long its tests took: on a busy machine, that can differ between the two.
  const spec = { files: { "main.py": "import unittest\n\n\nclass Sums(unittest.TestCase):\n    def test_one(self):\n        self.assertEqual(1 + 1, 2)\n\n\nunittest.main(verbosity=0)\n" }, main: "main.py", stdin: "", given: {}, args: [] };
  const [a, b] = (await Promise.all([cpython.run(spec), pyodide.run(spec)])).map((u) => ({ ...u, output: u.output.replace(/ in \d+\.\d+s\n/, " in 0.000s\n") }));
  assert.equal(b.output, a.output);
  assert.deepEqual([a.exit, b.exit], [0, 0]);
  assert.match(a.output, /Ran 1 test in 0\.000s\n\nOK\n$/);
});

it("the recursion limit reads and sets as in Python, counted from the program's first line", async () => {
  const r = await run(
    "import sys\n\n\ndef depth(n):\n    return 1 if n == 0 else 1 + depth(n - 1)\n\n\nprint(sys.getrecursionlimit())\nsys.setrecursionlimit(50)\nprint(sys.getrecursionlimit())\nprint(depth(48))\ntry:\n    depth(49)\nexcept RecursionError as e:\n    print(e)\nfor bad in [0, 2.5, 1]:\n    try:\n        sys.setrecursionlimit(bad)\n    except Exception as e:\n        print(type(e).__name__, e)\n",
  );
  assert.equal(
    r.output,
    "1000\n50\n49\nmaximum recursion depth exceeded\nValueError recursion limit must be greater or equal than 1\nTypeError 'float' object cannot be interpreted as an integer\nRecursionError cannot set the recursion limit to 1 at the recursion depth 1: the limit is too low\n",
  );
  // The limit the program set ends with it.
  assert.equal((await run("import sys\nprint(sys.getrecursionlimit())\n")).output, "1000\n");
});

it("sys.setrecursionlimit and sys.getrecursionlimit take their arguments as Python's do, and say so the same way", async () => {
  const r = await run(
    "import sys\n\ntries = [\n    lambda: sys.setrecursionlimit(limit=5),\n    lambda: sys.setrecursionlimit(),\n    lambda: sys.setrecursionlimit(5, 6),\n    lambda: sys.getrecursionlimit(1),\n    lambda: sys.getrecursionlimit(x=1),\n    lambda: sys.setrecursionlimit(2**31),\n]\nfor t in tries:\n    try:\n        t()\n    except Exception as e:\n        print(type(e).__name__, e)\nsys.setrecursionlimit(2**31 - 1)\nprint(sys.getrecursionlimit())\n",
  );
  assert.equal(
    r.output,
    "TypeError sys.setrecursionlimit() takes no keyword arguments\nTypeError sys.setrecursionlimit() takes exactly one argument (0 given)\nTypeError sys.setrecursionlimit() takes exactly one argument (2 given)\nTypeError sys.getrecursionlimit() takes no arguments (1 given)\nTypeError sys.getrecursionlimit() takes no keyword arguments\nOverflowError Python int too large to convert to C int\n2147483647\n",
  );
});

it("a program with a very low recursion limit reads it back, prints, and its RecursionError prints as a traceback", async () => {
  // The harness's own work (the traceback, the output) has room of its own, whatever limit the program set.
  for (const limit of [2, 3, 5, 9]) {
    const r = await run(`import sys\nsys.setrecursionlimit(${limit})\nprint(sys.getrecursionlimit())\n\n\ndef f():\n    f()\n\n\nf()\n`);
    assert.equal(r.exit, 1);
    assert.ok(r.output.startsWith(`${limit}\nTraceback (most recent call last):\n  File "main.py", line 10, in <module>\n    f()\n`), r.output);
    assert.ok(r.output.endsWith("RecursionError: maximum recursion depth exceeded\n"), r.output);
  }
  const bye = await run("import sys\nsys.setrecursionlimit(2)\nsys.exit(\"bye\")\n");
  assert.equal(bye.exit, 1);
  assert.equal(bye.output, "bye\n");
});

it("a program that prints until it runs out of recursion stops at the same call in both", async () => {
  // Python's print uses none of the limit; here it uses two frames, whatever the page or the build does with the
  // text, so this prints down to 4 where Python prints down to 2.
  const r = await run("def countdown(n):\n    print(n)\n    countdown(n - 1)\n\n\ncountdown(1000)\n");
  assert.equal(r.exit, 1);
  const numbers = r.output.split("Traceback")[0].trim().split("\n").map(Number);
  assert.deepEqual([numbers.length, numbers[0], numbers.at(-1)], [997, 1000, 4]);
  assert.match(r.output, /\[Previous line repeated 994 more times\]\n {2}File "main\.py", line 2, in countdown\n {4}print\(n\)\n.*\nRecursionError: maximum recursion depth exceeded\n$/);
});

it("a program that runs out of recursion at a print while handling an error shows that error first, as Python does", async () => {
  const r = await run("def count(n):\n    print(n)\n    count(n + 1)\n\n\ntry:\n    int(\"x\")\nexcept ValueError:\n    count(0)\n");
  assert.equal(r.exit, 1);
  assert.match(r.output, /\nTraceback \(most recent call last\):\n {2}File "main\.py", line 7, in <module>\n {4}int\("x"\)\n.*\nValueError: invalid literal for int\(\) with base 10: 'x'\n\nDuring handling of the above exception, another exception occurred:\n\nTraceback \(most recent call last\):\n {2}File "main\.py", line 9, in <module>\n/);
  assert.ok(r.output.endsWith("RecursionError: maximum recursion depth exceeded\n"), r.output.slice(-300));
  const session = await run("", { repl: ["def count(n):\n    print(n)\n    count(n + 1)\n", "try:\n    int(\"x\")\nexcept ValueError:\n    count(0)\n"] });
  assert.match(session.output, /\nValueError: invalid literal for int\(\) with base 10: 'x'\n\nDuring handling of the above exception, another exception occurred:\n/);
});

it("the object given to sys.exit is freed when the program ends, so its __del__ prints in its own run", async () => {
  const r = await run("import sys\n\n\nclass Bye:\n    def __str__(self):\n        return \"bye message\"\n\n    def __del__(self):\n        print(\"deleted\")\n\n\nsys.exit(Bye())\n");
  assert.equal(r.exit, 1);
  assert.equal(r.output, "bye message\ndeleted\n");
  assert.equal((await run("print(\"after\")\n")).output, "after\n");
});

it("the gc callbacks and the hooks a program sets end with it", async () => {
  // Its gc callbacks see its last collection, as when Python ends, and no later one.
  assert.equal((await run("import gc\n\ngc.callbacks.append(lambda phase, info: print(\"gc\", phase))\nprint(\"end\")\n")).output, "end\ngc start\ngc stop\n");
  assert.equal((await run("print(\"next\")\n")).output, "next\n");
  // What only a callback kept alive is freed in its own run too, not in a later one.
  const kept = await run("import gc\n\n\nclass Note:\n    def __del__(self):\n        print(\"freed\")\n\n\nnote = Note()\ngc.callbacks.append(lambda phase, info: note)\nprint(\"end\")\n");
  assert.equal(kept.output, "end\nfreed\n");
  assert.equal((await run("items = [[i] for i in range(100000)]\nprint(\"next\")\n")).output, "next\n");
  await run("import sys\n\nsys.unraisablehook = lambda u: print(\"hook\")\nsys.displayhook = lambda v: print(\"shown\", v)\nsys.excepthook = lambda *a: print(\"except\")\n");
  // Python's own hook prints the function with its address, which differs from run to run.
  const spec = { files: { "main.py": "class A:\n    def __del__(self):\n        raise ValueError(\"bad\")\n\n\nA()\nprint(\"done\")\n" }, main: "main.py", stdin: "", given: {}, args: [] };
  for (const r of await Promise.all([cpython.run(spec), pyodide.run(spec)]))
    assert.equal(
      r.output.replace(/ at 0x[0-9a-f]+>/, ">"),
      'Exception ignored while calling deallocator <function A.__del__>:\nTraceback (most recent call last):\n  File "main.py", line 3, in __del__\n    raise ValueError("bad")\nValueError: bad\ndone\n',
    );
  assert.equal((await run("", { repl: ["1 + 1"] })).output, "2\n");
});

it("the program's profile and trace functions, gc settings and digit limit end with it", async () => {
  // Each watches only main.py: in a later run, it would see that run's program.
  const watch = (set) =>
    `import sys\n\n\ndef watch(frame, event, arg):\n    if event == "call" and frame.f_code.co_filename == "main.py":\n        print(event, frame.f_code.co_name)\n\n\ndef hello():\n    pass\n\n\nsys.${set}(watch)\nhello()\n`;
  for (const set of ["setprofile", "settrace"]) {
    assert.equal((await run(watch(set))).output, "call hello\n");
    assert.equal((await run("def greet():\n    pass\n\n\ngreet()\nprint(\"next\")\n")).output, "next\n");
  }
  // gc's statistics have times in them: none print as the program ends, or in a later run.
  assert.equal((await run("import gc\nimport sys\n\ngc.set_debug(gc.DEBUG_STATS)\ngc.disable()\nsys.set_int_max_str_digits(0)\nprint(\"end\")\n")).output, "end\n");
  assert.equal((await run("import gc\nimport sys\n\nprint(gc.isenabled(), gc.get_debug(), sys.get_int_max_str_digits())\n")).output, "True 0 4300\n");
  // A sys.monitoring tool and the cycles gc.DEBUG_SAVEALL saved are the program's too.
  const monitor = "import sys\n\nmon = sys.monitoring\nmon.use_tool_id(3, \"watch\")\n\n\ndef started(code, offset):\n    if code.co_filename == \"main.py\":\n        print(\"start\", code.co_name)\n\n\nmon.register_callback(3, mon.events.PY_START, started)\nmon.set_events(3, mon.events.PY_START)\n\n\ndef hello():\n    pass\n\n\nhello()\n";
  assert.equal((await run(monitor)).output, "start hello\n");
  assert.equal((await run("import sys\n\n\ndef greet():\n    pass\n\n\ngreet()\nprint(sys.monitoring.get_tool(3))\n")).output, "None\n");
  assert.equal((await run("import gc\n\ngc.set_debug(gc.DEBUG_SAVEALL)\na = []\na.append(a)\ndel a\ngc.collect()\nprint(len(gc.garbage) > 0)\n")).output, "True\n");
  assert.equal((await run("import gc\n\nprint(len(gc.garbage))\n")).output, "0\n");
});

it("as when Python ends, the streams go back to the program's own and the interpreter's last value goes before its objects are freed", async () => {
  const r = await run("import sys\n\nlog = open(\"log.txt\", \"w\")\nsys.stdout = log\nprint(\"to the file\")\n\n\nclass Note:\n    def __del__(self):\n        print(\"freed\")\n\n\nnote = Note()\n");
  assert.equal(r.output, "freed\n");
  assert.deepEqual(r.files, { "log.txt": "to the file\n" });
  const session = await run("", { repl: ["class T:\n    def __repr__(self):\n        return \"T()\"\n\n    def __del__(self):\n        print(\"del\")\n", "T()"] });
  assert.equal(session.output, "T()\ndel\n");
  assert.equal((await run("", { repl: ["1 + 1"] })).output, "2\n");
  assert.equal((await run("import builtins\n\nprint(hasattr(builtins, \"_\"))\n")).output, "False\n");
});

it("the end of a run doesn't run the program's code: looking for its open files compares no classes of its own", async () => {
  const r = await run("class Meta(type):\n    def __eq__(cls, other):\n        print(\"compared\")\n        return False\n\n    __hash__ = type.__hash__\n\n\nclass Thing(metaclass=Meta):\n    pass\n\n\nthing = Thing()\nprint(\"end\")\n");
  assert.equal(r.output, "end\n");
});

it("a pygame program's window is freed when it ends, with the pictures it keeps", async () => {
  // pygame runs in Pyodide only. A window left over would be frozen with what was alive at the next run's start.
  const game = "import pygame\n\nscreen = pygame.display.set_mode((800, 600))\nfor color in [\"red\", \"green\", \"blue\"]:\n    screen.fill(color)\n    pygame.display.flip()\npygame.quit()\n";
  for (let i = 0; i < 3; i++) assert.equal((await pyodide.run({ files: { "main.py": game }, main: "main.py", stdin: "", given: {}, args: [], window: { png: "last" } })).window.frames, 3);
  const count = "import gc\n\ngc.unfreeze()\nnames = [type(o).__name__ for o in gc.get_objects()]\ngc.freeze()\nprint(names.count(\"Window\"), names.count(\"ArenaSurface\"))\n";
  assert.equal((await pyodide.run({ files: { "main.py": count }, main: "main.py", stdin: "", given: {}, args: [] })).output, "0 0\n");
});

it("input() takes its prompt only by position, as Python's does", async () => {
  const r = await run("try:\n    input(prompt=\"Name: \")\nexcept TypeError as e:\n    print(e)\ntry:\n    input(\"a\", \"b\")\nexcept TypeError as e:\n    print(e)\nprint(input(\"Name: \"))\n", { stdin: "Ann\n" });
  assert.equal(r.output, "input() takes no keyword arguments\ninput expected at most 1 argument, got 2\nName: Ann\nAnn\n");
});

it("a long chain of exceptions and an exception group show only the program's frames", async () => {
  const chain = await run("e = None\nfor i in range(2000):\n    try:\n        raise ValueError(i) from e\n    except ValueError as x:\n        e = x\nraise e\n");
  assert.equal(chain.exit, 1);
  assert.equal(chain.truncated, true);
  assert.ok(chain.output.startsWith('Traceback (most recent call last):\n  File "main.py", line 4, in <module>\n    raise ValueError(i) from e\nValueError: 0\n\nThe above exception'), chain.output.slice(0, 300));
  const group = await run("import json\n\nerrors = []\nfor text in [\"1\", \"x\"]:\n    try:\n        json.loads(text)\n    except ValueError as e:\n        errors.append(e)\nraise ExceptionGroup(\"bad input\", errors)\n");
  assert.equal(
    group.output,
    '  + Exception Group Traceback (most recent call last):\n  |   File "main.py", line 9, in <module>\n  |     raise ExceptionGroup("bad input", errors)\n  | ExceptionGroup: bad input (1 sub-exception)\n  +-+---------------- 1 ----------------\n    | Traceback (most recent call last):\n    |   File "main.py", line 6, in <module>\n    |     json.loads(text)\n    |     ~~~~~~~~~~^^^^^^\n    | json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)\n    +------------------------------------\n',
  );
});

it("a traceback shows Linux's error numbers in Pyodide too", async () => {
  // A caught error's own number stays Pyodide's (see arena.py); a traceback's is the same everywhere.
  const r = await run("open(\"missing.txt\")\n");
  assert.match(r.output, /FileNotFoundError: \[Errno 2\] No such file or directory: 'missing.txt'\n$/);
});

it("open() without an encoding writes UTF-8 and says so the same way in both, as python -X utf8 does", async () => {
  const r = await run("f = open(\"notes.txt\", \"w\")\nprint(f.encoding)\nf.write(\"caf\u00e9\")\nf.close()\nimport sys\nprint(sys.flags.utf8_mode)\n");
  assert.equal(r.output, "utf-8\n1\n");
  assert.deepEqual(r.files, { "notes.txt": "caf\u00e9" });
});
