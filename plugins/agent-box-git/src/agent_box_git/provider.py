"""External Git material provider: exact Refs, detached worktrees, snapshots."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlparse

from agent_box.extensions.runtime_composition import CompositionErrorCode, CompositionRejected
from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor, ResourceResolutionContext

from agent_box_git.workspace_errors import GitWorkspaceErrorCode, GitWorkspaceRejected


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
            raise GitWorkspaceRejected(GitWorkspaceErrorCode.REPOSITORY_INVALID, "not a Git repository")
        self.managed_root.mkdir(parents=True, exist_ok=True)

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Git detached workspace", "1")

    def make_ref(self, selector: str) -> Ref:
        commit = _git(self.repo, "rev-parse", f"{selector}^{{commit}}")
        tree = _git(self.repo, "rev-parse", f"{commit}^{{tree}}")
        return Ref(RefType.WORKSPACE, self.provider_id, commit, self.repo.as_uri(), {"tree": tree})

    def resolve(self, contract_id: str, ref: Ref, *, context: ResourceResolutionContext | None = None) -> WorkspaceV1:
        if contract_id != WorkspaceV1.contract_id or ref.type is not RefType.WORKSPACE:
            raise CompositionRejected(CompositionErrorCode.INVALID_BINDING, "Git workspace contract requires WorkspaceRef")
        if Path(unquote(urlparse(ref.uri or "").path)).resolve() != self.repo:
            raise GitWorkspaceRejected(GitWorkspaceErrorCode.AUTHORITY_MISMATCH, "WorkspaceRef repository authority mismatch")
        commit = _git(self.repo, "rev-parse", f"{ref.native_id}^{{commit}}")
        tree = _git(self.repo, "rev-parse", f"{commit}^{{tree}}")
        if commit != ref.native_id or ref.metadata.get("tree") != tree:
            raise GitWorkspaceRejected(GitWorkspaceErrorCode.EXACT_REF_MISMATCH, "WorkspaceRef exact commit/tree mismatch")
        if context is None or not context.execution_id:
            raise GitWorkspaceRejected(GitWorkspaceErrorCode.EXECUTION_SCOPE_MISSING, "Git materialization requires execution scope")
        scope = "".join(c if c.isalnum() or c in "-_" else "_" for c in context.execution_id)
        worktree = self.managed_root / scope
        marker = self.managed_root / ".ownership" / f"{scope}.json"
        marker.parent.mkdir(parents=True, exist_ok=True)
        if worktree.exists():
            if not marker.exists() or json.loads(marker.read_text()) != {"execution_id": context.execution_id, "commit": commit, "tree": tree}:
                raise GitWorkspaceRejected(GitWorkspaceErrorCode.OWNERSHIP_CONFLICT, "existing worktree ownership or identity mismatch")
            if _git(worktree, "rev-parse", "HEAD^{commit}") != commit:
                raise GitWorkspaceRejected(GitWorkspaceErrorCode.WORKSPACE_DRIFT, "existing worktree HEAD differs from frozen commit")
        else:
            # Claim before creating: a marker that precedes the worktree is the
            # safe direction to crash in (cleanup() tolerates marker-without-
            # worktree), while a worktree that precedes its marker is an
            # unowned orphan that can never be reclaimed and blocks re-resolution.
            identity = json.dumps({"execution_id": context.execution_id, "commit": commit, "tree": tree}, sort_keys=True)
            if marker.exists() and json.loads(marker.read_text()) != {"execution_id": context.execution_id, "commit": commit, "tree": tree}:
                raise GitWorkspaceRejected(GitWorkspaceErrorCode.OWNERSHIP_CONFLICT, "existing worktree ownership or identity mismatch")
            claimed = not marker.exists()
            marker.write_text(identity)
            try:
                _git(self.repo, "worktree", "add", "--detach", str(worktree), commit)
            except BaseException:
                # Roll back the creation and not only the claim: a failed add can
                # leave the directory behind.  The marker is dropped only once the
                # worktree is provably gone, so a half-created worktree is never
                # abandoned unowned - it stays reclaimable by cleanup().  A
                # concurrent resolver's marker is never ours to remove.
                if worktree.exists():
                    try:
                        _git(self.repo, "worktree", "remove", "--force", str(worktree))
                    except BaseException:
                        pass
                if claimed and not worktree.exists() and marker.exists() and marker.read_text() == identity:
                    marker.unlink()
                raise
        return WorkspaceV1(worktree, f"git:{commit}")

    def capture(self, *, execution_id: str, workspace: WorkspaceV1, frozen_ref: Ref) -> tuple[Ref, tuple[object, ...]]:
        expected = self.managed_root / "".join(c if c.isalnum() or c in "-_" else "_" for c in execution_id)
        if workspace.path.resolve() != expected or not workspace.path.exists():
            raise GitWorkspaceRejected(GitWorkspaceErrorCode.OWNERSHIP_CONFLICT, "workspace is not the execution-owned managed worktree")
        head = _git(workspace.path, "rev-parse", "HEAD^{commit}")
        if head != frozen_ref.native_id:
            raise GitWorkspaceRejected(GitWorkspaceErrorCode.WORKSPACE_DRIFT, "worktree HEAD drifted from frozen input commit")
        _git(workspace.path, "add", "-A")
        tree = _git(workspace.path, "write-tree")
        existing = _git(self.repo, "show-ref", "--hash", f"refs/agent-box/executions/{execution_id}/output") if self._has_ref(execution_id) else ""
        base_tree = _git(self.repo, "rev-parse", f"{frozen_ref.native_id}^{{tree}}")
        if tree == base_tree:
            raise GitWorkspaceRejected(GitWorkspaceErrorCode.NO_WORKSPACE_CHANGES)
        if existing:
            if _git(self.repo, "rev-parse", f"{existing}^{{tree}}") != tree:
                raise GitWorkspaceRejected(GitWorkspaceErrorCode.OUTPUT_REF_CONFLICT, "internal output ref conflicts with current captured tree")
            commit = existing
        else:
            commit = subprocess.run(["git", "-C", str(self.repo), "commit-tree", tree, "-p", frozen_ref.native_id], input=f"Agent-Box execution output {execution_id}\n", text=True, check=True, stdout=subprocess.PIPE).stdout.strip()
        if not existing:
            _git(self.repo, "update-ref", f"refs/agent-box/executions/{execution_id}/output", commit)
        return Ref(RefType.WORKSPACE, self.provider_id, commit, self.repo.as_uri(), {"tree": tree, "base_commit": frozen_ref.native_id}), ()

    def _has_ref(self, execution_id: str) -> bool:
        return subprocess.run(["git", "-C", str(self.repo), "show-ref", "--verify", "--quiet", f"refs/agent-box/executions/{execution_id}/output"]).returncode == 0

    def cleanup(self, execution_id: str) -> dict[str, object]:
        scope = "".join(c if c.isalnum() or c in "-_" else "_" for c in execution_id)
        worktree, marker = self.managed_root / scope, self.managed_root / ".ownership" / f"{scope}.json"
        if worktree.resolve().parent != self.managed_root:
            raise GitWorkspaceRejected(GitWorkspaceErrorCode.UNOWNED_RESOURCE, "refusing to clean unowned worktree")
        if not marker.exists():
            # Double release: the managed worktree and its ownership marker are
            # both gone, so the cleaned state is already reached — this is a
            # no-op, not an error.  A worktree that is still present without a
            # marker is unowned and stays refused: idempotency is never an
            # excuse to delete a resource this provider never took ownership of.
            if not worktree.exists():
                return {"status": "already_cleaned"}
            raise GitWorkspaceRejected(GitWorkspaceErrorCode.UNOWNED_RESOURCE, "refusing to clean unowned worktree")
        # Owned (marker present).  Remove the worktree first and the marker last,
        # so a mid-sequence failure leaves the marker in place and a retry can
        # still tell this scope is ours and finish the job.  Reversing the order
        # would drop the marker first and strand the worktree as unowned.
        if worktree.exists():
            try:
                _git(self.repo, "worktree", "remove", "--force", str(worktree))
            except (subprocess.SubprocessError, OSError):
                # Fixed status word, not str(exc): the exception text carries the
                # git argv, which includes the caller-controlled execution_id, and
                # a cleanup receipt may reach a log (D14).
                return {"status": {"error": "worktree-removal-failed"}}
        try:
            marker.unlink()
        except OSError:
            return {"status": {"error": "marker-release-failed"}}
        return {"status": "cleaned"}
