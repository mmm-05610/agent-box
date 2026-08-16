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
    def _is_pid_alive(pid: int | None) -> bool:
        if pid is None:
            return False
        # Prefer the process GROUP (negative pid): launch() runs bwrap with
        # start_new_session=True so pid == pgid, and a forking agent that
        # outlives its immediate bwrap parent still keeps the group alive.
        # Fall back to the single-process check for PIDs that aren't group
        # leaders (e.g. a test passing os.getpid()).
        for target in (-pid, pid):
            try:
                os.kill(target, 0)
                return True
            except (OSError, ProcessLookupError):
                continue
        return False

    @staticmethod
    def _cleanup_zombies(conn: sqlite3.Connection, grace_seconds: int = 5) -> int:
        # Grace period: skip sessions launched in the last `grace_seconds` —
        # the recorded bwrap pid may not be observable yet, and we'd wrongly
        # mark a just-launched agent as exited (the "started 1s ago, already
        # -1" bug).  grace_seconds <= 0 disables the grace entirely, so the
        # explicit cleanup runs immediately on every running session.
        query = "SELECT id, pid FROM sessions WHERE exited_at IS NULL"
        params: tuple = ()
        if grace_seconds > 0:
            query += " AND launched_at < datetime('now', ?)"
            params = (f"-{int(grace_seconds)} seconds",)
        rows = conn.execute(query, params).fetchall()
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

    def cleanup_stale(self) -> int:
        """Mark dead-PID sessions as exited. Returns count cleaned.

        Explicit cleanup — no grace period (the user asked for it now).
        """
        conn = _core_db.get_conn()
        with _core_db.write_lock:
            cleaned = self._cleanup_zombies(conn, grace_seconds=0)
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
cleanup_stale_sessions = _repo.cleanup_stale
__all__ = [
    "cleanup_stale_sessions",
    "fetch_sessions",
    "record_exit",
    "record_exit_by_pid",
    "record_launch",
]
