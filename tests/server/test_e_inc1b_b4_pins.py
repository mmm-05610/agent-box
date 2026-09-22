"""E-INC1b b-4 (β2) pins — acceptance consumes the FROZEN effective object.

Approved per-path in `approvals/INC1b-batch-E-approved.md` §b-4 and shaped by
`decisions/INC1b-b4-confluence-interface.md`. Anchor: candidate `b15c435`.
β2 is the S⊗E confluence batch: these pins land in-tree as internal work now,
but the batch integrates only together with the S leg (半批不同步=拒).

What the ruling freezes for this file:
* core ① drift immunity — a live profile edit between creation and acceptance
  must not move what the dispatch binds (V2 counter-evidence);
* core ② unique effective object — the accept body publishes nothing and
  reassembles nothing; the second producer is gone at its root;
* N1 forced interleave — a background write landing inside the open window
  between the frozen-input read and the dispatch must never reach a publish
  performed by the acceptance leg.

All three are reversal pins: red against a pristine `b15c435` tree (the old
accept assembles `effective_value` and calls `objects.publish` mid-call),
green after b-4. The red side is reproducible in a throwaway clone sim.

Run (from `source/`):
    PYTHONPATH=src:$(ls -d plugins/*/src | paste -sd:) \
    ../tmp/venv/bin/python -m pytest tests/server/test_e_inc1b_b4_pins.py -q
"""
from __future__ import annotations

import ast
import inspect
import json
import textwrap
import threading

import pytest

from agent_box.server.execution import sidecar_backend as sb
from agent_box.server.execution.sidecar_backend import SidecarExecutionBackend
from agent_box.storage import ObjectStore

PROFILE_CONTRACT = "agent-box.profile@1"


class _StopAtPortFactory(RuntimeError):
    """The pin's boundary: stop the acceptance strictly after every frozen
    input has been read and bound, before any native side effect."""


class _CountingObjects:
    """Real store, per-thread publish ledger. Reads are verbatim delegations."""

    def __init__(self, store: ObjectStore) -> None:
        self.store = store
        self.publishes: list[tuple[str, str]] = []

    def read(self, digest: str) -> bytes:
        return self.store.read(digest)

    def publish(self, content: bytes):
        record = self.store.publish(content)
        self.publishes.append((threading.current_thread().name, record.digest))
        return record


class _FakeRecords:
    def __init__(self, contexts: dict[str, dict]) -> None:
        self.contexts = contexts
        self.dispatches: list[tuple[str, dict]] = []
        self.failures: list[tuple[str, str]] = []

    def get_turn_context(self, turn_id: str) -> dict:
        return self.contexts[turn_id]

    def set_turn_dispatch(self, turn_id: str, **kwargs) -> None:
        self.dispatches.append((turn_id, kwargs))

    def fail_turn(self, turn_id: str, code: str, queue_records=None) -> None:
        self.failures.append((turn_id, code))


class _RecordingResources:
    """Wraps the real bound-resource provider; records every value bound at
    acceptance, delegating storage and resolution untouched."""

    def __init__(self, inner) -> None:
        self.inner = inner
        self.bound: list[tuple[str, object]] = []

    def bind(self, contract_id: str, native_id: str, value):
        ref = self.inner.bind(contract_id, native_id, value)
        self.bound.append((contract_id, value))
        return ref

    def resolve(self, contract_id, ref, *, context=None):
        return self.inner.resolve(contract_id, ref, context=context)

    def release(self, turn_id: str) -> None:
        self.inner.release(turn_id)

    def descriptor(self):
        return self.inner.descriptor()

    @property
    def provider_id(self):
        return self.inner.provider_id

    @property
    def supported_contract_ids(self):
        return self.inner.supported_contract_ids


def _context(input_digest: str, config_digest: str, effective_digest: str) -> dict:
    return {
        "session_id": "ses-pin-b4",
        "profile_id": "prof-pin",
        "harness_type": "qoder-sidecar",
        "remote_path": "/work/pin",
        "profile_revision": 7,
        "input_object_digest": input_digest,
        # the COALESCE'd live-row key stays present on purpose: the old code
        # (pristine red) keys off it, the new acceptance must never reassemble
        # from it.
        "config_object_digest": config_digest,
        # S leg's raw frozen key (decisions/INC1b-b4-confluence-interface.md §2)
        "effective_config_object_digest": effective_digest,
    }


def _backend(records, objects):
    def _stop_factory(context, on_event):
        raise _StopAtPortFactory("pin boundary")

    backend = SidecarExecutionBackend(records, objects, None, port_factory=_stop_factory)
    recorder = _RecordingResources(backend.resources)
    backend.resources = recorder
    return backend, recorder


def _bound_profile(recorder):
    return next(v for cid, v in recorder.bound if cid == PROFILE_CONTRACT)


def _seed(tmp_path):
    """Publish the frozen effective object and two live profile generations
    directly, outside the counting wrapper."""
    store = ObjectStore(tmp_path)
    input_digest = store.publish(
        json.dumps({"message": {"text": "go"}}).encode()).digest
    frozen_digest = store.publish(json.dumps(
        {"schema_version": 1, "harness_type": "qoder-sidecar",
         "configuration": {"model": "frozen at creation"}}).encode()).digest
    live_v1 = store.publish(
        json.dumps({"configuration": {"model": "frozen at creation"}}).encode()).digest
    live_v2 = store.publish(
        json.dumps({"configuration": {"model": "edited after creation"}}).encode()).digest
    return store, input_digest, frozen_digest, live_v1, live_v2


