"""Phase E: Profile-local + Project + EffectiveSkillInventory.

Proves the frozen inventory semantics: central-installed (receipts),
profile-local (unmanaged, preserved), and project skills (worktree-owned,
never imported or modified; clean/dirty/ignored/trust honest).
"""
from __future__ import annotations

from pathlib import Path

from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.native_home.inventory import (
    DISCOVERABLE,
    effective_skill_inventory,
    profile_skill_inventory,
    project_skill_inventory,
)
from agent_box_harnesses.native_home.installer import ProfileSkillInstaller
from agent_box_harnesses.native_home.policy import FIVE_POLICIES
from agent_box_harnesses.native_home.receipts import DRIFTED, UPDATE_AVAILABLE
from agent_box_skills.store import SkillStore

from test_skill_installer import make_skill_tree, source_for, store_with_profile


def test_profile_inventory_lists_central_installed_and_profile_local(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source, expected_revision=1)
    # an unmanaged profile-local skill lives beside the managed one
    home = store.layout("claude-code", "main").native_home
    local = home / ".claude/skills/handmade"
    local.mkdir(parents=True)
    (local / "SKILL.md").write_text("---\nname: handmade\ndescription: local\n---\n", encoding="utf-8")

    inventory = profile_skill_inventory(
        store, store.layout("claude-code", "main"), FIVE_POLICIES["claude-code"],
    )
    by_identity = {entry.identity: entry for entry in inventory.entries}
    assert "review" in by_identity
    assert by_identity["review"].source_kind == "central-installed"
    assert by_identity["review"].claim == "AVAILABLE"
    assert by_identity["review"].state == "INSTALLED"
    # profile-local is discoverable and unmanaged, never auto-imported
    assert by_identity["handmade"].source_kind == "profile-local"
    assert by_identity["handmade"].claim == DISCOVERABLE
    assert by_identity["handmade"].state == "UNMANAGED"


def test_profile_inventory_reports_drift_and_update_available(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src", version="1"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source, expected_revision=1)
    layout = store.layout("claude-code", "main")
    target = layout.native_home / ".claude/skills/review"
    original = (target / "SKILL.md").read_text()
    (target / "SKILL.md").write_text("---\nname: review\ndescription: hacked\n---\n", encoding="utf-8")
    inventory = profile_skill_inventory(store, layout, FIVE_POLICIES["claude-code"])
    review = next(e for e in inventory.entries if e.identity == "review")
    assert review.state == DRIFTED
    # update availability requires a clean install + a central_latest map
    (target / "SKILL.md").write_text(original)
    inventory2 = profile_skill_inventory(
        store, layout, FIVE_POLICIES["claude-code"], central_latest={"review": 99},
    )
    review2 = next(e for e in inventory2.entries if e.identity == "review")
    assert review2.state == UPDATE_AVAILABLE


def test_project_skill_inventory_uses_worktree_and_marks_dirty(tmp_path):
    import subprocess

    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "t@t"], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "t"], check=True, capture_output=True)
    skill = repo / ".claude/skills/proj"
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text("---\nname: proj\ndescription: d\n---\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(repo), "add", ".claude/skills/proj"], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "add skill"], check=True, capture_output=True)
    commit = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

    identities = project_skill_inventory(repo, "claude-code", FIVE_POLICIES["claude-code"])
    assert len(identities) == 1
    proj = identities[0]
    assert proj.relative_path == ".claude/skills/proj"
    assert proj.git_commit == commit
    assert proj.dirty is False
    assert proj.trust_state == "untrusted"
    assert proj.tree_digest.startswith("sha256:")
    # a dirty worktree is marked, never pretended reproducible
    (skill / "SKILL.md").write_text("---\nname: proj\ndescription: changed\n---\n", encoding="utf-8")
    identities = project_skill_inventory(repo, "claude-code", FIVE_POLICIES["claude-code"])
    assert identities[0].dirty is True


def test_effective_skill_inventory_binds_profile_and_project_without_paths_or_secrets(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source, expected_revision=1)
    layout = store.layout("claude-code", "main")
    # a credential file inside the native home must never leak into inventory
    (layout.native_home / ".claude/.credentials.json").write_text("SECRET")
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    proj = workspace / ".claude/skills/pw"
    proj.mkdir(parents=True)
    (proj / "SKILL.md").write_text("---\nname: pw\ndescription: d\n---\n", encoding="utf-8")

    inventory = effective_skill_inventory(
        store, layout, FIVE_POLICIES["claude-code"], workspace_root=workspace,
    )
    public = inventory.public()
    assert public["summary"]["total"] >= 2
    assert public["summary"]["by_source"]["central-installed"] == 1
    # no host-absolute private paths, no credentials, bounded
    assert ".credentials.json" not in public["entries"]
    raw = str(public)
    assert "SECRET" not in raw
    assert public["entries"]
    # project skills are DISCOVERABLE only, never CONSUMED
    for entry in public["entries"]:
        assert entry["claim"] in {"AVAILABLE", "DISCOVERABLE", "PROJECTED"}
    # project identities expose worktree-relative ids, never the host root
    for identity in public["project_skills"]:
        assert "repository_identity" not in identity
        assert not identity["relative_path"].startswith("/")


def test_public_receipt_and_native_home_summary_are_path_free_and_secret_free(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source, expected_revision=1)
    layout = store.layout("claude-code", "main")
    (layout.native_home / ".claude/.credentials.json").write_text("SECRET-PLACEHOLDER")
    receipt_public = installer.receipts.get("review").public()
    raw_receipt = str(receipt_public)
    assert "SECRET" not in raw_receipt
    assert receipt_public["native_target"] == ".claude/skills/review"  # guest-relative
    summary = store.native_home_summary("claude-code", "main")
    assert summary["present"] is True
    assert "SECRET" not in str(summary)
    # skipped credential paths are named, never read
    assert any(".credentials.json" in item for item in summary["skipped"])