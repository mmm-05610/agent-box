"""CLI integration tests — full cmd2 REPL exec mode.

Covers every command in both global and profile contexts.
Uses ``_exec()`` to run commands and assert on output.
"""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile

import pytest

from agent_box.cli.commands.core import CoreCommands
from agent_box.cli.shell import AgentBoxShell
from agent_box.resources import profile, sessions


# ── test helper ──────────────────────────────────────────────────────────────

def _exec(*lines: str) -> str:
    """Run REPL commands and capture poutput + perror."""
    out, err = io.StringIO(), io.StringIO()
    app = AgentBoxShell(stdout=out)
    app.register_command_set(CoreCommands())
    old_err = sys.stderr
    sys.stderr = err
    try:
        for line in lines:
            app.onecmd(line.strip())
    finally:
        sys.stderr = old_err
    return out.getvalue() + err.getvalue()


def _setup_profile(name: str = "t", agent_type: str = "claude") -> None:
    """Create a profile for testing.  Avoids the REPL for speed."""
    try:
        profile.delete(name, force=True)
    except Exception:
        pass
    profile.create(name, agent_type)


# ── global: list ─────────────────────────────────────────────────────────────

def test_list_profiles_empty(tmp_agent_box_home):
    out = _exec("list profiles")
    assert "no profiles" in out.lower()


def test_list_profiles_table(tmp_agent_box_home):
    _setup_profile("a", "claude")
    _setup_profile("b", "codex")
    out = _exec("list profiles")
    assert "a" in out and "claude" in out
    assert "b" in out and "codex" in out


def test_list_profiles_type_filter(tmp_agent_box_home):
    _setup_profile("a", "claude")
    _setup_profile("b", "codex")
    out = _exec("list profiles --type claude")
    assert "a" in out and "b" not in out


def test_list_profiles_json(tmp_agent_box_home):
    _setup_profile("a", "claude")
    out = _exec("list profiles --json")
    data = json.loads(out.strip())
    assert isinstance(data, list)
    assert data[0]["name"] == "a"


def test_list_sessions_empty(tmp_agent_box_home):
    out = _exec("list sessions")
    assert "no sessions" in out.lower()


def test_list_sessions_unknown_args_hint(tmp_agent_box_home):
    out = _exec("list sessions --exit 5")
    assert "moved to the sessions command" in out


def test_list_sessions_json(tmp_agent_box_home):
    sessions.record_launch("p", "claude", "/x", "test", os.getpid())
    out = _exec("list sessions --json")
    data = json.loads(out.strip())
    assert isinstance(data, list)
    assert data[0]["profile"] == "p"


def test_list_sessions_active(tmp_agent_box_home):
    a = sessions.record_launch("a", "claude", "/x", "test", 1)
    b = sessions.record_launch("b", "claude", "/y", "test", os.getpid())
    sessions.record_exit(a, 0)
    out = _exec("list sessions --active --json")
    data = json.loads(out.strip())
    assert len(data) == 1
    assert data[0]["profile"] == "b"


def test_list_presets_all(tmp_agent_box_home):
    out = _exec("list presets")
    # "python-dev" should exist as shipped preset
    assert "python-dev" in out


def test_list_presets_type_filter(tmp_agent_box_home):
    out = _exec("list presets --type claude --json")
    data = json.loads(out.strip())
    assert "claude" in data


# ── global: create / delete ─────────────────────────────────────────────────

def test_create_and_delete(tmp_agent_box_home):
    out = _exec(
        "create mycc --type claude --display-name Test --description desc",
        "list profiles",
    )
    assert "mycc" in out
    assert "claude" in out

    meta = profile.load_meta("mycc")
    assert meta["display_name"] == "Test"
    assert meta["description"] == "desc"

    out = _exec("delete mycc --force")
    assert "deleted" in out

    with pytest.raises(profile.ProfileError):
        profile.load_meta("mycc")


def test_create_with_prompt_file(tmp_agent_box_home):
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".md", delete=False
    ) as f:
        f.write("# Hello\n")
        prompt_path = f.name
    try:
        _exec(f"create t --type claude --prompt {prompt_path}")
        meta = profile.load_meta("t")
        assert meta["prompt"] == "# Hello\n"
    finally:
        profile.delete("t", force=True)
        os.unlink(prompt_path)


def test_create_duplicate_fails(tmp_agent_box_home):
    _setup_profile("dup", "claude")
    out = _exec("create dup --type claude")
    assert "already exists" in out.lower()


