"""Turn run-transaction tests: the durable journal of the EXECUTION phase.

Covers: PREPARED row creation inside the begin_turn transaction, fail-closed
phase transitions, idempotent re-recording, crash windows between every
phase transition (fault seam, never sleeps), restart discovery via
``unfinished_turn_runs``, recovery reentry, and the commit-time terminal
phase stamp.
"""
from __future__ import annotations

import pytest

from agent_box.protocols.session.contracts import TerminalOutcome, TurnRunPhase
from agent_box.protocols.session.failures import (
    InvalidTurnTransition,
    SessionWriterConflict,
    TurnNotFound,
)
from agent_box.protocols.session.store import TurnBeginRequest, TurnRunView

from agent_box_session.store import SQLiteSessionStore

from conftest_store import (
    FakeWorkAuthority,
    _binding,
    _begin,
    _creation_request,
)


def _crash_on(step_name: str):
    def hook(step: str) -> None:
        if step == step_name:
            raise RuntimeError(f"simulated crash at {step}")

    return hook


def _dispatch(lease, turn_id: str, execution_id: str, *, dispatch_id="disp-1", digest="sha256:abc"):
    return dict(turn_id=turn_id, execution_id=execution_id,
                dispatch_id=dispatch_id, dispatch_digest=digest, lease=lease)


@pytest.fixture
def env(tmp_path):
    authority = FakeWorkAuthority()
    s = SQLiteSessionStore(tmp_path / "session-store.db", callbacks=authority.callbacks())
    session = s.create_session(_creation_request("run-tx"))
    yield s, authority, session
    s.close()


# -- journal row creation -------------------------------------------------------


def test_begin_turn_creates_run_journal_at_prepared_in_same_transaction(env):
    s, authority, session = env
    result = _begin(s, session.session_id, "rt-1")
    run = s.turn_run(result.turn_id)
    assert isinstance(run, TurnRunView)
    assert run.phase is TurnRunPhase.PREPARED
    assert run.session_id == session.session_id
    # The execution link is journaled as soon as the saga created it.
    assert run.execution_id == result.execution_id
    assert run.dispatch_id is None and run.dispatch_digest is None
    assert run.recovery_facts == {}


def test_turn_run_missing_is_typed(env):
    s, _, _ = env
    with pytest.raises(TurnNotFound):
        s.turn_run("turn_missing")


# -- legal transitions and idempotency --------------------------------------------


def test_full_phase_lifecycle_to_session_committed(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-life")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_dispatch_intent(result.turn_id, result.execution_id,
                             dispatch_id="disp-1", dispatch_digest="sha256:d1", lease=lease)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.DISPATCH_REQUESTED
    s.record_dispatch_accepted(result.turn_id, result.execution_id, dispatch_id="disp-1", lease=lease)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.DISPATCH_ACCEPTED
    s.record_turn_running(result.turn_id, lease=lease)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.RUNNING
    s.record_execution_terminal(result.turn_id, outcome=TerminalOutcome.SUCCEEDED,
                                evidence={"projection": "terminal", "freshness": "observed"},
                                lease=lease)
    run = s.turn_run(result.turn_id)
    assert run.phase is TurnRunPhase.EXECUTION_TERMINAL
    assert run.recovery_facts["projection"] == "terminal"
    assert run.recovery_facts["run_outcome"] == "succeeded"
    s.record_finalization_applied(result.turn_id, lease=lease)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.FINALIZATION_APPLIED
    s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.SUCCEEDED, lease)
    s.commit_turn(session.session_id, result.turn_id, lease)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.SESSION_COMMITTED
    assert s.unfinished_turn_runs(session.session_id) == ()
    assert s.unfinished_turn_runs() == ()


def test_commit_of_failed_outcome_sets_failed_run_phase(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-fail")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_dispatch_intent(result.turn_id, result.execution_id,
                             dispatch_id="disp-f", dispatch_digest="sha256:f", lease=lease)
    s.record_turn_running(result.turn_id, lease=lease)
    s.record_execution_terminal(result.turn_id, outcome=TerminalOutcome.FAILED,
                                evidence={"reason": "provider reported failure"}, lease=lease)
    s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.FAILED, lease)
    s.commit_turn(session.session_id, result.turn_id, lease)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.FAILED


