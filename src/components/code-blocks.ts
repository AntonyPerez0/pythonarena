// Code blocks in lesson text that are shown only, never run: ```xml (code in another language to
// read; ```xml config.xml shows the file's name), ```shell (commands to type on your own computer)
// and ```text (shown as it is). The page (Markdown.tsx) and the pre-rendered pages
// (scripts/prerender.mjs) draw them the same way, and the content build (scripts/build-content.mjs)
// rejects a block of a kind that isn't listed here.

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The kinds of code block lesson text may have besides python ones (each with nothing after it). The build turns ```python repl
 * into pycon. Besides these: ```file NAME (a file the example reads), ```asset NAME.png (an image of content/assets, shown, and
 * in the folder of the examples after it), and ```window after a ```python window example (its frames and events), which the
 * build turns into ```window-shot (the window's picture and text).
 */
export const BLOCK_KINDS = ["input", "output", "crash", "text", "xml", "shell", "pycon"];

/**
 * Why a code block's info string isn't one the page knows (null when it is): no kind (plain text),
 * a python block (the build checks its kind on its own), one of BLOCK_KINDS, `file data.txt`, or
 * `xml config.xml` (an xml block with its file's name).
 */
export function blockKindProblem(info: string): string | null {
  const kind = info.trim();
  if (!kind || /^python\b/.test(kind) || BLOCK_KINDS.includes(kind) || /^file\b/.test(kind) || kind === "window") return null;
  if (kind === "window-shot") return "a window-shot block is written by the build (from a python window example), not by hand";
  const asset = /^asset(?:\s+(\S+))?$/.exec(kind);
  if (asset) return asset[1] && /^[a-z0-9][a-z0-9-]*\.png$/.test(asset[1]) ? null : "an asset block names an image of content/assets, such as ```asset robot.png";
  const xml = /^xml\s+(\S+)$/.exec(kind);
  if (xml) return /^[\w.-]+\.xml$/.test(xml[1]) ? null : `an xml block may name its file, such as \`\`\`xml config.xml (a name that ends in .xml), not "${xml[1]}"`;
  return `a code block's kind "${kind}" isn't one lessons use: a python block (python run, python run crash, python repl, python window, python fragment), input, output, crash, file, asset, window, text (shown as it is), xml or shell (commands to type on your own computer); a block with no kind is plain text`;
}

/** XML with the site's code colors: tag names as keywords, attribute names as names, values as strings, comments, and the <?xml ...?> line. */
export function xmlHighlightHtml(code: string): string {
  const span = (cls: string, t: string) => `<span class="${cls}">${esc(t)}</span>`;
  let out = "";
  let last = 0;
  for (const m of code.matchAll(/<!--[\s\S]*?(?:-->|$)|<\?[\s\S]*?(?:\?>|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<\/?[\w:.-]+[^<>]*\/?>/g)) {
    out += esc(code.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("<!--")) out += span("tk-com", t);
    else if (t.startsWith("<?")) out += span("tk-pre", t);
    else if (t.startsWith("<![CDATA[")) out += span("tk-str", t);
    else {
      // A tag: its name, then its attributes (name="value") and the rest as they are.
      const name = /^<\/?([\w:.-]+)/.exec(t)!;
      out += esc(name[0].slice(0, name[0].length - name[1].length)) + span("tk-kw", name[1]);
      const rest = t.slice(name[0].length);
      let at = 0;
      for (const a of rest.matchAll(/([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')/g)) {
        out += esc(rest.slice(at, a.index)) + span("tk-fn", a[1]) + esc(a[2]) + span("tk-str", a[3]);
        at = a.index! + a[0].length;
      }
      out += esc(rest.slice(at));
    }
    last = m.index! + t.length;
  }
  return out + esc(code.slice(last));
}

/**
 * The HTML of a read-only block of another kind (xml, shell), or null for any other kind. An xml
 * block is highlighted, under its file's name when it has one; a shell block is under "Commands for
 * your own computer". A text block is left to Markdown (plain, as it is).
 */
export function readOnlyBlockHtml(lang: string | undefined, text: string): string | null {
  const kind = (lang ?? "").trim();
  const xml = /^xml(?:\s+(\S+))?$/.exec(kind);
  if (xml) {
    const pre = `<pre class="code-xml"><code>${xmlHighlightHtml(text.replace(/\n$/, ""))}</code></pre>`;
    return xml[1] ? `<figure class="code-file"><figcaption>${esc(xml[1])}</figcaption>${pre}</figure>\n` : pre + "\n";
  }
  if (kind === "shell") return `<figure class="io io-shell"><figcaption>Commands for your own computer</figcaption><pre><code>${esc(text.replace(/\n$/, ""))}</code></pre></figure>\n`;
  return null;
}
