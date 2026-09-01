"""Native offline tmux vertical; tmux itself creates the bwrap child."""
from __future__ import annotations

from pathlib import Path
import os
import subprocess
import time

import pytest

from agent_box.extensions.runtime_composition import (
    HarnessCommandSpec, MountPlan, PreparedMountSource, ResolvedComposition,
    RuntimeBinding, RuntimeBundle, RuntimeCompositionCoordinator,
)
from agent_box_runtime_local.provider import LocalRuntimeHostProvider
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider, _tree_digest
from agent_box_terminal_session import TmuxSession


def test_real_tmux_respawn_creates_one_real_bwrap_target(tmp_path, monkeypatch):
    if BwrapSandboxProvider(tmp_path / "probe").probe()["status"] != "available":
        pytest.skip("real bwrap probe unavailable")
    bridge = tmp_path / "bin" / "agent-box-terminal-session-bridge"; bridge.parent.mkdir()
    source_bridge = Path(__file__).parents[1] / "plugins" / "agent-box-terminal-session" / "src" / "agent_box_terminal_session" / "bridge.py"
    bridge.write_text(f"#!/bin/sh\nexec /usr/bin/python3 {source_bridge}\n", encoding="utf-8"); bridge.chmod(0o755)
    monkeypatch.setenv("PATH", str(bridge.parent) + os.pathsep + os.environ["PATH"])
    workspace = tmp_path / "workspace"; workspace.mkdir()
    target = workspace / "offline-fake-codex"; target.write_text("#!/bin/sh\necho tmux-native-ok\n", encoding="utf-8"); target.chmod(0o755)
    host_provider = LocalRuntimeHostProvider()
    # The tmux carrier operation reaches the transport through the activated
    # ExtensionCatalog — explicit wiring, never import-order registration.
    # The catalog component shape matches the plugin registration exactly:
    # a TransportOperationContribution(descriptor, handler) pair.
    from agent_box.extensions.catalog import ExtensionCatalog, ExtensionContribution
    from agent_box.extensions.runtime_composition import TransportOperationContribution
    from agent_box_terminal_session.tmux import TmuxRespawnOperationHandler
    handler = TmuxRespawnOperationHandler()
    host_provider.bind_catalog(ExtensionCatalog.from_contributions([
        ExtensionContribution("transport_operation", "tmux-respawn@1", "native-tmux-vertical",
                              component=TransportOperationContribution(handler.descriptor(), handler)),
    ]))
    host_ref = host_provider.make_ref(); host = host_provider.resolve("agent-box.runtime-host@1", host_ref).port
    sandbox_provider = BwrapSandboxProvider(tmp_path / "sandbox")
    sandbox_provider.register_prepared_source("tmux-workspace", workspace, authorized_scope="tmux")
    sandbox_ref = sandbox_provider.make_ref(host_affinity=host_ref.metadata["affinity"]); sandbox = sandbox_provider.resolve("agent-box.sandbox@1", sandbox_ref)
    socket = "native-" + tmp_path.name[-12:]
    terminal = TmuxSession(TmuxSession.managed_ref(host_affinity=host_ref.metadata["affinity"], socket=socket))
    binding = RuntimeBinding(host.ref, sandbox.ref, terminal.ref)
    mounts = MountPlan(((PreparedMountSource("tmux-workspace", _tree_digest(workspace), "native-test", "tmux"), "/workspace", "ro"),))
    coordinator = RuntimeCompositionCoordinator(lambda frozen: ResolvedComposition(host, sandbox, terminal), bundle_factory=lambda *_: RuntimeBundle(host.ref, mounts, "native-tmux-bundle"))
    try:
        handle = coordinator.start(binding, HarnessCommandSpec(("/workspace/offline-fake-codex",), "/workspace", io_mode="pty"), execution_id="native-tmux", dispatch_id="native-tmux")
        assert coordinator.start(binding, HarnessCommandSpec(("/workspace/offline-fake-codex",), "/workspace", io_mode="pty"), execution_id="native-tmux", dispatch_id="native-tmux") == handle
        deadline = time.monotonic() + 5; captured = ""
        while time.monotonic() < deadline:
            result = subprocess.run(["tmux", "-L", socket, "capture-pane", "-p", "-t", terminal._identity.pane_id], shell=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            captured = result.stdout
            if "tmux-native-ok" in captured or "Pane is dead (status 0" in captured: break
            time.sleep(.05)
        assert "tmux-native-ok" in captured or "Pane is dead (status 0" in captured
        assert coordinator.ledger[handle.attempt_key].target_creation_count == 1
        assert coordinator.cleanup(handle.attempt_key)["terminal"]["destroyed"] is True
        assert coordinator.cleanup(handle.attempt_key) == {"status": "already_cleaned"}
    finally:
        # This test owns its tmux server: never leak sessions across runs.
        subprocess.run(["tmux", "-L", socket, "kill-server"], shell=False, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
