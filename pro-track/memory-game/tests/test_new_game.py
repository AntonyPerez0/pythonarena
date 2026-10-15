# Step 2: a new MemoryGame (memorygame/game.py): __init__, the properties and the questions
# about one card.
import sys

import pytest

from memorygame.game import MemoryGame

# Positions:  0       1        2       3         4        5
CARDS = ["crab", "snail", "crab", "urchin", "snail", "urchin"]


def test_size():
    assert MemoryGame(CARDS).size == 6


def test_pair_count():
    assert MemoryGame(CARDS).pair_count == 3
    assert MemoryGame(["crab", "crab"]).pair_count == 1


def test_nothing_found_yet():
    game = MemoryGame(CARDS)
    assert game.moves == 0
    assert game.pairs_found == 0


def test_the_symbols_in_their_places():
    game = MemoryGame(CARDS)
    for position in range(6):
        assert game.symbol_at(position) == CARDS[position], f"symbol_at({position})"


def test_every_card_is_face_down_and_not_matched():
    game = MemoryGame(CARDS)
    for position in range(6):
        assert game.is_face_up(position) is False, f"is_face_up({position})"
        assert game.is_matched(position) is False, f"is_matched({position})"


def test_the_game_keeps_its_own_copy_of_the_cards():
    cards = ["crab", "snail", "crab", "snail"]
    game = MemoryGame(cards)
    cards[0] = "whale"
    assert game.symbol_at(0) == "crab", "changing the caller's list later doesn't change the game"


def test_the_list_of_cards_does_not_change():
    cards = ["crab", "snail", "crab", "snail"]
    MemoryGame(cards)
    assert cards == ["crab", "snail", "crab", "snail"]


def test_positions_outside_the_board():
    game = MemoryGame(CARDS)
    for position in [6, 100, -1]:
        with pytest.raises(IndexError):
            game.symbol_at(position)
        with pytest.raises(IndexError):
            game.is_face_up(position)
        with pytest.raises(IndexError):
            game.is_matched(position)


def test_refuses_no_cards():
    with pytest.raises(ValueError):
        MemoryGame([])


def test_refuses_a_card_without_its_pair():
    with pytest.raises(ValueError):
        MemoryGame(["crab", "snail", "crab"])


def test_refuses_a_symbol_on_four_cards():
    with pytest.raises(ValueError):
        MemoryGame(["crab", "crab", "crab", "crab"])


def test_refuses_a_symbol_on_three_cards():
    with pytest.raises(ValueError):
        MemoryGame(["crab", "crab", "crab", "snail", "snail", "snail"])


def test_moves_and_pairs_can_not_be_set_from_outside():
    game = MemoryGame(CARDS)
    with pytest.raises(AttributeError):
        game.moves = 5
    with pytest.raises(AttributeError):
        game.pairs_found = 3


def test_two_games_do_not_share_their_cards():
    first = MemoryGame(["crab", "crab"])
    second = MemoryGame(["snail", "snail", "whale", "whale"])
    assert first.size == 2
    assert second.size == 4
    assert first.symbol_at(1) == "crab"


def test_the_rules_do_not_need_pygame():
    import memorygame.deck
    import memorygame.game
    import memorygame.status
    assert "pygame" not in sys.modules, "only window.py imports pygame, so the tests run without a screen"
