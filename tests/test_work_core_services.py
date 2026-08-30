from datetime import datetime, timezone

import pytest

from agent_box.core import db
from agent_box.work_core.errors import WorkNotOpen
from agent_box.work_core.events import CoreEvent, EventType
from agent_box.work_core.models import Ref, RefType, Work, WorkLifecycle
from agent_box.work_core.projection import ExecutionProjection, Freshness, Outcome, Phase
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.services import ExecutionService, WorkService
from agent_box.work_core.finalization import ExecutionFinalizationRequest


def _execution_creation_counts():
    conn = db.get_conn()
    execution_count = conn.execute("SELECT COUNT(*) FROM core_executions").fetchone()[0]
    event_count = conn.execute("SELECT COUNT(*) FROM core_events WHERE type = ?", (EventType.EXECUTION_CREATED.value,)).fetchone()[0]
    return execution_count, event_count


def test_work_lifecycle_is_explicit_and_independent_from_terminal_execution(tmp_agent_box_home):
    repo = CoreRepository(); works = WorkService(repo); executions = ExecutionService(repo)
    work = works.create_work("make a change")
    execution = executions.create_execution(
        work.id,
        "fake",
        responsibility_intent="attempt the change",
    )
    terminal = ExecutionProjection(Phase.TERMINAL, Outcome.FAILED, False, Freshness.OBSERVED, datetime.now(timezone.utc))
    executions.apply_finalization(ExecutionFinalizationRequest(execution.id, "finish-1", terminal))
    assert repo.get_work(work.id).lifecycle.value == "open"
    completed = works.complete_work(work.id, "user accepted evidence")
    assert completed.lifecycle.value == "completed"
    assert works.reopen_work(work.id, "new scope").lifecycle.value == "open"


def test_completed_work_requires_reopen_before_creating_another_execution(tmp_agent_box_home):
    repo = CoreRepository(); works = WorkService(repo); executions = ExecutionService(repo)
    work = works.create_work("create only while open")
    assert executions.create_execution(
        work.id,
        "fake",
        responsibility_intent="initial implementation",
    ).work_id == work.id
    works.complete_work(work.id, "accepted")
    before = _execution_creation_counts()

    with pytest.raises(WorkNotOpen, match=work.id):
        executions.create_execution(
            work.id,
            "fake",
            responsibility_intent="must wait for reopen",
        )

    assert _execution_creation_counts() == before
    works.reopen_work(work.id, "new responsibility")
    assert executions.create_execution(
        work.id,
        "fake",
        responsibility_intent="new responsibility after reopen",
    ).work_id == work.id


def test_abandoned_work_rejects_execution_without_material_side_effects(tmp_agent_box_home):
    repo = CoreRepository(); executions = ExecutionService(repo)
    now = datetime.now(timezone.utc)
    work = repo.create_work(
        Work("work_abandoned", "closed work", WorkLifecycle.ABANDONED, now, now, closure_reason="abandoned"),
        CoreEvent("evt_abandoned_work", EventType.WORK_CREATED, "work_abandoned", now),
    )
    before = _execution_creation_counts()

    with pytest.raises(WorkNotOpen, match=work.id):
        executions.create_execution(
            work.id,
            "fake",
            responsibility_intent="invalid abandoned attempt",
        )

    assert _execution_creation_counts() == before


def test_terminal_projection_is_monotonic_after_first_terminal_observation(tmp_agent_box_home):
    repo = CoreRepository(); work = WorkService(repo).create_work("sealed")
    execution = ExecutionService(repo).create_execution(
        work.id,
        "fake",
        responsibility_intent="seal the execution history",
    )
    service = ExecutionService(repo)
    terminal = ExecutionProjection(Phase.TERMINAL, Outcome.SUCCEEDED, False, Freshness.OBSERVED, datetime.now(timezone.utc))
    service.apply_finalization(ExecutionFinalizationRequest(execution.id, "finish-2", terminal))

    from agent_box.work_core.errors import InvalidProjectionTransition

    back_to_active = ExecutionProjection(Phase.ACTIVE, None, True, Freshness.OBSERVED, datetime.now(timezone.utc))
    with pytest.raises(InvalidProjectionTransition):
        service.observe_projection(execution.id, back_to_active)
    back_to_unknown = ExecutionProjection(Phase.UNKNOWN, None, None, Freshness.UNREACHABLE, datetime.now(timezone.utc))
    with pytest.raises(InvalidProjectionTransition):
        service.observe_projection(execution.id, back_to_unknown)
    changed_outcome = ExecutionProjection(Phase.TERMINAL, Outcome.FAILED, False, Freshness.OBSERVED, datetime.now(timezone.utc))
    with pytest.raises(InvalidProjectionTransition):
        service.observe_projection(execution.id, changed_outcome)

    # Re-delivering the same terminal semantics stays idempotent.
    same = service.observe_projection(execution.id, terminal)
    assert same.projection.outcome is Outcome.SUCCEEDED
    assert [item.type for item in repo.list_events(execution.id)].count(EventType.EXECUTION_TERMINAL) == 1
    sealed = repo.get_execution(execution.id)
    assert sealed.projection.phase is Phase.TERMINAL
    assert sealed.projection.outcome is Outcome.SUCCEEDED


