"""Splitting a line of text into words (step 1)."""


def split_words(line: str) -> list[str]:
    """Returns the words of the line, in order, as they are written.

    A word is a run of letters, digits and apostrophes ('). Every other character ends a word.
    Apostrophes at the start or the end of a word are not part of it. For example,
    split_words("'Ahoy', said the keeper's son.") is ["Ahoy", "said", "the", "keeper's", "son"].
    """
    words = []
    word = ""
    # The space at the end finishes the last word of the line.
    for character in line + " ":
        if character.isalnum() or character == "'":
            word += character
        else:
            word = word.strip("'")
            if word != "":
                words.append(word)
            word = ""
    return words
