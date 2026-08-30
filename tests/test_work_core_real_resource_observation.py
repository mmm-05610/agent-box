"""Vertical slice: real frozen Git/workspace + prompt inputs, then honest
post-run observations (READ_BACK MATCH/MISMATCH) recorded through the
structured ResourceObservation ledger.
"""
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest

from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExecutionStartReceipt, ExecutionStartRequest
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.projection import (
    ExecutionProjection,
    Freshness,
    Outcome,
    Phase,
)
from agent_box.work_core.providers.resources import (
    ArtifactPromptResourceProvider,
    GitWorktreeResourceProvider,
)
from agent_box.work_core.registry import ExtensionRegistry
from agent_box.work_core.errors import ProviderUnavailable
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.resource_observations import (
    ResourceObservation,
    ResourceObservationCoverage,
    ResourceObservationKind,
    ResourceObservationResult,
    ResourceObserverRole,
)
from agent_box.work_core.services import ExecutionService, WorkService


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()


def _repo(path: Path) -> Path:
    path.mkdir()
    _git(path, "init", "-b", "main")
    _git(path, "config", "user.name", "Agent-Box Test")
    _git(path, "config", "user.email", "agent-box@example.invalid")
    (path / "README.md").write_text("one\n", encoding="utf-8")
    _git(path, "add", "README.md")
    _git(path, "commit", "-m", "initial")
    return path


class SliceExecutionProvider:
    def descriptor(self):
        from agent_box.work_core.registry import ProviderDescriptor

        return ProviderDescriptor("slice-execution", "Slice Executor", "test")

    def capabilities(self):
        return {"start": "supported", "observe": "supported"}

    def input_limits(self):
        return {
            WorkspaceV1.contract_id: (1, 1),
            PromptFragmentV1.contract_id: (0, None),
        }

    def start(self, request):
        assert isinstance(request, ExecutionStartRequest)
        return ExecutionStartReceipt(
            request.execution_id, request.dispatch_id, request.inputs_digest
        )

    def observe(self, native_ref):
        return native_ref


def _observation(ref, *, contract_id, kind, result, role, observer_id, coverage, detail=None, observed_at=None):
    return ResourceObservation(
        contract_id=contract_id,
        ref=ref,
        kind=ResourceObservationKind(kind),
        result=ResourceObservationResult(result),
        observer_role=ResourceObserverRole(role),
        observer_id=observer_id,
        observed_at=observed_at or datetime.now(timezone.utc),
        coverage=ResourceObservationCoverage(coverage),
        detail=detail,
    )


def _workspace_read_back(workspace_ref, workspace, *, result, observed_at=None):
    """One host read-back of the actual materialized HEAD/tree."""
    snapshot_head = _git(workspace.path, "rev-parse", "HEAD^{commit}")
    frozen_head = workspace_ref.native_id
    detail = f"rev-parse HEAD^{commit_word()} == {snapshot_head[:12]}"
    assert (snapshot_head == frozen_head) is (result == "match")
    return _observation(
        workspace_ref,
        contract_id=WorkspaceV1.contract_id,
        kind="read_back",
        result=result,
        role="host_observer",
        observer_id="git-rev-parse",
        coverage="complete",
        detail=detail,
        observed_at=observed_at,
    )


def commit_word():
    return "commit"


