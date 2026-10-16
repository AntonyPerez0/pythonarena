// Tests of the check of content/interview.yaml, the interview prep page's text (scripts/content/interview.mjs),
// and of content/interview.yaml itself as the build reads it. Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { checkInterview, docsUrl } from "./content/interview.mjs";
import { sitePages } from "./content/site-text.mjs";

const module = { id: "dictionaries", number: 21, title: "Dictionaries", steps: [{ id: "dictionaries-counting", slug: "counting", title: "Counting and grouping" }] };
const steps = new Map(module.steps.map((s) => [s.id, { step: s, module }]));
const groups = [{ id: "dsa", title: "Data structures and algorithms", about: "..." }];
const pages = sitePages({ modules: [module] });
const check = (raw) => checkInterview(raw, { steps, groups, pages });

const good = () => ({
  intro: "Get ready for a coding interview. See [Deathmatch](/deathmatch/).",
  modules: { group: "dsa", lead: "The modules." },
  drills: { lead: "Quick questions." },
  patterns: { lead: "Signals.", rows: [{ signal: "How often does each value appear?", technique: "A dict of counts", step: "dictionaries-counting" }] },
  costs: { rows: [{ operation: "`x in a` (list)", cost: "O(n)", note: "One by one." }], after: "See [the wiki](https://wiki.python.org/moin/TimeComplexity)." },
  checklist: { items: ["Say the problem back.", "Test it."] },
  tools: { modules: [{ name: "collections", about: "`Counter` counts." }] },
  practice: { sites: [{ name: "LeetCode", url: "https://leetcode.com/", about: "Problems." }] },
});

test("a good page passes, with each technique's step as a link needs it and each tool's documentation", () => {
  const { page, modules, errors } = check(good());
  assert.deepEqual(errors, []);
  assert.deepEqual(page.patterns.rows[0].step, { id: "dictionaries-counting", module: "dictionaries", moduleTitle: "Dictionaries", number: 21, slug: "counting", title: "Counting and grouping" });
  assert.equal(page.tools.modules[0].url, "https://docs.python.org/3/library/collections.html");
  assert.deepEqual(modules, ["collections"]);
  assert.equal(page.costs.lead, "");
});

test("a technique's step must exist, and the modules' group must be a group of extra modules", () => {
  const raw = good();
  raw.patterns.rows.push({ signal: "Shortest path", technique: "Breadth-first search", step: "dsa-graphs-bfs" });
  raw.modules.group = "algorithms";
  const { errors } = check(raw);
  assert.ok(errors.some((e) => /patterns rows 2: step must be the id of a written step .*"dsa-graphs-bfs"/.test(e)), errors.join("\n"));
  assert.ok(errors.some((e) => /modules: group must name a group of extra modules in content\/course.yaml \(dsa\)/.test(e)), errors.join("\n"));
});

test("text is checked like lesson text: no HTML, no dashes, links to pages the site has and to allowed hosts", () => {
  const raw = good();
  raw.intro = "Ready <b>now</b>? See [hash tables](/learn/dsa-hash/).";
  raw.checklist.items.push("Think \u2014 then code.");
  raw.practice.sites.push({ name: "Somewhere", url: "https://example.com/", about: "Puzzles." });
  raw.costs.rows[0].cost = "O(1)\nor O(n)";
  const { errors } = check(raw);
  for (const want of [/intro: has text that Markdown reads as HTML/, /intro: links to \/learn\/dsa-hash\/, which isn't a page of the site/, /checklist items 3: has a dash/, /practice sites 2: url: a host not on the list/, /costs rows 1 cost: must be one line/])
    assert.ok(errors.some((e) => want.test(e)), `${want} in:\n${errors.join("\n")}`);
});

test("every section is there with its own keys, and its lists have something in them", () => {
  const raw = good();
  delete raw.tools;
  raw.costs.rows = [];
  raw.extra = "x";
  raw.patterns.rows[0].level = "easy";
  raw.tools2 = 1;
  const { errors } = check(raw);
  for (const want of [/needs tools/, /costs: needs rows, a list of at least one/, /unknown key extra/, /patterns rows 1: unknown key level/]) assert.ok(errors.some((e) => want.test(e)), `${want} in:\n${errors.join("\n")}`);
  assert.match(check(good()).errors.join(), /^$/);
  const names = good();
  names.tools.modules.push({ name: "Collections!", about: "x" }, { name: "collections", about: "y" });
  assert.match(check(names).errors.join("\n"), /tools modules 2: name must be the name of a module.*\n.*tools modules 3: the module collections is on the list twice/);
});

/** The written modules' pages, from content/modules/*.yaml as the build names them (a step's slug, or its title made into one). */
function writtenModules() {
  const dir = new URL("../content/modules/", import.meta.url);
  const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => YAML.parse(fs.readFileSync(new URL(f, dir), "utf8")))
    .map((m) => ({ id: m.id, steps: (m.steps ?? []).map((s) => ({ slug: s.slug ?? slugify(s.title ?? "") })) }));
}

test("content/interview.yaml has the shape the check asks for, and the tools of Python's library the page names", () => {
  // The real file, with every step it names standing in as written (the content build checks the real
  // steps), and links to the lessons the course really has.
  const raw = YAML.parse(fs.readFileSync(new URL("../content/interview.yaml", import.meta.url), "utf8"));
  const named = new Map(raw.patterns.rows.map((r) => [r.step, { step: { slug: r.step, title: r.step }, module: { id: "m", number: 1, title: "M" } }]));
  const { errors, modules } = checkInterview(raw, { steps: named, groups, pages: sitePages({ modules: writtenModules() }) });
  assert.deepEqual(errors, []);
  assert.deepEqual(modules, ["collections", "heapq", "bisect", "functools", "itertools", "math"]);
  assert.equal(docsUrl("heapq"), "https://docs.python.org/3/library/heapq.html");
});
