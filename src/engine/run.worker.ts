/// <reference lib="webworker" />
// The run worker: downloads Pyodide once into Cache Storage, starts Python from there and runs
// programs with src/engine/arena.py, one test case after another. The page kills this worker when a
// case runs past the time limit (an endless loop) and carries on in a new one, which starts from the
// cache in a second or two.
import harness from "./arena.py?raw";
import pygameShim from "./arena_pygame.py?raw";
import { CACHE_PREFIX, downloadSize, type Manifest } from "./manifest";
import type { RunInput, RunResult, WindowResult } from "./types";

declare const self: DedicatedWorkerGlobalScope;

type PyProxy = { toJs(o?: object): unknown; destroy(): void };
type Pyodide = {
  toPy(v: unknown): PyProxy;
  pyimport(name: string): { run: (spec: PyProxy, sink: (stream: string, text: string | PyProxy) => void, workdir: string) => PyProxy; uses_pygame: (files: PyProxy) => boolean };
  FS: { mkdirTree(p: string): void; writeFile(p: string, data: string): void };
  runPython(code: string): unknown;
  loadPackage(url: string, options?: object): Promise<unknown>;
};

const CONTENT_TYPES: Record<string, string> = { wasm: "application/wasm", mjs: "text/javascript", json: "application/json", zip: "application/zip" };
const typeOf = (name: string) => CONTENT_TYPES[name.split(".").pop() ?? ""] ?? "application/octet-stream";

let py: Pyodide | null = null;
let runner: ReturnType<Pyodide["pyimport"]>["run"] | null = null;
let usesPygame: ReturnType<Pyodide["pyimport"]>["uses_pygame"] | null = null;
let runs = 0;
let engine: { base: string; manifest: Manifest; cache: Cache } | null = null;
/** The packages loaded into Python so far (pygame-ce), each loaded once per worker. */
const loaded = new Map<string, Promise<void>>();

const post = (m: unknown, transfer: Transferable[] = []) => self.postMessage(m, transfer);

/** Reads a response's body to the end, reporting each chunk's size. */
async function readAll(res: Response, onChunk: (n: number) => void): Promise<Uint8Array> {
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    onChunk(value.length);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return all;
}

/**
 * Copies the packages (pygame-ce) that an older version of the engine had saved, because a program
 * imported them, into this version's cache, so they still work offline once download() deletes the
 * older caches. Only an unchanged wheel is copied: the same file name, which carries its version and
 * platform. A new wheel is downloaded when a program imports it (loadPackage), as for a learner who
 * never ran it: the download the page asks about on mobile data is the engine alone.
 */
async function keepPackages(base: string, m: Manifest, cache: Cache) {
  for (const key of await caches.keys()) {
    if (!key.startsWith(CACHE_PREFIX) || key === CACHE_PREFIX + m.version) continue;
    const old = await caches.open(key);
    for (const pkg of Object.values(m.packages ?? {})) {
      const wheel = await old.match(base + pkg.file);
      if (wheel && !(await cache.match(base + pkg.file))) await cache.put(base + pkg.file, wheel);
    }
  }
}

/** Downloads every engine file that isn't in the cache yet, with progress, and saves it there (unpacked). */
async function download(base: string, m: Manifest, cache: Cache) {
  const missing: string[] = [];
  for (const name of m.order) if (!(await cache.match(base + name))) missing.push(name);
  const total = missing.reduce((a, f) => a + downloadSize(m, f), 0);
  let loaded = 0;
  post({ type: "progress", loaded, total: Math.max(total, 1), stage: missing.length ? "download" : "cache" });
  for (const name of missing) {
    const gz = m.gzip[name] != null && typeof DecompressionStream === "function";
    const res = await fetch(base + name + (gz ? ".gz" : ""), { cache: "no-cache" });
    if (!res.ok) throw new Error(`couldn't download ${name} (HTTP ${res.status})`);
    let body = await readAll(res, (n) => {
      loaded += n;
      post({ type: "progress", loaded, total, stage: "download" });
    });
    // Some servers unpack a .gz file on the way already (Content-Encoding: gzip); then it's the file itself.
    if (gz && body[0] === 0x1f && body[1] === 0x8b) body = new Uint8Array(await new Response(new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    if (body.length !== m.files[name]) throw new Error(`${name} arrived incomplete (${body.length} of ${m.files[name]} bytes)`);
    await cache.put(base + name, new Response(body as BlobPart, { headers: { "Content-Type": typeOf(name), "Content-Length": String(body.length) } }));
  }
  // Kept packages are only for offline use: one that can't be copied is downloaded when a program
  // imports it, and never stops Python from starting.
  await keepPackages(base, m, cache).catch(() => {});
  // The manifest too, so the engine can start offline.
  await cache.put(base + "manifest.json", new Response(JSON.stringify(m), { headers: { "Content-Type": "application/json" } }));
  // Older versions of the engine are no longer needed.
  for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX) && key !== CACHE_PREFIX + m.version) await caches.delete(key);
}

