import { lazy, Suspense, useMemo, useState } from "react";
import { marked } from "marked";
import { Play } from "lucide-react";
import { codeLinesHtml } from "./code-lines";
import { highlightHtml } from "./highlight";
import { readOnlyBlockHtml } from "./code-blocks";
import { assetHtml, parseShot, windowShotHtml, type WindowShot } from "./window-blocks";
import { MAIN_FILE, splitFiles } from "../grader/files.js";

// The window panel (and the engine's client) load only when a lesson's window is played.
const WindowPanel = lazy(() => import("./WindowPanel"));
const BASE = import.meta.env.BASE_URL;

const LABELS: Record<string, string> = { output: "Output", input: "Input", crash: "Python stops with" };
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A session of the interactive interpreter (a ```pycon block, made from ```python repl): the >>> and
 * ... prompts dimmed, the code after them highlighted, and what Python printed as it is.
 */
export function replHtml(text: string): string {
  return text
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => {
      const m = /^(>>>|\.\.\.)( ?)(.*)$/.exec(line);
      return m ? `<span class="tk-prompt">${esc(m[1])}</span>${m[2]}${highlightHtml(m[3])}` : `<span class="repl-out">${esc(line)}</span>`;
    })
    .join("\n");
}

marked.setOptions({ gfm: true, breaks: false });
// Set while a drill's Markdown is parsed (parsing is synchronous): its Python and plain code blocks
// (a boss rep's "The test runs" and "and expects") wrap on a phone like the drill's own code (see
// CodeView's `wrap`).
let wrapCode = false;
// Set while a lesson's Markdown is parsed for the page: its window examples, each drawn as a placeholder
// that the Markdown component replaces with a window that can play.
let shots: WindowShot[] | null = null;
marked.use({
  renderer: {
    code({ text, lang }) {
      // Python gets the site's colors; output, input and crash blocks get a label.
      if (lang === "python") {
        const py = (t: string) => (wrapCode ? `<pre class="code-py wraps"><code>${codeLinesHtml(t.replace(/\n$/, ""))}</code></pre>` : `<pre class="code-py"><code>${highlightHtml(t)}</code></pre>`);
        const files = splitFiles(text) as { path: string; text: string }[];
        // A program of several files: each one under its name.
        if (files.length > 1 || files[0].path !== MAIN_FILE || text !== files[0].text)
          return files.map((f) => `<figure class="code-file"><figcaption>${esc(f.path)}</figcaption>${py(f.text.replace(/\n$/, ""))}</figure>\n`).join("");
        return py(text) + "\n";
      }
      if (lang === "pycon") return `<figure class="io io-repl"><figcaption>In the Python interpreter</figcaption><pre class="code-py"><code>${replHtml(text)}</code></pre></figure>\n`;
      const asset = lang ? /^asset\s+(\S+)$/.exec(lang) : null;
      if (asset) return assetHtml(asset[1], text, BASE);
      if (lang === "window-shot") {
        const shot = parseShot(text);
        if (!shot) return "";
        if (shots) {
          shots.push(shot);
          return `<div data-window-shot="${shots.length - 1}"></div>\n`;
        }
        return windowShotHtml(shot, BASE);
      }
      const file = lang ? /^file\s+(\S+)$/.exec(lang) : null;
      if (file) return `<figure class="io io-file"><figcaption>The file ${esc(file[1])}</figcaption><pre><code>${esc(text)}</code></pre></figure>\n`;
      const label = lang ? LABELS[lang] : undefined;
      // Input that ends with an empty line (the program reads until one) shows it.
      if (lang === "input" && /\n$/.test(text))
        return `<figure class="io io-input"><figcaption>${label}</figcaption><pre><code>${esc(text.replace(/\n$/, ""))}\n<span class="input-empty">(an empty line)</span></code></pre></figure>\n`;
      if (label) return `<figure class="io io-${lang}"><figcaption>${label}</figcaption><pre><code>${esc(text)}</code></pre></figure>\n`;
      // Code to read in another language (```xml, ```xml pom.xml) and commands for your own computer (```shell): shown, never run.
      const other = readOnlyBlockHtml(lang, text);
      if (other) return other;
      // Any other block (no language, "text") is plain text, line by line in a drill.
      if (wrapCode) return `<pre class="wraps"><code>${codeLinesHtml(text.replace(/\n$/, ""), false)}</code></pre>\n`;
      return false;
    },
    codespan({ text }) {
      // A lambda's arrow stays in one piece when running text wraps on a phone.
      return `<code>${text.replace(/-&gt;/g, '<span class="nw">-&gt;</span>')}</code>`;
    },
  },
});

