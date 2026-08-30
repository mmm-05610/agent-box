"""Shared isolated Work Core test fixtures."""
from __future__ import annotations

import pytest

from agent_box.work_core.db import _reset_connection_for_tests


@pytest.fixture
def tmp_agent_box_home(tmp_path, monkeypatch):
    home = tmp_path / "ab-home"
    home.mkdir()
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    _reset_connection_for_tests()
    yield home
    _reset_connection_for_tests()
