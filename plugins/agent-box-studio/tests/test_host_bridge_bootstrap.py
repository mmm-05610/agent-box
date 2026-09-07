"""C2.1 sidecar bootstrap boundary tests."""
from __future__ import annotations

import io
import json
import socket
import struct
import threading

import pytest

from agent_box_studio.host_bridge import (
    BridgeBootstrapError,
    HostBridgeClient,
    HostBridgeBootstrap,
    read_host_bridge_bootstrap,
)


def _frame(payload: dict[str, object]) -> bytes:
    encoded = json.dumps(payload, separators=(",", ":")).encode()
    return struct.pack(">I", len(encoded)) + encoded


def test_sidecar_reads_one_bounded_loopback_bootstrap_from_stdin():
    bootstrap = read_host_bridge_bootstrap(
        io.BytesIO(
            _frame(
                {
                    "endpoint": "http://127.0.0.1:43127",
                    "capability": "capability-in-memory",
                    "protocol": "V1",
                }
            )
        )
    )

    assert bootstrap == HostBridgeBootstrap(
        endpoint="http://127.0.0.1:43127",
        capability="capability-in-memory",
        protocol="V1",
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"endpoint": "http://10.0.0.1:1", "capability": "cap", "protocol": "V1"},
        {"endpoint": "http://127.0.0.1:1", "capability": "cap\n", "protocol": "V1"},
        {"endpoint": "http://127.0.0.1:1", "capability": "cap", "protocol": "V2"},
    ],
)
def test_sidecar_bootstrap_rejects_non_loopback_or_invalid_protocol(payload):
    with pytest.raises(BridgeBootstrapError):
        read_host_bridge_bootstrap(io.BytesIO(_frame(payload)))


def test_sidecar_bootstrap_rejects_oversized_frame_before_reading_body():
    stream = io.BytesIO(struct.pack(">I", 4097) + b"x")
    with pytest.raises(BridgeBootstrapError):
        read_host_bridge_bootstrap(stream)
    assert stream.tell() == 4


def test_client_sends_exact_connection_resolve_and_validates_correlated_receipt():
    client_socket, server_socket = socket.socketpair()
    endpoint = "http://127.0.0.1:1"
    observed: dict[str, object] = {}

    def serve_once() -> None:
        with server_socket:
            connection = server_socket
            header = _recv_exact(connection, 4)
            body = _recv_exact(connection, struct.unpack(">I", header)[0])
            observed.update(json.loads(body))
            response = {
                "protocol": "V1",
                "requestId": observed["requestId"],
                "body": {
                    "status": "connectionResolved",
                    "connectionId": "conn-wsl-1",
                    "revision": 7,
                    "fingerprint": "sha256:" + "a" * 64,
                    "distribution": "Ubuntu",
                    "user": "dev",
                    "os": "Linux",
                    "arch": "x86_64",
                    "projectRoot": "/home/dev/project",
                    "capabilities": ["worker.bootstrap@1"],
                },
            }
            connection.sendall(_frame(response))

    thread = threading.Thread(target=serve_once)
    thread.start()
    try:
        receipt = HostBridgeClient(
            HostBridgeBootstrap(endpoint, "capability-in-memory", "V1"),
            connector=lambda _address, **_kwargs: client_socket,
        ).resolve_connection(
            "conn-wsl-1", 7, "project-identity-digest"
        )
    finally:
        thread.join(timeout=2)
        client_socket.close()

    assert observed["operation"]["operation"] == "connectionResolve"
    assert observed["operation"]["connectionId"] == "conn-wsl-1"
    assert observed["operation"]["revision"] == 7
    assert observed["operation"]["projectIdentity"] == "project-identity-digest"
    assert receipt.connection_id == "conn-wsl-1"
    assert receipt.revision == 7


def test_client_rejects_a_response_with_the_wrong_request_id():
    client_socket, server_socket = socket.socketpair()

    def serve_once() -> None:
        with server_socket:
            connection = server_socket
            header = _recv_exact(connection, 4)
            _recv_exact(connection, struct.unpack(">I", header)[0])
            connection.sendall(_frame({"protocol": "V1", "requestId": "other", "body": {"status": "accepted"}}))

    thread = threading.Thread(target=serve_once)
    thread.start()
    try:
        with pytest.raises(BridgeBootstrapError, match="response"):
            HostBridgeClient(
                HostBridgeBootstrap("http://127.0.0.1:1", "capability-in-memory", "V1"),
                connector=lambda _address, **_kwargs: client_socket,
            ).resolve_connection("conn-wsl-1", 7, "project-identity-digest")
    finally:
        thread.join(timeout=2)
        client_socket.close()


