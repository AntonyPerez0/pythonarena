import { ArrowRight, BookOpen, CalendarCheck, Check, Compass, Cpu, Crosshair, GraduationCap, Lightbulb, ListChecks, Smartphone, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import { course, groups, modules, plan, prefetchStep, projects, stepPath, totalChallenges, totalSteps, modulePath } from "../content";
import { localDay, useStore } from "../state/store";
import { nextStep, stepsDone } from "../state/derived";
import { useTitle } from "../lib/title";
import { loadStepPage } from "./editorPages";
import { MOOC_URL } from "../lib/site";
import { highlight } from "../components/highlight";

const SAMPLE = `def greet(name):
    return f"Hello, {name}!"

name = input("Name: ")
print(greet(name))`;

export default function Home() {
  useTitle(null);
  const s = useStore((x) => x);
  const next = nextStep(s);
  const done = stepsDone(s);
  const first = modules[0];
  const drillCount = modules.reduce((a, m) => a + m.drills, 0) + course.interviewDrills;
  const dailyDone = localDay() in s.daily;
  const allLive = modules.length === plan.length;
  const extraCount = plan.filter((m) => m.course === "extra").length;
  const extraLive = plan.filter((m) => m.course === "extra" && m.live).length;
  const moocCount = plan.length - extraCount;
  // Every module that follows the MOOC is online, while some extra modules of Python Arena's own aren't yet.
  const moocLive = !allLive && plan.every((m) => m.course === "extra" || m.live);
  const groupNames = groups.map((g) => g.title).join(" and ");
  // The MOOC parts whose modules are all online, from part 1 on (the course is written in order).
  const parts = [...new Set(plan.filter((m) => m.part != null).map((m) => m.part!))].sort((a, b) => a - b);
  const lastPart = parts.findIndex((n) => plan.some((m) => m.part === n && !m.live));
  const partsLive = lastPart < 0 ? parts.length : lastPart;
  // The placement quiz skips modules without marking their steps done: then the first step isn't module 1's.
  const placed = !done && s.placed.length > 0;
  // Fetch the lesson the Continue (or Start) button opens, so it shows at once.
  const nextKey = (done || placed) && next ? [next.module.id, next.step.slug] : null;
  useEffect(() => (nextKey ? prefetchStep(nextKey[0], nextKey[1], loadStepPage) : undefined), [nextKey?.[0], nextKey?.[1]]);
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="container hero-grid">
          <div>
            <div className="eyebrow">Free and non-commercial</div>
            <h1>
              Learn Python by writing <span className="hero-accent">real</span> Python
            </h1>
            <p className="hero-lead">
              Every exercise is run by real Python (CPython 3.14, compiled to WebAssembly), inside your browser, on your own device. The lessons follow the University of Helsinki's Python Programming MOOC, from your first <code>print</code> to classes, recursion, regular expressions and games with pygame, with their own explanations and exercises.
            </p>
            <div className="hero-actions">
              {next && (
                <Link className="btn btn-brand btn-lg" to={done || placed ? stepPath(next.module, next.step) : modulePath(first)}>
                  {done ? `Continue: ${next.step.title}` : placed ? `Start: ${next.step.title}` : "Start with module 1"} <ArrowRight className="icon" aria-hidden="true" />
                </Link>
              )}
              <Link className="btn btn-lg" to="/learn/">
                See all modules
              </Link>
            </div>
            <ul className="hero-points">
              <li>
                <Check className="icon" aria-hidden="true" /> No account, no ads
              </li>
              <li>
                <Check className="icon" aria-hidden="true" /> Works on phones
              </li>
              <li>
                <Check className="icon" aria-hidden="true" /> Works offline after one download
              </li>
            </ul>
          </div>
          <figure className="shot" aria-label="Example: a program that reads a name and greets it, with its tests passing">
            <div className="shot-bar">
              <span className="shot-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="shot-tab">main.py</span>
            </div>
            <pre className="shot-code" tabIndex={0}>
              <code>{highlight(SAMPLE)}</code>
            </pre>
            <div className="shot-result">
              <span className="shot-pass">
                <Check className="icon" aria-hidden="true" /> All tests passed
              </span>
              <ul>
                <li>
                  <Check className="icon ic-good" aria-hidden="true" /> Input Ada prints Name: Ada, then Hello, Ada!
                </li>
                <li>
                  <Check className="icon ic-good" aria-hidden="true" /> Hidden test
                </li>
              </ul>
            </div>
          </figure>
        </div>
      </section>

      <section className="section-tight">
        <div className="container">
          <div className="card card-callout status-card">
            {allLive || moocLive ? (
              <>
                <h2 className="h3">The whole course is online</h2>
                {allLive ? (
                  <p>
                    All {plan.length} modules are online: {moocCount} following the MOOC (Introduction to Programming and the Advanced Course in Programming){extraCount > 0 && ` and ${extraCount} extra ${extraCount === 1 ? "module" : "modules"} of Python Arena's own (${groupNames})`}, with {totalSteps} steps, {totalChallenges} challenges and {drillCount} practice drills. <Link to="/learn/">The course page</Link> lists them all.
                  </p>
                ) : (
                  <p>
                    All {moocCount} modules following the MOOC are online (Introduction to Programming and the Advanced Course in Programming){extraLive > 0 && `, and ${extraLive} of the ${extraCount} extra modules of Python Arena's own (${groupNames})`}, with {totalSteps} steps, {totalChallenges} challenges and {drillCount} practice drills. {extraLive > 0 ? "The other extra modules come" : `The ${extraCount} extra ${extraCount === 1 ? "module" : "modules"} of Python Arena's own (${groupNames}) come`} in later updates. <Link to="/learn/">The course page</Link> lists them all.
                  </p>
                )}
                <p>
                  {projects.length ? `${projects.length === 1 ? "A project lets" : `${projects.length} projects let`} you build a larger program over several milestones.` : "Projects, larger programs built over several milestones, are on their way."} <Link to="/projects/">See the projects</Link>
                </p>
                <p>
                  After the course, the Pro Track has projects to build on your own computer with Python and pytest tests. <Link to="/pro/">See the Pro Track</Link>
                </p>
              </>
            ) : (
              <>
                <h2 className="h3">What's online</h2>
                <p>
                  {partsLive > 0 ? `Parts 1 to ${partsLive} of the MOOC are online: ` : ""}
                  {modules.length} of the {plan.length} planned modules, with {totalSteps} steps, {totalChallenges} challenges and {drillCount} practice drills. The remaining modules come in later updates. <Link to="/learn/">The course page</Link> lists every planned module.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>How it works</h2>
            <p className="section-lead">Read a short lesson, then solve three challenges on the same idea. Each challenge is checked the moment you press Check.</p>
          </div>
          <ol className="how">
            <li>
              <span className="how-icon" aria-hidden="true">
                <BookOpen className="icon" />
              </span>
              <h3>Read</h3>
              <p>A short explanation with example programs. Every example was run with real Python when the site was built, so the outputs shown are what Python really prints.</p>
            </li>
            <li>
              <span className="how-icon" aria-hidden="true">
                <ListChecks className="icon" />
              </span>
              <h3>Write</h3>
              <p>Fill in blanks, fix broken programs, or write whole programs. Tests compare your output with the expected output, including hidden tests with other inputs.</p>
            </li>
            <li>
              <span className="how-icon" aria-hidden="true">
                <Lightbulb className="icon" />
              </span>
              <h3>Learn from mistakes</h3>
              <p>Python's error messages come with a plain-English explanation of what they mean. Hints unlock one at a time, and a solution after a few tries.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section-practice">
        <div className="container">
          <div className="section-head">
            <h2>Practice</h2>
            <p className="section-lead">Quick drills unlock as you finish the lessons, and the ones you miss come back more often until you know them.</p>
          </div>
          <div className="features features-4">
            <Link className="feature" to="/deathmatch/">
              <span className="feature-icon" aria-hidden="true">
                <Crosshair className="icon" />
              </span>
              <h3>Deathmatch</h3>
              <p>Endless reps: predict the output, fill the blank, spot the bug, will it run, and small programs to write. One miss ends a run, or play with three lives. Interview prep is open to everyone.</p>
            </Link>
            <Link className="feature" to="/daily/">
              <span className="feature-icon" aria-hidden="true">
                <CalendarCheck className="icon" />
              </span>
              <h3>Daily challenge</h3>
              <p>{dailyDone ? "Done for today. A new question comes at midnight." : "One question a day, the same for everyone. Answer it to keep your streak going."}</p>
            </Link>
            <Link className="feature" to="/placement/">
              <span className="feature-icon" aria-hidden="true">
                <Compass className="icon" />
              </span>
              <h3>Placement quiz</h3>
              <p>Already know some Python? One question for each module that follows the MOOC shows where to start, and which modules you can skip.</p>
            </Link>
            <Link className="feature" to="/interview/">
              <span className="feature-icon" aria-hidden="true">
                <GraduationCap className="icon" />
              </span>
              <h3>Interview prep</h3>
              <p>{course.interviewDrills} interview questions to drill, the modules on data structures and algorithms, which technique fits which problem, and what Python's operations cost.</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <h2>Real Python, on your device</h2>
          </div>
          <div className="features">
            <div className="feature">
              <span className="feature-icon" aria-hidden="true">
                <Cpu className="icon" />
              </span>
              <h3>The real Python</h3>
              <p>CPython 3.14, the standard Python, compiled to WebAssembly (Pyodide), with Python's standard library. Error messages are the ones Python prints.</p>
            </div>
            <div className="feature">
              <span className="feature-icon" aria-hidden="true">
                <WifiOff className="icon" />
              </span>
              <h3>Offline after one download</h3>
              <p>Python is about 6 MB, downloaded once and kept in your browser. On mobile data the site asks first.</p>
            </div>
            <div className="feature">
              <span className="feature-icon" aria-hidden="true">
                <Smartphone className="icon" />
              </span>
              <h3>Made for phones too</h3>
              <p>A row of symbol keys under the editor (colons, brackets, quotes and a key for print), and your progress saved in this browser.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container faq-wrap">
          <div className="section-head">
            <h2>Questions</h2>
          </div>
          <div className="faq">
            <details>
              <summary>Is this the University of Helsinki's course?</summary>
              <p>
                No. Python Arena follows the order and topics of their free <a href={MOOC_URL}>Python Programming MOOC</a> and credits it on every lesson that follows it, but it's an independent project with its own explanations and exercises. It isn't affiliated with or endorsed by the university, and it doesn't give MOOC credits or certificates.
              </p>
            </details>
            <details>
              <summary>Do I need to install anything?</summary>
              <p>
                No. A recent browser is enough: Chrome, Edge, Firefox or Safari. After the course, the optional <Link to="/pro/">Pro Track</Link> has projects for your own computer, with Python and pytest.
              </p>
            </details>
            <details>
              <summary>Where is my progress saved?</summary>
              <p>In this browser only (its local storage). There's no account and nothing is sent to a server. Clearing the browser's site data removes it.</p>
            </details>
            <details>
              <summary>I found a mistake. What should I do?</summary>
              <p>Every challenge has a "Report a problem" link that opens a GitHub issue with your code filled in. Thank you!</p>
            </details>
          </div>
        </div>
      </section>
    </div>
  );
}
