import { useEffect, useState } from "react";
import { Check, CircleCheck, CircleX, X } from "lucide-react";
import type { FriendlyDiagnostic, GradeResult, TestResult, WrittenFile } from "../grader/grade";
import { describeEvents, windowRunText } from "./window-blocks";
import { InlineMd } from "./Markdown";
import InputText from "./InputText";
import { notesShown } from "../grader/notes";

/** A file that isn't text: its size, never its bytes as text. */
function BinaryFile({ bytes }: { bytes: Uint8Array }) {
  return <p className="muted small">Not a text file ({bytes.length} bytes).</p>;
}

/** Python's syntax error, with its place and a plain-English explanation, then what Python printed on request. */
export function DiagnosticList({ diagnostics, raw, multiFile }: { diagnostics: FriendlyDiagnostic[]; raw: string; multiFile?: boolean }) {
  const [showRaw, setShowRaw] = useState(false);
  const shown = diagnostics.slice(0, 4);
  const more = diagnostics.length - shown.length;
  // With several files, each message says which one it's about.
  const fileOf = (d: FriendlyDiagnostic) => d.file;
  const named = multiFile || diagnostics.some((d) => d.line > 0 && fileOf(d) !== "main.py");
  return (
    <div className="diags">
      {shown.map((d, i) => (
        <div key={i} className={"diag diag-" + d.kind}>
          <div className="diag-head">
            <span className="diag-sev">{d.name}</span>
            {d.line > 0 && (
              <span className="diag-line">
                {named && (
                  <>
                    <FileName name={fileOf(d)} />,{" "}
                  </>
                )}
                line {d.line}
              </span>
            )}
          </div>
          <code className="diag-msg">{d.message}</code>
          {/* Plain text, not Markdown: notes quote code such as __init__, whose underscores Markdown would read as bold. */}
          {d.friendly && <p className="diag-friendly">{d.friendly}</p>}
        </div>
      ))}
      {more > 0 && <p className="muted small">and {more} more. Fixing the first error often makes later ones go away.</p>}
      {raw && (
        <button type="button" className="linkish" aria-expanded={showRaw} onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? "Hide" : "Show"} what Python printed
        </button>
      )}
      {showRaw && (
        <pre tabIndex={0} className="console small">
          {raw}
        </pre>
      )}
    </div>
  );
}

function Shown({ s, empty = "(nothing)" }: { s: string; empty?: string }) {
  if (s === "") return <em className="muted">{empty}</em>;
  return <>{s}</>;
}

/** A file's name in a label, in its own letters (the label is in capitals). */
export function FileName({ name }: { name: string }) {
  return <span className="lbl-file">{name}</span>;
}

// A file a free run wrote starts folded when it's longer than this.
const LONG_FILE_LINES = 15;
const LONG_FILE_CHARS = 1500;

