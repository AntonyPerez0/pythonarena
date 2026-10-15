"""Reading the command line's arguments (step 5)."""

# What the options are when they aren't given.
DEFAULT_TOP = 10
DEFAULT_MIN_LENGTH = 1


class Options:
    """What the command line asked for. Given ready: you don't need to change it."""

    def __init__(self, files: list[str], top: int = DEFAULT_TOP, min_length: int = DEFAULT_MIN_LENGTH,
                 case_sensitive: bool = False, show_help: bool = False):
        # The names of the files to read, in the order given.
        self.files = files
        # --top N: how many of the most frequent words to show.
        self.top = top
        # --min-length N: words shorter than this are left out of the most frequent ones.
        self.min_length = min_length
        # --case-sensitive: count "Tide" and "tide" as different words.
        self.case_sensitive = case_sensitive
        # -h or --help: show the help text instead of reading files.
        self.show_help = show_help

    def __repr__(self):
        return (f"Options(files={self.files!r}, top={self.top}, min_length={self.min_length}, "
                f"case_sensitive={self.case_sensitive}, show_help={self.show_help})")


def parse_args(args: list[str]) -> Options:
    """Turns the command line's arguments (sys.argv without the program's name) into Options.

    Raises ValueError, with a message that names the option in question, when the arguments are
    wrong: --top or --min-length without a whole number of at least 1 after it, an unknown option,
    or no files (unless -h or --help was given).
    """
    # TODO: Step 5. Go through the arguments with an index, so that --top and --min-length can
    #  take the next one as their number. README.md, step 5, has the rules.
    raise NotImplementedError("parse_args isn't written yet (step 5)")
