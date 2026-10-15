// Tests of pygame without a screen (src/engine/arena_pygame.py), run as the content build runs pygame
// programs: in Pyodide on Node with the engine's pygame-ce wheel (scripts/content/pyodide.mjs). They
// check what lessons and tests rely on: frames and their text, events at the frame they come, the window
// closed after its last frame, held keys and the mouse, timers and the counted clock (while a program
// waits too), the same first frames however many come after, key repeat, display.update with
// rectangles, images keeping their colors, and how the run ends. Run: npm run test:unit
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

test("a program that draws once and then only waits for events: the window keeps its picture until it's closed, as many frames as one that draws every frame", async () => {
  const code = `import pygame
pygame.init()
window = pygame.display.set_mode((100, 80))
window.fill((0, 0, 0))
pygame.draw.circle(window, (255, 0, 0), (50, 40), 10)
pygame.display.flip()
while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            exit()
`;
  const r = await run(code, { frames: 30, png: "last" });
  assert.equal(r.exit, 0);
  assert.equal(r.window.frames, 30);
  assert.equal(r.window.ended, "closed");
  assert.equal(r.window.log, "fill (0, 0, 0)\ncircle (255, 0, 0) at (50, 40) radius 10");
  assert.equal(r.frames.filter((f) => f.same).length, 29, "frames 2 to 30 hold the first one's picture");
  assert.ok(r.frames.at(-1).png, "the last frame (a held one) gets the picture");
  // The same picture drawn every frame: the same window, frame for frame.
  const every = await run(code.replace("pygame.display.flip()\nwhile True:", "while True:\n    pygame.display.flip()"), { frames: 30 });
  assert.equal(every.window.frames, 30);
  assert.equal(every.window.log, r.window.log);
});

test("a program that draws only when something happens gets its events at their frames, with held frames between", async () => {
  const code = `import pygame
pygame.init()
window = pygame.display.set_mode((100, 80))
clicks = []
window.fill((0, 0, 0))
pygame.display.flip()
while True:
    for event in pygame.event.get():
        if event.type == pygame.MOUSEBUTTONDOWN:
            clicks.append(event.pos)
            window.fill((0, 0, 0))
            for x, y in clicks:
                pygame.draw.rect(window, (0, 255, 0), (x, y, 4, 4))
            pygame.display.flip()
        if event.type == pygame.QUIT:
            print(len(clicks), "clicks")
            exit()
`;
  const r = await run(code, { frames: 20, events: [{ at: 5, type: "mousedown", pos: [10, 10] }, { at: 12, type: "mousedown", pos: [30, 40] }] });
  assert.equal(r.stdout, "2 clicks\n");
  assert.equal(r.window.frames, 20);
  // Frame 1 drawn at the start, frames 2 to 5 held; the first click draws frame 6.
  assert.deepEqual(r.frames.filter((f) => !f.same).map((f) => f.index), [1, 6, 13]);
  assert.equal(r.window.log, "fill (0, 0, 0)\nrect (0, 255, 0) (10, 10, 4, 4)\nrect (0, 255, 0) (30, 40, 4, 4)");
});

test("event.wait(): the window waits for the next event (frames go by), and is closed when no more come", async () => {
  const code = `import pygame
pygame.init()
window = pygame.display.set_mode((100, 80))
window.fill((0, 0, 0))
pygame.display.flip()
while True:
    event = pygame.event.wait()
    if event.type == pygame.KEYDOWN:
        print("key", pygame.key.name(event.key))
        window.fill((255, 255, 255))
        pygame.display.flip()
    if event.type == pygame.QUIT:
        print("closed")
        break
`;
  const r = await run(code, { frames: 10, events: [{ at: 4, type: "keydown", key: "K_a" }] });
  assert.equal(r.stdout, "key a\nclosed\n");
  assert.equal(r.window.frames, 10);
  assert.deepEqual(r.frames.filter((f) => !f.same).map((f) => f.index), [1, 5]);
  assert.equal(r.window.log, "fill (255, 255, 255)");
});

