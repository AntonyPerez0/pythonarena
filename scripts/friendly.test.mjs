// Tests of the plain-English notes for Python's errors (src/engine/friendly.ts). The programs really run: the
// reference CPython runs each one through the same harness (src/engine/arena.py) the page runs in Pyodide, of the
// same Python version, so the tracebacks and messages are the ones a learner sees.
// Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { pythonPool, referencePython } from "./content/python.mjs";
import { columnOffset, describeError, parseError } from "../src/engine/friendly.ts";

let python = null;
try {
  python = referencePython();
} catch (e) {
  if (process.env.CI) throw e;
  console.warn(`friendly: skipped (${e.message})`);
}
const pool = python ? pythonPool({ exe: python.exe, size: 2, timeLimitMs: 5000 }) : null;
test.after(() => pool?.close());
const it = (name, fn) => test(name, { skip: !python && "no reference CPython" }, fn);

/** Runs a program and reads its error: what Python printed, the parsed error (or null) and the sentence the results show. */
async function run(code, stdin = "") {
  const r = await pool.run({ files: { "main.py": code }, main: "main.py", stdin, given: {}, args: [] });
  const e = parseError(r.stderr);
  return { stderr: r.stderr, exit: r.exit, e, text: e ? describeError(e, [{ path: "main.py", text: code }]).text : null };
}
/** The sentence for a program that stops with an error, checked to have each part. */
async function says(code, ...parts) {
  const { stderr, text } = await run(code);
  assert.ok(text, `no error read from: ${stderr}`);
  for (const p of parts) assert.ok(text.includes(p), `missing ${JSON.stringify(p)} in: ${text}`);
  return text;
}
const lacks = (text, ...parts) => {
  for (const p of parts) assert.ok(!text.includes(p), `${JSON.stringify(p)} shouldn't be in: ${text}`);
};

// ------------------------------------------------------------------ a value called like a function

it("a built-in hidden by a variable is named, not the print around it", async () => {
  for (const [code, name] of [
    ['len = 5\nprint(len("abc"))\n', "len"],
    ["numbers = [1, 2]\nsum = 0\nfor n in numbers:\n    sum += n\nprint(sum(numbers))\n", "sum"],
    ["list = [1, 2]\nprint(list(range(3)))\n", "list"],
    ['str = "x"\nprint("Hi " + str(5))\n', "str"],
    ["for str in ['a']:\n    pass\nprint(str(5))\n", "str"],
    ["def f(list):\n    return list(range(2))\n\n\nprint(f([1]))\n", "list"],
    // No ~ and ^ marks when the call is all there is after "y =".
    ["x = len('abc')\nlen = 3\ny = len('abc')\n", "len"],
    ['print = 5\nprint("hi")\n', "print"],
  ]) {
    const text = await says(code, `Here "${name}" isn't the built-in function any more`, `${name}_value`);
    if (name !== "print") lacks(text, '"print"');
  }
});

it("an attribute that hides a method of the same name is explained", async () => {
  const code = 'class Person:\n    def __init__(self, name):\n        self.name = name\n\n    def name(self):\n        return self.name\n\n\np = Person("Ada")\nprint(p.name())\n';
  const text = await says(code, "p.name is a string (str) here, not a method", "an attribute and a method both named name");
  lacks(text, "print");
});

it("a grid called map, kept by the program, called with ( ) instead of indexed with [ ] is named, not the loop's variable", async () => {
  const game = "class Game:\n    def __init__(self):\n        self.map = [['#', '.'], ['.', '#']]\n\n    def draw(self):\n        for y in range(2):\n            for x in range(2):\n                square = self.map(y, x)\n\n\nGame().draw()\n";
  lacks(await says(game, "self.map is a list here, not a method"), '"y"', "Parentheses after a value");
  lacks(await says("map = ['#.', '.#']\nfor y in range(2):\n    for x in range(2):\n        print(map(y, x))\n", 'Here "map" isn\'t the built-in function any more'), '"y"');
  // reduce may be the program's own name for functools.reduce: then either name could be the wrong one, and none is blamed.
  lacks(await says("import functools\nreduce = functools.reduce\nstart = 0\nprint(reduce(start, [1, 2]))\n", "Parentheses after a value call it as a function"), '"start"', '"reduce"');
});

