// /interview/: the interview prep page. Its text is content/interview.yaml, checked by the content
// build (src/generated/interview.json). The modules of its group come from the course plan, with this
// browser's progress, and the drill sets from the course index (content/drills/interview-*.yaml). The
// pre-rendered page (scripts/prerender.mjs) has the same text, without the progress.
import { Check, ChevronRight, Crosshair, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import raw from "../generated/interview.json";
import { course, groupById, groupModules, moduleById, modulePath, stepPath } from "../content";
import type { InterviewPage } from "../content/types";
import { moduleProgress } from "../state/derived";
import { useStore } from "../state/store";
import { SiteInlineMd, SiteMarkdown, useInAppLinks } from "../components/Markdown";
import { COST_COLUMNS, INTERVIEW_HEADINGS, INTERVIEW_START, INTERVIEW_TITLE, PATTERN_COLUMNS, questions } from "../lib/interview";
import { useTitle } from "../lib/title";

const page = raw as unknown as InterviewPage;
const ext = <span className="visually-hidden"> (opens in a new tab)</span>;

/** A section's lead, when it has one. */
const Lead = ({ text }: { text: string }) => (text ? <SiteMarkdown text={text} className="iv-lead" /> : null);

/**
 * A table of the page, named after its section's heading (the section has that name already, so the
 * table's frame, which scrolls when it must, is "<heading>, table"). On a phone each row shows as a block with
 * each cell under its column's name (the CSS's data-label), so the table keeps its roles explicitly:
 * a browser may drop a table's meaning when its parts no longer show as a table.
 */
function Table({ name, columns, rows, className = "" }: { name: string; columns: readonly string[]; rows: { key: string; cells: React.ReactNode[] }[]; className?: string }) {
  return (
    <div className={"table-scroll iv-table " + className} tabIndex={0} role="region" aria-label={`${name}, table`}>
      <table role="table">
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((c) => (
              <th key={c} scope="col" role="columnheader">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((r) => (
            <tr key={r.key} role="row">
              {r.cells.map((cell, i) => (
                <td key={i} role="cell" data-label={columns[i]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The group's modules, each with this browser's progress, as on the course page. */
function Modules() {
  const s = useStore((x) => x);
  const group = groupById.get(page.modules.group);
  const planned = groupModules(page.modules.group);
  const finished = planned.filter((pm) => {
    const m = moduleById.get(pm.id);
    return !!m && moduleProgress(s, m).done === m.steps.length;
  }).length;
  return (
    <section aria-labelledby="iv-modules-h">
      <h2 id="iv-modules-h">{group?.title}</h2>
      <Lead text={page.modules.lead} />
      <ol className="modules iv-modules">
        {planned.map((pm) => {
          const m = moduleById.get(pm.id);
          if (!m)
            return (
              <li key={pm.id} className="module module-planned">
                <span className="module-num" aria-hidden="true">
                  {pm.number}
                </span>
                <span className="module-title">
                  <span className="visually-hidden">Module {pm.number}: </span>
                  {pm.title}
                </span>
                <span className="module-count">
                  <Lock className="icon" aria-hidden="true" /> not written yet
                </span>
              </li>
            );
          const pr = moduleProgress(s, m);
          const complete = pr.done === pr.total;
          return (
            <li key={pm.id} className={"module module-live" + (complete ? " module-done" : "")}>
              <Link to={modulePath(m)} className="module-link">
                <span className="module-num" aria-hidden="true">
                  {complete ? <Check className="icon" /> : pm.number}
                </span>
                <span className="module-title">
                  <span className="visually-hidden">Module {pm.number}: </span>
                  {m.title}
                </span>
                <span className="module-count">
                  <span aria-hidden="true">
                    {pr.done}/{pr.total} steps
                  </span>
                  <span className="visually-hidden">
                    , {pr.done} of {pr.total} steps done
                  </span>
                </span>
                <span className="bar module-bar" aria-hidden="true">
                  <span style={{ width: `${(pr.done / Math.max(pr.total, 1)) * 100}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      {finished > 0 && (
        <p className="muted small">
          You finished {finished} of the {planned.length} modules in this browser.
        </p>
      )}
    </section>
  );
}

export default function Interview() {
  useTitle(INTERVIEW_TITLE);
  // Links in the text to the site's own pages open in the app.
  const inApp = useInAppLinks();
  const sets = course.interviewSets ?? [];
  return (
    <div className="interview-page narrow" onClick={inApp}>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/learn/">Learn</Link> <ChevronRight className="icon" aria-hidden="true" /> <span>{INTERVIEW_TITLE}</span>
      </nav>
      <div className="page-head">
        <h1>{INTERVIEW_TITLE}</h1>
        <SiteMarkdown text={page.intro} className="lead iv-intro" />
      </div>

      <Modules />

      <section aria-labelledby="iv-drills-h">
        <h2 id="iv-drills-h">{INTERVIEW_HEADINGS.drills}</h2>
        <Lead text={page.drills.lead} />
        <ul className="iv-sets">
          {sets.map((set) => (
            <li key={set.id}>
              <span className="iv-set-title">{set.title}</span> <span className="muted">{questions(set.drills)}</span>
            </li>
          ))}
        </ul>
        <p>
          <Link className="btn btn-primary" to={INTERVIEW_START}>
            <Crosshair className="icon" aria-hidden="true" /> Start interview prep in Deathmatch
          </Link>
        </p>
      </section>

      <section aria-labelledby="iv-patterns-h">
        <h2 id="iv-patterns-h">{INTERVIEW_HEADINGS.patterns}</h2>
        <Lead text={page.patterns.lead} />
        <Table
          name={INTERVIEW_HEADINGS.patterns}
          columns={PATTERN_COLUMNS}
          rows={page.patterns.rows.map((r) => ({
            key: r.signal,
            cells: [
              <SiteInlineMd text={r.signal} />,
              <SiteInlineMd text={r.technique} />,
              <>
                <Link to={stepPath({ id: r.step.module }, r.step)}>{r.step.title}</Link> <span className="muted">(module {r.step.number})</span>
              </>,
            ],
          }))}
        />
      </section>

      <section aria-labelledby="iv-costs-h">
        <h2 id="iv-costs-h">{INTERVIEW_HEADINGS.costs}</h2>
        <Lead text={page.costs.lead} />
        <Table
          name={INTERVIEW_HEADINGS.costs}
          className="iv-costs"
          columns={COST_COLUMNS}
          rows={page.costs.rows.map((r) => ({
            key: r.operation,
            cells: [<SiteInlineMd text={r.operation} />, <b className="iv-cost">{r.cost}</b>, <SiteInlineMd text={r.note} />],
          }))}
        />
        <Lead text={page.costs.after} />
      </section>

      <section aria-labelledby="iv-checklist-h">
        <h2 id="iv-checklist-h">{INTERVIEW_HEADINGS.checklist}</h2>
        <Lead text={page.checklist.lead} />
        <ol className="iv-checklist">
          {page.checklist.items.map((item) => (
            <li key={item}>
              <SiteInlineMd text={item} />
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="iv-tools-h">
        <h2 id="iv-tools-h">{INTERVIEW_HEADINGS.tools}</h2>
        <Lead text={page.tools.lead} />
        <ul className="iv-tools">
          {page.tools.modules.map((t) => (
            <li key={t.name}>
              <h3 className="h3">
                <a href={t.url} target="_blank" rel="noopener noreferrer">
                  <code>{t.name}</code>
                  {ext}
                </a>
              </h3>
              <p>
                <SiteInlineMd text={t.about} />
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="iv-practice-h">
        <h2 id="iv-practice-h">{INTERVIEW_HEADINGS.practice}</h2>
        <Lead text={page.practice.lead} />
        <ul className="iv-sites">
          {page.practice.sites.map((site) => (
            <li key={site.url}>
              <a href={site.url} target="_blank" rel="noopener noreferrer">
                {site.name}
                {ext}
              </a>
              : <SiteInlineMd text={site.about} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
