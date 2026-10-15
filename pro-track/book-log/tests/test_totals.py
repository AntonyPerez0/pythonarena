# Step 5: total_pages and pages_by_author, in BookDatabase (booklog/bookdatabase.py).
from booklog.book import Book


def test_total_pages_of_an_empty_log(db):
    assert db.total_pages() == 0, "0, not None: SUM of no rows is NULL in SQL"


def test_total_pages(db):
    db.add("Dune", "Frank Herbert", 412)
    db.add("Emma", "Jane Austen", 474)
    db.add("Dune", "Frank Herbert", 412)
    assert db.total_pages() == 1298


def test_pages_by_author_of_an_empty_log(db):
    assert db.pages_by_author() == {}


def test_pages_by_author(db):
    db.add("Dune", "Frank Herbert", 412)
    db.add("Emma", "Jane Austen", 474)
    db.add("Children of Dune", "Frank Herbert", 444)
    db.add("Persuasion", "Jane Austen", 249)
    db.add("The Summer Book", "Tove Jansson", 170)
    assert db.pages_by_author() == {"Frank Herbert": 856, "Jane Austen": 723, "Tove Jansson": 170}


def test_an_author_as_written(db):
    db.add("Emma", "Jane Austen", 474)
    db.add("Persuasion", "jane austen", 249)
    assert db.pages_by_author() == {"Jane Austen": 474, "jane austen": 249}, "the names are written differently"


def test_totals_follow_changes(db):
    db.add("Dune", "Frank Herbert", 412)
    db.add("Emma", "Jane Austen", 474)
    db.add("Persuasion", "Jane Austen", 249)
    db.remove(1)
    db.update(Book(2, "Emma", "Jane Austen", 500))
    assert db.total_pages() == 749
    assert db.pages_by_author() == {"Jane Austen": 749}


def test_the_totals_are_whole_numbers(db):
    db.add("Dune", "Frank Herbert", 412)
    assert type(db.total_pages()) is int
    assert type(db.pages_by_author()["Frank Herbert"]) is int
