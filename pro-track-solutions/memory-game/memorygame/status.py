"""The line of text under the board (step 6)."""

from memorygame.game import MemoryGame


def status_line(game: MemoryGame) -> str:
    """While the game goes on: "Moves: 3, pairs: 2 of 8".
    When it's won: "You found all 8 pairs in 14 moves.", or with one pair,
    "You found the pair in 1 move."
    """
    if not game.is_won():
        return f"Moves: {game.moves}, pairs: {game.pairs_found} of {game.pair_count}"
    moves = "1 move" if game.moves == 1 else f"{game.moves} moves"
    if game.pair_count == 1:
        return f"You found the pair in {moves}."
    return f"You found all {game.pair_count} pairs in {moves}."
