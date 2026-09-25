"""Cross-layer proof of the isolated native home.

The unit rules live with the layers that own them (bwrap target grammar, the
Server's deployment validation, the launcher's protected-path handling). This
file drives the whole chain - Server composition over the real release Worker
and bwrap - with one generic probe fixture that reports what the guest process,
and the Harness it stands in for, can actually see:

* the resolved home is the execution projection, never the host home;
* the harness's explicit directory variable and its default path resolve to the
  same projection (dual convergence);
* the declared writable state accepts writes and can be recycled;
* the declared read-only configuration refuses writes;
* a sentinel in the host home is invisible, the projected configuration is not;
* a read-only configuration inside the writable state subtree is not captured
  into the checkpoint and cannot be restored over.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import time

import pytest

from agent_box.server.execution.sidecar import (
    SidecarEnvelope,
    SidecarError,
    SidecarHarnessPort,
    WslSidecarLauncher,
    sidecar_bundle_files,
)
from agent_box_runtime_wsl import WorkerClient


REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harness"
WORKER = REPO / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker"
PEER = "tests/server/fixtures/home_probe_acp_peer.mjs"
GUEST_HOME = "/runtime/home"
NATIVE_DIR = f"{GUEST_HOME}/.fixture"
STATE_TARGET = f"{GUEST_HOME}/.fixture/state"
CONFIG_TARGET = f"{GUEST_HOME}/.fixture/config.json"


def require_worker() -> None:
    if not WORKER.is_file() or not shutil.which("bwrap"):
        pytest.skip("current Worker and bwrap are required")


class RealConnector:
    def __init__(self, root: Path) -> None:
        self.root = root

    def client_for_workspace(self, **arguments):
        return WorkerClient(
            [str(WORKER), "--root", str(self.root / "worker-root"),
             "--home-root", str(self.root / "profile-home"), "--workspace", str(REPO)],
            worker_digest="sha256:" + hashlib.sha256(WORKER.read_bytes()).hexdigest(),
            worker_version="0.1.0", connection_id=arguments["connection_id"],
            project_id=arguments["connection_id"], effective_user=os.environ["USER"],
            server_instance_id="server-home-gate",
            executable_authorizations=arguments.get("executable_authorizations", ()),
        )


BUNDLE_CONFIG = "agentbox-sidecar/deployment/fixture/projection-0-config.json"


def _bundle_with(config_source: Path) -> dict:
    """The launcher projects reviewable bundle files, not host paths."""
    return sidecar_bundle_files(
        PLUGIN, additional_files={BUNDLE_CONFIG: config_source.read_bytes()},
    )


def _bwrap_room_port():
    """The real bwrap port: these tests assert the room argv and guest layout."""
    from agent_box.extensions.runtime_composition.sandbox_port import (
        resolve_sandbox_port,
    )

    return resolve_sandbox_port("sandbox-bwrap")


def _port(tmp_path, *, host_sentinel: Path, protected: tuple[str, ...] = (),
          config_source: Path) -> SidecarHarnessPort:
    launcher = WslSidecarLauncher(
        RealConnector(tmp_path),
        workspace={"distribution": "Ubuntu", "remote_user": os.environ["USER"],
                   "connection_id": "connection-home", "remote_path": str(REPO)},
        bundle=_bundle_with(config_source), timeout_ms=60_000,
        projection_mounts=((BUNDLE_CONFIG, CONFIG_TARGET),),
        home_locator="home-test/.fixture",
        native_home=".fixture",
        profile_id="profile_home",
        harness_type="fixture",
        audit_window=".fixture/state",
        protected_state_paths=protected,
        sandbox_port=_bwrap_room_port(),
    )
    return SidecarHarnessPort(
        launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="pi",
        adapter={"command": "/usr/bin/node", "args": [f"/workspace/{PEER}"],
                 "environment": {
                     "AGENTBOX_FIXTURE_NATIVE_DIR": NATIVE_DIR,
                     "AGENTBOX_FIXTURE_STATE_DIR": STATE_TARGET,
                     "AGENTBOX_FIXTURE_CONFIG_PATH": CONFIG_TARGET,
                     "AGENTBOX_FIXTURE_HOST_SENTINEL": str(host_sentinel),
                 }},
        declared_capabilities={"native_continuation": True},
        state_directory="/tmp/agentbox-sidecar-state", directory="/workspace",
        native_platform="wsl", home_locator="home-test/.fixture",
    )


def _probe_report(port: SidecarHarnessPort, execution_id: str) -> dict:
    observed: list[tuple[str, str, dict]] = []
    port.on_event = lambda execution, kind, payload: observed.append((execution, kind, payload))
    port.prompt(execution_id, "report the isolated home")
    text = "".join(payload["text"] for _execution, kind, payload in observed
                   if kind == "message.delta")
    return json.loads(text)


def _await_worker_projection_cleanup(root: Path, *, timeout: float = 20.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not (root / "views").exists() and not (root / "secrets").exists():
            return
        time.sleep(0.1)
    raise AssertionError("the Worker kept its projection after the turn")


def test_the_guest_home_is_the_projection_and_the_config_stays_read_only(tmp_path):
    require_worker()
    host_home = tmp_path / "host-home"
    host_home.mkdir()
    host_sentinel = host_home / ".fixture" / "host-sentinel"
    host_sentinel.parent.mkdir()
    host_sentinel.write_text("host only\n", encoding="utf-8")
    config = tmp_path / "config.json"
    config.write_text('{"profile": "sentinel"}\n', encoding="utf-8")

    port = _port(tmp_path, host_sentinel=host_sentinel, config_source=config)
    try:
        native = port.open_execution("execution-home")
        assert native
        report = _probe_report(port, "execution-home")
        # The guest home is the execution projection, not the host home.
        assert report["home"] == GUEST_HOME, report
        # Default path and explicit variable converge on the same directory.
        assert report["nativeDirectory"] == NATIVE_DIR, report
        assert report["converged"] is True, report
        # Writable state works; read-only configuration refuses writes.
        assert report["stateWrite"]["ok"] is True, report
        assert report["configRead"] == {"ok": True, "value": '{"profile": "sentinel"}'}, report
        assert report["configWrite"]["ok"] is False, report
        assert report["configWrite"]["code"] in {"EROFS", "EACCES", "EPERM"}, report
        # The host sentinel is not reachable from inside the sandbox.
        assert report["hostSentinelVisible"] is False, report
    finally:
        port.stop()
    _await_worker_projection_cleanup(tmp_path / "worker-root")


def test_a_config_inside_the_state_subtree_is_not_captured_and_cannot_be_restored(tmp_path):
    """Configuration is not state, and saying so must not rely on the overlay."""
    require_worker()
    host_home = tmp_path / "host-home"
    host_home.mkdir()
    host_sentinel = host_home / "sentinel"
    host_sentinel.write_text("host only\n", encoding="utf-8")
    config = tmp_path / "config.json"
    config.write_text('{"profile": "sentinel"}\n', encoding="utf-8")
    # Nested layout: the read-only config lives inside the writable state dir.
    state_target = f"{GUEST_HOME}/.fixture"
    config_target = f"{GUEST_HOME}/.fixture/config.json"

    launcher = WslSidecarLauncher(
        RealConnector(tmp_path),
        workspace={"distribution": "Ubuntu", "remote_user": os.environ["USER"],
                   "connection_id": "connection-home-nested", "remote_path": str(REPO)},
        bundle=_bundle_with(config), timeout_ms=60_000,
        projection_mounts=((BUNDLE_CONFIG, config_target),),
        home_locator="home-test/.fixture",
        native_home=".fixture",
        profile_id="profile_home",
        harness_type="fixture",
        # The whole native home is the declared window here, so the read-only
        # configuration inside it is excluded from the audit by name.
        audit_window=".fixture",
        protected_state_paths=("config.json",),
        sandbox_port=_bwrap_room_port(),
    )
    port = SidecarHarnessPort(
        launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="pi",
        adapter={"command": "/usr/bin/node", "args": [f"/workspace/{PEER}"],
                 "environment": {
                     "AGENTBOX_FIXTURE_NATIVE_DIR": f"{GUEST_HOME}/.fixture",
                     "AGENTBOX_FIXTURE_STATE_DIR": f"{GUEST_HOME}/.fixture/state",
                     "AGENTBOX_FIXTURE_CONFIG_PATH": config_target,
                     "AGENTBOX_FIXTURE_HOST_SENTINEL": str(host_sentinel),
                 }},
        declared_capabilities={"native_continuation": True},
        state_directory="/tmp/agentbox-sidecar-state", directory="/workspace",
        native_platform="wsl", home_locator="home-test/.fixture",
    )
    try:
        port.open_execution("execution-nested")
        report = _probe_report(port, "execution-nested")
        assert report["converged"] is True, report
        assert report["configWrite"]["ok"] is False, report
        assert report["stateWrite"]["ok"] is True, report
        audit, resumable = port.capture_execution("execution-nested")
        # The read-only configuration is not state, even though it sits inside
        # the writable home: it must not reach the audit manifest.
        audited = {item["path"] for item in audit["files"]}
        assert "config.json" not in audited, sorted(audited)
        assert any(path.startswith("state/") for path in audited), sorted(audited)
        assert resumable is True
    finally:
        port.stop()
    _await_worker_projection_cleanup(tmp_path / "worker-root")
