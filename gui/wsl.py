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

import base64
import json
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from tkinter import filedialog
from typing import Any, Dict, List, Optional, Tuple



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

# Cached result of resolve_profile_root() — shells WSL once per process.
_PROFILE_ROOT_CACHE: Optional[str] = None

# Cached fetch_presets() results per agent_type. Presets are package-data
# that don't change at runtime, so caching is safe for the process lifetime.
_PRESETS_CACHE: Dict[str, List[Dict[str, str]]] = {}


# ---------------------------------------------------------------------------
# WSL subprocess helper
# ---------------------------------------------------------------------------

_WSL_TIMEOUT = 15
_WSL_DEFAULT_TIMEOUT = 15
_WSL_SHORT_TIMEOUT = 10


def _wsl_run(cmd: str, *,
             timeout: float = _WSL_DEFAULT_TIMEOUT,
             input_data: bytes | None = None,
             check: bool = False) -> subprocess.CompletedProcess:
    """Run *cmd* via ``wsl.exe bash -lc`` and return the CompletedProcess.

    Raises ``RuntimeError`` if ``wsl.exe`` is missing or the subprocess
    call itself fails (timeout / OSError).  Does NOT check ``returncode``
    unless *check* is True — callers inspect the result themselves.
    """
    wsl = shutil.which("wsl.exe")
    if wsl is None:
        raise RuntimeError("wsl.exe not found in PATH (install WSL).")

    kwargs: Dict[str, Any] = {}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

    try:
        result = subprocess.run(
            [wsl, "bash", "-lc", cmd],
            capture_output=True,
            timeout=timeout,
            cwd="C:\\",
            input=input_data,
            **kwargs,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"wsl.exe command timed out: {exc}") from exc
    except OSError as exc:
        raise RuntimeError(f"failed to invoke wsl.exe: {exc}") from exc
    if check and result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            f"wsl command failed (exit {result.returncode}): "
            f"{stderr or '<no stderr>'}"
        )
    return result


def _wsl_check_output(cmd: str, *, timeout: float = _WSL_DEFAULT_TIMEOUT) -> str:
    """Run *cmd* and return stdout. Raises RuntimeError on any failure."""
    proc = _wsl_run(cmd, timeout=timeout)
    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            f"wsl command failed (exit {proc.returncode}): "
            f"{stderr or '<no stderr>'}"
        )
    return proc.stdout.decode("utf-8", errors="replace").strip()


def _wsl_try_output(cmd: str, *, timeout: float = _WSL_DEFAULT_TIMEOUT) -> Optional[str]:
    """Run *cmd* and return stdout, or None on any failure."""
    try:
        proc = _wsl_run(cmd, timeout=timeout)
        if proc.returncode != 0:
            return None
        return proc.stdout.decode("utf-8", errors="replace").strip()
    except RuntimeError:
        return None


# ---------------------------------------------------------------------------
# Health check + dependency install
# ---------------------------------------------------------------------------

def health_check() -> List[Tuple[str, str]]:
    """Verify WSL-side prerequisites. Returns a list of (description, fix_cmd)
    tuples, or an empty list if everything is ready."""
    problems: List[Tuple[str, str]] = []
    if _wsl_try_output("which bwrap") is None:
        problems.append(("bubblewrap 未安装", "sudo apt install -y bubblewrap"))
    try:
        _wsl_check_output("agent-box --version")
    except RuntimeError:
        problems.append(("agent-box CLI 未安装", "pip install --break-system-packages agent-box"))
    return problems


def install_dependency(cmd: str) -> bool:
    """Run an install command in WSL in a visible console window.

    Uses ``CREATE_NEW_CONSOLE`` so the user can interact (e.g. type a
    sudo password). Runs ``cmd`` then pauses so the user can read the
    output before the window closes.
    """
    wsl = shutil.which("wsl.exe") or r"C:\Windows\System32\wsl.exe"
    script = f"{cmd} && echo SUCCESS || echo FAILED; read -p '按Enter关闭...'"
    try:
        subprocess.Popen(
            [wsl, "bash", "-lc", script],
            cwd="C:\\",
            creationflags=subprocess.CREATE_NEW_CONSOLE
            if sys.platform == "win32" else 0,
        )
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Profile root resolution
# ---------------------------------------------------------------------------