test("timers come due while a program waits: held frames go by a frame's time apart, and event.wait(timeout) waits at most that long", async () => {
  const code = `import pygame
pygame.init()
window = pygame.display.set_mode((100, 60))
clock = pygame.time.Clock()
pygame.time.set_timer(pygame.USEREVENT, 1000)
count = 3
window.fill((0, 0, 0))
pygame.display.flip()
while True:
    for event in pygame.event.get():
        if event.type == pygame.USEREVENT:
            count -= 1
            print(count, "at", pygame.time.get_ticks())
            window.fill((80 * count, 0, 0))
            pygame.display.flip()
        if event.type == pygame.QUIT:
            print("closed at", pygame.time.get_ticks())
            exit()
    clock.tick(60)
`;
  const r = await run(code, { frames: 200 });
  // A countdown that draws only when its timer comes: a second is 60 frames, as on a screen.
  assert.equal(r.stdout, "2 at 1000\n1 at 2000\n0 at 3000\nclosed at 3316\n");
  const drawn = r.frames.filter((f) => !f.same);
  assert.deepEqual(drawn.map((f) => [f.index, f.ms]), [[1, 0], [61, 1000], [121, 2000], [181, 3000]]);
  // The same with event.wait(); wait(1000) ends at a timer's event, wait(30) with nothing after 30 ms. The 4 frames of
  // those 80 ms go by before the program first draws: the first is the new window as it is, the others repeat it.
  const waits = `import pygame
pygame.init()
window = pygame.display.set_mode((100, 60))
pygame.time.set_timer(pygame.USEREVENT, 50, 1)
event = pygame.event.wait(1000)
print(pygame.event.event_name(event.type), pygame.time.get_ticks())
event = pygame.event.wait(30)
print(pygame.event.event_name(event.type), pygame.time.get_ticks())
pygame.time.set_timer(pygame.USEREVENT, 1000)
seconds = 0
window.fill((0, 0, 0))
pygame.display.flip()
while True:
    event = pygame.event.wait()
    if event.type == pygame.USEREVENT:
        seconds += 1
        window.fill((40 * seconds, 0, 0))
        pygame.display.flip()
    if event.type == pygame.QUIT:
        print(seconds, "seconds at", pygame.time.get_ticks())
        break
`;
  const w = await run(waits, { frames: 150 });
  assert.equal(w.stdout, "UserEvent 50\nNoEvent 80\n2 seconds at 2496\n");
  assert.deepEqual(w.frames.filter((f) => !f.same).map((f) => [f.index, f.ms]), [[1, 16], [5, 80], [65, 1080], [125, 2080]]);
  // event.wait(16) to pace a loop: every round is a frame, 16 ms after the one before.
  const paced = await run("import pygame\nscreen = pygame.display.set_mode((50, 50))\nx = 0\nwhile True:\n    if pygame.event.wait(16).type == pygame.QUIT:\n        print('x', x)\n        break\n    x += 2\n    screen.fill((0, 0, 0))\n    pygame.display.flip()\n", { frames: 5 });
  assert.equal(paced.stdout, "x 10\n");
  assert.deepEqual(paced.frames.map((f) => [f.ms, !!f.same]), [[16, false], [32, false], [48, false], [64, false], [80, false]]);
  // A key pressed while it waits with a timeout comes at its frame, as in pygame (a key at 1650 ms: one time-out before
  // it); so does the window's closing after its last frame.
  const keyWait = `import pygame
screen = pygame.display.set_mode((50, 50))
screen.fill((0, 0, 0))
pygame.display.flip()
timeouts = 0
while True:
    event = pygame.event.wait(1000)
    if event.type == pygame.NOEVENT:
        timeouts += 1
    elif event.type == pygame.KEYDOWN:
        print("key after", timeouts, "timeouts at", pygame.time.get_ticks())
    elif event.type == pygame.QUIT:
        print("closed at", pygame.time.get_ticks())
        break
`;
  const late = await run(keyWait, { frames: 150, events: [{ at: 100, type: "keydown", key: "K_SPACE" }] });
  assert.equal(late.stdout, "key after 1 timeouts at 1650\nclosed at 2483\n");
  const soon = await run(keyWait, { frames: 30, events: [{ at: 5, type: "keydown", key: "K_SPACE" }] });
  assert.equal(soon.stdout, "key after 0 timeouts at 66\nclosed at 483\n");
  assert.equal(soon.window.frames, 30);
});

