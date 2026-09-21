"""P-T2 / D3: the git materialization failure window leaves nothing unowned."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.registry import ResourceResolutionContext
from agent_box_git import provider as provider_module
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


def _resolve(provider, execution_id="exec-1"):
    return provider.resolve(WorkspaceV1.contract_id, provider.make_ref("HEAD"),
                            context=ResourceResolutionContext(execution_id=execution_id))


def _marker(provider, scope="exec-1"):
    return provider.managed_root / ".ownership" / f"{scope}.json"


def test_ownership_is_claimed_before_the_worktree_is_created(repo, tmp_path, monkeypatch):
    # The window is closed by ordering, not by catching: while `worktree add` is
    # running the marker is already on disk, so there is no instant in which a
    # worktree exists that nobody owns.
    provider = _provider(repo, tmp_path)
    marker = _marker(provider)
    seen: dict = {}
    real = provider_module._git

    def spy(root, *args):
        if args[:2] == ("worktree", "add"):
            seen["claimed_during_add"] = marker.exists()
            seen["identity"] = json.loads(marker.read_text()) if marker.exists() else None
        return real(root, *args)

    monkeypatch.setattr(provider_module, "_git", spy)
    workspace = _resolve(provider)
    assert seen["claimed_during_add"] is True
    assert seen["identity"]["execution_id"] == "exec-1"
    assert workspace.path.exists()


def test_failed_add_rolls_the_worktree_back_and_leaves_no_orphan(repo, tmp_path, monkeypatch):
    # Acceptance case: the worktree was created and the call then failed.  The
    # compensation removes the worktree, releases the claim it wrote in this
    # same call, and re-raises the original error untouched.
    provider = _provider(repo, tmp_path)
    worktree = provider.managed_root / "exec-1"
    marker = _marker(provider)
    real = provider_module._git
    original = subprocess.CalledProcessError(128, ["git", "worktree", "add"], "", "simulated post-creation failure")

    def add_then_fail(root, *args):
        if args[:2] == ("worktree", "add"):
            real(root, *args)                      # a genuine, registered worktree
            raise original
        return real(root, *args)

    monkeypatch.setattr(provider_module, "_git", add_then_fail)
    with pytest.raises(subprocess.CalledProcessError) as caught:
        _resolve(provider)
    assert caught.value is original                # the original failure is what the caller sees
    assert not worktree.exists()                   # rolled back, not orphaned
    assert not marker.exists()                     # claim released
    listed = [line for line in _git(repo, "worktree", "list", "--porcelain").splitlines() if line.startswith("worktree ")]
    assert listed == [f"worktree {repo}"]            # only the main worktree remains registered


def test_failed_add_releases_the_claim_and_the_execution_can_be_retried(repo, tmp_path, monkeypatch):
    provider = _provider(repo, tmp_path)
    marker = _marker(provider)
    real = provider_module._git
    original = subprocess.CalledProcessError(128, ["git", "worktree", "add"], "", "simulated failure")

    def never_create(root, *args):
        if args[:2] == ("worktree", "add"):
            raise original
        return real(root, *args)

    monkeypatch.setattr(provider_module, "_git", never_create)
    with pytest.raises(subprocess.CalledProcessError) as caught:
        _resolve(provider)
    assert caught.value is original
    assert not marker.exists()
    assert not (provider.managed_root / "exec-1").exists()

    monkeypatch.undo()
    assert _resolve(provider).path.exists()        # nothing blocked re-resolution


def test_a_marker_we_did_not_write_is_never_clobbered_or_removed(repo, tmp_path):
    # Guard preserved (and previously missing): the create branch used to overwrite
    # any marker file it found.  A marker naming another execution is refused, and
    # the foreign content stays byte-for-byte intact.
    provider = _provider(repo, tmp_path)
    marker = _marker(provider)
    marker.parent.mkdir(parents=True, exist_ok=True)
    foreign = json.dumps({"execution_id": "someone-else", "commit": "c" * 40, "tree": "t" * 40}, sort_keys=True)
    marker.write_text(foreign)
    with pytest.raises(ValueError, match="ownership or identity mismatch"):
        _resolve(provider)
    assert marker.read_text() == foreign
    assert not (provider.managed_root / "exec-1").exists()


def test_a_marker_left_without_its_worktree_is_still_reclaimable(repo, tmp_path):
    # The safe direction to crash in: a claim with no worktree yet is reclaimed by
    # cleanup() (P-T1 semantics) and re-resolved by resolve(), so the pre-created
    # marker can never strand an execution.
    provider = _provider(repo, tmp_path)
    marker = _marker(provider)
    workspace = _resolve(provider)
    assert workspace.path.exists()
    provider.cleanup("exec-1")
    assert not marker.exists() and not (provider.managed_root / "exec-1").exists()
    provider.cleanup("exec-1")                     # double release stays a no-op
    assert _resolve(provider).path.exists()        # and the same execution re-resolves
