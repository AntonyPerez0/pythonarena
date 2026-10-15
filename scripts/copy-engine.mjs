// Copies Pyodide (CPython compiled to WebAssembly, from the pinned npm package) into public/engine,
// with gzip copies and one manifest, and the packages a program may import (engine-packages/, checked
// against Pyodide's lock file), which the run worker downloads the first time a program imports one. The run worker downloads the files once (the .gz copies, unpacked
// with DecompressionStream as they arrive), keeps them in Cache Storage and starts Python from there.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname;
const from = join(root, "node_modules", "pyodide");
const out = join(root, "public", "engine");
// Everything Python needs to start: the loader, the Emscripten module, the interpreter, the standard library.
const FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
// Packages a program can import, downloaded only when one does (engine-packages/, Pyodide's own builds, unchanged):
// the package's name in pyodide-lock.json, and the imports that need it.
const PACKAGES = { "pygame-ce": ["pygame"] };

if (!existsSync(join(from, "package.json"))) {
  console.error("copy-engine: node_modules/pyodide is missing; run npm install");
  process.exit(process.env.CI ? 1 : 0);
}
const pkg = JSON.parse(readFileSync(join(from, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(from, "pyodide-lock.json"), "utf8"));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const manifest = { version: "", pyodide: pkg.version, python: lock.info.python, files: {}, gzip: {}, order: FILES, packages: {} };
const hash = createHash("sha256");
for (const name of FILES) {
  const data = readFileSync(join(from, name));
  hash.update(`${name}:${createHash("sha256").update(data).digest("hex")}\n`);
  writeFileSync(join(out, name), data);
  manifest.files[name] = data.length;
  const gz = gzipSync(data, { level: 9 });
  if (gz.length < data.length * 0.9) {
    writeFileSync(join(out, name + ".gz"), gz);
    manifest.gzip[name] = gz.length;
  }
}
for (const [name, imports] of Object.entries(PACKAGES)) {
  const entry = lock.packages[name];
  if (!entry) throw new Error(`copy-engine: ${name} isn't in Pyodide ${pkg.version}'s pyodide-lock.json`);
  const source = join(root, "engine-packages", entry.file_name);
  if (!existsSync(source)) throw new Error(`copy-engine: engine-packages/${entry.file_name} is missing (Pyodide ${pkg.version}'s build of ${name}, from https://cdn.jsdelivr.net/pyodide/v${pkg.version}/full/${entry.file_name})`);
  const data = readFileSync(source);
  const sha = createHash("sha256").update(data).digest("hex");
  if (sha !== entry.sha256) throw new Error(`copy-engine: engine-packages/${entry.file_name} isn't the file pyodide-lock.json names (SHA-256 ${sha}, not ${entry.sha256})`);
  hash.update(`${entry.file_name}:${sha}\n`);
  writeFileSync(join(out, entry.file_name), data);
  manifest.files[entry.file_name] = data.length;
  const gz = gzipSync(data, { level: 9 });
  if (gz.length < data.length * 0.9) {
    writeFileSync(join(out, entry.file_name + ".gz"), gz);
    manifest.gzip[entry.file_name] = gz.length;
  }
  manifest.packages[name] = { file: entry.file_name, version: entry.version, imports };
}
manifest.version = `${pkg.version}-${hash.digest("hex").slice(0, 10)}`;
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
// The license texts are published with the files they cover (engine-licenses/, kept in this repository).
mkdirSync(join(out, "licenses"), { recursive: true });
for (const f of readdirSync(join(root, "engine-licenses"))) copyFileSync(join(root, "engine-licenses", f), join(out, "licenses", f));
const total = FILES.reduce((a, f) => a + (manifest.gzip[f] ?? manifest.files[f]), 0);
const extra = Object.values(manifest.packages).map((p) => `${p.file.split("-")[0]} ${((manifest.gzip[p.file] ?? manifest.files[p.file]) / 1e6).toFixed(1)} MB`);
console.log(`copy-engine: Pyodide ${pkg.version} (Python ${lock.info.python}), ${FILES.length} files, ${(total / 1e6).toFixed(1)} MB to download, version ${manifest.version}${extra.length ? `; on demand: ${extra.join(", ")}` : ""}`);
