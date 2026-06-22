"""Shared pytest fixtures.

The ``tmp_agent_box_home`` fixture isolates all profile ops to a
``tmp_path`` subdir via the ``AGENT_BOX_HOME`` env var (honored live by
``config.agent_box_home()``).  Tests must NEVER touch the real
``~/.agent-box`` — monkeypatching the env var is the only way to
guarantee that.
"""
from __future__ import annotations

import pytest


@pytest.fixture
def tmp_agent_box_home(tmp_path, monkeypatch):
    """Point ``AGENT_BOX_HOME`` at a fresh tmp dir for this test."""
    home = tmp_path / "ab-home"
    home.mkdir()
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    yield home
