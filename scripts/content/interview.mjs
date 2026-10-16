// The interview prep page (/interview/): content/interview.yaml, checked by the content build
// (scripts/build-content.mjs) and written to src/generated/interview.json for the page and the
// pre-rendered page.
//
// Its text is checked as site text (site-text.mjs): Markdown without HTML, no en or em dashes, links
// that go to pages the site has or to allowed hosts. Every step the techniques table names must exist.
// The modules it lists come from the course plan (the group `modules.group` names), and the drill sets
// from content/drills/interview-*.yaml, so neither is repeated here.
//
//   intro       Markdown: the page's opening
//   modules     group: the id of the group of extra modules to list, with the learner's progress; lead
//   drills      lead: Markdown above the interview drill sets and the button that starts them
//   patterns    lead, and rows: { signal, technique, step }: what a problem says, the technique that
//               fits, and the id of the step that teaches it
//   costs       lead, rows: { operation, cost, note }, and after: Markdown under the table
//   checklist   lead, and items: the steps of working through a problem in an interview, in order
//   tools       lead, and modules: { name, about }: a module of Python's standard library (its page in
//               Python's documentation is linked)
//   practice    lead, and sites: { name, url, about }: places to practice (url on an allowed host)
//
// Every `lead` is optional Markdown shown under the section's heading.
import { externalProblem } from "../check-links.mjs";
import { textProblems } from "./site-text.mjs";

const WHERE = "content/interview.yaml";

/** The sections of the page and the keys of each. */
const SECTIONS = {
  modules: ["lead", "group"],
  drills: ["lead"],
  patterns: ["lead", "rows"],
  costs: ["lead", "rows", "after"],
  checklist: ["lead", "items"],
  tools: ["lead", "modules"],
  practice: ["lead", "sites"],
};
const ROW_KEYS = { patterns: ["signal", "technique", "step"], costs: ["operation", "cost", "note"], tools: ["name", "about"], practice: ["name", "url", "about"] };

/** A module of Python's standard library: its page in Python's documentation. */
export const docsUrl = (name) => `https://docs.python.org/3/library/${name}.html`;

const isMap = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * Checks content/interview.yaml (as parsed). `steps` maps each step id to { step, module } (the built
 * step and its module, with its number and title); `groups` are the course's groups of extra modules;
 * `pages` is site-text.mjs's sitePages(). Returns the page as src/generated/interview.json holds it,
 * the names of the standard library modules it names (the build checks that Python has them), and the
 * problems found.
 */
