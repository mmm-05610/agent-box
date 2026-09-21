"""P-T2 / D6: a managed `allocate` that fails mid-configuration removes its own session."""
from __future__ import annotations

import subprocess

import pytest

from agent_box_terminal_session import TmuxSession

# The socket has to match the Ref's, or a borrowed Ref fails its own affinity check
# before the behaviour under test is reached.
IDENTITY_LINE = "p0\t91\t$1\t@0\t%1\n"


def _state(**overrides):
    state = {"calls": [], "killed": [], "fail": set(), "raised": None, "identity_line": IDENTITY_LINE}
    state.update(overrides)
    return state


def _runner(state):
    def runner(argv, **kwargs):
        state["calls"].append((argv, kwargs.get("check")))
        failing = next((verb for verb in ("new-session", "set-option", "display-message")
                        if verb in argv and verb in state["fail"]), None)
        if failing:
            state["raised"] = subprocess.CalledProcessError(1, argv, "", f"simulated {failing} failure")
            raise state["raised"]
        if "kill-session" in argv:
            state["killed"].append(argv)
            return subprocess.CompletedProcess(argv, 0, "", "")
        return subprocess.CompletedProcess(argv, 0, state["identity_line"], "")
    return runner


def _managed(state):
    ref = TmuxSession.managed_ref(host_affinity="host:one", socket="p0")
    return TmuxSession(ref, binary="/usr/bin/tmux", runner=_runner(state))


def _borrowed(state):
    ref = TmuxSession.existing_ref(host_affinity="host:one", socket="p0", server_generation="server-pid:91",
                                   session_id="$1", window_id="@0", pane_id="%1")
    return TmuxSession(ref, binary="/usr/bin/tmux", runner=_runner(state))


def test_allocate_kills_the_session_it_had_just_created_when_configuration_fails():
    # new-session succeeded, so the half-configured session is this call's to
    # remove; the original failure still reaches the caller untouched.
    state = _state(fail={"set-option"})
    session = _managed(state)
    with pytest.raises(subprocess.CalledProcessError) as caught:
        session.allocate()
    assert caught.value is state["raised"]                # re-raised, not replaced
    assert len(state["killed"]) == 1                      # exactly once, not retried
    assert [argv for argv, check in state["calls"] if "kill-session" in argv] == state["killed"]
    assert session._identity is None                      # no half-configured allocation is published
    assert session._allocation is None


def test_the_compensation_never_replaces_the_original_failure():
    # check=False is why the original error still reaches the caller: a raising
    # kill-session would bury the failure that made the cleanup necessary.
    state = _state(fail={"set-option"})
    with pytest.raises(subprocess.CalledProcessError):
        _managed(state).allocate()
    assert [check for argv, check in state["calls"] if "kill-session" in argv] == [False]


def test_allocate_also_cleans_up_when_the_identity_readback_fails():
    # Anything after new-session is inside the window, including the readback.
    state = _state(fail={"display-message"})
    with pytest.raises(subprocess.CalledProcessError) as caught:
        _managed(state).allocate()
    assert caught.value is state["raised"]
    assert any("kill-session" in argv for argv, check in state["calls"])


def test_a_failing_new_session_is_answered_with_no_kill():
    # Nothing was created, so nothing is this call's to destroy: killing here would
    # reach a session this method never made.
    state = _state(fail={"new-session"})
    session = _managed(state)
    with pytest.raises(subprocess.CalledProcessError) as caught:
        session.allocate()
    assert caught.value is state["raised"]
    assert state["killed"] == []
    assert not any("set-option" in argv for argv, check in state["calls"])
    assert session._identity is None


def test_a_successful_managed_allocate_dispatches_no_kill():
    state = _state()
    session = _managed(state)
    allocation = session.allocate()
    assert state["killed"] == []
    assert allocation.terminal_ref == session.ref
    assert session._identity is not None


def test_borrowed_allocation_never_reaches_the_compensation():
    # Guard preserved: the compensation lives inside the managed branch only, so an
    # existing (borrowed) session is never created, configured or killed here.
    state = _state(fail={"set-option"})
    session = _borrowed(state)
    allocation = session.allocate()
    assert state["killed"] == []
    assert not any("new-session" in argv for argv, check in state["calls"])
    assert not any("set-option" in argv for argv, check in state["calls"])
    assert allocation.terminal_ref == session.ref
