// Checks of Markdown text the site shows outside the lessons: a group's `about` in content/course.yaml
// and the text of content/interview.yaml. Like lesson text, it's plain Markdown (nothing Markdown would
// read as HTML), with no en or em dashes. Its links to the site's own pages start with / (the page puts
// the site's base path in front) and must name a page the site has; other links go to a host on the
// list in scripts/check-links.mjs.
import { externalProblem, markdownLinks } from "../check-links.mjs";

/** True when Markdown text has something that looks like an HTML tag or comment outside code. */
export const htmlLike = (text) => /<[a-zA-Z!\/?]/.test(String(text).replace(/```[\s\S]*?```/g, "").replace(/(`+)[\s\S]*?\1/g, ""));

/** The site's pages that don't depend on the content (src/App.tsx's routes). */
export const FIXED_PAGES = ["/", "/learn/", "/projects/", "/pro/", "/topics/", "/interview/", "/playground/", "/deathmatch/", "/daily/", "/placement/", "/settings/", "/about/", "/record/"];

/**
 * The addresses of the site's pages, as links in the text write them: the fixed pages, each written
 * module and its steps, and each project.
 */
export function sitePages({ modules = [], projects = [] } = {}) {
  const pages = new Set(FIXED_PAGES);
  for (const m of modules) {
    pages.add(`/learn/${m.id}/`);
    for (const s of m.steps ?? []) pages.add(`/learn/${m.id}/${s.slug}/`);
  }
  for (const p of projects) pages.add(`/projects/${p.id}/`);
  return pages;
}

/** The problems of one piece of Markdown text (empty when it's fine). `pages` is sitePages()'s set. */
export function textProblems(text, pages) {
  if (typeof text !== "string") return ["must be text (quote it: a \": \" inside makes YAML read it as a key and value)"];
  const problems = [];
  if (htmlLike(text)) problems.push("has text that Markdown reads as HTML; put code, and anything with <, in backticks");
  if (/[\u2013\u2014]/.test(text)) problems.push("has a dash (an en or em dash); write it with a comma, a colon, parentheses or two sentences");
  if ((text.replace(/```[\s\S]*?```/g, "").match(/`/g) ?? []).length % 2) problems.push("has an unclosed ` (inline code)");
  for (const href of markdownLinks(text)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
      const p = externalProblem(href);
      if (p) problems.push(`links to ${p}`);
    } else if (!href.startsWith("/")) problems.push(`links to ${href}: a link to one of the site's pages starts with /, such as /topics/`);
    else {
      const path = href.replace(/[?#].*$/, "");
      if (!pages.has(path)) problems.push(`links to ${href}, which isn't a page of the site${pages.has(`${path}/`) ? ` (add the / at the end: ${path}/)` : " (a module or step that isn't written yet has no page)"}`);
    }
  }
  return problems;
}