def test_terminal_with_resumable_now_true_is_a_legal_projection(tmp_agent_box_home):
    """``resumable_now`` is a native-continuity advisory, never a reopen key.

    A terminal Execution with ``resumable_now=True`` is legal: the native
    session may still serve as the continuation source of a NEW Execution.
    It must not imply that the terminal Execution itself can go active
    again, and the advisory may be updated later without touching outcome.
    """
    repo = CoreRepository(); work = WorkService(repo).create_work("continuation advisory")
    service = ExecutionService(repo)
    execution = service.create_execution(
        work.id, "fake", responsibility_intent="finish and stay continuable"
    )
    first = service.repository.get_execution(execution.id)
    service.apply_finalization(ExecutionFinalizationRequest(execution.id, "finish-3", ExecutionProjection(Phase.TERMINAL, Outcome.SUCCEEDED, True, Freshness.OBSERVED, datetime.now(timezone.utc))))
    first = service.repository.get_execution(execution.id)
    ended_at = first.ended_at
    assert ended_at is not None
    assert first.projection.phase is Phase.TERMINAL
    assert first.projection.outcome is Outcome.SUCCEEDED
    assert first.projection.resumable_now is True

    # The advisory can be withdrawn later without reopening or rewriting
    # outcome or the sealed ended_at.
    second = service.observe_projection(
        execution.id,
        ExecutionProjection(Phase.TERMINAL, Outcome.SUCCEEDED, False, Freshness.OBSERVED, datetime.now(timezone.utc)),
    )
    assert second.projection.phase is Phase.TERMINAL
    assert second.projection.outcome is Outcome.SUCCEEDED
    assert second.projection.resumable_now is False
    assert second.ended_at == ended_at

    # A different outcome under terminal is still a rejected rewrite.
    from agent_box.work_core.errors import InvalidProjectionTransition

    with pytest.raises(InvalidProjectionTransition):
        service.observe_projection(
            execution.id,
            ExecutionProjection(Phase.TERMINAL, Outcome.FAILED, False, Freshness.OBSERVED, datetime.now(timezone.utc)),
        )
    # And terminal still never returns to active, whatever the advisory says.
    with pytest.raises(InvalidProjectionTransition):
        service.observe_projection(
            execution.id,
            ExecutionProjection(Phase.ACTIVE, None, True, Freshness.OBSERVED, datetime.now(timezone.utc)),
        )


def test_core_exposes_no_same_execution_resume_entrypoint():
    """Core has no operation that reopens or re-runs an old Execution.

    Native continuation is expressed only as new Execution + previous
    SessionRef as frozen INPUT + new Dispatch (see
    tests/test_work_core_vertical_slice.py).
    """
    assert not hasattr(ExecutionService, "resume_execution")


def test_reobservation_does_not_duplicate_material_events_or_refs(tmp_agent_box_home):
    repo = CoreRepository(); work = WorkService(repo).create_work("observe")
    execution = ExecutionService(repo).create_execution(
        work.id,
        "fake",
        responsibility_intent="observe provider state",
    )
    service = ExecutionService(repo)
    ref = Ref(RefType.SESSION, "fake", "session-1")
    first = ExecutionProjection(Phase.ACTIVE, None, True, Freshness.OBSERVED, datetime.now(timezone.utc))
    service.apply_observation(execution.id, first, native_refs=(ref,))
    later_same_state = ExecutionProjection(Phase.ACTIVE, None, True, Freshness.OBSERVED, datetime.now(timezone.utc))
    service.apply_observation(execution.id, later_same_state, native_refs=(ref,))
    event_types = [item.type for item in repo.list_events(execution.id)]
    assert event_types.count(EventType.EXECUTION_PROJECTION_CHANGED) == 1
    assert event_types.count(EventType.NATIVE_REF_DISCOVERED) == 1
    assert repo.list_refs(execution.id) == [ref]