it("a variable, a number or a string called like a function each get their own note", async () => {
  await says("total = 5\nprint(total(3))\n", '"total" holds a whole number (int) here, not a function', "total * (...)");
  await says("def total(xs):\n    return sum(xs)\n\n\ntotal = total([1, 2])\nprint(total([3]))\n", '"total" is the name of a function', "a variable with the same name hides the function");
  await says("items = [1, 2]\nprint(items(0))\n", '"items" holds a list', "items[...]");
  await says("print(2(3 + 4))\n", "Multiplication needs a *: 2 * (3 + 4)");
  await says("x = 2(3 + 4)\n", "Multiplication needs a *: 2 * (3 + 4)");
  for (const code of ["name = 'Ada'\nprint(\"Hi\" (name))\n", "print(f'Hi {1}' (3))\n", "print(\"a\" 'b' (3))\n"]) await says(code, "Parentheses right after a string", "A comma is probably missing");
  await says("import random\nprint(random(1, 6))\n", "A module can't be called like a function", "random.random(...)");
});

it("an error inside a call that calls something else doesn't blame the function", async () => {
  // sorted is fine here: the key it was given is the number. reduce too, though an import gave it its value.
  for (const code of ["items = [3, 1]\nprint(sorted(items, key=5))\n", "x = sorted([3, 1], key=5)\n", "items = [3, 1]\nitems.sort(key=5)\n", "from functools import reduce\nnumbers = [4, 8, 3]\nprint(reduce(0, numbers))\n"]) {
    const text = await says(code, "Parentheses after a value call it as a function, but a whole number (int) isn't one");
    lacks(text, "isn't the built-in function", "not a method", "Multiplication", '"reduce"');
  }
  // An import isn't a value to blame: what it gives is nearly always a function. Here pi isn't, and the note says less.
  lacks(await says("from math import pi\nr = 2\nprint(pi(r))\n", "but a decimal number (float) isn't one", "a missing operator"), '"pi"');
});

it("only a value the failing line can see counts, and a name passed on as a function can be the one", async () => {
  // max = 0 in another function doesn't hide max here: the key, age, is the number.
  const oldest = "def oldest_age(people):\n    max = 0\n    for p in people:\n        if p[1] > max:\n            max = p[1]\n    return max\n\n\npeople = [(\"Ada\", 36), (\"Bob\", 20)]\nage = 1\nprint(oldest_age(people))\nprint(max(people, key=age))\n";
  lacks(await says(oldest, '"age" is given where a function is needed, but here it holds a whole number (int)', "key=lambda item: item[1]"), '"max"');
  lacks(await says("age = 1\npeople = [('a', 2)]\npeople.sort(key=age)\n", '"age" is given where a function is needed'), "not a method");
  // A built-in passed on as a function, hidden by a variable; "as list" in a comment gives list no value.
  for (const [code, name] of [
    ["def longest_length(words):\n    max = 0\n    for w in words:\n        if len(w) > max:\n            max = len(w)\n    return max\n\n\nwords = ['a', 'bb']\nlen = len(words)\nprint(max(words, key=len))\n", "len"],
    ["# read the numbers as list\nint = 5\nvalues = ['1']\nnumbers = list(map(int, values))\n", "int"],
    ["int = 5\nvalues = ['1']\nprint(list(map(int, values)))\n", "int"],
    ["str = 'x'\nprint(*map(str, [1]))\n", "str"],
    // ", ".join is a string's method, not a string with parentheses after it.
    ["str = 'x'\nnums = [1, 2]\nprint(\", \".join(map(str, nums)))\n", "str"],
    ["def to_text(numbers):\n    str = ''\n    return ', '.join(map(str, numbers))\n\n\nprint(to_text([1]))\n", "str"],
    ["chr = 'a'\ncodes = [97]\nprint(''.join(map(chr, codes)))\n", "chr"],
    // A function passed on that came from an import isn't a second name to blame.
    ["from math import sqrt\nlist = [1]\nprint(list(map(sqrt, [4])))\n", "list"],
    ["from math import floor\nnums = [1.5]\nsum = 0\nprint(sum(map(floor, nums)))\n", "sum"],
  ]) {
    const text = await says(code, `Here "${name}" isn't the built-in function any more`);
    lacks(text, ...['"max"', '"list"', '"print"'].filter((n) => n !== `"${name}"`), "Parentheses right after a string");
  }
  // The function map, filter or reduce is given: reduce calls it at once, and a for loop going through map marks map.
  for (const [code, name] of [
    ["from functools import reduce\nnumbers = [4, 8, 3]\ntotal = 0\nprint(reduce(total, numbers))\n", "total"],
    ["from functools import reduce\nitems = [1, 2]\nstart = 0\ntotal = reduce(start, items, lambda a, b: a + b)\n", "start"],
    ["import functools\nitems = [1, 2]\nstart = 0\ntotal = functools.reduce(start, items)\n", "start"],
    ["double = 2\nnums = [1, 2]\nfor x in map(double, nums):\n    print(x)\n", "double"],
    ["keep = 2\nnums = [1, 2]\nfor x in filter(keep, nums):\n    print(x)\n", "keep"],
    ["nums = [1, 2]\nkeep = 1\nprint(list(filter(keep, nums)))\n", "keep"],
  ])
    lacks(await says(code, `"${name}" is given where a function is needed, but here it holds a whole number (int)`), '"reduce"', '"map"', '"filter"', "key=");
  // Values only a function, a class or a string sees, and a call where two names could be the number: no name blamed.
  for (const code of [
    "def a():\n    max = 0\n    return max\n\n\ndef b(xs):\n    return max(xs, key=1)\n\n\nb([1])\n",
    "class A:\n    max = 3\n\n    def m(self):\n        return max([1], key=5)\n\n\nA().m()\n",
    'def f(xs):\n    """\n    max = the biggest\n    """\n    print("for max in range")\n    return max(xs, key=5)\n\n\nf([1])\n',
    "max = 0\nage = 1\nprint(max([1], key=age))\n",
  ]) {
    const text = await says(code, "Parentheses after a value call it as a function, but a whole number (int) isn't one");
    lacks(text, "isn't the built-in function", "is given where");
  }
  // Where the line does see the value: the function's own, one around it, the file's (global too), the class's own line.
  for (const code of [
    "def f(people):\n    max = 0\n    for p in people:\n        max = p\n    return max(people)\n\n\nf([1])\n",
    "def outer():\n    max = 3\n\n    def inner():\n        return max([1])\n\n    return inner()\n\n\nouter()\n",
    "max = 0\n\n\ndef f(xs):\n    return max(xs)\n\n\nprint(f([1]))\n",
    "def g():\n    global max\n    max = 0\n\n\ng()\nprint(max([1]))\n",
    "class A:\n    max = 3\n    y = max([1])\n",
    "total = max = 0\nprint(max([1, 2]))\n",
  ])
    await says(code, `Here "max" isn't the built-in function any more`);
  // A long chain of = once made the search for max's value take exponential time.
  const started = Date.now();
  await says(`${"x = ".repeat(40)}0\nprint(max([1], key=5))\n`, "Parentheses after a value call it as a function");
  assert.ok(Date.now() - started < 2000);
});

