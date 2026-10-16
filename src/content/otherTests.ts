// The task card's note about the tests it doesn't show: what they use that the shown one doesn't.
import type { TestCase } from "./types";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** A test's command-line arguments, none written as an empty list or left out alike. */
const argsOf = (t?: TestCase) => (t?.args?.length ? t.args : undefined);

/**
 * What the tests that a task card doesn't show (`others`) use instead of what the shown test uses,
 * in words for its note "2 more hidden tests use other ...". A challenge whose tests all have the
 * same arguments keeps the plain words (input, files, calls). Otherwise the words name only what
 * some other test changes: input, files, calls, command-line arguments.
 */
export function otherTestsUse(shown: TestCase | undefined, others: TestCase[]): string {
  const calls = others.filter((t) => t.call).length;
  const files = others.some((t) => t.files);
  const plain = calls === 0 ? (files ? "input or files" : "input") : calls === others.length ? "calls" : "input or calls";
  const args = others.some((t) => !same(argsOf(t), argsOf(shown)));
  if (!args) return plain;
  const parts = [
    others.some((t) => (t.stdin ?? "") !== (shown?.stdin ?? "")) && "input",
    others.some((t) => t.files && !same(t.files, shown?.files)) && "files",
    calls > 0 && "calls",
    args && "command-line arguments",
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join(" or ") : plain;
}

/**
 * The task card's words about the big tests among the ones it doesn't show (`others`): sized so that a
 * correct but slow way runs out of time. Empty when there are none; otherwise a sentence that starts with
 * a space, to follow the note about the tests.
 */
export function bigTestsNote(others: TestCase[]): string {
  const big = others.filter((t) => t.big).length;
  if (!big) return "";
  if (big === others.length) return big === 1 ? " It is a big test: a way that is too slow runs out of time on it." : " They are big tests: a way that is too slow runs out of time on them.";
  return ` ${big === 1 ? "One of them is a big test" : `${big} of them are big tests`}: a way that is too slow runs out of time.`;
}
