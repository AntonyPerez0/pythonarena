"""Turning statistics into the text the program prints. Given ready: you don't need to change it."""

from wordstats.textstats import TextStats

# The title of the combined statistics, printed after the files' own when there are two or more.
TOTAL = "total"

# The help text, printed for --help (and after a mistake on the command line).
USAGE = """Usage: python -m wordstats [options] FILE...
Counts the lines, words and characters of text files and lists their most frequent words.

Options:
  --top N           show the N most frequent words (default 10)
  --min-length N    leave words shorter than N characters out of that list (default 1)
  --case-sensitive  count "Tide" and "tide" as different words
  -h, --help        show this help
"""


def format_report(title: str, stats: TextStats, top: int, min_length: int) -> str:
    """The report of one file (or of the total), for example:

    samples/harbor.txt
      lines: 7
      words: 72
      characters: 373
      different words: 52
      most frequent:
            12  the
             3  and
             3  boats

    The text ends with a line break, so print it with print(text, end="").
    """
    lines = [
        title,
        f"  lines: {stats.line_count()}",
        f"  words: {stats.word_count()}",
        f"  characters: {stats.character_count()}",
        f"  different words: {stats.distinct_word_count()}",
    ]
    frequent = stats.most_frequent(top, min_length)
    if not frequent:
        lines.append("  most frequent: none")
    else:
        lines.append("  most frequent:")
        for word, count in frequent:
            lines.append(f"    {count:6}  {word}")
    return "\n".join(lines) + "\n"
