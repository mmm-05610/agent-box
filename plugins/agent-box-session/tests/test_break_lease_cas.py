"""break_writer_lease compare-and-set matrix.

Every break attempt is CAS-validated against the current lease owner, the
expected turn's existence in THIS session, and the session's running turn.
Every attempt records a session-bound recovery operation.
"""
from __future__ import annotations

import pytest

from agent_box.protocols.session.failures import (
    SessionNotFound,
    SessionWriterConflict,
    TurnNotFound,
)

from agent_box_session.store import SQLiteSessionStore

from conftest_store import FakeWorkAuthority, _begin, _creation_request


@pytest.fixture
def env(tmp_path):
    authority = FakeWorkAuthority()
    s = SQLiteSessionStore(tmp_path / "session-store.db", callbacks=authority.callbacks())
    yield s, authority
    s.close()


def _break_lease_ops(s, session_id):
    return [op for op in s.recovery_operations(session_id=session_id)
            if op.kind == "break_lease"]


def test_owner_breaks_own_lease(env):
    s, _ = env
    session = s.create_session(_creation_request("bl-1"))
    s.acquire_writer_lease(session.session_id, "w1")
    s.break_writer_lease(
        session.session_id, reason="stale", expected_owner_id="w1"
    )
    # Lease is gone and the break is journaled RESOLVED, bound to the session.
    lease = s.acquire_writer_lease(session.session_id, "w2")
    assert lease.owner_id == "w2"
    ops = _break_lease_ops(s, session.session_id)
    assert len(ops) == 1
    assert ops[0].state == "RESOLVED"
    assert ops[0].session_id == session.session_id


def test_break_with_wrong_owner_fails_closed_and_never_deletes(env):
    s, _ = env
    session = s.create_session(_creation_request("bl-2"))
    s.acquire_writer_lease(session.session_id, "real-owner")
    with pytest.raises(SessionWriterConflict):
        s.break_writer_lease(
            session.session_id, reason="attack", expected_owner_id="imposter"
        )
    # The lease is still held by the real owner.
    with pytest.raises(SessionWriterConflict):
        s.acquire_writer_lease(session.session_id, "third-party")
    # A rejected break attempt breaks nothing and journals no break.
    assert _break_lease_ops(s, session.session_id) == []


def test_break_requires_expected_owner_id(env):
    s, _ = env
    session = s.create_session(_creation_request("bl-3"))
    s.acquire_writer_lease(session.session_id, "w1")
    with pytest.raises(SessionWriterConflict):
        s.break_writer_lease(session.session_id, reason="r", expected_owner_id="")
    with pytest.raises(SessionWriterConflict):
        s.break_writer_lease(session.session_id, reason="r", expected_owner_id=None)  # type: ignore[arg-type]


def test_break_with_unknown_expected_turn_fails_closed(env):
    s, _ = env
    session = s.create_session(_creation_request("bl-4"))
    s.acquire_writer_lease(session.session_id, "w1")
    with pytest.raises(TurnNotFound):
        s.break_writer_lease(
            session.session_id, reason="r",
            expected_owner_id="w1", expected_turn_id="turn_missing",
        )
    # Lease untouched.
    with pytest.raises(SessionWriterConflict):
        s.acquire_writer_lease(session.session_id, "w2")


def test_break_blocked_while_a_different_turn_is_running(env):
    s, _ = env
    session = s.create_session(_creation_request("bl-5"))
    other_session = s.create_session(_creation_request("bl-5-other"))
    other_turn = _begin(s, other_session.session_id, "bl-5-other-turn")
    result = _begin(s, session.session_id, "bl-5-turn")
    lease_owner = "w"
    # No expected turn: a running turn blocks the break entirely.
    with pytest.raises(SessionWriterConflict):
        s.break_writer_lease(
            session.session_id, reason="r", expected_owner_id=lease_owner
        )
    # A turn of ANOTHER session is not in this session: typed not-found.
    with pytest.raises(TurnNotFound):
        s.break_writer_lease(
            session.session_id, reason="r", expected_owner_id=lease_owner,
            expected_turn_id=other_turn.turn_id,
        )
    # Naming the actually running turn makes the break safe and allowed.
    s.break_writer_lease(
        session.session_id, reason="r", expected_owner_id=lease_owner,
        expected_turn_id=result.turn_id,
    )
    s.acquire_writer_lease(session.session_id, "recovery-writer")


def test_break_with_no_lease_is_idempotent_and_still_journaled(env):
    s, _ = env
    session = s.create_session(_creation_request("bl-6"))
    s.break_writer_lease(
        session.session_id, reason="nothing to break", expected_owner_id="ghost"
    )
    ops = _break_lease_ops(s, session.session_id)
    assert len(ops) == 1 and ops[0].state == "RESOLVED"
    # The session is immediately writable by a fresh writer.
    s.acquire_writer_lease(session.session_id, "w-next")


def test_break_requires_existing_session(env):
    s, _ = env
    with pytest.raises(SessionNotFound):
        s.break_writer_lease(
            "sess_missing", reason="r", expected_owner_id="w"
        )


def test_break_isolated_between_sessions(env):
    s, _ = env
    a = s.create_session(_creation_request("bl-a"))
    b = s.create_session(_creation_request("bl-b"))
    s.acquire_writer_lease(a.session_id, "owner-a")
    s.acquire_writer_lease(b.session_id, "owner-b")
    # A's break attempt validated against B's owner cannot succeed: the CAS
    # compares against A's actual lease holder.
    with pytest.raises(SessionWriterConflict):
        s.break_writer_lease(
            a.session_id, reason="r", expected_owner_id="owner-b"
        )
    s.break_writer_lease(a.session_id, reason="r", expected_owner_id="owner-a")
    # B's lease is untouched by A's break.
    with pytest.raises(SessionWriterConflict):
        s.acquire_writer_lease(b.session_id, "intruder")
    assert _break_lease_ops(s, a.session_id)
    assert _break_lease_ops(s, b.session_id) == []
