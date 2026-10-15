# Step 5: parse_args, in wordstats/commandline.py.
# pytest.raises(ValueError, match="--top") checks that the code in the with block raises a
# ValueError whose message contains --top.
import pytest

from wordstats.commandline import DEFAULT_MIN_LENGTH, DEFAULT_TOP, parse_args


def test_just_files():
    options = parse_args(["a.txt", "b.txt"])
    assert options.files == ["a.txt", "b.txt"]
    assert options.top == DEFAULT_TOP
    assert options.min_length == DEFAULT_MIN_LENGTH
    assert options.case_sensitive is False
    assert options.show_help is False


def test_top():
    options = parse_args(["--top", "3", "a.txt"])
    assert options.top == 3, "the number as an int, not a string"
    assert options.files == ["a.txt"], "3 is --top's number, not a file"


def test_min_length():
    options = parse_args(["--min-length", "4", "a.txt"])
    assert options.min_length == 4
    assert options.files == ["a.txt"]


def test_case_sensitive():
    assert parse_args(["--case-sensitive", "a.txt"]).case_sensitive is True


def test_help_long_and_short():
    assert parse_args(["--help"]).show_help is True
    assert parse_args(["-h"]).show_help is True


def test_help_needs_no_files():
    assert parse_args(["-h"]).files == []


def test_options_can_come_anywhere():
    options = parse_args(["a.txt", "--top", "5", "b.txt", "--case-sensitive", "--min-length", "2", "c.txt"])
    assert options.files == ["a.txt", "b.txt", "c.txt"]
    assert options.top == 5
    assert options.min_length == 2
    assert options.case_sensitive is True


def test_a_file_name_with_spaces_is_one_argument():
    assert parse_args(["my notes.txt"]).files == ["my notes.txt"]


def test_top_without_a_number():
    with pytest.raises(ValueError, match="--top"):
        parse_args(["a.txt", "--top"])


def test_top_that_is_not_a_number():
    with pytest.raises(ValueError, match="--top"):
        parse_args(["--top", "three", "a.txt"])


def test_top_that_is_not_a_whole_number():
    with pytest.raises(ValueError, match="--top"):
        parse_args(["--top", "2.5", "a.txt"])


def test_top_of_zero():
    with pytest.raises(ValueError, match="--top"):
        parse_args(["--top", "0", "a.txt"])


def test_top_below_zero():
    with pytest.raises(ValueError, match="--top"):
        parse_args(["--top", "-2", "a.txt"])


def test_min_length_without_a_number():
    with pytest.raises(ValueError, match="--min-length"):
        parse_args(["a.txt", "--min-length"])


def test_min_length_that_is_not_a_number():
    with pytest.raises(ValueError, match="--min-length"):
        parse_args(["--min-length", "long", "a.txt"])


def test_min_length_of_zero():
    with pytest.raises(ValueError, match="--min-length"):
        parse_args(["--min-length", "0", "a.txt"])


def test_an_unknown_option():
    with pytest.raises(ValueError, match="--color"):
        parse_args(["--color", "a.txt"])


def test_an_unknown_short_option():
    with pytest.raises(ValueError, match="-x"):
        parse_args(["a.txt", "-x"])


def test_no_arguments():
    with pytest.raises(ValueError):
        parse_args([])


def test_options_but_no_files():
    with pytest.raises(ValueError):
        parse_args(["--top", "3", "--case-sensitive"])
