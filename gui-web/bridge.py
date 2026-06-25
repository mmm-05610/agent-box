"""
PyWebView Bridge — Exposes agent-box CLI to JavaScript.

Runs on Windows. Calls WSL agent-box CLI via subprocess.
Same pattern as the old gui/wsl.py.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import webview

AGENT_BOX_CMD = "agent-box"


def _wsl_run(cmd: str, timeout: float = 15) -> str:
    """Run a command via wsl.exe bash -lc and return stdout.

    Follows the same pattern as gui/wsl.py _wsl_run.
    """
    wsl = shutil.which("wsl.exe")
    if wsl is None:
        raise RuntimeError("wsl.exe not found in PATH (install WSL).")

    kwargs = {}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

    try:
        result = subprocess.run(
            [wsl, "bash", "-lc", cmd],
            capture_output=True,
            timeout=timeout,
            cwd="C:\\",
            **kwargs,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"wsl.exe command timed out: {exc}") from exc
    except OSError as exc:
        raise RuntimeError(f"failed to invoke wsl.exe: {exc}") from exc

    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            f"wsl command failed (exit {result.returncode}): {stderr or '<no stderr>'}"
        )
    return result.stdout.decode("utf-8", errors="replace").strip()


class Api:
    """JavaScript-accessible API via window.api."""

    # ── Providers ───────────────────────────────────────────────────────

    def list_providers(self, agent_type: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} provider list --type {agent_type} --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_provider(self, agent_type: str, provider_id: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} provider show {agent_type} {provider_id} --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def save_provider(self, agent_type: str, provider_id: str, settings_json: str) -> str:
        try:
            # Pipe JSON via stdin
            result = subprocess.run(
                [WSL_CMD, "bash", "-lc", f"{AGENT_BOX_CMD} provider upsert {agent_type} {provider_id}"],
                input=settings_json,
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr.strip())
            return json.dumps({"ok": True, "data": json.loads(result.stdout.strip())})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def delete_provider(self, agent_type: str, provider_id: str) -> str:
        try:
            _wsl_run(f"{AGENT_BOX_CMD} provider delete {agent_type} {provider_id}")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Claude.md ───────────────────────────────────────────────────────

    def list_claude_mds(self, agent_type: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} claude-md list --type {agent_type} --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_claude_md(self, agent_type: str, md_id: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} claude-md show {agent_type} {md_id} --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def save_claude_md(self, agent_type: str, md_id: str, content: str,
                       name: str = "", description: str = "") -> str:
        try:
            flags = ""
            if name:
                flags += f" --name {name}"
            if description:
                flags += f" --description {description}"
            result = subprocess.run(
                [WSL_CMD, "bash", "-lc",
                 f"{AGENT_BOX_CMD} claude-md upsert {agent_type} {md_id}{flags}"],
                input=content,
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr.strip())
            return json.dumps({"ok": True, "data": json.loads(result.stdout.strip())})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def delete_claude_md(self, agent_type: str, md_id: str) -> str:
        try:
            _wsl_run(f"{AGENT_BOX_CMD} claude-md delete {agent_type} {md_id}")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Profiles ────────────────────────────────────────────────────────

    def list_profiles(self) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} list --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_profile(self, name: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} show {name} --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def create_profile(self, name: str, agent_type: str,
                       display_name: str = "", description: str = "",
                       preset: str = "") -> str:
        try:
            flags = f" --type {agent_type}"
            if display_name:
                flags += f" --display-name {display_name}"
            if description:
                flags += f" --description {description}"
            if preset:
                flags += f" --preset {preset}"
            out = _wsl_run(f"{AGENT_BOX_CMD} create {name}{flags}")
            return json.dumps({"ok": True, "data": {"name": name, "agent_type": agent_type}})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def delete_profile(self, name: str) -> str:
        try:
            _wsl_run(f"{AGENT_BOX_CMD} delete {name} --force")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Sessions ────────────────────────────────────────────────────────

    def list_sessions(self) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} sessions --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def cleanup_sessions(self) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} sessions --cleanup")
            return json.dumps({"ok": True, "data": 0})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── File I/O ──────────────────────────────────────────────────────────

    def read_file(self, path: str) -> str:
        """Read a file from WSL and return its content. Returns empty string if file not found."""
        try:
            # Check if file exists first
            check = _wsl_run(f"test -f {path} && echo exists || echo missing")
            if "missing" in check:
                return json.dumps({"ok": True, "data": ""})
            content = _wsl_run(f"cat {path}")
            return json.dumps({"ok": True, "data": content})
        except Exception as e:
            return json.dumps({"ok": True, "data": ""})

    def list_dir(self, path: str) -> str:
        """List files in a directory. Returns empty string if directory not found."""
        try:
            # Check if directory exists first
            check = _wsl_run(f"test -d {path} && echo exists || echo missing")
            if "missing" in check:
                return json.dumps({"ok": True, "data": ""})
            out = _wsl_run(f"ls -la {path}")
            return json.dumps({"ok": True, "data": out})
        except Exception as e:
            return json.dumps({"ok": True, "data": ""})

    # ── Apply ───────────────────────────────────────────────────────────

    def apply_provider(self, profile_name: str, provider_id: str) -> str:
        try:
            _wsl_run(f"{AGENT_BOX_CMD} provider apply {profile_name} {provider_id}")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def apply_claude_md(self, profile_name: str, md_id: str) -> str:
        try:
            _wsl_run(f"{AGENT_BOX_CMD} claude-md apply {profile_name} {md_id}")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})


def main():
    api = Api()

    # Determine frontend URL
    # Priority: --url flag > --prod (built files) > localhost:5173 (dev server)
    url = "http://localhost:5173"

    if "--prod" in sys.argv:
        frontend_dir = Path(__file__).parent / "dist"
        if frontend_dir.exists():
            url = str(frontend_dir / "index.html")
            print(f"Loading built files from: {url}")
    elif "--url" in sys.argv:
        idx = sys.argv.index("--url")
        if idx + 1 < len(sys.argv):
            url = sys.argv[idx + 1]

    print(f"Loading frontend from: {url}")
    print(f"Bridge API available: {api}")

    window = webview.create_window(
        title="Agent Box",
        url=url,
        js_api=api,
        width=1280,
        height=800,
        min_size=(960, 600),
    )

    webview.start(debug="--debug" in sys.argv)


if __name__ == "__main__":
    main()
