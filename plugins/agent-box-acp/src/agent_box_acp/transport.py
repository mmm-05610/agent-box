"""Bidirectional byte transports for the ACP stdio channel.

The protocol seam is deliberately tiny and Harness-neutral: ``write`` sends
raw bytes, ``read_line`` returns one complete line (or ``None`` at EOF).
Concrete transports: an in-memory peer (synthetic tests) and a pipe pump
over already-spawned subprocess stdio (the Runtime remains the spawn
authority; this module only moves bytes).
"""
from __future__ import annotations

import threading
from collections import deque
from typing import Any, Protocol, runtime_checkable

DEFAULT_LINE_QUEUE_CAPACITY = 256
DEFAULT_STDERR_TAIL_BYTES = 65536


@runtime_checkable
class DuplexByteTransport(Protocol):
    """Byte line transport bound to an already-spawned peer."""

    def write(self, data: bytes) -> None: ...
    def read_line(self, max_bytes: int) -> bytes | None: ...
    def close(self) -> None: ...
    def closed(self) -> bool: ...


class MemoryDuplexTransport:
    """Deterministic in-memory bidirectional peer for synthetic tests.

    Two independent line queues: engine writes land in the outbound queue
    (read by the scripted peer), ``feed_line`` delivers lines into the
    inbound queue (read by the engine pump).  ``read_line`` blocks until a
    line is available or the peer closes.
    """

    def __init__(self) -> None:
        self._inbound: deque[bytes] = deque()
        self._outbound: deque[bytes] = deque()
        self._cond = threading.Condition()
        self._closed = False

    # -- peer-side API (tests / fake agents) ------------------------------
    def feed_line(self, line: bytes) -> None:
        with self._cond:
            self._inbound.append(line if line.endswith(b"\n") else line + b"\n")
            self._cond.notify_all()

    def peer_read_line(self, timeout: float | None = None) -> bytes | None:
        """Read one engine-written line (blocks until available or closed)."""
        with self._cond:
            while not self._outbound and not self._closed:
                self._cond.wait(timeout=timeout)
            if not self._outbound:
                return None
            raw = self._outbound.popleft()
        return raw[:-1] if raw.endswith(b"\n") else raw

    def close(self) -> None:
        with self._cond:
            self._closed = True
            self._cond.notify_all()

    @property
    def outbound(self) -> tuple[bytes, ...]:
        with self._cond:
            return tuple(self._outbound)

    # -- engine-side transport --------------------------------------------
    def write(self, data: bytes) -> None:
        line = data[:-1] if data.endswith(b"\n") else data
        if b"\n" in line:
            raise ValueError("protocol lines must not embed a newline")
        with self._cond:
            if self._closed:
                raise RuntimeError("transport is closed")
            self._outbound.append(line)
            self._cond.notify_all()

    def read_line(self, max_bytes: int) -> bytes | None:
        with self._cond:
            while not self._inbound and not self._closed:
                self._cond.wait()
            if not self._inbound:
                return None
            raw = self._inbound.popleft()
        line = raw[:-1] if raw.endswith(b"\n") else raw
        if len(line) > max_bytes:
            line = line[:max_bytes]
        return line

    def closed(self) -> bool:
        with self._cond:
            return self._closed


class PipeDuplexTransport:
    """Thread-pumped duplex over already-spawned process stdio.

    Ownership: the Runtime coordinator created the process; this transport
    only reads/writes its pipes.  stdout is pumped into a bounded line queue
    (overflow drops the oldest bytes and records a diagnostic); stderr is
    drained continuously into a bounded tail buffer so the child never
    blocks on a full stderr pipe.
    """

    def __init__(
        self,
        stdin: Any,
        stdout: Any,
        stderr: Any = None,
        *,
        line_queue_capacity: int = DEFAULT_LINE_QUEUE_CAPACITY,
        stderr_tail_bytes: int = DEFAULT_STDERR_TAIL_BYTES,
        on_overflow: Any | None = None,
    ) -> None:
        # Carriers may expose text-mode streams; the pump always works on
        # the underlying binary buffer when present.
        self._stdin = getattr(stdin, "buffer", stdin)
        self._stdout = getattr(stdout, "buffer", stdout)
        self._stderr = getattr(stderr, "buffer", stderr) if stderr is not None else None
        self._lines: deque[bytes] = deque()
        self._cond = threading.Condition()
        self._closed = False
        self._overflow_callback = on_overflow
        self._stderr_tail = bytearray()
        self._stderr_bound = max(stderr_tail_bytes, 4096)
        self._readers: list[threading.Thread] = []
        if stdout is not None:
            thread = threading.Thread(target=self._pump_stdout, name="acp-stdout", daemon=True)
            thread.start()
            self._readers.append(thread)
        if stderr is not None:
            thread = threading.Thread(target=self._pump_stderr, name="acp-stderr", daemon=True)
            thread.start()
            self._readers.append(thread)

    def _pump_stdout(self) -> None:
        stream = self._stdout
        try:
            while True:
                line = stream.readline()
                if not line:
                    break
                if line.endswith(b"\n"):
                    line = line[:-1]
                if line.endswith(b"\r"):
                    line = line[:-1]
                with self._cond:
                    if len(self._lines) >= self._overflow_bound():
                        self._lines.popleft()
                        if self._overflow_callback is not None:
                            try:
                                self._overflow_callback("line_queue_overflow")
                            except Exception:
                                pass
                    self._lines.append(line)
                    self._cond.notify_all()
        except (OSError, ValueError):
            pass
        finally:
            with self._cond:
                self._closed = True
                self._cond.notify_all()

    def _overflow_bound(self) -> int:
        return max(1, DEFAULT_LINE_QUEUE_CAPACITY)

    def _pump_stderr(self) -> None:
        stream = self._stderr
        try:
            while True:
                chunk = stream.read(4096)
                if not chunk:
                    break
                self._stderr_tail.extend(chunk)
                if len(self._stderr_tail) > self._stderr_bound:
                    del self._stderr_tail[: len(self._stderr_tail) - self._stderr_bound]
        except (OSError, ValueError):
            pass

    def stderr_tail(self) -> bytes:
        return bytes(self._stderr_tail)

    def write(self, data: bytes) -> None:
        if self._closed:
            raise RuntimeError("transport is closed")
        self._stdin.write(data)
        self._stdin.flush()

    def read_line(self, max_bytes: int) -> bytes | None:
        with self._cond:
            while not self._lines and not self._closed:
                self._cond.wait()
            if not self._lines:
                return None
            line = self._lines.popleft()
        if len(line) > max_bytes:
            line = line[:max_bytes]
        return line

    def close(self) -> None:
        with self._cond:
            if self._closed:
                return
            self._closed = True
            self._cond.notify_all()
        try:
            self._stdin.close()
        except (OSError, ValueError):
            pass
        for thread in self._readers:
            thread.join(timeout=2.0)

    def closed(self) -> bool:
        with self._cond:
            return self._closed


__all__ = [
    "DEFAULT_LINE_QUEUE_CAPACITY",
    "DEFAULT_STDERR_TAIL_BYTES",
    "DuplexByteTransport",
    "MemoryDuplexTransport",
    "PipeDuplexTransport",
]