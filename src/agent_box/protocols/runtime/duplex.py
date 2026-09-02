"""Minimal, ACP-free duplex byte transport seam (Root protocol pack).

Precise gap recorded in REQUIRED_DECISIONS RD-4 / the ACP vertical: the
runtime carrier exposes raw stdio pipes post-spawn, but there is no typed
read/write contract for a live, incremental duplex session.  This module
adds only the typed seam — no implementation, no concurrency, no ACP
vocabulary.  Concrete pumps (threads over pipes, in-memory peers for tests)
are owned by drivers outside this pack.

The contract is structurally identical to the transport consumed by the
generic Agent Client Protocol engine (``agent_box_acp.transport``) by
design; neither package imports the other.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

__all__ = ["ByteDuplexTransport"]


@runtime_checkable
class ByteDuplexTransport(Protocol):
    """Bidirectional byte transport bound to an already-spawned process.

    A transport is bound by the driver AFTER the Runtime coordinator created
    the target (the Runtime remains the execution authority).  Implementations
    must be safe for concurrent write from the driver thread and a single
    background read pump; ``read_line`` blocks until one complete line is
    available or the stream reaches EOF (returning ``None`` at EOF).
    """

    def write(self, data: bytes) -> None:
        """Write one raw byte segment; never a shell string."""

    def read_line(self, max_bytes: int) -> bytes | None:
        """Read one newline-terminated line; ``None`` at EOF/closed."""

    def close(self) -> None:
        """Release the underlying pipes/peer; idempotent."""

    def closed(self) -> bool:
        """True once this transport is closed or at EOF."""