// Tests of the topics reference's check (scripts/content/topics.mjs) and its search (src/lib/topics.ts).
// No build output is read: the steps here are written for the test. Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { checkTopics, markdownCode, mentions, stepSources, topicLetter, topicSlug } from "./content/topics.mjs";
import { filterTopics } from "../src/lib/topics.ts";

const step = (id, text, extra = {}) => ({ id, slug: id.replace(/^[a-z]+-/, ""), title: extra.title ?? id, text, task: extra.task ?? "Your turn.", seed: extra.seed ?? "", solution: extra.solution ?? "", more: extra.more ?? [] });
const loops = { id: "loops", title: "Repeating with while" };
const STEPS = new Map(
  [
    [step("loops-for", "A **for loop** for counting:\n\n```python run\nfor i in range(3):\n    print(i ** 2)\n```\n\nIt is used for counting."), loops],
    [step("loops-words", "Loops are handy for words. The word for here is only English."), loops],
    [step("loops-recursion", "A function that calls itself is **recursive**. Recursion needs a base case.", { solution: "def f(n):\n    return 0 if n == 0 else f(n - 1)\n" }), loops],
    [step("loops-more", "Nothing here.", { more: [{ task: "Use `Counter` now.", seed: "", solution: "from collections import Counter\n\ncounts = Counter(\"banana\")\n" }] }), loops],
  ].map(([s, m]) => [s.id, { step: s, module: m }]),
);
const DRILLS = new Map([["loops", "Repeating with while"]]);
const check = (raw) => checkTopics(raw, { steps: STEPS, drillTopics: DRILLS });
const entry = (over = {}) => ({ term: "for", kind: "keyword", about: "A loop with a counter.", steps: ["loops-for"], ...over });

test("a good entry passes, with its steps and drills topic as the page needs them", () => {
  const { topics, errors } = check([entry({ drills: "loops" })]);
  assert.deepEqual(errors, []);
  assert.deepEqual(topics, [{ id: "for", term: "for", kind: "keyword", about: "A loop with a counter.", aliases: [], steps: [{ id: "loops-for", module: "loops", moduleTitle: "Repeating with while", slug: "for", title: "loops-for" }], drills: { topic: "loops", title: "Repeating with while" } }]);
});