# --------------------------------------------------------------------------
# core ① — drift immunity (V2 counter-evidence, sequential form)

def test_live_profile_edit_between_turns_cannot_move_the_frozen_effective_object(tmp_path, tmp_agent_box_home):
    store, i, frozen, live_v1, live_v2 = _seed(tmp_path)
    objects = _CountingObjects(store)
    records = _FakeRecords({
        "b4a-1": _context(i, live_v1, frozen),
        "b4a-2": _context(i, live_v2, frozen),
    })
    backend, bound_rec = _backend(records, objects)

    with pytest.raises(Exception):
        backend.accept("b4a-1", overrides=None)
    first = _bound_profile(bound_rec)
    with pytest.raises(Exception):
        backend.accept("b4a-2", overrides=None)
    second = _bound_profile(bound_rec)

    assert first.digest == frozen
    assert second.digest == first.digest, (
        "the dispatch-bound effective object drifted with the live profile row")
    assert objects.publishes == [], "acceptance must contribute no new object"


def test_overrides_are_not_applied_at_acceptance_pending_the_joint_signature_note(tmp_path, tmp_agent_box_home):
    # decisions §2: TurnExecutionPort signature is unchanged; the concrete
    # accept body ignores `overrides` (the tendency is retirement with S's
    # call-site dropping the pass) - never a late merge into a frozen object.
    store, i, frozen, live_v1, _ = _seed(tmp_path)
    objects = _CountingObjects(store)
    records = _FakeRecords({"b4b-1": _context(i, live_v1, frozen)})
    backend, bound_rec = _backend(records, objects)
    with pytest.raises(Exception):
        backend.accept("b4b-1", overrides={"model": "late-override"})
    assert _bound_profile(bound_rec).digest == frozen
    assert objects.publishes == []


# --------------------------------------------------------------------------
# core ② — unique effective object: the second producer is gone at its root

def test_accept_body_publishes_nothing_and_reassembles_nothing(tmp_agent_box_home):
    tree = ast.parse(textwrap.dedent(inspect.getsource(SidecarExecutionBackend.accept)))
    forbidden_calls, forbidden_names = set(), set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute) and node.func.attr == "publish":
                forbidden_calls.add("publish")
            if isinstance(node.func, ast.Name) and node.func.id == "resolve_all":
                forbidden_calls.add("resolve_all")
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").startswith("agent_box.server.profiles"):
                forbidden_names.add(node.module)
        elif isinstance(node, ast.Constant):
            if node.value == "schema_version":
                forbidden_names.add("effective_value assembly")
    assert forbidden_calls == set(), forbidden_calls
    assert forbidden_names == set(), forbidden_names


# --------------------------------------------------------------------------
# N1 — forced interleave: a background write inside the acceptance window

def test_N1_background_write_in_the_acceptance_window_never_reaches_publish(tmp_path, tmp_agent_box_home):
    store, i, frozen, live_v1, _ = _seed(tmp_path)
    objects = _CountingObjects(store)
    context = _context(i, live_v1, frozen)
    records = _FakeRecords({"b4n1-1": context})

    read_done = threading.Event()
    proceed = threading.Event()

    class _GatedRecords(_FakeRecords):
        def get_turn_context(self, turn_id):
            ctx = super().get_turn_context(turn_id)
            read_done.set()
            assert proceed.wait(10), "acceptance leg never resumed"
            return ctx

    backend, bound_rec = _backend(_GatedRecords(records.contexts), objects)

    outcome: list[BaseException] = []
    window_write: list[tuple[str, str] | None] = [None]

    def accept_leg():
        try:
            backend.accept("b4n1-1", overrides=None)
        except BaseException as exc:  # the pin boundary is expected
            outcome.append(exc)

    def background_editor():
        assert read_done.wait(10), "acceptance never read the frozen input"
        # a live-row edit landing strictly inside the open window:
        # new live object published, then the row repointed at it.
        edited = objects.publish(json.dumps(
            {"configuration": {"model": "mid-window edit"}}).encode()).digest
        window_write[0] = (threading.current_thread().name, edited)
        context["config_object_digest"] = edited
        proceed.set()

    legs = [threading.Thread(target=accept_leg, name="accept-leg"),
            threading.Thread(target=background_editor, name="background-editor")]
    for leg in legs:
        leg.start()
    for leg in legs:
        leg.join(20)
    assert all(not leg.is_alive() for leg in legs), "interleave deadlocked"
    assert outcome, "acceptance leg ended without reaching the pin boundary"

    assert [p for p in objects.publishes if p[0] == "accept-leg"] == [], (
        "the acceptance leg minted a second effective object inside the race window")
    assert objects.publishes == [window_write[0]], (
        "the only object written during the window is the legitimate live-row edit")
    assert _bound_profile(bound_rec).digest == frozen, (
        "acceptance consumed the mid-window edit instead of the frozen object")
