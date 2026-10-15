// The Pro Track page's text (/pro/): the same in the app (src/pages/ProTrack.tsx) and in the
// pre-rendered page (scripts/prerender.mjs), so the two never differ. Every link in it leaves the
// site; commands are drawn as the lessons draw them (src/components/code-blocks.ts).
import { readOnlyBlockHtml } from "../components/code-blocks.ts";

/** The first paragraph: what the Pro Track is. */
export const PRO_LEAD =
  "Projects for your own computer, built with the tools Python programmers use every day: Python 3.14, a code editor, pip and pytest tests. Each one is a few hours of work, for after the course.";

/** What the site does and doesn't do with them, said plainly. */
export const PRO_HONEST =
  "These projects run on your computer, not on this site. Python Arena can't see your code or your test results and doesn't grade anything: the project's tests tell you when it works. The checklist on each project's page is yours to tick.";

const ext = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
// Code boxes can scroll sideways on a phone, so they take the keyboard focus (as in lessons).
const shell = (text: string) => (readOnlyBlockHtml("shell", text) ?? "").replace("<pre>", '<pre tabindex="0">');

/** The guide: what you need, setting up the computer, and putting a project on GitHub. Headings start at h2. */
export const PRO_GUIDE_HTML = `<h2>What you need</h2>
<ul>
<li>A computer with Windows, macOS or Linux. A phone or a tablet isn't enough for these projects: you write and run them on the computer.</li>
<li>Python 3.14 (3.12 or newer works too).</li>
<li>A code editor. ${ext("https://code.visualstudio.com", "Visual Studio Code")} with its Python extension is free and the one the University of Helsinki's course uses; PyCharm works just as well.</li>
</ul>
<h2>Set up your computer</h2>
<ol>
<li>Install Python. On Windows and macOS, download the installer from ${ext("https://www.python.org/downloads/", "python.org")} and run it (on Windows, tick <strong>Add python.exe to PATH</strong> on its first screen). On Linux, Python 3 usually comes with the system; if <code>python3 --version</code> says something older than 3.12, install a newer one with your package manager or with ${ext("https://docs.astral.sh/uv/", "uv")}.</li>
<li>Check it in a terminal (PowerShell on Windows, Terminal on macOS and Linux). On Windows the command is <code>py</code> (or <code>python</code>); on macOS and Linux it's <code>python3</code>. It prints its version:
${shell("python3 --version")}</li>
<li>Download a project's zip from its page and unzip it. In a terminal, go to the project's folder and make a <strong>virtual environment</strong>, a folder (<code>.venv</code>) that keeps the project's packages apart from the rest of your computer. Then install what the project needs (pytest, and pygame for a game) into it:
${shell("cd PROJECT-FOLDER\npython3 -m venv .venv\nsource .venv/bin/activate\npython -m pip install -r requirements.txt")}
On Windows, the activate line is <code>.venv\\Scripts\\activate</code>. Activate it again each time you open a new terminal for the project; the prompt then starts with <code>(.venv)</code>.</li>
<li>Run the tests. The tests fail at first: they are your to-do list.
${shell("python -m pytest")}</li>
</ol>
<p>In VS Code, open the project's folder, choose the <code>.venv</code> Python when it asks (or with <strong>Python: Select Interpreter</strong>), and the Testing panel runs the tests too.</p>
<h2>Put a project on GitHub (optional)</h2>
<p>Each project has a GitHub Actions workflow (<code>.github/workflows/test.yml</code>): in your own GitHub repository, GitHub runs the tests on its computers every time you push. The results are in your repository, for you to see; Python Arena never sees them.</p>
<ol>
<li>Sign in to ${ext("https://github.com", "GitHub")} (an account is free) and create a new repository, public or private, without a README.</li>
<li>Put the project's files in it, with Git or in the browser:
<ul>
<li><strong>With Git</strong> on your computer, in the project's folder:
${shell('git init\ngit add .\ngit commit -m "Start the project"\ngit branch -M main\ngit remote add origin https://github.com/YOUR-NAME/YOUR-REPOSITORY.git\ngit push -u origin main')}
You need Git for this: get it from ${ext("https://git-scm.com/downloads", "git-scm.com")} or your package manager. The first time, tell it your name and email, or <code>git commit</code> stops with "Author identity unknown":
${shell('git config --global user.name "Your Name"\ngit config --global user.email you@example.com')}
The first <code>git push</code> asks you to sign in, and GitHub doesn't accept your account password there. Git for Windows opens a browser window to sign you in. On macOS and Linux, sign in first with ${ext("https://cli.github.com", "GitHub CLI")} (<code>gh auth login</code>), or paste a personal access token when Git asks for the password. ${ext("https://desktop.github.com", "GitHub Desktop")} signs you in for you, too. The project's <code>.gitignore</code> keeps <code>.venv</code> and Python's own files out of the repository.
</li>
<li><strong>In the browser</strong>: on the new repository's page, choose <strong>uploading an existing file</strong>, drag in everything inside the unzipped folder except <code>.venv</code>, then <strong>Commit changes</strong>. Check that the <code>.github</code> folder comes too: some file browsers hide folders whose names start with a dot (on macOS, Cmd+Shift+. in Finder shows them; on Linux, Ctrl+H in most file managers). Later uploads, once the repository has files, go through <strong>Add file</strong>, then <strong>Upload files</strong>.</li>
</ul></li>
<li>Open the repository's <strong>Actions</strong> tab. The workflow <strong>Tests</strong> installs the project's packages and runs <code>python -m pytest</code>: a red cross means some tests fail (open the run to see which), a green check means they all pass. Each push runs it again.</li>
</ol>
<p>On a phone, github.com in the browser and the GitHub mobile app both show your repository, its code and the Actions tab with each run's result. You can even fix a small thing in github.com's editor on the phone; the commit runs the tests again. Writing the project and running the tests yourself need the computer.</p>`;
