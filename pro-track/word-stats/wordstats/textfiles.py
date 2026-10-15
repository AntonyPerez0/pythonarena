"""Reading a text file into a TextStats (step 4)."""

from wordstats.textstats import TextStats


def read_file(path: str, case_sensitive: bool = False) -> TextStats:
    """Reads the UTF-8 text file at path, one line at a time, and returns its statistics.

    Raises the error open() or reading raises when the file can't be read: FileNotFoundError
    when there's no such file, UnicodeDecodeError when it isn't UTF-8 text, and so on.
    """
    # TODO: Step 4. Make a TextStats, open the file with encoding="utf-8", add each line
    #  without its line break, and return the statistics. Let any error through.
    raise NotImplementedError("read_file isn't written yet (step 4)")