def test_frozen_git_and_prompt_inputs_produce_honest_post_run_observations(tmp_path, tmp_agent_box_home):
    repo_dir = _repo(tmp_path / "repo")
    workspace_provider = GitWorktreeResourceProvider(repo_dir, tmp_path / "worktrees")
    prompt_provider = ArtifactPromptResourceProvider()

    prompt_path = tmp_path / "context.md"
    prompt_path.write_text("investigate calmly\n", encoding="utf-8")
    unobserved_path = tmp_path / "appendix.md"
    unobserved_path.write_text("never observed appendix\n", encoding="utf-8")

    workspace_ref = workspace_provider.make_ref("main", materialization_key="slice-obs-1")
    prompt_ref = prompt_provider.make_ref(prompt_path, title="Context")
    unobserved_ref = prompt_provider.make_ref(unobserved_path, title="Appendix")

    repo = CoreRepository()
    work = WorkService(repo).create_work("real resource observation slice")
    service = ExecutionService(repo)
    execution = service.create_execution(
        work.id, "slice-execution", responsibility_intent="observe real resources"
    )
    registry = ExtensionRegistry()
    registry.register_execution_provider(SliceExecutionProvider())
    registry.register_resource_provider(workspace_provider)
    registry.register_resource_provider(prompt_provider)
    service.dispatch_execution(
        execution.id,
        (
            (WorkspaceV1.contract_id, workspace_ref),
            (PromptFragmentV1.contract_id, prompt_ref),
            (PromptFragmentV1.contract_id, unobserved_ref),
        ),
        registry,
        "dispatch-slice",
    )
    workspace = workspace_provider.resolve(WorkspaceV1.contract_id, workspace_ref)

    # 1. Post-run read-back of the untouched worktree: READ_BACK / MATCH.
    service.record_resource_observations(
        execution.id,
        (_workspace_read_back(workspace_ref, workspace, result="match"),),
    )
    # 2. Prompt was projected into the run (provider self-report) and its
    #    consumption can never be verified.
    service.record_resource_observations(
        execution.id,
        (
            _observation(
                prompt_ref,
                contract_id=PromptFragmentV1.contract_id,
                kind="projected",
                result="match",
                role="execution_provider",
                observer_id="slice-execution",
                coverage="unknown",
            ),
            _observation(
                prompt_ref,
                contract_id=PromptFragmentV1.contract_id,
                kind="consumption_reported",
                result="unverifiable",
                role="execution_provider",
                observer_id="slice-execution",
                coverage="unknown",
                detail="no observation surface for model consumption",
            ),
        ),
    )

    # 3. Deliberate drift after the read-back: a new commit moves HEAD.
    (workspace.path / "drift.txt").write_text("drift\n", encoding="utf-8")
    _git(workspace.path, "add", "drift.txt")
    _git(workspace.path, "commit", "-m", "drift after read-back")

    # 4. Provider self-report claims everything still matches...
    service.record_resource_observations(
        execution.id,
        (
            _observation(
                workspace_ref,
                contract_id=WorkspaceV1.contract_id,
                kind="projected",
                result="match",
                role="execution_provider",
                observer_id="slice-execution",
                coverage="unknown",
            ),
        ),
    )
    # ...but the host read-back now records MISMATCH.  Both claims stay.
    service.record_resource_observations(
        execution.id,
        (_workspace_read_back(workspace_ref, workspace, result="mismatch"),),
    )

    # 5. One frozen input was never observed at all.
    unobserved = repo.list_unobserved_inputs(execution.id)
    assert unobserved == ((PromptFragmentV1.contract_id, unobserved_ref),)

    observations = repo.list_resource_observations(execution.id)
    workspace_rows = [
        item
        for item in observations
        if item.ref.native_id == workspace_ref.native_id
    ]
    # Provider self-report MATCH and host read-back MISMATCH coexist.
    assert [item.result for item in workspace_rows] == ["match", "match", "mismatch"]
    assert workspace_rows[0].observer_role is ResourceObserverRole.HOST_OBSERVER
    assert workspace_rows[1].observer_role is ResourceObserverRole.EXECUTION_PROVIDER
    assert workspace_rows[2].observer_role is ResourceObserverRole.HOST_OBSERVER

    # The terminal projection stays sealed and untouched by observations.
    from agent_box.work_core.finalization import ExecutionFinalizationRequest
    service.apply_finalization(ExecutionFinalizationRequest(
        execution.id, "finish-real-observation", ExecutionProjection(
            Phase.TERMINAL, Outcome.SUCCEEDED, False, Freshness.OBSERVED,
            datetime.now(timezone.utc),
        )))
    service.record_resource_observations(
        execution.id,
        (
            _observation(
                unobserved_ref,
                contract_id=PromptFragmentV1.contract_id,
                kind="read_back",
                result="match",
                role="host_observer",
                observer_id="sha256-recheck",
                coverage="complete",
                detail="artifact digest recomputed after finish",
            ),
        ),
    )
    after = repo.get_execution(execution.id)
    assert after.projection.phase is Phase.TERMINAL
    assert after.projection.outcome is Outcome.SUCCEEDED
    assert repo.list_unobserved_inputs(execution.id) == ()

    # The persisted Core facts remain readable after the provider registry is
    # discarded; only new operations needing that provider are unavailable.
    del registry
    replacement_registry = ExtensionRegistry()
    assert repo.get_execution(execution.id).id == execution.id
    frozen = repo.list_input_refs(execution.id)
    assert (WorkspaceV1.contract_id, workspace_ref) in frozen
    assert repo.list_resource_observations(execution.id)
    assert prompt_ref.native_id
    assert prompt_ref.metadata["title"] == "Context"
    with pytest.raises(ProviderUnavailable, match="git-worktree"):
        replacement_registry.get_resource_provider("git-worktree")

    workspace_provider.cleanup(workspace)
