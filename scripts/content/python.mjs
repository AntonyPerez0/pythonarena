// The reference Python for the content build: CPython of exactly the version that Pyodide runs in
// the browser (node_modules/pyodide/pyodide-lock.json), running programs through the same harness
// (src/engine/arena.py) in a pool of worker processes (scripts/content/pyworker.py).
//
// The reference interpreter is found as $PYTHON, then `pythonX.Y` on the PATH, then a uv-managed
// install (`uv python find X.Y.Z`). Its version must match Pyodide's exactly, or the build stops.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const WORKER = path.join(ROOT, "scripts", "content", "pyworker.py");
const HARNESS = path.join(ROOT, "src", "engine", "arena.py");
const PYGAME_SHIM = path.join(ROOT, "src", "engine", "arena_pygame.py");

/** The Python version Pyodide runs, such as 3.14.2. */
export function engineVersion() {
  const lock = path.join(ROOT, "node_modules", "pyodide", "pyodide-lock.json");
  if (!fs.existsSync(lock)) throw new Error("node_modules/pyodide is missing: run npm install");
  return JSON.parse(fs.readFileSync(lock, "utf8")).info.python;
}

const versionOf = (exe) => {
  const r = spawnSync(exe, ["-c", "import sys; print('%d.%d.%d' % sys.version_info[:3])"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};

/** The reference CPython's path, checked to be the engine's version. */
export function referencePython() {
  const want = engineVersion();
  const minor = want.split(".").slice(0, 2).join(".");
  const tried = [];
  const candidates = [process.env.PYTHON, `python${minor}`];
  const uv = spawnSync("uv", ["python", "find", want], { encoding: "utf8" });
  if (uv.status === 0) candidates.push(uv.stdout.trim());
  for (const exe of candidates.filter(Boolean)) {
    const v = versionOf(exe);
    tried.push(`${exe}: ${v ?? "not found"}`);
    if (v === want) return { exe, version: v };
  }
  throw new Error(`the content build needs CPython ${want}, the version Pyodide runs in the browser. Install it (for example \`uv python install ${want}\`) or set PYTHON to it. Tried: ${tried.join("; ")}`);
}

const HASH_SEEDS = ["0", "12345"];

/**
 * A pool of Python workers (PYTHON_WORKERS of them, or one per CPU up to 8). run(spec) resolves
 * with the harness's result (see pyworker.py), plus timedOut. `seed` picks the PYTHONHASHSEED (0 or 1): set and dict orders of strings differ between
 * the two, so a program whose output depends on them prints differently.
 */
export function pythonPool({ exe, size = Number(process.env.PYTHON_WORKERS) || Math.max(2, Math.min(8, os.cpus().length)), timeLimitMs = 10_000 }) {
  const workers = HASH_SEEDS.map((seed) => Array.from({ length: Math.ceil(size / 2) }, () => ({ seed, proc: null, busy: false, buf: "", job: null })));
  const queues = [[], []];

  function start(w) {
    const proc = spawn(exe, ["-I", "-X", "utf8", WORKER], { env: { PATH: process.env.PATH, PYTHONHASHSEED: w.seed, LC_ALL: "C.UTF-8", HOME: os.tmpdir() }, stdio: ["pipe", "pipe", "pipe"] });
    w.proc = proc;
    w.buf = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d) => {
      w.buf += d;
      let i;
      while ((i = w.buf.indexOf("\n")) >= 0) {
        const line = w.buf.slice(0, i);
        w.buf = w.buf.slice(i + 1);
        const job = w.job;
        if (!job) continue;
        clearTimeout(job.timer);
        w.job = null;
        w.busy = false;
        job.resolve({ ...JSON.parse(line), timedOut: false });
        next(w);
      }
    });
    let err = "";
    proc.stderr.on("data", (d) => (err += d));
    proc.on("exit", () => {
      if (w.proc !== proc) return;
      w.proc = null;
      const job = w.job;
      if (job) {
        clearTimeout(job.timer);
        w.job = null;
        w.busy = false;
        job.reject(new Error(`the Python worker stopped: ${err.slice(-2000)}`));
        next(w);
      }
    });
  }

  function next(w) {
    const q = queues[HASH_SEEDS.indexOf(w.seed)];
    if (w.busy || !q.length) return;
    const job = q.shift();
    if (!w.proc) start(w);
    w.busy = true;
    w.job = job;
    job.timer = setTimeout(() => {
      // An endless loop: what it printed is lost, as the page would keep it only for showing.
      w.job = null;
      w.busy = false;
      const proc = w.proc;
      w.proc = null;
      proc?.kill("SIGKILL");
      job.resolve({ stdout: "", stderr: "", output: "", exit: null, truncated: false, files: {}, callStart: null, callError: false, loadInput: false, repl: null, timedOut: true });
      next(w);
    }, timeLimitMs);
    w.proc.stdin.write(JSON.stringify({ id: 0, spec: job.spec }) + "\n");
  }

  function run(spec, seed = 0) {
    return new Promise((resolve, reject) => {
      queues[seed].push({ spec, resolve, reject });
      for (const w of workers[seed]) next(w);
    });
  }

  function close() {
    for (const group of workers) for (const w of group) w.proc?.kill();
  }

  return { run, close };
}

let harnessHash = null;

/** A key for caching a run: the spec, the interpreter's version, the hash seed and the harness's text. */
export function runKey(spec, version, seed) {
  harnessHash ??= createHash("sha256").update(fs.readFileSync(HARNESS)).update(fs.readFileSync(PYGAME_SHIM)).update(fs.readFileSync(WORKER)).digest("hex");
  return createHash("sha256").update(JSON.stringify([version, seed, harnessHash, spec])).digest("hex");
}
