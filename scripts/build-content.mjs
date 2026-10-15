// Builds src/generated/ (course.json, modules/<id>.json, projects/<id>.json, drills.json and
// topics.json) and public/lessons/ from content/course.yaml, content/modules/*.yaml,
// content/drills/*.yaml, content/placement.yaml, content/projects/*.yaml and content/topics.yaml.
//
// Every reference solution and every example program in the lessons is run with the reference
// CPython (exactly the version Pyodide runs in the browser), through the same harness the browser
// uses (src/engine/arena.py). The expected outputs the site grades against come from those real
// runs, or are checked against them where the author wrote them down, so nothing is hand-typed
// guesswork. Every solution runs twice, with two different hash seeds, and must print the same both
// times (so no output depends on the order of a set of strings, or on unseeded randomness). It also
// checks that starter code doesn't already pass, that every step has three challenges, and that
// solutions follow their own require/forbid rules.
//
// A project (content/projects/<id>.yaml) is one program built over several milestones: each
// milestone is checked like a challenge, starting from the previous milestone's model solution,
// and each model solution must still pass every earlier milestone's visible tests, except those
// a milestone names in `replaces`.
//
// It also writes fidelity/out/content-checks.json: every program with its inputs and CPython's
// results, which scripts/content-pyodide.mjs replays in Pyodide.
//
// Usage: node scripts/build-content.mjs [--no-cache] [--dry] [--module-file <name>.yaml] [--drill-file <name>.yaml] [--project-file <name>.yaml]
//   --dry          check only: write nothing (no cache, no generated files), so several checks can run at once
//   --module-file  check only this file of content/modules and its drills (with --dry, for writing a module)
//   --drill-file   check only this file of content/drills, or placement.yaml (with --dry)
//   --project-file check only this file of content/projects (with --dry)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import YAML from "yaml";
import { checkRules, normalizeOutput, parseTemplate, templateSolution } from "../src/grader/assemble.js";
import { MAIN_FILE, joinFiles, sourceNameProblem, splitFiles } from "../src/grader/files.js";
import { compareWrites, dataPathProblem } from "../src/grader/writes.js";
import { blockKindProblem } from "../src/components/code-blocks.ts";
import { checkTopics } from "./content/topics.mjs";
import { pythonPool, referencePython, runKey } from "./content/python.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE_FILE = path.join(ROOT, "node_modules", ".cache", "python-arena-content.json");
const GENERATED = path.join(ROOT, "src", "generated");
// Each step's lesson as a file of its own, fetched when the step is opened (public/ is served as is).
const LESSONS = path.join(ROOT, "public", "lessons");
const CHECKS_JSON = path.join(ROOT, "fidelity", "out", "content-checks.json");
const PROJECTS_DIR = path.join(ROOT, "content", "projects");
const PROJECT_LESSONS = "projects";
const CHALLENGES_PER_STEP = 3;

let python;
try {
  python = referencePython();
} catch (e) {
  console.error(`build-content: ${e.message}`);
  process.exit(1);
}
const pythonVersion = python.version;

const useCache = !process.argv.includes("--no-cache");
const dry = process.argv.includes("--dry");
const argOf = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null);
const drillFileArg = argOf("--drill-file");
const moduleFileArg = argOf("--module-file");
const projectFileArg = argOf("--project-file");
for (const [flag, value, example] of [
  ["--module-file", moduleFileArg, "04-arithmetic.yaml"],
  ["--drill-file", drillFileArg, "lists.yaml"],
  ["--project-file", projectFileArg, "text-adventure.yaml"],
])
  if (process.argv.includes(flag) && !/\.ya?ml$/.test(value ?? "")) {
    console.error(`${flag} needs a file name, such as ${example}.`);
    process.exit(2);
  }
if ((drillFileArg || moduleFileArg || projectFileArg) && !dry) {
  console.error("--drill-file, --module-file and --project-file check part of the content, so they need --dry.");
  process.exit(2);
}
if ([drillFileArg, moduleFileArg, projectFileArg].filter(Boolean).length > 1) {
  console.error("Use one of --drill-file, --module-file and --project-file at a time.");
  process.exit(2);
}

const CACHE_VERSION = 1;
let cache = {};
if (useCache && fs.existsSync(CACHE_FILE)) {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (c.version === CACHE_VERSION && c.python === pythonVersion) cache = c.entries;
  } catch {
    cache = {};
  }
}
const usedCache = {};
const pool = pythonPool({ exe: python.exe });
const errors = [];
const warnings = [];
const checks = []; // for the Pyodide replay
const t0 = Date.now();

// ---------------------------------------------------------------- running
/**
 * Runs a program with the harness: spec is arena.run's spec ({ files, main, stdin, given, args,
 * call, repl }). Results are cached by the spec, the interpreter and the harness. With `twice`, it
 * runs with both hash seeds and `stable` says whether the two runs printed the same and left the
 * same files.
 */
async function run(spec, { twice = false } = {}) {
  const once = async (seed) => {
    const key = runKey(spec, pythonVersion, seed);
    if (cache[key]) return (usedCache[key] = cache[key]);
    const r = await pool.run(spec, seed);
    // A run that timed out isn't cached: it may have been a busy machine.
    if (!r.timedOut) usedCache[key] = r;
    return r;
  };
  const a = await once(0);
  if (!twice) return { ...a, stable: true };
  const b = await once(1);
  const stable = a.output === b.output && JSON.stringify(a.files) === JSON.stringify(b.files) && a.exit === b.exit;
  return { ...a, stable };
}

/** The spec for a program (one string, with file markers for several files) and one test's inputs. */
function specOf(code, t = {}) {
  const files = Object.fromEntries(splitFiles(code).map((f) => [f.path, f.text]));
  return { files, main: MAIN_FILE, stdin: t.stdin ?? "", given: t.files ?? {}, args: t.args ?? [], call: t.call ?? null };
}

/** What a call test's call printed: stdout after what loading the program printed. */
const callOutput = (r) => (r.callStart == null ? r.stdout : r.stdout.slice(r.callStart));

/** The output a test grades: the call's for a call test, else everything the program printed to stdout. */
const graded = (r, t) => normalizeOutput(t.call != null ? callOutput(r) : r.stdout);

