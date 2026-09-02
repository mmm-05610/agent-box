"""Harness-owned canonical Observation envelope and Finish boundary.

Native Adapter code decodes native events into these canonical, bounded
values.  Adapters may only produce terminal Observations and Finish
proposals; the Host/upper policy layer decides whether Work Core Finish is
ever invoked.  A process exit is never treated as Finish.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping, Sequence

MAX_LINE_BYTES = 262144
MAX_TEXT_CHARS = 8192
MAX_NATIVE_KEYS = 64
MAX_NATIVE_DEPTH = 6
MAX_EVENTS = 4096


class ObservationKind(str, Enum):
    LIFECYCLE = "lifecycle"
    MESSAGE = "message"
    TOOL_REQUEST = "tool_request"
    TOOL_RESULT = "tool_result"
    PERMISSION_REQUEST = "permission_request"
    PERMISSION_RESULT = "permission_result"
    USAGE = "usage"
    SESSION = "session"
    TERMINAL = "terminal"
    UNKNOWN = "unknown"


class TerminalCondition(str, Enum):
    COMPLETED = "completed"
    TURN_COMPLETED = "turn_completed"
    FAILED = "failed"
    INTERRUPTED = "interrupted"
    PROCESS_EXIT = "process_exit"
    UNKNOWN = "unknown"


def bounded_native(schema: str, data: Any) -> "NativePayload":
    """Wrap a version-sensitive native payload as bounded, schema-tagged opaque."""
    if not isinstance(schema, str) or not schema or len(schema) > 128:
        raise ValueError("invalid native payload schema tag")
    clipped = _clip(data, depth=0)
    return NativePayload(schema=schema, data=clipped)


def _clip(value: Any, *, depth: int) -> Any:
    if depth > MAX_NATIVE_DEPTH:
        return "<clipped>"
    if isinstance(value, Mapping):
        items = list(value.items())[:MAX_NATIVE_KEYS]
        return {str(key)[:96]: _clip(item, depth=depth + 1) for key, item in items}
    if isinstance(value, (list, tuple)):
        return [_clip(item, depth=depth + 1) for item in list(value)[:MAX_NATIVE_KEYS]]
    if isinstance(value, str):
        return value[:MAX_TEXT_CHARS]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:MAX_TEXT_CHARS]


@dataclass(frozen=True)
class NativePayload:
    """Bounded, schema-tagged opaque native event payload."""

    schema: str
    data: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.schema, str) or not self.schema:
            raise ValueError("native payload schema is required")
        object.__setattr__(self, "data", _clip(self.data, depth=0))


@dataclass(frozen=True)
class Observation:
    """One canonical Harness observation value."""

    kind: ObservationKind
    harness_type: str
    text: str = ""
    session_locator: str | None = None
    model: str | None = None
    usage: Mapping[str, float] | None = None
    tool_name: str | None = None
    terminal_condition: TerminalCondition | None = None
    is_error: bool = False
    native: NativePayload | None = None
    warnings: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.kind, ObservationKind):
            raise ValueError("invalid observation kind")
        if not self.harness_type or len(self.harness_type) > 128:
            raise ValueError("invalid observation harness_type")
        if len(self.text) > MAX_TEXT_CHARS:
            raise ValueError("observation text exceeds bounds")
        if self.session_locator is not None and (not self.session_locator or len(self.session_locator) > 256):
            raise ValueError("invalid observation session locator")
        if self.warnings and len(self.warnings) > 8:
            raise ValueError("too many observation warnings")
        if self.usage is not None:
            usage = dict(self.usage)
            if len(usage) > 32 or any(not isinstance(k, str) or not isinstance(v, (int, float)) for k, v in usage.items()):
                raise ValueError("invalid observation usage")
            object.__setattr__(self, "usage", usage)


@dataclass(frozen=True)
class FinishProposal:
    """Adapter-produced proposal; the Host decides whether Finish happens."""

    execution_id: str
    dispatch_id: str
    harness_type: str
    terminal: Observation
    exit_code: int | None = None
    decision_owner: str = "host"

    def __post_init__(self) -> None:
        for name in ("execution_id", "dispatch_id", "harness_type"):
            value = getattr(self, name)
            if not isinstance(value, str) or not value or len(value) > 256:
                raise ValueError(f"invalid finish proposal {name}")
        if self.terminal.kind is not ObservationKind.TERMINAL:
            raise ValueError("finish proposal requires a terminal observation")
        if self.exit_code is not None and (not isinstance(self.exit_code, int) or not -255 <= self.exit_code <= 255):
            raise ValueError("invalid finish proposal exit code")

    @property
    def digest(self) -> str:
        from agent_box.protocols.runtime.protocol import digest

        return digest({
            "execution_id": self.execution_id,
            "dispatch_id": self.dispatch_id,
            "harness_type": self.harness_type,
            "terminal": {
                "condition": self.terminal.terminal_condition.value if self.terminal.terminal_condition else None,
                "session_locator": self.terminal.session_locator,
                "is_error": self.terminal.is_error,
            },
            "exit_code": self.exit_code,
            "decision_owner": self.decision_owner,
        })


class NativeObservationDecoder:
    """Base helper for bounded native-event decoding; no I/O, no side effects."""

    id: str = "opaque"
    harness_type: str = ""

    def decode_stream(self, lines: Sequence[str]) -> tuple[Observation, ...]:
        events: list[Observation] = []
        for line in list(lines)[:MAX_EVENTS]:
            try:
                events.extend(self.decode_line(line))
            except ValueError as exc:
                events.append(Observation(
                    ObservationKind.UNKNOWN, self.harness_type,
                    warnings=(f"DECODER_REJECTED_LINE:{exc}",),
                ))
        return tuple(events)

    def decode_line(self, line: str) -> tuple[Observation, ...]:
        raise NotImplementedError

    def decode_document(self, payload: Mapping[str, Any]) -> tuple[Observation, ...]:
        raise NotImplementedError

    # shared helpers -------------------------------------------------------
    @staticmethod
    def parse_line(line: str) -> Mapping[str, Any]:
        if len(line.encode()) > MAX_LINE_BYTES:
            raise ValueError("NATIVE_LINE_TOO_LARGE")
        try:
            payload = json.loads(line)
        except ValueError as exc:
            raise ValueError("MALFORMED_NATIVE_EVENT") from exc
        if not isinstance(payload, dict):
            raise ValueError("MALFORMED_NATIVE_EVENT")
        return payload

    @staticmethod
    def unknown_event(harness_type: str, event_type: str, payload: Mapping[str, Any]) -> Observation:
        return Observation(
            ObservationKind.UNKNOWN, harness_type,
            native=bounded_native(f"{harness_type}.unknown-event@1", {"type": event_type, "body": dict(payload)}),
            warnings=("UNKNOWN_NATIVE_EVENT",),
        )


__all__ = [
    "FinishProposal",
    "NativeObservationDecoder",
    "NativePayload",
    "Observation",
    "ObservationKind",
    "TerminalCondition",
    "bounded_native",
]
