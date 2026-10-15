"""The cards of a game (step 1)."""

import random

# The eight symbols of the game in the window: each one is on two of its 16 cards.
FOREST = ["fox", "owl", "deer", "hare", "fern", "berry", "acorn", "pine"]


def make_deck(symbols: list[str], rng: random.Random) -> list[str]:
    """A new list with each symbol twice, shuffled with rng. The list symbols doesn't change.

    Raises ValueError if symbols is empty, or if a symbol is in it more than once.
    """
    # TODO: Step 1. Check the symbols, make a list with each one twice, shuffle it with
    #  rng.shuffle and return it.
    raise NotImplementedError("make_deck isn't written yet (step 1)")
