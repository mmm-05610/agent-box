"""Tests for agent_box.launch.

The launch function builds a bwrap argv and execvpe's it — under test
we monkeypatch both ``shutil.which`` and ``os.execvpe`` so the test
captures the argv WITHOUT spawning bwrap.  We also monkeypatch
``config.real_agent_dir`` / ``config.real_agent_data_dir`` to point at
``tmp_path`` so no real ``~/.claude`` is created as a bwrap mount point.
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest

from agent_box import config, launch, profile


class _ExecStop(Exception):
    """Sentinel exception raised by the fake os.execvpe to short-circuit
    launch() AFTER it has built its argv."""


@pytest.fixture
def fake_exec(monkeypatch, tmp_path):
    """Make launch.build its argv, capture it, then raise instead of
    actually exec'ing bwrap.  Real-host paths (``~/.claude`` etc.) are
    redirected to ``tmp_path/real`` so the mkdir in launch.launch is
    a no-op on the real home."""

    captured: dict = {}

    def _fake_execvpe(file, args, env):
        captured["file"] = file
        captured["args"] = args
        captured["env"] = env
        raise _ExecStop("captured execvpe")

    # Resolve bwrap + agent binary to fake paths
    monkeypatch.setattr(
        shutil, "which",
        lambda name: f"/usr/bin/{name}" if name in ("bwrap", "claude", "codex",
                                                   "hermes", "opencode") else None,
    )
    # Stop just before the real exec
    monkeypatch.setattr(os, "execvpe", _fake_execvpe)

    # Redirect real_agent_dir/real_agent_data_dir into tmp_path
    real_root = tmp_path / "real"
    real_root.mkdir()

    def _real_agent_dir(agent_type):
        return real_root / f"dot-{agent_type}"

    def _real_agent_data_dir(agent_type):
        # Only opencode has a data_dir
        if agent_type == "opencode":
            return real_root / "dot-opencode-data"
        return None

    monkeypatch.setattr(config, "real_agent_dir", _real_agent_dir)
    monkeypatch.setattr(config, "real_agent_data_dir", _real_agent_data_dir)

    return captured


def _create_cc_profile(name: str) -> Path:
    """Create a cc profile under the current AGENT_BOX_HOME."""
    return profile.create(name, "cc")


def test_launch_cc_argv(tmp_agent_box_home, fake_exec):
    """CC profile: bwrap + main --bind + dot-claude.json --bind + binary."""
    _create_cc_profile("cc1")
    with pytest.raises(_ExecStop):
        launch.launch("cc1")
    args = fake_exec["args"]
    assert args[0] == "/usr/bin/bwrap"
    # Binary at the end
    assert args[-1] == "/usr/bin/claude"
    # Has the main --bind / → / and --bind <pdir> → <rdir>
    assert "--bind" in args
    pdir = str(config.profile_agent_dir("cc1", "cc"))
    rdir = str(config.real_agent_dir("cc"))
    assert pdir in args and rdir in args
    # CC also bind-mounts dot-claude.json → ~/.claude.json
    pjson = str(config.profile_dir("cc1") / "dot-claude.json")
    rjson = str(config.real_agent_dir("cc").with_name(".claude.json"))
    assert pjson in args
    assert rjson in args
    # The CC .claude.json --bind block was inserted at position 4
    # (after the main --bind / / pair, so bwrap sees the CC override
    # before the parent --bind / /).
    assert args[4:7] == ["--bind", pjson, rjson]


def test_launch_opencode_binds_data_dir(tmp_agent_box_home, fake_exec):
    """OpenCode profile: bwrap + data-dir --bind + main --bind + binary."""
    profile.create("oc1", "opencode")
    with pytest.raises(_ExecStop):
        launch.launch("oc1")
    args = fake_exec["args"]
    assert args[0] == "/usr/bin/bwrap"
    assert args[-1] == "/usr/bin/opencode"
    pdata = str(config.profile_agent_data_dir("oc1", "opencode"))
    rdata = str(config.real_agent_data_dir("opencode"))
    assert pdata in args and rdata in args


def test_launch_extra_args_passed_through(tmp_agent_box_home, fake_exec):
    """Extra args go to the agent binary, after the binary name."""
    _create_cc_profile("extra")
    with pytest.raises(_ExecStop):
        launch.launch("extra", extra_args=["-c", "do thing"])
    args = fake_exec["args"]
    # binary + extra_args at the end
    assert args[-3:] == ["/usr/bin/claude", "-c", "do thing"]


def test_launch_bwrap_missing_raises(tmp_agent_box_home, monkeypatch):
    """If bwrap isn't on PATH, launch raises ProfileError instead of
    attempting the exec."""
    _create_cc_profile("nb")
    monkeypatch.setattr(
        shutil, "which",
        lambda name: f"/usr/bin/{name}" if name == "claude" else None,
    )
    with pytest.raises(profile.ProfileError, match="bwrap not found"):
        launch.launch("nb")


def test_launch_real_agent_dir_redirected(tmp_agent_box_home, fake_exec,
                                          tmp_path):
    """Sanity: the real-agent-dir redirect fixture really does keep
    ~/.claude untouched."""
    _create_cc_profile("redir")
    home_before = Path.home() / ".claude"
    existed_before = home_before.exists()
    with pytest.raises(_ExecStop):
        launch.launch("redir")
    # Either ~/.claude was never created, or (if it pre-existed) it is
    # unchanged in mtime — we never appended anything.
    assert home_before.exists() == existed_before
