// The Pro Track's projects (pro-track/<id>/, solved in pro-track-solutions/<id>/): what a project
// folder must contain, checked without running Python, the zip the site offers for download, and
// reading pytest's JUnit XML report. Node's own modules only, so the CI job pro-track runs it without
// npm ci. Used by scripts/pro-track-check.mjs (with Python and pytest), the site build (vite.config.ts
// and scripts/prerender.mjs, through scripts/pro-track/site.mjs) and the unit tests
// (scripts/pro-track.test.mjs). pro-track/README.md, "For contributors", says the same in words.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/**
 * The versions every project's requirements.txt pins. The check requires exactly these, so the
 * projects stay alike: to move to newer ones, change them here and in every requirements.txt
 * together, then run npm run pro-track-check.
 */
export const PINNED = {
  /** pytest, which runs the tests. */
  pytest: "9.1.1",
  /** pygame-ce, for a project with a game window. */
  pygame: "2.5.8",
};

/** The packages a project's requirements.txt may list, with the version each must have. */
export const PACKAGES = { pytest: PINNED.pytest, "pygame-ce": PINNED.pygame };

/** The Python version the workflow and the README name (the course's, the version Pyodide runs in the browser). */
export const PYTHON = "3.14";

/** The README's sections (## headings), in this order; others may come between them or after. */
export const README_SECTIONS = ["What you'll build", "What you need", "Steps", "Run the tests", "Run the program", "Put it on GitHub (optional)"];

/** .github/workflows/test.yml of every project, word for word: it runs the tests in the learner's own GitHub repository. */
export const WORKFLOW = `# Runs the project's tests on GitHub's computers on every push and pull request.
# See the results in your repository's Actions tab.
name: Tests

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v6
        with:
          python-version: "${PYTHON}"
      - name: Install what the project needs
        run: python -m pip install -r requirements.txt
      - name: Run the tests
        run: python -m pytest
`;

/** pytest.ini of every project, word for word: tests in tests/, the project's folder on the import path. */
export const PYTEST_INI = `[pytest]
testpaths = tests
pythonpath = .
`;

/** Files and folders never part of a project (made by Python, pytest or an editor): the check refuses them and the zip leaves them out. */
const JUNK = [/(^|\/)__pycache__\//, /\.py[co]$/, /(^|\/)\.pytest_cache\//, /(^|\/)\.venv\//, /(^|\/)venv\//, /(^|\/)\.idea\//, /(^|\/)\.vscode\//, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/, /(^|\/)(build|dist)\//, /\.egg-info\//, /~$/, /\.sw[po]$/, /(^|\/)report\.xml$/];
/** Files a project's program makes when it runs (a SQLite database): refused and left out the same way. */
const RUN_FILES = [/\.db$/, /\.sqlite3?$/, /-journal$/];
/** Whether a file is made by running the project's program (rather than by Python or an editor). */
export const isRunFile = (rel) => RUN_FILES.some((re) => re.test(rel));
export const isJunk = (rel) => isRunFile(rel) || JUNK.some((re) => re.test(rel));

/** The largest a project folder may be (its files together, before zipping). */
export const MAX_BYTES = 1_000_000;

/** A project's id: its folder's name, in kebab-case. */
export const ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** The package folder a project's code is in: its id without hyphens (word-stats has wordstats/). */
export const packageOf = (id) => id.replace(/-/g, "");

/** Every file under dir (relative paths with /, sorted by their bytes so the order is the same everywhere), junk included. */
export function walk(dir) {
  const out = [];
  const visit = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      // A link or anything else that isn't a folder is listed too, so the check can refuse it.
      if (e.isDirectory()) visit(r);
      else out.push(r);
    }
  };
  if (fs.existsSync(dir)) visit("");
  return out.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

/** The project folders (pro-track/<id>/ with a requirements.txt), sorted by id. */
export function projectIds(root) {
  const dir = path.join(root, "pro-track");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "requirements.txt")))
    .map((e) => e.name)
    .sort();
}

// ---------------------------------------------------------------- requirements.txt

/** The packages a requirements.txt pins: name to version, and the lines it can't read. */
export function readRequirements(text) {
  const packages = {};
  const bad = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*==\s*([0-9]+(?:\.[0-9]+)*)$/.exec(line);
    if (m) packages[m[1].toLowerCase()] = m[2];
    else bad.push(line);
  }
  return { packages, bad };
}

