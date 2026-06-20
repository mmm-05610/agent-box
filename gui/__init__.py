"""agent-box Windows Desktop GUI (modular package).

Replaces the monolithic ``gui-redesign.py`` with a layered structure:

- ``app``        — entry point + ``AgentBoxApp`` orchestrator
- ``theme``      — color tokens (Slate Indigo, dark/light)
- ``tokens``     — typography, spacing, radii, component sizes
- ``state``      — SQLite session tracking
- ``wsl``        — WSL subprocess wrapper, path conversion, launch flow
- ``components`` — reusable CustomTkinter widgets (button, card, status…)
- ``pages``      — top-level views (home, profiles, sessions, …)

``gui-redesign.py`` is kept as a thin shim that re-exports ``main``.
"""
from __future__ import annotations

__all__ = ["main"]


def __getattr__(name: str):  # pragma: no cover — lazy import
    if name == "main":
        from .app import main as _main
        return _main
    raise AttributeError(f"module 'gui' has no attribute {name!r}")