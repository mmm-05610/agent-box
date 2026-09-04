"""Reserved per-Execution link facts: set-once immutability, restart
durability, and the Execution-DAG provenance fields.

These facts are provenance only — they never carry cross-Harness
translation semantics (no codec, no derived session content).
"""
from __future__ import annotations

import pytest

from agent_box.protocols.session.failures import (
    ExecutionFactConflict,
    SessionError,
    TurnNotFound,
)
from agent_box.work_core.models import Ref, RefType
from agent_box_session.store import SQLiteSessionStore

from conftest_store import FakeWorkAuthority, _creation_request


def _lease(store, sid, owner="w"):
    return store.acquire_writer_lease(sid, owner)


def _make_turn(store, key: str):
    from conftest_store import _begin

    session = store.create_session(_creation_request(key))
    begin = _begin(store, session.session_id, f"{key}-turn")
    return session.session_id, begin.turn_id, begin.execution_id


def _ws_ref(native: str = "proj-1") -> Ref:
    return Ref(RefType.WORKSPACE, "local-live-workspace", native)


def _native_ref(locator: str) -> Ref:
    return Ref(
        RefType.SESSION,
        "pi-session",
        locator,
        metadata={"harness_type": "pi", "source_provider": "pi"},
    )


def _new_store(tmp_path, name="session-store.db"):
    authority = FakeWorkAuthority()
    store = SQLiteSessionStore(tmp_path / name, callbacks=authority.callbacks())
    return store, authority


def test_workspace_input_fact_recorded_and_set_once(tmp_path):
    store, _ = _new_store(tmp_path)
    sid, turn_id, execution_id = _make_turn(store, "facts-1")
    lease = _lease(store, sid)
    link = store.record_execution_input_facts(
        sid, turn_id, execution_id, lease, workspace_input_ref=_ws_ref()
    )
    assert link.workspace_input_ref == _ws_ref()
    # Identical re-record is idempotent; a different value conflicts.
    again = store.record_execution_input_facts(
        sid, turn_id, execution_id, lease, workspace_input_ref=_ws_ref()
    )
    assert again.workspace_input_ref == _ws_ref()
    with pytest.raises(ExecutionFactConflict):
        store.record_execution_input_facts(
            sid, turn_id, execution_id, lease, workspace_input_ref=_ws_ref("other")
        )
    store.close()


def test_output_native_session_ref_is_set_once_and_immutable(tmp_path):
    store, _ = _new_store(tmp_path)
    sid, turn_id, execution_id = _make_turn(store, "facts-2")
    lease = _lease(store, sid)
    store.record_execution_input_facts(
        sid, turn_id, execution_id, lease, workspace_input_ref=_ws_ref()
    )
    store.record_execution_output_facts(
        sid, turn_id, execution_id, lease,
        output_native_session_ref=_native_ref("loc-1"),
    )
    link = store.execution_link(sid, turn_id, execution_id)
    assert link.output_native_session_ref == _native_ref("loc-1")
    # Same locator: idempotent.  Different locator: provenance conflict.
    store.record_execution_output_facts(
        sid, turn_id, execution_id, lease,
        output_native_session_ref=_native_ref("loc-1"),
    )
    with pytest.raises(ExecutionFactConflict):
        store.record_execution_output_facts(
            sid, turn_id, execution_id, lease,
            output_native_session_ref=_native_ref("loc-2"),
        )
    store.close()


def test_parent_execution_id_and_input_session_ref_round_trip(tmp_path):
    store, _ = _new_store(tmp_path)
    sid, turn_id, execution_id = _make_turn(store, "facts-3")
    lease = _lease(store, sid)
    link = store.record_execution_input_facts(
        sid, turn_id, execution_id, lease,
        parent_execution_id="exec_parent_1",
        input_session_ref=_native_ref("parent-loc"),
    )
    assert link.parent_execution_id == "exec_parent_1"
    assert link.input_session_ref == _native_ref("parent-loc")
    with pytest.raises(ExecutionFactConflict):
        store.record_execution_input_facts(
            sid, turn_id, execution_id, lease,
            parent_execution_id="exec_parent_OTHER",
        )
    store.close()


def test_execution_facts_survive_restart(tmp_path):
    store, authority = _new_store(tmp_path)
    sid, turn_id, execution_id = _make_turn(store, "facts-4")
    lease = _lease(store, sid)
    store.record_execution_input_facts(
        sid, turn_id, execution_id, lease,
        parent_execution_id="exec_parent_9",
        input_session_ref=_native_ref("parent-loc"),
        workspace_input_ref=_ws_ref(),
    )
    store.record_execution_output_facts(
        sid, turn_id, execution_id, lease,
        output_native_session_ref=_native_ref("out-loc"),
        workspace_output_ref=_ws_ref(),
    )
    path, callbacks = store._path, authority.callbacks()
    store.close()

    reopened = SQLiteSessionStore(path, callbacks=callbacks)
    link = reopened.execution_link(sid, turn_id, execution_id)
    assert link.parent_execution_id == "exec_parent_9"
    assert link.input_session_ref == _native_ref("parent-loc")
    assert link.output_native_session_ref == _native_ref("out-loc")
    assert link.workspace_input_ref == _ws_ref()
    assert link.workspace_output_ref == _ws_ref()
    reopened.close()


