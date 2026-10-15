// Tests of pygame without a screen (src/engine/arena_pygame.py), run as the content build runs pygame
// programs: in Pyodide on Node with the engine's pygame-ce wheel (scripts/content/pyodide.mjs). They
// check what lessons and tests rely on: frames and their text, events at the frame they come, the window
// closed after its last frame, held keys and the mouse, timers and the counted clock, images keeping
// their colors, and how the run ends. Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pyodidePool } from "./content/pyodide.mjs";

const pool = pyodidePool({ size: 2, timeLimitMs: 60_000 });
test.after(() => pool.close());

const robot = { base64: fs.readFileSync(new URL("../content/assets/robot.png", import.meta.url)).toString("base64") };
/** Runs a pygame program with a window of `frames` frames and these events; the result has its frames. */
const run = (code, window = {}, more = {}) => pool.run({ files: { "main.py": code }, main: "main.py", stdin: "", given: more.given ?? {}, args: [], window: { png: "none", ...window }, ...(more.call ? { call: more.call } : {}) });

const LOOP = (draw, handle = "") => `import pygame

pygame.init()
window = pygame.display.set_mode((200, 100))
clock = pygame.time.Clock()
x = 0
while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            exit()
${handle}
${draw}
    pygame.display.flip()
    clock.tick(60)
`;

test("a window shows its frames, then is closed: a program that handles QUIT ends there", async () => {
  const r = await run(LOOP("    window.fill((0, 0, 0))\n    pygame.draw.rect(window, (255, 0, 0), (x, 10, 20, 20))\n    x += 3"), { frames: 5 });
  assert.equal(r.exit, 0);
  assert.equal(r.stderr, "");
  assert.equal(r.window.frames, 5);
  assert.equal(r.window.ended, "closed");
  assert.deepEqual(r.frames.map((f) => f.index), [1, 2, 3, 4, 5]);
  assert.equal(r.window.log, "fill (0, 0, 0)\nrect (255, 0, 0) (12, 10, 20, 20)");
  assert.equal(r.frames[0].log, "fill (0, 0, 0)\nrect (255, 0, 0) (0, 10, 20, 20)");
});

test("a program that ignores QUIT is stopped at its next frame; one that draws once ends by itself", async () => {
  const stopped = await run("import pygame\nscreen = pygame.display.set_mode((50, 50))\nwhile True:\n    screen.fill('white')\n    pygame.display.flip()\n", { frames: 3 });
  assert.equal(stopped.exit, 0);
  assert.equal(stopped.window.frames, 3);
  assert.equal(stopped.window.ended, "stopped");
  assert.equal(stopped.window.log, "fill (255, 255, 255)");
  const once = await run("import pygame\nscreen = pygame.display.set_mode((50, 50))\nscreen.fill((1, 2, 3))\npygame.display.flip()\n", { frames: 10 });
  assert.equal(once.window.frames, 1);
  assert.equal(once.window.ended, "program");
});

test("a key event comes after the frame it's at; get_pressed follows the keys held", async () => {
  const code = LOOP(
    "    window.fill((0, 0, 0))\n    window.blit(pygame.font.SysFont('Arial', 12).render(str(x), True, 'white'), (0, 0))",
    "    if pygame.key.get_pressed()[pygame.K_RIGHT]:\n        x += 1",
  );
  const r = await run(code, { frames: 10, events: [{ at: 2, type: "keydown", key: "K_RIGHT" }, { at: 6, type: "keyup", key: "K_RIGHT" }] });
  // Frames 3 to 6 see the key held: x is 4 from frame 6 on.
  assert.deepEqual(r.frames.map((f) => /"(\d+)"/.exec(f.log)[1]), ["0", "0", "1", "2", "3", "4", "4", "4", "4", "4"]);
});

test("key events carry key, mod and unicode; a typed letter with Shift is a capital", async () => {
  const code = `import pygame
screen = pygame.display.set_mode((50, 50))
typed = ""
while True:
    for event in pygame.event.get():
        if event.type == pygame.KEYDOWN:
            typed += event.unicode
            print(pygame.key.name(event.key), bool(event.mod & pygame.KMOD_SHIFT), repr(event.unicode))
        if event.type == pygame.QUIT:
            print("typed:", typed)
            exit()
    pygame.display.flip()
`;
  const r = await run(code, { frames: 4, events: [{ at: 1, type: "keydown", key: "K_a" }, { at: 1, type: "keyup", key: "K_a" }, { at: 2, type: "keydown", key: "K_LSHIFT" }, { at: 2, type: "keydown", key: "K_b" }, { at: 3, type: "keydown", key: "K_SPACE" }] });
  assert.equal(r.stdout, "a False 'a'\nleft shift True ''\nb True 'B'\nspace True ' '\ntyped: aB \n");
});

test("mouse clicks and moves: event.pos, get_pos and get_pressed", async () => {
  const code = `import pygame
screen = pygame.display.set_mode((100, 100))
while True:
    for event in pygame.event.get():
        if event.type == pygame.MOUSEBUTTONDOWN:
            print("down", event.pos, event.button, pygame.mouse.get_pressed()[0])
        if event.type == pygame.MOUSEMOTION:
            print("move", event.pos, event.rel)
        if event.type == pygame.MOUSEBUTTONUP:
            print("up", pygame.mouse.get_pos(), pygame.mouse.get_pressed()[0])
        if event.type == pygame.QUIT:
            exit()
    pygame.display.flip()
`;
  const r = await run(code, { frames: 4, events: [{ at: 0, type: "mousemove", pos: [10, 20] }, { at: 1, type: "mousedown", pos: [30, 40], button: 1 }, { at: 2, type: "mouseup", pos: [30, 40], button: 1 }] });
  assert.equal(r.stdout, "move (10, 20) (10, 20)\ndown (30, 40) 1 True\nup (30, 40) False\n");
  // A press and a release at the same frame are both taken in before the program looks, as in pygame.
  const quick = await run(code, { frames: 3, events: [{ at: 1, type: "mousedown", pos: [5, 6], button: 1 }, { at: 1, type: "mouseup", pos: [5, 6], button: 1 }] });
  assert.equal(quick.stdout, "down (5, 6) 1 False\nup (5, 6) False\n");
});

