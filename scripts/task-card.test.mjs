// Tests of the task card's note about the tests it doesn't show (src/content/otherTests.ts): "2 more
// hidden tests use other ...", and what it says of the big ones among them. Run: npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { bigTestsNote, otherTestsUse } from "../src/content/otherTests.ts";

test("without arguments, the plain words: input, files, calls", () => {
  assert.equal(otherTestsUse({ stdin: "1\n" }, [{ stdin: "2\n", hidden: true }]), "input");
  assert.equal(otherTestsUse({ stdin: "1\n" }, [{ stdin: "2\n", files: { "a.txt": "x\n" } }]), "input or files");
  assert.equal(otherTestsUse({ call: "f(1)" }, [{ call: "f(2)" }]), "calls");
  assert.equal(otherTestsUse({ call: "f(1)" }, [{ call: "f(2)" }, { stdin: "x\n" }]), "input or calls");
  // The same arguments in every test (or none written as []) don't count.
  assert.equal(otherTestsUse({ args: ["a"], stdin: "1\n" }, [{ args: ["a"], stdin: "2\n" }]), "input");
  assert.equal(otherTestsUse({ args: [] }, [{ stdin: "2\n" }]), "input");
});

test("tests with other arguments: only what the other tests change", () => {
  // Only the arguments differ, or a test has none where the shown one has some.
  assert.equal(otherTestsUse({ args: ["--flight=LH12", "--gate=B4"] }, [{ args: ["--flight=LH77"], hidden: true }]), "command-line arguments");
  // Input only when some test's standard input differs; files only when some test's files differ.
  assert.equal(otherTestsUse({ args: ["a"], stdin: "Ada\n" }, [{ stdin: "Grace\n" }]), "input or command-line arguments");
  assert.equal(otherTestsUse({ args: ["a"], files: { "a.txt": "1\n" } }, [{ files: { "a.txt": "1\n" } }, { files: { "a.txt": "2\n" } }]), "files or command-line arguments");
  // Arguments alone: a plain program's args.
  assert.equal(otherTestsUse({ args: ["3"] }, [{ args: ["5"], hidden: true }]), "command-line arguments");
});

test("the big tests among the others: none, all of them, or some", () => {
  assert.equal(bigTestsNote([{ call: "f(2)", hidden: true }]), "");
  assert.equal(bigTestsNote([{ call: "f(2)", hidden: true, big: true }]), " It is a big test: a way that is too slow runs out of time on it.");
  assert.equal(bigTestsNote([{ big: true }, { big: true }]), " They are big tests: a way that is too slow runs out of time on them.");
  assert.equal(bigTestsNote([{ call: "f(2)" }, { big: true }]), " One of them is a big test: a way that is too slow runs out of time.");
  assert.equal(bigTestsNote([{ call: "f(2)" }, { big: true }, { big: true }]), " 2 of them are big tests: a way that is too slow runs out of time.");
});
