"""P-T4 / D10: git cleanup answers in the C-RUNTIME@v1 §2 cleanup family, with fixed status words.

git is a cleanup-family provider (bwrap / git / coordinator aggregate), yet its
`cleanup` returned None. D10 gives it the published shape: cleaned / already_cleaned /
{"error": <fixed word>}. The error words are *named by the failing step*, not str(exc):
the git argv embeds the caller-controlled execution_id, so str(exc) would echo caller
text into a receipt that may reach a log — exactly what D14 forbids. Removal is ordered
worktree-first, marker-last so a mid-sequence failure leaves the marker in place and a
retry can still recognise the scope as owned and finish it. The unowned-worktree and
containment guards are unchanged: idempotency never becomes license to delete a resource
this provider never owned.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.registry import ResourceResolutionContext
from agent_box_git import provider as git_provider
from agent_box_git.provider import GitWorkspaceResourceProvider


def _git(path, *args):
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


def _materialize(provider, execution_id):
    provider.resolve(WorkspaceV1.contract_id, provider.make_ref("HEAD"),
                     context=ResourceResolutionContext(execution_id=execution_id))


def _scope_path(provider, execution_id):
    scope = "".join(c if c.isalnum() or c in "-_" else "_" for c in execution_id)
    return provider.managed_root / scope, provider.managed_root / ".ownership" / f"{scope}.json"


def test_a_real_removal_reports_cleaned_and_removes_both_artifacts(repo, tmp_path):
    provider = _provider(repo, tmp_path)
    _materialize(provider, "exec-1")
    worktree, marker = _scope_path(provider, "exec-1")
    assert provider.cleanup("exec-1") == {"status": "cleaned"}
    assert not worktree.exists() and not marker.exists()


def test_double_release_is_already_cleaned_not_an_error(repo, tmp_path):
    provider = _provider(repo, tmp_path)
    _materialize(provider, "exec-1")
    assert provider.cleanup("exec-1") == {"status": "cleaned"}
    assert provider.cleanup("exec-1") == {"status": "already_cleaned"}
    assert provider.cleanup("exec-1") == {"status": "already_cleaned"}  # stable, not one-shot


def test_worktree_removal_failure_reports_a_fixed_word_and_keeps_the_marker_for_retry(repo, tmp_path, monkeypatch):
    provider = _provider(repo, tmp_path)
    _materialize(provider, "exec-1")
    worktree, marker = _scope_path(provider, "exec-1")
    real_git = git_provider._git

    def fail_worktree_remove(repo_arg, *args):
        if args[:2] == ("worktree", "remove"):
            raise subprocess.CalledProcessError(1, ["git", "worktree", "remove"], "", "simulated")
        return real_git(repo_arg, *args)

    monkeypatch.setattr(git_provider, "_git", fail_worktree_remove)
    assert provider.cleanup("exec-1") == {"status": {"error": "worktree-removal-failed"}}
    assert marker.exists()          # marker retained on purpose: the scope still reads as owned
    monkeypatch.setattr(git_provider, "_git", real_git)
    assert provider.cleanup("exec-1") == {"status": "cleaned"}   # a retry after the fault clears converges
    assert not worktree.exists() and not marker.exists()


def test_marker_release_failure_reports_a_fixed_word_after_the_worktree_is_gone(repo, tmp_path, monkeypatch):
    provider = _provider(repo, tmp_path)
    _materialize(provider, "exec-1")
    worktree, marker = _scope_path(provider, "exec-1")
    real_unlink = Path.unlink

    def fail_marker_unlink(self, *args, **kwargs):
        if self == marker:
            raise OSError(1, "simulated marker release failure")
        return real_unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", fail_marker_unlink)
    assert provider.cleanup("exec-1") == {"status": {"error": "marker-release-failed"}}
    assert not worktree.exists()    # worktree removal succeeded first; only the marker release failed


def test_the_failure_receipt_carries_no_caller_controlled_text(repo, tmp_path, monkeypatch):
    # D10 + D14 together: a hostile/secret-bearing execution_id must not resurface in the
    # cleanup receipt.  A str(exc) error would have embedded the sanitized scope (and via
    # it the raw argv) into the receipt; the fixed word does not.
    provider = _provider(repo, tmp_path)
    execution_id = "exec-SECRET-暗-token"
    _materialize(provider, execution_id)
    real_git = git_provider._git

    def fail_worktree_remove(repo_arg, *args):
        if args[:2] == ("worktree", "remove"):
            raise subprocess.CalledProcessError(1, ["git", "worktree", "remove", str(repo_arg)], "", f"simulated {execution_id}")
        return real_git(repo_arg, *args)

    monkeypatch.setattr(git_provider, "_git", fail_worktree_remove)
    receipt = provider.cleanup(execution_id)
    blob = json.dumps(receipt, ensure_ascii=False)
    assert receipt == {"status": {"error": "worktree-removal-failed"}}
    for leak in ("SECRET", "暗", "token", execution_id):
        assert leak not in blob


def test_the_unowned_worktree_guard_is_not_relaxed_by_the_new_return_shape(repo, tmp_path):
    # Guard preserved: a worktree present without its ownership marker is refused, and the
    # refusal is still an exception (not a swallowed {"error": ...} status).
    provider = _provider(repo, tmp_path)
    _materialize(provider, "exec-1")
    _worktree, marker = _scope_path(provider, "exec-1")
    marker.unlink()
    with pytest.raises(ValueError, match="refusing to clean unowned worktree"):
        provider.cleanup("exec-1")


def test_a_traversal_scope_stays_inert_and_answers_already_cleaned(repo, tmp_path):
    # Containment preserved: sanitization confines the scope to a direct child of
    # managed_root, so nothing outside is reachable; the cleaned no-op is now named.
    provider = _provider(repo, tmp_path)
    assert provider.cleanup("../outside") == {"status": "already_cleaned"}
    assert not (tmp_path / "managed" / "__outside").exists()
