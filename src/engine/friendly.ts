// Python's error messages, read and explained in plain English.
//
// A run that stops with an error prints a traceback (src/engine/arena.py keeps only the frames in the
// learner's own files, plus a test's own code). parseError reads it; explainError adds a sentence or
// two about what usually causes that error and what to try, using the learner's line of code where
// that helps. The notes are written for people in their first weeks of programming: they name the
// likely cause first, then what to change.

/**
 * One frame of a traceback: where the program was when the error happened. `marks` are the ~ and ^
 * Python put under `code`, lined up with it, when it showed them: the ^ under what failed (for a call,
 * its parentheses) and the ~ under the rest (for a call, what was called).
 */
export type Frame = { file: string; line: number; func: string | null; code?: string; marks?: string };

export type PyError = {
  /** The error's name: SyntaxError, NameError, ValueError... (without a module in front). */
  name: string;
  /** Python's own message, after the name and its colon ("" when there is none). */
  message: string;
  /** The traceback's frames, outermost first (the last one is where it happened). */
  frames: Frame[];
  /** A syntax error (SyntaxError, IndentationError, TabError): Python couldn't read a file, so nothing in it ran. */
  syntax: boolean;
  /** Where it happened: the innermost frame, or for a syntax error the place Python points at. */
  file?: string;
  line?: number;
  /**
   * For a syntax error: the column (from 1) the ^ marks start at, when it can be told. It counts from the
   * start of the line as Python showed it, without the spaces it starts with (as `code`), so in the line as
   * written it's after those spaces (tabs stay, so they count).
   */
  column?: number;
  /** The line of code Python showed, as it showed it (without its indentation). */
  code?: string;
  /** The error happened while another was being handled ("During handling of the above exception..."). */
  chained: boolean;
};

const SYNTAX_NAMES = new Set(["SyntaxError", "IndentationError", "TabError", "_IncompleteInputError"]);
const CHAIN = /\n\n(?:During handling of the above exception, another exception occurred|The above exception was the direct cause of the following exception):\n\n/;
/** A warning's first line ("main.py:2: SyntaxWarning: ..."): the program went on after it. */
const WARNING = /^\S+:\d+: \w+: /;

/** Reads what Python printed for an uncaught error. Null when stderr has no error in it. */
export function parseError(stderr: string): PyError | null {
  const text = stderr.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!text) return null;
  const blocks = text.split(CHAIN);
  const block = blocks[blocks.length - 1];
  const lines = block.split("\n");
  // The error line: the last line at the left margin that reads "Name" or "Name: message".
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^[A-Za-z_][\w.]*(?::|$)/.test(lines[i]) && !/^Traceback \(most recent call last\):$/.test(lines[i]) && !WARNING.test(lines[i])) {
      at = i;
      // A message of several lines: keep going up while the lines above aren't part of the traceback.
      while (at > 0 && !/^\s/.test(lines[at - 1]) && !/^Traceback/.test(lines[at - 1]) && lines[at - 1] !== "" && !WARNING.test(lines[at - 1])) at--;
      break;
    }
  }
  if (at < 0) return null;
  // An error comes after its traceback, or for a syntax error after the place Python points at. Without
  // either, it must at least have an error's name: what the program wrote to stderr itself, or the text of
  // sys.exit("Cancelled"), isn't an error.
  const traced = lines.slice(0, at).some((l) => /^Traceback \(most recent call last\):$|^ {2}File "/.test(l));
  if (!traced && !/^[A-Za-z_][\w.]*(?:Error|Exception|Warning|Exit|Interrupt|Iteration)(?::|$)/.test(lines[at])) return null;
  const head = /^([A-Za-z_][\w.]*)(?::\s?([\s\S]*))?$/.exec(lines.slice(at).join("\n"));
  if (!head) return null;
  const name = head[1].split(".").pop()!;
  const message = (head[2] ?? "").trim();
  const frames: Frame[] = [];
  let column: number | undefined;
  let syntaxFrame: Frame | null = null;
  for (let i = 0; i < at; i++) {
    const m = /^ {2}File "([^"]+)", line (\d+)(?:, in (.+))?$/.exec(lines[i]);
    if (!m) continue;
    const frame: Frame = { file: m[1], line: Number(m[2]), func: m[3] ?? null };
    // The code line follows, indented by 4; then perhaps a line of ~ and ^ marks.
    const code = lines[i + 1];
    if (code != null && /^ {4}/.test(code) && !/^\s*[~^]+\s*$/.test(code)) {
      frame.code = code.slice(4);
      const marks = lines[i + 2];
      if (marks != null && /^ {4}\s*[~^]+\s*$/.test(marks)) {
        frame.marks = marks.slice(4).trimEnd();
        if (!m[3]) column = frame.marks.search(/[~^]/) + 1;
      }
    }
    frames.push(frame);
    if (!m[3]) syntaxFrame = frame;
  }
  const syntax = SYNTAX_NAMES.has(name);
  const where = syntax && syntaxFrame ? syntaxFrame : frames[frames.length - 1];
  return { name, message, frames, syntax, file: where?.file, line: where?.line, column: syntax ? column : undefined, code: where?.code, chained: blocks.length > 1 };
}

/**
 * Where a syntax error's column (PyError.column) is in its line as written, from 0: Python shows the line
 * without the spaces (and form feeds) it starts with, and counts the column from there.
 */
export function columnOffset(lineText: string, column: number): number {
  return /^[ \f]*/.exec(lineText)![0].length + Math.max(column - 1, 0);
}

type Source = { path: string; text: string };

/** The learner's line of code (as written, with its indentation), or "". */
function sourceLine(sources: Source[], file: string | undefined, line: number | undefined): string {
  if (!file || !line) return "";
  const f = sources.find((s) => s.path === file);
  return f?.text.split("\n")[line - 1] ?? "";
}

