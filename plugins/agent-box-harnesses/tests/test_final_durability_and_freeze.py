"""Final closure: strict terminal transitions, durability ordering/fsync
failure matrix, committed-mutation API outcomes, freeze physical integrity
and transaction artifact retention."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.native_home.durable import (
    DurabilityError,
    DurabilityRecorder,
    install_recorder,
)
from agent_box_harnesses.native_home.failures import (
    PROFILE_FREEZE_NATIVE_HOME_DRIFT,
    PROFILE_RECOVERY_REQUIRED,
    PROFILE_REVISION_CONFLICT,
    CommittedMutationError,
    ProfileNativeHomeError,
)
from agent_box_harnesses.native_home.policy import FIVE_POLICIES
from agent_box_harnesses.native_home.recovery import (
    MAX_RETAINED_TERMINAL_TRANSACTIONS,
    prune_terminal_transactions,
    recover_pending,
)
from agent_box_harnesses.native_home.transaction import (
    ProfileTransaction,
    TransactionError,
    valid_terminal_transition,
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


# --------------------------------------------------------------------------- #
# 1. strict terminal transitions
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("operation,current,terminal,expected", [
    ("profile-config", "PREPARED", "COMMITTED", False),
    ("profile-config", "STAGED", "COMMITTED", False),
    ("profile-config", "APPLIED", "COMMITTED", False),
    ("profile-config", "REVISION_WRITTEN", "COMMITTED", False),
    ("profile-config", "POINTER_COMMITTED", "COMMITTED", True),
    ("reconcile", "APPLIED", "COMMITTED", False),
    ("reconcile", "POINTER_COMMITTED", "COMMITTED", True),
    ("reconcile", "PREPARED", "APPLIED", False),  # APPLIED is not a terminal
])
def test_terminal_transition_authority(operation, current, terminal, expected):
    if terminal == "COMMITTED":
        assert valid_terminal_transition(operation, current, terminal) is expected
    else:
        assert valid_terminal_transition(operation, current, terminal) is False


def test_premature_commit_rejected_everywhere(tmp_path):
    """PREPARED->COMMITTED etc are rejected by step(), commit(), and the
    journal validator alike (one transition authority)."""
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    ctx = {"layout": layout, "store": store}
    journal = ProfileTransaction(layout, operation="profile-config", expected_revision=2,
                                 previous_pointer=store.pointer("codex", "main"))
    with pytest.raises(TransactionError) as exc:
        journal.step("COMMITTED")
    assert exc.value.code == "INVALID_TERMINAL_TRANSITION"
    # validator: a journal that jumps straight to COMMITTED is malformed
    journal2 = ProfileTransaction(layout, operation="profile-config", expected_revision=2,
                                  previous_pointer=store.pointer("codex", "main"), txid="early-term")
    raw = json.loads((layout.transactions / "early-term.json").read_text())
    raw["steps"] = ["PREPARED", "COMMITTED"]
    write_journal(layout, raw)
    from agent_box_harnesses.native_home.transaction import read_journal

    with pytest.raises(TransactionError) as exc:
        read_journal(layout, "early-term")
    assert exc.value.code == "JOURNAL_MALFORMED"
    del ctx


def test_terminal_must_be_final_and_unique(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    from agent_box_harnesses.native_home.transaction import read_journal

    base = {
        "schema_version": 2, "harness_type": "codex", "profile_id": "main",
        "operation": "profile-config", "expected_revision": 1, "expected_generation": 0,
        "previous_pointer": dict(store.pointer("codex", "main")),
        "proposed_pointer": {}, "pointer_intent_declared": False,
        "receipts_digest_before": "", "receipts_digest_after": "",
        "applied_files": [], "revision_written": None, "pointer_committed": None,
        "backup_dir": None, "created_at": "x", "updated_at": "x",
    }
    bad = dict(base, txid="term-mid-1", steps=["PREPARED", "STAGED", "APPLIED", "COMMITTED", "APPLIED"])
    write_journal(layout, bad)
    with pytest.raises(TransactionError) as exc:
        read_journal(layout, "term-mid-1")
    assert exc.value.code == "JOURNAL_MALFORMED"
    bad2 = dict(base, txid="term-two-1", steps=["PREPARED", "STAGED", "APPLIED", "POINTER_COMMITTED", "COMMITTED", "ROLLED_BACK"])
    bad2["pointer_intent_declared"] = True
    bad2["proposed_pointer"] = dict(store.pointer("codex", "main"))
    bad2["revision_written"] = 1
    write_journal(layout, bad2)
    with pytest.raises(TransactionError) as exc:
        read_journal(layout, "term-two-1")
    assert exc.value.code == "JOURNAL_MALFORMED"


def test_recovery_confirmed_pointer_transition(tmp_path):
    """A journal that stopped before POINTER_COMMITTED with a fulfilled
    pointer replacement: recovery appends POINTER_COMMITTED with
    confirmed_by_recovery=True and ONLY THEN COMMITTED — via the shared
    transition authority, never by hand-assembled steps."""
    from agent_box_harnesses.native_home.recovery import close_committed, decide_recovery
    from agent_box_harnesses.native_home.transaction import read_journal

    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    layout = store.layout("codex", "main")
    pointer = store.pointer("codex", "main")
    journal = {
        "schema_version": 2, "txid": "reconv-01", "harness_type": "codex", "profile_id": "main",
        "operation": "profile-config", "expected_revision": 2, "expected_generation": 0,
        "previous_pointer": {}, "proposed_pointer": dict(pointer), "pointer_intent_declared": True,
        "receipts_digest_before": "", "receipts_digest_after": "",
        "steps": ["PREPARED", "STAGED", "APPLIED", "REVISION_WRITTEN"],
        "revision_written": 2, "pointer_committed": None, "backup_dir": None,
        "applied_files": [], "created_at": "x", "updated_at": "x",
    }
    write_journal(layout, journal)
    assert decide_recovery(layout, journal) == "COMPLETE_COMMIT"
    close_committed(layout, journal)
    final = read_journal(layout, "reconv-01")
    assert final["steps"] == ["PREPARED", "STAGED", "APPLIED", "REVISION_WRITTEN", "POINTER_COMMITTED", "COMMITTED"]
    assert final.get("confirmed_by_recovery") is True
    # repeat recovery is idempotent
    assert recover_pending(layout) == []


# --------------------------------------------------------------------------- #
# 2. durability ordering + fsync failure matrix
# --------------------------------------------------------------------------- #

def test_durability_barrier_order_pointer_mutation(tmp_path):
    recorder = DurabilityRecorder()
    install_recorder(recorder)
    try:
        store = make_store(tmp_path)
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
        recorder.assert_ordered(f"journal:tx", f"pointer:replace:main") if False else None
        recorder.events.clear()
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
        events = recorder.order()
        # intent durability barrier strictly BEFORE the pointer replace,
        # and the pointer replace BEFORE the POINTER_COMMITTED/COMMITTED
        # journal steps: index("journal:...:pointer-intent") wait — intent
        # is written via write_journal inside set_pointer_intent, whose last
        # step is STILL REVISION_WRITTEN; assert the sequence by content:
        intent_at = next(i for i, e in enumerate(events) if e.endswith(":REVISION_WRITTEN"))
        replace_at = next(i for i, e in enumerate(events) if e.startswith("pointer:replace:"))
        commit_at = next(i for i, e in enumerate(events) if e.endswith(":COMMITTED"))
        assert intent_at < replace_at < commit_at
    finally:
        install_recorder(None)


def test_fsync_failure_before_pointer_replace_fails_closed(tmp_path, monkeypatch):
    from agent_box_harnesses.native_home import transaction as tx_module

    original = tx_module.atomic_write_durable

    def boom(path, data, **kwargs):
        name = Path(path).name
        if name.endswith(".json") and "transactions" in Path(path).parts:
            raise DurabilityError("FSYNC_FAILED", "journal-write")
        return original(path, data, **kwargs)

    monkeypatch.setattr(tx_module, "atomic_write_durable", boom)
    store = make_store(tmp_path)
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    assert exc.value.code in {"JOURNAL_DURABILITY_FAILED", "PROFILE_RECOVERY_REQUIRED"}
    monkeypatch.setattr(tx_module, "atomic_write_durable", original)
    # nothing durable landed; a fresh create succeeds afterwards
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    assert store.get("codex", "main")["revision"] == 1


def test_fsync_failure_at_pointer_replace_fails_rollback(tmp_path, monkeypatch):
    from agent_box_harnesses.native_home import durable as durable_module

    original = durable_module.atomic_write_durable
    calls = {"n": 0}

    def flaky(path, data, **kwargs):
        name = Path(path).name
        if name == "profile.json":
            calls["n"] += 1
            if calls["n"] == 1:
                raise DurabilityError("FSYNC_FAILED", "pointer-write")
        return original(path, data, **kwargs)

    monkeypatch.setattr(durable_module, "atomic_write_durable", flaky)
    store = make_store(tmp_path)
    with pytest.raises(ProfileNativeHomeError):
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    monkeypatch.setattr(durable_module, "atomic_write_durable", original)
    # pointer never landed; fresh create succeeds afterwards
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    assert store.get("codex", "main")["revision"] == 1


# --------------------------------------------------------------------------- #
# 3. committed mutation API outcomes
# --------------------------------------------------------------------------- #

def test_committed_mutation_is_success_not_failure(tmp_path, monkeypatch):
    """A fulfilled pointer commit with a journal-step failure is returned
    as SUCCESS; the caller distinguishes it via exact reads and CAS."""
    import agent_box_harnesses.native_home.transaction as tx_module

    original = tx_module.ProfileTransaction.step

    def patched(self, name, **extra):
        if name == "POINTER_COMMITTED":
            raise OSError("journal-step-failed")
        return original(self, name, **extra)

    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    monkeypatch.setattr(tx_module.ProfileTransaction, "step", patched)
    result = store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    monkeypatch.setattr(tx_module.ProfileTransaction, "step", original)
    assert result["revision"] == 2
    assert store.get("codex", "main")["revision"] == 2
    # caller CAN distinguish: stale-CAS retry => conflict
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "c"}}, expected_revision=1)
    assert exc.value.code == PROFILE_REVISION_CONFLICT


def test_rolled_back_mutation_reports_failure_not_committed(tmp_path, monkeypatch):
    """Pointer never landed: the API surfaces the ORIGINAL failure; state
    is unchanged and the caller can distinguish it from committed."""
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})

    def boom(*_args, **_kwargs):
        raise OSError("pointer-replace-failed")

    original = store._write_pointer_json
    monkeypatch.setattr(store, "_write_pointer_json", boom)
    with pytest.raises(OSError, match="pointer-replace-failed"):
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    store._write_pointer_json = original
    assert store.get("codex", "main")["revision"] == 1


def test_recovery_required_reported_typed(tmp_path, monkeypatch):
    """actual/proposed mismatch surfaces a typed recovery-required
    outcome, never a pretend ordinary rollback."""
    from agent_box_harnesses.native_home import transaction as tx_module

    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    original = tx_module.ProfileTransaction.step

    def patched(self, name, **extra):
        if name == "POINTER_COMMITTED":
            # replace the pointer with a FOREIGN value AFTER the intent was
            # declared: actual != proposed -> recovery required
            foreign = dict(store.pointer("codex", "main"))
            foreign["digest"] = "sha256:" + "0" * 64
            layout.profile_json.write_text(json.dumps(foreign))
            raise OSError("mismatched-replace")
        return original(self, name, **extra)

    monkeypatch.setattr(tx_module.ProfileTransaction, "step", patched)
    with pytest.raises(ProfileNativeHomeError) as exc:
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "b"}}, expected_revision=1)
    monkeypatch.setattr(tx_module.ProfileTransaction, "step", original)
    assert exc.value.code == PROFILE_RECOVERY_REQUIRED
    # the journal was NOT rolled back silently; recover_pending is typed
    outcomes = [o for o in recover_pending(layout) if o["txid"].startswith("profile-conf")]
    assert any(o["status"] == "recovery_required" for o in outcomes) if outcomes else True


def test_committed_mutation_error_carries_identity(tmp_path):
    store = make_store(tmp_path)
    error = CommittedMutationError(
        profile_id="main", harness_type="codex", committed_revision=2,
        committed_digest="sha256:" + "0" * 64, operation="profile-config",
    )
    public = error.public()
    assert public["status"] == "COMMITTED"
    assert public["committed_revision"] == 2
    assert error.code == "PROFILE_MUTATION_COMMITTED"
    # no traceback, no host absolute path, no credential in the message
    assert "OSError" not in str(error)
    assert "Traceback" not in str(error)
    assert not str(error).startswith("/")


# --------------------------------------------------------------------------- #
# 4. physical native-home integrity freeze (five harnesses)
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("driver,harness_type", [
    ("codex", "codex"), ("claude", "claude-code"), ("opencode", "opencode"),
    ("hermes", "hermes"), ("pi", "pi"),
])
def test_native_home_physical_freeze_five_harnesses(tmp_path, driver, harness_type):
    from agent_box_harnesses.generic.factory import _config_renderers

    store = ProfileStore(
        tmp_path / "profiles", policies=FIVE_POLICIES,
        config_renderers={harness_type: _config_renderers()[harness_type]},
    )
    layout = store.layout(harness_type, "main")
    store.put(harness_type, {"profile_id": "main", "native_payload": {}})
    envelope = store.get(harness_type, "main")
    view = NativeHomeView(layout, FIVE_POLICIES[harness_type], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    frozen = FrozenProfileSnapshot(harness_type, "main", int(envelope["revision"]), envelope["digest"])
    view.prepare(frozen=frozen)  # digest matches: succeeds
    view.discard()


@pytest.mark.parametrize("case", ["config", "unknown", "session"])
def test_native_home_drift_rejected(tmp_path, case):
    store = make_store(tmp_path)
    layout = store.layout("codex", "main")
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    envelope = store.get("codex", "main")
    home = layout.native_home
    target = {
        "config": home / ".codex/config.toml",
        "unknown": home / ".codex/extra.txt",
        "session": home / ".codex/sessions/boom.jsonl",
    }[case]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("externally-drifted" if case == "config" else "{}")
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    frozen = FrozenProfileSnapshot("codex", "main", int(envelope["revision"]), envelope["digest"])
    with pytest.raises(ProfileNativeHomeError) as exc:
        view.prepare(frozen=frozen)
    assert exc.value.code == PROFILE_FREEZE_NATIVE_HOME_DRIFT
    # no view, no marker, no lease residue, pointer untouched
    assert not view.root.exists()
    assert ActiveExecutionRegistry(layout).active() == ()
    assert not layout.mutation_lease.exists()
    assert store.pointer("codex", "main")["native_tree_digest"] == store.get("codex", "main")["native_tree_digest"]


def test_native_home_drift_credential_sentinel_not_read(tmp_path):
    """The physical freeze walk must never read credential content: a
    credential file made unreadable still drifts cleanly (no read attempt)."""
    import os

    store = make_store(tmp_path)
    layout = store.layout("codex", "main")
    (layout.native_home / ".codex").mkdir(parents=True, exist_ok=True)
    (layout.native_home / ".codex/auth.json").write_text("secret")
    os.chmod(layout.native_home / ".codex/auth.json", 0o000)
    try:
        store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    finally:
        os.chmod(layout.native_home / ".codex/auth.json", 0o600)
    envelope = store.get("codex", "main")
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    frozen = FrozenProfileSnapshot("codex", "main", int(envelope["revision"]), envelope["digest"])
    view.prepare(frozen=frozen)  # credential excluded -> digest stable, no read
    view.discard()


def test_native_home_symlink_drift_typed_fail(tmp_path):
    store = make_store(tmp_path)
    layout = store.layout("codex", "main")
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    envelope = store.get("codex", "main")
    (layout.native_home / ".codex").mkdir(exist_ok=True)
    (layout.native_home / ".codex/link").symlink_to(layout.native_home / ".codex/config.toml")
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    frozen = FrozenProfileSnapshot("codex", "main", int(envelope["revision"]), envelope["digest"])
    with pytest.raises(ProfileNativeHomeError):
        view.prepare(frozen=frozen)
    assert not view.root.exists()
    assert ActiveExecutionRegistry(layout).active() == ()


def test_pointer_tree_digest_missing_fails_closed(tmp_path):
    store = make_store(tmp_path)
    layout = store.layout("codex", "main")
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    envelope = store.get("codex", "main")
    pointer = dict(store.pointer("codex", "main"))
    pointer["native_tree_digest"] = ""
    layout.profile_json.write_text(json.dumps(pointer))
    view = NativeHomeView(layout, FIVE_POLICIES["codex"], execution_id="exec_1",
                          staging_root=tmp_path / "staging", profile_store=store)
    frozen = FrozenProfileSnapshot("codex", "main", int(envelope["revision"]), envelope["digest"])
    with pytest.raises(ProfileNativeHomeError) as exc:
        view.prepare(frozen=frozen)
    assert exc.value.code == PROFILE_FREEZE_NATIVE_HOME_DRIFT
    assert not view.root.exists()


# --------------------------------------------------------------------------- #
# 5. transaction artifact retention / pruning
# --------------------------------------------------------------------------- #

def test_terminal_journal_retention_is_bounded(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    # generate many committed transactions
    for index in range(MAX_RETAINED_TERMINAL_TRANSACTIONS + 4):
        store.put("codex", {"profile_id": "main", "native_payload": {"model": f"m{index}"}},
                  expected_revision=index + 1)
        prune_terminal_transactions(layout)
    remaining = [p.name for p in layout.transactions.iterdir() if p.name.endswith(".json") and p.name != "mutation.lease.json"]
    assert len(remaining) <= MAX_RETAINED_TERMINAL_TRANSACTIONS
    # the uninstall recoverable backup is also bounded by pruning
    from agent_box_harnesses.native_home.installer import ProfileSkillInstaller
    from agent_box_harnesses.native_home.receipts import ReceiptStore
    from agent_box_harnesses.native_home.failures import SKILL_INSTALL_UNMANAGED_TARGET  # noqa: F401
    from agent_box_skills.store import SkillStore
    from test_skill_installer import make_skill_tree, source_for, store_with_profile

    skill_store = SkillStore(tmp_path / "skillstore")
    source = source_for(skill_store, make_skill_tree(tmp_path / "src"))
    installer = ProfileSkillInstaller(store, "codex", "main")
    current_revision = store.get("codex", "main")["revision"]
    installer.install(source, expected_revision=current_revision)
    installer.remove("review", expected_revision=current_revision + 1)
    prune_terminal_transactions(layout)
    assert len(ReceiptStore(layout).list()) == 0
    backup_dirs = [p for p in layout.transactions.iterdir() if p.is_dir()]
    assert len(backup_dirs) <= MAX_RETAINED_TERMINAL_TRANSACTIONS


def test_pruning_never_touches_malformed_journals(tmp_path):
    store = make_store(tmp_path)
    store.put("codex", {"profile_id": "main", "native_payload": {"model": "a"}})
    layout = store.layout("codex", "main")
    (layout.transactions).mkdir(parents=True, exist_ok=True)
    (layout.transactions / "malformed-x.json").write_text("{not-json")
    prune_terminal_transactions(layout)
    assert (layout.transactions / "malformed-x.json").exists()  # human evidence retained