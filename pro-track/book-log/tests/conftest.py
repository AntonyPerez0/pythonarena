# Shared by the tests: pytest reads conftest.py by itself before the test files.
import pytest

from booklog.bookdatabase import BookDatabase


@pytest.fixture
def db():
    """A BookDatabase over a new, empty database in memory. A test that has a parameter named db
    gets one of its own, so every test starts from nothing, and no file is left behind."""
    database = BookDatabase(":memory:")
    yield database
    # After the test:
    database.close()
