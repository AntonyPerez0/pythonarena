// A program of several source files, kept as one string so that saving, grading and sharing work
// the same as for one file. Each file starts with a marker line naming it:
//
//   # ==== main.py ====
//   import helpers
//   # ==== helpers.py ====
//   def double(x): ...
//
// A program without markers is a single main.py (text before the first marker also belongs to
// main.py, as lesson examples write it). The editor shows each file in its own tab, so a learner
// never types a marker; lesson examples show them as file headings. Python starts main.py; the
// other files are modules it imports by their names (helpers.py is `import helpers`).

/** A file marker line: `# ==== helpers.py ====`. */
export const FILE_MARK = /^# ={4} ([A-Za-z_][\w]*\.py) ={4}[ \t]*$/;

export const MAIN_FILE = "main.py";

/** The files of a program: [{ path, text }], main.py first when there's no marker before it. */
export function splitFiles(code) {
  const lines = String(code).split("\n");
  if (!lines.some((l) => FILE_MARK.test(l))) return [{ path: MAIN_FILE, text: code }];
  const files = [];
  let cur = null;
  for (const line of lines) {
    const m = FILE_MARK.exec(line);
    if (m) {
      cur = { path: m[1], lines: [] };
      files.push(cur);
    } else if (cur) cur.lines.push(line);
    else if (line.trim()) {
      cur = { path: MAIN_FILE, lines: [line] };
      files.push(cur);
    }
  }
  return files.map((f) => ({ path: f.path, text: f.lines.join("\n").replace(/\n*$/, "\n") }));
}

/** The one string for a set of files (the reverse of splitFiles). With several files every one,
 * the first too, gets its marker, so even an empty file keeps its place. */
export function joinFiles(files) {
  if (files.length === 1 && files[0].path === MAIN_FILE) return files[0].text;
  return files.map((f) => `# ==== ${f.path} ====\n` + String(f.text).replace(/\n*$/, "\n")).join("\n");
}

/** True when the program has more than one file. */
export const isMultiFile = (code) => splitFiles(code).length > 1;

/** The file's name without its folders. */
export const baseName = (path) => String(path).split("/").pop();

/** The module a file is (helpers for helpers.py). */
export const moduleOfPath = (path) => baseName(path).replace(/\.py$/, "");

/** Python's keywords, which can't name a module or a variable. */
export const KEYWORDS = new Set(
  "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "),
);

/**
 * Why a name can't be one of the program's own files, or null: a module name (letters, digits and
 * _, not starting with a digit, not a keyword) and .py, and not the name of a module of Python's own
 * that lessons use (a file random.py would hide the real random module).
 */
export function sourceNameProblem(name) {
  if (!/^[A-Za-z_]\w*\.py$/.test(name)) return "must be a module name (letters, digits and _, not starting with a digit) ending in .py";
  if (KEYWORDS.has(moduleOfPath(name))) return "can't be one of Python's keywords";
  if (SHADOWED.has(moduleOfPath(name))) return `would hide Python's own module ${moduleOfPath(name)}`;
  return null;
}

/** Modules of Python's standard library that a file of the program must not be named after. */
const SHADOWED = new Set("abc array ast asyncio base64 bisect builtins calendar cmath collections copy csv dataclasses datetime decimal enum fractions functools glob hashlib heapq io itertools json keyword logging math operator os pathlib pickle pprint queue random re shutil statistics string struct sys tempfile textwrap time timeit traceback types typing unittest uuid warnings zipfile".split(" "));
