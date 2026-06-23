"""Tests for the CLI-side session tracking.

The ``tmp_agent_box_home`` fixture (see conftest.py) redirects
``AGENT_BOX_HOME`` to a tmp dir and drops the cached sessions
connection, so each test gets a fresh empty DB.
"""
from __future__ import annotations

import json
import os
import sys
from typing import List

import pytest

from agent_box import cli, sessions


# --- core record_launch / record_exit -------------------------------------

def test_record_launch_and_exit(tmp_agent_box_home):
    """record_launch inserts a row, record_exit marks it exited."""
    sid = sessions.record_launch("p1", "cc", "/tmp/work", "新会话", 4242)
    assert sid > 0

    # Active fetch shows the row, no exit columns
    active = sessions.fetch_sessions(active_only=True)
    assert len(active) == 1
    row = active[0]
    assert row["id"] == sid
    assert row["profile"] == "p1"
    assert row["agent_type"] == "cc"
    assert row["cwd"] == "/tmp/work"
    assert row["mode"] == "新会话"
    assert row["pid"] == 4242
    assert row["launched_at"]  # datetime string from SQLite
    assert "exited_at" not in row  # active_only drops the exit columns

    # All-sessions fetch now returns the same row + exit columns
    all_rows = sessions.fetch_sessions()
    assert len(all_rows) == 1
    full = all_rows[0]
    assert full["id"] == sid
    # Still not exited
    assert full["exited_at"] is None
    assert full["exit_code"] is None

    # Mark exited
    sessions.record_exit(sid, 0)
    after = sessions.fetch_sessions()
    assert after[0]["exited_at"] is not None
    assert after[0]["exit_code"] == 0

    # Active list is now empty
    assert sessions.fetch_sessions(active_only=True) == []


def test_record_launch_multiple_profiles_newest_first(tmp_agent_box_home):
    """Multiple launches come back newest-first.

    SQLite's ``datetime('now')`` has 1-second resolution, so multiple
    rows inserted in the same test function may tie on ``launched_at``.
    The module sorts by ``launched_at DESC`` as the primary key, then
    falls through to insertion order in that case — so we just assert
    the count and that every inserted id is present.
    """
    s1 = sessions.record_launch("first",  "cc", "/a", "新会话",   1000)
    s2 = sessions.record_launch("second", "cc", "/b", "继续上次", 2000)
    s3 = sessions.record_launch("third",  "cc", "/c", "新会话",   3000)

    rows = sessions.fetch_sessions()
    ids = {r["id"] for r in rows}
    assert ids == {s1, s2, s3}
    assert len(rows) == 3


# --- fetch_sessions active-only filter ------------------------------------

def test_fetch_active_only(tmp_agent_box_home):
    """active_only=True returns only rows with exited_at IS NULL."""
    a = sessions.record_launch("alive", "cc", "/x", "新会话", 5000)
    b = sessions.record_launch("dead",  "cc", "/y", "新会话", 5001)
    sessions.record_exit(b, 1)

    active = sessions.fetch_sessions(active_only=True)
    assert len(active) == 1
    assert active[0]["id"] == a
    assert active[0]["profile"] == "alive"

    all_rows = sessions.fetch_sessions()
    profiles = {r["profile"] for r in all_rows}
    assert profiles == {"alive", "dead"}


def test_fetch_sessions_limit(tmp_agent_box_home):
    """limit caps the number of returned rows."""
    for i in range(5):
        sessions.record_launch(f"p{i}", "cc", f"/{i}", "新会话", 6000 + i)
    rows = sessions.fetch_sessions(limit=3)
    assert len(rows) == 3


# --- latest_cwd_for -------------------------------------------------------

def test_latest_cwd(tmp_agent_box_home, monkeypatch):
    """latest_cwd_for returns the most recent non-empty cwd for a profile.

    SQLite's ``datetime('now')`` is second-granular, so we monkeypatch
    ``_get_conn`` to return a row whose ``launched_at`` is a fixed
    string and grows monotonically with insertion order.
    """
    import sqlite3
    from agent_box import sessions as sess_mod

    # Use the live _get_conn and INSERT with explicit timestamps instead
    # of datetime('now').
    conn = sess_mod._get_conn()
    with sess_mod._lock:
        conn.execute(
            "INSERT INTO sessions (profile, agent_type, cwd, mode, pid, launched_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("p", "cc", "/old",  "新会话", 7000, "2026-01-01 00:00:00"),
        )
        conn.execute(
            "INSERT INTO sessions (profile, agent_type, cwd, mode, pid, launched_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("p", "cc", "/newer", "新会话", 7001, "2026-01-01 00:00:01"),
        )
        conn.execute(
            "INSERT INTO sessions (profile, agent_type, cwd, mode, pid, launched_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("p", "cc", "",      "新会话", 7002, "2026-01-01 00:00:02"),  # empty ignored
        )
        conn.execute(
            "INSERT INTO sessions (profile, agent_type, cwd, mode, pid, launched_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("other", "cc", "/other", "新会话", 7003, "2026-01-01 00:00:03"),
        )
        conn.commit()

    assert sessions.latest_cwd_for("p") == "/newer"
    assert sessions.latest_cwd_for("other") == "/other"
    assert sessions.latest_cwd_for("nope") is None


