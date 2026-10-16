// Links to the site's own pages in Markdown text outside the lessons (a group's about in
// content/course.yaml, content/interview.yaml): the text writes them from the site's root, such as
// /interview/, and the content build checks that each names a page (scripts/content/site-text.mjs).
// The page and the pre-rendered page (scripts/prerender.mjs) put the site's base path in front.

/** HTML made from such Markdown, with the site's base path (which ends with /) in front of its links to the site's pages. */
export function withBase(html: string, base: string): string {
  return html.replace(/(<a\s[^>]*?href=")\/(?!\/)/g, `$1${base}`);
}

/**
 * Where a click on a link goes inside the app (its address after the base path, from /), or null when
 * the browser should follow it itself: a link elsewhere, one opening a new tab, or a click with a key held.
 */
export function inAppTarget(e: { target: EventTarget | null; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }, base: string): string | null {
  const a = e.target instanceof Element ? e.target.closest("a") : null;
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute("download")) return null;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith(base)) return null;
  return url.pathname.slice(base.length - 1) + url.search + url.hash;
}