// ------------------------------------------------------------------ names

it("a module used without its import gets a note that says to import it", async () => {
  const text = await says("print(math.sqrt(16))\n", "uses the module math without importing it", "import math");
  lacks(text, 'print("math")');
  await says("x = random.randint(1, 6)\n", "import random");
  // numbers is also one of Python's modules, but here it's surely the learner's variable: no claim about a module.
  const numbers = await says("numbers.append(4)\n", "If you mean Python's module numbers", "If it's a variable");
  lacks(numbers, "uses the module");
  // Python also suggests a name of the program's: it may be a typo of that, so the note gives both.
  for (const [code, name, near] of [
    ["res = []\nre.append(1)\nprint(res)\n", "re", "res"],
    ["pos = [1, 2]\nos.append(3)\n", "os", "pos"],
    ["datetimes = 1\nprint(datetime.now())\n", "datetime", "datetimes"],
  ]) {
    const text = await says(code, `Did you mean: '${near}'? Or did you forget to import '${name}'?`, `did you mean "${near}"?`, `If you mean Python's module ${name}, add import ${name}`);
    lacks(text, "uses the module");
  }
  // A word on its own in print() may be text missing its quotes.
  await says("print(Hello)\n", 'put it in quotes: print("Hello")');
});

// ------------------------------------------------------------------ syntax

it("else if gets the elif note, though Python reports a missing colon", async () => {
  for (const line of ["else if x:", "else if x == 2 :", "else if(x == 2):"]) {
    const { e, text } = await run(`x = 1\nif x:\n    pass\n${line}\n    pass\n`);
    assert.equal(e.message, "expected ':'");
    assert.ok(text.includes('"else if" is written as one word: elif'), text);
  }
});

// ------------------------------------------------------------------ Python 3.14's own words