/** The files a free run created or changed, each under its name; a long one starts folded, and one that isn't text is described, never shown as text. */
export function WrittenFiles({ files }: { files?: WrittenFile[] }) {
  if (!files?.length) return null;
  return (
    <div className="written-files">
      {files.map((f) => {
        if (f.bytes)
          return (
            <div key={f.name} className="written-file">
              <span className="lbl">
                the file <FileName name={f.name} /> after the run
              </span>
              <BinaryFile bytes={f.bytes} />
            </div>
          );
        const text = (f.text ?? "").replace(/\n$/, "");
        const lines = text === "" ? 0 : text.split("\n").length;
        const label = (
          <span className="lbl">
            the file <FileName name={f.name} /> after the run
          </span>
        );
        const body = (
          <pre tabIndex={0} className="console tiny">
            <Shown s={text} empty="(empty)" />
          </pre>
        );
        return lines > LONG_FILE_LINES || text.length > LONG_FILE_CHARS ? (
          <details key={f.name} className="written-file">
            <summary>
              {label} <span className="muted small">({lines === 1 ? "1 line" : `${lines} lines`})</span>
            </summary>
            {body}
          </details>
        ) : (
          <div key={f.name} className="written-file">
            {label}
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** A picture's bytes as an address an <img> can show, for as long as the component is there. */
function useObjectUrl(bytes: Uint8Array | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) return setUrl(null);
    const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/png" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes]);
  return url;
}

/** One window of a comparison: its picture and its drawing as text, the lines that the other window doesn't have marked. */
function WindowSide({ label, src, title, size, log, other, alt }: { label: string; src: string | null; title: string; size: [number, number] | null; log: string; other: string; alt: string }) {
  const theirs = new Set(other.split("\n"));
  const lines = log ? log.split("\n") : [];
  return (
    <div>
      <span className="lbl">{label}</span>
      <figure className="pg-window" style={size ? ({ "--w": size[0], "--h": size[1] } as React.CSSProperties) : undefined}>
        <div className="pg-titlebar">
          <span className="pg-title">{title}</span>
          {size && (
            <span className="pg-size">
              {size[0]} × {size[1]}
            </span>
          )}
        </div>
        <div className="pg-screen">{src ? <img src={src} alt={alt} width={size?.[0]} height={size?.[1]} /> : <p className="pg-none muted small">(no window)</p>}</div>
      </figure>
      <pre tabIndex={0} className="console tiny pg-log" aria-label={`${label}, as text`}>
        {lines.length
          ? lines.map((l, i) => (
              <span key={i} className={theirs.has(l) ? undefined : "pg-diff"}>
                {l}
                {theirs.has(l) ? "" : <span className="visually-hidden"> (differs)</span>}
                {"\n"}
              </span>
            ))
          : "(nothing drawn)"}
      </pre>
    </div>
  );
}

/** A window test that failed: what happened in the window, and the expected window beside the learner's. */
function WindowCompare({ t }: { t: TestResult }) {
  const w = t.window!;
  const mine = useObjectUrl(w.got?.png);
  const want = w.expected;
  return (
    <div className="pg-compare">
      {t.window && (
        <p className="small">
          {windowRunText(want.frames, [])} {describeEvents(t.windowEvents ?? []).join(" ")}
        </p>
      )}
      <div className="t-cmp">
        <WindowSide label={`the window after ${want.frames} frames should be`} src={import.meta.env.BASE_URL + want.image} title={want.title} size={want.size} log={want.log} other={w.got?.log ?? ""} alt="The expected window" />
        <WindowSide
          label={w.got?.frames ? `your window after ${w.got.frames} ${w.got.frames === 1 ? "frame" : "frames"}` : "your program"}
          src={mine}
          title={w.got?.title ?? ""}
          size={w.got?.size ?? null}
          log={w.got?.log ?? ""}
          other={want.log}
          alt="Your program's window"
        />
      </div>
    </div>
  );
}

export default function Results({ result }: { result: GradeResult }) {
  // The same crash under several tests is explained once, under the first; the others get a short line.
  const notes = notesShown(result.tests);
  return (
    <div className="results">
      {result.status === "pass" && (
        <div className="banner banner-pass">
          <span>
            <CircleCheck className="icon" aria-hidden="true" /> All tests passed
          </span>
        </div>
      )}
      {result.status === "fail" && (
        <div className="banner banner-fail">
          <span>
            <CircleX className="icon" aria-hidden="true" /> Not yet
          </span>
        </div>
      )}
      {result.status === "syntax-error" && (
        <>
          <div className="banner banner-fail">
            <span>
              <CircleX className="icon" aria-hidden="true" /> Python couldn't read your code
            </span>
          </div>
          <DiagnosticList diagnostics={result.diagnostics} raw={result.errorOutput} multiFile={result.multiFile} />
        </>
      )}
      {result.status === "call-error" && (
        <>
          <div className="banner banner-fail">
            <span>
              <CircleX className="icon" aria-hidden="true" /> The check couldn't call your code
            </span>
          </div>
          <ul className="rules" aria-label="Why the check couldn't call your code">
            {result.callProblems.map((p, i) => (
              <li key={i}>
                <InlineMd text={p} />
              </li>
            ))}
          </ul>
        </>
      )}
      {result.status === "internal-error" && (
        <div className="banner banner-fail">
          <span>{`Python couldn't check this (${result.internalError}). Try again; if it keeps happening, reload the page.`}</span>
        </div>
      )}
      {result.ruleProblems.length > 0 && result.status !== "syntax-error" && (
        <ul className="rules" aria-label="Rules for this challenge">
          {result.ruleProblems.map((p, i) => (
            <li key={i}>
              <InlineMd text={p} />
            </li>
          ))}
        </ul>
      )}
      {result.tests.length > 0 && (
        <ul className="tests" aria-label="Tests">
          {result.tests.map((t, i) => (
            <li key={i} className={t.pass ? "t-pass" : "t-fail"}>
              <span className="t-icon">
                {t.pass ? <Check className="icon" aria-hidden="true" /> : <X className="icon" aria-hidden="true" />}
                <span className="visually-hidden">{t.pass ? "Passed: " : "Failed: "}</span>
              </span>
              <div className="t-body">
                <div className="t-name">
                  {t.hidden ? "Hidden test" : t.name}
                  {t.big && (
                    <span className="big-tag" title="A big test: a way that is too slow runs out of time on it">
                      <span className="visually-hidden">, </span>big
                    </span>
                  )}
                  {!t.pass && t.hidden && <span className="muted"> (hidden so the answer can't be typed in directly)</span>}
                </div>
                {!t.pass && !t.hidden && (
                  <div className="t-detail">
                    {t.call && t.call.trim() !== t.name ? (
                      <div>
                        <span className="lbl">the test ran</span>
                        <pre tabIndex={0} className="console tiny">
                          {t.call.replace(/\n$/, "")}
                        </pre>
                      </div>
                    ) : null}
                    {t.args?.length ? (
                      <div>
                        <span className="lbl">command-line arguments</span>
                        <pre tabIndex={0} className="console tiny">
                          {t.args.map((a) => (/[\s"]/.test(a) || a === "" ? JSON.stringify(a) : a)).join(" ")}
                        </pre>
                      </div>
                    ) : null}
                    {t.stdin ? (
                      <div>
                        <span className="lbl">input</span>
                        <pre tabIndex={0} className="console tiny">
                          <InputText text={t.stdin} />
                        </pre>
                      </div>
                    ) : null}
                    {Object.entries(t.files ?? {}).map(([name, value]) => (
                      <div key={name}>
                        <span className="lbl">
                          the file <FileName name={name} />
                        </span>
                        <pre tabIndex={0} className="console tiny">
                          <Shown s={value.replace(/\n$/, "")} empty="(empty)" />
                        </pre>
                      </div>
                    ))}
                    {t.window && !t.window.pass && <WindowCompare t={t} />}
                    {/* When only a written file or the window is wrong, the output (which is right) isn't compared again. */}
                    {!((t.writes?.some((f) => !f.pass) || (t.window && !t.window.pass)) && t.got === t.expected) && (
                      <div className="t-cmp">
                        <div>
                          <span className="lbl">expected</span>
                          <pre tabIndex={0} className="console tiny">
                            <Shown s={t.expected ?? ""} />
                          </pre>
                        </div>
                        <div>
                          <span className="lbl">your program printed</span>
                          <pre tabIndex={0} className="console tiny">
                            <Shown s={t.got ?? ""} />
                          </pre>
                        </div>
                      </div>
                    )}
                    {t.writes
                      ?.filter((f) => !f.pass)
                      .map((f) => (
                        <div key={f.name} className="t-cmp">
                          <div>
                            <span className="lbl">
                              the file <FileName name={f.name} /> should contain
                            </span>
                            <pre tabIndex={0} className="console tiny">
                              <Shown s={f.expected} empty="(an empty file)" />
                            </pre>
                          </div>
                          <div>
                            <span className="lbl">your program wrote</span>
                            <pre tabIndex={0} className="console tiny">
                              {f.got === null ? <em className="muted">(it didn't create {f.name})</em> : <Shown s={f.got} empty="(an empty file)" />}
                            </pre>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {!t.pass && t.loadOutput && (
                  <p className="t-note">
                    Loading your program printed something before the test ran (it isn't checked, but code that tests your functions by hand belongs under <code>if __name__ == "__main__":</code>).
                  </p>
                )}
                {!t.pass && notes[i] && <div className="t-note">{notes[i]}</div>}
                {!t.pass && !t.hidden && t.stderr && (
                  <details className="stderr">
                    <summary>What Python printed about the error</summary>
                    <pre tabIndex={0} className="console tiny">
                      {t.stderr}
                    </pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="muted small">ran in {(result.runMs / 1000).toFixed(2)} s</div>
    </div>
  );
}
