"""Formal P0 verticals: fake Codex only; no model or native bwrap is run."""
from __future__ import annotations

from pathlib import Path
import subprocess

import pytest

from agent_box.protocols.runtime import (
    AttachDescriptor, CapabilitySet, CapabilityStatus, CompositionRejected,
    HarnessCommandSpec, MountPlan, PreparedMountSource, ResolvedComposition,
    RuntimeBinding, RuntimeCompositionCoordinator, RuntimeHostRef, SandboxRef,
    StartAmbiguous,
    IsolatedProcessSpec,
    digest,
)
from agent_box.protocols.runtime.testing import FakeSandbox
from agent_box_terminal_session import DirectStdioSession, TmuxSession


AFFINITY = "local:native-linux:linux:x86_64:linux-root"


class SentinelTransport:
    def __init__(self, *, lose_response: bool = False):
        self.count = 0
        self.operations = []
        self.lose_response = lose_response
        self.consumed = set()

    def submit(self, operation):
        assert operation.attempt_key and operation.spawn_token.startswith("spawn:")
        assert operation.spawn_token not in self.consumed
        self.consumed.add(operation.spawn_token)
        self.operations.append(operation)
        self.count += 1  # the only native-creation conformance seam
        if self.lose_response:
            raise StartAmbiguous("simulated native response loss")
        return "fake-native:" + str(self.count)


class FakeHost:
    def __init__(self, transport):
        self.ref = RuntimeHostRef("runtime-host-local", "fake-local", "host-digest", AFFINITY)
        self.transport = transport
        self.capabilities = CapabilitySet({"process.spawn.typed@1": CapabilityStatus.SUPPORTED}, affinity=AFFINITY)

    def stage(self, bundle):
        return bundle


def _sandbox(tmp_path: Path):
    source = tmp_path / "workspace"
    source.mkdir(parents=True)
    (source / "README").write_text("fake Codex fixture")
    prepared = PreparedMountSource("workspace-source", "sha256:fixture", "fixture", "execution")
    from agent_box.protocols.runtime.protocol import SandboxRef
    core_ref = SandboxRef("fake-sandbox", "fake", "sandbox-digest", AFFINITY)
    sandbox = FakeSandbox(core_ref)
    def fake_wrap(mount_plan, command, *, attempt_key):
        return IsolatedProcessSpec("spawn:" + attempt_key, attempt_key, digest((mount_plan.digest, command.digest)), local_argv=command.argv)
    sandbox.wrap = fake_wrap
    sandbox.cleanup = lambda isolated: {"status": "cleaned"}
    return sandbox, MountPlan(((prepared, "/workspace", "ro"),))


def _coordinator(tmp_path, terminal, transport, *, lose_wrap=False):
    host = FakeHost(transport)
    sandbox, mounts = _sandbox(tmp_path)
    if lose_wrap:
        def fail_wrap(*args, **kwargs):
            raise RuntimeError("simulated wrap failure")
        sandbox.wrap = fail_wrap
    binding = RuntimeBinding(host.ref, sandbox.ref, terminal.ref)
    return RuntimeCompositionCoordinator(
        lambda requested: ResolvedComposition(host, sandbox, terminal),
        bundle_factory=lambda resolved_host, command, execution_id, dispatch_id: __import__("agent_box.protocols.runtime", fromlist=["RuntimeBundle"]).RuntimeBundle(host.ref, mounts, "bundle:" + execution_id),
    ), binding, sandbox


def _command(io_mode="stdio"):
    return HarnessCommandSpec(("fake-codex", "--fixture"), "/workspace", {"HOME": "/home/agent"}, io_mode)


def test_direct_stdio_vertical_freezes_refs_single_spawns_active_and_cleans(tmp_path):
    transport = SentinelTransport()
    terminal = DirectStdioSession(DirectStdioSession.make_ref(host_affinity=AFFINITY))
    coordinator, binding, sandbox = _coordinator(tmp_path, terminal, transport)
    first = coordinator.start(binding, _command(), execution_id="direct-e", dispatch_id="d1")
    replay = coordinator.start(binding, _command(), execution_id="direct-e", dispatch_id="d1")
    assert first == replay and first.state == "running" and first.attach_descriptor is None
    assert binding.runtime_host_ref == coordinator._resolver(binding).host.ref
    assert binding.sandbox_ref == sandbox.ref and binding.terminal_session_ref == terminal.ref
    assert transport.count == 1
    assert coordinator.ledger[first.attempt_key].state == "RUNNING"
    assert coordinator.cleanup(first.attempt_key)["sandbox"]["status"] == "cleaned"
    assert coordinator.cleanup(first.attempt_key) == {"status": "already_cleaned"}


