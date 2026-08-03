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

from agent_box.cli.commands.core import CoreCommands
from agent_box.cli.shell import AgentBoxShell
from agent_box.resources import sessions


# --- core record_launch / record_exit -------------------------------------

def test_record_launch_and_exit(tmp_agent_box_home):
    """record_launch inserts a row, record_exit marks it exited."""
    sid = sessions.record_launch("p1", "claude", "/tmp/work", "新会话", os.getpid())
    assert sid > 0

    # Active fetch shows the row, no exit columns
    active = sessions.fetch_sessions(active_only=True)
    assert len(active) == 1
    row = active[0]
    assert row["id"] == sid
    assert row["profile"] == "p1"
    assert row["agent_type"] == "claude"
    assert row["cwd"] == "/tmp/work"
    assert row["mode"] == "新会话"
    assert row["pid"] == os.getpid()
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
    s1 = sessions.record_launch("first",  "claude", "/a", "新会话",   os.getpid())
    s2 = sessions.record_launch("second", "claude", "/b", "继续上次", os.getpid())
    s3 = sessions.record_launch("third",  "claude", "/c", "新会话",   os.getpid())

    rows = sessions.fetch_sessions()
    ids = {r["id"] for r in rows}
    assert ids == {s1, s2, s3}
    assert len(rows) == 3


# --- fetch_sessions active-only filter ------------------------------------

def test_fetch_active_only(tmp_agent_box_home):
    """active_only=True returns only rows with exited_at IS NULL."""
    a = sessions.record_launch("alive", "claude", "/x", "新会话", os.getpid())
    b = sessions.record_launch("dead",  "claude", "/y", "新会话", os.getpid())
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
        sessions.record_launch(f"p{i}", "claude", f"/{i}", "新会话", os.getpid())
    rows = sessions.fetch_sessions(limit=3)
    assert len(rows) == 3


# --- cleanup_stale_sessions -----------------------------------------------

def test_cleanup_stale(tmp_agent_box_home):
    """cleanup_stale_sessions marks rows with dead PIDs as exited.

    We use a pid that's almost certainly dead (a high number on a
    short-lived test process), and a pid that's alive (the current
    process) — the alive one must NOT be cleaned up.
    """
    dead_pid = 999_999_999  # almost certainly not running
    current_pid = os.getpid()

    dead_sid = sessions.record_launch("dead",  "claude", "/x", "新会话", dead_pid)
    live_sid = sessions.record_launch("alive", "claude", "/y", "新会话", current_pid)

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


# --- CLI subcommand (cmd2 exec mode) ---------------------------------------

def _exec(script: str) -> str:
    """Run a REPL exec script and capture stdout + stderr."""
    import io
    out, err = io.StringIO(), io.StringIO()
    app = AgentBoxShell(stdout=out)
    app.register_command_set(CoreCommands())
    old_err = sys.stderr
    sys.stderr = err
    try:
        for line in script.split(";"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            app.onecmd(line)
    finally:
        sys.stderr = old_err
    return out.getvalue() + err.getvalue()


def test_cli_sessions_lists_inserts(tmp_agent_box_home):
    """list sessions prints the inserted rows as a table."""
    sessions.record_launch("p1", "claude", "/x", "新会话", 1000)
    out = _exec("list sessions")
    assert "p1" in out
    assert "claude" in out


def test_cli_sessions_json(tmp_agent_box_home):
    """list sessions --json emits a JSON array."""
    sid = sessions.record_launch("p1", "claude", "/x", "新会话", 1000)
    out = _exec("list sessions --json")
    data = json.loads(out.strip())
    assert isinstance(data, list)
    assert data[0]["id"] == sid
    assert data[0]["profile"] == "p1"


def test_cli_sessions_active_flag(tmp_agent_box_home):
    """list sessions --active --json returns only rows that haven't exited."""
    a = sessions.record_launch("a", "claude", "/x", "新会话", 1)
    sessions.record_launch("b", "claude", "/x", "新会话", 2)
    sessions.record_exit(a, 0)

    out = _exec("list sessions --active --json")
    data = json.loads(out.strip())
    assert len(data) == 1
    assert data[0]["profile"] == "b"


def test_cli_sessions_cleanup_prints_count(tmp_agent_box_home):
    """sessions --cleanup prints the count as a plain integer."""
    sessions.record_launch("a", "claude", "/x", "新会话", 999_999_999)
    sessions.record_launch("b", "claude", "/x", "新会话", 999_999_998)

    out = _exec("sessions --cleanup")
    assert "2" in out


def test_cli_sessions_exit_records_exit(tmp_agent_box_home):
    """sessions --exit ID CODE marks the session exited and prints 'ok'."""
    sid = sessions.record_launch("p", "claude", "/x", "新会话", os.getpid())
    out = _exec(f"sessions --exit {sid} 42")
    assert "ok" in out

    rows = sessions.fetch_sessions()
    assert rows[0]["id"] == sid
    assert rows[0]["exit_code"] == 42
    assert rows[0]["exited_at"] is not None


def test_cli_sessions_exit_requires_code(tmp_agent_box_home):
    """sessions --exit without CODE prints an error."""
    out = _exec("sessions --exit 1")
    assert "requires an exit code" in out
    # Nothing was modified
    assert sessions.fetch_sessions() == []


def test_cli_sessions_empty(tmp_agent_box_home):
    """No sessions → '(no sessions)' on stdout."""
    out = _exec("list sessions")
    assert "(no sessions)" in out


