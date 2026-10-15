// Replays every program the content build checked (fidelity/out/content-checks.json: lesson
// examples, solutions on their tests, drills, project milestones) in Pyodide, the engine the browser
// uses, running in Node, and fails if anything differs from what the reference CPython printed. The
// harness is the same file (src/engine/arena.py) in both, so a difference means CPython and Pyodide
// behave differently for that program.
//
// Usage: npm run content (writes the checks), then npm run content:pyodide.
//   CONTENT_SHARD=k/n   replay only every n-th program, starting at the k-th (for CI jobs side by side)
import fs from "node:fs";
import path from "node:path";
import { loadPyodide } from "pyodide";
import { normalizeOutput } from "../src/grader/assemble.js";
import { fileContent } from "../src/grader/writes.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CHECKS = path.join(ROOT, "fidelity", "out", "content-checks.json");
if (!fs.existsSync(CHECKS)) {
  console.error("content-pyodide: run npm run content first (it writes fidelity/out/content-checks.json)");
  process.exit(1);
}
const { python, checks: all } = JSON.parse(fs.readFileSync(CHECKS, "utf8"));
// Programs that use pygame already ran in Pyodide in the build (scripts/content/pyodide.mjs): nothing to compare.
const PYGAME = /^[ \t]*(?:import[ \t]+pygame\b|from[ \t]+pygame\b)/m;
const checks = all.filter((c) => c.spec.window == null && !Object.values(c.spec.files ?? {}).some((t) => typeof t === "string" && PYGAME.test(t)));
const shard = /^(\d+)\/(\d+)$/.exec(process.env.CONTENT_SHARD ?? "");
const mine = shard ? checks.filter((_, i) => i % Number(shard[2]) === Number(shard[1]) - 1) : checks;

const py = await loadPyodide({ indexURL: path.join(ROOT, "node_modules", "pyodide") + "/", stdout: () => {}, stderr: () => {} });
const version = py.runPython("import sys; '%d.%d.%d' % sys.version_info[:3]");
if (version !== python) {
  console.error(`content-pyodide: Pyodide runs Python ${version}, but the checks were made with CPython ${python}`);
  process.exit(1);
}
py.FS.mkdirTree("/arena");
py.FS.writeFile("/arena/arena.py", fs.readFileSync(path.join(ROOT, "src", "engine", "arena.py"), "utf8"));
py.runPython("import sys\nsys.path.insert(0, '/arena')\nimport arena");
const run = py.pyimport("arena").run;

const t0 = Date.now();
const problems = [];
let n = 0;
for (const c of mine) {
  n++;
  const parts = { stdout: "", stderr: "", output: "" };
  const sink = (stream, text) => {
    parts[stream] += text;
    parts.output += text;
  };
  const spec = { ...c.spec };
  if (spec.call == null) delete spec.call;
  if (spec.repl == null) delete spec.repl;
  const given = {};
  for (const [name, data] of Object.entries(spec.given ?? {})) given[name] = typeof data === "string" ? data : fileContent(data);
  spec.given = given;
  const p = py.toPy(spec);
  let r;
  try {
    const result = run(p, sink, `/tmp/replay${n}`);
    r = result.toJs({ dict_converter: Object.fromEntries });
    result.destroy();
  } catch (e) {
    problems.push(`${c.where}: the harness failed in Pyodide: ${e.message}`);
    continue;
  } finally {
    p.destroy();
  }
  if (normalizeOutput(parts.stdout) !== normalizeOutput(c.stdout)) problems.push(`${c.where}: stdout differs.\nCPython:\n${c.stdout}\nPyodide:\n${parts.stdout}`);
  if (normalizeOutput(parts.stderr) !== normalizeOutput(c.stderr ?? "")) problems.push(`${c.where}: stderr differs.\nCPython:\n${c.stderr}\nPyodide:\n${parts.stderr}`);
  if ((r.exit ?? 0) !== (c.exit ?? 0)) problems.push(`${c.where}: exit code ${r.exit} in Pyodide, ${c.exit} in CPython`);
  if (c.files) {
    const files = r.files instanceof Map ? Object.fromEntries(r.files) : r.files;
    for (const [name, want] of Object.entries(c.files)) {
      const got = files[name];
      const a = fileContent(want);
      const same = typeof a === "string" ? got === a : got instanceof Uint8Array && got.length === a.length && got.every((x, i) => x === a[i]);
      if (!same) problems.push(`${c.where}: the file ${name} differs`);
    }
  }
}
console.log(`content-pyodide: ${mine.length} programs${shard ? ` (shard ${shard[1]} of ${shard[2]})` : ""} replayed in Pyodide (Python ${version}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (problems.length) {
  console.error(`${problems.length} differences:\n\n${problems.slice(0, 50).join("\n\n")}`);
  process.exit(1);
}
console.log("content-pyodide: every program prints the same in Pyodide as in CPython");
