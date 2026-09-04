"""SPI conformance tests (A9).

The Protocol declared in the pure Root pack and the concrete
SQLiteSessionStore must agree on every public method signature, and
``session_store_contribution`` must structurally reject an incomplete
component.
"""
from __future__ import annotations

import inspect

import pytest

from agent_box.protocols.session import session_store_contribution
from agent_box.protocols.session.store import SessionStore, TurnExecutionLink

from agent_box_session.store import SQLiteSessionStore

from conftest_store import FakeWorkAuthority, _begin, _creation_request


def _protocol_methods():
    return {
        name: member
        for name, member in inspect.getmembers(SessionStore, inspect.isfunction)
        if not name.startswith("_")
    }


def test_sqlite_store_implements_every_protocol_method():
    for name in _protocol_methods():
        impl = getattr(SQLiteSessionStore, name, None)
        assert callable(impl), f"SQLiteSessionStore lacks SPI method {name}"


def test_sqlite_store_signatures_match_the_protocol():
    for name, proto_method in _protocol_methods().items():
        impl = getattr(SQLiteSessionStore, name)
        proto_params = list(inspect.signature(proto_method).parameters)
        impl_params = list(inspect.signature(impl).parameters)
        assert proto_params[0] == impl_params[0] == "self", name
        assert proto_params[1:] == impl_params[1:], (
            f"signature mismatch for {name}: protocol "
            f"{proto_params[1:]} vs implementation {impl_params[1:]}"
        )
        proto_kinds = [
            p.kind for p in inspect.signature(proto_method).parameters.values()
        ][1:]
        impl_kinds = [
            p.kind for p in inspect.signature(impl).parameters.values()
        ][1:]
        assert proto_kinds == impl_kinds, name


def test_concrete_store_is_a_runtime_session_store():
    assert isinstance(SQLiteSessionStore.__new__(SQLiteSessionStore), SessionStore) or True
    # runtime_checkable isinstance checks member presence on instances:
    authority = FakeWorkAuthority()
    store = SQLiteSessionStore.__new__(SQLiteSessionStore)
    assert isinstance(store, SessionStore)
    del authority


def test_session_store_contribution_accepts_the_concrete_store(tmp_path):
    store = SQLiteSessionStore(tmp_path / "s.db")
    try:
        contribution = session_store_contribution(store)
        assert contribution.component is store
    finally:
        store.close()


def test_session_store_contribution_rejects_incomplete_component():
    class IncompleteStore:
        store_id = "incomplete"

        def get_session(self, session_id):  # only a fraction of the SPI
            raise AssertionError

    with pytest.raises(TypeError):
        session_store_contribution(IncompleteStore())


def test_session_store_contribution_rejects_bare_component():
    class BareStore:
        store_id = "bare"

    with pytest.raises(TypeError):
        session_store_contribution(BareStore())


def test_link_execution_returns_a_turn_execution_link(tmp_path):
    store = SQLiteSessionStore(tmp_path / "s.db", callbacks=FakeWorkAuthority().callbacks())
    try:
        session = store.create_session(_creation_request("link"))
        result = _begin(store, session.session_id, "link-turn")
        lease = store.acquire_writer_lease(session.session_id, "w")
        link = store.link_execution(
            session.session_id, result.turn_id, "exec_extra_1", lease
        )
        assert isinstance(link, TurnExecutionLink)
        assert link.turn_id == result.turn_id
        assert link.execution_id == "exec_extra_1"
        assert link.linked_at is not None
    finally:
        store.close()
