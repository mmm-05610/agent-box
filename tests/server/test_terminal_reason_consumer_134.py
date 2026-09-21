"""Work Order 134: the truncation consumer side (122's returned residual).

Two things must hold, and both are driven here:

* the extraction reads a machine-readable stop reason ONLY when the harness
  result actually carries one - absent / clean end_turn / malformed => None, so
  a normal turn behaves byte-identically to before (we never invent a reason);
* when there IS a non-clean reason, `complete_turn` persists it into
  `server_turns.terminal_reason`, which the wire projection already exposes as
  `reason` - so truncation becomes visible on the leg users read.

The Worker still has to EMIT `stopReason` (a separate, approval-gated protocol
change); this order is only the safe consumer that turns it on when it arrives.
"""
from __future__ import annotations

from agent_box.server.execution.sidecar_backend import _terminal_reason_from_result
from agent_box.server.wire.projection import execution_state
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.sessions import SessionRecords
from agent_box.storage import Database


# ---------------------------------------------------------------- extraction (pure)

def test_absent_or_clean_stop_reason_is_none():
    assert _terminal_reason_from_result(None) is None
    assert _terminal_reason_from_result({}) is None                     # field absent
    assert _terminal_reason_from_result({"stopReason": "end_turn"}) is None
    assert _terminal_reason_from_result({"stopReason": "stop"}) is None
    assert _terminal_reason_from_result("not a dict") is None


def test_non_clean_stop_reason_is_surfaced():
    assert _terminal_reason_from_result({"stopReason": "max_tokens"}) == "max_tokens"
    assert _terminal_reason_from_result({"stopReason": "refusal"}) == "refusal"
    assert _terminal_reason_from_result({"stop_reason": "max_turn_requests"}) == "max_turn_requests"


# ---------------------------------------------------------------- write leg (repo)

def _seed(tmp_path):
    root = tmp_path / "data"
    root.mkdir()
    database = Database(root / "db.sqlite3")
    database.initialize()
    # Seed the FK chain (profile -> workspace -> session -> running turn) so the
    # real complete_turn path runs; it only UPDATEs, so FK stays satisfied.
    with database.transaction() as conn:
        conn.execute("INSERT INTO server_profiles(id,name,harness_type,version,"
                     "config_revision,native_generation,config_object_digest,run_state,"
                     "recovery_pending,created_at,updated_at) "
                     "VALUES ('p1','n','codex',1,1,0,'cf','idle',0,'t','t')")
        conn.execute("INSERT INTO server_workspaces(id,connection_id,distribution,"
                     "remote_path,connection_state,version,env_kind,created_at,updated_at) "
                     "VALUES ('ws1','c1','local','/x','ok',1,'wsl','t','t')")
        conn.execute("INSERT INTO server_sessions(id,workspace_id,profile_id,status,"
                     "pinned,version,created_at,updated_at) VALUES ('s1','ws1','p1','ready',0,1,'t','t')")
        conn.execute("INSERT INTO server_turns(id,session_id,profile_id,profile_revision,"
                     "native_generation,state,capture_state,cleanup_state,input_object_digest,"
                     "created_at,updated_at) VALUES "
                     "('t1','s1','p1',1,0,'running','not_started','not_started','sha256:in','t','t')")
    return SessionRecords(database, IdempotentRecords(database)), database


def _terminal(database, turn_id):
    with database.read() as conn:
        return conn.execute("SELECT terminal_reason, state FROM server_turns WHERE id=?",
                            (turn_id,)).fetchone()


def test_complete_turn_persists_a_non_clean_reason(tmp_path):
    records, database = _seed(tmp_path)
    records.complete_turn("t1", checkpoint_object_digest="cp", checkpoint_native_id="n",
                          result_object_digest="res", terminal_reason="max_tokens")
    row = _terminal(database, "t1")
    assert row["state"] == "completed"
    assert row["terminal_reason"] == "max_tokens"      # 134: reason reaches the leg


def test_complete_turn_without_reason_leaves_it_null(tmp_path):
    # Absent stop reason -> terminal_reason stays NULL, exactly as before 134.
    records, database = _seed(tmp_path)
    records.complete_turn("t1", checkpoint_object_digest="cp", checkpoint_native_id="n",
                          result_object_digest="res")
    assert _terminal(database, "t1")["terminal_reason"] is None