def test_dispatch_intent_is_idempotent_with_identical_facts(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-idem")
    lease = s.acquire_writer_lease(session.session_id, "w")
    kwargs = _dispatch(lease, result.turn_id, result.execution_id)
    s.record_dispatch_intent(**kwargs)
    s.record_dispatch_intent(**kwargs)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.DISPATCH_REQUESTED


def test_dispatch_intent_with_different_facts_conflicts(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-idem2")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_dispatch_intent(result.turn_id, result.execution_id,
                             dispatch_id="disp-1", dispatch_digest="sha256:d1", lease=lease)
    with pytest.raises(InvalidTurnTransition):
        s.record_dispatch_intent(result.turn_id, result.execution_id,
                                 dispatch_id="disp-1", dispatch_digest="sha256:OTHER", lease=lease)
    with pytest.raises(InvalidTurnTransition):
        s.record_dispatch_intent(result.turn_id, "exec_other",
                                 dispatch_id="disp-1", dispatch_digest="sha256:d1", lease=lease)


def test_dispatch_accepted_requires_matching_dispatch_id(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-acc")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_dispatch_intent(result.turn_id, result.execution_id,
                             dispatch_id="disp-1", dispatch_digest="sha256:d1", lease=lease)
    with pytest.raises(InvalidTurnTransition):
        s.record_dispatch_accepted(result.turn_id, result.execution_id,
                                   dispatch_id="disp-OTHER", lease=lease)
    with pytest.raises(InvalidTurnTransition):
        s.record_dispatch_accepted(result.turn_id, "exec_other",
                                   dispatch_id="disp-1", lease=lease)
    s.record_dispatch_accepted(result.turn_id, result.execution_id, dispatch_id="disp-1", lease=lease)
    s.record_dispatch_accepted(result.turn_id, result.execution_id, dispatch_id="disp-1", lease=lease)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.DISPATCH_ACCEPTED


def test_running_from_dispatch_requested_is_allowed_and_documented(env):
    """A provider may start without an accepted callback; the journal keeps
    the honest fact that only a request was ever recorded."""
    s, _, session = env
    result = _begin(s, session.session_id, "rt-run1")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_dispatch_intent(result.turn_id, result.execution_id,
                             dispatch_id="disp-1", dispatch_digest="sha256:d1", lease=lease)
    s.record_turn_running(result.turn_id, lease=lease)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.RUNNING
    assert s.turn_run(result.turn_id).dispatch_id == "disp-1"


def test_running_from_prepared_is_rejected(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-run2")
    lease = s.acquire_writer_lease(session.session_id, "w")
    with pytest.raises(InvalidTurnTransition):
        s.record_turn_running(result.turn_id, lease=lease)


def test_execution_terminal_from_undispatched_run_rejected(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-term0")
    lease = s.acquire_writer_lease(session.session_id, "w")
    with pytest.raises(InvalidTurnTransition):
        s.record_execution_terminal(result.turn_id, outcome=TerminalOutcome.SUCCEEDED,
                                    evidence={}, lease=lease)


def test_finalization_requires_execution_terminal(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-fin")
    lease = s.acquire_writer_lease(session.session_id, "w")
    with pytest.raises(InvalidTurnTransition):
        s.record_finalization_applied(result.turn_id, lease=lease)
    s.record_dispatch_intent(result.turn_id, result.execution_id,
                             dispatch_id="disp-1", dispatch_digest="sha256:d1", lease=lease)
    s.record_turn_running(result.turn_id, lease=lease)
    s.record_execution_terminal(result.turn_id, outcome=TerminalOutcome.SUCCEEDED,
                                evidence={"k": "v"}, lease=lease)
    s.record_finalization_applied(result.turn_id, lease=lease)
    s.record_finalization_applied(result.turn_id, lease=lease)  # idempotent


def test_evidence_is_bounded(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-bound")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_dispatch_intent(result.turn_id, result.execution_id,
                             dispatch_id="disp-1", dispatch_digest="sha256:d1", lease=lease)
    s.record_turn_running(result.turn_id, lease=lease)
    with pytest.raises(ValueError):
        s.record_execution_terminal(
            result.turn_id, outcome=TerminalOutcome.SUCCEEDED,
            evidence={f"k{i}": "v" for i in range(20)}, lease=lease)
    with pytest.raises(ValueError):
        s.record_execution_terminal(
            result.turn_id, outcome=TerminalOutcome.SUCCEEDED,
            evidence={"k": "v" * 300}, lease=lease)


def test_all_mutations_require_the_lease(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-lease")
    from agent_box.protocols.session.store import WriterLease

    wrong_lease = WriterLease(session.session_id, "not-the-writer")
    with pytest.raises(SessionWriterConflict):
        s.record_dispatch_intent(result.turn_id, result.execution_id,
                                 dispatch_id="d", dispatch_digest="x", lease=wrong_lease)
    with pytest.raises(SessionWriterConflict):
        s.record_turn_running(result.turn_id, lease=wrong_lease)
    with pytest.raises(SessionWriterConflict):
        s.record_execution_terminal(result.turn_id, outcome=TerminalOutcome.SUCCEEDED,
                                    evidence={}, lease=wrong_lease)
    with pytest.raises(SessionWriterConflict):
        s.record_finalization_applied(result.turn_id, lease=wrong_lease)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.PREPARED


# -- crash windows between phase transitions -------------------------------------


@pytest.mark.parametrize("crash_index", range(5))
def test_crash_between_every_phase_transition_preserves_journal_and_recovers(env, crash_index):
    s, authority, session = env
    result = _begin(s, session.session_id, "rt-crash")
    turn_id, execution_id = result.turn_id, result.execution_id
    lease = s.acquire_writer_lease(session.session_id, "w")

    def step_intent(store, lease):
        store.record_dispatch_intent(turn_id, execution_id,
                                     dispatch_id="disp-1", dispatch_digest="sha256:d1", lease=lease)

    def step_accepted(store, lease):
        store.record_dispatch_accepted(turn_id, execution_id, dispatch_id="disp-1", lease=lease)

    def step_running(store, lease):
        store.record_turn_running(turn_id, lease=lease)

    def step_terminal(store, lease):
        store.record_execution_terminal(turn_id, outcome=TerminalOutcome.SUCCEEDED,
                                        evidence={"k": "v"}, lease=lease)

    def step_finalization(store, lease):
        store.record_finalization_applied(turn_id, lease=lease)

    steps = [
        ("run:pre_dispatch_intent", step_intent, TurnRunPhase.PREPARED),
        ("run:pre_dispatch_accepted", step_accepted, TurnRunPhase.DISPATCH_REQUESTED),
        ("run:pre_running", step_running, TurnRunPhase.DISPATCH_ACCEPTED),
        ("run:pre_execution_terminal", step_terminal, TurnRunPhase.RUNNING),
        ("run:pre_finalization", step_finalization, TurnRunPhase.EXECUTION_TERMINAL),
    ]
    crash_step, _, phase_before_crash = steps[crash_index]
    for _, run_step, _ in steps[:crash_index]:
        run_step(s, lease)

    s._fault_hook = _crash_on(crash_step)
    with pytest.raises(RuntimeError):
        steps[crash_index][1](s, lease)
    s._fault_hook = None

    # Simulated process restart: reopen from the same path.  The journal
    # answers exactly where the run died.
    path, callbacks = s._path, authority.callbacks()
    s.close()
    reopened = SQLiteSessionStore(path, callbacks=callbacks)
    run = reopened.turn_run(turn_id)
    assert run.phase is phase_before_crash
    discovered = reopened.unfinished_turn_runs(session.session_id)
    assert [r.turn_id for r in discovered] == [turn_id]

    # Reentry: the stale lease is broken via CAS (expected owner and the
    # still-running turn), then the whole step sequence replays
    # idempotently and drives the run to SESSION_COMMITTED.
    reopened.break_writer_lease(
        session.session_id,
        reason="stale writer after simulated crash",
        expected_owner_id="w",
        expected_turn_id=turn_id,
    )
    lease2 = reopened.acquire_writer_lease(session.session_id, "w2")
    # Reentry resumes at the journaled phase: already-journaled transitions
    # are never re-recorded (the store rejects them fail-closed).
    for _, run_step, _ in steps[crash_index:]:
        run_step(reopened, lease2)
    reopened.record_terminal(session.session_id, turn_id, TerminalOutcome.SUCCEEDED, lease2)
    reopened.commit_turn(session.session_id, turn_id, lease2)
    assert reopened.turn_run(turn_id).phase is TurnRunPhase.SESSION_COMMITTED
    assert reopened.unfinished_turn_runs() == ()
    reopened.close()


def test_crash_after_turn_creation_is_discovered_and_resumes(env):
    """Crash between the durable turn creation and the external Execution
    creation: restart discovery finds the PREPARED run and the same
    idempotency key resumes the saga without a second turn."""
    s, authority, session = env
    s._fault_hook = _crash_on("begin_turn:pre_execution")
    lease = s.acquire_writer_lease(session.session_id, "w")
    request = TurnBeginRequest(
        session_id=session.session_id,
        idempotency_key="rt-resume",
        input_text="resume me",
        binding=_binding(),
    )
    with pytest.raises(RuntimeError):
        s.begin_turn(request, lease)
    s._fault_hook = None
    path, callbacks = s._path, authority.callbacks()
    s.close()

    reopened = SQLiteSessionStore(path, callbacks=callbacks)
    discovered = reopened.unfinished_turn_runs(session.session_id)
    assert len(discovered) == 1
    assert discovered[0].phase is TurnRunPhase.PREPARED
    reopened.break_writer_lease(
        session.session_id,
        reason="stale writer after simulated crash",
        expected_owner_id="w",
        expected_turn_id=discovered[0].turn_id,
    )
    resumed = reopened.begin_turn(request, reopened.acquire_writer_lease(session.session_id, "w2"))
    assert not resumed.replayed
    assert len(authority.executions) == 1
    assert resumed.turn_id == discovered[0].turn_id
    reopened.close()


# -- recovery required on the run journal -----------------------------------------


def test_mark_recovery_required_is_idempotent_and_does_not_fabricate_terminal(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-rec")
    lease = s.acquire_writer_lease(session.session_id, "w")
    op_id = s.mark_turn_recovery_required(result.turn_id, facts={"step": "dispatch"})
    assert op_id == s.mark_turn_recovery_required(result.turn_id, facts={"step": "dispatch"})
    run = s.turn_run(result.turn_id)
    assert run.phase is TurnRunPhase.RECOVERY_REQUIRED
    assert run.recovery_facts == {"step": "dispatch"}
    turn = s.get_turn(session.session_id, result.turn_id)
    # Never a fabricated terminal outcome on the Turn row.
    assert turn.terminal_outcome is None
    ops = [op for op in s.recovery_operations(session_id=session.session_id)
           if op.kind == "turn_run"]
    assert [op.op_id for op in ops] == [op_id]
    assert ops[0].state == "RECOVERY_REQUIRED"


def test_mark_recovery_required_without_lease_binds_session(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-rec2")
    op_id = s.mark_turn_recovery_required(result.turn_id, facts={"why": "crash"})
    ops = s.recovery_operations(session_id=session.session_id)
    assert any(op.op_id == op_id and op.session_id == session.session_id for op in ops)


def test_mark_recovery_required_rejected_on_sealed_run(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-rec3")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.SUCCEEDED, lease)
    s.commit_turn(session.session_id, result.turn_id, lease)
    with pytest.raises(InvalidTurnTransition):
        s.mark_turn_recovery_required(result.turn_id, facts={"late": "true"})


def test_recovery_reentry_from_unprovable_run_to_sealed_failed_turn(env):
    s, _, session = env
    result = _begin(s, session.session_id, "rt-rec4")
    lease = s.acquire_writer_lease(session.session_id, "w")
    op_id = s.mark_turn_recovery_required(result.turn_id, facts={"step": "dispatch"})
    # Outcome unprovable: recovery keeps the run in RECOVERY_REQUIRED.
    first = s.recover(session.session_id, op_id)
    assert first.state == "RECOVERY_REQUIRED"
    second = s.recover(session.session_id, op_id)
    assert second.state == "RECOVERY_REQUIRED"
    # Later, the operator proves the failed outcome and seals the turn; the
    # journal reconciles to the sealed fact.
    s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.FAILED, lease)
    s.commit_turn(session.session_id, result.turn_id, lease)
    resolved = s.recover(session.session_id, op_id)
    assert resolved.state == "RESOLVED"
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.FAILED


def test_legacy_commit_path_stamps_the_run_journal(env):
    """A writer that never calls the run-transaction methods still gets a
    coherent journal: commit_turn reconciles PREPARED to the terminal phase."""
    s, _, session = env
    result = _begin(s, session.session_id, "rt-legacy")
    lease = s.acquire_writer_lease(session.session_id, "w")
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.PREPARED
    s.record_terminal(session.session_id, result.turn_id, TerminalOutcome.SUCCEEDED, lease)
    s.commit_turn(session.session_id, result.turn_id, lease)
    assert s.turn_run(result.turn_id).phase is TurnRunPhase.SESSION_COMMITTED
