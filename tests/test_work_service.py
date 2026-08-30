from __future__ import annotations

import json
from pathlib import Path

from agent_box.resources import profile
from agent_box.work.artifacts import FilesystemArtifactProvider
from agent_box.work.models import WorkPhase, WorkStatus
from agent_box.work.providers import SessionResult
from agent_box.work.repository import WorkRepository
from agent_box.work.service import WorkService
from agent_box.work.workflow import FixedPlanExecuteReviewWorkflow


class FakeWorkspaceProvider:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir()
        self.cleaned = False
        self.head = "base"

    def inspect_project(self, path):
        return {
            "kind": "local-git",
            "root": str(Path(path)),
            "base_sha": "base",
            "dirty": False,
        }

    def create(self, work_id, project_ref):
        path = self.root / work_id
        path.mkdir()
        return {
            "kind": "git-worktree",
            "path": str(path),
            "repository_root": project_ref["root"],
            "base_sha": project_ref["base_sha"],
            "branch": f"agent-box/{work_id}",
            "created_by_work": work_id,
        }

    def snapshot(self, workspace_ref):
        return {
            "path": workspace_ref["path"],
            "base_sha": workspace_ref["base_sha"],
            "head_sha": self.head,
            "dirty": False,
            "diff_stat": "",
        }

    def export_patch(self, workspace_ref):
        return {
            "content": "diff --git a/result.py b/result.py\n",
            "base_sha": workspace_ref["base_sha"],
            "head_sha": self.head,
            "included_untracked": [],
            "excluded_runtime_paths": [],
        }

    def cleanup(self, workspace_ref, *, discard_changes=False):
        assert discard_changes is True
        self.cleaned = True
        return {"removed": True, "retained_branch": workspace_ref["branch"]}


class FakeSessionProvider:
    def __init__(self, scripted):
        self.scripted = list(scripted)
        self.created = []
        self.prompts = []
        self.closed = []
        self.cancelled = []

    def probe(self, harness):
        return {
            "transport": "acp",
            "adapter_version": "fake-acp",
            "harness_version": "fake",
            "command": [f"{harness}-acp"],
            "capabilities": {
                "headless": True,
                "terminal": True,
                "user_approval": True,
                "background": True,
            },
        }

    def create_session(self, resolution):
        ref = {
            "provider": "fake-acp",
            "session_id": f"native-{len(self.created) + 1}",
            "harness": resolution.harness,
            "profile_ref": resolution.profile_ref,
            "portable": False,
            "runtime": {
                "protocol_version": 1,
                "harness_name": f"{resolution.harness}-acp",
                "harness_version": "fake-negotiated",
                "model": f"{resolution.harness}-model",
            },
        }
        self.created.append(ref)
        return ref

    def prompt(self, native_session_ref, prompt):
        outcome, content = self.scripted.pop(0)
        self.prompts.append((dict(native_session_ref), prompt))
        return SessionResult(outcome=outcome, content=content)

    def cancel(self, native_session_ref):
        self.cancelled.append(dict(native_session_ref))

    def close(self, native_session_ref):
        self.closed.append(dict(native_session_ref))


def _profiles():
    profile.create("claude-architect", "claude")
    profile.create("codex-coder", "codex")
    profile.create("claude-reviewer", "claude")
    profile.create("deepseek-analyst", "hermes", provider="deepseek")


def _service(tmp_path, scripted):
    sessions = FakeSessionProvider(scripted)
    workspace = FakeWorkspaceProvider(tmp_path / "workspaces")
    service = WorkService(
        WorkRepository(),
        FixedPlanExecuteReviewWorkflow(),
        workspace,
        FilesystemArtifactProvider(tmp_path / "artifacts"),
        sessions,
    )
    return service, sessions, workspace


