"""P-1 repair gate: test-first RED tests for the Codex product vertical.

Written BEFORE any product change (acceptance gate §2A).  Four repair
targets, one section each:

1. Reconcile failure must block Turn commit: exception/failed/ambiguous/
   malformed/unknown reconcile outcomes move the Turn Run to
   RECOVERY_REQUIRED and never finalize or commit; only ``ok`` and the
   typed no-view skip may proceed.
2. GET-turn continuation projection must use the SAME committed Turn Run
   authority as dispatch — no ``execution_ids[0]`` / candidate-order
   fallback; unavailability is explicit.
3. (Collection) covered by the module rename itself; the combined
   invocation is the GREEN evidence recorded in the validation report.
4. Public Ref metadata is disclosure-screened: allowlist per purpose;
   absolute paths, credential-shaped values, proxy userinfo URIs and
   oversized fields never cross the Studio API; official identity
   metadata stays intact.
"""
from __future__ import annotations

import json

import pytest

from agent_box.protocols.session.failures import SessionError
from agent_box.work_core.db import _reset_connection_for_tests
from agent_box.work_core.models import Ref, RefType

from agent_box_studio.service import StudioService
from agent_box_studio.testing import (
    FAKE_PROVIDER_ID,
    FakeTurnExecutionProvider,
)

from test_continuation_provenance import (  # noqa: E402  (shared fixtures)
    STUB_RESOLVER_ID,
    ContinuationStubProvider,
    _build,
    _project,
    _run_turn,
    _setup_source_turn,
    insert_uncommitted_attempt,
    point_committed_run_at,
)

REASON = "PROFILE_HOME_RECONCILE_FAILED"


# -- 1. reconcile failure blocks finalization and commit --------------------------


class ReconcileScriptedProvider(FakeTurnExecutionProvider):
    """Fake provider whose host-side reconcile report is scripted."""

    def __init__(self, script) -> None:
        super().__init__()
        self._script = script
        self.reconcile_calls = 0

    def reconcile_execution(self, handle):
        self.reconcile_calls += 1
        if self._script == "raise":
            raise RuntimeError("reconcile exploded")
        return self._script


def _turn_recovery_facts(store, sid, turn_id) -> dict:
    service_facts = {
        "state": store.get_turn(sid, turn_id).state.value,
        "terminal_outcome": (
            store.get_turn(sid, turn_id).terminal_outcome.value
            if store.get_turn(sid, turn_id).terminal_outcome
            else None
        ),
        "committed_watermark": store.get_turn(sid, turn_id).committed_watermark,
        "run_phase": store.turn_run(turn_id).phase.value,
        "events": [e.event_type for e in store.transcript(sid)],
    }
    return service_facts


def _assert_reconcile_failure_blocked(tmp_path, monkeypatch, key, script):
    provider = ReconcileScriptedProvider(script)
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key=key, title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(service, sid, f"{key}-turn", execution_provider_id=FAKE_PROVIDER_ID)
    assert provider.reconcile_calls == 1, "the host must call reconcile once per attempt"
    facts = _turn_recovery_facts(store, sid, payload["turn_id"])
    assert facts["state"] == "recovery_required", facts
    assert facts["terminal_outcome"] is None, facts
    assert facts["committed_watermark"] is None, facts
    assert facts["run_phase"] == "recovery_required", facts
    assert "TURN_COMMITTED" not in facts["events"], facts
    assert "TURN_TERMINAL" not in facts["events"], facts
    recovery = [
        e for e in store.transcript(sid)
        if e.event_type == "execution.recovery_required"
        and e.payload.get("reason_code") == REASON
    ]
    assert recovery, facts
    # the proven provider outcome is never rewritten into a fabricated model
    # failure, and the recovery view stays available: the turn remains
    # non-terminal with its dispatch identity preserved.
    assert facts["state"] == "recovery_required"
    store.close()
    _reset_connection_for_tests()


def test_reconcile_failed_report_blocks_commit(tmp_path, monkeypatch):
    _assert_reconcile_failure_blocked(
        tmp_path, monkeypatch, "rec-failed",
        {"reconciled": True, "status": "failed",
         "code": "PROFILE_RECOVERY_REQUIRED", "detail": "pointer corrupt"},
    )


def test_reconcile_ambiguous_report_blocks_commit(tmp_path, monkeypatch):
    _assert_reconcile_failure_blocked(
        tmp_path, monkeypatch, "rec-ambiguous",
        {"reconciled": True, "status": "ambiguous",
         "code": "PROFILE_RECOVERY_REQUIRED", "detail": "two active writers"},
    )


def test_reconcile_exception_blocks_commit(tmp_path, monkeypatch):
    _assert_reconcile_failure_blocked(tmp_path, monkeypatch, "rec-raise", "raise")


