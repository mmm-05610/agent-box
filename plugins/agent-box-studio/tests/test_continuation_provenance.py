"""Studio-level continuation & provenance enforcement tests.

Covers the four acceptance-counterexamples:

- native continuation consumes EXACTLY the source Execution's persisted
  ``output_native_session_ref`` (never a re-derived locator);
- ``parent_execution_id`` names the Execution that actually produced the
  consumed native session (never ``execution_ids[0]`` by luck);
- cross-Harness continuation is typed-fail-closed (no re-wrapping);
- output provenance write failures are never swallowed (the run can never
  commit with missing or conflicting provenance).
"""
from __future__ import annotations

from dataclasses import dataclass as _dataclass
from typing import Any, Mapping

import pytest

from agent_box.extensions.bootstrap import build_extension_environment
from agent_box.protocols.session.failures import (
    ExecutionFactConflict,
    SessionError,
    SessionWriterConflict,
)
from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.db import _reset_connection_for_tests
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor
from agent_box_studio.service import (
    BindingVerificationError,
    CrossHarnessContinuationUnsupported,
    StudioService,
)
from agent_box_studio.testing import (
    FAKE_PROVIDER_ID,
    FakeTurnObservation,
    FakeTurnExecutionProvider,
)

STUB_CONTRACT = "agent-box.stub-continuation@1"
STUB_RESOLVER_ID = "stub-continuation"


@_dataclass(frozen=True)
class StubContinuationV1:
    contract_id: Any = STUB_CONTRACT
    session_id: str = ""

    def __post_init__(self) -> None:
        if not self.session_id:
            raise ValueError("stub continuation session_id is required")


class _StubContinuationResolver:
    provider_id = STUB_RESOLVER_ID
    supported_contract_ids = frozenset({STUB_CONTRACT})

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Stub continuation", "1")

    def resolve(self, contract_id, ref, *, context=None):
        del context
        if contract_id != STUB_CONTRACT or ref.provider != STUB_RESOLVER_ID:
            raise ValueError("CONTINUATION_REF_MISMATCH")
        return StubContinuationV1(session_id=ref.native_id)


class _LocatorObservation(FakeTurnObservation):
    """Legacy-shape observation carrying a native session locator."""

    def __init__(self, event_type, payload, session_locator):
        super().__init__(event_type, payload)
        self.session_locator = session_locator


class ContinuationStubProvider(FakeTurnExecutionProvider):
    """Fake execution provider with an honest continuation surface.

    Emits a session observation (with locator) on every poll and the
    terminal result on the second poll, so the output-ref recording path is
    exercised at least twice (idempotent set-once).
    """

    def __init__(
        self,
        *,
        provider_id: str,
        harness: str,
        locator: str = "stub-loc-1",
        ref_error: Exception | None = None,
    ) -> None:
        super().__init__()
        self._provider_id = provider_id
        self._harness = harness
        self._locator = locator
        self._ref_error = ref_error
        self.seen_contract_ids: list[list[str]] = []
        self._observe_calls = 0

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self._provider_id, "Stub harness", "1")

    @property
    def harness_type(self) -> str:
        return self._harness

    def input_limits(self) -> Mapping[str, Any]:
        limits = dict(super().input_limits())
        limits[STUB_CONTRACT] = (0, 1)
        return limits

    def continuation_contract_id(self):
        return STUB_CONTRACT

    def continuation_ref(self, locator, *, extra_metadata=None):
        if self._ref_error is not None:
            raise self._ref_error
        return Ref(
            RefType.SESSION,
            STUB_RESOLVER_ID,
            locator,
            metadata={"harness_type": self._harness},
        )

    def start(self, request):
        self.seen_contract_ids.append(
            [item.contract_id for item in request.resolved_inputs]
        )
        return super().start(request)

    def observe(self, native_ref: Any):
        self._observe_calls += 1
        observations: list[FakeTurnObservation] = [
            _LocatorObservation(
                "execution.session", {"origin_harness": self._harness}, self._locator
            )
        ]
        if self._observe_calls >= 2:
            observations.append(
                FakeTurnObservation("TURN_RESULT", {"outcome": "succeeded"})
            )
        return tuple(observations)


