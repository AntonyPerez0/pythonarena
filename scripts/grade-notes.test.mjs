// Tests of what the grader (src/grader/grade.ts) says about a run: a syntax error shown once, a call test that
// can't call the learner's function, a function that prints where it should return, what a program printed while it
// loaded, input asked for while loading, a crash's note and its short line under later tests, the output limit and a
// function that calls itself. The runs are real: the browser's engine is replaced by the reference CPython running the
// same harness (src/engine/arena.py) the page runs in Pyodide, as the content build does.
// Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { marked } from "marked";
import fs from "node:fs";
import { pythonPool, referencePython } from "./content/python.mjs";
import { pyodidePool } from "./content/pyodide.mjs";
import { PYGAME_IMPORT as PYGAME } from "../src/engine/pygame-import.ts";

let python = null;
try {
  python = referencePython();
} catch (e) {
  if (process.env.CI) throw e;
  console.warn(`grade-notes: skipped (${e.message})`);
}
const pool = python ? pythonPool({ exe: python.exe, size: 2, timeLimitMs: 5000 }) : null;
// pygame programs run in Pyodide on Node, as the content build runs them (the reference CPython has no pygame).
let windowPool = null;
test.after(() => {
  pool?.close();
  windowPool?.close();
});
// The challenge's images, as the page fetches them from images/.
globalThis.fetch = async (url) => {
  const name = /images\/([\w.-]+)$/.exec(String(url))?.[1];
  if (!name) return new Response("", { status: 404 });
  return new Response(fs.readFileSync(new URL(`../content/assets/${name}`, import.meta.url)));
};

/** The engine's client, standing in for the browser's: each input runs in the reference CPython. */
globalThis.__gradeNotesRun = async (files, inputs) =>
  Promise.all(
    inputs.map(async (c) => {
      const given = Object.fromEntries(Object.entries(c.files ?? {}).map(([n, v]) => [n, typeof v === "string" ? v : { base64: Buffer.from(v).toString("base64") }]));
      const spec = { files: Object.fromEntries(files.map((f) => [f.path, f.text])), main: "main.py", stdin: c.stdin ?? "", given, args: c.args ?? [], ...(c.call != null ? { call: c.call } : {}), ...(c.window ? { window: c.window } : {}) };
      const pygame = c.window || files.some((f) => PYGAME.test(f.text));
      const r = pygame ? await (windowPool ??= pyodidePool({ size: 1 })).run(spec) : await pool.run(spec);
      const last = r.frames?.at(-1);
      const window = r.window ? { ...r.window, png: last?.png ? new Uint8Array(Buffer.from(last.png, "base64")) : null } : null;
      return { stdout: r.stdout, stderr: r.stderr, output: r.output, exitCode: r.exit, timedOut: r.timedOut, truncated: r.truncated, ms: 1, files: r.files, callStart: r.callStart, callError: r.callError, loadInput: r.loadInput, callValue: r.callValue, window };
    }),
  );
const engine = {
  name: "engine-stand-in",
  setup(build) {
    build.onResolve({ filter: /\/engine\/client$/ }, () => ({ path: "client", namespace: "stand-in" }));
    build.onLoad({ filter: /.*/, namespace: "stand-in" }, () => ({
      contents: `
        export const DEFAULT_TIME_LIMIT_MS = 5000;
        export function runPython(files, inputs, opts) { return globalThis.__gradeNotesRun(files, inputs, opts); }
      `,
      loader: "js",
    }));
  },
};
// grade.ts is TypeScript that imports other modules: bundle it into one module to import it here.
const load = async (entry, plugins = []) => {
  const out = await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent", plugins, define: { "import.meta.env.BASE_URL": '"/"' } });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
};
const { NOT_RUN_NOTE, crashOf, describeRun, grade, selfCallingFunction, tooSlowNote } = await load("../src/grader/grade.ts", [engine]);
const { notesShown } = await load("../src/grader/notes.ts");

const has = (text, ...parts) => {
  for (const p of parts) assert.ok(text?.includes(p), `missing ${JSON.stringify(p)} in: ${text}`);
};
const lacks = (text, ...parts) => {
  for (const p of parts) assert.ok(!text?.includes(p), `${JSON.stringify(p)} shouldn't be in: ${text}`);
};
const it = (name, fn) => test(name, { skip: !python && "no reference CPython" }, fn);

