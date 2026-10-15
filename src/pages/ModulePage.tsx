import { useEffect } from "react";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { course, courseName, groupModules, groupPath, groups, moduleById, modules, plan, prefetchModule, stepPath } from "../content";
import { useStore } from "../state/store";
import { challengeDone, moduleProgress } from "../state/derived";
import MoocCredit from "../components/MoocCredit";
import ExtraTag from "../components/ExtraTag";
import NotFound from "./NotFound";
import { useTitle } from "../lib/title";
import { finishedPart, isoDay, moduleFinished, recordDate } from "../lib/record";
import { groupNextParts } from "../lib/group-end";

/** The MOOC's last module (the end of the Advanced Course in Programming): its page points on to the groups of extra modules and the Pro Track. */
const COURSE_END = plan.filter((m) => m.course === "II").pop()?.id;

/**
 * What the MOOC's last module says comes next: the groups of extra modules, each linked to its section of
 * the course page ("Data structures and algorithms, 7 extra modules of Python Arena's own"), and the Pro
 * Track. While none of the extra modules is written, they come in later updates.
 */
function CourseEndNext() {
  const pro = (
    <>
      try the Pro Track: projects for your own computer with Python and pytest. <Link to="/pro/">See the Pro Track</Link>
    </>
  );
  if (!groups.length)
    return (
      <>
        Next, you can <Link to="/projects/">build the projects</Link>, or {pro}
      </>
    );
  const extras = groups.flatMap((g) => groupModules(g.id));
  const live = extras.filter((x) => x.live).length;
  const what = (
    <>
      {groups.map((g, i) => (
        <span key={g.id}>
          {i > 0 && (i === groups.length - 1 ? " and " : ", ")}
          <Link to={groupPath(g)}>{g.title}</Link>
        </span>
      ))}
      , {extras.length} extra {extras.length === 1 ? "module" : "modules"} of Python Arena's own
    </>
  );
  if (!live)
    return (
      <>
        Next come {what}, in later updates. Until then, you can {pro}
      </>
    );
  return (
    <>
      Next, you can go on with {what}
      {live < extras.length ? ` (${live} online so far)` : ""}, or {pro}
    </>
  );
}

export default function ModulePage() {
  const { moduleId = "" } = useParams();
  const m = moduleById.get(moduleId);
  const s = useStore((x) => x);
  useTitle(m ? `Module ${m.number}: ${m.title}` : "Module not found");
  const next = m && (m.steps.find((st) => !s.steps[st.id]?.done) ?? m.steps[0]);
  // Fetch the step the main button opens, then the module's other steps, so opening one is instant.
  useEffect(() => (m && next ? prefetchModule(m.id, [next.slug]) : undefined), [m, next]);
  if (!m || !next) return <NotFound />;
  const pr = moduleProgress(s, m);
  const started = m.steps.some((st) => s.steps[st.id]);
  const fin = moduleFinished(s, m);
  const part = fin.done ? finishedPart(s, plan, modules, m.id) : null;
  return (
    <div className="module-page narrow">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/learn/">Learn</Link> <ChevronRight className="icon" aria-hidden="true" /> <span>{courseName(m)}{m.part != null ? `, part ${m.part}` : ""}</span>
      </nav>
      <div className="page-head">
        <div className="eyebrow">
          Module {m.number}
          <ExtraTag module={m} />
        </div>
        <h1>{m.title}</h1>
        <p className="lead">{m.summary}</p>
        <p className="muted small">
          {m.steps.length} steps, each with 3 challenges. {pr.done} of {pr.total} steps done.
        </p>
        {fin.done && (
          <p className="record-link">
            <Check className="icon" aria-hidden="true" />
            <span>
              You finished this module{fin.doneAt != null ? <> on <time dateTime={isoDay(fin.doneAt)}>{recordDate(fin.doneAt)}</time></> : null}
              {part != null ? `, and with it part ${part}` : ""}. <Link to="/record/">See your record</Link>
            </span>
          </p>
        )}
        <p>
          <Link className="btn btn-primary" to={stepPath(m, next)}>
            {pr.done === pr.total ? "Review" : started ? "Continue" : "Start"}: {next.title} <ArrowRight className="icon" aria-hidden="true" />
          </Link>
        </p>
      </div>
      <h2 className="h3">Steps</h2>
      <ol className="steplist">
        {m.steps.map((st, i) => {
          const sp = s.steps[st.id];
          const n = [...Array(st.challenges).keys()].filter((k) => challengeDone(sp, k)).length;
          return (
            <li key={st.id} className={sp?.done ? "done" : ""}>
              <Link to={stepPath(m, st)}>
                <span className="step-check" aria-hidden="true">
                  {sp?.done ? <Check className="icon" /> : i + 1}
                </span>
                <span className="step-title">
                  {st.title}
                  {sp?.done && <span className="visually-hidden"> (done)</span>}
                </span>
                <span className="kind-tag">
                  {n}/{st.challenges}
                  <span className="visually-hidden"> challenges done</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      {m.id === COURSE_END && (
        <section className="card course-end" aria-labelledby="course-end-h">
          <h2 id="course-end-h" className="h3">
            After the course
          </h2>
          <p>
            This is the last module of the MOOC. <CourseEndNext />
          </p>
        </section>
      )}
      {m.group != null && groupModules(m.group).at(-1)?.id === m.id && (
        <section className="card course-end" aria-labelledby="group-end-h">
          <h2 id="group-end-h" className="h3">
            After {courseName(m)}
          </h2>
          <p>
            This is the last module of {courseName(m)}.{" "}
            {groupNextParts(m.group, course.interviewGroup).map((p, i) =>
              typeof p === "string" ? (
                p
              ) : (
                <Link key={i} to={p.to}>
                  {p.text}
                </Link>
              ),
            )}
          </p>
        </section>
      )}
      <MoocCredit module={m} />
    </div>
  );
}