# ------------------------------------------- the wire reason (LNX-002)

# I's `control/LNX-003-review.md` item 2 asked for this channel (ACP result -> JS
# pass-through -> the Python dual-spelling read) to be verified on the **wire**
# half as well. The docstring above claims the projection "already exposes [it]
# as `reason`" and nothing drove that claim. These cases close the loop from the
# persisted row through the projection, and they add assertions only: they reuse
# `_seed` / `_terminal` and change no shared fixture, so no other case's meaning
# moves. Scope (item 5): this verifies the *consumer* on the local leg. It does
# not claim real-harness truncation is solved, and an undeclared remote-Worker
# schema is not evidence that this local channel cannot carry the reason.

def test_the_persisted_max_tokens_reason_reaches_the_wire_projection(tmp_path):
    """DB -> projection, end to end: `terminal_reason` becomes the wire `reason`."""
    records, database = _seed(tmp_path)
    records.complete_turn("t1", checkpoint_object_digest="cp", checkpoint_native_id="n",
                          result_object_digest="res", terminal_reason="max_tokens")
    row = _terminal(database, "t1")
    assert row["terminal_reason"] == "max_tokens"        # persisted (134)

    body = execution_state(dict(row))
    assert body["state"] == "completed"
    assert body["reason"] == "max_tokens"                # and visible to the leg


def test_the_end_turn_control_carries_no_reason_on_the_wire(tmp_path):
    """The `end_turn` control, kept at the wire layer: a clean turn claims nothing.

    Without this half, "the reason is exposed" would also be satisfied by a
    projection that invented one for every turn.
    """
    records, database = _seed(tmp_path)
    records.complete_turn("t1", checkpoint_object_digest="cp", checkpoint_native_id="n",
                          result_object_digest="res")
    row = _terminal(database, "t1")

    assert row["terminal_reason"] is None
    assert "reason" not in execution_state(dict(row))


def test_a_cancelled_turn_keeps_its_projected_state_and_gains_no_reason(tmp_path):
    """The existing cancel behaviour, preserved at the projection layer.

    `cancelled` projects as `stopped` - the contract's word - and the truncation
    channel adds no key to it, so switching truncation on cannot retell a user's
    stop as a truncation.
    """
    records, database = _seed(tmp_path)
    records.complete_turn("t1", checkpoint_object_digest="cp", checkpoint_native_id="n",
                          result_object_digest="res")
    with database.transaction() as conn:
        conn.execute("UPDATE server_turns SET state='cancelled' WHERE id='t1'")

    body = execution_state(dict(_terminal(database, "t1")))
    assert body["state"] == "stopped"
    assert "reason" not in body


# ------------------------------- the ACP prompt leg (LNX-002 review, item 5)

# I's item 5 asked for the truncation chain to be driven through the *real* ACP
# prompt return, not just DB -> projection. Driven, and the measurement is the
# finding: the fixture peer DOES answer with a machine-readable `stopReason`, but
# the JS entry's prompt result does not carry it across the boundary, so
# `_terminal_reason_from_result(run.result)` can never see one. `worker-entry.mjs`
# still has to EMIT it - the separate, approval-gated change order 134's own
# docstring names - and this file does not pretend otherwise.
#
# What is pinned here: (a) the ACP side is ready and emits the reason; (b) the JS
# boundary currently drops it, with the exact measured return shape; (c) the
# Python consumer chain is correct for a result that *does* carry it (the cases
# above, plus the unit cases at the top). No real model, and no shared fixture
# default moved: the peer's reason is selected by a per-test env knob whose
# default is the old `end_turn`.

import os  # noqa: E402
import pathlib  # noqa: E402

import pytest  # noqa: E402

from agent_box.server.execution.sidecar import (  # noqa: E402
    LocalProcessLauncher,
    SidecarHarnessPort,
)

REPO = pathlib.Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
SIDECAR_ENTRY = PLUGIN / "runtime" / "worker-entry.mjs"
FAKE_PEER = PLUGIN / "tests" / "harness_remote" / "fake_acp_peer.mjs"


