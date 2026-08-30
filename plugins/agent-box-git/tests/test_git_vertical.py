import subprocess
from pathlib import Path

import pytest
from types import SimpleNamespace

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.registry import ResourceResolutionContext
from agent_box.work_core.models import RefType
from agent_box.work_core.projection import ExecutionProjection, Freshness, Outcome, Phase
from agent_box.work_core.events import CoreEvent, EventType
from agent_box.work_core.repository import CoreRepository, RefRelation
from agent_box.work_core.services import ExecutionService, WorkService
from agent_box.extensions.finalization import HostFinalizationCoordinator
from agent_box_git.contributor import GitFinalizationContributor


@pytest.fixture
def tmp_agent_box_home(tmp_path, monkeypatch):
    from agent_box.core.db import _reset_connection_for_tests
    home = tmp_path / "ab-home"
    home.mkdir()
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    _reset_connection_for_tests()
    yield home
    _reset_connection_for_tests()

from agent_box_git.provider import GitWorkspaceResourceProvider
from agent_box_git.plugin import GitPlugin
from agent_box.extensions import PluginContext


def git(path, *args, input=None):
    return subprocess.run(["git", "-C", str(path), *args], input=input, text=True,
                          check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()


def test_git_registration_contains_the_formal_composition(tmp_path):
    registration = GitPlugin().build(
        PluginContext("1.9.0", tmp_path, tmp_path / "plugins" / "git")
    )
    assert [p.descriptor().id for p in registration.resource_providers] == ["git-workspace"]
    assert [s.id for s in registration.resource_selectors] == ["git-workspace"]
    assert [c.id for c in registration.finalization_contributors] == ["git-workspace"]


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    git(root, "init", "-q")
    git(root, "config", "user.email", "test@example.invalid")
    git(root, "config", "user.name", "Agent Box Test")
    (root / "tracked.txt").write_text("before\n")
    (root / ".gitignore").write_text("ignored.txt\n")
    (root / "binary.bin").write_bytes(b"before\x00\xff")
    git(root, "add", ".")
    git(root, "commit", "-qm", "base")
    return root


def test_detached_capture_and_e2_materialization(repo, tmp_path):
    provider = GitWorkspaceResourceProvider(repo, tmp_path / "managed")
    c0 = git(repo, "rev-parse", "HEAD")
    t0 = git(repo, "rev-parse", "HEAD^{tree}")
    ref = provider.make_ref("HEAD")
    assert ref.native_id == c0 and ref.metadata == {"tree": t0}
    w1 = provider.resolve(WorkspaceV1.contract_id, ref, context=ResourceResolutionContext("E1"))
    assert git(w1.path, "rev-parse", "HEAD") == c0
    assert git(w1.path, "rev-parse", "HEAD^{tree}") == t0

    (w1.path / "tracked.txt").write_text("after\n")
    (w1.path / "deleted.txt").unlink(missing_ok=True)
    (w1.path / "added.txt").write_text("new\n")
    (w1.path / "ignored.txt").write_text("secret\n")
    (w1.path / "binary.bin").write_bytes(b"after\x00\x01\xff")
    (w1.path / "tracked.txt").chmod(0o755)
    output, _ = provider.capture(execution_id="E1", workspace=w1, frozen_ref=ref)
    assert output.type is RefType.WORKSPACE
    c1, t1 = output.native_id, output.metadata["tree"]
    assert git(repo, "show-ref", "--verify", f"refs/agent-box/executions/E1/output").startswith(c1)
    assert git(repo, "rev-parse", f"{c1}^{{tree}}") == t1
    assert git(repo, "branch", "--show-current") == "main" or git(repo, "branch", "--show-current") == "master"
    assert "ignored.txt" not in git(repo, "ls-tree", "-r", "--name-only", c1)
    assert "added.txt" in git(repo, "ls-tree", "-r", "--name-only", c1)

    w2 = provider.resolve(WorkspaceV1.contract_id, output, context=ResourceResolutionContext("E2"))
    assert w2.path != w1.path
    assert git(w2.path, "rev-parse", "HEAD") == c1
    assert git(w2.path, "rev-parse", "HEAD^{tree}") == t1
    (w2.path / "added.txt").write_text("E2 change\n")
    assert (w1.path / "added.txt").read_text() == "new\n"


def test_empty_capture_reuses_base_and_cleanup_keeps_output(repo, tmp_path):
    provider = GitWorkspaceResourceProvider(repo, tmp_path / "managed")
    ref = provider.make_ref("HEAD")
    w1 = provider.resolve(WorkspaceV1.contract_id, ref, context=ResourceResolutionContext("E1"))
    output, _ = provider.capture(execution_id="E1", workspace=w1, frozen_ref=ref)
    assert output.native_id == ref.native_id
    assert git(repo, "show-ref", "--verify", "refs/agent-box/executions/E1/output")
    provider.cleanup("E1")
    assert git(repo, "cat-file", "-t", output.native_id) == "commit"
    with pytest.raises(ValueError):
        provider.cleanup("../outside")


def test_host_neutral_coordinator_commits_git_contribution_to_core(repo, tmp_path, tmp_agent_box_home):
    provider = GitWorkspaceResourceProvider(repo, tmp_path / "managed")
    core = CoreRepository()
    work = WorkService(core).create_work("host-neutral handoff")
    execution = ExecutionService(core).create_execution(work.id, "test", responsibility_intent="finish")
    ref = provider.make_ref("HEAD")
    core.attach_ref(execution.id, RefRelation.INPUT, ref,
                    CoreEvent("input-host", EventType.REF_ATTACHED, execution.id, execution.created_at, {"contract_id": WorkspaceV1.contract_id}),
                    contract_id=WorkspaceV1.contract_id)
    class Registry:
        def get_resource_provider(self, provider_id):
            assert provider_id == provider.provider_id
            return provider
    w1 = provider.resolve(WorkspaceV1.contract_id, ref, context=ResourceResolutionContext(execution.id))
    (w1.path / "host.txt").write_text("captured\n")
    terminal = SimpleNamespace(projection=ExecutionProjection(
        Phase.TERMINAL, Outcome.SUCCEEDED, False, Freshness.OBSERVED,
        execution.created_at), native_refs=(), output_refs=(), resource_observations=())
    facts = SimpleNamespace(execution=execution, dispatch=None, inputs=((WorkspaceV1.contract_id, ref),))
    receipt = HostFinalizationCoordinator(ExecutionService(core), Registry(), (GitFinalizationContributor(provider),)).finalize(
        facts, terminal, idempotency_key="host-finish-1")
    outputs = core.list_refs(execution.id, RefRelation.OUTPUT)
    assert receipt.execution_version == 1
    assert len(outputs) == 1 and outputs[0].native_id != ref.native_id
    assert core.get_execution(execution.id).projection.phase.value == "terminal"