def test_delete_nonexistent(tmp_agent_box_home):
    out = _exec("delete nope --force")
    assert "not found" in out.lower()


# ── global: show ─────────────────────────────────────────────────────────────

def test_show_global_overview(tmp_agent_box_home):
    _setup_profile("a", "claude")
    _setup_profile("b", "codex")
    out = _exec("show")
    assert "2 profile(s)" in out
    assert "claude: 1" in out and "codex: 1" in out


def test_show_global_overview_json(tmp_agent_box_home):
    _setup_profile("a", "claude")
    out = _exec("show --json")
    data = json.loads(out.strip())
    assert data["profile_count"] == 1


def test_show_profile_detail(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("show mycc")
    assert "mycc" in out and "claude" in out
    assert "config_dir" in out


def test_show_nonexistent(tmp_agent_box_home):
    out = _exec("show nope")
    assert "not found" in out.lower()


# ── global: sessions mutations ───────────────────────────────────────────────

def test_sessions_exit_records(tmp_agent_box_home):
    sid = sessions.record_launch("p", "claude", "/x", "test", os.getpid())
    out = _exec(f"sessions --exit {sid} 42")
    assert "ok" in out
    rows = sessions.fetch_sessions()
    assert rows[0]["exit_code"] == 42


def test_sessions_exit_requires_code(tmp_agent_box_home):
    out = _exec("sessions --exit 1")
    assert "requires an exit code" in out


def test_sessions_cleanup(tmp_agent_box_home):
    sessions.record_launch("a", "claude", "/x", "test", 999_999_999)
    sessions.record_launch("b", "claude", "/x", "test", 999_999_998)
    out = _exec("sessions --cleanup")
    assert "2" in out


def test_sessions_no_args_shows_usage(tmp_agent_box_home):
    out = _exec("sessions")
    assert "no action specified" in out.lower()


# ── global: launch / configure (skipped in test — needs bwrap + $EDITOR) ───

def test_launch_requires_name_in_global(tmp_agent_box_home):
    out = _exec("launch")
    assert "specify a profile name" in out.lower()


def test_configure_requires_name_in_global(tmp_agent_box_home):
    out = _exec("configure")
    assert "specify a profile name" in out.lower()


# ── context: use / back ─────────────────────────────────────────────────────

def test_use_enters_context(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("use mycc")
    assert "switched to profile" in out


def test_use_nonexistent(tmp_agent_box_home):
    out = _exec("use nope")
    assert "not found" in out.lower()


def test_back_in_global_is_noop(tmp_agent_box_home):
    out = _exec("back")
    assert "only available in a profile context" in out.lower()


def test_use_then_back(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("use mycc", "back")
    assert "switched" in out
    assert "back to global scope" in out


# ── context: show / options ─────────────────────────────────────────────────

def test_show_in_context(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("use mycc", "show")
    assert "mycc" in out and "config_dir" in out


def test_show_options_in_context(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("use mycc", "show options")
    assert "Profile:" in out or "Hooks:" in out


def test_show_other_profile_in_context(tmp_agent_box_home):
    _setup_profile("a", "claude")
    _setup_profile("b", "codex")
    out = _exec("use a", "show b")
    assert "b" in out and "codex" in out


def test_options_in_context(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("use mycc", "options")
    assert "Hooks:" in out


# ── context: list providers / mcp ───────────────────────────────────────────

def test_list_providers_in_context_empty(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("use mycc", "list providers")
    assert "no providers" in out.lower()


def test_list_mcp_in_context_empty(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("use mycc", "list mcp")
    assert "no mcp servers" in out.lower()


def test_list_providers_in_global_fails(tmp_agent_box_home):
    out = _exec("list providers")
    assert "not available in global scope" in out.lower()


def test_list_mcp_in_global_fails(tmp_agent_box_home):
    out = _exec("list mcp")
    assert "not available in global scope" in out.lower()


# ── context: apply / remove — not available in test (needs ACS) ─────────────

def test_apply_in_global_fails(tmp_agent_box_home):
    # cmd2 doesn't register apply/remove in global scope — command not found
    out = _exec("apply provider minimax")
    assert "only available in a profile context" in out.lower()


def test_remove_in_global_fails(tmp_agent_box_home):
    out = _exec("remove provider minimax")
    assert "only available in a profile context" in out.lower()


# ── help ─────────────────────────────────────────────────────────────────────

def test_help_global(tmp_agent_box_home):
    out = _exec("help")
    assert "list" in out and "show" in out
    assert "create" in out and "delete" in out
    assert "use" in out and "launch" in out
    # Must NOT show disabled built-ins
    assert "alias" not in out.lower().split("\n")[0]


def test_help_context(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("use mycc", "help")
    assert "apply" in out or "remove" in out


# ── context commands blocked in global ───────────────────────────────────────

def test_apply_not_available_in_global(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("apply provider minimax")
    assert "only available in a profile context" in out.lower()


def test_remove_not_available_in_global(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("remove provider minimax")
    assert "only available in a profile context" in out.lower()


def test_hooks_not_available_in_global(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec("hooks show")
    assert "only available in a profile context" in out.lower()


# ── configure context-aware ─────────────────────────────────────────────────

def test_configure_in_context_defaults_to_current(tmp_agent_box_home):
    _setup_profile("mycc", "claude")
    out = _exec(
        "use mycc",
        "configure --display-name Renamed",
        "show",
    )
    assert "Renamed" in out
    assert "updated profile" in out


# ── launch context-aware ────────────────────────────────────────────────────

def test_launch_in_context_uses_current(tmp_agent_box_home):
    """launch without name in context should use current profile.
    Cannot test end-to-end because launch actually executes bwrap + agent binary.
    We test the profile resolution by checking that 'launch' (no args)
    in context does NOT produce the 'specify a profile name' error.
    This test is skipped when bwrap is available (it would actually execute)."""
    import shutil
    if shutil.which("bwrap") and shutil.which("claude"):
        pytest.skip("bwrap + claude available — would actually launch")

    _setup_profile("mycc", "claude")
    out = _exec("use mycc", "launch")
    assert "specify a profile name" not in out.lower()


def test_launch_double_dash_extra_args_in_context(tmp_agent_box_home, monkeypatch):
    """`launch -- -c do thing` in context passes `-c do thing` to the agent."""
    captured = {}

    def fake_launch(name, extra_args=None):
        captured["name"] = name
        captured["extra"] = extra_args

    monkeypatch.setattr("agent_box.launch.launch", fake_launch)
    _setup_profile("mycc", "claude")
    out = _exec("use mycc", "launch -- -c do thing")
    assert "specify a profile name" not in out.lower()
    assert captured["name"] == "mycc"
    assert captured["extra"] == ["-c", "do", "thing"]


def test_launch_double_dash_with_explicit_name(tmp_agent_box_home, monkeypatch):
    """`launch mycc -- -c do thing` keeps name and passes extra args."""
    captured = {}

    def fake_launch(name, extra_args=None):
        captured["name"] = name
        captured["extra"] = extra_args

    monkeypatch.setattr("agent_box.launch.launch", fake_launch)
    _setup_profile("mycc", "claude")
    _exec("launch mycc -- -c do thing")
    assert captured["name"] == "mycc"
    assert captured["extra"] == ["-c", "do", "thing"]


# ── exec mode (script via run_exec) ──────────────────────────────────────────

def test_exec_script_chain(tmp_agent_box_home):
    """Full lifecycle via run_exec()."""
    from agent_box.cli.shell import run_exec

    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        run_exec(
            "create chain-test --type claude;"
            "use chain-test;"
            "show;"
            "options;"
            "back;"
            "delete chain-test --force"
        )
    finally:
        sys.stdout = old_stdout

    # Cleanup in case exec failed — don't leave test cruft
    try:
        profile.delete("chain-test", force=True)
    except Exception:
        pass


def test_exec_reads_stdin(tmp_agent_box_home, monkeypatch, capsys):
    """`agent-box exec` with no script arg reads the script from stdin."""
    from agent_box.cli import cmd_exec
    import argparse

    monkeypatch.setattr("sys.stdin", io.StringIO("list profiles"))
    rc = cmd_exec(argparse.Namespace(script=None))
    assert rc == 0


def test_exec_no_script_or_stdin(tmp_agent_box_home, monkeypatch, capsys):
    """`agent-box exec` with neither arg nor stdin reports an error."""
    from agent_box.cli import cmd_exec
    import argparse

    monkeypatch.setattr("sys.stdin", io.StringIO(""))
    rc = cmd_exec(argparse.Namespace(script=None))
    assert rc == 2
    assert "no script given" in capsys.readouterr().err


# ── REPL banner ──────────────────────────────────────────────────────────────

def test_repl_banner_present(tmp_agent_box_home):
    from agent_box import __version__, config

    app = AgentBoxShell(stdout=io.StringIO())
    assert config.DISPLAY_NAME in app.intro
    assert __version__ in app.intro
    assert "agent types" in app.intro