def _isolated_environment(tmp_path, stop_reason=None):
    """The minimal child environment the sidecar tests use, plus the knob."""
    home = tmp_path / "home"
    home.mkdir(exist_ok=True)
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(home),
        "XDG_CONFIG_HOME": str(home / "xdg"),
        "XDG_CACHE_HOME": str(home / "xdg"),
        "XDG_DATA_HOME": str(home / "xdg"),
        "AGENTBOX_SIDECAR_ISOLATED": "1",
    }
    if stop_reason is not None:
        env["AGENTBOX_FIXTURE_STOP_REASON"] = stop_reason
    return env


def _prompt_through_the_fixture_peer(tmp_path, stop_reason=None):
    port = SidecarHarnessPort(
        LocalProcessLauncher(["node", str(SIDECAR_ENTRY)], cwd=str(PLUGIN)),
        environment=_isolated_environment(tmp_path, stop_reason),
        profile="pi",
        adapter={"command": os.environ.get("NODE_BIN", "node"), "args": [str(FAKE_PEER)]},
        state_directory=str(tmp_path / "state"),
        directory=str(tmp_path),
        on_event=lambda *_args: None,
    )
    try:
        port.open_execution("execution-1")
        return port.prompt("execution-1", "component gate")
    finally:
        port.stop()


def test_lnx002_the_fixture_peer_emits_a_machine_readable_stop_reason():
    """(a) The ACP side is ready: the peer answers an ordinary prompt with a
    `stopReason`, and the knob selects a non-clean one without touching the
    special paths. Asserted against the peer source so it cannot rot."""
    source = FAKE_PEER.read_text(encoding="utf-8")

    assert 'const STOP_REASON = process.env.AGENTBOX_FIXTURE_STOP_REASON || "end_turn"' in source
    assert 'pendingCancel ? "cancelled" : STOP_REASON' in source
    # blast radius: the silent-success / permission / abort paths keep their own
    # reason, and the cancel path keeps `cancelled`, whatever the knob says.
    assert source.count('stopReason: "end_turn"') == 4, "a special path moved"
    assert source.count('stopReason: "cancelled"') == 1, "the cancel path moved"


@pytest.mark.skipif(not SIDECAR_ENTRY.is_file(), reason="sidecar entry not built")
def test_lnx002_the_js_prompt_boundary_drops_the_stop_reason_today(tmp_path):
    """(b) The measured gap, with the exact shape.

    This is a *characterisation* case: it asserts what the boundary does now, so
    the day `worker-entry.mjs` starts returning the ACP result this goes red and
    the replacement is "the reason now travels" - a deliberate edit, not a silent
    change. It is also why the consumer chain cannot be end-to-end verified from
    the JS side in this task.
    """
    returned = _prompt_through_the_fixture_peer(tmp_path, "max_tokens")

    assert returned == {"done": True}, returned
    assert _terminal_reason_from_result(returned) is None
    # ...so the reason exists on the ACP side but not in the JS return value.
    assert "stopReason" not in returned


@pytest.mark.skipif(not SIDECAR_ENTRY.is_file(), reason="sidecar entry not built")
def test_lnx002_the_python_consumer_persists_a_reason_it_is_given(tmp_path):
    """(c) With a result that *does* carry the reason, the whole Python leg works:
    the extractor reads it, the real `complete_turn` persists it, and the
    projection exposes it. This is the half I's item 5 can be verified for today.
    """
    result = {"stopReason": "max_tokens"}
    assert _terminal_reason_from_result(result) == "max_tokens"

    records, database = _seed(tmp_path)
    records.complete_turn("t1", checkpoint_object_digest="cp", checkpoint_native_id="n",
                          result_object_digest="res",
                          terminal_reason=_terminal_reason_from_result(result))
    row = _terminal(database, "t1")
    assert row["terminal_reason"] == "max_tokens"
    assert execution_state(dict(row))["reason"] == "max_tokens"

    # the end_turn control on the same leg: clean means nothing is persisted
    second = tmp_path / "second"
    second.mkdir()
    records2, database2 = _seed(second)
    records2.complete_turn("t1", checkpoint_object_digest="cp", checkpoint_native_id="n",
                           result_object_digest="res",
                           terminal_reason=_terminal_reason_from_result({"stopReason": "end_turn"}))
    row2 = _terminal(database2, "t1")
    assert row2["terminal_reason"] is None
    assert "reason" not in execution_state(dict(row2))
