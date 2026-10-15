"""Starts the program when you run python -m wordstats [options] FILE...

Given ready: you don't need to change it.
"""
import sys

from wordstats.program import run

if __name__ == "__main__":
    sys.exit(run(sys.argv[1:]))
