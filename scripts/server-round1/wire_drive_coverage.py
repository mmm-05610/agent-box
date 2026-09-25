#!/usr/bin/env python3
"""Order 103: which registered wire methods are actually driven over the wire.

One scanner, two consumers: `tests/server/test_wire_drive_coverage_103.py` gates
on it, and `docs/server-round1/fullstack/wire-drive-coverage.md` is generated
from it. That is deliberate - a human-maintained ledger of 64 rows is exactly
how order 097's capability table rotted by 37 methods, so here the document is
an output, not an input.

A method counts as *driven* only when a line both names it as an argument to a
request driver (`ok(...)` / `err(...)` / `call(...)` / `_wire(...)` /
`_wire_post(...)` / `post(...)`) **and** lives in a file that posts to
`/wire/v1/`. A bare string in a tuple - a capability list, a param table, the
`FIVE_METHODS` constant - is a name, not a request; that exclusion is the
entire point of the tool.

Usage:
    python3 scripts/server-round1/wire_drive_coverage.py            # table
    python3 scripts/server-round1/wire_drive_coverage.py --check    # exit 1 on gaps
    python3 scripts/server-round1/wire_drive_coverage.py --markdown # ledger body
"""
from __future__ import annotations

import argparse
import ast
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TESTS = ROOT / "tests"
HANDLERS = ROOT / "src/agent_box/server/wire/handlers.py"
#: A request driver: a helper whose body posts to /wire/v1/, or the URL itself.
DRIVER_OPEN = re.compile(r"\b(?:ok|err|call|_wire|_wire_post|post|wire|api_call)\s*\(")
#: How far back a call may open before the line's method literal stops counting
#: as "an argument of a driver". Multi-line call sites are the norm in this repo.
LOOKBEHIND_LINES = 3
EXEMPT_FILE = ROOT / "docs/server-round1/fullstack/wire-drive-exemptions.md"


def _display(path: pathlib.Path) -> str:
    """Repo-relative when it is inside the repo; a temp corpus is shown in full."""
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def dispatch_pairs() -> list[tuple[str, str]]:
    """`(method, handler attribute)` for every row of the dispatch table.

    Order 113's artifact generator needs the handler name too, and it must come
    from the same parse as the coverage ledger: two parsers agreeing twice is
    not evidence, one parser is.
    """
    tree = ast.parse(HANDLERS.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        targets = ()
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AnnAssign):
            targets = [node.target]
        else:
            continue
        if not any(isinstance(t, ast.Attribute) and t.attr == "_handlers" for t in targets):
            continue
        pairs = []
        for key, value in zip(node.value.keys, node.value.values):
            if not (isinstance(key, ast.Constant) and isinstance(key.value, str)):
                continue
            handler = (value.attr if isinstance(value, ast.Attribute)
                       else ast.dump(value))
            pairs.append((key.value, handler))
        return pairs
    raise RuntimeError("no `self._handlers = {...}` literal found")


def param_shapes() -> dict[str, tuple[set, set]]:
    """The Server's own required/optional parameter sets, from the module
    literal `_PARAM_SHAPES`. Same rule as above: parse, do not import."""
    tree = ast.parse(HANDLERS.read_text(encoding="utf-8"))
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else (
            [node.target] if isinstance(node, ast.AnnAssign) else [])
        if any(isinstance(t, ast.Name) and t.id == "_PARAM_SHAPES" for t in targets):
            return {method: (set(required), set(optional)) for method,
                    (required, optional) in ast.literal_eval(node.value).items()}
    raise RuntimeError("no module-level `_PARAM_SHAPES = {...}` literal found")


def dispatch_methods() -> list[str]:
    """The dispatch table's keys, read out of the source with the AST.

    Parsing rather than importing: `WireService.__init__` needs eleven wired
    services to exist at all, and the table it builds is a literal dict. The AST
    takes the keys wherever the line wraps - a regex on indentation silently
    lost 10 of the 64 methods when this tool was first written, which is the
    same failure mode this order exists to close.
    """
    return [method for method, _handler in dispatch_pairs()]


def evidence(method: str, paths=None) -> list[tuple[str, int, str]]:
    """Where a test asks for *this* method inside a request driver's arguments.

    Two accepted shapes: a literal `/wire/v1/<method>` URL, or the method as a
    string on a line that follows (within a few lines) a driver call. A bare
    string in a data literal - a capability tuple, a params table - has no
    driver before it, so it is not evidence; that distinction is this tool.
    """
    literal = f'"{method}"'
    url = f"/wire/v1/{method}"
    found = []
    for path in (sorted(paths) if paths is not None else sorted(TESTS.rglob("*.py"))):
        if "__pycache__" in str(path):
            continue
        text = path.read_text(encoding="utf-8")
        if "/wire/v1/" not in text:
            continue
        lines = text.splitlines()
        for number, line in enumerate(lines, 1):
            start = line.find(literal) if literal in line else line.find(url)
            if start < 0:
                continue
            if url in line:
                found.append((_display(path), number, line.strip()))
                continue
            window = "\n".join(lines[max(0, number - 1 - LOOKBEHIND_LINES):number])
            opened = DRIVER_OPEN.search(window)
            if opened and (window.index("(") <= len(window) - 1):
                after = window[window.rindex("(") + 1:]
                if literal in after or url in after or literal in line:
                    found.append((_display(path), number, line.strip()))
    return found


def exempted() -> dict[str, str]:
    """Methods with a recorded reason instead of a driver: `| method | reason |`."""
    if not EXEMPT_FILE.exists():
        return {}
    rows = {}
    for line in EXEMPT_FILE.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\|\s*((?:[a-zA-Z]+\.)+[a-zA-Z]+)\s*\|\s*(.+?)\s*\|", line)
        if match:
            rows[match.group(1)] = match.group(2)
    return rows


def survey(paths=None) -> tuple[dict[str, list], dict[str, list], dict[str, str]]:
    """(driven, gaps, exemptions). `paths` narrows the corpus - the gate uses it
    to show that a gap is detectable, by hiding a file that holds evidence."""
    methods = dispatch_methods()
    driven = {m: evidence(m, paths) for m in methods}
    covered = {m: hits for m, hits in driven.items() if hits}
    gaps = {m: [] for m in methods if m not in covered and m not in exempted()}
    return covered, gaps, exempted()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()
    covered, gaps, exemptions = survey()
    if args.markdown:
        for method in sorted(set(covered) | set(gaps) | set(exemptions)):
            hits = covered.get(method) or []
            if hits:
                where, line = hits[0][1], hits[0][2]
                yield_text = f"`{hits[0][0]}:{where}` — `{line[:70]}`"
            elif method in exemptions:
                yield_text = f"**豁免**：{exemptions[method]}"
            else:
                yield_text = "**无证据**"
            print(f"| `{method}` | {yield_text} | {len(hits)} |")
        return 0
    print(f"dispatch table: {len(dispatch_methods())} methods | "
          f"driven over the wire: {len(covered)} | exempted: {len(exemptions)} | "
          f"no evidence: {len(gaps)}")
    for method in sorted(gaps):
        print(f"  missing: {method}")
    if args.check:
        return 1 if gaps else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
