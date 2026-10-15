# Word statistics on the command line

A small command-line program that reads text files and tells you how many lines, words and characters they have, and which words come up most often. You write it in Python on your own computer, step by step, and pytest tests tell you when each part works.

## What you'll build

A program you run from a terminal. You give it the names of one or more text files, and it prints a short report for each file. With two or more files, it also prints the total.

```text
$ python -m wordstats --top 3 samples/harbor.txt samples/lighthouse.txt
samples/harbor.txt
  lines: 7
  words: 72
  characters: 373
  different words: 52
  most frequent:
        12  the
         3  and
         3  boats

samples/lighthouse.txt
  lines: 7
  words: 62
  characters: 322
  different words: 45
  most frequent:
        10  the
         2  a
         2  and

total
  lines: 14
  words: 134
  characters: 695
  different words: 88
  most frequent:
        22  the
         5  and
         4  a
```

It understands these options, before, between or after the file names:

| Option | What it does |
| --- | --- |
| `--top N` | Show the N most frequent words (10 if you leave it out). |
| `--min-length N` | Leave words shorter than N characters out of the most frequent list (1 if you leave it out). Try `--min-length 4` to skip "the" and "and". |
| `--case-sensitive` | Count "Tide" and "tide" as different words. Without it, case doesn't matter. |
| `-h`, `--help` | Show a short help text. |

When something goes wrong, it says so: a wrong option prints a message and the help text, and a file that can't be read is reported while the other files are still counted.

```text
$ python -m wordstats --top three samples/harbor.txt
word-stats: --top needs a whole number, not three
Usage: python -m wordstats [options] FILE...
...
$ python -m wordstats notes.txt
word-stats: there's no file notes.txt
```

The program is split into small modules, so each part can be tested on its own:

| File | What it does | Who writes it |
| --- | --- | --- |
| [`wordstats/words.py`](wordstats/words.py) | Splits a line into words. | You (step 1) |
| [`wordstats/textstats.py`](wordstats/textstats.py) | The class `TextStats`: counts lines, characters and words, with a dictionary. | You (steps 2 and 3) |
| [`wordstats/textfiles.py`](wordstats/textfiles.py) | Reads a file into a `TextStats`. | You (step 4) |
| [`wordstats/commandline.py`](wordstats/commandline.py) | Turns the command line's arguments into `Options`. | You (step 5) |
| [`wordstats/program.py`](wordstats/program.py) | The program: puts the parts together. | You (step 6) |
| [`wordstats/report.py`](wordstats/report.py) | Turns statistics into the text above, and has the help text. | Given ready |
| [`wordstats/__main__.py`](wordstats/__main__.py) | Starts the program when you run `python -m wordstats`. | Given ready |

The tests are in [`tests/`](tests/), one file for each step.

## What you need

