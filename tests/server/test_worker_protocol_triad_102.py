"""Order 102 (AUD-B-002): the Worker control contract has three faces and all
three must move together - the JSON schema's `op` enum, the `main.rs` dispatch
arms, and the golden request fixtures. The reviewer's finding was that the schema
enum had silently fallen behind the implementation (home.put, workspace.get,
workspace.list, attempt.write, stdin.close were dispatched but undeclared), and
the 099 gate only pinned "implemented == dispatch" inside Rust, so the schema and
golden faces had no guardian.

This test is that guardian. It derives nothing from a fragile Rust parse: a single
reviewed ``WORKER_OPS`` constant is the contract, and the test fails if the schema,
the dispatch source, or the goldens diverge from it. The counter-examples below are
the two ways drift happens (an op removed from the schema; an op declared without a
dispatch arm), so the gate bites rather than merely reading green.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCHEMA = REPO / "protocols" / "worker" / "v1.schema.json"
GOLDEN = REPO / "protocols" / "worker" / "golden"
MAIN_RS = REPO / "workers" / "agent-box-worker" / "src" / "main.rs"

#: The reviewed, authoritative Worker control-plane op set (the contract). Add or
#: remove an op here only together with the schema, the dispatch arm, and a golden.
WORKER_OPS = frozenset({
    "handshake", "heartbeat", "browse", "canonicalize",
    "workspace.get", "workspace.list",
    "view.prepare", "view.put", "view.commit", "view.list", "view.get", "view.cleanup",
    "secret.put", "secret.cleanup",
    "spawn", "observe", "cancel",
    "result.get", "result.ack",
    "attempt.write", "attempt.cleanup", "stdin.close",
    "home.prepare", "home.put", "home.list", "home.get", "home.delete",
})

#: The five that were dispatched but missing from the schema enum (the drift).
NEWLY_DECLARED = frozenset({
    "home.put", "workspace.get", "workspace.list", "attempt.write", "stdin.close",
})


def _schema_ops() -> set[str]:
    document = json.loads(SCHEMA.read_text(encoding="utf-8"))
    return set(document["properties"]["op"]["enum"])


def _main_rs_source() -> str:
    return MAIN_RS.read_text(encoding="utf-8")


def test_schema_enum_is_the_reviewed_contract_set():
    assert _schema_ops() == set(WORKER_OPS), (
        f"schema op enum drifted: missing={set(WORKER_OPS) - _schema_ops()} "
        f"extra={_schema_ops() - set(WORKER_OPS)}")


def test_every_contract_op_is_actually_dispatched_in_the_worker():
    source = _main_rs_source()
    for op in WORKER_OPS:
        assert f'"{op}"' in source, f"{op} is declared but not routed in main.rs"


def test_the_five_previously_undeclared_ops_are_now_in_all_faces():
    schema_ops = _schema_ops()
    source = _main_rs_source()
    golden_ops = _golden_request_ops()
    for op in NEWLY_DECLARED:
        assert op in schema_ops, f"{op} still missing from the schema enum"
        assert f'"{op}"' in source, f"{op} not dispatched in main.rs"
        assert op in golden_ops, f"{op} has no positive golden request"


def test_every_golden_request_uses_a_declared_op():
    """A golden may not exercise an op the contract does not declare (that would
    make the fixture a second, unreviewed source of truth)."""
    schema_ops = _schema_ops()
    for op in _golden_request_ops():
        assert op in schema_ops, f"golden exercises undeclared op {op!r}"


def _golden_request_ops() -> set[str]:
    ops = set()
    for path in GOLDEN.glob("*-request.json"):
        ops.add(json.loads(path.read_text(encoding="utf-8"))["op"])
    return ops


# --- counter-examples: the two drift directions must be caught ---------------

def test_removing_an_op_from_the_schema_would_fail_the_gate():
    """Simulate the drift reintroduced (drop home.put from the enum): the
    contract-equality check goes red. Proves the gate bites on schema regression."""
    document = json.loads(SCHEMA.read_text(encoding="utf-8"))
    document["properties"]["op"]["enum"] = [
        op for op in document["properties"]["op"]["enum"] if op != "home.put"]
    drifted = set(document["properties"]["op"]["enum"])
    assert drifted != set(WORKER_OPS)
    assert "home.put" not in drifted


def test_an_op_declared_without_a_dispatch_arm_would_fail_the_gate():
    """A contract member with no `"<op>"` literal in main.rs must be caught: add a
    synthetic op to the set and assert the presence scan rejects it."""
    fake = set(WORKER_OPS) | {"phantom.op"}
    source = _main_rs_source()
    missing = [op for op in fake if f'"{op}"' not in source]
    assert missing == ["phantom.op"]
