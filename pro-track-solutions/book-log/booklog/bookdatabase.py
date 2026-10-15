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
        with self.connection:
            self.connection.execute(
                """CREATE TABLE IF NOT EXISTS Books (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    author TEXT NOT NULL,
                    pages INTEGER NOT NULL
                )"""
            )

    def close(self):
        """Closes the connection to the database. Given ready."""
        self.connection.close()

    def __checked(self, title: str, author: str, pages: int) -> tuple[str, str, int]:
        """The values as they are stored (the text without spaces at its ends), or ValueError."""
        title = title.strip()
        author = author.strip()
        if title == "":
            raise ValueError("a book needs a title")
        if author == "":
            raise ValueError("a book needs an author")
        if pages < 1:
            raise ValueError(f"a book has at least 1 page, not {pages}")
        return title, author, pages

    def add(self, title: str, author: str, pages: int) -> int:
        """Adds a book and returns the id the database gave it. The title and the author are
        stored without spaces at their start and end.

        Raises ValueError, and stores nothing, if the title or the author is empty or only spaces,
        or pages is less than 1.
        """
        values = self.__checked(title, author, pages)
        with self.connection:
            cursor = self.connection.execute("INSERT INTO Books (title, author, pages) VALUES (?, ?, ?)", values)
        return cursor.lastrowid

    def find_by_id(self, book_id: int) -> Book | None:
        """The book with this id, or None if there's none."""
        row = self.connection.execute("SELECT id, title, author, pages FROM Books WHERE id = ?", (book_id,)).fetchone()
        if row is None:
            return None
        return Book(row[0], row[1], row[2], row[3])

    def list_all(self) -> list[Book]:
        """Every book, in the order of their ids (smallest first)."""
        rows = self.connection.execute("SELECT id, title, author, pages FROM Books ORDER BY id").fetchall()
        return [Book(row[0], row[1], row[2], row[3]) for row in rows]

    def search(self, text: str) -> list[Book]:
        """The books whose title or author contains the text, ignoring upper and lower case, in
        the order of their ids. An empty text is in every title, so it finds every book."""
        # In Python rather than in SQL: SQLite's LOWER() changes only the letters A to Z.
        wanted = text.lower()
        return [book for book in self.list_all() if wanted in book.title.lower() or wanted in book.author.lower()]

    def update(self, book: Book) -> bool:
        """Changes the title, the author and the pages of the book with the same id as the given
        one, with the same rules as add. Returns True if there was a book with that id, False if
        not (then nothing changes).

        Raises ValueError, and changes nothing, for the same reasons as add.
        """
        title, author, pages = self.__checked(book.title, book.author, book.pages)
        with self.connection:
            cursor = self.connection.execute(
                "UPDATE Books SET title = ?, author = ?, pages = ? WHERE id = ?", (title, author, pages, book.id)
            )
        return cursor.rowcount > 0

    def remove(self, book_id: int) -> bool:
        """Removes the book with this id. Returns True if there was one, False if not."""
        with self.connection:
            cursor = self.connection.execute("DELETE FROM Books WHERE id = ?", (book_id,))
        return cursor.rowcount > 0

    def total_pages(self) -> int:
        """How many pages all the books have together (0 when there are no books)."""
        total = self.connection.execute("SELECT SUM(pages) FROM Books").fetchone()[0]
        # SUM of no rows is NULL, which comes to Python as None.
        if total is None:
            return 0
        return total

    def pages_by_author(self) -> dict[str, int]:
        """How many pages each author's books have together: each author's name, as it is
        written, maps to the sum of the pages of their books."""
        rows = self.connection.execute("SELECT author, SUM(pages) FROM Books GROUP BY author").fetchall()
        totals = {}
        for author, pages in rows:
            totals[author] = pages
        return totals

    def export_csv(self, path: str) -> int:
        """Writes every book into a CSV file at path, in the order of their ids, after a header
        line id,title,author,pages. Replaces the file if it's there. Returns how many books it
        wrote."""
        books = self.list_all()
        with open(path, "w", encoding="utf-8", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(["id", "title", "author", "pages"])
            for book in books:
                writer.writerow([book.id, book.title, book.author, book.pages])
        return len(books)
