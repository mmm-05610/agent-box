"""Shared isolated Work Core test fixtures."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import pytest

from agent_box.work_core.db import _reset_connection_for_tests

# Runtime environments resolve the sandbox provider by name; under pytest the
# plugin is importable through PYTHONPATH but not pip-installed, so the test
# session states the module explicitly (the same variable the gate scripts set).
os.environ.setdefault("AGENT_BOX_SANDBOX_MODULE", "agent_box_sandbox_bwrap")

_PRESENCE_PATH = (Path(__file__).resolve().parents[1]
                  / "scripts/server-round1/artifact_presence.py")
_SKIPPED_REASONS: list[str] = []


def _presence():
    spec = importlib.util.spec_from_file_location("artifact_presence_118", _PRESENCE_PATH)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pytest_runtest_logreport(report):
    if report.skipped:
        _SKIPPED_REASONS.append(str(report.longrepr))


def _presence_lines(presence):
    classes = {f"skip-{index}": presence.classify_skip(reason)
               for index, reason in enumerate(_SKIPPED_REASONS)}
    return presence.render(classes)


def pytest_terminal_summary(terminalreporter):
    """Order 118: the count line has to say when a gate never ran.

    `QA-010` measured one sha giving two answers - 21 `skipped` with the Worker
    artifacts missing, 0 with them added back - and both reads had no failure in
    them. `QA-007` asked a person to write the "Worker 工件在/不在" line; this
    writes it, so a count cannot be quoted without it.
    """
    presence = _presence()
    if presence is None:
        terminalreporter.write_line(
            f"VERDICT=DEGRADED_PRESENCE_REPORT_UNAVAILABLE ({_PRESENCE_PATH})")
        return
    failures = len(terminalreporter.stats.get("failed", []))
    for line in _presence_lines(presence):
        terminalreporter.write_line(line)
    if os.environ.get("AGENTBOX_STRICT_PRESENCE"):
        terminalreporter.write_line("STRICT_PRESENCE=1 (a non-green VERDICT fails the session)")


def pytest_sessionfinish(session, exitstatus):
    """Strict mode turns "degraded" into a non-zero exit code.

    Off by default on purpose: the runtime tree genuinely has no Worker
    artifacts (first-hand: its `target/` directory does not exist at all), so a
    default-red there would look like a defect and would blur the very thing
    `QA-010` asks us to distinguish. Counting runs opt in with
    `AGENTBOX_STRICT_PRESENCE=1`.
    """
    presence = _presence()
    if presence is None or not os.environ.get("AGENTBOX_STRICT_PRESENCE"):
        return
    if exitstatus != 0:
        return  # already red for a real reason; `failures=0` below is that guard
    classes = {f"skip-{i}": presence.classify_skip(r) for i, r in enumerate(_SKIPPED_REASONS)}
    verdict = presence.verdict({c for cs in classes.values() for c in cs}, failures=0)
    if not verdict.startswith("GREEN"):
        session.exitstatus = 1


@pytest.fixture
def tmp_agent_box_home(tmp_path, monkeypatch):
    home = tmp_path / "ab-home"
    home.mkdir()
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    _reset_connection_for_tests()
    yield home
    _reset_connection_for_tests()
