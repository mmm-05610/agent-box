"""WSL / agent-box CLI integration.

Wraps the cross-boundary calls between Windows (where the GUI runs)
and the WSL distro (where ``agent-box`` itself runs).

Responsibilities:
- Listing profiles (``agent-box list --json``)
- Building the launch argv that opens a new console window
- Converting Windows-style paths to WSL paths for the cwd picker
- Spawning the agent process and tracking its lifecycle
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from tkinter import filedialog
from typing import Any, Dict, List, Optional, Tuple

from .state import record_exit, record_launch


# ---------------------------------------------------------------------------
# Agent-type → resume-args mapping
# ---------------------------------------------------------------------------

AGENT_ORDER: Tuple[str, ...] = ("cc", "codex", "hermes", "opencode")

# None == "新会话" (no resume args passed to the agent)
RESUME_ARGS: Dict[str, Optional[Tuple[str, ...]]] = {
    "cc":       ("--continue",),
    "codex":    ("resume", "--last"),
    "hermes":   ("-c",),
    "opencode": None,
}

MODE_NEW    = "新会话"
MODE_RESUME = "继续上次"
LAUNCH_MODES = (MODE_NEW, MODE_RESUME)


# ---------------------------------------------------------------------------
# WSL subprocess calls
# ---------------------------------------------------------------------------

def fetch_profiles() -> List[Dict[str, str]]:
    """Return profiles from ``wsl.exe agent-box list --json``.

    Raises RuntimeError on any failure so the caller can surface a status.
    """
    wsl = shutil.which("wsl.exe")
    if wsl is None:
        raise RuntimeError("wsl.exe not found in PATH (install WSL).")
    try:
        proc = subprocess.run(
            [wsl, "bash", "-lc", "agent-box list --json"],
            capture_output=True,
            text=True,
            timeout=15,
            cwd="C:\\",
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("wsl.exe agent-box list --json timed out") from exc
    except OSError as exc:
        raise RuntimeError(f"failed to invoke wsl.exe: {exc}") from exc

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        raise RuntimeError(
            f"agent-box list failed (exit {proc.returncode}): "
            f"{stderr or '<no stderr>'}"
        )
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON from agent-box list: {exc}") from exc
    if not isinstance(data, list):
        raise RuntimeError("agent-box list --json did not return a JSON array")
    return data


def build_launch_argv(name: str, agent_type: str, mode: str,
                      cwd: str = "") -> List[str]:
    """Build the argv passed to ``subprocess.Popen`` to launch a profile."""
    argv: List[str] = ["agent-box", "launch", name]
    if mode == MODE_RESUME and agent_type in RESUME_ARGS:
        extra = RESUME_ARGS[agent_type]
        if extra:
            argv.extend(extra)
    cmdline = " ".join(_shell_quote(a) for a in argv)
    setup = 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"'
    if cwd:
        setup = f"cd {_shell_quote(cwd)} && {setup}"
    script = (
        f"{setup} && {cmdline} || "
        "{ ec=$?; echo; echo agent-box failed code $ec; read -p Enter...; }"
    )
    return ["wsl.exe", "bash", "-lc", script]


def launch_profile(name: str, agent_type: str, mode: str, cwd: str = "") -> int:
    """Spawn a new console window. Records to sessions.db, listens for exit."""
    argv = build_launch_argv(name, agent_type, mode, cwd)
    kwargs: Dict[str, Any] = dict(close_fds=True, cwd="C:\\")
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
    proc = subprocess.Popen(argv, **kwargs)
    sid = record_launch(name, agent_type, cwd, mode, proc.pid)

    def _watch_exit() -> None:
        exit_code = proc.wait()
        record_exit(sid, exit_code)

    threading.Thread(target=_watch_exit, daemon=True).start()
    return proc.pid


# ---------------------------------------------------------------------------
# Path conversion / shell quoting
# ---------------------------------------------------------------------------

def to_wsl_path(windows_path: str) -> str:
    """Convert a Windows path (drive letter or WSL UNC) to a WSL path."""
    p = windows_path.replace("\\", "/")
    for prefix in ("//wsl$/Ubuntu/", "//wsl.localhost/Ubuntu/"):
        if p.startswith(prefix) or p.startswith(prefix.lstrip("/")):
            idx = p.find("/Ubuntu/")
            if idx != -1:
                return p[idx + len("/Ubuntu"):]
    if len(p) >= 2 and p[1] == ":":
        drive = p[0].lower()
        rest = p[2:]
        return f"/mnt/{drive}{rest}"
    return p


def browse_dir(cwd_var, initial: Optional[str] = None) -> None:
    """Open a Windows directory picker and convert the result to a WSL path.

    ``cwd_var`` is any object with a ``.set(value)`` method (typically a
    ``tk.StringVar`` from the calling widget). ``initial`` defaults to the
    standard WSL projects root when not supplied.
    """
    if initial is None:
        initial = "\\\\wsl$\\Ubuntu\\home\\maoqh\\projects"
    path = filedialog.askdirectory(initialdir=initial, title="Select project directory")
    if path:
        cwd_var.set(to_wsl_path(path))


def _shell_quote(token: str) -> str:
    if token == "" or any(ch in token for ch in (" ", "\t", '"', "'", "\\", "$", "`", "\n")):
        return "'" + token.replace("'", "'\"'\"'") + "'"
    return token


__all__ = [
    "AGENT_ORDER",
    "LAUNCH_MODES",
    "MODE_NEW",
    "MODE_RESUME",
    "RESUME_ARGS",
    "browse_dir",
    "build_launch_argv",
    "fetch_profiles",
    "launch_profile",
    "to_wsl_path",
]