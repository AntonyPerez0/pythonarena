// Tests of the content build's speed tests (scripts/content/speed.mjs): big tests, slow solutions and
// the model solution's time on big tests, first with runs made up for the test, then with real runs on
// the reference CPython through the build's own pool and harness. Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_BUDGET_MS, QUIET_TRIES, SLOW_MARGIN, budgetProblems, quietSlowProblems, slowBigProblems, slowFitsFill, slowSmallProblems, speedShapeProblems } from "./content/speed.mjs";
import { BIG_TIME_LIMIT_MS, DEFAULT_TIME_LIMIT_MS, timeLimitFor } from "../src/grader/limits.ts";
import { pythonPool, referencePython } from "./content/python.mjs";

test("the page's time limit: longer for a challenge with a big test, and the budget well under it", () => {
  assert.equal(timeLimitFor({ tests: [{}, { hidden: true }] }), DEFAULT_TIME_LIMIT_MS);
  assert.equal(timeLimitFor({ tests: [{}, { big: true }] }), BIG_TIME_LIMIT_MS);
  assert.equal(timeLimitFor({ tests: [{ window: { frames: 1000 } }] }), 4_000 + 1000 * 12);
  // Pyodide up to 3 times slower than CPython, a slow phone up to 5 times slower than the build's machine.
  assert.ok(MODEL_BUDGET_MS * 3 * 5 < BIG_TIME_LIMIT_MS);
  // The slow way the other way round: Pyodide at least 1.1 times slower, a learner's computer up to twice as fast as the build's.
  assert.ok((SLOW_MARGIN * BIG_TIME_LIMIT_MS * 1.1) / 2 > BIG_TIME_LIMIT_MS);
});

