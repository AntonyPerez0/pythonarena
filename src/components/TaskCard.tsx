import { Target } from "lucide-react";
import { bigTestsNote, otherTestsUse } from "../content/otherTests";
import type { Exercise } from "../content/types";
import Markdown from "./Markdown";
import InputText from "./InputText";
import { FileName } from "./Results";
import { describeEvents, windowFigureHtml, windowRunText } from "./window-blocks";

/**
 * What the challenge asks for, set apart from the lesson so it's obvious: the task, then the exact
 * output the program must print, with the input it gets, and the files it must write.
 */
export default function TaskCard({ ex, task, index, total, label = "Challenge" }: { ex: Exercise; task: string; index: number; total: number; label?: string }) {
  // A "What does it print?" challenge must not show its answer. A challenge whose program writes files
  // shows the first visible test that checks them (scripts/build-content.mjs checkTaskOutput picks the same).
  const windowTest = ex.kind === "predict" ? undefined : ex.tests.find((t) => !t.hidden && t.expectWindow);
  const shown = ex.kind === "predict" ? undefined : (windowTest ?? ex.tests.find((t) => !t.hidden && t.writes) ?? ex.tests.find((t) => !t.hidden && t.expect));
  const others = ex.tests.filter((t) => t !== shown);
  const moreTests = others.length;
  const hiddenCount = others.filter((t) => t.hidden).length;
  // What they use instead: "other input", "other command-line arguments", "other things the user does"...
  const what = otherTestsUse(shown, others);
  // The expected output (and the check's code) get boxes of their own below, so copies in the task text are dropped.
  const text = shown?.expect ? withoutBlock(task, shown.expect, shown.call) : task;
  return (
    <section className="task-card" aria-labelledby="task-h">
      <div className="task-head">
        <h2 id="task-h" className="task-title" tabIndex={-1}>
          <Target className="icon" aria-hidden="true" /> Your task
        </h2>
        {total > 1 && (
          <span className="task-count">
            {label} {index + 1} of {total}
          </span>
        )}
      </div>
      <Markdown text={text} className="task-body" />
      {ex.kind === "fill" && <p className="task-note">Type your answers into the highlighted blanks in the code below.</p>}
      {ex.kind === "predict" && <p className="task-note">Read the program below and type each line it prints. The answers are what Python really prints for it.</p>}
      {windowTest?.expectWindow && windowTest.window && (
        <div className="task-expect task-window">
          <div className="lbl">The test</div>
          <p className="small">{windowRunText(windowTest.window.frames, windowTest.window.events)}</p>
          {windowTest.window.events.length > 0 && (
            <ul className="small pg-events">
              {describeEvents(windowTest.window.events).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <div className="lbl">Your window should end like this</div>
          <div
            dangerouslySetInnerHTML={{
              __html: windowFigureHtml({
                src: import.meta.env.BASE_URL + windowTest.expectWindow.image,
                title: windowTest.expectWindow.title,
                size: windowTest.expectWindow.size,
                log: windowTest.expectWindow.log,
                alt: `The window the program should show after ${windowTest.expectWindow.frames} frames`,
              }),
            }}
          />
          {windowTest.expect && (
            <>
              <div className="lbl">Expected output</div>
              <pre className="console task-output" tabIndex={0}>
                {windowTest.expect}
              </pre>
            </>
          )}
          {moreTests > 0 && (
            <p className="task-note">
              {hiddenCount === moreTests
                ? `${moreTests} more hidden ${moreTests === 1 ? "test does" : "tests do"} other things in the window, so the answer can't be drawn in directly.`
                : `${moreTests} more ${moreTests === 1 ? "test does" : "tests do"} other things in the window${hiddenCount ? ", some of them hidden" : ""}.`}
            </p>
          )}
        </div>
      )}
      {shown && !windowTest && (
        <div className="task-expect">
          <div className={"task-io" + (shown.stdin || shown.call || shown.files || shown.args ? " two" : "")}>
            {shown.call ? (
              <div>
                <div className="lbl">The test runs</div>
                <pre className="console tiny" tabIndex={0}>
                  {shown.call.replace(/\n$/, "")}
                </pre>
              </div>
            ) : null}
            {shown.stdin ? (
              <div>
                <div className="lbl">Input</div>
                <pre className="console tiny" tabIndex={0}>
                  <InputText text={shown.stdin} />
                </pre>
              </div>
            ) : null}
            {shown.args?.length ? (
              <div>
                <div className="lbl">Command-line arguments</div>
                <pre className="console tiny" tabIndex={0}>
                  {shown.args.map((a) => (/[\s"]/.test(a) || a === "" ? JSON.stringify(a) : a)).join(" ")}
                </pre>
              </div>
            ) : null}
            {Object.entries(shown.files ?? {}).map(([name, value]) => (
              <div key={name}>
                <div className="lbl">
                  The file <FileName name={name} />
                </div>
                <pre className="console tiny" tabIndex={0}>
                  {value.replace(/\n$/, "") || <em className="muted">(empty)</em>}
                </pre>
              </div>
            ))}
            <div>
              <div className="lbl">Expected output</div>
              <pre className="console task-output" tabIndex={0}>
                {shown.expect || <em className="muted">(nothing)</em>}
              </pre>
              {Object.entries(shown.writes ?? {}).map(([name, text]) => (
                <div key={name}>
                  <div className="lbl">
                    The file <FileName name={name} /> after the run
                  </div>
                  <pre className="console tiny" tabIndex={0}>
                    {text.replace(/\n$/, "") || <em className="muted">(empty)</em>}
                  </pre>
                </div>
              ))}
            </div>
          </div>
          {moreTests > 0 && (
            <p className="task-note">
              {hiddenCount === moreTests
                ? `${moreTests} more hidden ${moreTests === 1 ? "test uses" : "tests use"} other ${what}, so the answer can't be typed in directly.`
                : `${moreTests} more ${moreTests === 1 ? "test uses" : "tests use"} other ${what}${hiddenCount ? ", some of them hidden so the answer can't be typed in directly" : ""}.`}
              {bigTestsNote(others)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const norm = (s: string) => s.replace(/[ \t]+$/gm, "").trim();

/** The task without fenced blocks that only repeat the expected output or the check's code, which the boxes below show. */
function withoutBlock(task: string, expect: string, call?: string): string {
  if (call) {
    // "The test runs: <code> and expects: <output>", both shown again below.
    const both = task.replace(/The (?:check|test) runs:\s*\n^```[^\n]*\n([\s\S]*?)^```[ \t]*\n\s*and expects:\s*\n^```[^\n]*\n([\s\S]*?)^```[ \t]*$/m, (m, code: string, body: string) =>
      norm(code) === norm(call) && norm(body) === norm(expect) ? "The code the test runs and the output it expects are shown below." : m,
    );
    if (both !== task) return both.trimEnd() + "\n";
  }
  const out = task.replace(/(:?)\s*\n^```[^\n]*\n([\s\S]*?)^```[ \t]*$/gm, (m, colon: string, body: string) => (norm(body) === norm(expect) ? (colon ? ": see the expected output below." : "") : m));
  return out === task ? task : out.trimEnd() + "\n";
}
