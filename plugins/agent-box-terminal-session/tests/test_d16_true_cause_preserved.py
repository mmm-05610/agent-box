"""P-T4 / D16: a compensation that itself fails must never bury the original allocate failure.

D6 made `allocate` remove the half-configured session it had just created. D16 is the
residual hole in that compensation: the rollback builds its `kill-session` with
`check=False`, which suppresses only a non-zero exit (CalledProcessError). A *spawn-level*
OSError from that same call — missing binary, socket failure — escaped before the bare
`raise` and replaced the failure the cleanup existed to preserve. The fix makes the
compensation best-effort in full (try/except), matching the D3 rollback.
"""
from __future__ import annotations

import subprocess

import pytest

from agent_box_terminal_session import TmuxSession

IDENTITY_LINE = "p0\t91\t$1\t@0\t%1\n"


def _original_failure():
    return subprocess.CalledProcessError(1, ["tmux", "set-option"], "", "simulated set-option failure")


def _managed_runner(*, kill_raises):
    """A runner where set-option fails with ORIGINAL and kill-session optionally raises OSError."""
    calls, state = [], {"original": None, "killed": []}

    def runner(argv, **kwargs):
        calls.append((argv, kwargs.get("check")))
        if any("set-option" in a for a in argv):
            original = _original_failure()
            state["original"] = original
            raise original
        if any("kill-session" in a for a in argv):
            state["killed"].append(argv)
            if kill_raises:
                # A spawn/execution-level failure: check=False does NOT cover this, which
                # is precisely why the compensation needs its own try/except.
                raise OSError(2, "tmux binary vanished mid-flight")
            return subprocess.CompletedProcess(argv, 0, "", "")
        return subprocess.CompletedProcess(argv, 0, IDENTITY_LINE, "")

    return runner, calls, state


def _managed(runner):
    ref = TmuxSession.managed_ref(host_affinity="host:one", socket="p0")
    return TmuxSession(ref, binary="/usr/bin/tmux", runner=runner)


def test_a_spawn_level_oserror_in_the_compensation_does_not_replace_the_original_failure():
    # The D16 case: set-option raises ORIGINAL, the kill-session that compensates for it
    # raises OSError.  The caller must still receive ORIGINAL, not the OSError.
    runner, calls, state = _managed_runner(kill_raises=True)
    session = _managed(runner)
    with pytest.raises(subprocess.CalledProcessError) as caught:
        session.allocate()
    assert caught.value is state["original"]          # exc is ORIGINAL
    assert not isinstance(caught.value, OSError)       # the OSError was swallowed, not surfaced
    assert len(state["killed"]) == 1                   # compensation still attempted, exactly once
    assert session._identity is None                   # no half-configured allocation is published
    assert session._allocation is None


def test_the_compensation_is_still_attempted_once_even_though_its_failure_is_dropped():
    # Best-effort means "try, ignore the outcome", not "skip the try".  The OSError is
    # dropped only so it cannot replace ORIGINAL; the attempt to remove the session still
    # has to happen or the next allocate collides with the pane this call left behind.
    runner, calls, state = _managed_runner(kill_raises=True)
    with pytest.raises(subprocess.CalledProcessError):
        _managed(runner).allocate()
    killed = [argv for argv, check in calls if any("kill-session" in a for a in argv)]
    assert len(killed) == 1


def test_a_successful_compensation_still_reports_the_original_failure_unchanged():
    # Reverse guard (not weakened by the fix): when kill-session behaves, the outcome is
    # identical to before — ORIGINAL propagates, one kill dispatched, check=False kept.
    runner, calls, state = _managed_runner(kill_raises=False)
    with pytest.raises(subprocess.CalledProcessError) as caught:
        _managed(runner).allocate()
    assert caught.value is state["original"]
    assert [check for argv, check in calls if any("kill-session" in a for a in argv)] == [False]


def test_a_failing_new_session_is_still_answered_with_no_kill_and_no_swallow():
    # The `created` gate is untouched by D16: if new-session never succeeded there is
    # nothing of this call's to remove, and the try/except must not manufacture a kill
    # for a session that does not exist.
    calls = []

    def runner(argv, **kwargs):
        calls.append((argv, kwargs.get("check")))
        if any("new-session" in a for a in argv):
            raise subprocess.CalledProcessError(1, argv, "", "simulated new-session failure")
        if any("kill-session" in a for a in argv):
            pytest.fail("a failed new-session must not be compensated with a kill")
        return subprocess.CompletedProcess(argv, 0, IDENTITY_LINE, "")

    with pytest.raises(subprocess.CalledProcessError):
        _managed(runner).allocate()
    assert not any(any("kill-session" in a for a in argv) for argv, _ in calls)
