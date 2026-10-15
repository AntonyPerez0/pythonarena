// Tests of the Pro Track's tools that need no Python and no build output (scripts/pro-track/): the
// zip (the same input gives the same bytes, readable, junk left out), the requirements.txt, README.md
// and folder rules on made-up projects, pytest's JUnit report totals, the site's data from
// content/pro-track.yaml, and the real projects in pro-track/ (whatever there is). Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PINNED, PYTEST_INI, WORKFLOW, folderProblems, junitTotals, layoutProblems, makeZip, packageOf, projectIds, readRequirements, readZip, readmeProblems, requirementsProblems, zipProject } from "./pro-track/project.mjs";
import { inlineHtml, markdownHtml, plainText, readProTrack } from "./pro-track/site.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
/** The temporary folders the tests made, removed at the end. */
const made = [];
test.after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const tmp = (name) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), name));
  made.push(d);
  return d;
};

const REQUIREMENTS = `pytest==${PINNED.pytest}\n`;

const README = `# Demo

A small project to try the rules.

## What you'll build

Something small.

## What you need

Python 3.14 and a terminal.

## Steps

1. Find the \`# TODO\`.
2. See [the tests](tests/test_demo.py).

## Run the tests

\`\`\`shell
python -m pytest
\`\`\`

## Run the program

\`\`\`shell
python -m demo
\`\`\`

## Put it on GitHub (optional)

Upload the files and open the Actions tab.
`;

const STARTER = 'def answer():\n    """The answer."""\n    # TODO: return the answer.\n    raise NotImplementedError\n';
const TEST = "from demo.answers import answer\n\n\ndef test_answer():\n    assert answer() == 42\n";
const SOLUTION = 'def answer():\n    """The answer."""\n    return 42\n';

/** A made-up repository with one project, demo, in a temporary folder; `files` adds or replaces files (null removes one). */
function repo(files = {}) {
  const root = tmp("pro-track-test-");
  const all = {
    "content/course.yaml": "modules:\n  - id: functions\n    title: Functions\n  - id: unit-testing\n    title: Unit testing\n",
    "content/pro-track.yaml": "projects:\n  - id: demo\n    hours: 2 to 3\n    practices:\n      - module: functions\n        what: a function\n    checklist:\n      - id: one\n        text: Ran `python -m pytest`\n      - id: two\n        text: Wrote it\n      - id: three\n        text: All pass\n",
    "pro-track/demo/requirements.txt": REQUIREMENTS,
    "pro-track/demo/pytest.ini": PYTEST_INI,
    "pro-track/demo/README.md": README,
    "pro-track/demo/.gitignore": "__pycache__/\n.pytest_cache/\n.venv/\n",
    "pro-track/demo/.github/workflows/test.yml": WORKFLOW,
    "pro-track/demo/demo/__init__.py": "",
    "pro-track/demo/demo/answers.py": STARTER,
    "pro-track/demo/tests/test_demo.py": TEST,
    "pro-track-solutions/demo/demo/answers.py": SOLUTION,
    ...files,
  };
  for (const [f, text] of Object.entries(all)) {
    if (text == null) continue;
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), text);
  }
  return root;
}

// ---------------------------------------------------------------- the zip

test("the zip: the same files give the same bytes, whatever their order, times or permissions", () => {
  const files = [
    { name: "p/b.txt", data: Buffer.from("bee\n".repeat(50)) },
    { name: "p/a.txt", data: Buffer.from("a") },
    { name: "p/src/é.py", data: Buffer.from("E = 1\n") },
  ];
  const one = makeZip(files);
  assert.deepEqual(makeZip([...files].reverse()), one, "the order the files come in doesn't matter");
  assert.deepEqual(makeZip(files), one, "the same again");
  const back = readZip(one);
  assert.deepEqual(back.map((e) => e.name), ["p/a.txt", "p/b.txt", "p/src/é.py"], "sorted by name");
  assert.deepEqual(back.map((e) => e.data.toString()), ["a", "bee\n".repeat(50), "E = 1\n"]);
  assert.ok(back.every((e) => e.time === 0 && e.date === ((2026 - 1980) << 9 | (1 << 5) | 1)), "every file has the same time");
  assert.ok(back.every((e) => e.attributes === 0o100644), "every file is rw-r--r--");
  assert.notDeepEqual(makeZip([{ name: "p/a.txt", data: Buffer.from("b") }]), makeZip([{ name: "p/a.txt", data: Buffer.from("a") }]), "different content, different bytes");
  assert.throws(() => makeZip([files[0], files[0]]), /twice/);
});

