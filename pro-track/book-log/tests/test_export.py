# Step 6: export_csv, in BookDatabase (booklog/bookdatabase.py).
import csv


def read_csv(path):
    """The rows of a CSV file, each a list of strings, as Python's csv module reads them."""
    with open(path, encoding="utf-8", newline="") as file:
        return list(csv.reader(file))


def test_writes_a_header_and_every_book(db, tmp_path):
    db.add("Dune", "Frank Herbert", 412)
    db.add("Emma", "Jane Austen", 474)
    path = str(tmp_path / "books.csv")
    db.export_csv(path)
    assert read_csv(path) == [
        ["id", "title", "author", "pages"],
        ["1", "Dune", "Frank Herbert", "412"],
        ["2", "Emma", "Jane Austen", "474"],
    ]


def test_returns_how_many_books_it_wrote(db, tmp_path):
    db.add("Dune", "Frank Herbert", 412)
    db.add("Emma", "Jane Austen", 474)
    db.add("Persuasion", "Jane Austen", 249)
    assert db.export_csv(str(tmp_path / "books.csv")) == 3


def test_an_empty_log_writes_only_the_header(db, tmp_path):
    path = str(tmp_path / "books.csv")
    assert db.export_csv(path) == 0
    assert read_csv(path) == [["id", "title", "author", "pages"]]


def test_the_first_line_of_the_file(db, tmp_path):
    db.add("Dune", "Frank Herbert", 412)
    path = tmp_path / "books.csv"
    db.export_csv(str(path))
    first_line = path.read_text(encoding="utf-8").splitlines()[0]
    assert first_line == "id,title,author,pages"


def test_commas_and_quotes_in_a_title(db, tmp_path):
    db.add("Eats, Shoots & Leaves", "Lynne Truss", 209)
    db.add('The "Best" Book', "Anne Author", 99)
    path = str(tmp_path / "books.csv")
    db.export_csv(path)
    assert read_csv(path)[1:] == [
        ["1", "Eats, Shoots & Leaves", "Lynne Truss", "209"],
        ["2", 'The "Best" Book', "Anne Author", "99"],
    ], "csv.writer puts quotes around a value with a comma or a quote in it"


def test_in_the_order_of_the_ids(db, tmp_path):
    db.add("Dune", "Frank Herbert", 412)
    db.add("Emma", "Jane Austen", 474)
    db.add("Persuasion", "Jane Austen", 249)
    db.remove(2)
    db.connection.execute("PRAGMA reverse_unordered_selects = ON")
    path = str(tmp_path / "books.csv")
    db.export_csv(path)
    assert [row[0] for row in read_csv(path)] == ["id", "1", "3"]


def test_the_file_is_utf8(db, tmp_path):
    db.add("Sjálfstætt fólk", "Halldór Laxness", 470)
    path = str(tmp_path / "books.csv")
    db.export_csv(path)
    assert read_csv(path)[1] == ["1", "Sjálfstætt fólk", "Halldór Laxness", "470"], "open the file with encoding=\"utf-8\""


def test_replaces_a_file_that_is_there(db, tmp_path):
    path = tmp_path / "books.csv"
    path.write_text("old text\nmore old text\n", encoding="utf-8")
    db.add("Dune", "Frank Herbert", 412)
    db.export_csv(str(path))
    assert read_csv(str(path)) == [["id", "title", "author", "pages"], ["1", "Dune", "Frank Herbert", "412"]]


def test_the_database_does_not_change(db, tmp_path):
    db.add("Dune", "Frank Herbert", 412)
    db.export_csv(str(tmp_path / "books.csv"))
    assert db.connection.execute("SELECT id, title, author, pages FROM Books").fetchall() == [(1, "Dune", "Frank Herbert", 412)]
