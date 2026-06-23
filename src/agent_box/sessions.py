"""SQLite-backed session tracking (CLI side).

Stores launch history and active PIDs at ``~/.agent-box/sessions.db``
(``AGENT_BOX_HOME`` is honored via :func:`agent_box.config.agent_box_home`).

The module exposes a flat function API (``record_launch``, ``record_exit``,
``fetch_sessions``, ``latest_cwd_for``, ``cleanup_stale_sessions``) backed
by a single module-level connection guarded by ``threading.Lock``.

This replaces the previous ``gui.state`` module: the DB now lives on the
WSL side so the GUI can read it via ``agent-box sessions ...`` instead
of keeping its own copy.
"""
from __future__ import annotations

import os
import sqlite3
import threading
from typing import Any, Dict, List, Optional

from . import config


# Module-level connection + lock. The CLI is single-threaded per process,
# so we don't need check_same_thread=False; the lock is here for
# defensive correctness (e.g. future async use) and to serialize writes.
_conn: Optional[sqlite3.Connection] = None
_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    """Return the module-level connection, creating it on first use."""
    global _conn
    if _conn is None:
        db_path = config.agent_box_home() / "sessions.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(db_path), timeout=10.0)
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA synchronous=NORMAL")
        _conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile TEXT NOT NULL,
                agent_type TEXT NOT NULL,
                cwd TEXT,
                mode TEXT,
                pid INTEGER,
                launched_at TEXT NOT NULL,
                exited_at TEXT,
                exit_code INTEGER
            )
            """
        )
        _conn.commit()
    return _conn


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def record_launch(profile: str, agent_type: str, cwd: str,
                  mode: str, pid: int) -> int:
    """Insert a new session row. Returns the new session id."""
    conn = _get_conn()
    with _lock:
        cur = conn.execute(
            "INSERT INTO sessions (profile, agent_type, cwd, mode, pid, "
            "launched_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
            (profile, agent_type, cwd, mode, pid),
        )
        conn.commit()
        return cur.lastrowid


def record_exit(session_id: int, exit_code: int) -> None:
    """Mark a session as exited."""
    conn = _get_conn()
    with _lock:
        conn.execute(
            "UPDATE sessions SET exited_at = datetime('now'), "
            "exit_code = ? WHERE id = ?",
            (exit_code, session_id),
        )
        conn.commit()


def fetch_sessions(active_only: bool = False,
                   limit: int = 50) -> List[Dict[str, Any]]:
    """Return sessions, newest first.

    ``active_only=True`` returns rows with ``exited_at IS NULL`` and
    drops the exit columns (they'd always be NULL anyway).
    """
    conn = _get_conn()
    with _lock:
        if active_only:
            rows = conn.execute(
                "SELECT id, profile, agent_type, cwd, mode, pid, "
                "launched_at FROM sessions WHERE exited_at IS NULL "
                "ORDER BY launched_at DESC"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, profile, agent_type, cwd, mode, pid, "
                "launched_at, exited_at, exit_code FROM sessions "
                "ORDER BY launched_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        rec: Dict[str, Any] = {
            "id": r[0], "profile": r[1], "agent_type": r[2],
            "cwd": r[3], "mode": r[4], "pid": r[5],
            "launched_at": r[6],
        }
        if not active_only and len(r) > 7:
            rec["exited_at"] = r[7]
            rec["exit_code"] = r[8]
        out.append(rec)
    return out


def latest_cwd_for(profile: str) -> Optional[str]:
    """Return the most-recent non-empty ``cwd`` recorded for *profile*."""
    conn = _get_conn()
    with _lock:
        row = conn.execute(
            "SELECT cwd FROM sessions WHERE profile = ? "
            "AND cwd IS NOT NULL AND cwd != '' "
            "ORDER BY launched_at DESC LIMIT 1",
            (profile,),
        ).fetchone()
    return row[0] if row else None


def cleanup_stale_sessions() -> int:
    """Mark sessions as exited if their PID is no longer alive.

    Returns the number of sessions cleaned up. ``os.kill(pid, 0)`` works
    on Linux (incl. WSL) — raises ``OSError`` (or ``ProcessLookupError``)
    when the process is gone.
    """
    rows = fetch_sessions(active_only=True)
    cleaned = 0
    for s in rows:
        pid = s.get("pid")
        if not pid:
            continue
        alive = False
        try:
            os.kill(int(pid), 0)
            alive = True
        except (OSError, ProcessLookupError):
            alive = False
        except ValueError:
            # Non-int pid in the DB — treat as stale.
            alive = False
        if not alive:
            record_exit(int(s["id"]), -1)
            cleaned += 1
    return cleaned


__all__ = [
    "cleanup_stale_sessions",
    "fetch_sessions",
    "latest_cwd_for",
    "record_exit",
    "record_launch",
]


# ---------------------------------------------------------------------------
# Test helper (not part of the public CLI surface)
# ---------------------------------------------------------------------------

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