test("a project's zip is the same bytes after its files are touched and copied, has every file under <id>/, and leaves junk out", () => {
  const root = repo();
  const first = zipProject(root, "demo");
  // Touch every file (new times, other permissions) and add Python's, pytest's and an editor's junk.
  for (const f of ["requirements.txt", "README.md", "demo/answers.py"]) {
    fs.utimesSync(path.join(root, "pro-track/demo", f), new Date(2030, 1, 1), new Date(2030, 1, 1));
    fs.chmodSync(path.join(root, "pro-track/demo", f), 0o600);
  }
  for (const d of ["demo/__pycache__", "tests/__pycache__", ".pytest_cache/v/cache", ".venv/bin"]) fs.mkdirSync(path.join(root, "pro-track/demo", d), { recursive: true });
  for (const f of ["demo/__pycache__/answers.cpython-314.pyc", "tests/__pycache__/test_demo.cpython-314-pytest-9.1.1.pyc", ".pytest_cache/v/cache/lastfailed", ".venv/bin/python", ".DS_Store", "report.xml"]) fs.writeFileSync(path.join(root, "pro-track/demo", f), "x");
  // And the files a run of the program and an editor leave behind (a SQLite database, a vim swap file).
  for (const f of ["books.db", "books.sqlite3", "books.db-journal", ".README.md.swp"]) fs.writeFileSync(path.join(root, "pro-track/demo", f), "x");
  assert.deepEqual(zipProject(root, "demo"), first);
  const copy = tmp("pro-track-copy-");
  fs.cpSync(root, copy, { recursive: true });
  assert.deepEqual(zipProject(copy, "demo"), first, "a copy elsewhere zips to the same bytes");
  assert.deepEqual(
    readZip(first).map((e) => e.name),
    ["demo/.github/workflows/test.yml", "demo/.gitignore", "demo/README.md", "demo/demo/__init__.py", "demo/demo/answers.py", "demo/pytest.ini", "demo/requirements.txt", "demo/tests/test_demo.py"],
  );
  assert.equal(readZip(first).find((e) => e.name === "demo/requirements.txt").data.toString(), REQUIREMENTS);
});

// ---------------------------------------------------------------- requirements.txt, README.md, the folders

