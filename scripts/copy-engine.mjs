// Copies Pyodide (CPython compiled to WebAssembly, from the pinned npm package) into public/engine,
// with gzip copies and one manifest. The run worker downloads the files once (the .gz copies, unpacked
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

if (!existsSync(join(from, "package.json"))) {
  console.error("copy-engine: node_modules/pyodide is missing; run npm install");
  process.exit(process.env.CI ? 1 : 0);
}
const pkg = JSON.parse(readFileSync(join(from, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(from, "pyodide-lock.json"), "utf8"));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const manifest = { version: "", pyodide: pkg.version, python: lock.info.python, files: {}, gzip: {}, order: FILES };
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
manifest.version = `${pkg.version}-${hash.digest("hex").slice(0, 10)}`;
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
// The license texts are published with the files they cover (engine-licenses/, kept in this repository).
mkdirSync(join(out, "licenses"), { recursive: true });
for (const f of readdirSync(join(root, "engine-licenses"))) copyFileSync(join(root, "engine-licenses", f), join(out, "licenses", f));
const total = FILES.reduce((a, f) => a + (manifest.gzip[f] ?? manifest.files[f]), 0);
console.log(`copy-engine: Pyodide ${pkg.version} (Python ${lock.info.python}), ${FILES.length} files, ${(total / 1e6).toFixed(1)} MB to download, version ${manifest.version}`);
