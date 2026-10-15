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
export type RunInput = { stdin?: string; args?: string[]; files?: Record<string, string | Uint8Array>; call?: string };

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
