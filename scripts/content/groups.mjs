// Groups of extra modules (content/course.yaml), checked by the content build (scripts/build-content.mjs).
//
// An extra module (course: extra) is Python Arena's own, after the MOOC. Each one belongs to a group:
// the top-level `groups:` list names them (id, title, and `about`, Markdown shown under the group's
// heading on the course page), and each extra module says `group: <id>`. The course page shows one
// section per group, in the order their modules come. The check: every extra module names a group on
// the list, only extra modules have one, a group's modules come one after another, and every group on
// the list has modules. (Its `about` is checked as site text once the modules are built, see
// site-text.mjs.)

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const GROUP_KEYS = ["id", "title", "about"];

/**
 * Checks the groups of a parsed course.yaml. Returns the groups in the order their modules come
 * ({ id, title, about }) and the problems found (as messages).
 */
export function checkGroups(course) {
  const errors = [];
  const where = "content/course.yaml";
  const raw = course?.groups ?? [];
  const groups = new Map();
  if (!Array.isArray(raw)) errors.push(`${where}: groups must be a list of groups, each with id, title and about`);
  else
    raw.forEach((g, i) => {
      const at = `${where} group ${i + 1}${typeof g?.id === "string" ? ` (${g.id})` : ""}`;
      if (!g || typeof g !== "object" || Array.isArray(g)) return void errors.push(`${at}: a group is a set of keys: id, title and about`);
      for (const k of Object.keys(g)) if (!GROUP_KEYS.includes(k)) errors.push(`${at}: unknown key ${k} (a group has ${GROUP_KEYS.join(", ")})`);
      if (typeof g.id !== "string" || !KEBAB.test(g.id)) return void errors.push(`${at}: needs an id in kebab-case`);
      if (groups.has(g.id)) return void errors.push(`${at}: the group ${g.id} is on the list twice`);
      if (typeof g.title !== "string" || !g.title.trim() || /\n/.test(g.title.trim())) errors.push(`${at}: needs a title, one line of text`);
      if (typeof g.about !== "string" || !g.about.trim()) errors.push(`${at}: needs about, Markdown that says what the group's modules are`);
      groups.set(g.id, { id: g.id, title: String(g.title ?? "").trim(), about: String(g.about ?? "").trim() });
    });
  const modules = Array.isArray(course?.modules) ? course.modules : [];
  const order = [];
  // The group of the last module with a known group (null after a MOOC module). An extra module whose
  // group is missing or unknown is said once, and skipped here, so the module after it isn't blamed.
  let last = null;
  for (const m of modules) {
    const at = `${where} module ${m?.id}`;
    if (m?.course !== "extra") {
      if (m?.group != null) errors.push(`${at}: only extra modules (course: extra) belong to a group; the MOOC's modules are grouped by part`);
      last = null;
      continue;
    }
    if (m.group == null) {
      errors.push(`${at}: an extra module needs a group (group: <id>, one of the groups at the top of the file)`);
      continue;
    }
    if (!groups.has(m.group)) {
      errors.push(`${at}: there's no group ${m.group} in groups (there ${groups.size === 1 ? "is" : "are"} ${[...groups.keys()].join(", ") || "none"})`);
      continue;
    }
    if (order.includes(m.group) && last !== m.group) errors.push(`${at}: the modules of the group ${m.group} must come one after another`);
    if (!order.includes(m.group)) order.push(m.group);
    last = m.group;
  }
  for (const id of groups.keys()) if (!order.includes(id)) errors.push(`${where}: the group ${id} has no modules`);
  return { groups: order.map((id) => groups.get(id)), errors };
}
