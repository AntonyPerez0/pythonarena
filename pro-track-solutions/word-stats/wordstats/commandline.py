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


def number_after(args: list[str], index: int) -> int:
    """The whole number of at least 1 that follows the option at args[index]."""
    option = args[index]
    if index + 1 >= len(args):
        raise ValueError(f"{option} needs a whole number after it")
    text = args[index + 1]
    try:
        number = int(text)
    except ValueError:
        raise ValueError(f"{option} needs a whole number, not {text}")
    if number < 1:
        raise ValueError(f"{option} needs a whole number of at least 1, not {text}")
    return number


def parse_args(args: list[str]) -> Options:
    """Turns the command line's arguments (sys.argv without the program's name) into Options.

    Raises ValueError, with a message that names the option in question, when the arguments are
    wrong: --top or --min-length without a whole number of at least 1 after it, an unknown option,
    or no files (unless -h or --help was given).
    """
    options = Options([])
    index = 0
    while index < len(args):
        arg = args[index]
        if arg == "--top":
            options.top = number_after(args, index)
            index += 1
        elif arg == "--min-length":
            options.min_length = number_after(args, index)
            index += 1
        elif arg == "--case-sensitive":
            options.case_sensitive = True
        elif arg in ("-h", "--help"):
            options.show_help = True
        elif arg.startswith("-"):
            raise ValueError(f"unknown option {arg}")
        else:
            options.files.append(arg)
        index += 1
    if not options.files and not options.show_help:
        raise ValueError("no files given: name at least one text file")
    return options