def test_facts_reject_unknown_execution_and_foreign_lease(tmp_path):
    store, _ = _new_store(tmp_path)
    sid, turn_id, execution_id = _make_turn(store, "facts-5")
    with pytest.raises(TurnNotFound):
        store.execution_link(sid, turn_id, "exec_missing")
    from agent_box.protocols.session.store import WriterLease

    with pytest.raises(SessionError):
        store.record_execution_output_facts(
            sid, turn_id, execution_id,
            lease=WriterLease(sid, "other-writer"),
            workspace_output_ref=_ws_ref(),
        )
    store.close()


# -- Session ownership isolation (D) -----------------------------------------------


def test_cross_session_link_read_is_typed_not_found(tmp_path):
    store_a, _ = _new_store(tmp_path, "a.db")
    sid_a, turn_a, exec_a = _make_turn(store_a, "iso-a")
    store_b, _ = _new_store(tmp_path, "b.db")
    sid_b, turn_b, exec_b = _make_turn(store_b, "iso-b")
    # Session A must not read Session B's link...
    with pytest.raises(TurnNotFound):
        store_a.execution_link(sid_a, turn_b, exec_b)
    # ...nor its own turn id under the wrong session
    with pytest.raises(TurnNotFound):
        store_b.execution_link(sid_b, turn_a, exec_a)
    # correct session still reads normally
    link = store_a.execution_link(sid_a, turn_a, exec_a)
    assert link.execution_id == exec_a
    store_a.close()
    store_b.close()


def test_cross_session_fact_writes_fail_closed(tmp_path):
    store_a, _ = _new_store(tmp_path, "a.db")
    sid_a, turn_a, exec_a = _make_turn(store_a, "iso-wa")
    store_b, _ = _new_store(tmp_path, "b.db")
    sid_b, turn_b, exec_b = _make_turn(store_b, "iso-wb")
    lease_a = _lease(store_a, sid_a)
    lease_b = _lease(store_b, sid_b)
    with pytest.raises(TurnNotFound):
        store_a.record_execution_input_facts(
            sid_a, turn_b, exec_b, lease_a, workspace_input_ref=_ws_ref("a-root")
        )
    with pytest.raises(TurnNotFound):
        store_a.record_execution_output_facts(
            sid_a, turn_b, exec_b, lease_a,
            output_native_session_ref=_native_ref("a-loc"),
        )
    # Session B's facts are untouched by the denied writes
    assert store_b.execution_link(sid_b, turn_b, exec_b).workspace_input_ref is None
    assert store_b.execution_link(sid_b, turn_b, exec_b).output_native_session_ref is None
    # foreign lease + foreign session still fails closed
    foreign_lease = store_a.acquire_writer_lease(sid_a, "w")
    with pytest.raises(SessionError):
        store_b.record_execution_output_facts(
            sid_b, turn_b, exec_b, foreign_lease,
            output_native_session_ref=_native_ref("x"),
        )
    store_a.close()
    store_b.close()


def test_link_isolation_survives_restart(tmp_path):
    from agent_box_session.store import SQLiteSessionStore

    store_a, authority_a = _new_store(tmp_path, "a.db")
    sid_a, turn_a, exec_a = _make_turn(store_a, "iso-r")
    store_a.record_execution_input_facts(
        sid_a, turn_a, exec_a, _lease(store_a, sid_a),
        workspace_input_ref=_ws_ref("secret-root"),
    )
    path, callbacks = store_a._path, authority_a.callbacks()
    store_a.close()

    store_b, _ = _new_store(tmp_path, "b.db")
    sid_b, _, _ = _make_turn(store_b, "iso-r-b")
    store_b.close()

    reopened_a = SQLiteSessionStore(path, callbacks=callbacks)
    # a foreign session id is a typed not-found/ownership failure (here the
    # degenerate cross-database case surfaces as SessionNotFound)
    with pytest.raises(SessionError):
        reopened_a.execution_link(sid_b, turn_a, exec_a)
    reopened_a.close()


# -- set-once multi-field transaction atomicity -------------------------------------


