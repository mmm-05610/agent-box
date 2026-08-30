"""Concrete Preview ResourceProviders for local Git, files, and profiles.

These adapters own external resolution/materialization semantics.  Work Core
only persists the input Ref and its contract id.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlparse

from ... import config
from ...resource_contracts import AgentBoxProfileV1, PromptFragmentV1, WorkspaceV1
from ...resources.profile import ProfileRepo
from ..models import Ref, RefType
from ..registry import ProviderDescriptor


def _sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _file_uri_path(uri: str | None) -> Path:
    if not uri:
        raise ValueError("file-backed Ref requires uri")
    parsed = urlparse(uri)
    if parsed.scheme != "file" or parsed.netloc not in {"", "localhost"}:
        raise ValueError(f"unsupported file Ref uri: {uri}")
    return Path(unquote(parsed.path)).resolve()


def _git(repo: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return completed.stdout.strip()


class GitWorktreeResourceProvider:
    """Resolve exact Git commits and materialize execution-scoped worktrees."""

    provider_id = "git-worktree"
    supported_contract_ids = frozenset({WorkspaceV1.contract_id})

    def __init__(self, repo: Path, managed_root: Path) -> None:
        self.repo = repo.resolve()
        self.managed_root = managed_root.resolve()
        if not (self.repo / ".git").exists():
            raise ValueError(f"not a Git repository: {self.repo}")
        self.managed_root.mkdir(parents=True, exist_ok=True)

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Git worktree", "1")

    def make_ref(self, selector: str, *, materialization_key: str) -> Ref:
        """Resolve a mutable selector before Binding freeze."""
        commit = _git(self.repo, "rev-parse", f"{selector}^{{commit}}")
        tree = _git(self.repo, "rev-parse", f"{commit}^{{tree}}")
        return Ref(
            RefType.WORKSPACE,
            self.provider_id,
            commit,
            uri=self.repo.as_uri(),
            metadata={
                "tree": tree,
                "materialization_key": materialization_key,
            },
        )

    def resolve(self, contract_id: str, ref: Ref) -> WorkspaceV1:
        if contract_id != WorkspaceV1.contract_id:
            raise ValueError(f"unsupported contract: {contract_id}")
        if ref.type is not RefType.WORKSPACE:
            raise ValueError("Git workspace contract requires WorkspaceRef")
        if _file_uri_path(ref.uri) != self.repo:
            raise ValueError("WorkspaceRef repository does not match provider authority")
        commit = _git(self.repo, "rev-parse", f"{ref.native_id}^{{commit}}")
        if commit != ref.native_id:
            raise ValueError("WorkspaceRef native_id is not the resolved exact commit")
        expected_tree = ref.metadata.get("tree")
        actual_tree = _git(self.repo, "rev-parse", f"{commit}^{{tree}}")
        if expected_tree and expected_tree != actual_tree:
            raise ValueError("WorkspaceRef tree no longer matches exact commit")
        key = ref.metadata.get("materialization_key")
        if not key or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for character in key):
            raise ValueError("WorkspaceRef requires a safe materialization_key")
        worktree = self.managed_root / key
        if worktree.exists():
            actual_head = _git(worktree, "rev-parse", "HEAD^{commit}")
            if actual_head != commit:
                raise ValueError("existing worktree HEAD differs from frozen commit")
        else:
            _git(self.repo, "worktree", "add", "--detach", str(worktree), commit)
        actual_head = _git(worktree, "rev-parse", "HEAD^{commit}")
        if actual_head != commit:
            raise ValueError("materialized worktree HEAD differs from frozen commit")
        return WorkspaceV1(worktree, f"git:{commit}")

    def snapshot(self, workspace: WorkspaceV1) -> dict[str, str]:
        path = workspace.path
        head = _git(path, "rev-parse", "HEAD^{commit}")
        tree = _git(path, "rev-parse", "HEAD^{tree}")
        diff = _git(path, "diff", "--binary", "HEAD")
        status = _git(path, "status", "--porcelain=v1")
        tracked_status = _git(
            path, "status", "--porcelain=v1", "--untracked-files=no"
        )
        return {
            "head": head,
            "tree": tree,
            "diff_digest": _sha256(diff.encode("utf-8")),
            "dirty": "true" if bool(status) else "false",
            "tracked_dirty": "true" if bool(tracked_status) else "false",
        }

    def cleanup(self, workspace: WorkspaceV1) -> None:
        if workspace.path.parent != self.managed_root:
            raise ValueError("refusing to clean a worktree outside managed_root")
        _git(self.repo, "worktree", "remove", "--force", str(workspace.path))


class ArtifactPromptResourceProvider:
    """Resolve immutable local text artifacts by SHA-256."""

    provider_id = "artifact-file"
    supported_contract_ids = frozenset({PromptFragmentV1.contract_id})

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Local immutable artifact", "1")

    def make_ref(self, path: Path, *, title: str) -> Ref:
        path = path.resolve()
        digest = _sha256(path.read_bytes())
        return Ref(
            RefType.ARTIFACT,
            self.provider_id,
            digest,
            uri=path.as_uri(),
            metadata={"title": title},
        )

    def resolve(self, contract_id: str, ref: Ref) -> PromptFragmentV1:
        if contract_id != PromptFragmentV1.contract_id:
            raise ValueError(f"unsupported contract: {contract_id}")
        if ref.type is not RefType.ARTIFACT:
            raise ValueError("prompt fragment contract requires ArtifactRef")
        path = _file_uri_path(ref.uri)
        content = path.read_text(encoding="utf-8")
        digest = _sha256(content.encode("utf-8"))
        if digest != ref.native_id:
            raise ValueError("artifact digest differs from frozen ArtifactRef")
        return PromptFragmentV1(ref.metadata.get("title") or path.name, content, digest)


_PROFILE_EXCLUDED_NAMES = frozenset({
    "auth.json",
    ".sandbox_migration",
    "history.jsonl",
    "installation_id",
    "models_cache.json",
    "sessions",
    "shell_snapshots",
    "thread-writer-locks",
    "logs",
    "log",
    "cache",
    "tmp",
    ".tmp",
    "version.json",
})


def _profile_path_is_mutable_or_secret(relative: Path) -> bool:
    if any(part in _PROFILE_EXCLUDED_NAMES for part in relative.parts):
        return True
    name = relative.name
    return (
        ".sqlite" in name
        or name.endswith((".jsonl", ".log"))
        or ".bak" in name
    )


def profile_contract_digest(name: str, meta: dict[str, str] | None = None) -> str:
    """Digest the launch-relevant, non-secret profile configuration surface."""
    meta = meta or ProfileRepo().find_by_name(name)
    agent_type = meta["agent_type"]
    root = config.profile_agent_dir(name, agent_type)
    if not root.is_dir():
        raise ValueError(f"profile config directory is missing: {root}")
    files: list[dict[str, str]] = []
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if _profile_path_is_mutable_or_secret(relative):
            continue
        if path.is_symlink():
            files.append({"path": str(relative), "symlink": str(path.readlink())})
        elif path.is_file():
            files.append({"path": str(relative), "digest": _sha256(path.read_bytes())})
    manifest = {
        "name": name,
        "agent_type": agent_type,
        "provider": meta.get("provider", ""),
        "prompt": meta.get("prompt", ""),
        "files": files,
    }
    encoded = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    return _sha256(encoded)


class AgentBoxProfileResourceProvider:
    """Resolve an Agent-Box profile without exposing credential values."""

    provider_id = "agent-box-profile"
    supported_contract_ids = frozenset({AgentBoxProfileV1.contract_id})

    def __init__(self, repo: ProfileRepo | None = None) -> None:
        self.repo = repo or ProfileRepo()

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Agent-Box profile", "1")

    def make_ref(self, name: str) -> Ref:
        meta = self.repo.find_by_name(name)
        digest = profile_contract_digest(name, meta)
        return Ref(
            RefType.ARTIFACT,
            self.provider_id,
            name,
            metadata={"agent_type": meta["agent_type"], "digest": digest},
        )

    def resolve(self, contract_id: str, ref: Ref) -> AgentBoxProfileV1:
        if contract_id != AgentBoxProfileV1.contract_id:
            raise ValueError(f"unsupported contract: {contract_id}")
        meta = self.repo.find_by_name(ref.native_id)
        digest = profile_contract_digest(ref.native_id, meta)
        expected = ref.metadata.get("digest")
        if not expected or expected != digest:
            raise ValueError("profile configuration differs from frozen ProfileRef")
        if ref.metadata.get("agent_type") != meta["agent_type"]:
            raise ValueError("profile agent type differs from frozen ProfileRef")
        return AgentBoxProfileV1(ref.native_id, meta["agent_type"], digest)


__all__ = [
    "AgentBoxProfileResourceProvider",
    "ArtifactPromptResourceProvider",
    "GitWorktreeResourceProvider",
    "profile_contract_digest",
]
