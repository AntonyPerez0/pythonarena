// Pure helpers shared by the browser grader and the Node content build (scripts/build-content.mjs).

/** Blanks in fill-in templates look like [[answer]] or [[answer‖alt1‖alt2]] (U+2016 separates accepted alternatives). */
export const BLANK_RE = /\[\[(?!\[)(.*?)\]\]/g;

/** Split a fill template into text parts and blank answers. */
export function parseTemplate(template) {
  const parts = [];
  const blanks = [];
  let last = 0;
  for (const m of template.matchAll(BLANK_RE)) {
    parts.push(template.slice(last, m.index));
    const alts = m[1].split("‖");
    blanks.push({ answer: alts[0], accept: alts });
    last = m.index + m[0].length;
  }
  parts.push(template.slice(last));
  return { parts, blanks };
}

/** Rebuild source from a template and the learner's blank values. */
export function fillTemplate(template, values) {
  const { parts } = parseTemplate(template);
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) out += (values[i - 1] ?? "") + parts[i];
  return out;
}

/** The reference solution of a fill template (the first alternative of each blank). */
export function templateSolution(template) {
  const { blanks } = parseTemplate(template);
  return fillTemplate(template, blanks.map((b) => b.answer));
}

/** Whether a typed blank matches one of its accepted answers (spaces don't matter). */
export function blankMatches(blank, value) {
  const squash = (s) => s.replace(/\s+/g, "");
  return blank.accept.some((a) => squash(a) === squash(value ?? ""));
}

/**
 * Normalise program output for comparison: unify line endings, drop spaces at line ends and
 * blank lines at the very end. Everything else (capitals, spaces inside lines) must match.
 */
export function normalizeOutput(s) {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * Python source with comments removed and every string literal emptied (plain, raw, byte and
 * f-strings, single or triple quoted), so require/forbid rules only look at code. Line breaks are
 * kept, so line numbers stay the same.
 */
export function stripForRules(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
      out += " ";
      continue;
    }
    // A string's prefix (r, b, f, u, rb, fr...) belongs to the string, not to a name before it.
    const prefix = /^[rRbBuUfFtT]{0,2}(?=['"])/.exec(src.slice(i, i + 3));
    const prev = out[out.length - 1] ?? "";
    if ((c === '"' || c === "'" || (prefix && prefix[0])) && !(prefix && prefix[0] && /[\w]/.test(prev))) {
      const start = i + (prefix ? prefix[0].length : 0);
      const q = src[start];
      if (q === '"' || q === "'") {
        const triple = src.startsWith(q + q + q, start);
        const close = triple ? q + q + q : q;
        let j = start + close.length;
        while (j < n && !src.startsWith(close, j) && (triple || src[j] !== "\n")) j += src[j] === "\\" ? 2 : 1;
        const stop = Math.min(n, src.startsWith(close, j) ? j + close.length : j);
        out += q + q + src.slice(i, stop).replace(/[^\n]/g, "");
        i = stop;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Checks require/forbid rules. A rule is { pattern, flags?, message, min?, max?, raw? }: a require
 * rule needs at least one match (or between min and max matches when either is given); a forbid
 * rule needs none. Patterns see the code without comments and with empty strings, unless `raw` is
 * set (for rules about comments or string contents). Returns the messages of the rules that fail.
 */
export function checkRules(src, require = [], forbid = []) {
  const code = stripForRules(src);
  const count = (r) => [...(r.raw ? src : code).matchAll(new RegExp(r.pattern, "g" + (r.flags ?? "").replace("g", "")))].length;
  const problems = [];
  for (const r of require) {
    const k = count(r);
    const ok = r.min == null && r.max == null ? k > 0 : k >= (r.min ?? 0) && k <= (r.max ?? Infinity);
    if (!ok) problems.push(r.message);
  }
  for (const r of forbid) if (count(r) > 0) problems.push(r.message);
  return problems;
}

