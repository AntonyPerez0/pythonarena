# Forest pairs: a memory game with pygame

A memory game in a pygame window: sixteen cards lie face down, and you flip two at a time to find the pairs. You write the game's rules as plain Python that pytest tests without a window, then connect them to the window and play.

## What you'll build

A window with a board of 16 cards, 4 by 4, all showing `?`. Each card hides one of eight forest symbols (fox, owl, deer, hare, fern, berry, acorn and pine), and every symbol is on exactly two cards. Click a card and it shows its symbol. Click a second card:

- If both show the same symbol, you found a pair. They stay face up and turn gray.
- If they don't, both stay face up so you can remember them. Your next click turns them face down again, then flips the card you clicked.

Every second card you flip is one move. The line under the board keeps score, and **New game** shuffles the cards again:

```text
Moves: 5, pairs: 2 of 8
...
You found all 8 pairs in 14 moves.
```

The game's rules don't need a window, so they live in modules of their own, and the tests check those. The window only draws what the rules say and passes your clicks on:

| File | What it does | Who writes it |
| --- | --- | --- |
| [`memorygame/deck.py`](memorygame/deck.py) | Makes the shuffled cards for a game. | You (step 1) |
| [`memorygame/game.py`](memorygame/game.py) | The class `MemoryGame`, the rules: which cards are face up, matches, moves, winning. | You (steps 2 to 5) |
| [`memorygame/status.py`](memorygame/status.py) | The text under the board. | You (step 6) |
| [`memorygame/window.py`](memorygame/window.py) | The pygame window. | Mostly given; you finish it (step 7) |
| [`memorygame/__main__.py`](memorygame/__main__.py) | Starts the game when you run `python -m memorygame`. | Given ready |

The tests are in [`tests/`](tests/), one file for each of steps 1 to 6. None of them opens a window or even imports pygame, so they run anywhere, also on GitHub's computers, which have no screen.

## What you need