def _build(tmp_path, monkeypatch, *providers) -> tuple[StudioService, Any, Any]:
    home = tmp_path / "agent-box-home"
    home.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    _reset_connection_for_tests()
    environment = build_extension_environment()
    environment.registry.register_contract(StubContinuationV1)
    environment.registry.register_resource_provider(_StubContinuationResolver())
    for provider in providers:
        environment.registry.register_execution_provider(provider)
    store = environment.catalog.query("agent-box.session.store@1", "official-session-store")
    workspace = next(
        p for p in environment.registry.resource_providers()
        if p.descriptor().id == "local-live-workspace"
    )
    from agent_box.work_core.repository import CoreRepository

    service = StudioService(
        store, workspace, environment.registry, CoreRepository(),
        worker_mode="inline", turn_timeout_seconds=30, poll_interval=0.01,
    )
    return service, store, environment


def _project(tmp_path, name="project") -> str:
    root = tmp_path / name
    root.mkdir(parents=True, exist_ok=True)
    (root / "README.md").write_text("demo\n")
    return str(root)


def _run_turn(service, sid, key, **kwargs):
    """Submit one turn; with the inline worker the run has finished by the
    time submit returns, so refresh the acceptance snapshot to the current
    durable state."""
    payload = service.submit_turn(
        sid, idempotency_key=key, input_text="work", **kwargs
    )
    turn = service._store.get_turn(sid, payload["turn_id"])
    payload["state"] = turn.state.value
    payload["terminal_outcome"] = (
        turn.terminal_outcome.value if turn.terminal_outcome else None
    )
    return payload


def _insert_link_row(store, turn_id: str, execution_id: str) -> None:
    """White-box: add a Turn↔Execution link row (link_execution refuses
    terminal turns; the test target is the service's authority selection)."""
    from datetime import datetime, timezone as _tz

    conn = store._connection()
    with conn:
        conn.execute(
            "INSERT INTO turn_executions (turn_id, execution_id, linked_at) VALUES (?, ?, ?)",
            (turn_id, execution_id, datetime.now(_tz.utc).isoformat()),
        )


def _record_ref(store, sid, turn_id, execution_id, locator, harness):
    """Record a set-once output Ref on an existing link (normal API)."""
    lease = store.acquire_writer_lease(sid, "ref-writer")
    try:
        store.record_execution_output_facts(
            sid, turn_id, execution_id, lease,
            output_native_session_ref=Ref(
                RefType.SESSION, STUB_RESOLVER_ID, locator,
                metadata={"harness_type": harness},
            ),
        )
    finally:
        store.release_writer_lease(sid, "ref-writer")


def insert_uncommitted_attempt(store, sid, turn_id, execution_id, locator, harness="alpha"):
    """White-box: register an ADDITIONAL attempt that owns an output Ref
    but is NOT the committed run authority (stale/uncommitted/injected)."""
    _insert_link_row(store, turn_id, execution_id)
    _record_ref(store, sid, turn_id, execution_id, locator, harness)


def set_committed_execution(store, sid, turn_id, locator, harness="alpha"):
    """White-box: give the ALREADY-COMMITTED run execution its output Ref.

    The committed authority is ``turn_runs.execution_id`` — this helper
    never changes that pointer; it only records the Ref on it.
    """
    run = store.turn_run(turn_id)
    assert run.execution_id, "fixture requires a committed run with an execution id"
    _record_ref(store, sid, turn_id, run.execution_id, locator, harness)
    return run.execution_id


def point_committed_run_at(store, turn_id, execution_id):
    """White-box: repoint the committed run authority (incl. at executions
    that do not belong to the turn — the misauthority counterexample)."""
    conn = store._connection()
    with conn:
        conn.execute(
            "UPDATE turn_runs SET execution_id = ? WHERE turn_id = ?",
            (execution_id, turn_id),
        )


def assert_fixture_authority(store, sid, turn_id) -> dict:
    """Self-check the fixture state so data and comments cannot diverge."""
    run = store.turn_run(turn_id)
    turn = store.get_turn(sid, turn_id)
    refs = {
        execution_id: store.execution_link(sid, turn_id, execution_id).output_native_session_ref
        for execution_id in turn.execution_ids
    }
    return {
        "committed_execution_id": run.execution_id,
        "execution_ids": turn.execution_ids,
        "output_refs": refs,
    }


