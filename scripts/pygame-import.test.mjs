// The page (src/engine/pygame-import.ts) and the harness (src/engine/arena.py's uses_pygame) agree on which
// programs use pygame: the page shows the window for exactly the programs the worker loads pygame for.
// Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { importsPygame } from "../src/engine/pygame-import.ts";
import { referencePython } from "./content/python.mjs";

const CASES = [
  ["import pygame", true],
  ["import pygame as pg", true],
  ["import sys, pygame", true],
  ["import sys,pygame", true],
  ["import os, sys, pygame", true],
  ["import os.path, pygame as pg", true],
  ["import random as r, pygame", true],
  ["import pygame.locals", true],
  ["from pygame import Rect", true],
  ["from pygame.locals import *", true],
  ["def main():\n    import pygame\n", true],
  ["print('hi')\nimport math, pygame\n", true],
  ["import pygame_gui", false],
  ["import mypygame", false],
  ["import sys, pygames", false],
  ["# import pygame", false],
  ["print('import pygame')", false],
  ["x = 1", false],
];

test("the page knows a pygame program by its imports, alone or in a list", () => {
  for (const [code, want] of CASES) assert.equal(importsPygame([code]), want, code);
  assert.equal(importsPygame(["x = 1", "import sys, pygame"]), true, "any of the files");
  assert.equal(importsPygame([{ base64: "" }]), false, "binary files are skipped");
});

test("the harness agrees with the page on every case", (t) => {
  let python;
  try {
    python = referencePython();
  } catch (e) {
    if (process.env.CI) throw e;
    t.skip(e.message);
    return;
  }
  const script = "import json, sys\nsys.path.insert(0, 'src/engine')\nimport arena\nprint(json.dumps([bool(arena.uses_pygame({'main.py': c})) for c in json.loads(sys.stdin.read())]))";
  const r = spawnSync(python.exe, ["-c", script], { input: JSON.stringify(CASES.map(([c]) => c)), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(r.stdout);
  CASES.forEach(([code, want], i) => assert.equal(got[i], want, code));
});
