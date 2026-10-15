# Step 2: add and find_by_id, in BookDatabase (booklog/bookdatabase.py).
import sqlite3

import pytest

from booklog.book import Book
from booklog.bookdatabase import BookDatabase


def rows(db):
    """Every row of the table, read with plain SQL, past your methods."""
    return db.connection.execute("SELECT id, title, author, pages FROM Books ORDER BY id").fetchall()


def test_add_stores_a_row(db):
    db.add("Dune", "Frank Herbert", 412)
    assert rows(db) == [(1, "Dune", "Frank Herbert", 412)]


def test_add_returns_the_new_id(db):
    assert db.add("Dune", "Frank Herbert", 412) == 1
    assert db.add("Emma", "Jane Austen", 474) == 2
    assert db.add("Dune", "Frank Herbert", 412) == 3, "the same book twice is two rows: you read it twice"


def test_find_by_id(db):
    db.add("Dune", "Frank Herbert", 412)
    book_id = db.add("Emma", "Jane Austen", 474)
    assert db.find_by_id(book_id) == Book(book_id, "Emma", "Jane Austen", 474)


def test_find_by_id_gives_none_when_there_is_no_such_book(db):
    db.add("Dune", "Frank Herbert", 412)
    assert db.find_by_id(2) is None
    assert db.find_by_id(0) is None


def test_add_takes_the_spaces_off_the_ends(db):
    book_id = db.add("  Emma ", " Jane Austen  ", 474)
    assert db.find_by_id(book_id) == Book(book_id, "Emma", "Jane Austen", 474)


def test_quotes_and_apostrophes_are_plain_text(db):
    title = "The Hitchhiker's Guide to the Galaxy"
    author = 'Douglas "DNA" Adams'
    book_id = db.add(title, author, 224)
    assert db.find_by_id(book_id) == Book(book_id, title, author, 224), "use ? in the SQL for every value"


def test_sql_in_a_title_is_plain_text(db):
    title = "Robert'); DROP TABLE Books; --"
    book_id = db.add(title, "Little Bobby", 1)
    assert db.find_by_id(book_id).title == title


def test_letters_beyond_a_to_z(db):
    book_id = db.add("Sjálfstætt fólk", "Halldór Laxness", 470)
    assert db.find_by_id(book_id).author == "Halldór Laxness"


@pytest.mark.parametrize("title, author, pages", [
    ("", "Jane Austen", 474),
    ("   ", "Jane Austen", 474),
    ("Emma", "", 474),
    ("Emma", " \t ", 474),
    ("Emma", "Jane Austen", 0),
    ("Emma", "Jane Austen", -5),
])
def test_add_refuses_wrong_values(db, title, author, pages):
    with pytest.raises(ValueError):
        db.add(title, author, pages)
    assert rows(db) == [], "a book that was refused is not stored"


def test_a_refused_book_uses_up_no_id(db):
    with pytest.raises(ValueError):
        db.add("", "Jane Austen", 474)
    assert db.add("Emma", "Jane Austen", 474) == 1, "check the values before you touch the database"


def test_add_commits(tmp_path):
    file = str(tmp_path / "books.db")
    db = BookDatabase(file)
    db.add("Dune", "Frank Herbert", 412)
    other = sqlite3.connect(file)
    count = other.execute("SELECT COUNT(*) FROM Books").fetchone()[0]
    other.close()
    db.close()
    assert count == 1, "another connection sees the book only once add has committed it (with self.connection:)"


def test_the_books_are_there_the_next_time(tmp_path):
    file = str(tmp_path / "books.db")
    first = BookDatabase(file)
    book_id = first.add("Dune", "Frank Herbert", 412)
    first.close()
    second = BookDatabase(file)
    book = second.find_by_id(book_id)
    second.close()
    assert book == Book(book_id, "Dune", "Frank Herbert", 412)
