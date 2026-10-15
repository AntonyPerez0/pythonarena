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
        if len(cards) == 0:
            raise ValueError("a game needs at least one pair of cards")
        counts = {}
        for card in cards:
            counts[card] = counts.get(card, 0) + 1
        for symbol, count in counts.items():
            if count != 2:
                raise ValueError(f"every symbol must be on exactly two cards, but {symbol} is on {count}")
        self.__symbols = list(cards)
        self.__face_up = [False] * len(cards)
        self.__matched = [False] * len(cards)
        self.__moves = 0
        self.__pairs_found = 0
        # The first card of the turn that's going on, or None between turns.
        self.__first_card = None
        # The two cards of the last turn when they didn't match, until the next flip hides them.
        self.__mismatch = None

    def __check(self, position: int):
        """Raises IndexError if there's no card at the position (a list would take -1 as the last one)."""
        if position < 0 or position >= len(self.__symbols):
            raise IndexError(f"there is no card at position {position}")

    @property
    def size(self) -> int:
        """How many cards there are."""
        return len(self.__symbols)

    @property
    def pair_count(self) -> int:
        """How many pairs the game has: half the number of cards."""
        return len(self.__symbols) // 2

    @property
    def pairs_found(self) -> int:
        """How many pairs have been found so far."""
        return self.__pairs_found

    @property
    def moves(self) -> int:
        """How many turns have been completed: one move for every second card flipped."""
        return self.__moves

    def symbol_at(self, position: int) -> str:
        """The symbol of the card at the position, whether it's face up or not.

        Raises IndexError if there's no card at the position."""
        self.__check(position)
        return self.__symbols[position]

    def is_face_up(self, position: int) -> bool:
        """Whether the card at the position is face up. Matched cards are face up too.

        Raises IndexError if there's no card at the position."""
        self.__check(position)
        return self.__face_up[position]

    def is_matched(self, position: int) -> bool:
        """Whether the card at the position belongs to a pair that has been found.

        Raises IndexError if there's no card at the position."""
        self.__check(position)
        return self.__matched[position]

    def is_won(self) -> bool:
        """Whether every pair has been found."""
        return self.__pairs_found == self.pair_count

    def flip(self, position: int) -> str:
        """Flips the card at the position, following the rules in README.md (steps 3 to 5), and
        returns what happened: FIRST_CARD, MATCH, NO_MATCH or IGNORED.

        Raises IndexError if there's no card at the position."""
        self.__check(position)
        if self.is_won():
            return IGNORED
        if self.__mismatch is not None:
            first, second = self.__mismatch
            self.__face_up[first] = False
            self.__face_up[second] = False
            self.__mismatch = None
        if self.__face_up[position]:
            return IGNORED
        self.__face_up[position] = True
        if self.__first_card is None:
            self.__first_card = position
            return FIRST_CARD

        first = self.__first_card
        self.__first_card = None
        self.__moves += 1
        if self.__symbols[first] == self.__symbols[position]:
            self.__matched[first] = True
            self.__matched[position] = True
            self.__pairs_found += 1
            return MATCH
        self.__mismatch = (first, position)
        return NO_MATCH
