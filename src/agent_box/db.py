"""SQLite-backed library database (CLI side).

Stores providers, prompts, profiles, sessions, mcp/skills, and proxy
state at ``$AGENT_BOX_HOME/agent-box.db`` (see
:func:`agent_box.config.library_db`).

Module-level connection guarded by ``threading.Lock`` — same pattern
as :mod:`agent_box.sessions`. The CLI is single-threaded per process,
so we don't need ``check_same_thread=False``; the lock is here for
defensive correctness (future async use) and to serialize writes.

First call to :func:`get_conn` runs ``schema.sql`` (``CREATE TABLE IF
NOT EXISTS`` for all 19 tables + 9 indexes). No migration logic — v1
is a fresh install, no legacy DB to migrate.
"""
from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Optional

from . import config


# Module-level connection + lock. See module docstring.
_conn: Optional[sqlite3.Connection] = None
_lock = threading.Lock()


_SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def _read_schema() -> str:
    return _SCHEMA_PATH.read_text(encoding="utf-8")


def get_conn() -> sqlite3.Connection:
    """Return the module-level connection, creating it on first use.

    On first call: ensure ``$AGENT_BOX_HOME`` exists, open
    ``agent-box.db``, set WAL + synchronous=NORMAL, and run
    ``schema.sql`` to create all tables and indexes. Subsequent
    calls return the cached connection.
    """
    global _conn
    if _conn is None:
        with _lock:
            if _conn is None:  # double-check inside the lock
                home = config.agent_box_home()
                home.mkdir(parents=True, exist_ok=True)
                db_path = config.library_db()
                _conn = sqlite3.connect(str(db_path), timeout=10.0)
                _conn.row_factory = sqlite3.Row
                _conn.execute("PRAGMA journal_mode=WAL")
                _conn.execute("PRAGMA synchronous=NORMAL")
                # Enable FK enforcement so ON DELETE CASCADE works
                # (default is OFF in SQLite, which silently no-ops FK clauses).
                _conn.execute("PRAGMA foreign_keys = ON")
                _conn.executescript(_read_schema())
                _conn.commit()
    return _conn


def _reset_connection_for_tests() -> None:
    """Close and drop the cached connection. Tests use this so the
    next call rebuilds against the current ``AGENT_BOX_HOME``."""
    global _conn
    with _lock:
        if _conn is not None:
            try:
                _conn.close()
            except Exception:
                pass
        _conn = None


__all__ = ["get_conn"]
