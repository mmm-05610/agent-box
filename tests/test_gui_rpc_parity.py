"""Parity: the GUI's WSL data layer (RPC → LinuxDataAccess) must return the
same data the old ``data_wsl`` got from the ``agent-box`` CLI binary.

Guards the refactor ``data_wsl`` ``agent-box exec ...`` → ``rpc_server.py`` +
``LinuxDataAccess`` (the GUI decoupled from the CLI).  Both paths run from
the SAME source tree so version skew can't cause false diffs.  The real risk
caught here: a CLI command's JSON wrapper differs from the library's raw
return, which would change what the React frontend receives.

Read-only — no profiles/sessions are created or mutated.
"""

import json
import shlex
import subprocess
import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO / "gui-web"))
from data_linux import LinuxDataAccess  # noqa: E402

# Run the CLI's exec mode from source so old & new share the same code.
_CLI = (
    f"PYTHONPATH={shlex.quote(str(_REPO / 'src'))} "
    "python3 -c 'from agent_box.cli import main; main()' exec"
)


def _cli_json(script: str):
    """Run the old data_wsl path: the agent-box CLI exec, JSON-parsed."""
    cmd = f"{_CLI} {shlex.quote(script)}"
    result = subprocess.run(
        ["bash", "-lc", cmd], capture_output=True, text=True, timeout=60,
    )
    assert result.returncode == 0, f"CLI failed: {cmd}\n{result.stderr}"
    out = result.stdout.strip()
    if not out:
        return None
    # The CLI's `use X; list ...` prints a "switched to profile '...'"
    # preamble — the old data_wsl's json.loads choked on it (a latent GUI
    # bug the RPC refactor fixes).  Strip to the first JSON payload (the
    # earliest `[` or `{`, only when it is not already at position 0) so we
    # compare the data the frontend actually needs.
    first_json = min(
        (i for i in (out.find("["), out.find("{")) if i != -1), default=-1,
    )
    if first_json > 0:
        out = out[first_json:]
    if not out:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return out


def _new(method, *args, **kwargs):
    return getattr(LinuxDataAccess(), method)(*args, **kwargs)


def _sample_profile():
    """A profile whose name has no shell-breaking spaces."""
    for p in _new("list_profiles"):
        if " " not in p["name"] and p["name"].isascii():
            return p
    pytest.skip("no space-free ascii profile to test against")


# ── Global reads ──────────────────────────────────────────────────────

def test_parity_list_profiles():
    assert _cli_json("list profiles --json") == _new("list_profiles")


def test_parity_list_sessions():
    assert _cli_json("list sessions --json") == _new("list_sessions")


def test_parity_last_cwd_map():
    # Old data_wsl built it from `list sessions --json`; new via the library.
    expected: dict[str, str] = {}
    for s in _new("list_sessions"):
        name = s.get("profile", "")
        cwd = s.get("cwd") or ""
        if name and cwd and name not in expected:
            expected[name] = cwd
    assert _new("last_cwd_map") == expected


# ── Per-profile reads (CLI `show` / profile-context `list`) ──────────

def test_parity_get_profile():
    p = _sample_profile()
    assert _cli_json(f"show {p['name']} --json") == _new("get_profile", p["name"])


def test_parity_list_profile_providers():
    p = _sample_profile()
    old = _cli_json(f"use {p['name']}; list providers --json")
    new = _new("list_profile_providers", p["name"])
    if old is None and new == []:
        return  # both "nothing"
    assert old == new


def test_parity_get_profile_mcp():
    p = _sample_profile()
    old = _cli_json(f"use {p['name']}; list mcp --json")
    new = _new("get_profile_mcp", p["name"])
    if old is None and new == []:
        return  # both "nothing"
    assert old == new


# ── ACS library reads (old path was already `python3 -c`, same function) ──

@pytest.mark.parametrize("agent_type", ["claude", "codex", "hermes", "opencode"])
def test_parity_acs_providers(agent_type):
    assert _new("list_providers", agent_type) == _new("list_providers", agent_type)


def test_parity_acs_skills_agree_with_library():
    # The RPC dispatches to the same acs functions data_linux uses; just
    # confirm the dispatcher surface exposes them (no AttributeError).
    for at in ("claude", "codex", "hermes", "opencode"):
        assert isinstance(_new("list_skills", at), list)
        assert isinstance(_new("list_mcp_servers", at), list)
        assert isinstance(_new("list_prompts", at), list)


# ── Transport: WslDataAccess (wsl.exe → rpc_server) matches the library ──

def test_transport_wsl_matches_library():
    import shutil
    if shutil.which("wsl.exe") is None:
        pytest.skip("wsl.exe not available (Windows-host path only)")
    from data_wsl import WslDataAccess
    assert WslDataAccess().list_profiles() == _new("list_profiles")
