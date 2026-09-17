"""Order 48 shape tests: materialisation, environment, refusals.

The container half cannot be tested here (the spike says it cannot run on this
machine at all); what *is* testable on Linux is the translation this provider
performs - in-place projection into the real home, the environment block that
carries the credential without argv, the typed refusals, and the declaration
that marks isolation unavailable instead of claiming it.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from agent_box.extensions.runtime_composition.sandbox_port import (
    RoomInvariants,
    SandboxInvariantUnsupported,
    SidecarRoomRequest,
)
from agent_box_sandbox_windows import (
    SIDECAR_ENTRYPOINT,
    WindowsSandboxError,
    WindowsSandboxPort,
)
from agent_box_sandbox_windows.job import Job, JobError


def _fixture(tmp_path: Path) -> tuple[Path, Path, Path]:
    """(view, role_dir, home) with a minimal sidecar bundle in the view."""
    view = tmp_path / "view"
    entry = view.joinpath(*SIDECAR_ENTRYPOINT.split("/"))
    entry.parent.mkdir(parents=True)
    entry.write_text("// sidecar entry\n", encoding="utf-8")
    (view / "deploy").mkdir()
    (view / "deploy" / "models.json").write_text('{"models": []}\n', encoding="utf-8")
    role_dir = tmp_path / "profiles" / "role"
    home = role_dir / ".pi" / "agent"
    home.mkdir(parents=True)
    return view, role_dir, home


def _request(view: Path, home: Path, *, secret: Path | None = None,
             network: str = "inherit") -> SidecarRoomRequest:
    return SidecarRoomRequest(
        workspace=str(view.parent / "workspace"),
        staged_view=str(view),
        secret=str(secret) if secret else None,
        base_environment={"AGENTBOX_SIDECAR_ISOLATED": "1"},
        projection_mounts=(("deploy/models.json", "/runtime/home/.pi/agent/models.json"),),
        state_home_source=str(home),
        state_target="/runtime/home/.pi/agent/sessions",
        native_home=".pi/agent",
        invariants=RoomInvariants(network_mode=network),
    )


def test_projection_is_materialised_in_place_and_read_only(tmp_path):
    view, role_dir, home = _fixture(tmp_path)
    port = WindowsSandboxPort(node_path="node.exe")
    spec = port.compose_sidecar_room(_request(view, home))

    materialised = role_dir / ".pi" / "agent" / "models.json"
    assert materialised.is_file()
    assert materialised.read_text() == '{"models": []}\n'
    # D4's fallback: the materialised configuration is read-only where it sits.
    assert not os.access(materialised, os.W_OK)
    # argv is the plain node command; there is no wrapper process on Windows.
    assert spec.argv == ("node.exe", str(view.joinpath(*SIDECAR_ENTRYPOINT.split("/"))))
    assert "--bind" not in spec.argv


def test_environment_points_the_home_variables_at_the_real_directories(tmp_path):
    view, _role, home = _fixture(tmp_path)
    port = WindowsSandboxPort(node_path="node.exe")
    spec = port.compose_sidecar_room(_request(view, home))
    assert spec.environment["HOME"] == str(home)
    assert spec.environment["USERPROFILE"] == str(home)
    assert spec.environment["XDG_CONFIG_HOME"] == str(home / ".config")
    assert spec.environment["AGENTBOX_SIDECAR_ISOLATED"] == "1"


def test_the_credential_enters_the_environment_block_and_never_argv(tmp_path):
    view, _role, home = _fixture(tmp_path)
    secret = tmp_path / "secret"
    secret.write_text("conformance-credential-not-a-real-secret\n", encoding="utf-8")
    port = WindowsSandboxPort(node_path="node.exe", credential_environment="DEEPSEEK_API_KEY")
    spec = port.compose_sidecar_room(_request(view, home, secret=secret))
    assert spec.environment["DEEPSEEK_API_KEY"] == "conformance-credential-not-a-real-secret"
    assert "conformance-credential-not-a-real-secret" not in "\0".join(spec.argv)


def test_a_none_network_posture_is_refused_not_claimed(tmp_path):
    view, _role, home = _fixture(tmp_path)
    port = WindowsSandboxPort(node_path="node.exe")
    with pytest.raises(SandboxInvariantUnsupported) as refusal:
        port.compose_sidecar_room(_request(view, home, network="none"))
    assert refusal.value.code == "SANDBOX_NETWORK_POSTURE_UNSUPPORTED"


def test_a_missing_home_or_view_is_a_typed_refusal(tmp_path):
    view, _role, home = _fixture(tmp_path)
    port = WindowsSandboxPort(node_path="node.exe")
    with pytest.raises(WindowsSandboxError) as missing_home:
        port.compose_sidecar_room(
            _request(view, tmp_path / "nonexistent-home"),
        )
    assert missing_home.value.code == "WINDOWS_HOME_MISSING"
    with pytest.raises(WindowsSandboxError) as missing_entry:
        (view.joinpath(*SIDECAR_ENTRYPOINT.split("/"))).unlink()
        port.compose_sidecar_room(_request(view, home))
    assert missing_entry.value.code == "WINDOWS_VIEW_INCOMPLETE"


def test_a_projection_outside_the_guest_home_is_refused(tmp_path):
    view, _role, home = _fixture(tmp_path)
    port = WindowsSandboxPort(node_path="node.exe")
    request = _request(view, home)
    broken = SidecarRoomRequest(
        workspace=request.workspace, staged_view=request.staged_view, secret=None,
        base_environment={}, projection_mounts=(("deploy/models.json", "/etc/passwd"),),
        state_home_source=request.state_home_source, state_target=request.state_target,
    )
    with pytest.raises(WindowsSandboxError) as refusal:
        port.compose_sidecar_room(broken)
    assert refusal.value.code == "WINDOWS_TARGET_OUTSIDE_HOME"


def test_the_declaration_says_isolation_is_unavailable():
    port = WindowsSandboxPort(node_path="node.exe")
    document = port.declaration_document(
        readonly_targets=("/runtime/home/.pi/agent/models.json",),
        writable_targets=("/runtime/home/.pi/agent/sessions",),
        environment_binding="windows|fixture", observed_at=1789000000,
    )
    states = {item.capability_id: item.support_state for item in document.declarations}
    assert states["filesystem.readonly@1"] == "unavailable"
    assert states["network.none@1"] == "unavailable"
    assert states["filesystem.writable@1"] == "supported"
    assert states["network.inherit@1"] == "supported"
    assert document.provider == "sandbox-windows"
    assert len(document.digest) == 64


def test_probe_reports_unavailable_off_windows():
    port = WindowsSandboxPort(node_path="node.exe")
    # On a Linux test host there is no Windows to run on; the probe must say so
    # rather than pretend (the forced variant exists for Windows CI only).
    if os.name != "nt" and os.environ.get("AGENT_BOX_WINDOWS_FORCE") != "1":
        assert port.probe()["status"] == "unavailable"


def test_the_job_refuses_to_pretend_on_a_non_windows_host():
    if os.name == "nt":
        pytest.skip("this refusal is the non-Windows branch")
    with pytest.raises(JobError) as refusal:
        Job("agentbox-test")
    assert refusal.value.code == "JOB_PLATFORM_UNSUPPORTED"
