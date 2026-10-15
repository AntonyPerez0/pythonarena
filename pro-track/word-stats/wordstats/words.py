"""Splitting a line of text into words (step 1)."""


def split_words(line: str) -> list[str]:
    """Returns the words of the line, in order, as they are written.

    A word is a run of letters, digits and apostrophes ('). Every other character ends a word.
    Apostrophes at the start or the end of a word are not part of it. For example,
    split_words("'Ahoy', said the keeper's son.") is ["Ahoy", "said", "the", "keeper's", "son"].
    """
    # TODO: Step 1. Go through the line one character at a time, collecting the characters of a
    #  word until a character that doesn't belong to a word comes. README.md, step 1, has the rules.
    raise NotImplementedError("split_words isn't written yet (step 1)")
