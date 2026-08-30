"""External Git material provider: exact Refs, detached worktrees, snapshots."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlparse

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor, ResourceResolutionContext


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()


def _sha(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


class GitWorkspaceResourceProvider:
    provider_id = "git-workspace"
    supported_contract_ids = frozenset({WorkspaceV1.contract_id})

    def __init__(self, repo: Path, managed_root: Path) -> None:
        self.repo, self.managed_root = repo.resolve(), managed_root.resolve()
        if not (self.repo / ".git").exists():
            raise ValueError(f"not a Git repository: {self.repo}")
        self.managed_root.mkdir(parents=True, exist_ok=True)

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Git detached workspace", "1")

    def make_ref(self, selector: str) -> Ref:
        commit = _git(self.repo, "rev-parse", f"{selector}^{{commit}}")
        tree = _git(self.repo, "rev-parse", f"{commit}^{{tree}}")
        return Ref(RefType.WORKSPACE, self.provider_id, commit, self.repo.as_uri(), {"tree": tree})

    def resolve(self, contract_id: str, ref: Ref, *, context: ResourceResolutionContext | None = None) -> WorkspaceV1:
        if contract_id != WorkspaceV1.contract_id or ref.type is not RefType.WORKSPACE:
            raise ValueError("Git workspace contract requires WorkspaceRef")
        if Path(unquote(urlparse(ref.uri or "").path)).resolve() != self.repo:
            raise ValueError("WorkspaceRef repository authority mismatch")
        commit = _git(self.repo, "rev-parse", f"{ref.native_id}^{{commit}}")
        tree = _git(self.repo, "rev-parse", f"{commit}^{{tree}}")
        if commit != ref.native_id or ref.metadata.get("tree") != tree:
            raise ValueError("WorkspaceRef exact commit/tree mismatch")
        if context is None or not context.execution_id:
            raise ValueError("Git materialization requires execution scope")
        scope = "".join(c if c.isalnum() or c in "-_" else "_" for c in context.execution_id)
        worktree = self.managed_root / scope
        marker = self.managed_root / ".ownership" / f"{scope}.json"
        marker.parent.mkdir(parents=True, exist_ok=True)
        if worktree.exists():
            if not marker.exists() or json.loads(marker.read_text()) != {"execution_id": context.execution_id, "commit": commit, "tree": tree}:
                raise ValueError("existing worktree ownership or identity mismatch")
            if _git(worktree, "rev-parse", "HEAD^{commit}") != commit:
                raise ValueError("existing worktree HEAD differs from frozen commit")
        else:
            _git(self.repo, "worktree", "add", "--detach", str(worktree), commit)
            marker.write_text(json.dumps({"execution_id": context.execution_id, "commit": commit, "tree": tree}, sort_keys=True))
        return WorkspaceV1(worktree, f"git:{commit}")

    def capture(self, *, execution_id: str, workspace: WorkspaceV1, frozen_ref: Ref) -> tuple[Ref, tuple[object, ...]]:
        expected = self.managed_root / "".join(c if c.isalnum() or c in "-_" else "_" for c in execution_id)
        if workspace.path.resolve() != expected or not workspace.path.exists():
            raise ValueError("workspace is not the execution-owned managed worktree")
        head = _git(workspace.path, "rev-parse", "HEAD^{commit}")
        if head != frozen_ref.native_id:
            raise ValueError("worktree HEAD drifted from frozen input commit")
        _git(workspace.path, "add", "-A")
        tree = _git(workspace.path, "write-tree")
        existing = _git(self.repo, "show-ref", "--hash", f"refs/agent-box/executions/{execution_id}/output") if self._has_ref(execution_id) else ""
        if existing:
            if _git(self.repo, "rev-parse", f"{existing}^{{tree}}") != tree:
                raise ValueError("internal output ref conflicts with current captured tree")
            commit = existing
        elif tree == _git(self.repo, "rev-parse", f"{frozen_ref.native_id}^{{tree}}"):
            commit = frozen_ref.native_id
        else:
            commit = subprocess.run(["git", "-C", str(self.repo), "commit-tree", tree, "-p", frozen_ref.native_id], input=f"Agent-Box execution output {execution_id}\n", text=True, check=True, stdout=subprocess.PIPE).stdout.strip()
        if not existing:
            _git(self.repo, "update-ref", f"refs/agent-box/executions/{execution_id}/output", commit)
        return Ref(RefType.WORKSPACE, self.provider_id, commit, self.repo.as_uri(), {"tree": tree, "base_commit": frozen_ref.native_id}), ()

    def _has_ref(self, execution_id: str) -> bool:
        return subprocess.run(["git", "-C", str(self.repo), "show-ref", "--verify", "--quiet", f"refs/agent-box/executions/{execution_id}/output"]).returncode == 0

    def cleanup(self, execution_id: str) -> None:
        scope = "".join(c if c.isalnum() or c in "-_" else "_" for c in execution_id)
        worktree, marker = self.managed_root / scope, self.managed_root / ".ownership" / f"{scope}.json"
        if worktree.resolve().parent != self.managed_root or not marker.exists():
            raise ValueError("refusing to clean unowned worktree")
        _git(self.repo, "worktree", "remove", "--force", str(worktree))
        marker.unlink()
