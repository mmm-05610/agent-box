"""Protocol-neutral ObservationHub: seq allocation, bounded replay, snapshot.

A small per-session hub, not an event bus: one driver pushes canonical
Observations, one consumer polls with a monotonic seq cursor.  Seq
assignment and the event-log write happen under the same lock; the event
log is bounded by count and bytes; a cursor older than the retained window
falls back to a snapshot with an explicit resync diagnostic — it never
pretends the gap does not exist.

Guards: at most one terminal Observation per session, and each permission
request id may complete exactly once.  Event text/native payloads are
re-scanned for credential-shaped content at push time (fail closed).
"""
from __future__ import annotations

import re
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Sequence

from ..adapters.observation import Observation, ObservationKind, TerminalCondition

MAX_EVENTS = 128
MAX_EVENT_BYTES = 64 * 1024
MAX_REPLAY_COUNT = 128
MAX_REPLAY_BYTES = 128 * 1024

_CREDENTIAL_PATTERN = re.compile(
    r"(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,})"
)


@dataclass(frozen=True)
class HubObservation:
    """One canonical Observation with its monotonic seq."""

    seq: int
    observation: Observation


@dataclass(frozen=True)
class HubSnapshot:
    seq: int
    count: int
    kinds: tuple[str, ...] = ()
    terminal_condition: str | None = None
    permission_open: int = 0


@dataclass(frozen=True)
class HubPollResult:
    entries: tuple[HubObservation, ...] = ()
    resync: bool = False
    latest_seq: int = 0
    snapshot: HubSnapshot | None = None
    diagnostics: tuple[str, ...] = ()

    @property
    def observations(self) -> tuple[Observation, ...]:
        return tuple(item.observation for item in self.entries)


