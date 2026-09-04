"""Strict idempotency tests: canonical request digests at saga INTENT time.

Covers: exact replay after response loss, every digest counterexample from
the audit (different title/project/prompt/provider/binding revision), key
reuse across operation scopes, receipts carrying the digest, and the rule
that the digest check fires before ANY external side effect.
"""
from __future__ import annotations

import pytest

from agent_box.protocols.session.contracts import TerminalOutcome
from agent_box.protocols.session.failures import IdempotencyConflict

from agent_box_session.store import SQLiteSessionStore

from conftest_store import FakeWorkAuthority, _binding, _begin, _creation_request, _workspace_ref


@pytest.fixture
def env(tmp_path):
    authority = FakeWorkAuthority()
    s = SQLiteSessionStore(tmp_path / "session-store.db", callbacks=authority.callbacks())
    yield s, authority
    s.close()


# -- create_session digests -------------------------------------------------


def test_create_session_same_key_same_facts_is_exact_replay(env):
    s, authority = env
    first = s.create_session(_creation_request("k1"))
    second = s.create_session(_creation_request("k1"))
    assert second.session_id == first.session_id
    assert len(authority.works) == 1
    assert len(s.list_sessions()) == 1


@pytest.mark.parametrize("mutation", [
    "title", "objective", "workspace", "project", "metadata", "workspace_mode",
])
def test_create_session_same_key_different_facts_conflicts(env, mutation):
    s, authority = env
    s.create_session(_creation_request("k1"))
    works_before = len(authority.works)
    if mutation == "title":
        request = _creation_request("k1", title="Different title")
    else:
        request = _creation_request("k1")
        if mutation == "objective":
            object.__setattr__(request, "objective", "different objective")
        elif mutation == "workspace":
            object.__setattr__(request, "workspace_ref", _workspace_ref("proj-OTHER"))
        elif mutation == "project":
            object.__setattr__(request, "project_identity", "proj-OTHER")
        elif mutation == "metadata":
            object.__setattr__(request, "metadata", {"team": "core"})
        elif mutation == "workspace_mode":
            object.__setattr__(request, "workspace_mode", "frozen")
    with pytest.raises(IdempotencyConflict):
        s.create_session(request)
    # No side effect escaped the digest check.
    assert len(authority.works) == works_before
    assert len(s.list_sessions()) == 1


def test_create_session_key_reused_for_begin_turn_conflicts(env):
    s, authority = env
    session = s.create_session(_creation_request("shared-key"))
    with pytest.raises(IdempotencyConflict):
        _begin(s, session.session_id, "shared-key")
    assert len(authority.executions) == 0


# -- begin_turn digests -------------------------------------------------------


def test_begin_turn_same_key_same_facts_is_exact_replay_after_response_loss(env):
    """The client's response was lost after the turn fully committed; the
    retry with the same key returns the original result without side effects."""
    s, authority = env
    session = s.create_session(_creation_request("idem"))
    first = _begin(s, session.session_id, "same-turn")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_terminal(session.session_id, first.turn_id, TerminalOutcome.SUCCEEDED, lease)
    s.commit_turn(session.session_id, first.turn_id, lease)
    executions_before = len(authority.executions)
    second = _begin(s, session.session_id, "same-turn")
    assert second.replayed
    assert second.turn_id == first.turn_id
    assert second.execution_id == first.execution_id
    assert len(authority.executions) == executions_before


@pytest.mark.parametrize("binding_override", [
    {"harness_provider_id": "other-harness"},
    {"harness_provider_version": "2"},
    {"model_selection": "model-x"},
    {"codec_id": "codec-9", "codec_version": "9"},
    {"capability_digest": "sha256:cap"},
    {"extra": {"revision": "b"}},
])
def test_begin_turn_same_key_different_binding_conflicts(env, binding_override):
    s, authority = env
    session = s.create_session(_creation_request("idem2"))
    _begin(s, session.session_id, "turn-key", binding=_binding(**binding_override))
    with pytest.raises(IdempotencyConflict):
        _begin(s, session.session_id, "turn-key")


