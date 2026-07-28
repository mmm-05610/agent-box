"""SQLite-backed database for agent-box.

Data file: ``$AGENT_BOX_HOME/agent-box.db``.
Connection is a module-level singleton guarded by ``threading.Lock``.

Schema is managed via numbered migration files in ``migrations/``.
The ``schema_versions`` table tracks which migrations have already run,
so adding a column or index in a new migration file is applied on next
startup without touching existing tables.
"""
from __future__ import annotations

import re
import sqlite3
import threading
from pathlib import Path

from .. import config


# Module-level connection + lock. See module docstring.
_conn: sqlite3.Connection | None = None
_lock = threading.Lock()


def _run_migrations(conn: sqlite3.Connection) -> None:
    """Ensure the database schema is up to date.

    Creates the ``schema_versions`` tracking table (idempotent), then
    scans ``migrations/`` for numbered ``*.sql`` files and executes any
    whose version number exceeds the current recorded version.
    """
    # Ensure the tracker table exists on first run
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_versions ("
        "    version INTEGER PRIMARY KEY,"
        "    applied_at TEXT NOT NULL DEFAULT (datetime('now'))"
        ")"
    )
    conn.commit()

    # Determine where we stopped
    current = conn.execute(
        "SELECT MAX(version) FROM schema_versions"
    ).fetchone()[0] or 0

    # Find and apply newer migrations
    migrations_dir = config.package_dir() / "migrations"
    if not migrations_dir.is_dir():
        return

    pattern = re.compile(r"^(\d{3})_.*\.sql$")
    files = sorted(
        f for f in migrations_dir.iterdir()
        if pattern.match(f.name) and int(pattern.match(f.name).group(1)) > current
    )

    for f in files:
        version = int(pattern.match(f.name).group(1))
        conn.executescript(f.read_text(encoding="utf-8"))
        conn.execute(
            "INSERT INTO schema_versions (version) VALUES (?)",
            (version,),
        )
        conn.commit()


def get_conn() -> sqlite3.Connection:
    """Return the module-level connection, creating it on first use.

    On first call: ensure ``$AGENT_BOX_HOME`` exists, open the
    database, set PRAGMAs, and run any pending migrations. Subsequent
    calls return the cached connection.
    """
    global _conn
    if _conn is None:
        with _lock:
            if _conn is None:
                home = config.agent_box_home()
                home.mkdir(parents=True, exist_ok=True)
                db_path = config.library_db()
                _conn = sqlite3.connect(str(db_path), timeout=10.0)
                _conn.row_factory = sqlite3.Row
                _conn.execute("PRAGMA journal_mode=WAL")
                _conn.execute("PRAGMA synchronous=NORMAL")
                _conn.execute("PRAGMA foreign_keys = ON")
                _run_migrations(_conn)
    return _conn


def _reset_connection_for_tests() -> None:
    """Close and drop the cached connection. Tests use this so the
    next call rebuilds against the current ``AGENT_BOX_HOME``."""
    global _conn
    with _lock:
        if _conn is not None:
            try:
                _conn.close()
            except sqlite3.Error:
                pass
        _conn = None


__all__ = ["get_conn", "_reset_connection_for_tests"]