def resolve_profile_root() -> str:
    """Return the WSL-side absolute path to the profiles directory.

    Asks WSL once (uses the CLI's own ``agent_box.config.profiles_dir`` so
    ``AGENT_BOX_HOME`` is honored exactly like the CLI does). Caches the
    result for the lifetime of this Python process.
    """
    global _PROFILE_ROOT_CACHE
    if _PROFILE_ROOT_CACHE is not None:
        return _PROFILE_ROOT_CACHE

    root = _wsl_check_output(
        'python3 -c "from agent_box.config import profiles_dir; print(profiles_dir())"'
    )
    if not root:
        raise RuntimeError("profile-root lookup returned empty path")
    _PROFILE_ROOT_CACHE = root
    return root


# ---------------------------------------------------------------------------
# Profile fetch / list from CLI
# ---------------------------------------------------------------------------

def fetch_profiles() -> List[Dict[str, str]]:
    """Return profiles from ``wsl.exe agent-box list --json``."""
    raw = _wsl_check_output("agent-box list --json")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON from agent-box list: {exc}") from exc
    if not isinstance(data, list):
        raise RuntimeError("agent-box list --json did not return a JSON array")
    return data


def fetch_presets(agent_type: str) -> List[Dict[str, str]]:
    """Return presets for *agent_type* (cached). Returns empty list on any error."""
    if agent_type in _PRESETS_CACHE:
        return _PRESETS_CACHE[agent_type]

    raw = _wsl_try_output(
        f"agent-box presets --type {_shell_quote(agent_type)} --json"
    )
    if raw is None:
        _PRESETS_CACHE[agent_type] = []
        return []

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        _PRESETS_CACHE[agent_type] = []
        return []

    names: List[str] = data.get(agent_type, []) if isinstance(data, dict) else []
    cards: List[Dict[str, str]] = []
    for name in names:
        cards.append({
            "name": name,
            "title": name.replace("-", " ").replace("_", " ").title(),
            "sub": "CLAUDE.md preset",
        })
    _PRESETS_CACHE[agent_type] = cards
    return cards


# ---------------------------------------------------------------------------
# Profile CRUD
# ---------------------------------------------------------------------------

def create_profile(
    name: str,
    agent_type: str = "cc",
    *,
    preset: Optional[str] = None,
    display_name: Optional[str] = None,
    description: Optional[str] = None,
    provider: Optional[str] = None,
) -> bool:
    """Create a new agent-box profile. Returns True on success."""
    cmd = f"agent-box create {_shell_quote(name)} --type {_shell_quote(agent_type)}"
    if preset:
        cmd += f" --preset {_shell_quote(preset)}"
    if display_name:
        cmd += f" --display-name {_shell_quote(display_name)}"
    if description:
        cmd += f" --description {_shell_quote(description)}"
    if provider:
        cmd += f" --provider {_shell_quote(provider)}"
    _wsl_check_output(cmd)
    return True


def delete_profile(name: str) -> bool:
    """Delete an agent-box profile. Returns True on success."""
    _wsl_check_output(f"agent-box delete {_shell_quote(name)} --force")
    return True


# ---------------------------------------------------------------------------
# File I/O (read / write across WSL boundary)
# ---------------------------------------------------------------------------

def read_file(wsl_path: str) -> Optional[str]:
    """Read a file from WSL. Returns content or None on failure."""
    return _wsl_try_output(f"cat {_shell_quote(wsl_path)}", timeout=_WSL_SHORT_TIMEOUT)


def save_file(wsl_path: str, content: str) -> bool:
    """Write *content* to a file in WSL using base64 (safe for any byte sequence)."""
    encoded = base64.b64encode(content.encode("utf-8"))
    _wsl_run(
        f"base64 -d > {_shell_quote(wsl_path)}",
        input_data=encoded,
        timeout=_WSL_SHORT_TIMEOUT,
        check=True,
    )
    return True


# ---------------------------------------------------------------------------
# Sessions (CLI-backed session tracking)
# ---------------------------------------------------------------------------

