"""Transaction boundary repair: profile pointer authority, mutation
fault-injection, prepare/mutation serialization and reconcile generation
CAS.  All concurrency tests use leases/barriers/hooks — never sleeps."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box_harnesses.generic.profile_store import ProfileStore, _digest
from agent_box_harnesses.native_home.failures import (
    NATIVE_HOME_RECONCILE_AMBIGUOUS,
    PROFILE_MUTATION_LEASE_CONFLICT,
    PROFILE_POINTER_INVALID,
    PROFILE_POINTER_NOT_FOUND,
    PROFILE_REVISION_CONFLICT,
    ProfileNativeHomeError,
)
from agent_box_harnesses.native_home.policy import FIVE_POLICIES
from agent_box_harnesses.native_home.recovery import recover_pending
from agent_box_harnesses.native_home.tree import digest_tree
from agent_box_harnesses.native_home.view import (
    ActiveExecutionRegistry,
    NativeHomeView,
    ProfileMutationLease,
    generation_of,
)


def render_codex(payload):
    return ((".codex/config.toml", f'model = "{payload.get("model", "offline")}"\n'.encode()),)


def make_store(tmp_path: Path):
    return ProfileStore(
        tmp_path / "profiles", policies=FIVE_POLICIES,
        config_renderers={"codex": render_codex},
    )


# --------------------------------------------------------------------------- #
# A. profile.json current pointer authority
# --------------------------------------------------------------------------- #

def test_pointer_is_current_authority_over_existing_revision(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    # an existing revision 2 whose envelope is complete, but the pointer
    # still pins revision 1 -> get()/list() MUST return 1
    revision_dir = layout.revision_dir(2)
    revision_dir.mkdir(parents=True)
    envelope = json.loads((layout.revision_dir(1) / "envelope.json").read_text())
    envelope = dict(envelope, revision=2)
    envelope["digest"] = _digest(envelope)
    (revision_dir / "envelope.json").write_text(json.dumps(envelope))
    assert store.get("codex", "main")["revision"] == 1
    assert [value["revision"] for value in store.list("codex")] == [1]
    # exact historical reads still work
    assert store.get("codex", "main", 2)["revision"] == 2


def test_pointer_to_missing_revision_fails_closed_typed(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    pointer = json.loads(layout.profile_json.read_text())
    pointer["revision"] = 99
    layout.profile_json.write_text(json.dumps(pointer))
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.get("codex", "main")
    assert exc.value.code == PROFILE_POINTER_INVALID
    # no silent max-revision fallback: pointer_problems reports it typed
    assert any(x["profile_id"] == "main" and x["code"] == PROFILE_POINTER_INVALID for x in store.pointer_problems("codex"))


def test_orphan_revision_never_becomes_current(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    layout = store.layout("codex", "main")
    # orphan revision 5 with valid content: invisible to current reads
    orphan = layout.revision_dir(5)
    orphan.mkdir(parents=True)
    envelope = json.loads((layout.revision_dir(2) / "envelope.json").read_text())
    envelope = dict(envelope, revision=5)
    envelope["digest"] = _digest(envelope)
    (orphan / "envelope.json").write_text(json.dumps(envelope))
    assert store.get("codex", "main")["revision"] == 2
    assert [value["revision"] for value in store.list("codex")] == [2]


def test_missing_pointer_fails_closed_not_max_revision_scan(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    layout.profile_json.unlink()
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.get("codex", "main")
    assert exc.value.code == PROFILE_POINTER_NOT_FOUND
    assert store.list("codex") == ()


# --------------------------------------------------------------------------- #
# B. profile mutation journaled transaction / CAS / fault recovery
# --------------------------------------------------------------------------- #

def test_put_cas_is_rechecked_inside_the_lease(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    # stale expected revision -> typed conflict; nothing changes
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "z"}}, expected_revision=5)
    assert exc.value.code == PROFILE_REVISION_CONFLICT
    assert store.get("codex", "main")["revision"] == 1
    assert (store.layout("codex", "main").native_home / ".codex/config.toml").read_text() == 'model = "a"\n'


def test_fault_after_staged_rolls_back(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    home = layout.native_home
    before_pointer = json.loads(layout.profile_json.read_text())
    before_config = (home / ".codex/config.toml").read_text()

    def boom(*_args, **_kwargs):
        raise OSError("injected-fault")

    original = store._apply_config_patch
    monkeypatch.setattr(store, "_apply_config_patch", boom)
    with pytest.raises(OSError, match="injected-fault"):
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    assert json.loads(layout.profile_json.read_text()) == before_pointer
    assert store.get("codex", "main")["revision"] == 1
    assert (home / ".codex/config.toml").read_text() == before_config
    store._apply_config_patch = original
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    assert store.get("codex", "main")["revision"] == 2


def test_fault_after_applied_rolls_back_config(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    home = layout.native_home
    before_pointer = json.loads(layout.profile_json.read_text())
    before_config = (home / ".codex/config.toml").read_text()
    monkeypatch.setattr(store, "_write_envelope_and_pointer", lambda *a, **k: (_ for _ in ()).throw(OSError("injected-fault")))
    with pytest.raises(OSError, match="injected-fault"):
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    # native config was patched then fully restored from the journal backup
    assert (home / ".codex/config.toml").read_text() == before_config
    assert json.loads(layout.profile_json.read_text()) == before_pointer
    assert store.get("codex", "main")["revision"] == 1
    assert store.get("codex", "main", 1)["native_payload"]["model"] == "a"


def test_fault_at_pointer_replace_rolls_back_revision_and_config(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    home = layout.native_home
    before_pointer = json.loads(layout.profile_json.read_text())
    monkeypatch.setattr(store, "_write_pointer_json", lambda *a, **k: (_ for _ in ()).throw(OSError("injected-fault")))
    with pytest.raises(OSError, match="injected-fault"):
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    # the revision envelope (rev 2) was written but is NOT visible, and the
    # rollback removed it again
    assert json.loads(layout.profile_json.read_text()) == before_pointer
    assert not layout.revision_dir(2).exists()
    assert (home / ".codex/config.toml").read_text() == 'model = "a"\n'
    assert store.get("codex", "main")["revision"] == 1
    # recovery re-entry stays idempotent
    assert recover_pending(layout) == []


def test_manager_create_revision_passes_expected_revision(tmp_path):
    from agent_box_harnesses.generic.profile_manager import GenericProfileManager
    from agent_box_harnesses.registry import load_builtin_registry

    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    definition = next(d for d in load_builtin_registry().all() if d.driver == "codex")
    manager = GenericProfileManager(store, definition)
    with pytest.raises(ProfileNativeHomeError) as exc:
        manager.create_revision({"profile_id": "main", "native_payload": {"model": "x"}}, expected_revision=7)
    assert exc.value.code == PROFILE_REVISION_CONFLICT
    # successful explicit CAS
    manager.create_revision({"profile_id": "main", "native_payload": {"model": "x"}}, expected_revision=1)
    assert store.get("codex", "main")["revision"] == 2


# --------------------------------------------------------------------------- #
# C. execution prepare freeze (lease-held critical section)
# --------------------------------------------------------------------------- #

def test_prepare_fails_closed_while_mutation_lease_is_held(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    lease = ProfileMutationLease(layout)
    lease.acquire("external-mutation")
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1", staging_root=tmp_path / "staging",
                          profile_store=store)
    with pytest.raises(ProfileNativeHomeError) as exc:
        view.prepare()
    assert exc.value.code == PROFILE_MUTATION_LEASE_CONFLICT
    assert not view.root.exists()  # no partial view
    lease.release()
    view.prepare()  # proceeds once the mutation side finished
    assert view.root.is_dir()
    view.discard()


def test_prepare_failure_cleans_view_and_marker(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    import agent_box_harnesses.native_home.view as view_module

    original = view_module.copy_tree

    def broken(policy, source, destination, **kwargs):
        raise OSError("mid-copy")

    monkeypatch.setattr(view_module, "copy_tree", broken)
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1", staging_root=tmp_path / "staging",
                          profile_store=store)
    with pytest.raises(ProfileNativeHomeError) as exc:
        view.prepare()
    assert exc.value.code == "NATIVE_HOME_VIEW_PREPARE_FAILED"
    # no marker, no partial view, lease released
    assert ActiveExecutionRegistry(layout).active() == ()
    assert not view.root.exists()
    assert not layout.mutation_lease.exists()
    monkeypatch.setattr(view_module, "copy_tree", original)
    view.prepare()  # a fresh prepare works afterwards
    view.discard()


def test_mutation_after_prepare_is_blocked_by_marker(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1", staging_root=tmp_path / "staging",
                          profile_store=store)
    view.prepare()
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    assert exc.value.code == PROFILE_MUTATION_LEASE_CONFLICT
    view.discard()
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)


def test_two_prepares_freeze_the_same_revision(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    first = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1", staging_root=tmp_path / "staging",
                           profile_store=store)
    second = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_2", staging_root=tmp_path / "staging",
                            profile_store=store)
    first.prepare()
    second.prepare()
    assert first.expected_generation() == second.expected_generation()
    assert ActiveExecutionRegistry(layout).active() == ("exec_1", "exec_2")
    first.discard()
    second.discard()


# --------------------------------------------------------------------------- #
# D. reconcile generation / digest single-lease transaction
# --------------------------------------------------------------------------- #

def test_pointer_tree_digest_is_the_persistent_home_digest(tmp_path):
    store = make_store(tmp_path)
    layout = store.layout("codex", "main")
    home = layout.native_home
    (home / ".codex").mkdir(parents=True, exist_ok=True)
    (home / ".codex/sessions").mkdir(exist_ok=True)
    (home / ".codex/sessions/state.jsonl").write_text("{}")
    # home content established BEFORE put: the pointer digest covers it
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1", staging_root=tmp_path / "staging",
                          profile_store=store)
    gen = generation_of(layout)
    view.prepare(overlays=[(".codex/config.toml", b'model = "OVERRIDE"\n')])
    (sv := view.root / ".codex/sessions").mkdir(exist_ok=True)
    (sv / "run.jsonl").write_text("{}")
    report = view.reconcile(expected_generation=gen)
    assert report.status == "ok"
    pointer = store.pointer("codex", "main")
    # the overlay lives ONLY in the view; the pointer digest must equal the
    # PERSISTENT home digest, never the view digest
    assert pointer["native_tree_digest"] == digest_tree(FIVE_POLICIES["codex"], home)
    assert pointer["native_tree_digest"] != digest_tree(FIVE_POLICIES["codex"], view.root)
    assert (home / ".codex/config.toml").read_text() == 'model = "a"\n'  # overlay NOT written back
    assert pointer["native_state_generation"] == gen + 1
    view.discard()


def test_two_reconciles_same_generation_only_one_wins(tmp_path):
    store = make_store(tmp_path)
    layout = store.layout("codex", "main")
    home = layout.native_home
    (home / ".codex").mkdir(parents=True, exist_ok=True)
    (home / ".codex/sessions").mkdir(exist_ok=True)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    gen = generation_of(layout)
    first = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1", staging_root=tmp_path / "staging",
                           profile_store=store)
    second = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_2", staging_root=tmp_path / "staging",
                            profile_store=store)
    first.prepare()
    second.prepare()
    (first.root / ".codex/sessions/a.jsonl").write_text("{}")
    (second.root / ".codex/sessions/b.jsonl").write_text("{}")
    report1 = first.reconcile(expected_generation=gen)
    assert report1.status == "ok"
    report2 = second.reconcile(expected_generation=gen)  # stale generation
    # typed ambiguous/drift — never a silent last-writer-wins
    assert report2.status == "ambiguous"
    assert report2.code in {"NATIVE_HOME_RECONCILE_AMBIGUOUS", "PROFILE_NATIVE_HOME_DRIFT"}
    # the second view never overwrote the first's copy-back
    assert (home / ".codex/sessions/a.jsonl").exists()
    assert not (home / ".codex/sessions/b.jsonl").exists()
    first.discard()
    second.preserve_recovery()


def test_reconcile_pointer_failure_rolls_back_copyback(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    layout = store.layout("codex", "main")
    home = layout.native_home
    (home / ".codex").mkdir(parents=True, exist_ok=True)
    (home / ".codex/sessions").mkdir(exist_ok=True)
    (home / ".codex/sessions/state.jsonl").write_text("{}")
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    gen = generation_of(layout)
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1", staging_root=tmp_path / "staging",
                          profile_store=store)
    view.prepare()
    (view.root / ".codex/sessions/new.jsonl").write_text("{}")
    def boom(*_args, **_kwargs):
        raise ProfileNativeHomeError("PROFILE_NATIVE_HOME_DRIFT", "forced")

    monkeypatch.setattr(store, "commit_native_generation", boom)
    with pytest.raises(ProfileNativeHomeError):
        view.reconcile(expected_generation=gen)
    # the copy-back was rolled back: the persistent home has no new file and
    # the generation never advanced
    assert not (home / ".codex/sessions/new.jsonl").exists()
    assert generation_of(layout) == gen
    # the journal closed deterministically (ROLLED_BACK) and is idempotent
    from agent_box_harnesses.native_home.transaction import pending_journals

    assert pending_journals(layout) == ()
    view.preserve_recovery()


def test_reconcile_excludes_config_skill_credential_ephemeral(tmp_path):
    store = make_store(tmp_path)
    layout = store.layout("codex", "main")
    home = layout.native_home
    (home / ".codex").mkdir(parents=True, exist_ok=True)
    (home / ".codex/sessions").mkdir(exist_ok=True)
    (home / ".codex/auth.json").write_text("SECRET")
    (home / ".agents").mkdir(exist_ok=True)
    (home / ".agents/skills").mkdir(exist_ok=True)
    (home / ".agents/skills/review").mkdir(exist_ok=True)
    (home / ".agents/skills/review/SKILL.md").write_text("---\nname: review\ndescription: d\n---\n")
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    gen = generation_of(layout)
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1", staging_root=tmp_path / "staging",
                          profile_store=store)
    view.prepare(overlays=[(".codex/config.toml", b'changed = true\n')])
    # the harness mutates managed/credential/ephemeral-ish paths inside the view
    (view.root / ".codex/config.toml").write_text("model = hacked\n")
    (view.root / ".codex/auth.json").write_text("HACKED")
    (view.root / ".agents/skills/review/SKILL.md").write_text("hacked")
    (view.root / ".codex/cache").mkdir(exist_ok=True)
    (view.root / ".codex/cache/x").write_text("cache")
    (view.root / ".codex/notes.md").write_text("unknown-new")
    report = view.reconcile(expected_generation=gen)
    assert report.status == "ok"
    # CONFIG_AUTHORITY / SKILL / CREDENTIAL / EPHEMERAL never flow back
    assert (home / ".codex/config.toml").read_text() == 'model = "a"\n'
    assert (home / ".codex/auth.json").read_text() == "SECRET"
    assert (home / ".agents/skills/review/SKILL.md").read_text().startswith("---")
    assert not (home / ".codex/cache/x").exists()
    # UNKNOWN single-side change flows back
    assert (home / ".codex/notes.md").read_text() == "unknown-new"
    view.discard()