def test_reconcile_malformed_non_mapping_blocks_commit(tmp_path, monkeypatch):
    _assert_reconcile_failure_blocked(tmp_path, monkeypatch, "rec-bad1", "not-a-mapping")


def test_reconcile_malformed_types_block_commit(tmp_path, monkeypatch):
    _assert_reconcile_failure_blocked(
        tmp_path, monkeypatch, "rec-bad2", {"reconciled": "yes"}
    )


def test_reconcile_unknown_status_blocks_commit(tmp_path, monkeypatch):
    _assert_reconcile_failure_blocked(
        tmp_path, monkeypatch, "rec-unknown", {"reconciled": True, "status": "mystery"}
    )


def test_reconcile_no_view_report_is_a_typed_skip_and_commits(
    tmp_path, monkeypatch
):
    """The genuine profile-less/no-view shape is a TYPED SKIP, never a
    failure: the turn proceeds to finalization and commit normally."""
    provider = ReconcileScriptedProvider(
        {"reconciled": False, "reason": "no-execution-view"}
    )
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="rec-noview", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(service, sid, "rec-noview-turn", execution_provider_id=FAKE_PROVIDER_ID)
    facts = _turn_recovery_facts(store, sid, payload["turn_id"])
    assert facts["state"] == "completed", facts
    assert facts["terminal_outcome"] == "succeeded", facts
    assert facts["run_phase"] == "session_committed", facts
    assert "TURN_COMMITTED" in facts["events"], facts
    assert not [
        e for e in store.transcript(sid) if e.event_type == "execution.recovery_required"
    ], facts
    store.close()
    _reset_connection_for_tests()


def test_reconcile_typed_skipped_status_commits(tmp_path, monkeypatch):
    provider = ReconcileScriptedProvider({"reconciled": True, "status": "skipped"})
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="rec-skip", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(service, sid, "rec-skip-turn", execution_provider_id=FAKE_PROVIDER_ID)
    facts = _turn_recovery_facts(store, sid, payload["turn_id"])
    assert facts["state"] == "completed", facts
    assert facts["run_phase"] == "session_committed", facts
    store.close()
    _reset_connection_for_tests()


def test_reconcile_recovery_state_is_durable_across_restart(tmp_path, monkeypatch):
    provider = ReconcileScriptedProvider(
        {"reconciled": True, "status": "failed", "code": "PROFILE_RECOVERY_REQUIRED"}
    )
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="rec-dur", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(service, sid, "rec-dur-turn", execution_provider_id=FAKE_PROVIDER_ID)
    store.close()
    _reset_connection_for_tests()

    provider2 = ReconcileScriptedProvider({"reconciled": True, "status": "ok"})
    service2, store2, _ = _build(tmp_path, monkeypatch, provider2)
    turn = store2.get_turn(sid, payload["turn_id"])
    assert turn.state.value == "recovery_required"
    assert turn.terminal_outcome is None
    assert store2.turn_run(payload["turn_id"]).phase.value == "recovery_required"
    store2.close()
    _reset_connection_for_tests()


def test_reconcile_ok_report_commits(tmp_path, monkeypatch):
    """Control: the honest ``ok`` report proceeds to finalization/commit."""
    provider = ReconcileScriptedProvider(
        {"reconciled": True, "status": "ok", "code": "NONE"}
    )
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="rec-ok", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(service, sid, "rec-ok-turn", execution_provider_id=FAKE_PROVIDER_ID)
    facts = _turn_recovery_facts(store, sid, payload["turn_id"])
    assert facts["state"] == "completed", facts
    assert facts["run_phase"] == "session_committed", facts
    store.close()
    _reset_connection_for_tests()


# -- 2. GET-turn continuation projection shares the committed-run authority -------


def _continuation_of(service, sid, turn_id) -> dict:
    return service.get_turn(sid, turn_id)["continuation"]


def _delete_run_row(store, turn_id) -> None:
    conn = store._connection()
    with conn:
        conn.execute("DELETE FROM turn_runs WHERE turn_id = ?", (turn_id,))


def _set_run_phase_uncommitted(store, turn_id) -> None:
    conn = store._connection()
    with conn:
        conn.execute("UPDATE turn_runs SET phase = 'running' WHERE turn_id = ?", (turn_id,))


def test_projection_without_run_journal_is_explicitly_unavailable(
    tmp_path, monkeypatch
):
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "proj-miss")
    _delete_run_row(store, turn_id)
    facts = _continuation_of(service, sid, turn_id)
    assert facts["execution_id"] is None, facts
    assert facts["parent_execution_id"] is None, facts
    assert facts["output_native_session_ref"] is None, facts
    store.close()
    _reset_connection_for_tests()