/** What's wrong with a project's requirements.txt (empty: nothing). */
export function requirementsProblems(text) {
  const { packages, bad } = readRequirements(text);
  const out = [];
  for (const line of bad) out.push(`"${line}" isn't a pinned package (name==version, such as pytest==${PINNED.pytest})`);
  for (const [name, version] of Object.entries(packages)) {
    const want = PACKAGES[name];
    if (!want) out.push(`${name} isn't a package the projects use (${Object.keys(PACKAGES).join(", ")}); add it to PACKAGES in scripts/pro-track/project.mjs if it's really needed`);
    else if (version !== want) out.push(`${name} must be version ${want} (the version every project pins), not ${version}`);
  }
  if (!packages.pytest) out.push(`needs pytest==${PINNED.pytest}`);
  return out;
}

// ---------------------------------------------------------------- README.md

/** The README's title (its first line, "# Title"), the paragraph under it, and its ## sections by heading. */
export function readReadme(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const title = /^# (.+)$/.exec(lines[0] ?? "")?.[1]?.trim() ?? null;
  const sections = [];
  let cur = null;
  const intro = [];
  let fence = false;
  for (const line of lines.slice(1)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && /^## (.+)$/.exec(line);
    if (h) {
      cur = { heading: h[1].trim(), body: [] };
      sections.push(cur);
    } else if (cur) cur.body.push(line);
    else intro.push(line);
  }
  const introText = intro.join("\n").trim();
  return {
    title,
    summary: introText.split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? "",
    intro: introText,
    sections: sections.map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() })),
  };
}

/** What's wrong with a project's README.md. */
export function readmeProblems(text) {
  const r = readReadme(text);
  const out = [];
  if (!r.title) out.push('the first line must be the title: "# The title"');
  if (!r.summary) out.push("needs a paragraph under the title: what the project is, in one to three sentences (the site shows it in the list)");
  else if (r.summary.length > 400) out.push(`the paragraph under the title is ${r.summary.length} characters; at most 400 (it's the summary in the site's list)`);
  const heads = r.sections.map((s) => s.heading);
  let at = -1;
  for (const want of README_SECTIONS) {
    const k = heads.indexOf(want);
    if (k < 0) out.push(`needs the section "## ${want}"`);
    else if (k < at) out.push(`the section "## ${want}" must come after "## ${README_SECTIONS[README_SECTIONS.indexOf(want) - 1]}"`);
    else at = k;
  }
  for (const s of r.sections) if (!s.body) out.push(`the section "## ${s.heading}" is empty`);
  const tests = r.sections.find((s) => s.heading === "Run the tests")?.body ?? "";
  if (!/python -m pytest|\bpytest\b/.test(tests)) out.push('"## Run the tests" must show the command python -m pytest');
  if (/[\u2013\u2014]/.test(text)) out.push("has an en or em dash; use a colon, a comma or two sentences");
  return out;
}

// ---------------------------------------------------------------- the folders

/**
 * What's wrong with pro-track/<id>/ and pro-track-solutions/<id>/, without running Python: the
 * files a project must have, its requirements.txt, pytest.ini, README.md and workflow, the starter's
 * TODOs, and the solution's files.
 */