def test_begin_turn_same_key_different_prompt_conflicts(env):
    s, _ = env
    session = s.create_session(_creation_request("idem3"))
    _begin(s, session.session_id, "prompt-key", text="first prompt")
    with pytest.raises(IdempotencyConflict):
        _begin(s, session.session_id, "prompt-key", text="a DIFFERENT prompt")


def test_begin_turn_key_reused_for_create_session_conflicts(env):
    s, _ = env
    session = s.create_session(_creation_request("idem4"))
    _begin(s, session.session_id, "turn-scope-key")
    with pytest.raises(IdempotencyConflict):
        s.create_session(_creation_request("turn-scope-key"))


def test_begin_turn_digest_covers_the_session(env):
    s, _ = env
    a = s.create_session(_creation_request("sa"))
    b = s.create_session(_creation_request("sb"))
    _begin(s, a.session_id, "cross-session-key")
    with pytest.raises(IdempotencyConflict):
        _begin(s, b.session_id, "cross-session-key")


def test_digest_check_fires_before_any_callback_or_write(env):
    """A conflicting retry must not create/confirm a Work or Execution, and
    must not mutate the store — even mid-saga."""
    s, authority = env
    session = s.create_session(_creation_request("pre-side"))
    _begin(s, session.session_id, "pre-side-key")
    works_before, executions_before = len(authority.works), len(authority.executions)
    with pytest.raises(IdempotencyConflict):
        _begin(s, session.session_id, "pre-side-key", text="different input")
    with pytest.raises(IdempotencyConflict):
        _begin(s, session.session_id, "pre-side-key", binding=_binding(harness_provider_id="x"))
    assert len(authority.works) == works_before
    assert len(authority.executions) == executions_before


def test_receipts_carry_the_request_digest(env):
    s, _ = env
    session = s.create_session(_creation_request("rc"))
    _begin(s, session.session_id, "rc-turn")
    create_receipt = s.get_receipt("rc")
    turn_receipt = s.get_receipt("rc-turn")
    assert create_receipt["scope"] == "create_session"
    assert turn_receipt["scope"] == "begin_turn"
    for receipt in (create_receipt, turn_receipt):
        assert receipt["request_digest"].startswith("sha256:")
        assert len(receipt["request_digest"]) == 7 + 64


def test_unknown_key_is_a_fresh_saga(env):
    s, authority = env
    session = s.create_session(_creation_request("fresh-1"))
    other = s.create_session(_creation_request("fresh-2"))
    assert other.session_id != session.session_id
    t1 = _begin(s, session.session_id, "fresh-turn-1")
    lease = s.acquire_writer_lease(session.session_id, "w")
    s.record_terminal(session.session_id, t1.turn_id, TerminalOutcome.SUCCEEDED, lease)
    s.commit_turn(session.session_id, t1.turn_id, lease)
    t2 = _begin(s, session.session_id, "fresh-turn-2")
    assert t1.turn_id != t2.turn_id
    assert len(authority.executions) == 2


def test_incomplete_saga_with_same_digest_resumes_not_conflicts(env):
    """A crash after the durable turn creation (before any Execution side
    effect) resumes the saga on retry with the same key and digest."""
    s, authority = env
    session = s.create_session(_creation_request("resume"))
    def crash(step: str) -> None:
        if step == "begin_turn:pre_execution":
            raise RuntimeError("simulated crash before execution creation")
    s._fault_hook = crash
    with pytest.raises(RuntimeError):
        _begin(s, session.session_id, "resume-key")
    s._fault_hook = None
    result = _begin(s, session.session_id, "resume-key")
    assert not result.replayed
    assert len(authority.executions) == 1
    # The resumed saga is the same single turn.
    replay = _begin(s, session.session_id, "resume-key")
    assert replay.replayed and replay.turn_id == result.turn_id
