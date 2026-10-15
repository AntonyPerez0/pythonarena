# Step 1: make_deck, in memorygame/deck.py.
# The tests shuffle with random.Random(seed): the same seed always gives the same random numbers,
# so the same order of the cards.
import random

import pytest

from memorygame.deck import FOREST, make_deck

SYMBOLS = ["kelp", "pebble", "shell", "gull", "sand", "foam"]


def counts(cards):
    """How many times each card is in the list."""
    result = {}
    for card in cards:
        result[card] = result.get(card, 0) + 1
    return result


def test_two_cards_for_each_symbol():
    cards = make_deck(SYMBOLS, random.Random(7))
    assert len(cards) == 12, "6 symbols give 12 cards"
    assert counts(cards) == {symbol: 2 for symbol in SYMBOLS}


def test_one_symbol_gives_one_pair():
    assert make_deck(["tide"], random.Random(1)) == ["tide", "tide"]


def test_the_forest_makes_sixteen_cards():
    cards = make_deck(FOREST, random.Random(3))
    assert len(cards) == 16, "8 symbols give 16 cards"
    assert set(cards) == set(FOREST)


def test_the_same_seed_gives_the_same_order():
    first = make_deck(SYMBOLS, random.Random(42))
    second = make_deck(SYMBOLS, random.Random(42))
    assert first == second, "shuffle with the rng you are given (rng.shuffle), not with random.shuffle"


def test_the_cards_are_shuffled():
    orders = set()
    for seed in range(20):
        orders.add(tuple(make_deck(SYMBOLS, random.Random(seed))))
    assert len(orders) > 1, "20 different seeds should give more than one order of the cards"


def test_different_seeds_give_different_orders():
    assert make_deck(FOREST, random.Random(1)) != make_deck(FOREST, random.Random(2))


def test_the_symbols_do_not_change():
    symbols = ["kelp", "shell", "gull"]
    make_deck(symbols, random.Random(5))
    assert symbols == ["kelp", "shell", "gull"], "make_deck must not change the list it is given"


def test_a_new_list_each_time():
    symbols = ["kelp", "shell"]
    cards = make_deck(symbols, random.Random(5))
    assert cards is not symbols


def test_refuses_no_symbols():
    with pytest.raises(ValueError):
        make_deck([], random.Random(1))


def test_refuses_a_symbol_given_twice():
    with pytest.raises(ValueError):
        make_deck(["kelp", "shell", "kelp"], random.Random(1))
