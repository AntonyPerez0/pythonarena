// Tests of the content build's pool of reference CPython workers (scripts/content/python.mjs): each of the two
// groups runs with its own fixed hash seed, the workers see nothing of the user's Python settings, and an answer
// that comes after the time limit is never taken for the next program's. Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pythonPool, referencePython } from "./content/python.mjs";

let python = null;
try {
  python = referencePython();
} catch (e) {
  if (process.env.CI) throw e;
  console.warn(`python-pool: skipped (${e.message})`);
}
const it = (name, fn) => test(name, { skip: !python && "no reference CPython" }, fn);
const spec = (code) => ({ files: { "main.py": code }, main: "main.py", stdin: "", given: {}, args: [] });

it("each group of workers runs with its hash seed, 0 or 12345, in every new pool", async () => {
  const code = "import sys\nprint(sys.flags.hash_randomization, hash('abc'), list({'apple', 'banana', 'cherry', 'date'}))\n";
  const seen = [];
  for (let k = 0; k < 2; k++) {
    const pool = pythonPool({ exe: python.exe, size: 2 });
    try {
      seen.push(await Promise.all([pool.run(spec(code), 0), pool.run(spec(code), 1)]).then((rs) => rs.map((r) => r.stdout)));
    } finally {
      pool.close();
    }
  }
  assert.deepEqual(seen[1], seen[0], "a new pool gave other hashes");
  assert.notEqual(seen[0][0], seen[0][1], "both seeds gave the same hashes");
  const own = (seed) => spawnSync(python.exe, ["-c", "print(hash('abc'))"], { env: { PATH: process.env.PATH, PYTHONHASHSEED: seed }, encoding: "utf8" }).stdout;
  assert.equal(seen[0][0].split(" ").slice(0, 2).join(" "), `0 ${own("0").trim()}`);
  assert.equal(seen[0][1].split(" ").slice(0, 2).join(" "), `1 ${own("12345").trim()}`);
});

it("the workers see none of the user's Python settings, user site-packages or the worker's folder", async () => {
  const saved = process.env.PYTHONPATH;
  process.env.PYTHONPATH = "/nowhere/pythonpath";
  const pool = pythonPool({ exe: python.exe, size: 2 });
  try {
    const r = await pool.run(spec("import os, sys\nprint(sys.flags.no_user_site, sys.flags.safe_path)\nprint(sorted(k for k in os.environ if k.startswith('PYTHON')))\nprint('\\n'.join(sys.path))\n"));
    const [flags, vars, ...paths] = r.stdout.trim().split("\n");
    assert.equal(flags, "1 True");
    assert.equal(vars, "['PYTHONHASHSEED']");
    assert.ok(!paths.some((p) => p.includes("nowhere") || /scripts[/\\]content$/.test(p)), paths.join(", "));
  } finally {
    pool.close();
    if (saved === undefined) delete process.env.PYTHONPATH;
    else process.env.PYTHONPATH = saved;
  }
});

it("an answer that comes after the time limit isn't taken for the next program's", async () => {
  const pool = pythonPool({ exe: python.exe, size: 2, timeLimitMs: 300 });
  try {
    assert.equal((await pool.run(spec('print("warm")'))).stdout, "warm\n");
    const first = pool.run(spec('print("first")'));
    const second = pool.run(spec('print("second")'));
    // Node is busy past the time limit while the worker answers, so the timer and the answer are both due when it
    // looks again. The timer comes first: the first program counts as timed out and the second starts in a new
    // process, with the first one's answer still to be read.
    const until = Date.now() + 1000;
    while (Date.now() < until);
    const third = pool.run(spec('print("third")'));
    const [a, b, c] = await Promise.all([first, second, third]);
    assert.equal(a.timedOut, true);
    assert.equal(b.stdout, "second\n");
    assert.equal(c.stdout, "third\n");
  } finally {
    pool.close();
  }
});
