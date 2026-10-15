# Lesson content

This folder holds the course: `course.yaml` (every planned module, in order, with the MOOC sections it follows) and one file per written module in `modules/`, named after its place in the course (`01-printing.yaml`). `drills/` holds the practice drills, `projects/` the projects (larger programs built over several milestones), `placement.yaml` the placement quiz and `topics.yaml` the topics reference.

## License and credit

The lesson content in this folder is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/) (CC BY-NC-SA 4.0); the full legal code is in [LICENSE](LICENSE).

The course follows the order and topics of the [Python Programming MOOC 2026](https://programming-26.mooc.fi) by Erkki Kaila, Antti Laaksonen, Matti Luukkainen and contributors, Agile Education Research group, University of Helsinki, licensed under CC BY-NC-SA 4.0. The MOOC section titles in `course.yaml` come from that course. The explanations, examples, exercises, hints and solutions are written for Python Arena; no MOOC text, exercise statements, templates, tests or images are copied. Python Arena is not affiliated with or endorsed by the University of Helsinki or MOOC.fi.

## How a module is checked

`npm run content` (also part of `npm run build`) reads every module and checks it with the **reference CPython**: exactly the Python version that Pyodide runs in the browser (3.14.2 for Pyodide 314.0.7). It finds it as `$PYTHON`, `python3.14` on the PATH, or a uv-managed install (`uv python install 3.14.2`). Programs run through `src/engine/arena.py`, the same harness the browser uses, so the build sees exactly what a learner's browser will.

- every solution runs on every test without an error; the expected outputs the site grades against are what it really prints;
- every solution runs **twice, with different hash seeds**, and must print the same both times (see "Output that is the same every time");
- an `expect` written in a test must match that output exactly;
- a test's `writes` files are ones the solution really writes; their expected text is what it writes;
- starter code must not already pass, and a fill-in with every blank empty must not pass;
- every solution follows its own `require` and `forbid` rules;
- every example program in the lesson text is run, and an `output` (or `crash`) block after it must be exactly what it prints; every `>>>` session is run and must show exactly what Python prints;
- every step has exactly three challenges, a `**Your turn:**` task and at least one hint per challenge;
- the expected output a task shows (its last plain ``` block) is exactly what the test the task card shows prints: the first visible test with `writes`, or else the first visible test;
- every code block in a step's text or a task is of a kind the page knows (see "Code blocks");
- no key is misspelled, and every hint is a string of text (Markdown), not something YAML read as a list or mapping: **quote a hint, message or `why` that contains `: `** (a colon and a space).

`npm run content:pyodide` (in CI) then replays every program in Pyodide itself and fails if anything differs from CPython.

To check one module while writing it, without writing any generated file:

```shell
node scripts/build-content.mjs --dry --module-file 04-arithmetic.yaml
```

(It checks the module and its drill file. `PYTHON_WORKERS=2` keeps it to two Python processes when several checks run at once.)

## Writing a module

```yaml
id: printing                # must match an id in course.yaml
summary: One or two sentences for the module page.
steps:
  - id: printing-first-program   # permanent: progress is saved by it (module id, then a short name)
    slug: first-program          # the address: /learn/printing/first-program
    title: Your first Python program
    text: |
      The lesson, in Markdown. Headings start at ###.

      **Your turn:** the task for challenge 1. Everything from here on is shown in the task card.
    fill: |                      # challenge 1 as a fill-in: [[answer]] marks a blank,
      [[print]]("Grace Hopper")  # [[a‖b]] accepts a or b (U+2016 between them)
    hints:
      - Shown one at a time.
    tests:
      - expect: Grace Hopper     # optional; checked against the real output
    more:                        # challenges 2 and 3, each with a task
      - task: |
          What to do.
        seed: |                  # starter code (for a code challenge)
          ...
        solution: |
          ...
        hints: [...]
        tests:
          - stdin: |             # the lines the program reads with input()
              Ada
          - stdin: Linus
            hidden: true         # hidden tests stop hard-coded answers
        require:                 # rules on the code, with comments and strings removed first
          - pattern: \bprint\s*\(
            min: 3               # optional counts; raw: true checks the code as written
            max: 3
            message: Shown when the rule isn't met.
        forbid:
          - pattern: ...
            message: ...
      - task: |
          What does this program print?
        predict: |               # "What does it print?": the learner types each line the program
          print(1 + 1)           # prints; the answers are its real output (1 to 8 lines, none empty)
        hints: [...]
```

A step's lesson text explains one idea with two to four short examples, then ends with `**Your turn:**` and the first task. The three challenges practice the same idea, usually from easier to harder: a fill-in or a small fix first, then programs (or functions) to write.

### Input: what a test types

A test's `stdin` is the lines the user types, given in advance. Each `input()` reads the next line. **The output shows each line after its prompt, followed by a line break, as a terminal shows what you type**: with `stdin: Ada`, the program

```python
name = input("What is your name? ")
print("Hi", name)
```

prints

```text
What is your name? Ada
Hi Ada
```

So the expected output of a program that reads input includes the prompts and the typed lines, just as the MOOC's example runs show them; a task shows such a run in its expected-output block. Prompts must match exactly too, so a task names the exact prompts its program uses (in its example run). When the input runs out, `input()` raises `EOFError`, as Python does at the end of a file.

Input normally ends with one line break. To end it with an empty line on purpose (for a program that reads until an empty line), keep the blank line with YAML's `|+`, or write it quoted: `stdin: "Ada\nBen\n\n"`. The page shows it as "(an empty line)".

### Tests that call functions

A test with `call` loads the learner's program **as a module**, the way an `import` would: its top-level code runs, but code under `if __name__ == "__main__":` doesn't. Then the test's own code runs in the program's namespace, and **what that code prints is what's graded**. Like the interactive interpreter, if the call's last line is an expression, its value is printed with `repr()` unless it is `None`:

```yaml
    tests:
      - call: mean([1, 2, 6])        # prints 3.0 (the repr of the return value)
      - call: |
          numbers = [3, 1, 2]
          sort_in_place(numbers)
          print(numbers)
        hidden: true
      - call: print(greeting("Ada"))  # prints Hello, Ada! (print shows the string itself, repr would show quotes)
```

- The repr makes types visible: a function that should return `5` but returns `"5"` prints `'5'` and fails, which is what the MOOC's tests check too. Use `print(...)` in the call when the task is about the text itself.
- When the model solution's call gives a value (not `None`), the learner's must give one too: a function that prints its result instead of returning it fails, with a note that says so, even when the printed text looks the same.
- A test named after a one-line call shows that call as its name.
- The solution must print nothing when it's loaded (the build stops with an error if it does): code that tests a function by hand goes under `if __name__ == "__main__":`. Starter code for function tasks usually has such a block, from module 14 (`return-values`) on, where the lessons introduce it. Before that, function tasks have no top-level code at all.
- When a learner's program can't be called at all (no function of that name, the wrong number of parameters), the page explains that in plain words instead of showing the test's own traceback; when loading the program asks for input, it says that code belongs under the main block.
- Several tests of one challenge may mix `call` and `stdin` tests.

### Programs of several files (modules)

From module 31 (`own-modules`) on, a challenge can have modules of the learner's own next to `main.py`. Give `seed` and `solution` as a map of file names to code; the editor shows a tab for each file, in this order, and `main.py` is the one Python starts:

```yaml
    seed:
      main.py: |
        import shapes
        print(shapes.area(3, 4))
      shapes.py: |
        def area(width, height):
            pass
```

File names are module names: letters, digits and `_`, ending in `.py`, not a keyword and not the name of a Python module the lessons use (a file `random.py` would hide the real one). In lesson text, a `python run` example can hold several files: each file after the first starts with a line such as `# ==== shapes.py ====`, and the page shows each file under its name.

### Files a program reads and writes

A test can give the program files to read, in its working folder, and check the files it leaves there:

```yaml
    tests:
      - files:
          scores.txt: |
            7
            9
        writes: [summary.txt]        # the solution's run gives the text, as it gives the output
      - files:
          scores.txt: "10\n"
        writes:                      # or a map: the text each file must hold
          summary.txt: |
            total 10
        hidden: true
```

A name may have folders in front of it (`data/scores.txt`). The expected text of a written file is what the model solution writes; files are compared the way output is. In lesson text, a ` ```file scores.txt ` block before a ` ```python run ` example is a file that example reads (shown with its name). In a task, show a file's contents in a ` ```text ` block: a plain ` ``` ` block is read as the expected output.

### Command-line arguments

A test that runs the program can give it command-line arguments, `args: [--title=Scores, extra]`, which it finds in `sys.argv[1:]`. Rarely needed: the MOOC doesn't use them.

## Code blocks in lesson text

Every Python block says what it is:

- ` ```python run ` a complete program; it's run. An ` ```input ` block right after it is what it reads, and an ` ```output ` block after that must be exactly what it prints (with the typed input echoed, as above).
- ` ```python run crash ` a program that must stop with an error. Its ` ```input ` and ` ```output ` blocks are optional; a ` ```crash ` block after them must be exactly what Python prints: the traceback, with your program's file as `main.py` (for a syntax error, Python's message without a traceback). Python 3.14's messages mark the exact spot with `^` and `~`; copy what the build prints.
- ` ```python repl ` a session of the interactive interpreter, as the MOOC shows many examples:

  ````text
  ```python repl
  >>> 7 // 2
  3
  >>> name = "Ada"
  >>> name.upper()
  'ADA'
  >>> for i in range(2):
  ...     print(i)
  ...
  0
  1
  ```
  ````

  Every statement runs in one session and what it prints must be exactly what's shown under it (the page shows it as "In the Python interpreter", with the prompts dimmed).
- ` ```python fragment ` code that isn't a whole program (a function on its own, a few lines of a longer program); shown only, but it must still be valid Python. ` ```python fragment partial ` for something that isn't even a whole statement (an `if` line on its own, a half-written expression).
- ` ```file data.txt ` a file the next ` ```python run ` example reads (see above).
- ` ```input `, ` ```output `, ` ```crash ` as above; ` ```text ` text shown as it is; ` ```shell ` commands for your own computer; a block with no kind is plain text.

## Output that is the same every time

Expected outputs come from one run of the solution, and every solution runs twice with different hash seeds, so a program must print the same on every run:

- Don't print a `set` of strings, or loop over one, without sorting it first (`sorted(names)`): the order of strings in a set changes from run to run. Sets of small whole numbers are fine, and dictionaries keep their insertion order.
- `random`: seed it (`random.seed(1)`) in the program or in a test's `call` before the function runs. CPython and Pyodide give the same numbers for the same seed. Or test properties instead of exact numbers (that the number is between 1 and 6, that the list has 7 different numbers).
- Dates and times: no `date.today()` or `datetime.now()` in anything that's checked; use fixed dates, `datetime(2026, 3, 1)`.
- No `id()`, and no printing of an object without `__str__` (its address changes).
- Don't print an `OSError`'s message yourself (such as a `FileNotFoundError` caught with `as e`): its error number differs between CPython and Pyodide (`[Errno 2]` and `[Errno 44]`). Print your own message, or the file name. (A traceback is fine: the harness shows Linux's numbers in it.)

## Style

The lessons are written for people in their first weeks of programming, in the voice of the existing modules (`01-printing.yaml` is the model):

- Plain English, short sentences, "you". Name a new idea in **bold** the first time, and say what it's for before what it's called. American spelling (color, behavior).
- No en or em dashes anywhere: use a colon, a comma, parentheses or two sentences.
- Each step follows its MOOC section's topics in the MOOC's order, but with our own explanations, examples, names and scenarios. Never copy the MOOC's text, examples or exercise statements; an exercise may practice the same skill as one of the MOOC's, with a different task.
- Code follows PEP 8: 4 spaces per level, `snake_case` names, spaces around operators, two blank lines around top-level functions and classes.
- Use only what the course has taught so far (the modules before this one, and earlier steps of this one). Part 1 programs have no functions of their own, part 2 has no `for`, and so on; check `course.yaml` for the order.
- Every challenge has at least two hints that lead from a nudge to almost the answer, and the last hint never just gives the whole solution (the solution unlocks separately).
- Hidden tests use other inputs than the visible one, so a hard-coded answer fails. A challenge that reads input or calls functions has at least one hidden test.
- Error messages: when a lesson shows one, show the real one in a `crash` block, and explain it in words.

## Drills (Deathmatch, daily challenge, interview prep)

`drills/<module id>.yaml` holds the practice drills of a lesson module, 12 to 18 of them; `drills/interview-*.yaml` (with `topic: interview`) the interview questions, which are open to everyone. Each drill has a `type`, and most show a short program in `code`, which the build runs as a whole program. Predict and runs answers are taken from Python, not typed by hand; a bug's fix must run and change what the program does; a choice's `answer` is written by hand, so `verify: output` should be used whenever the right choice is what the code prints. Prompts, choices and explanations are Markdown: code, and anything with `<`, goes in backticks (the build rejects text that Markdown would read as HTML):

```yaml
topic: simple-loops           # the module id (the file is simple-loops.yaml)
drills:
  - type: predict             # "What does this print?": the answer is the program's real output (1 to 4 lines)
    after: counting           # the step (slug or id) that unlocks it; default: the module's last step
    code: |
      count = 0
      count += 1
      print(count)
    why: "`count += 1` adds one."   # Markdown, shown after the answer (required, except for runs)
  - type: fill                # one [[blank]] (alternatives separated by ‖); the output of the filled-in program is shown
    code: |
      for i in range([[3]]):
          print("Hi")
    why: ...
  - type: bug                 # one line ends with # BUG; `fix` is the whole corrected line (without the indentation)
    code: |
      total = 0
      total = 5  # BUG
      print(total + 1)
    fix: total += 5           # the fixed program must run, and behave differently from the buggy one
    why: ...
  - type: runs                # "Does this run without an error?": the answer is what Python does
    code: |
      age = "5" + 3
    why: ...                  # optional for runs: without one, the page shows Python's error line
  - type: choice              # 2 to 4 choices, answer = the number of the right one; code shown must run
    prompt: Which loop runs exactly 3 times?
    choices: ["...", "...", "..."]
    answer: 2
    runs: false               # optional: the code shown stops with an error (on purpose)
    verify: output            # optional: the right choice must be exactly what the code prints
    why: ...
  - type: boss                # a coding challenge: prompt (the task) plus seed, solution, hints, tests, require,
    prompt: ...               # forbid, as in a lesson challenge; `call:` tests work too
    seed: ...
    solution: ...
    hints: [...]
```

Predict, fill, bug and runs drills may give the program input with `stdin` (echoed in the output as in lessons). Keep drill programs short (2 to 10 lines) so they fit a phone. A good drill set mixes the types, has one or two boss drills, and practices the mistakes beginners really make in that module.

`placement.yaml` holds the placement quiz: `questions:`, each a drill with a `module:`, one per module in course order.

## Projects

A project is one larger program that the learner builds over several **milestones**: `projects/<id>.yaml`, where the file's name is the project's id. Its page is `/projects/<id>/`. A project is Python Arena's own scenario (no MOOC exercise, and not one a module already uses).

Each milestone is a code challenge, checked like a lesson's, with these differences:

- **One program, carried forward.** Milestone 1 starts from the project's `seed`. Every later milestone starts from the learner's own code that passed the milestone before it, with the files this milestone adds (`files`) after the program's own.
- **The build checks the chain.** Milestone k is checked on the code it starts from on the model solutions: milestone k - 1's model solution with milestone k's `files`. That code must not already pass, and each model solution must also still pass every visible test of the earlier milestones, except tests a milestone names in `replaces` (behavior meant to change).
- **Every test has a name**, unique in the project.
- Projects come after the modules they need (`after:` names the last one), so their tasks may use anything up to and including that module.

```yaml
id: text-adventure
title: A text adventure
after: dictionaries
summary: One or two sentences for the list of projects.
intro: |
  Markdown, shown above the milestones: what the program will do when it's finished.
seed: |
  # milestone 1 starts from this
milestones:
  - id: rooms                   # permanent: progress is saved by it
    title: Rooms and moves
    task: |
      Markdown, shown in the task card.
    hints: [...]
    tests:
      - name: Walk north
        stdin: |
          north
          quit
    solution: |
      ...
  - id: items
    title: Items
    replaces: [Walk north]      # earlier visible tests whose behavior this milestone changes on purpose
    files:                      # files this milestone adds, with the text they start with
      items.py: |
        ...
    task: |
      ...
```

To check one project: `node scripts/build-content.mjs --dry --project-file text-adventure.yaml`.

## The topics reference

`topics.yaml` is the topics reference, shown at `/topics/`: Python keywords, functions, methods, types, modules and ideas, A to Z, each with one plain line and the steps that teach it.

```yaml
- term: len                   # what a reader looks for
  kind: function              # keyword, literal, operator, function, method, type, module, exception, idea or tool
  about: Gives the number of items in a string, list, tuple or dictionary.   # one line, a sentence, no dashes; `code` in backticks
  aliases: [length]           # optional: other words the search finds
  check: [len(]               # optional: specific phrases the check accepts in a step without the term
  steps: [strings-length-and-index, lists-functions]   # one to three step ids, the step that teaches it first
  drills: strings             # optional: the Deathmatch topic (a module id with drills) that practices it
```

Kinds: `None`, `True` and `False` are literals; `if`, `def`, `in` keywords; `%`, `//`, `==` operators; `print`, `len` (built-in) functions; `str.split` and `list.append` methods (write them with their type, as the documentation does); `int`, `list`, `dict` types; `math`, `random` modules; `ValueError` an exception. The full build checks every entry: each step id must exist, and the term (or one of its check phrases) must be in that step's code (for the kinds of code) or anywhere in it (for ideas and tools).