/** A challenge with the given tests (and no rules). */
// Expected output is stored as the content build stores it: normalized, without the last newline.
const exercise = (tests, more = {}) => ({ id: "t", prompt: "", seed: "", tests: tests.map((t, i) => ({ name: `Test ${i + 1}`, ...t, expect: (t.expect ?? "").replace(/\n+$/, "") })), ...more });

// ------------------------------------------------------------------ programs that read input

it("a passing program passes, with the typed input echoed after its prompt", async () => {
  const code = 'name = input("Name: ")\nprint(f"Hi, {name}!")\n';
  const r = await grade(exercise([{ stdin: "Ada\n", expect: "Name: Ada\nHi, Ada!\n" }]), code);
  assert.equal(r.status, "pass");
  assert.equal(r.tests[0].got, "Name: Ada\nHi, Ada!");
});

it("a syntax error is shown once, with its place and a note, and no test runs", async () => {
  const code = 'print("Hello"\nprint("world")\n';
  const r = await grade(exercise([{ expect: "Hello\nworld\n" }, { expect: "x\n", hidden: true }]), code);
  assert.equal(r.status, "syntax-error");
  assert.equal(r.tests.length, 0);
  assert.equal(r.diagnostics.length, 1);
  const d = r.diagnostics[0];
  assert.equal(d.file, "main.py");
  assert.equal(d.line, 1);
  has(d.message, "SyntaxError");
  has(r.errorOutput, "SyntaxError");
  assert.ok(d.friendly, "a syntax error gets a plain-English note");
});

it("a crash names the error and the line, and later tests that crashed the same way get the short line", async () => {
  const code = 'n = int(input("Number: "))\nprint(10 // n)\n';
  const ex = exercise([{ stdin: "0\n", expect: "x\n" }, { stdin: "0\n", expect: "y\n" }, { stdin: "5\n", expect: "Number: 5\n2\n" }]);
  const r = await grade(ex, code);
  assert.equal(r.status, "fail");
  const [a, b, c] = r.tests;
  assert.equal(c.pass, true);
  has(a.note, "ZeroDivisionError");
  assert.match(a.note, /line 2\b/);
  has(a.stderr, "ZeroDivisionError", 'File "main.py", line 2');
  // The traceback has only the learner's own frames: nothing of the harness.
  lacks(a.stderr, "arena.py", "runpy");
  assert.ok(a.crash && b.crash, "both crashes are keyed");
  assert.equal(a.crash.key, b.crash.key);
  const shown = notesShown(r.tests);
  assert.equal(shown[0], a.note);
  assert.equal(shown[1], b.note.replace(b.crash.text, b.crash.short));
  assert.notEqual(shown[1], b.note);
});

it("a program that reads more input than the test gives stops with an EOFError the note explains", async () => {
  const code = 'a = input("First: ")\nb = input("Second: ")\nprint(a + b)\n';
  const r = await grade(exercise([{ stdin: "1\n", expect: "First: 1\nSecond: 1\n" }]), code);
  assert.equal(r.status, "fail");
  has(r.tests[0].got, "First: 1");
  has(r.tests[0].note, "EOFError");
});

it("sys.exit with a code other than 0 is named", async () => {
  const code = "import sys\nprint('bye')\nsys.exit(3)\n";
  const r = await grade(exercise([{ expect: "bye\n" }]), code);
  assert.equal(r.tests[0].pass, false);
  has(r.tests[0].note, "exit code 3");
});

it("the output limit stops a program that prints forever, and names a function that calls itself", async () => {
  const code = "def count(n):\n    print(n)\n    count(n + 1)\n\n\nwhile True:\n    print('again and again and again')\n";
  const r = await grade(exercise([{ expect: "x\n" }]), code);
  assert.equal(r.tests[0].pass, false);
  has(r.tests[0].note, "more than 64 KB", "count calls itself");
});

// ------------------------------------------------------------------ call tests

const FUNCTION_TESTS = [
  { call: "print(double(4))", expect: "8\n" },
  { call: "double(21)", expect: "42\n", returns: true },
  { call: "double(-3)", expect: "-6\n", returns: true, hidden: true },
];

