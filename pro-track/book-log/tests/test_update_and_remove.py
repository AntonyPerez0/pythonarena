# Step 4: update and remove, in BookDatabase (booklog/bookdatabase.py).
import sqlite3

import pytest

from booklog.book import Book
from booklog.bookdatabase import BookDatabase


def rows(db):
    """Every row of the table, read with plain SQL, past your methods."""
    return db.connection.execute("SELECT id, title, author, pages FROM Books ORDER BY id").fetchall()


def test_update_changes_the_book(db):
    book_id = db.add("Dune", "Frank Herbrt", 400)
    assert db.update(Book(book_id, "Dune Messiah", "Frank Herbert", 256)) is True
    assert db.find_by_id(book_id) == Book(book_id, "Dune Messiah", "Frank Herbert", 256)


def test_update_changes_only_that_book(db):
    db.add("Dune", "Frank Herbert", 412)
    db.add("Emma", "Jane Austen", 474)
    db.update(Book(2, "Persuasion", "Jane Austen", 249))
    assert rows(db) == [(1, "Dune", "Frank Herbert", 412), (2, "Persuasion", "Jane Austen", 249)]


def test_update_of_a_book_that_is_not_there(db):
    db.add("Dune", "Frank Herbert", 412)
    assert db.update(Book(7, "Emma", "Jane Austen", 474)) is False
    assert rows(db) == [(1, "Dune", "Frank Herbert", 412)], "nothing changes"


def test_update_takes_the_spaces_off_the_ends(db):
    book_id = db.add("Dune", "Frank Herbert", 412)
    db.update(Book(book_id, " Emma  ", "  Jane Austen ", 474))
    assert db.find_by_id(book_id) == Book(book_id, "Emma", "Jane Austen", 474)


@pytest.mark.parametrize("title, author, pages", [
    ("", "Jane Austen", 474),
    ("Emma", "  ", 474),
    ("Emma", "Jane Austen", 0),
])
def test_update_refuses_wrong_values(db, title, author, pages):
    book_id = db.add("Dune", "Frank Herbert", 412)
    with pytest.raises(ValueError):
        db.update(Book(book_id, title, author, pages))
    assert rows(db) == [(1, "Dune", "Frank Herbert", 412)], "nothing changes"


def test_update_commits(tmp_path):
    file = str(tmp_path / "books.db")
    db = BookDatabase(file)
    book_id = db.add("Dune", "Frank Herbert", 412)
    db.update(Book(book_id, "Emma", "Jane Austen", 474))
    other = sqlite3.connect(file)
    titles = other.execute("SELECT title FROM Books").fetchall()
    other.close()
    db.close()
    assert titles == [("Emma",)], "another connection sees the change only once update has committed it"


def test_remove(db):
    db.add("Dune", "Frank Herbert", 412)
    db.add("Emma", "Jane Austen", 474)
    assert db.remove(1) is True
    assert db.find_by_id(1) is None
    assert rows(db) == [(2, "Emma", "Jane Austen", 474)], "the other book stays"


def test_remove_of_a_book_that_is_not_there(db):
    db.add("Dune", "Frank Herbert", 412)
    assert db.remove(5) is False
    assert len(rows(db)) == 1


def test_remove_twice(db):
    book_id = db.add("Dune", "Frank Herbert", 412)
    assert db.remove(book_id) is True
    assert db.remove(book_id) is False, "the second time, there's nothing to remove"


def test_a_removed_id_is_not_handed_out_again(db):
    db.add("Dune", "Frank Herbert", 412)
    db.add("Emma", "Jane Austen", 474)
    db.remove(2)
    assert db.add("Persuasion", "Jane Austen", 249) == 3, "AUTOINCREMENT never gives a removed book's id to a new one"


def test_remove_commits(tmp_path):
    file = str(tmp_path / "books.db")
    db = BookDatabase(file)
    book_id = db.add("Dune", "Frank Herbert", 412)
    db.remove(book_id)
    other = sqlite3.connect(file)
    count = other.execute("SELECT COUNT(*) FROM Books").fetchone()[0]
    other.close()
    db.close()
    assert count == 0, "another connection sees the book gone only once remove has committed it"
