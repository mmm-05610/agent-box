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