def test_projection_with_uncommitted_run_is_explicitly_unavailable(
    tmp_path, monkeypatch
):
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "proj-uncom")
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale", "stale-loc")
    _set_run_phase_uncommitted(store, turn_id)
    facts = _continuation_of(service, sid, turn_id)
    assert facts["execution_id"] is None, facts
    assert facts["output_native_session_ref"] is None, facts
    store.close()
    _reset_connection_for_tests()


def test_projection_with_unlinked_committed_execution_is_unavailable(
    tmp_path, monkeypatch
):
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "proj-unlink")
    point_committed_run_at(store, turn_id, "exec_ghost")
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale", "stale-loc")
    facts = _continuation_of(service, sid, turn_id)
    assert facts["execution_id"] is None, facts
    assert facts["output_native_session_ref"] is None, facts
    assert facts["input_session_ref"] is None, facts
    store.close()
    _reset_connection_for_tests()


def test_projection_never_exposes_a_unlinked_ref_holder(
    tmp_path, monkeypatch
):
    """The strongest counterexample: the ONLY link row belongs to a stale
    attempt that holds a Ref, and the committed run points outside the
    Turn.  The projection must stay explicitly unavailable — it must never
    present the stale locator as the continuation authority."""
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "proj-ghost")
    run = store.turn_run(turn_id)
    committed = run.execution_id
    conn = store._connection()
    with conn:
        conn.execute(
            "DELETE FROM turn_executions WHERE turn_id = ? AND execution_id = ?",
            (turn_id, committed),
        )
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale", "stale-loc")
    point_committed_run_at(store, turn_id, "exec_ghost")
    facts = _continuation_of(service, sid, turn_id)
    assert facts["execution_id"] is None, facts
    blob = json.dumps(facts)
    assert "stale-loc" not in blob, facts
    store.close()
    _reset_connection_for_tests()


def test_projection_multi_execution_keeps_committed_authority(
    tmp_path, monkeypatch
):
    """Control (must stay green): with a valid committed run, a stale
    Ref-holding candidate later in the list never displaces the committed
    execution in the projection."""
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "proj-multi")
    committed = store.turn_run(turn_id).execution_id
    insert_uncommitted_attempt(store, sid, turn_id, "exec_stale_b", "stale-loc-b")
    facts = _continuation_of(service, sid, turn_id)
    assert facts["execution_id"] == committed, facts
    assert facts["output_native_session_ref"] is None, facts
    assert "stale-loc-b" not in json.dumps(facts), facts
    store.close()
    _reset_connection_for_tests()


def test_projection_and_dispatch_agree_on_unavailability(
    tmp_path, monkeypatch
):
    """The shared authority invariant: when the projection says the
    continuation facts are unavailable, an actual continuation attempt on
    that same turn fails closed (never dispatches on a guessed parent)."""
    service, store, sid, turn_id = _setup_source_turn(tmp_path, monkeypatch, "proj-agree")
    _delete_run_row(store, turn_id)
    facts = _continuation_of(service, sid, turn_id)
    assert facts["execution_id"] is None, facts
    with pytest.raises(SessionError):
        service.submit_turn(
            sid, idempotency_key="proj-agree-2", input_text="next",
            execution_provider_id=FAKE_PROVIDER_ID, continue_from_turn_id=turn_id,
        )
    assert [
        e.event_type for e in store.transcript(sid)
    ].count("TURN_STARTED") == 1
    store.close()
    _reset_connection_for_tests()


# -- 4. public Ref metadata disclosure boundary ------------------------------------

HOSTILE_METADATA_REF = lambda: Ref(  # noqa: E731
    RefType.SESSION,
    "agent-box.codex-continuation",
    "thread-123",
    uri="http://user:secret@proxy.internal:8080",
    metadata={
        "harness_type": "codex",
        "source_provider": "codex",
        "api_key": "sk-hostile-secret-000111222333",
        "native_home": "/home/user/.agent-box",
        "proxy": "http://user:secret@proxy.internal:8080",
        "authorization": "Bearer abc.def.ghi",
    },
)


def test_public_ref_session_metadata_is_allowlisted():
    public = StudioService._public_ref(HOSTILE_METADATA_REF())
    assert public["provider"] == "agent-box.codex-continuation"
    assert public["native_id"] == "thread-123"
    assert set(public["metadata"]) == {"harness_type", "source_provider"}, public
    blob = json.dumps(public)
    for hostile in (
        "sk-hostile-secret-000111222333",
        "/home/user",
        "user:secret",
        "proxy.internal",
        "Bearer abc",
    ):
        assert hostile not in blob, public
    assert "uri" not in public, public
    # dropped keys are reported as a typed redaction, never echoed
    assert public.get("redacted") is True, public


