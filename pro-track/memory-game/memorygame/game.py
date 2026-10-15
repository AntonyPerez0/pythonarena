"""The rules of the memory game (steps 2 to 5)."""

# What a flip did: flip returns one of these.
FIRST_CARD = "first card"  # the first card of a turn was turned face up
MATCH = "match"            # the second card of a turn showed the same symbol: a pair was found
NO_MATCH = "no match"      # the second card of a turn showed another symbol
IGNORED = "ignored"        # nothing happened: the card was face up already, or the game is won


class MemoryGame:
    """The rules of a memory game. The cards lie face down at positions 0, 1, 2 and so on. Each
    turn, the player flips two cards: if they show the same symbol, they stay face up; if not,
    they turn face down again at the next flip. The game is won when every pair has been found.

    This class knows nothing about windows or pygame, so the tests can play it without a screen.
    """

    def __init__(self, cards: list[str]):
        """A new game with the given cards, all face down: cards[0] is the symbol at position 0.
        The list isn't changed, and changing it later doesn't change the game.

        Raises ValueError if cards is empty, or if some symbol isn't on exactly two cards.
        """
        # TODO: Step 2. Check the cards and set up the attributes: the cards' symbols, which
        #  cards are face up and which are matched, the moves and pairs so far, and (for steps 3
        #  and 4) what you need to remember between flips.
        pass

    @property
    def size(self) -> int:
        """How many cards there are."""
        # TODO: Step 2.
        raise NotImplementedError("MemoryGame.size isn't written yet (step 2)")

    @property
    def pair_count(self) -> int:
        """How many pairs the game has: half the number of cards."""
        # TODO: Step 2.
        raise NotImplementedError("MemoryGame.pair_count isn't written yet (step 2)")

    @property
    def pairs_found(self) -> int:
        """How many pairs have been found so far."""
        # TODO: Step 2.
        raise NotImplementedError("MemoryGame.pairs_found isn't written yet (step 2)")

    @property
    def moves(self) -> int:
        """How many turns have been completed: one move for every second card flipped."""
        # TODO: Step 2.
        raise NotImplementedError("MemoryGame.moves isn't written yet (step 2)")

    def symbol_at(self, position: int) -> str:
        """The symbol of the card at the position, whether it's face up or not.

        Raises IndexError if there's no card at the position."""
        # TODO: Step 2.
        raise NotImplementedError("MemoryGame.symbol_at isn't written yet (step 2)")

    def is_face_up(self, position: int) -> bool:
        """Whether the card at the position is face up. Matched cards are face up too.

        Raises IndexError if there's no card at the position."""
        # TODO: Step 2.
        raise NotImplementedError("MemoryGame.is_face_up isn't written yet (step 2)")

    def is_matched(self, position: int) -> bool:
        """Whether the card at the position belongs to a pair that has been found.

        Raises IndexError if there's no card at the position."""
        # TODO: Step 2.
        raise NotImplementedError("MemoryGame.is_matched isn't written yet (step 2)")

    def is_won(self) -> bool:
        """Whether every pair has been found."""
        # TODO: Step 5.
        raise NotImplementedError("MemoryGame.is_won isn't written yet (step 5)")

    def flip(self, position: int) -> str:
        """Flips the card at the position, following the rules in README.md (steps 3 to 5), and
        returns what happened: FIRST_CARD, MATCH, NO_MATCH or IGNORED.

        Raises IndexError if there's no card at the position."""
        # TODO: Steps 3, 4 and 5.
        raise NotImplementedError("MemoryGame.flip isn't written yet (step 3)")
