"""Default session-driver registration for the five official Harnesses.

Registration is Harness-owned and executed lazily (never at import time),
so a Root-only environment that never imports this package stays clean.
The generic ACP engine is never registered here — drivers are.
"""
from __future__ import annotations

from typing import Any

from . import SESSION_DRIVERS, register_session_driver
from .native import NativeSessionDriver

_NATIVE_IMPLEMENTATION_ID = "agent-box-harnesses.native@1"
_DRIVER_VERSION = "2.0.0a1"


def _native_factory(harness_type: str) -> Any:
    def factory(adapter: Any, definition: Any) -> NativeSessionDriver:
        return NativeSessionDriver(
            adapter,
            harness_type=harness_type,
            implementation_id=f"{_NATIVE_IMPLEMENTATION_ID}.{harness_type}",
            version=_DRIVER_VERSION,
        )

    return factory


def register_default_session_drivers() -> None:
    """Idempotent registration of the five native drivers + OpenCode ACP."""
    for harness_type in ("codex", "claude-code", "opencode", "hermes", "pi"):
        register_session_driver(harness_type, "exec", _native_factory(harness_type))
    from ..opencode.acp import opencode_acp_driver_factory

    register_session_driver("opencode", "acp", opencode_acp_driver_factory)


def ensure_session_drivers() -> None:
    if ("codex", "exec") not in SESSION_DRIVERS:
        register_default_session_drivers()


__all__ = ["ensure_session_drivers", "register_default_session_drivers"]