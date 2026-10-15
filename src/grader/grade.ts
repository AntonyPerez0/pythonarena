// Checks a learner's program: run every test with Python in the browser (Pyodide), and compare with
// the expected output (which came from the reference CPython at build time, through the same harness).
import { runPython, DEFAULT_TIME_LIMIT_MS, type RunResult, type SourceFile } from "../engine/client";
import { describeError, explainError, parseError, type PyError } from "../engine/friendly";
import type { Exercise, TestCase } from "../content/types";
import { checkRules, normalizeOutput } from "./assemble.js";
import { MAIN_FILE, splitFiles } from "./files.js";
import { changedFiles, compareWrites, writesNote } from "./writes.js";

/** A syntax error, shown like a compiler's error: its place, Python's message and a plain-English note. */
export type FriendlyDiagnostic = {
  kind: "error";
  /** SyntaxError, IndentationError or TabError. */
  name: string;
  file: string;
  line: number;
  column: number;
  message: string;
  friendly: string | null;
};

export type TestResult = {
  name: string;
  pass: boolean;
  hidden?: boolean;
  stdin?: string;
  /** The command-line arguments the program got. */
  args?: string[];
  /** The test's own code, which ran after loading the program. */
  call?: string;
  /** Files the program could read in this test. */
  files?: Record<string, string>;
  /** Files the test wanted the program to write, each with what it should hold and what it holds (null: not created). */
  writes?: WrittenFileCheck[];
  expected?: string;
  got?: string;
  /** Why the run went wrong, in plain English (an error, the time limit, an exit code). */
  note?: string;
  /** What Python printed about the error (its traceback). */
  stderr?: string;
  /** What loading the program printed before a call test's code ran (it isn't graded). */
  loadOutput?: string;
  /**
   * When the run stopped with an error: the sentence as it is in `note`, a key that is the same for
   * tests that stopped the same way, and a short line that stands for it under a later test (see notesShown).
   */
  crash?: { text: string; key: string; short: string };
};

/** One file a test wanted written: its text as expected and as the program left it (normalized like output). */
export type WrittenFileCheck = { name: string; expected: string; got: string | null; pass: boolean };

export type GradeResult = {
  /** "syntax-error": Python couldn't read the program. "call-error": it loads, but the test couldn't call its functions. */
  status: "pass" | "fail" | "syntax-error" | "call-error" | "internal-error";
  diagnostics: FriendlyDiagnostic[];
  /** What Python printed for the syntax error. */
  errorOutput: string;
  tests: TestResult[];
  ruleProblems: string[];
  /** Why the test couldn't call the learner's code (status "call-error"). */
  callProblems: string[];
  internalError?: string;
  /** How long the runs took, in ms. */
  runMs: number;
  /** The program has several files, so each message names its file. */
  multiFile?: boolean;
};

/** A syntax error as a diagnostic, or null when the error isn't one. */
export function syntaxDiagnostic(e: PyError | null, sources: SourceFile[]): FriendlyDiagnostic | null {
  if (!e?.syntax || !e.line || !sources.some((s) => s.path === e.file)) return null;
  return { kind: "error", name: e.name, file: e.file!, line: e.line, column: e.column ?? 1, message: `${e.name}: ${e.message}`, friendly: explainError(e, sources) };
}

/** A sentence about what went wrong in a run, or undefined when it ended normally. */
export function describeRun(r: RunResult | undefined, sources: SourceFile[], limitMs = DEFAULT_TIME_LIMIT_MS): string | undefined {
  if (!r) return "This test didn't run.";
  if (r.internalError) return `Python couldn't run the program (${r.internalError}). Try again; if it keeps happening, reload the page.`;
  if (r.timedOut) return `Time limit: the program ran for more than ${limitMs / 1000} seconds and was stopped. Look for a loop that never ends${/\binput\s*\(/.test(sources.map((s) => s.text).join("\n")) ? " (with input from a test, a loop that waits for a word that never comes keeps reading until the input runs out)" : ""}. What it printed until then is shown.`;
  const crash = crashOf(r, sources);
  if (crash) return crash.text;
  if (r.truncated) {
    const self = selfCallingFunction(sources);
    if (self) return `The program printed more than 64 KB, so it was stopped. Probably a loop, or a function that keeps calling itself without reaching its base case (${self} calls itself), never stops printing.`;
    return "The program printed more than 64 KB, so it was stopped. Probably a loop that never stops printing.";
  }
  if (r.exitCode !== 0 && r.exitCode != null) return `The program ended with exit code ${r.exitCode} (sys.exit). A program that finishes normally ends with 0.`;
  if (r.stderr.trim()) return "The program printed an error message.";
  return undefined;
}

