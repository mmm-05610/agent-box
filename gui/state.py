"""SQLite-backed session tracking.

Stores launch history and active PIDs at ``~/.agent-box/sessions.db``.
The DB file location and schema are preserved from the original
``gui-redesign.py`` so existing data on user machines keeps working.

Every public helper opens a fresh connection (cheap, sqlite3 caches).
Callers that need atomic read-modify-write should hold their own lock
or move to the singleton pattern in Phase 3.3.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional


DB_PATH = Path.home() / ".agent-box" / "sessions.db"


def init_db() -> sqlite3.Connection:
    """Open (and migrate) the sessions database. Returns a live connection."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
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
    conn.commit()
    return conn


def record_launch(profile: str, agent_type: str, cwd: str, mode: str, pid: int) -> int:
    """Insert a new launch row; returns the new session id."""
    conn = init_db()
    cur = conn.execute(
        "INSERT INTO sessions (profile, agent_type, cwd, mode, pid, launched_at) "
        "VALUES (?, ?, ?, ?, ?, datetime('now'))",
        (profile, agent_type, cwd, mode, pid),
    )
    conn.commit()
    return cur.lastrowid


def record_exit(session_id: int, exit_code: int) -> None:
    """Mark a session as exited with the given exit code."""
    conn = init_db()
    conn.execute(
        "UPDATE sessions SET exited_at = datetime('now'), exit_code = ? WHERE id = ?",
        (exit_code, session_id),
    )
    conn.commit()


def fetch_sessions(active_only: bool = False, limit: int = 50) -> List[Dict[str, Any]]:
    """Return session rows, newest first.

    ``active_only=True`` returns only sessions whose ``exited_at`` is NULL.
    """
    conn = init_db()
    if active_only:
        rows = conn.execute(
            "SELECT id, profile, agent_type, cwd, mode, pid, launched_at "
            "FROM sessions WHERE exited_at IS NULL ORDER BY launched_at DESC"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, profile, agent_type, cwd, mode, pid, launched_at, "
            "exited_at, exit_code "
            "FROM sessions ORDER BY launched_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {
            "id": r[0], "profile": r[1], "agent_type": r[2], "cwd": r[3],
            "mode": r[4], "pid": r[5], "launched_at": r[6],
            **({"exited_at": r[7], "exit_code": r[8]}
               if not active_only and len(r) > 7 else {}),
        }
        for r in rows
    ]


def latest_cwd_for(profile: str) -> Optional[str]:
    """Return the most recent cwd used for ``profile``, or None."""
    conn = init_db()
    row = conn.execute(
        "SELECT cwd FROM sessions WHERE profile = ? AND cwd IS NOT NULL "
        "AND cwd != '' ORDER BY launched_at DESC LIMIT 1",
        (profile,),
    ).fetchone()
    return row[0] if row else None