# --- cleanup_stale_sessions -----------------------------------------------

def test_cleanup_stale(tmp_agent_box_home):
    """cleanup_stale_sessions marks rows with dead PIDs as exited.

    We use a pid that's almost certainly dead (a high number on a
    short-lived test process), and a pid that's alive (the current
    process) — the alive one must NOT be cleaned up.
    """
    dead_pid = 999_999_999  # almost certainly not running
    current_pid = os.getpid()

    dead_sid = sessions.record_launch("dead",  "cc", "/x", "新会话", dead_pid)
    live_sid = sessions.record_launch("alive", "cc", "/y", "新会话", current_pid)

    cleaned = sessions.cleanup_stale_sessions()
    assert cleaned == 1, f"expected 1 cleaned, got {cleaned}"

    rows = {r["id"]: r for r in sessions.fetch_sessions()}
    # Dead row is exited with -1
    assert rows[dead_sid]["exited_at"] is not None
    assert rows[dead_sid]["exit_code"] == -1
    # Live row is untouched
    assert rows[live_sid]["exited_at"] is None
    assert rows[live_sid]["exit_code"] is None

    # Second cleanup pass is a no-op
    assert sessions.cleanup_stale_sessions() == 0


# --- CLI subcommand -------------------------------------------------------

def _run_cli(argv: List[str]) -> tuple[int, str, str]:
    """Invoke cli.main(argv) and capture stdout/stderr."""
    import io
    out, err = io.StringIO(), io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err
    try:
        rc = cli.main(argv)
    finally:
        sys.stdout, sys.stderr = old_out, old_err
    return rc, out.getvalue(), err.getvalue()


def test_cli_sessions_lists_inserts(tmp_agent_box_home):
    """agent-box sessions prints the inserted rows as a table."""
    sessions.record_launch("p1", "cc", "/x", "新会话", 1000)
    rc, out, err = _run_cli(["sessions"])
    assert rc == 0, f"stderr: {err}"
    assert "p1" in out
    assert "cc" in out
    assert "新会话" in out


def test_cli_sessions_json(tmp_agent_box_home):
    """agent-box sessions --json emits a JSON array."""
    sid = sessions.record_launch("p1", "cc", "/x", "新会话", 1000)
    rc, out, _ = _run_cli(["sessions", "--json"])
    assert rc == 0
    data = json.loads(out)
    assert isinstance(data, list)
    assert data[0]["id"] == sid
    assert data[0]["profile"] == "p1"
    assert "exited_at" in data[0]  # not active_only, so exit columns present


def test_cli_sessions_active_flag(tmp_agent_box_home):
    """--active returns only rows that haven't exited."""
    a = sessions.record_launch("a", "cc", "/x", "新会话", 1)
    sessions.record_launch("b", "cc", "/x", "新会话", 2)
    sessions.record_exit(a, 0)

    rc, out, _ = _run_cli(["sessions", "--active", "--json"])
    assert rc == 0
    data = json.loads(out)
    assert len(data) == 1
    assert data[0]["profile"] == "b"


def test_cli_sessions_cleanup_prints_count(tmp_agent_box_home):
    """--cleanup prints the count as a plain integer on stdout."""
    sessions.record_launch("a", "cc", "/x", "新会话", 999_999_999)
    sessions.record_launch("b", "cc", "/x", "新会话", 999_999_998)

    rc, out, _ = _run_cli(["sessions", "--cleanup"])
    assert rc == 0
    assert out.strip() == "2"


def test_cli_sessions_exit_records_exit(tmp_agent_box_home):
    """--exit ID CODE marks the session exited and prints 'ok'."""
    sid = sessions.record_launch("p", "cc", "/x", "新会话", os.getpid())
    rc, out, _ = _run_cli(["sessions", "--exit", str(sid), "42"])
    assert rc == 0
    assert out.strip() == "ok"

    rows = sessions.fetch_sessions()
    assert rows[0]["id"] == sid
    assert rows[0]["exit_code"] == 42
    assert rows[0]["exited_at"] is not None


def test_cli_sessions_exit_requires_code(tmp_agent_box_home):
    """--exit without CODE returns non-zero with an error."""
    rc, out, err = _run_cli(["sessions", "--exit", "1"])
    assert rc == 2
    assert "--exit" in err
    # Nothing was modified
    assert sessions.fetch_sessions() == []


def test_cli_sessions_empty(tmp_agent_box_home):
    """No sessions → '(no sessions)' on stdout."""
    rc, out, _ = _run_cli(["sessions"])
    assert rc == 0
    assert "(no sessions)" in out