it("a call test passes with a function that returns, and what loading printed is kept apart", async () => {
  const code = 'def double(n):\n    return n * 2\n\n\nprint("loaded")\n';
  const r = await grade(exercise(FUNCTION_TESTS), code);
  assert.equal(r.status, "pass");
  assert.equal(r.tests[0].got, "8");
  assert.equal(r.tests[0].loadOutput, "loaded");
  assert.equal(r.tests[1].got, "42");
});

it("code under if __name__ == '__main__' doesn't run in a call test", async () => {
  const code = 'def double(n):\n    return n * 2\n\n\nif __name__ == "__main__":\n    print(double(int(input("n: "))))\n';
  const r = await grade(exercise(FUNCTION_TESTS), code);
  assert.equal(r.status, "pass");
  assert.equal(r.tests[0].loadOutput, undefined);
});

it("a function that prints instead of returning fails the tests that need a value, with a note saying so", async () => {
  const code = "def double(n):\n    print(n * 2)\n";
  const r = await grade(exercise(FUNCTION_TESTS), code);
  assert.equal(r.status, "fail");
  const [a, b] = r.tests;
  // print(double(4)) prints 8 and then None.
  assert.equal(a.got, "8\nNone");
  assert.equal(a.pass, false);
  // double(21) prints 42 (the text matches) but gives None.
  assert.equal(b.got, "42");
  assert.equal(b.pass, false);
  has(b.note, "The call double(21) printed something but returned None", "use return instead of print");
  lacks(b.note, "`");
  // A hidden test's call isn't named.
  has(r.tests[2].note, "Your function printed something but returned None");
  lacks(r.tests[2].note, "double(-3)");
});

it("a function with no return line at all gets the returned-None note", async () => {
  const code = "def double(n):\n    result = n * 2\n";
  const r = await grade(exercise(FUNCTION_TESTS), code);
  has(r.tests[1].note, "The call double(21) returned None", "Give it a return line");
});

it("a misnamed function is a call error that names both names", async () => {
  const code = "def doubel(n):\n    return n * 2\n";
  const r = await grade(exercise(FUNCTION_TESTS), code);
  assert.equal(r.status, "call-error");
  assert.equal(r.tests.length, 0);
  assert.equal(r.callProblems.length, 1);
  has(r.callProblems[0], "The test calls `double`", "doesn't define anything with that name", "`doubel`");
});

it("a function with the wrong parameters is a call error", async () => {
  const code = "def double():\n    return 2\n";
  const r = await grade(exercise(FUNCTION_TESTS), code);
  assert.equal(r.status, "call-error");
  // One reason, in the words of the first visible test; the hidden test's call isn't shown.
  assert.equal(r.callProblems.length, 1, r.callProblems.join(" | "));
  has(r.callProblems[0], "The test runs `print(double(4))`", "takes 0 positional arguments but 1 was given", "exactly the parameters");
  lacks(r.callProblems.join(" "), "double(-3)");
});

/** A call problem as the page shows it (Results renders it with InlineMd, that is marked.parseInline): its HTML, and its text. */
const shown = (md) => {
  const html = marked.parseInline(md, { async: false });
  const text = html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return { html, text };
};

it("a call problem shows Python's names as Python wrote them: __init__, __str__ and <lambda> aren't read as Markdown", async () => {
  const person = "class Person:\n    def __init__(self, name):\n        self.name = name\n\n    def __str__(self):\n        return self.name\n";
  const args = await grade(exercise([{ call: 'p = Person("Ada", 30)', expect: "" }]), person);
  assert.equal(args.status, "call-error");
  const a = shown(args.callProblems[0]);
  has(a.html, "<code>Person.__init__()</code> takes 2 positional arguments but 3 were given. Give the def line");
  lacks(a.html, "<strong>", "<em>");
  // Python's suggestion ends with a question mark: no full stop after it.
  const attr = await grade(exercise([{ call: 'print(Person("Ada").__strr__())', expect: "Ada\n" }]), person);
  assert.equal(attr.status, "call-error");
  const b = shown(attr.callProblems[0]);
  has(b.text, "but 'Person' object has no attribute '__strr__'. Did you mean: '__str__'? Name your methods");
  lacks(b.html, "<strong>", "<em>");
  const lambda = await grade(exercise([{ call: "print(double(4))", expect: "8\n" }]), "double = lambda: 8\n");
  assert.equal(lambda.status, "call-error");
  has(shown(lambda.callProblems[0]).html, "<code>&lt;lambda&gt;()</code> takes 0 positional arguments but 1 was given.");
});

