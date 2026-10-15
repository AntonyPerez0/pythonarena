# Step 3: list_all and search, in BookDatabase (booklog/bookdatabase.py).
from booklog.book import Book


def add_books(db):
    """Adds four books, with the ids 1 to 4."""
    db.add("The Left Hand of Darkness", "Ursula K. Le Guin", 304)
    db.add("Dune", "Frank Herbert", 412)
    db.add("A Wizard of Earthsea", "Ursula K. Le Guin", 183)
    db.add("Children of Dune", "Frank Herbert", 444)


def ids(books):
    return [book.id for book in books]


def test_list_all_of_an_empty_log(db):
    assert db.list_all() == []


def test_list_all_gives_every_book_as_a_book(db):
    add_books(db)
    assert db.list_all() == [
        Book(1, "The Left Hand of Darkness", "Ursula K. Le Guin", 304),
        Book(2, "Dune", "Frank Herbert", 412),
        Book(3, "A Wizard of Earthsea", "Ursula K. Le Guin", 183),
        Book(4, "Children of Dune", "Frank Herbert", 444),
    ]


def test_list_all_asks_for_the_order_of_the_ids(db):
    add_books(db)
    # From now on SQLite gives the rows of a SELECT without ORDER BY in the opposite order.
    db.connection.execute("PRAGMA reverse_unordered_selects = ON")
    assert ids(db.list_all()) == [1, 2, 3, 4], "SQL promises no order without ORDER BY id"


def test_search_in_titles(db):
    add_books(db)
    assert ids(db.search("Dune")) == [2, 4]


def test_search_in_authors(db):
    add_books(db)
    assert ids(db.search("Le Guin")) == [1, 3]


def test_search_ignores_case(db):
    add_books(db)
    assert ids(db.search("dUNE")) == [2, 4]
    assert ids(db.search("le guin")) == [1, 3]


def test_search_finds_a_book_once_when_both_match(db):
    db.add("Herbert West", "Frank Herbert", 10)
    assert ids(db.search("herbert")) == [1]


def test_search_finds_part_of_a_word(db):
    add_books(db)
    assert ids(db.search("ark")) == [1], "ark is in Darkness"


def test_search_with_no_match(db):
    add_books(db)
    assert db.search("Tolkien") == []


def test_an_empty_search_finds_every_book(db):
    add_books(db)
    assert ids(db.search("")) == [1, 2, 3, 4]


def test_search_in_the_order_of_the_ids(db):
    add_books(db)
    db.connection.execute("PRAGMA reverse_unordered_selects = ON")
    assert ids(db.search("u")) == [1, 2, 3, 4]


def test_search_gives_books(db):
    add_books(db)
    assert db.search("wizard") == [Book(3, "A Wizard of Earthsea", "Ursula K. Le Guin", 183)]


def test_percent_and_underscore_are_plain_text(db):
    db.add("100% Wolf", "Jayne Lyons", 288)
    db.add("Snake_case", "A. Coder", 12)
    db.add("Emma", "Jane Austen", 474)
    assert ids(db.search("%")) == [1]
    assert ids(db.search("_")) == [2]


def test_search_ignores_case_beyond_a_to_z(db):
    db.add("Independent People", "Halldór Laxness", 470)
    db.add("Emma", "Jane Austen", 474)
    assert ids(db.search("HALLDÓR")) == [1], "Ó in the search finds ó in the name"