/** A cached engine file as a module the worker can import. */
async function importCached(cache: Cache, url: string) {
  const res = await cache.match(url);
  if (!res) throw new Error(`${url} is missing from the cache`);
  const blob = new Blob([await res.arrayBuffer()], { type: "text/javascript" });
  const href = URL.createObjectURL(blob);
  try {
    return await import(/* @vite-ignore */ href);
  } finally {
    URL.revokeObjectURL(href);
  }
}

async function start(base: string, m: Manifest) {
  const cache = await caches.open(CACHE_PREFIX + m.version);
  engine = { base, manifest: m, cache };
  await download(base, m, cache);
  // Pyodide fetches its files (the interpreter, the standard library) itself: serve them from the cache.
  const realFetch = self.fetch.bind(self);
  self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(base)) {
      const hit = await cache.match(url);
      if (hit) return hit;
    }
    return realFetch(input, init);
  };
  post({ type: "progress", loaded: 1, total: 1, stage: "start" });
  const loader = await importCached(cache, base + "pyodide.mjs");
  const asm = await importCached(cache, base + "pyodide.asm.mjs");
  const lockFileContents = await (await cache.match(base + "pyodide-lock.json"))!.json();
  py = (await loader.loadPyodide({
    indexURL: base,
    lockFileContents,
    createPyodideModule: asm.default,
    // Nothing is printed outside a run; during a run, the harness takes the output.
    stdout: () => {},
    stderr: () => {},
    // UTF-8 mode, as the build's CPython runs (-X utf8): open() without an encoding says utf-8, not UTF-8.
    env: { HOME: "/home/pyodide", PYTHONHASHSEED: "random", PYTHONUTF8: "1" },
  })) as Pyodide;
  py.FS.mkdirTree("/arena");
  py.FS.writeFile("/arena/arena.py", harness);
  py.FS.writeFile("/arena/arena_pygame.py", pygameShim);
  py.runPython("import sys\nsys.path.insert(0, '/arena')\nimport arena");
  const arena = py.pyimport("arena");
  runner = arena.run;
  usesPygame = arena.uses_pygame;
}

/**
 * Loads a package (pygame-ce) into Python, downloading its wheel into the cache the first time
 * (the page shows the progress). Pyodide fetches the wheel itself, from the cache.
 */
