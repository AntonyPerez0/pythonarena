// Main-thread API for running Python.
// One run worker holds the Python interpreter (Pyodide) and runs test cases one after another. When
// a case runs past the time limit (an endless loop), the page kills the worker, starts a new one
// (from the files saved in Cache Storage, so it's quick) and carries on with the next case.
import { CACHE_PREFIX, downloadSize, fetchManifest, type Manifest } from "./manifest";
import { engineSupported } from "./support";
import type { EngineStatus, RunInput, RunResult, SourceFile } from "./types";

export type { EngineStatus, RunInput, RunResult, SourceFile } from "./types";
export { engineSupported } from "./support";

/** Default per-test time limit. Python in WebAssembly is slower than on a desktop, so it's generous. */
export const DEFAULT_TIME_LIMIT_MS = 5_000;
/** How long a new worker may take to start Python (from the cache) before a run is reported as failed. */
const STARTUP_LIMIT_MS = 60_000;

let status: EngineStatus = { state: "idle" };
const listeners = new Set<() => void>();

function setStatus(s: EngineStatus) {
  status = s;
  listeners.forEach((l) => l());
}

export function getEngineStatus() {
  return status;
}

export function subscribeEngine(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const engineBase = () => new URL(import.meta.env.BASE_URL + "engine/", location.origin).href;

/**
 * Whether the learner is on mobile data: "yes" when the browser reports a cellular or
 * data-saving connection (Chrome on Android does), "no" when it reports another connection,
 * and "unknown" when it can't tell (Safari and Firefox don't report the connection type).
 */
export function mobileData(): "yes" | "no" | "unknown" {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return "unknown";
  if (c.saveData === true || c.type === "cellular" || c.effectiveType === "2g" || c.effectiveType === "slow-2g") return "yes";
  return "no";
}

/** A phone or tablet (a touch screen as the main pointer), where "unknown" may well mean mobile data. */
const touchDevice = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

let manifestPromise: Promise<Manifest | null> | null = null;
export function loadManifest(): Promise<Manifest | null> {
  if (!manifestPromise) {
    const p = fetchManifest(engineBase() + "manifest.json");
    manifestPromise = p;
    // A failed fetch is not remembered: the next call tries again.
    p.then((m) => {
      if (!m && manifestPromise === p) manifestPromise = null;
    });
  }
  return manifestPromise;
}

/** Megabytes the one-time engine download costs, once the manifest has loaded. */
export async function downloadMegabytes(): Promise<number | null> {
  const m = await loadManifest();
  if (!m) return null;
  const total = m.order.reduce((a, f) => a + downloadSize(m, f), 0);
  return Math.round(total / 1e5) / 10;
}

/** The Python version the engine runs (such as 3.14.2), once the manifest has loaded. */
export async function pythonVersion(): Promise<string | null> {
  return (await loadManifest())?.python ?? null;
}

/** Whether this version of the engine is already saved in the browser, so loading it costs no data. */
export async function engineCached(): Promise<boolean> {
  try {
    const m = await loadManifest();
    if (!m) return false;
    if (!(await caches.keys()).includes(CACHE_PREFIX + m.version)) return false;
    const cache = await caches.open(CACHE_PREFIX + m.version);
    const keys = new Set((await cache.keys()).map((r) => r.url));
    return m.order.every((f) => keys.has(engineBase() + f));
  } catch {
    return false;
  }
}

/**
 * Whether to start the download without asking: not when it could cost the learner mobile data,
 * unless they said it may or the engine is already saved on this device.
 */
export async function mayAutoDownload(allowOnMobileData: boolean): Promise<boolean> {
  if (!engineSupported()) return false;
  const data = mobileData();
  if (allowOnMobileData || data === "no" || (data === "unknown" && !touchDevice())) return true;
  return engineCached();
}

// ---------------------------------------------------------------- the worker

type Slot = { worker: Worker; ready: Promise<void>; failed: string | null };
let current: Slot | null = null;
let manifest: Manifest | null = null;

function startWorker(m: Manifest, first: boolean): Slot {
  const worker = new Worker(new URL("./run.worker.ts", import.meta.url), { type: "module" });
  const slot: Slot = { worker, ready: Promise.resolve(), failed: null };
  slot.ready = new Promise<void>((resolve, reject) => {
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        if (first && status.state !== "error") setStatus({ state: "loading", loaded: msg.loaded, total: msg.total, stage: msg.stage });
      } else if (msg.type === "ready") {
        if (status.state !== "ready") setStatus({ state: "ready" });
        resolve();
      } else if (msg.type === "fatal") {
        slot.failed = msg.message;
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      slot.failed = e.message || "the Python engine stopped unexpectedly";
      reject(new Error(slot.failed));
    };
  });
  slot.ready.catch((err) => {
    if (current === slot) {
      current = null;
      worker.terminate();
      setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  });
  worker.postMessage({ type: "init", base: engineBase(), manifest: m });
  return slot;
}

let starting: Promise<void> | null = null;

/** Start downloading and starting the engine (no-op if already started or ready). */
export function ensureEngine() {
  if (!engineSupported()) {
    setStatus({ state: "error", message: "unsupported browser" });
    return;
  }
  if (current || starting) return;
  setStatus({ state: "loading", loaded: 0, total: 1, stage: "download" });
  starting = loadManifest().then((m) => {
    starting = null;
    if (!m) {
      setStatus({ state: "error", message: "the engine's file list couldn't be loaded (are you offline?)" });
      return;
    }
    manifest = m;
    current = startWorker(m, true);
  });
}

/** Resolves once the engine is ready, or rejects with its error. */
export function engineReady(): Promise<void> {
  ensureEngine();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (status.state === "ready" && current) {
        off();
        current.ready.then(resolve, reject);
      } else if (status.state === "error") {
        off();
        reject(new Error(status.message));
      }
    };
    const off = subscribeEngine(check);
    check();
  });
}