/** Moves every heading so the shallowest becomes <h{top}>, keeping the page outline in order. */
export function shiftHeadings(html: string, top: number): string {
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  if (levels.length === 0) return html;
  const shift = top - Math.min(...levels);
  if (shift === 0) return html;
  return html.replace(/<(\/?)h([1-6])([\s>])/g, (_, slash, n, after) => `<${slash}h${Math.min(6, Math.max(1, Number(n) + shift))}${after}`);
}

/** Lesson Markdown as HTML (the content is written in this repository and checked at build time). */
export function markdownHtml(text: string, top?: number, wrap = false): string {
  wrapCode = wrap;
  let parsed: string;
  try {
    parsed = marked.parse(text, { async: false }) as string;
  } finally {
    wrapCode = false;
  }
  // Code blocks and tables can scroll sideways, so they must be reachable with the keyboard.
  const out = parsed.replace(/<(pre|table)([ >])/g, '<$1 tabindex="0"$2');
  return top ? shiftHeadings(out, top) : out;
}

/** Markdown; with `wrapCode` (drills), its code blocks wrap on a phone instead of scrolling sideways. */
export default function Markdown({ text, className = "", top, wrapCode = false }: { text: string; className?: string; top?: number; wrapCode?: boolean }) {
  const { html, found } = useMemo(() => {
    shots = [];
    try {
      return { html: markdownHtml(text, top, wrapCode), found: shots };
    } finally {
      shots = null;
    }
  }, [text, top, wrapCode]);
  if (!found.length) return <div className={"md " + className} dangerouslySetInnerHTML={{ __html: html }} />;
  // A lesson with pygame windows: the text between them as HTML, each window a component of its own.
  const parts = html.split(/<div data-window-shot="(\d+)"><\/div>\n?/);
  return (
    <div className={"md " + className}>
      {parts.map((part, i) => (i % 2 ? <ShotFigure key={i} shot={found[Number(part)]} /> : <div key={i} className="md-part" dangerouslySetInnerHTML={{ __html: part }} />))}
    </div>
  );
}

/** A lesson's window example: the picture of its last frame, then, after Play, the program running in the browser. */
function ShotFigure({ shot }: { shot: WindowShot }) {
  const [playing, setPlaying] = useState(false);
  const files = useMemo(() => splitFiles(shot.code) as { path: string; text: string }[], [shot.code]);
  if (playing)
    return (
      <div className="pg-shot">
        <Suspense fallback={<div dangerouslySetInnerHTML={{ __html: windowShotHtml(shot, BASE) }} />}>
          <WindowPanel files={files} assets={shot.assets} given={shot.files} start={shot.window} autoStart live={false} label="The example's window" />
        </Suspense>
      </div>
    );
  return (
    <div className="pg-shot">
      <div dangerouslySetInnerHTML={{ __html: windowShotHtml(shot, BASE) }} />
      <button type="button" className="btn pg-play" onClick={() => setPlaying(true)}>
        <Play className="icon" aria-hidden="true" /> Play this example
      </button>
    </div>
  );
}

export function InlineMd({ text }: { text: string }) {
  const html = useMemo(() => marked.parseInline(text, { async: false }) as string, [text]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
