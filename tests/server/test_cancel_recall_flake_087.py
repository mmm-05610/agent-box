"""Work Order 087 — the 45-G8 cancel/recall intermittency, made decidable.

Two shapes were recorded against the same gate (docs/implementation/status.md,
the 067/082 ledger rows): the recall turn ending `cancelled`, and the recall turn
ending `completed` with `recallDeltas: []`. Both appeared as 1-in-N, never as a
rule, so the deliverable here is a **rate plus a raw fragment per round**, not a
"not reproduced".

Each round runs `scripts/server-round1/native-home-gate.py --keep` unmodified —
the product path *and* the observation the flake was seen in — and then reads
that run's own durable event log out of the kept SQLite file. The distinction
that matters is recorded per round:

    gateSawNonce        what the gate asserted: its `recallDeltas` carried the
                        round-1 nonce. The gate reads through
                        `SessionRecords.get_session`, whose event window is
                        `ORDER BY seq LIMIT 200` — the *earliest* 200 events,
                        with no truncation reported to the caller
                        (`src/agent_box/server/sessions/repository.py:1012,1024`).
    durableNonceRows    `message.delta` rows carrying the nonce that exist in the
                        session log at all, and their `seq`.

A round with a durable row the gate did not see is "the recall stream was empty"
**without** the input being lost, and `seq > 200` names the reason.

Zero real model calls: the stateful ACP peer answers from its own script.
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
GATE = REPO / "scripts" / "server-round1" / "native-home-gate.py"
RUNS = REPO / "docs/server-round1/fullstack/087-runs"
EVIDENCE = REPO / "docs/server-round1/fullstack/087-cancel-recall-flake.json"
NONCE = "STATEFUL-NONCE-7A21"

#: `native-home-gate.py` composes a local sandbox room; under a PYTHONPATH
#: runtime the sandbox port resolves only through this module (recorded in
#: docs/server-round1/fullstack/native-home-storage.md and
#: usage-parsers-remaining-084.md — without it the gate refuses the workspace
#: open with LOCAL_SANDBOX_UNAVAILABLE, which says nothing about the order).
SANDBOX_MODULE = "agent_box_sandbox_bwrap"
PLUGIN_PATHS = [
    "src",
    "plugins/agent-box-harness/src",
    "plugins/agent-box-runtime-wsl/src",
    "plugins/agent-box-runtime-local/src",
    "plugins/agent-box-sandbox-bwrap/src",
    "plugins/agent-box-skills/src",
    "plugins/agent-box-terminal-session/src",
]


def _gate_environment() -> dict[str, str]:
    environment = dict(os.environ)
    environment["AGENT_BOX_SANDBOX_MODULE"] = SANDBOX_MODULE
    existing = environment.get("PYTHONPATH")
    paths = list(PLUGIN_PATHS) + ([existing] if existing else [])
    environment["PYTHONPATH"] = os.pathsep.join(paths)
    return environment


def _session_ids(database: Path) -> list[str]:
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    try:
        return [row[0] for row in connection.execute("SELECT id FROM server_sessions")]
    finally:
        connection.close()


def _read_window(session_id: str, database: Path) -> dict:
    """The session's durable event log, measured against the gate's read window."""
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    try:
        total, newest = connection.execute(
            "SELECT COUNT(*), COALESCE(MAX(seq),0) FROM server_session_events WHERE session_id=?",
            (session_id,),
        ).fetchone()
        nonce_rows = connection.execute(
            "SELECT turn_id, seq FROM server_session_events "
            "WHERE session_id=? AND kind='message.delta' AND data_json LIKE ? ORDER BY seq",
            (session_id, f"%{NONCE}%"),
        ).fetchall()
        inside = connection.execute(
            "SELECT COUNT(*) FROM (SELECT data_json FROM server_session_events "
            "WHERE session_id=? ORDER BY seq LIMIT 200) WHERE data_json LIKE ?",
            (session_id, f"%{NONCE}%"),
        ).fetchone()[0]
        # The gate indexes turns by position (turns[2] cancel, turns[3] recall,
        # turns[4] retry) while it asserts on an executionId it was handed by
        # `sessions.send`; both are recorded per turn so a shifted position and
        # a mis-attributed delta are told apart rather than inferred.
        turns = connection.execute(
            "SELECT id, state, stop_requested_at, error_code FROM server_turns "
            "WHERE session_id=? ORDER BY created_at, id",
            (session_id,),
        ).fetchall()
        turn_ids = [row[0] for row in turns]
        tail = turn_ids[-3:]
        kinds = connection.execute(
            "SELECT turn_id, kind, seq, data_json FROM server_session_events "
            "WHERE session_id=? AND turn_id IN (%s) ORDER BY seq"
            % ",".join("?" * len(tail)),
            (session_id, *tail),
        ).fetchall()
    finally:
        connection.close()
    return {
        "sessionEvents": total,
        "newestSeq": newest,
        "nonceDeltaRows": [{"turnId": row[0], "seq": row[1]} for row in nonce_rows],
        "nonceDeltasInsideEarliest200": inside,
        "turns": [
            {
                "index": index,
                "id": row[0],
                "state": row[1],
                "stopRequested": bool(row[2]),
                "errorCode": row[3],
                "nonceDeltaSeqs": [
                    entry[1] for entry in nonce_rows if entry[0] == row[0]
                ],
            }
            for index, row in enumerate(turns)
        ],
        "tailEvents": [
            {"turnId": row[0], "kind": row[1], "seq": row[2], "data": row[3][:160]}
            for row in kinds
        ],
    }


def _home_facts(root: Path) -> dict:
    """What the harness's own home says about the reopen and the cancelled input.

    The home is the single source of truth for native session facts, so the
    fixture's own record of how it reopened the native session is the
    first-hand answer to "did the recall resume or silently start fresh".
    """
    profiles = root / "server" / "profiles"
    facts: dict = {}
    if not profiles.is_dir():
        return {"note": f"no profiles root under {profiles.name}"}
    for role in profiles.iterdir():
        if not role.is_dir() or role.name == "_sessions":
            continue
        window = role / "sessions"
        if not window.is_dir():
            continue
        reopen = window / "reopen-method.txt"
        journal = window / "cancel-journal.txt"
        state = window / "native-state.json"
        facts = {
            "role": role.name,
            "reopenMethods": reopen.read_text().split() if reopen.is_file() else None,
            "journalHasWaitForCancel": (
                "wait-for-cancel" in journal.read_text() if journal.is_file() else False
            ),
            "nativeState": (
                json.loads(state.read_text()).get("nonce") if state.is_file() else None
            ),
        }
    return facts or {"note": "no role directory with a sessions window"}


def _one_round(index: int, scratch: Path | None = None) -> dict:
    # The always-in-suite leg (index 0) writes its raw gate report to scratch:
    # it runs on every suite pass, and letting it rewrite committed evidence made
    # `rounds.json` drift under whoever was reading it.
    report = (scratch or RUNS) / f"round-{index:02d}.json"
    started = time.monotonic()
    completed = subprocess.run(
        [sys.executable, str(GATE), "--keep", "--report", str(report)],
        cwd=REPO, env=_gate_environment(), capture_output=True, text=True, timeout=900,
    )
    record: dict = {
        "round": index,
        "seconds": round(time.monotonic() - started, 1),
        "exitCode": completed.returncode,
    }
    if completed.stderr.strip():
        record["stderrTail"] = completed.stderr[-600:]
    try:
        document = json.loads(report.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        record["result"] = f"NO_REPORT:{type(error).__name__}"
        return record
    record["result"] = document.get("result")
    record["code"] = document.get("code")
    record["error"] = (document.get("error") or "")[:400]
    gate_g8 = document.get("g8") or {}
    record["gateSawNonce"] = bool(gate_g8.get("recalledNonce"))
    record["gateG8"] = {
        "cancelOutcome": gate_g8.get("cancelOutcome"),
        "cancelledTurnState": gate_g8.get("cancelledTurnState"),
        "recallDeltas": gate_g8.get("recallDeltas"),
        "nativeIdStable": gate_g8.get("nativeIdStable"),
    }
    root = document.get("temporaryRoot")
    try:
        if root:
            record["temporaryRoot"] = root
            record["sidecarClosedInStderr"] = "SIDECAR_CLOSED" in completed.stderr
            database = Path(root) / "server" / "state" / "agentbox.sqlite"
            if database.is_file():
                # The gate opens exactly one session; the pi seat owns it.
                for session_id in _session_ids(database):
                    window = _read_window(session_id, database)
                    if window["nonceDeltaRows"]:
                        record["readWindow"] = window
                        record["sessionUnderTest"] = session_id
                        break
                else:
                    record["readWindow"] = {"note": "no nonce delta row in any session"}
            record["home"] = _home_facts(Path(root))
    finally:
        if root:
            shutil.rmtree(root, ignore_errors=True)
            record["temporaryRootRemoved"] = not Path(root).exists()
    return record


def _measure(rounds: int) -> tuple[list[dict], dict]:
    observed: list[dict] = []
    try:
        for index in range(1, rounds + 1):
            try:
                observed.append(_one_round(index))
            except Exception as error:  # a broken measurement must not eat the count
                observed.append({"round": index, "result": f"MEASUREMENT_ERROR:{type(error).__name__}",
                                 "error": str(error)[:300]})
            (RUNS / "rounds.json").write_text(
                json.dumps(observed, indent=1, sort_keys=True), encoding="utf-8"
            )
    finally:
        invisible = [
            item["round"] for item in observed
            if item.get("readWindow", {}).get("nonceDeltaRows")
            and not item.get("readWindow", {}).get("nonceDeltasInsideEarliest200")
        ]
        summary = {
            "order": "087",
            "gate": str(GATE.relative_to(REPO)),
            "command": ("AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap PYTHONPATH=... "
                        f"python3 {GATE.relative_to(REPO)} --keep --report <round>"),
            "requestedRounds": rounds,
            "roundsRun": len(observed),
            "gateOk": sum(1 for item in observed if item.get("result") == "NATIVE_HOME_GATE_OK"),
            "gateFailed": sum(1 for item in observed if item.get("result") != "NATIVE_HOME_GATE_OK"),
            "emptyRecallWhileTheRowIsDurable": invisible,
            "secondsPerRound": [item.get("seconds") for item in observed],
            "eventTotals": [item.get("readWindow", {}).get("sessionEvents") for item in observed],
            "realModelRequests": 0,
            "rounds": observed,
        }
        EVIDENCE.write_text(json.dumps(summary, indent=1, sort_keys=True), encoding="utf-8")
    return observed, summary


def test_cancel_recall_flake_087_one_round_keeps_its_durable_facts():
    """The cheap leg, always in the suite: one real round, asserted on the log.

    Deliberately not asserting the gate's verdict — that is the thing 087 found
    broken (the gate reads a turn it never waited for). What must hold is the
    product's F4 promise, measured where it is durable: the cancelled turn's
    input reached the home journal, the recall answer exists as a `message.delta`
    row, and the native session was reopened rather than silently replaced.
    """
    import tempfile
    with tempfile.TemporaryDirectory(prefix="agentbox-087-leg-") as scratch:
        observed = _one_round(0, Path(scratch))
    assert observed.get("result") in {"NATIVE_HOME_GATE_OK", "NATIVE_HOME_GATE_FAILED"}, observed
    window = observed["readWindow"]
    cancelled = [item for item in window["turns"] if item["state"] == "cancelled" and item["stopRequested"]]
    assert cancelled, "no stop-requested cancelled turn: the round never cancelled"
    recalled = [item for item in window["turns"]
                if item["state"] == "completed" and item["nonceDeltaSeqs"]]
    assert recalled, json.dumps(window["turns"])[:800]
    assert observed["home"].get("journalHasWaitForCancel") is True, observed["home"]
    assert observed["home"].get("nativeState") == NONCE, observed["home"]
    assert observed["home"].get("reopenMethods", [])[:1] == ["session/new"], observed["home"]
    assert set(observed["home"].get("reopenMethods", [])[1:]) == {"session/load"}, observed["home"]


def test_cancel_recall_flake_087_cancel_recall_rounds_are_counted():
    """G1: N>=20 real cancel→recall rounds, each with its raw fragment.

    Opt-in because a round is a full 45 gate run (~13 s each, and it rewrites
    the evidence file): the counting leg is driven on purpose, not as a
    side effect of someone running the suite. `AGENTBOX_087_ROUNDS=20`.
    """
    requested = os.environ.get("AGENTBOX_087_ROUNDS")
    if requested is None:
        pytest.skip("counted leg is opt-in: AGENTBOX_087_ROUNDS=20 python3 -m pytest "
                    "tests/server/test_cancel_recall_flake_087.py -q "
                    "(or tests/server/test_cancel_recall_flake_087.py 20); "
                    "the durable-facts leg above always runs")
    rounds = int(requested)
    assert rounds >= 20, "work order 087 requires at least twenty rounds"
    RUNS.mkdir(parents=True, exist_ok=True)
    observed, summary = _measure(rounds)
    failures = [item for item in observed if item.get("result") != "NATIVE_HOME_GATE_OK"]
    assert not failures, json.dumps(failures, indent=1)[:4000]
    assert summary["emptyRecallWhileTheRowIsDurable"] == [], json.dumps(
        [item for item in observed if item["round"] in summary["emptyRecallWhileTheRowIsDurable"]],
        indent=1,
    )[:2000]


if __name__ == "__main__":
    # The same measurement the pytest leg runs, callable directly so a long
    # bounded loop can be driven and tail-followed without a test runner.
    RUNS.mkdir(parents=True, exist_ok=True)
    requested = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("AGENTBOX_087_ROUNDS", "20"))
    measured, aggregated = _measure(requested)
    print(json.dumps({key: value for key, value in aggregated.items() if key != "rounds"},
                     indent=1, sort_keys=True))
    sys.exit(0 if not aggregated["gateFailed"] and not aggregated["emptyRecallWhileTheRowIsDurable"] else 1)