- **Python 3.14** (3.12 or newer works too). Check it in a terminal with `python3 --version` (on Windows, `py --version`). [The Pro Track page](https://pythonarena.org/pro/) shows how to install Python and set up a project, step by step.
- **pygame and pytest.** You don't download them yourself: pip installs both from [`requirements.txt`](requirements.txt) in step 0, so that step needs an internet connection. The project uses **pygame-ce**, the community edition of pygame: you `import pygame` and use the same functions as in the course's pygame modules. Don't install `pygame` and `pygame-ce` in the same environment, since both are imported as `pygame`; the project's own virtual environment keeps them apart from anything else on your computer.
- **A computer with a screen** to play the game. The tests don't need one.
- **A code editor.** [Visual Studio Code](https://code.visualstudio.com) with its Python extension is the one the course uses; PyCharm works just as well.
- **Git**, if you want to put the project on GitHub from the terminal (optional). Get it from [git-scm.com](https://git-scm.com/downloads), or with your package manager (`brew install git`, `sudo apt install git`).
- **What the course taught**: lists and dictionaries (modules 15 and 21), random numbers (28), classes and methods (34 and 35), encapsulation with private attributes and properties (39), handling errors (25), and pygame: windows, drawing, events and text (53 to 56).

About 3 to 5 hours of work.

### The project's folder

```text
memory-game/
  requirements.txt   what pip installs: pytest and pygame-ce
  pytest.ini         pytest's settings: the tests are in tests/
  memorygame/        the game, a package: a folder of modules
  tests/             the tests, a file for each step
  .github/           the workflow that runs the tests on GitHub
```

A **package** is a folder of modules with a file `__init__.py` in it. `from memorygame.game import MemoryGame` imports the class `MemoryGame` from the module `game.py` in the folder `memorygame`, and `python -m memorygame` runs the package's `__main__.py`. Only `window.py` imports pygame; `deck.py`, `game.py` and `status.py` never do, and a test checks it.

### pytest in two minutes

- A test is a function whose name starts with `test_`, in a file whose name starts with `test_`. `python -m pytest` finds all of them in `tests/` and runs them.
- A test checks with a plain `assert`. When the condition is false, pytest shows both sides, and the message after the comma if there is one: `assert game.moves == 1, "moves after one turn"`.
- `pytest.raises` checks that code raises an exception:

  ```python
  with pytest.raises(ValueError):
      MemoryGame(["crab", "snail", "crab"])
  ```

## Steps

Each step names the `# TODO`s to fill in and the test file that checks them. Do them in order: later parts use the earlier ones. After each step, run that step's tests (see [Run the tests](#run-the-tests)), and go on when they pass.

Most tests build a small game with cards in a known order instead of a shuffled deck, like `MemoryGame(["crab", "snail", "crab", "snail"])`. That way they know where each card is. The positions count from 0, like a list's indexes.

### Step 0: get the project running

Unzip the project and open a terminal in its folder (the one with `requirements.txt`). Make a virtual environment, a folder `.venv` that keeps the project's packages apart from the rest of your computer, install pytest and pygame into it, and run the tests:

```shell
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pytest
```

On Windows, the first two lines are `py -m venv .venv` and `.venv\Scripts\activate`. Activate the environment again each time you open a new terminal for the project: the prompt then starts with `(.venv)`.

pytest runs 59 tests. Nearly all of them fail, most with `NotImplementedError`: that's expected, since the methods aren't written yet. Three pass already, for parts the starter gets right by itself. If instead it says `No module named pytest`, the virtual environment isn't active.

`python -m memorygame` won't open the window yet. It stops with `NotImplementedError: make_deck isn't written yet (step 1)`, because the window needs the deck and the game. After step 2 it opens with 16 `?` cards that don't do anything yet.

### Step 1: shuffle the cards

Write `make_deck(symbols, rng)` in [`memorygame/deck.py`](memorygame/deck.py). It returns a new list with each symbol twice, in a shuffled order.

- Shuffle with the `random.Random` object you are given, not with the module's own functions: `rng.shuffle(cards)` shuffles the list `cards` in place. A `random.Random(42)` always gives the same random numbers, so the same seed always gives the same order, which is what lets a test check a shuffled deck. The window passes `random.Random()` without a seed, so each game is different.
- Don't change the list of symbols you are given: `symbols + symbols` makes a new list.
- Raise a `ValueError` if `symbols` is empty, or if the same symbol is in it more than once (that would make four cards of it). A set of the symbols is smaller than the list when a symbol is there twice.

`FOREST` is given: the eight symbols of the game in the window.

Checked by `tests/test_deck.py`.

### Step 2: a new game

Fill in `__init__` of the class `MemoryGame` in [`memorygame/game.py`](memorygame/game.py), its properties `size`, `pair_count`, `pairs_found` and `moves`, and its methods `symbol_at`, `is_face_up` and `is_matched`.

- `MemoryGame(cards)` gets the cards in their order on the board: `cards[0]` is the symbol at position 0. Keep your own copy of the list (`list(cards)`), so that later changes to the caller's list don't change the game, and don't change the caller's list.
- Raise a `ValueError` if `cards` is empty, or if some symbol isn't on exactly two cards. A dictionary that counts each symbol, as in module 21, is one way to check.
- In a new game every card is face down and nothing is matched. `pair_count` is half the number of cards; `pairs_found` and `moves` start at 0. Which cards are face up and which are matched can be two lists of `True` and `False`, one item for each card: `[False] * len(cards)` makes such a list.
- Keep the attributes private, with two underscores (`self.__moves`), as in module 39. `size`, `pair_count`, `pairs_found` and `moves` are **properties**: the starter already has the `@property` line over each one, so the window and the tests read them like attributes, `game.moves`, and can't set them. A test checks that `game.moves = 5` raises an `AttributeError`.
- `symbol_at(position)` gives the card's symbol, face up or not (the window decides what to show). For a position that isn't on the board, `symbol_at`, `is_face_up` and `is_matched` raise an `IndexError`. Careful: a list takes `-1` as its last item without complaint, so check the position yourself, `0 <= position < len(...)`. A private method that checks it, called by each method that takes a position, saves writing it four times.

Checked by `tests/test_new_game.py`.

### Step 3: flip a card, find a pair

Now the main method, `flip(position)`. It turns a card face up and returns one of the constants at the top of `game.py`, which says what happened. A turn is two flips. This step covers turns that find a pair:

- The first card of a turn turns face up, and `flip` returns `FIRST_CARD`. Remember which card it was: the next flip needs it. An attribute that holds its position, or `None` between turns, does it.
- The second card turns face up too. That completes a turn, so `moves` goes up by 1. If the two cards have the same symbol, both are now matched, `pairs_found` goes up by 1, and `flip` returns `MATCH`. The next flip starts a new turn.
- A card that is already face up can't be flipped: the first card of the turn, or a matched card. `flip` then changes nothing and returns `IGNORED`. It isn't a move, and a turn that was going on goes on.
- A position that isn't on the board raises an `IndexError`.

Checked by `tests/test_flip.py`.

### Step 4: no match

When the second card of a turn doesn't match the first, `flip` returns `NO_MATCH`. It's a move, but no pair. Both cards stay face up for now, so the player can see them: that's what the window shows until the next click.

Then the **next** call to `flip`, before anything else, turns those two cards face down again. After that it carries on as in step 3 with the card it was given. So:

- Flipping a third card hides the two and makes the third card the first of a new turn: `FIRST_CARD`.
- Flipping one of the two shown cards hides both, then flips that card again as the first of a new turn: `FIRST_CARD`, and it's face up.
- Flipping a matched card hides the two as well, and returns `IGNORED`.

Matched cards are never turned face down. Remember the two cards of a mismatch in an attribute (a tuple of their positions, or `None`), and check it at the start of `flip`.

Checked by `tests/test_mismatch.py`.

### Step 5: win the game

Write `is_won()`: the game is won when every pair has been found. Then add one more rule to `flip`: once the game is won, every flip returns `IGNORED` and changes nothing (a position that isn't on the board still raises an `IndexError`).

Checked by `tests/test_end_of_game.py`. It also plays a whole game with a shuffled deck from step 1.

### Step 6: the status line

Write `status_line(game)` in [`memorygame/status.py`](memorygame/status.py). It returns the text the window shows under the board:

- While the game goes on: `Moves: 3, pairs: 2 of 8` (the moves, the pairs found, and how many pairs the game has).
- When it's won: `You found all 8 pairs in 14 moves.`
- With one move, say `1 move`, not `1 moves`. And a game of a single pair says `You found the pair in 1 move.`

Checked by `tests/test_status_line.py`. With it, all the tests pass.

### Step 7: the window

The tests don't open windows, so this last step is checked by you, with your own eyes. Open [`memorygame/window.py`](memorygame/window.py). It's built like the course's pygame programs: `main` opens the window with `pygame.display.set_mode`, then loops forever, handling the events from `pygame.event.get()`, drawing everything again, and showing it with `pygame.display.flip()`, 30 times a second (`clock.tick(30)`). `card_rect` and `card_at` work out where each card is, and `draw_card` draws one card with its text in the middle. Two `# TODO`s are left:

1. In `main`, where a click on a card is handled: flip the card at `position` with `game.flip(position)`. (It doesn't need to look at what `flip` returns: the next drawing shows the game as it is now.)
2. In `draw_game`: draw each card as the game says. A matched card shows its symbol with `MATCHED_BACKGROUND` and `MATCHED_TEXT`. A face up card shows its symbol with `FACE_UP_BACKGROUND` and the symbol's color from `SYMBOL_COLORS` (`SYMBOL_COLORS.get(symbol, (0, 0, 0))` gives black for a symbol that isn't in it, if you add symbols later). A face down card shows `FACE_DOWN` with `FACE_DOWN_BACKGROUND` and `FACE_DOWN_TEXT`, as the line in the starter does for every card. Check `is_matched` before `is_face_up`, since matched cards are face up too. Then draw the status line: `draw_status(screen, small_font, status_line(game))`.

Notice that the window has no rules of its own: it asks the game what to show. That is why the tests could check the whole game without it.

Run it with `python -m memorygame` and play a few rounds. Once it works, ideas to go further: a bigger board (more symbols in `FOREST`), the best score of the session in the status line, a short pause before a mismatch turns face down (`pygame.time.get_ticks()` tells the time in milliseconds), or pictures on the cards instead of words (`pygame.image.load`, as in the course). Write a test first for anything that changes the rules.

## Run the tests

In the project's folder, with the virtual environment active:

```shell
python -m pytest
```

At first most tests fail: that's how you know what's left to do. pytest shows each failed test with the line that failed and the values it compared, for example:

```text
____________________ test_a_match_counts_a_move_and_a_pair _____________________

    def test_a_match_counts_a_move_and_a_pair():
        game = MemoryGame(CARDS)
        game.flip(0)
        game.flip(2)
>       assert game.moves == 1
E       assert 0 == 1
E        +  where 0 = <memorygame.game.MemoryGame object at 0x7f2c2cecafd0>.moves

tests/test_flip.py:31: AssertionError
```

That's the test (its name says what's expected), the line that failed with `>` in front of it, and the values: `game.moves` was 0, and the test expected 1. Open the test file to see the whole test. When every test passes, the last line says `59 passed`.

To run one step's tests only, name the test file, and to run one test, add `::` and its name:

```shell
python -m pytest tests/test_deck.py
python -m pytest tests/test_flip.py::test_two_cards_that_match
```

`python -m pytest -x` stops at the first test that fails, and `python -m pytest -q` prints less. Your editor can run the tests too: VS Code's Testing panel (the flask icon) finds them once you choose pytest, and PyCharm shows a run button next to each test.

## Run the program

In the project's folder, with the virtual environment active:

```shell
python -m memorygame
```

The game's window opens. Close it to end the program. pygame-ce prints a line with its version in the terminal when it starts; that's normal.

If it says `No module named pygame`, the virtual environment isn't active, or step 0's `pip install` didn't finish: run it again and read what it says. In an editor, choose the `.venv` Python (in VS Code, **Python: Select Interpreter**) and run `memorygame/__main__.py`, or open a terminal in the editor and run the command above.

## Put it on GitHub (optional)

The project comes with a GitHub Actions workflow, [`.github/workflows/test.yml`](.github/workflows/test.yml). In your own GitHub repository, it installs Python 3.14, pytest and pygame-ce on GitHub's computers and runs `python -m pytest` every time you push, and shows the result in the repository's **Actions** tab. Those computers have no screen, and they don't need one: the tests never open the window. Nobody else sees the results unless your repository is public, and Python Arena doesn't see them at all.

1. On [github.com](https://github.com), create a new repository (the **+** at the top, then **New repository**). Give it a name, like `forest-pairs`. Leave it empty: no README, no .gitignore.
2. Put the project's files at the top of the repository, so that `requirements.txt` and the `.github` folder are at its root. Without the `.github` folder, nothing runs.
   - **With git** (in the project's folder):

     ```shell
     git init
     git add .
     git commit -m "Forest pairs"
     git branch -M main
     git remote add origin https://github.com/YOUR-NAME/forest-pairs.git
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

The GitHub mobile app shows the Actions tab and each run's result, so you can follow your tests from a phone. Writing the code, running the tests, playing the game and the first upload need the computer.
