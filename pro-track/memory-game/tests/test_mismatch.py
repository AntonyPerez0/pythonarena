# Step 4: MemoryGame.flip (memorygame/game.py), two cards that don't match.
from memorygame.game import FIRST_CARD, IGNORED, MATCH, NO_MATCH, MemoryGame

# Positions:  0       1        2       3         4        5
CARDS = ["crab", "snail", "crab", "urchin", "snail", "urchin"]


def test_two_different_cards_do_not_match():
    game = MemoryGame(CARDS)
    game.flip(0)
    assert game.flip(1) == NO_MATCH, "crab and snail"
    assert game.is_matched(0) is False
    assert game.is_matched(1) is False


def test_both_cards_stay_face_up_until_the_next_flip():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(1)
    assert game.is_face_up(0) is True, "card 0 stays face up, so the player can see it"
    assert game.is_face_up(1) is True, "card 1 stays face up, so the player can see it"


def test_a_mismatch_is_a_move_but_no_pair():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(1)
    assert game.moves == 1
    assert game.pairs_found == 0


def test_the_next_flip_turns_them_face_down():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(1)
    assert game.flip(3) == FIRST_CARD, "the flip after a mismatch starts a new turn"
    assert game.is_face_up(0) is False, "card 0 should be face down again"
    assert game.is_face_up(1) is False, "card 1 should be face down again"
    assert game.is_face_up(3) is True, "card 3 was just flipped"


def test_flipping_one_of_the_shown_cards_starts_a_turn_with_it():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(1)
    assert game.flip(1) == FIRST_CARD, "card 1 turns face down with card 0, then face up again as a new turn's first card"
    assert game.is_face_up(1) is True
    assert game.is_face_up(0) is False
    assert game.flip(4) == MATCH, "card 4 is the other snail"


def test_flipping_a_matched_card_still_hides_the_mismatch():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(2)
    game.flip(1)
    game.flip(3)
    assert game.flip(0) == IGNORED, "card 0 is matched"
    assert game.is_face_up(1) is False, "any flip hides the last mismatch first"
    assert game.is_face_up(3) is False, "any flip hides the last mismatch first"
    assert game.flip(5) == FIRST_CARD, "the next flip starts a new turn"


def test_matched_cards_stay_face_up_after_a_mismatch():
    game = MemoryGame(CARDS)
    game.flip(0)
    game.flip(2)
    game.flip(1)
    game.flip(3)
    game.flip(4)
    assert game.is_face_up(0) and game.is_face_up(2), "the crab pair was found, so it stays face up"
    assert game.is_matched(0) and game.is_matched(2)


def test_a_card_seen_in_a_mismatch_can_be_matched_later():
    game = MemoryGame(CARDS)
    game.flip(1)
    assert game.flip(3) == NO_MATCH, "snail and urchin"
    game.flip(5)
    assert game.flip(3) == MATCH, "the player remembers where the other urchin was"
    assert game.moves == 2
    assert game.pairs_found == 1


def test_several_mismatches_in_a_row():
    game = MemoryGame(CARDS)
    assert game.flip(0) == FIRST_CARD, "turn 1, first card"
    assert game.flip(1) == NO_MATCH, "turn 1, crab and snail"
    assert game.flip(2) == FIRST_CARD, "turn 2, first card"
    assert game.flip(3) == NO_MATCH, "turn 2, crab and urchin"
    assert game.flip(4) == FIRST_CARD, "turn 3, first card"
    assert game.flip(5) == NO_MATCH, "turn 3, snail and urchin"
    assert game.moves == 3
    assert game.pairs_found == 0
    for position in range(4):
        assert game.is_face_up(position) is False, f"card {position} should be face down again"
    assert game.is_face_up(4) and game.is_face_up(5), "the last turn's two cards are still shown"