# -- happy path: exact persisted input ref, exact parent --------------------------


def test_same_harness_continuation_consumes_exact_persisted_output_ref(
    tmp_path, monkeypatch
):
    provider = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="cont-1", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    first = _run_turn(service, sid, "turn-1", execution_provider_id="stub-a-execution")
    assert first["state"] == "completed"
    exec_1 = first["execution_ids"][0]
    source_link = store.execution_link(sid, first["turn_id"], exec_1)
    assert source_link.output_native_session_ref is not None
    assert source_link.output_native_session_ref.native_id == "stub-loc-1"

    second = _run_turn(
        service, sid, "turn-2",
        execution_provider_id="stub-a-execution",
        continue_from_turn_id=first["turn_id"],
    )
    assert second["state"] == "completed"
    exec_2 = second["execution_ids"][0]
    link = store.execution_link(sid, second["turn_id"], exec_2)
    # EXACT identity: the input ref IS the source execution's output ref
    assert link.input_session_ref == source_link.output_native_session_ref
    assert link.parent_execution_id == exec_1
    # the dispatch actually carried the persisted ref (never re-derived)
    assert STUB_CONTRACT in provider.seen_contract_ids[1]
    store.close(); _reset_connection_for_tests()


def test_cross_harness_continuation_is_typed_rejected(tmp_path, monkeypatch):
    alpha = ContinuationStubProvider(provider_id="alpha-execution", harness="alpha")
    beta = ContinuationStubProvider(provider_id="beta-execution", harness="beta")
    service, store, _ = _build(tmp_path, monkeypatch, alpha, beta)
    sid = service.create_session(
        idempotency_key="x-1", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    first = _run_turn(service, sid, "x-turn-1", execution_provider_id="alpha-execution")
    assert first["state"] == "completed"
    with pytest.raises(CrossHarnessContinuationUnsupported):
        _run_turn(
            service, sid, "x-turn-2",
            execution_provider_id="beta-execution",
            continue_from_turn_id=first["turn_id"],
        )
    store.close(); _reset_connection_for_tests()


def test_continuation_requires_a_committed_source_turn(tmp_path, monkeypatch):
    provider = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="c-1", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    from agent_box.protocols.session.failures import SessionError

    with pytest.raises(SessionError):
        # an unknown source turn is the same typed not-found vocabulary
        _run_turn(
            service, sid, "c-turn",
            execution_provider_id="stub-a-execution",
            continue_from_turn_id="turn_does_not_exist",
        )
    store.close(); _reset_connection_for_tests()


def test_continuation_requires_a_persisted_source_output_ref(tmp_path, monkeypatch):
    # A provider WITHOUT a continuation surface produced the source turn:
    # no output ref exists, so continuation must fail closed.
    plain = FakeTurnExecutionProvider()
    provider = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    service, store, _ = _build(tmp_path, monkeypatch, plain, provider)
    sid = service.create_session(
        idempotency_key="o-1", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    first = _run_turn(service, sid, "o-turn-1", execution_provider_id=FAKE_PROVIDER_ID)
    assert first["state"] == "completed"
    with pytest.raises(BindingVerificationError):
        _run_turn(
            service, sid, "o-turn-2",
            execution_provider_id="stub-a-execution",
            continue_from_turn_id=first["turn_id"],
        )
    store.close(); _reset_connection_for_tests()


# -- committed Execution authority: the ONLY parent authority -----------------------
#
# The authoritative source Execution is ALWAYS the source Turn's committed
# ``TurnRunView.execution_id``.  A unique output-Ref holder that is not the
# committed execution (uncommitted / failed / stale / post-commit injected)
# must NEVER be selected.


def _setup_source_turn(tmp_path, monkeypatch, key):
    """One session; source Turn completed via the plain fake provider, so
    the committed run execution has NO output Ref."""
    provider = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    service, store, _ = _build(
        tmp_path, monkeypatch, provider, FakeTurnExecutionProvider()
    )
    sid = service.create_session(
        idempotency_key=key, title="t", project_path=_project(tmp_path)
    )["session"].session_id
    first = _run_turn(service, sid, f"{key}-turn-1", execution_provider_id=FAKE_PROVIDER_ID)
    assert first["state"] == "completed"
    return service, store, sid, first["turn_id"]


def test_unique_uncommitted_candidate_is_rejected(tmp_path, monkeypatch):
    """Counterexample 1: the ONLY output-Ref holder is not the committed
    execution → continuation must fail closed; the stale attempt must not
    be selected, no new turn may be created, and the target provider must
    never re-wrap the foreign locator."""
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "ca-1")
    insert_uncommitted_attempt(
        store, sid, turn_id, "exec_stale", "stale-loc", harness="alpha"
    )
    facts = assert_fixture_authority(store, sid, turn_id)
    assert facts["committed_execution_id"] != "exec_stale"
    assert list(facts["output_refs"]).count("exec_stale") == 1
    assert facts["output_refs"]["exec_stale"] is not None
    assert facts["output_refs"][facts["committed_execution_id"]] is None
    # the stale locator must never be re-wrapped by the target provider:
    # the continuation attempt must fail before any provider ref is built
    with pytest.raises(SessionError):
        _run_turn(
            service, sid, "ca-turn-2",
            execution_provider_id="stub-a-execution",
            continue_from_turn_id=turn_id,
        )
    # no new turn and no input provenance was written
    transcript = [e.event_type for e in store.transcript(sid)]
    assert transcript.count("TURN_STARTED") == 1
    store.close(); _reset_connection_for_tests()


def test_committed_execution_beats_stale_candidate(tmp_path, monkeypatch):
    """Counterexample 2: committed execution holds Ref A, a stale attempt
    holds Ref B → parent must be the committed execution with Ref A."""
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "ca-2")
    committed = set_committed_execution(store, sid, turn_id, "committed-loc")
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale_b", "stale-loc-b")
    facts = assert_fixture_authority(store, sid, turn_id)
    assert facts["committed_execution_id"] == committed
    ref_a = facts["output_refs"][committed]
    second = _run_turn(
        service, sid, "ca2-turn-2",
        execution_provider_id="stub-a-execution",
        continue_from_turn_id=turn_id,
    )
    link = store.execution_link(sid, second["turn_id"], second["execution_ids"][0])
    assert link.parent_execution_id == committed
    assert link.input_session_ref == ref_a  # full object equality
    assert link.input_session_ref.native_id == "committed-loc"
    store.close(); _reset_connection_for_tests()


