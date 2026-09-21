from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.registry import ResourceResolutionContext
from agent_box_git.provider import GitWorkspaceResourceProvider


def _git(path: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(path), *args], check=True, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "repo"
    r.mkdir()
    _git(r, "init", "-q")
    _git(r, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "seed")
    return r


def _provider(repo, tmp_path):
    return GitWorkspaceResourceProvider(repo, tmp_path / "managed")


def _materialize(provider, execution_id="exec-1"):
    ctx = ResourceResolutionContext(execution_id=execution_id)
    provider.resolve(WorkspaceV1.contract_id, provider.make_ref("HEAD"), context=ctx)


def test_cleanup_is_idempotent_on_double_release(repo, tmp_path):
    # P-T1 / D2: releasing an already-cleaned managed worktree is a no-op, not an error.
    provider = _provider(repo, tmp_path)
    _materialize(provider)
    provider.cleanup("exec-1")           # first release removes worktree + marker
    provider.cleanup("exec-1")           # second release must not raise


def test_cleanup_still_refuses_unowned_worktree(repo, tmp_path):
    # Guard preserved: a worktree present without an ownership marker is never deleted.
    provider = _provider(repo, tmp_path)
    _materialize(provider)
    scope = "exec-1"
    marker = provider.managed_root / ".ownership" / f"{scope}.json"
    marker.unlink()                       # drop ownership but leave the worktree on disk
    assert (provider.managed_root / scope).exists()
    with pytest.raises(ValueError, match="refusing to clean unowned worktree"):
        provider.cleanup(scope)
    assert (provider.managed_root / scope).exists()   # untouched: never delete what we no longer own
