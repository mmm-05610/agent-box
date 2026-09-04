"""Official Session Store plugin tests.

Covers: durable session=work saga, idempotency, single-writer lease,
terminal-once, watermark commit semantics, event seq monotonicity, restart
recovery, fault injection crash windows, malformed state fail-closed, and
Catalog discovery as a generic contribution.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from agent_box.extensions.bootstrap import build_extension_environment_from_parts
from agent_box.extensions.catalog import ExtensionCatalogBuilder
from agent_box.extensions.loader import PluginLoadRecord
from agent_box.protocols.session import (
    SESSION_STORE_KIND,
    BindingSnapshot,
    OfficialSessionV1,
    SessionTurnInputV1,
    TerminalOutcome,
    TurnState,
    session_store_contribution,
)
from agent_box.protocols.session.contracts import SESSION_TURN_INPUT_CONTRACT_ID
from agent_box.protocols.session.failures import (
    IdempotencyConflict,
    InvalidCursor,
    MalformedSessionState,
    RecoveryRequired,
    ResyncRequired,
    SessionError,
    SessionNotFound,
    SessionWriterConflict,
    TerminalAlreadyRecorded,
    TurnNotFound,
)
from agent_box.protocols.session.store import (
    SessionCreationRequest,
    TurnBeginRequest,
    WriterLease,
)
from agent_box.work_core.models import Ref, RefType

from agent_box_session.plugin import SessionPlugin
from agent_box_session.provider import SessionInputResourceProvider
from agent_box_session.store import STORE_ID, SQLiteSessionStore, StoreCallbacks, turn_input_ref


def _workspace_ref(native_id: str = "proj-1") -> Ref:
    return Ref(
        RefType.WORKSPACE,
        "local-live-workspace",
        native_id,
        metadata={
            "workspace_mode": "live",
            "mutability": "externally_mutable",
            "input_frozen": "false",
        },
    )


def _creation_request(key: str = "idem-create-1") -> SessionCreationRequest:
    return SessionCreationRequest(
        idempotency_key=key,
        title="Probe session",
        objective="probe objective",
        workspace_ref=_workspace_ref(),
        workspace_mode="live",
        project_identity="proj-1",
    )


class FakeWorkAuthority:
    """In-memory stand-in for the Work Core side of the sagas."""

    def __init__(self) -> None:
        self.works: dict[str, dict] = {}
        self.executions: dict[str, dict] = {}
        self.work_fail_after_create = False
        self.execution_fail_after_create = False

    def create_work(self, work_id: str, objective: str, metadata) -> str:
        self.works[work_id] = {"objective": objective, "metadata": dict(metadata)}
        if self.work_fail_after_create:
            self.work_fail_after_create = False
            raise RuntimeError("simulated crash after work creation")
        return work_id

    def work_exists(self, work_id: str) -> bool:
        return work_id in self.works

    def create_execution(self, work_id: str, turn_id: str, provider_id: str) -> str:
        execution_id = f"exec_{turn_id}"
        self.executions[execution_id] = {
            "work_id": work_id,
            "turn_id": turn_id,
            "provider_id": provider_id,
        }
        if self.execution_fail_after_create:
            self.execution_fail_after_create = False
            raise RuntimeError("simulated crash after execution creation")
        return execution_id

    def callbacks(self) -> StoreCallbacks:
        return StoreCallbacks(
            create_work=self.create_work,
            work_exists=self.work_exists,
            create_execution=self.create_execution,
        )


@pytest.fixture
def store(tmp_path):
    authority = FakeWorkAuthority()
    s = SQLiteSessionStore(tmp_path / "session-store.db", callbacks=authority.callbacks())
    yield s, authority
    s.close()


def _binding(turn_id: str = "") -> BindingSnapshot:
    return BindingSnapshot(
        turn_id=turn_id,
        session_watermark=0,
        harness_provider_id="fake-harness",
        harness_provider_version="1",
        workspace_ref=_workspace_ref(),
        workspace_mode="live",
    )


def _begin(store, session_id: str, key: str, owner: str = "w", text: str = "hello"):
    lease = store.acquire_writer_lease(session_id, owner)
    return store.begin_turn(
        TurnBeginRequest(
            session_id=session_id,
            idempotency_key=key,
            input_text=text,
            binding=_binding(),
        ),
        lease,
    )


# -- session creation saga -------------------------------------------------


def test_create_session_maps_one_session_to_one_work(store):
    s, _ = store
    session = s.create_session(_creation_request())
    assert session.session_id and session.work_id
    assert s.work_id_for(session.session_id) == session.work_id
    assert s.session_id_for_work(session.work_id) == session.session_id
    assert s.session_ref_facts(session.session_id).work_id == session.work_id


def test_session_ref_never_encodes_harness_identity(store):
    s, _ = store
    session = s.create_session(_creation_request())
    ref = s.session_ref_facts(session.session_id).to_ref()
    assert ref.type is RefType.SESSION
    payload = json.dumps(
        {"provider": ref.provider, "native_id": ref.native_id, "metadata": dict(ref.metadata)}
    )
    for brand in ("codex", "claude", "opencode", "hermes", "pi"):
        assert brand not in payload.lower()


def test_create_session_is_idempotent_by_key(store):
    s, authority = store
    first = s.create_session(_creation_request("k1"))
    second = s.create_session(_creation_request("k1"))
    assert first.session_id == second.session_id
    assert first.work_id == second.work_id
    works = [w for w in authority.works if w == first.work_id]
    assert len(works) == 1
    assert len(s.list_sessions()) == 1


def test_different_keys_create_different_sessions(store):
    s, _ = store
    a = s.create_session(_creation_request("a"))
    b = s.create_session(_creation_request("b"))
    assert a.session_id != b.session_id
    assert a.work_id != b.work_id


def test_crash_after_work_creation_recovers_without_duplicate_work(store):
    s, authority = store
    s._fault_hook = lambda step: (
        authority.__setattr__("work_fail_after_create", True)
        if step == "create_session:pre_work"
        else None
    )
    with pytest.raises(RecoveryRequired):
        s.create_session(_creation_request("crash-1"))
    work_count = len(authority.works)
    ops = s.recovery_operations()
    assert ops
    # Recovery is session-scoped: the op must be addressed with the session
    # it is bound to (persisted at INTENT time even before the session row).
    result = s.recover(ops[0].session_id, ops[0].op_id)
    assert result.state == "RESOLVED"
    assert len(authority.works) == max(work_count, 1)
    session = s.create_session(_creation_request("crash-1"))
    assert s.session_id_for_work(session.work_id) == session.session_id


def test_crash_after_work_creation_manual_probe_recovery(store):
    """Recovery rolls forward from a WORK_CREATED crash even when the hook
    swallowed the exception silently and the op stayed pending."""
    s, authority = store
    s.create_session(_creation_request("crash-2"))
    # Simulate a crash between WORK_CREATED and session row creation by
    # rewriting the saga state.
    conn = sqlite3.connect(str(s._path))
    with conn:
        conn.execute(
            "UPDATE session_saga_ops SET state = 'WORK_CREATED' WHERE op_id = 'crash-2'"
        )
        conn.execute("DELETE FROM idempotency_receipts WHERE idempotency_key = 'crash-2'")
        conn.execute("DELETE FROM sessions")
        conn.execute("DELETE FROM session_events")
    conn.close()
    s.close()
    reopened = SQLiteSessionStore(
        s._path, callbacks=authority.callbacks()
    )
    ops = reopened.recovery_operations()
    assert any(op.op_id == "crash-2" for op in ops)
    crash2 = next(op for op in ops if op.op_id == "crash-2")
    recovered = reopened.recover(crash2.session_id, "crash-2")
    assert recovered.state == "RESOLVED"
    session = reopened.get_session(_existing(reopened))
    assert reopened.work_id_for(session.session_id)
    reopened.close()


def _existing(reopened):
    sessions = reopened.list_sessions()
    assert sessions, "recovery must have created the session"
    return sessions[0].session_id


def test_session_not_found_is_typed(store):
    s, _ = store
    with pytest.raises(SessionNotFound):
        s.get_session("missing")


# -- single-writer lease -----------------------------------------------------


def test_second_concurrent_writer_fails_closed(store):
    s, _ = store
    session = s.create_session(_creation_request())
    s.acquire_writer_lease(session.session_id, "writer-1")
    with pytest.raises(SessionWriterConflict):
        s.acquire_writer_lease(session.session_id, "writer-2")


def test_same_owner_reacquire_is_stable(store):
    s, _ = store
    session = s.create_session(_creation_request())
    first = s.acquire_writer_lease(session.session_id, "w")
    second = s.acquire_writer_lease(session.session_id, "w")
    assert second.owner_id == first.owner_id


def test_operations_require_the_lease(store):
    s, _ = store
    session = s.create_session(_creation_request())
    wrong = WriterLease(session.session_id, "not-the-writer")
    with pytest.raises(SessionWriterConflict):
        s.append_event(session.session_id, "PROBE", {}, wrong)
    with pytest.raises(SessionWriterConflict):
        s.begin_turn(
            TurnBeginRequest(
                session_id=session.session_id,
                idempotency_key="k",
                input_text="x",
                binding=_binding(),
            ),
            wrong,
        )


def test_different_sessions_run_in_parallel(store):
    s, _ = store
    a = s.create_session(_creation_request("pa"))
    b = s.create_session(_creation_request("pb"))
    lease_a = s.acquire_writer_lease(a.session_id, "writer-a")
    lease_b = s.acquire_writer_lease(b.session_id, "writer-b")
    s.append_event(a.session_id, "PROBE_A", {}, lease_a)
    s.append_event(b.session_id, "PROBE_B", {}, lease_b)
    types_a = [e.event_type for e in s.transcript(a.session_id)]
    types_b = [e.event_type for e in s.transcript(b.session_id)]
    assert "PROBE_A" in types_a and "PROBE_B" not in types_a
    assert "PROBE_B" in types_b and "PROBE_A" not in types_b


def test_concurrent_lease_acquisition_has_exactly_one_winner(store):
    s, _ = store
    session = s.create_session(_creation_request("race"))
    winners, losers = [], []
    barrier = threading.Barrier(8)

    def attempt(index: int) -> None:
        barrier.wait()
        try:
            s.acquire_writer_lease(session.session_id, f"racer-{index}")
            winners.append(index)
        except SessionWriterConflict:
            losers.append(index)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(attempt, range(8)))
    assert len(winners) == 1
    assert len(losers) == 7


# -- turns ---------------------------------------------------------------------


def test_begin_turn_creates_turn_and_execution(store):
    s, authority = store
    session = s.create_session(_creation_request())
    result = _begin(s, session.session_id, "turn-1")
    assert result.state is TurnState.RUNNING
    assert result.execution_id in authority.executions
    assert not result.replayed
    turn = s.get_turn(session.session_id, result.turn_id)
    assert turn.execution_ids == (result.execution_id,)
    assert turn.binding.harness_provider_id == "fake-harness"


def test_turn_idempotency_key_replay_returns_same_turn(store):
    s, authority = store
    session = s.create_session(_creation_request())
    first = _begin(s, session.session_id, "same-key")
    second = _begin(s, session.session_id, "same-key")
    assert second.replayed
    assert second.turn_id == first.turn_id
    assert second.execution_id == first.execution_id
    assert len(authority.executions) == 1


def test_key_reuse_across_sessions_conflicts(store):
    s, _ = store
    a = s.create_session(_creation_request("sa"))
    b = s.create_session(_creation_request("sb"))
    _begin(s, a.session_id, "dup-key")
    with pytest.raises((IdempotencyConflict, SessionWriterConflict)):
        _begin(s, b.session_id, "dup-key")


def test_receipt_persists_for_exact_lookup(store):
    s, _ = store
    session = s.create_session(_creation_request())
    result = _begin(s, session.session_id, "rc-1")
    receipt = s.get_receipt("rc-1")
    assert receipt["scope"] == "begin_turn"
    assert receipt["turn_id"] == result.turn_id
    assert receipt["execution_id"] == result.execution_id
    assert s.get_receipt("missing") is None


# -- fault injection: turn creation crash window -------------------------------


def test_crash_during_execution_creation_requires_recovery_and_no_fake_terminal(store):
    s, authority = store
    session = s.create_session(_creation_request("fault-turn"))
    s._fault_hook = lambda step: (
        authority.__setattr__("execution_fail_after_create", True)
        if step == "begin_turn:execution"
        else None
    )
    lease = s.acquire_writer_lease(session.session_id, "w")
    with pytest.raises(RecoveryRequired):
        s.begin_turn(
            TurnBeginRequest(
                session_id=session.session_id,
                idempotency_key="fault-key",
                input_text="intent",
                binding=_binding(),
            ),
            lease,
        )
    ops = [op for op in s.recovery_operations(session_id=session.session_id)]
    assert ops, "pending saga must surface as a recovery operation"
    result = s.recover(session.session_id, ops[0].op_id)
    assert result.state in {"RESOLVED", "ROLLED_BACK"}
    # No terminal fact may be fabricated by recovery.
    receipt = s.get_receipt("fault-key")
    if receipt is not None and "turn_id" in receipt:
        turn = s.get_turn(session.session_id, receipt["turn_id"])
        assert turn.terminal_outcome is None
        assert turn.state in {TurnState.RECOVERY_REQUIRED, TurnState.RUNNING}
    # A second writer may not start while the lease is still held.
    with pytest.raises(SessionWriterConflict):
        s.acquire_writer_lease(session.session_id, "other-writer")
    s._fault_hook = None


# -- ledger: seq, terminal-once, watermark --------------------------------------


def test_event_seq_is_monotonic_per_session(store):
    s, _ = store
    session = s.create_session(_creation_request())
    lease = s.acquire_writer_lease(session.session_id, "w")
    seqs = []
    for index in range(5):
        event = s.append_event(session.session_id, f"E{index}", {"i": str(index)}, lease)
        seqs.append(event.seq)
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == 5


def test_event_ids_are_unique(store):
    s, _ = store
    session = s.create_session(_creation_request())
    lease = s.acquire_writer_lease(session.session_id, "w")
    ids = {
        s.append_event(session.session_id, "E", {}, lease).event_id
        for _ in range(20)
    }
    assert len(ids) == 20


def test_terminal_event_is_terminal_once(store):
    s, _ = store
    session = s.create_session(_creation_request())
    result = _begin(s, session.session_id, "t-once")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.SUCCEEDED, lease)
    with pytest.raises(TerminalAlreadyRecorded):
        s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.FAILED, lease)


def test_commit_advances_watermark_exactly_to_committed_batch(store):
    s, _ = store
    session = s.create_session(_creation_request())
    assert s.watermark(session.session_id) == 0
    result = _begin(s, session.session_id, "wm-1")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.SUCCEEDED, lease)
    assert s.watermark(session.session_id) == 0, "watermark must not move before commit"
    committed = s.commit_turn(session.session_id, result.turn_id, lease)
    transcript = s.transcript(session.session_id)
    assert committed == max(e.seq for e in transcript), (
        "watermark must cover the whole committed batch, incl. TURN_COMMITTED"
    )
    assert s.watermark(session.session_id) == committed
    # Replay at the watermark yields nothing and never resyncs.
    assert s.transcript(session.session_id, after_seq=committed) == ()
    assert s.assert_replay_cursor(session.session_id, committed) == committed


def test_commit_requires_recorded_terminal_outcome(store):
    s, _ = store
    session = s.create_session(_creation_request())
    result = _begin(s, session.session_id, "wm-2")
    lease = s.acquire_writer_lease(session.session_id, "w")
    from agent_box.protocols.session.failures import InvalidTurnTransition

    with pytest.raises(InvalidTurnTransition):
        s.commit_turn(session.session_id, result.turn_id, lease)


def test_completed_turn_never_reenters_running(store):
    from agent_box.protocols.session.failures import InvalidTurnTransition

    s, _ = store
    session = s.create_session(_creation_request())
    result = _begin(s, session.session_id, "done-1")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.SUCCEEDED, lease)
    s.commit_turn(session.session_id, result.turn_id, lease)
    # Replay of the completed saga reports the sealed state, never running.
    replay = _begin(s, session.session_id, "done-1")
    assert replay.replayed
    assert replay.state is TurnState.COMPLETED
    # A sealed turn cannot be committed or re-terminated again.
    with pytest.raises(InvalidTurnTransition):
        s.commit_turn(session.session_id, result.turn_id, lease)
    with pytest.raises(InvalidTurnTransition):
        s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.FAILED, lease)
    # The session itself can take a new turn afterwards.
    second = _begin(s, session.session_id, "done-2")
    assert second.state is TurnState.RUNNING
    assert second.turn_id != result.turn_id


def test_transcript_exact_read_and_after_cursor(store):
    s, _ = store
    session = s.create_session(_creation_request())
    lease = s.acquire_writer_lease(session.session_id, "w")
    for index in range(4):
        s.append_event(session.session_id, f"E{index}", {}, lease)
    all_events = s.transcript(session.session_id)
    # seq 1 is the SESSION_CREATED event appended by the creation saga.
    assert [e.seq for e in all_events] == [1, 2, 3, 4, 5]
    tail = s.transcript(session.session_id, after_seq=3)
    assert [e.seq for e in tail] == [4, 5]
    assert s.transcript(session.session_id, after_seq=5) == ()


def test_invalid_cursor_is_typed(store):
    s, _ = store
    session = s.create_session(_creation_request())
    with pytest.raises(InvalidCursor):
        s.transcript(session.session_id, after_seq=-1)
    with pytest.raises(InvalidCursor):
        s.assert_replay_cursor(session.session_id, -5)
    # A cursor beyond the committed watermark must force a resync.
    with pytest.raises(ResyncRequired):
        s.assert_replay_cursor(session.session_id, 99)
    # A cursor within the watermark replays cleanly.
    assert s.assert_replay_cursor(session.session_id, 0) == 0


# -- durability / restart ---------------------------------------------------------


def test_restart_preserves_sessions_turns_events_receipt_watermark(store):
    s, authority = store
    session = s.create_session(_creation_request("restart-1"))
    result = _begin(s, session.session_id, "turn-restart", text="persist me")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.append_event(session.session_id, "OBSERVATION", {"k": "v"}, lease, execution_id=result.execution_id)
    s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.SUCCEEDED, lease)
    committed = s.commit_turn(session.session_id, result.turn_id, lease)
    s.release_writer_lease(session.session_id, "w")
    path, callbacks = s._path, authority.callbacks()
    s.close()

    reopened = SQLiteSessionStore(path, callbacks=callbacks)
    recovered_session = reopened.get_session(session.session_id)
    assert recovered_session.work_id == session.work_id
    assert reopened.watermark(session.session_id) == committed
    turn = reopened.get_turn(session.session_id, result.turn_id)
    assert turn.state is TurnState.COMPLETED
    assert turn.terminal_outcome is TerminalOutcome.SUCCEEDED
    assert turn.committed_watermark == committed
    receipt = reopened.get_receipt("turn-restart")
    assert receipt["turn_id"] == result.turn_id
    transcript = reopened.transcript(session.session_id)
    assert any(e.event_type == "OBSERVATION" for e in transcript)
    reopened.close()


# -- malformed state fail-closed ----------------------------------------------------


def test_malformed_binding_fails_closed(store):
    s, _ = store
    session = s.create_session(_creation_request("corrupt"))
    result = _begin(s, session.session_id, "corrupt-turn")
    conn = sqlite3.connect(str(s._path))
    with conn:
        conn.execute("UPDATE turns SET binding_json = '{not json' WHERE turn_id = ?", (result.turn_id,))
    conn.close()
    with pytest.raises(MalformedSessionState):
        s.get_turn(session.session_id, result.turn_id)


def test_malformed_event_payload_fails_closed(store):
    s, _ = store
    session = s.create_session(_creation_request("corrupt2"))
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.append_event(session.session_id, "E", {}, lease)
    conn = sqlite3.connect(str(s._path))
    with conn:
        conn.execute("UPDATE session_events SET payload_json = '[broken'")
    conn.close()
    with pytest.raises(MalformedSessionState):
        s.transcript(session.session_id)


# -- diagnostics redaction ------------------------------------------------------------


def test_diagnostics_never_leak_paths_or_prompts(store):
    s, _ = store
    session = s.create_session(_creation_request("diag"))
    _begin(s, session.session_id, "diag-turn", text="SUPER-SECRET-PROMPT-CONTENT")
    diagnostics = json.dumps(s.diagnostics())
    assert "SUPER-SECRET-PROMPT-CONTENT" not in diagnostics
    assert str(s._path) not in diagnostics
    assert "session-store.db" not in diagnostics
    data = s.diagnostics()
    assert data["sessions"] == 1
    assert data["turns"] == 1


# -- dispatch input surface -------------------------------------------------------------


def test_turn_input_provider_resolves_frozen_input(store):
    s, _ = store
    session = s.create_session(_creation_request("input"))
    result = _begin(s, session.session_id, "input-turn", text="the user's intent")
    provider = SessionInputResourceProvider(s)
    assert provider.descriptor().id
    value = provider.resolve(SESSION_TURN_INPUT_CONTRACT_ID, turn_input_ref(result.turn_id))
    assert isinstance(value, SessionTurnInputV1)
    assert value.text == "the user's intent"
    assert value.turn_id == result.turn_id


def test_turn_input_provider_fails_closed(store):
    s, _ = store
    provider = SessionInputResourceProvider(s)
    with pytest.raises(ValueError):
        provider.resolve("other.contract@1", turn_input_ref("t"))
    with pytest.raises(TurnNotFound):
        provider.resolve(SESSION_TURN_INPUT_CONTRACT_ID, turn_input_ref("missing"))
    forged = Ref(RefType.SESSION, "not-our-provider", "turn-input:x")
    with pytest.raises(ValueError):
        provider.resolve(SESSION_TURN_INPUT_CONTRACT_ID, forged)


# -- Catalog discovery -------------------------------------------------------------------


def test_store_registers_as_generic_catalog_contribution(tmp_path):
    plugin = SessionPlugin()
    descriptor = plugin.descriptor()
    assert descriptor.api_version == 2
    from agent_box.extensions.api import PluginContext

    context = PluginContext(
        agent_box_version="2.0.0a1",
        agent_box_home=tmp_path / "home",
        plugin_data_dir=tmp_path / "home" / "plugins" / descriptor.id,
    )
    registration = plugin.build(context)
    assert registration.contracts == (SessionTurnInputV1,)
    contribution = session_store_contribution(*[
        c.component for c in registration.contributions
    ])
    assert contribution.descriptor.kind == SESSION_STORE_KIND
    assert contribution.descriptor.component_id == STORE_ID


def test_store_loads_through_canonical_extension_loader(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_BOX_HOME", str(tmp_path / "home"))
    import importlib.metadata

    from agent_box.extensions.api import PluginRegistration

    registration = SessionPlugin().build(
        __import__("agent_box.extensions.api", fromlist=["PluginContext"]).PluginContext(
            agent_box_version="2.0.0a1",
            agent_box_home=tmp_path / "home",
            plugin_data_dir=tmp_path / "home" / "plugins" / "session",
        )
    )
    record = PluginLoadRecord(
        "session",
        "READY",
        SessionPlugin().descriptor(),
        registration,
        None,
        "agent-box-session",
        "2.0.0a1",
    )
    environment = build_extension_environment_from_parts(
        __import__("agent_box.work_core.registry", fromlist=["ExtensionRegistry"]).ExtensionRegistry(),
        PluginLoadReportStub(records=(record,)),
    )
    found = environment.catalog.query(SESSION_STORE_KIND, STORE_ID)
    assert found is not None
    assert found.store_id == STORE_ID


class PluginLoadReportStub:
    def __init__(self, records) -> None:
        self.records = records

    @property
    def ready(self):
        return tuple(r for r in self.records if r.status == "READY")

    @property
    def failed(self):
        return tuple(r for r in self.records if r.status != "READY")