export function folderProblems(root, id) {
  const dir = path.join(root, "pro-track", id);
  const sol = path.join(root, "pro-track-solutions", id);
  const where = `pro-track/${id}`;
  const pkg = packageOf(id);
  const out = [];
  const say = (m) => out.push(`${where}: ${m}`);
  if (!ID.test(id)) say("the folder's name is the project's id, in kebab-case (like word-stats)");
  const files = walk(dir);
  const read = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
  for (const f of files) {
    const st = fs.lstatSync(path.join(dir, f));
    if (!st.isFile()) say(`${f} isn't a plain file (a link?): only plain files go in a project`);
    else if (isRunFile(f)) say(`${f} is a file the program makes when you run it; delete it (the zip leaves such files out, and the learner's .gitignore does too)`);
    else if (isJunk(f)) say(`${f} is a file Python, pytest or an editor made; delete it (the zip leaves such files out, and the learner's .gitignore does too)`);
  }
  const size = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  if (size > MAX_BYTES) say(`its files come to ${size} bytes; at most ${MAX_BYTES}`);
  for (const need of ["requirements.txt", "pytest.ini", "README.md", ".gitignore", ".github/workflows/test.yml", `${pkg}/__init__.py`]) if (!files.includes(need)) say(`needs ${need}`);
  if (files.includes("requirements.txt")) for (const p of requirementsProblems(read("requirements.txt"))) say(`requirements.txt: ${p}`);
  if (files.includes("pytest.ini") && read("pytest.ini").replace(/\r\n/g, "\n") !== PYTEST_INI) say("pytest.ini must be the one in pro-track/README.md, word for word (PYTEST_INI in scripts/pro-track/project.mjs)");
  if (files.includes("README.md")) for (const p of readmeProblems(read("README.md"))) say(`README.md: ${p}`);
  if (files.includes(".gitignore") && !(/^\/?__pycache__\/?$/m.test(read(".gitignore")) && /^\/?\.pytest_cache\/?$/m.test(read(".gitignore")))) say(".gitignore must have the lines __pycache__/ and .pytest_cache/ (Python's and pytest's own files stay out of the learner's repository)");
  if (files.includes(".github/workflows/test.yml") && read(".github/workflows/test.yml").replace(/\r\n/g, "\n") !== WORKFLOW) say(".github/workflows/test.yml must be the workflow in pro-track/README.md, word for word (WORKFLOW in scripts/pro-track/project.mjs)");
  const code = files.filter((f) => f.startsWith(`${pkg}/`) && f.endsWith(".py"));
  const tests = files.filter((f) => f.startsWith("tests/") && f.endsWith(".py"));
  if (!code.length) say(`needs the starter code: .py files in ${pkg}/`);
  if (!tests.some((f) => /(^|\/)test_[\w]+\.py$/.test(f))) say("needs pytest tests: files named test_*.py in tests/");
  if (code.length && !code.some((f) => /#\s*TODO\b/.test(read(f)))) say("the starter code needs at least one # TODO where the learner writes code");
  for (const f of [...code, ...tests, ...files.filter((x) => x.endsWith(".py") && !code.includes(x) && !tests.includes(x))]) {
    const t = read(f);
    if (/[\u2013\u2014]/.test(t)) say(`${f} has an en or em dash`);
    if (/^\t/m.test(t)) say(`${f} indents with tabs; use 4 spaces`);
  }
  // The model solution: only files that replace or add code in the package folder.
  const solFiles = walk(sol);
  if (!fs.existsSync(sol)) say(`needs its model solution in pro-track-solutions/${id}/${pkg}/`);
  else if (!solFiles.length) say(`pro-track-solutions/${id}/ has no files`);
  for (const f of solFiles) {
    const sw = `pro-track-solutions/${id}/${f}`;
    if (!f.startsWith(`${pkg}/`) || !f.endsWith(".py")) {
      out.push(`${sw}: the solution holds only .py files in ${pkg}/ (the files that differ from the starter)`);
      continue;
    }
    if (files.includes(f) && fs.readFileSync(path.join(sol, f), "utf8") === read(f)) out.push(`${sw} is the same as the starter's; leave it out (the solution holds only the files that differ)`);
    if (/#\s*TODO\b/.test(fs.readFileSync(path.join(sol, f), "utf8"))) out.push(`${sw} still has a # TODO`);
  }
  return out;
}

/** Problems with the two folders as a whole: a solution without a project, or a project folder without a requirements.txt. */
export function layoutProblems(root) {
  const out = [];
  const ids = new Set(projectIds(root));
  const solDir = path.join(root, "pro-track-solutions");
  if (fs.existsSync(solDir))
    for (const e of fs.readdirSync(solDir, { withFileTypes: true })) if (e.isDirectory() && !ids.has(e.name)) out.push(`pro-track-solutions/${e.name}: there's no pro-track/${e.name}/ with a requirements.txt`);
  const dir = path.join(root, "pro-track");
  if (fs.existsSync(dir))
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !ids.has(e.name)) out.push(`pro-track/${e.name}: a project folder needs a requirements.txt (only projects go in pro-track/)`);
  return out;
}

// ---------------------------------------------------------------- the zip

/** The time every file in a zip has (DOS time and date): 1 January 2026, 00:00. */
const ZIP_TIME = 0;
const ZIP_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A zip of the given files ({ name, data }), the same bytes for the same files whatever order they
 * come in or when they were changed: sorted by name, each with the same time (ZIP_TIME, ZIP_DATE),
 * the same permissions (rw-r--r--, from Unix) and compressed with deflate at level 9 (stored when
 * that isn't smaller).
 */
export function makeZip(entries) {
  const sorted = [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  const names = new Set();
  const local = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of sorted) {
    if (names.has(name)) throw new Error(`zip: ${name} twice`);
    names.add(name);
    const nameBytes = Buffer.from(name, "utf8");
    const raw = Buffer.from(data);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const crc = crc32(raw);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4); // version needed: 2.0
    head.writeUInt16LE(0x0800, 6); // names in UTF-8
    head.writeUInt16LE(stored ? 0 : 8, 8);
    head.writeUInt16LE(ZIP_TIME, 10);
    head.writeUInt16LE(ZIP_DATE, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(nameBytes.length, 26);
    head.writeUInt16LE(0, 28);
    local.push(head, nameBytes, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, 2.0
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(stored ? 0 : 8, 10);
    c.writeUInt16LE(ZIP_TIME, 12);
    c.writeUInt16LE(ZIP_DATE, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(nameBytes.length, 28);
    c.writeUInt16LE(0, 30); // extra
    c.writeUInt16LE(0, 32); // comment
    c.writeUInt16LE(0, 34); // disk
    c.writeUInt16LE(0, 36); // internal attributes
    c.writeUInt32LE((0o100644 << 16) >>> 0, 38); // a regular file, rw-r--r--
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBytes);
    offset += head.length + nameBytes.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, cd, end]));
}

/** Reads a zip made by makeZip (or any zip without zip64): its files' names and contents, in order. */
export function readZip(bytes) {
  const b = Buffer.from(bytes);
  const endAt = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error("not a zip");
  const count = b.readUInt16LE(endAt + 10);
  let at = b.readUInt32LE(endAt + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (b.readUInt32LE(at) !== 0x02014b50) throw new Error("zip: damaged central directory");
    const method = b.readUInt16LE(at + 10);
    const crc = b.readUInt32LE(at + 16);
    const size = b.readUInt32LE(at + 20);
    const nameLen = b.readUInt16LE(at + 28);
    const extra = b.readUInt16LE(at + 30);
    const comment = b.readUInt16LE(at + 32);
    const localAt = b.readUInt32LE(at + 42);
    const name = b.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    const dataAt = localAt + 30 + b.readUInt16LE(localAt + 26) + b.readUInt16LE(localAt + 28);
    const body = b.subarray(dataAt, dataAt + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    if (crc32(data) !== crc) throw new Error(`zip: ${name} has a wrong CRC`);
    out.push({ name, data, time: b.readUInt16LE(at + 12), date: b.readUInt16LE(at + 14), attributes: b.readUInt32LE(at + 38) >>> 16 });
    at += 46 + nameLen + extra + comment;
  }
  return out;
}

/** The zip of pro-track/<id>/: every file but junk, under the folder <id>/, so it unzips into a folder of its own. */
export function zipProject(root, id) {
  const dir = path.join(root, "pro-track", id);
  const files = walk(dir).filter((f) => !isJunk(f) && fs.lstatSync(path.join(dir, f)).isFile());
  return makeZip(files.map((f) => ({ name: `${id}/${f}`, data: fs.readFileSync(path.join(dir, f)) })));
}

// ---------------------------------------------------------------- pytest's report

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};

/**
 * Totals of a JUnit XML report (pytest --junitxml): tests, failures, errors, skipped, and the tests
 * that failed or erred ("test_file.test_name").
 */
export function junitTotals(xml) {
  const t = { suites: 0, tests: 0, failures: 0, errors: 0, skipped: 0, failed: [] };
  for (const m of xml.matchAll(/<testsuite\b[^>]*>/g)) {
    const suite = m[0];
    t.suites++;
    t.tests += Number(attr(suite, "tests") ?? 0);
    t.failures += Number(attr(suite, "failures") ?? 0);
    t.errors += Number(attr(suite, "errors") ?? 0);
    t.skipped += Number(attr(suite, "skipped") ?? 0);
  }
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    if (!m[3] || !/<(failure|error)\b/.test(m[3])) continue;
    const cls = attr(m[1], "classname") ?? "";
    t.failed.push(`${cls.split(".").pop()}.${attr(m[1], "name") ?? "?"}`);
  }
  return t;
}

/** Reads a report pytest wrote (null when there is none: the tests never ran). */
export function readReport(file) {
  if (!fs.existsSync(file)) return null;
  return junitTotals(fs.readFileSync(file, "utf8"));
}
