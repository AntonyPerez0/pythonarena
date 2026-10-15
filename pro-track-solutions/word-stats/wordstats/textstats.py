"""Counting the lines, characters and words of a text (steps 2 and 3)."""

from wordstats.words import split_words


class TextStats:
    """Counts the lines, characters and words of a text, given one line at a time."""

    def __init__(self, case_sensitive: bool = False):
        """Empty statistics. When case_sensitive is False, words are counted in lower case, so
        "Tide" and "tide" are the same word."""
        self.__case_sensitive = case_sensitive
        self.__lines = 0
        self.__characters = 0
        self.__words = 0
        self.__counts = {}

    def __key(self, word: str) -> str:
        """The word as it is counted: in lower case unless case sensitive."""
        if self.__case_sensitive:
            return word
        return word.lower()

    def add_line(self, line: str):
        """Adds one line of text (without its line break)."""
        self.__lines += 1
        self.__characters += len(line)
        for word in split_words(line):
            key = self.__key(word)
            self.__words += 1
            self.__counts[key] = self.__counts.get(key, 0) + 1

    def line_count(self) -> int:
        """How many lines were added."""
        return self.__lines

    def character_count(self) -> int:
        """How many characters the lines had together, spaces included, line breaks not."""
        return self.__characters

    def word_count(self) -> int:
        """How many words the lines had together."""
        return self.__words

    def distinct_word_count(self) -> int:
        """How many different words the lines had."""
        return len(self.__counts)

    def count_of(self, word: str) -> int:
        """How many times the word appeared (0 if never). Ignores case unless case sensitive."""
        return self.__counts.get(self.__key(word), 0)

    def most_frequent(self, n: int, min_length: int = 1) -> list[tuple[str, int]]:
        """The n most frequent words of at least min_length characters, as (word, count) tuples:
        the most frequent first, words with the same count in alphabetical order. Fewer than n
        when there aren't that many words, and an empty list when n is 0 or less."""
        if n <= 0:
            return []
        pairs = [(word, count) for word, count in self.__counts.items() if len(word) >= min_length]
        # The biggest count first: sort by the count turned negative, then by the word.
        pairs.sort(key=lambda pair: (-pair[1], pair[0]))
        return pairs[:n]

    def add_all(self, other: "TextStats"):
        """Adds everything other counted to these statistics. other doesn't change."""
        self.__lines += other.line_count()
        self.__characters += other.character_count()
        self.__words += other.word_count()
        for word, count in other.__counts.items():
            key = self.__key(word)
            self.__counts[key] = self.__counts.get(key, 0) + count
