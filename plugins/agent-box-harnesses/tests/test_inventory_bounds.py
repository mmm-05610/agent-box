"""EffectiveSkillInventory adversarial bounds: over-limit derivation and
honest UNKNOWN semantics (git failure never pretends clean)."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.native_home.inventory import (
    MAX_PROJECT_SKILL_DEPTH,
    MAX_PROJECT_SKILL_FILE_BYTES,
    MAX_PROJECT_SKILL_FILES,
    OVER_LIMIT,
    UNSUPPORTED,
    UNKNOWN,
    effective_skill_inventory,
    project_skill_inventory,
)
from agent_box_harnesses.native_home.policy import CLAUDE_POLICY, FIVE_POLICIES


def _workspace_with_skill(tmp_path: Path, name: str = "proj") -> Path:
    workspace = tmp_path / "workspace"
    skill = workspace / ".claude" / "skills" / name
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text(f"---\nname: {name}\ndescription: d\n---\n", encoding="utf-8")
    return workspace


def test_oversized_file_is_over_limit_not_fake_reproducible(tmp_path):
    workspace = _workspace_with_skill(tmp_path)
    big = workspace / ".claude" / "skills" / "proj" / "big.bin"
    big.write_bytes(b"\x00" * (MAX_PROJECT_SKILL_FILE_BYTES + 1))
    identities = project_skill_inventory(workspace, "claude-code", CLAUDE_POLICY)
    assert len(identities) == 1
    # bounded: no digest claimed, typed warning, never a fake digest
    assert identities[0].tree_digest == ""
    assert any("limit" in w for w in identities[0].digest_warnings)

    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES)
    store.put("claude-code", {"profile_id": "main", "native_payload": {}})
    inventory = effective_skill_inventory(
        store, store.layout("claude-code", "main"), CLAUDE_POLICY, workspace_root=workspace,
    )
    entry = inventory.entries[0]
    assert entry.state == OVER_LIMIT
    assert entry.digest == ""
    assert inventory.public()["warnings"]


def test_too_many_files_is_over_limit(tmp_path):
    workspace = _workspace_with_skill(tmp_path)
    for index in range(MAX_PROJECT_SKILL_FILES + 1):
        (workspace / ".claude" / "skills" / "proj" / f"f{index}.txt").write_text("x")
    identities = project_skill_inventory(workspace, "claude-code", CLAUDE_POLICY)
    assert identities[0].tree_digest == ""
    assert any("count" in w for w in identities[0].digest_warnings)


def test_overdeep_directory_is_over_limit(tmp_path):
    workspace = _workspace_with_skill(tmp_path)
    deep = workspace / ".claude" / "skills" / "proj"
    for _ in range(MAX_PROJECT_SKILL_DEPTH + 1):
        deep = deep / "d"
    deep.mkdir(parents=True)
    (deep / "x.txt").write_text("x")
    identities = project_skill_inventory(workspace, "claude-code", CLAUDE_POLICY)
    assert identities[0].tree_digest == ""
    assert any("depth" in w for w in identities[0].digest_warnings)


def test_symlink_is_unsupported_not_followed(tmp_path):
    workspace = _workspace_with_skill(tmp_path)
    skill = workspace / ".claude" / "skills" / "proj"
    (skill / "link.md").symlink_to(skill / "SKILL.md")
    identities = project_skill_inventory(workspace, "claude-code", CLAUDE_POLICY)
    assert identities[0].tree_digest == ""
    assert any("symlink" in w for w in identities[0].digest_warnings)

    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES)
    store.put("claude-code", {"profile_id": "main", "native_payload": {}})
    inventory = effective_skill_inventory(
        store, store.layout("claude-code", "main"), CLAUDE_POLICY, workspace_root=workspace,
    )
    assert any(e.state == UNSUPPORTED for e in inventory.entries)


def test_non_git_workspace_reports_unknown_never_clean(tmp_path):
    workspace = _workspace_with_skill(tmp_path)
    identities = project_skill_inventory(workspace, "claude-code", CLAUDE_POLICY)
    assert len(identities) == 1
    # no git: commit and dirty stay None (UNKNOWN), tree digest still exact
    assert identities[0].git_commit is None
    assert identities[0].dirty is None
    assert identities[0].tree_digest.startswith("sha256:")

    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES)
    store.put("claude-code", {"profile_id": "main", "native_payload": {}})
    inventory = effective_skill_inventory(
        store, store.layout("claude-code", "main"), CLAUDE_POLICY, workspace_root=workspace,
    )
    entry = next(e for e in inventory.entries if e.source_kind == "project")
    assert entry.state == UNKNOWN
    assert entry.digest.startswith("sha256:")  # content digest is still exact


def test_git_failure_reports_unknown(tmp_path, monkeypatch):
    workspace = _workspace_with_skill(tmp_path)
    import subprocess

    def broken(*_args, **_kwargs):
        raise subprocess.TimeoutExpired(cmd="git", timeout=1)

    monkeypatch.setattr("agent_box_harnesses.native_home.inventory.subprocess.run", broken)
    identities = project_skill_inventory(workspace, "claude-code", CLAUDE_POLICY)
    assert identities[0].dirty is None
    assert identities[0].git_commit is None
    monkeypatch.undo()
    # restored git facts are not falsified either way
    identities = project_skill_inventory(workspace, "claude-code", CLAUDE_POLICY)
    assert identities[0].dirty is False if identities[0].git_commit else identities[0].dirty is None


def test_public_serialization_has_no_host_paths_and_stays_bounded(tmp_path):
    import subprocess

    workspace = _workspace_with_skill(tmp_path)
    subprocess.run(["git", "init", "-q", str(workspace)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(workspace), "config", "user.email", "t@t"], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(workspace), "config", "user.name", "t"], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(workspace), "add", ".claude"], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(workspace), "commit", "-qm", "skill"], check=True, capture_output=True)
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES)
    store.put("claude-code", {"profile_id": "main", "native_payload": {}})
    inventory = effective_skill_inventory(
        store, store.layout("claude-code", "main"), CLAUDE_POLICY, workspace_root=workspace,
    )
    public_dict = inventory.public()
    public = str(public_dict)
    assert str(workspace.resolve()) not in public
    assert str(tmp_path.resolve()) not in public
    # bounded fields: no entry detail exceeds the cap
    for entry in inventory.public()["entries"]:
        assert len(entry["detail"]) <= 256
        assert len(entry["identity"]) <= 96