def test_multiple_output_refs_still_obey_committed_authority(tmp_path, monkeypatch):
    """Counterexample 3: three links — stale Ref A, committed Ref B,
    unrelated Ref C — only Ref B may be consumed (never insertion order,
    execution_ids order, or the 'last locator')."""
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "ca-3")
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale_a", "loc-A")
    committed = set_committed_execution(store, sid, turn_id, "loc-B")
    insert_uncommitted_attempt(store, sid, turn_id, "exec_unrelated_c", "loc-C")
    facts = assert_fixture_authority(store, sid, turn_id)
    ref_b = facts["output_refs"][committed]
    second = _run_turn(
        service, sid, "ca3-turn-2",
        execution_provider_id="stub-a-execution",
        continue_from_turn_id=turn_id,
    )
    link = store.execution_link(sid, second["turn_id"], second["execution_ids"][0])
    assert link.parent_execution_id == committed
    assert link.input_session_ref == ref_b
    assert link.input_session_ref.native_id == "loc-B"
    store.close(); _reset_connection_for_tests()


def test_committed_run_pointing_at_unlinked_execution_is_rejected(
    tmp_path, monkeypatch
):
    """Counterexample 4: the committed run authority points at an Execution
    that does not belong to the source Turn → typed failure, no guessing."""
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "ca-4")
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale", "stale-loc")
    point_committed_run_at(store, turn_id, "exec_ghost")
    assert assert_fixture_authority(store, sid, turn_id)["committed_execution_id"] == "exec_ghost"
    with pytest.raises(SessionError):
        _run_turn(
            service, sid, "ca4-turn-2",
            execution_provider_id="stub-a-execution",
            continue_from_turn_id=turn_id,
        )
    assert [e.event_type for e in store.transcript(sid)].count("TURN_STARTED") == 1
    store.close(); _reset_connection_for_tests()


