// A pygame program's window on the page: its frames played back at the program's own pace, the keys
// and clicks the learner gives it, and more frames on request.
//
// The program runs in the browser without a screen (src/engine/arena_pygame.py), from its first line
// every time: a run is given everything that happened so far (each key and click at the frame it came)
// and how many frames to show, and draws pictures only for the frames the page doesn't have yet. So a
// key pressed at frame 40 re-runs the program with that key at frame 40 and shows frame 41 on. random is
// seeded the same way on every run, so the frames before stay the same.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Pause, Play, RotateCcw, FastForward } from "lucide-react";
import { runPython, type RunResult, type SourceFile, type WindowEvent, type WindowFrame } from "../engine/client";
import { describeRun } from "../grader/grade";
import { assetFiles } from "../grader/assets";
import { useEngineStatus } from "./Engine";
import { keyLabel } from "./window-blocks";

/** Frames added at a time (a second at 60 frames a second). */
const STEP = 60;
/** The most frames one window shows (a minute at 60 frames a second); then Start over. */
export const MAX_FRAMES = 3600;

type Stored = { blob: Blob; log: string; ms: number; title: string };

/** Keys a learner's keyboard sends, as pygame names them. Tab is left alone: it moves the focus. */
function pygameKey(e: { key: string; code: string }): { key: string; unicode: string } | null {
  const named: Record<string, string> = {
    ArrowLeft: "K_LEFT",
    ArrowRight: "K_RIGHT",
    ArrowUp: "K_UP",
    ArrowDown: "K_DOWN",
    " ": "K_SPACE",
    Enter: "K_RETURN",
    Escape: "K_ESCAPE",
    Backspace: "K_BACKSPACE",
    Shift: e.code === "ShiftRight" ? "K_RSHIFT" : "K_LSHIFT",
    Control: e.code === "ControlRight" ? "K_RCTRL" : "K_LCTRL",
    Alt: e.code === "AltRight" ? "K_RALT" : "K_LALT",
  };
  if (named[e.key]) return { key: named[e.key], unicode: e.key === " " ? " " : e.key === "Enter" ? "\r" : "" };
  if (/^[a-zA-Z0-9]$/.test(e.key)) return { key: `K_${e.key.toLowerCase()}`, unicode: e.key };
  return null;
}

/** The keys a program asks about (pygame.K_LEFT, K_a...), for the row of key buttons on a touch screen. */
function keysIn(code: string): string[] {
  const found = new Set<string>();
  for (const m of code.matchAll(/\bK_([A-Za-z0-9_]+)\b/g)) found.add(`K_${m[1]}`);
  const order = ["K_LEFT", "K_UP", "K_DOWN", "K_RIGHT", "K_SPACE", "K_RETURN"];
  return [...found].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b)).slice(0, 12);
}

export type WindowPanelProps = {
  /** The program's files. */
  files: SourceFile[];
  /** Images (content/assets) and other files in the program's folder. */
  assets?: string[];
  given?: Record<string, string>;
  stdin?: string;
  /** What happens to start with (a lesson example's or a test's events) and how many frames to show first. */
  start?: { frames: number; events: WindowEvent[] };
  /** The learner can press keys, click and ask for more frames (a lesson example only plays). */
  interactive?: boolean;
  /** Starts at once (a lesson example's Play). */
  autoStart?: boolean;
  /** Keeps asking for more frames while the program runs (a lesson example plays its own frames, then waits). */
  live?: boolean;
  /** Called after each run (the tests wait on it). */
  onRun?: (r: RunResult) => void;
  /** Names the window for screen readers. */
  label?: string;
};