test("what a program does at a frame never depends on the frames to come: with more frames, or a key at a later frame, the frames before stay the same", async () => {
  // The window panel relies on it: it runs the program again with more frames, or with the learner's key at the frame on
  // screen, and keeps the frames it has. A clock that waits a second at a time sees each second's 60 frames go by.
  const clock = `import pygame
screen = pygame.display.set_mode((100, 60))
seconds = 0
color = (255, 0, 0)
def draw():
    screen.fill((0, 0, 0))
    pygame.draw.rect(screen, color, (seconds, 10, 5, 5))
    pygame.display.flip()
draw()
while True:
    event = pygame.event.wait(1000)
    if event.type == pygame.NOEVENT:
        seconds += 1
        draw()
    if event.type == pygame.KEYDOWN:
        print("key at", pygame.time.get_ticks())
        color = (0, 255, 0)
        draw()
    if event.type == pygame.QUIT:
        print("closed at", pygame.time.get_ticks(), "seconds", seconds)
        break
`;
  const frames = (r, n) => r.frames.slice(0, n).map((f) => [f.index, f.ms, !!f.same, f.log]);
  const short = await run(clock, { frames: 60 });
  const long = await run(clock, { frames: 120 });
  assert.equal(short.stdout, "closed at 983 seconds 0\n");
  assert.equal(long.stdout, "closed at 1983 seconds 1\n");
  assert.deepEqual(frames(long, 60), frames(short, 60));
  assert.deepEqual(long.frames.filter((f) => !f.same).map((f) => [f.index, f.ms]), [[1, 0], [61, 1000]]);
  const key = await run(clock, { frames: 120, events: [{ at: 70, type: "keydown", key: "K_SPACE" }] });
  assert.equal(key.stdout, "key at 1150\nclosed at 1966 seconds 1\n");
  assert.deepEqual(frames(key, 70), frames(long, 70));
  // A timer that comes while it waits with a timeout: the same.
  const timer = "import pygame\nscreen = pygame.display.set_mode((50, 50))\npygame.time.set_timer(pygame.USEREVENT, 500)\nn = 0\nscreen.fill((0, 0, 0))\npygame.display.flip()\nwhile True:\n    event = pygame.event.wait(1000)\n    if event.type == pygame.USEREVENT:\n        n += 1\n        screen.fill((n, 0, 0))\n        pygame.display.flip()\n    if event.type == pygame.QUIT:\n        print('n', n)\n        break\n";
  const t60 = await run(timer, { frames: 60 });
  const t120 = await run(timer, { frames: 120 });
  assert.deepEqual([t60.stdout, t120.stdout], ["n 1\n", "n 3\n"]);
  assert.deepEqual(frames(t120, 60), frames(t60, 60));
});

test("looking at the keys or the mouse isn't waiting: a program may call get_pressed and get_pos many times a frame", async () => {
  const code = LOOP(
    "    for cell in range(25):\n        if pygame.key.get_pressed()[pygame.K_SPACE] or pygame.Rect(cell * 8, 0, 8, 8).collidepoint(pygame.mouse.get_pos()):\n            x += 1\n    window.fill((0, 0, 0))",
  );
  const r = await run(code, { frames: 10, events: [{ at: 4, type: "mousemove", pos: [20, 4] }] });
  assert.equal(r.window.ended, "closed");
  assert.equal(r.frames.filter((f) => f.same).length, 0, "every frame is drawn");
  // A program that waits by looking at the keys, with event.pump() in its loop, still waits (a mouse move it never takes doesn't keep it busy).
  const looks = "import pygame\nscreen = pygame.display.set_mode((50, 50))\nscreen.fill((0, 0, 0))\npygame.display.flip()\nwhile not pygame.key.get_pressed()[pygame.K_SPACE]:\n    pygame.event.pump()\nprint('space')\n";
  const l = await run(looks, { frames: 20, events: [{ at: 2, type: "mousemove", pos: [5, 5] }, { at: 8, type: "keydown", key: "K_SPACE" }] });
  assert.equal(l.stdout, "space\n");
  assert.equal(l.window.frames, 8);
});

test("a program that waits for one kind of event is closed as usual, though other events wait in the queue", async () => {
  const code = "import pygame\nscreen = pygame.display.set_mode((50, 50))\nscreen.fill((0, 0, 0))\npygame.display.flip()\nwaiting = True\nwhile waiting:\n    for event in pygame.event.get(pygame.QUIT):\n        waiting = False\nprint('done')\n";
  const r = await run(code, { frames: 5, events: [{ at: 0, type: "mousemove", pos: [3, 4] }] });
  assert.equal(r.timedOut, false);
  assert.equal(r.stdout, "done\n");
  assert.equal(r.window.frames, 5);
  assert.equal(r.window.ended, "closed");
});

