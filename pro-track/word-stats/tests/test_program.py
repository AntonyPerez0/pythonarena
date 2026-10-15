# Step 6: run, in wordstats/program.py: the whole program.
# capsys is one of pytest's fixtures: it catches what the code prints, and capsys.readouterr()
# gives what was printed so far as two strings, out (print) and err (print(..., file=sys.stderr)).
from wordstats.program import run
from wordstats.report import TOTAL, USAGE, format_report
from wordstats.textstats import TextStats


def write(folder, name, text):
    """Writes text into a UTF-8 file in the folder and returns the file's path as a string."""
    file = folder / name
    file.write_text(text, encoding="utf-8")
    return str(file)


def stats_of(*lines, case_sensitive=False):
    """A TextStats with these lines added."""
    stats = TextStats(case_sensitive)
    for line in lines:
        stats.add_line(line)
    return stats


def test_prints_the_report_of_one_file(tmp_path, capsys):
    file = write(tmp_path, "dock.txt", "Boats in the dock.\nThe dock is full.\n")
    assert run([file]) == 0, "the exit status when all goes well"
    out, err = capsys.readouterr()
    assert out == format_report(file, stats_of("Boats in the dock.", "The dock is full."), 10, 1)
    assert "  lines: 2\n" in out
    assert "  words: 8\n" in out
    assert err == "", "nothing goes to sys.stderr when all goes well"


def test_passes_the_options_on(tmp_path, capsys):
    file = write(tmp_path, "fish.txt", "Cod cod COD eel eel a a a a")
    assert run(["--top", "2", "--min-length", "2", "--case-sensitive", file]) == 0
    out, err = capsys.readouterr()
    assert out == format_report(file, stats_of("Cod cod COD eel eel a a a a", case_sensitive=True), 2, 2)
    assert "  eel\n" in out, "with --case-sensitive and --min-length 2, eel is the most frequent"
    assert "  a\n" not in out, "--min-length 2 leaves a out"


def test_prints_each_file_then_the_total(tmp_path, capsys):
    first = write(tmp_path, "first.txt", "net net boat\n")
    second = write(tmp_path, "second.txt", "boat\nquay\n")
    assert run([first, second]) == 0
    out, err = capsys.readouterr()
    first_report = format_report(first, stats_of("net net boat"), 10, 1)
    second_report = format_report(second, stats_of("boat", "quay"), 10, 1)
    total_report = format_report(TOTAL, stats_of("net net boat", "boat", "quay"), 10, 1)
    assert out == first_report + "\n" + second_report + "\n" + total_report, (
        "the reports in the order of the files, then the total, with an empty line between two reports")


def test_the_total_uses_the_case_sensitive_setting(tmp_path, capsys):
    first = write(tmp_path, "upper.txt", "Cod cod\n")
    second = write(tmp_path, "lower.txt", "COD\n")
    assert run(["--case-sensitive", first, second]) == 0
    out, err = capsys.readouterr()
    total = format_report(TOTAL, stats_of("Cod cod", "COD", case_sensitive=True), 10, 1)
    assert out.endswith("\n" + total), "with --case-sensitive, the total counts Cod, cod and COD as three words"


def test_one_file_has_no_total(tmp_path, capsys):
    file = write(tmp_path, "solo.txt", "gull\n")
    run([file])
    out, err = capsys.readouterr()
    assert TOTAL + "\n" not in out, "no total for a single file"


def test_help_prints_the_usage(capsys):
    assert run(["--help"]) == 0
    out, err = capsys.readouterr()
    assert out == USAGE


def test_help_wins_over_files(tmp_path, capsys):
    file = write(tmp_path, "skip.txt", "gull\n")
    assert run([file, "-h"]) == 0
    out, err = capsys.readouterr()
    assert out == USAGE, "with --help, only the help text is printed"


def test_wrong_arguments_give_status_2(capsys):
    assert run(["--top", "zero", "a.txt"]) == 2
    out, err = capsys.readouterr()
    assert "--top" in err, "parse_args's message goes to sys.stderr"
    assert out == "", "nothing goes to the normal output"


def test_no_arguments_give_status_2(capsys):
    assert run([]) == 2
    out, err = capsys.readouterr()
    assert err.strip() != "", "say on sys.stderr what's wrong"


def test_a_missing_file_is_reported_and_the_others_are_still_counted(tmp_path, capsys):
    good = write(tmp_path, "good.txt", "gull gull\n")
    missing = str(tmp_path / "missing.txt")
    assert run([missing, good]) == 1, "the exit status when a file couldn't be read"
    out, err = capsys.readouterr()
    assert "missing.txt" in err, "the message on sys.stderr names the file"
    assert out == format_report(good, stats_of("gull gull"), 10, 1), "the file that could be read, and no total"


def test_a_folder_is_reported(tmp_path, capsys):
    folder = tmp_path / "notes"
    folder.mkdir()
    assert run([str(folder)]) == 1
    out, err = capsys.readouterr()
    assert "notes" in err
    assert out == ""


def test_a_file_that_is_not_utf8_is_reported(tmp_path, capsys):
    file = tmp_path / "latin1.txt"
    file.write_bytes("café\n".encode("latin-1"))
    good = write(tmp_path, "good.txt", "boat\n")
    assert run([str(file), good]) == 1
    out, err = capsys.readouterr()
    assert "latin1.txt" in err
    assert out == format_report(good, stats_of("boat"), 10, 1)


def test_the_total_counts_the_files_that_were_read(tmp_path, capsys):
    first = write(tmp_path, "first.txt", "net\n")
    second = write(tmp_path, "second.txt", "net boat\n")
    missing = str(tmp_path / "missing.txt")
    assert run([first, missing, second]) == 1
    out, err = capsys.readouterr()
    total = format_report(TOTAL, stats_of("net", "net boat"), 10, 1)
    assert out.endswith("\n" + total), "two files were read, so there's a total of those two"
    assert "missing.txt" in err
