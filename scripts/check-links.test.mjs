// Tests of the link check (scripts/check-links.mjs). No build output is read: each test writes a tiny
// site of its own in a temporary folder. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkLinks, externalProblem, htmlLinks, lessonPage, markdownLinks, markdownStrings, resolveInternal } from './check-links.mjs';

const BASE = '/pythonarena/';
const page = (body, extra = '') => `<!doctype html><html><head><link rel="canonical" href="https://antonyperez0.github.io/pythonarena/${extra}"></head><body><a href="https://github.com/AntonyPerez0/pythonarena">Source</a>${body}</body></html>`;

/** A site in a temporary folder: { 'dist/index.html': '...', 'content/x.yaml': '...' }, served at `base`; returns the check's problems. */
async function site(files, base = BASE) {
  const root = mkdtempSync(join(tmpdir(), 'links-'));
  try {
    const all = {
      'dist/sitemap.xml': '<urlset><url><loc>https://antonyperez0.github.io/pythonarena/</loc></url></urlset>',
      'dist/manifest.webmanifest': JSON.stringify({ start_url: base, icons: [{ src: `${base}icon.png` }] }),
      'dist/icon.png': 'x',
      'dist/lessons/a/one.json': JSON.stringify({ text: 'Nothing linked.' }),
      'content/modules/a.yaml': 'text: plain\n',
      ...files,
    };
    for (const [path, text] of Object.entries(all)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return (await checkLinks({ root, dist: join(root, 'dist'), base })).problems;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a site whose links all resolve passes', async () => {
  const problems = await site({
    'dist/index.html': page(`<a href="${BASE}learn/">Learn</a><a href="learn/#top">Top</a><a href="#main">Skip</a><main id="main"></main><img src="${BASE}icon.png" alt="">`),
    'dist/learn/index.html': page('<h1 id="top">Learn</h1><a href="../">Home</a>', 'learn/'),
  });
  assert.deepEqual(problems, []);
});

test('a link to a page or file that is not there fails, and a missing last slash is pointed out', async () => {
  const problems = await site({
    'dist/index.html': page(`<a href="${BASE}learn/nowhere/">x</a><a href="${BASE}learn">y</a><img src="${BASE}gone.png" alt="">`),
    'dist/learn/index.html': page('', 'learn/'),
  });
  assert.equal(problems.length, 3);
  assert.match(problems[0], /learn\/nowhere\/ leads to no file/);
  assert.match(problems[1], /\/pythonarena\/learn leads to no file \(add the \/ at the end\)/);
  assert.match(problems[2], /gone\.png leads to no file/);
});

test('a #fragment must name an id on the page; an address outside the base path fails', async () => {
  const problems = await site({ 'dist/index.html': page('<a href="#nothing">x</a><a href="/elsewhere/">y</a>') });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /no id "nothing"/);
  assert.match(problems[1], /outside the site/);
});

test("the site's own address is checked as an internal link; this repository's file links must name files in it", async () => {
  const problems = await site({
    'dist/index.html': page('<a href="https://antonyperez0.github.io/pythonarena/gone/">x</a><a href="https://github.com/AntonyPerez0/pythonarena/blob/main/content/modules/a.yaml">ok</a><a href="https://github.com/AntonyPerez0/pythonarena/tree/main/pro-track/nothing">bad</a>'),
  });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /gone\/ leads to no file/);
  assert.match(problems[1], /pro-track\/nothing, which isn't in the repository/);
});

test("a Pro Track README's images (this repository's raw files) must name files in it", async () => {
  const raw = 'https://raw.githubusercontent.com/AntonyPerez0/pythonarena/main';
  const problems = await site({ 'dist/index.html': page(`<img src="${raw}/content/modules/a.yaml" alt=""><img src="${raw}/pro-track/demo/shot.png" alt="">`) });
  assert.deepEqual(problems, [`index.html: ${raw}/pro-track/demo/shot.png names pro-track/demo/shot.png, which isn't in the repository`]);
});

test("a local build (pages at /, canonical links naming the live site at /pythonarena/): the site's own address is checked in dist", async () => {
  const files = {
    'dist/index.html': page('<a href="/learn/">Learn</a><a href="https://antonyperez0.github.io/pythonarena/learn/">Learn</a>'),
    'dist/learn/index.html': page('<a href="../">Home</a>', 'learn/'),
    'dist/sitemap.xml': '<urlset><url><loc>https://antonyperez0.github.io/pythonarena/</loc></url><url><loc>https://antonyperez0.github.io/pythonarena/learn/</loc></url></urlset>',
  };
  assert.deepEqual(await site(files, '/'), []);
  const problems = await site({ ...files, 'dist/sitemap.xml': '<urlset><url><loc>https://antonyperez0.github.io/pythonarena/gone/</loc></url></urlset>' }, '/');
  assert.deepEqual(problems, ['sitemap.xml: /gone/ leads to no file']);
});

