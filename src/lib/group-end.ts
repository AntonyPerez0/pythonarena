// What the last module of a group of extra modules says comes next (its "After <group>" card), shared by
// the page (src/pages/ModulePage.tsx) and the pre-rendered page (scripts/prerender.mjs).
import { INTERVIEW_TITLE } from "./interview.ts";

/** A piece of the sentence: text, or a link to one of the site's pages (from its root, such as /pro/). */
export type NextPart = string | { to: string; text: string };

/** What comes after a group's last module: Interview prep for the group that page lists (`interviewGroup`), and the Pro Track. */
export function groupNextParts(group: string, interviewGroup: string | null): NextPart[] {
  return [
    "Next, you can ",
    ...(group === interviewGroup ? ["practice for coding interviews with ", { to: "/interview/", text: INTERVIEW_TITLE }, ", or "] : []),
    "try the Pro Track: projects for your own computer with Python and pytest. ",
    { to: "/pro/", text: "See the Pro Track" },
  ];
}
