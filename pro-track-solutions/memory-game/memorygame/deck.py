"""The cards of a game (step 1)."""

import random

# The eight symbols of the game in the window: each one is on two of its 16 cards.
FOREST = ["fox", "owl", "deer", "hare", "fern", "berry", "acorn", "pine"]


def make_deck(symbols: list[str], rng: random.Random) -> list[str]:
    """A new list with each symbol twice, shuffled with rng. The list symbols doesn't change.

    Raises ValueError if symbols is empty, or if a symbol is in it more than once.
    """
    if len(symbols) == 0:
        raise ValueError("a deck needs at least one symbol")
    if len(set(symbols)) != len(symbols):
        raise ValueError("every symbol must be different: a symbol given twice would be on four cards")
    cards = symbols + symbols
    rng.shuffle(cards)
    return cards
