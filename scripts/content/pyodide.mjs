// Pyodide on Node for the content build: runs the programs that use pygame in the interpreter the
// browser runs (the same WebAssembly, the same pygame wheel, the same harness), so their windows'
// frames and text are exactly what the page will show. CPython would draw text a little differently
// (its pygame has another FreeType), and a program that centres a text by its width would then put
// it somewhere else.
//
// pyodidePool() has the interface of python.mjs's pythonPool(): run(spec, seed) resolves with the
// harness's result, each pygame frame in `frames` (its picture as base64), and timedOut. Each worker
// is a process of its own (scripts/content/pyodide-child.mjs) with its own Pyodide, started with one
// of the two hash seeds. A program past the time limit is stopped by killing its process. A process
// that dies on its own (WebAssembly engines can crash under memory pressure) is replaced and its
// program run once more in the new one, so one crash can't fail a build.
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CHILD = path.join(ROOT, "scripts", "content", "pyodide-child.mjs");
const HASH_SEEDS = ["0", "12345"];

/** The wheels of the engine's packages (pygame-ce), as public/engine/manifest.json lists them. */
function wheels() {
  const manifest = path.join(ROOT, "public", "engine", "manifest.json");
  if (!fs.existsSync(manifest)) throw new Error("public/engine/manifest.json is missing: run npm install (it copies the engine)");
  const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
  return Object.values(m.packages ?? {}).map((p) => path.join(ROOT, "engine-packages", p.file));
}

const TIMED_OUT = { stdout: "", stderr: "", output: "", exit: null, truncated: false, files: {}, callStart: null, callError: false, loadInput: false, callValue: null, repl: null, window: null, frames: [], timedOut: true };

export function pyodidePool({ size = Math.max(1, Math.min(4, Number(process.env.PYTHON_WORKERS) || os.cpus().length)), timeLimitMs = 20_000 } = {}) {
  const env = (seed) => ({ PATH: process.env.PATH, HOME: os.tmpdir(), PYODIDE_INDEX: path.join(ROOT, "node_modules", "pyodide"), ARENA_ENGINE: path.join(ROOT, "src", "engine"), PYODIDE_WHEELS: JSON.stringify(wheels()), PYTHONHASHSEED: seed });
  const workers = HASH_SEEDS.map((seed) => Array.from({ length: Math.ceil(size / 2) }, () => ({ seed, child: null, ready: null, busy: false, job: null })));
  const queues = [[], []];
  let closed = false;

  function start(w) {
    const child = fork(CHILD, [], { env: env(w.seed), stdio: ["ignore", "ignore", "pipe", "ipc"] });
    w.child = child;
    let err = "";
    child.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    const tail = () => err.trim().split("\n").slice(-5).join(" ");
    w.ready = new Promise((resolve, reject) => {
      const first = (m) => {
        child.off("message", first);
        if (m.ready) resolve();
        else reject(new Error(m.failed));
      };
      child.on("message", first);
      child.once("exit", (code, signal) => reject(new Error(`Pyodide's process ended while starting (${signal ?? `exit ${code}`}): ${tail()}`)));
    });
    w.ready.catch(() => {});
    child.on("exit", (code, signal) => {
      if (w.child !== child) return;
      // Died by itself, not by a time limit: a fresh process runs the program once more.
      w.child = null;
      const job = w.job;
      w.job = null;
      w.busy = false;
      if (job) {
        clearTimeout(job.timer);
        if (!job.retried && !closed) {
          job.retried = true;
          console.warn(`pyodide: a Pyodide process stopped (${signal ?? `exit ${code}`}) while running a program; running it again in a new one. ${tail()}`);
          queues[HASH_SEEDS.indexOf(w.seed)].unshift(job);
        } else job.reject(new Error(`the Pyodide process stopped (${signal ?? `exit ${code}`}) twice running this program: ${tail()}`));
      }
      next(w);
    });
  }

  async function next(w) {
    const q = queues[HASH_SEEDS.indexOf(w.seed)];
    if (closed || w.busy || !q.length) return;
    const job = q.shift();
    w.busy = true;
    w.job = job;
    if (!w.child) start(w);
    const child = w.child;
    try {
      await w.ready;
    } catch (e) {
      if (w.child === child) {
        w.child = null;
        child.kill("SIGKILL");
      }
      if (w.job === job) {
        w.job = null;
        w.busy = false;
        job.reject(e);
        next(w);
      }
      return;
    }
    if (w.job !== job || w.child !== child) return;
    const done = (m) => {
      if (w.job !== job) return;
      clearTimeout(job.timer);
      child.off("message", done);
      w.job = null;
      w.busy = false;
      if (m.failed) job.reject(new Error(`the harness failed in Pyodide: ${m.failed}`));
      else job.resolve({ ...m, timedOut: false });
      next(w);
    };
    child.on("message", done);
    job.timer = setTimeout(() => {
      // An endless loop: the process is stopped and a new one starts for the next program.
      child.off("message", done);
      w.job = null;
      w.busy = false;
      w.child = null;
      child.kill("SIGKILL");
      job.resolve({ ...TIMED_OUT });
      next(w);
    }, timeLimitMs);
    child.send(job.spec);
  }

  function run(spec, seed = 0) {
    return new Promise((resolve, reject) => {
      queues[seed].push({ spec, resolve, reject, retried: false });
      for (const w of workers[seed]) next(w);
    });
  }

  function close() {
    closed = true;
    for (const group of workers)
      for (const w of group) {
        const c = w.child;
        w.child = null;
        c?.kill("SIGKILL");
      }
  }

  return { run, close };
}

/** The version of Pyodide that runs these programs, for the build's cache keys. */
export function pyodideVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", "pyodide", "package.json"), "utf8")).version;
}
