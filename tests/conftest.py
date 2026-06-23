"""Shared pytest fixtures.

The ``tmp_agent_box_home`` fixture isolates all profile ops to a
``tmp_path`` subdir via the ``AGENT_BOX_HOME`` env var (honored live by
``config.agent_box_home()``).  Tests must NEVER touch the real
``~/.agent-box`` — monkeypatching the env var is the only way to
guarantee that.

It also drops any cached sessions-DB connection so the new
``AGENT_BOX_HOME`` is picked up the next time ``sessions.*`` is called.
"""
from __future__ import annotations

import pytest

from agent_box import sessions


@pytest.fixture
def tmp_agent_box_home(tmp_path, monkeypatch):
    """Point ``AGENT_BOX_HOME`` at a fresh tmp dir for this test."""
    home = tmp_path / "ab-home"
    home.mkdir()
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    # Drop the cached sessions connection so a previous test's
    # AGENT_BOX_HOME doesn't leak into this one.
    sessions._reset_connection_for_tests()
    yield home
