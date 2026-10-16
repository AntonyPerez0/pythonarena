// Tests of the groups of extra modules in content/course.yaml (scripts/content/groups.mjs) and of the
// check of their text and the interview page's (scripts/content/site-text.mjs). Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { checkGroups } from "./content/groups.mjs";
import { sitePages, textProblems } from "./content/site-text.mjs";
import { groupNextParts } from "../src/lib/group-end.ts";

const group = (over = {}) => ({ id: "dsa", title: "Data structures and algorithms", about: "Python Arena's own modules.", ...over });
const course = (modules, groups = [group()]) => ({ groups, modules });
const mooc = (id) => ({ id, course: "II", part: 12 });
const extra = (id, g = "dsa") => ({ id, course: "extra", ...(g ? { group: g } : {}) });

test("extra modules in a known group pass, and the groups come in the order of their modules", () => {
  const { groups, errors } = checkGroups(course([mooc("regex"), extra("dsa-hash"), extra("dsa-dp"), extra("web-a", "web")], [group({ id: "web", title: "The web" }), group()]));
  assert.deepEqual(errors, []);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["dsa", "web"],
  );
  assert.equal(groups[0].title, "Data structures and algorithms");
});

test("every extra module names a group on the list, and only extra modules have one", () => {
  assert.match(checkGroups(course([extra("dsa-hash", null)])).errors.join("\n"), /dsa-hash: an extra module needs a group/);
  // The group's own entry has no modules then, which is said too.
  const unknown = checkGroups(course([extra("dsa-hash", "algorithms")])).errors;
  assert.ok(unknown.some((e) => /there's no group algorithms in groups \(there is dsa\)/.test(e)), unknown.join("\n"));
  assert.ok(unknown.some((e) => /the group dsa has no modules/.test(e)), unknown.join("\n"));
  assert.match(checkGroups(course([{ ...mooc("regex"), group: "dsa" }, extra("dsa-hash")])).errors.join("\n"), /regex: only extra modules \(course: extra\) belong to a group/);
});

test("a group's modules come one after another; a group has an id, a title and about, and nothing else", () => {
  assert.match(checkGroups(course([extra("a"), extra("b", "web"), extra("c")], [group(), group({ id: "web" })])).errors.join("\n"), /module c: the modules of the group dsa must come one after another/);
  // A module with no group, or one not on the list, is said once: the modules around it are still together.
  assert.deepEqual(checkGroups(course([extra("a"), extra("b", null), extra("c")])).errors, ["content/course.yaml module b: an extra module needs a group (group: <id>, one of the groups at the top of the file)"]);
  assert.deepEqual(checkGroups(course([extra("a"), extra("b", "dsx"), extra("c")])).errors, ["content/course.yaml module b: there's no group dsx in groups (there is dsa)"]);
  // A MOOC module between them parts them.
  assert.match(checkGroups(course([extra("a"), mooc("regex"), extra("c")])).errors.join("\n"), /module c: the modules of the group dsa must come one after another/);
  assert.match(checkGroups(course([extra("a")], [group(), group()])).errors.join("\n"), /the group dsa is on the list twice/);
  assert.match(checkGroups(course([extra("a")], [group({ id: "Data Structures" })])).errors.join("\n"), /needs an id in kebab-case/);
  assert.match(checkGroups(course([extra("a")], [group({ title: "" })])).errors.join("\n"), /needs a title/);
  assert.match(checkGroups(course([extra("a")], [group({ about: "  " })])).errors.join("\n"), /needs about/);
  assert.match(checkGroups(course([extra("a")], [group({ color: "blue" })])).errors.join("\n"), /unknown key color/);
  assert.match(checkGroups({ groups: { dsa: {} }, modules: [] }).errors.join("\n"), /groups must be a list/);
});

test("a course without extra modules needs no groups", () => {
  assert.deepEqual(checkGroups({ modules: [mooc("regex")] }), { groups: [], errors: [] });
});

test("site text: links to the site's pages start with / and name a page it has; other links go to allowed hosts", () => {
  const pages = sitePages({ modules: [{ id: "lists", steps: [{ slug: "sorting" }] }], projects: [{ id: "calculator" }] });
  assert.deepEqual(textProblems("See [Interview prep](/interview/), [sorting](/learn/lists/sorting/), [the project](/projects/calculator/) and [Deathmatch](/deathmatch/?mode=interview).", pages), []);
  assert.deepEqual(textProblems("See [the table](https://wiki.python.org/moin/TimeComplexity).", pages), []);
  assert.match(textProblems("See [hash tables](/learn/dsa-hash/).", pages).join(), /isn't a page of the site \(a module or step that isn't written yet has no page\)/);
  assert.match(textProblems("See [it](/interview).", pages).join(), /add the \/ at the end: \/interview\//);
  assert.match(textProblems("See [it](interview/).", pages).join(), /starts with \//);
  assert.match(textProblems("See [it](https://example.com/).", pages).join(), /a host not on the list/);
});

test("site text: no HTML, no en or em dashes, no unclosed inline code", () => {
  const pages = sitePages();
  assert.deepEqual(textProblems("Use `<` and `heapq` freely.", pages), []);
  assert.match(textProblems("A <b>bold</b> word.", pages).join(), /Markdown reads as HTML/);
  assert.match(textProblems("Fast \u2014 really.", pages).join(), /dash/);
  assert.match(textProblems("A `deque is quick.", pages).join(), /unclosed `/);
  assert.match(textProblems(["a", "list"], pages).join(), /must be text/);
});

test("a group's last module says what comes next: Interview prep for that page's group, and the Pro Track for every group", () => {
  const said = (parts) => parts.map((p) => (typeof p === "string" ? p : `[${p.text}](${p.to})`)).join("");
  assert.equal(said(groupNextParts("dsa", "dsa")), "Next, you can practice for coding interviews with [Interview prep](/interview/), or try the Pro Track: projects for your own computer with Python and pytest. [See the Pro Track](/pro/)");
  // Another group, or no interview page: only the Pro Track, with no "or" left over.
  for (const interviewGroup of ["dsa", null]) assert.equal(said(groupNextParts("web", interviewGroup)), "Next, you can try the Pro Track: projects for your own computer with Python and pytest. [See the Pro Track](/pro/)");
});
