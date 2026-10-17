// End-to-end tests in headless Chromium against the built site (dist/), served under BASE_PATH
// like GitHub Pages: pre-rendered pages, lessons (fill-ins, code challenges, hidden tests, rules,
// hints, solutions, progress, programs of several files, files read and written, tests that call
// functions), syntax errors and crashes explained, endless loops stopped, the Playground (share
// links, modules of its own, Python's mistakes explained, pygame windows), the mobile-data question
// holding the download, offline use, moving progress between browsers (transfer links, QR codes,
// progress files), projects (whatever content/projects has), the personal record page and its print
// styles (a PDF printed), the Pro Track (whatever pro-track/ has: its pages, the zips, the checklist),
// the topics reference (its search and links), the interview prep page (its sections, its links, the
// links to it and the Deathmatch run it starts), the groups of extra modules on the course page, big
// tests (once a lesson has one: its slow solution gets the note that it is too slow for a big input),
// the links to the other Arena sites, pygame lessons
// (once the course has them), and axe (WCAG 2.2 AA) on every page type in both themes and at phone
// widths, with the phone pass at the end: every page type at 320, 360, 390 and 412 px in both themes
// (axe, no sideways scrolling, tap targets of 24 px, a visible focus).
//
// The lessons, drills and projects tested are picked from the build's own files (src/generated/), by
// what they hold, so the tests follow the content as it changes.
//
// Usage: npm run build && node scripts/e2e.mjs [--shots dir]
// E2E_ONLY=<regular expression> runs only the tests whose names match (while working on something);
// E2E_SKIP=<regular expression> leaves out the tests whose names match. CI runs the phone pass (the tests
// named "the phone pass: ...", which need nothing from the others) as a job of its own beside the rest
// (.github/workflows/deploy.yml, the e2e job's two entries).
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import jsQR from 'jsqr';
import { launchChromium } from './browser.mjs';
import { serve } from './serve.mjs';
import { checkRules, parseTemplate } from '../src/grader/assemble.js';
import { joinFiles, splitFiles } from '../src/grader/files.js';
import { describeEvents } from '../src/components/window-blocks.ts';
import { groupNextParts } from '../src/lib/group-end.ts';
import { readZip, zipProject } from './pro-track/project.mjs';
import { readProTrack } from './pro-track/site.mjs';

const ROOT_DIR = new URL('..', import.meta.url).pathname;

const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const requests = [];
const { server, url: BASE } = await serve({ onRequest: (p) => requests.push(p) });
// The site's base path (/ at the site's own domain, /<repo>/ on a github.io project page).
const BASE_PATH = process.env.BASE_PATH ?? '/';
const browser = await launchChromium();
const ENGINE_TIMEOUT = 180_000;
const started = Date.now();

let failures = 0;
const ONLY = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY, 'i') : null;
const SKIP = process.env.E2E_SKIP ? new RegExp(process.env.E2E_SKIP, 'i') : null;
async function test(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  if (SKIP && SKIP.test(name)) return;
  const t = Date.now();
  try {
    await fn();
    console.log(`  ok  ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${name}\n       ${String(e?.message ?? e).split('\n').slice(0, 8).join('\n       ')}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
async function shot(page, name) {
  if (!SHOTS) return;
  // A full-page screenshot scrolls the page; it goes back to where it was, so the tests after it see the
  // page as they would without --shots.
  const y = await page.evaluate(() => scrollY);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  await page.evaluate((top) => scrollTo(0, top), y);
}
async function axe(page, label) {
  // Colour contrast is measured on what's painted: wait for fade-ins (the pass banner's) to end.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(r.violations.length === 0, `${label}: ${r.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target} ${v.nodes[0]?.any?.[0]?.message ?? ''}`).join('; ')}`);
}
async function noOverflow(page, label) {
  // clientWidth, not innerWidth: with phone emulation innerWidth grows along with a too-wide page.
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(w[0] <= w[1], `${label}: page is ${w[0]} px wide in a ${w[1]} px window`);
}
/** No drill code box (a rep's or a review card's, a bug drill's lines, a boss task's code) scrolls sideways, and no blank sticks out of its box. */
async function codeFits(page, label) {
  const boxes = await page.locator('.rep pre, .rep .buglines, .rep .bugline, .death pre').evaluateAll((els) =>
    els.map((e) => {
      const pre = e.closest('pre');
      const blanks = [...e.querySelectorAll('input.blank')].map((b) => b.getBoundingClientRect().right - (e.getBoundingClientRect().right - parseFloat(getComputedStyle(e).paddingRight)));
      return { box: `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`, wide: e.scrollWidth > e.clientWidth + 1, blankOut: pre === e && blanks.some((d) => d > 1) };
    }),
  );
  const bad = boxes.filter((b) => b.wide || b.blankOut);
  expect(bad.length === 0, `${label}: drill code scrolls sideways: ${JSON.stringify(bad)}`);
}
/** Where each row of a line of drill code starts (its indentation left out), top row first. */
const lineRows = (line) =>
  line.evaluate((el) => {
    const rows = new Map();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement.closest('.ind') || !n.data.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const x of r.getClientRects()) if (x.width > 0) rows.set(Math.round(x.top), { left: Math.min(rows.get(Math.round(x.top))?.left ?? Infinity, x.left), right: Math.max(rows.get(Math.round(x.top))?.right ?? -Infinity, x.right), top: x.top, bottom: x.bottom });
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  });
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return { ctx, page, errors };
}
/** Each color scheme in turn: axe passes. */
async function bothThemes(page, label) {
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.waitForFunction((t) => document.documentElement.dataset.theme === t, colorScheme);
    await axe(page, `${label}, ${colorScheme} theme`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

// Lesson helpers. The workbench counts finished checks (and runs) in data-checks.
async function lessonReady(page) {
  await page.locator('.pill-ready').waitFor({ timeout: ENGINE_TIMEOUT });
}
async function check(page) {
  const wb = page.locator('.workbench');
  const before = Number(await wb.getAttribute('data-checks'));
  await page.click('#check');
  await page.waitForFunction((n) => Number(document.querySelector('.workbench')?.getAttribute('data-checks')) > n, before, { timeout: 120_000 });
  return page.locator('.workbench').innerText();
}
async function setCode(page, text) {
  await page.click('.cm-content');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}
// The whole text of the (first) editor: CodeMirror only draws the lines in view, so the `.cm-line`
// nodes can hold part of a long program. src/components/CodeEditor.tsx gives the editor this hook.
const editorText = (page) => page.evaluate(() => document.querySelector('.cm-editor').arenaText());
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// The course as the build wrote it (src/generated/): the tests pick their lessons from it.
const COURSE_INDEX = JSON.parse(readFileSync(new URL('../src/generated/course.json', import.meta.url), 'utf8'));
const moduleOf = (id) => JSON.parse(readFileSync(new URL(`../src/generated/modules/${id}.json`, import.meta.url), 'utf8'));
/** Each challenge of a module: { moduleId, step, ex, index } (the step itself is challenge 1, then its `more`). */
const challengesOf = (mod) => mod.steps.flatMap((step) => [step, ...(step.more ?? [])].map((ex, index) => ({ moduleId: mod.id, step, ex, index })));
/** Every challenge of the course, in course order. */
const ALL_CHALLENGES = COURSE_INDEX.modules.flatMap((m) => challengesOf(moduleOf(m.id)));
const findChallenge = (pred) => ALL_CHALLENGES.find(pred);
// The drills, the projects and the topics reference, read now too, with the rest of the build's files.
const DRILLS = JSON.parse(readFileSync(new URL('../src/generated/drills.json', import.meta.url), 'utf8'));
const PROJECTS = (COURSE_INDEX.projects ?? []).map((p) => JSON.parse(readFileSync(new URL(`../src/generated/projects/${p.id}.json`, import.meta.url), 'utf8')));
const TOPICS = JSON.parse(readFileSync(new URL('../src/generated/topics.json', import.meta.url), 'utf8'));
/** Whether every planned module is written (modules are added in batches: the tests don't assume either). */
const ALL_LIVE = COURSE_INDEX.plan.every((m) => m.live);
const LIVE_COUNT = COURSE_INDEX.modules.length;
/** The modules that follow the MOOC (not the extra modules of Python Arena's own): how many, and whether all are written. */
const MOOC_PLAN = COURSE_INDEX.plan.filter((m) => m.course !== 'extra');
const MOOC_LIVE = MOOC_PLAN.every((m) => m.live);
const EXTRAS = COURSE_INDEX.plan.filter((m) => m.course === 'extra');
const GROUPS = COURSE_INDEX.groups ?? [];
/** The interview prep page's text, as the build checked it. */
const INTERVIEW = JSON.parse(readFileSync(new URL('../src/generated/interview.json', import.meta.url), 'utf8'));
const FIRST_MODULE = moduleOf(COURSE_INDEX.modules[0].id);
const FIRST_STEPS = FIRST_MODULE.steps;
const MOOC = 'https://programming-26.mooc.fi';
const KEY = 'python-arena-v1';
const MOBILE_KEY = 'python-arena-mobile-data';
/** The answers of a fill-in challenge's blanks, in order (the first answer each accepts). */
const blankAnswers = (ex) => parseTemplate(ex.seed).blanks.map((b) => b.answer);
async function fillBlanks(page, answers) {
  const blanks = page.locator('.workbench input.blank');
  expect((await blanks.count()) === answers.length, `${await blanks.count()} blanks, not ${answers.length}`);
  for (const [i, a] of answers.entries()) await blanks.nth(i).fill(a);
}
async function openChallenge(page, { moduleId, step, index, ex = index ? step.more[index - 1] : step }) {
  await page.goto(BASE + `learn/${moduleId}/${step.slug}/`);
  // A step whose first challenge is "What does it print?" starts Python only once a challenge that runs
  // code is open, so the tab comes first, and a "What does it print?" challenge doesn't wait for Python.
  if (index > 0) await page.locator('.challenge-tab').nth(index).click();
  await page.locator('.task-card', { hasText: `Challenge ${index + 1} of` }).waitFor();
  if (ex.kind !== 'predict') await lessonReady(page);
}
/** The path of each file tab, in order (none when the program is one file). */
const tabPaths = (page) => page.locator('.file-tab').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? e.textContent).replace(/,?\s*\d+\s*errors?$/, '').trim()));
/** Types each file of a program (joined with file markers) into its tab. */
async function setFiles(page, code) {
  const paths = await tabPaths(page);
  for (const f of splitFiles(code)) {
    const i = paths.indexOf(f.path);
    expect(i >= 0, `no tab for ${f.path} (tabs: ${paths})`);
    await page.click(`#file-tab-${i}`);
    await page.locator(`#file-tab-${i}[aria-selected="true"]`).waitFor();
    await setCode(page, f.text);
  }
}
/** Puts a program in the editor: each file in its tab when the challenge has several. */
async function setProgram(page, code) {
  if ((await tabPaths(page)).length) await setFiles(page, code);
  else await setCode(page, code);
}
/** Lines of code, counted from 1, that match. */
const linesMatching = (text, re) => text.split('\n').flatMap((l, i) => (re.test(l) ? [i + 1] : []));
/** The line the editor marks with an error (from 1), or 0. */
const markedLine = (page) => page.evaluate(() => [...document.querySelectorAll('.cm-content .cm-line')].findIndex((l) => l.querySelector('.cm-lintRange-error, .cm-lintPoint-error')) + 1);

console.log('Pages');
const firstPlan = COURSE_INDEX.plan[0];
const PRERENDERED = {
  '': 'Learn Python by writing real Python',
  'learn/': 'The course',
  [`learn/${FIRST_MODULE.id}/`]: FIRST_MODULE.title,
  [`learn/${FIRST_MODULE.id}/${FIRST_STEPS[0].slug}/`]: FIRST_STEPS[0].title,
  [`learn/${COURSE_INDEX.modules[1].id}/${COURSE_INDEX.modules[1].steps.at(-1).slug}/`]: COURSE_INDEX.modules[1].steps.at(-1).title,
  'playground/': 'Playground',
  'deathmatch/': 'Deathmatch',
  'daily/': 'Daily challenge',
  'placement/': 'Placement quiz',
  'settings/': 'Settings',
  'about/': 'About and credits',
  'transfer/': 'Move your progress',
  'projects/': 'Projects',
  'pro/': 'Pro Track',
  'topics/': 'Topics A to Z',
  'interview/': 'Interview prep',
};
await test('every page is pre-rendered with its own title, description, canonical link and text', async () => {
  for (const [path, h1] of Object.entries(PRERENDERED)) {
    const res = await fetch(BASE + path);
    expect(res.status === 200, `${path}: HTTP ${res.status}`);
    const html = await res.text();
    expect(html.includes(`<h1>${esc(h1)}</h1>`), `${path}: pre-rendered h1 "${h1}"`);
    expect(/<title>[^<]*Python Arena[^<]*<\/title>/.test(html), `${path}: title`);
    expect(/<meta name="description" content="[^"]{40,}"/.test(html), `${path}: description`);
    expect(html.includes('<link rel="canonical" href="https://'), `${path}: canonical`);
    expect(html.includes('CC BY-NC-SA 4.0') && html.includes('not affiliated'), `${path}: credit and non-affiliation line`);
  }
  const lesson = await (await fetch(BASE + `learn/${FIRST_MODULE.id}/${FIRST_STEPS[0].slug}/`)).text();
  expect(lesson.includes(esc(firstPlan.mooc[0].title)) && lesson.includes(`${MOOC}${firstPlan.mooc[0].path}`), 'lesson page credits its MOOC sections');
  expect(lesson.includes('"@type":"LearningResource"') && lesson.includes('"programmingLanguage":"Python"'), 'structured data');
  const missing = await fetch(BASE + 'learn/no-such-module/');
  expect(missing.status === 404 && (await missing.text()).includes('noindex'), '404 page, not indexed');
});
await test('sitemap and robots', async () => {
  const sitemap = await (await fetch(BASE + 'sitemap.xml')).text();
  const last = COURSE_INDEX.modules.at(-1);
  expect(sitemap.includes(`/learn/${last.id}/${last.steps.at(-1).slug}/</loc>`), 'sitemap lists lesson steps');
  for (const m of COURSE_INDEX.plan.filter((pm) => !pm.live)) expect(!sitemap.includes(`/learn/${m.id}/</loc>`), `the sitemap lists ${m.id}, which isn't written yet`);
  expect(!sitemap.includes('/bench/'), 'no engine prototype page in the sitemap');
  expect(!sitemap.includes('404'), 'no 404 page in the sitemap');
  expect(!sitemap.includes('/transfer/'), 'no transfer page in the sitemap');
  expect((await (await fetch(BASE + 'transfer/')).text()).includes('<meta name="robots" content="noindex">'), 'the transfer page is not indexed');
  const robots = await (await fetch(BASE + 'robots.txt')).text();
  expect(robots.includes('Sitemap:'), 'robots.txt points to the sitemap');
});
await test('home page: the app starts, credits in the footer, no errors; the home and course pages say how much of the course is online', async () => {
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE);
  await page.locator('.hero h1').waitFor();
  expect((await page.title()).includes('Python Arena'), 'title');
  expect((await page.locator('html').getAttribute('lang')) === 'en', 'lang');
  const footer = await page.locator('footer').innerText();
  expect(footer.includes('CC BY-NC-SA 4.0') && footer.includes('not affiliated') && footer.includes('trademark of the Python Software Foundation'), 'credits in the footer');
  expect(!/\bJava\b/.test(await page.locator('#main').innerText()), 'the home page says Java somewhere');
  const status = await page.locator('.status-card').innerText();
  const plan = COURSE_INDEX.plan;
  const groupNames = GROUPS.map((g) => g.title).join(' and ');
  if (ALL_LIVE) {
    expect(status.includes(`All ${plan.length} modules are online: ${MOOC_PLAN.length} following the MOOC`) && (!EXTRAS.length || status.includes(`and ${EXTRAS.length} extra modules of Python Arena's own (${groupNames})`)), status);
    expect(!/so far|added in batches|Being built|later updates/.test(status), 'the finished course is not called unfinished: ' + status);
  } else if (MOOC_LIVE) {
    // The MOOC is all online, the extra modules not yet: the course is whole, and the extras come later.
    const extraLive = EXTRAS.filter((m) => m.live).length;
    expect(status.includes('The whole course is online') && status.includes(`All ${MOOC_PLAN.length} modules following the MOOC are online`) && status.includes(extraLive ? `${extraLive} of the ${EXTRAS.length} extra modules of Python Arena's own (${groupNames})` : `The ${EXTRAS.length} extra modules of Python Arena's own (${groupNames}) come in later updates`), status);
  } else {
    // The MOOC parts whose modules are all online, from part 1 on.
    const parts = [...new Set(MOOC_PLAN.map((m) => m.part))].sort((a, b) => a - b);
    const open = parts.findIndex((n) => plan.some((m) => m.part === n && !m.live));
    expect(status.includes(`Parts 1 to ${open} of the MOOC are online: ${LIVE_COUNT} of the ${plan.length} planned modules`) && status.includes('The remaining modules come in later updates'), status);
  }
  await page.click('text=See all modules');
  await page.locator('h1', { hasText: 'The course' }).waitFor();
  expect((await page.evaluate(() => document.activeElement?.tagName)) === 'H1', 'focus moved to the new page heading');
  // The course page lists every planned module: the ones not written yet say so, and the page head says why.
  const learnHead = await page.locator('.page-head').innerText();
  expect((await page.locator('li.module-planned').count()) === plan.length - LIVE_COUNT && (await page.locator('li.module-live').count()) === LIVE_COUNT, `${await page.locator('li.module-planned').count()} modules not written yet on the course page`);
  if (ALL_LIVE) expect(!/written yet|being built/.test(learnHead), learnHead);
  else expect(learnHead.includes("Modules that aren't written yet are listed too"), learnHead);
  for (const path of ['', 'learn/', 'placement/']) {
    const html = (await (await fetch(BASE + path)).text()).replace(/<script[\s\S]*?<\/script>/g, '');
    if (ALL_LIVE) expect(!/so far|added in batches|written yet|later updates/.test(html), `${path || 'home'}: pre-rendered text calls the course unfinished`);
  }
  const learnHtml = await (await fetch(BASE + 'learn/')).text();
  const described = `${MOOC_PLAN.length} modules following the University of Helsinki's Python Programming MOOC, parts 1 to 14${EXTRAS.length ? `, plus ${EXTRAS.length} extra modules of Python Arena's own (${groupNames})` : ''}. ${ALL_LIVE ? 'All of them are online.' : MOOC_LIVE ? `The MOOC's ${MOOC_PLAN.length} are online${EXTRAS.some((m) => m.live) ? `, and ${EXTRAS.filter((m) => m.live).length} of the extra modules so far.` : '. The extra modules come in later updates.'}` : `${LIVE_COUNT} are online so far.`}`;
  expect(learnHtml.includes(described), `the /learn description: ${learnHtml.match(/<meta name="description" content="[^"]*"/)?.[0]}`);
  if (!ALL_LIVE) expect((learnHtml.match(/\(not written yet\)/g) ?? []).length === plan.length - LIVE_COUNT, 'the pre-rendered course page marks the modules not written yet');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});
await test('an unknown address shows "Page not found"', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + `learn/${FIRST_MODULE.id}/no-such-step`);
  await page.locator('h1', { hasText: 'Page not found' }).waitFor();
  await ctx.close();
});