test("requirements.txt: pinned pytest, and pygame-ce when a project has a window; each rule catches what it's for", () => {
  assert.deepEqual(requirementsProblems(REQUIREMENTS), []);
  assert.deepEqual(requirementsProblems(`# What the project needs.\npytest == ${PINNED.pytest}\r\npygame-ce==${PINNED.pygame}  # the window\n`), []);
  assert.deepEqual(readRequirements(`PyTest==${PINNED.pytest}\n\nnot a pin\n`), { packages: { pytest: PINNED.pytest }, bad: ["not a pin"] });
  const has = (text, re) => assert.ok(requirementsProblems(text).some((m) => re.test(m)), `${re}: ${requirementsProblems(text).join("; ")}`);
  has("", /needs pytest==/);
  has(`pygame-ce==${PINNED.pygame}\n`, /needs pytest==/);
  has("pytest==8.0.0\n", new RegExp(`pytest must be version ${PINNED.pytest.replace(/\./g, "\\.")}`));
  has("pytest>=9\n", /isn't a pinned package/);
  has("pytest\n", /isn't a pinned package/);
  has(`pytest==${PINNED.pytest}\nrequests==2.32.0\n`, /requests isn't a package the projects use/);
  assert.equal(packageOf("word-stats"), "wordstats");
});

test("README.md: the sections in order, python -m pytest, the summary, no dashes", () => {
  assert.deepEqual(readmeProblems(README), []);
  const has = (text, re) => assert.ok(readmeProblems(text).some((m) => re.test(m)), `${re}: ${readmeProblems(text).join("; ")}`);
  has(README.replace("# Demo", "Demo"), /first line must be the title/);
  has(README.replace("## Steps", "## How"), /needs the section "## Steps"/);
  has(README.replace("## What you need\n\nPython 3.14 and a terminal.\n\n", "") + "\n## What you need\n\nLate.\n", /must come after/);
  has(README.replace("python -m pytest", "python -m unittest"), /python -m pytest/);
  has(README.replace("A small project", "A small \u2014 project"), /em dash/);
  has(README.replace("A small project to try the rules.", "x ".repeat(300)), /at most 400/);
  // A ## inside a code block isn't a section.
  assert.deepEqual(readmeProblems(README.replace("python -m demo", "python -m demo\n## not a heading")), []);
});

test("the folders: the made-up project passes, and missing or wrong files are named", () => {
  assert.deepEqual(folderProblems(repo(), "demo"), []);
  assert.deepEqual(layoutProblems(repo()), []);
  const has = (files, re) => {
    const got = folderProblems(repo(files), "demo");
    assert.ok(got.some((m) => re.test(m)), `${re}: ${got.join("; ")}`);
  };
  has({ "pro-track/demo/.gitignore": null }, /needs \.gitignore/);
  has({ "pro-track/demo/.gitignore": "*.pyc\n" }, /must have the lines __pycache__\/ and \.pytest_cache\//);
  has({ "pro-track/demo/requirements.txt": null }, /needs requirements\.txt/);
  has({ "pro-track/demo/requirements.txt": "pytest==1.0\n" }, /requirements\.txt: pytest must be version/);
  has({ "pro-track/demo/pytest.ini": null }, /needs pytest\.ini/);
  has({ "pro-track/demo/pytest.ini": "[pytest]\n" }, /pytest\.ini must be the one/);
  has({ "pro-track/demo/.github/workflows/test.yml": WORKFLOW.replace('"3.14"', '"3.12"') }, /word for word/);
  has({ "pro-track/demo/demo/__init__.py": null }, /needs demo\/__init__\.py/);
  has({ "pro-track/demo/demo/answers.py": SOLUTION }, /at least one # TODO/);
  has({ "pro-track/demo/tests/test_demo.py": null }, /needs pytest tests/);
  has({ "pro-track/demo/tests/test_demo.py": null, "pro-track/demo/tests/demo_check.py": TEST }, /files named test_\*\.py in tests\//);
  has({ "pro-track/demo/demo/answers.py": STARTER.replace("    #", "\t#") }, /indents with tabs/);
  has({ "pro-track/demo/demo/__pycache__/answers.cpython-314.pyc": "x" }, /a file Python, pytest or an editor made/);
  has({ "pro-track/demo/.answers.py.swp": "x" }, /a file Python, pytest or an editor made/);
  has({ "pro-track/demo/books.db": "x" }, /books\.db is a file the program makes when you run it/);
  has({ "pro-track/demo/books.sqlite3": "x" }, /program makes when you run it/);
  // A Windows checkout (Git's core.autocrlf) gives the workflow CRLF line endings: still the same workflow.
  assert.deepEqual(folderProblems(repo({ "pro-track/demo/.github/workflows/test.yml": WORKFLOW.replace(/\n/g, "\r\n") }), "demo"), []);
  has({ "pro-track/demo/big.txt": "x".repeat(1_000_001) }, /at most 1000000/);
  has({ "pro-track-solutions/demo/demo/answers.py": SOLUTION + "# TODO\n" }, /still has a # TODO/);
  has({ "pro-track-solutions/demo/demo/answers.py": STARTER }, /is the same as the starter's/);
  has({ "pro-track-solutions/demo/README.md": "x" }, /only \.py files in demo\//);
  has({ "pro-track-solutions/demo/demo/answers.py": null }, /has no files|needs its model solution/);
  assert.deepEqual(layoutProblems(repo({ "pro-track-solutions/ghost/ghost/a.py": "A = 1\n" })), ["pro-track-solutions/ghost: there's no pro-track/ghost/ with a requirements.txt"]);
  assert.deepEqual(layoutProblems(repo({ "pro-track/notes/x.md": "x" })), ["pro-track/notes: a project folder needs a requirements.txt (only projects go in pro-track/)"]);
});

// ---------------------------------------------------------------- pytest's report

test("pytest's JUnit report: totals over every suite, and the tests that failed or erred", () => {
  const report = `<?xml version="1.0" encoding="utf-8"?><testsuites name="pytest tests"><testsuite name="pytest" errors="1" failures="1" skipped="1" tests="5" time="0.04" timestamp="2026-01-01T00:00:00" hostname="x">
<testcase classname="tests.test_demo" name="test_one" time="0.001" />
<testcase classname="tests.test_demo" name="test_two" time="0.001"><failure message="assert 41 == 42">def test_two(): ...</failure></testcase>
<testcase classname="tests.test_demo" name="test_three" time="0.001"><error message="failed on setup">fixture missing</error></testcase>
<testcase classname="tests.test_other" name="test_four" time="0.000"><skipped type="pytest.skip" message="later">skipped</skipped></testcase>
<testcase classname="tests.test_other" name="test_five" time="0.001"></testcase>
</testsuite></testsuites>`;
  assert.deepEqual(junitTotals(report), { suites: 1, tests: 5, failures: 1, errors: 1, skipped: 1, failed: ["test_demo.test_two", "test_demo.test_three"] });
  assert.deepEqual(junitTotals("not a report"), { suites: 0, tests: 0, failures: 0, errors: 0, skipped: 0, failed: [] });
});

// ---------------------------------------------------------------- the site's data

test("the site's data: content/pro-track.yaml with the README's title, summary and sections; relative links go to the folder on GitHub", () => {
  const root = repo();
  const r = readProTrack(root);
  assert.deepEqual(r.problems, []);
  const [p] = r.projects;
  assert.equal(p.title, "Demo");
  assert.equal(p.summary, "A small project to try the rules.");
  assert.deepEqual(p.practices, [{ module: "functions", what: "a function" }]);
  assert.deepEqual(p.checklist.map((c) => c.id), ["one", "two", "three"]);
  assert.equal(p.checklist[0].text, "Ran python -m pytest");
  assert.equal(p.checklist[0].html, "Ran <code>python <span class=\"nw\">-m</span> pytest</code>");
  assert.match(p.sections.steps, /href="https:\/\/github\.com\/AntonyPerez0\/pythonarena\/blob\/main\/pro-track\/demo\/tests\/test_demo\.py"/);
  assert.match(p.sections.tests, /python -m pytest/);
  assert.equal(p.zip.file, "pro/demo.zip");
  assert.equal(p.zip.bytes, zipProject(root, "demo").length);
  assert.match(markdownHtml("### Deep\n\n| a |\n|---|\n| b |\n", "demo"), /<h3>Deep<\/h3>[\s\S]*<table tabindex="0">/);
});

test("the site's data: each problem in content/pro-track.yaml is named", () => {
  const yaml = (body) => repo({ "content/pro-track.yaml": `projects:\n${body}` });
  const has = (root, re) => {
    const got = readProTrack(root).problems;
    assert.ok(got.some((m) => re.test(m)), `${re}: ${got.join("; ")}`);
  };
  has(repo({ "content/pro-track.yaml": "projects: []\n" }), /pro-track\/demo\/ isn't listed/);
  has(yaml("  - id: ghost\n    hours: 1 to 2\n"), /no pro-track\/ghost\/ with a requirements.txt/);
  has(yaml("  - id: demo\n    hours: two\n    practices: [{ module: functions, what: x }]\n    checklist: [{ id: a, text: a }, { id: b, text: b }, { id: c, text: c }]\n"), /needs hours/);
  has(yaml("  - id: demo\n    hours: 1 to 2\n    practices: [{ module: nope, what: x }]\n    checklist: [{ id: a, text: a }, { id: b, text: b }, { id: c, text: c }]\n"), /"nope" isn't a module id/);
  has(yaml("  - id: demo\n    hours: 1 to 2\n    practices: [{ module: functions, what: x }]\n    checklist: [{ id: a, text: a }, { id: a, text: b }, { id: c, text: c }]\n"), /the id a is used twice/);
  has(yaml("  - id: demo\n    hours: 1 to 2\n    practices: [{ module: functions, what: x }]\n    checklist: [{ id: a, text: a }]\n"), /needs a checklist of 3 to 15 items/);
  has(yaml("  - id: demo\n    title: Demo\n    hours: 1 to 2\n"), /unknown key "title"/);
  has(yaml("  - id: demo\n    hours: 1 to 2\n    practices: [{ module: functions, what: x }]\n    checklist: [{ id: a, text: \"see [below](#below)\" }, { id: b, text: b }, { id: c, text: c }]\n"), /the link #below .*has no target on the project's page/);
});

test("the project's links, the same in its README's sections, its summary and its checklist: files to GitHub, images to their raw files, the shown sections' anchors to the page's", () => {
  const blob = "https://github.com/AntonyPerez0/pythonarena/blob/main/pro-track/demo/";
  const raw = "https://raw.githubusercontent.com/AntonyPerez0/pythonarena/main/pro-track/demo/";
  // The summary and a checklist item go through inlineHtml.
  assert.equal(inlineHtml("Start in [answers.py](demo/answers.py).", "demo"), `Start in <a href="${blob}demo/answers.py">answers.py</a>.`);
  assert.equal(inlineHtml("The [tests](./tests/test_demo.py) pass", "demo"), `The <a href="${blob}tests/test_demo.py">tests</a> pass`);
  assert.match(inlineHtml("![A finished game](docs/game.png)", "demo"), new RegExp(`<img src="${raw}docs/game\\.png" alt="A finished game">`));
  assert.match(markdownHtml("![Shot](shot.png)\n\nSee [the file][f].\n\n[f]: requirements.txt\n", "demo"), new RegExp(`src="${raw}shot\\.png"[\\s\\S]*href="${blob}requirements\\.txt"`));
  // Full addresses and the shown sections' anchors (GitHub's slugs) stay usable; other anchors are dead.
  const dead = [];
  const html = markdownHtml("[a](https://docs.pytest.org/) [b](#steps) [c](#put-it-on-github-optional) [d](#what-youll-build) [e](#somewhere-else)", "demo", 3, dead);
  assert.match(html, /href="https:\/\/docs\.pytest\.org\/"/);
  assert.match(html, /href="#pro-steps-h"[\s\S]*href="#pro-github-h"[\s\S]*href="#pro-build-h"/);
  assert.deepEqual(dead, ["#somewhere-else"]);
  const deadInline = [];
  inlineHtml("[x](#steps) [y](#nope)", "demo", deadInline);
  assert.deepEqual(deadInline, ["#nope"]);
  assert.equal(plainText("A ![picture](a.png) game, see [the steps](#steps)."), "A game, see the steps.");
  // Command-line options don't break at their hyphens on a phone.
  assert.equal(inlineHtml("`--min-length N`, `-h, --help` and `a-b`", "demo"), '<code><span class="nw">--min-length</span> N</code>, <code><span class="nw">-h</span>, <span class="nw">--help</span></code> and <code>a-b</code>');
});

// ---------------------------------------------------------------- the real Pro Track

test("the repository's Pro Track (whatever pro-track/ has): every folder follows the rules, content/pro-track.yaml lists them, and nothing offers the solutions for download", () => {
  assert.deepEqual(layoutProblems(ROOT), []);
  for (const id of projectIds(ROOT)) assert.deepEqual(folderProblems(ROOT, id), [], id);
  const r = readProTrack(ROOT);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.projects.map((p) => p.id).sort(), projectIds(ROOT));
  for (const p of r.projects) assert.ok(readZip(zipProject(ROOT, p.id)).every((e) => e.name.startsWith(`${p.id}/`)), p.id);
  for (const f of ["scripts/pro-track/vite-plugin.mjs", "src/pages/ProProject.tsx", "src/pages/ProTrack.tsx", "src/lib/pro-guide.ts"]) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.doesNotMatch(text.replace(/^\s*(\/\/|\*).*$/gm, ""), /pro-track-solutions/, `${f} must not offer the model solutions`);
    assert.doesNotMatch(text, /[\u2013\u2014]/, `${f} has an en or em dash`);
  }
  // Git keeps the projects' line endings as they are (LF), so the zips and the workflow check match on Windows too.
  const attrs = fs.readFileSync(path.join(ROOT, ".gitattributes"), "utf8");
  for (const line of ["pro-track/** text eol=lf", "pro-track-solutions/** text eol=lf"]) assert.ok(attrs.split("\n").includes(line), `.gitattributes needs: ${line}`);
  // A new repository is empty, and an empty repository's page has no Add file menu: its link is "uploading an existing file".
  for (const f of [...projectIds(ROOT).map((id) => `pro-track/${id}/README.md`), "src/lib/pro-guide.ts"]) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.match(text, /new repository's page, choose (\*\*|<strong>)uploading an existing file/, `${f}: the browser route starts from the new, empty repository`);
    assert.doesNotMatch(text, /repository's page, choose (\*\*|<strong>)Add file/, `${f}: an empty repository has no Add file menu`);
  }
});
