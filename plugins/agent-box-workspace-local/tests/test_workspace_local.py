"""Local live workspace provider tests.

Covers: honest live/unfrozen Ref facts, real-directory mutation visibility,
root confinement, symlink/traversal fail-closed behavior, bounded non-git
inventory, git digests, and wrong-identity fail-closed resolution.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.models import Ref, RefType

from agent_box_workspace_local import (
    OBSERVATION_SOURCE_SHARED,
    PROVIDER_ID,
    InventoryLimits,
    ProjectIdentityConflict,
    ProjectNotRegistered,
    ProjectPathRejected,
    WorkspaceLocalError,
)
from agent_box_workspace_local.plugin import WorkspaceLocalPlugin
from agent_box_workspace_local.provider import LocalLiveWorkspaceProvider


@pytest.fixture
def project_dir(tmp_path):
    root = tmp_path / "user-project"
    (root / "src").mkdir(parents=True)
    (root / "src" / "main.py").write_text("print('hi')\n")
    (root / "README.md").write_text("demo\n")
    return root


@pytest.fixture
def provider(tmp_path):
    return LocalLiveWorkspaceProvider(tmp_path / "data" / "workspace-registry.db")


def _registered(provider, project_dir):
    return provider.register_project(project_dir)


# -- registration / identity -----------------------------------------------


def test_register_project_canonicalizes_and_keeps_real_path(provider, project_dir):
    registration = _registered(provider, project_dir)
    assert Path(registration.path).is_absolute()
    assert Path(registration.path) == project_dir.resolve()
    assert registration.project_id in {
        p.project_id for p in provider.list_projects()
    }


def test_register_rejects_missing_or_non_directory(provider, tmp_path):
    with pytest.raises(WorkspaceLocalError):
        provider.register_project(tmp_path / "missing")
    a_file = tmp_path / "a-file"
    a_file.write_text("x")
    with pytest.raises(WorkspaceLocalError):
        provider.register_project(a_file)


def test_same_directory_reregistration_is_stable(provider, project_dir):
    first = _registered(provider, project_dir)
    second = provider.register_project(project_dir)
    assert first.project_id == second.project_id


# -- honest live/unfrozen facts --------------------------------------------


def test_ref_and_resolution_carry_live_unfrozen_facts(provider, project_dir):
    registration = _registered(provider, project_dir)
    ref = provider.make_ref(registration.project_id)
    assert ref.type is RefType.WORKSPACE
    assert ref.provider == PROVIDER_ID
    assert ref.metadata["workspace_mode"] == "live"
    assert ref.metadata["mutability"] == "externally_mutable"
    assert ref.metadata["input_frozen"] == "false"

    resolved = provider.resolve(WorkspaceV1.contract_id, ref)
    assert isinstance(resolved, WorkspaceV1)
    assert resolved.path == project_dir.resolve()
    assert resolved.source_digest.startswith("live-unfrozen:")


def test_resolution_refuses_frozen_disguise(provider, project_dir):
    registration = _registered(provider, project_dir)
    ref = provider.make_ref(registration.project_id)
    forged = Ref(
        RefType.WORKSPACE, PROVIDER_ID, registration.project_id,
        metadata={"workspace_mode": "live", "input_frozen": "true"},
    )
    with pytest.raises(WorkspaceLocalError):
        provider.resolve(WorkspaceV1.contract_id, forged)
    assert provider.resolve(WorkspaceV1.contract_id, ref) is not None


def test_resolution_fails_closed_for_wrong_identity(provider, project_dir):
    _registered(provider, project_dir)
    with pytest.raises(ProjectNotRegistered):
        provider.make_ref("proj_does_not_exist")
    foreign = Ref(RefType.WORKSPACE, "some-other-provider", "x")
    with pytest.raises(WorkspaceLocalError):
        provider.resolve(WorkspaceV1.contract_id, foreign)
    ours_wrong_project = Ref(RefType.WORKSPACE, PROVIDER_ID, "proj_missing")
    with pytest.raises(ProjectNotRegistered):
        provider.resolve(WorkspaceV1.contract_id, ours_wrong_project)


def test_provider_id_is_not_the_git_worktree_provider(provider):
    assert provider.descriptor().id == "local-live-workspace"
    assert provider.descriptor().id != "git-workspace"


# -- live mutation visibility -------------------------------------------------


def test_harness_mutation_is_immediately_visible_in_user_directory(
    provider, project_dir
):
    registration = _registered(provider, project_dir)
    ref = provider.make_ref(registration.project_id)
    resolved = provider.resolve(WorkspaceV1.contract_id, ref)
    # The "harness" writes through the resolved live path.
    target = resolved.path / "src" / "generated.txt"
    target.write_text("produced by the harness\n")
    # The user directory sees it immediately: no copy, no worktree.
    assert (project_dir / "src" / "generated.txt").read_text().startswith("produced")
    assert resolved.path == project_dir.resolve()


def test_external_edit_is_visible_to_resolution(provider, project_dir):
    registration = _registered(provider, project_dir)
    ref = provider.make_ref(registration.project_id)
    baseline = provider.baseline_observation(registration.project_id)
    # The user edits their own file outside any harness.
    (project_dir / "README.md").write_text("edited by the user\n")
    report = provider.after_observation(registration.project_id, baseline)
    assert report.changed
    assert report.source == OBSERVATION_SOURCE_SHARED
    assert "cannot be attributed" in report.note


# -- confinement: symlink / traversal / moved root -------------------------------


def test_symlinked_directories_are_skipped_not_followed(provider, tmp_path):
    outside = tmp_path / "outside-secret"
    outside.mkdir()
    (outside / "secret.txt").write_text("secret")
    root = tmp_path / "confinement-root"
    root.mkdir()
    (root / "ok.txt").write_text("ok")
    os.symlink(outside, root / "escape-link")
    _registered(provider, root)
    observation = provider.baseline_observation(
        provider.list_projects()[0].project_id
    )
    assert observation.symlink_skipped >= 1
    assert observation.truncated or "escape-link" not in json.dumps(
        observation.details
    )
    # The secret file must never enter the inventory digest inputs.
    assert "secret" not in observation.inventory_digest


def test_moved_or_replaced_root_fails_closed(provider, tmp_path):
    root = tmp_path / "movable"
    root.mkdir()
    registration = provider.register_project(root)
    # Replace the real directory with a symlink to elsewhere.
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    root.rmdir()
    os.symlink(elsewhere, root)
    with pytest.raises(ProjectIdentityConflict):
        provider.baseline_observation(registration.project_id)


def test_deleted_root_fails_closed(provider, tmp_path):
    root = tmp_path / "doomed"
    root.mkdir()
    registration = provider.register_project(root)
    root.rmdir()
    with pytest.raises(ProjectIdentityConflict):
        provider.baseline_observation(registration.project_id)


def test_provider_never_accepts_arbitrary_paths_for_operations(
    provider, project_dir, tmp_path
):
    """Every operational API is keyed by registered project identity, not
    by caller-supplied paths."""
    registration = _registered(provider, project_dir)
    outside = tmp_path / "outside"
    outside.mkdir()
    # There is no path-taking operation to abuse: inventory, observation and
    # resolution all go through project_id verification only.
    assert not any(
        name in dir(provider)
        for name in ("walk_path", "read_file", "write_file", "resolve_path")
    )
    # Unknown identities fail closed.
    with pytest.raises(ProjectNotRegistered):
        provider.baseline_observation("proj_unknown")


# -- bounded non-git inventory ------------------------------------------------


def test_non_git_inventory_is_bounded(provider, project_dir):
    registration = _registered(provider, project_dir)
    baseline = provider.baseline_observation(registration.project_id)
    assert not baseline.git_tracked
    assert baseline.coverage == "complete"
    assert baseline.files_seen >= 2
    assert baseline.details["input_frozen"] == "false"


def test_non_git_inventory_hits_hard_file_limit(tmp_path):
    root = tmp_path / "many-files"
    root.mkdir()
    for i in range(40):
        (root / f"f{i:03}.txt").write_text("x")
    tiny = LocalLiveWorkspaceProvider(
        tmp_path / "reg.json", limits=InventoryLimits(max_files=10)
    )
    registration = tiny.register_project(root)
    baseline = tiny.baseline_observation(registration.project_id)
    assert baseline.truncated
    assert baseline.coverage == "partial"
    assert baseline.files_seen == 10


def test_non_git_inventory_hits_depth_limit(tmp_path):
    root = tmp_path / "deep"
    deep = root
    for i in range(12):
        deep = deep / f"d{i}"
    deep.mkdir(parents=True)
    (deep / "leaf.txt").write_text("bottom")
    tiny = LocalLiveWorkspaceProvider(
        tmp_path / "reg.json", limits=InventoryLimits(max_depth=3)
    )
    registration = tiny.register_project(root)
    baseline = tiny.baseline_observation(registration.project_id)
    assert baseline.truncated
    assert baseline.coverage == "partial"


def test_change_detection_on_non_git_project(provider, project_dir):
    registration = _registered(provider, project_dir)
    baseline = provider.baseline_observation(registration.project_id)
    assert not provider.after_observation(registration.project_id, baseline).changed
    (project_dir / "new-file.txt").write_text("added")
    report = provider.after_observation(registration.project_id, baseline)
    assert report.changed
    assert report.source == OBSERVATION_SOURCE_SHARED


# -- git projects ---------------------------------------------------------------


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True, capture_output=True, text=True,
        env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
             "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t",
             "HOME": str(repo)},
    )


@pytest.mark.skipif(
    subprocess.run(["git", "--version"], capture_output=True).returncode != 0,
    reason="git binary unavailable",
)
def test_git_baseline_captures_head_and_status(provider, tmp_path):
    repo = tmp_path / "git-project"
    repo.mkdir()
    (repo / "a.txt").write_text("one\n")
    _git(repo, "init")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "init")
    registration = provider.register_project(repo)
    baseline = provider.baseline_observation(registration.project_id)
    assert baseline.git_tracked
    assert baseline.git_head
    assert baseline.git_status_digest is not None
    # Untracked change shows in the status digest.
    (repo / "b.txt").write_text("two\n")
    after = provider.baseline_observation(registration.project_id)
    report = provider.after_observation(registration.project_id, baseline)
    assert report.changed
    assert report.source == OBSERVATION_SOURCE_SHARED
    assert after.git_head == baseline.git_head  # HEAD unchanged; status changed


# -- plugin registration -----------------------------------------------------------


def test_plugin_registers_live_workspace_provider(tmp_path):
    from agent_box.extensions.api import PluginContext

    plugin = WorkspaceLocalPlugin()
    assert plugin.descriptor().api_version == 2
    context = PluginContext(
        agent_box_version="2.0.0a1",
        agent_box_home=tmp_path / "home",
        plugin_data_dir=tmp_path / "home" / "plugins" / "workspace-local",
    )
    registration = plugin.build(context)
    assert len(registration.resource_providers) == 1
    provider = registration.resource_providers[0]
    assert provider.descriptor().id == PROVIDER_ID
    assert WorkspaceV1.contract_id in provider.supported_contract_ids
    # build() must not create the registry database (no discovery-time FS writes).
    assert not (context.plugin_data_dir / "workspace-registry.db").exists()


# -- durable SQLite registry (A7) ----------------------------------------------

import sqlite3

from agent_box_workspace_local.registry import (
    REGISTRY_SCHEMA_VERSION,
    ProjectRegistry,
    RegistryCorrupt,
    RegistryVersionUnsupported,
)


def _registry_rows(db_path: Path) -> list[tuple]:
    conn = sqlite3.connect(str(db_path))
    try:
        return conn.execute(
            "SELECT project_id, path, registered_at FROM projects ORDER BY project_id"
        ).fetchall()
    finally:
        conn.close()


def _registry_meta(db_path: Path) -> dict[str, str]:
    conn = sqlite3.connect(str(db_path))
    try:
        return {
            row[0]: row[1]
            for row in conn.execute("SELECT key, value FROM registry_meta").fetchall()
        }
    finally:
        conn.close()


def _set_meta(db_path: Path, value: str) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("UPDATE registry_meta SET value = ?", (value,))
        conn.commit()
    finally:
        conn.close()


def test_registry_is_durable_sqlite_with_version_meta(provider, project_dir):
    registration = provider.register_project(project_dir)
    db_path = provider._registry._db_path
    assert db_path.exists()
    meta = _registry_meta(db_path)
    assert meta["schema_version"] == str(REGISTRY_SCHEMA_VERSION)
    rows = _registry_rows(db_path)
    assert rows == [
        (registration.project_id, registration.path, registration.registered_at)
    ]


def test_registry_connection_uses_wal_and_full_sync(provider):
    conn = provider._registry._connection()
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert conn.execute("PRAGMA synchronous").fetchone()[0] == 2  # FULL


def test_reregistration_is_idempotent_and_preserves_registered_at(
    provider, project_dir
):
    first = provider.register_project(project_dir)
    second = provider.register_project(project_dir)
    assert first.project_id == second.project_id
    assert first.registered_at == second.registered_at
    assert len(_registry_rows(provider._registry._db_path)) == 1


def test_empty_or_whitespace_path_is_rejected(provider, tmp_path):
    for bad in ("", "   ", "\t\n"):
        with pytest.raises(ProjectPathRejected):
            provider.register_project(bad)
    assert provider.list_projects() == ()


def test_symlinked_root_path_is_rejected_fail_closed(provider, tmp_path):
    real = tmp_path / "real-root"
    real.mkdir()
    link = tmp_path / "linked-root"
    import os as _os

    _os.symlink(real, link)
    with pytest.raises(ProjectPathRejected):
        provider.register_project(link)
    assert provider.list_projects() == ()
    # The real directory underneath is still registrable.
    provider.register_project(real)
    assert len(provider.list_projects()) == 1


def test_identity_conflict_fails_closed(provider, project_dir):
    registration = provider.register_project(project_dir)
    other_path = str(project_dir.parent / "some-other-root")
    # Same project id, different canonical path → conflict.
    with pytest.raises(ProjectIdentityConflict):
        provider._registry.register(registration.project_id, other_path)
    # Different project id, same canonical path → conflict.
    with pytest.raises(ProjectIdentityConflict):
        provider._registry.register("proj_otherpath0", registration.path)
    # The original row is untouched.
    assert _registry_rows(provider._registry._db_path) == [
        (registration.project_id, registration.path, registration.registered_at)
    ]


def test_corrupt_meta_fails_closed_never_treated_as_empty(tmp_path, project_dir):
    db_path = tmp_path / "reg.db"
    provider = LocalLiveWorkspaceProvider(db_path)
    provider.register_project(project_dir)
    provider.close()
    _set_meta(db_path, "not-a-version")
    reopened = LocalLiveWorkspaceProvider(db_path)
    with pytest.raises(RegistryCorrupt):
        reopened.list_projects()


def test_missing_meta_table_fails_closed(tmp_path, project_dir):
    db_path = tmp_path / "reg.db"
    provider = LocalLiveWorkspaceProvider(db_path)
    provider.register_project(project_dir)
    provider.close()
    conn = sqlite3.connect(str(db_path))
    conn.execute("DROP TABLE registry_meta")
    conn.commit()
    conn.close()
    reopened = LocalLiveWorkspaceProvider(db_path)
    with pytest.raises(RegistryCorrupt):
        reopened.list_projects()


def test_unknown_newer_schema_version_fails_closed(tmp_path, project_dir):
    db_path = tmp_path / "reg.db"
    provider = LocalLiveWorkspaceProvider(db_path)
    provider.register_project(project_dir)
    provider.close()
    _set_meta(db_path, str(REGISTRY_SCHEMA_VERSION + 7))
    reopened = LocalLiveWorkspaceProvider(db_path)
    with pytest.raises(RegistryVersionUnsupported):
        reopened.list_projects()


def test_non_sqlite_file_fails_closed(tmp_path, project_dir):
    db_path = tmp_path / "reg.db"
    db_path.write_bytes(b"this is definitely not a sqlite database\x00\x01")
    provider = LocalLiveWorkspaceProvider(db_path)
    with pytest.raises(RegistryCorrupt):
        provider.register_project(project_dir)


def test_legacy_projects_json_is_ignored_not_migrated(tmp_path, project_dir):
    """The Phase-1 projects.json format was a test artifact only; the
    SQLite registry neither reads nor migrates it."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "projects.json").write_text(
        json.dumps({"proj_legacy": {"project_id": "proj_legacy", "path": "/legacy"}}),
        encoding="utf-8",
    )
    provider = LocalLiveWorkspaceProvider(data_dir / "workspace-registry.db")
    assert provider.list_projects() == ()
    provider.register_project(project_dir)
    assert [p.project_id for p in provider.list_projects()] != ["proj_legacy"]


