// Tests of src/components/code-lines.ts: drill code drawn line by line so it can wrap on a phone.
// The drawn text is exactly the code (for every drill), and a long line may break only where a
// reader expects it: at spaces, before a member's dot, after an opening parenthesis; never inside
// a string or char literal, a name or a number.
// Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { codeLinesHtml, codePieces, deepestIndent, indentOf, lineBits, pieceLines } from "../src/components/code-lines.ts";

/** The text an HTML string shows (its tags removed, entities decoded). */
const textOf = (html) => html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** One line's HTML with each break point shown as "|" and nothing else. */
const breaks = (code) => textOf(codeLinesHtml(code).replace(/<wbr>/g, "|"));
/** The literal boxes of a line, as text. */
const boxes = (code) => [...codeLinesHtml(code).matchAll(/<span class="lit"><span class="tk-str">([^<]*)<\/span>([^<]*)<\/span>/g)].map((m) => textOf(m[1] + m[2]));

/**
 * Every drill and placement question as the page shows it, read from content/ (not from the build's
 * output, so this runs before any build, as CI's unit tests do): its code, each solution file and
 * each code block of a prompt.
 */
function drillCodes() {
  const dir = new URL("../content/drills/", import.meta.url);
  const drills = readdirSync(dir).filter((f) => f.endsWith(".yaml")).flatMap((f) => {
    const doc = parse(readFileSync(new URL(f, dir), "utf8"));
    return doc.drills ?? doc;
  });
  const placementFile = new URL("../content/placement.yaml", import.meta.url);
  const placement = existsSync(placementFile) ? parse(readFileSync(placementFile, "utf8")) : { questions: [] };
  const all = [...drills, ...(placement.questions ?? placement)];
  return all.map((d) => {
    const solutions = typeof d.solution === "string" ? [d.solution] : Object.values(d.solution ?? {});
    const blocks = [...(d.prompt ?? "").matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
    return { id: `${d.topic ?? d.module}: ${d.type}`, codes: [d.code, ...solutions, ...blocks].filter(Boolean).map((c) => c.replace(/\n$/, "")) };
  });
}

test("every drill's code, solution and task code blocks: the lines drawn are exactly the code", () => {
  let n = 0;
  for (const d of drillCodes()) {
    for (const code of d.codes) {
      for (const colors of [true, false]) assert.equal(textOf(codeLinesHtml(code, colors)), code, `${d.id}: ${code.slice(0, 60)}`);
      n++;
    }
  }
  assert.ok(n > 10, `only ${n} pieces of code`);
});

test("a long line may break before a member's dot and after an opening parenthesis", () => {
  assert.equal(breaks("result = text.strip().lower().split()"), "result = text|.strip()|.lower()|.split()");
  assert.equal(breaks("print(total_points(defeated))"), "print(|total_points(|defeated))");
  // Not around one name, not in an empty pair, not in a number.
  assert.equal(breaks("total = (count) + 1"), "total = (count) + 1");
  assert.equal(breaks("pi = 3.14"), "pi = 3.14");
  // A string's own dots and parentheses are not break points.
  assert.equal(breaks('print("a.b(c)")'), 'print(|"a.b(c)")');
  // Commented-out code breaks the same way.
  assert.equal(breaks('# print(names.count("Ada"))'), '# print(|names|.count(|"Ada"))');
});

test("a string literal and the closing marks after it are one box", () => {
  assert.deepEqual(boxes('print(greet("Ada"))'), ['"Ada"))']);
  assert.deepEqual(boxes('s = a + " " + b'), ['" "']);
  assert.deepEqual(boxes("c = ' '"), ["' '"]);
  assert.deepEqual(boxes('if command == "quit":'), ['"quit":']);
  assert.deepEqual(boxes('ages["Ada"] = 36'), ['"Ada"]']);
  assert.deepEqual(boxes('print(f"{name}!")'), ['f"{name}!")']);
});

test("each line is an element with its indent and the code's deepest indent; its leading spaces are glued to its first character", () => {
  const html = codeLinesHtml("def f():\n    for x in y:\n        g()\n\nf()");
  const lines = html.split("\n");
  assert.equal(lines.length, 5);
  assert.equal(lines[3], "", "an empty line is just its line break");
  assert.match(lines[0], /^<span class="cl" style="--indent: 0; --deep: 8">/);
  // The line can't break right after its indentation (a row that looks empty).
  assert.match(lines[2], /^<span class="cl" style="--indent: 8; --deep: 8"><span class="keep"><span class="ind"> {8}<\/span><span class="tk-fn">g<\/span><\/span>\(\)<\/span>$/);
  // Not to a literal box, which moves as a whole.
  assert.match(codeLinesHtml('    "a" + b'), /^<span class="cl" style="--indent: 4; --deep: 4"><span class="keep"><span class="ind"> {4}<\/span><\/span><span class="lit">/);
  assert.equal(indentOf("      x"), 6);
  assert.equal(deepestIndent(["a", "    b", "  c"]), 4);
  // Without colors (a block not marked as Python) the text is plain, still in lines and boxes.
  const plain = codeLinesHtml('print("x")', false);
  assert.doesNotMatch(plain, /tk-/);
  assert.match(plain, /<span class="lit">"x"\)<\/span>/);
});

test("a fill-in's blank takes its place in the line", () => {
  const pieces = [...codePieces("keypad.add(open, "), { node: "BLANK" }, ...codePieces(", 3)")];
  const [line] = pieceLines(pieces);
  const bits = lineBits(line);
  assert.ok(bits.some((b) => b.node === "BLANK"));
  // The parenthesis before the arguments is a break point; the blank doesn't stop it.
  assert.ok(bits.some((b) => b.parts?.includes(null)));
});