function loadPackage(name: string): Promise<void> {
  const known = loaded.get(name);
  if (known) return known;
  const job = (async () => {
    const { base, manifest: m, cache } = engine!;
    const pkg = m.packages?.[name];
    if (!pkg) throw new Error(`${name} isn't part of this version of the engine`);
    const url = base + pkg.file;
    if (!(await cache.match(url))) {
      const total = downloadSize(m, pkg.file);
      let got = 0;
      post({ type: "package", name, loaded: 0, total });
      const gz = m.gzip[pkg.file] != null && typeof DecompressionStream === "function";
      const res = await fetch(url + (gz ? ".gz" : ""), { cache: "no-cache" });
      if (!res.ok) throw new Error(`couldn't download ${name} (HTTP ${res.status})`);
      let body = await readAll(res, (n) => {
        got += n;
        post({ type: "package", name, loaded: got, total });
      });
      if (gz && body[0] === 0x1f && body[1] === 0x8b) body = new Uint8Array(await new Response(new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
      if (body.length !== m.files[pkg.file]) throw new Error(`${name} arrived incomplete (${body.length} of ${m.files[pkg.file]} bytes)`);
      await cache.put(url, new Response(body as BlobPart, { headers: { "Content-Type": "application/zip", "Content-Length": String(body.length) } }));
      post({ type: "package", name, loaded: total, total, done: true });
    }
    await py!.loadPackage(url, { messageCallback: () => {}, errorCallback: () => {} });
  })();
  loaded.set(name, job);
  job.catch(() => loaded.delete(name));
  return job;
}

/** Loads the packages a program imports (pygame for `import pygame`) before it runs. */
async function packagesFor(files: Record<string, string>, cases: RunInput[]) {
  const proxy = py!.toPy(files);
  let pygame = false;
  try {
    pygame = !!usesPygame!(proxy) || cases.some((c) => c.window);
  } finally {
    proxy.destroy();
  }
  if (pygame && engine?.manifest.packages?.["pygame-ce"]) await loadPackage("pygame-ce");
}

type Converted = { exit: number; truncated: boolean; files: Map<string, string | Uint8Array> | Record<string, string | Uint8Array>; callStart: number | null; callError: boolean; loadInput: boolean; callValue: "none" | "value" | null; window: WindowResult | null };
type FrameOut = { index: number; log: string; png: Uint8Array | null; title: string; ms: number; same?: boolean; again?: boolean };

/** Runs one case and reports its output as it comes (so a stopped run still shows what it printed). */
function runCase(index: number, files: Record<string, string>, main: string, c: RunInput): RunResult {
  const parts = { stdout: "", stderr: "", output: "" };
  let pending: { stream: string; text: string }[] = [];
  const flush = () => {
    if (pending.length) post({ type: "output", index, chunks: pending });
    pending = [];
  };
  let lastPicture: Uint8Array | null = null;
  const sink = (stream: string, text: string | PyProxy) => {
    if (stream === "frame") {
      // A frame of a pygame window: what the program printed until now goes first, then the frame. A frame
      // marked "again" is the last one once more, with the picture it didn't get when it was shown.
      const f = (text as PyProxy).toJs({ dict_converter: Object.fromEntries }) as FrameOut;
      if (f.png) lastPicture = f.png;
      flush();
      if (!f.again) post({ type: "frame", index, frame: { index: f.index, log: f.log, png: f.png, title: f.title, ms: f.ms, ...(f.same ? { same: true } : {}) } });
      return;
    }
    if (typeof text !== "string") return;
    parts[stream as "stdout" | "stderr"] += text;
    parts.output += text;
    pending.push({ stream, text });
    // The worker is busy until the program ends, so each piece goes out as it's printed: the last line before an
    // endless loop must reach the page, which keeps what the program printed when it stops it.
    flush();
  };
  // Keys left out rather than null: toPy turns null into a JsNull, not None.
  const spec = py!.toPy({ files, main, stdin: c.stdin ?? "", given: c.files ?? {}, args: c.args ?? [], ...(c.call != null ? { call: c.call } : {}), ...(c.window ? { window: c.window } : {}) });
  const started = performance.now();
  let r: Converted;
  try {
    const result = runner!(spec, sink, `/tmp/arena/run${++runs}`);
    r = result.toJs({ dict_converter: Object.fromEntries }) as Converted;
    result.destroy();
  } finally {
    spec.destroy();
  }
  flush();
  const ms = performance.now() - started;
  const left = r.files instanceof Map ? Object.fromEntries(r.files) : r.files;
  const win = r.window ? { ...(r.window instanceof Map ? Object.fromEntries(r.window) : r.window), png: lastPicture } : null;
  return { ...parts, exitCode: r.exit, timedOut: false, truncated: r.truncated, ms, files: left, callStart: r.callStart ?? null, callError: !!r.callError, loadInput: !!r.loadInput, callValue: r.callValue ?? null, window: win as WindowResult | null };
}

let ready: Promise<void> | null = null;

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "init") {
    ready = start(m.base, m.manifest).then(
      () => post({ type: "ready" }),
      (err) => {
        post({ type: "fatal", message: err instanceof Error ? err.message : String(err) });
        throw err;
      },
    );
  } else if (m.type === "run") {
    try {
      await ready;
    } catch {
      return;
    }
    const cases = m.cases as RunInput[];
    try {
      await packagesFor(m.files, cases);
    } catch (err) {
      post({ type: "fatal", message: err instanceof Error ? err.message : String(err) });
      return;
    }
    for (let i = m.first as number; i < cases.length; i++) {
      post({ type: "start", index: i });
      try {
        const result = runCase(i, m.files, m.main, cases[i]);
        post({ type: "result", index: i, result });
      } catch (err) {
        // The harness itself failed (not the learner's program): the interpreter may be broken, so this worker stops.
        post({ type: "fatal", message: err instanceof Error ? err.message : String(err) });
        return;
      }
    }
    post({ type: "done" });
  }
};
