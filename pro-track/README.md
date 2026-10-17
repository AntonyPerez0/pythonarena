# The Pro Track

Projects for your own computer, for after the course: each is a small Python project with starter code, pytest tests that fail until you write the missing parts, and a GitHub Actions workflow that runs the tests in your own GitHub repository. The site's page for them is [the Pro Track](https://pythonarena.org/pro/), with the setup steps (Python 3.14, a virtual environment, pip and pytest) and a download (zip) for each project.

Each project is a folder here, `pro-track/<id>/`. Its `README.md` says what to build, step by step, and how to run the tests (`python -m pytest`) and the program.

| Project | What you build |
| --- | --- |
| [`word-stats/`](word-stats/) | A command-line program that counts the lines, words and characters of text files and lists their most frequent words. |
| [`book-log/`](book-log/) | A log of the books you've read, in a SQLite database, with a text menu. |
| [`memory-game/`](memory-game/) | A memory game of pairs, with the rules in a plain class and a pygame window. |

Python Arena doesn't grade these projects and can't see your code or your test results: the tests tell you when your program works, and only you (and whoever can see your repository) see them run on GitHub. The checklist on each project's page is your own record of what you did.

## The model solutions

`pro-track-solutions/<id>/` holds a model solution for each project: only the files that differ from the starter code. This repository's CI uses them to check that every project can be solved (some of the starter's tests fail, and with the solution they all pass). The site never offers them for download: the point is to solve the project yourself. The repository is public, so you can look at them; try the project first, and look when you are really stuck or when you're done and want to compare.

## For contributors

Everything below is checked by `node scripts/pro-track-check.mjs` (the folder rules without Python, then Python and pytest themselves) and by the site build (which stops on a problem in `content/pro-track.yaml` or a project's README). The rules live in [`scripts/pro-track/project.mjs`](../scripts/pro-track/project.mjs) and [`scripts/pro-track/site.mjs`](../scripts/pro-track/site.mjs); the unit tests are [`scripts/pro-track.test.mjs`](../scripts/pro-track.test.mjs).

### A project folder

`pro-track/<id>/`, where `<id>` is the project's id in kebab-case (like `word-stats`). It holds exactly a learner's project, since the site zips the whole folder for download:

| File | What it is |
| --- | --- |
| `requirements.txt` | What pip installs, each package pinned (rules below). |
| `pytest.ini` | pytest's settings, word for word as below. |
| `README.md` | For the learner (sections below). |
| `.gitignore` | At least the lines `__pycache__/` and `.pytest_cache/`, so Python's and pytest's own files stay out of the learner's repository. Add `.venv/` too, and any file the program makes when it runs (a database, `*.db`). |
| `.github/workflows/test.yml` | The workflow below, word for word. It runs only in the learner's own repository (GitHub runs workflows from the repository's root `.github/`, never from a subfolder like this one). |
| `<package>/` | The starter code: a package named after the id without its hyphens (`word-stats` has `wordstats/`), with an `__init__.py`. A program the learner runs has a `__main__.py`, so `python -m <package>` starts it. |
| `tests/test_*.py` | The pytest tests the learner must make pass, one file for each step. A `tests/conftest.py` may hold fixtures the test files share. |
| other files | Allowed when the project needs them (sample input files, like `word-stats/samples/`). |