test("the clock is counted: tick(60) moves it a 60th of a second; set_timer events come on time", async () => {
  const code = `import pygame
screen = pygame.display.set_mode((50, 50))
clock = pygame.time.Clock()
pygame.time.set_timer(pygame.USEREVENT, 100)
frames = 0
while True:
    for event in pygame.event.get():
        if event.type == pygame.USEREVENT:
            print("timer at", pygame.time.get_ticks())
        if event.type == pygame.QUIT:
            print("frames", frames, "ticks", pygame.time.get_ticks(), "fps", round(clock.get_fps()))
            exit()
    pygame.display.flip()
    frames += 1
    clock.tick(60)
`;
  const r = await run(code, { frames: 30 });
  // The timer's events come at the first frame at or after their time: 100, 200, 300, 400 and 500 ms.
  assert.equal(r.stdout, "timer at 100\ntimer at 200\ntimer at 300\ntimer at 400\ntimer at 500\nframes 30 ticks 500 fps 60\n");
  assert.deepEqual(r.frames.slice(0, 4).map((f) => f.ms), [0, 16, 33, 50]);
});

test("the window as text: blits name their image and text; a whole-window fill starts the text again; transforms say what they did", async () => {
  const code = `import pygame
pygame.init()
screen = pygame.display.set_mode((300, 200))
pygame.display.set_caption("Robots")
robot = pygame.image.load("robot.png").convert_alpha()
font = pygame.font.SysFont("Arial", 20)
screen.fill((9, 9, 9))
screen.blit(robot, (5, 5))
pygame.display.flip()
screen.fill((0, 0, 0))
screen.blit(robot, (10.7, 20))
screen.blit(pygame.transform.rotate(robot, 90), (60, 20))
screen.blit(pygame.transform.scale(robot, (80, 80)), (110, 20))
screen.blit(font.render("Score: 3", True, (255, 255, 0)), (10, 170))
pygame.draw.circle(screen, "red", (250, 50), 15)
pygame.draw.line(screen, (0, 255, 0), (0, 199), (299, 199), 3)
pygame.draw.polygon(screen, (0, 0, 255), [(200, 150), (220, 190), (180, 190)])
pygame.display.flip()
`;
  const r = await run(code, { frames: 5 }, { given: { "robot.png": robot } });
  assert.equal(r.stderr, "");
  assert.equal(r.window.title, "Robots");
  assert.deepEqual(r.window.size, [300, 200]);
  assert.equal(r.frames[0].log, "fill (9, 9, 9)\nblit robot.png at (5, 5)");
  assert.equal(
    r.window.log,
    [
      "fill (0, 0, 0)",
      "blit robot.png at (10, 20)",
      "blit robot.png rotated 90 at (60, 20)",
      "blit robot.png scaled to 80x80 at (110, 20)",
      'blit text "Score: 3" at (10, 170)',
      "circle (255, 0, 0) at (250, 50) radius 15",
      "line (0, 255, 0) from (0, 199) to (299, 199), width 3",
      "polygon (0, 0, 255) through (200, 150), (220, 190), (180, 190)",
    ].join("\n"),
  );
});

test("pictures: a frame's PNG has the image's own colors (a loaded PNG's channels aren't swapped)", async () => {
  const code = `import pygame
screen = pygame.display.set_mode((40, 40))
robot = pygame.image.load("robot.png")
screen.blit(robot, (0, 0))
print(screen.get_at((20, 30)), screen.get_at((18, 0)))
pygame.display.flip()
`;
  const r = await run(code, { frames: 1, png: "all" }, { given: { "robot.png": robot } });
  // The robot's body is Python blue, its antenna Python yellow (scripts/make-sprites.mjs).
  assert.equal(r.stdout, "Color(55, 118, 171, 255) Color(255, 212, 59, 255)\n");
  const png = Buffer.from(r.frames[0].png, "base64");
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  assert.equal(png.readUInt32BE(16), 40);
});

test("after pygame.quit() the window is gone, as in pygame: drawing on it is Python's own error", async () => {
  const r = await run("import pygame\npygame.init()\nscreen = pygame.display.set_mode((50, 50))\npygame.quit()\npygame.display.flip()\n", { frames: 5 });
  assert.equal(r.exit, 1);
  assert.match(r.stderr, /pygame\.error: video system not initialized/);
  assert.match(r.stderr, /File "main\.py", line 5/);
});

test("random is seeded the same way on every run of a window; sound is silent", async () => {
  const code = "import pygame, random\npygame.mixer.init()\npygame.mixer.Sound('beep.wav').play()\nscreen = pygame.display.set_mode((50, 50))\nprint(random.randint(1, 1000), random.randint(1, 1000))\npygame.display.flip()\n";
  const a = await run(code, { frames: 1 });
  const b = await run(code, { frames: 1 });
  assert.equal(a.stderr, "");
  assert.equal(a.stdout, b.stdout);
});