/** `x`, a name in backticks for Markdown-free plain text: notes are shown as text, so just quotes. */
const q = (s: string) => `"${s}"`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Python's built-in function names that learners often reuse as variable names (which then hides the function). */
const BUILTINS = new Set("print input len int float str list dict set tuple range sum min max abs round sorted type bool open id map filter zip next iter all any chr ord pow enumerate reversed format hash".split(" "));

/** Python's own modules that the lessons import: a name of one of these with a dot after it is the module. */
const MODULES = new Set("math random datetime re csv json functools itertools collections fractions decimal statistics os sys difflib".split(" "));

/** Smart quotes and other characters that sneak in when code is copied from a document. */
const LOOKALIKES: Record<string, string> = { "“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", "—": "-", "×": "*", "÷": "/", " ": " ", "：": ":" };

/**
 * A plain-English note about an error, or null when there's nothing useful to add. `sources` are
 * the learner's files, so the note can look at the line where it happened.
 */
export function explainError(e: PyError, sources: Source[] = []): string | null {
  const line = sourceLine(sources, e.file, e.line);
  const code = (e.code ?? line).trim();
  const m = e.message;
  let r: RegExpExecArray | null;
  switch (e.name) {
    // ------------------------------------------------------------ syntax
    case "SyntaxError":
    case "_IncompleteInputError": {
      // Python reads "else if x:" as an else missing its colon (expected ':'), so this comes before that check.
      if (/^else\s+if\b/.test(code)) return "In Python, \"else if\" is written as one word: elif.";
      if ((r = /^'([([{])' was never closed/.exec(m))) return `A ${r[1] === "(" ? "parenthesis (" : r[1] === "[" ? "square bracket [" : "curly bracket {"} opened on this line is never closed. Every ${r[1]} needs a matching ${r[1] === "(" ? ")" : r[1] === "[" ? "]" : "}"}: count them on the line, and look for one missing at its end.`;
      if ((r = /^unmatched '([)\]}])'/.exec(m))) return `This line has a closing ${r[1]} without an opening one before it. Remove the extra ${r[1]}, or add the opening bracket that's missing.`;
      if ((r = /^closing parenthesis '(.)' does not match opening parenthesis '(.)'/.exec(m))) return `Brackets are mixed up: a ${r[2]} is closed with ${r[1]}. Each kind of bracket closes with its own partner: ( with ), [ with ] and { with }.`;
      if (/^unterminated string literal/.test(m)) return "A string on this line has no closing quote. A string must end with the same kind of quote it starts with, on the same line: \"like this\" or 'like this'.";
      if (/^unterminated triple-quoted string literal/.test(m)) return "A string that starts with three quotes (\"\"\" or ''') is never closed with three more of the same kind. Everything after it is read as part of the text.";
      if ((r = /^invalid character '(.)' \(U\+([0-9A-F]+)\)/.exec(m))) {
        const fix = LOOKALIKES[r[1]];
        return fix ? `The character ${r[1]} looks like ${fix} but isn't the same to Python. It often comes from text copied from a document or a web page. Type ${fix} yourself in its place.` : `Python can't use the character ${r[1]} in code. Outside of a string or a comment, code is written with plain keyboard characters.`;
      }
      if ((r = /^invalid non-printable character U\+([0-9A-F]+)/.exec(m))) return `This line has an invisible character (U+${r[1]}) in it, usually from copied text. Delete the line and type it again by hand.`;
      if (/^expected ':'/.test(m)) return "A line that starts a block, such as if, elif, else, while, for, def or class, must end with a colon : and the lines of the block go below it, indented.";
      if (/^Missing parentheses in call to 'print'/.test(m)) return "In Python 3, print is a function, so what it prints goes in parentheses: print(\"Hello\"), not print \"Hello\".";
      if (/^Missing parentheses in call to/.test(m)) return "A function's arguments go in parentheses after its name.";
      if (/Maybe you meant '==' or ':=' instead of '='\?|Maybe you meant '==' instead of '='\?/.test(m) || /^cannot assign to (?:comparison|expression here)/.test(m))
        return "A single = stores a value in a variable. To compare two values (in an if or a while), use two: ==.";
      if (/^cannot assign to literal/.test(m)) return "The left side of = must be a variable's name, like count = 5. A value such as 5 or \"text\" can't be given a new value.";
      if (/^cannot assign to function call/.test(m)) return "The left side of = must be a variable's name. To compare, use ==; to store a function's result, put the variable first: result = len(text).";
      if (/^invalid decimal literal/.test(m)) return "Python read a number here that runs into letters, like 2nd or 3x. A variable's name can't start with a digit, and multiplication needs a *: 3 * x, not 3x.";
      if (/^leading zeros in decimal integer literals are not permitted/.test(m)) return "A whole number can't start with 0 in Python (007 isn't allowed). Write 7, or put the digits in quotes if they're text, like a phone number.";
      if (/^'return' outside function/.test(m)) return "return can only be used inside a function (under a def line, indented). Check this line's indentation: it may have slipped out of the function.";
      if (/^'break' outside loop/.test(m) || /^'continue' (?:not properly in|outside) loop/.test(m)) return `${m.startsWith("'break'") ? "break" : "continue"} only works inside a while or for loop. Check this line's indentation: it must be inside the loop's block.`;
      if (/^f-string: /.test(m)) return "Something inside the curly brackets of this f-string can't be read. Inside { } goes an expression, such as a variable's name; a { or } meant as text is written twice: {{ or }}.";
      if (/^expected 'except' or 'finally' block/.test(m)) return "A try block needs at least one except (or finally) block right after it, at the same indentation as try.";
      if (/^invalid syntax\. Perhaps you forgot a comma\?/.test(m)) {
        if (/print\s*\([^"'()]*\b[A-Za-z]+\s+[A-Za-z]+/.test(code)) return "Python couldn't read the part marked with ^. Text to print must be in quotes: print(\"Hello there!\"), not print(Hello there!). If there are several things in the parentheses, they're separated by commas.";
        return "Python couldn't read the part marked with ^. Often two values are side by side without a comma between them, or text is missing its quotes.";
      }
      if (/^invalid syntax\. Did you mean '(\w+)'\?/.test(m)) return `Python didn't recognize a word on this line: it may be a misspelled keyword (it suggests ${q(/'(\w+)'/.exec(m)![1])}).`;
      if (/^expected '\('/.test(m)) return "A def line needs parentheses after the function's name, even when it takes nothing: def greet():";
      if (/^invalid syntax/.test(m)) {
        if (/^\s*(?:if|elif|while|for|def|class|else|try|except|with)\b[^:]*$/.test(line)) return "This line starts a block, so it must end with a colon :";
        if (/\b(?:And|Or|Not|AND|OR|NOT|&&|\|\|)\b|&&|\|\|/.test(line)) return "Python's logical operators are the words and, or and not, in small letters (not && or ||).";
        if (/\bTrue\b|\bFalse\b/.test(line) === false && /\btrue\b|\bfalse\b/.test(line)) return "Python's truth values start with a capital letter: True and False.";
        return "Python couldn't read the part marked with ^. Look at that spot and just before it: a missing quote, colon, parenthesis or comma is the usual cause.";
      }
      return null;
    }
    case "IndentationError":
      if (/^expected an indented block/.test(m)) return `The line after a line that ends with a colon must be indented: moved right, usually by 4 spaces, to show it belongs to the block${(r = /after '(\w+)' statement on line (\d+)/.exec(m)) ? ` of the ${r[1]} on line ${r[2]}` : ""}. If the block should do nothing for now, write pass in it.`;
      if (/^unexpected indent/.test(m)) return "This line is indented, but nothing above it starts a block. In Python, indentation means \"this belongs to the block above\", so lines at the same level must start at exactly the same column. Remove the extra spaces at its start.";
      if (/^unindent does not match any outer indentation level/.test(m)) return "This line's indentation doesn't line up with any line above it. Lines in the same block start at the same column: use 4 spaces for each level, and check that this line has a multiple of 4.";
      return "The indentation (the spaces at the start of the line) doesn't fit here. Each block is indented by 4 more spaces than the line that starts it, and the lines of one block start at the same column.";
    case "TabError":
      return "This file indents some lines with tabs and others with spaces. Python can't tell how they line up. Indent with spaces only: 4 for each level.";

    // ------------------------------------------------------------ names
    case "NameError": {
      if ((r = /^name '(\w+)' is not defined/.exec(m))) {
        const name = r[1];
        const suggestion = /Did you mean: '([\w.]+)'\?/.exec(m)?.[1];
        // For a name that is one of Python's own modules, Python asks "Did you forget to import 'math'?".
        // The name can be a variable of the learner's too (numbers, string), so only a module the lessons
        // use, used with a dot after it, is surely one. When Python also suggests a name of the program's
        // ("Did you mean: 'res'? Or did you forget to import 're'?"), it may be a typo of that: say both.
        const module = /[Dd]id you forget to import '(\w+)'\?/.exec(m)?.[1];
        if (module && suggestion) return `Python doesn't know the name ${q(name)}. Check the spelling: did you mean ${q(suggestion)}? If you mean Python's module ${module}, add import ${module} at the top of the file.`;
        if (module && MODULES.has(module) && new RegExp(`\\b${module}\\s*\\.`).test(code)) return `The program uses the module ${module} without importing it. Add import ${module} at the top of the file.`;
        if (suggestion && suggestion.toLowerCase() === name.toLowerCase()) return `Python doesn't know the name ${q(name)}. Capital letters matter: you probably mean ${q(suggestion)}.`;
        if (suggestion) return `Python doesn't know the name ${q(name)}. Check the spelling: did you mean ${q(suggestion)}? A variable or function must be created (given a value, or defined with def) before it's used.`;
        if (module) return `Python doesn't know the name ${q(name)}. If you mean Python's module ${module}, import it first: add import ${module} at the top of the file. If it's a variable, it must get a value on a line before this one.`;
        if (["true", "false", "none"].includes(name)) return `Python's ${name[0].toUpperCase() + name.slice(1)} starts with a capital letter.`;
        // print(Hello) or print(Hello, world): a word on its own, not one with a dot or brackets after it.
        if (new RegExp(`print\\s*\\(\\s*${name}\\s*[,)]`).test(code) && /^[A-Za-z]+$/.test(name)) return `Python doesn't know the name ${q(name)}. If you meant it as text to print, put it in quotes: print("${name}"). If it's a variable, it must get a value on a line before this one.`;
        return `Python doesn't know the name ${q(name)}. A variable must get a value (with =) on a line that runs before this one, and a function must be defined with def before it's called. Check the spelling and the capital letters too.`;
      }
      return null;
    }
    case "UnboundLocalError":
      if ((r = /^cannot access local variable '(\w+)'/.exec(m))) return `The function gives ${q(r[1])} a value somewhere, which makes it a variable of the function's own, but here it's used before that happens. If you meant the variable outside the function, pass its value in as a parameter instead (or, as a last resort, declare it global ${r[1]} at the start of the function).`;
      return null;

    // ------------------------------------------------------------ types
    case "TypeError": {
      if ((r = /^can only concatenate str \(not "(\w+)"\) to str/.exec(m))) return `+ can join two strings, but here a string and ${article(r[1])} are joined. Turn the number into text with str(...), or use an f-string: f"Total: {total}".`;
      if ((r = /^unsupported operand type\(s\) for ([^:]+): '(\w+)' and '(\w+)'/.exec(m))) {
        const [, op, a, b] = r;
        if ((a === "str" && ["int", "float"].includes(b)) || (b === "str" && ["int", "float"].includes(a))) return `${op.trim()} can't combine text (str) and a number (${a === "str" ? b : a}). Remember that input() always gives text: turn it into a number with int(...) or float(...) before calculating with it.`;
        if (a === "NoneType" || b === "NoneType") return `One side of ${op.trim()} is None, which means "no value". A function that doesn't return anything gives None: check that the function you called has a return line.`;
        return `${op.trim()} doesn't work between ${article(a)} and ${article(b)}.`;
      }
      if ((r = /^'([<>]=?)' not supported between instances of '(\w+)' and '(\w+)'/.exec(m))) {
        if ([r[2], r[3]].includes("str") && [r[2], r[3]].some((t) => t === "int" || t === "float")) return `${r[1]} can't compare text with a number. input() always gives text: turn it into a number with int(...) or float(...) first.`;
        return `${r[1]} can't compare ${article(r[2])} with ${article(r[3])}.`;
      }
      if ((r = /^can't multiply sequence by non-int of type '(\w+)'/.exec(m))) return `A string or a list can only be multiplied by a whole number (int), not ${article(r[1])}. If the value came from input(), turn it into a number with int(...) first.`;
      if ((r = /^(\w+(?:\.\w+)?)\(\) takes (\d+) positional arguments? but (\d+) (?:was|were) given/.exec(m))) {
        const [, fn, want, got] = r;
        const method = fn.includes(".") || e.frames.some((f) => /^\s*class\b/.test(f.code ?? ""));
        if (method && Number(got) === Number(want) + 1) return `${fn}() was given one argument more than it takes. A method's first parameter is self, which Python fills in itself; check that the def line lists self and then the parameters you pass.`;
        return `${fn}() takes ${plural(Number(want), "argument")}, but the call gives it ${got}. The call and the def line must match: one argument for each parameter.`;
      }
      if ((r = /^(\w+(?:\.\w+)?)\(\) missing (\d+) required positional arguments?: (.+)$/.exec(m))) return `${r[1]}() needs ${plural(Number(r[2]), "more argument")} (${r[3].replace(/'/g, "")}), but the call doesn't give ${Number(r[2]) === 1 ? "it" : "them"}. Give one value for each parameter in the def line.`;
      if ((r = /^(\w+(?:\.\w+)?)\(\) got an unexpected keyword argument '(\w+)'/.exec(m))) return `${r[1]}() has no parameter named ${q(r[2])}. Check the name in the def line.`;
      if ((r = /^'(\w+)' object is not callable/.exec(m))) {
        const type = r[1];
        if (type === "module") {
          const s = /Did you mean: '([\w.]+)\(\.\.\.\)'\?/.exec(m)?.[1];
          return `A module can't be called like a function. Call a function from it, with a dot after the module's name${s ? `: Python suggests ${s}(...)` : ""}.`;
        }
        // What was called, if it can be told. An error inside a call, like sorted(items, key=5), marks the
        // outer call (sorted), which is still the function. So a name is blamed only if the program gives it
        // a value the line can see, and only if it's the one such name: the called one, or one the call
        // passes on as a function (key=age, map(int, values)), which the call then calls.
        const call = failedCall(e);
        const called = call?.callee;
        if (called && /^\d/.test(called)) return "Parentheses right after a number, like 2(3 + 4), read as calling it as a function. Multiplication needs a *: 2 * (3 + 4).";
        // Only a string on its own: ", ".join is a string's method, called fine.
        if (called && /^[rbfu]{0,2}["'].*["']$/i.test(called)) return "Parentheses right after a string, like \"Sum:\" (a + b), read as calling it as a function. A comma is probably missing between them: \"Sum:\", (a + b).";
        const at = e.frames[e.frames.length - 1];
        const attr = called && /^\w+(?:\.\w+)*\.(\w+)$/.exec(called)?.[1];
        // map and filter call their function later, when what they give is gone through: by the call around
        // them (list(map(int, values))), or by a for loop, which marks map itself. reduce calls it at once.
        // So the function they're given is in the failing call's arguments, or is the failing call's first.
        const passed = [...(call?.args ?? "").matchAll(/\bkey\s*=\s*([A-Za-z_]\w*)\s*[,)]|\b(?:map|filter)\s*\(\s*([A-Za-z_]\w*)\s*,/g)].map((p) => ({ name: p[1] ?? p[2], key: p[1] != null }));
        // Only when the called name can be the built-in: an attribute the program sets (self.map) or a map or filter it
        // assigns (a grid called map) is the program's own value, which fails before its first argument is called.
        // reduce can be the program's own name for functools.reduce, so it stays a suspect's call.
        const builtin = called && (attr ? !setsAttribute(sources, attr) : called === "reduce" || !assigns(sources, called, at));
        const first = builtin && /^(?:\w+\.)?(?:map|filter|reduce)$/.test(called) ? /^\(\s*([A-Za-z_]\w*)\s*,/.exec(call!.args)?.[1] : undefined;
        if (first) passed.push({ name: first, key: false });
        const suspects = new Set(passed.map((p) => p.name).filter((n) => assigns(sources, n, at)));
        if (called && (/^\w+$/.test(called) ? assigns(sources, called, at) : attr && setsAttribute(sources, attr))) suspects.add(called);
        const name = suspects.size === 1 ? [...suspects][0] : null;
        if (name && name === called && attr) {
          const both = classBodies(sources).some((c) => new RegExp(`^\\s+def\\s+${attr}\\s*\\(`, "m").test(c) && new RegExp(`\\bself\\.${attr}\\s*=(?!=)`).test(c));
          if (both) return `${called} is ${article(type)} here, not a method. The class has an attribute and a method both named ${attr}, and the attribute hides the method: give them different names.`;
          return `${called} is ${article(type)} here, not a method, so it can't be called with ( ). To use its value, leave out the parentheses: ${called}.`;
        }
        if (name) {
          if (BUILTINS.has(name)) return `Here ${q(name)} isn't the built-in function any more: the program gave a variable that same name, which hides the function. Rename the variable (for example ${name}_value).`;
          if (sources.some((s) => new RegExp(`^def\\s+${name}\\s*\\(`, "m").test(s.text))) return `${q(name)} is the name of a function, but here it holds ${article(type)}: a variable with the same name hides the function. Give the variable another name.`;
          if (name !== called) return `${q(name)} is given where a function is needed, but here it holds ${article(type)}, not a function.${passed.some((p) => p.key && p.name === name) ? " key= takes a function, such as len, or a lambda: key=lambda item: item[1]." : ""}`;
          const hint = type === "int" || type === "float" ? ` To multiply, put * before the parenthesis: ${name} * (...).` : ["list", "str", "tuple", "dict"].includes(type) ? ` To get an item, use square brackets: ${name}[...].` : "";
          return `${q(name)} holds ${article(type)} here, not a function, so it can't be called with ( ).${hint}`;
        }
        return `Parentheses after a value call it as a function, but ${article(type)} isn't one. Check for a variable with the same name as a function, or a missing operator.`;
      }
      if ((r = /^'(\w+)' object cannot be interpreted as an integer/.exec(m))) {
        const what = failedCall(e)?.callee === "range" ? "range() needs a whole number (int)" : "A whole number (int) is needed here";
        if (r[1] === "str") return `${what}, but this is text (str). input() always gives text: turn it into a number with int(...) first.`;
        if (r[1] === "float") return `${what}, not a decimal number (float). Division with / always gives a float: use // for whole-number division, or int(...).`;
        return `${what}, not ${article(r[1])}.${r[1] === "NoneType" ? " Check that the function you called returns a value." : ""}`;
      }
      if ((r = /^(__str__|__repr__) returned non-string \(type (\w+)\)/.exec(m)))
        return `A class's ${r[1]} method must return a string, but this one returned ${article(r[2])}. Give the text back with return, for example return f"Name: {self.name}"${r[2] === "NoneType" ? "; printing it isn't enough" : ""}.`;
      if ((r = /^(\w+)\(\) takes no arguments$/.exec(m)) && sources.some((s) => new RegExp(`^\\s*class\\s+${r![1]}\\b`, "m").test(s.text)))
        return `The class ${r[1]} has no __init__ method, so ${r[1]}(...) can't be given values. Check that __init__ is spelled with two underscores on each side: def __init__(self, ...):`;
      if ((r = /^(?:\w+\.)?(\w+)\(\) takes (exactly one|no|at most|at least) (\d+ )?(?:positional )?arguments? \((\d+) given\)/.exec(m))) {
        const [, fn, takes, n, got] = r;
        const more = fn === "append" && Number(got) > 1 ? " append adds one item; to add several, use extend with a list of them: items.extend([a, b])." : "";
        return `${fn}() takes ${takes === "exactly one" ? "exactly one argument" : takes === "no" ? "no arguments" : `${takes} ${plural(Number(n), "argument")}`}, but the call gives it ${got}.${more}`;
      }
      if ((r = /^(\w+) expected (at most |at least )?(\d+) arguments?, got (\d+)/.exec(m))) return `${r[1]}() takes ${r[2] ?? ""}${plural(Number(r[3]), "argument")}, but the call gives it ${r[4]}.`;
      if ((r = /^'(\w+)' object is not subscriptable/.exec(m))) {
        if (r[1] === "NoneType") return "Square brackets [ ] were used on None, the value meaning \"nothing\". A function without a return gives None: check that the function you called returns its result.";
        if (r[1] === "builtin_function_or_method" || r[1] === "function" || r[1] === "method") return "Square brackets were used on a function. To call a function, use parentheses: len(text), not len[text].";
        return `Square brackets pick an item from a string, a list, a tuple or a dictionary, but this is ${article(r[1])}.`;
      }
      if ((r = /^object of type '(\w+)' has no len\(\)/.exec(m))) return `len() counts the items of a string, a list or another collection, but ${article(r[1])} has no length. To count the digits of a number, turn it into text first: len(str(number)).`;
      if ((r = /^'(\w+)' object does not support item assignment/.exec(m))) return r[1] === "str" ? "Strings can't be changed in place: text[0] = \"X\" doesn't work. Build a new string instead, for example with slices: text = \"X\" + text[1:]." : r[1] === "tuple" ? "A tuple can't be changed once it's made. Use a list if its items need to change." : `${article(r[1], true)} can't have its items changed with [ ] =.`;
      if ((r = /^(?:list|string|tuple) indices must be integers or slices, not (\w+)/.exec(m))) return r[1] === "float" ? "An index must be a whole number, but this one is a float. Division with / always gives a float: use // for whole-number division." : r[1] === "str" ? "An index must be a whole number, but this one is text. If it came from input(), turn it into a number with int(...). (For a dictionary, use one instead of a list.)" : `An index must be a whole number, not ${article(r[1])}.`;
      if ((r = /^'(\w+)' object is not iterable/.exec(m))) return r[1] === "int" ? "A for loop goes through the items of a collection, but this is a single number. To repeat something n times, loop over range(n)." : r[1] === "NoneType" ? "A for loop was given None, the value meaning \"nothing\". Check that the function that should give the list returns it." : `A for loop (or another tool that goes through items) was given ${article(r[1])}, which has no items to go through.`;
      if ((r = /^cannot unpack non-iterable (\w+) object/.exec(m))) return `Several variables on the left of = take the items of a collection, but the value on the right is ${article(r[1])}.${r[1] === "NoneType" ? " Check that the function you called returns its values." : ""}`;
      // Python 3.14: "cannot use 'list' as a dict key (unhashable type: 'list')", or "as a set element"; hash() still says "unhashable type: 'list'".
      if ((r = /unhashable type: '(\w+)'/.exec(m))) {
        const where = /as a dict key/.test(m) ? "a dictionary's key" : /as a set element/.test(m) ? "an item of a set" : "a key of a dictionary or an item of a set";
        return `${article(r[1], true)} can't be ${where}, because it can change.${r[1] === "list" ? " Use a tuple instead of a list: (1, 2), not [1, 2]." : ""}`;
      }
      if ((r = /^(int|float)\(\) argument must be a string.* not '(\w+)'/.exec(m)))
        return r[2] === "NoneType" ? `${r[1]}() was given None. Check that the function you called returns a value.` : `${r[1]}() turns text or a number into a number, but it was given ${article(r[2])}.`;
      if (/^'NoneType' object is not iterable/.test(m)) return "This expected a collection, but got None. Check that the function you called returns its result.";
      if (/^%d format: a real number is required/.test(m)) return "A %d placeholder needs a number. Try an f-string instead: f\"{value}\".";
      if (/^(?:sequence item \d+: )?expected str instance, (\w+) found/.test(m)) return "join() puts strings together, but one item isn't a string. Turn each item into text first, for example with str(...).";
      if (/^unsupported format string passed to (\w+)\.__format__/.test(m)) return "The format after : in the f-string doesn't suit this value: a format such as :.2f works only for numbers.";
      return null;
    }
    case "ValueError": {
      if ((r = /^invalid literal for int\(\) with base 10: (.*)$/.exec(m))) {
        const value = r[1];
        if (value === "''") return "int() was given empty text, so there's no number to read. With input, the test gave an empty line here.";
        if (/^'\s*-?\d+\.\d*\s*'$/.test(value)) return `int() reads whole numbers only, and ${value} has a decimal point. Use float(...) for a number with decimals.`;
        return `int() can only turn text that is a whole number into a number, and ${value} isn't one. Check what the program reads at this point: maybe the input is in a different order than the program expects.`;
      }
      if ((r = /^could not convert string to float: (.*)$/.exec(m))) return `float() can only turn text that is a number into one, and ${r[1]} isn't a number. (It accepts 3.5, -2 or 1e3, but not 3,5 with a comma.)`;
      // Python 3.14 names what the function expects (math.sqrt(-4): "expected a nonnegative input, got -4.0"); pow and fmod still say "math domain error".
      if (/^math domain error|^expected a (?:nonnegative|positive|finite) input|^expected a number (?:in range|between)|^expected argument value|^expected a noninteger or positive integer/.test(m))
        return "The math function was given a value outside the values it accepts, such as the square root of a negative number.";
      if (/^list\.remove\(x\): x not in list/.test(m)) return "remove() looked for a value that isn't in the list. Check with in first: if value in items: items.remove(value).";
      if ((r = /^(\w+)\.index\(x\): x not in \w+/.exec(m))) return `index() looked for a value that isn't in the ${r[1] === "list" || r[1] === "tuple" ? r[1] : "collection"}. Check with in first: if value in items:`;
      if ((r = /^Unknown format code '(.)' for object of type '(\w+)'/.exec(m))) {
        const [, c, type] = r;
        if (type === "str") return `A format such as :.2f or :d works only for numbers, but this value is text (str). If it came from input(), turn it into a number first with ${c === "d" ? "int" : "float"}(...).`;
        if (type === "float" && c === "d") return "The format :d is for whole numbers, but this value is a decimal number (float). Use :.0f to show it with no decimals.";
        return `The format code ${c} after : doesn't suit ${article(type)}.`;
      }
      if (/^substring not found/.test(m)) return "index() looked for a part of the string that isn't in it. find() gives -1 instead of an error; or check with in first.";
      if ((r = /^too many values to unpack \(expected (\d+)(?:, got (\d+))?\)/.exec(m))) return `There are ${plural(Number(r[1]), "variable")} on the left of =, but the value on the right has more items${r[2] ? ` (${r[2]})` : ""}. With split(), check what the text is split into.`;
      if ((r = /^not enough values to unpack \(expected (\d+), got (\d+)\)/.exec(m))) return `There are ${plural(Number(r[1]), "variable")} on the left of =, but the value on the right has only ${plural(Number(r[2]), "item")}. With split(), check that the line really has the parts you expect.`;
      if (/^max\(\) iterable argument is empty|^min\(\) iterable argument is empty|^max\(\) arg is an empty sequence|^min\(\) arg is an empty sequence/.test(m)) return "max() and min() need at least one item, but the collection is empty. Check for an empty list first.";
      if (/^empty separator/.test(m)) return "split() can't split on empty text. Give it the character to split at, or nothing at all to split at spaces.";
      if (/^I\/O operation on closed file/.test(m)) return "The file was already closed when the program read or wrote it. Do the reading and writing inside the with block, indented under it.";
      if (/^Exceeds the limit \(\d+ digits\) for integer string conversion/.test(m)) return "This number has too many digits to turn into text.";
      return raisedHere(e, sources);
    }
    case "IndexError": {
      if (/^(list|string|tuple) index out of range/.test(m)) {
        const kind = /^(\w+)/.exec(m)![1];
        return `The index is past the end of the ${kind}. Indexes start at 0, so the last item of a ${kind} of length n is at index n - 1 (or -1). Check the index and, in a loop, the loop's last value.`;
      }
      if (/^pop from empty list/.test(m)) return "pop() was called on an empty list. Check that it has items first: if items:";
      if (/^pop index out of range/.test(m)) return "pop() was given an index that isn't in the list.";
      if (/^list assignment index out of range/.test(m)) return "An item can only be replaced at an index that already exists. To add an item at the end, use append().";
      if (/^Cannot choose from an empty sequence/.test(m)) return "random.choice() was given an empty list, so there's nothing to choose.";
      return null;
    }
    case "KeyError": {
      const key = m;
      return `The dictionary has no key ${key}. Check with in before reading a key (if ${key || "key"} in data:), or use get(), which gives None (or a default) for a missing key. Check the spelling and capital letters, and whether the key is a string or a number.`;
    }
    case "ZeroDivisionError":
      return /modulo/.test(m) ? "The program used % with 0 on the right. A remainder of a division by zero doesn't exist." : "The program divided by zero. Check the value you divide by, for example the count of items when it can be 0: if count > 0:";
    case "AttributeError": {
      if ((r = /^'NoneType' object has no attribute '(\w+)'/.exec(m))) return `.${r[1]} was used on None, the value meaning "nothing". Usually a function or method returned nothing: check its return line. Note that list methods such as sort() and append() change the list and return None, so items = items.sort() loses the list.`;
      if ((r = /^'str' object has no attribute '(\w+)'/.exec(m))) {
        const hint = { append: "Strings can't be added to in place; build a new one with +.", push: "", remove: "To take part of a string out, use replace().", sort: "To sort the characters, use sorted(text)." }[r[1]] ?? "";
        return `Strings have no method ${q(r[1])}. ${hint}${r[1] === "lenght" || r[1] === "length" || r[1] === "len" ? "A string's length is len(text)." : ""}`.trim();
      }
      if ((r = /^'list' object has no attribute '(\w+)'/.exec(m))) {
        const hint: Record<string, string> = { push: "To add an item to a list, use append().", add: "To add an item to a list, use append().", length: "A list's length is len(items).", len: "A list's length is len(items).", split: "split() is a string method; the list may already be split.", lower: "lower() is a string method: apply it to each item.", strip: "strip() is a string method: apply it to each item." };
        return `Lists have no method ${q(r[1])}. ${hint[r[1]] ?? ""}`.trim();
      }
      if ((r = /^'int' object has no attribute '(\w+)'/.exec(m))) return `A whole number (int) has no ${q(r[1])}. Check that the variable holds what you think it does.`;
      if ((r = /^'(\w+)' object has no attribute '(\w+)'/.exec(m))) {
        const [, cls, attr] = r;
        const def = sources.some((s) => new RegExp(`^\\s*class\\s+${cls}\\b`, "m").test(s.text));
        if (def) {
          if (/Did you mean: '(\w+)'\?/.test(m)) return `${cls} objects have no ${q(attr)}. Check the spelling (Python suggests ${q(/Did you mean: '(\w+)'\?/.exec(m)![1])}).`;
          return `${cls} objects have no attribute or method ${q(attr)}. An attribute exists once a method gives it a value with self.${attr} = ..., usually in __init__. Check the spelling, and that __init__ is spelled with two underscores on each side.`;
        }
        return `${article(cls, true)} has no attribute or method ${q(attr)}. Check the spelling.`;
      }
      if ((r = /^module '(\w+)' has no attribute '(\w+)'/.exec(m))) return `The module ${r[1]} has no ${q(r[2])}. Check the spelling, and that the program has no file of its own named ${r[1]}.py.`;
      if ((r = /^type object '(\w+)' has no attribute '(\w+)'/.exec(m))) return `The class ${r[1]} itself has no ${q(r[2])}. If it's an attribute of each object, use it on an object (made with ${r[1]}(...)), not on the class.`;
      return null;
    }
    case "RecursionError":
      return "A function kept calling itself and never stopped, until Python's limit of about 1000 calls in a row. A recursive function needs a base case: a case where it returns without calling itself. Check that every call moves closer to it.";
    case "EOFError":
      return "The program asked for input with input() after the test's input had run out. It reads more lines than the task gives it: check how many times input() runs, for example in a loop that should have stopped.";
    case "FileNotFoundError":
      if ((r = /No such file or directory: '([^']+)'/.exec(m))) return `There's no file named ${q(r[1])} in the program's folder. Check the name's spelling and capitals${/\//.test(r[1]) ? " and its folder" : ""}. ${/^[A-Z]:|^\//.test(r[1]) ? "Use the file's name only, not a full path." : ""}`.trim();
      return null;
    case "IsADirectoryError":
      return "This name is a folder, not a file.";
    case "ModuleNotFoundError":
      if ((r = /^No module named '([\w.]+)'/.exec(m))) return `Python can't find a module named ${q(r[1])}. Check the spelling. Python's own modules (math, random, datetime...) are always there; a module of your own must be a file named ${r[1]}.py next to main.py.`;
      return null;
    case "ImportError":
      if ((r = /^cannot import name '(\w+)' from '([\w.]+)'/.exec(m))) return `The module ${r[2]} has nothing named ${q(r[1])}. Check the spelling and the capital letters.`;
      return null;
    case "OverflowError":
      return /int too large to convert to float/.test(m) ? "This whole number is too big to turn into a float. Python's int can be huge, but a float has a limit." : "The result is too big for a float.";
    case "MemoryError":
      return "The program ran out of memory. Usually a loop keeps adding to a list or a string and never stops.";
    case "AssertionError":
      return raisedHere(e, sources) ?? "An assert line found its condition False. assert checks something that must be true at that point; the values aren't what the code expects.";
    case "StopIteration":
      return "next() was called after the iterator or generator had run out of items.";
    case "KeyboardInterrupt":
      return null;
    default:
      return raisedHere(e, sources);
  }
}

/** For an error the program raised on purpose (a raise line of its own), a note that says so. */
function raisedHere(e: PyError, sources: Source[]): string | null {
  const line = sourceLine(sources, e.file, e.line);
  if (/^\s*raise\b/.test(line)) return `The program raised this ${e.name} itself, with the raise on this line. That's what raise is for: it stops the function and reports the problem, unless code that called it catches the error with try and except.`;
  return null;
}

/**
 * The call that failed, as written: what it called (the part of the line Python marks with ~ just before
 * the ^ under the call's parentheses: len in print(len(x))), and its parentheses with what's in them.
 * Python leaves the marks out when the call is all there is after "name =" or "return"; then it's the
 * call there.
 */
function failedCall(e: PyError): { callee: string; args: string } | undefined {
  const f = e.frames[e.frames.length - 1];
  if (!f?.code) return undefined;
  if (f.marks) {
    const r = /^(\s*)(~+)(\^+)/.exec(f.marks);
    const callee = r && f.code.slice(r[1].length, r[1].length + r[2].length).trim();
    return r && callee ? { callee, args: f.code.slice(r[1].length + r[2].length, r[0].length) } : undefined;
  }
  const r = /^(?:return\s+|\w+\s*=\s*)\(*\s*([\w.]+)\s*(\(.*)$/.exec(f.code);
  return r ? { callee: r[1], args: r[2] } : undefined;
}

/**
 * The learner's code gives `name` a value that the line in `at` can see: with = (or +=), as a for loop's
 * variable, as a parameter, or after as in a with or an except. A value given in a function counts only on that
 * function's lines (a function inside it included), and comments and strings don't count. A test's own
 * code (in a file that isn't the learner's) runs at the top level of the program. An import doesn't
 * count: what it gives (reduce, sqrt) is nearly always a function or a class, so it's not to blame.
 */
function assigns(sources: Source[], name: string, at: Frame | undefined): boolean {
  const own = sources.find((s) => s.path === at?.file);
  return own ? assignsIn(own.text, name, at!.line - 1) : sources.some((s) => assignsIn(s.text, name, -1));
}

/** assigns for one file, seen from its line `line` (from 0; -1 for the top level). */
function assignsIn(text: string, name: string, line: number): boolean {
  // Strings and comments blanked out, so the lines stay where they are.
  const lines = text.replace(/("""|''')[\s\S]*?\1|(["'])(?:\\.|(?!\2)[^\\\n])*\2|#.*/g, (s) => s.replace(/[^\n]/g, " ")).split("\n");
  const indent = (l: string) => /^[ \t]*/.exec(l)![0].length;
  // Each def and class: its first line, its last, and whether it says global name (its values for name are then the file's).
  type Block = { from: number; to: number; def: boolean; global: boolean };
  const blocks: Block[] = [];
  lines.forEach((l, i) => {
    const r = /^([ \t]*)(?:async\s+)?(def|class)\b/.exec(l);
    if (!r) return;
    let to = i;
    for (let j = i + 1; j < lines.length && (!lines[j].trim() || indent(lines[j]) > r[1].length); j++) if (lines[j].trim()) to = j;
    const global = new RegExp(`^[ \\t]*global\\b.*\\b${name}\\b`, "m").test(lines.slice(i + 1, to + 1).join("\n"));
    blocks.push({ from: i, to, def: r[2] === "def", global });
  });
  const within = (i: number) => blocks.filter((b) => i > b.from && i <= b.to).pop();
  const here = within(line);
  // A function's values are seen in it and in the functions inside it; a class's only on its own lines.
  const sees = (b: Block | undefined) => !b || b === here || (b.def && (b.global || (line > b.from && line <= b.to)));
  const targets = `\\(?(?:\\w+\\s*,\\s*)*${name}(?:\\s*,\\s*\\w+)*\\)?`;
  const ways = [
    new RegExp(`^[ \\t]*(?:\\w+(?:\\s*,\\s*\\w+)*\\s*=(?!=)\\s*)*${targets}\\s*(?::[^=]*)?(?:[-+*/%@&|^]|//|\\*\\*|<<|>>)?=(?!=)`),
    new RegExp(`^[ \\t]*(?:async\\s+)?for\\s+${targets}\\s+in\\b`),
    new RegExp(`^[ \\t]*(?:async\\s+)?(?:with|except)\\b.*\\bas\\s+${name}\\b|\\b${name}\\s*:=`),
  ];
  const param = new RegExp(`^[ \\t]*(?:async\\s+)?def\\s+\\w+\\s*\\((?:[^)]*,)?\\s*\\*{0,2}${name}\\s*[,:=)]`);
  return lines.some((l, i) => (ways.some((w) => w.test(l)) && sees(within(i))) || (param.test(l) && sees(blocks.find((b) => b.from === i))));
}

/** The learner's files give objects an attribute `name`: self.name = ..., or name = ... in a class. */
function setsAttribute(sources: Source[], name: string): boolean {
  return sources.some((s) => new RegExp(`\\.${name}\\s*(?:[-+*/%]|//|\\*\\*)?=(?!=)`).test(s.text)) || classBodies(sources).some((c) => new RegExp(`^[ \\t]+${name}\\s*=(?!=)`, "m").test(c));
}

/** Each class in the learner's files: its class line and the lines under it (indented, blank or comments). */
function classBodies(sources: Source[]): string[] {
  return sources.flatMap((s) => [...s.text.matchAll(/^class\b.*(?:\n(?:[ \t]+.*|#.*)?)*/gm)].map((r) => r[0]));
}

/** "an int", "a str (text)": a type's name with an article, in words a beginner knows. */
function article(type: string, capital = false): string {
  const words: Record<string, string> = { int: "a whole number (int)", float: "a decimal number (float)", str: "a string (str)", list: "a list", dict: "a dictionary (dict)", tuple: "a tuple", set: "a set", NoneType: "None", bool: "a truth value (bool)", function: "a function", builtin_function_or_method: "a built-in function", range: "a range" };
  const w = words[type] ?? (/^[aeiou]/i.test(type) ? `an ${type}` : `a ${type}`);
  return capital ? w[0].toUpperCase() + w.slice(1) : w;
}

/**
 * The sentence the results show for a run that stopped with an error: where (the learner's file and
 * line, and the function), what Python calls it, and the plain-English note. `key` is the same for
 * runs that stopped the same way (the error and its note, not its line), and `short` stands in for the
 * whole sentence under a later test that stopped the same way.
 */
export function describeError(e: PyError, sources: Source[], options: { multiFile?: boolean } = {}): { text: string; key: string; short: string } {
  const own = e.frames.filter((f) => sources.some((s) => s.path === f.file));
  const at = e.syntax ? e : own[own.length - 1];
  const file = options.multiFile && at?.file ? `${at.file}, ` : "";
  const where = at?.line ? `${file}line ${at.line}` : "";
  const func = !e.syntax && own.length && own[own.length - 1].func && own[own.length - 1].func !== "<module>" ? `, in ${own[own.length - 1].func}` : "";
  const note = explainError(e, sources);
  const what = e.message ? `${e.name}: ${e.message.split("\n")[0]}` : e.name;
  const text = e.syntax
    ? `Python couldn't read the program: ${what}${where ? ` (${where})` : ""}.${note ? ` ${note}` : ""}`
    : `The program stopped with ${what}${where ? ` (${where}${func})` : ""}.${note ? ` ${note}` : ""}`;
  return { text, key: `${e.name}\n${note ?? e.message}`, short: `Stopped the same way as the test above (${e.name}${where ? `, ${where}` : ""}).` };
}
