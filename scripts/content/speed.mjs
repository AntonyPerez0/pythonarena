// Speed tests for the content build (scripts/build-content.mjs): big tests, slow solutions and the
// model solution's time on big tests. Kept apart from the build so the unit tests can run them with
// their own runs (scripts/speed.test.mjs).
//
// A test with `big: true` is sized so that a correct but slow solution runs out of time (a call that
// builds 200,000 values, say). A challenge with a big test has `slow`: a correct but slow solution, in
// the same form as `solution` (a fill-in's slow is the fill-in with its blanks filled the slow way; a
// program task's is a whole program). The build checks that:
//
//   - slow passes every test that isn't big, and follows the challenge's rules, so the tests are fair
//     and only speed separates it from the model solution. These runs are in the build's busy pool,
//     beside every other program it checks;
//   - slow is still running after SLOW_MARGIN times the page's time limit for the challenge on at least
//     one big test (src/grader/limits.ts says why twice the limit). Its big tests run only in the quiet
//     pass at the end of the build, once every other run is done, alone and one at a time, as the
//     busy pool would make it look slower than it is. The first timeout ends the check, and the build
//     caches it, so each slow solution costs those 20 seconds once. They wait until nothing else is
//     wrong with the content;
//   - the model solution takes at most MODEL_BUDGET_MS on each big test on the reference CPython, so it
//     still passes in Pyodide on a slow phone (src/grader/limits.ts says how the limits were chosen). The
//     time is the worker's, around the harness's run of the test. The build's first run of a big test is
//     in its busy pool, which can only make it slower: a time within the budget there stands. One over
//     it is timed again in the quiet pass, alone and one at a time, and the best time counts.
import { parseTemplate } from "../../src/grader/assemble.js";
import { MODEL_BUDGET_MS, SLOW_MARGIN } from "../../src/grader/limits.ts";

export { MODEL_BUDGET_MS, SLOW_MARGIN };

/** A time in seconds, to a tenth, rounded down (so a run that finished never reads as the limit): 7.3 s, 20 s. */
const seconds = (ms) => `${Math.floor(ms / 100) / 10} s`;

/**
 * Problems with a challenge's big tests and slow solution as written, before anything runs: `tests`
 * are the challenge's tests as the YAML has them, `slow` its slow solution (or undefined).
 */
export function speedShapeProblems(where, tests, slow) {
  const errors = [];
  tests.forEach((t, i) => {
    if (t?.big != null && typeof t.big !== "boolean") errors.push(`${where} test ${i + 1}: big is true or false`);
    if (t?.big === true && t.window != null) errors.push(`${where} test ${i + 1}: a window test can't be big (big tests are for the speed of a way, not for pygame)`);
  });
  const big = tests.some((t) => t?.big === true);
  if (big && slow == null) errors.push(`${where}: has a big test, so it needs slow: a correct but slow solution (the build checks that it runs out of time on a big test)`);
  if (!big && slow != null) errors.push(`${where}: has slow but no big test (big: true); slow is checked against the big tests`);
  // The task card shows the first visible test: an example of the task, not a speed test.
  const shown = tests.find((t) => !t?.hidden);
  if (shown?.big === true) errors.push(`${where}: the first visible test is big, but the task card shows that test as the example; put a small test first (big tests are normally hidden)`);
  return errors;
}

/**
 * Whether a fill-in's slow solution is the fill-in with its blanks filled in some other way (each blank
 * on its own line, as the page's blanks are): a learner of a fill-in can only change the blanks, so the
 * slow way must fit them.
 */