class ObservationHub:
    """Bounded, seq-ordered canonical Observation log for one session."""

    def __init__(
        self,
        *,
        max_events: int = MAX_EVENTS,
        max_bytes: int = MAX_EVENT_BYTES,
        secret_check: Callable[[Observation], tuple[str, ...]] | None = None,
    ) -> None:
        self._lock = threading.Lock()
        self._entries: deque[HubObservation] = deque()
        self._bytes = 0
        self._seq = 0
        self._max_events = max_events
        self._max_bytes = max_bytes
        self._terminal_seen = False
        self._terminal_condition: str | None = None
        self._answered_permissions: set[str] = set()
        self._open_permissions: set[str] = set()
        self._diagnostics: deque[str] = deque(maxlen=64)
        self._secret_check = secret_check
        self._created_at = time.monotonic()

    # ------------------------------------------------------------------ #
    # push side (driver thread)
    # ------------------------------------------------------------------ #
    def push(self, observation: Observation, *, permission_request_id: str | None = None) -> HubObservation | None:
        """Assign the next seq and write the event at the same sync boundary.

        Returns ``None`` when the event is rejected (duplicate terminal,
        secret-shaped content, or bounds); the caller surfaces a diagnostic.
        """
        if not isinstance(observation, Observation):
            raise ValueError("hub accepts canonical Observations only")
        if observation.kind is ObservationKind.TERMINAL and self._terminal_seen:
            self._record("TERMINAL_DUPLICATE_REJECTED")
            return None
        if observation.kind is ObservationKind.PERMISSION_RESULT and permission_request_id and                 permission_request_id in self._answered_permissions:
            self._record("PERMISSION_DUPLICATE_REJECTED")
            return None
        scan = self._secret_check(observation) if self._secret_check is not None else _default_secret_check(observation)
        if scan:
            self._record("SECRET_SHAPED_OBSERVATION_REJECTED:" + ",".join(scan[:4]))
            return None
        size = _estimate_bytes(observation)
        with self._lock:
            if self._terminal_seen and observation.kind is ObservationKind.TERMINAL:
                self._record_locked("TERMINAL_DUPLICATE_REJECTED")
                return None
            if observation.kind is ObservationKind.PERMISSION_RESULT and permission_request_id and permission_request_id in self._answered_permissions:
                self._record_locked("PERMISSION_DUPLICATE_REJECTED")
                return None
            if size > self._max_bytes:
                self._record_locked("EVENT_TOO_LARGE_REJECTED")
                return None
            while (len(self._entries) >= self._max_events or self._bytes + size > self._max_bytes) and self._entries:
                evicted = self._entries.popleft()
                self._bytes -= _estimate_bytes(evicted.observation)
                self._record_locked("RING_BUFFER_EVICTED")
            self._seq += 1
            entry = HubObservation(self._seq, observation)
            self._entries.append(entry)
            self._bytes += size
            if observation.kind is ObservationKind.TERMINAL:
                self._terminal_seen = True
                self._terminal_condition = (
                    observation.terminal_condition.value
                    if observation.terminal_condition is not None else "unknown"
                )
            if permission_request_id:
                self._open_permissions.discard(permission_request_id)
                self._answered_permissions.add(permission_request_id)
            return entry

    def register_permission_open(self, request_id: str) -> bool:
        """Record one in-flight permission; duplicate registration is rejected."""
        if not request_id or len(request_id) > 256:
            return False
        with self._lock:
            if request_id in self._answered_permissions or request_id in self._open_permissions:
                return False
            self._open_permissions.add(request_id)
            return True

    @property
    def terminal_seen(self) -> bool:
        with self._lock:
            return self._terminal_seen

    # ------------------------------------------------------------------ #
    # consume side (host thread)
    # ------------------------------------------------------------------ #
    def events_after(self, since_seq: int) -> tuple[HubObservation, ...] | None:
        """Replay entries after ``since_seq``; ``None`` = cursor fell out of the window."""
        with self._lock:
            if since_seq < 0 or since_seq > self._seq:
                return None
            start = self._seq - len(self._entries)
            if since_seq < start:
                return None
            return tuple(item for item in self._entries if item.seq > since_seq)[:MAX_REPLAY_COUNT]

    def poll(self, last_seq: int) -> HubPollResult:
        """Incremental poll: replay when the cursor is in-window, else resync snapshot."""
        entries = self.events_after(last_seq)
        if entries is None:
            snapshot = self.snapshot()
            return HubPollResult(
                entries=(), resync=True, latest_seq=snapshot.seq,
                snapshot=snapshot,
                diagnostics=("OBSERVATION_GAP_RESYNC",),
            )
        return HubPollResult(entries=entries, resync=False, latest_seq=self._seq, snapshot=None)

    def all(self) -> tuple[HubObservation, ...]:
        """Every retained entry (bounded by the ring window)."""
        with self._lock:
            return tuple(self._entries)

    def snapshot(self) -> HubSnapshot:
        with self._lock:
            return HubSnapshot(
                seq=self._seq,
                count=len(self._entries),
                kinds=tuple(sorted({item.observation.kind.value for item in self._entries})),
                terminal_condition=self._terminal_condition,
                permission_open=len(self._open_permissions),
            )

    def diagnostics(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(self._diagnostics)

    def _record(self, code: str) -> None:
        with self._lock:
            self._record_locked(code)

    def _record_locked(self, code: str) -> None:
        # Callers hold self._lock already (non-reentrant); never re-acquire.
        self._diagnostics.append(code[:256])


def _default_secret_check(observation: Observation) -> tuple[str, ...]:
    hits: list[str] = []
    if isinstance(observation.text, str) and _CREDENTIAL_PATTERN.search(observation.text):
        hits.append("TEXT")
    native = observation.native
    if native is not None:
        native_text = str(getattr(native, "schema", "")) + repr(getattr(native, "data", ""))
        if _CREDENTIAL_PATTERN.search(native_text):
            hits.append("NATIVE")
    return tuple(hits)


def _estimate_bytes(observation: Observation) -> int:
    size = len(observation.text) + len(observation.harness_type)
    if observation.native is not None:
        size += len(str(getattr(observation.native, "data", "")))
    if observation.warnings:
        size += sum(len(item) for item in observation.warnings)
    return size


__all__ = [
    "HubObservation",
    "HubPollResult",
    "HubSnapshot",
    "MAX_EVENTS",
    "MAX_EVENT_BYTES",
    "MAX_REPLAY_BYTES",
    "MAX_REPLAY_COUNT",
    "ObservationHub",
]