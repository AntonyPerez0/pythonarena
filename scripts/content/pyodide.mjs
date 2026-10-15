// Pyodide on Node for the content build: runs the programs that use pygame in the interpreter the
// browser runs (the same WebAssembly, the same pygame wheel, the same harness), so their windows'
// frames and text are exactly what the page will show. CPython would draw text a little differently
// (its pygame has another FreeType), and a program that centres a text by its width would then put
// it somewhere else.
//
// pyodidePool() has the interface of python.mjs's pythonPool(): run(spec, seed) resolves with the
// harness's result, each pygame frame in `frames` (its picture as base64), and timedOut. Each
// worker is a worker thread with its own Pyodide, started with one of the two hash seeds.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const HASH_SEEDS = ["0", "12345"];

/** The worker thread: starts Pyodide with pygame and the harness, then runs one spec per message. */
const WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const { loadPyodide } = await import(workerData.pyodide);
  const py = await loadPyodide({ indexURL: workerData.indexURL, stdout: () => {}, stderr: () => {}, env: { HOME: "/home/pyodide", PYTHONHASHSEED: workerData.seed } });
  for (const wheel of workerData.wheels) await py.loadPackage(wheel, { messageCallback: () => {}, errorCallback: () => {} });
  py.FS.mkdirTree("/arena");
  py.FS.writeFile("/arena/arena.py", fs.readFileSync(path.join(workerData.engine, "arena.py"), "utf8"));
  py.FS.writeFile("/arena/arena_pygame.py", fs.readFileSync(path.join(workerData.engine, "arena_pygame.py"), "utf8"));
  py.runPython("import sys\\nsys.path.insert(0, '/arena')\\nimport arena");
  const run = py.pyimport("arena").run;
  let count = 0;
  parentPort.on("message", (spec) => {
    const parts = { stdout: "", stderr: "", output: "" };
    const frames = [];
    const sink = (stream, text) => {
      if (stream === "frame") {
        const f = text.toJs({ dict_converter: Object.fromEntries });
        const png = f.png ? Buffer.from(f.png).toString("base64") : null;
        if (f.again) {
          const last = frames.find((x) => x.index === f.index);
          if (last) last.png = png;
        } else frames.push({ index: f.index, log: f.log, png, title: f.title, ms: f.ms, ...(f.same ? { same: true } : {}) });
        return;
      }
      parts[stream] += text;
      parts.output += text;
    };
    const given = {};
    for (const [name, data] of Object.entries(spec.given || {})) given[name] = typeof data === "string" ? data : new Uint8Array(Buffer.from(data.base64, "base64"));
    const plain = { ...spec, given };
    for (const k of ["call", "repl", "window"]) if (plain[k] == null) delete plain[k];
    const p = py.toPy(plain);
    try {
      const result = run(p, sink, "/tmp/arena/run" + ++count);
      const r = result.toJs({ dict_converter: Object.fromEntries });
      result.destroy();
      const files = {};
      for (const [name, data] of Object.entries(r.files || {})) files[name] = typeof data === "string" ? data : { base64: Buffer.from(data).toString("base64") };
      parentPort.postMessage({ ...parts, exit: r.exit, truncated: r.truncated, files, callStart: r.callStart ?? null, callError: !!r.callError, loadInput: !!r.loadInput, callValue: r.callValue ?? null, repl: r.repl ?? null, window: r.window ?? null, frames });
    } catch (e) {
      parentPort.postMessage({ failed: String(e && e.message || e) });
    } finally {
      p.destroy();
    }
  });
  parentPort.postMessage({ ready: true });
})().catch((e) => parentPort.postMessage({ failed: "Pyodide didn't start: " + (e && e.message || e) }));
`;

/** The wheels of the engine's packages (pygame-ce), as public/engine/manifest.json lists them. */
function wheels() {
  const manifest = path.join(ROOT, "public", "engine", "manifest.json");
  if (!fs.existsSync(manifest)) throw new Error("public/engine/manifest.json is missing: run npm install (it copies the engine)");
  const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
  return Object.values(m.packages ?? {}).map((p) => path.join(ROOT, "engine-packages", p.file));
}

export function pyodidePool({ size = Math.max(1, Math.min(4, Number(process.env.PYTHON_WORKERS) || os.cpus().length)), timeLimitMs = 20_000 } = {}) {
  const workerData = (seed) => ({ seed, pyodide: path.join(ROOT, "node_modules", "pyodide", "pyodide.mjs"), indexURL: path.join(ROOT, "node_modules", "pyodide") + "/", engine: path.join(ROOT, "src", "engine"), wheels: wheels() });
  const workers = HASH_SEEDS.map((seed) => Array.from({ length: Math.ceil(size / 2) }, () => ({ seed, thread: null, ready: null, busy: false, job: null })));
  const queues = [[], []];

  function start(w) {
    const thread = new Worker(WORKER, { eval: true, workerData: workerData(w.seed) });
    w.thread = thread;
    w.ready = new Promise((resolve, reject) => {
      const first = (m) => {
        thread.off("message", first);
        if (m.ready) resolve();
        else reject(new Error(m.failed));
      };
      thread.on("message", first);
    });
    thread.on("error", (e) => {
      if (w.thread !== thread) return;
      w.thread = null;
      const job = w.job;
      if (job) {
        clearTimeout(job.timer);
        w.job = null;
        w.busy = false;
        job.reject(new Error(`the Pyodide worker stopped: ${e.message}`));
        next(w);
      }
    });
  }

  async function next(w) {
    const q = queues[HASH_SEEDS.indexOf(w.seed)];
    if (w.busy || !q.length) return;
    const job = q.shift();
    w.busy = true;
    w.job = job;
    if (!w.thread) start(w);
    const thread = w.thread;
    try {
      await w.ready;
    } catch (e) {
      w.busy = false;
      w.job = null;
      w.thread = null;
      thread.terminate();
      job.reject(e);
      return;
    }
    const done = (m) => {
      if (w.job !== job) return;
      clearTimeout(job.timer);
      thread.off("message", done);
      w.job = null;
      w.busy = false;
      if (m.failed) job.reject(new Error(`the harness failed in Pyodide: ${m.failed}`));
      else job.resolve({ ...m, timedOut: false });
      next(w);
    };
    thread.on("message", done);
    job.timer = setTimeout(() => {
      // An endless loop: the worker is stopped and a new one starts for the next program.
      thread.off("message", done);
      w.job = null;
      w.busy = false;
      w.thread = null;
      thread.terminate();
      job.resolve({ stdout: "", stderr: "", output: "", exit: null, truncated: false, files: {}, callStart: null, callError: false, loadInput: false, callValue: null, repl: null, window: null, frames: [], timedOut: true });
      next(w);
    }, timeLimitMs);
    thread.postMessage(job.spec);
  }

  function run(spec, seed = 0) {
    return new Promise((resolve, reject) => {
      queues[seed].push({ spec, resolve, reject });
      for (const w of workers[seed]) next(w);
    });
  }

  function close() {
    for (const group of workers) for (const w of group) w.thread?.terminate();
  }

  return { run, close };
}

/** The version of Pyodide that runs these programs, for the build's cache keys. */
export function pyodideVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", "pyodide", "package.json"), "utf8")).version;
}
