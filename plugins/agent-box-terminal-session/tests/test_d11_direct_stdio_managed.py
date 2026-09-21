"""P-T4 / D11 + D14 (direct-stdio): release carries the third state; observe stops echoing caller text.

D11: direct-stdio `release` returned {released, destroyed} — short of the C-RUNTIME@v1 §2
three-state family. There is no borrowed instance of this provider (it only ever manages
its own lease), so `managed` is constant True.

D14: `observe` echoed the caller-supplied `scope` straight into a receipt field that can
reach a log. The param stays in the shared observe signature, but is no longer returned.
"""
from __future__ import annotations

import json

from agent_box_terminal_session import DirectStdioSession


def _session():
    ref = DirectStdioSession.make_ref(host_affinity="host:one")
    return DirectStdioSession(ref)


def test_release_is_the_three_state_family_with_managed_true():
    session = _session()
    session.allocate()
    receipt = session.release()
    assert set(receipt) == {"released", "destroyed", "managed"}
    assert receipt["managed"] is True
    assert receipt["released"] is True
    assert receipt["destroyed"] is False


def test_release_still_reports_managed_after_the_lease_is_dropped():
    # Value pinned by self-audit §26: this provider can only self-manage, so managed is
    # True whether or not an allocation is live.  It is not a claim that a resource
    # survived; released/destroyed carry that.
    session = _session()
    session.release()   # release without allocate is legal
    assert _session().release()["managed"] is True


def test_observe_does_not_echo_the_caller_controlled_scope():
    session = _session()
    session.allocate()
    hostile = "scope-with-SECRET-暗-text"
    receipt = session.observe(hostile)
    blob = json.dumps(receipt, ensure_ascii=False)
    assert hostile not in blob
    assert "SECRET" not in blob and "暗" not in blob
    assert "scope" not in receipt


def test_observe_still_reports_the_liveness_it_is_for():
    # Not weakened by removing the echo: the reachable / unit_alive / identity facts that
    # a caller actually observes are unchanged, and identity is a provider constant,
    # not caller text.
    session = _session()
    before = session.observe()
    session.allocate()
    after = session.observe()
    assert before["reachable"] is True and before["unit_alive"] is False
    assert after["unit_alive"] is True
    assert after["identity"] == "direct-stdio"
