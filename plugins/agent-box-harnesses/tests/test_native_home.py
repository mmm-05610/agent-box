"""Phase B: Profile Native Home — policy, tree, layout, store, view, lease.

Proves the frozen profile semantics: one persistent native home per
profile, policy classification, credential-free snapshots, safe copies,
execution views with declared overlays, typed reconcile (decision-then-
commit), mutation lease enforcement and migration paths.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.native_home.failures import (
    NATIVE_HOME_RECONCILE_AMBIGUOUS,
    PROFILE_MUTATION_LEASE_CONFLICT,
    PROFILE_NATIVE_HOME_MISSING,
    ProfileNativeHomeError,
)
from agent_box_harnesses.native_home.layout import ProfileLayout
from agent_box_harnesses.native_home.policy import (
    CLAUDE_POLICY,
    CODEX_POLICY,
    FIVE_POLICIES,
    HERMES_POLICY,
    OPENCODE_POLICY,
    PI_POLICY,
    CONFIG_AUTHORITY,
    CREDENTIAL,
    EPHEMERAL,
    SESSION,
    SKILL,
    UNKNOWN,
)
from agent_box_harnesses.native_home.tree import (
    NativeHomeTreeError,
    TREE_FORBIDDEN_KIND,
    copy_tree,
    digest_tree,
    walk_tree,
)
from agent_box_harnesses.native_home.view import (
    ActiveExecutionRegistry,
    NativeHomeView,
    ProfileMutationLease,
    generation_of,
)


def render_codex(payload):
    model = payload.get("model", "offline")
    return ((".codex/config.toml", f'model = "{model}"\n'.encode()),)


def make_store(tmp_path: Path, profiles: dict[str, dict] | None = None):
    store = ProfileStore(
        tmp_path / "profiles", policies=FIVE_POLICIES,
        config_renderers={"codex": render_codex},
    )
    for profile in profiles or {}:
        store.put(profile["harness_type"], profile["data"])
    return store


# --------------------------------------------------------------------------- #
# policy classification (evidence-backed path facts)
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("policy,path,kind", [
    (CODEX_POLICY, ".codex/auth.json", CREDENTIAL),
    (CODEX_POLICY, ".codex/sessions/2026/01/x.jsonl", SESSION),
    (CODEX_POLICY, ".agents/skills/review/SKILL.md", SKILL),
    (CODEX_POLICY, ".codex/config.toml", CONFIG_AUTHORITY),
    (CODEX_POLICY, ".codex/cache/models.json", EPHEMERAL),
    (CODEX_POLICY, ".codex/notes.md", UNKNOWN),
    (CLAUDE_POLICY, ".claude/.credentials.json", CREDENTIAL),
    (CLAUDE_POLICY, ".claude/skills/review/SKILL.md", SKILL),
    (CLAUDE_POLICY, ".claude/settings.json", CONFIG_AUTHORITY),
    (CLAUDE_POLICY, ".cache/claude-cli-nodejs/x", EPHEMERAL),
    (OPENCODE_POLICY, ".data/opencode/auth.json", CREDENTIAL),
    (OPENCODE_POLICY, ".config/opencode/skills/review/SKILL.md", SKILL),
    (OPENCODE_POLICY, ".config/opencode/opencode.json", CONFIG_AUTHORITY),
    (OPENCODE_POLICY, ".cache/opencode/bin/opencode", EPHEMERAL),
    (OPENCODE_POLICY, ".data/opencode/opencode.db", SESSION),
    (HERMES_POLICY, ".hermes/.env", CREDENTIAL),
    (HERMES_POLICY, ".hermes/auth.json", CREDENTIAL),
    (HERMES_POLICY, ".hermes/skills/review/SKILL.md", SKILL),
    (HERMES_POLICY, ".hermes/config.yaml", CONFIG_AUTHORITY),
    (HERMES_POLICY, ".hermes/checkpoints/1", SESSION),
    (PI_POLICY, "auth.json", CREDENTIAL),
    (PI_POLICY, "skills/review/SKILL.md", SKILL),
    (PI_POLICY, "settings.json", CONFIG_AUTHORITY),
    (PI_POLICY, "sessions/s1.jsonl", SESSION),
])
def test_policy_classification(policy, path, kind):
    assert policy.classify(path) == kind


def test_policy_rejects_absolute_and_escaping_paths():
    for policy in FIVE_POLICIES.values():
        with pytest.raises(ValueError):
            policy.classify("/etc/passwd")
        with pytest.raises(ValueError):
            policy.classify("../escape")


def test_five_policies_cover_all_registry_harness_types():
    from agent_box_harnesses.registry import load_builtin_registry

    for definition in load_builtin_registry().all():
        assert definition.harness_type in FIVE_POLICIES


# --------------------------------------------------------------------------- #
# tree walking / copying / digesting
# --------------------------------------------------------------------------- #

def test_tree_walk_skips_credentials_and_ephemeral_without_reading(tmp_path):
    root = tmp_path / "home"
    root.mkdir()
    (root / ".codex").mkdir()
    (root / ".codex/auth.json").write_text('{"token": "x"}')
    (root / ".codex/cache").mkdir()
    (root / ".codex/cache/models_cache.json").write_text("{}")
    (root / ".codex/sessions").mkdir()
    (root / ".codex/sessions/s.jsonl").write_text("{}")
    (root / ".codex/plain.md").write_text("x")
    walk = walk_tree(CODEX_POLICY, root)
    files = walk.files
    assert files == (".codex/plain.md", ".codex/sessions/s.jsonl")
    assert walk.skipped == (".codex/auth.json", ".codex/cache/models_cache.json")


def test_tree_walk_rejects_symlinks_fail_closed(tmp_path):
    root = tmp_path / "home"
    root.mkdir()
    (root / "link").symlink_to(root / "file")
    (root / "file").write_text("x")
    with pytest.raises(NativeHomeTreeError) as exc:
        walk_tree(CODEX_POLICY, root)
    assert exc.value.code == TREE_FORBIDDEN_KIND


def test_tree_walk_skips_socket_and_lock_typed(tmp_path):
    import socket

    root = tmp_path / "home"
    root.mkdir()
    (root / ".codex").mkdir()
    (root / ".codex/daemon.lock").write_text("")
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.bind(str(root / ".codex/agent.sock"))
    finally:
        sock.close()
    walk = walk_tree(CODEX_POLICY, root)
    assert walk.files == ()
    assert ".codex/daemon.lock" in walk.skipped
    assert ".codex/agent.sock" in walk.skipped


def test_copy_tree_is_credential_free_and_preserves_unknown_files(tmp_path):
    source = tmp_path / "home"
    source.mkdir()
    (source / ".codex").mkdir()
    (source / ".codex/auth.json").write_text("SECRET")
    (source / ".codex/unknown.toml").write_text("keep")
    (source / ".codex/sessions").mkdir()
    (source / ".codex/sessions/s.jsonl").write_text("{}")
    target = tmp_path / "copy"
    count, skipped = copy_tree(CODEX_POLICY, source, target)
    assert count == 2
    assert not (target / ".codex/auth.json").exists()
    assert (target / ".codex/unknown.toml").read_text() == "keep"
    assert (target / ".codex/sessions/s.jsonl").read_text() == "{}"


def test_digest_tree_is_credential_free_and_stable(tmp_path):
    root = tmp_path / "home"
    root.mkdir()
    (root / ".codex").mkdir()
    (root / ".codex/auth.json").write_text("SECRET")
    (root / ".codex/config.toml").write_text("a = 1")
    one = digest_tree(CODEX_POLICY, root)
    assert "SECRET" not in one
    two = digest_tree(CODEX_POLICY, root)
    assert one == two
    (root / ".codex/config.toml").write_text("a = 2")
    assert digest_tree(CODEX_POLICY, root) != one


# --------------------------------------------------------------------------- #
# store: one native home, envelope identity, revisions
# --------------------------------------------------------------------------- #

def test_put_creates_one_native_home_and_seeds_config(tmp_path):
    store = make_store(tmp_path, [{"harness_type": "codex", "data": {"profile_id": "main", "native_payload": {"model": "offline"}}}])
    layout = store.layout("codex", "main")
    home = layout.native_home
    assert home.is_dir()
    assert (home / ".codex/config.toml").read_text() == 'model = "offline"\n'
    value = store.get("codex", "main")
    assert value["revision"] == 1
    assert value["native_state_generation"] == 0
    assert value["skill_receipts_digest"] == ""
    # the frozen layout: one native home + immutable revisions + pointers
    assert layout.revisions.is_dir()
    assert sorted(path.name for path in layout.revisions.iterdir()) == ["1"]
    assert (layout.revisions / "1" / "envelope.json").is_file()
    assert layout.profile_json.is_file()
    assert not layout.installed_skills_json.exists()


def test_put_patches_managed_config_on_explicit_edit(tmp_path):
    store = make_store(tmp_path, [{"harness_type": "codex", "data": {"profile_id": "main", "native_payload": {"model": "offline"}}}])
    home = store.layout("codex", "main").native_home
    second = store.put("codex", {"profile_id": "main", "native_payload": {"model": "v2"}}, expected_revision=1)
    assert second["revision"] == 2
    assert (home / ".codex/config.toml").read_text() == 'model = "v2"\n'
    # envelope never rebuilt: an unknown file placed directly in the home survives
    (home / ".codex/notes.md").write_text("keep")
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "v3"}}, expected_revision=2)
    assert (home / ".codex/notes.md").read_text() == "keep"


def test_store_ref_resolve_keeps_exact_revision_semantics(tmp_path):
    store = make_store(tmp_path, [{"harness_type": "codex", "data": {"profile_id": "main", "native_payload": {"model": "a"}}}])
    ref = store.ref("codex", "main", 1)
    envelope = store.resolve("agent-box.profile@1", ref)
    assert envelope.profile_id == "main"
    assert envelope.revision == 1
    envelope2 = store.resolve("agent-box.profile@1", store.ref("codex", "main"))
    assert envelope2.revision == 1 and envelope2.digest == envelope.digest


def test_put_blocks_when_an_external_mutation_lease_is_held(tmp_path):
    # a lease is held by an external writer -> put fails closed, typed
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES, config_renderers={"codex": render_codex})
    store.put("codex", {"profile_id": "main", "native_payload": {}})
    lease = ProfileMutationLease(store.layout("codex", "main"))
    lease.acquire("external")
    try:
        with pytest.raises(ProfileNativeHomeError) as exc:
            store.put("codex", {"profile_id": "main", "native_payload": {"model": "x"}}, expected_revision=1)
        assert exc.value.code == PROFILE_MUTATION_LEASE_CONFLICT
    finally:
        lease.release()
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "x"}}, expected_revision=1)


def test_native_home_missing_fails_closed(tmp_path):
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES, config_renderers={"codex": render_codex})
    store.put("codex", {"profile_id": "main", "native_payload": {}})
    import shutil
    shutil.rmtree(store.layout("codex", "main").native_home)
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.native_home_summary("codex", "main")
    assert exc.value.code == PROFILE_NATIVE_HOME_MISSING


# --------------------------------------------------------------------------- #
# execution view: prepare / overlay / reconcile / recovery
# --------------------------------------------------------------------------- #

@pytest.fixture()
def profile_with_home(tmp_path):
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES, config_renderers={"codex": render_codex})
    layout = store.layout("codex", "main")
    # home content established BEFORE put so the pointer digest covers it
    (layout.native_home / ".codex").mkdir(parents=True, exist_ok=True)
    (layout.native_home / ".codex/auth.json").write_text("SECRET")
    (layout.native_home / ".codex/notes.md").write_text("hello")
    (layout.native_home / ".codex/sessions").mkdir()
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "offline"}})
    return store, layout


def test_view_prepare_copies_home_minus_credentials_plus_overlay(profile_with_home, tmp_path):
    store, layout = profile_with_home
    view = NativeHomeView(layout, CODEX_POLICY, execution_id="exec_1", staging_root=tmp_path / "staging")
    view.prepare(overlays=[(".codex/config.toml", b'model = "ephemeral"\n')])
    assert (view.root / ".codex/notes.md").read_text() == "hello"
    assert not (view.root / ".codex/auth.json").exists()
    assert (view.root / ".codex/config.toml").read_text() == 'model = "ephemeral"\n'
    view.verify_overlay([(".codex/config.toml", "sha256:" + __import__("hashlib").sha256(b'model = "ephemeral"\n').hexdigest())])


def test_view_prepare_registers_active_execution_and_blocks_mutation(profile_with_home, tmp_path):
    store, layout = profile_with_home
    view = NativeHomeView(layout, CODEX_POLICY, execution_id="exec_1", staging_root=tmp_path / "staging")
    view.prepare()
    assert ActiveExecutionRegistry(layout).active() == ("exec_1",)
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.put("codex", {"profile_id": "main", "native_payload": {}}, expected_revision=1)
    assert exc.value.code == PROFILE_MUTATION_LEASE_CONFLICT
    view.discard()
    assert ActiveExecutionRegistry(layout).active() == ()


def test_view_reconcile_flow_sessions_back_and_generation_forward(profile_with_home, tmp_path):
    store, layout = profile_with_home
    gen = generation_of(layout)
    view = NativeHomeView(layout, CODEX_POLICY, execution_id="exec_1", staging_root=tmp_path / "staging")
    view.prepare(overlays=[(".codex/config.toml", b'model = "ephemeral"\n')])
    sessions = view.root / ".codex/sessions"
    (sessions / "s1.jsonl").write_text("{}")
    report = view.reconcile(expected_generation=gen)
    assert report.status == "ok"
    assert (layout.native_home / ".codex/sessions/s1.jsonl").exists()
    # managed config overlay is never copied back
    assert (layout.native_home / ".codex/config.toml").read_text() == 'model = "offline"\n'
    # credentials untouched; unknown files untouched
    assert (layout.native_home / ".codex/auth.json").read_text() == "SECRET"
    assert (layout.native_home / ".codex/notes.md").read_text() == "hello"
    view.discard()


def test_view_reconcile_ambiguous_never_writes_back_partial(profile_with_home, tmp_path):
    store, layout = profile_with_home
    gen = generation_of(layout)
    view = NativeHomeView(layout, CODEX_POLICY, execution_id="exec_1", staging_root=tmp_path / "staging")
    view.prepare()
    (view.root / ".codex/notes.md").write_text("in-view")
    (layout.native_home / ".codex/notes.md").write_text("in-home")
    report = view.reconcile(expected_generation=gen)
    assert report.status == "ambiguous"
    assert report.code == NATIVE_HOME_RECONCILE_AMBIGUOUS
    # nothing was written back and the view is preserved for a human decision
    assert (layout.native_home / ".codex/notes.md").read_text() == "in-home"
    recovery = view.preserve_recovery()
    assert (layout.recovery / recovery).is_dir()


def test_view_cleanup_is_idempotent_and_never_touches_profile_home(profile_with_home, tmp_path):
    store, layout = profile_with_home
    view = NativeHomeView(layout, CODEX_POLICY, execution_id="exec_1", staging_root=tmp_path / "staging")
    view.prepare()
    assert view.discard()["status"] == "discarded"
    assert view.discard()["status"] == "already_cleaned"
    assert layout.native_home.is_dir()
    assert ActiveExecutionRegistry(layout).active() == ()


# --------------------------------------------------------------------------- #
# migrations
# --------------------------------------------------------------------------- #

def test_envelope_only_migration_is_explicit_and_marks_provenance(tmp_path):
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES, config_renderers={"codex": render_codex})
    store.put("codex", {"profile_id": "legacy", "native_payload": {"model": "mig"}})
    layout = store.layout("codex", "legacy")
    # simulate an envelope-only legacy profile: revisions/1 exists, but
    # profile.json (pointer) and native-home are gone
    layout.profile_json.unlink()
    import shutil

    shutil.rmtree(layout.native_home)
    # reading current fails closed typed — no max-revision fallback
    with pytest.raises(ProfileNativeHomeError, match="PROFILE_POINTER_NOT_FOUND"):
        store.get("codex", "legacy")
    # explicit migration: late envelope scanned once, seeded, provenance set
    migrated = store.migrate_envelope_only("codex", "legacy")
    assert migrated["import_provenance"]["kind"] == "MIGRATED_FROM_ENVELOPE"
    assert store.get("codex", "legacy")["revision"] == 2
    assert (layout.native_home / ".codex/config.toml").read_text() == 'model = "mig"\n'
    # idempotent: a second migration returns the current envelope unchanged
    again = store.migrate_envelope_only("codex", "legacy")
    assert again["revision"] == 2
    # later explicit config edits keep the migration provenance honestly
    store.put("codex", {"profile_id": "legacy", "native_payload": {"model": "mig3"}}, expected_revision=2)
    value = store.get("codex", "legacy")
    assert value["import_provenance"]["kind"] == "MIGRATED_FROM_ENVELOPE"
    assert sorted(p.name for p in (layout.native_home / ".codex").iterdir()) == ["config.toml"]


def test_legacy_directory_import_preview_and_confirm(tmp_path):
    from agent_box_harnesses.native_home.migrations import preview_legacy_import

    legacy = tmp_path / "private-legacy-src"
    legacy.mkdir()
    (legacy / "settings.json").write_text("{}")
    (legacy / ".credentials.json").write_text("SECRET-VALUE")
    (legacy / "unknown.md").write_text("keep")
    (legacy / "danger").symlink_to(legacy / "settings.json")
    with pytest.raises(ProfileNativeHomeError) as exc:
        preview_legacy_import(CLAUDE_POLICY, legacy, guest_relative=".claude")
    assert exc.value.code == "LEGACY_IMPORT_FORBIDDEN"
    (legacy / "danger").unlink()

    store = make_store(tmp_path, [{"harness_type": "claude-code", "data": {"profile_id": "main", "native_payload": {}}}])
    preview_result = preview_legacy_import(CLAUDE_POLICY, legacy, guest_relative=".claude")
    assert preview_result.entries == 2  # settings.json + unknown.md
    assert ".claude/.credentials.json" in preview_result.excluded
    # the public preview never contains the host-absolute source path
    assert "source" not in preview_result.public()
    public_preview = str(preview_result.public())
    assert "private-legacy-src" not in public_preview
    value, stats = store.confirm_legacy_import(
        "claude-code", "main", legacy,
        guest_relative=".claude", expected_preview_digest=preview_result.digest,
        expected_revision=1,
    )
    home = store.layout("claude-code", "main").native_home
    assert stats["copied"] == 2
    assert (home / ".claude/settings.json").exists()
    assert (home / ".claude/unknown.md").read_text() == "keep"
    # credential content never imported; original untouched
    assert not (home / ".claude/.credentials.json").exists()
    assert (legacy / ".credentials.json").read_text() == "SECRET-VALUE"
    # provenance is path-free: kind + fingerprint + guest mapping only
    provenance = value["import_provenance"]
    assert provenance["kind"] == "IMPORTED_FROM_LEGACY_DIR"
    assert "source" not in provenance and "path" not in provenance
    assert "private-legacy-src" not in str(provenance)
    # preview drift fails closed BEFORE any write
    (legacy / "settings.json").write_text("changed")
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.confirm_legacy_import(
            "claude-code", "main", legacy,
            guest_relative=".claude", expected_preview_digest=preview_result.digest,
            expected_revision=2,
        )
    assert exc.value.code == "LEGACY_IMPORT_PREVIEW_DRIFT"
    assert store.get("claude-code", "main")["revision"] == 2  # nothing moved


def test_native_home_preserves_unknown_files_roundtrip(tmp_path):
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES, config_renderers={"codex": render_codex})
    layout = store.layout("codex", "main")
    (layout.native_home / ".codex").mkdir(parents=True, exist_ok=True)
    (layout.native_home / ".codex/strange.dat").write_bytes(b"\x00\x01")
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    view = NativeHomeView(layout, CODEX_POLICY, execution_id="exec_1", staging_root=tmp_path / "staging")
    view.prepare()
    assert (view.root / ".codex/strange.dat").read_bytes() == b"\x00\x01"
    view.discard()
    assert (layout.native_home / ".codex/strange.dat").read_bytes() == b"\x00\x01"


def test_profile_layout_rejects_escape(tmp_path):
    from agent_box_harnesses.native_home.failures import ProfileNativeHomeError

    root = tmp_path / "profiles"
    root.mkdir()
    with pytest.raises(ProfileNativeHomeError):
        ProfileLayout(root, "codex", "..")
    with pytest.raises(ProfileNativeHomeError):
        ProfileLayout(root, "codex", "a/b")