def test_public_ref_official_metadata_stays_intact():
    ref = Ref(
        RefType.SESSION,
        "agent-box.codex-continuation",
        "thread-123",
        metadata={"harness_type": "codex", "source_provider": "codex"},
    )
    public = StudioService._public_ref(ref)
    assert public == {
        "provider": "agent-box.codex-continuation",
        "native_id": "thread-123",
        "metadata": {"harness_type": "codex", "source_provider": "codex"},
    }


def test_public_ref_rejects_credential_shaped_value_under_allowed_key():
    ref = Ref(
        RefType.SESSION, "p", "n",
        metadata={"harness_type": "sk-abcdef1234567890abcdef", "source_provider": "codex"},
    )
    public = StudioService._public_ref(ref)
    blob = json.dumps(public)
    assert "sk-abcdef1234567890abcdef" not in blob, public


def test_public_ref_rejects_host_path_value_under_allowed_key():
    ref = Ref(
        RefType.SESSION, "p", "n",
        metadata={"source_provider": "/etc/passwd"},
    )
    public = StudioService._public_ref(ref)
    assert "/etc/passwd" not in json.dumps(public), public


def test_public_ref_rejects_proxy_userinfo_value_under_allowed_key():
    ref = Ref(
        RefType.SESSION, "p", "n",
        metadata={"source_provider": "http://user:secret@proxy.internal:8080"},
    )
    public = StudioService._public_ref(ref)
    assert "user:secret" not in json.dumps(public), public
    assert "proxy.internal" not in json.dumps(public), public


def test_public_ref_rejects_oversized_value_under_allowed_key():
    """Oversized metadata is rejected deterministically at the Ref
    boundary itself (never stored, never projected); the projection's own
    length cap is the second line of defense for unbounded fields."""
    from agent_box.work_core.errors import InvalidRef

    with pytest.raises(InvalidRef):
        Ref(
            RefType.SESSION, "p", "n",
            metadata={"harness_type": "y" * 4096, "source_provider": "codex"},
        )
    # defense in depth: even a value that bypasses construction bounds is
    # redacted by the projection, never truncated into the payload.
    class _UnboundedRef:
        provider = "p"
        native_id = "n"
        metadata = {"harness_type": "y" * 4096, "source_provider": "codex"}

    public = StudioService._public_ref(_UnboundedRef())  # type: ignore[arg-type]
    assert "y" * 4096 not in json.dumps(public), public


def test_public_ref_bounds_oversized_native_id():
    ref = Ref(RefType.SESSION, "p", "t" * 4096, metadata={"harness_type": "codex"})
    public = StudioService._public_ref(ref)
    native_id = public["native_id"] or ""
    assert len(native_id) <= 512, len(native_id)


def test_public_ref_profile_purpose_keeps_identity_facts():
    ref = Ref(
        RefType.ARTIFACT, "agent-box.profile-store", "main",
        metadata={
            "harness_type": "codex",
            "revision": "3",
            "digest": "sha256:" + "a" * 64,
            "api_key": "sk-hostile-secret-000111222333",
            "home": "/home/user/.agent-box",
        },
    )
    public = StudioService._public_ref(ref, purpose="profile")
    assert set(public["metadata"]) == {"harness_type", "revision", "digest"}, public
    blob = json.dumps(public)
    assert "sk-hostile-secret-000111222333" not in blob, public
    assert "/home/user" not in blob, public


def test_get_turn_projection_never_leaks_hostile_ref_metadata(
    tmp_path, monkeypatch
):
    """Integration: a provider-built Ref carrying hostile metadata never
    crosses the public GET-turn projection; official identity metadata
    survives exactly."""

    class HostileRefProvider(ContinuationStubProvider):
        def continuation_ref(self, locator, *, extra_metadata=None):
            return Ref(
                RefType.SESSION,
                STUB_RESOLVER_ID,
                locator,
                metadata={
                    "harness_type": self._harness,
                    "source_provider": self._harness,
                    "api_key": "sk-hostile-secret-000111222333",
                    "native_home": "/home/user/.agent-box",
                    "proxy": "http://user:secret@proxy.internal:8080",
                },
            )

    provider = HostileRefProvider(provider_id="stub-hostile", harness="alpha")
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="host-1", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(service, sid, "host-turn", execution_provider_id="stub-hostile")
    view = service.get_turn(sid, payload["turn_id"])
    out_ref = view["continuation"]["output_native_session_ref"]
    assert out_ref is not None
    assert set(out_ref["metadata"]) == {"harness_type", "source_provider"}, out_ref
    blob = json.dumps(view)
    for hostile in (
        "sk-hostile-secret-000111222333",
        "/home/user",
        "user:secret",
        "proxy.internal",
    ):
        assert hostile not in blob, view
    store.close()
    _reset_connection_for_tests()