test("clock.tick() without a frame rate counts a frame's time too, so movement by elapsed time moves", async () => {
  const code = "import pygame\nscreen = pygame.display.set_mode((50, 50))\nclock = pygame.time.Clock()\nx = 0\nfor i in range(5):\n    dt = clock.tick() / 1000\n    x += 100 * dt\n    pygame.display.flip()\nprint(round(x, 2), pygame.time.get_ticks())\n";
  const r = await run(code, { frames: 10 });
  assert.equal(r.stdout, "8.0 83\n");
});

test("key.set_repeat: a held key comes again and again, as in pygame", async () => {
  const code = `import pygame
pygame.init()
screen = pygame.display.set_mode((300, 60))
pygame.key.set_repeat(100)
print(pygame.key.get_repeat())
try:
    pygame.key.set_repeat(-1)
except ValueError as e:
    print(e)
pygame.key.set_repeat(100, 50)
clock = pygame.time.Clock()
x = 0
while True:
    for event in pygame.event.get():
        if event.type == pygame.KEYDOWN and event.key == pygame.K_RIGHT:
            x += 10
        if event.type == pygame.QUIT:
            print("x", x)
            exit()
    screen.fill((0, 0, 0))
    pygame.display.flip()
    clock.tick(60)
`;
  const r = await run(code, { frames: 60, events: [{ at: 1, type: "keydown", key: "K_RIGHT" }, { at: 50, type: "keyup", key: "K_RIGHT" }] });
  // Pressed at 16 ms and let go at 833 ms: the first press, then again at 116 ms and every 50 ms after (15 times).
  assert.equal(r.stdout, "(100, 100)\ndelay and interval must equal at least 0\nx 160\n");
});

test("display.update(rect): in a program that asks for events or ticks its clock, the parts it updates one by one make one frame", async () => {
  const code = `import pygame
pygame.init()
window = pygame.display.set_mode((100, 60))
clock = pygame.time.Clock()
rounds = 0
while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            print("rounds", rounds)
            exit()
    window.fill((0, 0, 0))
    for i in range(4):
        box = pygame.Rect(i * 20, 10, 10, 10)
        pygame.draw.rect(window, (0, 255, 0), box)
        pygame.display.update(box)
    rounds += 1
    clock.tick(60)
`;
  const r = await run(code, { frames: 8 });
  assert.equal(r.stdout, "rounds 8\n");
  assert.equal(r.window.frames, 8);
  assert.ok(r.frames.every((f) => f.log.split("\n").length === 5), "no frame is half drawn");
  // Erasing a ball, updating its old place, drawing it and updating its new place (which overlaps the old one) is one
  // frame a round: the same frames as the program with flip().
  const ball = `import pygame
screen = pygame.display.set_mode((200, 60))
clock = pygame.time.Clock()
ball = pygame.Rect(0, 20, 20, 20)
rounds = 0
while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            print("rounds", rounds)
            exit()
    screen.fill((0, 0, 0), ball)
    pygame.display.update(ball)
    ball.x += 2
    pygame.draw.rect(screen, (255, 0, 0), ball)
    pygame.display.update(ball)
    rounds += 1
    clock.tick(60)
`;
  const parts = await run(ball, { frames: 10 });
  const flipped = await run(ball.replace("    pygame.display.update(ball)\n    ball.x", "    ball.x").replace("pygame.display.update(ball)", "pygame.display.flip()"), { frames: 10 });
  assert.equal(parts.stdout, "rounds 10\n");
  assert.equal(parts.window.ended, "closed");
  assert.deepEqual(parts.frames.map((f) => [f.log, f.ms]), flipped.frames.map((f) => [f.log, f.ms]));
  assert.equal(parts.frames[0].log.split("\n").at(-1), "rect (255, 0, 0) (2, 20, 20, 20)");
  // So is a tile map that updates each of its 144 tiles, one at a time.
  const tiles = `import pygame
screen = pygame.display.set_mode((240, 240))
clock = pygame.time.Clock()
rounds = 0
while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            print("rounds", rounds)
            exit()
    for row in range(12):
        for col in range(12):
            tile = pygame.Rect(col * 20, row * 20, 20, 20)
            pygame.draw.rect(screen, ((rounds * 40 + row + col) % 256, 0, 0), tile)
            pygame.display.update(tile)
    rounds += 1
    clock.tick(60)
`;
  const map = await run(tiles, { frames: 6 });
  const mapFlipped = await run(tiles.replace("pygame.display.update(tile)", "pass").replace("    rounds += 1", "    pygame.display.flip()\n    rounds += 1"), { frames: 6 });
  assert.equal(map.stdout, "rounds 6\n");
  assert.equal(map.window.ended, "closed");
  assert.deepEqual(map.frames.map((f) => [f.log, f.ms]), mapFlipped.frames.map((f) => [f.log, f.ms]));
  // A loop that never asks for events or ticks its clock shows each update as a frame, and is stopped after the last one.
  const again = await run("import pygame\nscreen = pygame.display.set_mode((50, 50))\nx = 0\nwhile True:\n    screen.fill((0, 0, 0))\n    pygame.draw.rect(screen, (255, 0, 0), (x, 0, 5, 5))\n    pygame.display.update((0, 0, 50, 50))\n    x += 1\n", { frames: 5 });
  assert.equal(again.window.frames, 5);
  assert.equal(again.window.ended, "stopped");
  assert.deepEqual(again.frames.map((f) => f.log.split("\n").at(-1)), [0, 1, 2, 3, 4].map((x) => `rect (255, 0, 0) (${x}, 0, 5, 5)`));
  // So, in the end, does one that asked for events once and then never again.
  const once = await run("import pygame\nscreen = pygame.display.set_mode((50, 50))\npygame.event.get()\nx = 0\nwhile True:\n    screen.fill((0, 0, 0))\n    pygame.draw.rect(screen, (255, 0, 0), (x % 50, 0, 5, 5))\n    pygame.display.update((0, 0, 50, 50))\n    x += 1\n", { frames: 5 });
  assert.equal(once.timedOut, false);
  assert.equal(once.window.frames, 5);
  assert.equal(once.window.ended, "stopped");
});

