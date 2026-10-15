# Step 3: most_frequent and add_all, in TextStats (wordstats/textstats.py).
from wordstats.textstats import TextStats


def stats_of(*lines, case_sensitive=False):
    """A TextStats with these lines added."""
    stats = TextStats(case_sensitive)
    for line in lines:
        stats.add_line(line)
    return stats


def test_the_most_frequent_first():
    stats = stats_of("gull net gull boat gull net")
    assert stats.most_frequent(3) == [("gull", 3), ("net", 2), ("boat", 1)]


def test_the_same_count_in_alphabetical_order():
    stats = stats_of("pier cod anchor cod pier anchor")
    assert stats.most_frequent(3) == [("anchor", 2), ("cod", 2), ("pier", 2)]


def test_at_most_n_words():
    stats = stats_of("f e d c b a")
    assert stats.most_frequent(2) == [("a", 1), ("b", 1)]


def test_fewer_words_than_n():
    assert stats_of("boat boat gull").most_frequent(10) == [("boat", 2), ("gull", 1)]


def test_zero_or_less_gives_an_empty_list():
    stats = stats_of("boat")
    assert stats.most_frequent(0) == []
    assert stats.most_frequent(-3) == []


def test_no_words_gives_an_empty_list():
    assert TextStats().most_frequent(5) == []


def test_min_length_leaves_short_words_out_before_taking_n():
    stats = stats_of("the the the and and boats boats harbor")
    assert stats.most_frequent(2, 4) == [("boats", 2), ("harbor", 1)]


def test_min_length_counts_characters():
    stats = stats_of("cod eel tuna")
    assert stats.most_frequent(5, 3) == [("cod", 1), ("eel", 1), ("tuna", 1)], "cod has 3 characters, enough for 3"
    assert stats.most_frequent(5, 4) == [("tuna", 1)]


def test_words_in_lower_case_when_not_case_sensitive():
    stats = stats_of("Tide TIDE tide Moon")
    assert stats.most_frequent(2) == [("tide", 3), ("moon", 1)]


def test_case_sensitive_words_as_they_are():
    stats = stats_of("cod Cod Cod", case_sensitive=True)
    assert stats.most_frequent(2) == [("Cod", 2), ("cod", 1)]


def test_most_frequent_does_not_change_the_counts():
    stats = stats_of("a a b")
    stats.most_frequent(1)
    assert stats.count_of("b") == 1
    assert stats.distinct_word_count() == 2


def test_add_all_adds_everything():
    total = stats_of("net net boat")
    total.add_all(stats_of("boat", "quay"))
    assert total.line_count() == 3
    assert total.word_count() == 5
    assert total.character_count() == len("net net boat") + len("boat") + len("quay")
    assert total.count_of("boat") == 2
    assert total.count_of("quay") == 1
    assert total.distinct_word_count() == 3
    assert total.most_frequent(3) == [("boat", 2), ("net", 2), ("quay", 1)]


def test_add_all_into_empty_stats():
    total = TextStats()
    total.add_all(stats_of("a b", "c"))
    total.add_all(stats_of("a"))
    assert total.line_count() == 3
    assert total.word_count() == 4
    assert total.count_of("a") == 2


def test_add_all_does_not_change_the_other():
    other = stats_of("gull")
    total = stats_of("gull")
    total.add_all(other)
    assert total.count_of("gull") == 2
    assert other.count_of("gull") == 1, "the other stats don't change"
    assert other.line_count() == 1


def test_after_add_all_the_two_stay_apart():
    other = stats_of("gull")
    total = TextStats()
    total.add_all(other)
    total.add_line("gull gull")
    assert total.count_of("gull") == 3
    assert other.count_of("gull") == 1, "adding to the total must not change the other stats' dictionary"