test("a lesson file's relative links are relative to its step's page, a project file's to the project's page", async () => {
  const pages = {
    'dist/index.html': page(''),
    'dist/learn/index.html': page('', 'learn/'),
    'dist/learn/a/index.html': page('', 'learn/a/'),
    'dist/learn/a/two/index.html': page('<h2 id="loops">Loops</h2>', 'learn/a/two/'),
    'dist/projects/index.html': page('', 'projects/'),
  };
  const problems = await site({
    ...pages,
    'dist/lessons/a/one-0123456789.json': JSON.stringify({ text: 'See [the module](../) and [the next step](../two/#loops).', hints: ['Not [here](two/).'] }),
    'dist/lessons/projects/calc-0123456789.json': JSON.stringify({ intro: '[All projects](../) and [module a](../../learn/a/).' }),
  });
  assert.deepEqual(problems, ['lessons/a/one-0123456789.json: two/ leads to no file']);
  assert.equal(lessonPage('lessons/more-loops/while-true-0123456789.json', BASE), `${BASE}learn/more-loops/while-true/`);
  assert.equal(lessonPage('lessons/projects/game-of-life-e5df4d73a8.json', BASE), `${BASE}projects/game-of-life/`);
});

test('external links: hosts on the list pass, others and link shorteners fail, in pages, lessons and content', async () => {
  const problems = await site({
    'dist/index.html': page('<a href="https://docs.python.org/3/library/">ok</a><a href="https://example.com/">bad</a>'),
    'dist/lessons/a/one.json': JSON.stringify({ text: 'See [the MOOC](https://programming-26.mooc.fi/part-1) and https://bit.ly/abc.', seed: 'u = "https://example.org/"' }),
    'content/modules/a.yaml': 'steps:\n  - text: "Read [this](http://peps.python.org/pep-0008/)."\n',
  });
  assert.equal(problems.length, 3);
  assert.match(problems[0], /index\.html: a host not on the list.*example\.com/);
  assert.match(problems[1], /one\.json: a link shortener: https:\/\/bit\.ly\/abc/);
  assert.match(problems[2], /a\.yaml: not https: http:\/\/peps\.python\.org/);
});

test('markdown links: code blocks and inline code are not links; bare addresses and [text](address) are', () => {
  const md = 'A [link](https://a.mooc.fi/x "title") and https://github.com/x.\n\n```xml\n<project xmlns="http://maven.apache.org/POM/4.0.0"/>\n```\n\nAlso `items[i](x)` and <https://pyodide.org>.';
  assert.deepEqual(markdownLinks(md), ['https://a.mooc.fi/x', 'https://github.com/x', 'https://pyodide.org']);
  // A code block left open runs to the end of the text.
  assert.deepEqual(markdownLinks('Text.\n\n```python\ns = "http://x.org"\n'), []);
  assert.deepEqual(markdownStrings({ text: 'a', seed: 'b', more: [{ task: 'c', hints: ['d'], solution: 'e' }] }), ['a', 'c', 'd']);
});

test('pieces: attributes of pages, resolving relative addresses, the host list', () => {
  assert.deepEqual(htmlLinks('<a href="/x/?a=1&amp;b=2">x</a><script src="/s.js">var a = "<a href=\\"/no/\\">";</script><!-- <a href="/c/"> -->'), [
    { tag: 'a', href: '/x/?a=1&b=2' },
    { tag: 'script', href: '/s.js' },
  ]);
  assert.deepEqual(resolveInternal('../b/#c', '/J/learn/a/', '/J/'), { file: 'learn/b/index.html', fragment: 'c' });
  assert.deepEqual(resolveInternal('x.zip?v=1', '/J/pro/', '/J/'), { file: 'pro/x.zip', fragment: '' });
  assert.equal(externalProblem('https://docs.github.com/en'), null);
  assert.equal(externalProblem('https://pypi.org/project/pytest/'), null);
  assert.match(externalProblem('https://github.com.evil.example/'), /not on the list/);
});
