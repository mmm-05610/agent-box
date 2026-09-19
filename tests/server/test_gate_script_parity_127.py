"""Work Order 127: the gate-script parity record must track the real files.

`scripts/server-round1/**` is A-tree owned (QA-004) but this tree carries copies. Two of
them legitimately differ (Order 43/47/108 landed runtime changes; one is runtime-only). The
order's counterexample is a "third form": a script edited into a shape that is neither A's
version nor covered by a recorded justification. QA compares md5s every round; this in-tree
gate makes the record load-bearing: each listed script's on-disk md5 must equal the recorded
`runtime_md5`, and the conclusion must be a registered one. Change a script without updating
the parity doc and this test reddens - which is the divergence being *reported*, not hidden.
"""
from __future__ import annotations

import hashlib
import pathlib
import re

REPO = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = REPO / "scripts" / "server-round1"
RECORD = REPO / "docs" / "server-round1" / "gate-script-parity-127.md"

ALLOWED_CONCLUSIONS = {"normalized", "justified-divergence", "runtime-only"}
_LINE = re.compile(
    r"^(?P<name>[^|\s]+\.py)\s*\|\s*runtime_md5=(?P<md5>[0-9a-f]{32})\s*\|"
    r".*?\|\s*conclusion=(?P<conclusion>[a-z-]+)\s*$"
)


def _fingerprint_rows() -> dict[str, tuple[str, str]]:
    text = RECORD.read_text(encoding="utf-8")
    block = re.search(r"```fingerprint\n(.*?)```", text, re.DOTALL)
    assert block, "the parity record must contain a ```fingerprint block"
    rows: dict[str, tuple[str, str]] = {}
    for raw in block.group(1).splitlines():
        line = raw.strip()
        if not line:
            continue
        match = _LINE.match(line)
        assert match, f"malformed fingerprint line: {raw!r}"
        rows[match.group("name")] = (match.group("md5"), match.group("conclusion"))
    assert rows, "the fingerprint block listed no scripts"
    return rows


def _md5(path: pathlib.Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def test_every_listed_script_matches_its_recorded_md5():
    rows = _fingerprint_rows()
    for name, (recorded, _conclusion) in rows.items():
        script = SCRIPTS / name
        assert script.is_file(), f"listed gate script vanished from the tree: {name}"
        # A "third form" (edited without updating the record) fails right here.
        assert _md5(script) == recorded, (
            f"{name} diverged from its recorded md5 - update the parity justification "
            "in docs/server-round1/gate-script-parity-127.md, do not leave it silent"
        )


def test_every_divergence_conclusion_is_a_registered_one():
    for name, (_md5_value, conclusion) in _fingerprint_rows().items():
        assert conclusion in ALLOWED_CONCLUSIONS, (
            f"{name}: conclusion {conclusion!r} is not a registered reconciliation outcome")


def test_pi_divergence_is_recorded_as_justified_not_silent():
    # The concrete QA-015 fact this order resolves: pi differs from A and is registered.
    rows = _fingerprint_rows()
    assert rows["pi-production-chain-gate.py"][1] == "justified-divergence"


def test_dsh_is_recorded_as_runtime_only(tmp_path):
    # QA-015 called dsh a "common divergence"; first-hand, A's HEAD has no such file.
    rows = _fingerprint_rows()
    assert rows["dsh-production-chain-gate.py"][1] == "runtime-only"
