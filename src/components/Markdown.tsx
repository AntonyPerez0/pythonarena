import { useMemo } from "react";
import { marked } from "marked";
import { codeLinesHtml } from "./code-lines";
import { highlightHtml } from "./highlight";
import { readOnlyBlockHtml } from "./code-blocks";
import { MAIN_FILE, splitFiles } from "../grader/files.js";

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
  const html = useMemo(() => markdownHtml(text, top, wrapCode), [text, top, wrapCode]);
  return <div className={"md " + className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function InlineMd({ text }: { text: string }) {
  const html = useMemo(() => marked.parseInline(text, { async: false }) as string, [text]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
