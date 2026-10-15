"""Starts the book log when you run python -m booklog.

Given ready: you don't need to change it.
"""
from booklog.bookdatabase import BookDatabase
from booklog.menu import BookMenu

# The database file, made in the folder you run the program from the first time.
DATABASE_FILE = "books.db"


def main():
    database = BookDatabase(DATABASE_FILE)
    try:
        BookMenu(database).start()
    finally:
        # Closed even when the program stops with an error.
        database.close()


if __name__ == "__main__":
    main()