def test_committed_run_without_execution_id_is_rejected(tmp_path, monkeypatch):
    """Counterexample 5: no committed execution id → typed failure; no
    fallback to execution_ids[0]."""
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "ca-5")
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale", "stale-loc")
    point_committed_run_at(store, turn_id, None)
    assert assert_fixture_authority(store, sid, turn_id)["committed_execution_id"] is None
    with pytest.raises(SessionError):
        _run_turn(
            service, sid, "ca5-turn-2",
            execution_provider_id="stub-a-execution",
            continue_from_turn_id=turn_id,
        )
    assert [e.event_type for e in store.transcript(sid)].count("TURN_STARTED") == 1
    store.close(); _reset_connection_for_tests()


def test_committed_execution_without_output_ref_is_rejected(tmp_path, monkeypatch):
    """Counterexample 6: the committed execution has NO output Ref — even
    though another execution owns one, continuation must fail closed."""
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "ca-6")
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale", "stale-loc")
    # committed execution exists with NO ref (the _setup_source_turn shape)
    facts = assert_fixture_authority(store, sid, turn_id)
    assert facts["output_refs"][facts["committed_execution_id"]] is None
    with pytest.raises(SessionError):
        _run_turn(
            service, sid, "ca6-turn-2",
            execution_provider_id="stub-a-execution",
            continue_from_turn_id=turn_id,
        )
    assert [e.event_type for e in store.transcript(sid)].count("TURN_STARTED") == 1
    store.close(); _reset_connection_for_tests()


def test_post_commit_injected_link_cannot_become_the_parent(tmp_path, monkeypatch):
    """Counterexample 7: a link row white-box-inserted AFTER commit, without
    being registered as the committed run, must be rejected — never adopted
    as the final execution."""
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "ca-7")
    # pure injection: link row only, no output Ref, not the committed run
    _insert_link_row(store, turn_id, "exec_injected")
    facts = assert_fixture_authority(store, sid, turn_id)
    assert "exec_injected" in facts["execution_ids"]
    assert facts["committed_execution_id"] != "exec_injected"
    with pytest.raises(SessionError):
        _run_turn(
            service, sid, "ca7-turn-2",
            execution_provider_id="stub-a-execution",
            continue_from_turn_id=turn_id,
        )
    assert [e.event_type for e in store.transcript(sid)].count("TURN_STARTED") == 1
    store.close(); _reset_connection_for_tests()


