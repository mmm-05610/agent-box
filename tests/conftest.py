"""Shared pytest fixtures.

The ``tmp_agent_box_home`` fixture isolates all profile ops to a
``tmp_path`` subdir via the ``AGENT_BOX_HOME`` env var (honored live by
``config.agent_box_home()``).  Tests must NEVER touch the real
``~/.agent-box`` — monkeypatching the env var is the only way to
guarantee that.

It also drops the cached ``agent-box.db`` connection (and the
``sessions._migrated`` sentinel) so a previous test's
``AGENT_BOX_HOME`` doesn't leak into this one.
"""
from __future__ import annotations

import pytest

from agent_box import db, sessions


@pytest.fixture
def tmp_agent_box_home(tmp_path, monkeypatch):
    """Point ``AGENT_BOX_HOME`` at a fresh tmp dir for this test."""
    home = tmp_path / "ab-home"
    home.mkdir()
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    # Drop the cached db connection (shared by db.py / sessions.py)
    # and the sessions-migration sentinel.
    db._reset_connection_for_tests()
    sessions._reset_connection_for_tests()
    yield home
