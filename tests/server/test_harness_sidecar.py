"""Work Order 41 integration gate: Server -> sidecar -> fake native Harness.

This is the seam that makes a real Harness reachable from the Server. The
native peer is a controlled fake, so this proves transport, envelope, projection
and durable-event ordering — it does NOT prove a real model works.
"""
from __future__ import annotations

import os
import pathlib
import threading
import time

import pytest

from agent_box.server.bootstrap import build_runtime
from agent_box.server.execution.sidecar import (
    LocalProcessLauncher,
    SidecarEnvelope,
    SidecarError,
    SidecarHarnessPort,
)


REPO = pathlib.Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
SIDEcar_ENTRY = PLUGIN / "runtime" / "worker-entry.mjs"
FAKE_PEER = PLUGIN / "tests" / "harness_remote" / "fake_acp_peer.mjs"


def sidecar_environment(tmp_path, *, isolated: bool = True):
    """A minimal child environment: no inherited credentials, empty native homes."""
    home = tmp_path / "home"
    home.mkdir(exist_ok=True)
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(home),
        "XDG_CONFIG_HOME": str(home / "xdg"),
        "XDG_CACHE_HOME": str(home / "xdg"),
        "XDG_DATA_HOME": str(home / "xdg"),
    }
    if isolated:
        env["AGENTBOX_SIDECAR_ISOLATED"] = "1"
    return env


def node_available() -> bool:
    return pathlib.Path("/usr/bin/node").exists() or bool(os.environ.get("PATH"))


@pytest.mark.skipif(not SIDEcar_ENTRY.is_file(), reason="sidecar entry not built")
def test_sidecar_refuses_to_start_without_isolation(tmp_path):
    launcher = LocalProcessLauncher(
        ["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN),
    )
    envelope = SidecarEnvelope(
        launcher.launch(sidecar_environment(tmp_path, isolated=False)),
        on_event=lambda _message: None,
    )
    try:
        with pytest.raises(SidecarError) as refused:
            envelope.request({"op": "profiles"})
        assert refused.value.code == "SIDECAR_ISOLATION_REQUIRED"
    finally:
        envelope.close()


@pytest.mark.skipif(not SIDEcar_ENTRY.is_file(), reason="sidecar entry not built")
def test_sidecar_reports_registered_profiles_and_provenance(tmp_path):
    launcher = LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN))
    envelope = SidecarEnvelope(
        launcher.launch(sidecar_environment(tmp_path)), on_event=lambda _m: None,
    )
    try:
        result = envelope.request({"op": "profiles"})
        profiles = set(result["profiles"])
        # The four families attempted by Work Order 40 must be addressable.
        assert {"codex", "pi", "hermes", "omp"} <= profiles
        assert result["provenance"]["commit"]
    finally:
        envelope.close()


@pytest.mark.skipif(not SIDEcar_ENTRY.is_file(), reason="sidecar entry not built")
def test_harness_port_streams_pre_terminal_deltas_before_completion(tmp_path):
    """A delta must be observable while the turn is still running."""
    observed: list[tuple[str, str, dict]] = []
    lock = threading.Lock()

    def on_event(execution_id, kind, payload):
        with lock:
            observed.append((execution_id, kind, payload))

    port = SidecarHarnessPort(
        LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
        environment=sidecar_environment(tmp_path),
        profile="pi",
        adapter={"command": os.environ.get("NODE_BIN", "node"), "args": [str(FAKE_PEER)]},
        state_directory=str(tmp_path / "state"),
        directory=str(tmp_path),
        on_event=on_event,
    )
    try:
        native = port.open_execution("execution-1")
        assert native.startswith("fake-native-")
        result = port.prompt("execution-1", "component gate")
        assert "result" in result or result is not None

        deltas = [item for item in observed if item[1] == "message.delta"]
        assert deltas, f"no pre-terminal delta observed: {observed}"
        assert deltas[0][2]["text"] == "controlled stream"
        assert any(item[1] == "started" for item in observed)
    finally:
        port.stop()


@pytest.mark.skipif(not SIDEcar_ENTRY.is_file(), reason="sidecar entry not built")
def test_two_executions_keep_separate_native_identity(tmp_path):
    port = SidecarHarnessPort(
        LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
        environment=sidecar_environment(tmp_path),
        profile="pi",
        adapter={"command": "node", "args": [str(FAKE_PEER)]},
        state_directory=str(tmp_path / "state"),
        directory=str(tmp_path),
    )
    try:
        first = port.open_execution("exec-a")
        second = port.open_execution("exec-b")
        assert first != second, "two executions must not share a native session id"
        assert port.open_execution("exec-a") == first
    finally:
        port.stop()


@pytest.mark.skipif(not SIDEcar_ENTRY.is_file(), reason="sidecar entry not built")
def test_unknown_op_and_unknown_execution_are_typed_errors(tmp_path):
    launcher = LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN))
    envelope = SidecarEnvelope(
        launcher.launch(sidecar_environment(tmp_path)), on_event=lambda _m: None,
    )
    try:
        with pytest.raises(SidecarError) as not_registered:
            envelope.request({"op": "prompt", "sessionId": "x", "text": "y"})
        assert not_registered.value.code == "NOT_REGISTERED"

        envelope.request({
            "op": "register", "profile": "pi",
            "launch": {"command": "node", "args": [str(FAKE_PEER)]},
            "stateDirectory": str(tmp_path / "state"), "directory": str(tmp_path),
        })
        with pytest.raises(SidecarError) as unknown:
            envelope.request({"op": "teleport"})
        assert unknown.value.code == "UNKNOWN_OP"
    finally:
        envelope.close()


def test_port_reports_unknown_execution_without_sidecar(tmp_path):
    port = SidecarHarnessPort(
        LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
        environment=sidecar_environment(tmp_path), profile="pi",
        state_directory=str(tmp_path / "state"), directory=str(tmp_path),
    )
    with pytest.raises(SidecarError) as unknown:
        port.prompt("never-opened", "text")
    assert unknown.value.code == "EXECUTION_UNKNOWN"
    assert port.cancel("never-opened") is False
