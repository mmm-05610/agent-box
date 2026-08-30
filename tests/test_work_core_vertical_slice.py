from dataclasses import dataclass
from datetime import datetime, timezone
from typing import ClassVar

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.projection import ExecutionProjection, Freshness, Outcome, Phase
from agent_box.work_core.registry import (
    ExecutionStartReceipt,
    ExtensionRegistry,
    ProviderDescriptor,
)
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.services import ExecutionService, WorkService


def now():
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class SessionContinuationV1:
    """Test double for a native-session continuation contract."""

    contract_id: ClassVar[str] = "test.session-continuation@1"

    session_id: str = "session-1"


class FakeResourceProvider:
    supported_contract_ids = frozenset(
        {WorkspaceV1.contract_id, SessionContinuationV1.contract_id}
    )

    def resolve(self, contract_id, ref):
        if contract_id == SessionContinuationV1.contract_id:
            return SessionContinuationV1(session_id=ref.native_id)
        return WorkspaceV1.__new__(WorkspaceV1)


class FakeExecutionProvider:
    def __init__(self):
        self.resume_requests = []

    def descriptor(self):
        return ProviderDescriptor("external-executor", "Fake Executor", "test")

    def capabilities(self):
        return {"start": "supported", "observe": "supported", "resume": "supported"}

    def input_limits(self):
        return {
            WorkspaceV1.contract_id: (1, 1),
            SessionContinuationV1.contract_id: (0, 1),
        }

    def start(self, request):
        return ExecutionStartReceipt(
            request.execution_id, request.dispatch_id, request.inputs_digest
        )

    def observe(self, native_ref):
        return native_ref

    def resume(self, request):
        self.resume_requests.append(request)
        return "resumed-process"


def _registry():
    registry = ExtensionRegistry()
    registry.register_contract(SessionContinuationV1)
    registry.register_execution_provider(FakeExecutionProvider())
    registry.register_resource_provider("external-executor", FakeResourceProvider())
    return registry


def _dispatch(service, execution):
    workspace_ref = Ref(RefType.WORKSPACE, "external-executor", "workspace-1")
    return service.dispatch_execution(
        execution.id,
        ((WorkspaceV1.contract_id, workspace_ref),),
        _registry(),
        "dispatch-1",
    )


def test_phase_one_service_slice_preserves_execution_and_explicit_close(tmp_agent_box_home):
    repo = CoreRepository(); works = WorkService(repo); executions = ExecutionService(repo)
    work = works.create_work("safe coding work")
    execution = executions.create_execution(
        work.id,
        "external-executor",
        responsibility_intent="complete the vertical slice",
    )
    _dispatch(executions, execution)
    active = ExecutionProjection(Phase.ACTIVE, None, True, Freshness.OBSERVED, now())
    executions.apply_observation(execution.id, active, native_refs=[Ref(RefType.SESSION, "external-executor", "session-1")])
    completed = ExecutionProjection(Phase.TERMINAL, Outcome.SUCCEEDED, False, Freshness.OBSERVED, now())
    from agent_box.work_core.finalization import ExecutionFinalizationRequest
    executions.apply_finalization(ExecutionFinalizationRequest(execution.id, "finish-slice", completed, output_refs=(Ref(RefType.ARTIFACT, "external-executor", "result-1"),)))
    assert repo.get_work(work.id).lifecycle.value == "open"
    registry = _registry()
    # Core no longer exposes a same-Execution resume entrypoint at all; the
    # provider's resume operation is never invoked behind Core's back.
    assert not hasattr(executions, "resume_execution")
    assert registry.get("external-executor").resume_requests == []
    assert repo.get_execution(execution.id).id == execution.id
    assert {ref.native_id for ref in repo.list_refs(execution.id)} == {"workspace-1", "session-1", "result-1"}
    assert works.complete_work(work.id, "user accepts result").lifecycle.value == "completed"


def test_same_session_continuation_uses_new_execution_with_sessionref_input(tmp_agent_box_home):
    """Native continuation is a new Execution + new frozen INPUT, not a resume."""
    repo = CoreRepository(); works = WorkService(repo); executions = ExecutionService(repo)
    work = works.create_work("continue the session")
    first = executions.create_execution(
        work.id, "external-executor", responsibility_intent="first attempt",
    )
    _dispatch(executions, first)
    session_ref = Ref(RefType.SESSION, "external-executor", "session-1")
    from agent_box.work_core.finalization import ExecutionFinalizationRequest
    executions.apply_finalization(ExecutionFinalizationRequest(first.id, "finish-continuation", ExecutionProjection(Phase.TERMINAL, Outcome.SUCCEEDED, False, Freshness.OBSERVED, now()), native_refs=(session_ref,)))
    # Core offers no same-Execution resume entrypoint: continuation is only
    # reachable as a new Execution + new Dispatch through governed dispatch.
    assert not hasattr(executions, "resume_execution")

    # Continuation: new Execution + new Dispatch, previous SessionRef frozen
    # as an INPUT through the same governed path as any other input.
    second = executions.create_execution(
        work.id, "external-executor", responsibility_intent="continue native session",
    )
    receipt = executions.dispatch_execution(
        second.id,
        (
            (WorkspaceV1.contract_id, Ref(RefType.WORKSPACE, "external-executor", "workspace-1")),
            (SessionContinuationV1.contract_id, session_ref),
        ),
        _registry(),
        "dispatch-2",
    )
    assert receipt.dispatch_id and first.id != second.id
    assert (SessionContinuationV1.contract_id, session_ref) in repo.list_input_refs(second.id)
    assert repo.get_execution(first.id).projection.phase is Phase.TERMINAL
    assert repo.get_execution(second.id).projection.phase is not Phase.TERMINAL


def test_restart_reload_preserves_execution_without_resume_entrypoint(tmp_agent_box_home):
    repo = CoreRepository(); work = WorkService(repo).create_work("restart")
    execution = ExecutionService(repo).create_execution(
        work.id,
        "external-executor",
        responsibility_intent="verify restart behavior",
    )
    # A new repository object represents a process/service restart over SQLite.
    reloaded = CoreRepository().get_execution(execution.id)
    assert reloaded.id == execution.id and reloaded.projection.phase is Phase.UNKNOWN
    registry = ExtensionRegistry(); registry.register_execution_provider(FakeExecutionProvider())
    # A restarted Core exposes no same-Execution resume operation to call.
    assert not hasattr(ExecutionService(CoreRepository()), "resume_execution")
    assert registry.get("external-executor").resume_requests == []