it("an error inside the learner's function is a failed test, not a call error", async () => {
  const code = "def double(n):\n    return n * two\n";
  const r = await grade(exercise(FUNCTION_TESTS), code);
  assert.equal(r.status, "fail");
  has(r.tests[0].note, "NameError");
  has(r.tests[0].stderr, 'File "main.py", line 2, in double');
});

it("input() while the program loads, in a call test, says where that code belongs", async () => {
  const code = 'def double(n):\n    return n * 2\n\n\nn = int(input("n: "))\nprint(double(n))\n';
  const r = await grade(exercise(FUNCTION_TESTS), code);
  assert.equal(r.status, "fail");
  has(r.tests[0].note, "asks for input when it's loaded", 'if __name__ == "__main__":');
  assert.equal(r.tests[0].crash.key, "load-input");
  const shown = notesShown(r.tests);
  assert.equal(shown[1], "Asked for input when loaded, as in the test above.");
});

// ------------------------------------------------------------------ files and modules

it("a program of several files runs, and an error in a module names that module's file", async () => {
  const code = "# ==== helpers.py ====\ndef half(n):\n    return n / zero\n\n# ==== main.py ====\nfrom helpers import half\nprint(half(4))\n";
  const r = await grade(exercise([{ expect: "2.0\n" }]), code);
  assert.equal(r.multiFile, true);
  assert.equal(r.tests[0].pass, false);
  has(r.tests[0].stderr, 'File "helpers.py", line 2, in half');
  has(r.tests[0].note, "helpers.py");
});

it("a file the test wants written is compared with what the program wrote", async () => {
  const code = 'with open("out.txt", "w") as f:\n    f.write("one\\n")\n';
  const want = exercise([{ expect: "", writes: { "out.txt": "one\ntwo\n" } }]);
  const r = await grade(want, code);
  assert.equal(r.tests[0].pass, false);
  assert.deepEqual(r.tests[0].writes?.map((w) => [w.name, w.got, w.pass]), [["out.txt", "one", false]]);
  const ok = await grade(want, 'with open("out.txt", "w") as f:\n    f.write("one\\ntwo\\n")\n');
  assert.equal(ok.status, "pass");
});

// ------------------------------------------------------------------ pygame windows

const WINDOW_PROGRAM = (draw) => `import pygame

pygame.init()
window = pygame.display.set_mode((200, 120))
robot = pygame.image.load("robot.png")
x = 0
right = False
while True:
    for event in pygame.event.get():
        if event.type == pygame.KEYDOWN and event.key == pygame.K_RIGHT:
            right = True
        if event.type == pygame.KEYUP and event.key == pygame.K_RIGHT:
            right = False
        if event.type == pygame.QUIT:
            exit()
${draw}
    pygame.display.flip()
`;
const MOVING = "    if right:\n        x += 2\n    window.fill((0, 0, 0))\n    window.blit(robot, (x, 40))";
/** A window challenge as the content build makes it: the model's window after the test's frames and events. */
const windowTest = { name: "Window", stdin: "", expect: "", window: { frames: 12, events: [{ at: 2, type: "keydown", key: "K_RIGHT" }, { at: 7, type: "keyup", key: "K_RIGHT" }] }, expectWindow: { frames: 12, log: "fill (0, 0, 0)\nblit robot.png at (10, 40)", size: [200, 120], title: "pygame window", image: "lessons/windows/x.png" } };
const windowChallenge = { id: "w", prompt: "", seed: "", tests: [windowTest], assets: ["robot.png"] };

it("a window test passes when the last frame's drawing and the number of frames are the model's", async () => {
  const r = await grade(windowChallenge, WINDOW_PROGRAM(MOVING));
  assert.equal(r.status, "pass", JSON.stringify(r.tests[0]));
  assert.equal(r.tests[0].window.pass, true);
  assert.equal(r.tests[0].window.got.frames, 12);
  assert.ok(r.tests[0].window.got.png?.length > 100, "the learner's last frame has a picture for the results");
});

