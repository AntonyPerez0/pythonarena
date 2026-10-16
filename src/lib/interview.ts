// The interview prep page (/interview/): the words that aren't content (its headings and its tables'
// columns), shared by the page (src/pages/Interview.tsx) and the pre-rendered page (scripts/prerender.mjs).
// The text itself is content/interview.yaml.

/** Where the page's button goes: Deathmatch, starting its interview prep mode. */
export const INTERVIEW_START = "/deathmatch/?mode=interview";

/** The page's title (its heading, and its name in links to it). */
export const INTERVIEW_TITLE = "Interview prep";

/** Each section's heading (the modules' section is headed by their group's title). */
export const INTERVIEW_HEADINGS = {
  drills: "Interview questions in Deathmatch",
  patterns: "Which technique fits?",
  costs: "What Python's operations cost",
  checklist: "Working through a problem",
  tools: "Python's tools for interview problems",
  practice: "Places to practice",
} as const;

/** The columns of the two tables. */
export const PATTERN_COLUMNS = ["The problem asks", "A technique that fits", "Where to learn it"] as const;
export const COST_COLUMNS = ["Operation", "Time", "Notes"] as const;

/** "12 questions", "1 question". */
export const questions = (n: number) => `${n} ${n === 1 ? "question" : "questions"}`;
