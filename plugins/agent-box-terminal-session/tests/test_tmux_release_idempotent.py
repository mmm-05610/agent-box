from __future__ import annotations

import subprocess

from agent_box_terminal_session import TmuxSession


def _identity_runner(state):
    def runner(argv, **kwargs):
        state["calls"].append(argv)
        if "new-session" in argv:
            return subprocess.CompletedProcess(argv, 0, "", "")
        if "has-session" in argv:
            rc = 1 if state["gone"] else 0
            return subprocess.CompletedProcess(argv, rc, "", "can't find session: x" if rc else "")
        if "kill-session" in argv:
            if kwargs.get("check") and state["gone"]:
                raise subprocess.CalledProcessError(1, argv, "", "can't find session: x")
            return subprocess.CompletedProcess(argv, 0, "", "")
        return subprocess.CompletedProcess(argv, 0, "/tmp/tmux\t91\t$1\t@0\t%1\n", "")
    return runner


def _managed_session(state):
    ref = TmuxSession.managed_ref(host_affinity="host:one", socket="p0")
    session = TmuxSession(ref, binary="/usr/bin/tmux", runner=_identity_runner(state))
    session.resolve(ref)
    session.allocate()
    return session


def test_managed_release_of_live_session_is_destroyed():
    state = {"calls": [], "gone": False}
    session = _managed_session(state)
    result = session.release()
    assert result == {"released": True, "destroyed": True, "managed": True}
    assert any("kill-session" in c for c in state["calls"])


def test_managed_release_of_gone_session_is_idempotent_noop():
    # P-T1 / D5: has-session (check=False) probe means a dead managed session is
    # a no-op that reports nothing destroyed, and kill-session is never even
    # attempted (so the check=True path cannot raise on it).
    state = {"calls": [], "gone": True}
    session = _managed_session(state)
    result = session.release()
    assert result == {"released": True, "destroyed": False, "managed": True}
    assert not any("kill-session" in c for c in state["calls"])


def test_borrowed_session_release_never_kills():
    # Guard preserved: the non-managed (existing/borrowed) branch of release is
    # unchanged and returns a no-op that destroys nothing — no resolve needed.
    calls: list = []
    def runner(argv, **kwargs):
        calls.append(argv)
        return subprocess.CompletedProcess(argv, 0, "/tmp/tmux\t91\t$1\t@0\t%1\n", "")
    ref = TmuxSession.existing_ref(host_affinity="host:one", socket="p0", server_generation="server-pid:91",
                                   session_id="$1", window_id="@0", pane_id="%1")
    session = TmuxSession(ref, binary="/usr/bin/tmux", runner=runner)
    result = session.release()
    assert result == {"released": True, "destroyed": False, "managed": False}
    assert calls == []   # nothing dispatched at all for a borrowed session
