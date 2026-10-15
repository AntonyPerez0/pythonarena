"""The book log's database (steps 1 to 6)."""

import csv
import sqlite3

from booklog.book import Book


class BookDatabase:
    """The books of the log, kept in a SQLite database, in the table Books. README.md, "Steps",
    says what each method does and which tests check it."""

    def __init__(self, path: str):
        """Opens the database at path, a file such as "books.db" (made if it isn't there yet), or
        a new, empty database in memory with ":memory:", as in the tests."""
        # The connection to the database: every method runs its SQL through it. The tests also use
        # it to look into the database past your methods.
        self.connection = sqlite3.connect(path)
        # TODO: Step 1. Create the table Books if it doesn't exist yet (README.md has its columns).

    def close(self):
        """Closes the connection to the database. Given ready."""
        self.connection.close()

    def add(self, title: str, author: str, pages: int) -> int:
        """Adds a book and returns the id the database gave it. The title and the author are
        stored without spaces at their start and end.

        Raises ValueError, and stores nothing, if the title or the author is empty or only spaces,
        or pages is less than 1.
        """
        # TODO: Step 2. Check the values, then INSERT a row, commit, and return its id.
        raise NotImplementedError("add isn't written yet (step 2)")

    def find_by_id(self, book_id: int) -> Book | None:
        """The book with this id, or None if there's none."""
        # TODO: Step 2. SELECT the row with this id and make a Book of it.
        raise NotImplementedError("find_by_id isn't written yet (step 2)")

    def list_all(self) -> list[Book]:
        """Every book, in the order of their ids (smallest first)."""
        # TODO: Step 3. SELECT every row, ORDER BY id, and make a Book of each.
        raise NotImplementedError("list_all isn't written yet (step 3)")

    def search(self, text: str) -> list[Book]:
        """The books whose title or author contains the text, ignoring upper and lower case, in
        the order of their ids. An empty text is in every title, so it finds every book."""
        # TODO: Step 3.
        raise NotImplementedError("search isn't written yet (step 3)")

    def update(self, book: Book) -> bool:
        """Changes the title, the author and the pages of the book with the same id as the given
        one, with the same rules as add. Returns True if there was a book with that id, False if
        not (then nothing changes).

        Raises ValueError, and changes nothing, for the same reasons as add.
        """
        # TODO: Step 4. Check the values as add does, then UPDATE the row with the book's id.
        raise NotImplementedError("update isn't written yet (step 4)")

    def remove(self, book_id: int) -> bool:
        """Removes the book with this id. Returns True if there was one, False if not."""
        # TODO: Step 4. DELETE the row with this id.
        raise NotImplementedError("remove isn't written yet (step 4)")

    def total_pages(self) -> int:
        """How many pages all the books have together (0 when there are no books)."""
        # TODO: Step 5.
        raise NotImplementedError("total_pages isn't written yet (step 5)")

    def pages_by_author(self) -> dict[str, int]:
        """How many pages each author's books have together: each author's name, as it is
        written, maps to the sum of the pages of their books."""
        # TODO: Step 5.
        raise NotImplementedError("pages_by_author isn't written yet (step 5)")

    def export_csv(self, path: str) -> int:
        """Writes every book into a CSV file at path, in the order of their ids, after a header
        line id,title,author,pages. Replaces the file if it's there. Returns how many books it
        wrote."""
        # TODO: Step 6. Write the file with the csv module.
        raise NotImplementedError("export_csv isn't written yet (step 6)")