- **Python 3.14** (3.12 or newer works too). Check it in a terminal with `python3 --version` (on Windows, `py --version`). [The Pro Track page](https://antonyperez0.github.io/pythonarena/pro/) shows how to install Python and set up a project, step by step.
- **A code editor.** [Visual Studio Code](https://code.visualstudio.com) with its Python extension is the one the course uses; PyCharm works just as well.
- **pytest**, the tool that runs the tests. You don't download it yourself: pip installs it from [`requirements.txt`](requirements.txt) in step 0, so that step needs an internet connection.
- **Git**, if you want to put the project on GitHub from the terminal (optional). Get it from [git-scm.com](https://git-scm.com/downloads), or with your package manager (`brew install git`, `sudo apt install git`).
- **What the course taught**: working with strings and loops (modules 11 and 12), functions (13 and 14), lists and tuples (15 and 22), dictionaries (21), reading files (23), handling errors (25), your own modules (31), classes (34 to 39), and sorting with a key and a lambda (49, "Functions as arguments").

About 3 to 5 hours of work.

### The project's folder

```text
word-stats/
  requirements.txt   what pip installs: pytest
  pytest.ini         pytest's settings: the tests are in tests/
  wordstats/         the program, a package: a folder of modules
  tests/             the tests, a file for each step
  samples/           two short text files to try the program on
  .github/           the workflow that runs the tests on GitHub
```

A **package** is a folder of modules with a file `__init__.py` in it. `from wordstats.words import split_words` imports the function `split_words` from the module `words.py` in the folder `wordstats`, and `python -m wordstats` runs the package's `__main__.py`. Both work when your terminal is in the project's folder, the one with `pytest.ini`.

### pytest in two minutes

- A test is a function whose name starts with `test_`, in a file whose name starts with `test_`. `python -m pytest` finds all of them in `tests/` and runs them.
- A test checks with a plain `assert`. When the condition is false, pytest shows both sides: `assert 0 == 3` means your code gave 0 where the test expected 3. A text after a comma is a message that pytest shows too.

  ```python
  def test_counts_lines():
      assert stats_of("one", "two", "three").line_count() == 3
  ```

- `pytest.raises` checks that code raises an exception, here a `ValueError` whose message contains `--top`:

  ```python
  with pytest.raises(ValueError, match="--top"):
      parse_args(["--top", "three", "notes.txt"])
  ```

- A test with a parameter named `tmp_path` gets an empty folder of its own to write files in, and a test with a parameter named `capsys` can see what the code printed. These are **fixtures**: pytest sees the parameter's name and gives the test what it asks for.

## Steps

Each step names the `# TODO`s to fill in and the test file that checks them. Do them in order: later parts use the earlier ones. After each step, run that step's tests (see [Run the tests](#run-the-tests)), and go on when they pass.

### Step 0: get the project running

Unzip the project and open a terminal in its folder (the one with `requirements.txt`). Make a virtual environment, a folder `.venv` that keeps the project's packages apart from the rest of your computer, install pytest into it, and run the tests:

```shell
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pytest
```

On Windows, the first two lines are `py -m venv .venv` and `.venv\Scripts\activate`. Activate the environment again each time you open a new terminal for the project: the prompt then starts with `(.venv)`.

pytest runs 83 tests, and all of them fail with `NotImplementedError`: that's expected, since the functions aren't written yet. If instead it says `No module named pytest`, the virtual environment isn't active (run the `activate` line again). If it finds no tests, or says `No module named 'wordstats'`, the terminal isn't in the project's folder.

### Step 1: split a line into words

Write `split_words(line)` in [`wordstats/words.py`](wordstats/words.py). It returns a list of the words of the line, in order, as they are written.

- A word is a run of letters, digits and apostrophes (`'`). `character.isalnum()` tells whether a character is a letter or a digit, and it knows letters like `é` too.
- Every other character ends the word: spaces, tabs, punctuation, hyphens, slashes. So `well-known` is two words.
- Apostrophes at the start or the end of a word are not part of it: `'ahoy'` is the word `ahoy`, while `don't` stays `don't`. Apostrophes alone are no word.
- Keep the case as it is. An empty line, or one with no letters or digits, gives an empty list.

One way: go through the line one character at a time, adding the characters to a string `word` while they belong to a word. When another character comes, the word is finished: take the apostrophes off its ends with `word.strip("'")`, add it to the list if anything is left, and start a new, empty word. Don't forget the word the line ends with.

Checked by `tests/test_words.py`.

### Step 2: count lines, characters and words

Fill in the class `TextStats` in [`wordstats/textstats.py`](wordstats/textstats.py): `__init__`, `add_line`, `line_count`, `character_count`, `word_count`, `distinct_word_count` and `count_of`.

- In `__init__`, set up the attributes: whether case matters, three counts that start at 0, and a dictionary from each word to how many times it appeared. Make the dictionary in `__init__` (`self.__counts = {}`), so that each `TextStats` gets one of its own. Two underscores make an attribute private, as in module 39; one underscore or none works too.
- `add_line(line)` adds one line: one more line, `len(line)` more characters (spaces and punctuation too; there's no line break in it), and its words from `split_words`, each one counted in the dictionary.
- `distinct_word_count()` is how many keys the dictionary has, and `count_of(word)` is the word's count, or 0 if it never appeared. A dictionary's `get(word, 0)` gives exactly that.
- `TextStats(False)`, and `TextStats()` too, ignores case: count every word in lower case with `word.lower()`, so "Tide", "tide" and "TIDE" are one word. Then `count_of` ignores case too: `count_of("Tide")` and `count_of("tide")` give the same. `TextStats(True)` keeps the words as they are.

Python's standard library also has `collections.Counter`, a dictionary made for counting: `counts[word] += 1` works on it even for a word that isn't in it yet. You may use it instead of a plain dictionary.

Checked by `tests/test_textstats.py`.

### Step 3: the most frequent words, and adding statistics together

Still in `textstats.py`:

- `most_frequent(n, min_length=1)` returns a list of at most `n` tuples `(word, count)`, the most frequent word first. Words with the same count are in alphabetical order, so the result is always the same. Words shorter than `min_length` characters are left out before the first `n` are taken. If `n` is 0 or less, the list is empty. With case ignored, the words are in lower case, as they were counted.
- `add_all(other)` adds the counts of another `TextStats` to this one: lines, characters, words, and each word's count. It must not change `other`. The program uses it for the total.

`sort` and `sorted` take a `key`: a function that gives, for each item, the value to sort it by, as in module 49. Here you sort by the count, biggest first, and then by the word. A tuple as the key does both, because tuples compare by their first items, and by their second items when the first ones are equal. The minus sign turns "biggest count first" into "smallest first", which is how `sort` sorts:

```python
pairs.sort(key=lambda pair: (-pair[1], pair[0]))
```

(`Counter` has a method `most_common(n)`, but it puts words with the same count in the order they were first seen, not in alphabetical order. The sort above is what the tests want.)

In `add_all`, `other` is another `TextStats`. Its methods give its counts; for the words, go through its dictionary. Inside the class, `other.__counts` reaches another object's private attribute too.

Checked by `tests/test_most_frequent.py`.

### Step 4: read a file

Write `read_file(path, case_sensitive=False)` in [`wordstats/textfiles.py`](wordstats/textfiles.py): it makes a new `TextStats`, adds every line of the file to it, and returns it. As in module 23:

```python
with open(path, encoding="utf-8") as file:
    for line in file:
        ...
```

- Each `line` ends with its line break, `"\n"` (the last line may have none). Take off only the line break, with `line.rstrip("\n")`. `line.strip()` would take the spaces at the end of the line too, and they count as characters. Windows line breaks (`\r\n`) arrive as `"\n"` too: Python turns them into `"\n"` when it reads a file as text.
- Always give `encoding="utf-8"`. Without it, Python reads the file in the computer's own encoding, which on Windows often isn't UTF-8, and `é` comes out as two wrong characters.
- If the file can't be read, let the error through: don't catch it here. `open` raises `FileNotFoundError` when there's no such file, and reading raises `UnicodeDecodeError` when the file isn't UTF-8 text. Step 6 deals with them.

Checked by `tests/test_textfiles.py`.

### Step 5: read the command line

When you run `python -m wordstats --top 3 notes.txt`, the program finds the words after `-m wordstats` in `sys.argv`, a list in the module `sys`: `sys.argv[1:]` is `["--top", "3", "notes.txt"]`. Write `parse_args(args)` in [`wordstats/commandline.py`](wordstats/commandline.py), which turns such a list into an `Options` object. The class `Options` is given ready in the same file.

- `--top N` and `--min-length N` take the next argument as their number. It must be a whole number of at least 1.
- `--case-sensitive` sets `case_sensitive`, and `-h` or `--help` sets `show_help`.
- Any other argument that starts with `-` is an unknown option. Every other argument is a file name, kept in the order given.
- Options can come anywhere: before, between or after the files. Without them, `top` is `DEFAULT_TOP` and `min_length` is `DEFAULT_MIN_LENGTH`.

A `for` loop can't skip the number after `--top`, so go through the list with a `while` loop and an index, and move the index past the number too.

When the arguments are wrong, raise a `ValueError` with a message that helps the user fix it. The tests check that the message names the option in question:

- `--top` or `--min-length` at the end, with no number after it, or followed by something that isn't a whole number of at least 1 (`--top three`, `--top 0`). The message names the option, like `--top needs a whole number, not three`. Careful: `int("three")` raises a `ValueError` whose message doesn't name the option, so catch it and raise your own:

  ```python
  try:
      number = int(text)
  except ValueError:
      raise ValueError(f"--top needs a whole number, not {text}")
  ```

- An unknown option, like `--color`. The message names it: `unknown option --color`.
- No files, unless `--help` was given.

Checked by `tests/test_commandline.py`.

### Step 6: put it together

Write `run(args)` in [`wordstats/program.py`](wordstats/program.py). [`__main__.py`](wordstats/__main__.py) is given: it calls `run(sys.argv[1:])` and ends the program with the number `run` returns, the exit status. Print the reports with `print(...)` and the error messages with `print(..., file=sys.stderr)`. That is the error output: the terminal shows it too, but it stays apart from the reports when you save them in a file (`python -m wordstats notes.txt > report.txt`).

1. Parse the arguments with `parse_args`. If it raises a `ValueError`, print its message to `sys.stderr` (followed by `USAGE` if you like) and return 2.
2. If `show_help` is set, print `USAGE` and return 0, without reading any files. `USAGE` ends with a line break, so print it with `print(USAGE, end="")`.
3. Read each file with `read_file(name, options.case_sensitive)` and print `format_report(name, stats, options.top, options.min_length)`, again with `end=""`, using the file's name as it was given. Put an empty line, `print()`, between two reports. For a single file, print nothing else.
4. If a file can't be read, print a message that names the file to `sys.stderr`, and go on with the next file. Catch `OSError` and `UnicodeDecodeError`: `FileNotFoundError`, and the errors for a folder or a file you may not read, are all kinds of `OSError`. You may catch `FileNotFoundError` first, for a message of its own.
5. If two or more files were read, print the total after them, after an empty line: make one `TextStats` with the same `case_sensitive` setting, add each file's statistics into it with `add_all`, and print its report with the title `TOTAL`. Count the files that were read, not the ones named: if only one of two files could be read, there's no total.
6. Return 1 if some file couldn't be read, and 0 otherwise.

Checked by `tests/test_program.py`. When all the tests pass, the program is done: try it on your own text files.

Ideas to go further, each with a test of your own first: count the curly apostrophe (`’`) that word processors write as an apostrophe too, add an option `--words-only` that prints just the most frequent words, or rewrite `parse_args` with Python's own module `argparse`, which bigger programs use (then the program, not `parse_args`, stops on a wrong option, so the step 5 tests would need changing).

## Run the tests

In the project's folder, with the virtual environment active:

```shell
python -m pytest
```

At first all the tests fail: that's how you know what's left to do. pytest shows each failed test with the line that failed and the values it compared, then a short summary, for example:

```text
________________________ test_count_of_ignores_case_too ________________________

    def test_count_of_ignores_case_too():
        stats = stats_of("Tide tide TIDE")
>       assert stats.count_of("Tide") == 3, 'count_of("Tide") ignores case, as the counting does'
E       AssertionError: count_of("Tide") ignores case, as the counting does
E       assert 0 == 3

tests/test_textstats.py:58: AssertionError
=========================== short test summary info ============================
FAILED tests/test_textstats.py::test_count_of_ignores_case_too - AssertionErr...
========================= 1 failed, 10 passed in 0.05s =========================
```

That's the test (its name says what's expected), the line that failed with `>` in front of it, the message and the values: `count_of("Tide")` gave 0, and the test expected 3. Open the test file to see the whole test. When every test passes, the last line says `83 passed`.

To run one step's tests only, name the test file, and to run one test, add `::` and its name:

```shell
python -m pytest tests/test_words.py
python -m pytest tests/test_words.py::test_keeps_the_case_as_it_is
```

`python -m pytest -x` stops at the first test that fails, and `python -m pytest -q` prints less. Your editor can run the tests too: VS Code's Testing panel (the flask icon) finds them once you choose pytest, and PyCharm shows a run button next to each test.

## Run the program

In the project's folder, with the virtual environment active, give the options and the files after `python -m wordstats`:

```shell
python -m wordstats samples/harbor.txt
python -m wordstats --top 5 --min-length 4 samples/harbor.txt samples/lighthouse.txt
python -m wordstats --help
```

`-m wordstats` tells Python to run the package `wordstats` (its `__main__.py`). The program needs nothing but Python itself, so it runs without the virtual environment too. On Windows, write the paths with `\` or `/`: both work.

Before you've written step 6, the program stops with `NotImplementedError: run isn't written yet (step 6)`.

The files must be UTF-8. A file saved in another encoding (an older Windows or Latin-1 file with accents) is reported as `isn't UTF-8 text`, or however your step 6 says it. Save the file as UTF-8 in your editor and try again.

## Put it on GitHub (optional)

The project comes with a GitHub Actions workflow, [`.github/workflows/test.yml`](.github/workflows/test.yml). In your own GitHub repository, it installs Python 3.14 and pytest on GitHub's computers and runs `python -m pytest` every time you push, and shows the result in the repository's **Actions** tab. Nobody else sees it unless your repository is public, and Python Arena doesn't see it at all.

1. On [github.com](https://github.com), create a new repository (the **+** at the top, then **New repository**). Give it a name, like `word-stats`. Leave it empty: no README, no .gitignore.
2. Put the project's files at the top of the repository, so that `requirements.txt` and the `.github` folder are at its root. Without the `.github` folder, nothing runs.
   - **With git** (in the project's folder):

     ```shell
     git init
     git add .
     git commit -m "Word statistics project"
     git branch -M main
     git remote add origin https://github.com/YOUR-NAME/word-stats.git
     git push -u origin main
     ```

     The `.gitignore` keeps `.venv`, `__pycache__` and `.pytest_cache` out of the repository.

     The first time you use git on a computer, tell it your name and email, or `git commit` stops with "Author identity unknown":

     ```shell
     git config --global user.name "Your Name"
     git config --global user.email you@example.com
     ```

     The first `git push` asks you to sign in, and GitHub doesn't accept your account password there. Git for Windows opens a browser window to sign you in. On macOS and Linux, sign in first with [GitHub CLI](https://cli.github.com) (`gh auth login`, and let it set up git), or paste a [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) when git asks for the password. [GitHub Desktop](https://desktop.github.com) signs you in for you, too.
   - **In the browser**: on the new repository's page, choose **uploading an existing file** and drag the project's files and folders into it, then **Commit changes**. Don't upload `.venv`, `__pycache__` or `.pytest_cache`. Folders whose names start with a dot are hidden on macOS and Linux: press `Cmd+Shift+.` in macOS's Finder, or `Ctrl+H` in most Linux file managers, to see `.github`.
3. Open the **Actions** tab. A run called **Tests** starts after each push. A green check means all the tests passed; a red cross means some failed, and the run's log shows which, just like `python -m pytest` on your computer. Before you finish the project, red is expected.

The GitHub mobile app shows the Actions tab and each run's result, so you can follow your tests from a phone. Writing the code, running the tests and the first upload need the computer.