// ---------------------------------------------------------------- helpers
function readYaml(file) {
  try {
    return YAML.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${path.relative(ROOT, file)}: YAML error: ${e.message}`);
    return null;
  }
}

// Text ends with exactly one line break, except that an empty last line typed on purpose (input that
// ends with an empty line, written with YAML's |+ or a quoted "\n\n") is kept.
const ensureNl = (s) => (s == null ? s : String(s).replace(/\s*$/, "") + (/\n[ \t]*\n\s*$/.test(String(s)) ? "\n\n" : "\n"));
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const KEYS = {
  module: ["id", "summary", "steps"],
  step: ["id", "slug", "title", "text", "fill", "seed", "solution", "predict", "hints", "tests", "require", "forbid", "seedMayPass", "more"],
  challenge: ["task", "fill", "seed", "solution", "predict", "hints", "tests", "require", "forbid", "seedMayPass"],
  rule: ["pattern", "flags", "message", "min", "max", "raw"],
  test: ["name", "stdin", "args", "call", "files", "writes", "expect", "hidden"],
  drillFile: ["topic", "drills"],
  project: ["id", "title", "after", "summary", "intro", "seed", "milestones"],
  milestone: ["id", "title", "task", "files", "hints", "tests", "require", "forbid", "solution", "replaces"],
  drill: ["id", "type", "prompt", "code", "stdin", "answer", "expect", "fix", "choices", "runs", "verify", "why", "after", "seed", "solution", "hints", "tests", "require", "forbid", "module"],
};
function checkKeys(where, obj, kind) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    errors.push(`${where}: expected a ${kind} (a set of keys)`);
    return;
  }
  for (const k of Object.keys(obj)) if (!KEYS[kind].includes(k)) errors.push(`${where}: unknown ${kind} key "${k}" (allowed: ${KEYS[kind].join(", ")})`);
}

function checkRuleShape(where, list, kind) {
  if (!Array.isArray(list)) {
    errors.push(`${where}: ${kind} must be a list of rules`);
    return;
  }
  for (const r of list) {
    checkKeys(`${where} ${kind} rule`, r, "rule");
    if (!r || typeof r.pattern !== "string" || typeof r.message !== "string") errors.push(`${where}: each ${kind} rule needs a pattern and a message`);
    else {
      try {
        new RegExp(r.pattern, r.flags ?? "");
      } catch (e) {
        errors.push(`${where}: bad ${kind} pattern ${r.pattern}: ${e.message}`);
      }
      if (kind === "forbid" && (r.min != null || r.max != null)) errors.push(`${where}: forbid rules can't have min or max`);
      // Safari before 16.4 can't read a lookbehind, and the check would fail there.
      if (/\(\?<[=!]/.test(r.pattern)) errors.push(`${where}: ${kind} pattern ${r.pattern} uses a lookbehind, which older Safari can't read; match the text before it instead`);
    }
  }
}

/**
 * A program given in YAML: text (main.py), or a map of file names to their text, such as
 * { main.py: ..., helpers.py: ... }, which becomes one string with file markers. main.py is the
 * file Python starts; the others are modules it imports.
 */
function codeOf(where, value) {
  if (value == null || typeof value === "string") return ensureNl(value ?? "");
  if (typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${where}: code must be text, or a map of file names to text`);
    return "";
  }
  const files = Object.entries(value).map(([p, text]) => ({ path: p, text: ensureNl(String(text ?? "")) }));
  for (const f of files) {
    const problem = f.path === MAIN_FILE ? null : sourceNameProblem(f.path);
    if (problem) errors.push(`${where}: "${f.path}" ${problem}`);
  }
  if (!files.some((f) => f.path === MAIN_FILE)) errors.push(`${where}: a program of several files needs a ${MAIN_FILE} (the file Python starts)`);
  return joinFiles(files);
}

/** Tabs and lines that don't parse: Python itself says so when the program runs; here a tab is an error before that. */
function tabProblems(code) {
  return splitFiles(code).flatMap((f) => (/^\t/m.test(f.text) ? [`${f.path} indents with a tab; lessons indent with 4 spaces`] : []));
}

/** True when Markdown text has something that looks like an HTML tag or comment outside code. */
const htmlLike = (text) => /<[a-zA-Z!\/?]/.test(String(text).replace(/```[\s\S]*?```/g, "").replace(/(`+)[\s\S]*?\1/g, ""));

/** The hints of a challenge: a list of Markdown text. YAML reads an unquoted ": " as a key, which is caught here. */
function checkHints(where, hints) {
  if (!Array.isArray(hints) || hints.length === 0) return void errors.push(`${where}: needs a list of hints`);
  hints.forEach((h, i) => {
    if (typeof h !== "string") errors.push(`${where}: hint ${i + 1} isn't plain text (quote it: a ": " inside makes YAML read it as a key and value)`);
  });
}

// ---------------------------------------------------------------- worked examples in lesson text
/**
 * Every ```python block in lesson text must say what it is:
 *   ```python run       a complete program; it's run. An ```input block right after it is what it
 *                       reads (typed lines, echoed in the output as a terminal shows them); an
 *                       ```output block after that must be exactly what it prints.
 *   ```python run crash a program that stops with an error. Its ```input and ```output blocks are
 *                       optional; a ```crash block after them must be exactly what Python prints
 *                       (the traceback, or a syntax error's message).
 *   ```python repl      a session of the interactive interpreter: `>>> ` lines (and `... ` for the
 *                       lines that continue a statement), each followed by what it prints. Every
 *                       statement is run and what it prints must be exactly what's shown.
 *   ```python fragment  code that can't run on its own (part of a program); shown only, but it must
 *                       still be valid Python unless it's marked `python fragment partial`.
 *   ```file data.txt    a file that the next ```python run example reads (shown with its name).
 * A ```python run example can hold several files: each one after the first starts with a line such
 * as `# ==== helpers.py ====` (the page shows it as the file's name).
 * Returns the text with plain ```python info strings (```pycon for a REPL session).
 */
