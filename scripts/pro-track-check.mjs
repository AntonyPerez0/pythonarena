// Checks the Pro Track's projects (pro-track/<id>/, model solutions in pro-track-solutions/<id>/)
// with real Python and pytest, as the CI job pro-track does:
//   1. the folder rules (scripts/pro-track/project.mjs: requirements.txt, pytest.ini, README.md, the
//      workflow, TODOs, the solution's files), without running anything;
//   2. a virtual environment with each project's requirements.txt installed (pip), shared by the
//      projects that pin the same packages;
//   3. the starter, in a copy: python -m pytest must collect the tests and then fail some of them
//      (the learner has work to do);
//   4. the starter with the solution's files copied over it, in another copy: every test passes,
//      with none failed, erred or skipped, and at least as many tests run as in 3.
// Copies go in a temporary folder, so the project folders never get a __pycache__.
//
// Usage: npm run pro-track-check [-- <id> ...]
// Python: $PYTHON, else python3.14 on the PATH, else a uv-managed 3.14 (`uv python find 3.14`).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PYTHON, folderProblems, layoutProblems, projectIds, readReport } from "./pro-track/project.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const wanted = args.filter((a) => !a.startsWith("--"));

function findPython() {
  const versionOf = (exe) => {
    const r = spawnSync(exe, ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { encoding: "utf8" });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const uv = spawnSync("uv", ["python", "find", PYTHON], { encoding: "utf8" });
  for (const exe of [process.env.PYTHON, `python${PYTHON}`, uv.status === 0 ? uv.stdout.trim() : null].filter(Boolean)) if (versionOf(exe) === PYTHON) return exe;
  return null;
}

const ids = projectIds(ROOT);
const unknown = wanted.filter((w) => !ids.includes(w));
if (unknown.length) {
  console.error(`pro-track-check: no project ${unknown.join(", ")} in pro-track/ (there ${ids.length === 1 ? "is" : "are"}: ${ids.join(", ") || "none"})`);
  process.exit(1);
}
const todo = wanted.length ? wanted : ids;

// 1. The folders, without running anything.
const problems = [...layoutProblems(ROOT), ...todo.flatMap((id) => folderProblems(ROOT, id))];
if (problems.length) {
  console.error(`pro-track-check: ${problems.length} problem${problems.length === 1 ? "" : "s"} in the project folders:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
if (!todo.length) {
  console.log("pro-track-check: no projects in pro-track/ yet; nothing to run");
  process.exit(0);
}
const python = findPython();
if (!python) {
  console.error(`pro-track-check: Python ${PYTHON} not found: put python${PYTHON} on the PATH or set PYTHON to it`);
  process.exit(1);
}

const run = (exe, argv, cwd) => {
  const t = Date.now();
  const r = spawnSync(exe, argv, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy", PYGAME_HIDE_SUPPORT_PROMPT: "1" } });
  if (r.error) throw r.error;
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, seconds: ((Date.now() - t) / 1000).toFixed(1) };
};
const tail = (out, n = 40) => out.trimEnd().split("\n").slice(-n).join("\n    ");
const copyStarter = (id, to) => fs.cpSync(path.join(ROOT, "pro-track", id), to, { recursive: true, filter: (src) => !/[\\/](__pycache__|\.pytest_cache)([\\/]|$)/.test(path.relative(path.join(ROOT, "pro-track", id), src)) });

const work = fs.mkdtempSync(path.join(os.tmpdir(), "pro-track-check-"));
// 2. One virtual environment per set of pinned packages.
const venvs = new Map();
function venvFor(id) {
  const req = fs.readFileSync(path.join(ROOT, "pro-track", id, "requirements.txt"), "utf8");
  const key = createHash("sha256").update(req).digest("hex").slice(0, 12);
  if (venvs.has(key)) return venvs.get(key);
  const dir = path.join(work, `venv-${key}`);
  const made = run(python, ["-m", "venv", dir], work);
  if (made.status !== 0) throw new Error(`couldn't make a virtual environment:\n${made.out}`);
  const exe = path.join(dir, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const pip = run(exe, ["-m", "pip", "install", "-q", "-r", path.join(ROOT, "pro-track", id, "requirements.txt")], work);
  if (pip.status !== 0) throw new Error(`pip couldn't install ${id}'s requirements.txt:\n${pip.out}`);
  venvs.set(key, exe);
  return exe;
}

let failed = 0;
for (const id of todo) {
  const exe = venvFor(id);
  // 3. The starter's tests are collected, and some of them fail.
  const starter = path.join(work, id, "starter");
  copyStarter(id, starter);
  const a = run(exe, ["-m", "pytest", "-q", "-p", "no:cacheprovider", "--junitxml=report.xml"], starter);
  const ra = readReport(path.join(starter, "report.xml"));
  if (!ra || ra.tests === 0 || a.status === 2 || a.status === 4 || a.status === 5) {
    failed++;
    console.error(`FAIL ${id}: pytest couldn't collect the starter's tests, so the learner can't start from it:\n    ${tail(a.out)}`);
    continue;
  }
  if (a.status === 0 || ra.failures + ra.errors === 0) {
    failed++;
    console.error(`FAIL ${id}: every test passes on the starter (${ra.tests} tests), so there's nothing to do; the starter's functions must leave tests failing`);
    continue;
  }
  // 4. The starter with the solution's files passes every test.
  const solved = path.join(work, id, "solved");
  copyStarter(id, solved);
  fs.cpSync(path.join(ROOT, "pro-track-solutions", id), solved, { recursive: true });
  const b = run(exe, ["-m", "pytest", "-q", "-p", "no:cacheprovider", "--junitxml=report.xml"], solved);
  const rb = readReport(path.join(solved, "report.xml"));
  if (b.status !== 0 || !rb || rb.failures + rb.errors + rb.skipped > 0 || rb.tests === 0) {
    failed++;
    const why = !rb ? "the tests never ran" : `${rb.failures} failed, ${rb.errors} erred, ${rb.skipped} skipped of ${rb.tests}${rb.failed.length ? `: ${rb.failed.join(", ")}` : ""}`;
    console.error(`FAIL ${id}: the model solution doesn't pass (${why}):\n    ${tail(b.out)}`);
    continue;
  }
  if (rb.tests < ra.tests) {
    failed++;
    console.error(`FAIL ${id}: ${rb.tests} tests ran on the solution but ${ra.tests} on the starter; they must be the same tests`);
    continue;
  }
  console.log(`  ok  ${id}: the starter fails ${ra.failures + ra.errors} of ${ra.tests} tests (${a.seconds} s); with the solution all ${rb.tests} pass (${b.seconds} s)`);
}
fs.rmSync(work, { recursive: true, force: true });
if (failed) {
  console.error(`pro-track-check: ${failed} of ${todo.length} project${todo.length === 1 ? "" : "s"} failed`);
  process.exit(1);
}
console.log(`pro-track-check: ${todo.length} project${todo.length === 1 ? "" : "s"} ok`);
