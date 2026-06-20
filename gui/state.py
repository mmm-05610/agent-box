"""SQLite-backed session tracking.

Stores launch history and active PIDs at ``~/.agent-box/sessions.db``.
The DB file location and schema are preserved from the original
``gui-redesign.py`` so existing data on user machines keeps working.

Phase 3.3: the legacy free-function API (``init_db``, ``record_launch``,
``record_exit``, ``fetch_sessions``, ``latest_cwd_for``) is preserved
for backwards compatibility, but is now backed by a thread-safe
``SessionDB`` singleton that holds a single WAL-mode connection guarded
by a ``threading.Lock``. Background threads (the WSL launch watcher)
and the Tk main thread now share the same connection safely.
"""
from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional


DB_PATH = Path.home() / ".agent-box" / "sessions.db"


# ---------------------------------------------------------------------------
# Thread-safe singleton
# ---------------------------------------------------------------------------

class SessionDB:
    """Process-wide singleton holding the sessions connection.

    Usage::

        db = SessionDB.instance()
        rows = db.fetch_sessions(active_only=True)

    The constructor is private; callers go through :meth:`instance`.
    """

    _instance: Optional["SessionDB"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        # check_same_thread=False because both the Tk main thread and
        # the daemon _watch_exit thread use the same connection.
        self._conn = sqlite3.connect(
            str(DB_PATH), check_same_thread=False, timeout=10.0,
        )
        # WAL mode: readers don't block writers, and concurrent reads
        # from another thread don't error out.
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.execute(
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
        self._conn.commit()
        # Serialize all access through one lock — cheap, and avoids
        # the "Recursive use of cursors not allowed" trap.
        self._lock = threading.Lock()

    # ---- singleton plumbing --------------------------------------------

    @classmethod
    def instance(cls) -> "SessionDB":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ---- core helpers --------------------------------------------------

    def record_launch(self, profile: str, agent_type: str, cwd: str,
                      mode: str, pid: int) -> int:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO sessions (profile, agent_type, cwd, mode, pid, "
                "launched_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
                (profile, agent_type, cwd, mode, pid),
            )
            self._conn.commit()
            return cur.lastrowid

    def record_exit(self, session_id: int, exit_code: int) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE sessions SET exited_at = datetime('now'), "
                "exit_code = ? WHERE id = ?",
                (exit_code, session_id),
            )
            self._conn.commit()

    def fetch_sessions(self, active_only: bool = False,
                       limit: int = 50) -> List[Dict[str, Any]]:
        with self._lock:
            if active_only:
                rows = self._conn.execute(
                    "SELECT id, profile, agent_type, cwd, mode, pid, "
                    "launched_at FROM sessions WHERE exited_at IS NULL "
                    "ORDER BY launched_at DESC"
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT id, profile, agent_type, cwd, mode, pid, "
                    "launched_at, exited_at, exit_code FROM sessions "
                    "ORDER BY launched_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
        return [
            {
                "id": r[0], "profile": r[1], "agent_type": r[2],
                "cwd": r[3], "mode": r[4], "pid": r[5],
                "launched_at": r[6],
                **({"exited_at": r[7], "exit_code": r[8]}
                   if not active_only and len(r) > 7 else {}),
            }
            for r in rows
        ]

    def latest_cwd_for(self, profile: str) -> Optional[str]:
        with self._lock:
            row = self._conn.execute(
                "SELECT cwd FROM sessions WHERE profile = ? "
                "AND cwd IS NOT NULL AND cwd != '' "
                "ORDER BY launched_at DESC LIMIT 1",
                (profile,),
            ).fetchone()
        return row[0] if row else None


# ---------------------------------------------------------------------------
# Module-level helpers (legacy API — kept for backward compatibility)
# ---------------------------------------------------------------------------

def init_db() -> sqlite3.Connection:
    """Return the singleton's connection (legacy API)."""
    return SessionDB.instance()._conn


def record_launch(profile: str, agent_type: str, cwd: str, mode: str, pid: int) -> int:
    return SessionDB.instance().record_launch(profile, agent_type, cwd, mode, pid)


def record_exit(session_id: int, exit_code: int) -> None:
    SessionDB.instance().record_exit(session_id, exit_code)


def fetch_sessions(active_only: bool = False, limit: int = 50) -> List[Dict[str, Any]]:
    return SessionDB.instance().fetch_sessions(active_only=active_only, limit=limit)


def latest_cwd_for(profile: str) -> Optional[str]:
    return SessionDB.instance().latest_cwd_for(profile)