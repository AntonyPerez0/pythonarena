// After vite build and scripts/prerender.mjs: fills in the service worker's file list and version,
// and checks the workers' size budgets.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { writeNpmLicenses } from './npm-licenses.mjs';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');

const licenses = writeNpmLicenses(root, join(dist, 'licenses', 'npm-packages.txt'));
console.log(`finish-build: licenses of ${licenses.count} npm packages in licenses/npm-packages.txt`);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(dist)
  .map((f) => relative(dist, f).split('\\').join('/'))
  .filter((f) => !f.startsWith('engine/') && f !== 'sw.js' && !f.endsWith('.map'));
// Pages and their files are saved for offline use; license texts are not needed offline, and the
// Pro Track's zips (pro/<id>.zip, for a computer) are fetched when downloaded, never saved (sw.js).
const offline = (f) => !f.startsWith('licenses/') && f !== 'robots.txt' && f !== 'sitemap.xml' && !/^pro\/[^/]+\.zip$/.test(f);
const assets = files
  .filter(offline)
  .map((f) => (f.endsWith('index.html') ? f.slice(0, -'index.html'.length) : f));
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);

const swPath = join(dist, 'sw.js');
const sw = readFileSync(swPath, 'utf8')
  .replace('const VERSION = "dev";', `const VERSION = ${JSON.stringify(version)};`)
  .replace('const ASSETS = [];', `const ASSETS = ${JSON.stringify(assets)};`);
writeFileSync(swPath, sw);

console.log(`finish-build: service worker ${version} with ${assets.length} files`);

// Lighthouse's script budget only sees the page's own scripts, so the worker gets its own budget
// (Python itself, Pyodide, isn't in it: the worker downloads it from engine/). Most of the worker is
// Python as text, the harness and pygame without a screen, so each part has a budget of its own: a
// library pulled into the worker's code shows, and so does a harness that grows past reason.
const CARRIED = ['src/engine/arena.py', 'src/engine/arena_pygame.py'];
const BUDGET = { code: 20_000, python: 90_000 };
const python = CARRIED.reduce((n, f) => n + statSync(join(root, f)).size, 0);
for (const f of files.filter((f) => /^assets\/run\.worker-.*\.js$/.test(f))) {
  // The Python is in the worker as strings, a little longer than the files with their escapes, so this
  // counts the code a little high.
  const code = statSync(join(dist, f)).size - python;
  const kb = (n) => (n / 1000).toFixed(0);
  console.log(`finish-build: run.worker's code ${kb(code)} KB (budget ${kb(BUDGET.code)} KB), the Python it carries ${kb(python)} KB (budget ${kb(BUDGET.python)} KB)`);
  if (code > BUDGET.code || python > BUDGET.python) {
    console.error(`finish-build: ${f} is over its budget`);
    process.exit(1);
  }
}
