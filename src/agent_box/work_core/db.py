"""Durable Work Core SQLite persistence and historical migration runner."""
from __future__ import annotations

import re
import sqlite3
import threading

from .runtime import agent_box_home, database_path, migrations_dir

_conn: sqlite3.Connection | None = None
_lock = threading.RLock()
write_lock = _lock


def _run_migrations(conn: sqlite3.Connection) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))")
    conn.commit()
    current = conn.execute("SELECT MAX(version) FROM schema_versions").fetchone()[0] or 0
    pattern = re.compile(r"^(\d{3})_.*\.sql$")
    files = sorted((f for f in migrations_dir().iterdir() if pattern.match(f.name)), key=lambda f: f.name)
    for path in files:
        version = int(pattern.match(path.name).group(1))
        if version <= current:
            continue
        conn.executescript(path.read_text(encoding="utf-8"))
        conn.execute("INSERT INTO schema_versions (version) VALUES (?)", (version,))
        conn.commit()


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        with _lock:
            if _conn is None:
                agent_box_home().mkdir(parents=True, exist_ok=True)
                _conn = sqlite3.connect(str(database_path()), timeout=10.0, check_same_thread=False)
                _conn.row_factory = sqlite3.Row
                _conn.execute("PRAGMA foreign_keys = ON")
                _run_migrations(_conn)
    return _conn


def _reset_connection_for_tests() -> None:
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn = None
