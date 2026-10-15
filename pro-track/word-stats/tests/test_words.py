# Step 1: split_words, in wordstats/words.py.
from wordstats.words import split_words


def test_splits_at_spaces():
    assert split_words("the harbor wakes") == ["the", "harbor", "wakes"]


def test_keeps_the_case_as_it_is():
    assert split_words("Boats KNOCK against") == ["Boats", "KNOCK", "against"]


def test_punctuation_ends_a_word():
    assert split_words("gulls,boats; nets. Fog!") == ["gulls", "boats", "nets", "Fog"]


def test_several_spaces_and_tabs_between_words():
    assert split_words("  one \t two   three  ") == ["one", "two", "three"]


def test_hyphens_and_slashes_split_words():
    assert split_words("well-known and/or") == ["well", "known", "and", "or"]


def test_digits_are_part_of_words():
    assert split_words("7 boats left at 6am") == ["7", "boats", "left", "at", "6am"]


def test_an_apostrophe_inside_a_word_stays():
    assert split_words("don't touch the keeper's lamp") == ["don't", "touch", "the", "keeper's", "lamp"]


def test_apostrophes_at_the_start_and_the_end_are_dropped():
    assert split_words("'ahoy' the sailors' boat") == ["ahoy", "the", "sailors", "boat"]


def test_apostrophes_alone_are_no_word():
    assert split_words("a ' b '' c") == ["a", "b", "c"]


def test_letters_with_accents_are_letters():
    assert split_words("café, naïve Åland") == ["café", "naïve", "Åland"]


def test_a_word_at_the_very_end_of_the_line():
    assert split_words("last") == ["last"], "the last word ends with the line, not with a space"


def test_an_empty_line_has_no_words():
    assert split_words("") == []


def test_a_line_of_punctuation_has_no_words():
    assert split_words(" ... -- !? ") == []
