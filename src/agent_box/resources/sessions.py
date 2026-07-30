"""Session tracking for agent-box profiles.

Sessions live in ``agent-box.db`` (``profiles`` + ``sessions`` tables only).
The connection is shared via :mod:`agent_box.core.db`.
"""
from __future__ import annotations

import os
import sqlite3
from typing import Any, Dict, List

from .. import config
from ..core import db as _core_db


# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------

class SessionRepo:
    """Data access for the ``sessions`` table."""

    @staticmethod
    def _is_pid_alive(pid: int) -> bool:
        try:
            os.kill(pid, 0)
            return True
        except (OSError, ProcessLookupError):
            return False

    @staticmethod
    def _cleanup_zombies(conn: sqlite3.Connection) -> int:
        rows = conn.execute(
            "SELECT id, pid FROM sessions WHERE exited_at IS NULL"
        ).fetchall()
        cleaned = 0
        for r in rows:
            if not SessionRepo._is_pid_alive(r["pid"]):
                conn.execute(
                    "UPDATE sessions SET exited_at = datetime('now'), "
                    "exit_code = -1 WHERE id = ?",
                    (r["id"],),
                )
                cleaned += 1
        return cleaned

    # ── public API ──────────────────────────────────────────────────────

    def record_launch(
        self, profile: str, agent_type: str, cwd: str, mode: str, pid: int,
    ) -> int:
        """Insert a new session row. Returns the new session id."""
        conn = _core_db.get_conn()
        with _core_db.write_lock:
            cur = conn.execute(
                "INSERT INTO sessions (profile, agent_type, cwd, mode, pid, "
                "launched_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
                (profile, agent_type, cwd, mode, pid),
            )
            conn.commit()
            return cur.lastrowid

    def record_exit(self, session_id: int, exit_code: int) -> None:
        """Mark a session as exited."""
        conn = _core_db.get_conn()
        with _core_db.write_lock:
            conn.execute(
                "UPDATE sessions SET exited_at = datetime('now'), "
                "exit_code = ? WHERE id = ?",
                (exit_code, session_id),
            )
            conn.commit()

    def record_exit_by_pid(self, pid: int, exit_code: int) -> None:
        """Mark the most recent running session with *pid* as exited."""
        conn = _core_db.get_conn()
        with _core_db.write_lock:
            row = conn.execute(
                "SELECT id FROM sessions WHERE pid = ? AND exited_at IS NULL "
                "ORDER BY launched_at DESC LIMIT 1",
                (pid,),
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE sessions SET exited_at = datetime('now'), "
                    "exit_code = ? WHERE id = ?",
                    (exit_code, row["id"]),
                )
                conn.commit()

    def fetch(
        self, active_only: bool = False, limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Return sessions, newest first. Auto-cleans zombie PIDs.

        ``active_only=True`` omits exit columns (they'd always be NULL).
        """
        conn = _core_db.get_conn()
        with _core_db.write_lock:
            self._cleanup_zombies(conn)
            conn.commit()

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
                "id": r["id"], "profile": r["profile"],
                "agent_type": r["agent_type"], "cwd": r["cwd"],
                "mode": r["mode"], "pid": r["pid"],
                "launched_at": r["launched_at"],
            }
            if not active_only:
                rec["exited_at"] = r["exited_at"]
                rec["exit_code"] = r["exit_code"]
            out.append(rec)
        return out

    def latest_cwd_for(self, profile: str) -> str | None:
        """Return the most-recent non-empty cwd for *profile*."""
        conn = _core_db.get_conn()
        with _core_db.write_lock:
            row = conn.execute(
                "SELECT cwd FROM sessions WHERE profile = ? "
                "AND cwd IS NOT NULL AND cwd != '' "
                "ORDER BY launched_at DESC LIMIT 1",
                (profile,),
            ).fetchone()
            return row["cwd"] if row else None

    def cleanup_stale(self) -> int:
        """Mark dead-PID sessions as exited. Returns count cleaned."""
        conn = _core_db.get_conn()
        with _core_db.write_lock:
            cleaned = self._cleanup_zombies(conn)
            conn.commit()
            return cleaned

# ---------------------------------------------------------------------------
# Module-level API — thin wrappers around the singleton repository
# ---------------------------------------------------------------------------

_repo = SessionRepo()

record_launch          = _repo.record_launch
record_exit            = _repo.record_exit
record_exit_by_pid     = _repo.record_exit_by_pid
fetch_sessions         = _repo.fetch
latest_cwd_for         = _repo.latest_cwd_for
cleanup_stale_sessions = _repo.cleanup_stale
__all__ = [
    "cleanup_stale_sessions",
    "fetch_sessions",
    "latest_cwd_for",
    "record_exit",
    "record_exit_by_pid",
    "record_launch",
]
