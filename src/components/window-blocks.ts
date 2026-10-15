// pygame windows and images in lesson text, drawn the same way by the page (Markdown.tsx, which puts
// a playable window in place of each window figure) and the pre-rendered pages (scripts/prerender.mjs):
//
// - ```asset robot.png: one of the site's images (content/assets, published at images/), with its
//   name and size (the build writes "40x40" into the block).
// - ```window-shot: a python window example's window, written by the build: the picture of its last
//   frame, its title and size, and its drawing as text (see src/engine/arena_pygame.py).
//
// It also says a test's events in words, for the task card and the results.
import type { WindowEvent } from "../engine/types";

/** A python window example, as the build describes it in a ```window-shot block. */
export type WindowShot = {
  /** Its last frame's picture, a path from the site's root. */
  image: string;
  size: [number, number] | null;
  title: string;
  /** How many frames it showed. */
  frames: number;
  /** Its last frame's drawing, as text. */
  log: string;
  ended: string;
  /** The program, and what it ran with: its window's frames and events, the images and files in its folder. */
  code: string;
  window: { frames: number; events: WindowEvent[] };
  assets?: string[];
  files?: Record<string, string>;
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function parseShot(text: string): WindowShot | null {
  try {
    const shot = JSON.parse(text) as WindowShot;
    return shot && typeof shot.image === "string" ? shot : null;
  } catch {
    return null;
  }
}

const KEY_NAMES: Record<string, string> = {
  K_LEFT: "←",
  K_RIGHT: "→",
  K_UP: "↑",
  K_DOWN: "↓",
  K_SPACE: "Space",
  K_RETURN: "Enter",
  K_ESCAPE: "Esc",
  K_BACKSPACE: "Backspace",
  K_TAB: "Tab",
  K_LSHIFT: "Shift",
  K_RSHIFT: "right Shift",
  K_LCTRL: "Ctrl",
  K_RCTRL: "right Ctrl",
  K_LALT: "Alt",
  K_RALT: "right Alt",
};

/** A key as it's written on the keyboard: → for K_RIGHT, A for K_a, 1 for K_1. */
export function keyLabel(key: string): string {
  if (KEY_NAMES[key]) return KEY_NAMES[key];
  const m = /^K_(.+)$/.exec(key);
  if (!m) return key;
  return m[1].length === 1 ? m[1].toUpperCase() : m[1].charAt(0) + m[1].slice(1).toLowerCase();
}

/** The words for a key in a sentence: "the right arrow", "the A key". */
function keyWords(key: string): string {
  const arrows: Record<string, string> = { K_LEFT: "the left arrow", K_RIGHT: "the right arrow", K_UP: "the up arrow", K_DOWN: "the down arrow" };
  return arrows[key] ?? `the ${keyLabel(key)} key`;
}

/**
 * What happens in a window, in words, one line per moment: "After 5 frames: the right arrow is
 * pressed." Events at the same moment share a line; a press and release at once is "pressed and let go".
 */
export function describeEvents(events: WindowEvent[]): string[] {
  const lines: string[] = [];
  const byFrame = new Map<number, WindowEvent[]>();
  for (const e of events) byFrame.set(e.at, [...(byFrame.get(e.at) ?? []), e]);
  for (const [at, list] of [...byFrame.entries()].sort((a, b) => a[0] - b[0])) {
    const parts: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const next = list[i + 1];
      if (e.type === "keydown" && next?.type === "keyup" && next.key === e.key) {
        parts.push(`${keyWords(e.key!)} is pressed and let go`);
        i++;
      } else if (e.type === "mousedown" && next?.type === "mouseup" && next.pos?.[0] === e.pos?.[0] && next.pos?.[1] === e.pos?.[1]) {
        parts.push(`a ${e.button === 3 ? "right " : ""}click at (${e.pos![0]}, ${e.pos![1]})`);
        i++;
      } else if (e.type === "keydown") parts.push(`${keyWords(e.key!)} is pressed`);
      else if (e.type === "keyup") parts.push(`${keyWords(e.key!)} is let go`);
      else if (e.type === "mousedown") parts.push(`the mouse button is pressed at (${e.pos![0]}, ${e.pos![1]})`);
      else if (e.type === "mouseup") parts.push(`the mouse button is let go at (${e.pos![0]}, ${e.pos![1]})`);
      else if (e.type === "mousemove") parts.push(`the mouse moves to (${e.pos![0]}, ${e.pos![1]})`);
      else if (e.type === "quit") parts.push("the window is closed");
    }
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
    lines.push(`${at === 0 ? "At the start" : `After ${at} ${at === 1 ? "frame" : "frames"}`}: ${joined}.`);
  }
  return lines;
}

/** A window's run in one sentence: "The window shows 30 frames, then it's closed." */
export function windowRunText(frames: number, events: WindowEvent[]): string {
  return `The window shows ${frames} ${frames === 1 ? "frame" : "frames"}${events.length ? " while this happens" : ""}, then it's closed.`;
}

/** A window: its title bar (title, size), its picture and its drawing as text. */
export function windowFigureHtml(o: { src: string; title: string; size: [number, number] | null; log: string; alt: string; caption?: string; attrs?: string }): string {
  const [w, h] = o.size ?? [0, 0];
  const dims = o.size ? ` width="${w}" height="${h}"` : "";
  return (
    `<figure class="pg-window"${o.attrs ?? ""}${o.size ? ` style="--w:${w};--h:${h}"` : ""}>` +
    `<div class="pg-titlebar"><span class="pg-title">${esc(o.title)}</span>${o.size ? `<span class="pg-size">${w} × ${h}</span>` : ""}</div>` +
    `<div class="pg-screen"><img src="${esc(o.src)}" alt="${esc(o.alt)}"${dims} loading="lazy" decoding="async"></div>` +
    `<details class="pg-astext"><summary>The window as text</summary><pre tabindex="0">${esc(o.log || "(nothing drawn)")}</pre></details>` +
    (o.caption ? `<figcaption>${esc(o.caption)}</figcaption>` : "") +
    `</figure>\n`
  );
}

/** A ```window-shot block's figure; `base` is the site's base path (/ or /pythonarena/). */
export function windowShotHtml(shot: WindowShot, base: string, index?: number): string {
  const events = describeEvents(shot.window.events);
  const caption = `The window after ${shot.frames} ${shot.frames === 1 ? "frame" : "frames"}${events.length ? ` (${events.join(" ")})` : ""}.`;
  return windowFigureHtml({
    src: base + shot.image,
    title: shot.title,
    size: shot.size,
    log: shot.log,
    alt: `The program's window after ${shot.frames} ${shot.frames === 1 ? "frame" : "frames"}`,
    caption,
    attrs: index != null ? ` data-window-shot="${index}"` : "",
  });
}

/** An ```asset block: the image, with its name and size. */
export function assetHtml(name: string, size: string, base: string): string {
  const m = /^(\d+)x(\d+)$/.exec(size.trim());
  const dims = m ? ` width="${m[1]}" height="${m[2]}"` : "";
  return `<figure class="asset-img"${m ? ` style="--w:${m[1]}"` : ""}><img src="${esc(base)}images/${esc(name)}" alt="The image ${esc(name)}"${dims} loading="lazy" decoding="async"><figcaption><code>${esc(name)}</code>${m ? `, ${m[1]} × ${m[2]} pixels` : ""}</figcaption></figure>\n`;
}
