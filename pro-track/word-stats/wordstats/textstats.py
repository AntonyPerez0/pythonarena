"""Counting the lines, characters and words of a text (steps 2 and 3)."""

from wordstats.words import split_words


class TextStats:
    """Counts the lines, characters and words of a text, given one line at a time."""

    def __init__(self, case_sensitive: bool = False):
        """Empty statistics. When case_sensitive is False, words are counted in lower case, so
        "Tide" and "tide" are the same word."""
        # TODO: Step 2. Set up the attributes you need: whether case matters, the counts so far,
        #  and a dictionary from each word to how many times it appeared.
        pass

    def add_line(self, line: str):
        """Adds one line of text (without its line break)."""
        # TODO: Step 2. Count the line, its characters and its words (use split_words).
        raise NotImplementedError("TextStats.add_line isn't written yet (step 2)")

    def line_count(self) -> int:
        """How many lines were added."""
        # TODO: Step 2.
        raise NotImplementedError("TextStats.line_count isn't written yet (step 2)")

    def character_count(self) -> int:
        """How many characters the lines had together, spaces included, line breaks not."""
        # TODO: Step 2.
        raise NotImplementedError("TextStats.character_count isn't written yet (step 2)")

    def word_count(self) -> int:
        """How many words the lines had together."""
        # TODO: Step 2.
        raise NotImplementedError("TextStats.word_count isn't written yet (step 2)")

    def distinct_word_count(self) -> int:
        """How many different words the lines had."""
        # TODO: Step 2.
        raise NotImplementedError("TextStats.distinct_word_count isn't written yet (step 2)")

    def count_of(self, word: str) -> int:
        """How many times the word appeared (0 if never). Ignores case unless case sensitive."""
        # TODO: Step 2.
        raise NotImplementedError("TextStats.count_of isn't written yet (step 2)")

    def most_frequent(self, n: int, min_length: int = 1) -> list[tuple[str, int]]:
        """The n most frequent words of at least min_length characters, as (word, count) tuples:
        the most frequent first, words with the same count in alphabetical order. Fewer than n
        when there aren't that many words, and an empty list when n is 0 or less."""
        # TODO: Step 3. Keep the words that are long enough, sort them with a key, take n.
        raise NotImplementedError("TextStats.most_frequent isn't written yet (step 3)")

    def add_all(self, other: "TextStats"):
        """Adds everything other counted to these statistics. other doesn't change."""
        # TODO: Step 3. Add other's counts to these ones, word by word.
        raise NotImplementedError("TextStats.add_all isn't written yet (step 3)")
