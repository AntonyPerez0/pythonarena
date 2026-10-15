# A book log with SQLite

A small program that keeps a log of the books you've read in a real database, with Python's own `sqlite3` module. You write the class that creates the table and adds, finds, changes, removes and totals the books with SQL, and pytest tests check it against a fresh database in memory.

## What you'll build

A book log: each line of it is one book you've read, with its title, its author and how many pages it has. The program is a text menu over a database in a file, `books.db`, so your books are still there the next time you start it. A run looks like this (what you type comes after each `:`):

```text
Book log. Commands: add, list, search, change, remove, totals, export, quit
Command: add
Title: The Left Hand of Darkness
Author: Ursula K. Le Guin
Pages: 304
Added book 1.
Command: add
Title: The Summer Book
Author: Tove Jansson
Pages: 170
Added book 2.
Command: add
Title: A Wizard of Earthsea
Author: Ursula K. Le Guin
Pages: 183
Added book 3.
Command: search
Title or author contains: le guin
#1 The Left Hand of Darkness by Ursula K. Le Guin, 304 pages
#3 A Wizard of Earthsea by Ursula K. Le Guin, 183 pages
Command: totals
Pages in all: 657
Tove Jansson: 170
Ursula K. Le Guin: 487
Command: export
File (empty for books.csv):
Wrote 3 books to books.csv.
Command: quit
Bye!
```

`export` writes the books into a CSV file that a spreadsheet opens:

```text
id,title,author,pages
1,The Left Hand of Darkness,Ursula K. Le Guin,304
2,The Summer Book,Tove Jansson,170
3,A Wizard of Earthsea,Ursula K. Le Guin,183
```

The menu, the class `Book` and the start of the program are ready. Your part is the class that talks to the database, `BookDatabase`. The menu only calls its methods and never sees any SQL, as in module 44, "Developing a larger application": the user interface in one class, the data in another.

| File | What it is | Who writes it |
| --- | --- | --- |
| [`booklog/bookdatabase.py`](booklog/bookdatabase.py) | The class `BookDatabase`: the table and every query. | You (steps 1 to 6) |
| [`booklog/book.py`](booklog/book.py) | The class `Book`: one book, with its id, title, author and pages. | Given ready |
| [`booklog/menu.py`](booklog/menu.py) | The class `BookMenu`: the text menu. | Given ready |
| [`booklog/__main__.py`](booklog/__main__.py) | Starts the program when you run `python -m booklog`. | Given ready |
| [`tests/`](tests/) | The tests, one file for each step, and `conftest.py`, which gives each test a new database. | Given ready |

## What you need