test("a challenge with a big test needs slow, slow needs a big test, and the task card's test is small", () => {
  assert.deepEqual(speedShapeProblems("c", [{}, { big: true, hidden: true }], "def f(): pass\n"), []);
  assert.match(speedShapeProblems("c", [{}, { big: true, hidden: true }], undefined).join(), /has a big test, so it needs slow/);
  assert.match(speedShapeProblems("c", [{}, { hidden: true }], "x").join(), /has slow but no big test/);
  assert.match(speedShapeProblems("c", [{ big: true }, { hidden: true }], "x").join(), /the first visible test is big/);
  assert.match(speedShapeProblems("c", [{}, { big: "yes" }], "x").join(), /big is true or false/);
  assert.match(speedShapeProblems("c", [{}, { big: true, window: { frames: 10 } }], "x").join(), /a window test can't be big/);
});

test("a fill-in's slow solution fills the same blanks, each on its line, and changes nothing else", () => {
  const fill = "def has_duplicate(values):\n    return [[len(set(values)) != len(values)]]\n";
  assert.ok(slowFitsFill(fill, "def has_duplicate(values):\n    return any(values.count(v) > 1 for v in values)\n"));
  assert.ok(!slowFitsFill(fill, "def has_duplicate(values):\n    seen = []\n    return any(values.count(v) > 1 for v in values)\n"));
  assert.ok(!slowFitsFill(fill, "def has_duplicates(values):\n    return False\n"));
  // Two blanks.
  assert.ok(slowFitsFill("for [[i]] in [[range(3)]]:\n    print(i)\n", "for i in list(range(3)):\n    print(i)\n"));
});

/**
 * Runs made up for a test: `outcomes[i]` is what running test i gives ("pass", "wrong", "timeout"), with
 * its ms. `ran` lists each run's test and time limit, and `most` the most runs that were running at once.
 */
const madeUp = (outcomes) => {
  const made = { ran: [], most: 0 };
  let running = 0;
  made.run = async (i, limitMs) => {
    made.ran.push(limitMs == null ? i : [i, limitMs]);
    running++;
    made.most = Math.max(made.most, running);
    await new Promise((r) => setTimeout(r, 2));
    running--;
    const [kind, ms = 10] = outcomes[i];
    return { kind, timedOut: kind === "timeout", ms };
  };
  made.wrong = (i, r) => (r.kind === "pass" ? null : r.kind === "wrong" ? "prints 3 where the model solution prints 4" : "runs out of time");
  return made;
};
const tests = [{}, { hidden: true }, { big: true, hidden: true }, { big: true, hidden: true }];

test("slow on the tests that aren't big: they run side by side, the big ones not at all, and each must pass", async () => {
  const r = madeUp([["pass"], ["pass"], ["timeout", 10_000], ["timeout", 10_000]]);
  assert.deepEqual(await slowSmallProblems({ where: "c", tests, run: r.run, wrong: r.wrong }), []);
  assert.deepEqual(r.ran.sort(), [0, 1]);
  assert.equal(r.most, 2, "side by side");
  const a = madeUp([["pass"], ["wrong"], ["timeout"], ["timeout"]]);
  assert.deepEqual(await slowSmallProblems({ where: "c", tests, run: a.run, wrong: a.wrong }), ["c test 2: the slow solution prints 3 where the model solution prints 4; it must pass every test that isn't big, so that only speed separates it from the model solution"]);
  // Running out of time on a small test is wrong too.
  const b = madeUp([["timeout", 10_000], ["pass"], ["timeout"], ["timeout"]]);
  assert.match((await slowSmallProblems({ where: "c", tests, run: b.run, wrong: b.wrong })).join(), /c test 1: the slow solution runs out of time; it must pass every test that isn't big/);
});

test("slow on the big tests: one at a time, at twice the page's limit, and the first timeout ends the check", async () => {
  const r = madeUp([["pass"], ["pass"], ["timeout", 20_000], ["timeout", 20_000]]);
  assert.deepEqual(await slowBigProblems({ where: "c", tests, limitMs: 10_000, run: r.run, wrong: r.wrong }), []);
  assert.deepEqual(r.ran, [[2, SLOW_MARGIN * 10_000]]);
  // The first big test is fast enough for slow, the second isn't: both run, one after the other.
  const s = madeUp([["pass"], ["pass"], ["pass", 900], ["timeout", 20_000]]);
  assert.deepEqual(await slowBigProblems({ where: "c", tests, limitMs: 10_000, run: s.run, wrong: s.wrong }), []);
  assert.deepEqual(s.ran, [
    [2, 20_000],
    [3, 20_000],
  ]);
  assert.equal(s.most, 1, "one at a time");
});

test("slow that gives a wrong answer on a big test, or finishes every big test, is a problem: running out of time only at the page's limit isn't enough", async () => {
  const b = madeUp([["pass"], ["pass"], ["wrong"], ["timeout"]]);
  assert.match((await slowBigProblems({ where: "c", tests, limitMs: 10_000, run: b.run, wrong: b.wrong })).join(), /c test 3: the slow solution prints 3 .* on this big test; slow must be correct, only slow/);
  // 12.3 s alone would run out of time at the page's 10 s on the build's machine, but not on a computer twice as fast.
  const c = madeUp([["pass"], ["pass"], ["pass", 1200], ["pass", 12_345]]);
  assert.deepEqual(await slowBigProblems({ where: "c", tests, limitMs: 10_000, run: c.run, wrong: c.wrong }), [
    "c: the slow solution finishes every big test: run on its own, the slowest took 12.3 s on CPython. It must still be running after 20 s, twice the page's time limit of 10 s, as a learner's computer can be faster than the build's (src/grader/limits.ts says why); make a big test bigger, so that the slow way runs out of time",
  ]);
  const d = madeUp([["pass"], ["pass"], ["pass", 1200], ["pass", 4300]]);
  assert.match((await slowBigProblems({ where: "c", tests, limitMs: 1_000, margin: 3, run: d.run, wrong: d.wrong })).join(), /the slowest took 4\.3 s on CPython\. It must still be running after 3 s, 3 times the page's time limit of 1 s/);
});

test("the quiet pass checks the slow solutions one after another, so each run is alone", async () => {
  const a = madeUp([["pass"], ["pass"], ["timeout", 20_000], ["timeout"]]);
  const b = madeUp([["pass"], ["pass"], ["pass", 15_000], ["pass", 16_000]]);
  let running = 0;
  let most = 0;
  const alone = (m) => async (i, limitMs) => {
    running++;
    most = Math.max(most, running);
    const r = await m.run(i, limitMs);
    running--;
    return r;
  };
  const errors = await quietSlowProblems([
    { where: "a", tests, limitMs: 10_000, run: alone(a), wrong: a.wrong },
    { where: "b", tests, limitMs: 10_000, run: alone(b), wrong: b.wrong },
  ]);
  assert.equal(most, 1, "one run at a time");
  assert.deepEqual(a.ran, [[2, 20_000]]);
  assert.deepEqual(b.ran, [
    [2, 20_000],
    [3, 20_000],
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^b: the slow solution finishes every big test: run on its own, the slowest took 16 s on CPython/);
  assert.deepEqual(await quietSlowProblems([]), []);
});

test("the model solution's time on big tests: within the budget stands; over it, the test runs again alone and its best time counts", async () => {
  const order = [];
  const check = (where, ms, reruns) => ({ where, ms, rerun: async () => (order.push(where), reruns.shift()) });
  // c2 is over the budget in the busy pool, and within it on its first run alone: one run is enough.
  const ok = await budgetProblems({ checks: [check("c1", 120, []), check("c2", 775, [{ ms: 300 }, { ms: 280 }]), check("c3", 499, [])] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(order, ["c2"]);
  assert.deepEqual(ok.times, [
    { where: "c1", ms: 120 },
    { where: "c2", ms: 300 },
    { where: "c3", ms: 499 },
  ]);
  // Over the budget on every run: QUIET_TRIES runs alone, one at a time, and the best is in the message.
  order.length = 0;
  let running = 0;
  let most = 0;
  const rerun = async () => {
    running++;
    most = Math.max(most, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    order.push("c test 4");
    return { ms: [850, 620][order.length - 1] };
  };
  const slow = await budgetProblems({ checks: [{ where: "c test 4", ms: 900, rerun }] });
  assert.equal(order.length, QUIET_TRIES);
  assert.equal(most, 1, "the runs alone run one at a time");
  assert.equal(slow.errors.length, 1);
  assert.match(slow.errors[0], /c test 4: the model solution took 620 ms on this big test, the best of 2 runs on its own \(900 ms in the build's first run, beside the other programs\); on CPython it may take at most 500 ms/);
  assert.deepEqual(slow.times, [{ where: "c test 4", ms: 620 }]);
  // A run alone that runs out of time doesn't count as fast.
  const stuck = await budgetProblems({ checks: [check("c5", 800, [{ timedOut: true, ms: 10_000 }, { timedOut: true, ms: 10_000 }])] });
  assert.match(stuck.errors.join(), /c5: the model solution took too long on this big test, the best of 2 runs on its own \(800 ms in the build's first run/);
  // Only the runs alone count once the first is over the budget, even when the first was the fastest.
  const noisy = await budgetProblems({ checks: [check("c6", 520, [{ ms: 540 }, { ms: 530 }])] });
  assert.match(noisy.errors.join(), /c6: the model solution took 530 ms on this big test, the best of 2 runs on its own \(520 ms in the build's first run/);
  assert.deepEqual(await budgetProblems({ checks: [] }), { errors: [], times: [] });
});

// Real runs: the reference CPython through the build's pool, as the content build runs them.
let python = null;
try {
  python = referencePython();
} catch (e) {
  if (process.env.CI) throw e;
  console.warn(`speed: real runs skipped (${e.message})`);
}
const pool = python ? pythonPool({ exe: python.exe, size: 2 }) : null;
test.after(() => pool?.close());
const real = (name, fn) => test(name, { skip: !python && "no reference CPython" }, fn);

const MODEL = "def has_duplicate(values):\n    return len(set(values)) != len(values)\n";
const SLOW = "def has_duplicate(values):\n    for i in range(len(values)):\n        for j in range(i + 1, len(values)):\n            if values[i] == values[j]:\n                return True\n    return False\n";
const SORTED = "def has_duplicate(values):\n    ordered = sorted(values)\n    return any(a == b for a, b in zip(ordered, ordered[1:]))\n";
const CALLS = [
  { call: "has_duplicate([3, 1, 3])", expect: "True" },
  { call: "has_duplicate([4, 2, 9])", expect: "False", hidden: true },
  { call: "has_duplicate([i * 7 for i in range(200_000)])", expect: "False", hidden: true, big: true },
];
const spec = (code, t) => ({ files: { "main.py": code }, main: "main.py", stdin: "", given: {}, args: [], call: t.call });
const wrongOf = (t, r) => (r.timedOut ? "runs out of time" : r.exit !== 0 ? "stops with an error" : r.stdout.trim() !== t.expect ? `prints ${r.stdout.trim()}` : null);

real("the model solution's big test is well within the budget, with its time measured by the worker", async () => {
  const runs = await Promise.all(CALLS.map((t) => pool.run(spec(MODEL, t))));
  assert.equal(runs[2].stdout.trim(), "False");
  assert.ok(typeof runs[2].ms === "number" && runs[2].ms > 0, `ms: ${runs[2].ms}`);
  // Timed again alone as the quiet pass would, even when within the budget, to see the worker's time of a run on its own.
  const { errors, times } = await budgetProblems({ checks: [{ where: "c test 3", ms: Infinity, rerun: () => pool.run(spec(MODEL, CALLS[2])) }] });
  assert.deepEqual(errors, []);
  assert.ok(times[0].ms < MODEL_BUDGET_MS, `${times[0].ms} ms`);
});

real("a loop inside a loop over 200,000 values is still running after twice the run's limit; sorting first isn't", async () => {
  // A page's limit of 1 s for the test (the real one is 10 s): the slow way would take minutes either way.
  const limitMs = 1_000;
  const small = (code) => (i) => pool.run(spec(code, CALLS[i]), 0, { timeLimitMs: limitMs });
  const big = (code) => (i, timeLimitMs) => pool.run(spec(code, CALLS[i]), 0, { timeLimitMs });
  const wrong = (i, r) => wrongOf(CALLS[i], r);
  assert.deepEqual(await slowSmallProblems({ where: "c", tests: CALLS, run: small(SLOW), wrong }), []);
  const started = Date.now();
  assert.deepEqual(await slowBigProblems({ where: "c", tests: CALLS, limitMs, run: big(SLOW), wrong }), []);
  const took = Date.now() - started;
  assert.ok(took >= SLOW_MARGIN * limitMs && took < SLOW_MARGIN * limitMs + 5_000, `the run was stopped at twice its limit: ${took} ms`);
  assert.deepEqual(await slowSmallProblems({ where: "c", tests: CALLS, run: small(SORTED), wrong }), []);
  assert.match((await slowBigProblems({ where: "c", tests: CALLS, limitMs, run: big(SORTED), wrong })).join(), /finishes every big test: run on its own, the slowest took 0(\.\d)? s on CPython\. It must still be running after 2 s, twice the page's time limit of 1 s/);
});
