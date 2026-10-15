// One Pyodide for scripts/content/pyodide.mjs's pool, in a process of its own: it starts Pyodide with
// the engine's packages (pygame-ce) and the harness, then runs one spec per message and sends back the
// result. A process (rather than a worker thread) so that a program past its time limit is stopped by
// killing it, and a crash of the WebAssembly engine ends only this process, never the build.
import fs from "node:fs";
import path from "node:path";

const { PYODIDE_INDEX, ARENA_ENGINE, PYODIDE_WHEELS, PYTHONHASHSEED } = process.env;

const send = (m) => new Promise((resolve) => process.send(m, resolve));

try {
  const { loadPyodide } = await import(path.join(PYODIDE_INDEX, "pyodide.mjs"));
  const py = await loadPyodide({ indexURL: PYODIDE_INDEX + "/", stdout: () => {}, stderr: () => {}, env: { HOME: "/home/pyodide", PYTHONHASHSEED } });
  for (const wheel of JSON.parse(PYODIDE_WHEELS || "[]")) await py.loadPackage(wheel, { messageCallback: () => {}, errorCallback: () => {} });
  py.FS.mkdirTree("/arena");
  py.FS.writeFile("/arena/arena.py", fs.readFileSync(path.join(ARENA_ENGINE, "arena.py"), "utf8"));
  py.FS.writeFile("/arena/arena_pygame.py", fs.readFileSync(path.join(ARENA_ENGINE, "arena_pygame.py"), "utf8"));
  py.runPython("import sys\nsys.path.insert(0, '/arena')\nimport arena");
  const run = py.pyimport("arena").run;
  let count = 0;

  process.on("message", async (spec) => {
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
      await send({ ...parts, exit: r.exit, truncated: r.truncated, files, callStart: r.callStart ?? null, callError: !!r.callError, loadInput: !!r.loadInput, callValue: r.callValue ?? null, repl: r.repl ?? null, window: r.window ?? null, frames });
    } catch (e) {
      await send({ failed: String((e && e.message) || e) });
    } finally {
      p.destroy();
    }
  });
  await send({ ready: true });
} catch (e) {
  await send({ failed: "Pyodide didn't start: " + ((e && e.message) || e) });
  process.exit(1);
}
