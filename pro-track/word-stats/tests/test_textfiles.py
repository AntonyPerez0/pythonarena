# Step 4: read_file, in wordstats/textfiles.py.
# tmp_path is one of pytest's fixtures: a test that has a parameter of that name gets an empty
# folder of its own (a pathlib.Path) to write files in. pytest deletes it later.
import pytest

from wordstats.textfiles import read_file


def write(folder, name, text):
    """Writes text into a UTF-8 file in the folder and returns the file's path as a string."""
    file = folder / name
    file.write_text(text, encoding="utf-8")
    return str(file)


def test_reads_every_line(tmp_path):
    stats = read_file(write(tmp_path, "dock.txt", "Boats in the dock.\nThe dock is full.\n"))
    assert stats.line_count() == 2
    assert stats.word_count() == 8
    assert stats.count_of("dock") == 2


def test_line_breaks_are_not_characters(tmp_path):
    stats = read_file(write(tmp_path, "two.txt", "ab\ncd\n"))
    assert stats.character_count() == 4


def test_spaces_at_the_end_of_a_line_are_characters(tmp_path):
    stats = read_file(write(tmp_path, "spaces.txt", "ab  \n"))
    assert stats.character_count() == 4, "only the line break is left out, not the spaces before it"


def test_the_last_line_without_a_line_break(tmp_path):
    stats = read_file(write(tmp_path, "end.txt", "one\ntwo"))
    assert stats.line_count() == 2
    assert stats.character_count() == 6


def test_empty_lines_are_lines(tmp_path):
    stats = read_file(write(tmp_path, "gaps.txt", "a\n\nb\n"))
    assert stats.line_count() == 3
    assert stats.word_count() == 2


def test_an_empty_file(tmp_path):
    stats = read_file(write(tmp_path, "empty.txt", ""))
    assert stats.line_count() == 0
    assert stats.word_count() == 0


def test_windows_line_breaks(tmp_path):
    file = tmp_path / "windows.txt"
    file.write_bytes(b"ab\r\ncd\r\n")
    stats = read_file(str(file))
    assert stats.line_count() == 2
    assert stats.character_count() == 4, "\\r\\n is a line break too: no \\r left in the lines"


def test_reads_utf8_letters(tmp_path):
    stats = read_file(write(tmp_path, "cafe.txt", "café Café\n"))
    assert stats.count_of("café") == 2
    assert stats.character_count() == 9


def test_case_sensitive_is_passed_on(tmp_path):
    file = write(tmp_path, "cod.txt", "Cod cod\n")
    assert read_file(file, True).distinct_word_count() == 2, "case sensitive"
    assert read_file(file, False).distinct_word_count() == 1, "not case sensitive"
    assert read_file(file).distinct_word_count() == 1, "not case sensitive if left out"


def test_a_missing_file_raises_file_not_found_error(tmp_path):
    with pytest.raises(FileNotFoundError):
        read_file(str(tmp_path / "nothing.txt"))


def test_a_file_that_is_not_utf8_raises_unicode_decode_error(tmp_path):
    file = tmp_path / "latin1.txt"
    file.write_bytes("café\n".encode("latin-1"))
    with pytest.raises(UnicodeDecodeError):
        read_file(str(file))