it("a window that moves too far fails with the window's note, the output comparison is not shown as the problem", async () => {
  const r = await grade(windowChallenge, WINDOW_PROGRAM(MOVING.replace("x += 2", "x += 3")));
  assert.equal(r.status, "fail");
  const t = r.tests[0];
  assert.equal(t.window.pass, false);
  assert.equal(t.window.got.log, "fill (0, 0, 0)\nblit robot.png at (15, 40)");
  has(t.note, "The window's last frame isn't what it should be");
  assert.deepEqual(t.windowEvents, windowTest.window.events);
});

it("a window of another size fails with a note that names both sizes", async () => {
  const r = await grade(windowChallenge, WINDOW_PROGRAM(MOVING).replace("set_mode((200, 120))", "set_mode((240, 120))"));
  assert.equal(r.tests[0].window.pass, false);
  has(r.tests[0].note, "Your window is 240 x 120 pixels, but it should be 200 x 120");
});

it("a program that draws once and ends, or shows no window, gets a note that says so", async () => {
  const once = await grade(windowChallenge, 'import pygame\nwindow = pygame.display.set_mode((200, 120))\nwindow.fill((0, 0, 0))\nwindow.blit(pygame.image.load("robot.png"), (10, 40))\npygame.display.flip()\n');
  has(once.tests[0].note, "Your window showed 1 frame and then the program ended", "until the window is closed (12 in this test)");
  const none = await grade(windowChallenge, "import pygame\nprint('no window')\n");
  has(none.tests[0].note, "Your program shows no window");
});

// ------------------------------------------------------------------ the helpers on their own

test("selfCallingFunction finds a function that calls itself, not one that calls a method of the same name", () => {
  const src = (text) => [{ path: "main.py", text }];
  assert.equal(selfCallingFunction(src("def f(n):\n    return f(n - 1)\n")), "f");
  assert.equal(selfCallingFunction(src("def size(s):\n    return s.size()\n")), null);
  assert.equal(selfCallingFunction(src("def f(n):\n    return n\n\n\nprint(f(1))\n")), null);
  assert.equal(selfCallingFunction(src("class A:\n    def walk(self):\n        self.walk()\n")), "walk");
  assert.equal(selfCallingFunction(src("def f(n):\n    # f(n)\n    return n\n")), null);
});

test("describeRun and crashOf on runs that ended normally, timed out or failed to start", () => {
  const sources = [{ path: "main.py", text: "while True:\n    x = input()\n" }];
  const run = (more) => ({ stdout: "", stderr: "", output: "", exitCode: 0, timedOut: false, truncated: false, ms: 1, files: {}, callStart: null, callError: false, loadInput: false, callValue: null, ...more });
  assert.equal(describeRun(run({}), sources), undefined);
  assert.equal(crashOf(run({}), sources), undefined);
  const timed = describeRun(run({ timedOut: true, exitCode: null }), sources);
  has(timed, "more than 5 seconds", "a loop that waits for a word that never comes");
  assert.equal(crashOf(run({ timedOut: true, exitCode: null }), sources), undefined);
  has(describeRun(run({ internalError: "boom" }), sources), "Python couldn't run the program (boom)");
  has(describeRun(undefined, sources), "didn't run");
});

// ------------------------------------------------------------------ big tests

const HAS_DUPLICATE_SLOW = "def has_duplicate(values):\n    for i in range(len(values)):\n        for j in range(i + 1, len(values)):\n            if values[i] == values[j]:\n                return True\n    return False\n";