def test_provider_replacement_continues_without_old_native_session(
    tmp_path, tmp_agent_box_home
):
    _profiles()
    service, sessions, workspace = _service(
        tmp_path,
        [
            ("planned", "initial plan"),
            ("implemented", "first implementation"),
            ("needs_replan", "review: sandbox enforcement is not proven"),
            ("planned", "revised provider-neutral plan"),
            ("implemented", "fixed capability enforcement"),
            ("approved", "review passed"),
        ],
    )
    work = service.create_work(
        work_id="work_e2e",
        objective="give Agent-Box a capability resolver",
        acceptance_criteria=["fail closed for security capability gaps"],
        project_path=str(tmp_path / "project"),
        role_profiles={
            "planner": "claude-architect",
            "executor": "codex-coder",
            "reviewer": "claude-reviewer",
        },
    )

    service.dispatch_next(work.id)
    first_attempt = service.repository.list_attempts(work.id)[0]
    assert first_attempt.effective_resolution.model == "claude-model"
    assert first_attempt.effective_resolution.harness_version == "fake-negotiated"
    service.dispatch_next(work.id)
    service.dispatch_next(work.id)
    assert service.repository.get(work.id).phase is WorkPhase.PLAN

    replaced = service.replace_profile(
        work.id,
        "planner",
        "deepseek-analyst",
        reason="switch Planner to Hermes + DeepSeek",
    )
    assert replaced.role_bindings["planner"].revision == 2
    assert replaced.role_bindings["planner"].profile_ref == "deepseek-analyst"
    replacement_handoff = service.repository.list_handoffs(work.id)[-1]
    replacement_artifact = service.repository.get_artifact(
        replacement_handoff.artifact_id
    )
    replacement_payload = service.artifacts.read_text(replacement_artifact)
    replacement_state = json.loads(
        replacement_payload.split("```json\n", 1)[1].rsplit("\n```", 1)[0]
    )
    assert (
        replacement_state["role_bindings"]["planner"]["profile_ref"]
        == "deepseek-analyst"
    )
    assert replacement_state["provenance"]["attempts"][0]["profile_ref"] == (
        "claude-architect"
    )

    planner_attempt = service.dispatch_next(work.id)
    assert planner_attempt.effective_resolution.harness == "hermes"
    assert planner_attempt.effective_resolution.provider_ref == "deepseek"
    hermes_ref, hermes_prompt = sessions.prompts[3]
    assert hermes_ref["session_id"] != sessions.created[0]["session_id"]
    assert hermes_ref["profile_ref"] == "deepseek-analyst"
    assert "give Agent-Box a capability resolver" in hermes_prompt
    assert "sandbox enforcement is not proven" in hermes_prompt
    assert "review-report" in hermes_prompt
    assert "Latest Handoff Package" in hermes_prompt
    assert "Do not assume access to any prior native session" in hermes_prompt

    service.dispatch_next(work.id)
    service.dispatch_next(work.id)
    completed = service.repository.get(work.id)
    assert completed.phase is WorkPhase.COMPLETE
    assert completed.status is WorkStatus.COMPLETED
    assert completed.final_result["final_attempt_id"]
    patch_artifact = service.repository.get_artifact(
        completed.final_result["patch_artifact_id"]
    )
    assert patch_artifact.kind == "git-patch"
    assert service.artifacts.read_text(patch_artifact).startswith("diff --git")
    assert len(service.repository.list_attempts(work.id)) == 6
    assert [session["harness"] for session in sessions.created] == [
        "claude",
        "codex",
        "claude",
        "hermes",
        "codex",
        "claude",
    ]
    assert len(service.repository.list_handoffs(work.id)) >= 5
    assert any(
        decision.kind == "profile_replacement"
        for decision in service.repository.list_decisions(work.id)
    )

    cleanup = service.cleanup(work.id)
    assert cleanup["removed"] is True
    assert workspace.cleaned is True
    assert service.repository.get(work.id).cleanup_state == "completed"


def test_replacement_cancels_active_attempt_before_rebinding(
    tmp_path, tmp_agent_box_home
):
    _profiles()
    service, sessions, _workspace = _service(tmp_path, [])
    work = service.create_work(
        work_id="work_active_replace",
        objective="replace active planner",
        acceptance_criteria=[],
        project_path=str(tmp_path / "project"),
        role_profiles={
            "planner": "claude-architect",
            "executor": "codex-coder",
            "reviewer": "claude-reviewer",
        },
    )
    resolution = service.resolver.resolve(work, "planner")
    from agent_box.work.models import Attempt, AttemptStatus

    attempt = service.repository.add_attempt(
        Attempt(
            "attempt_active",
            work.id,
            "planner",
            1,
            resolution,
        )
    )
    native_ref = sessions.create_session(resolution)
    service.repository.start_attempt(attempt.id, native_ref)

    service.replace_profile(work.id, "planner", "deepseek-analyst")
    assert sessions.cancelled == [native_ref]
    assert native_ref in sessions.closed
    assert service.repository.get_attempt(attempt.id).status is AttemptStatus.CANCELLED
    assert service.repository.get(work.id).role_bindings["planner"].revision == 2


def test_run_stops_at_waiting(tmp_path, tmp_agent_box_home):
    _profiles()
    service, _sessions, _workspace = _service(
        tmp_path, [("blocked", "need approval")]
    )
    work = service.create_work(
        work_id="work_wait",
        objective="wait safely",
        acceptance_criteria=[],
        project_path=str(tmp_path / "project"),
        role_profiles={
            "planner": "claude-architect",
            "executor": "codex-coder",
            "reviewer": "claude-reviewer",
        },
    )
    waiting = service.run(work.id)
    assert waiting.status is WorkStatus.WAITING
    assert waiting.phase is WorkPhase.PLAN
