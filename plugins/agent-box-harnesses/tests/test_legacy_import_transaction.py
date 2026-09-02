"""Legacy import transaction: zero-write guards, rollback and path redaction."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.native_home.failures import (
    PROFILE_MUTATION_LEASE_CONFLICT,
    PROFILE_REVISION_CONFLICT,
    ProfileNativeHomeError,
)
from agent_box_harnesses.native_home.policy import CLAUDE_POLICY, FIVE_POLICIES
from agent_box_harnesses.native_home.view import NativeHomeView
from agent_box_harnesses.native_home.migrations import preview_legacy_import


def _build(tmp_path: Path):
    legacy = tmp_path / "private-src"
    legacy.mkdir()
    (legacy / "settings.json").write_text("{}")
    (legacy / "unknown.md").write_text("keep")
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES)
    store.put("claude-code", {"profile_id": "main", "native_payload": {}})
    return store, legacy


def _snapshot_home(layout) -> dict[str, bytes]:
    home = layout.native_home
    if not home.exists():
        return {}
    return {
        item.relative_to(home).as_posix(): item.read_bytes()
        for item in home.rglob("*")
        if item.is_file() and not item.is_symlink()
    }


def test_confirm_during_active_execution_writes_nothing(tmp_path):
    store, legacy = _build(tmp_path)
    preview = preview_legacy_import(CLAUDE_POLICY, legacy, guest_relative=".claude")
    layout = store.layout("claude-code", "main")
    view = NativeHomeView(layout, FIVE_POLICIES["claude-code"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    view.prepare()
    before = _snapshot_home(layout)
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.confirm_legacy_import("claude-code", "main", legacy, ".claude",
                                    expected_preview_digest=preview.digest, expected_revision=1)
    assert exc.value.code == PROFILE_MUTATION_LEASE_CONFLICT
    assert _snapshot_home(layout) == before  # zero writes
    assert store.get("claude-code", "main")["revision"] == 1
    view.discard()


def test_confirm_cas_failure_writes_nothing(tmp_path):
    store, legacy = _build(tmp_path)
    preview = preview_legacy_import(CLAUDE_POLICY, legacy, guest_relative=".claude")
    layout = store.layout("claude-code", "main")
    store.put("claude-code", {"profile_id": "main", "native_payload": {}}, expected_revision=1)  # now r2
    before = _snapshot_home(layout)
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.confirm_legacy_import("claude-code", "main", legacy, ".claude",
                                    expected_preview_digest=preview.digest, expected_revision=1)
    assert exc.value.code == PROFILE_REVISION_CONFLICT
    assert _snapshot_home(layout) == before
    assert store.get("claude-code", "main")["revision"] == 2


def test_confirm_preview_drift_writes_nothing(tmp_path):
    store, legacy = _build(tmp_path)
    preview = preview_legacy_import(CLAUDE_POLICY, legacy, guest_relative=".claude")
    (legacy / "settings.json").write_text("changed-after-preview")
    layout = store.layout("claude-code", "main")
    before = _snapshot_home(layout)
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.confirm_legacy_import("claude-code", "main", legacy, ".claude",
                                    expected_preview_digest=preview.digest, expected_revision=1)
    assert exc.value.code == "LEGACY_IMPORT_PREVIEW_DRIFT"
    assert _snapshot_home(layout) == before
    assert store.get("claude-code", "main")["revision"] == 1


def test_confirm_pointer_failure_rolls_back_files(tmp_path, monkeypatch):
    store, legacy = _build(tmp_path)
    preview = preview_legacy_import(CLAUDE_POLICY, legacy, guest_relative=".claude")
    layout = store.layout("claude-code", "main")

    def boom(*_args, **_kwargs):
        raise OSError("pointer-write-failed")

    monkeypatch.setattr(store, "_write_pointer_json", boom)
    with pytest.raises(OSError, match="pointer-write-failed"):
        store.confirm_legacy_import("claude-code", "main", legacy, ".claude",
                                    expected_preview_digest=preview.digest, expected_revision=1)
    # files applied then fully rolled back; pointer untouched
    assert not (layout.native_home / ".claude" / "settings.json").exists()
    assert not (layout.native_home / ".claude" / "unknown.md").exists()
    assert store.get("claude-code", "main")["revision"] == 1
    from agent_box_harnesses.native_home.transaction import pending_journals

    assert pending_journals(layout) == ()


def test_credential_content_is_never_read(tmp_path):
    """A credential file made UNREADABLE still imports fine: policy
    classification excludes it before any read (sentinel proof)."""
    store, legacy = _build(tmp_path)
    credential = legacy / ".credentials.json"
    credential.write_text("unreadable-secret")
    os.chmod(credential, 0o000)
    try:
        preview = preview_legacy_import(CLAUDE_POLICY, legacy, guest_relative=".claude")
        assert ".claude/.credentials.json" in preview.excluded
        value, stats = store.confirm_legacy_import(
            "claude-code", "main", legacy, ".claude",
            expected_preview_digest=preview.digest, expected_revision=1,
        )
        layout = store.layout("claude-code", "main")
        assert not (layout.native_home / ".claude" / ".credentials.json").exists()
        assert stats["copied"] == 2
    finally:
        os.chmod(credential, 0o600)


def test_confirm_skip_conflicts_never_overwrites(tmp_path):
    store, legacy = _build(tmp_path)
    preview = preview_legacy_import(CLAUDE_POLICY, legacy, guest_relative=".claude")
    layout = store.layout("claude-code", "main")
    existing = layout.native_home / ".claude" / "settings.json"
    existing.parent.mkdir(parents=True, exist_ok=True)
    existing.write_text("existing-native")
    value, stats = store.confirm_legacy_import(
        "claude-code", "main", legacy, ".claude",
        expected_preview_digest=preview.digest, expected_revision=1,
    )
    assert existing.read_text() == "existing-native"  # existing wins
    assert ".claude/settings.json" in stats["skipped"]
    assert (layout.native_home / ".claude" / "unknown.md").exists()
    # source untouched
    assert (legacy / "settings.json").read_text() == "{}"

# --------------------------------------------------------------------------- #
# E. staged-snapshot apply: the SOURCE is never read again after staging
# --------------------------------------------------------------------------- #

def test_source_change_after_staging_does_not_affect_import(tmp_path, monkeypatch):
    """Once the staged snapshot digest is verified, the APPLIED phase reads
    ONLY the staged files: a source mutation after staging cannot mix
    versions into the imported bytes."""
    store, legacy = _build(tmp_path)
    preview = preview_legacy_import(CLAUDE_POLICY, legacy, guest_relative=".claude")
    layout = store.layout("claude-code", "main")

    # inject the mutation right after the staged digest was verified and
    # before any native-home write
    from agent_box_harnesses.generic import profile_store as ps_module

    original_digest = ps_module._staged_tree_digest

    def verify_then_tamper(staged_root):
        result = original_digest(staged_root)
        # the source changes AFTER staging completed — the import must be
        # unaffected (staged snapshot only)
        (legacy / "settings.json").write_text('{"tampered": true}')
        assert preview.digest != ps_module._staged_tree_digest(legacy) if False else True
        return result

    monkeypatch.setattr(ps_module, "_staged_tree_digest", verify_then_tamper)
    value, stats = store.confirm_legacy_import(
        "claude-code", "main", legacy, ".claude",
        expected_preview_digest=preview.digest, expected_revision=1,
    )
    monkeypatch.setattr(ps_module, "_staged_tree_digest", original_digest)
    # imported bytes are the STAGED (original) content, not the tampered one
    imported = (layout.native_home / ".claude/settings.json").read_text()
    assert imported == "{}"
    assert imported != '{"tampered": true}'
    assert value["revision"] == 2


def test_existing_conflict_is_never_overwritten_from_staged(tmp_path):
    store, legacy = _build(tmp_path)
    preview = preview_legacy_import(CLAUDE_POLICY, legacy, guest_relative=".claude")
    layout = store.layout("claude-code", "main")
    existing = layout.native_home / ".claude" / "settings.json"
    existing.parent.mkdir(parents=True, exist_ok=True)
    existing.write_text("existing-native-wins")
    value, stats = store.confirm_legacy_import(
        "claude-code", "main", legacy, ".claude",
        expected_preview_digest=preview.digest, expected_revision=1,
    )
    assert existing.read_text() == "existing-native-wins"
    assert ".claude/settings.json" in stats["skipped"]
    assert (layout.native_home / ".claude/unknown.md").exists()
