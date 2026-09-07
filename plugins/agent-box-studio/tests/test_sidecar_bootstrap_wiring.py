"""C2.2 ``--sidecar`` production wiring: bare client → HostBridgeHostAuthority.

The sidecar's ``host_operations`` must be the host authority the WSL
runtime/workspace providers consume (``resolve_connection``,
``transport_for_wsl``, ``resolve_runtime_ref``) — not the bare
``HostBridgeClient`` that lacks the attempt-transport seam.
"""
from __future__ import annotations

import io
import json
import struct

import pytest

from agent_box_studio.cli import sidecar_host_operations
from agent_box_studio.host_bridge import BridgeBootstrapError, HostBridgeHostAuthority


def _frame(payload: dict[str, object]) -> bytes:
    encoded = json.dumps(payload, separators=(",", ":")).encode()
    return struct.pack(">I", len(encoded)) + encoded


def _bootstrap_frame() -> bytes:
    return _frame(
        {
            "endpoint": "http://127.0.0.1:43127",
            "capability": "capability-in-memory",
            "protocol": "V1",
        }
    )


def test_sidecar_host_operations_wraps_the_bare_client_in_the_host_authority():
    stream = io.BytesIO(_bootstrap_frame())

    host_operations = sidecar_host_operations(stream)

    assert isinstance(host_operations, HostBridgeHostAuthority)
    # The authority seam the WSL runtime/workspace providers consume:
    assert callable(host_operations.resolve_connection)
    assert callable(host_operations.transport_for_wsl)
    assert callable(host_operations.resolve_runtime_ref)
    # Exactly one bootstrap frame was consumed from the given stream.
    assert stream.tell() == len(_bootstrap_frame())


def test_sidecar_host_operations_reads_only_from_the_given_stream():
    # Fail closed on a truncated bootstrap: never fall back to another
    # source, and never hand back a usable authority.
    with pytest.raises(BridgeBootstrapError):
        sidecar_host_operations(io.BytesIO(b""))
