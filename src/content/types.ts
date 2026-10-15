// The shape of src/generated/course.json, src/generated/modules/<id>.json and the lesson files in
// public/lessons (made by scripts/build-content.mjs).
import type { WindowEvent } from "../engine/types";

/**
 * One test: the program's input (stdin), or `call`, the test's own Python code, which runs after
 * the program is loaded as a module (so code under `if __name__ == "__main__":` doesn't run) and
 * whose output is what's graded. `files` are files in the program's folder it can read; `writes`
 * are files it must leave there, with their text as the reference solution wrote them (compared
 * like output). `args` are the program's command-line arguments (sys.argv after its name).
 */
export type TestCase = {
  name: string;
  stdin: string;
  args?: string[];
  call?: string;
  files?: Record<string, string>;
  writes?: Record<string, string>;
  expect: string;
  hidden?: boolean;
  /** A call test whose call's last line gives a value in the model solution: the learner's must give one too (not None), so printing the result instead of returning it fails. */
  returns?: boolean;
  /** A pygame program's test: how many frames its window may show and what happens in it (keys, the mouse). */
  window?: { frames: number; events: WindowEvent[] };
  /** What the model solution's window ended as: the frames it showed, its last frame's text and picture (a path from the site's root). */
  expectWindow?: ExpectedWindow;
};

/** A window the build drew: the frames it showed, its size and title, its last frame's text, and that frame's picture (a path from the site's root). */
export type ExpectedWindow = { frames: number; log: string; size: [number, number] | null; title: string; image: string };
export type Rule = { pattern: string; flags?: string; message: string; min?: number; max?: number; raw?: boolean };

/**
 * One challenge: a fill-in (`seed` holds the [[blanks]]), a program to write or fix, or "What does it
 * print?" (`predict`: the learner types each line of `lines`, the program's real output).
 */
export type Exercise = {
  kind: "fill" | "code" | "predict";
  seed: string;
  solution: string;
  tests: TestCase[];
  hints: string[];
  require: Rule[];
  forbid: Rule[];
  /** Predict challenges: each line the program prints. */
  lines?: string[];
  /** Images (content/assets, published at images/) in the program's folder, for every test and every free run. */
  assets?: string[];
};

/** One of a step's further challenges, with its own task. */
export type Challenge = Exercise & { task: string };

/** A lesson step: its text, its own challenge (`task` and the exercise fields) and two more. */
export type Step = Exercise & { id: string; slug: string; title: string; text: string; task: string; more: Challenge[] };

/** A section of the University of Helsinki MOOC that a module follows. */
export type MoocSection = { section: string; title: string; path: string; portion?: string };

export type Course = "I" | "II" | "extra";

export type Module = {
  id: string;
  /** Place in the course, from 1. */
  number: number;
  title: string;
  course: Course;
  part: number | null;
  mooc: MoocSection[];
  summary: string;
  steps: Step[];
};

/** Every module of the course plan, written or not. */
export type PlannedModule = {
  id: string;
  number: number;
  title: string;
  course: Course;
  part: number | null;
  mooc: MoocSection[];
  steps: number;
  live: boolean;
};

/** A module as the course index lists it: its steps' titles and addresses, without the lessons. */
export type StepSummary = {
  id: string;
  slug: string;
  title: string;
  /** Names the step's lesson file: public/lessons/<module>/<slug>-<hash>.json. */
  hash: string;
  challenges: number;
  /** Drills this step unlocks. */
  drills: number;
};
export type ModuleSummary = Omit<Module, "steps"> & { steps: StepSummary[]; drills: number };

/**
 * One milestone of a project: a challenge (`seed` is the code it starts from when built on the
 * previous milestone's model solution, or the project's seed for milestone 1) with a title. `files`
 * are the files it adds to the program, with the text they start with; `replaces` names earlier
 * milestones' tests whose behavior it changes.
 */
export type Milestone = Exercise & { id: string; title: string; task: string; files?: Record<string, string>; replaces?: string[] };

/** A project (public/lessons/projects/<id>-<hash>.json): one program built over its milestones. */
export type Project = { id: string; title: string; summary: string; after: string; intro: string; milestones: Milestone[] };

/** A project as the course index lists it, without its file's contents. */
export type ProjectSummary = Omit<Project, "intro" | "milestones"> & { hash: string; milestones: { id: string; title: string }[] };

export type CourseIndex = {
  /** The reference CPython the expected outputs came from (the version Pyodide runs). */
  python: string;
  moocUrl: string;
  plan: PlannedModule[];
  modules: ModuleSummary[];
  interviewDrills: number;
  placementQuestions: number;
  /** The images (content/assets) a pygame program can load, published at images/. */
  images: string[];
  /** The projects, in course order. */
  projects: ProjectSummary[];
};

export type DrillType = "predict" | "fill" | "bug" | "runs" | "choice" | "boss";

/**
 * A Deathmatch drill (src/generated/drills.json). `display` is the code shown; `answer` is what's
 * checked: the output (predict), the blank (fill), the 1-based line (bug), "yes" or "no" (runs:
 * whether it runs without an error), or the 1-based choice (choice). A boss drill is a whole
 * challenge in `exercise`.
 */
export type Drill = {
  id: string;
  /** The module it practices, or "interview". */
  topic: string;
  type: DrillType;
  prompt: string;
  display: string;
  answer: string;
  /** Markdown: why the answer is what it is. */
  why: string;
  /** Accepted answers for a fill drill. */
  accept?: string[];
  /** The corrected line of a bug drill. */
  fix?: string;
  /** What the (fixed or filled-in) program prints. */
  output?: string;
  /** A runs drill whose answer is no: the last line of Python's error, such as NameError: name 'x' is not defined. */
  error?: string;
  /** Input the program reads. */
  stdin?: string;
  choices?: string[];
  exercise?: Exercise;
  /** The step that unlocks it (none for interview drills). */
  after?: string;
};

export type PlacementQuestion = Drill & { module: string };

export type DrillSet = { drills: Drill[]; placement: PlacementQuestion[] };
