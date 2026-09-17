"""Shared isolated Work Core test fixtures."""
from __future__ import annotations

import os

import pytest

from agent_box.work_core.db import _reset_connection_for_tests

# Runtime environments resolve the sandbox provider by name; under pytest the
# plugin is importable through PYTHONPATH but not pip-installed, so the test
# session states the module explicitly (the same variable the gate scripts set).
os.environ.setdefault("AGENT_BOX_SANDBOX_MODULE", "agent_box_sandbox_bwrap")


@pytest.fixture
def tmp_agent_box_home(tmp_path, monkeypatch):
    home = tmp_path / "ab-home"
    home.mkdir()
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    _reset_connection_for_tests()
    yield home
    _reset_connection_for_tests()
