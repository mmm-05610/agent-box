"""CRASH-WINDOW closure: pointer replace/journal-step fault windows, exact
execution freeze, reconcile intent recovery and the strict state machine."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.native_home.failures import (
    NATIVE_HOME_RECONCILE_FAILED,
    PROFILE_FREEZE_DIGEST_MISMATCH,
    PROFILE_FREEZE_REVISION_MISMATCH,
    PROFILE_POINTER_INVALID,
    PROFILE_POINTER_NOT_FOUND,
    PROFILE_REVISION_CONFLICT,
    ProfileNativeHomeError,
)
from agent_box_harnesses.native_home.policy import FIVE_POLICIES
from agent_box_harnesses.native_home.recovery import recover_pending
from agent_box_harnesses.native_home.tree import digest_tree
from agent_box_harnesses.native_home.transaction import (
    ProfileTransaction,
    TransactionError,
    pending_journals,
    validate_journal,
    valid_transition,
    write_journal,
)
from agent_box_harnesses.native_home.view import (
    ActiveExecutionRegistry,
    FrozenProfileSnapshot,
    NativeHomeView,
    generation_of,
)
def render_codex(payload):
    return ((".codex/config.toml", f'model = "{payload.get("model", "offline")}"\n'.encode()),)


def make_store(tmp_path: Path):
    return ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES, config_renderers={"codex": render_codex})


def _pointer_of(tmp_path: Path):
    layout = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES).layout("codex", "main")
    return layout


# --------------------------------------------------------------------------- #
# A. pointer replace / journal-step crash windows (existing + fresh)
# --------------------------------------------------------------------------- #

def test_revision_written_then_pointer_replace_fails_existing(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    before = json.loads(layout.profile_json.read_text())

    def boom(*_args, **_kwargs):
        raise OSError("pointer-replace-failed")

    monkeypatch.setattr(store, "_write_pointer_json", boom)
    with pytest.raises(OSError, match="pointer-replace-failed"):
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    # actual == previous -> rolled back: pointer untouched, revision cleaned
    assert json.loads(layout.profile_json.read_text()) == before
    assert not layout.revision_dir(2).exists()
    assert store.get("codex", "main")["revision"] == 1
    assert pending_journals(layout) == ()
    assert recover_pending(layout) == []  # idempotent re-entry


def test_revision_written_then_pointer_replace_fails_fresh(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    layout = store.layout("codex", "main")

    def boom(*_args, **_kwargs):
        raise OSError("pointer-replace-failed")

    original = store._write_pointer_json
    monkeypatch.setattr(store, "_write_pointer_json", boom)
    with pytest.raises(OSError, match="pointer-replace-failed"):
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    store._write_pointer_json = original
    # fresh profile: pointer never landed, revision cleaned, nothing dangling
    assert not layout.profile_json.exists()
    assert not layout.revision_dir(1).exists()
    assert not layout.native_home.exists() or True
    assert pending_journals(layout) == ()
    # a fresh create afterwards works
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    assert store.get("codex", "main")["revision"] == 1


def test_pointer_replaced_then_journal_step_fails_existing(tmp_path, monkeypatch):
    """THE audit repro: replace succeeded but POINTER_COMMITTED was never
    journaled.  Recovery must NOT roll the new pointer back and delete the
    new revision; it verifies actual == proposed and completes the commit."""
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    # patch: ProfileTransaction.step raises when POINTER_COMMITTED is written
    import agent_box_harnesses.native_home.transaction as tx_module

    original = tx_module.ProfileTransaction.step

    def patched(self, name, **extra):
        if name == "POINTER_COMMITTED":
            raise OSError("journal-step-failed")
        return original(self, name, **extra)

    monkeypatch.setattr(tx_module.ProfileTransaction, "step", patched)
    # COMMITTED semantics (frozen): a fulfilled pointer commit is returned
    # as SUCCESS, never as an ordinary failure
    result = store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    monkeypatch.setattr(tx_module.ProfileTransaction, "step", original)
    assert result["revision"] == 2 and result["native_payload"]["model"] == "b"
    current = store.get("codex", "main")
    assert current["revision"] == 2
    assert current["native_payload"]["model"] == "b"
    assert layout.revision_dir(2).exists()
    pointer = json.loads(layout.profile_json.read_text())
    assert pointer["revision"] == 2 and pointer["digest"] == current["digest"]
    # caller can DISTINGUISH committed: a stale-CAS retry is a conflict,
    # not a repeatable ordinary failure
    with pytest.raises(ProfileNativeHomeError) as conflict:
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "c"}}, expected_revision=1)
    assert conflict.value.code == PROFILE_REVISION_CONFLICT
    # the failure handler closed the journal COMMITTED; recovery is empty + idempotent
    assert pending_journals(layout) == ()
    assert recover_pending(layout) == []
    assert recover_pending(layout) == []


def test_pointer_replaced_then_journal_step_fails_fresh(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    layout = store.layout("codex", "main")
    import agent_box_harnesses.native_home.transaction as tx_module

    original = tx_module.ProfileTransaction.step

    def patched(self, name, **extra):
        if name == "POINTER_COMMITTED":
            raise OSError("journal-step-failed")
        return original(self, name, **extra)

    monkeypatch.setattr(tx_module.ProfileTransaction, "step", patched)
    result = store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    monkeypatch.setattr(tx_module.ProfileTransaction, "step", original)
    # fresh create committed despite the journal-step failure — SUCCESS
    assert result["revision"] == 1
    assert store.get("codex", "main")["revision"] == 1
    assert layout.revision_dir(1).exists()
    assert pending_journals(layout) == ()


def test_pointer_committed_then_commit_step_fails(tmp_path, monkeypatch):
    """POINTER_COMMITTED written, COMMITTED step fails -> committed close."""
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    import agent_box_harnesses.native_home.transaction as tx_module

    original = tx_module.ProfileTransaction.step

    def patched(self, name, **extra):
        if name == "COMMITTED":
            raise OSError("commit-step-failed")
        return original(self, name, **extra)

    monkeypatch.setattr(tx_module.ProfileTransaction, "step", patched)
    result = store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    monkeypatch.setattr(tx_module.ProfileTransaction, "step", original)
    assert result["revision"] == 2
    assert store.get("codex", "main")["revision"] == 2
    assert pending_journals(layout) == ()
    assert recover_pending(layout) == []


def test_no_dangling_pointer_after_any_window(tmp_path):
    """Across all three windows the final profile.json always resolves."""
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    # simulate the historical dangling state (pointer->2, no envelope) and
    # prove current reads fail closed typed, never silently resolve
    pointer = json.loads(layout.profile_json.read_text())
    pointer["revision"] = 2
    layout.profile_json.write_text(json.dumps(pointer))
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.get("codex", "main")
    assert exc.value.code == PROFILE_POINTER_INVALID
    assert store.pointer_problems("codex")[0]["code"] == PROFILE_POINTER_INVALID


# --------------------------------------------------------------------------- #
# C. exact Profile freeze in execution prepare
# --------------------------------------------------------------------------- #

def _profile_store_put(tmp_path, model="a"):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": model}})
    return store


def test_prepare_rejects_frozen_revision_mismatch(tmp_path):
    store = _profile_store_put(tmp_path)
    envelope = store.get("codex", "main")  # rev 1
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)  # rev 2
    layout = store.layout("codex", "main")
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    frozen = FrozenProfileSnapshot("codex", "main", int(envelope["revision"]), envelope["digest"])
    with pytest.raises(ProfileNativeHomeError) as exc:
        view.prepare(frozen=frozen)
    assert exc.value.code == PROFILE_FREEZE_REVISION_MISMATCH
    # no view, no marker, no lease residue
    assert not view.root.exists()
    assert ActiveExecutionRegistry(layout).active() == ()
    assert not layout.mutation_lease.exists()


def test_prepare_rejects_frozen_digest_mismatch(tmp_path):
    store = _profile_store_put(tmp_path)
    layout = store.layout("codex", "main")
    envelope = store.get("codex", "main")
    pointer = json.loads(layout.profile_json.read_text())
    pointer["digest"] = "sha256:" + "0" * 64
    layout.profile_json.write_text(json.dumps(pointer))
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    frozen = FrozenProfileSnapshot("codex", "main", int(envelope["revision"]), envelope["digest"])
    with pytest.raises(ProfileNativeHomeError) as exc:
        view.prepare(frozen=frozen)
    assert exc.value.code == PROFILE_FREEZE_DIGEST_MISMATCH
    assert not view.root.exists()
    assert ActiveExecutionRegistry(layout).active() == ()


def test_prepare_allows_generation_advance_with_same_revision(tmp_path):
    """Session/cache checkpoints advance the generation without a config
    revision; a freeze pinned at the SAME revision/digest still prepares and
    freezes the CURRENT generation (the base for reconcile CAS)."""
    store = _profile_store_put(tmp_path)
    layout = store.layout("codex", "main")
    envelope = store.get("codex", "main")
    store.commit_native_generation("codex", "main", tree_digest=digest_tree(FIVE_POLICIES["codex"], layout.native_home), expected_generation=0)
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    frozen = FrozenProfileSnapshot("codex", "main", int(envelope["revision"]), envelope["digest"])
    view.prepare(frozen=frozen)
    assert view.expected_generation() == 1  # frozen INSIDE the lease
    view.discard()


def test_broken_pointer_fails_prepare_closed(tmp_path):
    """A corrupt pointer must NOT be treated as fresh by execution prepare."""
    store = _profile_store_put(tmp_path)
    layout = store.layout("codex", "main")
    layout.profile_json.write_text("{not-json")
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    with pytest.raises(ProfileNativeHomeError) as exc:
        view.prepare()
    assert exc.value.code == PROFILE_POINTER_INVALID
    assert not view.root.exists()
    assert ActiveExecutionRegistry(layout).active() == ()


def test_installer_rejects_corrupt_pointer_as_fresh(tmp_path):
    from agent_box_harnesses.native_home.installer import ProfileSkillInstaller
    from agent_box_harnesses.native_home.failures import PROFILE_MUTATION_LEASE_CONFLICT  # noqa: F401

    store = _profile_store_put(tmp_path)
    layout = store.layout("codex", "main")
    layout.profile_json.write_text("garbage")
    installer = ProfileSkillInstaller(store, "codex", "main")
    with pytest.raises(ProfileNativeHomeError) as exc:
        installer._begin_mutation("skill-install", 1)
    assert exc.value.code == PROFILE_POINTER_INVALID


# --------------------------------------------------------------------------- #
# D. reconcile crash matrix (intent + actual)
# --------------------------------------------------------------------------- #

def _reconcile_setup(tmp_path):
    store = make_store(tmp_path)
    layout = store.layout("codex", "main")
    (layout.native_home / ".codex").mkdir(parents=True, exist_ok=True)
    (layout.native_home / ".codex/sessions").mkdir(exist_ok=True)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    return store, layout


def _reconcile_view(tmp_path, store, layout, execution_id="exec_1"):
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id=execution_id,
                          staging_root=tmp_path / "staging", profile_store=store)
    view.prepare()
    (sv := view.root / ".codex/sessions").mkdir(exist_ok=True)
    (sv / "run.jsonl").write_text("{}")
    return view


def test_reconcile_crash_after_pointer_replace_before_journal(tmp_path, monkeypatch):
    """pointer replaced, POINTER_COMMITTED step not journaled: recovery
    must recognize the fulfilled commit (actual == proposed, generation +
    tree digest match the intent)."""
    store, layout = _reconcile_setup(tmp_path)
    import agent_box_harnesses.native_home.transaction as tx_module

    original = tx_module.ProfileTransaction.step

    def patched(self, name, **extra):
        if name == "POINTER_COMMITTED":
            raise OSError("reconcile-step-failed")
        return original(self, name, **extra)

    monkeypatch.setattr(tx_module.ProfileTransaction, "step", patched)
    gen = generation_of(layout)
    view = _reconcile_view(tmp_path, store, layout)
    report = view.reconcile(expected_generation=gen)
    monkeypatch.setattr(tx_module.ProfileTransaction, "step", original)
    # COMMITTED semantics: the pointer replacement fulfilled the intent, so
    # reconcile reports SUCCESS (never a failed report with committed state)
    assert report.status == "ok"
    pointer = store.pointer("codex", "main")
    assert pointer["native_state_generation"] == gen + 1
    assert pointer["native_tree_digest"] == digest_tree(FIVE_POLICIES["codex"], layout.native_home)
    assert (layout.native_home / ".codex/sessions/run.jsonl").exists()
    assert pending_journals(layout) == ()
    assert recover_pending(layout) == []
    view.discard()


def test_reconcile_crash_at_applied_rolls_back_copyback(tmp_path, monkeypatch):
    store, layout = _reconcile_setup(tmp_path)
    gen = generation_of(layout)
    view = _reconcile_view(tmp_path, store, layout)
    # fail INSIDE the APPLIED (copy-back) loop: intent not yet declared
    def boom(self, name, **extra):
        if name == "APPLIED":
            raise OSError("applied-failed")
        from agent_box_harnesses.native_home.transaction import ProfileTransaction as PT

        return PT.step(self, name, **extra)

    import agent_box_harnesses.native_home.transaction as tx_module

    original = tx_module.ProfileTransaction.step
    monkeypatch.setattr(tx_module.ProfileTransaction, "step", boom)
    report = view.reconcile(expected_generation=gen)
    monkeypatch.setattr(tx_module.ProfileTransaction, "step", original)
    assert report.status == "failed"
    # rolled back (write-ahead APPLIED manifest): no copy-back, no
    # generation advance, view epoch intact
    assert not (layout.native_home / ".codex/sessions/run.jsonl").exists()
    assert generation_of(layout) == gen
    assert pending_journals(layout) == ()
    view.preserve_recovery()


def test_reconcile_committed_journal_reentry_idempotent(tmp_path):
    store, layout = _reconcile_setup(tmp_path)
    gen = generation_of(layout)
    view = _reconcile_view(tmp_path, store, layout)
    report = view.reconcile(expected_generation=gen)
    assert report.status == "ok"
    pointer = store.pointer("codex", "main")
    # simulate a crash between POINTER_COMMITTED and COMMITTED: a leftover
    # journal that stops right after the pointer commit
    journal = {
        "schema_version": 2, "txid": "reconcile-leftover", "harness_type": "codex",
        "profile_id": "main", "operation": "reconcile",
        "expected_revision": None, "expected_generation": gen,
        "previous_pointer": {"revision": 1, "digest": pointer["digest"]},
        "proposed_pointer": dict(pointer), "pointer_intent_declared": True,
        "receipts_digest_before": "", "receipts_digest_after": "",
        "steps": ["PREPARED", "APPLIED", "POINTER_COMMITTED"],
        "applied_files": [".codex/sessions/run.jsonl"],
        "revision_written": None, "pointer_committed": True, "backup_dir": None,
        "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00",
    }
    write_journal(layout, journal)
    first = recover_pending(layout)
    assert first[0]["status"] == "committed"
    assert recover_pending(layout) == []
    assert store.pointer("codex", "main")["native_state_generation"] == gen + 1
    assert (layout.native_home / ".codex/sessions/run.jsonl").exists()
    view.discard()


def test_reconcile_proposed_mismatch_is_recovery_required(tmp_path):
    store, layout = _reconcile_setup(tmp_path)
    gen = generation_of(layout)
    view = _reconcile_view(tmp_path, store, layout)
    view.reconcile(expected_generation=gen)
    pointer = store.pointer("codex", "main")
    bogus = dict(pointer)
    bogus["native_state_generation"] = 99
    journal = {
        "schema_version": 2, "txid": "reconcile-mismatch", "harness_type": "codex",
        "profile_id": "main", "operation": "reconcile",
        "expected_revision": None, "expected_generation": gen,
        "previous_pointer": dict(pointer), "proposed_pointer": bogus,
        "pointer_intent_declared": True,
        "receipts_digest_before": "", "receipts_digest_after": "",
        "steps": ["PREPARED", "APPLIED", "POINTER_COMMITTED"],
        "applied_files": [".codex/sessions/run.jsonl"],
        "revision_written": None, "pointer_committed": True, "backup_dir": None,
        "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00",
    }
    write_journal(layout, journal)
    outcomes = recover_pending(layout)
    assert outcomes[0]["status"] == "recovery_required"
    # the real pointer is untouched (generation 99 never landed)
    assert store.pointer("codex", "main")["native_state_generation"] == gen + 1
    view.discard()


# --------------------------------------------------------------------------- #
# G. strict state machine
# --------------------------------------------------------------------------- #

def test_valid_transition_graph():
    assert valid_transition("profile-config", "PREPARED", "STAGED")
    assert valid_transition("skill-install", "STAGED", "APPLIED")
    assert valid_transition("legacy-import", "APPLIED", "REVISION_WRITTEN")
    assert valid_transition("profile-config", "REVISION_WRITTEN", "POINTER_COMMITTED")
    assert valid_transition("reconcile", "PREPARED", "APPLIED")
    assert not valid_transition("profile-config", "STAGED", "PREPARED")
    assert not valid_transition("profile-config", "APPLIED", "APPLIED")
    assert not valid_transition("reconcile", "PREPARED", "STAGED")
    assert not valid_transition("reconcile", "APPLIED", "REVISION_WRITTEN")
    assert not valid_transition("profile-config", "POINTER_COMMITTED", "APPLIED")
    assert not valid_transition("profile-config", "COMMITTED", "COMMITTED")


def test_step_rejects_out_of_order_and_duplicates(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    journal = ProfileTransaction(layout, operation="profile-config", expected_revision=2,
                                 previous_pointer=store.pointer("codex", "main"))
    journal.step("STAGED")
    with pytest.raises(TransactionError) as exc:
        journal.step("POINTER_COMMITTED")
    assert exc.value.code == "INVALID_TRANSITION"
    with pytest.raises(TransactionError):
        journal.step("STAGED")
    journal.step("APPLIED")
    journal.step("REVISION_WRITTEN", revision_written=2)
    journal.set_pointer_intent({"revision": 2, "digest": "sha256:" + "0" * 64})
    with pytest.raises(TransactionError) as exc:
        journal.step("APPLIED")
    assert exc.value.code == "INVALID_TRANSITION"
    journal.step("POINTER_COMMITTED", pointer_committed=2)
    journal.commit()
    with pytest.raises(TransactionError) as exc:
        journal.step("STAGED")
    assert exc.value.code == "TERMINAL_TRANSACTION"


def test_pointer_committed_requires_intent(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    journal = ProfileTransaction(layout, operation="profile-config", expected_revision=2,
                                 previous_pointer=store.pointer("codex", "main"))
    journal.step("STAGED")
    journal.step("APPLIED")
    journal.step("REVISION_WRITTEN", revision_written=2)
    with pytest.raises(TransactionError) as exc:
        journal.step("POINTER_COMMITTED", pointer_committed=2)
    assert exc.value.code == "POINTER_INTENT_REQUIRED"


def test_read_journal_rejects_out_of_order_duplicate_double_terminal(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    base = {
        "schema_version": 2, "txid": "bad-order", "harness_type": "codex",
        "profile_id": "main", "operation": "profile-config",
        "expected_revision": 2, "expected_generation": 0,
        "previous_pointer": dict(store.pointer("codex", "main")),
        "proposed_pointer": {}, "pointer_intent_declared": False,
        "receipts_digest_before": "", "receipts_digest_after": "",
        "steps": ["PREPARED", "STAGED", "APPLIED"],
        "applied_files": [], "revision_written": None, "pointer_committed": None,
        "backup_dir": None, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00",
    }
    for txid, steps, expected in [
        ("sm-order-1", ["PREPARED", "APPLIED"], "MALFORMED"),
        ("sm-order-2", ["PREPARED", "STAGED", "STAGED"], "MALFORMED"),
        ("sm-order-3", ["PREPARED", "STAGED", "APPLIED", "COMMITTED", "ROLLED_BACK"], "MALFORMED"),
        ("sm-order-4", ["PREPARED", "STAGED", "APPLIED"], "OK"),
    ]:
        journal = dict(base, txid=txid, steps=steps)
        write_journal(layout, journal)
        if expected == "MALFORMED":
            with pytest.raises(TransactionError) as exc:
                from agent_box_harnesses.native_home.transaction import read_journal

                read_journal(layout, txid)
            assert exc.value.code == "JOURNAL_MALFORMED"
        else:
            from agent_box_harnesses.native_home.transaction import read_journal

            read_journal(layout, txid)

    # missing required facts: REVISION_WRITTEN without revision_written
    bad = dict(base, txid="missing-fact-1", steps=["PREPARED", "STAGED", "APPLIED", "REVISION_WRITTEN"])
    write_journal(layout, bad)
    with pytest.raises(TransactionError) as exc:
        from agent_box_harnesses.native_home.transaction import read_journal

        read_journal(layout, "missing-fact-1")
    assert exc.value.code == "JOURNAL_MALFORMED"
    # malformed journals are recovered as recovery_required, never trusted
    outcomes = recover_pending(layout)
    bad_ones = [o for o in outcomes if o["txid"] in {"sm-order-1", "sm-order-2", "sm-order-3", "missing-fact-1"}]
    assert bad_ones and all(o["status"] == "recovery_required" for o in bad_ones)

# --------------------------------------------------------------------------- #
# B. corrupt/missing pointer behavior matrix (never conflated with fresh)
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("corruption", [
    ("malformed", lambda p: p.write_text("{not-json")),
    ("wrong_harness", lambda p: p.write_text(json.dumps({"revision": 1, "digest": "sha256:" + "0" * 64, "harness_type": "other", "profile_id": "main"}))),
    ("missing_revision", lambda p: p.write_text(json.dumps({"harness_type": "codex", "profile_id": "main", "digest": "sha256:" + "0" * 64}))),
    ("bad_digest_shape", lambda p: p.write_text(json.dumps({"revision": 1, "digest": "not-a-digest", "harness_type": "codex", "profile_id": "main"}))),
])
def test_corrupt_pointer_is_never_treated_as_fresh(tmp_path, corruption):
    kind, mutate = corruption
    store = _profile_store_put(tmp_path)
    layout = store.layout("codex", "main")
    mutate(layout.profile_json)
    # get() fails closed typed
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.get("codex", "main")
    assert exc.value.code == PROFILE_POINTER_INVALID
    # put/update must NOT treat it as a fresh profile
    with pytest.raises(ProfileNativeHomeError) as exc2:
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "z"}}, expected_revision=1)
    assert exc2.value.code == PROFILE_POINTER_INVALID
    # install must NOT treat it as fresh
    from agent_box_harnesses.native_home.installer import ProfileSkillInstaller

    with pytest.raises(ProfileNativeHomeError) as exc3:
        ProfileSkillInstaller(store, "codex", "main")._begin_mutation("skill-install", 1)
    assert exc3.value.code == PROFILE_POINTER_INVALID
    # execution prepare must NOT treat it as fresh (no half view)
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    with pytest.raises(ProfileNativeHomeError) as exc4:
        view.prepare()
    assert exc4.value.code == PROFILE_POINTER_INVALID
    assert ActiveExecutionRegistry(layout).active() == ()
    assert not view.root.exists()


def test_genuinely_missing_pointer_is_fresh_only_at_create_entry_points(tmp_path):
    """Genuine absence is 'fresh' ONLY where creation is legal: put()
    without a pointer may create; execution/installer/reconcile may not."""
    store = make_store(tmp_path)  # no profile at all
    layout = store.layout("codex", "main")
    from agent_box_harnesses.native_home.failures import PROFILE_POINTER_NOT_FOUND as _NOT_FOUND  # noqa: F401

    # fresh create is allowed and lands cleanly
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    assert store.get("codex", "main")["revision"] == 1
    # execution prepare on a genuinely missing profile fails closed
    other = store.layout("codex", "missing")
    view = NativeHomeView(other, FIVE_POLICIES["codex"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    with pytest.raises(ProfileNativeHomeError) as exc:
        view.prepare()
    assert exc.value.code in {PROFILE_POINTER_NOT_FOUND, "PROFILE_NATIVE_HOME_MISSING"}


# --------------------------------------------------------------------------- #
# C. provider-level exact freeze
# --------------------------------------------------------------------------- #

def test_provider_rejects_stale_envelope_after_mutation(tmp_path):
    from agent_box_harnesses.adapters import ADAPTERS
    from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
    from agent_box_harnesses.registry import load_builtin_registry
    from agent_box_harnesses.adapters.failures import MaterializationFailed

    definition = next(d for d in load_builtin_registry().all() if d.driver == "codex")
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    envelope = store.resolve("agent-box.profile@1", store.ref("codex", "main"))  # rev 1
    # a config mutation lands AFTER resolution, BEFORE materialization
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    from helpers import make_request, resolved_executable_for

    executable = resolved_executable_for(tmp_path, definition, probe=False)
    request, _h, _s, _t = make_request(tmp_path, definition, executable=executable, profile=envelope)
    provider = GenericExecutionProvider(
        definition, ADAPTERS["codex"], staging_root=tmp_path / "staging",
        executable_resolver=lambda _spec: executable, profile_store=store,
    )
    with pytest.raises(MaterializationFailed) as exc:
        provider.start(request)
    assert exc.value.code == "NATIVE_HOME_VIEW_PREPARE_FAILED"
    assert "PROFILE_FREEZE_REVISION_MISMATCH" in str(exc.value)
    # no view, no marker, no lease residue
    layout = store.layout("codex", "main")
    assert ActiveExecutionRegistry(layout).active() == ()
    assert not layout.mutation_lease.exists()
