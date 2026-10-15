// How long a challenge's runs may take on the page. The content build (scripts/build-content.mjs) checks
// a challenge's model and slow solutions against the same limits (BIG_TIME_LIMIT_MS says how).

/** Default per-test time limit. Python in WebAssembly is slower than on a desktop, so it's generous. */
export const DEFAULT_TIME_LIMIT_MS = 5_000;

/**
 * The limit for a challenge with a big test (`big: true`: sized so that a correct but slow solution runs
 * out of time). The build checks two things against it, on the reference CPython (scripts/content/speed.mjs):
 *
 *   - the model solution takes at most MODEL_BUDGET_MS on each big test, so it still passes in Pyodide
 *     on a slow phone. The time is the run's on its own: the build's worker times the harness's run of
 *     the test, and a run over the budget among the build's other programs (which only make it slower)
 *     is timed again at the end of the build, alone, the best of two runs;
 *   - the slow solution is still running after SLOW_MARGIN times this limit on at least one big test.
 *     Its big tests run only at the end of the build, alone and one at a time: beside the build's other
 *     programs it would look slower than it is, and a slow way that runs out of time only there could
 *     pass on the page.
 *
 * The three are chosen together. Pyodide runs Python 1.1 to 3.2 times slower than CPython (measured on
 * the kind of work big tests do: about the same for building sets and dicts, twice as slow for sorting
 * and counting, three times for loops of plain Python), so up to 3 times. A slow phone runs WebAssembly
 * up to about 5 times slower than the machine the build runs on. Together that's 15 times: a model
 * solution of 500 ms on CPython takes up to 7.5 s on such a phone, under this 10 s limit with room left
 * for the page's own work.
 *
 * The other way round, a learner's computer can be faster than the build's: a new desktop runs Python
 * up to about twice as fast as a cloud machine like CI's. So the build waits twice the limit for the
 * slow way: one still running after 20 s on CPython takes over 10 s in Pyodide on such a computer, even
 * for work that Pyodide does almost as fast as CPython (20 s / 2 x 1.1 = 11 s). The model solution and
 * the slow way are then at least 40 times apart on the same machine: only the speed of the way separates
 * them. Each slow solution's check takes those 20 s, once: the build caches it.
 */
export const BIG_TIME_LIMIT_MS = 10_000;

/** The most a big test's run of the model solution may take on the reference CPython, run on its own (see BIG_TIME_LIMIT_MS). */
export const MODEL_BUDGET_MS = 500;

/** How many times the page's limit a slow solution must still be running after on a big test, on CPython, run on its own (see BIG_TIME_LIMIT_MS). */
export const SLOW_MARGIN = 2;

/** What timeLimitFor needs to know about a challenge's tests. */
type TestShape = { window?: { frames: number }; big?: boolean };

/**
 * How long each run of a challenge may take: a pygame test draws its frames, each taking a few
 * milliseconds, and a challenge with a big test gets BIG_TIME_LIMIT_MS.
 */
export function timeLimitFor(ex: { tests: TestShape[] }): number {
  const frames = Math.max(0, ...ex.tests.map((t) => t.window?.frames ?? 0));
  const big = ex.tests.some((t) => t.big) ? BIG_TIME_LIMIT_MS : 0;
  return Math.max(DEFAULT_TIME_LIMIT_MS, big, frames ? 4_000 + frames * 12 : 0);
}
