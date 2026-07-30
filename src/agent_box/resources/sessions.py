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
    """Data access for the ``sessions`` table.

    On first use, migrates a legacy ``sessions.db`` (v0.4) into
    ``agent-box.db`` and renames the legacy file to
    ``sessions.db.migrated`` (idempotent).
    """

    def __init__(self) -> None:
        self._migrated: bool = False

    # ── helpers ─────────────────────────────────────────────────────────

    def _ensure_migrated(self) -> None:
        if self._migrated:
            return
        legacy_path = config.agent_box_home() / "sessions.db"
        if not legacy_path.is_file():
            self._migrated = True
            return

        try:
            legacy = sqlite3.connect(
                f"file:{legacy_path}?mode=ro", uri=True, timeout=10.0
            )
        except sqlite3.OperationalError:
            self._migrated = True
            return

        try:
            try:
                rows = legacy.execute(
                    "SELECT profile, agent_type, cwd, mode, pid, "
                    "launched_at, exited_at, exit_code FROM sessions"
                ).fetchall()
            except sqlite3.OperationalError:
                self._migrated = True
                return

            if not rows:
                self._migrated = True
                try:
                    legacy_path.rename(
                        legacy_path.with_suffix(legacy_path.suffix + ".migrated")
                    )
                except OSError:
                    pass
                return

            conn = _core_db.get_conn()
            with _core_db.write_lock:
                for r in rows:
                    conn.execute(
                        "INSERT INTO sessions "
                        "(profile, agent_type, cwd, mode, pid, launched_at, "
                        "exited_at, exit_code) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        r,
                    )
                conn.commit()
        finally:
            try:
                legacy.close()
            except sqlite3.Error:
                pass

        try:
            legacy_path.rename(
                legacy_path.with_suffix(legacy_path.suffix + ".migrated")
            )
        except OSError:
            pass
        self._migrated = True

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
        self._ensure_migrated()
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
        self._ensure_migrated()
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
                "id": r[0], "profile": r[1], "agent_type": r[2],
                "cwd": r[3], "mode": r[4], "pid": r[5],
                "launched_at": r[6],
            }
            if not active_only and len(r) > 7:
                rec["exited_at"] = r[7]
                rec["exit_code"] = r[8]
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
            return row[0] if row else None

    def cleanup_stale(self) -> int:
        """Mark dead-PID sessions as exited. Returns count cleaned."""
        conn = _core_db.get_conn()
        with _core_db.write_lock:
            cleaned = self._cleanup_zombies(conn)
            conn.commit()
            return cleaned

    def reset_for_tests(self) -> None:
        """Drop the cached migration sentinel so the next call re-runs
        the legacy migration against the current ``AGENT_BOX_HOME``."""
        self._migrated = False


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
_reset_connection_for_tests = _repo.reset_for_tests

# Expose internals that tests need.
_get_conn = lambda: _core_db.get_conn()


__all__ = [
    "_get_conn",
    "_reset_connection_for_tests",
    "cleanup_stale_sessions",
    "fetch_sessions",
    "latest_cwd_for",
    "record_exit",
    "record_exit_by_pid",
    "record_launch",
]