def _recv_exact(connection: socket.socket, length: int) -> bytes:
    data = bytearray()
    while len(data) < length:
        chunk = connection.recv(length - len(data))
        if not chunk:
            raise AssertionError("fixture socket closed before frame completed")
        data.extend(chunk)
    return bytes(data)


# ---------------------------------------------------------------------------
# C2.2 typed submit: the closed Rust wire mirror
# ---------------------------------------------------------------------------
#
# These shapes are the exact serde JSON of the Rust authority
# (src-tauri/src/host_bridge.rs): `HostBridgeRequest{protocol, requestId,
# deadlineMs, scope{connectionId, projectIdentity, workRef, executionRef,
# attemptId}, operation{operation, ..}, capability}` and
# `HostBridgeResponse{protocol, requestId, body{status, ..}}`.  Python
# submits only the closed host-owned operation set; it never invents an
# operation, a field or a parallel transport.


from agent_box_studio.host_bridge import (
    BridgeOperationRejected,
    HostBridgeOperation,
    HostBridgeOperationScope,
)


class WireBridge(threading.Thread):
    """One-request wire bridge speaking the exact Rust serde shapes."""

    def __init__(self, response_body: dict[str, object], observed: dict[str, object]):
        super().__init__(daemon=True)
        self.response_body = response_body
        self.observed = observed
        self.client_socket, server_socket = socket.socketpair()
        self._server_socket = server_socket
        # Started last: run() reads self._server_socket immediately.
        self.start()

    def run(self) -> None:
        with self._server_socket:
            connection = self._server_socket
            header = _recv_exact(connection, 4)
            body = _recv_exact(connection, struct.unpack(">I", header)[0])
            self.observed.update(json.loads(body))
            response = {
                "protocol": "V1",
                "requestId": self.observed.get("requestId", ""),
                "body": self.response_body,
            }
            connection.sendall(_frame(response))

    def join_and_close(self) -> None:
        self.join(timeout=2)
        self.client_socket.close()


def _submit(bridge: WireBridge, operation, scope, *, timeout_ms: int = 5000):
    try:
        return HostBridgeClient(
            HostBridgeBootstrap("http://127.0.0.1:1", "capability-in-memory", "V1"),
            timeout_ms=timeout_ms,
            connector=lambda _address, **_kwargs: bridge.client_socket,
        ).submit(operation, scope)
    finally:
        bridge.join_and_close()


def test_submit_worker_ensure_sends_the_exact_rust_wire_operation():
    observed: dict[str, object] = {}
    bridge = WireBridge({"status": "accepted"}, observed)

    result = _submit(
        bridge,
        HostBridgeOperation.worker_ensure(),
        HostBridgeOperationScope("conn-wsl-1", "project-identity-digest"),
        timeout_ms=42_000,
    )

    assert observed["protocol"] == "V1"
    assert observed["capability"] == "capability-in-memory"
    assert observed["deadlineMs"] == 42_000
    assert observed["scope"] == {
        "connectionId": "conn-wsl-1",
        "projectIdentity": "project-identity-digest",
    }
    assert observed["operation"] == {"operation": "workerEnsure"}
    assert result.status == "accepted"


def test_submit_events_read_carries_the_exact_rust_numeric_fields():
    observed: dict[str, object] = {}
    bridge = WireBridge({"status": "accepted"}, observed)

    result = _submit(
        bridge,
        HostBridgeOperation.events_read(after_sequence=5, max_events=64),
        HostBridgeOperationScope("conn-wsl-1", "project-identity-digest"),
    )

    assert observed["operation"] == {
        "operation": "eventsRead",
        "afterSequence": 5,
        "maxEvents": 64,
    }
    assert result.status == "accepted"


def test_submit_process_spawn_requires_the_full_execution_scope_before_the_wire():
    observed: dict[str, object] = {}
    bridge = WireBridge({"status": "accepted"}, observed)
    try:
        with pytest.raises(BridgeBootstrapError, match="scope"):
            HostBridgeClient(
                HostBridgeBootstrap("http://127.0.0.1:1", "capability-in-memory", "V1"),
                connector=lambda _address, **_kwargs: bridge.client_socket,
            ).submit(
                HostBridgeOperation.process_spawn(process_id=3),
                HostBridgeOperationScope("conn-wsl-1", "project-identity-digest"),
            )
        # The host never received an insufficiently scoped request.
        assert observed == {}
    finally:
        bridge.join_and_close()


