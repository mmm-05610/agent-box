"""Native offline direct-stdio vertical: real bwrap, no model/network."""
from __future__ import annotations

from pathlib import Path
import subprocess

import pytest

from agent_box.protocols.runtime import (
    HarnessCommandSpec, MountPlan, PreparedMountSource, ResolvedComposition,
    RuntimeBinding, RuntimeBundle, RuntimeCompositionCoordinator,
)
from agent_box_runtime_local.provider import LocalRuntimeHostProvider
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider, _tree_digest
from agent_box_terminal_session import DirectStdioSession


def test_real_bwrap_direct_stdio_offline_fake_target_once(tmp_path):
    sandbox_provider = BwrapSandboxProvider(tmp_path / "sandbox")
    if sandbox_provider.probe()["status"] != "available":
        pytest.skip("real bwrap probe unavailable")
    workspace = tmp_path / "workspace"; workspace.mkdir()
    target = workspace / "offline-fake-codex"
    target.write_text("#!/bin/sh\necho offline-native-ok\n", encoding="utf-8")
    target.chmod(0o755)
    processes = []
    host_provider = LocalRuntimeHostProvider(
        executor=lambda argv, **kwargs: processes.append(
            subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **kwargs)
        ) or processes[-1]
    )
    host_ref = host_provider.make_ref(); host = host_provider.resolve("agent-box.runtime-host@1", host_ref).port
    sandbox_provider.register_prepared_source("native-workspace", workspace, authorized_scope="native")
    sandbox_ref = sandbox_provider.make_ref(host_affinity=host_ref.metadata["affinity"])
    sandbox = sandbox_provider.resolve("agent-box.sandbox@1", sandbox_ref)
    terminal = DirectStdioSession(DirectStdioSession.make_ref(host_affinity=host_ref.metadata["affinity"]))
    binding = RuntimeBinding(host.ref, sandbox.ref, terminal.ref)
    mounts = MountPlan(((PreparedMountSource("native-workspace", _tree_digest(workspace), "native-test", "native"), "/workspace", "ro"),))
    coordinator = RuntimeCompositionCoordinator(
        lambda frozen: ResolvedComposition(host, sandbox, terminal) if frozen == binding else (_ for _ in ()).throw(ValueError("unfrozen binding")),
        bundle_factory=lambda *_: RuntimeBundle(host.ref, mounts, "native-offline-bundle"),
    )
    handle = coordinator.start(binding, HarnessCommandSpec(("/workspace/offline-fake-codex",), "/workspace"), execution_id="native-direct", dispatch_id="native-direct")
    replay = coordinator.start(binding, HarnessCommandSpec(("/workspace/offline-fake-codex",), "/workspace"), execution_id="native-direct", dispatch_id="native-direct")
    assert handle == replay and len(processes) == 1
    stdout, stderr = processes[0].communicate(timeout=5)
    assert processes[0].returncode == 0 and stdout == "offline-native-ok\n" and stderr == ""
    assert coordinator.cleanup(handle.attempt_key)["sandbox"]["status"] == "cleaned"
    assert coordinator.cleanup(handle.attempt_key) == {"status": "already_cleaned"}
    assert len(processes) == 1
