"""Native session driver: bounded post-exit drain semantics unchanged.

Keeps the existing native observation path (bounded stdout discharge after
process exit + staged documents) behind the same HarnessSessionDriver
boundary, so the four-state capability surface and the ObservationHub
pipeline apply to native mode without changing its semantics.
"""
from __future__ import annotations

from typing import Any, Mapping

from ..adapters.observation import MAX_EVENTS, Observation, ObservationKind, TerminalCondition
from .hub import HubPollResult, ObservationHub
from .permission import PermissionRequestState
from .spi import (
    PermissionView, SessionCapability, SessionDriverBindOptions,
    SessionDriverBinding, SessionDriverDescriptor,
)

_MAX_OUTPUT_CHARS = 1_000_000


class NativeSessionDriver:
    """Post-exit bounded drain driver; no live pump, no fabricated events."""

    protocol = "native"

    def __init__(self, adapter: Any, *, harness_type: str, implementation_id: str, version: str) -> None:
        self._adapter = adapter
        self._harness_type = harness_type
        self._impl_id = implementation_id
        self._version = version
        self._hub = ObservationHub()
        self._handle: Any = None
        self._binding: SessionDriverBinding | None = None
        self._last_seq = 0
        self._drained = False

    def descriptor(self) -> SessionDriverDescriptor:
        return SessionDriverDescriptor(
            self._impl_id, "native session driver", self._version,
            self._harness_type, "exec", self.protocol,
        )

    def capabilities(self) -> Mapping[str, SessionCapability]:
        return {
            "streaming": SessionCapability.UNAVAILABLE,
            "permission": SessionCapability.UNSUPPORTED,
            "cancel": SessionCapability.UNSUPPORTED,
            "session_continuation": SessionCapability.SUPPORTED,
            "terminal": SessionCapability.SUPPORTED,
            "filesystem_proxy": SessionCapability.UNSUPPORTED,
        }

    def bind(self, handle: object, *, options: SessionDriverBindOptions) -> SessionDriverBinding:
        self._handle = handle
        self._binding = SessionDriverBinding(
            session_locator=_extract_locator(handle),
            protocol_version="native",
            diagnostics=(),
        )
        return self._binding

    def _carrier(self) -> Any:
        runtime = getattr(self._handle, "runtime", None)
        transport = getattr(runtime, "transport", None) or getattr(self._handle, "transport", None)
        return transport

    def poll(self, timeout: float = 0.0) -> HubPollResult:
        if self._drained:
            result = self._hub.poll(self._last_seq)
            self._last_seq = result.latest_seq
            return result
        carrier = self._carrier()
        exit_code = None
        exited = False
        if carrier is not None:
            poll = getattr(carrier, "poll", None)
            if callable(poll):
                exit_code = poll()
                exited = exit_code is not None
        if not exited:
            return HubPollResult(entries=(), resync=False, latest_seq=self._hub.snapshot().seq, snapshot=None)
        observations, exit_code = self._drain_observations(exit_code)
        for observation in observations:
            self._hub.push(observation)
        terminal = self._adapter.terminal_observation(tuple(observations), exit_code=exit_code)
        if not self._hub.terminal_seen:
            self._hub.push(terminal)
        self._drained = True
        result = self._hub.poll(self._last_seq)
        self._last_seq = result.latest_seq
        return result

    def _drain_observations(self, exit_code: int | None) -> tuple[list[Observation], int | None]:
        """Bounded stdout discharge + staged artifacts (native semantics)."""
        observations: list[Observation] = []
        carrier = self._carrier()
        stream = getattr(carrier, "stdout", None)
        if stream is not None:
            try:
                text = stream.read(_MAX_OUTPUT_CHARS)
                if isinstance(text, bytes):
                    text = text.decode("utf-8", errors="replace")
                lines = tuple(text.splitlines())[:MAX_EVENTS]
                observations.extend(self._adapter.decode_native_events(lines))
            except (OSError, ValueError):
                observations = []
        plan = getattr(self._handle, "plan", None)
        observation_contract = getattr(plan, "observation", None)
        artifacts = getattr(observation_contract, "artifacts", ())
        staged_home = getattr(self._handle, "staged_home", None)
        for artifact in artifacts:
            if staged_home is None or not isinstance(artifact, str) or not artifact.startswith("/runtime/home/"):
                continue
            relative = artifact.removeprefix("/runtime/home/").removeprefix("/")
            target = getattr(staged_home, "root", None)
            if target is None:
                continue
            target = target / relative
            try:
                if target.is_symlink() or not target.is_file():
                    continue
                import json

                document = json.loads(target.read_text(encoding="utf-8")[:_MAX_OUTPUT_CHARS])
            except (OSError, ValueError):
                continue
            if isinstance(document, dict):
                observations.extend(self._adapter.decode_native_document(document))
        return observations, exit_code

    def session_locator(self) -> str | None:
        return self._binding.session_locator if self._binding else None

    def pending_permission(self) -> PermissionView | None:
        return None  # native headless mode has no transport permission channel

    def respond_permission(self, option_id: str) -> bool:
        raise AttributeError("native driver has no permission channel")

    def reject_permission(self) -> bool:
        raise AttributeError("native driver has no permission channel")

    def cancel(self) -> None:
        raise AttributeError("native driver has no live cancel channel")

    def close(self) -> None:
        return

    def terminal_state(self) -> TerminalCondition | None:
        condition = self._hub.snapshot().terminal_condition
        return TerminalCondition(condition) if condition is not None else None

    def diagnostics(self) -> Mapping[str, object]:
        return {
            "driver": self._impl_id,
            "mode": "native",
            "session_locator": self.session_locator(),
            "hub": {
                "seq": self._hub.snapshot().seq,
                "events": self._hub.snapshot().count,
                "terminal": self._hub.snapshot().terminal_condition,
            },
            "notes": ("NATIVE_BOUNDED_POST_EXIT_DRAIN", "NATIVE_LIVE_STREAM_UNAVAILABLE"),
        }


def _extract_locator(handle: Any) -> str | None:
    for holder in (handle, getattr(handle, "request", None), getattr(handle, "plan", None)):
        continuation = getattr(holder, "continuation", None)
        if continuation is not None:
            locator = getattr(continuation, "locator", None)
            if isinstance(locator, str) and locator.strip():
                return locator.strip()[:512]
    return None


__all__ = ["NativeSessionDriver", "_extract_locator"]