it("a big test that runs out of time gets the note that the program is too slow for a big input; the big tests after it don't run", async () => {
  const real = globalThis.__gradeNotesRun;
  const calls = [];
  // The big tests' runs are made up (a real one would take the whole 10 seconds): they run out of time.
  globalThis.__gradeNotesRun = async (files, inputs, opts) => {
    calls.push({ calls: inputs.map((c) => c.call), limit: opts?.timeLimitMs });
    if (inputs.some((c) => /200_000/.test(c.call))) return inputs.map(() => ({ stdout: "", stderr: "", output: "", exitCode: null, timedOut: true, truncated: false, ms: opts.timeLimitMs, files: {}, callStart: null, callError: false, loadInput: false, callValue: null }));
    return real(files, inputs);
  };
  try {
    const ex = exercise([
      { call: "has_duplicate([3, 1, 3])", expect: "True\n", returns: true },
      { call: "has_duplicate([i * 7 for i in range(200_000)])", expect: "False\n", returns: true, hidden: true, big: true },
      { call: "has_duplicate(list(range(200_000)) + [5])", expect: "True\n", returns: true, hidden: true, big: true },
      { call: "has_duplicate([4, 2, 9])", expect: "False\n", returns: true, hidden: true },
    ]);
    const r = await grade(ex, HAS_DUPLICATE_SLOW);
    assert.equal(r.status, "fail");
    // The tests that aren't big first, together; then the big ones one at a time, stopping at the first timeout.
    assert.deepEqual(
      calls.map((c) => c.calls),
      [["has_duplicate([3, 1, 3])", "has_duplicate([4, 2, 9])"], ["has_duplicate([i * 7 for i in range(200_000)])"]],
    );
    assert.ok(calls.every((c) => c.limit === 10_000), "a challenge with a big test has the longer limit");
    const [small, big, after, last] = r.tests;
    assert.ok(small.pass && last.pass, "the small tests pass");
    assert.equal(big.big, true);
    assert.equal(big.note, tooSlowNote(10_000));
    has(big.note, "Too slow for a big input", "more than 10 seconds", "a loop inside a loop over 200,000 values runs about 40 billion times", "a set, a dict, sorting or two pointers");
    lacks(big.note, "never ends");
    assert.equal(after.pass, false);
    assert.equal(after.note, NOT_RUN_NOTE);
    assert.equal(small.big, undefined);
  } finally {
    globalThis.__gradeNotesRun = real;
  }
});

it("a program that runs out of time on a small test doesn't wait for the big tests too: they don't run", async () => {
  const real = globalThis.__gradeNotesRun;
  const calls = [];
  // Every run is made up here: the small tests run out of time, as a loop that never ends would.
  globalThis.__gradeNotesRun = async (files, inputs, opts) => {
    calls.push(inputs.map((c) => c.call));
    return inputs.map(() => ({ stdout: "", stderr: "", output: "", exitCode: null, timedOut: true, truncated: false, ms: opts.timeLimitMs, files: {}, callStart: null, callError: false, loadInput: false, callValue: null }));
  };
  try {
    const ex = exercise([
      { call: "has_duplicate([3, 1, 3])", expect: "True\n", returns: true },
      { call: "has_duplicate([i * 7 for i in range(200_000)])", expect: "False\n", returns: true, hidden: true, big: true },
    ]);
    const r = await grade(ex, "def has_duplicate(values):\n    while True:\n        pass\n");
    assert.deepEqual(calls, [["has_duplicate([3, 1, 3])"]], "only the small test ran");
    const [small, big] = r.tests;
    has(small.note, "more than 10 seconds");
    lacks(small.note, "Too slow for a big input");
    assert.equal(big.note, NOT_RUN_NOTE);
  } finally {
    globalThis.__gradeNotesRun = real;
  }
});

it("a big test passes with a fast way, and the same program's test that isn't big is checked as usual", async () => {
  const ex = exercise([
    { call: "has_duplicate([3, 1, 3])", expect: "True\n", returns: true },
    { call: "has_duplicate([i * 7 for i in range(200_000)])", expect: "False\n", returns: true, hidden: true, big: true },
  ]);
  const r = await grade(ex, "def has_duplicate(values):\n    return len(set(values)) != len(values)\n");
  assert.equal(r.status, "pass");
  assert.equal(r.tests[1].big, true);
});

test("describeRun: a big test's timeout is about speed, any other timeout about a loop that never ends", () => {
  const sources = [{ path: "main.py", text: "def f(values):\n    return values\n" }];
  const timedOut = { stdout: "", stderr: "", output: "", exitCode: null, timedOut: true, truncated: false, ms: 1, files: {}, callStart: null, callError: false, loadInput: false, callValue: null };
  has(describeRun(timedOut, sources, 10_000, true), "Too slow for a big input", "more than 10 seconds");
  has(describeRun(timedOut, sources, 5_000), "Look for a loop that never ends");
  assert.equal(describeRun(undefined, sources, 10_000, true), NOT_RUN_NOTE);
});