async function checkExamples(where, text) {
  if (!text) return text;
  const blocks = [...text.matchAll(/^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm)];
  for (let i = 0; i < blocks.length; i++) {
    const info = blocks[i][1].trim();
    const kindProblem = blockKindProblem(info);
    if (kindProblem) errors.push(`${where}, example ${i + 1}: ${kindProblem}`);
    if (!/^python\b/.test(info)) continue;
    const [, kind, extra, ...rest] = info.split(/\s+/);
    const code = blocks[i][2];
    const w = `${where}, example ${i + 1}`;
    if (!["run", "repl", "fragment"].includes(kind) || (extra && !((kind === "run" && extra === "crash") || (kind === "fragment" && extra === "partial"))) || rest.length) {
      errors.push(`${w}: a python block must be "python run", "python run crash", "python repl", "python fragment" or "python fragment partial"`);
      continue;
    }
    for (const m of tabProblems(code)) errors.push(`${w}: ${m}`);
    if (kind === "fragment") {
      if (!extra) {
        const r = await run({ files: { "main.py": "import ast\nast.parse(open('frag.py').read())\n" }, main: "main.py", stdin: "", given: { "frag.py": code }, args: [], call: null });
        if (r.exit !== 0) errors.push(`${w}: a "python fragment" must still be valid Python (mark it "python fragment partial" if it's only part of a statement):\n${r.stderr}`);
      }
      continue;
    }
    if (kind === "repl") {
      await checkRepl(w, code);
      continue;
    }
    const crash = extra === "crash";
    const hasInput = blocks[i + 1]?.[1].trim() === "input";
    const stdin = hasInput ? blocks[i + 1][2] : "";
    const files = exampleFiles(w, blocks, i);
    const spec = specOf(code, { stdin, ...(files ? { files } : {}) });
    for (const f of Object.keys(spec.files)) if (f !== MAIN_FILE && sourceNameProblem(f)) errors.push(`${w}: "${f}" ${sourceNameProblem(f)}`);
    const r = await run(spec, { twice: true });
    if (!r.stable) errors.push(`${w}: prints something different on each run (the order of a set of strings, or randomness without random.seed); lessons need output that is the same every time`);
    if (crash) {
      if (r.timedOut || r.exit === 0) errors.push(`${w}: marked "python run crash", but it ${r.timedOut ? "times out" : "ends normally"}`);
    } else {
      if (r.timedOut || r.exit !== 0) errors.push(`${w}: ${r.timedOut ? "times out" : `stops with an error:\n${r.stderr}`}`);
      else if (r.stderr) errors.push(`${w}: printed an error:\n${r.stderr}`);
    }
    let next = i + (hasInput ? 2 : 1);
    const out = blocks[next];
    if (out && out[1].trim() === "output") {
      next++;
      if (normalizeOutput(out[2]) !== normalizeOutput(r.stdout)) errors.push(`${w}: the output block says\n${out[2]}\nbut it prints\n${r.stdout}`);
    } else if (normalizeOutput(r.stdout) && !crash) warnings.push(`${w}: prints something but has no output block`);
    if (!crash && blocks[next]?.[1].trim() === "crash") errors.push(`${w}: a crash block follows it, but only a "python run crash" example is checked against one`);
    if (crash) {
      const shown = blocks[next];
      if (!shown || shown[1].trim() !== "crash") errors.push(`${w}: a "python run crash" block needs a crash block after it (and after its output block), with what Python prints:\n${r.stderr}`);
      else if (normalizeOutput(shown[2]) !== normalizeOutput(r.stderr)) errors.push(`${w}: the crash block says\n${shown[2]}\nbut Python prints\n${r.stderr}`);
    }
    checks.push({ where: w, spec, stdout: r.stdout, stderr: r.stderr, exit: r.exit });
  }
  return text.replace(/^```python[ \t]+(run|fragment)([ \t]+(crash|partial))?[ \t]*$/gm, "```python").replace(/^```python[ \t]+repl[ \t]*$/gm, "```pycon");
}

/**
 * A ```python repl block: statements after `>>> ` (continued on `... ` lines), each followed by the
 * lines it prints. Runs them in one session and compares what each printed.
 */
async function checkRepl(w, code) {
  const statements = [];
  for (const line of code.replace(/\n$/, "").split("\n")) {
    if (line.startsWith(">>> ") || line === ">>>") statements.push({ source: [line.slice(4)], shown: [] });
    else if ((line.startsWith("... ") || line === "...") && statements.length && !statements.at(-1).shown.length) statements.at(-1).source.push(line.slice(4));
    else if (statements.length) statements.at(-1).shown.push(line);
    else return void errors.push(`${w}: a python repl block starts with a >>> line`);
  }
  if (!statements.length) return void errors.push(`${w}: a python repl block needs >>> lines`);
  // A compound statement ends with an empty "..." line, as in the interpreter.
  const sources = statements.map((s) => s.source.join("\n").replace(/\n+$/, "") + "\n");
  const r = await run({ files: {}, main: MAIN_FILE, stdin: "", given: {}, args: [], call: null, repl: sources }, { twice: true });
  if (!r.stable) errors.push(`${w}: prints something different on each run (the order of a set of strings, or randomness without random.seed)`);
  if (r.timedOut || !r.repl || r.repl.length !== sources.length) return void errors.push(`${w}: the session didn't run to the end${r.timedOut ? " (it timed out)" : ""}`);
  let from = 0;
  statements.forEach((s, i) => {
    const got = normalizeOutput(r.output.slice(from, r.repl[i]));
    from = r.repl[i];
    const want = normalizeOutput(s.shown.join("\n"));
    if (got !== want) errors.push(`${w}: after >>> ${s.source[0]} the block shows\n${want || "(nothing)"}\nbut Python prints\n${got || "(nothing)"}`);
  });
}

/** The ```file blocks since the previous python block: files the example at block i reads, or null. */
function exampleFiles(w, blocks, i) {
  let files = null;
  for (let j = i - 1; j >= 0 && !/^python\b/.test(blocks[j][1].trim()); j--) {
    const f = /^file\s+(\S+)$/.exec(blocks[j][1].trim());
    if (!f) continue;
    if (dataPathProblem(f[1])) errors.push(`${w}: the file block's name "${f[1]}" ${dataPathProblem(f[1])}`);
    else (files ??= {})[f[1]] = blocks[j][2];
  }
  return files;
}

// ---------------------------------------------------------------- exercises
/**
 * A "What does it print?" challenge: the learner reads `predict` (a complete program) and types each
 * line it prints. The answers are the program's real output.
 */
async function buildPredict(where, raw, hints) {
  const program = codeOf(where, raw.predict);
  for (const k of ["seed", "solution", "fill", "tests", "require", "forbid"]) if (raw[k] != null) errors.push(`${where}: a predict challenge can't have ${k}`);
  for (const m of tabProblems(program)) errors.push(`${where}: ${m}`);
  const spec = specOf(program);
  const r = await run(spec, { twice: true });
  if (r.timedOut || r.exit !== 0 || r.stderr) errors.push(`${where}: the program fails: exit ${r.exit}\n${r.stderr}`);
  if (!r.stable) errors.push(`${where}: the program prints something different on each run`);
  const out = normalizeOutput(r.stdout);
  const lines = out ? out.split("\n") : [];
  if (lines.length === 0 || lines.length > 8) errors.push(`${where}: a predict program should print 1 to 8 lines (it prints ${lines.length})`);
  if (lines.some((l) => !l.trim())) errors.push(`${where}: a predict program shouldn't print empty lines`);
  checks.push({ where, spec, stdout: r.stdout, stderr: r.stderr, exit: r.exit });
  return { kind: "predict", seed: program, solution: program, hints, tests: [{ name: "Output", stdin: "", expect: out, hidden: false }], require: [], forbid: [], lines };
}

/** Whether a run passes a built test (as the browser's grader decides it). */
function passes(t, r) {
  return !r.timedOut && r.exit === 0 && !r.callError && graded(r, t) === t.expect && (!t.returns || r.callValue === "value") && (!t.writes || compareWrites(t.writes, r.files).every((f) => f.pass));
}

/**
 * Verifies one challenge and returns the shape the app uses. A challenge is either a fill-in
 * (`fill`: a program with [[blanks]]), a code challenge (`seed`: starter code, `solution`), or a
 * predict challenge. `startName` names the code the learner starts from in messages: "the starter
 * code" in a lesson, the previous milestone's model solution in a project.
 */
async function buildExercise(where, raw, { startName = null } = {}) {
  const hints = raw.hints ?? [];
  checkHints(where, hints);
  if (raw.predict != null) return buildPredict(where, raw, hints);
  const kind = raw.fill != null ? "fill" : "code";
  if (kind === "code" && raw.seed == null) errors.push(`${where}: needs fill, or seed and solution`);
  if (kind === "fill" && typeof raw.fill !== "string") errors.push(`${where}: a fill challenge is one file of text`);
  const seed = kind === "fill" ? ensureNl(raw.fill) : codeOf(`${where} seed`, raw.seed);
  const solution = kind === "fill" ? ensureNl(templateSolution(raw.fill)) : raw.solution == null ? "" : codeOf(`${where} solution`, raw.solution);
  if (kind === "code" && raw.seed != null && splitFiles(seed).map((f) => f.path).join() !== splitFiles(solution).map((f) => f.path).join())
    errors.push(`${where}: ${startName ?? "the seed"} and the solution must have the same files, in the same order (${splitFiles(seed).map((f) => f.path).join(", ")} and ${splitFiles(solution).map((f) => f.path).join(", ")})`);
  if (!solution.trim()) {
    errors.push(`${where}: missing solution`);
    return null;
  }
  if (kind === "fill") {
    const { blanks } = parseTemplate(raw.fill);
    if (blanks.length === 0) errors.push(`${where}: fill challenge has no [[blanks]]`);
    if (blanks.some((b) => !b.answer.trim())) errors.push(`${where}: a blank has an empty answer`);
  }
  for (const m of tabProblems(solution)) errors.push(`${where}: the solution: ${m}`);
  const require = raw.require ?? [];
  const forbid = raw.forbid ?? [];
  checkRuleShape(where, require, "require");
  checkRuleShape(where, forbid, "forbid");
  const ruleProblems = checkRules(solution, require, forbid);
  if (ruleProblems.length) errors.push(`${where}: the solution breaks its own rules: ${ruleProblems.join("; ")}`);

  const testsRaw = raw.tests?.length ? raw.tests : [{}];
  for (const t of testsRaw) checkKeys(`${where} test`, t, "test");
  if (testsRaw.every((t) => t.hidden)) errors.push(`${where}: at least one test must be visible`);
  if (testsRaw.some((t) => t.stdin || t.call) && testsRaw.length > 1 && !testsRaw.some((t) => t.hidden)) warnings.push(`${where}: has input or calls but no hidden test`);
  const built = testsRaw.map((t, i) => {
    const n = `${where} test ${i + 1}`;
    const out = {};
    if (t.call != null) {
      if (typeof t.call !== "string" || !t.call.trim()) errors.push(`${n}: a test's call must be Python code (as text)`);
      else out.call = ensureNl(t.call);
    }
    if (t.args != null) {
      if (!Array.isArray(t.args) || t.args.some((a) => typeof a !== "string" && typeof a !== "number")) errors.push(`${n}: args must be a list of text, such as [--name=Ada, extra]`);
      else if (t.call != null) errors.push(`${n}: a test with call loads the program as a module, so it can't have args`);
      else out.args = t.args.map(String);
    }
    // Typed input ends with Enter, so every input line ends with a line break.
    out.stdin = t.stdin == null || t.stdin === "" ? "" : ensureNl(String(t.stdin));
    if (t.files != null) {
      if (typeof t.files !== "object" || Array.isArray(t.files) || Object.keys(t.files).some((f) => dataPathProblem(f))) errors.push(`${n}: files must be a map of plain file names (like scores.txt, or data/scores.txt in a folder) to their text`);
      else out.files = Object.fromEntries(Object.entries(t.files).map(([f, v]) => [f, String(v ?? "")]));
    }
    if (t.writes != null) {
      const isMap = typeof t.writes === "object" && !Array.isArray(t.writes);
      const names = Array.isArray(t.writes) ? t.writes : isMap ? Object.keys(t.writes) : [];
      if (!names.length || names.some((f) => typeof f !== "string" || dataPathProblem(f))) errors.push(`${n}: writes must be a list of file names (like [summary.txt]), or a map of file names to the text they must hold`);
      else out.writesAsked = { names, want: isMap ? Object.fromEntries(names.map((f) => [f, String(t.writes[f] ?? "")])) : null };
    }
    return out;
  });
  const runs = await Promise.all(built.map((b) => run(specOf(solution, b), { twice: true })));
  const tests = testsRaw.map((t, i) => {
    const r = runs[i];
    const b = built[i];
    const n = `${where} test ${i + 1}`;
    if (r.timedOut) errors.push(`${n}: the solution timed out`);
    else if (r.exit !== 0) errors.push(`${n}: the solution stops with an error (exit ${r.exit}):\n${r.stderr}`);
    else if (r.stderr) errors.push(`${n}: the solution printed an error:\n${r.stderr}`);
    if (!r.stable) errors.push(`${n}: the solution prints something different on each run (the order of a set of strings, or randomness without random.seed)`);
    if (b.call && r.callStart) errors.push(`${n}: the solution prints something when it's loaded, before the test's call; code that tests a function belongs under if __name__ == "__main__":`);
    const actual = graded(r, b);
    if (t.expect != null && normalizeOutput(String(t.expect)) !== actual) errors.push(`${n}: expected\n${t.expect}\nbut the solution prints\n${actual}`);
    let writes = null;
    if (b.writesAsked && !r.timedOut) {
      writes = {};
      for (const f of b.writesAsked.names) {
        const got = r.files[f];
        if (got == null) errors.push(`${n}: the solution doesn't write ${f} (it leaves ${Object.keys(r.files).join(", ") || "no files"})`);
        else if (typeof got !== "string") errors.push(`${n}: ${f} isn't text`);
        else if (b.writesAsked.want && normalizeOutput(b.writesAsked.want[f]) !== normalizeOutput(got)) errors.push(`${n}: ${f} should hold\n${b.writesAsked.want[f]}\nbut the solution writes\n${got}`);
        else if (b.files?.[f] === got) errors.push(`${n}: ${f} is given to the program and the solution leaves it as it was, so writes can't check it`);
        else writes[f] = got;
      }
    }
    if (!actual && !writes) errors.push(`${n}: the solution prints nothing`);
    const call = b.call;
    const name = t.name ?? (call && !call.trim().includes("\n") ? call.trim() : testsRaw.length > 1 ? `Test ${i + 1}` : writes ? (actual ? "Output and files" : "Files") : "Output");
    return { name, stdin: b.stdin, ...(b.args ? { args: b.args } : {}), ...(call ? { call } : {}), ...(b.files ? { files: b.files } : {}), ...(writes ? { writes } : {}), expect: actual, hidden: !!t.hidden, ...(call && r.callValue === "value" ? { returns: true } : {}) };
  });
  tests.forEach((t, i) => checks.push({ where: `${where} test ${i + 1}`, spec: specOf(solution, t), stdout: runs[i].stdout, stderr: runs[i].stderr, exit: runs[i].exit, ...(t.writes ? { files: runs[i].files } : {}) }));

  // Starter code must not already pass, or the challenge would be free.
  if (kind === "code" && seed && !raw.seedMayPass) {
    const sr = await Promise.all(tests.map((t) => run(specOf(seed, t))));
    if (tests.every((t, i) => passes(t, sr[i])) && checkRules(seed, require, forbid).length === 0) errors.push(`${where}: ${startName ?? "the starter code"} already passes`);
  }
  // A fill-in with all its blanks empty must not pass either.
  if (kind === "fill") {
    const empty = parseTemplate(raw.fill).parts.join("");
    const er = await Promise.all(tests.map((t) => run(specOf(empty, t))));
    if (tests.every((t, i) => passes(t, er[i])) && checkRules(empty, require, forbid).length === 0) errors.push(`${where}: the program passes with every blank left empty`);
  }
  return { kind, seed, solution, hints, tests, require, forbid };
}

/**
 * The expected output a task shows (its last plain ``` block) must be exactly what the test the task
 * card shows prints: the first visible test that writes files, or else the first visible test.
 */
function checkTaskOutput(where, task, ex) {
  if (!ex || ex.kind === "predict" || typeof task !== "string") return;
  const blocks = [...task.matchAll(/^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm)].filter((b) => !b[1].trim());
  const shown = ex.tests.find((t) => !t.hidden && t.writes) ?? ex.tests.find((t) => !t.hidden && t.expect);
  if (!blocks.length || !shown?.expect) return;
  const block = blocks[blocks.length - 1][2];
  const norm = (x) => normalizeOutput(x).trim();
  if (norm(block) !== norm(shown.expect)) errors.push(`${where}: the task shows the output\n${block}but the test the task card shows (${shown.writes ? "the first visible one with writes" : "the first visible one"}) prints\n${shown.expect}`);
}

// ---------------------------------------------------------------- modules
const course = readYaml(path.join(ROOT, "content", "course.yaml"));
if (!course?.modules) {
  console.error("content/course.yaml is missing or has no modules");
  process.exit(1);
}
const planned = new Map(course.modules.map((m, i) => [m.id, { ...m, number: i + 1 }]));
// An extra module (course: extra) is Python Arena's own, not part of the MOOC: it has no MOOC part or
// sections, and the extras come after the course.
{
  let extraSeen = null;
  for (const m of planned.values()) {
    if (!["I", "II", "extra"].includes(m.course)) errors.push(`content/course.yaml module ${m.id}: course must be I, II or extra`);
    if (!KEBAB.test(m.id)) errors.push(`content/course.yaml module ${m.id}: the id must be kebab-case`);
    if (m.course === "extra") {
      if (m.part != null || m.mooc != null) errors.push(`content/course.yaml module ${m.id}: an extra module is not part of the MOOC, so it has no part or mooc sections`);
      extraSeen ??= m.id;
    } else if (extraSeen) errors.push(`content/course.yaml module ${m.id}: the extra modules come after the course (${extraSeen} is an extra before it)`);
  }
}

async function buildStep(file, m, s, i, slugs, ids) {
  const where = `${file} step ${i + 1} (${s?.title ?? "untitled"})`;
  checkKeys(where, s, "step");
  if (typeof s?.title !== "string" || !s.title) errors.push(`${where}: title must be a non-empty string (quote it)`);
  // Saved progress is keyed by step id, so ids are explicit: a position-based id would shift when a step is inserted.
  if (!s?.id || !KEBAB.test(s.id)) errors.push(`${where}: needs an id in kebab-case (progress is saved by id)`);
  if (ids.has(s.id)) errors.push(`${where}: duplicate step id ${s.id}`);
  ids.add(s.id);
  const slug = s.slug ?? slugify(s.title ?? "");
  if (!KEBAB.test(slug)) errors.push(`${where}: bad slug ${slug}`);
  if (slugs.has(slug)) errors.push(`${where}: duplicate slug ${slug} in module ${m.id}`);
  slugs.add(slug);
  for (const k of ["text", "title", "slug", "id"]) if (s?.[k] != null && typeof s[k] !== "string") errors.push(`${where}: ${k} must be text (quote it)`);
  // The "**Your turn:**" paragraph and everything after it is the task, shown in its own card.
  const full = typeof s.text === "string" ? s.text : "";
  const at = full.indexOf("**Your turn:**");
  if (at < 0) errors.push(`${where}: the text needs a "**Your turn:**" paragraph (the task)`);
  const text = await checkExamples(where, at < 0 ? full : full.slice(0, at).trimEnd() + "\n");
  const rest = full.slice(at + "**Your turn:**".length).trim();
  const task = at < 0 ? "" : await checkExamples(`${where} task`, rest.charAt(0).toUpperCase() + rest.slice(1) + "\n");
  const more = s.more ?? [];
  if (more.length + 1 !== CHALLENGES_PER_STEP) errors.push(`${where}: has ${more.length + 1} challenges; every step has ${CHALLENGES_PER_STEP} (the step's own plus ${CHALLENGES_PER_STEP - 1} under "more")`);
  const ex = await buildExercise(`${where} challenge 1`, s);
  checkTaskOutput(`${where} challenge 1`, task, ex);
  const extra = await Promise.all(
    more.map(async (c, k) => {
      const w = `${where} challenge ${k + 2}`;
      checkKeys(w, c, "challenge");
      if (typeof c?.task !== "string" || !c.task) errors.push(`${w}: needs a task (as text)`);
      const cx = await buildExercise(w, c);
      checkTaskOutput(w, c.task, cx);
      return cx && { task: await checkExamples(w, String(c.task ?? "").trim() + "\n"), ...cx };
    }),
  );
  if (!ex) return null;
  return { id: s.id, slug, title: s.title, text, task, ...ex, more: extra.filter(Boolean) };
}

async function buildModules() {
  const dir = path.join(ROOT, "content", "modules");
  const files = (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort() : []).filter((f) => !moduleFileArg || f === moduleFileArg);
  if (moduleFileArg && !files.length) errors.push(`--module-file: no content/modules/${moduleFileArg}`);
  const ids = new Set();
  const out = [];
  const built = await Promise.all(
    files.map(async (name) => {
      const file = `content/modules/${name}`;
      const data = readYaml(path.join(dir, name));
      if (!data) return null;
      checkKeys(file, data, "module");
      const plan = planned.get(data.id);
      if (!plan) return void errors.push(`${file}: module ${data.id} is not in content/course.yaml`);
      if (!name.startsWith(String(plan.number).padStart(2, "0") + "-")) errors.push(`${file}: the file name should start with ${String(plan.number).padStart(2, "0")}- (its place in the course)`);
      if (typeof data.summary !== "string" || !data.summary) errors.push(`${file}: needs a summary (as text)`);
      if (!Array.isArray(data.steps) || data.steps.length === 0) return void errors.push(`${file}: needs steps`);
      if (data.steps.length !== plan.steps) warnings.push(`${file}: ${data.steps.length} steps, the plan says ${plan.steps}`);
      const slugs = new Set();
      const steps = (await Promise.all(data.steps.map((s, i) => buildStep(file, plan, s, i, slugs, ids)))).filter(Boolean);
      return { id: plan.id, number: plan.number, title: plan.title, course: plan.course, part: plan.part ?? null, mooc: plan.mooc ?? [], summary: String(data.summary ?? ""), steps };
    }),
  );
  for (const m of built) if (m) out.push(m);
  return out;
}

// ---------------------------------------------------------------- drills
/**
 * Deathmatch drills: content/drills/<module id>.yaml, and interview-*.yaml (topic: interview).
 * `code` is the program the learner sees, and the build runs it:
 *   predict   the answer is what the program really prints
 *   fill      one [[blank]]; the program with the answer must run, and its output is shown
 *   bug       one line marked # BUG and a `fix`; the fixed program must run and behave differently
 *   runs      the answer (yes or no) is whether it runs without an error
 *   choice    2 to 4 choices; code shown must run (unless `runs: false`), and with
 *             `verify: output` the right choice must be exactly what it prints
 *   boss      a real coding challenge, checked like a lesson challenge
 * A drill unlocks when the learner finishes the step `after` names (a slug or id in its module),
 * or the module's last step when it names none. Interview drills are always open.
 */
const DRILL_TYPES = ["predict", "fill", "bug", "runs", "choice", "boss"];

/** The last line of a traceback: the error and its message. */
const lastErrorLine = (stderr) => (stderr ?? "").trim().split("\n").at(-1) ?? "";

async function runDrill(where, program, stdin) {
  for (const m of tabProblems(program)) errors.push(`${where}: ${m}`);
  const spec = specOf(program, { stdin });
  const r = await run(spec, { twice: true });
  if (r.timedOut || r.exit !== 0 || r.stderr) {
    errors.push(`${where}: the program fails (exit ${r.exit}):\n${r.stderr}`);
    return null;
  }
  if (!r.stable) errors.push(`${where}: the program prints something different on each run`);
  checks.push({ where, spec, stdout: r.stdout, stderr: r.stderr, exit: r.exit });
  return normalizeOutput(r.stdout);
}

async function buildDrill(where, id, topic, d, moduleSteps) {
  checkKeys(where, d, "drill");
  if (!DRILL_TYPES.includes(d?.type)) {
    errors.push(`${where}: type must be one of ${DRILL_TYPES.join(", ")}`);
    return null;
  }
  // Which step unlocks it: named by slug or id, or the module's last step.
  let after;
  if (moduleSteps) {
    const step = d.after == null ? moduleSteps[moduleSteps.length - 1] : moduleSteps.find((s) => s.slug === d.after || s.id === d.after);
    if (!step) errors.push(`${where}: after: no step ${d.after} in module ${topic}`);
    after = step?.id;
  } else if (d.after != null) errors.push(`${where}: interview drills are always open, so they can't have after`);
  if (d.why != null && typeof d.why !== "string") errors.push(`${where}: why must be text (quote it)`);
  if (!d.why && d.type !== "runs" && d.type !== "boss") errors.push(`${where}: needs an explanation (why)`);
  // Drill text is Markdown, where <tag> or <!-- --> outside backticks would be read as HTML and vanish.
  for (const [key, text] of [["prompt", d.prompt], ["why", d.why], ...(d.choices ?? []).map((c, i) => [`choice ${i + 1}`, c])])
    if (typeof text === "string" && htmlLike(text)) errors.push(`${where}: ${key} has text that Markdown reads as HTML; put it in backticks: ${text}`);
  const base = { id, topic, type: d.type, why: d.why ?? "", ...(after ? { after } : {}) };
  const display = d.code ? String(d.code).replace(/\s*$/, "") : "";
  const stdin = d.stdin == null || d.stdin === "" ? "" : ensureNl(String(d.stdin));
  switch (d.type) {
    case "predict": {
      const answer = await runDrill(where, display + "\n", stdin);
      if (answer == null) return null;
      if (!answer) errors.push(`${where}: prints nothing`);
      if (answer.split("\n").length > 4) errors.push(`${where}: prints ${answer.split("\n").length} lines; keep predict drills to 4`);
      if (d.answer != null && normalizeOutput(String(d.answer)) !== answer) errors.push(`${where}: the answer says\n${d.answer}\nbut the program prints\n${answer}`);
      return { ...base, prompt: d.prompt ?? "What does this print?", display, answer, ...(stdin ? { stdin } : {}) };
    }
    case "fill": {
      const { blanks } = parseTemplate(display);
      if (blanks.length !== 1 || !blanks[0].answer.trim()) {
        errors.push(`${where}: a fill drill needs exactly one [[blank]] with an answer`);
        return null;
      }
      const output = await runDrill(where, templateSolution(display) + "\n", stdin);
      if (output == null) return null;
      if (!output) errors.push(`${where}: the program prints nothing, so there's no output to aim for`);
      if (d.expect != null && normalizeOutput(String(d.expect)) !== output) errors.push(`${where}: expect says\n${d.expect}\nbut the program prints\n${output}`);
      return { ...base, prompt: d.prompt ?? "Fill the blank so the program prints the output shown.", display, answer: blanks[0].answer, accept: blanks[0].accept, output, ...(stdin ? { stdin } : {}) };
    }
    case "bug": {
      const lines = display.split("\n");
      const marked = (l) => /#\s*BUG\s*$/.test(l);
      const at = lines.findIndex(marked);
      if (at < 0 || typeof d.fix !== "string" || !d.fix.trim()) {
        errors.push(`${where}: mark the buggy line with # BUG and give its fix`);
        return null;
      }
      if (lines.filter(marked).length > 1) errors.push(`${where}: only one line can be marked # BUG`);
      const clean = lines.map((l) => l.replace(/\s*#\s*BUG\s*$/, "")).join("\n");
      const fixed = lines.map((l) => (marked(l) ? l.match(/^\s*/)[0] + d.fix.trim() : l)).join("\n");
      const output = await runDrill(`${where} (fixed)`, fixed + "\n", stdin);
      if (output == null) return null;
      const br = await run(specOf(clean + "\n", { stdin }));
      if (!br.timedOut && br.exit === 0 && !br.stderr && normalizeOutput(br.stdout) === output) errors.push(`${where}: the buggy and the fixed program behave the same`);
      return { ...base, prompt: d.prompt ?? "One line has a bug. Which one?", display: clean, answer: String(at + 1), fix: d.fix.trim(), output, ...(stdin ? { stdin } : {}) };
    }
    case "runs": {
      const spec = specOf(display + "\n", { stdin });
      const r = await run(spec);
      const ok = !r.timedOut && r.exit === 0 && !r.stderr;
      const answer = ok ? "yes" : "no";
      if (r.timedOut) errors.push(`${where}: times out; a "runs" drill must either finish or stop with an error`);
      if (d.answer != null && String(d.answer) !== answer) errors.push(`${where}: the answer says ${d.answer}, but ${ok ? "it runs without an error" : `Python stops with ${lastErrorLine(r.stderr)}`}`);
      checks.push({ where, spec, stdout: r.stdout, stderr: r.stderr, exit: r.exit });
      const why = d.why || (ok ? "" : `Python stops with \`${lastErrorLine(r.stderr)}\``);
      if (!why) errors.push(`${where}: needs an explanation (why)`);
      return { ...base, why, prompt: d.prompt ?? "Does this run without an error?", display, answer, ...(ok ? { output: normalizeOutput(r.stdout) } : { error: lastErrorLine(r.stderr) }), ...(stdin ? { stdin } : {}) };
    }
    case "choice": {
      const choices = (d.choices ?? []).map(String);
      const answer = Number(d.answer);
      if (choices.length < 2 || choices.length > 4) return void errors.push(`${where}: a choice drill needs 2 to 4 choices`);
      if (new Set(choices).size !== choices.length) errors.push(`${where}: two choices are the same`);
      if (!(answer >= 1 && answer <= choices.length)) return void errors.push(`${where}: answer must be the number of the right choice (1 to ${choices.length})`);
      if (typeof d.prompt !== "string" || !d.prompt) errors.push(`${where}: a choice drill needs a prompt`);
      if (display) {
        const spec = specOf(display + "\n", { stdin });
        if (d.runs === false) {
          const r = await run(spec);
          if (r.exit === 0 && !r.timedOut) errors.push(`${where}: marked runs: false, but it runs without an error`);
        } else if (d.verify === "output") {
          const out = await runDrill(where, display + "\n", stdin);
          if (out != null) {
            // A choice may be in backticks (as code), which aren't part of the output.
            const shown = (ch) => normalizeOutput(ch.replace(/^`([^`]*)`$/, "$1"));
            if (shown(choices[answer - 1]) !== out) errors.push(`${where}: the right choice is "${choices[answer - 1]}", but the program prints "${out}"`);
            choices.forEach((ch, i) => i !== answer - 1 && shown(ch) === out && errors.push(`${where}: choice ${i + 1} is also what it prints`));
          }
        } else {
          const r = await run(spec);
          if (r.timedOut || r.exit !== 0) errors.push(`${where}: the code stops with an error (mark it runs: false if that's the point):\n${r.stderr}`);
        }
      } else if (d.verify) errors.push(`${where}: verify needs code to run`);
      return { ...base, prompt: d.prompt ?? "", display, answer: String(answer), choices };
    }
    case "boss": {
      if (typeof d.prompt !== "string" || !d.prompt) errors.push(`${where}: a boss drill needs a prompt (the task)`);
      const ex = await buildExercise(where, d);
      if (!ex) return null;
      checkTaskOutput(where, d.prompt, ex);
      return { ...base, prompt: d.prompt ?? "", display: "", answer: "", exercise: ex };
    }
  }
  return null;
}

async function buildDrills(modules) {
  const dir = path.join(ROOT, "content", "drills");
  const files = (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort() : []).filter((f) => (!drillFileArg || f === drillFileArg) && (!moduleFileArg || modules.some((m) => f === `${m.id}.yaml`)));
  const byId = new Map(modules.map((m) => [m.id, m]));
  const seen = new Set();
  const out = [];
  await Promise.all(
    files.map(async (name) => {
      const file = `content/drills/${name}`;
      const data = readYaml(path.join(dir, name));
      if (!data) return;
      checkKeys(file, data, "drillFile");
      const topic = data.topic;
      const interview = topic === "interview";
      if (!interview && !byId.has(topic)) return void errors.push(`${file}: topic ${topic} is not a written module (or "interview")`);
      if (!interview && name !== `${topic}.yaml`) errors.push(`${file}: the file should be named ${topic}.yaml`);
      if (!Array.isArray(data.drills) || !data.drills.length) return void errors.push(`${file}: needs drills`);
      const stem = name.replace(/\.ya?ml$/, "");
      const built = await Promise.all(
        data.drills.map((d, i) => {
          const id = d?.id ?? `${stem}-${i + 1}`;
          if (seen.has(id)) errors.push(`${file}: duplicate drill id ${id}`);
          seen.add(id);
          return buildDrill(`${file} drill ${i + 1} (${d?.type})`, id, topic, d, interview ? null : byId.get(topic).steps);
        }),
      );
      out.push({ file: name, drills: built.filter(Boolean) });
    }),
  );
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out.flatMap((f) => f.drills);
}

/** content/placement.yaml: one drill per question, each naming the module it tests, in course order. */
async function buildPlacement(modules) {
  const file = path.join(ROOT, "content", "placement.yaml");
  if (!fs.existsSync(file)) return [];
  const data = readYaml(file);
  const order = modules.map((m) => m.id);
  let last = -1;
  const out = [];
  for (const [i, q] of (data?.questions ?? []).entries()) {
    const where = `content/placement.yaml question ${i + 1}`;
    const at = order.indexOf(q?.module);
    if (at < 0) {
      errors.push(`${where}: module ${q?.module} is not a written module`);
      continue;
    }
    if (at < last) errors.push(`${where}: the questions must follow the course order`);
    last = at;
    const { module, ...rest } = q;
    const d = await buildDrill(where, `placement-${i + 1}`, module, { ...rest, after: undefined }, modules[at].steps);
    if (d) out.push({ ...d, module });
  }
  return out;
}

// ---------------------------------------------------------------- projects
/**
 * Projects: content/projects/<id>.yaml, one program built over several milestones (see
 * content/README.md, "Projects"). Milestone 1 starts from the project's `seed`, and each later
 * milestone from the previous one's model solution (on the site, from the learner's own passing
 * code), with the files the milestone adds (`files`). Each milestone is checked like a lesson
 * challenge on that starting code, and its model solution must also pass every visible test of the
 * earlier milestones, except those it or a milestone before it names in `replaces`.
 */
async function buildProjects() {
  const files = (fs.existsSync(PROJECTS_DIR) ? fs.readdirSync(PROJECTS_DIR).filter((f) => /\.ya?ml$/.test(f)).sort() : []).filter((f) => !projectFileArg || f === projectFileArg);
  if (projectFileArg && !files.length) errors.push(`--project-file: no content/projects/${projectFileArg}`);
  if (planned.has(PROJECT_LESSONS)) errors.push(`content/course.yaml: a module can't have the id ${PROJECT_LESSONS} (public/lessons/${PROJECT_LESSONS}/ holds the projects)`);
  const built = (await Promise.all(files.map(buildProject))).filter(Boolean);
  return built.sort((a, b) => (planned.get(a.after)?.number ?? 0) - (planned.get(b.after)?.number ?? 0) || a.title.localeCompare(b.title));
}

async function buildProject(name) {
  const file = `content/projects/${name}`;
  const data = readYaml(path.join(PROJECTS_DIR, name));
  if (!data) return null;
  checkKeys(file, data, "project");
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = name.replace(/\.ya?ml$/, "");
  if (!KEBAB.test(id)) errors.push(`${file}: the file's name is the project's id, in kebab-case (like text-adventure.yaml)`);
  if (data.id !== id) errors.push(`${file}: id must be ${id}, the file's name (progress is saved by it)`);
  for (const k of ["title", "summary", "intro"]) if (typeof data[k] !== "string" || !data[k].trim()) errors.push(`${file}: needs ${k} (as text)`);
  if (!planned.get(data.after)) errors.push(`${file}: after must be the id of a module in content/course.yaml: the last module whose topics the project needs`);
  const intro = await checkExamples(`${file} intro`, String(data.intro ?? "").trim() + "\n");
  if (data.seed == null) errors.push(`${file}: needs a seed: the code milestone 1 starts from`);
  const seed = codeOf(`${file} seed`, data.seed);
  if (!Array.isArray(data.milestones) || data.milestones.length < 2) {
    errors.push(`${file}: needs milestones, a list of at least 2`);
    return null;
  }
  const ids = new Set();
  const testNames = new Map();
  let inForce = [];
  let program = seed;
  const milestones = [];
  for (const [k, raw] of data.milestones.entries()) {
    const where = `${file} milestone ${k + 1} (${raw?.title ?? "untitled"})`;
    checkKeys(where, raw, "milestone");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (typeof raw.id !== "string" || !KEBAB.test(raw.id)) errors.push(`${where}: needs an id in kebab-case (progress is saved by it)`);
    else if (ids.has(raw.id)) errors.push(`${where}: duplicate milestone id ${raw.id}`);
    ids.add(raw.id);
    if (typeof raw.title !== "string" || !raw.title.trim()) errors.push(`${where}: needs a title (as text)`);
    if (typeof raw.task !== "string" || !raw.task.trim()) errors.push(`${where}: needs a task (Markdown, as text)`);
    // Files the milestone adds to the program (modules of its own), with the text they start with.
    const added = [];
    const have = splitFiles(program).map((f) => f.path);
    if (raw.files != null) {
      if (typeof raw.files !== "object" || Array.isArray(raw.files)) errors.push(`${where}: files maps the names of files this milestone adds to the program (like inventory.py) to the text they start with`);
      else
        for (const [p, text] of Object.entries(raw.files)) {
          const problem = sourceNameProblem(p);
          if (problem) errors.push(`${where}: files: "${p}" ${problem}`);
          else if (have.includes(p)) errors.push(`${where}: files: the program already has ${p}; files only adds new ones`);
          else added.push({ path: p, text: ensureNl(String(text ?? "")) });
        }
    }
    const start = added.length ? joinFiles([...splitFiles(program), ...added]) : program;
    const tests = Array.isArray(raw.tests) ? raw.tests : [];
    if (!tests.length) errors.push(`${where}: needs tests, each with a name`);
    tests.forEach((t, i) => {
      const n = `${where} test ${i + 1}`;
      if (typeof t?.name !== "string" || !t.name.trim()) errors.push(`${n}: every test of a project needs a name of its own (replaces in a later milestone names it)`);
      else if (testNames.has(t.name)) errors.push(`${n}: the test name "${t.name}" is used already (in milestone ${testNames.get(t.name) + 1})`);
      else testNames.set(t.name, k);
    });
    if (!tests.length) return null;
    const from = k === 0 ? "the project's seed" : "the previous milestone's model solution";
    const ex = await buildExercise(where, { seed: start, solution: raw.solution, hints: raw.hints, tests, require: raw.require, forbid: raw.forbid }, { startName: added.length ? `${from} with this milestone's files` : from });
    if (!ex) return null;
    checkTaskOutput(where, raw.task, ex);
    const task = await checkExamples(`${where} task`, String(raw.task ?? "").trim() + "\n");
    const replaces = [];
    if (raw.replaces != null) {
      if (!Array.isArray(raw.replaces) || raw.replaces.some((x) => typeof x !== "string")) errors.push(`${where}: replaces is a list of the names of earlier milestones' visible tests whose behavior this milestone changes`);
      else
        for (const nm of raw.replaces) {
          if (inForce.some((e) => e.test.name === nm)) replaces.push(nm);
          else errors.push(`${where}: replaces names "${nm}", which isn't a visible test still in force from an earlier milestone`);
        }
    }
    // The model solution still passes the earlier milestones' visible tests it doesn't replace.
    for (const e of inForce) {
      const r = await run(specOf(ex.solution, e.test));
      const ok = passes(e.test, r);
      if (replaces.includes(e.test.name)) {
        if (ok) warnings.push(`${where}: replaces "${e.test.name}" (milestone ${e.k + 1}), but its model solution still passes that test`);
      } else if (!ok) errors.push(`${where}: the model solution must still pass milestone ${e.k + 1}'s visible test "${e.test.name}" (or name it in replaces): it prints\n${graded(r, e.test)}\n${r.stderr}`);
    }
    inForce = [...inForce.filter((e) => !replaces.includes(e.test.name)), ...ex.tests.filter((t) => !t.hidden).map((test) => ({ k, test }))];
    program = ex.solution;
    milestones.push({ id: raw.id, title: raw.title, task, ...(added.length ? { files: Object.fromEntries(added.map((f) => [f.path, f.text])) } : {}), ...(replaces.length ? { replaces } : {}), ...ex });
  }
  return { id, title: String(data.title ?? ""), summary: String(data.summary ?? ""), after: String(data.after ?? ""), intro, milestones };
}

// ---------------------------------------------------------------- topics
function buildTopics(modules, drills) {
  const file = path.join(ROOT, "content", "topics.yaml");
  if (!fs.existsSync(file)) return [];
  const raw = readYaml(file);
  if (raw == null) return [];
  const steps = new Map(modules.flatMap((m) => m.steps.map((s) => [s.id, { step: s, module: m }])));
  const withDrills = new Set(drills.map((d) => d.topic));
  const drillTopics = new Map(modules.filter((m) => withDrills.has(m.id)).map((m) => [m.id, m.title]));
  const checked = checkTopics(raw, { steps, drillTopics });
  errors.push(...checked.errors);
  return checked.topics;
}

// ---------------------------------------------------------------- build
let modules = [];
let drills = [];
let placement = [];
let projects = [];
let topics = [];
try {
  modules = projectFileArg ? [] : await buildModules();
  drills = projectFileArg ? [] : await buildDrills(modules);
  placement = projectFileArg || moduleFileArg || (drillFileArg && drillFileArg !== "placement.yaml") ? [] : await buildPlacement(modules);
  projects = moduleFileArg || drillFileArg ? [] : await buildProjects();
  topics = moduleFileArg || drillFileArg || projectFileArg ? [] : buildTopics(modules, drills);
} finally {
  pool.close();
}

if (!dry) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  // Only what this build used is kept, so the cache doesn't grow forever.
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ version: CACHE_VERSION, python: pythonVersion, entries: usedCache }));
}

for (const w of warnings) console.warn("warn:", w);
if (errors.length) {
  for (const e of errors) console.error("\nERROR:", e);
  console.error(`\n${errors.length} content error(s).`);
  process.exit(1);
}

/** A count with its word, singular for one: "1 project", "4 projects". */
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

if (dry) {
  console.log(`check ok (nothing written): ${count(modules.length, "module")}${moduleFileArg ? ` (${moduleFileArg})` : ""}, ${count(modules.reduce((a, m) => a + m.steps.length, 0), "step")}, ${count(drills.length, "drill")}${drillFileArg ? ` in ${drillFileArg}` : ""}, ${count(placement.length, "placement question")}, ${count(projects.length, "project")}${projectFileArg ? ` (${projectFileArg})` : ""}${topics.length ? `, ${count(topics.length, "topic")}` : ""}`);
  process.exit(0);
}

// The app loads a small index (every page needs it) and each step's lesson only when it's opened:
// public/lessons/<module>/<slug>-<hash>.json, where the hash of its content makes a saved copy
// never stale. The whole modules are for the pre-rendered pages and the tests.
const lessonJson = new Map(modules.flatMap((m) => m.steps.map((s) => [s.id, JSON.stringify(s)])));
const lessonHash = (s) => crypto.createHash("sha256").update(lessonJson.get(s.id)).digest("hex").slice(0, 10);
const projectJson = new Map(projects.map((x) => [x.id, JSON.stringify(x)]));
const projectHash = (x) => crypto.createHash("sha256").update(projectJson.get(x.id)).digest("hex").slice(0, 10);
const live = new Set(modules.map((m) => m.id));
const plan = course.modules.map((m, i) => ({ id: m.id, number: i + 1, title: m.title, course: m.course, part: m.part ?? null, mooc: m.mooc ?? [], steps: m.steps, live: live.has(m.id) }));
const index = {
  python: pythonVersion,
  moocUrl: course.moocUrl,
  plan,
  modules: modules.map(({ steps, ...m }) => ({ ...m, drills: drills.filter((d) => d.topic === m.id).length, steps: steps.map((s) => ({ id: s.id, slug: s.slug, title: s.title, hash: lessonHash(s), challenges: 1 + s.more.length, drills: drills.filter((d) => d.after === s.id).length })) })),
  interviewDrills: drills.filter((d) => d.topic === "interview").length,
  placementQuestions: placement.length,
  projects: projects.map((x) => ({ id: x.id, title: x.title, summary: x.summary, after: x.after, hash: projectHash(x), milestones: x.milestones.map((m) => ({ id: m.id, title: m.title })) })),
};
// The lesson files first and the index after them, so a running dev server never sees an index
// that names files not written yet; then the lesson files no longer named are removed.
const lessonFiles = new Set();
for (const m of modules) {
  fs.mkdirSync(path.join(LESSONS, m.id), { recursive: true });
  for (const s of m.steps) {
    const file = path.join(LESSONS, m.id, `${s.slug}-${lessonHash(s)}.json`);
    lessonFiles.add(file);
    fs.writeFileSync(file, lessonJson.get(s.id));
  }
}
fs.mkdirSync(path.join(LESSONS, PROJECT_LESSONS), { recursive: true });
for (const x of projects) {
  const file = path.join(LESSONS, PROJECT_LESSONS, `${x.id}-${projectHash(x)}.json`);
  lessonFiles.add(file);
  fs.writeFileSync(file, projectJson.get(x.id));
}
fs.rmSync(GENERATED, { recursive: true, force: true });
fs.mkdirSync(path.join(GENERATED, "modules"), { recursive: true });
fs.mkdirSync(path.join(GENERATED, "projects"), { recursive: true });
fs.writeFileSync(path.join(GENERATED, "course.json"), JSON.stringify(index));
fs.writeFileSync(path.join(GENERATED, "topics.json"), JSON.stringify(topics));
for (const m of modules) fs.writeFileSync(path.join(GENERATED, "modules", `${m.id}.json`), JSON.stringify(m));
for (const x of projects) fs.writeFileSync(path.join(GENERATED, "projects", `${x.id}.json`), projectJson.get(x.id));
for (const dir of fs.readdirSync(LESSONS)) {
  const full = path.join(LESSONS, dir);
  for (const f of fs.readdirSync(full)) if (!lessonFiles.has(path.join(full, f))) fs.rmSync(path.join(full, f));
  if (!fs.readdirSync(full).length) fs.rmdirSync(full);
}
fs.writeFileSync(path.join(GENERATED, "drills.json"), JSON.stringify({ drills, placement }));
fs.mkdirSync(path.dirname(CHECKS_JSON), { recursive: true });
fs.writeFileSync(CHECKS_JSON, JSON.stringify({ python: pythonVersion, checks }, null, 1));
const steps = modules.reduce((a, m) => a + m.steps.length, 0);
const challenges = modules.reduce((a, m) => a + m.steps.reduce((b, s) => b + 1 + s.more.length, 0), 0);
console.log(`content ok: ${count(modules.length, "module")}, ${count(steps, "step")}, ${count(challenges, "challenge")}, ${count(drills.length, "drill")}, ${count(placement.length, "placement question")}, ${count(projects.length, "project")} with ${count(projects.reduce((n, x) => n + x.milestones.length, 0), "milestone")}, ${count(topics.length, "topic")}; ${count(checks.length, "program")} checked on CPython ${pythonVersion} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