/** The sentence describeRun gives for a run that stopped with an error, with its key and short line (see TestResult.crash). */
export function crashOf(r: RunResult, sources: SourceFile[]): { text: string; key: string; short: string } | undefined {
  if (r.exitCode === 0 || r.timedOut) return undefined;
  const e = parseError(r.stderr);
  if (!e) return undefined;
  const d = describeError(e, sources, { multiFile: sources.length > 1 });
  // A call test whose program asked for input while it loaded: say where that code belongs.
  if (r.loadInput && e.name === "EOFError") {
    const text = "Your program asks for input when it's loaded, before the test calls your function. Code that tests your function by hand (and any input()) belongs under if __name__ == \"__main__\":, which the check skips.";
    return { text, key: "load-input", short: "Asked for input when loaded, as in the test above." };
  }
  return d;
}

/** The name of the first function in the learner's files that calls itself, or null. */
export function selfCallingFunction(sources: SourceFile[]): string | null {
  for (const f of sources) {
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)def\s+(\w+)\s*\(/.exec(lines[i]);
      if (!m) continue;
      const indent = m[1].length;
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() && (l.length - l.trimStart().length) <= indent) break;
        if (new RegExp(`(?:^|[^\\w.])(?:self\\.)?${m[2]}\\s*\\(`).test(l.replace(/#.*$/, ""))) return m[2];
      }
    }
  }
  return null;
}

