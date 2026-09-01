from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, Sequence
import hashlib
import json
import os
import secrets
import tempfile

from agent_box.protocols.runtime import (
    AttachDescriptor, CapabilitySet, CapabilityStatus, HostTransport,
    HostTransportOperation, IsolatedProcessSpec, TerminalAllocation,
    TerminalRunHandle, TerminalSessionRef, CompositionErrorCode,
    CompositionRejected, StartAmbiguous, digest,
)


class TerminalAdapterError(CompositionRejected):
    pass


def exact_ref(*, provider: str, native_id: str, affinity: str, payload: Mapping[str, object]) -> TerminalSessionRef:
    return TerminalSessionRef(provider, native_id, digest(payload), affinity, metadata={str(k): str(v) for k, v in payload.items()})


def _validate_attempt(spec: IsolatedProcessSpec, attempt_key: str) -> None:
    if spec.attempt_key != attempt_key:
        raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "attempt key differs from isolated spec")


class AttemptLedger:
    def __init__(self) -> None:
        self.handles: dict[str, TerminalRunHandle] = {}

    def prior(self, attempt_key: str) -> TerminalRunHandle | None:
        return self.handles.get(attempt_key)

    def remember(self, handle: TerminalRunHandle) -> TerminalRunHandle:
        self.handles[handle.attempt_key] = handle
        return handle


def submit_direct(transport: HostTransport, spec: IsolatedProcessSpec, attempt_key: str) -> str:
    """Submit the already typed operation; this is the direct carrier seam."""
    _validate_attempt(spec, attempt_key)
    if spec.local_argv is None:
        raise CompositionRejected(CompositionErrorCode.CAPABILITY_UNSUPPORTED, "direct stdio requires local argv carrier")
    argv = spec.carrier_argv or spec.local_argv
    operation = HostTransportOperation(
        attempt_key=attempt_key,
        spawn_token=spec.spawn_token,
        spec_digest=spec.spec_digest,
        transport_kind="local-stdio",
        sealed_payload=json.dumps({"argv": list(argv)}, separators=(",", ":")),
    )
    return transport.submit(operation)


def safe_token_file(argv: Sequence[str], *, directory: Path | None = None) -> Path:
    """Write an argv vector for the provider-owned bridge, never a shell program."""
    root = directory or Path(tempfile.gettempdir()) / "agent-box-terminal-session"
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = root / ("launch-" + secrets.token_hex(16) + ".json")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(path, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump({"argv": list(argv)}, stream, separators=(",", ":"))
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return path


def bridge_command(token_path: Path) -> str:
    # tmux's legacy command field is unavoidable at this native seam.  It is
    # fixed provider-owned executable; the O_EXCL token path is passed through
    # a provider-owned tmux environment slot, never interpolated into command.
    del token_path
    return "agent-box-terminal-session-bridge"


def attach_descriptor(kind: str, identity: str, locator: str, label: str) -> AttachDescriptor:
    return AttachDescriptor(kind, identity, locator, label, "session-scoped")
