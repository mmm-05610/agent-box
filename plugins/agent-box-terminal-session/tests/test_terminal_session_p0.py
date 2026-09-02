from __future__ import annotations

from pathlib import Path
import subprocess

import pytest

from agent_box.protocols.runtime import HostTransportOperation, IsolatedProcessSpec
from agent_box_terminal_session import DirectStdioSession, TmuxSession


class Transport:
    def __init__(self):
        self.operations = []

    def submit(self, operation):
        assert isinstance(operation, HostTransportOperation)
        self.operations.append(operation)
        return "native:1"


def spec(attempt="a1"):
    return IsolatedProcessSpec("token:" + attempt, attempt, "spec:1", local_argv=("/bin/true",))


def test_direct_stdio_is_explicit_and_single_run_is_replayed():
    transport = Transport()
    ref = DirectStdioSession.make_ref(host_affinity="host:one")
    session = DirectStdioSession(ref, transport=transport)
    session.resolve(ref)
    session.allocate()
    first = session.run(transport, spec(), "a1")
    second = session.run(transport, spec(), "a1")
    assert first == second
    assert len(transport.operations) == 1
    with pytest.raises(ValueError):
        DirectStdioSession(DirectStdioSession.make_ref(host_affinity="host:two")).resolve(ref)


def test_tmux_allocate_does_not_spawn_and_run_submits_one_fixed_typed_carrier():
    calls = []

    def runner(argv, **kwargs):
        calls.append(argv)
        if "new-session" in argv:
            return subprocess.CompletedProcess(argv, 0, "", "")
        return subprocess.CompletedProcess(argv, 0, "/tmp/tmux\t91\t$1\t@0\t%1\n", "")

    transport = Transport()
    ref = TmuxSession.managed_ref(host_affinity="host:one", socket="p0")
    session = TmuxSession(ref, binary="/usr/bin/tmux", runner=runner)
    session.resolve(ref)
    session.allocate()
    assert len(transport.operations) == 0
    session.run(transport, spec(), "a1")
    assert len(transport.operations) == 1
    operation = transport.operations[0]
    assert operation.transport_kind == "tmux-respawn@1"
    assert operation.sealed_payload and "/bin/true" not in operation.sealed_payload
    # Actual respawn belongs to the registered Host carrier handler, never
    # this pre-submit session method.
    assert not any("respawn-pane" in call for call in calls)


def test_existing_tmux_identity_mismatch_fails_closed_without_release():
    calls = []

    def runner(argv, **kwargs):
        calls.append(argv)
        return subprocess.CompletedProcess(argv, 0, "/tmp/other\t92\t$1\t@0\t%1\n", "")

    ref = TmuxSession.existing_ref(host_affinity="host:one", socket="p0", server_generation="server-pid:91", session_id="$1", window_id="@0", pane_id="%1")
    session = TmuxSession(ref, binary="/usr/bin/tmux", runner=runner)
    with pytest.raises(Exception):
        session.resolve(ref)
    assert not any("kill-session" in call for call in calls)
