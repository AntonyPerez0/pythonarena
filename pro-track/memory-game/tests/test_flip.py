# Step 3: MemoryGame.flip (memorygame/game.py), turns that find a pair.
import pytest

from memorygame.game import FIRST_CARD, IGNORED, MATCH, MemoryGame

# Positions:  0       1        2       3         4        5
CARDS = ["crab", "snail", "crab", "urchin", "snail", "urchin"]


def test_the_first_card_of_a_turn():
    game = MemoryGame(CARDS)
    assert game.flip(0) == FIRST_CARD
    assert game.is_face_up(0) is True
    assert game.is_face_up(1) is False, "only the flipped card turns face up"
    assert game.moves == 0, "one card is not a move yet"


def test_two_cards_that_match():
    game = MemoryGame(CARDS)
    game.flip(0)
    assert game.flip(2) == MATCH, "card 0 and card 2 are both crab"
    assert game.is_matched(0) is True
    assert game.is_matched(2) is True
    assert game.is_face_up(0) and game.is_face_up(2), "a pair stays face up"


def test_a_match_counts_a_move_and_a_pair():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(2)
    assert game.moves == 1
    assert game.pairs_found == 1


def test_the_order_of_the_two_cards_does_not_matter():
    game = MemoryGame(CARDS)
    game.flip(4)
    assert game.flip(1) == MATCH, "card 4 and card 1 are both snail"


def test_the_next_flip_starts_a_new_turn():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(2)
    assert game.flip(1) == FIRST_CARD
    assert game.flip(4) == MATCH
    assert game.moves == 2
    assert game.pairs_found == 2


def test_the_first_card_again_is_ignored():
    game = MemoryGame(CARDS)
    game.flip(0)
    assert game.flip(0) == IGNORED, "a card that is face up can't be flipped"
    assert game.moves == 0, "an ignored flip is not a move"
    assert game.flip(2) == MATCH, "the turn goes on: the next card is still the second one"


def test_a_matched_card_is_ignored():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(2)
    assert game.flip(2) == IGNORED
    assert game.flip(0) == IGNORED
    assert game.moves == 1
    assert game.is_face_up(0) and game.is_matched(0), "a matched card stays as it is"


def test_a_matched_card_in_the_middle_of_a_turn_is_ignored():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(2)
    game.flip(1)
    assert game.flip(0) == IGNORED
    assert game.flip(4) == MATCH, "the turn that began with card 1 goes on"


def test_unflipped_cards_stay_face_down():
    game = MemoryGame(CARDS)
    game.flip(3)
    game.flip(5)
    for position in [0, 1, 2, 4]:
        assert game.is_face_up(position) is False, f"card {position}"


def test_a_position_outside_the_board():
    game = MemoryGame(CARDS)
    with pytest.raises(IndexError):
        game.flip(6)
    with pytest.raises(IndexError):
        game.flip(-1)
    assert game.moves == 0