it("Python 3.14's messages for unhashable keys, math domains and index() get their notes", async () => {
  await says("d = {[1]: 2}\n", "cannot use 'list' as a dict key", "A list can't be a dictionary's key", "Use a tuple");
  await says("d = {}\nd[[1, 2]] = 3\n", "A list can't be a dictionary's key");
  await says("s = set()\ns.add([1, 2])\n", "A list can't be an item of a set");
  await says("x = hash([1])\n", "A list can't be a key of a dictionary or an item of a set");
  for (const call of ["math.sqrt(-4)", "math.log(0)", "math.acos(2)", "math.pow(-8, 0.5)"]) await says(`import math\nmath_value = ${call}\n`, "The math function was given a value outside the values it accepts");
  await says("items = ['a']\nitems.index('b')\n", "list.index(x): x not in list", "index() looked for a value that isn't in the list");
  await says("t = (1, 2)\nt.index(3)\n", "index() looked for a value that isn't in the tuple");
});

// ------------------------------------------------------------------ common mistakes

it("common beginner errors get a note", async () => {
  const { text: range } = await run("n = input()\nfor i in range(n):\n    print(i)\n", "3\n");
  assert.ok(range.includes("range() needs a whole number (int), but this is text (str)") && range.includes("int(...)"), range);
  await says("for i in range(10 / 2):\n    print(i)\n", "range() needs a whole number (int), not a decimal number (float)", "//");
  await says("class P:\n    def __str__(self):\n        print('P')\n\n\nprint(P())\n", "__str__ method must return a string, but this one returned None", "printing it isn't enough");
  const { text: format } = await run('price = input()\nprint(f"{price:.2f}")\n', "3\n");
  assert.ok(format.includes("works only for numbers, but this value is text (str)") && format.includes("float(...)"), format);
  await says("def f():\n    pass\n\n\nx = float(f())\n", "float() was given None");
  await says("class A:\n    def __int__(self, x):\n        self.x = x\n\n\na = A(1)\n", "The class A has no __init__ method", "two underscores");
  await says("a = []\na.append(1, 2)\n", "append() takes exactly one argument, but the call gives it 2", "extend");
  await says("a = [3]\na.insert(1)\n", "insert() takes 2 arguments, but the call gives it 1");
  await says("x = sum()\n", "sum() takes at least 1 argument, but the call gives it 0");
});

// ------------------------------------------------------------------ what isn't an error

it("a warning, a sys.exit message or the program's own stderr isn't read as an error", async () => {
  for (const code of ["x = 5\nif x is 5:\n    exit(3)\n", 'import sys\nsys.exit("Cancelled")\n', 'import sys\nsys.exit("Error: bad input")\n', "import sys\nprint('Warning: low', file=sys.stderr)\nsys.exit(1)\n", "import warnings\nwarnings.warn('careful')\nraise SystemExit(2)\n"]) {
    const { stderr, exit, e } = await run(code);
    assert.notEqual(exit, 0);
    assert.ok(stderr.trim(), "the run printed something to stderr");
    assert.equal(e, null, `read as an error: ${JSON.stringify(e)}`);
  }
});

it("an error is still read after a warning, from an exception class of the program's own, and with no traceback", async () => {
  const warned = await run("x = 2(3 + 4)\n");
  assert.match(warned.stderr, /SyntaxWarning/);
  assert.equal(warned.e.name, "TypeError");
  const own = await run("class Oops(Exception):\n    pass\n\n\nraise Oops('bad')\n");
  assert.equal(own.e.name, "Oops");
  assert.equal(own.e.message, "bad");
  // A null byte stops the harness's compile, so there's no frame of the program's: only the error's line.
  const nul = await run("x = 1\0\n");
  assert.equal(nul.e?.name, "SyntaxError");
});

// ------------------------------------------------------------------ where the editor marks a syntax error

it("a syntax error's column, past the line's own indentation, is where Python points", async () => {
  for (const [code, line, at] of [
    ['def f():\n    if True:\n        print("hi"\n', 3, "("],
    ["def f():\n    if True:\n        x = = 2\n", 3, "= 2"],
    ["def f():\n\tif True:\n\t\tx = = 2\n", 3, "= 2"],
    ["def f():\n  \tx = = 2\n", 2, "= 2"],
    ['print("hi"\n', 1, "("],
  ]) {
    const { e } = await run(code);
    assert.equal(e.line, line);
    const text = code.split("\n")[line - 1];
    assert.ok(text.slice(columnOffset(text, e.column)).startsWith(at), `column ${e.column} in ${JSON.stringify(text)}`);
  }
});