def test_submit_process_spawn_carries_the_full_execution_scope():
    observed: dict[str, object] = {}
    bridge = WireBridge({"status": "accepted"}, observed)

    result = _submit(
        bridge,
        HostBridgeOperation.process_spawn(process_id=3),
        HostBridgeOperationScope(
            "conn-wsl-1",
            "project-identity-digest",
            work_ref="work-9",
            execution_ref="exec-9",
            attempt_id="attempt-9",
        ),
    )

    assert observed["scope"] == {
        "connectionId": "conn-wsl-1",
        "projectIdentity": "project-identity-digest",
        "workRef": "work-9",
        "executionRef": "exec-9",
        "attemptId": "attempt-9",
    }
    assert observed["operation"] == {"operation": "processSpawn", "processId": 3}
    assert result.status == "accepted"


def test_submit_surfaces_the_host_error_code_as_a_typed_rejection():
    observed: dict[str, object] = {}
    bridge = WireBridge({"status": "error", "code": "INVALID_OPERATION"}, observed)

    with pytest.raises(BridgeOperationRejected) as excinfo:
        _submit(
            bridge,
            HostBridgeOperation.worker_inspect(),
            HostBridgeOperationScope("conn-wsl-1", "project-identity-digest"),
        )

    assert excinfo.value.code == "INVALID_OPERATION"


def test_submit_connection_resolve_matches_the_rust_receipt_wire_exactly():
    observed: dict[str, object] = {}
    bridge = WireBridge(
        {
            "status": "connectionResolved",
            "connectionId": "conn-wsl-1",
            "revision": 7,
            "fingerprint": "sha256:" + "a" * 64,
            "distribution": "Ubuntu",
            "user": "dev",
            "os": "Linux",
            "arch": "x86_64",
            "projectRoot": "/home/dev/project",
            "capabilities": ["worker_bootstrap"],
        },
        observed,
    )

    result = _submit(
        bridge,
        HostBridgeOperation.connection_resolve("conn-wsl-1", 7, "project-identity-digest"),
        HostBridgeOperationScope("conn-wsl-1", "project-identity-digest"),
    )

    assert observed["operation"] == {
        "operation": "connectionResolve",
        "connectionId": "conn-wsl-1",
        "revision": 7,
        "projectIdentity": "project-identity-digest",
    }
    receipt = result.connection
    assert receipt is not None
    assert receipt.connection_id == "conn-wsl-1"
    assert receipt.revision == 7
    assert receipt.project_root == "/home/dev/project"


@pytest.mark.parametrize(
    "make_operation",
    [
        lambda: HostBridgeOperation.process_spawn(process_id=0),
        lambda: HostBridgeOperation.channel_open(channel_id=0),
        lambda: HostBridgeOperation.view_put_chunk(chunk_index=1, digest="bad\ndigest"),
        lambda: HostBridgeOperation.events_read(after_sequence=0, max_events=0),
        lambda: HostBridgeOperation.connection_resolve("conn-wsl-1", 0, "project-identity-digest"),
    ],
)
def test_submit_rejects_operations_the_host_would_reject(make_operation):
    observed: dict[str, object] = {}
    bridge = WireBridge({"status": "accepted"}, observed)
    try:
        with pytest.raises(BridgeBootstrapError):
            # Construction itself mirrors the host's `HostBridgeRequest::new`:
            # an operation the host enum would reject never becomes a request.
            operation = make_operation()
            HostBridgeClient(
                HostBridgeBootstrap("http://127.0.0.1:1", "capability-in-memory", "V1"),
                connector=lambda _address, **_kwargs: bridge.client_socket,
            ).submit(
                operation,
                HostBridgeOperationScope("conn-wsl-1", "project-identity-digest"),
            )
        assert observed == {}
    finally:
        bridge.join_and_close()


def test_submit_rejects_a_connection_resolve_scope_mismatch_before_the_wire():
    observed: dict[str, object] = {}
    bridge = WireBridge({"status": "accepted"}, observed)
    try:
        with pytest.raises(BridgeBootstrapError, match="scope"):
            HostBridgeClient(
                HostBridgeBootstrap("http://127.0.0.1:1", "capability-in-memory", "V1"),
                connector=lambda _address, **_kwargs: bridge.client_socket,
            ).submit(
                HostBridgeOperation.connection_resolve("conn-other", 7, "project-identity-digest"),
                HostBridgeOperationScope("conn-wsl-1", "project-identity-digest"),
            )
        assert observed == {}
    finally:
        bridge.join_and_close()
