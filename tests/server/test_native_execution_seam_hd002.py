"""Native composition guards; these tests never spawn an Agent."""

from pathlib import Path

import pytest

from agent_box.server.execution.sidecar import NativeHarnessPort, NativeProcessLauncher
from agent_box.server.execution.sidecar_backend import (
    CapabilityGateRefusal, _capability_gate, _resumable,
)


def _port(project: Path) -> NativeHarnessPort:
    return NativeHarnessPort(
        NativeProcessLauncher(["/not-launched"], cwd=str(project)),
        environment={}, directory=str(project), profile="pi",
    )


def test_native_gate_rechecks_selected_project_before_spawn(tmp_path):
    project = tmp_path / "project"
    project.mkdir()
    port = _port(project)
    _capability_gate(port, "turn")
    project.rmdir()
    with pytest.raises(CapabilityGateRefusal, match="selected project") as refused:
        _capability_gate(port, "turn")
    assert refused.value.code == "LOCAL_PATH_MISSING"


def test_native_gate_rejects_isolated_material_and_wrong_launcher(tmp_path):
    project = tmp_path / "project"
    project.mkdir()
    port = _port(project)
    port.capability_binding = "injected-room"
    with pytest.raises(CapabilityGateRefusal, match="isolated material"):
        _capability_gate(port, "turn")
    port.capability_binding = None
    port.launcher = object()
    with pytest.raises(CapabilityGateRefusal, match="native launcher"):
        _capability_gate(port, "turn")


def test_native_capture_records_id_without_home_audit(tmp_path):
    class Envelope:
        def __init__(self):
            self.ops = []

        def request(self, request, **_kwargs):
            self.ops.append(request["op"])
            return {}

        def audit_state(self):
            raise AssertionError("native home must not be inspected")

    port = _port(tmp_path)
    envelope = Envelope()
    port._sessions["turn"] = envelope
    port._effective_supported = lambda *_args: True
    audit, supported = port.capture_execution("turn")
    assert envelope.ops == ["close"]
    assert audit == {
        "nativePlatform": "local", "homeLocator": "agent-native",
        "audited": False, "truncated": False, "files": [],
    }
    assert _resumable(port, supported, audit) is True
