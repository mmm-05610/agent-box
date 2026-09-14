"""The Worker lease must be kept alive for the whole interactive attempt.

The Worker cancels every running attempt whose client went quiet past
``leaseMs`` (production default 5000 ms). Only ``wait_terminal`` used to send
heartbeats, and a sidecar prompt never enters it - so an adapter that produced
no output for longer than the lease was killed mid-turn. These tests pin the
production behaviour at the seam that owns it: the channel that holds the
Worker client, not each Harness gate.

Nothing here overrides the lease: the point is that the *production default*
survives a prompt that is quiet for longer than it.
"""
from __future__ import annotations

import hashlib
import os
import pathlib
import shutil
import threading
import time

import pytest

from agent_box.server.execution.sidecar import (
    SidecarHarnessPort,
    WslSidecarLauncher,
    sidecar_bundle_files,
)
from agent_box_runtime_wsl import WorkerClient, WorkerError


REPO = pathlib.Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
WORKER = REPO / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker"
PEER = "plugins/agent-box-harnesses/tests/harness_remote/fake_acp_peer.mjs"
#: Longer than the production lease on purpose: the turn must not need the
#: silence to be shortened, nor the lease to be raised.
SILENCE_MS = 8_000
PRODUCTION_LEASE_MS = 5_000


def require_worker() -> None:
    if not WORKER.is_file() or not shutil.which("bwrap"):
        pytest.skip("current Worker and bwrap are required")


class RealConnector:
    """The production construction: no lease override anywhere."""

    def __init__(self, root: pathlib.Path, client_factory=None) -> None:
        self.root = root
        self.client_factory = client_factory

    def client_for_workspace(self, **arguments):
        command = [str(WORKER), "--root", str(self.root / "worker-root"),
                   "--workspace", str(REPO)]
        factory = self.client_factory or WorkerClient
        return factory(
            command,
            worker_digest="sha256:" + hashlib.sha256(WORKER.read_bytes()).hexdigest(),
            worker_version="0.1.0", connection_id=arguments["connection_id"],
            project_id=arguments["connection_id"], effective_user=os.environ["USER"],
            server_instance_id="server-lease-gate",
            executable_authorizations=arguments.get("executable_authorizations", ()),
        )


def open_port(tmp_path: pathlib.Path, *, client_factory=None, observed=None):
    launcher = WslSidecarLauncher(
        RealConnector(tmp_path, client_factory),
        workspace={
            "distribution": "Ubuntu", "remote_user": os.environ["USER"],
            "connection_id": "connection-lease", "remote_path": str(REPO),
        },
        bundle=sidecar_bundle_files(PLUGIN), timeout_ms=60_000,
    )
    port = SidecarHarnessPort(
        launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="pi",
        adapter={
            "command": "/usr/bin/node", "args": [f"/workspace/{PEER}"],
            # The only test-only declaration: how long the fixture stays quiet.
            "environment": {"AGENTBOX_FIXTURE_SILENCE_MS": str(SILENCE_MS)},
        },
        state_directory="/tmp/agentbox-sidecar-state", directory="/workspace",
        on_event=(
            (lambda execution_id, kind, payload: observed.append((execution_id, kind, payload)))
            if observed is not None else (lambda *_: None)
        ),
    )
    return port