const failed = (message: string): RunResult => ({ stdout: "", stderr: "", output: "", exitCode: null, timedOut: false, truncated: false, ms: 0, files: {}, callStart: null, callError: false, loadInput: false, callValue: null, internalError: message });

/** Replaces the worker (after a timeout or a crash): the new one starts Python from the cache. */
function replaceWorker() {
  current?.worker.terminate();
  current = manifest ? startWorker(manifest, false) : null;
}

/**
 * Runs cases from `first` on in the current worker. Resolves with the index of the next case still
 * to run: after a timeout the worker is killed and the caller continues in a new one.
 */
function runBatch(files: SourceFile[], main: string, cases: RunInput[], first: number, timeLimitMs: number, results: RunResult[]): Promise<number> {
  return new Promise((resolve) => {
    const slot = current!;
    const worker = slot.worker;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let index = -1;
    let started = 0;
    const asked = performance.now();
    let workerStartMs: number | undefined;
    // What the running case printed so far: each stream, and both in the order they came.
    const partial = { stdout: "", stderr: "", output: "" };
    let done = false;
    const finish = (next: number, kill: boolean) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      if (kill) replaceWorker();
      resolve(next);
    };
    const arm = (ms: number, onTimeout: () => void) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onTimeout, ms);
    };
    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "start") {
        index = m.index;
        started = performance.now();
        partial.stdout = partial.stderr = partial.output = "";
        if (index === first) workerStartMs = started - asked;
        arm(timeLimitMs, () => {
          // What the program printed before it was stopped is kept, so the learner can see where it got stuck.
          results[index] = { ...partial, exitCode: null, timedOut: true, truncated: false, ms: performance.now() - started, files: {}, callStart: null, callError: false, loadInput: false, callValue: null, workerStartMs: index === first ? workerStartMs : undefined };
          finish(index + 1, true);
        });
      } else if (m.type === "output") {
        if (m.index === index)
          for (const c of m.chunks as { stream: "stdout" | "stderr"; text: string }[]) {
            partial[c.stream] += c.text;
            partial.output += c.text;
          }
      } else if (m.type === "result") {
        results[m.index] = m.index === first ? { ...m.result, workerStartMs } : m.result;
      } else if (m.type === "done") {
        finish(cases.length, false);
      } else if (m.type === "fatal") {
        results[Math.max(index, first)] = failed(m.message);
        finish(Math.max(index, first) + 1, true);
      }
    };
    const onError = (e: ErrorEvent) => {
      // Python ran out of memory or the WebAssembly stack overflowed: this case fails, the rest go on in a new worker.
      results[Math.max(index, first)] = failed(e.message || "the Python engine stopped unexpectedly");
      finish(Math.max(index, first) + 1, true);
    };
    arm(STARTUP_LIMIT_MS, () => {
      results[first] = failed("the Python engine took too long to start");
      finish(cases.length, true);
    });
    slot.ready.then(
      () => {
        if (done) return;
        worker.onmessage = onMessage;
        worker.onerror = onError;
        const plain = Object.fromEntries(files.map((f) => [f.path, f.text]));
        worker.postMessage({ type: "run", files: plain, main, cases, first });
      },
      (err) => {
        results[first] = failed(err instanceof Error ? err.message : String(err));
        finish(cases.length, false);
      },
    );
  });
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Run a program once per input (in order), killing any case that runs past timeLimitMs. `main` is
 * the file Python starts (main.py); the other files are modules it can import.
 */
export function runPython(files: SourceFile[], inputs: RunInput[], opts: { main?: string; timeLimitMs?: number } = {}): Promise<RunResult[]> {
  const job = queue.then(async () => {
    try {
      await engineReady();
    } catch (e) {
      return (inputs.length ? inputs : [{}]).map(() => failed(e instanceof Error ? e.message : String(e)));
    }
    const cases = inputs.length ? inputs : [{}];
    const results: RunResult[] = [];
    let next = 0;
    while (next < cases.length) {
      if (!current) replaceWorker();
      if (!current) {
        results[next] = failed("the Python engine isn't running");
        break;
      }
      next = await runBatch(files, opts.main ?? "main.py", cases, next, opts.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS, results);
    }
    for (let i = 0; i < cases.length; i++) results[i] ??= failed("this case was not run");
    return results;
  });
  queue = job.catch(() => {});
  return job;
}

export async function clearEngineCache() {
  for (const k of await caches.keys()) if (k.startsWith(CACHE_PREFIX)) await caches.delete(k);
}
