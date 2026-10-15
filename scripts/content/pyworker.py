"""The content build's Python worker: runs programs with src/engine/arena.py on the reference CPython.

scripts/content/python.mjs starts a few of these (one per CPU) and sends one JSON request per line:
{"id": n, "spec": {...}} (arena.run's spec; a given file that isn't text is {"base64": "..."}).
Each answer is one JSON line: {"id": n, "stdout", "stderr", "output", "exit", "truncated", "files",
"callStart", "callError", "loadInput"}; files that aren't text come back as {"base64": "..."}.
Requests run one after another in this one interpreter, as the page's run worker runs them, so the
harness's clean-up between runs is exercised too. When a program runs past the time limit, the
parent kills this process and starts another.
"""

import base64
import json
import os
import sys
import tempfile

# The parent picks the hash seed with PYTHONHASHSEED. Under -E or -I CPython ignores it and picks a
# random one, and the build's check that a program prints the same with both seeds would mean little.
if "PYTHONHASHSEED" in os.environ and sys.flags.ignore_environment:
    sys.exit("pyworker.py: PYTHONHASHSEED is ignored under -E or -I; start the worker without them")

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "engine"))
import arena  # noqa: E402

# The worker's own stdout is the channel to the parent; the programs never see it.
channel = sys.stdout
base = tempfile.mkdtemp(prefix="pyarena-")
count = 0

for line in sys.stdin:
    if not line.strip():
        continue
    request = json.loads(line)
    spec = request["spec"]
    given = {}
    for name, data in (spec.get("given") or {}).items():
        given[name] = base64.b64decode(data["base64"]) if isinstance(data, dict) else data
    spec["given"] = given
    parts = {"stdout": [], "stderr": [], "output": []}

    def sink(stream, text, parts=parts):
        parts[stream].append(text)
        parts["output"].append(text)

    count += 1
    result = arena.run(spec, sink, os.path.join(base, f"run{count}"))
    files = {name: data if isinstance(data, str) else {"base64": base64.b64encode(data).decode("ascii")} for name, data in result["files"].items()}
    answer = {
        "id": request["id"],
        "stdout": "".join(parts["stdout"]),
        "stderr": "".join(parts["stderr"]),
        "output": "".join(parts["output"]),
        "exit": result["exit"],
        "truncated": result["truncated"],
        "files": files,
        "callStart": result["callStart"],
        "callError": result["callError"],
        "loadInput": result["loadInput"],
        "callValue": result["callValue"],
        "repl": result["repl"],
    }
    channel.write(json.dumps(answer) + "\n")
    channel.flush()