- **Python 3.14** (3.12 or newer works too). Check it in a terminal with `python3 --version` (on Windows, `py --version`). [The Pro Track page](https://antonyperez0.github.io/pythonarena/pro/) shows how to install Python and set up a project, step by step.
- **No database to install.** SQLite is a database that keeps everything in one file, and the module `sqlite3` that uses it comes with Python.
- **A code editor.** [Visual Studio Code](https://code.visualstudio.com) with its Python extension is the one the course uses; PyCharm works just as well.
- **pytest**, the tool that runs the tests. pip installs it from [`requirements.txt`](requirements.txt) in step 0, so that step needs an internet connection.
- **Git**, if you want to put the project on GitHub from the terminal (optional). Get it from [git-scm.com](https://git-scm.com/downloads), or with your package manager (`brew install git`, `sudo apt install git`).
- **What the course taught**, in particular: classes and methods (modules 34 to 36), encapsulation (39), handling errors, raising them too (25), writing files and CSV (24 and 30), your own modules (31), and splitting a program into a user interface and the rest (44).

About 3 to 5 hours of work.

### The project's folder

```text
book-log/
  requirements.txt   what pip installs: pytest
  pytest.ini         pytest's settings: the tests are in tests/
  booklog/           the program, a package: a folder of modules
  tests/             the tests, a file for each step
  .github/           the workflow that runs the tests on GitHub
```

A **package** is a folder of modules with a file `__init__.py` in it. `from booklog.book import Book` imports the class `Book` from the module `book.py` in the folder `booklog`, and `python -m booklog` runs the package's `__main__.py`.

### SQL in two minutes

The course didn't use databases, so here is what this project needs. A database keeps **tables**. A table has named **columns**, and each **row** is one record: here, one book. You talk to the database in SQL, a language of its own:

```text
CREATE TABLE IF NOT EXISTS Books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, ...)
INSERT INTO Books (title, author, pages) VALUES (?, ?, ?)
SELECT id, title, author, pages FROM Books WHERE id = ?
SELECT id, title, author, pages FROM Books ORDER BY id
UPDATE Books SET title = ?, author = ?, pages = ? WHERE id = ?
DELETE FROM Books WHERE id = ?
SELECT SUM(pages) FROM Books
```

In Python, `self.connection.execute(sql, values)` runs one SQL statement. Each `?` in the SQL is a place for a value, and the values come as a tuple, in the same order. A tuple of one value needs a comma: `(book_id,)`. `execute` returns a **cursor**, which holds the answer:

- `cursor.fetchone()` gives the next row as a tuple, such as `(1, "Dune", "Frank Herbert", 412)`, or `None` when there are no more rows.
- `cursor.fetchall()` gives all the rows, as a list of tuples.
- `cursor.lastrowid` is the id of the row an `INSERT` added, and `cursor.rowcount` is how many rows an `UPDATE` or a `DELETE` changed.

Never put a value into the SQL text yourself, with an f-string or `+`. A title like `The Hitchhiker's Guide` would break the SQL, and a title written on purpose could run SQL of its own. With `?`, SQLite always treats the value as plain text, and some tests check exactly that.

A change to the database (`INSERT`, `UPDATE`, `DELETE`) is saved only when it is **committed**. Run it inside `with self.connection:`, and the connection commits at the end of the block, or undoes the change if an error happens inside it. It's like `with open(...)`, except that it doesn't close the connection:

```python
with self.connection:
    cursor = self.connection.execute("INSERT INTO Books (title, author, pages) VALUES (?, ?, ?)", (title, author, pages))
return cursor.lastrowid
```

Python's [`sqlite3` documentation](https://docs.python.org/3/library/sqlite3.html) has the rest, with a tutorial.

### pytest in two minutes

- A test is a function whose name starts with `test_`, in a file whose name starts with `test_`. `python -m pytest` finds all of them in `tests/` and runs them.
- A test checks with a plain `assert`. When the condition is false, pytest shows both sides, and the message after the comma if there is one: `assert db.remove(5) is False`.
- `pytest.raises` checks that code raises an exception:

  ```python
  with pytest.raises(ValueError):
      db.add("", "Jane Austen", 474)
  ```

- **Fixtures** give a test what it needs: pytest sees a parameter's name and passes the right thing in. [`tests/conftest.py`](tests/conftest.py) makes the fixture `db`: a `BookDatabase(":memory:")`, a new, empty database that lives only in memory, so every test starts from nothing and no file is left behind. pytest's own fixture `tmp_path` is an empty folder for a test that needs real files.

Some tests also look into the table with plain SQL through `db.connection`, past your methods. So your class must really keep the books in the database, not in a list of its own.

## Steps

Each step names the `# TODO`s to fill in, all in [`booklog/bookdatabase.py`](booklog/bookdatabase.py), and the test file that checks them. Do them in order: later steps use the earlier ones. After each step, run that step's tests (see [Run the tests](#run-the-tests)), and go on when they pass.

### Step 0: get the project running

Unzip the project and open a terminal in its folder (the one with `requirements.txt`). Make a virtual environment, a folder `.venv` that keeps the project's packages apart from the rest of your computer, install pytest into it, and run the tests:

```shell
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pytest
```

On Windows, the first two lines are `py -m venv .venv` and `.venv\Scripts\activate`. Activate the environment again each time you open a new terminal for the project: the prompt then starts with `(.venv)`.

pytest runs 69 tests, and all of them fail: that's the starting point, and the failing tests are your to-do list. If instead it says `No module named pytest`, the virtual environment isn't active.

### Step 1: create the table

At the end of `__init__`, after the connection is made, create the table `Books` if it doesn't exist yet. Its columns:

| Column | SQL type | What it holds |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | The book's id. The database hands out 1, 2, 3... and never hands out a removed book's id again. |
| `title` | `TEXT NOT NULL` | The title, such as `Dune`: text, never missing. |
| `author` | `TEXT NOT NULL` | Who wrote it. |
| `pages` | `INTEGER NOT NULL` | How many pages it has. |

The SQL starts with `CREATE TABLE IF NOT EXISTS Books (` and lists the columns with commas between them. A string in triple quotes (`"""..."""`) can go over several lines, which keeps it readable. `IF NOT EXISTS` matters: when you start the program the second time, the table is already there with your books in it, and `__init__` must leave it as it is.

Why `AUTOINCREMENT`? SQLite gives a new row the biggest id so far plus 1. Without `AUTOINCREMENT`, if you removed the last book and added another, the new one would get the removed one's id, and an id you wrote down somewhere would suddenly mean another book. With it, an id is never used twice.

Checked by `tests/test_schema.py`.

### Step 2: add and find_by_id

`add(title, author, pages)` stores a new book and returns its id.

1. First check the values. Raise a `ValueError` with a message that says what's wrong if the title or the author is empty or only spaces, or if `pages` is less than 1. Check before you touch the database, so a refused book is never stored and doesn't use up an id. The menu catches the `ValueError` and shows its message: `Not added: a book needs a title`.
2. Store the title and the author without the spaces at their start and end (`strip()`).
3. Run the `INSERT` inside `with self.connection:`, as in "SQL in two minutes" above, and return `cursor.lastrowid`. There's no id in the `INSERT`: the database chooses it.

`find_by_id(book_id)` returns the book with that id, or `None` if there's none. The SQL is `SELECT id, title, author, pages FROM Books WHERE id = ?`, and `fetchone()` gives the row or `None`. Make a `Book` of the row: `Book(row[0], row[1], row[2], row[3])`, or `Book(*row)`, which passes the tuple's items as the arguments. A `SELECT` changes nothing, so it needs no `with self.connection:`.

The checks are needed again in step 4, so a private method that checks the values and returns them stripped, used by both, saves writing them twice.

Checked by `tests/test_add_and_find.py`.

### Step 3: list and search

`list_all()` returns every book as a `Book`, smallest id first: `SELECT id, title, author, pages FROM Books ORDER BY id`, then a `Book` of each row of `fetchall()`. SQL promises no particular order unless you ask for one with `ORDER BY`. SQLite often gives the rows in id order anyway, but don't count on it: one test turns on a setting that makes SQLite give them in the opposite order whenever there's no `ORDER BY`.

`search(text)` returns the books whose title or author contains the text, ignoring upper and lower case, smallest id first. `dUNE` finds `Dune` and `Children of Dune`, `le guin` finds Ursula K. Le Guin's books, and an empty text finds every book. Do it in Python: go through `list_all()` and keep the books where `text.lower()` is `in` the title or the author in lower case. A book whose title and author both match is in the list once.

(Why not in SQL? SQLite's `LOWER()` changes only the letters A to Z, so `LOWER('HALLDÓR')` is `halldÓr`, and a search for `HALLDÓR` wouldn't find Halldór Laxness. Python's `lower()` knows every alphabet. SQL's `LIKE` has the same problem, and in it `%` and `_` mean "anything" and "any one character", so a search for `_` would find every book. A test checks both.)

Checked by `tests/test_list_and_search.py`.

### Step 4: update and remove

`update(book)` changes the title, the author and the pages of the row with the book's id: `UPDATE Books SET title = ?, author = ?, pages = ? WHERE id = ?`. It checks the values and strips the text exactly as `add` does. It returns `True` when `cursor.rowcount` is more than 0, and `False` when there was no book with that id.

`remove(book_id)` deletes the row with that id, `DELETE FROM Books WHERE id = ?`, and returns `True` if a row went away, `False` if there was none.

Both change the database, so both run inside `with self.connection:`. The tests check that the change is committed: they open a second connection to the same file and look.

Checked by `tests/test_update_and_remove.py`. One of its tests removes the last book and adds a new one: the new one gets a new id, not the removed one's. `AUTOINCREMENT` from step 1 does that for you.

### Step 5: totals

`total_pages()` returns how many pages all the books have together. `SELECT SUM(pages) FROM Books` gives one row with one value. Careful: the sum of no rows is `NULL` in SQL, which comes to Python as `None`, and the method must return 0 then.

`pages_by_author()` returns a dictionary from each author to the pages of their books together, such as `{"Frank Herbert": 856, "Jane Austen": 723}`. An author is written exactly as it is stored, so `Jane Austen` and `jane austen` are two different keys. In SQL, `GROUP BY` makes one row of each group of rows with the same value, and `SUM` adds a column up within each group:

```text
SELECT author, SUM(pages) FROM Books GROUP BY author
```

Each row of the answer is a tuple `(author, pages)`: put them in a dictionary. Or go through `list_all()` and add the pages up in Python, as in module 21.

Checked by `tests/test_totals.py`.

### Step 6: export to CSV

`export_csv(path)` writes every book into a CSV file, smallest id first, after a header line, and returns how many books it wrote:

```text
id,title,author,pages
1,Dune,Frank Herbert,412
```

Write it with Python's `csv` module, which the starter already imports. Module 30 read CSV files with `csv.reader`; `csv.writer` is the other half:

```python
with open(path, "w", encoding="utf-8", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(["id", "title", "author", "pages"])
```

Then one `writer.writerow([...])` for each book. Why not join the values with commas yourself? A title like `Eats, Shoots & Leaves` has a comma in it, and a spreadsheet would split it in two. `csv.writer` puts quotes around such a value, and doubles any quotes inside it. `newline=""` lets the `csv` module choose the line breaks itself, as its documentation asks, and `encoding="utf-8"` keeps letters like `ó` right on every computer. Opening with `"w"` replaces a file that's already there.

Checked by `tests/test_export.py`. When all 69 tests pass, you're done: run the program and log your own books.

Ideas to go further, each with a test of your own first: a column for the date you finished a book (module 29) and a command that lists the books of one year, a rating from 1 to 5 with the average per author (`AVG` in SQL), or an import command that reads books back from a CSV file.

## Run the tests

In the project's folder, with the virtual environment active:

```shell
python -m pytest
```

The tests fail at first: that's expected, and each step makes more of them pass. pytest shows each failed test with the line that failed and the values it compared, and ends with a summary of the failed tests and a count, such as `12 failed, 57 passed`. When every test passes, the last line says `69 passed`.

To run one step's tests only, name the test file, and to run one test, add `::` and its name:

```shell
python -m pytest tests/test_schema.py
python -m pytest tests/test_add_and_find.py::test_find_by_id
```

`python -m pytest -x` stops at the first test that fails, and `python -m pytest -q` prints less. Your editor can run the tests too: VS Code's Testing panel (the flask icon) finds them once you choose pytest, and PyCharm shows a run button next to each test.

## Run the program

In the project's folder:

```shell
python -m booklog
```

The program makes the file `books.db` in the folder you run it from the first time, and uses it again every time after. Type `quit` to stop (or press Ctrl+D, or Ctrl+Z and Enter on Windows). To start over with an empty log, delete `books.db` while the program isn't running. The `.gitignore` keeps `books.db` and `books.csv` out of your repository.

Before you've written the steps, a command whose method isn't written yet stops the program with `NotImplementedError`. Run it again after each step to see what works.

To look into `books.db` without the program, the free [DB Browser for SQLite](https://sqlitebrowser.org) opens it and shows the table, or runs SQL of your own.

## Put it on GitHub (optional)

The project comes with a GitHub Actions workflow, [`.github/workflows/test.yml`](.github/workflows/test.yml). In your own GitHub repository, it installs Python 3.14 and pytest on GitHub's computers and runs `python -m pytest` every time you push, so you can see that the tests pass somewhere other than your own computer. The tests use databases in memory, so GitHub's computers need nothing else.

1. On [github.com](https://github.com), create a new repository (the **+** at the top, then **New repository**). Give it a name, like `book-log`. Leave it empty: no README, no .gitignore.
2. Put the project's files at the top of the repository, so that `requirements.txt` and the `.github` folder are at its root. Without the `.github` folder, nothing runs.
   - **With git** (in the project's folder):

     ```shell
     git init
     git add .
     git commit -m "Start the book log"
     git branch -M main
     git remote add origin https://github.com/YOUR-NAME/book-log.git
     git push -u origin main
     ```

     The `.gitignore` keeps `.venv`, Python's own files and your database out of the repository.

     The first time you use git on a computer, tell it your name and email, or `git commit` stops with "Author identity unknown":

     ```shell
     git config --global user.name "Your Name"
     git config --global user.email you@example.com
     ```

     The first `git push` asks you to sign in, and GitHub doesn't accept your account password there. Git for Windows opens a browser window to sign you in. On macOS and Linux, sign in first with [GitHub CLI](https://cli.github.com) (`gh auth login`, and let it set up git), or paste a [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) when git asks for the password. [GitHub Desktop](https://desktop.github.com) signs you in for you, too.
   - **In the browser**: on the new repository's page, choose **uploading an existing file** and drag the project's files and folders into it, then **Commit changes**. Don't upload `.venv`, `__pycache__`, `.pytest_cache` or `books.db`. Folders whose names start with a dot are hidden on macOS and Linux: press `Cmd+Shift+.` in macOS's Finder, or `Ctrl+H` in most Linux file managers, to see `.github`.
3. Open the repository's **Actions** tab. The workflow **Tests** runs after each push: a red cross means some tests fail (open the run to see which), a green check means they all pass. Each push runs it again, so push after each step and watch the red turn green.

The GitHub mobile app shows the Actions tab and each run's result, so you can follow your tests from a phone. Writing the code, running the tests and the first upload need the computer.

Python Arena can't see your repository or your test results. They are yours.
