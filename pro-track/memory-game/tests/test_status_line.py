# Step 6: status_line, in memorygame/status.py.
import random

from memorygame.deck import FOREST, make_deck
from memorygame.game import MemoryGame
from memorygame.status import status_line

# Positions:  0       1        2       3         4        5
CARDS = ["crab", "snail", "crab", "urchin", "snail", "urchin"]


def test_a_new_game():
    assert status_line(MemoryGame(CARDS)) == "Moves: 0, pairs: 0 of 3"


def test_a_new_game_in_the_forest():
    game = MemoryGame(make_deck(FOREST, random.Random(9)))
    assert status_line(game) == "Moves: 0, pairs: 0 of 8"


def test_moves_and_pairs_while_the_game_goes_on():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(1)
    assert status_line(game) == "Moves: 1, pairs: 0 of 3", "after a mismatch"
    game.flip(0)
    game.flip(2)
    assert status_line(game) == "Moves: 2, pairs: 1 of 3", "after a match"
    game.flip(3)
    assert status_line(game) == "Moves: 2, pairs: 1 of 3", "the first card of a turn is not a move"


def test_a_won_game():
    game = MemoryGame(CARDS)
    for position in [0, 1, 0, 2, 1, 4, 3, 5]:
        game.flip(position)
    assert status_line(game) == "You found all 3 pairs in 4 moves."


def test_a_perfect_game_of_two_pairs():
    game = MemoryGame(["crab", "snail", "snail", "crab"])
    for position in [0, 3, 1, 2]:
        game.flip(position)
    assert status_line(game) == "You found all 2 pairs in 2 moves."


def test_one_pair_says_the_pair_and_one_move():
    game = MemoryGame(["crab", "crab"])
    assert status_line(game) == "Moves: 0, pairs: 0 of 1", "before the flips"
    game.flip(0)
    game.flip(1)
    assert status_line(game) == "You found the pair in 1 move.", "one pair, one move: no plural"


def test_flipping_the_same_card_twice_is_not_a_move():
    game = MemoryGame(["crab", "crab"])
    game.flip(1)
    game.flip(1)
    assert status_line(game) == "Moves: 0, pairs: 0 of 1", "flipping the same card twice is not a move"