def test_input_facts_multi_field_conflict_rolls_back_completely(tmp_path):
    store, _ = _new_store(tmp_path)
    sid, turn_id, execution_id = _make_turn(store, "atom-1")
    lease = _lease(store, sid)
    # pre-existing conflicting input_session_ref
    store.record_execution_input_facts(
        sid, turn_id, execution_id, lease, input_session_ref=_native_ref("original")
    )
    with pytest.raises(ExecutionFactConflict):
        # parent (new) written first, input ref conflicts second: the whole
        # call must roll back — no partial parent_execution_id write.
        store.record_execution_input_facts(
            sid, turn_id, execution_id, lease,
            parent_execution_id="exec_parent_new",
            input_session_ref=_native_ref("DIFFERENT"),
            workspace_input_ref=_ws_ref(),
        )
    link = store.execution_link(sid, turn_id, execution_id)
    assert link.parent_execution_id is None
    assert link.input_session_ref == _native_ref("original")
    assert link.workspace_input_ref is None
    store.close()


def test_output_facts_multi_field_conflict_rolls_back_completely(tmp_path):
    store, _ = _new_store(tmp_path)
    sid, turn_id, execution_id = _make_turn(store, "atom-2")
    lease = _lease(store, sid)
    # pre-existing workspace output so the SECOND field of the call conflicts
    store.record_execution_output_facts(
        sid, turn_id, execution_id, lease,
        workspace_output_ref=_ws_ref("elsewhere"),
    )
    with pytest.raises(ExecutionFactConflict):
        store.record_execution_output_facts(
            sid, turn_id, execution_id, lease,
            output_native_session_ref=_native_ref("new-out"),  # new field first
            workspace_output_ref=_ws_ref("DIFFERENT"),         # conflicts second
        )
    link = store.execution_link(sid, turn_id, execution_id)
    # the new field must NOT have been partially written; the old one stands
    assert link.output_native_session_ref is None
    assert link.workspace_output_ref == _ws_ref("elsewhere")
    # identical multi-field replay is fully idempotent
    store.record_execution_output_facts(
        sid, turn_id, execution_id, lease,
        output_native_session_ref=_native_ref("new-out"),
        workspace_output_ref=_ws_ref("elsewhere"),
    )
    link = store.execution_link(sid, turn_id, execution_id)
    assert link.output_native_session_ref == _native_ref("new-out")
    assert link.workspace_output_ref == _ws_ref("elsewhere")
    store.close()


def test_input_facts_all_identical_replay_is_idempotent(tmp_path):
    store, _ = _new_store(tmp_path)
    sid, turn_id, execution_id = _make_turn(store, "atom-3")
    lease = _lease(store, sid)
    facts = dict(
        parent_execution_id="exec_p",
        input_session_ref=_native_ref("loc"),
        workspace_input_ref=_ws_ref(),
    )
    store.record_execution_input_facts(sid, turn_id, execution_id, lease, **facts)
    store.record_execution_input_facts(sid, turn_id, execution_id, lease, **facts)
    link = store.execution_link(sid, turn_id, execution_id)
    assert link.parent_execution_id == "exec_p"
    assert link.input_session_ref == _native_ref("loc")
    assert link.workspace_input_ref == _ws_ref()
    store.close()


def test_ref_with_different_uri_conflicts_even_with_same_locator(tmp_path):
    store, _ = _new_store(tmp_path)
    sid, turn_id, execution_id = _make_turn(store, "atom-4")
    lease = _lease(store, sid)
    first = Ref(RefType.SESSION, "pi-session", "loc", metadata={"harness_type": "pi"})
    second = Ref(RefType.SESSION, "pi-session", "loc", uri="file:///other")
    store.record_execution_output_facts(
        sid, turn_id, execution_id, lease, output_native_session_ref=first
    )
    with pytest.raises(ExecutionFactConflict):
        store.record_execution_output_facts(
            sid, turn_id, execution_id, lease, output_native_session_ref=second
        )
    store.close()


def test_atomicity_state_consistent_after_restart(tmp_path):
    from agent_box_session.store import SQLiteSessionStore

    store, authority = _new_store(tmp_path)
    sid, turn_id, execution_id = _make_turn(store, "atom-5")
    lease = _lease(store, sid)
    store.record_execution_input_facts(
        sid, turn_id, execution_id, lease, input_session_ref=_native_ref("keep")
    )
    with pytest.raises(ExecutionFactConflict):
        store.record_execution_input_facts(
            sid, turn_id, execution_id, lease,
            parent_execution_id="p",
            input_session_ref=_native_ref("conflict"),
        )
    path, callbacks = store._path, authority.callbacks()
    store.close()
    reopened = SQLiteSessionStore(path, callbacks=callbacks)
    link = reopened.execution_link(sid, turn_id, execution_id)
    assert link.input_session_ref == _native_ref("keep")
    assert link.parent_execution_id is None
    reopened.close()