def test_ambiguous_source_execution_is_typed_failure(tmp_path, monkeypatch):
    provider = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    service, store, _ = _build(
        tmp_path, monkeypatch, provider, FakeTurnExecutionProvider()
    )
    sid = service.create_session(
        idempotency_key="am-1", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    first = _run_turn(service, sid, "am-turn-1", execution_provider_id=FAKE_PROVIDER_ID)
    turn_id = first["turn_id"]
    # TWO uncommitted attempts both claim an output Ref; the committed run's
    # execution has none → the source cannot be proven from candidates at all.
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale_2", "loc-2")
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale_3", "loc-3")
    with pytest.raises(BindingVerificationError):
        _run_turn(
            service, sid, "am-turn-2",
            execution_provider_id="stub-a-execution",
            continue_from_turn_id=turn_id,
        )
    store.close(); _reset_connection_for_tests()


def test_continuation_survives_session_store_restart(tmp_path, monkeypatch):
    provider = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="r-1", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    first = _run_turn(service, sid, "r-turn-1", execution_provider_id="stub-a-execution")
    store.close()
    _reset_connection_for_tests()

    provider2 = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    service2, store2, _ = _build(tmp_path, monkeypatch, provider2)
    second = _run_turn(
        service2, sid, "r-turn-2",
        execution_provider_id="stub-a-execution",
        continue_from_turn_id=first["turn_id"],
    )
    assert second["state"] == "completed"
    store2.close(); _reset_connection_for_tests()


# -- Fix C: output provenance write failures are never swallowed -------------------


def test_provider_ref_error_never_commits_the_turn(tmp_path, monkeypatch):
    provider = ContinuationStubProvider(
        provider_id="stub-a-execution", harness="alpha",
        ref_error=RuntimeError("provider ref construction exploded"),
    )
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="f-1", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(service, sid, "f-turn", execution_provider_id="stub-a-execution")
    turn = store.get_turn(sid, payload["turn_id"])
    assert turn.state.value == "recovery_required"
    assert turn.terminal_outcome is None
    events = [e.event_type for e in store.transcript(sid)]
    assert "TURN_TERMINAL" not in events
    assert "TURN_COMMITTED" not in events
    store.close(); _reset_connection_for_tests()


def test_store_fact_write_conflict_never_commits_the_turn(tmp_path, monkeypatch):
    provider = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="f-2", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    original = store.record_execution_output_facts

    def conflicting(*args, **kwargs):
        if kwargs.get("output_native_session_ref") is not None:
            raise ExecutionFactConflict(
                "set-once execution fact already recorded with a different value"
            )
        return original(*args, **kwargs)

    monkeypatch.setattr(store, "record_execution_output_facts", conflicting)
    payload = _run_turn(service, sid, "f2-turn", execution_provider_id="stub-a-execution")
    turn = store.get_turn(sid, payload["turn_id"])
    assert turn.state.value == "recovery_required"
    assert turn.terminal_outcome is None
    events = [e.event_type for e in store.transcript(sid)]
    assert "TURN_COMMITTED" not in events
    recovery_events = [
        e for e in store.transcript(sid)
        if e.event_type == "execution.recovery_required"
        and e.payload.get("reason_code") == "OUTPUT_PROVENANCE_CONFLICT"
    ]
    assert recovery_events
    # the conflict detail never leaks into the durable ledger
    import json as _json

    assert "different value" not in _json.dumps(
        [dict(e.payload) for e in store.transcript(sid)]
    )
    store.close(); _reset_connection_for_tests()


def test_lease_failure_during_provenance_write_never_commits(tmp_path, monkeypatch):
    provider = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="f-3", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    original = store.record_execution_output_facts

    def lease_broken(*args, **kwargs):
        raise SessionWriterConflict("writer lease is not held by this owner")

    monkeypatch.setattr(store, "record_execution_output_facts", lease_broken)
    payload = _run_turn(service, sid, "f3-turn", execution_provider_id="stub-a-execution")
    turn = store.get_turn(sid, payload["turn_id"])
    assert turn.state.value == "recovery_required"
    assert "TURN_COMMITTED" not in [e.event_type for e in store.transcript(sid)]
    store.close(); _reset_connection_for_tests()


def test_provenance_failure_state_is_durable_across_restart(tmp_path, monkeypatch):
    provider = ContinuationStubProvider(
        provider_id="stub-a-execution", harness="alpha",
        ref_error=RuntimeError("boom"),
    )
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="f-4", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(service, sid, "f4-turn", execution_provider_id="stub-a-execution")
    store.close()
    _reset_connection_for_tests()

    provider2 = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    service2, store2, _ = _build(tmp_path, monkeypatch, provider2)
    turn = store2.get_turn(sid, payload["turn_id"])
    assert turn.state.value == "recovery_required"
    assert turn.terminal_outcome is None
    store2.close(); _reset_connection_for_tests()


# -- honest capability truth: non-callable / empty contract = no recording -------


def test_non_callable_continuation_capability_records_nothing(tmp_path, monkeypatch):
    provider = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    provider.continuation_contract_id = "not-callable"  # type: ignore[assignment]
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="cap-1", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(service, sid, "cap-turn", execution_provider_id="stub-a-execution")
    assert payload["state"] == "completed"
    exec_1 = payload["execution_ids"][0]
    link = store.execution_link(sid, payload["turn_id"], exec_1)
    assert link.output_native_session_ref is None
    store.close(); _reset_connection_for_tests()


def test_empty_contract_capability_records_nothing(tmp_path, monkeypatch):
    provider = ContinuationStubProvider(provider_id="stub-a-execution", harness="alpha")
    provider.continuation_contract_id = lambda: ""  # type: ignore[assignment]
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="cap-2", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(service, sid, "cap2-turn", execution_provider_id="stub-a-execution")
    assert payload["state"] == "completed"
    exec_1 = payload["execution_ids"][0]
    link = store.execution_link(sid, payload["turn_id"], exec_1)
    assert link.output_native_session_ref is None
    store.close(); _reset_connection_for_tests()
