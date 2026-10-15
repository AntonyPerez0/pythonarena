# Step 1: creating the table Books, in BookDatabase's __init__ (booklog/bookdatabase.py).
import sqlite3

from booklog.bookdatabase import BookDatabase


def columns(db):
    """The table's columns as (name, type, not null, primary key), from SQLite's own list of them."""
    rows = db.connection.execute("PRAGMA table_info(Books)").fetchall()
    # Each row of table_info is (number, name, type, not null, default value, primary key).
    return [(row[1], row[2].upper(), row[3], row[5]) for row in rows]


def test_the_table_is_there(db):
    names = [row[0] for row in db.connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
    assert "Books" in names, "the constructor creates the table Books"


def test_the_columns_in_order(db):
    assert [column[0] for column in columns(db)] == ["id", "title", "author", "pages"]


def test_the_column_types(db):
    assert [column[1] for column in columns(db)] == ["INTEGER", "TEXT", "TEXT", "INTEGER"]


def test_id_is_the_primary_key(db):
    assert [column[3] for column in columns(db)] == [1, 0, 0, 0], "only id is the PRIMARY KEY"


def test_the_other_columns_are_not_null(db):
    assert [column[2] for column in columns(db)][1:] == [1, 1, 1], "title, author and pages are NOT NULL"


def test_ids_are_never_handed_out_twice(db):
    sql = db.connection.execute("SELECT sql FROM sqlite_master WHERE name = 'Books'").fetchone()[0]
    assert "AUTOINCREMENT" in sql.upper(), "the id column is INTEGER PRIMARY KEY AUTOINCREMENT"


def test_the_table_starts_empty(db):
    assert db.connection.execute("SELECT COUNT(*) FROM Books").fetchone()[0] == 0


def test_opening_the_same_file_again_keeps_the_books(tmp_path):
    file = str(tmp_path / "books.db")
    first = BookDatabase(file)
    with first.connection:
        first.connection.execute("INSERT INTO Books (title, author, pages) VALUES ('Dune', 'Frank Herbert', 412)")
    first.close()
    second = BookDatabase(file)
    rows = second.connection.execute("SELECT title FROM Books").fetchall()
    second.close()
    assert rows == [("Dune",)], "the second time, the table is already there: CREATE TABLE IF NOT EXISTS leaves it as it is"


def test_the_table_is_in_the_file(tmp_path):
    file = str(tmp_path / "books.db")
    BookDatabase(file).close()
    other = sqlite3.connect(file)
    names = [row[0] for row in other.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
    other.close()
    assert "Books" in names, "another connection to the same file sees the table"