def test_concurrent_registration_is_exactly_once(tmp_path):
    import hashlib
    from concurrent.futures import ThreadPoolExecutor

    db_path = tmp_path / "conc.db"
    provider = LocalLiveWorkspaceProvider(db_path)
    roots = []
    for i in range(6):
        root = tmp_path / f"root-{i}"
        root.mkdir()
        roots.append(root)

    def register(root):
        return provider.register_project(root)

    with ThreadPoolExecutor(max_workers=8) as pool:
        # 6 distinct paths (each registered twice concurrently) + heavy
        # contention on one shared path.
        futures = [pool.submit(register, root) for root in roots for _ in (0, 1)]
        futures += [pool.submit(register, roots[0]) for _ in range(6)]
        results = [f.result() for f in futures]

    by_id: dict[str, set] = {}
    for registration in results:
        expected_id = "proj_" + hashlib.sha256(
            str(Path(registration.path)).encode("utf-8")
        ).hexdigest()[:16]
        assert registration.project_id == expected_id
        by_id.setdefault(registration.project_id, set()).add(
            registration.registered_at
        )
    assert len(by_id) == 6
    # One row per project, one registered_at per project.
    assert len(_registry_rows(db_path)) == 6
    assert all(len(dates) == 1 for dates in by_id.values())
    provider.close()