def test_tmux_vertical_freezes_refs_single_spawns_active_and_presenter_only_sees_descriptor(tmp_path):
    calls = []
    def runner(argv, **kwargs):
        calls.append(argv)
        return subprocess.CompletedProcess(argv, 0, "/tmp/tmux\t91\t$1\t@0\t%1\n" if "display-message" in argv else "", "")
    transport = SentinelTransport()
    terminal = TmuxSession(TmuxSession.managed_ref(host_affinity=AFFINITY, socket="vertical"), binary="tmux", runner=runner)
    coordinator, binding, _ = _coordinator(tmp_path, terminal, transport)
    handle = coordinator.start(binding, _command("pty"), execution_id="tmux-e", dispatch_id="d1")
    assert handle.state == "running" and isinstance(handle.attach_descriptor, AttachDescriptor)
    assert transport.count == 1 and coordinator.ledger[handle.attempt_key].state == "RUNNING"
    # The session does not respawn itself.  It submits exactly one registered,
    # sealed carrier operation; a real Host executes respawn at that seam.
    assert transport.operations[0].transport_kind == "tmux-respawn@1"
    assert not any("respawn-pane" in call for call in calls)
    class Presenter:
        def open(self, descriptor):
            assert isinstance(descriptor, AttachDescriptor)
            assert not hasattr(descriptor, "argv") and not hasattr(descriptor, "environment")
    assert coordinator.present(handle, Presenter())
    class BrokenPresenter:
        def open(self, descriptor):
            raise RuntimeError("display unavailable")
    assert not coordinator.present(handle, BrokenPresenter())
    assert coordinator.ledger[handle.attempt_key].state == "RUNNING"


def test_response_loss_wrap_failure_pane_failure_and_presenter_failure_are_non_replaying(tmp_path):
    # Native response loss consumes once and blocks replay.
    lost = SentinelTransport(lose_response=True)
    direct = DirectStdioSession(DirectStdioSession.make_ref(host_affinity=AFFINITY))
    coordinator, binding, _ = _coordinator(tmp_path, direct, lost)
    with pytest.raises(StartAmbiguous): coordinator.start(binding, _command(), execution_id="lost", dispatch_id="d")
    with pytest.raises(StartAmbiguous): coordinator.start(binding, _command(), execution_id="lost", dispatch_id="d")
    assert lost.count == 1
    # A wrapper failure happens before allocation/run and cannot create a target.
    clean = SentinelTransport()
    broken, broken_binding, _ = _coordinator(tmp_path / "wrap", DirectStdioSession(DirectStdioSession.make_ref(host_affinity=AFFINITY)), clean, lose_wrap=True)
    with pytest.raises(RuntimeError): broken.start(broken_binding, _command(), execution_id="wrap", dispatch_id="d")
    assert clean.count == 0
    # Pane allocation then bridge/run failure consumes at most once and cleanup
    # removes only the managed terminal allocation.
    def identity_runner(argv, **kwargs):
        return subprocess.CompletedProcess(argv, 0, "/tmp/tmux\t91\t$1\t@0\t%1\n" if "display-message" in argv else "", "")
    tmux = TmuxSession(TmuxSession.managed_ref(host_affinity=AFFINITY, socket="failure"), binary="tmux", runner=identity_runner)
    pane_transport = SentinelTransport()
    pane, pane_binding, _ = _coordinator(tmp_path / "pane", tmux, pane_transport)
    # The fake transport models a lost carrier response after consumption;
    # it must not be retried as a second respawn.
    pane_transport.lose_response = True
    with pytest.raises(StartAmbiguous): pane.start(pane_binding, _command("pty"), execution_id="pane", dispatch_id="d")
    assert pane_transport.count == 1
    assert pane.cleanup(next(iter(pane.ledger))) ["terminal"]["destroyed"] is True
    # Presentation failure never changes an already ACTIVE/RUNNING attempt.
    assert pane.ledger[next(iter(pane.ledger))].state == "AMBIGUOUS"