Not allowed: files Python, pytest or an editor makes (`__pycache__/`, `*.pyc`, `.pytest_cache/`, `.venv/`, `venv/`, `.idea/`, `.vscode/`, `build/`, `dist/`, `*.egg-info/`, `.DS_Store`, `Thumbs.db`, editor swap and backup files, pytest's `report.xml`), files the program makes when it runs (`*.db`, `*.sqlite`, `*.sqlite3`, `*-journal`), links, and more than 1 MB of files in all. The zip leaves these files out anyway, but the check refuses them so the folder stays clean. Run the programs and the tests in a copy of the folder, or delete what they made afterward.

### requirements.txt

- One package a line, as `name==version`. Comments (`#`) and empty lines are fine; nothing else (no ranges, no `>=`, no options like `-e`).
- The check requires exactly these packages and versions (`PINNED` in `scripts/pro-track/project.mjs`), so all projects stay alike. Both have wheels for Python 3.14 on Windows, macOS and Linux, so pip installs them without building anything:

| Package | Version | When |
| --- | --- | --- |
| `pytest` | 9.1.1 | always |
| `pygame-ce` | 2.5.8 | a project with a game window (imported as `pygame`) |

  No other packages: everything else comes from Python's standard library (`sqlite3`, `csv`, `random`, ...). To move to newer versions, change `PINNED` and every `requirements.txt` together, and run the check.
- A pygame project's tests must not import pygame, directly or through the modules they import: put the game's rules in plain modules and test those, so the tests run without a screen on GitHub's computers. Only the window's module imports pygame, and the package's `__init__.py` doesn't import that module (importing any module of a package runs its `__init__.py` first).

### pytest.ini

Word for word (it is `PYTEST_INI` in `scripts/pro-track/project.mjs`):

```ini
[pytest]
testpaths = tests
pythonpath = .
```

`testpaths` makes `python -m pytest` look in `tests/` only, and `pythonpath = .` puts the project's folder on Python's import path, so the tests import the package (`from wordstats.words import split_words`) without installing anything.

### README.md

- The first line is the title, `# Title` (the site's title for the project).
- Under it, one paragraph of one to three sentences, at most 400 characters: what the project is (the site's summary in the list).
- Then these sections, as `##` headings with exactly these words, in this order (other sections may come between them or after):
  1. `## What you'll build`: the program, what it does when finished, with an example run.
  2. `## What you need`: Python 3.14 (3.12 or newer works too), what pip installs from `requirements.txt`, the modules of the course it builds on, anything else.
  3. `## Steps`: what to do, step by step, naming the files, the `# TODO`s and each step's test file; `###` headings are fine for the steps. Step 0 sets up the virtual environment as the site's guide does (`python3 -m venv .venv`, activate it, `python -m pip install -r requirements.txt`) and runs the tests.
  4. `## Run the tests`: must show `python -m pytest` (in a ```` ```shell ```` block), and say that the tests fail at first.
  5. `## Run the program`: the command, usually `python -m <package>`.
  6. `## Put it on GitHub (optional)`: create a repository, upload the files (with the `.github` folder), see the Actions tab.
- The site shows these six sections on the project's page. Code blocks: ```` ```shell ```` for commands, ```` ```python ```` for Python, ```` ```text ```` for output (and SQL). Links to the project's own files may be relative (`wordstats/words.py`), in these six sections and in the paragraph under the title: in the zip they point to the files, and on the site they go to the file on GitHub (an image, `![...](...)`, to the file itself on GitHub). Links to a heading (`#steps`) may point only to the six sections, by GitHub's anchors (`#what-youll-build`, `#what-you-need`, `#steps`, `#run-the-tests`, `#run-the-program`, `#put-it-on-github-optional`): on the site they go to the same section of the page, and the build refuses any other `#` link, since the page has nothing else to go to.
- Plain words for someone who has just finished the course. No en or em dashes, anywhere in a project (the check refuses them in the README and the `.py` files).

### The starter code

- It imports without errors, and pytest collects every test: every module, class and function the tests import exists. A missing name stops pytest with a collection error before any test runs, and the check refuses that.
- Each function or method the learner writes has a clear `# TODO` saying what to do (and which step it is), and raises `NotImplementedError` with a message naming the step, or returns a placeholder, so the tests fail rather than crash.
- At least one `# TODO`. Some tests may pass on the starter (for parts given ready), but some must fail.
- Code given ready is finished, commented code the learner can read and learn from, like `report.py` in `word-stats` or `menu.py` in `book-log`.
- Indented with 4 spaces, never tabs. It runs on Python 3.12 and newer, since the READMEs say 3.12 works too.

### The tests

- pytest, in `tests/test_*.py`, one file for each step, with a comment at the top naming the step and what it tests. Plain `assert`s, with a message after the comma where a failure would otherwise be hard to read, and `pytest.raises` for exceptions.
- Clear names that say what is expected (`test_count_of_ignores_case_too`).
- Enough of them that a wrong solution fails: edge cases (empty input, one item, ties, upper and lower case, letters beyond A to Z), not only the example in the README.
- No test may depend on the order tests run in, the time, the network or a screen. A file project uses pytest's `tmp_path`, a database project SQLite in memory (`":memory:"`, through a fixture in `conftest.py`), and anything random a `random.Random` with a seed.
- No test is skipped or marked to fail (`skip`, `xfail`): the check requires every test to pass on the solution.

### .github/workflows/test.yml

Word for word (it is `WORKFLOW` in `scripts/pro-track/project.mjs`):

```yaml
# Runs the project's tests on GitHub's computers on every push and pull request.
# See the results in your repository's Actions tab.
name: Tests

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v6
        with:
          python-version: "3.14"
      - name: Install what the project needs
        run: python -m pip install -r requirements.txt
      - name: Run the tests
        run: python -m pytest
```

### The model solution

`pro-track-solutions/<id>/<package>/`: only the `.py` files of the package that differ from the starter (or are new), at the same paths. Copied over a copy of the starter, every test must pass, none skipped, and at least as many tests must run as on the starter. No `# TODO` left in it, and no other files (the tests, `requirements.txt` and the rest are the starter's).

### content/pro-track.yaml

Lists the projects in the order the site shows them, with what the site needs besides the README:

```yaml
projects:
  - id: word-stats              # the folder's name
    hours: 3 to 5               # about how long it takes, as "N to M" (hours)
    practices:                  # what it practices, each with the module that teaches it
      - module: reading-files   # a module id of content/course.yaml
        what: reading text files line by line
      - module: dictionaries
        what: counting words with a dictionary
    checklist:                  # 3 to 15 items the learner ticks on the project's page
      - id: setup               # kebab-case, saved in the learner's progress: never change or reuse an id
        text: "`python -m pytest` runs, and the tests fail"
      - id: split-words
        text: Step 1, splitting words, passes `test_words.py`
```

A checklist item's text is one line of Markdown (code spans are fine). A relative link in it is relative to the project's folder (`tests/test_words.py`), as in its README, and goes to the file on GitHub. Every project folder must be listed, once.

### Running the check

With Python 3.14 (`python3.14` on the PATH, its path in `PYTHON`, or one that [uv](https://docs.astral.sh/uv/) manages, `uv python install 3.14`) and an internet connection for pip, on Linux or macOS (CI runs it on Linux; on Windows it uses `Scripts\python.exe`, but only Linux and macOS are tried):

```shell
node scripts/pro-track-check.mjs                # every project
node scripts/pro-track-check.mjs word-stats     # one project
```

It checks the folder rules, then makes a virtual environment in a temporary folder with each project's `requirements.txt` (projects with the same `requirements.txt` share one), copies the starter to another temporary folder and runs `python -m pytest` there (pytest must collect the tests, and some must fail), then copies the solution's files over another copy and runs it again (every test must pass, none skipped, at least as many as ran on the starter). The project folders themselves never get a `__pycache__`. It ends with `pro-track-check: 3 projects ok`. CI's job `pro-track` runs the same script; `npm run test:unit` checks the folder rules and the site's data without Python. To see a project's page and zip, build the site (`npm run build`): the build makes `dist/pro/<id>.zip` and the pages `/pro/` and `/pro/<id>/`.