export function slowFitsFill(fill, slow) {
  const { parts } = parseTemplate(fill);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${parts.map(esc).join("[^\\n]*?")}$`).test(slow);
}

/**
 * Checks a slow solution on a challenge's tests that aren't big, side by side in the build's busy pool:
 * `run(i)` runs it on test i at the page's time limit and resolves with the run ({ timedOut, ms, ... });
 * `wrong(i, r)` says what is wrong with a run of test i (null when it passes). Returns the problems.
 */
export async function slowSmallProblems({ where, tests, run, wrong }) {
  const small = tests.flatMap((t, i) => (t.big ? [] : [i]));
  const runs = await Promise.all(small.map((i) => run(i)));
  return small.flatMap((i, k) => {
    const problem = wrong(i, runs[k]);
    return problem ? [`${where} test ${i + 1}: the slow solution ${problem}; it must pass every test that isn't big, so that only speed separates it from the model solution`] : [];
  });
}

/**
 * Checks a slow solution on a challenge's big tests, in the build's quiet pass: `run(i, timeLimitMs)` runs
 * it on test i, alone, stopping it after `timeLimitMs`; `wrong(i, r)` is as for slowSmallProblems. The big
 * tests run one at a time, in order, with `margin` times the page's limit (`limitMs`), until one runs out
 * of time. Returns the problems.
 */
export async function slowBigProblems({ where, tests, limitMs, margin = SLOW_MARGIN, run, wrong }) {
  const waitMs = margin * limitMs;
  let slowest = 0;
  for (const i of tests.flatMap((t, k) => (t.big ? [k] : []))) {
    const r = await run(i, waitMs);
    if (r.timedOut) return [];
    const problem = wrong(i, r);
    if (problem) return [`${where} test ${i + 1}: the slow solution ${problem} on this big test; slow must be correct, only slow`];
    slowest = Math.max(slowest, r.ms ?? 0);
  }
  const times = margin === 2 ? "twice" : `${margin} times`;
  return [
    `${where}: the slow solution finishes every big test: run on its own, the slowest took ${seconds(slowest)} on CPython. It must still be running after ${seconds(waitMs)}, ${times} the page's time limit of ${seconds(limitMs)}, as a learner's computer can be faster than the build's (src/grader/limits.ts says why); make a big test bigger, so that the slow way runs out of time`,
  ];
}

/**
 * The quiet pass's checks of slow solutions: `checks` are slowBigProblems's arguments, one per challenge,
 * run one after another so that each run is alone. Returns the problems.
 */
export async function quietSlowProblems(checks) {
  const errors = [];
  for (const c of checks) errors.push(...(await slowBigProblems(c)));
  return errors;
}

/** How many times a big test over the budget is run again in the quiet pass (the best time counts). */
export const QUIET_TRIES = 2;

/**
 * Checks the model solutions' times on big tests, in the build's quiet pass (once every other run is
 * done). `checks` are the big tests as the build first ran them, each { where, ms, rerun }: `ms` its time
 * in the busy pool, and `rerun()` runs it again, fresh. A time within the budget stands, as a quiet run
 * is never slower; a test over it runs again, one run at a time, up to `tries` times or until a run is
 * within the budget, and the best of those runs alone counts. Returns the problems and each test's time,
 * in the order of `checks`: { errors, times: [{ where, ms }] }.
 */
export async function budgetProblems({ checks, budgetMs = MODEL_BUDGET_MS, tries = QUIET_TRIES }) {
  const errors = [];
  const times = [];
  for (const c of checks) {
    const first = c.ms ?? 0;
    let best = first;
    let ran = 0;
    // Over the budget beside the other programs: only the runs alone count now.
    if (first > budgetMs) best = Infinity;
    while (best > budgetMs && ran < tries) {
      const again = await c.rerun();
      ran++;
      best = Math.min(best, again.timedOut ? Infinity : (again.ms ?? 0));
    }
    if (best > budgetMs)
      errors.push(
        `${c.where}: the model solution took ${Number.isFinite(best) ? `${Math.round(best)} ms` : "too long"} on this big test, the best of ${ran} ${ran === 1 ? "run" : "runs"} on its own (${Math.round(first)} ms in the build's first run, beside the other programs); on CPython it may take at most ${budgetMs} ms, so that it still passes in Pyodide on a slow phone (src/grader/limits.ts says why). Make the test smaller or the solution faster`,
      );
    times.push({ where: c.where, ms: best });
  }
  return { errors, times };
}