export function checkInterview(raw, { steps, groups, pages }) {
  const errors = [];
  const text = (where, value, { required = true, oneLine = false } = {}) => {
    if (value == null || value === "") {
      if (required) errors.push(`${where}: needs text`);
      return "";
    }
    for (const p of textProblems(value, pages)) errors.push(`${where}: ${p}`);
    if (typeof value !== "string") return "";
    if (oneLine && /\n/.test(value.trim())) errors.push(`${where}: must be one line`);
    return value.trim();
  };
  if (!isMap(raw)) return { page: null, modules: [], errors: [`${WHERE}: must be a set of keys: intro, ${Object.keys(SECTIONS).join(", ")}`] };
  for (const k of Object.keys(raw)) if (k !== "intro" && !SECTIONS[k]) errors.push(`${WHERE}: unknown key ${k} (the page has intro, ${Object.keys(SECTIONS).join(", ")})`);
  const section = (key) => {
    const s = raw[key];
    if (!isMap(s)) {
      errors.push(`${WHERE}: needs ${key}, a set of keys: ${SECTIONS[key].join(", ")}`);
      return {};
    }
    for (const k of Object.keys(s)) if (!SECTIONS[key].includes(k)) errors.push(`${WHERE} ${key}: unknown key ${k} (it has ${SECTIONS[key].join(", ")})`);
    return s;
  };
  const rows = (key, list, listName) => {
    if (!Array.isArray(list) || !list.length) {
      errors.push(`${WHERE} ${key}: needs ${listName}, a list of at least one`);
      return [];
    }
    return list.map((r, i) => {
      const at = `${WHERE} ${key} ${listName} ${i + 1}`;
      if (ROW_KEYS[key] && !isMap(r)) {
        errors.push(`${at}: must be a set of keys: ${ROW_KEYS[key].join(", ")}`);
        return null;
      }
      if (ROW_KEYS[key]) for (const k of Object.keys(r)) if (!ROW_KEYS[key].includes(k)) errors.push(`${at}: unknown key ${k} (it has ${ROW_KEYS[key].join(", ")})`);
      return { at, r };
    });
  };

  const intro = text(`${WHERE} intro`, raw.intro);

  const m = section("modules");
  const group = typeof m.group === "string" ? m.group : "";
  if (!groups.some((g) => g.id === group)) errors.push(`${WHERE} modules: group must name a group of extra modules in content/course.yaml (${groups.map((g) => g.id).join(", ") || "there are none"})`);
  const modules = { lead: text(`${WHERE} modules lead`, m.lead, { required: false }), group };

  const d = section("drills");
  const drills = { lead: text(`${WHERE} drills lead`, d.lead, { required: false }) };

  const p = section("patterns");
  const patterns = {
    lead: text(`${WHERE} patterns lead`, p.lead, { required: false }),
    rows: rows("patterns", p.rows, "rows")
      .filter(Boolean)
      .flatMap(({ at, r }) => {
        const signal = text(`${at} signal`, r.signal, { oneLine: true });
        const technique = text(`${at} technique`, r.technique, { oneLine: true });
        const found = typeof r.step === "string" ? steps.get(r.step) : null;
        if (!found) {
          errors.push(`${at}: step must be the id of a written step (the step that teaches the technique), not ${JSON.stringify(r.step)}`);
          return [];
        }
        const step = { id: r.step, module: found.module.id, moduleTitle: found.module.title, number: found.module.number, slug: found.step.slug, title: found.step.title };
        return [{ signal, technique, step }];
      }),
  };

  const c = section("costs");
  const costs = {
    lead: text(`${WHERE} costs lead`, c.lead, { required: false }),
    rows: rows("costs", c.rows, "rows")
      .filter(Boolean)
      .map(({ at, r }) => ({ operation: text(`${at} operation`, r.operation, { oneLine: true }), cost: text(`${at} cost`, r.cost, { oneLine: true }), note: text(`${at} note`, r.note, { required: false }) })),
    after: text(`${WHERE} costs after`, c.after, { required: false }),
  };

  const k = section("checklist");
  const checklist = { lead: text(`${WHERE} checklist lead`, k.lead, { required: false }), items: rows("checklist", k.items, "items").map(({ at, r }) => text(at, r)) };

  const t = section("tools");
  const names = [];
  const tools = {
    lead: text(`${WHERE} tools lead`, t.lead, { required: false }),
    modules: rows("tools", t.modules, "modules")
      .filter(Boolean)
      .map(({ at, r }) => {
        const name = typeof r.name === "string" ? r.name.trim() : "";
        if (!/^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*$/.test(name)) errors.push(`${at}: name must be the name of a module of Python's standard library, such as collections`);
        else if (names.includes(name)) errors.push(`${at}: the module ${name} is on the list twice`);
        else names.push(name);
        return { name, url: docsUrl(name), about: text(`${at} about`, r.about) };
      }),
  };

  const s = section("practice");
  const practice = {
    lead: text(`${WHERE} practice lead`, s.lead, { required: false }),
    sites: rows("practice", s.sites, "sites")
      .filter(Boolean)
      .map(({ at, r }) => {
        const url = typeof r.url === "string" ? r.url.trim() : "";
        const problem = url ? externalProblem(url) : "needs a url";
        if (problem) errors.push(`${at}: url: ${problem}`);
        return { name: text(`${at} name`, r.name, { oneLine: true }), url, about: text(`${at} about`, r.about) };
      }),
  };

  return { page: { intro, modules, drills, patterns, costs, checklist, tools, practice }, modules: names, errors };
}
