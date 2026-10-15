// Whether a program uses pygame: a line that imports it, alone or in a list (`import pygame`,
// `import sys, pygame`, `import os, pygame as pg`, `import pygame.locals`, `from pygame import ...`).
// The page uses it to show the window, the build to run the program in Pyodide. src/engine/arena.py
// has the same expression, which the run worker uses to load pygame and the harness to start the window.
export const PYGAME_IMPORT = /^[ \t]*(?:import[ \t]+(?:[\w.]+(?:[ \t]+as[ \t]+\w+)?[ \t]*,[ \t]*)*pygame\b|from[ \t]+pygame\b)/m;

/** Whether any of these texts (a program's files) imports pygame. */
export function importsPygame(texts: Iterable<unknown>): boolean {
  for (const t of texts) if (typeof t === "string" && PYGAME_IMPORT.test(t)) return true;
  return false;
}
