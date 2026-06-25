"""SQLite-backed session tracking (CLI side).

Sessions live in the shared ``agent-box.db`` (the same database that
holds providers, prompts, and profiles — see :mod:`.db`). The
connection is shared via :func:`agent_box.db.get_conn`; the module
keeps its own ``threading.Lock`` to serialize writes through this
module's API.

For backward compatibility, the first call to :func:`_get_conn` will
migrate a legacy ``sessions.db`` (v0.4) into ``agent-box.db`` and
rename the legacy file to ``sessions.db.migrated``.
"""
from __future__ import annotations

import os
import sqlite3
import threading
from typing import Any, Dict, List, Optional

from . import config


# Module-level lock. The connection is owned by :mod:`.db` (cached
# module-level) — we just serialize our own writes through it.
_lock = threading.Lock()
_migrated: bool = False


def _migrate_legacy_sessions_db() -> None:
    """If a v0.4 ``sessions.db`` exists, copy rows into ``agent-box.db``.

    Idempotent. The legacy file is renamed to ``sessions.db.migrated``
    on success. Safe to call repeatedly; after the first rename, the
    guard ``_migrated`` short-circuits subsequent calls.
    """
    global _migrated
    if _migrated:
        return
    from . import db
    legacy_path = config.agent_box_home() / "sessions.db"
    if not legacy_path.is_file():
        _migrated = True
        return
    # Open read-only the legacy DB.
    try:
        legacy = sqlite3.connect(f"file:{legacy_path}?mode=ro", uri=True, timeout=10.0)
    except sqlite3.OperationalError:
        # Unreadable / not a real DB — leave it for the user.
        _migrated = True
        return
    try:
        try:
            rows = legacy.execute(
                "SELECT profile, agent_type, cwd, mode, pid, "
                "launched_at, exited_at, exit_code FROM sessions"
            ).fetchall()
        except sqlite3.OperationalError:
            # No sessions table — nothing to migrate.
            _migrated = True
            return
        if not rows:
            _migrated = True
            try:
                legacy_path.rename(legacy_path.with_suffix(legacy_path.suffix + ".migrated"))
            except OSError:
                pass
            return
        conn = db.get_conn()
        with _lock:
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
        except Exception:
            pass
    try:
        legacy_path.rename(legacy_path.with_suffix(legacy_path.suffix + ".migrated"))
    except OSError:
        pass
    _migrated = True


def _get_conn() -> sqlite3.Connection:
    """Return the shared :mod:`.db` connection (runs the legacy migration once)."""
    _migrate_legacy_sessions_db()
    from . import db
    return db.get_conn()


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
# Test helpers
# ---------------------------------------------------------------------------

def _reset_connection_for_tests() -> None:
    """Drop the migration sentinel so the next call re-runs migration.

    The connection itself is owned by :mod:`.db`; tests that need a
    fresh connection should call :func:`agent_box.db._reset_connection_for_tests`.
    """
    global _migrated
    with _lock:
        _migrated = False