export default function WindowPanel({ files, assets, given, stdin = "", start, interactive = true, autoStart = false, live = true, onRun, label = "The program's window" }: WindowPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frames = useRef(new Map<number, Stored>());
  const [shown, setShown] = useState(0);
  const [have, setHave] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [pkg, setPkg] = useState<{ loaded: number; total: number } | null>(null);
  const [size, setSize] = useState<[number, number] | null>(null);
  const [started, setStarted] = useState(false);
  const status = useEngineStatus();
  // The session: what happened so far, how many frames it asks for, and the run in progress.
  const session = useRef({ events: [] as WindowEvent[], budget: 0, live: false, generation: 0 });
  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef<{ from: number } | null>(null);
  const shownRef = useRef(0);
  shownRef.current = shown;
  const code = useMemo(() => files.map((f) => f.text).join("\n"), [files]);
  const keys = useMemo(() => keysIn(code), [code]);
  const watchesMouse = /MOUSEMOTION|mouse\.get_pos/.test(code);
  const held = useRef(new Set<string>());

  const draw = useCallback(async (i: number) => {
    const f = frames.current.get(i);
    const canvas = canvasRef.current;
    if (!f || !canvas) return;
    const bitmap = await createImageBitmap(f.blob);
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      setSize([bitmap.width, bitmap.height]);
    }
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
  }, []);

  useEffect(() => {
    if (shown) void draw(shown);
  }, [shown, draw]);

  // Playing: the next frame shows when the program's clock says it should (a frame every 16 or 17 ms at 60 frames a second).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const cur = shownRef.current;
      const next = frames.current.get(cur + 1);
      if (next) {
        const prev = frames.current.get(cur);
        const wait = prev ? Math.min(250, Math.max(0, next.ms - prev.ms)) || 1000 / 60 : 0;
        if (now - last >= wait) {
          last = now;
          setShown(cur + 1);
        }
      } else last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  /** Runs the session as it is now, keeping the frames before `from` and drawing those from `from` on. */
  const runFrom = useCallback(
    (from: number) => {
      if (inFlight.current) {
        // A run is going: the next one starts when it ends, from the earliest frame asked for.
        again.current = { from: Math.min(from, again.current?.from ?? from) };
        return;
      }
      const s = session.current;
      const generation = s.generation;
      setRunning(true);
      const job = (async () => {
        const images = await assetFiles(assets);
        const [r] = await runPython(files, [{ stdin, files: { ...images, ...(given ?? {}) }, window: { frames: s.budget, events: [...s.events], png: "all", pngFrom: from } }], {
          timeLimitMs: 4_000 + s.budget * 12,
          onPackage: (p) => setPkg(p.done ? null : { loaded: p.loaded, total: p.total }),
          onFrame: (_, f: WindowFrame) => {
            if (session.current.generation !== generation || f.index < from) return;
            // A held frame (the program was waiting for events) shows the picture before it again.
            const blob = f.png ? new Blob([f.png as BlobPart], { type: "image/png" }) : f.same ? frames.current.get(f.index - 1)?.blob : undefined;
            if (!blob) return;
            frames.current.set(f.index, { blob, log: f.log, ms: f.ms, title: f.title });
            setHave((h) => Math.max(h, f.index));
          },
        });
        setPkg(null);
        if (session.current.generation !== generation) return;
        setResult(r);
        onRun?.(r);
        // The last frame's picture, when the run's end gave it.
        const win = r.window;
        if (win?.png && win.frames && !frames.current.has(win.frames)) {
          frames.current.set(win.frames, { blob: new Blob([win.png as BlobPart], { type: "image/png" }), log: win.log, ms: frames.current.get(win.frames - 1)?.ms ?? 0, title: win.title });
          setHave((h) => Math.max(h, win.frames));
        }
        // Frames past the end of this run belong to an older one.
        if (win) for (const k of [...frames.current.keys()]) if (k > win.frames) frames.current.delete(k);
        if (win) setHave(win.frames);
        if (!win || win.ended === "program" || r.exitCode !== 0 || r.timedOut) s.live = false;
      })();
      inFlight.current = job;
      job.finally(() => {
        inFlight.current = null;
        setRunning(false);
        const next = again.current;
        again.current = null;
        if (next) runFrom(next.from);
      });
    },
    [files, assets, given, stdin, onRun],
  );

  const begin = useCallback(() => {
    const s = session.current;
    s.generation++;
    s.events = [...(start?.events ?? [])];
    s.budget = start?.frames ?? STEP;
    s.live = interactive && live;
    frames.current.clear();
    held.current.clear();
    setShown(0);
    setHave(0);
    setResult(null);
    setStarted(true);
    setPlaying(true);
    again.current = null;
    runFrom(1);
  }, [start, interactive, live, runFrom]);

  useEffect(() => {
    if (autoStart) begin();
    // Only when the panel first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** More frames: the program runs on from where it is. */
  const more = useCallback(
    (n = STEP) => {
      const s = session.current;
      if (s.budget >= MAX_FRAMES) return;
      const from = s.budget + 1;
      s.budget = Math.min(MAX_FRAMES, s.budget + n);
      setPlaying(true);
      runFrom(from);
    },
    [runFrom],
  );

  // Live: near the end of the frames there are, ask for more (while the program is still running).
  const ended = result?.window?.ended;
  useEffect(() => {
    const s = session.current;
    if (!interactive || !s.live || !playing || running || !result?.window) return;
    if (ended === "program") return;
    if (shown >= have - 20 && s.budget < MAX_FRAMES && have >= s.budget) more();
  }, [shown, have, playing, running, result, ended, interactive, more]);

  /** Something happened in the window: it comes after the frame on the screen, and the program runs again from there. */
  const input = useCallback(
    (e: Omit<WindowEvent, "at">) => {
      if (!started || !interactive) return;
      const s = session.current;
      const at = shownRef.current;
      s.events = [...s.events, { ...e, at }].sort((a, b) => a.at - b.at);
      for (const k of [...frames.current.keys()]) if (k > at) frames.current.delete(k);
      setHave(at);
      s.budget = Math.min(MAX_FRAMES, at + STEP);
      s.live = true;
      setPlaying(true);
      runFrom(at + 1);
    },
    [started, interactive, runFrom],
  );

  const onKey = (e: ReactKeyboardEvent, down: boolean) => {
    if (!interactive || !started) return;
    const k = pygameKey(e);
    if (!k) return;
    e.preventDefault();
    if (e.repeat) return;
    if (down) {
      if (held.current.has(k.key)) return;
      held.current.add(k.key);
      input({ type: "keydown", key: k.key, unicode: k.unicode });
    } else {
      held.current.delete(k.key);
      input({ type: "keyup", key: k.key });
    }
  };

  const point = (e: ReactPointerEvent<HTMLCanvasElement>): [number, number] => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return [Math.max(0, Math.min(c.width - 1, Math.floor(((e.clientX - r.left) / r.width) * c.width))), Math.max(0, Math.min(c.height - 1, Math.floor(((e.clientY - r.top) / r.height) * c.height)))];
  };
  const lastMove = useRef(-1);

  const frame = frames.current.get(shown);
  const budget = session.current.budget;
  const engineLoading = status.state === "loading";
  const state = !started
    ? null
    : pkg
      ? `Loading pygame ${Math.round((pkg.loaded / Math.max(pkg.total, 1)) * 100)}%…`
      : engineLoading
        ? "Starting Python…"
        : running && have <= shown
          ? "Running…"
          : result?.timedOut
            ? "Stopped: the program ran too long."
            : `Frame ${shown} of ${have}${ended === "program" && !running && shown === have ? ", and the program ended" : ""}`;
  const note = result && !running ? describeRun(result, files, 4_000 + budget * 12) : undefined;

  return (
    <div className="pg-panel" data-frames={have} data-shown={shown} data-runs-done={result ? 1 : 0}>
      <figure className="pg-window" style={size ? ({ "--w": size[0], "--h": size[1] } as React.CSSProperties) : undefined}>
        <div className="pg-titlebar">
          <span className="pg-title">{frame?.title ?? result?.window?.title ?? "pygame window"}</span>
          {size && (
            <span className="pg-size">
              {size[0]} × {size[1]}
            </span>
          )}
        </div>
        <div className="pg-screen">
          {!started ? (
            <div className="pg-idle">
              <button type="button" className="btn btn-primary" onClick={begin}>
                <Play className="icon" aria-hidden="true" /> Run the window
              </button>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className={shown ? "" : "pg-empty"}
              tabIndex={interactive ? 0 : -1}
              role={interactive ? "application" : "img"}
              aria-label={interactive ? `${label}. Keys you press here and clicks go to the program.` : `${label}, frame ${shown}`}
              aria-roledescription={interactive ? "pygame window" : undefined}
              onKeyDown={(e) => onKey(e, true)}
              onKeyUp={(e) => onKey(e, false)}
              onBlur={() => {
                // Keys held when the window loses the focus are let go.
                for (const k of held.current) input({ type: "keyup", key: k });
                held.current.clear();
              }}
              onPointerDown={(e) => {
                if (!interactive) return;
                e.currentTarget.focus();
                input({ type: "mousedown", pos: point(e), button: e.button === 2 ? 3 : e.button === 1 ? 2 : 1 });
              }}
              onPointerUp={(e) => interactive && input({ type: "mouseup", pos: point(e), button: e.button === 2 ? 3 : e.button === 1 ? 2 : 1 })}
              onPointerMove={(e) => {
                if (!interactive || !watchesMouse || shownRef.current === lastMove.current) return;
                lastMove.current = shownRef.current;
                input({ type: "mousemove", pos: point(e) });
              }}
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
        </div>
        {started && (
          <details className="pg-astext">
            <summary>The window as text (frame {shown})</summary>
            <pre tabIndex={0}>{frame?.log || "(nothing drawn)"}</pre>
          </details>
        )}
      </figure>

      {started && (
        <div className="pg-controls">
          <button type="button" className="btn" onClick={() => setPlaying(!playing)}>
            {playing ? <Pause className="icon" aria-hidden="true" /> : <Play className="icon" aria-hidden="true" />} {playing ? "Pause" : "Play"}
          </button>
          {interactive && (
            <button type="button" className="btn" onClick={() => more()} disabled={running || ended === "program" || budget >= MAX_FRAMES}>
              <FastForward className="icon" aria-hidden="true" /> {STEP} more frames
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={begin}>
            <RotateCcw className="icon" aria-hidden="true" /> Start over
          </button>
          <label className="pg-scrub">
            <span className="visually-hidden">Frame</span>
            <input
              type="range"
              min={have ? 1 : 0}
              max={have}
              value={shown}
              onChange={(e) => {
                setPlaying(false);
                setShown(Number(e.target.value));
              }}
              aria-valuetext={`Frame ${shown} of ${have}`}
            />
          </label>
        </div>
      )}

      {started && interactive && keys.length > 0 && (
        <div className="pg-keys" role="group" aria-label="Keys for the program">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              className="btn pg-key"
              onPointerDown={(e) => {
                e.preventDefault();
                if (held.current.has(k)) return;
                held.current.add(k);
                input({ type: "keydown", key: k, unicode: /^K_[a-z0-9]$/.test(k) ? k.slice(2) : k === "K_SPACE" ? " " : "" });
              }}
              onPointerUp={() => {
                held.current.delete(k);
                input({ type: "keyup", key: k });
              }}
              onPointerLeave={() => {
                if (!held.current.has(k)) return;
                held.current.delete(k);
                input({ type: "keyup", key: k });
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                input({ type: "keydown", key: k });
                input({ type: "keyup", key: k });
              }}
              aria-label={`Press ${keyLabel(k)}`}
            >
              {keyLabel(k)}
            </button>
          ))}
        </div>
      )}

      {started && (
        <p className="pg-status muted small" aria-live="polite">
          {state}
          {interactive && ` · Click the window, then press keys or click in it.`}
        </p>
      )}
      {result && !running && (result.output || note) && (
        <div className="pg-output">
          {result.output && (
            <>
              <span className="lbl">Output</span>
              <pre tabIndex={0} className="console">
                {result.output}
              </pre>
            </>
          )}
          {note && <div className="t-note">{note}</div>}
        </div>
      )}
    </div>
  );
}