/** Why a call test couldn't call the learner's code, in words (the error was in the test's own line). */
function callProblem(t: TestCase, r: RunResult, sources: SourceFile[]): string {
  const e = parseError(r.stderr);
  const call = (t.call ?? "").trim();
  if (e?.name === "NameError") {
    const name = /^name '(\w+)' is not defined/.exec(e.message)?.[1] ?? "";
    const suggestion = /Did you mean: '(\w+)'\?/.exec(e.message)?.[1];
    return `The test calls \`${name}\`, but your program doesn't define anything with that name${suggestion ? ` (did you mean to name it \`${name}\`, not \`${suggestion}\`?)` : ""}. Name your function (or class) exactly as the task says, at the top level of the file (not indented inside something else).`;
  }
  if (e?.name === "TypeError" && /takes \d+ positional arguments? but \d+ (?:was|were) given|missing \d+ required positional argument/.test(e.message))
    return `The test runs \`${call}\`, but ${e.message.replace(/^(\w+)\(\)/, "`$1()`")}. Give the def line exactly the parameters the task asks for.`;
  if (e?.name === "TypeError" && /object is not callable/.test(e.message)) return `The test runs \`${call}\`, but what it calls isn't a function: ${e.message}. Check that your function's name isn't also used for a variable.`;
  if (e?.name === "AttributeError") return `The test runs \`${call}\`, but ${e.message}. Name your methods and attributes exactly as the task says.`;
  if (e?.name === "ImportError" || e?.name === "ModuleNotFoundError") return `The test runs \`${call}\`, but ${e.message}. Check your file and function names.`;
  const note = e ? explainError(e, sources) : null;
  return `The test's own code \`${call}\` stopped with an error: ${e ? `${e.name}: ${e.message}` : r.stderr.trim()}.${note ? ` ${note}` : ""}`;
}

/** The files a challenge's tests give the program, as the engine takes them. */
const filesOf = (t: TestCase) => (t.files ? { ...t.files } : undefined);

export async function grade(ex: Exercise, code: string): Promise<GradeResult> {
  const own = splitFiles(code) as SourceFile[];
  const ruleProblems = checkRules(code, ex.require, ex.forbid) as string[];
  const base = { diagnostics: [] as FriendlyDiagnostic[], errorOutput: "", ruleProblems, callProblems: [] as string[], multiFile: own.length > 1, runMs: 0 };
  const inputs = ex.tests.map((t) => ({ stdin: t.stdin, ...(t.args ? { args: t.args } : {}), ...(t.call != null ? { call: t.call } : {}), ...(t.files ? { files: filesOf(t) } : {}) }));
  const started = performance.now();
  const runs = await runPython(own, inputs);
  base.runMs = performance.now() - started;
  if (runs.every((r) => r.internalError)) return { ...base, status: "internal-error", tests: [], internalError: runs[0]?.internalError };
  // A syntax error stops every run the same way: shown once, like a compiler's error.
  const first = runs.find((r) => !r.internalError);
  const syntax = first && first.exitCode !== 0 ? syntaxDiagnostic(parseError(first.stderr), own) : null;
  if (syntax) return { ...base, status: "syntax-error", diagnostics: [syntax], errorOutput: first!.stderr, tests: [] };
  // A call test that couldn't call the learner's code at all (no such function, wrong parameters).
  const callProblems = [...new Set(ex.tests.flatMap((t, i) => (runs[i]?.callError ? [callProblem(t, runs[i], own)] : [])))];
  if (callProblems.length) return { ...base, status: "call-error", callProblems, tests: [] };
  const tests = ex.tests.map((t, i): TestResult => {
    const r = runs[i];
    const got = r ? normalizeOutput(t.call != null && r.callStart != null ? r.stdout.slice(r.callStart) : r.stdout) : "";
    const writes: WrittenFileCheck[] | undefined = t.writes && r && !r.internalError && !r.timedOut ? compareWrites(t.writes, r.files) : undefined;
    const pass = !!r && !r.internalError && !r.timedOut && r.exitCode === 0 && got === t.expect && (!t.writes || !!writes?.every((f) => f.pass));
    const note = pass ? undefined : (describeRun(r, own) ?? (writes && writesNote(writes, t.hidden)));
    const crash = !pass && r && !r.internalError && !r.timedOut ? crashOf(r, own) : undefined;
    const loadOutput = t.call != null && r?.callStart ? normalizeOutput(r.stdout.slice(0, r.callStart)) : undefined;
    return {
      name: t.name,
      pass,
      hidden: t.hidden,
      stdin: t.stdin,
      ...(t.args ? { args: t.args } : {}),
      call: t.call,
      files: t.files,
      writes,
      expected: t.expect,
      got,
      note,
      ...(crash && note?.includes(crash.text) ? { crash } : {}),
      stderr: !pass && r?.stderr ? r.stderr : undefined,
      ...(loadOutput ? { loadOutput } : {}),
    };
  });
  const allPass = tests.every((t) => t.pass) && ruleProblems.length === 0;
  return { ...base, status: allPass ? "pass" : "fail", tests };
}

export type FreeRun = {
  status: "ran" | "syntax-error" | "internal-error";
  diagnostics: FriendlyDiagnostic[];
  errorOutput: string;
  run?: RunResult;
  /** The files the program created or changed in its folder (not the files it was given, unchanged). */
  written?: WrittenFile[];
  note?: string;
  internalError?: string;
  /** The program has several files, so each message names its file. */
  multiFile?: boolean;
};

/** A file a free run created or changed: its text, or its bytes when it isn't text. */
export type WrittenFile = { name: string; text?: string; bytes?: Uint8Array };

/** Run with the learner's own input (and any files the program reads), no grading. */
export async function runOnly(code: string, stdin: string, givenFiles?: Record<string, string>, options: { args?: string[] } = {}): Promise<FreeRun> {
  const own = splitFiles(code) as SourceFile[];
  const base = { diagnostics: [] as FriendlyDiagnostic[], errorOutput: "", multiFile: own.length > 1 };
  const [run] = await runPython(own, [{ stdin, ...(givenFiles ? { files: { ...givenFiles } } : {}), ...(options.args ? { args: options.args } : {}) }]);
  if (run?.internalError) return { ...base, status: "internal-error", internalError: run.internalError };
  const syntax = run && run.exitCode !== 0 ? syntaxDiagnostic(parseError(run.stderr), own) : null;
  if (syntax) return { ...base, status: "syntax-error", diagnostics: [syntax], errorOutput: run!.stderr, run };
  return { ...base, status: "ran", run, written: changedFiles(givenFiles, run?.files), note: describeRun(run, own) };
}

export type PredictResult = { pass: boolean; lines: { pass: boolean; got: string }[] };

/** "What does it print?": compares each typed line with the line the program really prints. */
export function gradePredict(ex: Exercise, answers: string[]): PredictResult {
  const want = ex.lines ?? [];
  const lines = want.map((w, i) => {
    const got = answers[i] ?? "";
    return { pass: got.trim() === w.trim(), got };
  });
  return { pass: lines.every((l) => l.pass), lines };
}

export { MAIN_FILE };