test("a step id that doesn't exist is an error", () => {
  const { errors } = check([entry({ steps: ["loops-for", "loops-nowhere"] })]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /there's no step loops-nowhere/);
});

test("a keyword must be in the step's code, not only in its text", () => {
  // "for" is in loops-words' text as an English word, but the step has no code with it.
  const { errors } = check([entry({ steps: ["loops-words"] })]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /loops-words doesn't have "for" in its code/);
});

test("a type, function or module counts as a whole word with the same capitals, in examples, inline code and the challenges' code", () => {
  assert.deepEqual(check([{ term: "Counter", kind: "type", about: "A counting dictionary.", steps: ["loops-more"] }]).errors, []);
  assert.deepEqual(check([{ term: "collections", kind: "module", about: "More containers.", steps: ["loops-more"] }]).errors, []);
  assert.deepEqual(check([{ term: "range", kind: "function", about: "Numbers in a row.", steps: ["loops-for"] }]).errors, []);
  assert.equal(check([{ term: "Count", kind: "type", about: "Not a word of its own.", steps: ["loops-more"] }]).errors.length, 1);
  assert.equal(check([{ term: "counter", kind: "type", about: "Wrong capitals.", steps: ["loops-more"] }]).errors.length, 1);
});

test("an idea counts anywhere in the text, in any capitals, with a plural; a check phrase can stand in for the term", () => {
  assert.deepEqual(check([{ term: "loop", kind: "idea", about: "Repeats code.", steps: ["loops-words", "loops-for"] }]).errors, []);
  assert.deepEqual(check([{ term: "recursion", kind: "idea", about: "A function calling itself.", check: ["recursive"], steps: ["loops-recursion"] }]).errors, []);
  const { errors } = check([{ term: "base", kind: "idea", about: "Not in the step.", steps: ["loops-more"] }]);
  assert.match(errors[0], /loops-more doesn't have "base" in its text or code/);
  // A word inside a longer word doesn't count.
  assert.equal(check([{ term: "curs", kind: "idea", about: "Part of a word.", steps: ["loops-recursion"] }]).errors.length, 1);
});

test("at most three steps, a known kind, a one-line description that ends a sentence, and no dashes", () => {
  const four = check([entry({ term: "loop", kind: "idea", steps: ["loops-for", "loops-words", "loops-recursion", "loops-more"] })]).errors;
  assert.ok(four.some((e) => /at most 3/.test(e)));
  assert.ok(check([entry({ kind: "word" })]).errors.some((e) => /kind must be one of/.test(e)));
  assert.ok(check([entry({ about: "Two\nlines." })]).errors.some((e) => /one line/.test(e)));
  assert.ok(check([entry({ about: "No period" })]).errors.some((e) => /ends with a period/.test(e)));
  assert.ok(check([entry({ about: "A loop \u2014 with a dash." })]).errors.some((e) => /dash/.test(e)));
  assert.ok(check([entry({ steps: [] })]).errors.some((e) => /one to 3 step ids/.test(e)));
  assert.ok(check([entry({ extra: 1 })]).errors.some((e) => /unknown field extra/.test(e)));
});

test("aliases are only for the search: the check doesn't accept them", () => {
  const { errors } = check([{ term: "self-call", kind: "idea", about: "A function calling itself.", aliases: ["recursive"], steps: ["loops-recursion"] }]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /loops-recursion doesn't have "self-call" in its text or code/);
  assert.ok(check([entry({ check: "for" })]).errors.some((e) => /check must be a list/.test(e)));
});

test("a check phrase in too many of the steps is too general to count", () => {
  // Five steps, so a phrase may be in at most 3 (the least the limit allows): "loop" is in all of them.
  const five = new Map([...STEPS, ["loops-again", { step: step("loops-again", "Another loop."), module: loops }]]);
  const { errors } = checkTopics([{ term: "iteration", kind: "idea", about: "Going round.", check: ["loop"], steps: ["loops-for"] }], { steps: five, drillTopics: DRILLS });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /the check phrase "loop" is in 5 of the 5 steps/);
  assert.deepEqual(checkTopics([{ term: "iteration", kind: "idea", about: "Going round.", check: ["for loop"], steps: ["loops-for"] }], { steps: five, drillTopics: DRILLS }).errors, []);
});

test("keywords, literals, operators and exceptions are looked for in code, not in the text", () => {
  // "for" is an English word in loops-words' text; as a keyword it would have to be code.
  assert.equal(check([{ term: "for", kind: "keyword", about: "Not one.", steps: ["loops-words"] }]).errors.length, 1);
  for (const kind of ["keyword", "literal", "operator", "exception", "method"]) {
    assert.deepEqual(check([{ term: "**", kind, about: "In the code.", steps: ["loops-for"] }]).errors, [], kind);
    assert.match(check([{ term: "here", kind, about: "Only in the text.", steps: ["loops-words"] }]).errors[0], /in its code/, kind);
  }
});

test("a drills topic must be one with drills", () => {
  assert.ok(check([entry({ drills: "arrays" })]).errors.some((e) => /Deathmatch topic/.test(e)));
});

test("terms that differ only in capitals get different addresses; the same term twice is an error", () => {
  const { topics, errors } = check([
    { term: "Counter", kind: "type", about: "The type.", steps: ["loops-more"] },
    { term: "counter", kind: "idea", about: "The idea.", aliases: ["Counter"], check: ["Counter"], steps: ["loops-more"] },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(topics.map((t) => t.id).sort(), ["counter", "counter-idea"]);
  assert.ok(check([entry(), entry()]).errors.some((e) => /the term for is in the list twice/.test(e)));
});

test("which entry keeps a shared address doesn't depend on the order of the file", () => {
  const type = { term: "Counter", kind: "type", about: "The type.", steps: ["loops-more"] };
  const method = { term: "counTer", kind: "method", about: "A method.", steps: ["loops-more"], check: ["Counter"] };
  const idea = { term: "counter", kind: "idea", about: "The idea.", steps: ["loops-more"] };
  const ids = (list) => Object.fromEntries(check(list).topics.map((t) => [t.term, t.id]));
  const want = { Counter: "counter", counTer: "counter-method", counter: "counter-idea" };
  assert.deepEqual(ids([type, method, idea]), want);
  assert.deepEqual(ids([idea, method, type]), want);
  assert.deepEqual(ids([method, idea, type]), want);
  // Two of one kind can't be told apart.
  const { errors } = check([type, { ...type, term: "COUNTER", check: ["Counter"] }]);
  assert.ok(errors.some((e) => /its address #counter-type is the same as (Counter|COUNTER)'s/.test(e)));
});

test("an address the site already uses as an id is an error", () => {
  for (const term of ["main", "Root", "main nav", "topics count", "letter A"]) {
    const { errors } = check([{ term, kind: "idea", about: "Clashes.", steps: ["loops-for"], check: ["for"] }]);
    assert.ok(errors.some((e) => /is an id the site already uses/.test(e)), term);
  }
  assert.ok(!check([{ term: "domain", kind: "idea", about: "Fine.", steps: ["loops-for"], check: ["for"] }]).errors.some((e) => /already uses/.test(e)));
});

test("entries come out A to Z, ignoring capitals, a leading @ and underscores, with operators first", () => {
  const { topics } = check([
    { term: "loop", kind: "idea", about: "Repeats.", steps: ["loops-words"] },
    { term: "@property", kind: "keyword", about: "A decorator.", check: ["for"], steps: ["loops-for"] },
    { term: "__init__", kind: "method", about: "Sets up an object.", check: ["for"], steps: ["loops-for"] },
    { term: "**", kind: "operator", about: "A power.", steps: ["loops-for"] },
    { term: "Counter", kind: "type", about: "Counts.", steps: ["loops-more"] },
  ]);
  assert.deepEqual(topics.map((t) => t.term), ["**", "Counter", "__init__", "loop", "@property"]);
});

test("slugs, letters and the code of Markdown", () => {
  assert.equal(topicSlug("str.split"), "str-split");
  assert.equal(topicSlug("@property"), "property");
  assert.equal(topicSlug("__init__"), "init");
  assert.equal(topicSlug("//"), "slash-slash");
  assert.equal(topicSlug("**"), "star-star");
  assert.equal(topicSlug(":="), "colon-equals");
  assert.equal(topicSlug("->"), "minus-greater");
  assert.equal(topicSlug("%"), "percent");
  assert.equal(topicLetter("@property"), "P");
  assert.equal(topicLetter("__init__"), "I");
  assert.equal(topicLetter("%"), "#");
  assert.equal(topicLetter("while"), "W");
  assert.equal(markdownCode("Use `x += 1` here.\n\n```python\ny = 2\n```\n\nand ``a`b``."), "y = 2\n\nx += 1\na`b");
  const src = stepSources(STEPS.get("loops-more").step);
  assert.match(src.code, /Counter/);
  assert.ok(mentions("Counter", "type", src));
  assert.ok(!mentions("Nothing", "type", src));
});

test("the search finds terms, aliases and words of the description, best matches first", () => {
  const topics = [
    { id: "for", term: "for", kind: "keyword", about: "A loop with a counter.", aliases: [], steps: [], drills: null },
    { id: "for-loop", term: "for loop", kind: "idea", about: "Goes through a list.", aliases: ["for-each"], steps: [], drills: null },
    { id: "while", term: "while", kind: "keyword", about: "Repeats a block for as long as a condition holds.", aliases: [], steps: [], drills: null },
    { id: "dict", term: "dict", kind: "type", about: "Keys and values.", aliases: ["hash table"], steps: [], drills: null },
  ];
  assert.deepEqual(filterTopics(topics, "").map((t) => t.id), ["for", "for-loop", "while", "dict"]);
  // The term itself first, then terms that start with it, then descriptions with the word.
  assert.deepEqual(filterTopics(topics, "  FOR ").map((t) => t.id), ["for", "for-loop", "while"]);
  // In a description, a word must start with what was typed ("ount" isn't the start of "counter").
  assert.deepEqual(filterTopics(topics, "ount"), []);
  assert.deepEqual(filterTopics(topics, "dic").map((t) => t.id), ["dict"]);
  assert.deepEqual(filterTopics(topics, "hash table").map((t) => t.id), ["dict"]);
  assert.deepEqual(filterTopics(topics, "loop").map((t) => t.id), ["for-loop", "for"]);
  assert.deepEqual(filterTopics(topics, "repeats condition").map((t) => t.id), ["while"]);
  assert.deepEqual(filterTopics(topics, "zebra"), []);
});
