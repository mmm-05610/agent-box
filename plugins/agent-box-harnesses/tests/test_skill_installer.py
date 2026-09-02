"""Phase C: Skill installation backend — receipts, transaction, drift, concurrency.

Proves the frozen installation semantics: default copy, no script execution,
no unmanaged clobber, no Profile-local clobber, install/update/remove/
rollback through one transaction, typed drift/conflict/recovery, mutation
lease single-writer, and revision binding (install -> new Profile revision).
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest

from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.native_home.failures import (
    PROFILE_MUTATION_LEASE_CONFLICT,
    PROFILE_REVISION_CONFLICT,
    SKILL_INSTALL_DIGEST_MISMATCH,
    SKILL_INSTALL_DRIFTED,
    SKILL_INSTALL_RECOVERY_REQUIRED,
    SKILL_INSTALL_TARGET_CONFLICT,
    SKILL_INSTALL_UNMANAGED_TARGET,
    ProfileNativeHomeError,
    SkillInstallError,
)
from agent_box_harnesses.native_home.installer import (
    ProfileSkillInstaller,
    SkillSource,
)
from agent_box_harnesses.native_home.policy import FIVE_POLICIES
from agent_box_harnesses.native_home.receipts import DRIFTED, ReceiptStore
from agent_box_harnesses.native_home.view import NativeHomeView, ProfileMutationLease, generation_of
from agent_box_skills.store import SkillStore


def make_skill_tree(root: Path, name: str = "review", version: str = "1") -> Path:
    root.mkdir(parents=True, exist_ok=True)
    (root / "SKILL.md").write_text(f"---\nname: {name}\ndescription: d\n---\n# {name} v{version}\n", encoding="utf-8")
    (root / "support.txt").write_text(f"support {version}", encoding="utf-8")
    return root


def store_with_profile(tmp_path: Path, harness: str = "claude-code", pid: str = "main"):
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES)
    store.put(harness, {"profile_id": pid, "native_payload": {}})
    return store


def source_for(store: SkillStore, tree: Path) -> SkillSource:
    skill = store.import_directory(tree)
    resolved = store.resolve(skill.contract_id, store.ref(skill.skill_id))
    from agent_box_harnesses.native_home.installer import skill_source_from_contract

    return skill_source_from_contract(resolved.contract, resolved.source.projection_source())


def test_install_creates_receipt_bumps_revision_and_targets_native_home(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    preview = installer.preview_install(source)
    assert preview["conflicts"] == () and preview["unmanaged"] == ()
    assert preview["native_target"] == ".claude/skills/review"
    receipt = installer.install(source, expected_revision=1)
    assert receipt.skill_id == "review"
    assert receipt.profile_revision == 2
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    assert (target / "SKILL.md").read_text().startswith("---")
    # receipt index + profile revision bound to the receipts digest
    assert ReceiptStore(store.layout("claude-code", "main")).get("review") is not None
    value = store.get("claude-code", "main")
    assert value["revision"] == 2
    assert value["skill_receipts_digest"].startswith("sha256:")
    # the installed skill is discoverable by the harness through the native home
    assert (target / "SKILL.md").exists()


def test_install_verifies_central_digest_and_rejects_tampered_source(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    tree = make_skill_tree(tmp_path / "src")
    source = source_for(skill_store, tree)
    # tamper the RESOLVED immutable source (what the installer reads)
    resolved = skill_store.resolve("agent-box.skill@1", skill_store.ref(source.skill_id, source.revision))
    resolved_path = resolved.source.projection_source()
    (resolved_path / "SKILL.md").write_text("---\nname: review\ndescription: d\n---\n# tampered\n", encoding="utf-8")
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    with pytest.raises(SkillInstallError) as exc:
        installer.install(source, expected_revision=1)
    assert exc.value.code == SKILL_INSTALL_DIGEST_MISMATCH
    # nothing was installed; the profile revision was not bumped
    assert store.get("claude-code", "main")["revision"] == 1
    assert not (store.layout("claude-code", "main").native_home / ".claude/skills/review").exists()


def test_install_refuses_unmanaged_or_conflicting_target(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    target.mkdir(parents=True)
    (target / "user-note.txt").write_text("unmanaged")
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    # a non-empty native target is fail closed: the preview reports the
    # unmanaged file; install rejects the occupied target typed.
    preview = installer.preview_install(source)
    assert "user-note.txt" in preview["unmanaged"]
    with pytest.raises(SkillInstallError) as exc:
        installer.install(source, expected_revision=1)
    assert exc.value.code == SKILL_INSTALL_TARGET_CONFLICT
    assert (target / "user-note.txt").exists()  # never clobbered


def test_double_install_is_target_conflict_and_one_revision_per_profile(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source, expected_revision=1)
    with pytest.raises(SkillInstallError) as exc:
        installer.install(source, expected_revision=2)
    assert exc.value.code == SKILL_INSTALL_TARGET_CONFLICT


def test_update_requires_matching_digest_and_bumps_revision(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    tree = make_skill_tree(tmp_path / "src", version="1")
    source1 = source_for(skill_store, tree)
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source1, expected_revision=1)
    tree2 = make_skill_tree(tmp_path / "src2", version="2")
    source2 = source_for(skill_store, tree2)
    preview = installer.preview_install(source2)
    assert preview["conflicts"] == ()
    installer.update(source2, expected_revision=2)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    assert "v2" in (target / "SKILL.md").read_text()
    assert store.get("claude-code", "main")["revision"] == 3
    assert ReceiptStore(store.layout("claude-code", "main")).get("review").central_revision == source2.revision


def test_update_fails_on_manual_modification_drift(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source1 = source_for(skill_store, make_skill_tree(tmp_path / "src", version="1"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source1, expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    (target / "SKILL.md").write_text("---\nname: review\ndescription: hacked\n---\n", encoding="utf-8")
    source2 = source_for(skill_store, make_skill_tree(tmp_path / "src2", version="2"))
    with pytest.raises(SkillInstallError) as exc:
        installer.update(source2, expected_revision=2)
    assert exc.value.code == SKILL_INSTALL_DRIFTED
    # drift is surfaced by inspect
    assert installer.inspect("review")["state"] == DRIFTED


def test_remove_only_deletes_managed_files_and_is_idempotent(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source, expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    (target / "manual.md").write_text("user")  # unmanaged, must survive
    result = installer.remove("review", expected_revision=2)
    assert result["status"] == "removed"
    assert not (target / "SKILL.md").exists()
    assert (target / "manual.md").exists()  # unmanaged file preserved
    assert store.get("claude-code", "main")["revision"] == 3
    assert installer.remove("review", expected_revision=3)["status"] == "already_absent"


def test_remove_fails_when_manually_modified(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source, expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    (target / "SKILL.md").write_text("---\nname: review\ndescription: hacked\n---\n", encoding="utf-8")
    with pytest.raises(SkillInstallError) as exc:
        installer.remove("review", expected_revision=2)
    assert exc.value.code == SKILL_INSTALL_DRIFTED


def test_install_blocks_while_profile_is_executing(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    layout = store.layout("claude-code", "main")
    view = NativeHomeView(layout, FIVE_POLICIES["claude-code"], execution_id="exec_1", staging_root=tmp_path / "staging")
    view.prepare()
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    with pytest.raises(ProfileNativeHomeError) as exc:
        installer.install(source, expected_revision=1)
    assert exc.value.code == PROFILE_MUTATION_LEASE_CONFLICT
    view.discard()
    installer.install(source, expected_revision=1)  # proceeds after execution ends


def test_revision_conflict_blocks_install(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    store.put("claude-code", {"profile_id": "main", "native_payload": {}}, expected_revision=1)
    with pytest.raises(ProfileNativeHomeError) as exc:
        installer.install(source, expected_revision=1)
    assert exc.value.code == PROFILE_REVISION_CONFLICT


def test_install_rolls_back_on_receipt_write_failure(tmp_path, monkeypatch):
    """Transaction failure after files are replaced but before the revision:
    the files must roll back and no revision may be recorded."""
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")

    def boom(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(installer.receipts, "put", boom)
    with pytest.raises(OSError, match="disk full"):
        installer.install(source, expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    assert not (target / "SKILL.md").exists()  # rolled back
    assert store.get("claude-code", "main")["revision"] == 1
    assert installer.receipts.get("review") is None


def test_install_rolls_back_on_revision_bump_failure(tmp_path, monkeypatch):
    """Transaction failure after the receipt but before the revision bump:
    both the files and the receipt must roll back."""
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")

    def boom(*_args, **_kwargs):
        raise ProfileNativeHomeError(PROFILE_REVISION_CONFLICT, "forced")

    monkeypatch.setattr(store, "record_skill_mutation", boom)
    with pytest.raises(ProfileNativeHomeError):
        installer.install(source, expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    assert not (target / "SKILL.md").exists()
    assert installer.receipts.get("review") is None
    assert store.get("claude-code", "main")["revision"] == 1


def test_pending_journal_blocks_and_recovers_reentry(tmp_path, monkeypatch):
    """An incomplete journal fails closed (RECOVERY_REQUIRED) and re-entry
    recovery rolls it back so a fresh install can proceed."""
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"

    # simulate a crashed install: files applied but receipt/revision/pointer
    # never recorded (a leftover journal stopped at APPLIED)
    txid = "crashed-install"
    journal = {
        "schema_version": 2, "txid": txid, "harness_type": "claude-code",
        "profile_id": "main", "operation": "skill-install", "skill_id": "review",
        "expected_revision": 1, "expected_generation": 0,
        "previous_pointer": dict(store.pointer("claude-code", "main")),
        "proposed_pointer": {}, "pointer_intent_declared": False,
        "receipts_digest_before": "", "receipts_digest_after": "",
        "steps": ["PREPARED", "STAGED", "APPLIED"],
        "applied_files": [f".claude/skills/review/{p}" for p in sorted(source.inventory)],
        "revision_written": None, "pointer_committed": None,
        "backup_dir": None,
        "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00",
    }
    from agent_box_harnesses.native_home.transaction import write_journal

    write_journal(store.layout("claude-code", "main"), journal)
    # a fresh install is blocked fail closed until recovery
    with pytest.raises(SkillInstallError) as exc:
        installer.install(source, expected_revision=1)
    assert exc.value.code == SKILL_INSTALL_RECOVERY_REQUIRED
    outcomes = installer.recover_pending()
    assert outcomes and outcomes[0]["status"] in {"rolled_back", "committed"}
    # recovery re-entry is idempotent; a fresh install now proceeds
    assert installer.recover_pending() == []
    installer.install(source, expected_revision=1)
    assert (target / "SKILL.md").exists()
    assert store.get("claude-code", "main")["revision"] == 2


def test_two_installers_cannot_mutate_same_profile_concurrently(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer_a = ProfileSkillInstaller(store, "claude-code", "main")
    installer_b = ProfileSkillInstaller(store, "claude-code", "main")
    lease = ProfileMutationLease(store.layout("claude-code", "main"))
    lease.acquire("external")
    try:
        with pytest.raises(ProfileNativeHomeError) as exc:
            installer_a.install(source, expected_revision=1)
        assert exc.value.code == PROFILE_MUTATION_LEASE_CONFLICT
    finally:
        lease.release()
    installer_a.install(source, expected_revision=1)


def test_rollback_selects_existing_central_revision(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    tree1 = make_skill_tree(tmp_path / "src1", version="1")
    tree2 = make_skill_tree(tmp_path / "src2", version="2")
    source1 = source_for(skill_store, tree1)
    source2 = source_for(skill_store, tree2)
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source1, expected_revision=1)
    installer.update(source2, expected_revision=2)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    assert "v2" in (target / "SKILL.md").read_text()
    installer.rollback("review", source1, expected_revision=3)
    assert "v1" in (target / "SKILL.md").read_text()
    assert ReceiptStore(store.layout("claude-code", "main")).get("review").central_revision == 1
    assert store.get("claude-code", "main")["revision"] == 4


def test_install_does_not_execute_scripts(tmp_path):
    """Installed content is materialized as files; nothing executes them."""
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    tree = make_skill_tree(tmp_path / "src")
    (tree / "evil.sh").write_text("#!/bin/sh\ntouch /tmp/pwned-agent-box\n", encoding="utf-8")
    source = source_for(skill_store, tree)
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source, expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    assert (target / "evil.sh").exists()  # materialized
    assert not Path("/tmp/pwned-agent-box").exists()  # never executed


def test_active_execution_view_is_never_affected_by_install(tmp_path):
    """Installing a skill does not touch the frozen view of a running launch:
    the active-execution guard blocks the install instead."""
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    layout = store.layout("claude-code", "main")
    view = NativeHomeView(layout, FIVE_POLICIES["claude-code"], execution_id="exec_1", staging_root=tmp_path / "staging")
    view.prepare()
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    with pytest.raises(ProfileNativeHomeError):
        installer.install(source, expected_revision=1)
    view.discard()

# --------------------------------------------------------------------------- #
# F. receipt rollback / journal crash matrix / recovery verification
# --------------------------------------------------------------------------- #

def _receipts_consistent(store, profile_id="main"):
    from agent_box_harnesses.native_home.receipts import ReceiptStore

    layout = store.layout("claude-code", profile_id)
    receipts = ReceiptStore(layout).digest()
    pointer = store.pointer("claude-code", profile_id)
    return receipts == pointer["skill_receipts_digest"] or (receipts == "" and not pointer["skill_receipts_digest"])


def test_update_failure_restores_old_files_and_old_receipt(tmp_path, monkeypatch):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source1 = source_for(skill_store, make_skill_tree(tmp_path / "src", version="1"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source1, expected_revision=1)
    old_receipt = installer.receipts.get("review")
    source2 = source_for(skill_store, make_skill_tree(tmp_path / "src2", version="2"))
    # fail INSIDE the update AFTER files were applied: ReceiptStore.put breaks
    original_put = installer.receipts.put

    def boom(receipt):
        raise OSError("receipt-write-failed")

    monkeypatch.setattr(installer.receipts, "put", boom)
    with pytest.raises(OSError, match="receipt-write-failed"):
        installer.update(source2, expected_revision=2)
    monkeypatch.setattr(installer.receipts, "put", original_put)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    # old files restored, old receipt restored, pointer/revision unchanged
    assert "v1" in (target / "SKILL.md").read_text()
    assert installer.receipts.get("review") == old_receipt
    assert store.get("claude-code", "main")["revision"] == 2
    assert _receipts_consistent(store)


def test_uninstall_failure_restores_receipt_and_files(tmp_path, monkeypatch):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source, expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    # fail AFTER files were deleted, BEFORE the revision bump
    original_bump = installer._bump_revision

    def boom(*args, **kwargs):
        raise OSError("bump-failed")

    monkeypatch.setattr(installer, "_bump_revision", boom)
    with pytest.raises(OSError, match="bump-failed"):
        installer.remove("review", expected_revision=2)
    monkeypatch.setattr(installer, "_bump_revision", original_bump)
    # old receipt AND old files restored; pointer/revision unchanged
    assert installer.receipts.get("review") is not None
    assert (target / "SKILL.md").exists()
    assert store.get("claude-code", "main")["revision"] == 2
    assert store.get("claude-code", "main")["skill_receipts_digest"].startswith("sha256:")
    assert _receipts_consistent(store)


def _write_synthetic_journal(layout, txid, steps, **extra):
    from agent_box_harnesses.native_home.transaction import write_journal

    journal = {
        "schema_version": 2, "txid": txid, "harness_type": "claude-code",
        "profile_id": "main", "operation": "skill-install",
        "expected_revision": 1, "expected_generation": 0,
        "previous_pointer": {}, "proposed_pointer": {},
        "pointer_intent_declared": False,
        "receipts_digest_before": "", "receipts_digest_after": "",
        "steps": steps, "revision_written": None, "pointer_committed": None,
        "backup_dir": None, "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }
    journal.update(extra)
    write_journal(layout, journal)


def test_crash_matrix_recovery_per_step(tmp_path):
    """Crash at every journal step: recovery either rolls back exactly or
    confirms the pointer commit — never a half state."""
    import copy

    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    layout = store.layout("claude-code", "main")
    target = layout.native_home / ".claude/skills/review"
    pointer_v1 = dict(store.pointer("claude-code", "main"))  # pre-install pointer
    applied_files = [f".claude/skills/review/{p}" for p in sorted(source.inventory)]

    def stage_crash(txid):
        staged_root = layout.transactions / txid / "staged" / ".claude" / "skills" / "review"
        if target.is_dir():
            shutil.copytree(target, staged_root)
        return staged_root

    def restore_pointer(pointer):
        import json as _json

        layout.profile_json.write_text(_json.dumps(pointer, sort_keys=True))

    # 1) crash right after APPLIED: files + receipts in place, pointer still v1
    installer.install(source, expected_revision=1)  # creates the applied state
    restore_pointer(pointer_v1)                     # rewind visibility to v1
    import shutil as _shutil

    _shutil.rmtree(layout.revision_dir(2), ignore_errors=True)  # crash before REVISION
    (layout.transactions / "crash-applied").mkdir(parents=True)
    (layout.transactions / "crash-applied" / "receipts.before.json").write_bytes(b"")
    stage_crash("crash-applied")
    _write_synthetic_journal(layout, "crash-applied",
                             ["PREPARED", "STAGED", "APPLIED"],
                             expected_revision=1,
                             previous_pointer=dict(pointer_v1),
                             applied_files=applied_files,
                             receipts_digest_after=installer.receipts.digest())
    outcomes = installer.recover_pending()
    assert outcomes[0]["status"] == "rolled_back"
    assert not (target / "SKILL.md").exists()          # files rolled back
    assert installer.receipts.get("review") is None    # receipt absence restored
    assert store.get("claude-code", "main")["revision"] == 1
    assert _receipts_consistent(store)

    # 2) crash right after REVISION_WRITTEN: revision dir exists, pointer still v1
    installer.install(source, expected_revision=1)
    restore_pointer(dict(pointer_v1))
    (layout.transactions / "crash-revision").mkdir(parents=True)
    (layout.transactions / "crash-revision" / "receipts.before.json").write_bytes(b"")
    stage_crash("crash-revision")
    _write_synthetic_journal(layout, "crash-revision",
                             ["PREPARED", "STAGED", "APPLIED", "REVISION_WRITTEN"],
                             expected_revision=1, revision_written=2,
                             previous_pointer=dict(pointer_v1),
                             applied_files=applied_files,
                             receipts_digest_after=installer.receipts.digest())
    outcomes = installer.recover_pending()
    assert outcomes[0]["status"] == "rolled_back"
    assert not layout.revision_dir(2).exists()         # revision dir removed
    assert not (target / "SKILL.md").exists()
    assert installer.receipts.get("review") is None
    assert store.get("claude-code", "main")["revision"] == 1
    assert _receipts_consistent(store)

    # 3) crash after POINTER_COMMITTED: the mutation IS committed; recovery
    #    must verify and complete, never roll back a visible commit
    installer.install(source, expected_revision=1)     # r2 committed
    pointer3 = store.pointer("claude-code", "main")
    envelope3 = store.get("claude-code", "main")
    (layout.transactions / "crash-pointer").mkdir(parents=True)
    (layout.transactions / "crash-pointer" / "receipts.before.json").write_bytes(b"")
    _write_synthetic_journal(layout, "crash-pointer",
                             ["PREPARED", "STAGED", "APPLIED", "REVISION_WRITTEN", "POINTER_COMMITTED"],
                             expected_revision=2, revision_written=2, pointer_committed=2,
                             pointer_intent_declared=True, proposed_pointer=dict(pointer3),
                             previous_pointer=dict(pointer_v1),
                             applied_files=applied_files,
                             receipts_digest_after=installer.receipts.digest())
    outcomes = installer.recover_pending()
    assert outcomes[0]["status"] == "committed"
    assert store.get("claude-code", "main")["revision"] == 2
    assert (target / "SKILL.md").exists()
    assert store.pointer("claude-code", "main")["digest"] == pointer3["digest"]
    assert _receipts_consistent(store)

    # 4) a FALSE committed journal (files+receipts but pointer NOT moved)
    #    must NOT be marked committed — it rolls back
    (layout.transactions / "crash-fake-committed").mkdir(parents=True)
    (layout.transactions / "crash-fake-committed" / "receipts.before.json").write_bytes(b"")
    fake_proposed = dict(pointer3)
    fake_proposed["digest"] = "sha256:" + "0" * 64  # intent that never landed
    _write_synthetic_journal(layout, "crash-fake-committed",
                             ["PREPARED", "STAGED", "APPLIED", "REVISION_WRITTEN", "POINTER_COMMITTED"],
                             expected_revision=2, revision_written=99, pointer_committed=False,
                             pointer_intent_declared=True, proposed_pointer=fake_proposed,
                             previous_pointer=dict(pointer3),
                             applied_files=applied_files,
                             receipts_digest_after=installer.receipts.digest())
    outcomes = installer.recover_pending()
    # actual == previous (real, committed r2): never deleted or overwritten;
    # the unverifiable manifest keeps the outcome fail-closed
    assert outcomes[0]["status"] == "recovery_required"
    assert store.get("claude-code", "main")["revision"] == 2  # real commit untouched
    assert (target / "SKILL.md").exists()                      # real files untouched
    assert installer.receipts.get("review") is not None        # real receipt untouched
    assert _receipts_consistent(store)


def test_malformed_journal_fails_closed_and_blocks_next_mutation(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    layout = store.layout("claude-code", "main")
    from agent_box_harnesses.native_home.tree import ensure_plain_directory

    ensure_plain_directory(layout.transactions)
    (layout.transactions / "corrupt.json").write_text("{not-json")
    with pytest.raises(SkillInstallError) as exc:
        installer.install(source, expected_revision=1)
    assert exc.value.code == SKILL_INSTALL_RECOVERY_REQUIRED
    # the diagnostic is bounded and contains no file path
    assert str(exc.value).count("/") == 0
    outcomes = installer.recover_pending()
    assert outcomes[0]["status"] == "recovery_required"
    assert outcomes[0]["code"] == "JOURNAL_MALFORMED"
    # recovery does NOT silently continue: the corrupt journal still blocks
    with pytest.raises(SkillInstallError) as exc:
        installer.install(source, expected_revision=1)
    assert exc.value.code == SKILL_INSTALL_RECOVERY_REQUIRED


# --------------------------------------------------------------------------- #
# F. skill update inventory-delta (add / remove / rename / guards)
# --------------------------------------------------------------------------- #

def _tree_v(root: Path, version: str, files: dict[str, str]):
    root.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return root


def test_update_adds_new_supporting_file(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    v1 = _tree_v(tmp_path / "src1", "1", {"SKILL.md": "---\nname: review\ndescription: d\n---\n# v1\n"})
    v2 = _tree_v(tmp_path / "src2", "2", {
        "SKILL.md": "---\nname: review\ndescription: d\n---\n# v2\n",
        "support.txt": "new supporting file",
    })
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source_for(skill_store, v1), expected_revision=1)
    installer.update(source_for(skill_store, v2), expected_revision=2)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    assert (target / "support.txt").read_text() == "new supporting file"
    assert "v2" in (target / "SKILL.md").read_text()
    assert store.get("claude-code", "main")["revision"] == 3
    assert _receipts_consistent(store)


def test_update_removes_old_managed_file(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    v1 = _tree_v(tmp_path / "src1", "1", {
        "SKILL.md": "---\nname: review\ndescription: d\n---\n# v1\n",
        "obsolete.txt": "old managed file",
    })
    v2 = _tree_v(tmp_path / "src2", "2", {"SKILL.md": "---\nname: review\ndescription: d\n---\n# v2\n"})
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source_for(skill_store, v1), expected_revision=1)
    installer.update(source_for(skill_store, v2), expected_revision=2)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    assert not (target / "obsolete.txt").exists()  # removed (receipt-owned)
    assert "v2" in (target / "SKILL.md").read_text()
    assert _receipts_consistent(store)


def test_update_renames_a_file(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    v1 = _tree_v(tmp_path / "src1", "1", {
        "SKILL.md": "---\nname: review\ndescription: d\n---\n# v1\n",
        "old-name.txt": "same content",
    })
    v2 = _tree_v(tmp_path / "src2", "2", {
        "SKILL.md": "---\nname: review\ndescription: d\n---\n# v2\n",
        "new-name.txt": "same content",
    })
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source_for(skill_store, v1), expected_revision=1)
    installer.update(source_for(skill_store, v2), expected_revision=2)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    assert not (target / "old-name.txt").exists()
    assert (target / "new-name.txt").read_text() == "same content"
    assert _receipts_consistent(store)


def test_update_preserves_unmanaged_extra_file(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    v1 = _tree_v(tmp_path / "src1", "1", {"SKILL.md": "---\nname: review\ndescription: d\n---\n# v1\n"})
    v2 = _tree_v(tmp_path / "src2", "2", {"SKILL.md": "---\nname: review\ndescription: d\n---\n# v2\n"})
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source_for(skill_store, v1), expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    (target / "user-note.md").write_text("mine")
    # the extra file is NOT part of old managed NOR the new inventory:
    # update must fail closed and preserve it
    from agent_box_harnesses.native_home.failures import SKILL_INSTALL_UNMANAGED_TARGET

    with pytest.raises(SkillInstallError) as exc:
        installer.update(source_for(skill_store, v2), expected_revision=2)
    assert exc.value.code == SKILL_INSTALL_UNMANAGED_TARGET
    assert (target / "user-note.md").read_text() == "mine"
    assert (target / "SKILL.md").read_text().startswith("---")  # untouched
    assert store.get("claude-code", "main")["revision"] == 2


def test_update_new_file_conflicting_with_unmanaged_target(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    v1 = _tree_v(tmp_path / "src1", "1", {"SKILL.md": "---\nname: review\ndescription: d\n---\n# v1\n"})
    v2 = _tree_v(tmp_path / "src2", "2", {
        "SKILL.md": "---\nname: review\ndescription: d\n---\n# v2\n",
        "brand-new.txt": "the update wants this path",
    })
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source_for(skill_store, v1), expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    (target / "brand-new.txt").write_text("unmanaged already here")
    from agent_box_harnesses.native_home.failures import SKILL_INSTALL_UNMANAGED_TARGET

    with pytest.raises(SkillInstallError) as exc:
        installer.update(source_for(skill_store, v2), expected_revision=2)
    assert exc.value.code == SKILL_INSTALL_UNMANAGED_TARGET
    assert (target / "brand-new.txt").read_text() == "unmanaged already here"


def test_update_removed_file_manually_drifted_fails_closed(tmp_path):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    v1 = _tree_v(tmp_path / "src1", "1", {
        "SKILL.md": "---\nname: review\ndescription: d\n---\n# v1\n",
        "obsolete.txt": "managed",
    })
    v2 = _tree_v(tmp_path / "src2", "2", {"SKILL.md": "---\nname: review\ndescription: d\n---\n# v2\n"})
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source_for(skill_store, v1), expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    (target / "obsolete.txt").write_text("tampered manually")
    from agent_box_harnesses.native_home.failures import SKILL_INSTALL_DRIFTED

    with pytest.raises(SkillInstallError) as exc:
        installer.update(source_for(skill_store, v2), expected_revision=2)
    assert exc.value.code == SKILL_INSTALL_DRIFTED
    assert (target / "obsolete.txt").read_text() == "tampered manually"


def test_update_failure_after_removal_rolls_back_old_set(tmp_path, monkeypatch):
    store = store_with_profile(tmp_path)
    skill_store = SkillStore(tmp_path / "skills")
    v1 = _tree_v(tmp_path / "src1", "1", {
        "SKILL.md": "---\nname: review\ndescription: d\n---\n# v1\n",
        "old-file.txt": "old",
    })
    v2 = _tree_v(tmp_path / "src2", "2", {
        "SKILL.md": "---\nname: review\ndescription: d\n---\n# v2\n",
        "new-file.txt": "new",
    })
    installer = ProfileSkillInstaller(store, "claude-code", "main")
    installer.install(source_for(skill_store, v1), expected_revision=1)
    target = store.layout("claude-code", "main").native_home / ".claude/skills/review"
    original_bump = installer._bump_revision

    def boom(*args, **kwargs):
        raise OSError("delta-bump-failed")

    monkeypatch.setattr(installer, "_bump_revision", boom)
    with pytest.raises(OSError, match="delta-bump-failed"):
        installer.update(source_for(skill_store, v2), expected_revision=2)
    monkeypatch.setattr(installer, "_bump_revision", original_bump)
    # OLD file set fully restored: both old files back, new file gone,
    # old receipt back, revision/pointer unchanged
    assert (target / "old-file.txt").read_text() == "old"
    assert (target / "SKILL.md").read_text().startswith("---")
    assert "# v1" in (target / "SKILL.md").read_text()
    assert not (target / "new-file.txt").exists()
    assert installer.receipts.get("review").central_revision == 1
    assert store.get("claude-code", "main")["revision"] == 2
    assert _receipts_consistent(store)
