# Python Arena

The site: **https://pythonarena.org/**

https://github.com/user-attachments/assets/741f3cc9-38af-4b16-a9a0-e6b7f0b9fc0e

A free, non-commercial site for learning Python in the browser, with **real Python running on your own device**: CPython 3.14, compiled to WebAssembly by [Pyodide](https://pyodide.org). It follows the order and topics of the University of Helsinki's [Python Programming MOOC 2026](https://programming-26.mooc.fi) (parts 1 to 14), with its own lessons and exercises. It is a sister site of [C/C++ Arena](https://github.com/AntonyPerez0/cpp-arena), [Java Arena](https://github.com/AntonyPerez0/Java-Arena) and [RustArena](https://github.com/AntonyPerez0/RustArena), and works the same way.

Python Arena is not affiliated with or endorsed by the University of Helsinki, MOOC.fi or the Python Software Foundation. "Python" is a registered trademark of the Python Software Foundation.

## Status

| Part | What | Status |
|---|---|---|
| Foundation | Java Arena's site rebuilt for Python: the Pyodide engine, a shared harness that runs programs the same way in the browser and at build time, the content build on the reference CPython, Python's errors explained in plain English, Python colors and a logo of our own | done |
| MOOC part 1 to 7 | Introduction to Programming: modules 1 to 32 (printing, input, variables, conditions, loops, strings, functions, lists, dictionaries, tuples, files, errors, modules, random numbers, dates, data processing) | done |
| MOOC part 8 to 12 | Advanced Course in Programming: modules 33 to 52 (objects and classes, encapsulation, class attributes, inheritance, operator overloading, iterators, comprehensions, recursion, functions as arguments, generators, functional programming, regular expressions) | done |
| MOOC part 13 and 14 | pygame (modules 53 to 58): windows, images, animation, events, a box-pushing puzzle game built step by step, and your own game (a coin chase), with pygame running in the browser without a screen | done |
| Data structures and algorithms | Python Arena's own modules after the MOOC (59 to 65), the group "Data structures and algorithms": complexity and searching, sorting, hash tables, trees and heaps, graphs, recursion and backtracking, dynamic programming, with big tests that a slow solution can't pass; the interview prep page | done |
| Practice | Deathmatch drills for every module, interview prep, the daily challenge, the placement quiz | done |
| Projects | Four programs built over several milestones: a calculator, the Game of Life, a text adventure and a library desk | done |
| Pro Track | Three projects for your own computer with Python 3.14 and pytest: a word statistics tool, a book log with SQLite, and a memory game with pygame-ce | done |
| Site | Topics A to Z, moving progress between devices (links, QR codes, files), a personal record, offline use, the Arena family | done |

## The site

- **Pages**: a home page, the course plan (the MOOC's 58 modules, then a section for each group of extra modules), a page per module, a lesson page per step, the interview prep page, settings and about. React 18 with React Router; every page is also pre-rendered as plain HTML for search engines and link previews (`scripts/prerender.mjs`), with a sitemap. The design is Java Arena's in Python's blue and yellow: light and dark themes, four text sizes, and a desktop layout where the lesson and the editor fill the window.
- **Lessons**: each step has a short lesson and three challenges: fill-in blanks, programs to fix, programs to write, or "What does it print?" (read a program and type each line it prints). Examples in the lessons are real runs: programs with their output (input typed in shows after its prompt, as in a terminal), sessions of the interactive interpreter (`>>>`), and programs that stop with an error, with Python's own traceback. Programs are graded by input and output tests (some hidden, so answers can't be typed in directly), or by tests that call the learner's functions and methods (such as `double(21)`, whose value is printed as the interpreter would; a function that prints instead of returning fails), plus optional rules about the code. A **big test** is sized so that a correct but slow way runs out of time (200,000 values, say): the page then says the program is too slow for a big input, and the build checks each such challenge's slow solution against it (see [Speed tests](content/README.md#speed-tests-big-and-slow)). Hints unlock one at a time and a solution after all hints or three checks. Syntax errors and crashes get plain-English explanations ([`src/engine/friendly.ts`](src/engine/friendly.ts)), with the line they happened on. Every challenge has a "Report a problem" link that opens a GitHub issue with the code filled in.
- **Programs of several files**: a challenge can have modules of its own next to `main.py` (a tab per file), and tests can give the program files to read and check the files it writes.
- **pygame**: parts 13 and 14 use pygame. The browser has no screen for pygame's own window, so Python Arena runs pygame-ce without one ([`src/engine/arena_pygame.py`](src/engine/arena_pygame.py)): each frame a program shows becomes a picture and a text, "the window as text" (every fill, blit and shape it drew), keys and clicks come from the test or the learner at the frame they happen, and the clock is counted instead of waited for, so an animation runs the same every time. The page plays the frames at the program's own pace; pressing keys or clicking in the window runs the program again with everything that happened so far. Tests compare the window as text (letters are drawn a little differently on each computer, the drawing isn't). The images the lessons use are Python Arena's own pixel art, drawn by [`scripts/make-sprites.mjs`](scripts/make-sprites.mjs) into `content/assets/`.
- **Interview prep** (`/interview/`, [`content/interview.yaml`](content/interview.yaml)): the data structures and algorithms modules with your progress, the interview drill sets and a button that starts Deathmatch's interview prep mode, a table of which technique fits which kind of problem (each linked to the step that teaches it), what Python's operations cost in CPython, a checklist for working through a problem out loud, Python's standard tools for interview problems, and places to practice. Linked from the home page, the footer, the course page's group and Deathmatch.
- **Practice**: Deathmatch, endless quick drills (predict the output, fill the blank, spot the bug, does it run, pick one, and a "boss rep" program to write every 8th rep) that unlock as lesson steps are finished, in four modes: one life, three lives, spaced review of due drills, and interview prep, which is open to everyone. Also a daily challenge and a placement quiz that can skip modules. Every drill's program runs on the reference CPython at build time, so the answers are what Python really prints.
- **Playground**: write and run any program with your own input, in files of its own if you like; a pygame program runs in its window, with the site's images in its folder. It's saved in the browser and can be shared as a link.
- **Content**: lessons are YAML files in [`content/`](content/README.md). The build runs every example and model solution on the reference CPython (pygame programs in Pyodide on Node, the browser's own interpreter), so the expected outputs are real, and then CI replays them in Pyodide and fails on any difference. For big tests it also runs each challenge's slow solution, which must still be running after twice the page's limit (a learner's computer can be faster than the build's), and times the model solution, which must keep well within it. Both are timed at the end of the build, alone, so the other programs it runs don't make a way look slower than it is (the slow solutions' checks are cached, as they take 20 seconds each).
- **Progress** is saved in the browser (localStorage). The site works offline once visited (a service worker keeps the pages; the engine keeps its own copy) and can be installed as an app.
- **Projects** (`/projects/`): larger programs built over several milestones; each milestone starts from the learner's own code that passed the one before.
- **Moving progress**: Settings, under Your progress, makes a transfer link (progress only, or with your code too) to copy, share or show as a QR code, or a progress file to download; it all happens in the browser, with no server.
- **The Pro Track** (`/pro/`, [`pro-track/`](pro-track/README.md)): three projects for after the course, built on your own computer with Python 3.14, a virtual environment and pytest: a command-line word statistics tool, a book log stored in SQLite with `sqlite3`, and a memory game with pygame-ce whose rules are tested apart from its window. Each comes with starter code and tests to make pass, downloadable as a zip or browsable on GitHub, with a workflow that runs the tests with GitHub Actions in your own repository. Python Arena can't see your code and grades nothing: the checklist on each project's page is your own ticks. CI checks that each starter fails its tests and that the model solutions in `pro-track-solutions/` pass them all; the site never offers those solutions for download.
- **Topics A to Z** (`/topics/`): Python's keywords, functions, methods, types, exceptions and ideas, each with a one-line description and links to the steps that teach it; the build checks that every step exists and really mentions the term. It links to the Python documentation for the rest.
- **Your record** (`/record/`): a personal record of the modules and projects finished in this browser, with their dates, that prints or saves as a PDF; it says plainly that it is made only from this browser's progress and that nobody checks it.

## How the engine works

- **Python**: [Pyodide](https://pyodide.org) 314.0.7, which is CPython 3.14.2 compiled to WebAssembly, from the pinned npm package. `scripts/copy-engine.mjs` copies its files into `public/engine/` with gzip copies and a manifest (about 6.4 MB to download), and the pygame-ce 2.5.7 wheel that Pyodide builds (1.5 MB, `engine-packages/`, checked against Pyodide's lock file), which the browser downloads only the first time a program imports pygame.
- **In the page**: one worker holds Python and runs a challenge's tests one after another ([`src/engine/run.worker.ts`](src/engine/run.worker.ts)); a test that runs past the time limit (5 seconds, or 10 for a challenge with a big test: [`src/grader/limits.ts`](src/grader/limits.ts)) is stopped by replacing the worker, which starts again from the cache in a second or two. The engine is downloaded once (asking first when the browser reports mobile data, and on phones and tablets whose browser can't tell), unpacked with `DecompressionStream`, and kept in Cache Storage, so it also works offline.
- **The harness**: [`src/engine/arena.py`](src/engine/arena.py) runs a program in both the browser and the build, so what decides the output is the same file: `input()` echoes what a test types, a test can load the program as a module and call its functions (code under `if __name__ == "__main__":` doesn't run), tracebacks keep only the learner's own lines, the recursion limit counts from the program's first line, output is capped, and error numbers in tracebacks are Linux's.
- **Fidelity**: the expected outputs come from CPython 3.14.2 (the version Pyodide runs) at build time; `npm run content:pyodide` replays every one of those programs in Pyodide on Node and fails on any difference. Every solution also runs twice with different hash seeds, so no expected output depends on the order of a set of strings.

Licenses of the engine's parts are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), with their texts in [`engine-licenses/`](engine-licenses/).

## Run locally

Needs Node 22.18 or newer (the build scripts import some `.ts` files as they are) and CPython 3.14.2, the version Pyodide runs: the content build looks for it as `$PYTHON`, then `python3.14` on the PATH, then `uv python find 3.14.2` (install it with `uv python install 3.14.2`).

```bash
npm install        # also copies Pyodide into public/engine
npm run dev        # checks the lessons, then serves http://localhost:5173/
```

| Script | What it does |
|---|---|
| `npm run content` | Checks every lesson on the reference CPython and writes `src/generated/`, the lesson files in `public/lessons/` (one per step, loaded when the step is opened) and the images in `public/images/` |
| `npm run build` | Checks the lessons, type-checks and builds `dist/` (pre-rendered pages, service worker, sitemap) |
| `npm run content:pyodide` | Replays every lesson program in Pyodide on Node and compares with CPython (after `npm run content`), and times the big tests' model solutions there |
| `npm run pro-track-check` | The Pro Track's projects with Python 3.14 and pytest: each starter fails its tests, and with its model solution every test passes |
| `npm run check-links` | After a build: every internal link resolves, and every external link goes to a host on the list in [`scripts/check-links.mjs`](scripts/check-links.mjs) |
| `npm run test:unit` | Unit tests without a browser (`scripts/**/*.test.mjs`) |
| `npm run test:e2e` | Browser tests of the built site in headless Chromium: pre-rendered pages, lessons, the engine, errors and crashes, endless loops, big tests, pygame windows, the mobile-data question, offline, moving progress, projects, the record, the Pro Track, topics, the interview prep page, and every page type at phone widths in both themes with axe (WCAG 2.2 AA). `-- --shots dir` saves screenshots |
| `node scripts/build-content.mjs --dry --module-file 05-conditionals.yaml` | Checks one module (and its drills) without writing anything, for writing lessons |
| `node scripts/make-sprites.mjs` | Draws the pygame lessons' images into `content/assets/` |

A plain `npm run build` (no variables set) makes the site as CI does for the live site: pages at `/`, with canonical links and the sitemap naming `SITE_URL`, by default `https://pythonarena.org`. `npm run check-links` checks it as it is. To build for a github.io project page instead (see Deploy), set `BASE_PATH` and `SITE_URL` for the build and for the checks. `node scripts/serve.mjs` serves `dist/` the way GitHub Pages does, at http://127.0.0.1:4173/ (under `BASE_PATH` when it is set).

## Deploy

`.github/workflows/deploy.yml` builds and tests every pull request, and publishes to GitHub Pages when a pull request merges into `main`:

| Job | What it does | Runs |
|---|---|---|
| `build` | `npm ci`, the unit tests, then `npm run build` (every lesson program checked on CPython 3.14.2, with the content build's cache of runs kept from the last workflow run; tsc, the site build, the pre-rendered pages) and the link check; keeps the build for the jobs below, and on `main` uploads `dist` for Pages | first |
| `content-pyodide` | every lesson program replayed in Pyodide and compared with CPython, in 2 shards side by side | after `build` |
| `e2e` | the browser tests in 2 jobs side by side, the phone pass and everything else, with screenshots in the artifacts `screenshots` and `screenshots-phone` | after `build` |
| `pro-track` | `npm run pro-track-check` with Python 3.14 | first, beside `build` |
| `lighthouse` | Lighthouse scores against `lighthouserc.cjs` | pull requests, after `build` |
| `deploy` | publishes exactly the `dist` the build job made | `main`, after all of the above |

In the repository's **Settings > Pages**, set **Source** to **GitHub Actions** once. `CUSTOM_DOMAIN` in the workflow is the site's own domain, `pythonarena.org`: the build makes the site for `/`, with its canonical links, sitemap and `robots.txt` at that domain. Left empty, the site is published at `https://<owner>.github.io/<repo>/` instead.

### The domain, with Cloudflare DNS

The domain's DNS is at Cloudflare; GitHub Pages serves the site and gets its HTTPS certificate. Set it up once, in this order:

1. **Verify the domain with GitHub**, so no other GitHub Pages site can claim it: in your GitHub account's **Settings > Pages**, **Add a domain**, `pythonarena.org`. Add the TXT record GitHub shows in Cloudflare (**DNS > Records > Add record**), then **Verify**.
2. **Point the domain at GitHub Pages** in Cloudflare's **DNS > Records**. Delete any other A, AAAA or CNAME records for `pythonarena.org` and `www` first (a parking page, say), then add these, each with **Proxy status** set to **DNS only** (the grey cloud):

   | Type | Name | Content |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |
   | CNAME | `www` | `antonyperez0.github.io` |

3. **Deploy**: merge the change that sets `CUSTOM_DOMAIN` into `main`, and wait for the workflow's `deploy` job.
4. **Give the repository its domain**: the repository's **Settings > Pages > Custom domain**, `pythonarena.org`, **Save**. GitHub checks the DNS and gets a certificate, which takes from a few minutes to an hour; then tick **Enforce HTTPS**. From then on `https://antonyperez0.github.io/pythonarena/` and `www.pythonarena.org` redirect to `https://pythonarena.org/`.

Between steps 3 and 4, the github.io address shows pages without their styles and scripts (they are built for `/`), so do step 4 right after the deploy.

The records stay **DNS only**: GitHub Pages checks that the domain points at it and gets the certificate itself, and Cloudflare's proxy hides both from it. GitHub Pages already serves the site over HTTPS from its own CDN.

With `CUSTOM_DOMAIN` set, `robots.txt` is at the top of the domain and names the sitemap, so search engines find it on their own. Submitting it in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters) (`https://pythonarena.org/sitemap.xml`) gets the pages read sooner. Without a custom domain, search engines never see the site's `robots.txt` (it is at `/<repo>/robots.txt`, and they read it only at the top of a host), so submit `https://<owner>.github.io/<repo>/sitemap.xml` yourself.

## License

Site code, and the Pro Track's projects in `pro-track/`: MIT (see [LICENSE](LICENSE) for what it covers). Lesson content in `content/` is licensed CC BY-NC-SA 4.0 ([content/LICENSE](content/LICENSE)), as it follows the CC BY-NC-SA 4.0 licensed MOOC, by Erkki Kaila, Antti Laaksonen, Matti Luukkainen and others at the University of Helsinki. Third-party components keep their own licenses ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