def fetch_sessions(active_only: bool = False, limit: int = 50) -> List[Dict[str, Any]]:
    """Return sessions from the WSL-side ``agent-box sessions`` command.

    *active_only* drops the exit columns; *limit* caps the number of
    rows returned (the CLI defaults to 50).
    """
    flag = " --active" if active_only else ""
    raw = _wsl_check_output(
        f"agent-box sessions{flag} --json", timeout=_WSL_DEFAULT_TIMEOUT,
    )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON from agent-box sessions: {exc}") from exc
    if not isinstance(data, list):
        raise RuntimeError("agent-box sessions --json did not return a JSON array")
    if limit and len(data) > limit:
        data = data[:limit]
    return data


def sessions_cleanup() -> int:
    """Run ``agent-box sessions --cleanup``; return the number of stale sessions reaped."""
    out = _wsl_check_output("agent-box sessions --cleanup")
    try:
        return int(out.strip())
    except ValueError as exc:
        raise RuntimeError(f"agent-box sessions --cleanup returned non-int: {out!r}") from exc


def sessions_record_exit(session_id: int, exit_code: int) -> None:
    """Record an agent exit on the CLI side (``agent-box sessions --exit``)."""
    _wsl_check_output(f"agent-box sessions --exit {int(session_id)} {int(exit_code)}")


# ---------------------------------------------------------------------------
# Launch
# ---------------------------------------------------------------------------

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


def _latest_active_session_for(name: str) -> Optional[int]:
    """Return the newest active session_id matching *name*, or None.

    The CLI side records the launch synchronously inside ``agent-box
    launch``, but the GUI's watcher can't see that pid (the new console
    swallows stdout). We re-query ``agent-box sessions --active --json``
    to find the row that the CLI just inserted.
    """
    try:
        rows = fetch_sessions(active_only=True)
    except RuntimeError:
        return None
    for r in rows:
        if r.get("profile") == name:
            return int(r["id"])
    return None


def launch_profile(name: str, agent_type: str, mode: str, cwd: str = "") -> int:
    """Spawn a new console window. Returns the session id (or 0 if unknown).

    The CLI side (``agent-box launch``) records the launch to sessions.db
    before exec'ing bwrap, so the GUI does not need to insert a row.
    A daemon watcher thread polls the bwrap process and calls
    ``agent-box sessions --exit <id> <code>`` when it terminates.
    """
    argv = build_launch_argv(name, agent_type, mode, cwd)
    kwargs: Dict[str, Any] = dict(close_fds=True, cwd="C:\\")
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
    proc = subprocess.Popen(argv, **kwargs)

    # The CLI may take a moment to record the launch. Poll briefly.
    sid: Optional[int] = None
    for _ in range(10):
        sid = _latest_active_session_for(name)
        if sid is not None:
            break
        time.sleep(0.1)

    def _watch_exit() -> None:
        exit_code = proc.wait()
        if sid is not None:
            try:
                sessions_record_exit(sid, exit_code)
            except RuntimeError:
                # WSL call failed — leave the session marked active;
                # the next cleanup_stale_sessions() pass will reap it.
                pass

    threading.Thread(target=_watch_exit, daemon=True).start()
    return sid if sid is not None else 0


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
    """Open a Windows directory picker and convert the result to a WSL path."""
    if initial is None:
        initial = "\\\\wsl$\\Ubuntu\\home\\maoqh\\projects"
    path = filedialog.askdirectory(initialdir=initial, title="Select project directory")
    if path:
        cwd_var.set(to_wsl_path(path))


def _shell_quote(token: str) -> str:
    if token == "" or any(ch in token for ch in (" ", "\t", '"', "'", "\\", "$", "`", "\n")):
        return "'" + token.replace("'", "'\"'\"'") + "'"
    return token


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

__all__ = [
    "AGENT_ORDER",
    "LAUNCH_MODES",
    "MODE_NEW",
    "MODE_RESUME",
    "RESUME_ARGS",
    "browse_dir",
    "build_launch_argv",
    "create_profile",
    "delete_profile",
    "fetch_presets",
    "fetch_profiles",
    "launch_profile",
    "sessions_cleanup",
    "sessions_record_exit",
    "read_file",
    "resolve_profile_root",
    "save_file",
    "to_wsl_path",
]
