"""The book log's text menu. Given ready: you don't need to change it."""

from booklog.book import Book
from booklog.bookdatabase import BookDatabase

COMMANDS = "add, list, search, change, remove, totals, export, quit"


class BookMenu:
    """Asks for commands and carries them out. It uses only BookDatabase's methods, so it never
    sees any SQL, and it would work the same with any other class that has those methods."""

    def __init__(self, database: BookDatabase):
        self.__database = database

    def start(self):
        print(f"Book log. Commands: {COMMANDS}")
        try:
            while True:
                command = input("Command: ").strip()
                if command == "quit":
                    break
                elif command == "add":
                    self.__add()
                elif command == "list":
                    self.__print(self.__database.list_all(), "No books yet.")
                elif command == "search":
                    text = input("Title or author contains: ")
                    self.__print(self.__database.search(text), "No books found.")
                elif command == "change":
                    self.__change()
                elif command == "remove":
                    self.__remove()
                elif command == "totals":
                    self.__totals()
                elif command == "export":
                    self.__export()
                elif command != "":
                    print(f"Unknown command: {command}. The commands are: {COMMANDS}")
        except (EOFError, KeyboardInterrupt):
            # The input ended (Ctrl+D, or Ctrl+Z and Enter on Windows) or Ctrl+C was pressed.
            print()
        print("Bye!")

    def __add(self):
        title = input("Title: ")
        author = input("Author: ")
        pages = self.__ask_number("Pages")
        try:
            book_id = self.__database.add(title, author, pages)
            print(f"Added book {book_id}.")
        except ValueError as error:
            print(f"Not added: {error}")

    def __change(self):
        book_id = self.__ask_number("Id")
        old = self.__database.find_by_id(book_id)
        if old is None:
            print(f"There's no book {book_id}.")
            return
        print(old)
        title = self.__ask_or_keep("Title", old.title)
        author = self.__ask_or_keep("Author", old.author)
        pages_text = self.__ask_or_keep("Pages", str(old.pages)).strip()
        try:
            pages = int(pages_text)
        except ValueError:
            print(f"Not changed: {pages_text} isn't a whole number")
            return
        try:
            self.__database.update(Book(book_id, title, author, pages))
            print(f"Changed: {self.__database.find_by_id(book_id)}")
        except ValueError as error:
            print(f"Not changed: {error}")

    def __remove(self):
        book_id = self.__ask_number("Id")
        if self.__database.remove(book_id):
            print(f"Removed book {book_id}.")
        else:
            print(f"There's no book {book_id}.")

    def __totals(self):
        print(f"Pages in all: {self.__database.total_pages()}")
        pages = self.__database.pages_by_author()
        for author in sorted(pages):
            print(f"{author}: {pages[author]}")

    def __export(self):
        path = input("File (empty for books.csv): ").strip()
        if path == "":
            path = "books.csv"
        try:
            count = self.__database.export_csv(path)
        except OSError as error:
            print(f"Couldn't write {path}: {error.strerror}")
            return
        print(f"Wrote {count} {'book' if count == 1 else 'books'} to {path}.")

    def __print(self, books: list[Book], when_none: str):
        if not books:
            print(when_none)
        for book in books:
            print(book)

    def __ask_or_keep(self, question: str, old: str) -> str:
        answer = input(f"{question} (empty keeps {old}): ")
        if answer.strip() == "":
            return old
        return answer

    def __ask_number(self, question: str) -> int:
        while True:
            answer = input(f"{question}: ").strip()
            try:
                return int(answer)
            except ValueError:
                print("Please give a whole number.")