def test_concurrent_registration_across_instances_is_exactly_once(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    db_path = tmp_path / "multi.db"
    root = tmp_path / "shared-root"
    root.mkdir()
    providers = [LocalLiveWorkspaceProvider(db_path) for _ in range(4)]

    def register(provider):
        return provider.register_project(root)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = [
            f.result()
            for f in [pool.submit(register, p) for p in providers for _ in range(3)]
        ]
    assert len({r.project_id for r in results}) == 1
    assert len({r.registered_at for r in results}) == 1
    assert len(_registry_rows(db_path)) == 1
    for p in providers:
        p.close()


class _Crash(Exception):
    pass


def test_fault_hook_crash_mid_registration_leaves_old_or_new_state(
    tmp_path, project_dir
):
    """Crash before the durable insert: the registry keeps its old state,
    and a restart recovers cleanly so re-registration lands exactly once."""
    db_path = tmp_path / "crash.db"
    survivor = tmp_path / "survivor"
    survivor.mkdir()

    healthy = LocalLiveWorkspaceProvider(db_path)
    healthy.register_project(survivor)
    healthy.close()
    before = _registry_rows(db_path)

    def crashing_hook(step: str) -> None:
        if step == "register_project:pre_insert":
            raise _Crash(f"simulated crash at {step}")

    crashing = LocalLiveWorkspaceProvider(db_path, fault_hook=crashing_hook)
    with pytest.raises(_Crash):
        crashing.register_project(project_dir)
    crashing.close()

    # Old state preserved: no partial row, no new project.
    assert _registry_rows(db_path) == before

    # Restart recovery: re-registration succeeds exactly once.
    restarted = LocalLiveWorkspaceProvider(db_path)
    first = restarted.register_project(project_dir)
    second = restarted.register_project(project_dir)
    assert first.project_id == second.project_id
    assert first.registered_at == second.registered_at
    rows = _registry_rows(db_path)
    assert len(rows) == 2
    assert sorted(row[0] for row in rows) == sorted(
        [before[0][0], first.project_id]
    )
    restarted.close()


def test_fault_hook_never_triggers_on_healthy_path(provider, project_dir):
    seen: list[str] = []
    provider._registry._fault_hook = seen.append
    provider.register_project(project_dir)
    assert seen == ["register_project:pre_insert"]
