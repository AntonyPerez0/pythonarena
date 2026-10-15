// Shapes shared by the page and the run worker.

/** One of the program's files: main.py, or a module of its own next to it (helpers.py). */
export type SourceFile = { path: string; text: string };

/**
 * One run's input: stdin text, files in the program's folder (text, or the bytes of a file that
 * isn't text), command-line arguments (sys.argv after the program's name), and `call`, a test's own
 * code: the program is then loaded as a module (code under `if __name__ == "__main__":` doesn't
 * run) and the call runs in its namespace, printing its last expression's value like the
 * interactive interpreter.
 */
export type RunInput = { stdin?: string; args?: string[]; files?: Record<string, string | Uint8Array>; call?: string; window?: WindowSpec };

/**
 * Something that happens in a pygame window (src/engine/arena_pygame.py): a key pressed or let go
 * ("K_LEFT", "K_a", "K_SPACE"), the mouse moved or a button pressed or let go at a point of the
 * window, or the window closed. `at` is how many frames the window had shown when it happened.
 */
export type WindowEvent = {
  at: number;
  type: "keydown" | "keyup" | "mousedown" | "mouseup" | "mousemove" | "quit";
  key?: string;
  pos?: [number, number];
  button?: number;
  unicode?: string;
};

/**
 * A pygame window's run: how many frames it may show (then it's closed), what happens in it, and
 * which frames get a picture ("all", only from frame `pngFrom` on; "last"; "none"). `seed` seeds
 * random, so that every run of the same window goes the same way.
 */
export type WindowSpec = { frames?: number; events?: WindowEvent[]; png?: "all" | "last" | "none"; pngFrom?: number; seed?: number };

/**
 * One frame a pygame window showed: its number (from 1), its picture (a PNG; null for a frame shown
 * before), its text (the drawing that made it), and `ms`, the program's clock when it was shown (a
 * game that ticks at 60 frames a second shows a frame every 16 or 17 ms), for playing frames back.
 */
export type WindowFrame = { index: number; log: string; png: Uint8Array | null; title: string; ms: number; same?: boolean };

/**
 * How a pygame program's window ended: the frames it showed (of `budget`), its size and title, how
 * it ended ("program": the program ended by itself; "closed": it ended when the window was closed
 * after its last frame; "stopped": it kept drawing after that and was stopped), and its last frame's
 * text and picture.
 */
export type WindowResult = {
  frames: number;
  budget: number;
  size: [number, number] | null;
  title: string;
  ended: "program" | "closed" | "stopped";
  log: string;
  png?: Uint8Array | null;
};

export type RunResult = {
  stdout: string;
  stderr: string;
  /** stdout and stderr together, in the order the program wrote them (as a terminal shows them). */
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  ms: number;
  /** Files in the program's working folder after the run (not its .py files): the text of each, or its bytes when it isn't text (UTF-8). */
  files: Record<string, string | Uint8Array>;
  /** A call test: where the call's own output starts in stdout (what loading the program printed comes first). */
  callStart: number | null;
  /** A call test whose error was in the test's own code: the learner's code couldn't be called (a missing or misspelled function, the wrong number of arguments). */
  callError: boolean;
  /** A call test: loading the program asked for input (code outside `if __name__ == "__main__":`). */
  loadInput: boolean;
  /** A call test whose last line is an expression: whether its value was None ("none") or something else ("value"). */
  callValue: "none" | "value" | null;
  /** A pygame program: its window (null for other programs). */
  window?: WindowResult | null;
  /** Set when the engine failed to run the program at all. */
  internalError?: string;
  /** On the first case only: time from asking for a runner to the program starting. */
  workerStartMs?: number;
};

export type EngineStatus =
  | { state: "idle" }
  | { state: "loading"; loaded: number; total: number; stage: "download" | "cache" | "start" }
  | { state: "ready" }
  | { state: "error"; message: string };