test("the window keeps its size after pygame.quit(); display.Info() before set_mode tells the screen's size", async () => {
  const code = "import pygame, sys\npygame.init()\nscreen = pygame.display.set_mode((320, 200))\nwhile True:\n    for event in pygame.event.get():\n        if event.type == pygame.QUIT:\n            pygame.quit()\n            sys.exit()\n    screen.fill((0, 0, 0))\n    pygame.display.flip()\n";
  const r = await run(code, { frames: 3 });
  assert.equal(r.window.ended, "closed");
  assert.deepEqual(r.window.size, [320, 200]);
  const info = "import pygame\npygame.init()\ninfo = pygame.display.Info()\nscreen = pygame.display.set_mode((info.current_w, info.current_h))\nprint(screen.get_size() == pygame.display.get_desktop_sizes()[0])\npygame.display.flip()\n";
  const i = await run(info, { frames: 3 });
  assert.equal(i.stdout, "True\n");
  assert.deepEqual(i.window.size, [640, 480]);
});

test("a program that waits before it draws: the new window's first frame has a picture (black), and the held frames repeat it", async () => {
  const code = "import pygame\nscreen = pygame.display.set_mode((40, 30))\nx = 0\nwhile True:\n    event = pygame.event.wait(100)\n    if event.type == pygame.QUIT:\n        break\n    x += 1\n    screen.fill((0, 0, 0))\n    pygame.draw.rect(screen, (255, 0, 0), (x, 5, 10, 10))\n    pygame.display.flip()\n";
  const r = await run(code, { frames: 20, png: "all" });
  assert.equal(r.exit, 0, r.stderr);
  assert.equal(r.frames[0].index, 1);
  assert.ok(r.frames[0].png, "frame 1 has a picture");
  assert.ok(!r.frames[0].same, "frame 1 isn't a repeat of a frame before it");
  assert.equal(r.frames[0].log, "");
  const firstDrawn = r.frames.find((f) => f.log !== "");
  assert.ok(firstDrawn && firstDrawn.index > 1 && firstDrawn.png, "the first drawing comes later, with its own picture");
  for (const f of r.frames.filter((f) => f.index > 1 && f.index < firstDrawn.index)) assert.ok(f.same && !f.png, `frame ${f.index} repeats frame 1`);
  // A run from a later frame (pngFrom) gives frame 1 no picture: the page keeps the one it has.
  const later = await run(code, { frames: 20, png: "all", pngFrom: 3 });
  assert.equal(later.frames[0].png, null);
  assert.deepEqual(later.frames.map((f) => f.log), r.frames.map((f) => f.log), "the same frames");
});