def await_worker_projection_cleanup(root: pathlib.Path, *, timeout: float = 20.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not (root / "views").exists() and not (root / "secrets").exists():
            return
        time.sleep(0.1)
    raise AssertionError("the Worker kept its projection after the turn")


def test_the_production_default_lease_is_five_seconds():
    """The fix must not move the lease; production really uses the default."""
    client = RealConnector(pathlib.Path("/tmp")).client_for_workspace(connection_id="c")
    assert client.lease_ms == PRODUCTION_LEASE_MS, client.lease_ms
    # Neither the launcher nor the port may take (or pass on) a lease override.
    for candidate in (WslSidecarLauncher.__init__, SidecarHarnessPort.__init__):
        assert not any("lease" in name for name in candidate.__code__.co_varnames), candidate


def test_a_prompt_quiet_past_the_lease_still_finishes(tmp_path):
    """8 seconds of silence on a 5 second lease must still complete."""
    require_worker()
    observed: list[tuple[str, str, dict]] = []
    port = open_port(tmp_path, observed=observed)
    try:
        native = port.open_execution("execution-quiet")
        assert native
        started = time.monotonic()
        result = port.prompt("execution-quiet", "silent-success")
        elapsed = time.monotonic() - started
        assert result is not None
        assert elapsed >= SILENCE_MS / 1000, f"the prompt was not actually quiet: {elapsed:.2f}s"
        assert any(
            kind == "message.delta" and payload["text"] == "controlled stream"
            for _execution, kind, payload in observed
        ), observed
        assert not any(kind == "failed" for _execution, kind, _payload in observed), observed
    finally:
        port.stop()
    await_worker_projection_cleanup(tmp_path / "worker-root")


def test_the_turn_leaves_no_lease_thread_behind(tmp_path):
    """A finished attempt must not leave a keepalive thread or timer running."""
    require_worker()
    before = {thread.ident for thread in threading.enumerate()}
    port = open_port(tmp_path)
    try:
        port.open_execution("execution-threads")
        port.prompt("execution-threads", "silent-success")
    finally:
        port.stop()
    await_worker_projection_cleanup(tmp_path / "worker-root")
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        leaked = [
            thread for thread in threading.enumerate()
            if thread.ident not in before and thread.is_alive()
        ]
        if not leaked:
            return
        time.sleep(0.1)
    raise AssertionError(f"threads survived the turn: {[thread.name for thread in leaked]}")


class HeartbeatFailingClient(WorkerClient):
    """Injects a typed heartbeat failure, on demand, into the live attempt."""

    def __init__(self, *arguments, **keywords) -> None:
        super().__init__(*arguments, **keywords)
        self.fail_heartbeats = False

    def request(self, op, arguments=None, **keywords):
        if op == "heartbeat" and self.fail_heartbeats:
            raise WorkerError("WORKER_LEASE_HEARTBEAT_FAILED", "injected heartbeat failure")
        return super().request(op, arguments, **keywords)


def test_a_failing_heartbeat_fails_the_turn_with_its_code(tmp_path):
    """A broken keepalive must surface typed instead of hanging the prompt."""
    require_worker()
    clients: list[HeartbeatFailingClient] = []

    def factory(*arguments, **keywords):
        client = HeartbeatFailingClient(*arguments, **keywords)
        clients.append(client)
        return client

    port = open_port(tmp_path, client_factory=factory)
    try:
        port.open_execution("execution-heartbeat")
        clients[0].fail_heartbeats = True
        started = time.monotonic()
        with pytest.raises(Exception) as refused:
            port.prompt("execution-heartbeat", "silent-success")
        elapsed = time.monotonic() - started
        assert elapsed < SILENCE_MS / 1000, (
            f"the prompt waited for the fixture instead of failing on the keepalive: {elapsed:.2f}s")
        assert "WORKER_LEASE_HEARTBEAT_FAILED" in str(refused.value), refused.value
    finally:
        for client in clients:
            client.fail_heartbeats = False
        port.stop()
    await_worker_projection_cleanup(tmp_path / "worker-root")


def test_cancel_is_not_starved_by_the_keepalive(tmp_path):
    """A stop must land promptly while the adapter is silent."""
    require_worker()
    port = open_port(tmp_path)
    try:
        port.open_execution("execution-cancel")
        prompt_thread = threading.Thread(
            target=lambda: port.prompt("execution-cancel", "silent-success"), daemon=True,
        )
        prompt_thread.start()
        time.sleep(1.0)
        started = time.monotonic()
        cancelled = port.cancel("execution-cancel")
        elapsed = time.monotonic() - started
        assert cancelled is True, "the stop was refused while the adapter was silent"
        assert elapsed < 3.0, f"the stop waited behind the keepalive: {elapsed:.2f}s"
    finally:
        port.stop()
    await_worker_projection_cleanup(tmp_path / "worker-root")
