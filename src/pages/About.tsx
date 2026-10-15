import { Link } from "react-router-dom";
import { course, groups } from "../content";
import { MOOC_LICENSE_URL, MOOC_NAME, MOOC_URL, REPO_URL } from "../lib/site";
import { useTitle } from "../lib/title";

const ext = <span className="visually-hidden"> (opens in a new tab)</span>;
const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
    {ext}
  </a>
);

export default function About() {
  useTitle("About and credits");
  return (
    <div className="narrow about md">
      <div className="page-head">
        <h1>About and credits</h1>
        <p className="lead">Python Arena is a free, non-commercial site for learning Python, with real Python running in the browser.</p>
      </div>

      <h2>The course it follows</h2>
      <p>
        The modules of Introduction to Programming and the Advanced Course in Programming follow the order and topics of the <A href={MOOC_URL}>{MOOC_NAME}</A>, a free online course by the University of Helsinki. Its material was written by Erkki Kaila, Antti Laaksonen and Matti Luukkainen (a few exercises by Arto Hellas) of the Agile Education Research group, and it is licensed under <A href={MOOC_LICENSE_URL}>Creative Commons BY-NC-SA 4.0</A>. Every lesson page names the MOOC sections it follows and links to them.
        {groups.length > 0 && ` The extra modules after the course (${groups.map((g) => g.title).join(" and ")}) are Python Arena's own: they follow no MOOC section, and their lessons are shared under the same license.`}
      </p>
      <p>
        Python Arena's explanations and exercises are written for this site; no exercise templates, tests or images are copied from the MOOC. Because the lessons follow the MOOC's structure, the lesson content is shared under the same license, CC BY-NC-SA 4.0. Python Arena is an independent project: it is not affiliated with, sponsored or endorsed by the University of Helsinki or MOOC.fi, and completing modules here doesn't earn MOOC credits or ECTS.
      </p>
      <p>
        <Link to="/projects/">Projects</Link> are Python Arena's own: larger programs built over several milestones, each starting from your code of the one before, and each checked with the reference Python when the site is built, like the lessons.
      </p>
      <p>
        The <Link to="/pro/">Pro Track</Link> is projects for after the course, built on your own computer with Python and pytest. Python Arena doesn't grade them and can't see your code or your test results: the tests run on your computer, or with GitHub Actions in your own GitHub repository. The checklist on each project's page is your own ticks.
      </p>
      <p>
        <Link to="/topics/">Topics A to Z</Link> lists Python keywords, functions, methods and ideas, each with one line and links to the lesson steps that teach it. It points into the lessons; it isn't complete Python documentation, which is at <A href="https://docs.python.org/3/">docs.python.org</A>.
      </p>

      <h2>How Python runs here</h2>
      <p>
        When you press Check or Run, your program runs in <A href="https://pyodide.org">Pyodide</A>: CPython, the standard Python interpreter, compiled to WebAssembly, with Python's standard library. It runs on your device, in a background worker of this page; your code isn't sent anywhere. The first time, the browser downloads it (about 6 MB) and keeps it in its cache, so it also works offline.
      </p>
      <p>
        Every expected output on the site comes from running the model solution with the same version of Python (CPython {course.python}) when the site is built, through the same small harness the page uses, so the outputs you are compared with are what Python really prints. Each solution runs twice, with different hash seeds, and must print the same both times. Before an update goes live, every lesson, drill and project program is also replayed in Pyodide itself, and browser tests go through every kind of page, including an accessibility check (axe, WCAG 2.2 AA) on phone widths in both themes.
      </p>
      <p>
        Input is typed in advance: a test gives your program its input lines, and each <code>input()</code> takes the next one. The output shows each line you'd have typed after its prompt, as a terminal does. A program that runs for longer than 5 seconds is stopped, so an endless loop can't freeze the page.
      </p>
      <p>
        Programs that use pygame (parts 13 and 14) run with <A href="https://pyga.me">pygame-ce</A>, which the browser downloads the first time one does (about 1.5 MB). pygame normally opens a window on your screen; here the window has no screen of its own: each frame the program shows becomes a picture on the page, the keys you press on it and your clicks go to the program at the frame you made them, and the program's clock is counted rather than waited for, so an animation goes the same way every time. Pressing a key runs the program again from the start with everything that happened so far, and the page shows the new frames. Tests compare what each frame draws (fills, images and shapes, which the page can show as text), not the pixels, because letters are drawn a little differently on each computer. Sound is silent. pygame programs are checked when the site is built in Pyodide itself, the same Python the page runs.
      </p>

      <h2>Your data</h2>
      <p>No account, no ads, no analytics. Your progress and code are saved in this browser's storage only. Python is kept in the browser's cache so it works offline.</p>
      <p>
        To continue on another device, <Link to="/settings/">Settings</Link> makes a transfer link, a QR code or a progress file that carries your progress (and your code if you choose) to the other browser, which shows what would change before anything is imported; Python Arena has no server and doesn't keep a copy.
      </p>
      <p>
        <Link to="/record/">Your record</Link> lists the modules and projects finished in this browser, with their dates, and prints or saves as a PDF. It is made from this browser's progress only, and nobody checks it.
      </p>

      <h2>Licenses</h2>
      <ul>
        <li>Lesson content (the files in <code>content/</code>): CC BY-NC-SA 4.0.</li>
        <li>
          The site's own code: MIT (<A href={`${REPO_URL}/blob/main/LICENSE`}>LICENSE</A>). It uses React, React Router, CodeMirror, marked, Lucide icons and uqr for QR codes (MIT and ISC licenses) and the Inter and JetBrains Mono fonts (SIL Open Font License); <a href={import.meta.env.BASE_URL + "licenses/npm-packages.txt"}>their license texts</a>.
        </li>
        <li>
          Python runs with <A href="https://github.com/pyodide/pyodide">Pyodide</A> (Mozilla Public License 2.0), which includes CPython (Python Software Foundation License) and other open-source parts under their own licenses. Details and where to get their source code: <A href={`${REPO_URL}/blob/main/THIRD_PARTY_NOTICES.md`}>third-party notices</A>.
        </li>
        <li>
          pygame programs use Pyodide's build of <A href="https://github.com/pygame-community/pygame-ce">pygame-ce</A> (GNU Lesser General Public License 2.1), unchanged, with the SDL, FreeType and image libraries it includes and pygame's default font (GNU FreeFont); details in the third-party notices. The images the pygame lessons use are Python Arena's own, under CC BY-NC-SA 4.0 like the lessons.
        </li>
        <li>The Pro Track's projects are MIT-licensed like the site's code. The packages they use (pytest under the MIT license, pygame-ce under the LGPL 2.1) are installed by pip on your computer; they aren't part of Python Arena's download.</li>
      </ul>
      <p>"Python" and the Python logos are trademarks or registered trademarks of the Python Software Foundation. Python Arena uses the word only to say what it teaches; its logo is its own drawing of the interpreter's &gt;&gt;&gt; prompt.</p>

      <h2>Source and problems</h2>
      <p>
        The source is on <A href={REPO_URL}>GitHub</A>. Found a mistake? Every challenge has a "Report a problem" link, or <A href={`${REPO_URL}/issues/new`}>open an issue</A>. Settings for the theme, text size and the Python download are on the <Link to="/settings/">settings page</Link>.
      </p>
    </div>
  );
}
