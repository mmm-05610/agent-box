"""Recovery session-isolation tests (two sessions).

Operations of session B must never surface for session A; recover() is
session-bound and fails closed; the isolation holds under concurrency
(barrier-based, never sleep-based).
"""
from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from agent_box.protocols.session.failures import (
    RecoveryRequired,
    RecoveryScopeMismatch,
    SessionError,
)

from agent_box_session.store import SQLiteSessionStore

from conftest_store import FakeWorkAuthority, _creation_request


@pytest.fixture
def env(tmp_path):
    authority = FakeWorkAuthority()
    s = SQLiteSessionStore(tmp_path / "session-store.db", callbacks=authority.callbacks())
    yield s, authority
    s.close()


def _session_pair(s):
    a = s.create_session(_creation_request("iso-a"))
    b = s.create_session(_creation_request("iso-b"))
    return a, b


def _make_pending_turn_op(s, session_id, key):
    lease = s.acquire_writer_lease(session_id, "w-" + key)
    from agent_box.protocols.session.store import TurnBeginRequest

    from conftest_store import _binding

    with pytest.raises(RecoveryRequired):
        s.begin_turn(
            TurnBeginRequest(
                session_id=session_id,
                idempotency_key=key,
                input_text="will fail",
                binding=_binding(),
            ),
            lease,
        )


def test_pending_saga_of_other_session_is_not_listed(env):
    s, authority = env
    a, b = _session_pair(s)
    authority.execution_fail_after_create = True
    _make_pending_turn_op(s, b.session_id, "b-pending")
    ops_a = s.recovery_operations(session_id=a.session_id)
    assert ops_a == ()
    ops_b = s.recovery_operations(session_id=b.session_id)
    assert ops_b and all(op.session_id == b.session_id for op in ops_b)
    everything = s.recovery_operations()
    assert any(op.session_id == b.session_id for op in everything)
    assert all(op.session_id in (a.session_id, b.session_id) for op in everything)


def test_recover_with_wrong_session_scope_fails_closed(env):
    s, authority = env
    a, b = _session_pair(s)
    authority.execution_fail_after_create = True
    _make_pending_turn_op(s, b.session_id, "b-op")
    op_b = next(
        op for op in s.recovery_operations(session_id=b.session_id)
        if op.state == "PENDING_SAGA"
    )
    with pytest.raises(RecoveryScopeMismatch):
        s.recover(a.session_id, op_b.op_id)
    # The other session's operation is untouched: its pending saga entry
    # is still there for B and only for B.
    ops_b = s.recovery_operations(session_id=b.session_id)
    assert any(
        op.op_id == op_b.op_id and op.state == "PENDING_SAGA" for op in ops_b
    )
    assert all(op.session_id == b.session_id for op in ops_b)


def test_recover_requires_a_session_scope(env):
    s, authority = env
    a, b = _session_pair(s)
    authority.execution_fail_after_create = True
    _make_pending_turn_op(s, b.session_id, "b-op2")
    op_b = s.recovery_operations(session_id=b.session_id)[0]
    with pytest.raises(RecoveryScopeMismatch):
        s.recover("", op_b.op_id)
    with pytest.raises(RecoveryScopeMismatch):
        s.recover(None, op_b.op_id)  # type: ignore[arg-type]


def test_recover_unknown_operation_is_typed(env):
    s, _ = env
    a, _ = _session_pair(s)
    with pytest.raises(SessionError):
        s.recover(a.session_id, "op-does-not-exist")
    with pytest.raises(SessionError):
        s.recover(a.session_id, "op-of-a-foreign-store")


def test_recovery_scope_mismatch_does_not_leak_foreign_facts(env):
    s, authority = env
    a, b = _session_pair(s)
    authority.execution_fail_after_create = True
    _make_pending_turn_op(s, b.session_id, "b-op3")
    op_b = next(
        op for op in s.recovery_operations(session_id=b.session_id)
        if op.state == "PENDING_SAGA"
    )
    with pytest.raises(RecoveryScopeMismatch) as excinfo:
        s.recover(a.session_id, op_b.op_id)
    message = str(excinfo.value)
    assert b.session_id not in message
    assert op_b.op_id not in message


def test_operations_stay_isolated_for_their_own_sessions(env):
    s, authority = env
    a, b = _session_pair(s)
    authority.execution_fail_after_create = True
    _make_pending_turn_op(s, a.session_id, "a-pending")
    authority.execution_fail_after_create = True  # one-shot flag: re-arm
    _make_pending_turn_op(s, b.session_id, "b-pending")
    ops_a = [op.op_id for op in s.recovery_operations(session_id=a.session_id)]
    ops_b = [op.op_id for op in s.recovery_operations(session_id=b.session_id)]
    assert ops_a and ops_b
    assert not set(ops_a) & set(ops_b)
    # Each session's recovery resolves only its own operation.
    op_a = next(op for op in s.recovery_operations(session_id=a.session_id)
                if op.state == "PENDING_SAGA")
    resolved = s.recover(a.session_id, op_a.op_id)
    assert resolved.state in {"RESOLVED", "ROLLED_BACK"}
    assert all(op.op_id != op_a.op_id
               for op in s.recovery_operations(session_id=b.session_id))


def test_concurrent_isolation_of_two_sessions(env):
    """Two writers hammer two sessions concurrently; the recovery view of
    each session never contains the other's operations (barrier-gated)."""
    s, authority = env
    a, b = _session_pair(s)
    authority.execution_fail_after_create = True
    _make_pending_turn_op(s, b.session_id, "b-concurrent")
    barrier = threading.Barrier(2)
    violations: list[str] = []

    def scan(session_id, foreign_id):
        barrier.wait()
        for _ in range(50):
            ops = s.recovery_operations(session_id=session_id)
            for op in ops:
                if op.session_id != session_id:
                    violations.append(f"{op.op_id} of {op.session_id} leaked into {session_id}")
            foreign = s.recovery_operations(session_id=foreign_id)
            for op in ops:
                if any(op.op_id == f.op_id for f in foreign):
                    violations.append(f"{op.op_id} visible in both sessions")

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(scan, (a.session_id, b.session_id), (b.session_id, a.session_id)))
    assert violations == []
