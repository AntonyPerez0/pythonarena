# Step 5: MemoryGame.is_won, and flip once the game is won (memorygame/game.py).
import random

import pytest

from memorygame.deck import FOREST, make_deck
from memorygame.game import IGNORED, MATCH, MemoryGame

# Positions:  0       1        2       3         4        5
CARDS = ["crab", "snail", "crab", "urchin", "snail", "urchin"]


def find_all_pairs(game):
    """Plays a perfect game: for each card that isn't matched yet, flips it and its pair."""
    for first in range(game.size):
        if game.is_matched(first):
            continue
        for second in range(first + 1, game.size):
            if game.symbol_at(second) == game.symbol_at(first):
                game.flip(first)
                assert game.flip(second) == MATCH, f"cards {first} and {second} are both {game.symbol_at(first)}"


def test_a_new_game_is_not_won():
    assert MemoryGame(CARDS).is_won() is False


def test_not_won_while_pairs_are_left():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(2)
    game.flip(1)
    game.flip(4)
    assert game.is_won() is False, "one pair is still face down"


def test_won_when_every_pair_is_found():
    game = MemoryGame(CARDS)
    find_all_pairs(game)
    assert game.is_won() is True
    assert game.pairs_found == 3
    assert game.moves == 3


def test_won_after_mistakes_too():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(1)
    game.flip(0)
    game.flip(2)
    game.flip(1)
    game.flip(4)
    game.flip(3)
    game.flip(5)
    assert game.is_won() is True
    assert game.moves == 4


def test_a_game_of_one_pair():
    game = MemoryGame(["crab", "crab"])
    game.flip(1)
    assert game.flip(0) == MATCH
    assert game.is_won() is True


def test_every_flip_is_ignored_once_the_game_is_won():
    game = MemoryGame(CARDS)
    find_all_pairs(game)
    for position in range(6):
        assert game.flip(position) == IGNORED, f"flip({position}) after the game is won"
    assert game.moves == 3, "nothing changes after the game is won"
    assert game.pairs_found == 3


def test_a_position_outside_the_board_after_the_game_is_won():
    game = MemoryGame(CARDS)
    find_all_pairs(game)
    with pytest.raises(IndexError):
        game.flip(6)


def test_a_whole_game_with_a_shuffled_deck():
    game = MemoryGame(make_deck(FOREST, random.Random(2026)))
    assert game.size == 16
    find_all_pairs(game)
    assert game.is_won() is True
    assert game.moves == 8, "a perfect game of 8 pairs takes 8 moves"
    for position in range(16):
        assert game.is_matched(position), f"card {position} is matched at the end"
