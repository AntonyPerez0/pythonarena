# Step 2: counting lines, characters and words, in TextStats (wordstats/textstats.py).
from wordstats.textstats import TextStats


def stats_of(*lines, case_sensitive=False):
    """A TextStats with these lines added."""
    stats = TextStats(case_sensitive)
    for line in lines:
        stats.add_line(line)
    return stats


def test_new_stats_are_empty():
    stats = TextStats()
    assert stats.line_count() == 0
    assert stats.character_count() == 0
    assert stats.word_count() == 0
    assert stats.distinct_word_count() == 0
    assert stats.count_of("boat") == 0


def test_counts_lines():
    assert stats_of("one", "two", "three").line_count() == 3


def test_an_empty_line_is_a_line_without_words():
    stats = stats_of("boat", "", "gull")
    assert stats.line_count() == 3
    assert stats.word_count() == 2


def test_counts_characters_with_spaces_and_punctuation():
    assert stats_of("Fog, again.", "  x  ").character_count() == 16, "11 characters and 5 characters"


def test_counts_words():
    assert stats_of("The harbor wakes", "before the town does.").word_count() == 7


def test_counts_each_word():
    stats = stats_of("net boat net", "gull net")
    assert stats.count_of("net") == 3
    assert stats.count_of("boat") == 1
    assert stats.count_of("gull") == 1
    assert stats.count_of("pier") == 0, "a word that never appeared"
    assert stats.distinct_word_count() == 3


def test_ignores_case_when_not_case_sensitive():
    stats = stats_of("Tide tide", "TIDE")
    assert stats.count_of("tide") == 3
    assert stats.word_count() == 3
    assert stats.distinct_word_count() == 1


def test_count_of_ignores_case_too():
    stats = stats_of("Tide tide TIDE")
    assert stats.count_of("Tide") == 3, 'count_of("Tide") ignores case, as the counting does'
    assert stats.count_of("TIDE") == 3


def test_case_sensitive_is_false_if_left_out():
    stats = TextStats()
    stats.add_line("Moon moon")
    assert stats.count_of("moon") == 2, "TextStats() is TextStats(False)"


def test_case_sensitive_keeps_the_words_apart():
    stats = stats_of("Tide tide TIDE tide", case_sensitive=True)
    assert stats.distinct_word_count() == 3
    assert stats.count_of("tide") == 2
    assert stats.count_of("Tide") == 1
    assert stats.count_of("TIDE") == 1
    assert stats.count_of("tIdE") == 0


def test_two_stats_do_not_share_their_counts():
    first = stats_of("boat")
    second = stats_of("gull gull")
    assert first.count_of("gull") == 0, "each TextStats has a dictionary of its own (made in __init__)"
    assert second.count_of("boat") == 0
    assert first.word_count() == 1
    assert second.word_count() == 2
