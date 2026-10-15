"""One book of the log. Given ready: you don't need to change it."""


class Book:
    """One book of the log: its id in the database, its title, its author and how many pages it has."""

    def __init__(self, book_id: int, title: str, author: str, pages: int):
        self.id = book_id
        self.title = title
        self.author = author
        self.pages = pages

    def __eq__(self, other):
        """Two books are equal when all four of their attributes are, so tests can compare them with ==."""
        if not isinstance(other, Book):
            return False
        return (self.id, self.title, self.author, self.pages) == (other.id, other.title, other.author, other.pages)

    def __repr__(self):
        """How a book shows in a test's failure: Book(1, 'Dune', 'Frank Herbert', 412)."""
        return f"Book({self.id!r}, {self.title!r}, {self.author!r}, {self.pages!r})"

    def __str__(self):
        """How the menu shows a book: #1 Dune by Frank Herbert, 412 pages."""
        return f"#{self.id} {self.title} by {self.author}, {self.pages} pages"