await test('extra modules: each group is a section of the course page, with its title and about text, listing its modules with the Extra label; the end of the MOOC names the groups and links to their section, and a group\'s last module points on to what comes next', async () => {
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + 'learn/');
  await page.locator('.module-live').first().waitFor();
  const learn = page.locator('.learn');
  expect((await learn.locator('li.module .extra-tag').count()) === EXTRAS.length, `${await learn.locator('li.module .extra-tag').count()} Extra labels on the course page for ${EXTRAS.length} extra modules`);
  expect((await page.locator('h2', { hasText: 'Extra modules' }).count()) === 0, 'no section is called "Extra modules": each group has its own');
  const learnHtml = await (await fetch(BASE + 'learn/')).text();
  expect((learnHtml.match(/class="extra-tag"/g) ?? []).length === EXTRAS.length, 'the pre-rendered course page labels the extra modules');
  for (const g of GROUPS) {
    const section = page.locator(`#group-${g.id}`);
    expect((await section.locator('h2').innerText()) === g.title, `the section of ${g.id} is headed ${await section.locator('h2').innerText()}`);
    expect((await section.locator('li.module').count()) === EXTRAS.filter((m) => m.group === g.id).length, `the section of ${g.id} lists its modules`);
    expect(learnHtml.includes(`<h2 id="group-${g.id}">${esc(g.title)}</h2>`), `the pre-rendered course page has the section of ${g.id}`);
    // Its about text's links to the site's pages have the base path, and open in the app (the page isn't loaded again).
    for (const a of await section.locator('.group-about a[href^="/"]').evaluateAll((as) => as.map((x) => x.getAttribute('href')))) expect(a.startsWith(BASE_PATH), `a link in the about text without the base path: ${a}`);
  }
  if (GROUPS.some((g) => g.id === INTERVIEW.modules.group)) {
    const link = page.locator(`#group-${INTERVIEW.modules.group} .group-about a[href$="/interview/"]`);
    expect((await link.count()) === 1, 'the group of the interview prep page links to it');
    await page.evaluate(() => (window.__samePage = true));
    await link.click();
    await page.locator('#main h1', { hasText: 'Interview prep' }).waitFor();
    expect(await page.evaluate(() => window.__samePage === true), 'the link loaded the page again instead of opening it in the app');
  }
  // The last MOOC module's page points on to the groups (their sections on the course page) and the Pro Track.
  const end = COURSE_INDEX.plan.filter((m) => m.course === 'II').pop();
  if (end.live) {
    await page.goto(BASE + `learn/${end.id}/`);
    const card = page.locator('.course-end').first();
    const after = await card.innerText();
    expect(after.includes('Pro Track') && GROUPS.every((g) => after.includes(g.title)) && !/the extra modules/.test(after), `the end of the course: ${after}`);
    const html = (await (await fetch(BASE + `learn/${end.id}/`)).text()).match(/<section class="card course-end">[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(GROUPS.every((g) => html.includes(`href="${BASE_PATH}learn/#group-${g.id}"`)), `the pre-rendered end of the course: ${html}`);
    // While no extra module is written, they come in later updates; once some are, the learner goes on with them.
    if (GROUPS.length) {
      const extraLive = EXTRAS.filter((m) => m.live).length;
      const said = extraLive ? `Next, you can go on with ${GROUPS.map((g) => g.title).join(' and ')}, ${EXTRAS.length} extra modules of Python Arena's own${extraLive < EXTRAS.length ? ` (${extraLive} online so far)` : ''}, or try the Pro Track` : `Next come ${GROUPS.map((g) => g.title).join(' and ')}, ${EXTRAS.length} extra modules of Python Arena's own, in later updates. Until then, you can try the Pro Track`;
      const text = html.replace(/<[^>]+>/g, '');
      expect(after.includes(said) && text.includes(said), `the end of the course should say "${said}": ${after} / ${text}`);
    }
    if (GROUPS.length) {
      await card.locator('a', { hasText: GROUPS[0].title }).click();
      await page.locator(`#group-${GROUPS[0].id}`).waitFor();
      await page.waitForFunction((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }, `group-${GROUPS[0].id}`);
    }
  } else console.log(`       (the course's last module, ${end.id}, isn't written yet: its "After the course" note is checked once it is)`);
  // A group's last module points on to Interview prep (for the group that page lists) and the Pro Track, in the app and pre-rendered.
  for (const g of GROUPS) {
    const last = EXTRAS.filter((m) => m.group === g.id).at(-1);
    if (!last?.live) {
      console.log(`       (the last module of ${g.id}, ${last?.id}, isn't written yet: its "After ${g.title}" card is checked once it is)`);
      continue;
    }
    const parts = groupNextParts(g.id, COURSE_INDEX.interviewGroup);
    const said = `This is the last module of ${g.title}. ${parts.map((p) => (typeof p === 'string' ? p : p.text)).join('')}`;
    await page.goto(BASE + `learn/${last.id}/`);
    const card = page.locator('.course-end', { hasText: `After ${g.title}` });
    expect((await card.innerText()).includes(said), `the end of ${g.id} should say "${said}": ${await card.innerText()}`);
    const html = (await (await fetch(BASE + `learn/${last.id}/`)).text()).match(/<section class="card course-end">[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(html.replace(/<[^>]+>/g, '').includes(said), `the pre-rendered end of ${g.id}: ${html}`);
    for (const p of parts.filter((x) => typeof x !== 'string')) {
      expect((await card.locator(`a[href="${BASE_PATH}${p.to.slice(1)}"]`, { hasText: p.text }).count()) === 1, `the end of ${g.id} links to ${p.to}`);
      expect(html.includes(`href="${BASE_PATH}${p.to.slice(1)}"`), `the pre-rendered end of ${g.id} links to ${p.to}`);
    }
  }
  // A module of the course and its lessons have no label, and their credit names their MOOC sections.
  await page.goto(BASE + `learn/${FIRST_MODULE.id}/`);
  await page.locator('.module-page h1').waitFor();
  expect((await page.locator('.extra-tag').count()) === 0, 'a module of the course has no Extra label');
  expect((await page.locator(`aside.credit a[href^="${MOOC}/part-"]`).count()) === firstPlan.mooc.length, 'the module credits its MOOC sections');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('a lesson page downloads its own step first and the rest of the module later; other steps open at once', async () => {
  const steps = FIRST_STEPS;
  expect(steps.length >= 5, `module 1 has ${steps.length} steps; this test opens its third, fourth and first`);
  const file = (s) => `/lessons/${FIRST_MODULE.id}/${s.slug}-${COURSE_INDEX.modules[0].steps.find((x) => x.id === s.id).hash}.json`;
  const lessonFiles = () => requests.filter((p) => p.includes('/lessons/'));
  const allLoaded = (page) => page.waitForFunction((n) => new Set(performance.getEntriesByType('resource').filter((e) => e.name.includes('/lessons/')).map((e) => e.name)).size >= n, steps.length);
  const { ctx, page, errors } = await newPage();
  // Records whether the "Loading the lesson" heading ever shows.
  await page.addInitScript(() => {
    window.__sawLoading = false;
    new MutationObserver(() => {
      if (document.getElementById('loading-h')) window.__sawLoading = true;
    }).observe(document, { childList: true, subtree: true });
  });
  requests.length = 0;
  await page.goto(BASE + `learn/${FIRST_MODULE.id}/${steps[2].slug}/`);
  await page.locator('.challenge-tab').first().waitFor();
  await allLoaded(page);
  const lessons = lessonFiles();
  // The pre-rendered page asks for its lesson file at once, and the app uses that same download.
  expect(lessons[0]?.endsWith(file(steps[2])), `the step's own file first: ${lessons.join(', ')}`);
  expect(lessons.length === steps.length && new Set(lessons).size === steps.length && steps.every((s) => lessons.some((p) => p.endsWith(file(s)))), `each step of the module once: ${lessons.join(', ')}`);
  expect(!(await page.evaluate(() => window.__sawLoading)), 'no loading message on the first step');
  await page.getByRole('link', { name: 'Skip to the next step' }).click();
  await page.locator('h1:not(#loading-h)', { hasText: steps[3].title }).waitFor();
  await page.getByRole('link', { name: `Step 1: ${steps[0].title}` }).click();
  await page.locator('h1:not(#loading-h)', { hasText: steps[0].title }).waitFor();
  expect(!(await page.evaluate(() => window.__sawLoading)), 'no loading message when moving between steps');
  // The module page fetches the step its main button opens first.
  requests.length = 0;
  await page.goto(BASE + `learn/${FIRST_MODULE.id}/`);
  await page.locator('.steplist').waitFor();
  await allLoaded(page);
  expect(lessonFiles()[0]?.endsWith(file(steps[0])), `module page: ${lessonFiles().join(', ')}`);
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('a link focused before the app starts keeps the focus; a step that loads late gets the focus on its heading; a lesson file gone after an update says so', async () => {
  const steps = FIRST_STEPS;
  const { ctx, page } = await newPage();
  // Lesson files that come only when the test lets them.
  const hold = async (s) => {
    let release;
    const held = new Promise((r) => (release = r));
    await page.route(`**/lessons/${FIRST_MODULE.id}/${s.slug}-*.json`, async (route) => {
      await held;
      await route.continue();
    });
    return release;
  };
  // The first step's file, so the app starts only when the test lets it, and the last step's; the
  // fourth one is gone, as after a new version of the site.
  const start = await hold(steps[0]);
  const release = await hold(steps[4]);
  await page.route(`**/lessons/${FIRST_MODULE.id}/${steps[3].slug}-*.json`, (route) => route.fulfill({ status: 404, body: 'not found' }));
  await page.goto(BASE + `learn/${FIRST_MODULE.id}/${steps[0].slug}/`);
  // A keyboard user on the pre-rendered page: once the app has replaced it (the app's tabs are
  // buttons, the pre-rendered ones are not), the app's own link has the focus.
  const step5 = `Step 5: ${steps[4].title}`;
  await page.getByRole('link', { name: step5 }).focus();
  start();
  await page.locator('button.challenge-tab').first().waitFor();
  const kept = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  expect(kept === step5, `focus on the app's own link: ${kept}`);
  await page.keyboard.press('Enter');
  await page.locator('#loading-h').waitFor();
  release();
  await page.locator('h1:not(#loading-h)', { hasText: steps[4].title }).waitFor();
  const focused = await page.evaluate(() => [document.activeElement?.tagName, document.activeElement?.textContent]);
  expect(focused[0] === 'H1' && focused[1] === steps[4].title, `focus on the lesson heading: ${focused.join(' ')}`);
  await page.getByRole('link', { name: `Step 4: ${steps[3].title}` }).click();
  await page.getByText('Python Arena has been updated since this page was opened').waitFor();
  await ctx.close();
});

await test('the home and course pages fetch the lesson (and the lesson page) their Continue button opens', async () => {
  const steps = COURSE_INDEX.modules[0].steps;
  const { ctx, page, errors } = await newPage();
  await ctx.addInitScript(([k, st]) => localStorage.getItem(k) || localStorage.setItem(k, JSON.stringify(st)), [KEY, { version: 1, steps: { [steps[0].id]: { done: true, challenges: {} } }, settings: {} }]);
  await page.addInitScript(() => {
    window.__sawLoading = false;
    // The lesson's own loading message, or the one shown while the lesson page's code loads.
    new MutationObserver(() => {
      if (document.getElementById('loading-h') || [...document.querySelectorAll('main p.muted')].some((p) => p.textContent === 'Loading…')) window.__sawLoading = true;
    }).observe(document, { childList: true, subtree: true });
  });
  // The step's lesson file and the lesson page's code have arrived, and the page has had time to use
  // them (two idle periods after both).
  const fetched = async (page, s) => {
    await page.waitForFunction((f) => {
      const done = performance.getEntriesByType('resource').filter((e) => e.responseEnd > 0).map((e) => e.name);
      return done.some((n) => n.endsWith(f)) && done.some((n) => /\/assets\/StepPage-[^/]*\.js$/.test(n));
    }, `/lessons/${FIRST_MODULE.id}/${s.slug}-${s.hash}.json`);
    for (let i = 0; i < 2; i++) await page.evaluate(() => new Promise((r) => requestIdleCallback(() => r(), { timeout: 2000 })));
  };
  for (const [address, button] of [['', `Continue: ${steps[1].title}`], ['learn/', `Continue: ${steps[1].title}`]]) {
    await page.goto(BASE + address);
    await fetched(page, steps[1]);
    await page.getByRole('link', { name: button }).click();
    await page.locator('h1:not(#loading-h)', { hasText: steps[1].title }).waitFor();
    expect(!(await page.evaluate(() => window.__sawLoading)), `no loading message after Continue on /${address}`);
  }
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

console.log('Lessons');
// The course's first step: a fill-in whose blank is a name (print), a second fill-in, and a code challenge.
const FIRST = { step: FIRST_STEPS[0], challenges: [FIRST_STEPS[0], ...(FIRST_STEPS[0].more ?? [])] };
const firstPath = `learn/${FIRST_MODULE.id}/${FIRST.step.slug}/`;
// A code challenge whose tests type input after a prompt, with a hidden test, and no rules (input/prompt).
const INPUT_CHALLENGE = findChallenge(({ ex }) => ex.kind === 'code' && !ex.require.length && !ex.forbid.length && ex.tests.length >= 2 && ex.tests.every((t) => t.call == null && !t.files && !t.args && !t.window) && ex.tests.some((t) => t.hidden) && !ex.tests[0].hidden && ex.tests[0].stdin && /input\("[^"]+"\)/.test(ex.solution));
// A challenge that wants a line commented out, not deleted (a raw rule about a comment).
const RULE_CHALLENGE = findChallenge(({ ex }) => ex.kind === 'code' && ex.require.some((r) => r.raw && /^#/.test(r.pattern)));
// A function to write whose tests call it, with a parameter, a hidden test and no rules.
const CALL_CHALLENGE = findChallenge(({ ex }) => ex.kind === 'code' && ex.tests.every((t) => t.call != null) && ex.tests.some((t) => t.hidden) && !ex.tests[0].hidden && /^\w+\(.*\)\n?$/.test(ex.tests[0].call) && (ex.solution.match(/^def /gm) ?? []).length === 1 && /^def \w+\(\s*\w+/m.test(ex.solution) && !ex.require.length && !ex.forbid.length);
// A function that must return its result (its tests check the value), with one return line.
// (A value that isn't a string, so printing it looks the same as the test printing it: 12, not '12'.)
const RETURN_CHALLENGE = findChallenge(({ ex }) => {
  const shown = ex.tests.find((t) => !t.hidden);
  return ex.kind === 'code' && shown?.returns && !/^['"]/.test(shown.expect) && ex.tests.some((t) => t.hidden) && /^\w+\(.*\)\n?$/.test(shown.call ?? '') && (ex.solution.match(/^def /gm) ?? []).length === 1 && (ex.solution.match(/^\s+return\b/gm) ?? []).length === 1 && !ex.require.length && !ex.forbid.length;
});
// A program of several files whose visible test runs it (own-modules).
const FILES_CHALLENGE = findChallenge(({ ex }) => ex.kind === 'code' && splitFiles(ex.seed).length >= 2 && ex.tests.some((t) => !t.hidden && t.call == null) && splitFiles(ex.solution).some((f) => f.path !== 'main.py' && /^def \w+\(.*\):$/m.test(f.text)));
// A program that reads a file its first test gives it.
const READ_CHALLENGE = findChallenge(({ ex }) => ex.kind === 'code' && ex.tests[0] && !ex.tests[0].hidden && ex.tests[0].files && !ex.tests[0].writes && ex.tests[0].call == null);
// A program that adds to a file its visible test gives it (open(..., "a")): with "w" it writes the wrong file.
const APPEND_CHALLENGE = findChallenge(({ ex }) => {
  const t = ex.tests.find((x) => !x.hidden && x.files && x.writes);
  return t && Object.keys(t.writes).some((f) => t.files[f] != null && new RegExp(`open\\(\\s*"${reEsc(f)}"\\s*,\\s*"a"`).test(ex.solution));
});

const lessonSession = await newPage();
{
  const { page, errors } = lessonSession;
  await test('a fill-in challenge: a wrong blank is explained, the right one passes', async () => {
    const ex = FIRST.challenges[0];
    const [answer] = blankAnswers(ex);
    expect(ex.kind === 'fill' && blankAnswers(ex).length === 1 && /^[a-z_]\w*$/.test(answer), `the course's first challenge is a fill-in of one name: ${ex.seed}`);
    const wrong = answer + 'n';
    await page.goto(BASE + firstPath);
    await lessonReady(page);
    await page.fill('input.blank', wrong);
    let out = await check(page);
    expect(out.includes('Not yet') && out.includes(`NameError: name '${wrong}' is not defined`) && /\(line \d+\)/.test(out) && out.includes(`Python doesn't know the name "${wrong}"`), out);
    expect((await page.locator('input.blank').getAttribute('aria-invalid')) === 'true', 'the wrong blank is marked');
    await axe(page, 'lesson with a crash');
    await page.fill('input.blank', answer);
    out = await check(page);
    expect(out.includes('All tests passed'), out);
    expect((await page.locator('.banner-pass.big').innerText()).includes(`Challenge 1 of ${FIRST.challenges.length} complete`), 'banner');
    await shot(page, 'lesson-desktop-pass');
  });
  await test('hints one at a time, then the solution and "Fill the blanks for me"', async () => {
    const ex = FIRST.challenges[1];
    expect(ex.kind === 'fill' && ex.hints.length >= 2, 'the second challenge of the first step is a fill-in with hints');
    await page.click('.banner-pass.big button');
    await page.waitForFunction(() => document.activeElement?.id === 'task-h', null, { timeout: 5000 });
    await page.locator('.task-card', { hasText: 'Challenge 2 of' }).waitFor();
    const hint = page.locator('.btn-hint');
    for (let k = 1; k <= ex.hints.length; k++) {
      await hint.click();
      expect((await page.evaluate(() => document.activeElement?.id)) === `hint-${k}`, `focus moves to hint ${k}, not lost with its button`);
    }
    expect((await page.locator('.hint').count()) === ex.hints.length && !(await hint.count()), `${ex.hints.length} hints shown, and no more to ask for`);
    await page.click('text=Show solution');
    await page.locator('.solution').waitFor();
    expect((await page.evaluate(() => document.activeElement?.id)) === 'solution', 'focus moves to the solution');
    expect((await page.locator('.solution').innerText()).includes(ex.solution.trim().split('\n')[0]), 'the solution is shown');
    await axe(page, 'lesson with hints and solution');
    await page.click('text=Fill the blanks for me');
    const out = await check(page);
    expect(out.includes('All tests passed'), out);
  });
  await test('a code challenge: a syntax error is shown as "Python couldn\'t read your code" with its line, a plain-English note and the editor\'s mark; a crash is explained with its line; Ctrl+Enter checks', async () => {
    const ex = FIRST.challenges[2];
    expect(ex.kind === 'code', 'the third challenge of the first step is a program to write');
    await page.click('.banner-pass.big button');
    await page.locator('.task-card', { hasText: 'Challenge 3 of' }).waitFor();
    // The model solution with the closing parenthesis of its last print missing.
    const lines = ex.solution.replace(/\n$/, '').split('\n');
    const at = lines.findLastIndex((l) => /^print\(.*\)$/.test(l));
    expect(at >= 0, `no print line to break in ${ex.solution}`);
    lines[at] = lines[at].replace(/\)$/, '');
    await setCode(page, lines.join('\n') + '\n');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => document.querySelector('.results')?.textContent?.includes("Python couldn't read your code"), null, { timeout: 120_000 });
    let out = await page.locator('.results').innerText();
    expect(out.includes("SyntaxError: '(' was never closed") && new RegExp(`line ${at + 1}\\b`, 'i').test(out) && out.includes('A parenthesis ( opened on this line is never closed'), out);
    expect(!/Failed:|Expected/i.test(out), 'no test ran: a syntax error is shown once, like a compiler error');
    await page.locator('.cm-lint-marker-error').first().waitFor();
    expect((await page.locator('.cm-lint-marker-error').count()) === 1 && (await markedLine(page)) === at + 1, `the editor marks line ${await markedLine(page)}, not ${at + 1}`);
    await axe(page, 'lesson with a syntax error');
    // The model solution, then a division by zero: the crash is explained, with its line.
    await setCode(page, ex.solution.replace(/\n*$/, '\n') + 'print(10 / 0)\n');
    out = await check(page);
    const crashLine = ex.solution.replace(/\n*$/, '').split('\n').length + 1;
    expect(out.includes('Not yet') && out.includes(`The program stopped with ZeroDivisionError: division by zero (line ${crashLine})`) && out.includes('The program divided by zero.'), out);
    expect((await page.locator('details.stderr pre').first().textContent()).includes(`File "main.py", line ${crashLine}`), 'what Python printed is kept in a details box');
    expect((await page.locator('.cm-lint-marker-error').count()) === 0, 'a crash is not marked as a syntax error');
    await setCode(page, ex.solution);
    const passed = await check(page);
    expect(passed.includes('All tests passed'), passed);
    expect((await page.locator('.banner-pass.big').innerText()).includes('Step complete'), 'the step is complete');
  });
  await test('progress is saved: after a reload the step and its challenges are done', async () => {
    const n = FIRST.challenges.length;
    await page.goto(BASE + `learn/${FIRST_MODULE.id}/`);
    await page.locator('.steplist').waitFor();
    const first = await page.locator('.steplist li').first().innerText();
    expect(first.includes(`${n}/${n}`), first);
    expect((await page.locator('.steplist li.done').count()) === 1, 'one step done');
    await page.goto(BASE + 'learn/');
    await page.locator('.module-live').first().waitFor();
    expect((await page.locator('.module-live').first().innerText()).includes(`1/${FIRST_STEPS.length}`), `course page shows 1 of ${FIRST_STEPS.length} steps`);
    await page.goto(BASE + firstPath);
    // The pre-rendered page has the challenge tabs too; the workbench only exists once the app runs.
    await page.locator('.workbench').waitFor();
    expect((await page.locator('.challenge-done').count()) === n, `all ${n} challenges marked done`);
    expect((await page.locator('.dot-done').count()) === 1, 'step dot done');
  });
  await test('a rule is enforced: deleting the line instead of commenting it out is not accepted', async () => {
    expect(RULE_CHALLENGE, 'no challenge has a rule about a line to comment out');
    const { ex } = RULE_CHALLENGE;
    const rule = ex.require.find((r) => r.raw && /^#/.test(r.pattern));
    // The model solution without its commented-out line: the same output, but the rule isn't met.
    const code = ex.solution.split('\n').filter((l) => !new RegExp(rule.pattern).test(l)).join('\n');
    expect(code !== ex.solution && JSON.stringify(checkRules(code, ex.require, ex.forbid)) === JSON.stringify([rule.message]), `the test's own program: ${code}`);
    await openChallenge(page, RULE_CHALLENGE);
    await setCode(page, code);
    const out = await check(page);
    expect(out.includes('Not yet') && out.includes(rule.message.replace(/`/g, '')), out);
    expect((await page.locator('.t-fail').count()) === 0, 'the output itself matched');
  });
  await test('hidden tests catch a hard-coded answer', async () => {
    expect(INPUT_CHALLENGE, 'no code challenge reads input, with a hidden test');
    const { ex } = INPUT_CHALLENGE;
    const shown = ex.tests.filter((t) => !t.hidden);
    await openChallenge(page, INPUT_CHALLENGE);
    // What the visible test prints, typed in as it is: no input() at all.
    await setCode(page, `print(${JSON.stringify(shown[0].expect)})\n`);
    const out = await check(page);
    expect((await page.locator('.t-pass').count()) === shown.length, `the visible test passes: ${out}`);
    expect((await page.locator('.t-fail').count()) === ex.tests.length - shown.length && out.includes('Hidden test') && out.includes("hidden so the answer can't be typed in directly"), out);
    // A hidden test's input and output stay hidden.
    for (const t of ex.tests.filter((x) => x.hidden)) expect(!out.includes(t.expect.split('\n').at(-1)) || shown.some((s) => s.expect.includes(t.expect.split('\n').at(-1))), `a hidden test's output is shown: ${t.expect}`);
  });
  await test('input: a test types the program\'s input, and the output shows each line after its prompt; "Run with my input" runs it freely', async () => {
    const { ex } = INPUT_CHALLENGE;
    const prompt = /input\("([^"]+)"\)/.exec(ex.solution)[1];
    const typed = ex.tests[0].stdin.split('\n')[0];
    // As in a terminal: the typed line right after the prompt, then a line break.
    expect(ex.tests[0].expect.includes(`${prompt}${typed}\n`), `the expected output shows the input after its prompt: ${JSON.stringify(ex.tests[0].expect)}`);
    const card = await page.locator('.task-card').innerText();
    expect(/Input\s/i.test(card) && card.includes(typed) && card.includes(`${prompt}${typed}`), `the task card shows the input and the run: ${card}`);
    // A program that prints the wrong thing after reading: the comparison shows the input and the echoed run.
    await setCode(page, ex.solution.replace(/\n*$/, '\n') + 'print("one more line")\n');
    let out = await check(page);
    const failed = page.locator('.t-fail').first();
    expect((await failed.locator('.t-detail').innerText()).includes(`${prompt}${typed}`) && /input/i.test(await failed.innerText()), `the failed test shows the run with its input: ${out}`);
    await setCode(page, ex.solution);
    out = await check(page);
    expect(out.includes('All tests passed'), out);
    await page.click('text=Run with my input');
    expect((await page.inputValue('#stdin')) === ex.tests[0].stdin, 'the input box starts with the first test\'s input');
    await page.fill('#stdin', 'Grace');
    const wb = page.locator('.workbench');
    const before = Number(await wb.getAttribute('data-checks'));
    await page.click('.freerun button');
    await page.waitForFunction((n) => Number(document.querySelector('.workbench')?.getAttribute('data-checks')) > n, before, { timeout: 120_000 });
    const free = await page.locator('.freerun .console').innerText();
    expect(free.startsWith(`${prompt}Grace\n`), free);
  });
  await test('a crash in a lesson is explained with its line; lessons can show a crash on purpose', async () => {
    const { ex } = INPUT_CHALLENGE;
    // The program asks for one line more than the test gives: EOFError, explained.
    const code = ex.solution.replace(/\n*$/, '\n') + 'extra = input("One more: ")\n';
    const line = code.replace(/\n$/, '').split('\n').length;
    await setCode(page, code);
    const out = await check(page);
    expect(out.includes(`The program stopped with EOFError: EOF when reading a line (line ${line})`) && out.includes("after the test's input had run out"), out);
    // The hidden test stopped the same way: said once, then a short line.
    expect(out.split("after the test's input had run out").length === 2 && out.includes(`Stopped the same way as the test above (EOFError, line ${line})`), out);
    await axe(page, 'lesson with a crash');
    // A lesson whose examples show what Python prints when it stops.
    const crashes = COURSE_INDEX.modules.flatMap((m) => moduleOf(m.id).steps.map((s) => ({ m, s }))).find(({ s }) => (s.text.match(/^```crash$/gm) ?? []).length >= 2);
    expect(crashes, 'no lesson shows two crashes');
    const lesson = await newPage();
    await lesson.page.goto(BASE + `learn/${crashes.m.id}/${crashes.s.slug}/`);
    await lesson.page.locator('.workbench').waitFor();
    const figures = lesson.page.locator('article.step-text figure.io-crash');
    expect((await figures.count()) === (crashes.s.text.match(/^```crash$/gm) ?? []).length, `${await figures.count()} crash blocks`);
    expect((await figures.first().locator('figcaption').textContent()).trim() === 'Python stops with', await figures.first().locator('figcaption').textContent());
    expect((await figures.first().locator('pre').textContent()).includes('Error'), 'the crash block shows the error');
    await lesson.ctx.close();
  });
  await test('"Report a problem" opens a GitHub issue with the code filled in', async () => {
    const link = page.locator('.report-link');
    await link.focus();
    const href = await link.getAttribute('href');
    expect(href.startsWith('https://github.com/AntonyPerez0/pythonarena/issues/new?'), href);
    const body = decodeURIComponent(href.replace(/\+/g, ' '));
    expect(body.includes('extra = input("One more: ")') && body.includes('```python'), 'the code is in the issue');
    expect(body.includes(`\`${INPUT_CHALLENGE.step.id}#${INPUT_CHALLENGE.index + 1}\``), 'the issue names the challenge');
  });
  await test('settings: text size and theme are applied and saved', async () => {
    await page.goto(BASE + 'settings/');
    await page.check('input[name="size"][value="1.25"]');
    await page.check('input[name="theme"][value="light"]');
    await page.reload();
    expect((await page.evaluate(() => document.documentElement.style.getPropertyValue('--scale'))) === '1.25', 'text size kept');
    expect((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'theme kept');
    await axe(page, 'settings');
    await page.check('input[name="size"][value="1"]');
    await page.check('input[name="theme"][value="system"]');
  });
  await test('"What does it print?": lines are checked against the real output, the answer isn\'t shown', async () => {
    const found = findChallenge(({ ex, index }) => index === 0 && ex.kind === 'predict' && ex.lines?.length >= 2);
    expect(found, 'no step starts with a "What does it print?" of two lines or more');
    const { lines } = found.ex;
    await page.goto(BASE + `learn/${found.moduleId}/${found.step.slug}/`);
    await page.locator('.predict-lines').waitFor();
    const card = await page.locator('.task-card').innerText();
    expect(!/Expected output/i.test(card), 'the task card does not show the answer');
    for (const [i, l] of lines.entries()) await page.fill(`#line-${i + 1}`, i === 0 ? `${l} x` : l);
    let out = await check(page);
    expect(out.includes(`1 of ${lines.length} lines is not what the program prints`), out);
    expect((await page.locator('#line-1').getAttribute('aria-invalid')) === 'true' && (await page.locator('#line-2').getAttribute('aria-invalid')) === null, 'only the wrong line is marked');
    // Another wrong answer gives the same result text: the status region is emptied and filled
    // again, so a screen reader announces it again.
    await page.waitForFunction(() => document.querySelector('.predict > [role="status"]')?.textContent.includes('is not what'));
    await page.evaluate(() => {
      const region = document.querySelector('.predict > [role="status"]');
      window.__said = [];
      new MutationObserver(() => window.__said.push(region.textContent)).observe(region, { childList: true, characterData: true, subtree: true });
    });
    await page.fill('#line-1', `${lines[0]} y`);
    await check(page);
    await page.waitForFunction(() => window.__said.length >= 2 && window.__said.at(-1).includes('is not what the program prints'));
    const said = await page.evaluate(() => window.__said);
    expect(said.includes('') && said.at(-1).startsWith(`1 of ${lines.length}`), JSON.stringify(said));
    // "Report a problem" carries the lines typed.
    await page.locator('.report-link').focus();
    const report = decodeURIComponent((await page.locator('.report-link').getAttribute('href')).replace(/\+/g, ' '));
    expect(report.includes(`line 1: ${lines[0]} y`), 'the report has the typed lines');
    await page.fill('#line-1', lines[0]);
    out = await check(page);
    expect(out.includes('Every line is right'), out);
    expect((await page.locator('.banner-pass.big').innerText()).includes(`Challenge 1 of ${1 + found.step.more.length} complete`), 'banner');
    await axe(page, 'predict challenge');
    // The report's code block is Python: the typed lines are Python comments, not Java's.
    expect(!report.includes('// line'), `the typed lines are written as Java comments (// line 1: ...) in the report's python block: ${report.slice(report.indexOf('```python'), report.indexOf('```python') + 80).replace(/\n/g, ' | ')}`);
  });
  await test('a function challenge: the check calls the function, and explains why it can\'t', async () => {
    expect(CALL_CHALLENGE, 'no code challenge calls a function with a parameter in its tests');
    const { ex } = CALL_CHALLENGE;
    const [, name] = /^def (\w+)\(([^)]*)\):/m.exec(ex.solution);
    const call = ex.tests[0].call.trim();
    const hiddenCalls = ex.tests.filter((t) => t.hidden).map((t) => t.call.trim()).filter((c) => c !== call);
    await openChallenge(page, CALL_CHALLENGE);
    const card = await page.locator('.task-card').innerText();
    expect(/the test runs/i.test(card) && card.includes(call) && card.includes(ex.tests[0].expect.split('\n')[0]), card);
    // Code shows the characters to type: != stays two characters, not one ligature.
    const ligatures = await page.evaluate(() => ['.editor .cm-scroller', '.task-card code'].map((q) => getComputedStyle(document.querySelector(q)).fontVariantLigatures));
    expect(ligatures.every((l) => l === 'none'), `ligatures: ${ligatures}`);
    // A function with another name: the check can't call it, and says why in one plain reason.
    await setCode(page, ex.solution.replace(`def ${name}(`, `def ${name}_2(`));
    let out = await check(page);
    expect(out.includes("The check couldn't call your code") && out.includes(`The test calls ${name}, but your program doesn't define anything with that name`) && out.split("doesn't define anything with that name").length === 2, out);
    expect((await page.locator('.t-fail, .t-pass').count()) === 0, 'no test is listed when none could call the code');
    // A def line with one parameter too many: one plain reason, not one per test, and the hidden tests' calls stay hidden.
    await setCode(page, ex.solution.replace(new RegExp(`def ${name}\\(([^)]*)\\)`), `def ${name}($1, extra)`));
    const params = await check(page);
    expect(params.includes("The check couldn't call your code") && params.includes('Give the def line exactly the parameters the task asks for'), params);
    // A crash inside the function: explained with the learner's own line and function.
    const lines = ex.solution.split('\n');
    const def = lines.findIndex((l) => l.startsWith(`def ${name}(`));
    lines.splice(def + 1, 0, '    1 / 0');
    await setCode(page, lines.join('\n'));
    out = await check(page);
    expect(out.includes(`The program stopped with ZeroDivisionError: division by zero (line ${def + 2}, in ${name})`), out);
    const stderr = await page.locator('details.stderr pre').first().textContent();
    expect(stderr.includes(`File "main.py", line ${def + 2}, in ${name}`) && !/arena/i.test(stderr), stderr);
    await setCode(page, ex.solution);
    out = await check(page);
    expect(out.includes('All tests passed'), out);
    await axe(page, 'function challenge');
    // The wrong parameters, explained above: one reason (not one per test), and no hidden test's call.
    const reasons = params.split('Give the def line exactly the parameters the task asks for').length - 1;
    const leaked = hiddenCalls.filter((c) => params.includes(c));
    expect(reasons === 1 && !leaked.length, `with one parameter too many, the reason is given ${reasons} times (once per test), showing the hidden tests' calls ${leaked.join(' and ')}:\n${params.slice(params.indexOf("The check couldn't"))}`);
  });
  await test('a function that prints its result instead of returning it fails, with a note that says so', async () => {
    expect(RETURN_CHALLENGE, 'no code challenge checks the value a function returns');
    const { ex } = RETURN_CHALLENGE;
    const shown = ex.tests.find((t) => !t.hidden);
    const call = shown.call.trim();
    await openChallenge(page, RETURN_CHALLENGE);
    // return x becomes print(x): the same text is printed, but the function returns None.
    await setCode(page, ex.solution.replace(/^(\s+)return (.+)$/m, '$1print($2)'));
    const out = await check(page);
    const failed = page.locator('.t-fail', { hasText: call }).first();
    const [want, got] = await failed.locator('.t-cmp pre').allInnerTexts();
    expect(want.trim() === shown.expect.trim() && got.trim() === shown.expect.trim(), `the output looks right: ${want} / ${got}`);
    const note = await failed.locator('.t-note').innerText();
    expect(note.includes('printed something but returned None') && note.includes('use return instead of print'), note);
    await setCode(page, ex.solution);
    expect((await check(page)).includes('All tests passed'), 'the model solution passes');
    const leaked = ex.tests.filter((x) => x.hidden && out.includes(x.call.trim())).map((x) => x.call.trim());
    expect(!note.includes('`') && !leaked.length, `the note shows Markdown's backticks as text (${note.slice(0, 60)}...), and the hidden tests' notes show their calls: ${leaked.join(', ')}`);
  });
  await test('an endless loop is stopped at the time limit (5 s) with what it printed kept, and the next check works', async () => {
    await page.goto(BASE + firstPath);
    await lessonReady(page);
    await page.locator('.challenge-tab').nth(2).click();
    await page.locator('.task-card', { hasText: 'Challenge 3 of' }).waitFor();
    await setCode(page, 'print("before the loop")\nwhile True:\n    pass\n');
    const t0 = Date.now();
    let out = await check(page);
    const ms = Date.now() - t0;
    expect(ms >= 4500 && ms < 30_000, `the check took ${ms} ms`);
    expect(out.includes('Time limit: the program ran for more than 5 seconds and was stopped') && out.includes('What it printed until then is shown'), out);
    const printed = (await page.locator('.t-fail .t-cmp pre').nth(1).innerText()).trim();
    await setCode(page, FIRST.challenges[2].solution);
    out = await check(page);
    expect(out.includes('All tests passed'), out);
    expect(printed === 'before the loop', `what it printed before the loop isn't shown: "your program printed" says ${JSON.stringify(printed)}`);
  });
  await test('a challenge of several files: a tab per file, errors marked in the right file, and a pass', async () => {
    expect(FILES_CHALLENGE, 'no challenge has a program of several files');
    const { ex, step, index } = FILES_CHALLENGE;
    const seedPaths = splitFiles(ex.seed).map((f) => f.path);
    await openChallenge(page, FILES_CHALLENGE);
    expect(JSON.stringify(await tabPaths(page)) === JSON.stringify(seedPaths) && seedPaths[0] === 'main.py', `a tab per file, main.py first: ${await tabPaths(page)}`);
    // The editor sits below the tabs, not over them.
    const gap = await page.evaluate(() => document.querySelector('[role=tabpanel]').getBoundingClientRect().top - document.querySelector('.file-tab').getBoundingClientRect().bottom);
    expect(gap >= -1, `the editor covers the tabs by ${-gap} px`);
    expect(!(await check(page)).includes('All tests passed'), 'the starter code passes');
    // The model solution with a colon missing on a def line of a module: the error names that file and opens its tab.
    const files = splitFiles(ex.solution);
    const broken = files.find((f) => f.path !== 'main.py' && /^def \w+\(.*\):$/m.test(f.text));
    const line = linesMatching(broken.text, /^def \w+\(.*\):$/)[0];
    const text = broken.text.split('\n').map((l, i) => (i === line - 1 ? l.replace(/:$/, '') : l)).join('\n');
    await setFiles(page, joinFiles(files.map((f) => (f === broken ? { ...f, text } : f))));
    await page.click('#file-tab-0');
    await page.locator('.file-tab-on', { hasText: 'main.py' }).waitFor();
    let out = await check(page);
    expect(out.includes("Python couldn't read your code") && new RegExp(`${reEsc(broken.path)}, line ${line}\\b`, 'i').test(out) && out.includes("SyntaxError: expected ':'") && out.includes('must end with a colon'), out);
    const at = seedPaths.indexOf(broken.path);
    await page.locator(`#file-tab-${at}[aria-selected="true"]`).waitFor();
    expect((await page.locator(`#file-tab-${at} .file-tab-errors`).innerText()).startsWith('1') && (await page.locator('.file-tab-errors').count()) === 1, 'the file with the error is open, with its count');
    await page.locator('.cm-lint-marker-error').first().waitFor();
    expect((await markedLine(page)) === line && (await page.locator('.cm-lint-marker-error').count()) === 1, `the mark is on line ${await markedLine(page)}, not ${line}`);
    await axe(page, 'a challenge of several files, with an error');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 700 });
      await noOverflow(page, `a challenge of several files at ${width} px`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    // A crash in the module names its file and function.
    const fn = /^def (\w+)\(/m.exec(broken.text)[1];
    const crashing = broken.text.split('\n');
    crashing.splice(line, 0, '    1 / 0');
    await setCode(page, crashing.join('\n'));
    out = await check(page);
    expect(out.includes(`ZeroDivisionError: division by zero (${broken.path}, line ${line + 1}, in ${fn})`), out);
    // Each file keeps its undo history: a change in the module can be undone after a visit to main.py.
    await setCode(page, broken.text);
    await page.click('.cm-content');
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('# a note\n');
    await page.click('#file-tab-0');
    await page.locator('.file-tab-on', { hasText: 'main.py' }).waitFor();
    await page.click(`#file-tab-${at}`);
    await page.click('.cm-content');
    await page.keyboard.press('ControlOrMeta+Z');
    expect(!(await editorText(page)).includes('# a note'), 'the change was undone after switching files');
    await setFiles(page, ex.solution);
    out = await check(page);
    expect(out.includes('All tests passed'), out);
    // The code of every file is saved.
    const saved = await page.evaluate(([k, id, i]) => JSON.parse(localStorage.getItem(k)).steps[id]?.challenges?.[i]?.code ?? '', [KEY, step.id, index]);
    expect(seedPaths.every((p) => saved.includes(`# ==== ${p} ====`)), saved.slice(0, 300));
  });
  await test('a challenge that reads a file: the task card shows the file; "Run with my input" gives the program the same file; the model solution passes', async () => {
    expect(READ_CHALLENGE, 'no challenge gives its program a file to read');
    const { ex } = READ_CHALLENGE;
    const t = ex.tests[0];
    const [[name, text]] = Object.entries(t.files);
    await openChallenge(page, READ_CHALLENGE);
    const card = page.locator('.task-card');
    const box = card.locator('.task-io > div', { hasText: new RegExp(`The file\\s+${reEsc(name)}`, 'i') });
    expect((await box.count()) === 1 && (await box.locator('pre').innerText()).trim() === text.trim(), `the task card shows ${name}: ${await card.innerText()}`);
    await setCode(page, ex.solution);
    await page.click('text=Run with my input');
    expect((await page.locator('.freerun').innerText()).includes(`The program can also read ${name}, as in the task.`), await page.locator('.freerun').innerText());
    const before = Number(await page.locator('.workbench').getAttribute('data-checks'));
    await page.click('.freerun button');
    await page.waitForFunction((n) => Number(document.querySelector('.workbench')?.getAttribute('data-checks')) > n, before, { timeout: 120_000 });
    const free = (await page.locator('.freerun .console').innerText()).trim();
    expect(free === t.expect.trim(), `the free run with the task's file printed ${JSON.stringify(free)}`);
    expect(!(await page.locator('.freerun .written-files').count()), 'the file it read is not listed as written');
    const out = await check(page);
    expect(out.includes('All tests passed'), out);
  });
  await test('a check on the file a program writes: a wrong file shows what it should contain and what the program wrote; the model solution passes', async () => {
    expect(APPEND_CHALLENGE, 'no challenge adds to a file its test gives');
    const { ex } = APPEND_CHALLENGE;
    const shown = ex.tests.find((t) => !t.hidden && t.files && t.writes);
    const name = Object.keys(shown.writes).find((f) => shown.files[f] != null);
    await openChallenge(page, APPEND_CHALLENGE);
    // The task says what the file should hold after the run.
    const card = await page.locator('.task-card').innerText();
    expect(new RegExp(`${reEsc(name)} after the run`, 'i').test(card) && card.includes(shown.writes[name].trim()), card);
    // Opened with "w" instead of "a": the file loses what it had.
    const wrong = ex.kind === 'fill' ? null : ex.solution.replace(new RegExp(`(open\\(\\s*"${reEsc(name)}"\\s*,\\s*)"a"`), '$1"w"');
    if (wrong) await setCode(page, wrong);
    else await fillBlanks(page, blankAnswers(ex).map((a) => (/^["']a["']$/.test(a) ? '"w"' : a)));
    let out = await check(page);
    expect(out.includes('Not yet'), out);
    const failed = page.locator('.t-fail', { hasText: shown.name }).first();
    const cmp = failed.locator('.t-cmp', { hasText: new RegExp(`${reEsc(name)} should contain`, 'i') });
    expect((await cmp.count()) === 1, `no comparison of ${name}: ${out}`);
    const [should, wrote] = await cmp.locator('pre').allInnerTexts();
    expect(should.trim() === shown.writes[name].trim(), `${name} should contain ${JSON.stringify(should)}, not ${JSON.stringify(shown.writes[name])}`);
    expect(/your program wrote/i.test(await cmp.innerText()) && wrote.trim() !== '' && wrote.trim() !== shown.writes[name].trim() && !wrote.includes("didn't create"), `what the program wrote: ${JSON.stringify(wrote)}`);
    // The file the test gave is shown too, and the output (which is right) isn't compared again.
    expect((await failed.locator('.t-detail').innerText()).includes(shown.files[name].trim().split('\n')[0]), 'the file the test gave');
    // Hidden tests keep their files' contents hidden.
    for (const t of ex.tests.filter((t) => t.hidden && t.writes)) for (const text of Object.values(t.writes)) expect(text.length < 8 || !out.includes(text.trim()), `a hidden test's file is shown: ${text}`);
    await axe(page, 'a failed check of a written file');
    if (ex.kind === 'fill') await fillBlanks(page, blankAnswers(ex));
    else await setCode(page, ex.solution);
    out = await check(page);
    expect(out.includes('All tests passed'), out);
  });
  await test('two open tabs keep each other\'s progress', async () => {
    const found = findChallenge(({ ex, index, step }) => index === 0 && ex.kind === 'fill' && step.id !== FIRST.step.id);
    const other = await lessonSession.ctx.newPage();
    await other.goto(BASE + 'settings/');
    await other.locator('input[name="theme"]').first().waitFor();
    // This tab finishes a challenge; the other one then changes a setting and saves.
    await page.goto(BASE + `learn/${found.moduleId}/${found.step.slug}/`);
    await lessonReady(page);
    await fillBlanks(page, blankAnswers(found.ex));
    expect((await check(page)).includes('All tests passed'), 'passed');
    await page.waitForTimeout(400);
    await other.check('input[name="theme"][value="light"]');
    await other.waitForTimeout(400);
    await other.close();
    // The setting reaches this tab right away, and this tab's progress survived the other tab's save.
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light', null, { timeout: 5000 });
    await page.reload();
    await page.locator('.workbench').waitFor();
    expect((await page.locator('.challenge-done').count()) >= 1, 'the passed challenge is still done');
    await page.goto(BASE + 'settings/');
    await page.check('input[name="theme"][value="system"]');
  });
  await test('phone menu: focus moves into it, Escape closes it', async () => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(BASE + 'learn/');
    await page.locator('.module-live').first().waitFor();
    await page.click('button[aria-label="Open menu"]');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#main-nav')), 'focus is in the menu');
    await page.keyboard.press('Escape');
    expect((await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Open menu', 'focus back on the menu button');
    await page.setViewportSize({ width: 1280, height: 900 });
  });
  await test('no errors in the console on lesson pages', async () => {
    expect(errors.length === 0, errors.join('\n'));
  });
}
await lessonSession.ctx.close();

// ------------------------------------------------------------------ pygame lessons (parts 13 and 14)
console.log('pygame lessons');
// The course's pygame modules come in a later batch: these tests check the first lesson with a window
// example and the first window challenge, once the build has them, and say so while it doesn't.

/** The window examples of a step's text, as the build wrote them (```window-shot blocks). */
const windowShots = (step) => [...step.text.matchAll(/^```window-shot\n([\s\S]*?)\n```$/gm)].map((m) => JSON.parse(m[1]));
const SHOT_STEP = (() => {
  for (const m of COURSE_INDEX.modules) {
    const step = moduleOf(m.id).steps.find((s) => windowShots(s).length > 0);
    if (step) return { moduleId: m.id, step };
  }
  return null;
})();
/**
 * A pygame challenge whose task card shows a window: a visible test with frames (events too, when a
 * challenge has them) and the window it should end with, and a model solution that fills the window
 * with a color (so a wrong color makes a wrong window).
 */
const FILLS = /\.fill\(\(\d+, \d+, \d+\)\)/;
const windowChallenge = (events) => findChallenge(({ ex }) => ex.kind === 'code' && FILLS.test(ex.solution) && ex.tests.some((t) => !t.hidden && t.window && t.expectWindow && (!events || t.window.events.length > 0)));
const WINDOW_CHALLENGE = windowChallenge(true) ?? windowChallenge(false);
/** The window panel's state: frames it has, the frame shown, the run counter of the page. */
const panelState = (panel) => panel.evaluate((p) => ({ frames: Number(p.dataset.frames), shown: Number(p.dataset.shown), status: p.querySelector('.pg-status')?.textContent ?? '' }));
/** Waits until the window panel has at least `frames` frames and shows frame `shown` or later. */
async function panelReaches(panel, { frames = 0, shown = 0 }, timeout = 60_000) {
  await panel.page().waitForFunction(([p, f, s]) => Number(p.dataset.frames) >= f && Number(p.dataset.shown) >= s, [await panel.elementHandle(), frames, shown], { timeout });
}
/** What the window panel's "The window as text" says for the frame on screen. */
async function windowText(panel) {
  const d = panel.locator('details.pg-astext');
  if ((await d.getAttribute('open')) === null) await d.locator('summary').click();
  return d.locator('pre').textContent();
}

/** The site's images a step's text shows (```asset blocks): [name, width, height]. */
const assetBlocks = (step) => [...step.text.matchAll(/^```asset (\S+)\n(\d+)x(\d+)\n```$/gm)].map((m) => [m[1], Number(m[2]), Number(m[3])]);
const ASSET_STEP = (() => {
  for (const m of COURSE_INDEX.modules) {
    const step = moduleOf(m.id).steps.find((s) => assetBlocks(s).length > 0);
    if (step) return { moduleId: m.id, step };
  }
  return null;
})();

await test('images in lessons: an asset block shows one of the site\'s images, drawn larger with crisp pixels, with its name and size (the pre-rendered page too)', async () => {
  if (!ASSET_STEP) {
    console.log('       (skipped: no lesson shows one of the site\'s images yet)');
    return;
  }
  const { moduleId, step } = ASSET_STEP;
  const blocks = assetBlocks(step);
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + `learn/${moduleId}/${step.slug}/`);
  await page.locator('.workbench').waitFor({ timeout: ENGINE_TIMEOUT });
  const figures = page.locator('article.step-text figure.asset-img');
  expect((await figures.count()) === blocks.length, `${await figures.count()} images drawn for ${blocks.length} asset blocks`);
  for (const [k, [name, w, h]] of blocks.entries()) {
    const img = figures.nth(k).locator('img');
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction((e) => e.complete && e.naturalWidth > 0, await img.elementHandle());
    const shown = await img.evaluate((e) => ({ w: e.naturalWidth, h: e.naturalHeight, alt: e.alt, rendering: getComputedStyle(e).imageRendering, drawn: e.getBoundingClientRect().width }));
    expect(shown.w === w && shown.h === h && shown.alt === `The image ${name}` && shown.rendering === 'pixelated' && shown.drawn > w, `${name}: ${JSON.stringify(shown)}`);
    const caption = await figures.nth(k).locator('figcaption').innerText();
    expect(caption === `${name}, ${w} × ${h} pixels`, `${name}'s caption: ${caption}`);
    expect((await fetch(BASE + `images/${name}`)).status === 200, `images/${name} isn't served`);
  }
  // The pre-rendered page shows the same images.
  const html = await (await fetch(BASE + `learn/${moduleId}/${step.slug}/`)).text();
  for (const [name] of blocks) expect(html.includes(`<img src="${BASE_PATH}images/${name}"`), `the pre-rendered page lacks ${name}`);
  await bothThemes(page, 'a lesson with images');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('a pygame lesson: a window example shows its last frame with its title, size and the window as text (the pre-rendered page too); Play runs it in the page to the same last frame; axe in both themes and at 320 px', async () => {
  if (!SHOT_STEP) {
    console.log('       (skipped: no lesson has a pygame window example yet; modules 53 to 58 are being written)');
    return;
  }
  const { moduleId, step } = SHOT_STEP;
  const shots = windowShots(step);
  const shotOf = shots[0];
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + `learn/${moduleId}/${step.slug}/`);
  await page.locator('.workbench').waitFor({ timeout: ENGINE_TIMEOUT });
  const figures = page.locator('article.step-text .pg-shot');
  expect((await figures.count()) === shots.length, `${await figures.count()} window examples drawn for ${shots.length} in the lesson`);
  const figure = figures.first();
  const img = figure.locator('figure.pg-window img');
  await img.scrollIntoViewIfNeeded();
  await page.waitForFunction((e) => e.complete && e.naturalWidth > 0, await img.elementHandle());
  if (shotOf.size) expect((await img.evaluate((e) => [e.naturalWidth, e.naturalHeight]).then((s) => s.join('x'))) === shotOf.size.join('x'), 'the picture is the window\'s size');
  expect((await figure.locator('.pg-title').first().innerText()) === shotOf.title, `the title bar: ${await figure.locator('.pg-title').first().innerText()}`);
  if (shotOf.size) expect((await figure.locator('.pg-size').first().innerText()) === `${shotOf.size[0]} × ${shotOf.size[1]}`, 'the window\'s size');
  expect((await figure.locator('figcaption').first().innerText()).startsWith(`The window after ${shotOf.frames} ${shotOf.frames === 1 ? 'frame' : 'frames'}`), await figure.locator('figcaption').first().innerText());
  const details = figure.locator('details.pg-astext').first();
  expect((await details.getAttribute('open')) === null, 'the window as text starts closed');
  await details.locator('summary').click();
  expect((await details.locator('pre').textContent()) === (shotOf.log || '(nothing drawn)'), `the window as text: ${await details.locator('pre').textContent()}`);
  // The pre-rendered page (before any script runs) has the same figures.
  const html = await (await fetch(BASE + `learn/${moduleId}/${step.slug}/`)).text();
  expect((html.match(/<figure class="pg-window"/g) ?? []).length === shots.length && html.includes(`src="${BASE_PATH}${shotOf.image}"`) && html.includes(esc(shotOf.log || '(nothing drawn)')), 'the pre-rendered page draws the window examples');
  await bothThemes(page, 'a lesson with a pygame window example');
  await page.setViewportSize({ width: 320, height: 800 });
  await noOverflow(page, 'a lesson with a pygame window example at 320 px');
  await page.setViewportSize({ width: 1280, height: 900 });
  // Play: the program runs in the page, its frames play to the last one, which is the picture's.
  await figure.getByRole('button', { name: 'Play this example' }).click();
  const panel = figure.locator('.pg-panel');
  await panel.waitFor({ timeout: ENGINE_TIMEOUT });
  await panelReaches(panel, { frames: shotOf.frames, shown: shotOf.frames }, ENGINE_TIMEOUT);
  const st = await panelState(panel);
  expect(st.frames === shotOf.frames && st.shown === shotOf.frames, `played: ${JSON.stringify(st)}`);
  expect((await windowText(panel)) === (shotOf.log || '(nothing drawn)'), `the last frame played: ${await windowText(panel)}`);
  await bothThemes(page, 'a lesson\'s window example playing');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('a window challenge: the task card says what the test does and shows the window it should end with; a wrong program shows both windows with the differing lines marked; "Run the window" plays the test in the page; axe in both themes and at 320 px; the model solution passes', async () => {
  if (!WINDOW_CHALLENGE) {
    console.log('       (skipped: no challenge has a pygame window test yet; modules 53 to 58 are being written)');
    return;
  }
  const { ex } = WINDOW_CHALLENGE;
  const shown = ex.tests.find((t) => !t.hidden && t.window && t.expectWindow);
  const want = shown.expectWindow;
  const { ctx, page, errors } = await newPage();
  await openChallenge(page, WINDOW_CHALLENGE);
  const card = page.locator('.task-card');
  const words = await card.locator('.task-window').innerText();
  expect(words.includes(`The window shows ${shown.window.frames} ${shown.window.frames === 1 ? 'frame' : 'frames'}`), words);
  for (const line of describeEvents(shown.window.events)) expect(words.includes(line), `the task card says "${line}": ${words}`);
  const cardImg = card.locator('figure.pg-window img');
  expect((await cardImg.getAttribute('src')).endsWith(want.image), 'the task card draws the expected window');
  expect((await card.locator('details.pg-astext pre').textContent()) === (want.log || '(nothing drawn)'), 'the task card\'s window as text');
  // The starter program fails.
  await setProgram(page, ex.seed);
  let out = await check(page);
  expect(out.includes('Not yet'), out);
  // The model solution with the window filled with another color: both windows are shown, with the lines that differ marked.
  const [, color] = /\.fill\((\(\d+, \d+, \d+\))\)/.exec(ex.solution);
  const other = color === '(1, 2, 3)' ? '(3, 2, 1)' : '(1, 2, 3)';
  await setProgram(page, ex.solution.replace(`.fill(${color})`, `.fill(${other})`));
  out = await check(page);
  expect(out.includes('Not yet'), out);
  const failed = page.locator('.t-fail', { hasText: shown.name }).first();
  const cmp = failed.locator('.pg-compare');
  expect((await cmp.count()) === 1, `no window comparison: ${out}`);
  expect((await failed.locator('.t-note').innerText()).includes("The window's last frame isn't what it should be"), await failed.locator('.t-note').innerText());
  const sides = cmp.locator('.t-cmp > div');
  expect((await sides.count()) === 2, 'two windows side by side');
  expect(/the window after \d+ frames? should be/i.test(await sides.nth(0).locator('.lbl').first().innerText()) && /your window after \d+ frames?/i.test(await sides.nth(1).locator('.lbl').first().innerText()), await cmp.innerText());
  const expectedLog = (await sides.nth(0).locator('pre.pg-log').textContent()).replace(/ \(differs\)/g, '');
  expect(expectedLog.trim() === (want.log || '(nothing drawn)').trim(), `the expected window as text: ${expectedLog}`);
  const yours = (await sides.nth(1).locator('pre.pg-log').textContent()).replace(/ \(differs\)/g, '').split('\n');
  const marked = (await sides.nth(0).locator('.pg-diff').allTextContents()).map((t) => t.replace(/ \(differs\)\n?$/, ''));
  const markedYours = (await sides.nth(1).locator('.pg-diff').allTextContents()).map((t) => t.replace(/ \(differs\)\n?$/, ''));
  expect(marked.length > 0 && marked.every((l) => !yours.includes(l)) && markedYours.some((l) => l.includes(`fill ${other}`)), `marked in the expected window: ${marked}; in yours: ${markedYours}`);
  // Both pictures are drawn.
  await page.waitForFunction((e) => [...e.querySelectorAll('img')].length === 2 && [...e.querySelectorAll('img')].every((i) => i.complete && i.naturalWidth > 0), await cmp.elementHandle());
  // A hidden test never shows the window it expects.
  expect((await page.locator('.t-fail .pg-compare').count()) <= ex.tests.filter((t) => !t.hidden && t.expectWindow).length, 'a hidden test shows its window');
  await bothThemes(page, 'a failed window challenge');
  await page.setViewportSize({ width: 320, height: 800 });
  await noOverflow(page, 'a failed window challenge at 320 px');
  await page.setViewportSize({ width: 1280, height: 900 });
  // "Run the window": the model solution plays with the test's events; at the test's last frame its window is the expected one.
  await setProgram(page, ex.solution);
  await page.getByRole('button', { name: 'Run the window' }).click();
  const panel = page.locator('.freerun .pg-panel');
  await panel.waitFor();
  await panelReaches(panel, { frames: want.frames }, ENGINE_TIMEOUT);
  await panel.getByRole('button', { name: 'Pause' }).click();
  await panel.locator('.pg-scrub input').fill(String(want.frames));
  expect((await windowText(panel)) === (want.log || '(nothing drawn)'), `the window at frame ${want.frames}: ${await windowText(panel)}`);
  await bothThemes(page, 'a window challenge\'s window panel');
  const passed = await check(page);
  expect(passed.includes('All tests passed'), passed);
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

console.log('Playground');
await test('playground: run a program with input, share it, open the link elsewhere; a damaged link says so', async () => {
  const { ctx, page, errors } = await newPage();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(BASE + 'playground/');
  await lessonReady(page);
  await setCode(page, 'word = input("Word? ")\nprint(word + word)\n');
  await page.fill('#pg-stdin', 'na');
  const out = await check(page);
  expect(out.includes('Word? na\nnana') && out.includes('Exit code 0'), out);
  await page.click('text=Share');
  await page.locator('#pg-link').waitFor();
  const link = await page.inputValue('#pg-link');
  expect(/\/playground\/#code=[A-Za-z0-9_-]+$/.test(link), link);
  await axe(page, 'playground with output');
  await shot(page, 'playground-desktop');
  // Another browser opens the link: it sees the program and its input, and its own program is kept.
  const other = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await other.ctx.addInitScript((k) => localStorage.setItem(k, '1'), MOBILE_KEY);
  await other.page.goto(link);
  await other.page.locator('.banner-info').waitFor();
  expect((await other.page.inputValue('#pg-stdin')) === 'na', 'input came with the link');
  expect((await editorText(other.page)).includes('word + word'), 'code came with the link');
  await other.page.click('text=Back to my program');
  expect((await editorText(other.page)).includes('What is your name?'), 'back to the example');
  expect((await other.page.evaluate(() => document.activeElement?.tagName)) === 'H1', 'focus moved to the heading, not lost');
  // A link pasted into a tab that already shows the Playground opens too (only the # part changes).
  await other.page.evaluate((h) => (location.hash = h), new URL(link).hash);
  await other.page.locator('.banner-info').waitFor();
  expect((await editorText(other.page)).includes('word + word'), 'the shared program opened in the same tab');
  // "Playground" in the footer leads back to the learner's own program.
  await other.page.locator('footer a', { hasText: 'Playground' }).click();
  await other.page.waitForFunction(() => !location.hash && !document.querySelector('.banner-info'));
  expect((await editorText(other.page)).includes('What is your name?'), 'own program after the Playground link');
  // A damaged link: a message, and the learner's own program.
  await other.page.goto(BASE + 'playground/#code=AAAAnot-a-program');
  await other.page.locator('.banner-fail[role="alert"]', { hasText: 'This share link is damaged' }).waitFor();
  expect((await editorText(other.page)).includes('What is your name?'), 'the own program after a damaged link');
  expect(other.errors.length === 0, other.errors.join('\n'));
  await other.ctx.close();
  // The first browser still has its program after a reload.
  await page.reload();
  await page.locator('.cm-content').waitFor();
  expect((await editorText(page)).includes('word + word'), 'the program is saved');
  // "Delete all progress" deletes the Playground program too.
  page.once('dialog', (d) => d.accept());
  await page.goto(BASE + 'settings/');
  await page.click('text=Delete all progress');
  await page.locator('text=All progress and saved code on this device were deleted.').waitFor();
  await page.goto(BASE + 'playground/');
  await page.locator('.cm-content').waitFor();
  expect((await editorText(page)).includes('What is your name?'), 'the Playground shows the example again');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('playground: a module in a file of its own; its name is checked; errors and crashes name its file; the link carries both files; a removed module leaves nothing behind', async () => {
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + 'playground/');
  await lessonReady(page);
  await setCode(page, 'import helpers\n\nprint(helpers.greet("Ada"))\n');
  const addModule = async (name) => {
    await page.click('text=Add a module');
    await page.fill('#new-module', name);
    await page.click('.file-add-form button[type=submit]');
  };
  // Names are checked: a keyword, a module of Python's own, a name that starts with a digit.
  const said = [];
  for (const name of ['class', 'random', '2fast']) {
    await addModule(name);
    said.push(await page.locator('#new-module-error').innerText());
    await page.click('.file-add-form button:has-text("Cancel")');
  }
  await addModule('helpers');
  expect((await page.locator('.file-tab').allInnerTexts()).join() === 'main.py,helpers.py', 'a tab per file');
  expect((await page.locator('.file-tab-on').innerText()).includes('helpers.py'), 'the new file is open');
  expect((await editorText(page)).startsWith('# helpers.py: import it in main.py with: import helpers'), await editorText(page));
  await addModule('helpers');
  said.push(await page.locator('#new-module-error').innerText());
  await page.click('.file-add-form button:has-text("Cancel")');
  // A mistake in helpers.py: the message names the file, and its tab shows the count.
  await setCode(page, 'def greet(name)\n    return "Hello, " + name + "!"\n');
  await page.click('#file-tab-0');
  await page.locator('.file-tab-on', { hasText: 'main.py' }).waitFor();
  let out = await check(page);
  expect(/helpers\.py, line 1\b/i.test(out) && out.includes("SyntaxError: expected ':'"), out);
  expect((await page.locator('.file-tab-on').innerText()).includes('helpers.py') && (await page.locator('.file-tab-on .file-tab-errors').count()) === 1, 'the file with the error is open, with its count');
  await page.locator('.cm-lint-marker-error').first().waitFor();
  expect((await markedLine(page)) === 1, `the mark is on line ${await markedLine(page)}`);
  // A crash in helpers.py names it, with its function.
  await setCode(page, 'def greet(name):\n    return "Hello, " + name[10] + "!"\n');
  out = await check(page);
  expect(out.includes('IndexError: string index out of range (helpers.py, line 2, in greet)'), out);
  await setCode(page, 'def greet(name):\n    return "Hello, " + name + "!"\n');
  out = await check(page);
  expect(out.includes('Hello, Ada!'), out);
  await axe(page, 'playground with two files');
  await page.setViewportSize({ width: 320, height: 700 });
  await noOverflow(page, 'playground with two files at 320 px');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('text=Share');
  await page.locator('#pg-link').waitFor();
  const link = await page.inputValue('#pg-link');
  const other = await newPage();
  await other.page.goto(link);
  await other.page.locator('.banner-info').waitFor();
  expect((await other.page.locator('.file-tab').allInnerTexts()).join() === 'main.py,helpers.py', 'both files came with the link');
  await other.ctx.close();
  // A removed module leaves nothing behind: added again, it starts as new and undo can't bring the old code back.
  page.once('dialog', (d) => d.accept());
  await page.click('#file-tab-1');
  await page.click('text=Remove helpers.py');
  expect((await page.locator('.file-tab').count()) === 0, 'one file again, without tabs');
  await addModule('helpers');
  await page.click('.cm-content');
  await page.keyboard.press('ControlOrMeta+Z');
  expect(!(await editorText(page)).includes('Hello, '), 'the removed code came back');
  // Each name problem is said in one plain sentence.
  expect(said[0].includes("can't be one of Python's keywords") && said[1].includes("would hide Python's own module random") && said[3].includes('There is already a helpers.py'), said.join(' | '));
  expect(said[2].includes('not starting with a digit') && said[2].split('not starting with a digit').length === 2, `the message for a name that starts with a digit says it twice: ${said[2]}`);
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('playground: the output keeps the order it was printed in, error messages too; the files the program wrote are shown', async () => {
  const { ctx, page, errors } = await newPage({ viewport: { width: 320, height: 800 } });
  await page.goto(BASE + 'playground/');
  await lessonReady(page);
  await setCode(
    page,
    'import os\nimport sys\n\nprint("Reading scores")\nprint("Warning: line 2 is not a number", file=sys.stderr)\nprint("Total: 8")\n' +
      'os.makedirs("reports", exist_ok=True)\nwith open("reports/summary.txt", "w") as out:\n    for i in range(1, 21):\n        out.write(f"line {i}\\n")\n' +
      'with open("note.txt", "w") as out:\n    out.write("Done\\n")\nprint("Last line")\n',
  );
  await check(page);
  const out = await page.locator('.results .console').first().innerText();
  expect(out.trim() === 'Reading scores\nWarning: line 2 is not a number\nTotal: 8\nLast line', `the error message stays between the lines: ${out}`);
  expect((await page.locator('.results .t-note').innerText()).includes('The program printed an error message.'), 'the note says it printed an error message');
  const short = await page.locator('div.written-file').allInnerTexts();
  expect(short.length === 1 && /note\.txt after the run/i.test(short[0]) && short[0].includes('Done'), `a short file is shown: ${short}`);
  const folded = page.locator('details.written-file');
  expect(/reports\/summary\.txt after the run/i.test(await folded.locator('summary').innerText()) && (await folded.getAttribute('open')) === null, 'a long file starts folded, under its path');
  await folded.locator('summary').click();
  expect((await folded.locator('pre').innerText()).includes('line 20'), 'opened, it shows the whole file');
  await noOverflow(page, 'playground with written files at 320 px');
  await axe(page, 'playground with written files');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('playground: an endless loop is stopped after 5 seconds with what it printed kept, and the next run works', async () => {
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + 'playground/');
  await lessonReady(page);
  await setCode(page, 'print("before the loop")\ncount = 0\nwhile count < 3:\n    pass\n');
  const t0 = Date.now();
  await check(page);
  const ms = Date.now() - t0;
  expect(ms >= 4500 && ms < 30_000, `the run took ${ms} ms`);
  const note = await page.locator('.results .t-note').innerText();
  expect(note.includes('Time limit: the program ran for more than 5 seconds and was stopped') && note.includes('Look for a loop that never ends'), note);
  const printed = (await page.locator('.results .console').first().innerText()).trim();
  const kept = printed === 'before the loop';
  await setCode(page, 'print("Hello again")\n');
  const again = await check(page);
  expect(again.includes('Hello again') && again.includes('Exit code 0'), again);
  expect(kept, `what it printed before the loop isn't shown: the output says ${JSON.stringify(printed)}`);
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

/** Runs a program in the Playground (with its input) and returns what the results say. */
async function runInPlayground(page, code, stdin = '') {
  await setCode(page, code);
  await page.fill('#pg-stdin', stdin);
  await check(page);
  return page.locator('.results').innerText();
}

await test('Python\'s syntax errors are explained in plain words, with their line: print without parentheses, = in a condition, a missing colon, a missing or extra indent, a curly quote', async () => {
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + 'playground/');
  await lessonReady(page);
  const cases = [
    ['print "Hello"\n', 1, "SyntaxError: Missing parentheses in call to 'print'", 'In Python 3, print is a function, so what it prints goes in parentheses'],
    ['x = 3\nif x = 3:\n    print("three")\n', 2, 'SyntaxError: invalid syntax', 'A single = stores a value in a variable. To compare two values (in an if or a while), use two: ==.'],
    ['x = 3\nif x > 2\n    print("big")\n', 2, "SyntaxError: expected ':'", 'must end with a colon'],
    ['x = 3\nif x > 2:\nprint("big")\n', 3, "IndentationError: expected an indented block after 'if' statement on line 2", 'to show it belongs to the block of the if on line 2'],
    ['x = 3\n    print(x)\n', 2, 'IndentationError: unexpected indent', 'nothing above it starts a block'],
    ['print(“Hi”)\n', 1, "SyntaxError: invalid character '“' (U+201C)", 'The character “ looks like " but isn\'t the same to Python'],
  ];
  for (const [code, line, error, note] of cases) {
    const out = await runInPlayground(page, code);
    expect(out.includes("Python couldn't read your code") && new RegExp(`line ${line}\\b`, 'i').test(out) && out.includes(error) && out.includes(note), `${JSON.stringify(code)}:\n${out}`);
    await page.locator('.cm-lint-marker-error').first().waitFor();
    expect((await markedLine(page)) === line, `${JSON.stringify(code)}: the editor marks line ${await markedLine(page)}, not ${line}`);
  }
  await axe(page, 'the Playground with a syntax error');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('Python\'s run-time errors are explained in plain words, with their line: text plus a number, int() of a word, a missing key, an index past the end, a recursion without a base case, a list method\'s None, a name in the wrong case', async () => {
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + 'playground/');
  await lessonReady(page);
  const cases = [
    ['age = input("Age: ")\nprint(age + 1)\n', '5', 'TypeError: can only concatenate str (not "int") to str (line 2)', '+ can join two strings, but here a string and a whole number (int) are joined'],
    ['n = int(input("Number: "))\nprint(n * 2)\n', 'ten', "ValueError: invalid literal for int() with base 10: 'ten' (line 1)", "int() can only turn text that is a whole number into a number, and 'ten' isn't one"],
    ['prices = {"tea": 2}\nprint(prices["coffee"])\n', '', "KeyError: 'coffee' (line 2)", "The dictionary has no key 'coffee'"],
    ['items = [1, 2, 3]\nprint(items[3])\n', '', 'IndexError: list index out of range (line 2)', 'Indexes start at 0, so the last item of a list of length n is at index n - 1'],
    ['def factorial(n):\n    return n * factorial(n - 1)\n\n\nprint(factorial(5))\n', '', 'RecursionError: maximum recursion depth exceeded (line 2, in factorial)', 'A recursive function needs a base case'],
    ['items = [3, 1, 2]\nitems = items.sort()\nprint(items.pop())\n', '', "AttributeError: 'NoneType' object has no attribute 'pop' (line 3)", 'list methods such as sort() and append() change the list and return None'],
    ['Print("hi")\n', '', "NameError: name 'Print' is not defined. Did you mean: 'print'? (line 1)", 'Capital letters matter: you probably mean "print"'],
  ];
  for (const [code, stdin, error, note] of cases) {
    const out = await runInPlayground(page, code, stdin);
    expect(out.includes(`The program stopped with ${error}.`) && out.includes(note) && out.includes('Exit code 1'), `${JSON.stringify(code)}:\n${out}`);
    // The input typed is shown after its prompt, before the traceback.
    if (stdin) expect((await page.locator('.results .console').first().innerText()).startsWith(`${/input\("([^"]*)"\)/.exec(code)[1]}${stdin}\n`), 'the input is shown after its prompt');
  }
  await axe(page, 'the Playground with a crash');
  await page.setViewportSize({ width: 320, height: 700 });
  await noOverflow(page, 'the Playground with a long traceback at 320 px');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

// A pygame program for the window panel: a robot (one of the site's images) that moves right while the
// right arrow is held, and a line printed for each click with its position.
const PG_MOVER = `import pygame

pygame.init()
screen = pygame.display.set_mode((240, 160))
pygame.display.set_caption("Mover")
robot = pygame.image.load("robot.png")
clock = pygame.time.Clock()
x = 100
while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            exit()
        if event.type == pygame.MOUSEBUTTONDOWN:
            print("click at", event.pos)
    keys = pygame.key.get_pressed()
    if keys[pygame.K_RIGHT]:
        x += 2
    screen.fill((0, 0, 0))
    screen.blit(robot, (x, 60))
    pygame.display.flip()
    clock.tick(60)
`;
const robotAt = (text) => Number(/^blit robot\.png at \((\d+), 60\)$/m.exec(text ?? '')?.[1] ?? NaN);

await test('playground: a pygame program opens its window and its frames play; a click on the canvas goes to the program (it prints event.pos); a key held on the focused canvas moves the robot, as the window as text shows; Pause and the frame slider; axe in both themes and at 320 px', async () => {
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + 'playground/');
  await lessonReady(page);
  await setCode(page, PG_MOVER);
  const note = await page.locator('.workbench').innerText();
  expect(note.includes("A pygame program runs in a window here, without sound. It can load the site's images") && COURSE_INDEX.images.every((n) => note.includes(n)), `the note about pygame: ${note}`);
  await page.click('#check');
  const panel = page.locator('.pg-panel');
  await panel.waitFor();
  // pygame's package downloads the first time; then the frames come and play.
  await panelReaches(panel, { frames: 60, shown: 5 }, ENGINE_TIMEOUT);
  const a = await panelState(panel);
  await page.waitForTimeout(600);
  const b = await panelState(panel);
  expect(b.shown > a.shown, `the frames play: frame ${a.shown}, then ${b.shown}`);
  expect((await panel.locator('.pg-title').innerText()) === 'Mover' && (await panel.locator('.pg-size').innerText()) === '240 × 160', 'the title bar has the caption and the size');
  const canvas = panel.locator('canvas');
  expect(JSON.stringify(await canvas.evaluate((c) => [c.width, c.height])) === '[240,160]', 'the canvas is the window\'s size');
  expect((await canvas.getAttribute('role')) === 'application' && (await canvas.getAttribute('aria-label')) === "Your program's window. Keys you press here and clicks go to the program.", `the canvas's name: ${await canvas.getAttribute('aria-label')}`);
  expect((await windowText(panel)) === 'fill (0, 0, 0)\nblit robot.png at (100, 60)', `the window as text: ${await windowText(panel)}`);
  // The robot is drawn: its pixels are on the canvas, where the window as text says.
  const lit = await canvas.evaluate((c) => [...c.getContext('2d').getImageData(100, 60, 40, 40).data].some((v, i) => i % 4 !== 3 && v > 0));
  expect(lit, 'the robot is drawn on the canvas');
  // A click at (60, 80) of the window: the program prints the position it got.
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + ((60 + 0.5) * box.width) / 240, box.y + ((80 + 0.5) * box.height) / 160);
  await page.waitForFunction((p) => p.querySelector('.pg-output .console')?.textContent.includes('click at (60, 80)'), await panel.elementHandle(), { timeout: 60_000 });
  // The right arrow held on the focused canvas: the robot moves right, two pixels a frame.
  await canvas.focus();
  const before = await panelState(panel);
  await page.keyboard.down('ArrowRight');
  await panelReaches(panel, { shown: before.shown + 30 });
  await page.keyboard.up('ArrowRight');
  const released = await panelState(panel);
  await panelReaches(panel, { shown: released.shown + 20 });
  const moved = robotAt(await windowText(panel));
  expect(moved > 100 && moved % 2 === 0, `the robot after the right arrow: ${await windowText(panel)}`);
  await page.waitForTimeout(500);
  expect(robotAt(await windowText(panel)) === moved, 'the robot stops when the key is let go');
  // The key row offers the keys the program asks about, for a touch screen.
  expect((await panel.getByRole('group', { name: 'Keys for the program' }).getByRole('button', { name: 'Press →' }).count()) === 1, 'the key row has the right arrow');
  // Pause stops the frames; the slider shows an earlier one.
  await panel.getByRole('button', { name: 'Pause' }).click();
  const paused = await panelState(panel);
  await page.waitForTimeout(500);
  expect((await panelState(panel)).shown === paused.shown, 'Pause stops the frames');
  await panel.locator('.pg-scrub input').fill('1');
  expect((await panel.locator('details.pg-astext summary').innerText()).includes('(frame 1)') && robotAt(await windowText(panel)) === 100, `frame 1: ${await windowText(panel)}`);
  await shot(page, 'playground-pygame');
  await bothThemes(page, 'a pygame window in the Playground');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await noOverflow(page, `a pygame window in the Playground at ${width} px`);
    const w = await canvas.evaluate((c) => c.getBoundingClientRect().right);
    expect(w <= width, `the canvas reaches ${w} px in a ${width} px window`);
    await bothThemes(page, `a pygame window in the Playground at ${width} px`);
  }
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

console.log('Practice');
// The right answers come from the build's own drill file.
const drillById = new Map([...DRILLS.drills, ...DRILLS.placement].map((d) => [d.id, d]));
/** Answers the rep on screen, right or wrong. Boss reps are answered right only. */
async function answerRep(page, right = true) {
  const id = await page.locator('.rep').getAttribute('data-drill');
  const d = drillById.get(id);
  expect(d, `unknown drill ${id}`);
  switch (d.type) {
    // Enter goes to the answer box itself: the placement quiz moves the focus to its heading a
    // frame after each answer, and that frame can land between the typing and a bare Enter.
    // A predict answer of several lines is typed on one line, with spaces between them (as the rep says it may be).
    case 'predict':
      await page.fill('#rep-input', right ? d.answer.replace(/\n/g, ' ') : d.answer.replace(/\n/g, ' ') + ' and more');
      await page.locator('#rep-input').press('Enter');
      break;
    case 'fill':
      await page.fill('input.blank', right ? d.answer : 'zzz');
      await page.locator('input.blank').press('Enter');
      break;
    case 'bug': {
      const n = right ? Number(d.answer) : Number(d.answer) === 1 ? 2 : 1;
      await page.locator(`button.bugline[aria-label^="Line ${n}:"]`).click();
      break;
    }
    case 'runs':
      await page.click(right === (d.answer === 'yes') ? '.btn-yes' : '.btn-no');
      break;
    case 'choice': {
      const n = right ? d.answer : d.answer === '1' ? '2' : '1';
      await page.click(`.choice[data-choice="${n}"]`);
      break;
    }
    case 'boss':
      await setCode(page, d.exercise.solution);
      await page.click('#check');
      break;
  }
  return d;
}
const practiceState = (extra = {}) => ({ version: 1, steps: {}, settings: { mobileData: true, ...extra.settings }, ...extra.state });
/** Saved progress in a new browser, before the page starts (kept as the page changes it). */
const startWith = (ctx, st) => ctx.addInitScript(([k, v]) => localStorage.getItem(k) || localStorage.setItem(k, v), [KEY, JSON.stringify(st)]);

await test('Deathmatch: with nothing finished, the lobby offers lesson 1, the placement quiz and interview prep', async () => {
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + 'deathmatch/');
  // The pre-rendered page has a .lobby too: wait for what only the app draws.
  await page.locator('.lobby .rank-card').waitFor();
  const text = await page.locator('.lobby').innerText();
  expect(text.includes('No drills unlocked yet') && text.includes('Placement quiz') && text.includes('if you already know some Python'), text);
  expect((await page.locator('text=Try interview prep').count()) === (DRILLS.drills.some((d) => d.topic === 'interview') ? 1 : 0), 'interview prep offered when it has questions');
  await axe(page, 'deathmatch lobby, nothing unlocked');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('Deathmatch: ranked play waits for 10 drills; Casual is open before that', async () => {
  const first = FIRST_STEPS[0].id;
  const open = DRILLS.drills.filter((d) => d.after === first && d.type !== 'boss').length;
  if (open >= 10) return;
  const { ctx, page, errors } = await newPage();
  await startWith(ctx, practiceState({ state: { steps: { [first]: { done: true, challenges: {} } } } }));
  await page.goto(BASE + 'deathmatch/');
  await page.locator('.lobby .modes').waitFor();
  expect(await page.locator('.mode-dm').isDisabled(), 'Deathmatch is closed');
  expect((await page.locator('.mode-dm').innerText()).includes(`(${open} so far)`), await page.locator('.mode-dm').innerText());
  expect(!(await page.locator('.mode:has(.mode-name:text-is("Casual"))').isDisabled()), 'Casual is open');
  // Enter doesn't start a closed mode.
  await page.locator('h1').click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect((await page.locator('.rep').count()) === 0, 'no run started');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

/** Replaces Math.random in the page with a seeded generator (mulberry32), so random picks repeat. */
function seedRandom(ctx, seed = 20260930) {
  return ctx.addInitScript((start) => {
    let a = start;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

await test('Deathmatch: a finished module unlocks its drills; right answers of every type build the streak', async () => {
  const { ctx, page, errors } = await newPage();
  // Module 1 finished (its drills are open); boss reps off for the instant types first.
  const steps = Object.fromEntries(FIRST_STEPS.map((s) => [s.id, { done: true, challenges: {} }]));
  const quick = DRILLS.drills.filter((d) => d.topic === FIRST_MODULE.id && d.type !== 'boss').length;
  expect(quick >= 13, `module 1 has ${quick} quick drills; the test answers 12 and misses 1`);
  await startWith(ctx, practiceState({ state: { steps }, settings: { boss: false } }));
  // A seeded Math.random picks the same 12 drills every run, so the check for four types can't
  // fail by chance.
  await seedRandom(ctx);
  await page.goto(BASE + 'deathmatch/');
  await page.locator('.lobby .modes').waitFor();
  await axe(page, 'deathmatch lobby');
  await page.click('.mode-dm');
  const seen = new Set();
  for (let i = 1; i <= 12; i++) {
    await page.locator('.rep').waitFor();
    const d = await answerRep(page, true);
    seen.add(d.type);
    await page.waitForFunction((n) => document.querySelector('.hud-n')?.textContent === String(n), i);
    if (i === 3) await axe(page, 'deathmatch rep');
  }
  expect(seen.size >= 4, `only these drill types came up: ${[...seen]}`);
  // A wrong answer ends a one-life run, with the answer, why, and a share button for the new best.
  await page.locator('.rep').waitFor();
  await answerRep(page, false);
  await page.locator('.death').waitFor();
  const death = await page.locator('.death').innerText();
  expect(/eliminated/i.test(death) && death.includes('a new personal best') && death.includes('Share'), death);
  await axe(page, 'eliminated');
  expect(await page.evaluate(() => document.activeElement?.id === 'death-title'), 'focus moves to the verdict');
  const saved = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).dm, KEY);
  await page.waitForTimeout(400);
  let dm = await saved();
  expect(dm.best.deathmatch === 12 && dm.runs.length === 1 && dm.runs[0].reps === 13 && dm.runs[0].kills === 12, `saved once, with its numbers: ${JSON.stringify(dm.runs)}`);
  // Enter respawns.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.hud-n')?.textContent === '0' && !!document.querySelector('.rep'));
  // A run left by following a link is kept too.
  await answerRep(page, true);
  await page.waitForFunction(() => document.querySelector('.hud-n')?.textContent === '1');
  await page.click('#main-nav a[href$="/learn/"]');
  await page.locator('.module-live').first().waitFor();
  await page.waitForTimeout(400);
  dm = await saved();
  expect(dm.runs.length === 2 && dm.runs[0].reps === 1 && dm.runs[0].streak === 1, `the left run is saved: ${JSON.stringify(dm.runs)}`);
  await page.goBack();
  await page.locator('.lobby .modes').waitFor();
  expect((await page.locator('.runs').innerText()).includes('Deathmatch'), 'the run is listed');
  await axe(page, 'deathmatch lobby with runs');
  // Enter on the (scrollable, focusable) runs table doesn't start a run.
  await page.locator('.table-scroll').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect((await page.locator('.rep').count()) === 0, 'Enter on the runs table started a run');
  await page.locator('.mode-dm').click();
  await page.locator('.rep').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.lobby .modes').waitFor();
  expect((await saved()).runs.length === 2, 'a run with no answers is not saved');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('Casual: a miss costs a life and shows why; Continue goes on; a boss rep is a real program', async () => {
  const { ctx, page, errors } = await newPage();
  expect(DRILLS.drills.some((d) => d.topic === FIRST_MODULE.id && d.type === 'boss'), 'module 1 has a boss drill');
  await startWith(ctx, practiceState({ settings: { unlockAll: true, boss: true, topicsOff: [...new Set(DRILLS.drills.map((d) => d.topic))].filter((t) => t !== FIRST_MODULE.id) } }));
  await page.goto(BASE + 'deathmatch/');
  await page.locator('.lobby .modes').waitFor();
  await page.locator('.mode:has(.mode-name:text-is("Casual"))').click();
  await page.locator('.rep').waitFor();
  const d = await answerRep(page, false);
  expect(d.type !== 'boss', 'the first rep is a quick one');
  await page.locator('.death').waitFor();
  const review = await page.locator('.death').innerText();
  expect(review.includes('A life lost') && review.includes('2 lives left'), review);
  if (d.why) expect(review.includes(d.why.replace(/`/g, '').slice(0, 20)), `why shown: ${review}`);
  expect(await page.evaluate(() => document.activeElement?.id === 'death-title'), 'focus moves to the verdict');
  await page.keyboard.press('Enter');
  // Reps 2 to 7 right; the 8th is a boss rep, answered with its solution and checked by Python.
  for (let i = 2; i <= 8; i++) {
    await page.locator('.rep').waitFor();
    const r = await answerRep(page, true);
    if (i === 8) expect(r.type === 'boss', `rep 8 is a ${r.type}`);
    await page.waitForFunction((n) => document.querySelector('.hud-n')?.textContent === String(n), i - 1, { timeout: i === 8 ? ENGINE_TIMEOUT : 10_000 });
  }
  // The run's best streak is what counts, not the streak it ended on.
  await page.locator('.rep').waitFor();
  await answerRep(page, false);
  await page.locator('.death').waitFor();
  await page.waitForTimeout(400);
  const dm = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).dm, KEY);
  expect(dm.best.casual === 7 && dm.runs[0].streak === 7 && dm.runs.length === 1, `casual best: ${JSON.stringify(dm)}`);
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('Deathmatch on a phone (360 px): reps of every type fit the screen', async () => {
  const { ctx, page } = await newPage({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  await startWith(ctx, practiceState({ settings: { unlockAll: true, boss: false } }));
  await seedRandom(ctx);
  await page.goto(BASE + 'deathmatch/');
  await page.locator('.lobby .modes').waitFor();
  await noOverflow(page, 'lobby 360');
  await page.locator('.mode:has(.mode-name:text-is("Casual"))').click();
  const types = new Set();
  for (let i = 1; i <= 15; i++) {
    await page.locator('.rep').waitFor();
    await noOverflow(page, `rep ${i} at 360`);
    await codeFits(page, `rep ${i} at 360`);
    types.add((await answerRep(page, true)).type);
    await page.waitForFunction((n) => document.querySelector('.hud-n')?.textContent === String(n), i);
  }
  await page.locator('.rep').waitFor();
  await answerRep(page, false);
  await page.locator('.death').waitFor();
  await noOverflow(page, 'review at 360');
  await codeFits(page, 'review at 360');
  await axe(page, 'review at 360');
  expect(types.size >= 3, `types: ${[...types]}`);
  await ctx.close();
});

await test("drill code on a phone (390 px): a long line wraps under its own start and no code box scrolls sideways (Deathmatch, a review card, the daily challenge, the placement quiz); a bug drill's wrapped lines stay tappable and keyboard-usable; axe passes in both themes", async () => {
  const longest = (d) => Math.max(...d.display.split('\n').map((l) => l.length));
  const predict = DRILLS.drills.filter((d) => d.type === 'predict').sort((a, b) => longest(b) - longest(a))[0];
  const fill = DRILLS.drills.filter((d) => d.type === 'fill').sort((a, b) => longest(b) - longest(a))[0];
  // Bug drills whose wrong line is long enough to wrap.
  const wrongLine = (d) => d.display.split('\n')[Number(d.answer) - 1];
  const bugs = DRILLS.drills.filter((d) => d.type === 'bug' && wrongLine(d).trim().length > 45).sort((a, b) => wrongLine(b).length - wrongLine(a).length);
  expect(predict && fill && bugs.length >= 2 && longest(predict) > 60, 'no long drills to wrap');
  const due = Object.fromEntries([predict, fill, bugs[0], bugs[1]].map((d) => [d.id, { box: 1, right: 0, wrong: 1, last: 0, due: 0 }]));
  const { ctx, page, errors } = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await startWith(ctx, practiceState({ settings: { unlockAll: true }, state: { drills: due } }));
  await page.goto(BASE + 'deathmatch/');
  await page.locator('.lobby .modes').waitFor();
  // Warm-up shows exactly the due drills, in any order.
  await page.locator('.mode:has(.mode-name:text-is("Warm-up"))').click();
  let right = 0;
  let tapped = false;
  let keyboard = false;
  for (let i = 0; i < 4; i++) {
    await page.locator('.rep').waitFor();
    const d = drillById.get(await page.locator('.rep').getAttribute('data-drill'));
    await noOverflow(page, `${d.id} at 390`);
    await codeFits(page, `${d.id} at 390`);
    if (d === predict) {
      // The longest line takes several rows, each later row starting right of where the line starts.
      const lines = page.locator('.rep pre.codeview .cl');
      const lengths = await lines.evaluateAll((els) => els.map((e) => e.textContent.length));
      const rows = await lineRows(lines.nth(lengths.indexOf(Math.max(...lengths))));
      expect(rows.length >= 2 && rows.slice(1).every((r) => r.left > rows[0].left + 1), `${d.id}: the longest line's rows start at ${JSON.stringify(rows.map((r) => Math.round(r.left)))}`);
      // The code box's text is still exactly the code.
      expect((await page.locator('.rep pre.codeview').textContent()) === d.display, `${d.id}: the code box's text isn't the code`);
      for (const colorScheme of ['dark', 'light']) {
        await page.emulateMedia({ colorScheme });
        await page.waitForFunction((t) => document.documentElement.dataset.theme === t, colorScheme);
        await axe(page, `a wrapped predict drill at 390 px, ${colorScheme} theme`);
      }
      await shot(page, 'drill-wrapped-390');
      await answerRep(page, true);
      right++;
    } else if (d === fill) {
      // A wrong answer: the review card's code wraps too.
      await answerRep(page, false);
      await page.locator('.death').waitFor();
      await codeFits(page, `${d.id} review at 390`);
      await noOverflow(page, `${d.id} review at 390`);
      await page.keyboard.press('Enter');
      continue;
    } else {
      // A bug drill: its wrong line wraps; every line stays inside the box.
      const target = page.locator(`button.bugline[aria-label^="Line ${d.answer}:"]`);
      const rows = await lineRows(target.locator('code'));
      expect(rows.length >= 2 && rows.slice(1).every((r) => r.left > rows[0].left + 1), `${d.id}: line ${d.answer} rows start at ${JSON.stringify(rows.map((r) => Math.round(r.left)))}`);
      const widths = await page.locator('.rep .bugline').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
      expect(widths === 0, `${d.id}: ${widths} bug lines wider than the box`);
      if (!tapped) {
        // A tap on the line's last row picks that line.
        await target.scrollIntoViewIfNeeded();
        const last = (await lineRows(target.locator('code'))).at(-1);
        const x = last.left + 4;
        const y = (last.top + last.bottom) / 2;
        expect(await page.evaluate(([x, y, n]) => !!document.elementFromPoint(x, y)?.closest(`button.bugline[aria-label^="Line ${n}:"]`), [x, y, d.answer]), `${d.id}: the last row of line ${d.answer} isn't part of its button`);
        await page.touchscreen.tap(x, y);
        tapped = true;
      } else {
        // The keyboard: Tab reaches the lines, goes from line to line in order, and Enter picks the focused line.
        const order = await page.locator('.rep button.bugline').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
        const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
        await page.locator('#rep-prompt').focus();
        for (let k = 0; k < 6 && (await focused()) !== order[0]; k++) await page.keyboard.press('Tab');
        expect((await focused()) === order[0], `${d.id}: Tab didn't reach the first line`);
        for (let k = 1; k < order.length; k++) {
          if ((await focused()).startsWith(`Line ${d.answer}:`)) break;
          await page.keyboard.press('Tab');
          expect((await focused()) === order[k], `${d.id}: Tab went to ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))}, not ${order[k]}`);
        }
        expect(await target.evaluate((e) => e === document.activeElement && e.matches(':focus-visible')), `${d.id}: line ${d.answer} isn't focused with a visible focus`);
        for (const colorScheme of ['dark', 'light']) {
          await page.emulateMedia({ colorScheme });
          await page.waitForFunction((t) => document.documentElement.dataset.theme === t, colorScheme);
          await axe(page, `a wrapped bug drill at 390 px, ${colorScheme} theme`);
        }
        await shot(page, 'bug-drill-wrapped-390');
        await page.keyboard.press('Enter');
        keyboard = true;
      }
      right++;
    }
    await page.waitForFunction((n) => document.querySelector('.hud-n')?.textContent === String(n), right);
  }
  expect(tapped && keyboard && right === 3, `tapped ${tapped}, keyboard ${keyboard}, ${right} right`);
  // The daily challenge and its card after the answer.
  await page.goto(BASE + 'daily/');
  await page.locator('.rep').waitFor();
  await codeFits(page, 'daily at 390');
  await answerRep(page, true);
  await page.locator('.death').waitFor();
  await codeFits(page, 'daily answered at 390');
  // The placement quiz's first questions.
  await page.goto(BASE + 'placement/');
  await page.click('text=Start the quiz');
  for (let i = 0; i < 3; i++) {
    await page.locator('#quiz-h', { hasText: `Question ${i + 1} of ${DRILLS.placement.length}` }).waitFor();
    await page.locator('.rep').waitFor();
    await codeFits(page, `placement question ${i + 1} at 390`);
    await page.click("text=I don't know this yet");
  }
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('Interview prep is open without any lesson done', async () => {
  if (!DRILLS.drills.some((d) => d.topic === 'interview')) return;
  const { ctx, page } = await newPage();
  await page.goto(BASE + 'deathmatch/');
  await page.click('text=Try interview prep');
  await page.locator('.rep').waitFor();
  const d = await answerRep(page, true);
  expect(d.topic === 'interview', d.topic);
  await page.waitForFunction(() => document.querySelector('.hud-n')?.textContent === '1', null, { timeout: d.type === 'boss' ? ENGINE_TIMEOUT : 30_000 });
  await ctx.close();
});

await test('daily challenge: one answer a day, kept after a reload, with the streak', async () => {
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE + 'daily/');
  await page.locator('.rep').waitFor();
  await axe(page, 'daily');
  await answerRep(page, true);
  await page.locator('.death').waitFor({ timeout: ENGINE_TIMEOUT });
  expect((await page.locator('.death').innerText()).includes('Solved'), 'solved');
  await page.reload();
  await page.locator('.death').waitFor();
  expect((await page.locator('.stat-n').innerText()) === '1', 'a 1-day streak');
  expect((await page.locator('.dday-right').count()) === 1, 'today is marked');
  await axe(page, 'daily done');
  // The daily question is kept apart from Deathmatch: it doesn't unlock the drill there.
  expect(await page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k)).drills ?? {}).length === 0, KEY), 'no drill state from the daily question');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('placement quiz: one question per written module; the first miss sets the start; skipping unlocks drills and moves Continue', async () => {
  const { ctx, page, errors } = await newPage();
  // One question for each written module that follows the MOOC (the extra modules are optional, after the course).
  const placed = COURSE_INDEX.modules.filter((m) => m.course !== 'extra');
  expect(DRILLS.placement.length === placed.length && DRILLS.placement.every((q, i) => q.module === placed[i].id), `${DRILLS.placement.length} placement questions for ${placed.length} written modules of the MOOC`);
  await page.goto(BASE + 'placement/');
  // The questions load after the page appears: then the intro says how many there are.
  await page.locator('text=Start the quiz').waitFor();
  const intro = await page.locator('#main').innerText();
  expect(intro.includes(`Answer ${DRILLS.placement.length} quick questions, one for each module that follows the MOOC${MOOC_LIVE ? '' : ' written so far'}`), intro);
  await page.click('text=Start the quiz');
  // Right, right, then "I don't know" for the rest: start at the third module.
  for (let i = 0; i < DRILLS.placement.length; i++) {
    // Wait for this question, not the previous one still on screen: a second tap there counts for it again.
    await page.locator('#quiz-h', { hasText: `Question ${i + 1} of ${DRILLS.placement.length}` }).waitFor();
    await page.locator('.rep').waitFor();
    if (i < 2) await answerRep(page, true);
    else await page.click("text=I don't know this yet");
  }
  await page.locator('text=Your starting point').waitFor();
  const third = DRILLS.placement[2].module;
  const result = await page.locator('.narrow').innerText();
  expect(result.includes('You got 2 of') && result.includes('skipping the 2 modules'), result);
  await axe(page, 'placement result');
  await page.click('text=Skip 2 modules and unlock their drills');
  await page.locator('text=their drills are now in Deathmatch').waitFor();
  await page.goto(BASE + 'learn/');
  await page.locator('.module-live').first().waitFor();
  expect((await page.locator('.learn').innerText()).includes('skipped'), 'skipped modules are marked');
  expect((await page.locator('.page-head a.btn-primary').getAttribute('href')).includes(`/learn/${third}/`), 'Continue goes to the third module');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

console.log('Moving progress');
const T = 1_760_000_000_000;
const PHONE = { viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const freshSettings = (over = {}) => ({ theme: 'system', textScale: 1, mobileData: false, sound: false, unlockAll: false, topicsOff: [], boss: true, keys: true, ...over });
/** Saved progress as the store keeps it. */
const progress = (over = {}) => ({ version: 1, steps: {}, drills: {}, dm: { best: { deathmatch: 0, casual: 0, warmup: 0, interview: 0 }, runs: [], reps: 0, kills: 0, bossKills: 0, days: {} }, daily: {}, placed: [], settings: freshSettings(), ...over });
/** A phone-sized browser whose saved progress starts as `st` (and stays as the page changes it). */
async function phoneWith(st, opts = {}) {
  const r = await newPage({ ...PHONE, ...opts });
  if (st) await startWith(r.ctx, st);
  return r;
}
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
/** On 320 and 390 px phones in both themes: nothing scrolls sideways and axe passes. */
async function phonesBothThemes(page, label) {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 860 });
    await noOverflow(page, `${label} at ${width} px`);
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      await page.waitForFunction((t) => document.documentElement.dataset.theme === t, colorScheme);
      await axe(page, `${label} at ${width} px, ${colorScheme} theme`);
    }
  }
  await page.setViewportSize(PHONE.viewport);
}
/** Screenshots of one part of the page at 390 px in both themes (with --shots). */
async function partShots(page, selector, name) {
  if (!SHOTS) return;
  await page.setViewportSize(PHONE.viewport);
  // The sticky header would cover the part where the page scrolls to it.
  await page.evaluate(() => document.querySelector('.topbar')?.style.setProperty('position', 'static'));
  for (const colorScheme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme });
    await page.waitForFunction((t) => document.documentElement.dataset.theme === t, colorScheme);
    await page.locator(selector).first().screenshot({ path: `${SHOTS}/${name}-390-${colorScheme}.png` });
  }
  await page.evaluate(() => document.querySelector('.topbar')?.style.removeProperty('position'));
}
async function makeLink(page, withCode) {
  await page.goto(BASE + 'settings/');
  await page.check(`input[name="transfer-what"][value="${withCode ? 'code' : 'progress'}"]`);
  await page.click('text=Make a transfer link');
  await page.locator('#transfer-link-text').waitFor();
  return page.locator('#transfer-link-text').inputValue();
}

// Three steps of module 1, by their ids (progress is saved by step id).
const [S1, S2, S3] = FIRST_STEPS.map((s) => s.id);
const DRILL1 = DRILLS.drills.find((d) => d.topic === FIRST_MODULE.id).id;
// The learner on the first phone: two steps done (one with code saved later than the second phone's), drills, a run, dark theme.
const phoneA = progress({
  steps: {
    [S1]: { done: true, doneAt: T + 1000, clean: true, challenges: { 0: { done: true, hintsUsed: 0, attempts: 1, code: 'print("Hello")  # from phone A\n', savedAt: T + 900 }, 1: { done: true, hintsUsed: 0, attempts: 1 }, 2: { done: true, hintsUsed: 0, attempts: 2 } } },
    [S2]: { done: true, doneAt: T + 2000, challenges: { 0: { done: true, hintsUsed: 1, attempts: 3, code: 'A newer program', savedAt: T + 5000 } } },
  },
  drills: { [DRILL1]: { box: 3, right: 2, wrong: 0, last: T + 3000, due: T + 3000 + 86_400_000 } },
  dm: { best: { deathmatch: 5, casual: 0, warmup: 0, interview: 0 }, runs: [{ at: T + 100, mode: 'deathmatch', streak: 5, reps: 6, kills: 5 }], reps: 6, kills: 5, bossKills: 0, days: {} },
  settings: freshSettings({ theme: 'dark', textScale: 1.25 }),
});
// The second phone: a step the first doesn't have, older code in one challenge, the light theme.
const phoneB = progress({
  steps: {
    [S3]: { done: true, doneAt: T + 500, challenges: { 0: { done: true, hintsUsed: 0, attempts: 1 } } },
    [S2]: { done: false, challenges: { 0: { done: false, hintsUsed: 0, attempts: 1, code: 'An older program', savedAt: T + 10 } } },
  },
  settings: freshSettings({ textScale: 1.125 }),
});

await test('moving progress: a link made on one phone opens in another browser and merges (a summary first, the address loses #p=, a reload offers nothing); axe on the summary in both themes at 320 and 390 px', async () => {
  const a = await phoneWith(phoneA);
  const link = await makeLink(a.page, true);
  expect(new RegExp(`^${BASE_PATH}transfer/#p=[A-Za-z0-9_-]+$`).test(new URL(link).pathname + new URL(link).hash), link);
  const told = await a.page.locator('.transfer-length').innerText();
  expect(told.includes(`${link.length.toLocaleString('en-US')} characters`), told);
  await a.ctx.close();

  const b = await phoneWith(phoneB);
  await b.page.goto(link);
  const review = b.page.locator('.import-review');
  await review.waitFor();
  const text = await review.innerText();
  for (const words of ['adds 2 finished steps', 'keeps your 1 finished step that the import doesn\'t have', 'replaces your code in 1 challenge where the import\'s is newer', 'Merge into my progress', 'Replace my progress'])
    expect(text.toLowerCase().includes(words.toLowerCase()), `the summary says "${words}": ${text}`);
  // Nothing changes before a choice.
  expect((await saved(b.page)).steps[S1] === undefined, 'nothing imported yet');
  await b.page.emulateMedia({ colorScheme: 'dark' });
  await phonesBothThemes(b.page, 'the import summary');
  await partShots(b.page, '.transfer-page .card', 'transfer-summary');
  await b.page.click('button:has-text("Merge into my progress")');
  await b.page.locator('.transfer-done').waitFor();
  expect(!b.page.url().includes('#p='), `the address keeps the link: ${b.page.url()}`);
  const st = await saved(b.page);
  expect(st.steps[S1].done && st.steps[S3].done, 'steps from both');
  expect(st.steps[S2].challenges[0].code === 'A newer program', 'the code saved later');
  expect(st.steps[S2].done, 'done in either');
  expect(st.drills[DRILL1]?.box === 3 && st.dm.best.deathmatch === 5, 'drills and Deathmatch');
  expect(st.settings.textScale === 1.125 && st.settings.theme === 'system', 'settings stay local on merge');
  await b.page.reload();
  await b.page.locator('#main h1').waitFor();
  expect((await b.page.locator('.import-review').count()) === 0, 'a reload offers nothing');
  expect(b.errors.length === 0, b.errors.join('\n'));
  await b.ctx.close();
});

await test('moving progress: Replace makes the progress and settings the import\'s; a damaged or cut link changes nothing', async () => {
  const a = await phoneWith(phoneA);
  const link = await makeLink(a.page, false);
  await a.ctx.close();
  const b = await phoneWith(phoneB);
  await b.page.goto(link);
  await b.page.locator('.import-review').waitFor();
  expect((await b.page.locator('.import-review').innerText()).includes('without code'), 'a link without code says so');
  await b.page.click('text=Replace my progress');
  await b.page.locator('.transfer-done').waitFor();
  const st = await saved(b.page);
  expect(!st.steps[S3], 'the local step is gone');
  expect(st.steps[S1].done && st.steps[S1].challenges[0].code === undefined, 'progress only: no code');
  expect(st.settings.theme === 'dark' && st.settings.textScale === 1.25, 'settings replaced');
  expect((await b.page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'the page takes the new theme');
  // Damaged links: a cut one, and nonsense.
  const before = JSON.stringify(await saved(b.page));
  for (const bad of [link.slice(0, link.length - 12), BASE + 'transfer/#p=not*a*link']) {
    // On /transfer/ already, a new link is only a change of the hash: reload so each link is read
    // by a fresh page, not checked against the message the one before it left.
    await b.page.goto(bad);
    await b.page.reload();
    const msg = await b.page.locator('.transfer-error').innerText();
    expect(/damaged|incomplete/.test(msg), msg);
    expect(JSON.stringify(await saved(b.page)) === before, 'nothing changed');
  }
  await b.ctx.close();
});

await test('moving progress: another open tab that saves after a Merge or a Replace keeps the import (its older code, drills and steps don\'t come back)', async () => {
  const a = await phoneWith(phoneA);
  const link = await makeLink(a.page, true);
  await a.ctx.close();
  for (const choice of ['Merge into my progress', 'Replace my progress']) {
    const b = await phoneWith(phoneB);
    // The other tab: open on Settings with phone B's progress (and its older code) before the import.
    const other = await b.ctx.newPage();
    const otherErrors = [];
    other.on('pageerror', (e) => otherErrors.push(e.message));
    await other.goto(BASE + 'settings/');
    await other.locator('input[name="size"]').first().waitFor();
    await b.page.goto(link);
    await b.page.locator('.import-review').waitFor();
    await b.page.click(`button:has-text("${choice}")`);
    await b.page.locator('.transfer-done').waitFor();
    // The other tab then saves something that isn't progress.
    await other.waitForTimeout(300);
    await other.check('input[name="size"][value="1.4"]');
    // The other tab saves a moment later (its save waits a little); wait for that write, not a fixed time.
    await other.waitForFunction((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.settings?.textScale === 1.4, KEY);
    const st = await saved(b.page);
    expect(st.steps[S2]?.challenges[0].code === 'A newer program', `${choice}: the import's newer code stays: ${JSON.stringify(st.steps[S2])}`);
    expect(st.drills[DRILL1]?.box === 3, `${choice}: the import's drill stays`);
    expect(st.settings.textScale === 1.4, `${choice}: the other tab's setting is saved`);
    if (choice.startsWith('Replace')) expect(!st.steps[S3], 'Replace: the step it removed doesn\'t come back');
    else expect(st.steps[S3]?.done, 'Merge: the local step stays');
    // The other tab shows the import too, and its next save is the same.
    await other.reload();
    await other.locator('input[name="size"]').first().waitFor();
    expect(JSON.stringify((await saved(other)).steps) === JSON.stringify(st.steps), `${choice}: a reload of the other tab keeps it`);
    expect(b.errors.length === 0 && otherErrors.length === 0, [...b.errors, ...otherErrors].join('\n'));
    await b.ctx.close();
  }
});

await test('moving progress: a progress file downloads with code and loads in another browser; a newer or wrong file changes nothing', async () => {
  const a = await phoneWith(phoneA);
  await a.page.goto(BASE + 'settings/');
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.click('text=Download a progress file')]);
  expect(/^python-arena-progress-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
  const file = join(mkdtempSync(join(tmpdir(), 'pa-progress-')), download.suggestedFilename());
  await download.saveAs(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.format === 'python-arena-progress' && json.version === 1 && json.withCode === true && json.site.endsWith(BASE_PATH), JSON.stringify({ ...json, data: '...' }));
  expect(json.data.steps[S1].challenges[0].code.includes('from phone A'), 'the file has the code');
  await a.ctx.close();

  const b = await phoneWith(phoneB);
  await b.page.goto(BASE + 'settings/');
  const before = JSON.stringify(await saved(b.page));
  // A file from a newer version, and one that isn't a progress file.
  for (const [content, words] of [[JSON.stringify({ ...json, version: 99 }), 'newer version'], ['{"hello": 1}', "isn't a Python Arena progress file"]]) {
    await b.page.setInputFiles('[data-testid="progress-file"]', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await b.page.waitForFunction((w) => document.querySelector('.transfer-file-message')?.textContent.includes(w), words);
    expect(JSON.stringify(await saved(b.page)) === before, 'nothing changed');
  }
  await b.page.setInputFiles('[data-testid="progress-file"]', file);
  await b.page.locator('.import-review').waitFor();
  expect((await b.page.locator('.import-review').innerText()).includes('This progress file was made on'), 'the summary names the file');
  await phonesBothThemes(b.page, 'settings with a file\'s summary');
  await b.page.click('button:has-text("Merge into my progress")');
  await b.page.waitForFunction(() => document.querySelector('.transfer-file-message')?.textContent.startsWith('Merged.'));
  const st = await saved(b.page);
  expect(st.steps[S1].challenges[0].code.includes('from phone A') && st.steps[S3].done, 'merged with code');
  // The focus moves once the message has rendered: wait for it rather than read it at once.
  const focused = await b.page.waitForFunction(() => document.activeElement?.classList.contains('transfer-file-message'), null, { timeout: 10000 }).then(() => true, () => false);
  expect(focused, 'focus moves to the message');
  await b.ctx.close();
});

// Reads the QR code back as a phone screen shows it: at 2 device pixels per CSS pixel, the low end
// of Android phones (most are 2.6 to 3). At 1 device pixel, which no phone has, jsQR misses some
// codes at some sizes because the modules alias to 4 and 5 pixels.
async function readQr(page) {
  const img = await page.locator('.transfer-qr svg').evaluate(async (svg) => {
    const box = svg.getBoundingClientRect();
    const w = Math.round(box.width) * 2;
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg).replace('<svg', `<svg width="${w}" height="${w}"`));
    const im = new Image();
    im.src = src;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = c.height = w;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0, w, w);
    return { w, data: [...g.getImageData(0, 0, w, w).data] };
  });
  return { width: img.w, text: jsQR(Uint8ClampedArray.from(img.data), img.w, img.w)?.data ?? null };
}

await test('moving progress: a short link gets a QR code that scans at its size on a 320 px phone; a long one is refused with Progress only offered; the Settings section passes axe in both themes at 320 and 390 px', async () => {
  const a = await phoneWith(progress({ steps: { [S1]: phoneA.steps[S1] } }), { viewport: { width: 320, height: 860 }, deviceScaleFactor: 1 });
  const short = await makeLink(a.page, false);
  await a.page.click('button:has-text("QR code")');
  await a.page.locator('.transfer-qr svg').waitFor();
  const read = await readQr(a.page);
  expect(read.text === short, `the QR code (${read.width} px) reads as ${read.text}`);
  await phonesBothThemes(a.page, 'settings with a QR code');
  await partShots(a.page, '#your-progress', 'settings-progress-qr');
  await partShots(a.page, '.transfer-qr', 'qr');
  // Long code: the link is too long for a QR code; Progress only is one tap away.
  await a.page.evaluate(([k, s1, code]) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.steps[s1].challenges[0].code = code;
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, S1, Array.from({ length: 400 }, (_, i) => `print("line ${i} ${(i * 7919) % 1000}")`).join('\n')]);
  const long = await makeLink(a.page, true);
  expect(long.length > 1273, `${long.length} characters`);
  await a.page.click('button:has-text("QR code")');
  const refused = await a.page.locator('.qr-refused').innerText();
  expect(refused.includes('too long for a QR code') && refused.includes('1,273'), refused);
  expect((await a.page.locator('.transfer-qr svg').count()) === 0, 'no QR code');
  await phonesBothThemes(a.page, 'settings with a refused QR code');
  await partShots(a.page, '#your-progress', 'settings-progress-refused');
  await a.page.click('text=Make a Progress only link');
  await a.page.locator('.transfer-qr svg').waitFor();
  expect((await readQr(a.page)).text === (await a.page.locator('#transfer-link-text').inputValue()), 'the Progress only link scans');
  expect(a.errors.length === 0, a.errors.join('\n'));
  await a.ctx.close();
});

await test('moving progress: over 8,000 characters the page says some apps cut long links and suggests the file', async () => {
  const code = Array.from({ length: 3000 }, (_, i) => `x${(i * 2654435761) % 4294967291}`).join(' ');
  const a = await phoneWith(progress({ steps: { [S1]: { done: true, challenges: { 0: { done: true, hintsUsed: 0, attempts: 1, code, savedAt: T } } } } }));
  const link = await makeLink(a.page, true);
  expect(link.length > 8000, `${link.length}`);
  const note = await a.page.locator('.transfer-long').innerText();
  expect(note.includes('Some apps cut long links') && note.includes('progress file'), note);
  await partShots(a.page, '#your-progress', 'settings-progress-long');
  await a.ctx.close();
});

await test('moving progress: /transfer/ works offline after a visit', async () => {
  const ctx = await browser.newContext({ ...PHONE });
  const page = await ctx.newPage();
  await page.goto(BASE + 'settings/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(phoneA)]);
  await page.reload();
  const link = await makeLink(page, false);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(progress())]);
  await ctx.setOffline(true);
  await page.goto(link);
  await page.locator('.import-review').waitFor();
  await page.click('button:has-text("Merge into my progress")');
  await page.locator('.transfer-done').waitFor();
  expect((await saved(page)).steps[S1].done, 'imported offline');
  await ctx.close();
});

console.log('Projects');
/** A program with a comment line after main.py's code, so the code that passed can be told from the model solution. */
const markMain = (code, mark) => joinFiles(splitFiles(code).map((f) => (f.path === 'main.py' ? { ...f, text: f.text.replace(/\n*$/, `\n# ${mark}\n`) } : f)));
/** A program with a milestone's new files after its own (src/lib/projects.ts withFiles). */
const addFiles = (code, files = {}) => {
  const have = splitFiles(code);
  const added = Object.entries(files).filter(([p]) => !have.some((f) => f.path === p)).map(([path, text]) => ({ path, text }));
  return added.length ? joinFiles([...have, ...added]) : code;
};
/** The text of main.py in the editor (its tab, when there are several files). */
async function mainText(page) {
  const paths = await tabPaths(page);
  if (paths.length) {
    await page.click(`#file-tab-${paths.indexOf('main.py')}`);
    await page.locator('.file-tab-on', { hasText: 'main.py' }).waitFor();
  }
  return editorText(page);
}
const sameText = (a, b) => a.replace(/\s+$/, '') === b.replace(/\s+$/, '');
const mainOf = (code) => splitFiles(code).find((f) => f.path === 'main.py').text;
async function openMilestone(page, k) {
  await page.locator('.milestones > li').nth(k).locator('button').click();
  await page.locator('#milestone-h', { hasText: `Milestone ${k + 1}:` }).waitFor();
  await page.locator('.task-card', { hasText: `Milestone ${k + 1} of` }).waitFor();
}

await test('projects: the Learn and home pages link to them; the list says which module each comes after; a project opens one milestone at a time, each starting from the code that passed the one before with its new files; a shown solution opens the next, which offers the model solution; passing them all finishes the project, which travels in a transfer link; axe in both themes at 320 and 390 px', async () => {
  const { ctx, page, errors } = await phoneWith(progress(), { colorScheme: 'dark' });
  await ctx.addInitScript((k) => localStorage.setItem(k, '1'), MOBILE_KEY);
  for (const path of ['', 'learn/']) {
    await page.goto(BASE + path);
    await page.locator('#main h1').first().waitFor();
    expect((await page.locator('#main a[href$="/projects/"]').count()) > 0, `${path || 'home'}: no link to the projects`);
  }
  await page.goto(BASE + 'projects/');
  await page.locator('#main h1', { hasText: 'Projects' }).waitFor();
  await phonesBothThemes(page, 'the projects page');
  if (!PROJECTS.length) {
    expect((await page.locator('#main').innerText()).includes('No projects yet'), 'an empty list says so');
    await ctx.close();
    return;
  }
  for (const x of PROJECTS) {
    const card = page.locator('.project-card', { hasText: x.title });
    const after = COURSE_INDEX.plan.find((m) => m.id === x.after);
    expect((await card.innerText()).includes(`After module ${after.number}: ${after.title}`), `${x.title}: which module it comes after`);
  }
  await shot(page, 'projects-list');
  // The first project, milestone by milestone.
  const p = PROJECTS[0];
  const ms = p.milestones;
  const n = ms.length;
  // Every project's page is pre-rendered with its intro and tasks, listed in the sitemap, and saved for offline use with its file.
  const sitemap = await (await fetch(BASE + 'sitemap.xml')).text();
  const sw = await (await fetch(BASE + 'sw.js')).text();
  for (const x of PROJECTS) {
    const html = await (await fetch(BASE + `projects/${x.id}/`)).text();
    expect(html.includes(`<h1>${esc(x.title)}</h1>`) && html.includes('Milestone 1: '), `projects/${x.id}/ is pre-rendered`);
    expect(sitemap.includes(`/projects/${x.id}/</loc>`), `the sitemap lists projects/${x.id}/`);
    expect(sw.includes(`"projects/${x.id}/"`) && sw.includes(`"lessons/projects/${x.id}-`), `the service worker saves projects/${x.id}/ and its file`);
  }
  await page.locator('.project-card', { hasText: p.title }).locator('a').first().click();
  await page.locator('#main h1', { hasText: p.title }).waitFor();
  await lessonReady(page);
  expect((await page.locator('.milestones > li.milestone-locked').count()) === n - 1, 'only the first milestone is open');
  // Milestone 1 starts from the seed, which doesn't pass.
  expect(sameText(await mainText(page), mainOf(ms[0].seed)), 'milestone 1 starts from the seed');
  expect(!(await check(page)).includes('All tests passed'), 'the seed passes milestone 1');
  await phonesBothThemes(page, `${p.title}, milestone 1 checked`);
  await shot(page, 'project-milestone-1');
  /** Passes milestone k with its model solution, marked so the next milestone's start can be told apart. */
  const pass = async (k) => {
    const code = markMain(ms[k].solution, `passed milestone ${k + 1} here`);
    await setProgram(page, code);
    const out = await check(page);
    expect(out.includes('All tests passed'), `milestone ${k + 1}: ${out.slice(0, 500)}`);
    return code;
  };
  let passed = await pass(0);
  await page.locator('.banner-pass', { hasText: `Milestone 1 of ${n} complete` }).waitFor();
  expect((await page.locator('.milestones > li').nth(1).getAttribute('class')).includes('milestone-open'), 'milestone 2 opens');
  // Milestone 2 starts from the code that passed milestone 1, with the files it adds.
  await openMilestone(page, 1);
  const start2 = addFiles(passed, ms[1].files);
  if (splitFiles(start2).length > 1) expect(JSON.stringify(await tabPaths(page)) === JSON.stringify(splitFiles(start2).map((f) => f.path)), `milestone 2's files: ${await tabPaths(page)}`);
  expect((await mainText(page)).includes('# passed milestone 1 here'), 'milestone 2 starts from the code that passed milestone 1');
  // Its solution, shown after the hints, opens milestone 3 without passing milestone 2.
  expect((await page.locator('.milestones > li').nth(2).getAttribute('class')).includes('milestone-locked'), 'milestone 3 is locked');
  while ((await page.locator('.btn-hint').count()) > 0) await page.locator('.btn-hint').click();
  await page.click('button:has-text("Show solution")');
  await page.locator('#solution').waitFor();
  if (n > 2) {
    expect((await page.locator('.milestones > li').nth(2).getAttribute('class')).includes('milestone-open'), 'milestone 3 opens after milestone 2\'s solution is shown');
    await openMilestone(page, 2);
    expect((await page.locator('.milestone-note').allInnerTexts()).join(' ').includes('starts from the model solution of milestone 2'), 'milestone 3 says it starts from the model solution');
    expect(sameText(await mainText(page), mainOf(ms[2].seed)), 'milestone 3 starts from milestone 2\'s model solution');
    // After typing in it, "Start from the model solution of milestone 2" puts that back, once confirmed.
    await page.click('.cm-content');
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('# a change of mine\n');
    expect((await editorText(page)).includes('# a change of mine'), 'the change is in the editor');
    page.once('dialog', (d) => d.accept());
    await page.click('button:has-text("Start from the model solution of milestone 2")');
    await page.waitForFunction(() => !document.querySelector('.cm-editor')?.arenaText?.().includes('a change of mine'));
    expect(sameText(await mainText(page), mainOf(ms[2].seed)), 'the model solution of milestone 2 is back');
    await phonesBothThemes(page, `${p.title}, milestone 3 with the model solution offered`);
    await shot(page, 'project-milestone-3');
    passed = await pass(2);
    // The later milestones, each from the code that passed the one before.
    for (let k = 3; k < n; k++) {
      await openMilestone(page, k);
      expect((await mainText(page)).includes(`# passed milestone ${k} here`), `milestone ${k + 1} starts from the code that passed milestone ${k}`);
      passed = await pass(k);
    }
  }
  expect((await page.locator('.banner-pass', { hasText: 'Project complete' }).count()) === 0, 'complete with milestone 2 not passed');
  // Milestone 2 passes last, which finishes the project.
  await openMilestone(page, 1);
  await pass(1);
  await page.locator('.banner-pass', { hasText: `Project complete: ${p.title}` }).waitFor();
  // Saved a moment after the change.
  await page.waitForFunction(([k, id]) => JSON.parse(localStorage.getItem(k))?.projects?.[id]?.done, [KEY, p.id]);
  const st = await saved(page);
  expect(st.projects[p.id].done && typeof st.projects[p.id].doneAt === 'number', JSON.stringify(st.projects[p.id]).slice(0, 300));
  expect(ms.every((m) => st.projects[p.id].milestones[m.id].done), 'every milestone is done');
  await page.reload();
  await page.locator('#main h1', { hasText: p.title }).waitFor();
  // The saved progress is read after the page renders: wait for the chip instead of counting at once.
  await page.locator('.step-count .done-chip').first().waitFor({ timeout: 15000 }).catch(() => {});
  expect((await page.locator('.step-count .done-chip').count()) === 1, 'the project page says done after a reload');
  // The finished project travels in a transfer link (progress only).
  const link = await makeLink(page, false);
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
  const b = await phoneWith(progress());
  await b.page.goto(link);
  await b.page.locator('.import-review').waitFor();
  expect((await b.page.locator('.import-review').innerText()).includes(`${n} finished project milestone`), await b.page.locator('.import-review').innerText());
  await b.page.click('button:has-text("Merge into my progress")');
  await b.page.locator('.transfer-done').waitFor();
  expect((await saved(b.page)).projects[p.id]?.done, 'the project arrives done');
  await b.page.goto(BASE + 'projects/');
  await b.page.locator('.project-card.done', { hasText: p.title }).waitFor();
  // The record page lists the finished project.
  await b.page.goto(BASE + 'record/');
  await b.page.locator('.record-projects li', { hasText: p.title }).waitFor();
  await b.ctx.close();
});

console.log('Personal record');
const RECORD_NOTICE = "This is a personal record made by Python Arena from the progress saved in this browser. It is not a certificate. It isn't issued or checked by the University of Helsinki or the MOOC, and nobody verifies it.";
const RECORD_DAY = 86_400_000;
/** A step done, with every challenge, at `at`. */
const stepDone = (s, at) => ({ done: true, doneAt: at, clean: true, challenges: Object.fromEntries([...Array(s.challenges).keys()].map((k) => [k, { done: true, hintsUsed: 0, attempts: 1 }])) });
/** Every step of these modules done, module k's last step on day k (noon, so the date is the same everywhere). */
function finished(ids, from = T) {
  const steps = {};
  ids.forEach((id, k) => {
    const m = COURSE_INDEX.modules.find((x) => x.id === id);
    m.steps.forEach((s, i) => (steps[s.id] = stepDone(s, from + k * RECORD_DAY - (m.steps.length - 1 - i) * 3_600_000)));
  });
  return steps;
}
const shortDate = (ms) => { const d = new Date(ms); return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`; };
/** The number of pages of a PDF Chromium printed. */
const pdfPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
/** Prints the page as Chromium's print preview would (A4), saves it with --shots, and returns its page count. */
async function printPdf(page, name) {
  const buf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  if (SHOTS) (await import('node:fs')).writeFileSync(`${SHOTS}/${name}.pdf`, buf);
  return pdfPages(buf);
}
const recordWords = /\b(certificate|certified|awarded|credentials?)\b/i;

await test('record: the record page lists the modules finished by part with their dates, the parts and projects finished and the totals; the name is kept in settings; it says plainly what it is; module pages and the end of a finished part link to it; axe in both themes at 320 and 390 px', async () => {
  const part1 = COURSE_INDEX.plan.filter((m) => m.course === 'I' && m.part === 1).map((m) => m.id);
  const part2 = COURSE_INDEX.plan.filter((m) => m.course === 'I' && m.part === 2).map((m) => m.id);
  const half = COURSE_INDEX.modules.find((m) => m.id === part2[1]);
  const proj = COURSE_INDEX.projects?.[0];
  const st = progress({
    steps: { ...finished([...part1, part2[0]]), [half.steps[0].id]: stepDone(half.steps[0], T) },
    projects: proj ? { [proj.id]: { done: true, doneAt: T + 20 * RECORD_DAY, milestones: {} } } : {},
  });
  const { ctx, page, errors } = await phoneWith(st);
  await ctx.addInitScript(() => (window.print = () => (window.__printed = (window.__printed ?? 0) + 1)));
  await page.goto(BASE + 'record/');
  await page.locator('.record-sheet').waitFor();
  expect((await page.locator('#main h1').innerText()) === 'Your record', 'the heading');
  expect((await page.locator('.record-notice').innerText()).trim() === RECORD_NOTICE, `the notice: ${await page.locator('.record-notice').innerText()}`);
  const sheet = await page.locator('.record-sheet').innerText();
  // Part 1: every module, each with the day its last step was finished; the part finished on the last one's day.
  const p1 = page.locator('.record-part', { has: page.locator('h4', { hasText: /^Part 1(?!\d)/ }) });
  expect((await p1.locator('.record-list li').count()) === part1.length, `part 1 lists ${part1.length} modules`);
  for (const [k, id] of part1.entries()) {
    const m = COURSE_INDEX.modules.find((x) => x.id === id);
    const row = await p1.locator('.record-list li').nth(k).innerText();
    expect(row.includes(`Module ${m.number}: ${m.title}`) && row.includes(shortDate(T + k * RECORD_DAY)), `module ${m.number}'s row: ${row}`);
  }
  expect((await p1.locator('h4').innerText()).includes(`finished ${shortDate(T + (part1.length - 1) * RECORD_DAY)}`), await p1.locator('h4').innerText());
  // Part 2: one module finished (the half-done one isn't listed).
  const p2 = page.locator('.record-part', { has: page.locator('h4', { hasText: /^Part 2(?!\d)/ }) });
  expect((await p2.locator('h4').innerText()).includes(`1 of ${part2.length} modules`), await p2.locator('h4').innerText());
  expect(!sheet.includes(`: ${half.title}`), 'a module with a step left is not listed');
  if (proj) expect(sheet.includes(proj.title) && sheet.includes(shortDate(T + 20 * RECORD_DAY)), `the project: ${sheet}`);
  const totals = await page.locator('.record-totals').innerText();
  const steps = part1.concat(part2[0]).reduce((a, id) => a + COURSE_INDEX.modules.find((m) => m.id === id).steps.length, 0) + 1;
  for (const words of [`Modules finished ${part1.length + 1} of ${COURSE_INDEX.plan.length}`, `Parts finished 1 of ${COURSE_INDEX.plan.filter((m) => m.part != null).reduce((a, m) => a.add(m.part), new Set()).size}`, `Steps done ${steps} of `])
    expect(totals.replace(/\s+/g, ' ').includes(words), `the totals say "${words}": ${totals}`);
  if (proj) expect(totals.replace(/\s+/g, ' ').includes(`Projects finished 1 of ${COURSE_INDEX.projects.length}`), totals);
  expect(sheet.includes((new URL(BASE).host + BASE_PATH).replace(/\/$/, '')), `the site's address: ${sheet.slice(0, 200)}`);

  // The name: typed, kept in settings, on the record; still there after a reload.
  await page.fill('#record-name', 'Ada Lovelace');
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k))?.settings?.name === 'Ada Lovelace', KEY);
  expect((await page.locator('.record-who').innerText()) === 'Ada Lovelace', 'the name on the record');
  await page.reload();
  await page.locator('.record-who', { hasText: 'Ada Lovelace' }).waitFor();
  expect((await page.inputValue('#record-name')) === 'Ada Lovelace', 'the name field after a reload');
  // No word the design rules out, anywhere on the page but the notice's "It is not a certificate".
  const all = (await page.locator('body').innerText()).replace(RECORD_NOTICE, '');
  expect(!recordWords.test(all), `a word the record must not use: ${all.match(recordWords)?.[0]}`);
  // The button opens the print dialog.
  await page.click('button:has-text("Print or save as PDF")');
  expect((await page.evaluate(() => window.__printed)) === 1, 'Print or save as PDF calls window.print');

  await phonesBothThemes(page, 'the record page');
  if (SHOTS) {
    for (const width of [320, 390])
      for (const colorScheme of ['dark', 'light']) {
        await page.setViewportSize({ width, height: 860 });
        await page.emulateMedia({ colorScheme });
        await page.waitForFunction((t) => document.documentElement.dataset.theme === t, colorScheme);
        // Let the buttons' color transitions end.
        await page.waitForTimeout(400);
        await shot(page, `record-${width}-${colorScheme}`);
      }
    await page.setViewportSize(PHONE.viewport);
  }

  // Printed (in the dark theme, too): only the record, light, with the logo, the address and the notice.
  await page.emulateMedia({ colorScheme: 'dark', media: 'print' });
  const printed = await page.evaluate(() => {
    const shown = (sel) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
    const sheet = document.querySelector('.record-sheet');
    return {
      header: shown('.topbar'), footer: shown('.footer'), controls: shown('.record-controls'), intro: shown('.page-head'),
      sheet: shown('.record-sheet'), logo: shown('.record-sheet .brand-mark'), address: shown('.record-address'), notice: shown('.record-notice'),
      bg: getComputedStyle(document.body).backgroundColor, sheetBg: getComputedStyle(sheet).backgroundColor, color: getComputedStyle(sheet).color, notice2: getComputedStyle(document.querySelector('.record-notice')).color,
    };
  });
  expect(!printed.header && !printed.footer && !printed.controls && !printed.intro, `printed: no navigation, footer, name field or button: ${JSON.stringify(printed)}`);
  expect(printed.sheet && printed.logo && printed.address && printed.notice, `printed: the record, the logo, the address and the notice: ${JSON.stringify(printed)}`);
  const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
  expect(rgb(printed.bg).every((v) => v === 255) && rgb(printed.sheetBg).every((v) => v === 255), `printed on white: ${printed.bg}, ${printed.sheetBg}`);
  expect(rgb(printed.color).every((v) => v < 80) && rgb(printed.notice2).every((v) => v < 80), `printed in dark text: ${printed.color}, ${printed.notice2}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/record-print-emulated.png`, fullPage: true });
  const pages = await printPdf(page, 'record');
  expect(pages === 1, `the record prints on one page: ${pages}`);
  await page.emulateMedia({ media: 'screen' });

  // Links to the record: a finished module's page (the last of part 1 says the part is finished too), the end of part 1 on the Learn page; not a module with a step left.
  const last = COURSE_INDEX.modules.find((m) => m.id === part1[part1.length - 1]);
  await page.goto(BASE + `learn/${last.id}/`);
  const told = await page.locator('.record-link').innerText();
  expect(told.includes(`You finished this module on ${shortDate(T + (part1.length - 1) * RECORD_DAY)}, and with it part 1.`), told);
  expect((await page.locator('.record-link a').getAttribute('href')) === `${BASE_PATH}record/`, 'the module page links to the record');
  await page.goto(BASE + `learn/${part2[0]}/`);
  expect(!(await page.locator('.record-link').innerText()).includes('part 2'), 'part 2 is not finished');
  await page.goto(BASE + `learn/${half.id}/`);
  await page.locator('#main h1').waitFor();
  expect((await page.locator('.record-link').count()) === 0, 'a module with a step left does not link to the record');
  await page.goto(BASE + 'learn/');
  await page.locator('.module-live').first().waitFor();
  expect((await page.locator('.record-link').count()) === 1, 'only part 1 ends with a link to the record');
  expect((await page.locator('.part', { hasText: 'Part 1' }).first().locator('.record-link').innerText()).includes('Part 1 finished.'), 'the end of part 1');
  await phonesBothThemes(page, 'the Learn page with a part finished');
  // The link takes the learner there.
  await page.click('.record-link a');
  await page.locator('.record-sheet').waitFor();
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('record: with nothing finished it says so; with every written module and every project finished it still prints on at most two pages', async () => {
  const empty = await phoneWith(progress());
  await empty.page.goto(BASE + 'record/');
  await empty.page.locator('.record-empty').waitFor();
  expect((await empty.page.locator('.record-empty').innerText()).includes('Nothing is finished yet in this browser.'), 'the empty record');
  await phonesBothThemes(empty.page, 'an empty record');
  await empty.ctx.close();

  const ids = COURSE_INDEX.modules.map((m) => m.id);
  const st = progress({
    steps: finished(ids),
    projects: Object.fromEntries((COURSE_INDEX.projects ?? []).map((p, k) => [p.id, { done: true, doneAt: T + (ids.length + k) * RECORD_DAY, milestones: {} }])),
    settings: freshSettings({ name: 'Maximilian Alexander Featherstonehaugh-Worthington' }),
  });
  const { ctx, page, errors } = await phoneWith(st);
  await page.goto(BASE + 'record/');
  await page.locator('.record-sheet').waitFor();
  expect((await page.locator('.record-sheet .record-list li').count()) === ids.length + (COURSE_INDEX.projects?.length ?? 0), 'every module and project is listed');
  const totals = (await page.locator('.record-totals').innerText()).replace(/\s+/g, ' ');
  expect(totals.includes(`Modules finished ${ids.length} of ${COURSE_INDEX.plan.length}`), totals);
  await phonesBothThemes(page, 'a full record');
  if (SHOTS) await shot(page, 'record-full-390');
  await page.emulateMedia({ media: 'print' });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/record-full-print-emulated.png`, fullPage: true });
  const pages = await printPdf(page, 'record-full');
  expect(pages >= 1 && pages <= 2, `the whole course prints on at most two pages: ${pages}`);
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

console.log('Projects, milestone by milestone');
/** Every file of the program in the editor, joined as the grader joins them (each tab's text, when there are several). */
async function programText(page) {
  const paths = await tabPaths(page);
  if (!paths.length) return editorText(page);
  const files = [];
  for (const [i, path] of paths.entries()) {
    await page.click(`#file-tab-${i}`);
    await page.locator(`#file-tab-${i}[aria-selected="true"]`).waitFor();
    files.push({ path, text: await editorText(page) });
  }
  await page.click('#file-tab-0');
  return files;
}
/** The same files with the same texts (trailing white space aside), in the same order. */
function sameProgram(got, want) {
  const g = Array.isArray(got) ? got : [{ path: 'main.py', text: got }];
  const w = splitFiles(want);
  return g.length === w.length && g.every((f, i) => f.path === w[i].path && sameText(f.text, w[i].text));
}
/** Passes milestone k of `ms` with its model solution, marked so the next milestone's start can be told from it. */
async function passMilestone(page, ms, k) {
  const code = markMain(ms[k].solution, `passed milestone ${k + 1} here`);
  await setProgram(page, code);
  const out = await check(page);
  expect(out.includes('All tests passed'), `milestone ${k + 1} (${ms[k].id}): ${out.slice(0, 500)}`);
  return code;
}
/** The state class of each milestone in the list: done, open or locked. */
const milestoneStates = (page) => page.locator('.milestones > li').evaluateAll((els) => els.map((e) => (e.className.match(/milestone-(done|open|locked)/) ?? [])[1]));
/** Screenshots at 390 px in both themes and on a 1280 px desktop in both themes (with --shots). */
async function phoneAndDesktopShots(page, name) {
  if (!SHOTS) return;
  const st = await saved(page);
  const url = page.url();
  // A full-page shot of a scrolled page draws the sticky header where the view was.
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const colorScheme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme });
    await page.waitForFunction((t) => document.documentElement.dataset.theme === t, colorScheme);
    await page.waitForTimeout(400);
    await shot(page, `${name}-390-${colorScheme}`);
  }
  const d = await newPage();
  await d.ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(st)]);
  await d.ctx.addInitScript((k) => localStorage.setItem(k, '1'), MOBILE_KEY);
  for (const colorScheme of ['dark', 'light']) {
    await d.page.emulateMedia({ colorScheme });
    await d.page.goto(url);
    await d.page.locator('#main h1').first().waitFor();
    if (await d.page.locator('.workbench').count()) await lessonReady(d.page);
    await d.page.waitForTimeout(400);
    await shot(d.page, `${name}-desktop-${colorScheme}`);
  }
  await d.ctx.close();
}

for (const x of PROJECTS) {
  await test(`projects: ${x.title}: the page renders with its intro and milestones; milestone 1 passes with its model solution; milestone 2 opens from that code with its new files`, async () => {
    const ms = x.milestones;
    const n = ms.length;
    const { ctx, page, errors } = await phoneWith(progress());
    await ctx.addInitScript((k) => localStorage.setItem(k, '1'), MOBILE_KEY);
    await page.goto(BASE + `projects/${x.id}/`);
    await page.locator('#main h1', { hasText: x.title }).waitFor();
    // The pre-rendered list has no states: wait for the app's.
    await page.locator('.milestones > li.milestone-open').first().waitFor();
    expect((await page.locator('.milestones > li').count()) === n, `${n} milestones listed`);
    expect(JSON.stringify(await milestoneStates(page)) === JSON.stringify(['open', ...Array(n - 1).fill('locked')]), `at first only milestone 1 is open: ${await milestoneStates(page)}`);
    for (const [k, m] of ms.entries()) expect((await page.locator('.milestones > li').nth(k).innerText()).includes(m.title), `milestone ${k + 1}'s title in the list`);
    expect((await page.locator('article.step-text').innerText()).length > 300, 'the intro is shown');
    // "Project · After module N: title" is one run of text (pre-rendered too): on a phone it wraps like a sentence, each line from the left edge, not as two narrow columns.
    const html = await (await fetch(BASE + `projects/${x.id}/`)).text();
    expect(html.includes('<div class="step-count"><span class="project-label">Project · After '), `the pre-rendered label: ${html.match(/<div class="step-count">.{0,200}/)?.[0]}`);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 860 });
      const lines = await page.locator('.step-count > .project-label').evaluate((e) => { const left = e.parentElement.getBoundingClientRect().left; return [...e.getClientRects()].map((r) => Math.round(r.left - left)); });
      expect(lines.length >= 1 && lines.every((x) => x === 0), `${width} px: the label's lines start at ${lines} px from the left edge`);
    }
    await page.setViewportSize(PHONE.viewport);
    await page.locator('.task-card', { hasText: `Milestone 1 of ${n}` }).waitFor();
    await lessonReady(page);
    expect(sameProgram(await programText(page), ms[0].seed), 'milestone 1 starts from the seed');
    const passed = await passMilestone(page, ms, 0);
    await page.locator('.banner-pass', { hasText: `Milestone 1 of ${n} complete` }).waitFor();
    await page.waitForFunction(([k, id, m]) => JSON.parse(localStorage.getItem(k))?.projects?.[id]?.milestones?.[m]?.done, [KEY, x.id, ms[0].id]);
    expect(JSON.stringify(await milestoneStates(page)) === JSON.stringify(['done', 'open', ...Array(n - 2).fill('locked')]), `after milestone 1: ${await milestoneStates(page)}`);
    // "Next milestone" opens milestone 2, from the code that passed milestone 1 and the files milestone 2 adds.
    await page.click('button:has-text("Next milestone")');
    await page.locator('#milestone-h', { hasText: `Milestone 2: ${ms[1].title}` }).waitFor();
    await page.locator('.task-card', { hasText: `Milestone 2 of ${n}` }).waitFor();
    expect(sameProgram(await programText(page), addFiles(passed, ms[1].files)), `milestone 2 starts from the code that passed milestone 1: ${JSON.stringify(await programText(page)).slice(0, 400)}`);
    if (Object.keys(ms[1].files ?? {}).length) expect((await page.locator('.milestone-note').allInnerTexts()).join(' ').includes('This milestone adds'), 'milestone 2 says which files it adds');
    // The page still says so after a reload.
    await page.reload();
    await page.locator('#main h1', { hasText: x.title }).waitFor();
    await page.locator('.milestones > li.milestone-open').first().waitFor();
    expect((await milestoneStates(page))[0] === 'done', 'milestone 1 is still done after a reload');
    expect(errors.length === 0, errors.join('\n'));
    await ctx.close();
  });
}

await test('projects: one project passed milestone by milestone in order finishes; the record page lists it with its date; a transfer link made after that carries the project into a fresh browser', async () => {
  // A project other than the one the test above shows solutions in, when there are several.
  const p = PROJECTS[PROJECTS.length > 1 ? 1 : 0];
  if (!p) return;
  const ms = p.milestones;
  const n = ms.length;
  const { ctx, page, errors } = await phoneWith(progress());
  await ctx.addInitScript((k) => localStorage.setItem(k, '1'), MOBILE_KEY);
  await page.goto(BASE + 'projects/');
  await page.locator('.project-card', { hasText: p.title }).waitFor();
  await phoneAndDesktopShots(page, 'projects-index');
  await page.goto(BASE + `projects/${p.id}/`);
  await page.locator('#main h1', { hasText: p.title }).waitFor();
  await lessonReady(page);
  let passed = null;
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      await page.click('button:has-text("Next milestone")');
      await page.locator('#milestone-h', { hasText: `Milestone ${k + 1}: ${ms[k].title}` }).waitFor();
      expect(sameProgram(await programText(page), addFiles(passed, ms[k].files)), `milestone ${k + 1} starts from the code that passed milestone ${k}`);
    }
    if (k === 1) await phoneAndDesktopShots(page, 'project-milestone');
    passed = await passMilestone(page, ms, k);
    const want = [...Array(k + 1).fill('done'), ...(k + 1 < n ? ['open'] : []), ...Array(Math.max(0, n - k - 2)).fill('locked')];
    expect(JSON.stringify(await milestoneStates(page)) === JSON.stringify(want), `after milestone ${k + 1}: ${await milestoneStates(page)}, not ${want}`);
    if (k + 1 < n) await page.locator('.banner-pass', { hasText: `Milestone ${k + 1} of ${n} complete` }).waitFor();
  }
  await page.locator('.banner-pass', { hasText: `Project complete: ${p.title}` }).waitFor();
  await page.waitForFunction(([k, id]) => JSON.parse(localStorage.getItem(k))?.projects?.[id]?.done, [KEY, p.id]);
  // The banner and the finished project's header link to the record.
  await page.locator(`.banner-pass a[href="${BASE_PATH}record/"]`).waitFor();
  await page.locator(`.step-text .record-link a[href="${BASE_PATH}record/"]`).waitFor();
  expect((await page.locator('.step-text .record-link').innerText()).startsWith('You finished this project on '), await page.locator('.step-text .record-link').innerText());
  const st = await saved(page);
  const doneAt = st.projects[p.id].doneAt;
  expect(typeof doneAt === 'number' && ms.every((m) => st.projects[p.id].milestones[m.id].done), JSON.stringify(st.projects[p.id]).slice(0, 300));
  // Done in order: no solution was shown on the way.
  expect(ms.every((m) => !st.projects[p.id].milestones[m.id].sawSolution), 'no solution was looked at');
  // The record page lists it with the day it was finished.
  await page.goto(BASE + 'record/');
  const row = page.locator('.record-projects li', { hasText: p.title });
  await row.waitFor();
  expect((await row.innerText()).includes(shortDate(doneAt)), `the record's row: ${await row.innerText()}`);
  // All of it on one day: "finished on <day>", not "from <day> to <day>".
  const made = await page.locator('.record-made').innerText();
  expect(made.includes(`Everything with a date below was finished on ${shortDate(doneAt)}.`) && !made.includes('run from'), `the record's date line: ${made}`);
  expect((await page.locator('.record-totals').innerText()).replace(/\s+/g, ' ').includes(`Projects finished 1 of ${PROJECTS.length}`), await page.locator('.record-totals').innerText());
  await phoneAndDesktopShots(page, 'record');
  // A transfer link made now carries the project, its milestones and its code into a fresh browser.
  const link = await makeLink(page, true);
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
  const b = await phoneWith(null);
  await b.ctx.addInitScript((k) => localStorage.setItem(k, '1'), MOBILE_KEY);
  await b.page.goto(link);
  await b.page.locator('.import-review').waitFor();
  expect((await b.page.locator('.import-review').innerText()).includes(`${n} finished project milestone`), await b.page.locator('.import-review').innerText());
  await b.page.click('button:has-text("Merge into my progress")');
  await b.page.locator('.transfer-done').waitFor();
  const got = (await saved(b.page)).projects[p.id];
  expect(got?.done && got.doneAt === doneAt && ms.every((m) => got.milestones[m.id]?.done), `the project arrives done: ${JSON.stringify(got).slice(0, 300)}`);
  expect(got.milestones[ms[n - 1].id].code === st.projects[p.id].milestones[ms[n - 1].id].code, 'the last milestone\'s code arrives');
  await b.page.goto(BASE + `projects/${p.id}/`);
  await b.page.locator('#main h1', { hasText: p.title }).waitFor();
  await b.page.locator('.milestones > li.milestone-done').first().waitFor();
  expect((await milestoneStates(b.page)).every((s) => s === 'done'), `every milestone is done in the fresh browser: ${await milestoneStates(b.page)}`);
  expect((await b.page.locator('.step-count .done-chip').count()) === 1, 'the project page says done');
  await b.page.goto(BASE + 'record/');
  await b.page.locator('.record-projects li', { hasText: p.title }).waitFor();
  await b.ctx.close();
});

console.log('Pro Track');
/** The Pro Track's projects from the source (content/pro-track.yaml and pro-track/), as the build read them. */
const PRO = readProTrack(ROOT_DIR).projects;
const PRO_HONEST_TEXT = "These projects run on your computer, not on this site. Python Arena can't see your code or your test results and doesn't grade anything";

await test('Pro Track: the home, Learn and last MOOC module pages and the footer link to it; /pro/ is pre-rendered, in the sitemap and saved for offline use (the zips are not), and says plainly that the site grades nothing; axe in both themes at 320 and 390 px', async () => {
  const { ctx, page, errors } = await phoneWith(progress());
  const last = COURSE_INDEX.plan.filter((m) => m.course === 'II').pop();
  for (const path of ['', 'learn/', ...(last.live ? [`learn/${last.id}/`] : [])]) {
    await page.goto(BASE + path);
    await page.locator('#main h1').first().waitFor();
    expect((await page.locator('#main a[href$="/pro/"]').count()) > 0, `${path || 'home'}: no link to the Pro Track`);
    const html = await (await fetch(BASE + path)).text();
    expect(html.includes(`href="${new URL(BASE).pathname}pro/"`), `${path || 'home'}: the pre-rendered page links to the Pro Track`);
  }
  expect((await page.locator('footer a[href$="/pro/"]').count()) === 1, 'the footer links to the Pro Track');
  const html = await (await fetch(BASE + 'pro/')).text();
  expect(html.includes('<h1>Pro Track</h1>') && html.includes('Python 3.14') && html.includes('python.org') && html.includes('pytest'), 'pro/ is pre-rendered with its guide');
  const sitemap = await (await fetch(BASE + 'sitemap.xml')).text();
  const sw = await (await fetch(BASE + 'sw.js')).text();
  expect(sitemap.includes('/pro/</loc>') && sw.includes('"pro/"'), 'pro/ is in the sitemap and saved for offline use');
  expect(!/\.zip"/.test(sw), 'no zip is saved for offline use');
  await page.goto(BASE + 'pro/');
  await page.locator('#main h1', { hasText: 'Pro Track' }).waitFor();
  const text = await page.locator('#main').innerText();
  expect(text.includes(PRO_HONEST_TEXT), 'says the site grades nothing');
  expect(!/\b(graded by Python Arena|verified|certificate)\b/i.test(text), 'claims nothing it does not do');
  if (!PRO.length) expect(text.includes('The projects are on their way'), 'an empty list says so');
  for (const p of PRO) {
    expect(text.includes(p.title), `lists ${p.title}`);
    const page2 = await (await fetch(BASE + `pro/${p.id}/`)).text();
    expect(page2.includes(`<h1>${esc(p.title)}</h1>`) && page2.includes('Download the project (zip'), `pro/${p.id}/ is pre-rendered`);
    expect(sitemap.includes(`/pro/${p.id}/</loc>`) && sw.includes(`"pro/${p.id}/"`), `pro/${p.id}/ is in the sitemap and saved for offline use`);
  }
  await phonesBothThemes(page, 'the Pro Track page');
  await shot(page, 'pro-track');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

for (const p of PRO)
  await test(`Pro Track: ${p.title}: the page shows what it practices and its README's steps; the zip downloads with the same bytes as a fresh zip of pro-track/${p.id}/; the checklist is kept after a reload, travels in a transfer link and shows on the record page as marked as done by you; axe in both themes at 320 and 390 px`, async () => {
    const { ctx, page, errors } = await phoneWith(progress(), { acceptDownloads: true });
    await page.goto(BASE + `pro/${p.id}/`);
    await page.locator('#main h1', { hasText: p.title }).waitFor();
    for (const h of ['What it practices', "What you'll build", 'Steps', 'Run the tests', 'Your checklist']) await page.locator('#main h2', { hasText: h }).first().waitFor();
    const practices = await page.locator('.pro-practices').innerText();
    for (const x of p.practices) {
      const m = COURSE_INDEX.plan.find((pm) => pm.id === x.module);
      expect(practices.includes(`${x.what} (from module ${m.number}: ${m.title})`), practices);
    }
    expect((await page.locator('.io-shell').count()) > 0, 'the commands are shown as commands for your own computer');
    expect((await page.locator(`a[href="https://github.com/AntonyPerez0/pythonarena/tree/main/pro-track/${p.id}"]`).count()) === 1, 'links to its folder on GitHub');
    await phonesBothThemes(page, `the Pro Track project ${p.id}`);
    await shot(page, `pro-${p.id}`);
    // The checklist is at the end, after the whole README: a link by the download button jumps there.
    const jump = page.locator('.page-head a[href="#checklist"]');
    expect((await jump.innerText()).trim() === `Your checklist (0 of ${p.checklist.length} ticked)`, await jump.innerText());
    await jump.click();
    await page.waitForFunction(() => {
      const r = document.getElementById('checklist').getBoundingClientRect();
      return r.top >= 0 && r.top < innerHeight / 2;
    });
    await page.evaluate(() => scrollTo(0, 0));
    // The download: the zip the build made, the same bytes as a zip made now from the source folder.
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('a', { hasText: 'Download the project (zip' }).click()]);
    expect(download.suggestedFilename() === `${p.id}.zip`, download.suggestedFilename());
    const bytes = readFileSync(await download.path());
    const fresh = zipProject(ROOT_DIR, p.id);
    expect(Buffer.compare(bytes, Buffer.from(fresh)) === 0, `the downloaded zip (${bytes.length} bytes) differs from a fresh zip of pro-track/${p.id}/ (${fresh.length} bytes)`);
    const names = readZip(bytes).map((e) => e.name);
    for (const need of ['requirements.txt', 'pytest.ini', 'README.md', '.gitignore', '.github/workflows/test.yml']) expect(names.includes(`${p.id}/${need}`), `the zip has ${need}: ${names.join(', ')}`);
    expect(names.some((n) => /^[^/]+\/tests\/test_\w+\.py$/.test(n)), `the zip has the tests: ${names.join(', ')}`);
    expect(names.every((n) => n.startsWith(`${p.id}/`) && !/__pycache__|\.pytest_cache|\.venv\/|\.pyc$/.test(n)), names.join(', '));
    // The checklist: ticked items are saved with the time, kept after a reload, and counted.
    const items = page.locator('.pro-items input[type="checkbox"]');
    expect((await items.count()) === p.checklist.length, 'one box per checklist item');
    await page.locator('.pro-items label').first().click();
    await page.locator('.pro-items label').nth(1).click();
    await page.locator('.pro-items label').nth(1).click();
    await page.waitForFunction(([k, id, item]) => JSON.parse(localStorage.getItem(k))?.pro?.[id]?.items?.[item]?.done === true, [KEY, p.id, p.checklist[0].id]);
    await page.reload();
    await page.locator('#main h1', { hasText: p.title }).waitFor();
    expect(await items.nth(0).isChecked(), 'the first item is still ticked after a reload');
    expect(!(await items.nth(1).isChecked()), 'the second item, ticked and unticked, is not');
    expect((await page.locator('.pro-checklist').innerText()).includes(`1 of ${p.checklist.length} marked as done`), await page.locator('.pro-checklist').innerText());
    const st = await saved(page);
    expect(typeof st.pro[p.id].items[p.checklist[0].id].at === 'number' && st.pro[p.id].items[p.checklist[1].id].done === false, JSON.stringify(st.pro));
    // The record page shows it as the learner's own marks, never as checked.
    await page.goto(BASE + 'record/');
    const rec = page.locator('.record-pro li', { hasText: p.title });
    await rec.waitFor();
    expect((await rec.innerText()).includes(`1 of ${p.checklist.length} items marked as done by you`), await rec.innerText());
    const sheet = await page.locator('.record-sheet').innerText();
    expect(sheet.includes("Python Arena can't see them or run their tests"), 'the record says the site cannot check them');
    await page.goto(BASE + `pro/`);
    expect((await page.locator('.project-card', { hasText: p.title }).innerText()).includes(`1 of ${p.checklist.length} checklist items marked as done by you`), 'the list counts the ticks');
    // The checklist travels in a transfer link (progress only) and merges into another browser.
    const link = await makeLink(page, false);
    expect(errors.length === 0, errors.join('\n'));
    await ctx.close();
    const b = await phoneWith(progress());
    await b.page.goto(link);
    await b.page.locator('.import-review').waitFor();
    expect((await b.page.locator('.import-review').innerText()).includes('1 Pro Track checklist item marked as done'), await b.page.locator('.import-review').innerText());
    await b.page.click('button:has-text("Merge into my progress")');
    await b.page.locator('.transfer-done').waitFor();
    expect((await saved(b.page)).pro[p.id]?.items[p.checklist[0].id]?.done === true, 'the tick arrives');
    await b.page.goto(BASE + `pro/${p.id}/`);
    await b.page.locator('#main h1', { hasText: p.title }).waitFor();
    expect(await b.page.locator('.pro-items input[type="checkbox"]').first().isChecked(), 'and shows on the project page');
    await b.ctx.close();
  });

console.log('Downloading Python');
/** Requests for Python's own files (not the small list of them, manifest.json). */
const engineRequests = () => requests.filter((p) => p.includes('/engine/') && !p.endsWith('manifest.json'));
/** A phone whose browser reports this connection (undefined: it doesn't say). */
async function phoneOn(connection) {
  const r = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await r.ctx.addInitScript((c) => Object.defineProperty(navigator, 'connection', { value: c ?? undefined, configurable: true }), connection ?? null);
  return r;
}

await test('mobile data: nothing downloads until the learner agrees', async () => {
  const { ctx, page, errors } = await phoneOn({ type: 'cellular', effectiveType: '4g', saveData: false });
  requests.length = 0;
  await page.goto(BASE + 'playground/');
  await page.getByText("Your browser says you're on mobile data.").waitFor();
  const card = await page.locator('.data-card').innerText();
  expect(card.includes('Download Python?') && /a one-time download of [\d.]+ MB/.test(card) && card.includes('works offline'), card);
  await page.waitForTimeout(1500);
  expect(engineRequests().length === 0, `requested before agreeing: ${engineRequests().join(', ')}`);
  await axe(page, 'mobile data question');
  await shot(page, 'playground-phone-mobile-data');
  await page.getByRole('button', { name: /^Download now/ }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'check', null, { timeout: 5000 });
  await lessonReady(page);
  expect(engineRequests().length > 0, 'Python downloaded once agreed');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('a phone whose browser cannot tell the connection type is asked first too; pressing Run starts the download, as the question says', async () => {
  const { ctx, page, errors } = await phoneOn(undefined);
  requests.length = 0;
  await page.goto(BASE + 'playground/');
  await page.getByText("Your browser can't tell whether you're on Wi-Fi or mobile data.").waitFor();
  expect((await page.locator('.data-card').innerText()).includes('pressing Run also starts the download'), await page.locator('.data-card').innerText());
  await page.waitForTimeout(1000);
  expect(engineRequests().length === 0, `requested before agreeing: ${engineRequests().join(', ')}`);
  await axe(page, 'unknown connection question');
  // Run: the download starts, and the program runs once Python is ready.
  const out = await check(page);
  expect(engineRequests().length > 0 && out.includes('What is your name? Ada\nHello, Ada!'), out);
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('a browser without the WebAssembly features gets a clear message and no download', async () => {
  const { ctx, page } = await newPage();
  await ctx.addInitScript(() => Object.defineProperty(WebAssembly, 'instantiateStreaming', { value: undefined, configurable: true }));
  requests.length = 0;
  for (const path of ['playground/', firstPath]) {
    await page.goto(BASE + path);
    await page.getByText("This browser can't run Python").first().waitFor();
    expect(await page.locator('#check').isDisabled(), `${path}: the button that would run Python is disabled`);
    await axe(page, `${path}: an unsupported browser`);
  }
  await page.waitForTimeout(500);
  expect(requests.filter((p) => p.includes('/engine/')).length === 0, 'no engine requests');
  await ctx.close();
});

await test('after a failed download, Try again starts Python', async () => {
  const { ctx, page } = await newPage();
  let block = true;
  await ctx.route('**/engine/pyodide.asm.wasm*', (route) => (block ? route.abort() : route.continue()));
  await page.goto(BASE + 'playground/');
  await page.getByText("Python couldn't start").waitFor({ timeout: ENGINE_TIMEOUT });
  await axe(page, 'a failed download');
  block = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await lessonReady(page);
  const out = await check(page);
  expect(out.includes('Hello, Ada!'), out);
  await ctx.close();
});

await test('offline: after one visit, pages and Python work without a connection', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + 'playground/');
  await lessonReady(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await lessonReady(page);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
  await ctx.setOffline(true);
  // The list of Python's files is asked from the network first, then read from the copy saved with
  // Python (src/engine/manifest.ts): that one request fails offline by design.
  const failed = [];
  page.on('requestfailed', (r) => r.url().endsWith('/engine/manifest.json') || failed.push(r.url()));
  await page.reload();
  await lessonReady(page);
  await setCode(page, 'name = input("Name: ")\nprint(f"{name} works offline")\n');
  await page.fill('#pg-stdin', 'Alan');
  const out = await check(page);
  expect(out.includes('Name: Alan\nAlan works offline'), out);
  expect(failed.length === 0, `failed requests: ${failed.join(', ')}`);
  await page.goto(BASE);
  await page.locator('.hero h1').waitFor();
  // A lesson visited once works offline too: it runs and checks.
  await ctx.setOffline(false);
  await page.goto(BASE + firstPath);
  await lessonReady(page);
  await ctx.setOffline(true);
  await page.reload();
  await lessonReady(page);
  await fillBlanks(page, blankAnswers(FIRST.challenges[0]));
  const result = await check(page);
  expect(result.includes('All tests passed'), result);
  await ctx.close();
});

console.log('Accessibility and layout');
const lessonPath = (found) => `learn/${found.moduleId}/${found.step.slug}/`;
const PREDICT_STEP = findChallenge(({ ex, index }) => index === 0 && ex.kind === 'predict');
const PAGES = ['', 'learn/', `learn/${FIRST_MODULE.id}/`, firstPath, lessonPath(INPUT_CHALLENGE), lessonPath(PREDICT_STEP), lessonPath(CALL_CHALLENGE), lessonPath(FILES_CHALLENGE), 'playground/', 'deathmatch/', 'daily/', 'placement/', 'settings/', 'about/', 'transfer/', 'projects/', 'pro/', 'topics/', 'interview/', 'record/', 'learn/nowhere/'];
for (const colorScheme of ['light', 'dark']) {
  await test(`axe, ${colorScheme} theme: every page type`, async () => {
    const { ctx, page } = await newPage({ colorScheme });
    // Practice pages load their drills after the page appears: wait for them.
    const READY = { 'deathmatch/': '.lobby .rank-card', 'daily/': '.rep, .death', 'placement/': 'text=Start the quiz', 'record/': '.record-empty' };
    for (const p of PAGES) {
      await page.goto(BASE + p);
      await page.locator(READY[p] ?? '#main h1').first().waitFor();
      await axe(page, `${p || 'home'} ${colorScheme}`);
    }
    // The Playground with a program's output.
    await page.goto(BASE + 'playground/');
    await lessonReady(page);
    await check(page);
    await axe(page, `the Playground with output, ${colorScheme}`);
    await shot(page, `playground-desktop-${colorScheme}`);
    await ctx.close();
  });
}
await test('phone: a lesson asks before downloading, the symbol bar types into the editor', async () => {
  const found = findChallenge(({ ex, index }) => index === 0 && ex.kind === 'code' && !/# ==== /.test(ex.seed));
  const { ctx, page } = await phoneOn({ type: 'cellular', effectiveType: '4g', saveData: false });
  requests.length = 0;
  await page.goto(BASE + lessonPath(found));
  await page.getByText('Download Python?').waitFor();
  await page.waitForTimeout(1000);
  expect(engineRequests().length === 0, `requested before agreeing: ${engineRequests().join(', ')}`);
  await axe(page, 'lesson download question');
  await shot(page, 'lesson-phone-download-question');
  await page.getByRole('button', { name: /^Download now/ }).click();
  await lessonReady(page);
  // On a new last line, tap print: it types print() with the cursor inside the parentheses; then the quotes.
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'print, print with parentheses' }).tap();
  await page.getByRole('button', { name: 'double quotes' }).tap();
  await page.keyboard.insertText('typed on a phone');
  const code = await editorText(page);
  expect(code.includes('print("typed on a phone")'), code);
  await ctx.close();
});
await test('phone width 320 px: no page in the sitemap scrolls sideways', async () => {
  const { ctx, page } = await newPage({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((k) => localStorage.setItem(k, '1'), MOBILE_KEY);
  const xml = await (await fetch(BASE + 'sitemap.xml')).text();
  // The sitemap lists the live site's addresses; its first entry is the home page.
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const paths = locs.map((l) => l.slice(locs[0].length));
  expect(paths.length > 50, `only ${paths.length} pages in the sitemap`);
  const wide = [];
  for (const p of paths) {
    await page.goto(BASE + p);
    await page.locator('#main h1').first().waitFor();
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (w[0] > w[1]) wide.push(`${p || 'home'} (${w[0]} px)`);
  }
  expect(wide.length === 0, `wider than 320 px: ${wide.join(', ')}`);
  await ctx.close();
});

console.log('The other Arena sites');
// src/components/Arenas.tsx: a button in the header, a group in the phone menu and a row in the
// footer. Their links leave the site: they are checked, and the one the header test opens gets a stand-in page.
const SISTERS = ['https://cpparena.com/', 'https://javaarena.com/', 'https://rustarena.app/'];
/** The links of a part of the page: where each goes, and how it opens. */
const outsideLinks = (part) => part.locator('a').evaluateAll((as) => as.map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, text: a.textContent })));
function opensInNewTab(links, label) {
  expect(JSON.stringify(links.map((l) => l.href)) === JSON.stringify(SISTERS), `${label}: links to ${links.map((l) => l.href).join(', ')}`);
  for (const l of links) expect(l.target === '_blank' && l.rel.split(' ').includes('noopener') && l.text.endsWith(' (opens in a new tab)'), `${label}: ${JSON.stringify(l)} doesn't open in a new tab, or doesn't say so`);
}
await test('the other Arena sites: the header button lists all four, this one marked and the others linked in a new tab; axe passes with it open; a click on its text keeps it open; Escape, a click outside and a chosen site close it and give the focus back; with Larger text at 1360 px the header has no room for it, so it hides', async () => {
  const { ctx, page, errors } = await newPage({ viewport: { width: 1360, height: 900 } });
  await ctx.route(/^https:\/\/(cpparena\.com|javaarena\.com|rustarena\.app)\//, (r) => r.fulfill({ contentType: 'text/html', body: '<title>Arena</title>' }));
  await page.goto(BASE + 'learn/');
  await page.locator('.module-live').first().waitFor();
  const button = page.getByRole('button', { name: 'Other Arena sites' });
  expect(await button.isVisible(), 'the header has the button');
  expect((await button.getAttribute('aria-expanded')) === 'false', 'the button starts closed');
  await button.click();
  const list = page.locator('.arena-pop');
  await list.waitFor();
  expect((await button.getAttribute('aria-expanded')) === 'true', 'the button says it is open');
  const names = await list.locator('.arena-name').allInnerTexts();
  expect(names.join(', ') === 'C/C++ Arena, Java Arena, RustArena, Python Arena', `listed: ${names.join(', ')}`);
  const here = list.locator('li').nth(3);
  expect((await here.innerText()).includes("You're here") && (await here.locator('a').count()) === 0, "Python Arena says You're here and isn't a link");
  opensInNewTab(await outsideLinks(list), 'the header list');
  await axe(page, 'the Arena list open');
  await shot(page, 'arenas-header');
  for (const part of ['.arena-pop-title', '.arena-here']) {
    await list.locator(part).click();
    expect((await button.getAttribute('aria-expanded')) === 'true' && (await list.isVisible()), `a click on ${part} keeps the list open`);
  }
  await page.keyboard.press('Escape');
  await list.waitFor({ state: 'hidden' });
  expect(await button.evaluate((b) => b === document.activeElement), 'Escape gives the focus back to the button');
  await button.click();
  await list.waitFor();
  await page.locator('#main h1').click();
  await list.waitFor({ state: 'hidden' });
  expect((await button.getAttribute('aria-expanded')) === 'false', 'a click outside closes the list');
  await button.click();
  const [tab] = await Promise.all([ctx.waitForEvent('page'), list.locator('a').first().click()]);
  await tab.close();
  await list.waitFor({ state: 'hidden' });
  expect(await button.evaluate((b) => b === document.activeElement), 'choosing a site gives the focus back to the button');
  // The header's room follows Settings > Text size: with Larger text the navigation needs it all at 1360 px,
  // so the button hides instead of pushing the page sideways.
  const scale = await page.evaluate(() => document.documentElement.style.getPropertyValue('--scale'));
  await page.evaluate(() => document.documentElement.style.setProperty('--scale', '1.25'));
  try {
    expect(!(await button.isVisible()), 'with Larger text at 1360 px the button still shows in a header with no room for it');
    await noOverflow(page, 'the header at 1360 px, Larger text');
  } finally {
    await page.evaluate((v) => document.documentElement.style.setProperty('--scale', v), scale);
  }
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});
await test('the other Arena sites on a short tablet screen at the largest text size: opening the list closes the menu, and the list scrolls within the screen', async () => {
  // 768 px: with the largest text and the widest engine pill, a narrower header has no room for the button.
  const { ctx, page, errors } = await newPage({ viewport: { width: 768, height: 360 } });
  await startWith(ctx, { version: 1, settings: { textScale: 1.4 } });
  await page.goto(BASE + 'learn/');
  await page.locator('.module-live').first().waitFor();
  await page.click('button[aria-label="Open menu"]');
  await page.locator('#main-nav.nav-open').waitFor();
  const button = page.getByRole('button', { name: 'Other Arena sites' });
  await button.click();
  const list = page.locator('.arena-pop');
  await list.waitFor();
  expect((await page.locator('#main-nav.nav-open').count()) === 0, 'opening the Arena list closes the menu');
  // Tab to the list's last link.
  for (let i = 0; i < SISTERS.length; i++) await page.keyboard.press('Tab');
  const fit = await list.evaluate((l) => {
    const box = l.getBoundingClientRect();
    const link = document.activeElement.getBoundingClientRect();
    return { focused: l.contains(document.activeElement), bottom: box.bottom, link: [link.top, link.bottom], box: [box.top, box.bottom], height: innerHeight };
  });
  expect(fit.focused && fit.bottom <= fit.height && fit.link[0] >= fit.box[0] && fit.link[1] <= fit.box[1], `the list or its last link runs off the screen: ${JSON.stringify(fit)}`);
  await noOverflow(page, 'the header at 768 px, largest text');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});
await test('the other Arena sites: the footer row has all four, the other three linked in a new tab; the pre-rendered footer has the same row', async () => {
  const { ctx, page } = await newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(BASE + 'about/');
  await page.locator('#main h1').waitFor();
  const row = page.locator('footer .arena-family');
  expect((await row.locator('h2').innerText()) === 'Arena sites', 'the row is headed Arena sites');
  expect((await row.locator('li').count()) === 4, 'four Arenas in the row');
  expect((await row.locator('li').nth(3).innerText()).includes("You're here"), "Python Arena says You're here");
  opensInNewTab(await outsideLinks(row), 'the footer row');
  // The page as scripts/prerender.mjs wrote it (JavaScript off): the same row, less what the app adds to
  // its outside links and the marks' generated gradient ids, and as tall, so the footer doesn't move
  // when the app starts.
  const still = await newPage({ viewport: { width: 1360, height: 900 }, javaScriptEnabled: false });
  await still.page.goto(BASE + 'about/');
  const rowOf = async (p) => {
    const part = p.locator('footer .arena-family');
    const html = (await part.evaluate((e) => e.outerHTML))
      .replace(/ target="_blank"| rel="noopener noreferrer"|<span class="visually-hidden"> \(opens in a new tab\)<\/span>/g, '')
      .replace(/(id="|url\(#)[^")]+/g, '$1ID');
    return { html, height: await part.evaluate((e) => e.getBoundingClientRect().height) };
  };
  for (const width of [1360, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await still.page.setViewportSize({ width, height: 900 });
    const [app, pre] = [await rowOf(page), await rowOf(still.page)];
    const at = [...pre.html, ''].findIndex((c, i) => c !== (app.html[i] ?? ''));
    expect(pre.html === app.html, `the pre-rendered row isn't the app's, from character ${at}:\n  pre-rendered: ${pre.html.slice(Math.max(at - 40, 0), at + 80)}\n  app:          ${app.html.slice(Math.max(at - 40, 0), at + 80)}`);
    expect(pre.height === app.height, `at ${width} px the pre-rendered row is ${pre.height} px tall, the app's ${app.height} px`);
  }
  await still.ctx.close();
  await ctx.close();
});
await test('the other Arena sites on a phone: no header button; the menu lists the other three under "Other Arena sites", with a line before the Theme row; the focus moves through them with the menu open; nothing scrolls sideways', async () => {
  const { ctx, page, errors } = await newPage({ ...PHONE });
  await page.goto(BASE + 'learn/');
  await page.locator('.module-live').first().waitFor();
  expect(!(await page.getByRole('button', { name: 'Other Arena sites' }).isVisible()), 'no header button on a phone');
  await page.click('button[aria-label="Open menu"]');
  const group = page.locator('#main-nav .nav-arenas');
  await group.getByText('Other Arena sites').waitFor();
  opensInNewTab(await outsideLinks(group), 'the phone menu');
  // The Theme row after the group gets its own dividing line, so it doesn't read as part of the group.
  expect((await page.locator('#main-nav .nav-arenas + .nav-theme').evaluate((t) => getComputedStyle(t).borderTopStyle)) === 'solid', 'a line between the menu\'s Arena sites and its Theme row');
  for (let i = 0; i < 10 && !(await group.evaluate((g) => g.contains(document.activeElement))); i++) await page.keyboard.press('Tab');
  expect(await group.locator('a').first().evaluate((a) => a === document.activeElement), 'Tab reaches the first Arena link');
  expect((await page.locator('#main-nav.nav-open').count()) === 1, 'the menu stays open while the focus is on the Arena links');
  await noOverflow(page, 'the phone menu');
  await axe(page, 'the phone menu with the Arena sites');
  await shot(page, 'arenas-phone-menu');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

console.log('Topics A to Z');

await test('Topics A to Z: pre-rendered with every entry, in the sitemap and saved for offline use; Learn, Deathmatch and the footer link to it', async () => {
  const html = await (await fetch(BASE + 'topics/')).text();
  expect(TOPICS.length >= 150 && TOPICS.length <= 400, `${TOPICS.length} topics`);
  expect((html.match(/<li id="[^"]+" class="topic">/g) ?? []).length === TOPICS.length, 'every topic is in the pre-rendered page');
  for (const t of TOPICS) expect(html.includes(`<li id="${t.id}" class="topic">`), `the pre-rendered page has #${t.id}`);
  expect(html.includes('docs.python.org/3/library/'), "the page points to Python's library reference");
  const sitemap = await (await fetch(BASE + 'sitemap.xml')).text();
  const sw = await (await fetch(BASE + 'sw.js')).text();
  expect(sitemap.includes('/topics/</loc>') && sw.includes('"topics/"'), 'topics/ is in the sitemap and saved for offline use');
  const { ctx, page, errors } = await phoneWith(progress());
  for (const [path, where] of [['learn/', '#main'], ['deathmatch/', '#main'], ['about/', 'footer']]) {
    await page.goto(BASE + path);
    await page.locator('#main h1').first().waitFor();
    expect((await page.locator(`${where} a[href$="/topics/"]`).count()) === 1, `${path}: one link to the topics in ${where}`);
  }
  expect(errors.length === 0, errors.join('; '));
  await ctx.close();
});

await test('Topics A to Z: the things the Learn page offers to look up are topics of the reference', async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + 'learn/');
  await page.locator('.module-live').first().waitFor();
  const card = page.locator('section.learn-projects', { has: page.locator('h2', { hasText: 'Topics A to Z' }) });
  const offered = await card.locator('code').allTextContents();
  const known = (w) => TOPICS.some((t) => [t.term, ...(t.aliases ?? [])].some((x) => x.toLowerCase() === w.toLowerCase()));
  expect(offered.length > 0 && offered.every(known), `the Learn page offers to look up ${offered.map((w) => (known(w) ? w : `${w} (not a topic: Java's, not Python's)`)).join(', ')}: ${await card.innerText()}`);
  await ctx.close();
});

await test('Topics A to Z: the search filters as you type and says how many match, a link opens the step that teaches it, an address with #term opens at that entry; axe in both themes at 320 and 390 px', async () => {
  const { ctx, page, errors } = await phoneWith(progress());
  await page.goto(BASE + 'topics/');
  await page.locator('#main h1', { hasText: 'Topics A to Z' }).waitFor();
  const box = page.getByLabel('Search the topics');
  const status = page.locator('#topics-count[role="status"]');
  expect((await status.innerText()) === `${TOPICS.length} topics`, await status.innerText());
  await phonesBothThemes(page, 'the topics page');
  await shot(page, 'topics');
  // Typing filters at once; the count under the box is a polite live region.
  await box.pressSequentially('dicti');
  await page.waitForFunction((n) => document.querySelectorAll('#main .topic').length < n, TOPICS.length);
  const first = await page.locator('#main .topic').first().getAttribute('id');
  expect(first === 'dict', `the first result for "dicti" is #${first}`);
  expect(/^\d+ of \d+ topics match "dicti"\.$/.test(await status.innerText()), await status.innerText());
  await box.fill('zzzz');
  await page.locator('#topics-count', { hasText: 'No topics match "zzzz".' }).waitFor();
  expect((await page.locator('#main .topic').count()) === 0, 'nothing matches zzzz');
  await box.fill('');
  await page.locator('.topics-letters').waitFor();
  expect((await page.locator('#main .topic').count()) === TOPICS.length, 'clearing the box shows every topic again');
  // Several words: every one must start a word of the entry.
  await box.fill('base case');
  await page.waitForFunction(() => document.querySelector('#main .topic')?.id === 'base-case');
  await phonesBothThemes(page, 'the topics page with a search');
  // The entry's first link opens the step that teaches it.
  const recursion = TOPICS.find((t) => t.id === 'recursion');
  await box.fill('recursion');
  await page.waitForFunction(() => document.querySelector('#main .topic')?.id === 'recursion');
  await page.locator('#recursion .topic-links a').first().click();
  await page.waitForURL(`**/learn/${recursion.steps[0].module}/${recursion.steps[0].slug}/`);
  await page.locator('#main h1', { hasText: recursion.steps[0].title }).waitFor();
  // Back brings the same search and the same filtered list: the search is kept in the address (?q=).
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('#main .topic')?.id === 'recursion');
  expect((await box.inputValue()) === 'recursion', `after Back the box says ${JSON.stringify(await box.inputValue())}`);
  expect(new URL(page.url()).searchParams.get('q') === 'recursion', page.url());
  expect((await page.locator('#main .topic').count()) < 10, 'the list is still filtered');
  expect(/of \d+ topics match "recursion"/.test(await status.innerText()), await status.innerText());
  // An entry's drills link marks that topic in Deathmatch, without changing the learner's chosen topics.
  const drilled = TOPICS.find((t) => t.id === 'recursion' && t.drills) ?? TOPICS.find((t) => t.drills);
  await box.fill(drilled.term);
  await page.locator(`#${drilled.id} .topic-links a`, { hasText: 'Drills in Deathmatch' }).waitFor();
  const offBefore = (await saved(page))?.settings?.topicsOff ?? [];
  await page.locator(`#${drilled.id} .topic-links a`, { hasText: 'Drills in Deathmatch' }).click();
  await page.waitForURL(`**/deathmatch/?topic=${drilled.drills.topic}`);
  await page.locator(`#dm-topic-${drilled.drills.topic}.chip-target`).waitFor();
  expect((await page.locator('.dm-topic-note').innerText()).includes(drilled.drills.title), await page.locator('.dm-topic-note').innerText());
  expect(JSON.stringify((await saved(page))?.settings?.topicsOff ?? []) === JSON.stringify(offBefore), 'following the link leaves the chosen topics as they were');
  await phonesBothThemes(page, 'Deathmatch with a topic marked');
  // Keyboard: the box is reached with Tab from the page's start, after the header and the breadcrumb.
  await page.goto(BASE + 'topics/');
  await page.locator('#main h1', { hasText: 'Topics A to Z' }).waitFor();
  let reached = false;
  for (let i = 0; i < 25 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.id === 'topics-q');
  }
  expect(reached, 'Tab reaches the search box');
  await page.keyboard.type('lambda');
  await page.waitForFunction(() => document.querySelector('#main .topic')?.id === 'lambda');
  // An address with an entry's id opens at that entry.
  await page.goto(BASE + 'topics/#f-string');
  await page.locator('#f-string').waitFor();
  await page.waitForFunction(() => {
    const r = document.getElementById('f-string').getBoundingClientRect();
    return r.top >= 0 && r.top < innerHeight / 2;
  });
  expect(errors.length === 0, errors.join('; '));
  await ctx.close();
});

await test('Topics A to Z: what is typed in the search box before the app starts stays, with the focus and the caret, and filters the list', async () => {
  const { ctx, page, errors } = await newPage();
  const appStarted = () => page.evaluate(() => Object.keys(document.getElementById('root') ?? {}).some((k) => k.startsWith('__reactContainer')));
  // The app's scripts come only when the test lets them.
  let release;
  const held = new Promise((r) => (release = r));
  await page.route('**/assets/*.js', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(BASE + 'topics/', { waitUntil: 'commit' });
  const box = page.locator('#topics-q');
  await box.waitFor();
  await box.click();
  await page.keyboard.type('dicti');
  await page.keyboard.press('ArrowLeft');
  expect(!(await appStarted()), 'the app had not started yet');
  release();
  await page.waitForFunction(() => Object.keys(document.getElementById('root')).some((k) => k.startsWith('__reactContainer')) && document.querySelectorAll('#main li.topic').length < 30);
  const now = await page.evaluate(() => ({ value: document.getElementById('topics-q').value, focused: document.activeElement?.id, caret: document.activeElement?.selectionStart }));
  expect(now.value === 'dicti', `the box still says ${JSON.stringify(now.value)}`);
  expect(now.focused === 'topics-q', `the focus is on #${now.focused}`);
  expect(now.caret === 4, `the caret is at ${now.caret}`);
  expect((await page.locator('#main li.topic').count()) < TOPICS.length, 'the list is filtered');
  expect((await page.locator('#main li.topic').first().getAttribute('id')) === 'dict', 'dict first');
  // Typing goes on in the app's box.
  await page.keyboard.press('End');
  await page.keyboard.type('onary');
  await page.locator('#topics-count', { hasText: '"dictionary"' }).waitFor();
  expect(errors.length === 0, errors.join('; '));
  await ctx.close();
});

console.log('Interview prep');
await test("Interview prep: pre-rendered with its sections, tables and links, in the sitemap and saved for offline use; the home page, the footer, the course page's group and Deathmatch link to it", async () => {
  const html = await (await fetch(BASE + 'interview/')).text();
  const group = GROUPS.find((g) => g.id === INTERVIEW.modules.group);
  for (const h of [group.title, 'Interview questions in Deathmatch', 'Which technique fits?', "What Python's operations cost", 'Working through a problem', "Python's tools for interview problems", 'Places to practice']) expect(html.includes(`>${esc(h)}</h2>`), `the pre-rendered page has the section ${h}`);
  // A header row and a row for each technique and each operation.
  expect((html.match(/<tr role="row">/g) ?? []).length === 2 + INTERVIEW.patterns.rows.length + INTERVIEW.costs.rows.length, 'the two tables, row by row');
  for (const r of INTERVIEW.patterns.rows) expect(html.includes(`href="${BASE_PATH}learn/${r.step.module}/${r.step.slug}/"`), `the pre-rendered page links to the step ${r.step.id}`);
  for (const x of [...INTERVIEW.practice.sites, ...INTERVIEW.tools.modules]) expect(html.includes(`href="${x.url}"`), `the pre-rendered page links to ${x.url}`);
  for (const set of COURSE_INDEX.interviewSets) expect(html.includes(esc(set.title)) && html.includes(`${set.drills} questions`), `the pre-rendered page names the drill set ${set.id}`);
  expect(html.includes(`href="${BASE_PATH}deathmatch/?mode=interview"`), 'the pre-rendered page starts interview prep in Deathmatch');
  expect((html.match(/<li class="module module-(live|planned)">/g) ?? []).length === EXTRAS.filter((m) => m.group === group.id).length, "the pre-rendered page lists the group's modules");
  const sitemap = await (await fetch(BASE + 'sitemap.xml')).text();
  const sw = await (await fetch(BASE + 'sw.js')).text();
  expect(sitemap.includes('/interview/</loc>') && sw.includes('"interview/"'), 'interview/ is in the sitemap and saved for offline use');
  // The links to it: a feature card on the home page, the footer, the group's section of the course page, the Deathmatch lobby.
  const { ctx, page, errors } = await newPage();
  for (const [path, where, ready] of [['', '#main .features', '.hero h1'], ['about/', 'footer', '#main h1'], ['learn/', `#group-${group.id}`, '.module-live'], ['deathmatch/', '#main .page-head', '.lobby .rank-card']]) {
    await page.goto(BASE + path);
    await page.locator(ready).first().waitFor();
    expect((await page.locator(`${where} a[href$="/interview/"]`).count()) === 1, `${path || 'home'}: one link to the interview prep page in ${where}`);
  }
  expect((await page.locator('header a[href$="/interview/"]').count()) === 0, 'the header navigation stays as it is');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

await test('Interview prep: the page shows the modules with this browser\'s progress, the drill sets and the tables; its links resolve and open in the app; its button starts interview prep in Deathmatch; axe in both themes', async () => {
  const group = GROUPS.find((g) => g.id === INTERVIEW.modules.group);
  const groupModules = COURSE_INDEX.modules.filter((m) => m.group === group.id);
  // One module of the group finished, when one is written.
  const st = progress(groupModules.length ? { steps: finished([groupModules[0].id]) } : {});
  const { ctx, page, errors } = await newPage();
  await startWith(ctx, st);
  await page.goto(BASE + 'interview/');
  await page.locator('.interview-page a.btn svg').waitFor();
  const main = page.locator('#main');
  expect((await main.locator('.iv-modules li.module').count()) === EXTRAS.filter((m) => m.group === group.id).length, "the group's modules");
  expect((await main.locator('.iv-modules li.module-live').count()) === groupModules.length, 'its written modules are links');
  if (groupModules.length) {
    expect((await main.locator('.iv-modules li.module-done').count()) === 1, 'the finished module is marked');
    expect((await main.innerText()).includes(`You finished 1 of the ${EXTRAS.filter((m) => m.group === group.id).length} modules in this browser.`), 'the page counts the finished modules');
  }
  const sets = await main.locator('.iv-sets li').allInnerTexts();
  expect(sets.length === COURSE_INDEX.interviewSets.length && COURSE_INDEX.interviewSets.every((x, i) => sets[i].includes(x.title) && sets[i].includes(`${x.drills} questions`)), `the drill sets: ${sets.join(' / ')}`);
  expect((await main.locator('.iv-table tbody tr').count()) === INTERVIEW.patterns.rows.length + INTERVIEW.costs.rows.length, 'the tables');
  // Every link to the site's pages resolves; the tools' documentation and the places to practice open in a new tab, and say so.
  const links = await main.locator('a[href]').evaluateAll((as) => as.map((a) => a.href));
  for (const href of links.filter((h) => h.startsWith(BASE))) expect((await fetch(href)).status === 200, `${href} doesn't resolve`);
  // (A tool's text can also link to the step that teaches it: that link stays in the site.)
  const away = (await main.locator('.iv-tools a, .iv-sites a').evaluateAll((as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel, text: a.textContent })))).filter((l) => !l.href.startsWith(BASE));
  expect(away.length === INTERVIEW.tools.modules.length + INTERVIEW.practice.sites.length, `${away.length} links to other sites`);
  for (const l of away) expect(l.target === '_blank' && l.rel.includes('noopener') && l.text.endsWith('(opens in a new tab)'), `${JSON.stringify(l)} doesn't open in a new tab, or doesn't say so`);
  await bothThemes(page, 'the interview prep page');
  // A technique's step opens in the app.
  const row = INTERVIEW.patterns.rows[0];
  await page.evaluate(() => (window.__samePage = true));
  await main.locator('.iv-table a', { hasText: row.step.title }).first().click();
  await page.waitForURL(`**/learn/${row.step.module}/${row.step.slug}/`);
  await page.locator('#main h1', { hasText: row.step.title }).waitFor();
  expect(await page.evaluate(() => window.__samePage === true), 'the step was loaded as a new page');
  // The button: Deathmatch in its interview prep mode, at once, with the address back to the lobby's.
  await page.goBack();
  await page.locator('.interview-page a.btn svg').waitFor();
  await page.click('text=Start interview prep in Deathmatch');
  await page.locator('.hud-mode', { hasText: 'Interview prep' }).waitFor();
  await page.locator('.rep').waitFor();
  expect(new URL(page.url()).search === '', `the address keeps ${new URL(page.url()).search}`);
  const d = drillById.get(await page.locator('.rep').getAttribute('data-drill'));
  expect(d?.topic === 'interview', `the first rep is ${d?.topic}`);
  await page.click('text=Leave');
  await page.locator('.lobby .rank-card').waitFor();
  // The address opened directly does the same.
  await page.goto(BASE + 'deathmatch/?mode=interview');
  await page.locator('.hud-mode', { hasText: 'Interview prep' }).waitFor();
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

/** The values of a fill-in's blanks that make it `code` (a slow solution fills the same blanks). */
function blanksOf(template, code) {
  const { parts } = parseTemplate(template);
  const re = new RegExp(`^${parts.map(reEsc).join('([^\\n]*?)')}$`);
  return re.exec(code)?.slice(1) ?? null;
}
// A big test (big: true) is sized so that a correct but slow solution runs out of time; the build keeps
// each such challenge's slow solution in src/generated/ (not in the files the page loads) for this test.
const BIG_CHALLENGE = findChallenge(({ ex }) => ex.kind !== 'predict' && ex.slow && ex.tests.some((t) => t.big));
await test('a big test: a slow solution passes the other tests and gets the note that it is too slow for a big input (not that a loop never ends), with big tests marked big; the big tests after it don\'t run; the model solution passes', async () => {
  if (!BIG_CHALLENGE) return void console.log('       (no lesson has a big test yet: this is checked once one does)');
  const { ex } = BIG_CHALLENGE;
  const { ctx, page, errors } = await newPage();
  await openChallenge(page, BIG_CHALLENGE);
  const card = await page.locator('.task-card').innerText();
  if (ex.tests.some((t) => t.big && t.hidden)) expect(/big tests?: a way that is too slow runs out of time/.test(card), `the task card doesn't mention the big tests: ${card}`);
  if (ex.kind === 'fill') await fillBlanks(page, blanksOf(ex.seed, ex.slow));
  else await setProgram(page, ex.slow);
  const t0 = Date.now();
  const out = await check(page);
  const ms = Date.now() - t0;
  expect(out.includes('Too slow for a big input: your program ran for more than 10 seconds') && out.includes('40 billion times') && !out.includes('never ends'), out);
  expect(ms >= 9_500 && ms < 60_000, `the check took ${ms} ms`);
  // The build only promises that the slow way runs out of time on one big test: a big test before that
  // one may pass, and the big tests after it don't run.
  const small = ex.tests.filter((t) => !t.big).length;
  const bigCount = ex.tests.filter((t) => t.big).length;
  const failedBig = await page.locator('.tests .t-fail .big-tag').count();
  const passed = await page.locator('.tests .t-pass').count();
  expect((await page.locator('.tests .big-tag').count()) === bigCount, 'every big test is marked big');
  expect(failedBig >= 1 && passed === small + bigCount - failedBig, `${passed} tests passed and ${failedBig} big tests failed, of ${small} small and ${bigCount} big`);
  if (failedBig > 1) expect(out.includes('Not run: a test before it already ran out of time, and this big one would too.'), out);
  await axe(page, 'a big test that ran out of time');
  if (ex.kind === 'fill') await fillBlanks(page, blankAnswers(ex));
  else await setProgram(page, ex.solution);
  expect((await check(page)).includes('All tests passed'), 'the model solution passes');
  expect(errors.length === 0, errors.join('\n'));
  await ctx.close();
});

for (const width of [360, 390]) {
  await test(`phone width ${width} px: no sideways scrolling, axe passes`, async () => {
    const { ctx, page } = await newPage({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, colorScheme: width === 360 ? 'dark' : 'light' });
    await ctx.addInitScript((k) => localStorage.setItem(k, '1'), MOBILE_KEY);
    for (const p of ['', 'learn/', `learn/${FIRST_MODULE.id}/`, lessonPath(CALL_CHALLENGE), lessonPath(FILES_CHALLENGE), 'playground/', 'about/']) {
      await page.goto(BASE + p);
      await page.locator('#main h1').first().waitFor();
      await noOverflow(page, `${p || 'home'} ${width}`);
      await axe(page, `${p || 'home'} ${width}`);
      await shot(page, `phone-${width}-${p.replace(/\//g, '_') || 'home'}`);
    }
    // The course list gives module titles the room they need (no empty column beside them).
    await page.goto(BASE + 'learn/');
    await page.locator('.module-live').first().waitFor();
    const titleWidth = await page.locator('.module-live .module-title').nth(2).evaluate((e) => e.getBoundingClientRect().width);
    expect(titleWidth > width * 0.45, `module title only ${Math.round(titleWidth)} px wide`);
    await page.goto(BASE + firstPath);
    await lessonReady(page);
    await page.fill('input.blank >> nth=0', 'prnt');
    await check(page);
    await noOverflow(page, `lesson ${width}`);
    await axe(page, `lesson ${width}`);
    await shot(page, `lesson-phone-${width}`);
    // From the top of the page: a link scrolled half out of the window under the sticky header's own
    // links is the header's, whether the menu is open or not, and moves on as the page scrolls. The
    // menu's own edges are checked below, wherever the page is scrolled.
    await page.evaluate(() => scrollTo(0, 0));
    await page.click('button[aria-label="Open menu"]');
    await axe(page, `menu open ${width}`);
    // Wherever the page is scrolled, a page link half under the open menu's top or bottom edge keeps 24 px to
    // tap: the menu's links stay 24 px from its edges (below the header's own buttons at the top).
    const bands = await page.evaluate(() => {
      const nav = document.getElementById('main-nav');
      const boxes = (els) => els.filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect());
      const controls = [...document.querySelectorAll('header.topbar a, header.topbar button, header.topbar input')];
      const inMenu = boxes(controls.filter((e) => nav.contains(e)));
      const inHeader = boxes(controls.filter((e) => !nav.contains(e)));
      return { top: Math.min(...inMenu.map((r) => r.top)) - Math.max(...inHeader.map((r) => r.bottom)), bottom: nav.getBoundingClientRect().bottom - Math.max(...inMenu.map((r) => r.bottom)) };
    });
    expect(bands.top >= 24 && bands.bottom >= 24, `the open menu leaves ${bands.top.toFixed(1)} px above its first link and ${bands.bottom.toFixed(1)} px below its last`);
    // The Playground with a crash and its traceback.
    await page.goto(BASE + 'playground/');
    await lessonReady(page);
    await setCode(page, 'scores = {"Ada": 3}\nprint(scores["Grace Brewster Murray Hopper, who wrote the first compiler"])\n');
    await check(page);
    await noOverflow(page, `the Playground with a crash at ${width}`);
    await axe(page, `the Playground with a crash at ${width}`);
    await shot(page, `playground-phone-${width}`);
    await ctx.close();
  });
}

console.log('The accessibility and phone pass');
// Every page type at 320, 360, 390 and 412 px in both themes: axe (WCAG 2.2 AA, which includes its
// target-size rule), no sideways scrolling, every tap target at least 24 x 24 CSS px or spaced as
// WCAG 2.2's 2.5.8 allows, and a visible focus on everything the Tab key reaches.
const PASS_WIDTHS = [320, 360, 390, 412];

/**
 * Tap targets smaller than 24 x 24 CSS px. A link inside a sentence is excused (WCAG 2.2, 2.5.8), and
 * so is any other inline link whose 24 px circle on its center touches no other target (the spacing
 * exception); every other control must be 24 x 24 px itself, or with a ::after that widens where it
 * takes taps (the step dots). Hidden targets and the code editor's own parts are left out.
 */
async function smallTargets(page) {
  return page.evaluate(() => {
    const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=radio], [role=slider], [role=switch], [role=menuitem], [role=option]';
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
      if (el.closest('details:not([open])') && !el.closest('summary')) return false;
      return true;
    };
    const inSentence = (el) => {
      if (getComputedStyle(el).display !== 'inline') return false;
      const block = el.closest('p, li, dd, td, th, figcaption, blockquote, small, label');
      if (!block) return false;
      return (block.textContent ?? '').replace(el.textContent ?? '', '').replace(/[\s·|,]/g, '').length > 0;
    };
    /** The box that takes taps: the element's, or its ::after's when that is absolutely placed around it. */
    const tapBox = (el) => {
      const r = el.getBoundingClientRect();
      const a = getComputedStyle(el, '::after');
      if (a.content === 'none' || a.position !== 'absolute') return r;
      const px = (v) => (v.endsWith('px') ? parseFloat(v) : 0);
      const left = r.left + Math.min(0, px(a.left));
      const top = r.top + Math.min(0, px(a.top));
      const right = r.right - Math.min(0, px(a.right));
      const bottom = r.bottom - Math.min(0, px(a.bottom));
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const all = [...document.querySelectorAll(SEL)].filter((el) => visible(el) && !el.closest('.cm-editor, [inert], [aria-hidden=true]'));
    const rects = all.map(tapBox);
    const describe = (el, r) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`;
    const out = [];
    all.forEach((el, i) => {
      const r = rects[i];
      if (r.width >= 23.5 && r.height >= 23.5) return;
      if (inSentence(el)) return;
      // A checkbox or radio button whose label is 24 px or more: the label takes the taps too.
      const label = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
      if (label && el.matches('input[type=checkbox], input[type=radio]')) {
        const lr = label.getBoundingClientRect();
        if (lr.width >= 24 && lr.height >= 24) return;
      }
      if (getComputedStyle(el).display !== 'inline') return out.push(describe(el, r));
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const clash = all.some((other, j) => {
        if (j === i || other.contains(el) || el.contains(other)) return false;
        const o = rects[j];
        if (o.width < 23.5 || o.height < 23.5) return Math.hypot(cx - (o.left + o.width / 2), cy - (o.top + o.height / 2)) < 24;
        return Math.hypot(Math.max(o.left - cx, 0, cx - o.right), Math.max(o.top - cy, 0, cy - o.bottom)) < 12;
      });
      if (clash) out.push(describe(el, r));
    });
    return out;
  });
}

/** Tabs through the first `max` stops of the page: each must show a focus indicator (an outline, or a box shadow or border it didn't have). */
async function focusShows(page, label, max = 30) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  // Start from the top of the page: a click on its body would land on whatever is there.
  await page.keyboard.press('Tab');
  const bad = [];
  const seen = new Set();
  for (let i = 0; i < max; i++) {
    const r = await page.evaluate(async () => {
      // (CodeMirror moves its cm-focused class a moment after the focus event: wait for it.)
      const tick = () => new Promise((done) => setTimeout(done, 60));
      await tick();
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const key = el.tagName + '|' + (el.id || '') + '|' + (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40) + '|' + Math.round(el.getBoundingClientRect().top + scrollY);
      const look = (e) => {
        const cs = getComputedStyle(e);
        return { outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` : '', shadow: cs.boxShadow, border: cs.borderColor + cs.borderWidth, bg: cs.backgroundColor };
      };
      // The focus may be shown on a wrapper (a CodeMirror editor, a tab list): look up to two levels.
      const looks = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean).map(look);
      const name = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`;
      // What it looks like without the focus: blur, measure, focus again (focus-visible stays on after keyboard use).
      const before = looks;
      el.blur();
      await tick();
      const after = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean).map(look);
      el.focus({ preventScroll: true });
      await tick();
      const shown = before.some((b, k) => b.outline || b.shadow !== after[k].shadow || b.border !== after[k].border);
      return { key, name, shown };
    });
    if (!r) break;
    if (seen.has(r.key)) break;
    seen.add(r.key);
    if (!r.shown) bad.push(r.name);
    await page.keyboard.press('Tab');
  }
  expect(bad.length === 0, `${label}: no visible focus on ${bad.join(', ')}`);
  return seen.size;
}

/** The whole pass on the page as it is now: every width, both themes. */
async function phonePass(page, label, { focus = true } = {}) {
  const problems = [];
  for (const width of PASS_WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      await page.waitForFunction((t) => document.documentElement.dataset.theme === t, colorScheme);
      const where = `${label} at ${width} px, ${colorScheme}`;
      for (const step of [() => noOverflow(page, where), () => axe(page, where)]) {
        try {
          await step();
        } catch (e) {
          problems.push(e.message);
        }
      }
      const small = await smallTargets(page);
      if (small.length) problems.push(`${where}: tap targets under 24 x 24 px: ${small.join('; ')}`);
    }
  }
  if (focus) {
    try {
      await focusShows(page, label);
    } catch (e) {
      problems.push(e.message);
    }
  }
  expect(problems.length === 0, problems.join('\n'));
}

/** Opens a page in a phone browser with this saved progress and waits for what only the app draws. */
async function passPage(st, path, ready, extra = {}) {
  const r = await phoneWith(st, extra);
  await r.ctx.addInitScript((k) => localStorage.setItem(k, '1'), MOBILE_KEY);
  await r.page.goto(BASE + path);
  await ready(r.page);
  return r;
}
const appDrew = (sel) => (page) => page.locator(sel).first().waitFor({ timeout: ENGINE_TIMEOUT });
const passSteps = finished(COURSE_INDEX.plan.filter((m) => m.course === 'I' && m.part === 1).map((m) => m.id));
const passProject = COURSE_INDEX.projects?.[0];
const passState = () => progress({ steps: passSteps, projects: passProject ? { [passProject.id]: { done: true, doneAt: T, milestones: {} } } : {} });
const CODE_STEP = findChallenge(({ ex, index }) => index === 0 && ex.kind === 'code' && !/# ==== /.test(ex.seed));
const PASS_PAGES = [
  ['home', '', appDrew('#main h1')],
  ['Learn', 'learn/', appDrew('.module-live')],
  ['a module', `learn/${FIRST_MODULE.id}/`, appDrew('#main h1')],
  ['a lesson: a fill-in challenge', firstPath, lessonReady],
  ['a lesson: a code challenge', lessonPath(CODE_STEP), lessonReady],
  ['a lesson: "What does it print?"', lessonPath(PREDICT_STEP), appDrew('.predict-lines')],
  ['a lesson: a function to write', lessonPath(CALL_CHALLENGE), lessonReady],
  ['a lesson: a program of several files', lessonPath(FILES_CHALLENGE), lessonReady],
  ['a lesson: a file to read', lessonPath(READ_CHALLENGE), lessonReady],
  ...(SHOT_STEP ? [['a lesson: a pygame window example', `learn/${SHOT_STEP.moduleId}/${SHOT_STEP.step.slug}/`, lessonReady]] : []),
  ...(WINDOW_CHALLENGE ? [['a lesson: a window challenge', lessonPath(WINDOW_CHALLENGE), lessonReady]] : []),
  ['Deathmatch', 'deathmatch/', appDrew('.lobby .rank-card')],
  ['the daily challenge', 'daily/', appDrew('.rep, .death')],
  ['placement', 'placement/', appDrew('text=Start the quiz')],
  ['the Playground', 'playground/', lessonReady],
  ['projects', 'projects/', appDrew('#main h1')],
  ['transfer', 'transfer/', appDrew('#main h1')],
  ['record', 'record/', appDrew('.record-sheet')],
  ['Settings', 'settings/', appDrew('#main h1')],
  ['About', 'about/', appDrew('#main h1')],
  ['topics', 'topics/', appDrew('#topics-q')],
  // The app's button has an icon, which the pre-rendered page's doesn't.
  ['interview prep', 'interview/', appDrew('.interview-page a.btn svg')],
  ['the Pro Track', 'pro/', appDrew('#main h1')],
  ['page not found', 'learn/nowhere/', appDrew('#main h1')],
];
if (PRO[0]) PASS_PAGES.push([`a Pro Track project`, `pro/${PRO[0].id}/`, appDrew('#main h1')]);
if (passProject) PASS_PAGES.push(['a project', `projects/${passProject.id}/`, appDrew('.milestones')]);

for (const [name, path, ready] of PASS_PAGES) {
  await test(`the phone pass: ${name} (${path || 'home'}) at 320, 360, 390 and 412 px in both themes: axe, no sideways scrolling, tap targets of 24 px, a visible focus`, async () => {
    const { ctx, page, errors } = await passPage(passState(), path, ready);
    await phonePass(page, name);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/pass-${(path || 'home').replace(/\//g, '_')}.png`, fullPage: true });
    expect(errors.filter((e) => !e.includes('404')).length === 0, errors.join('; '));
    await ctx.close();
  });
}

await test('the phone pass: a project milestone, a lesson with results, the Playground with output and with a pygame window, a Deathmatch rep of each type and the review, a placement question, the topics with a search, the record with nothing finished', async () => {
  const problems = [];
  const pass = async (page, label, opts) => {
    try {
      await phonePass(page, label, opts);
    } catch (e) {
      problems.push(e.message);
    }
  };
  // A project's milestone, open.
  if (passProject) {
    const { ctx, page } = await passPage(progress(), `projects/${passProject.id}/`, appDrew('.milestones'));
    await openMilestone(page, 0);
    await lessonReady(page);
    await pass(page, 'a project milestone');
    await ctx.close();
  }
  // A lesson with a failed check: the comparison of a test, its note and what Python printed.
  {
    const { ctx, page } = await passPage(progress(), lessonPath(INPUT_CHALLENGE), lessonReady);
    await openChallenge(page, INPUT_CHALLENGE);
    await setCode(page, 'word = input("Word: ")\nprint(word[100])\n');
    await check(page);
    await page.locator('details.stderr summary').first().click();
    await pass(page, 'a lesson with a failed check');
    await ctx.close();
  }
  // The Playground with output, then with a pygame window, paused.
  {
    const { ctx, page } = await passPage(progress(), 'playground/', lessonReady);
    await check(page);
    await pass(page, 'the Playground with output');
    await page.setViewportSize(PHONE.viewport);
    await setCode(page, PG_MOVER);
    await page.click('#check');
    const panel = page.locator('.pg-panel');
    await panel.waitFor();
    await panelReaches(panel, { frames: 60, shown: 10 }, ENGINE_TIMEOUT);
    await panel.getByRole('button', { name: 'Pause' }).click();
    await panel.locator('details.pg-astext summary').click();
    await pass(page, 'the Playground with a pygame window');
    await ctx.close();
  }
  // Deathmatch: a rep of each type (Casual, every topic open), then the review after a miss.
  {
    const { ctx, page } = await passPage(practiceState({ settings: { unlockAll: true, boss: true, mobileData: true } }), 'deathmatch/', appDrew('.lobby .modes'));
    await seedRandom(ctx);
    await page.reload();
    await page.locator('.lobby .modes').waitFor();
    await pass(page, 'the Deathmatch lobby', { focus: false });
    await page.locator('.mode:has(.mode-name:text-is("Casual"))').click();
    const types = new Set();
    for (let i = 0; i < 40 && types.size < 6; i++) {
      await page.locator('.rep').waitFor();
      const id = await page.locator('.rep').getAttribute('data-drill');
      const type = drillById.get(id)?.type;
      if (type && !types.has(type)) {
        types.add(type);
        if (type === 'boss') await lessonReady(page);
        await pass(page, `a Deathmatch rep (${type})`, { focus: type !== 'boss' });
        await page.setViewportSize(PHONE.viewport);
      }
      await answerRep(page, true);
      await page.waitForFunction((n) => document.querySelector('.hud-n')?.textContent === String(n), i + 1, { timeout: 120_000 });
    }
    await page.locator('.rep').waitFor();
    await answerRep(page, false);
    await page.locator('.death').waitFor();
    await pass(page, 'a Deathmatch review');
    if (types.size < 5) problems.push(`only these rep types came up: ${[...types]}`);
    await ctx.close();
  }
  // A placement question.
  {
    const { ctx, page } = await passPage(progress(), 'placement/', appDrew('text=Start the quiz'));
    await page.click('text=Start the quiz');
    await page.locator('.rep').waitFor();
    await pass(page, 'a placement question');
    await ctx.close();
  }
  // The topics reference with a search typed.
  {
    const { ctx, page } = await passPage(progress(), 'topics/', appDrew('#topics-q'));
    await page.getByLabel('Search the topics').fill('list');
    await page.waitForFunction((n) => document.querySelectorAll('#main .topic').length < n, TOPICS.length);
    await pass(page, 'the topics with a search');
    await ctx.close();
  }
  // The record page with nothing finished.
  {
    const { ctx, page } = await passPage(progress(), 'record/', appDrew('#main h1'));
    await pass(page, 'the record with nothing finished', { focus: false });
    await ctx.close();
  }
  expect(problems.length === 0, problems.join('\n'));
});

await browser.close();
server.close();
console.log(`\nThe tests took ${((Date.now() - started) / 60_000).toFixed(1)} min.`);
console.log(failures ? `${failures} failed` : 'All passed');
process.exit(failures ? 1 : 0);
