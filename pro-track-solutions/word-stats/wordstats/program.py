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
    try:
        options = parse_args(args)
    except ValueError as error:
        print(f"word-stats: {error}", file=sys.stderr)
        print(USAGE, end="", file=sys.stderr)
        return 2
    if options.show_help:
        print(USAGE, end="")
        return 0

    total = TextStats(options.case_sensitive)
    files_read = 0
    status = 0
    for name in options.files:
        try:
            stats = read_file(name, options.case_sensitive)
        except FileNotFoundError:
            print(f"word-stats: there's no file {name}", file=sys.stderr)
            status = 1
            continue
        except UnicodeDecodeError:
            print(f"word-stats: {name} isn't UTF-8 text", file=sys.stderr)
            status = 1
            continue
        except OSError as error:
            print(f"word-stats: can't read {name} ({error.strerror})", file=sys.stderr)
            status = 1
            continue
        if files_read > 0:
            print()
        print(format_report(name, stats, options.top, options.min_length), end="")
        total.add_all(stats)
        files_read += 1

    if files_read >= 2:
        print()
        print(format_report(TOTAL, total, options.top, options.min_length), end="")
    return status
