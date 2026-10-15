"""The game's window, with pygame (step 7).

It shows what the MemoryGame says and passes the clicks on to it: the rules themselves are all
in game.py. Most of this file is given ready; step 7 fills in the two TODOs.
"""

import random

import pygame

from memorygame.deck import FOREST, make_deck
from memorygame.game import MemoryGame
from memorygame.status import status_line

# The board: how many cards go in a row, how big a card is and the space around them, in pixels.
COLUMNS = 4
ROWS = (len(FOREST) * 2 + COLUMNS - 1) // COLUMNS
CARD_WIDTH = 120
CARD_HEIGHT = 90
GAP = 12
MARGIN = 20
BOARD_HEIGHT = MARGIN + ROWS * CARD_HEIGHT + (ROWS - 1) * GAP

# The window: the board, and under it a strip with the status line and the "New game" button.
WIDTH = 2 * MARGIN + COLUMNS * CARD_WIDTH + (COLUMNS - 1) * GAP
HEIGHT = BOARD_HEIGHT + 70
NEW_GAME_BUTTON = pygame.Rect(WIDTH - MARGIN - 140, BOARD_HEIGHT + 15, 140, 40)

# Colors, as (red, green, blue) from 0 to 255.
TABLE_COLOR = (34, 49, 39)
TEXT_COLOR = (235, 235, 220)
FACE_DOWN_BACKGROUND = (60, 110, 75)
FACE_DOWN_TEXT = (200, 230, 200)
FACE_UP_BACKGROUND = (250, 245, 230)
MATCHED_BACKGROUND = (120, 130, 120)
MATCHED_TEXT = (200, 205, 200)
BUTTON_COLOR = (90, 140, 105)
# The color of each symbol's word on a face up card (black for a symbol not in the list).
SYMBOL_COLORS = {
    "fox": (215, 95, 20),
    "owl": (125, 85, 50),
    "deer": (170, 120, 60),
    "hare": (110, 110, 125),
    "fern": (50, 140, 60),
    "berry": (190, 30, 70),
    "acorn": (150, 105, 20),
    "pine": (20, 90, 65),
}

# What a face down card shows.
FACE_DOWN = "?"


def new_game() -> MemoryGame:
    """A new game with the forest's symbols, shuffled differently each time."""
    return MemoryGame(make_deck(FOREST, random.Random()))


def card_rect(position: int) -> pygame.Rect:
    """Where the card at the position is in the window."""
    row = position // COLUMNS
    column = position % COLUMNS
    x = MARGIN + column * (CARD_WIDTH + GAP)
    y = MARGIN + row * (CARD_HEIGHT + GAP)
    return pygame.Rect(x, y, CARD_WIDTH, CARD_HEIGHT)


def card_at(point: tuple[int, int], size: int) -> int | None:
    """The position of the card at the point (x, y) of the window, or None if no card is there."""
    for position in range(size):
        if card_rect(position).collidepoint(point):
            return position
    return None


def draw_card(screen: pygame.Surface, font: pygame.font.Font, rect: pygame.Rect, text: str,
              background: tuple[int, int, int], text_color: tuple[int, int, int]):
    """Draws one card: a rectangle with rounded corners and the text in its middle."""
    pygame.draw.rect(screen, background, rect, border_radius=10)
    image = font.render(text, True, text_color)
    screen.blit(image, image.get_rect(center=rect.center))


def draw_status(screen: pygame.Surface, font: pygame.font.Font, text: str):
    """Draws the status line under the board, at the left."""
    image = font.render(text, True, TEXT_COLOR)
    screen.blit(image, image.get_rect(midleft=(MARGIN, NEW_GAME_BUTTON.centery)))


def draw_game(screen: pygame.Surface, card_font: pygame.font.Font, small_font: pygame.font.Font, game: MemoryGame):
    """Draws the cards and the status line as the game is now."""
    for position in range(game.size):
        rect = card_rect(position)
        # TODO: Step 7. Draw the card with draw_card: a matched card shows its symbol with
        #  MATCHED_BACKGROUND and MATCHED_TEXT, a face up card shows its symbol with
        #  FACE_UP_BACKGROUND and its color from SYMBOL_COLORS, and a face down card shows
        #  FACE_DOWN with FACE_DOWN_BACKGROUND and FACE_DOWN_TEXT. This line draws every card
        #  face down for now:
        draw_card(screen, card_font, rect, FACE_DOWN, FACE_DOWN_BACKGROUND, FACE_DOWN_TEXT)
    # TODO: Step 7. Draw the status line with draw_status and status_line(game).


def draw_button(screen: pygame.Surface, font: pygame.font.Font):
    """Draws the "New game" button."""
    draw_card(screen, font, NEW_GAME_BUTTON, "New game", BUTTON_COLOR, TEXT_COLOR)


def main():
    """Opens the window and runs the game until the window is closed."""
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Forest pairs")
    # None is pygame's own font, which is there on every computer.
    card_font = pygame.font.Font(None, 36)
    small_font = pygame.font.Font(None, 28)
    clock = pygame.time.Clock()
    game = new_game()

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                return
            # A click with the left mouse button (button 1).
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                if NEW_GAME_BUTTON.collidepoint(event.pos):
                    game = new_game()
                else:
                    position = card_at(event.pos, game.size)
                    if position is not None:
                        # TODO: Step 7. Flip the card at this position.
                        pass

        screen.fill(TABLE_COLOR)
        draw_game(screen, card_font, small_font, game)
        draw_button(screen, small_font)
        pygame.display.flip()
        clock.tick(30)
