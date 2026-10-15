"""The program: python -m wordstats [options] FILE... (step 6)."""

import sys

from wordstats.commandline import parse_args
from wordstats.report import TOTAL, USAGE, format_report
from wordstats.textfiles import read_file
from wordstats.textstats import TextStats


def run(args: list[str]) -> int:
    """Runs the program with the command line's arguments (sys.argv without the program's name).

    Prints the reports with print(), and the error messages with print(..., file=sys.stderr).
    Returns the exit status: 0 when all went well, 1 when a file couldn't be read, 2 when the
    arguments were wrong.
    """
    # TODO: Step 6. Parse the arguments, read each file and print its report with format_report,
    #  then the total when two or more files were read. README.md, step 6, has the details.
    raise NotImplementedError("run isn't written yet (step 6)")
