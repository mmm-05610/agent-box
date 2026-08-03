"""PyWebView Bridge — exposes agent-box to JavaScript.

Environment-agnostic shell. Picks the right DataAccess at startup:
  Windows host → WslDataAccess (wsl.exe bridge)
  Linux/WSL    → LinuxDataAccess (direct import)
"""

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import webview

from data_linux import LinuxDataAccess
from data_wsl import WslDataAccess


# ── Platform helpers ─────────────────────────────────────────────────

def _is_windows() -> bool:
    """True when bridge.py runs under Windows Python (Windows host mode)."""
    return sys.platform == "win32"


# ── API ───────────────────────────────────────────────────────────────


class Api:
    """JavaScript-accessible API via window.api."""

    def __init__(self, data):
        self._data = data  # LinuxDataAccess | WslDataAccess

    # ── Agent types ──────────────────────────────────────────────────

    def get_agent_configs(self) -> str:
        """Return the full agent-type registry (identity/runtime/resources).

        No frontend-specific filtering — consumers read what they need.
        """
        try:
            from agent_box.core.library import get_agent_config, get_agent_types
            registry = {
                at: get_agent_config(at) for at in get_agent_types()
            }
            return json.dumps({"ok": True, "data": registry})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_default_agent(self) -> str:
        """The backend's default agent type (config.DEFAULT_AGENT_TYPE)."""
        try:
            from agent_box import config
            return json.dumps({"ok": True, "data": config.DEFAULT_AGENT_TYPE})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_version(self) -> str:
        """The agent-box backend version (agent_box.__version__)."""
        try:
            from agent_box import __version__
            return json.dumps({"ok": True, "data": __version__})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Profiles ─────────────────────────────────────────────────────

    def list_profiles(self) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.list_profiles()})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_profile(self, name: str) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.get_profile(name)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def create_profile(
        self, name: str, agent_type: str,
        display_name: str = "", description: str = "", preset: str = "",
    ) -> str:
        try:
            return json.dumps({
                "ok": True,
                "data": self._data.create_profile(
                    name, agent_type,
                    display_name=display_name, description=description,
                    preset=preset,
                ),
            })
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def delete_profile(self, name: str) -> str:
        try:
            self._data.delete_profile(name)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def edit_profile(
        self, name: str,
        display_name: str = "", description: str = "",
        provider: str = "", prompt: str = "",
    ) -> str:
        try:
            return json.dumps({
                "ok": True,
                "data": self._data.edit_profile(
                    name,
                    display_name=display_name, description=description,
                    provider=provider, prompt=prompt,
                ),
            })
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def launch_profile(self, name: str, agent_type: str, mode: str, cwd: str = "") -> str:
        try:
            return json.dumps({
                "ok": True,
                "data": self._data.launch_profile(name, agent_type, mode, cwd),
            })
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Sessions ─────────────────────────────────────────────────────

    def list_sessions(self) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.list_sessions()})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def cleanup_sessions(self) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.cleanup_sessions()})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Apply / Remove ───────────────────────────────────────────────

    def apply_provider(self, profile_name: str, provider_id: str) -> str:
        try:
            self._data.apply_provider(profile_name, provider_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def apply_prompt(self, profile_name: str, md_id: str) -> str:
        try:
            self._data.apply_prompt(profile_name, md_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_profile_providers(self, profile_name: str) -> str:
        try:
            return json.dumps({
                "ok": True, "data": self._data.list_profile_providers(profile_name),
            })
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def remove_profile_provider(self, profile_name: str, provider_id: str) -> str:
        try:
            self._data.remove_profile_provider(profile_name, provider_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def apply_mcp_to_profile(self, profile_name: str, mcp_id: str) -> str:
        try:
            self._data.apply_mcp_to_profile(profile_name, mcp_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_profile_mcp(self, profile_name: str) -> str:
        try:
            return json.dumps({
                "ok": True, "data": self._data.get_profile_mcp(profile_name),
            })
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def remove_mcp_from_profile(self, profile_name: str, mcp_id: str) -> str:
        try:
            self._data.remove_mcp_from_profile(profile_name, mcp_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def apply_skill_to_profile(self, profile_name: str, skill_id: str) -> str:
        try:
            self._data.apply_skill_to_profile(profile_name, skill_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def remove_skill_from_profile(self, profile_name: str, skill_id: str) -> str:
        try:
            self._data.remove_skill_from_profile(profile_name, skill_id)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── ACS Library ──────────────────────────────────────────────────

    def list_providers(self, agent_type: str) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.list_providers(agent_type)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_provider(self, agent_type: str, provider_id: str) -> str:
        try:
            return json.dumps({
                "ok": True, "data": self._data.get_provider(agent_type, provider_id),
            })
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_prompts(self, agent_type: str) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.list_prompts(agent_type)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_prompt(self, agent_type: str, md_id: str) -> str:
        try:
            return json.dumps({
                "ok": True, "data": self._data.get_prompt(agent_type, md_id),
            })
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_mcp_servers(self, agent_type: str) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.list_mcp_servers(agent_type)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_mcp_server(self, server_id: str) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.get_mcp_server(server_id)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_skills(self, agent_type: str) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.list_skills(agent_type)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── File I/O ─────────────────────────────────────────────────────

    def read_file(self, path: str) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.read_file(path)})
        except Exception:
            return json.dumps({"ok": True, "data": ""})

    def save_file(self, path: str, content: str) -> str:
        try:
            self._data.save_file(path, content)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def patch_json_file(self, path: str, key: str, value_json: str) -> str:
        try:
            self._data.patch_json_file(path, key, value_json)
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_dir(self, path: str) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.list_dir(path)})
        except Exception:
            return json.dumps({"ok": True, "data": ""})

    def find_files(self, path: str) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.find_files(path)})
        except Exception:
            return json.dumps({"ok": True, "data": []})

    def delete_path(self, path: str) -> str:
        try:
            self._data.delete_path(path)
            return json.dumps({"ok": True, "data": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_dir_tree(self, path: str, max_depth: int = 4) -> str:
        try:
            node = self._data.list_dir_tree(path, max_depth)
            if node is None:
                return json.dumps({
                    "ok": False,
                    "error": f"path not found or unreadable: {path}",
                })
            return json.dumps({"ok": True, "data": node})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Misc ─────────────────────────────────────────────────────────

    def last_cwd_map(self) -> str:
        try:
            return json.dumps({"ok": True, "data": self._data.last_cwd_map()})
        except Exception:
            return json.dumps({"ok": True, "data": {}})

    def test_endpoint(self, url: str, timeout_sec: int = 5) -> str:
        """Connectivity check via curl."""
        try:
            curl = shutil.which("curl")
            if not curl:
                return json.dumps({
                    "ok": True,
                    "data": {"status": "failed", "message": "curl not found", "response_time_ms": 0},
                })
            start = time.monotonic()
            result = subprocess.run(
                [curl, "-s", "-o", "/dev/null", "-w",
                 "%{http_code}|%{time_total}|%{time_connect}|%{time_starttransfer}",
                 "--connect-timeout", str(timeout_sec),
                 "--max-time", str(timeout_sec), url],
                capture_output=True, text=True, timeout=timeout_sec + 3,
            )
            elapsed_ms = int((time.monotonic() - start) * 1000)
            parts = result.stdout.strip().split("|")
            code = int(parts[0]) if parts[0].isdigit() else 0
            response_time_ms = (
                int(float(parts[1]) * 1000)
                if len(parts) > 1 and parts[1].replace(".", "").isdigit()
                else elapsed_ms
            )
            if 200 <= code < 500:
                if response_time_ms <= 3000:
                    status, msg = "operational", "Reachable"
                else:
                    status, msg = "degraded", "Reachable but slow"
            elif code > 0:
                status, msg = "failed", f"HTTP {code}"
            else:
                status, msg = "failed", "No HTTP response"
            return json.dumps({
                "ok": True,
                "data": {
                    "status": status, "message": msg,
                    "response_time_ms": response_time_ms,
                    "http_status": code if code else None,
                },
            })
        except subprocess.TimeoutExpired:
            return json.dumps({
                "ok": True,
                "data": {"status": "failed", "message": "Connection timed out", "response_time_ms": 0},
            })
        except Exception as e:
            msg = str(e)
            if "refused" in msg.lower():
                msg = "Connection refused"
            elif "resolve" in msg.lower() or "name" in msg.lower():
                msg = "DNS resolution failed"
            elif any(w in msg.lower() for w in ("ssl", "tls", "certificate")):
                msg = "TLS/SSL error"
            return json.dumps({
                "ok": True,
                "data": {"status": "failed", "message": msg, "response_time_ms": 0},
            })

    def fetch_models(
        self, base_url: str, api_key: str, models_url: str = "",
        is_full_url: bool = False, timeout_sec: int = 10,
    ) -> str:
        """Fetch available models — delegates to the backend models adapter.

        The models-endpoint knowledge lives in agent_box (adapters/models.py
        + core/provider_endpoints.json), not the GUI shell.
        """
        try:
            models = self._data.fetch_models(
                base_url, api_key, models_url, is_full_url, timeout_sec,
            )
            return json.dumps({"ok": True, "data": models})
        except Exception as e:
            return json.dumps({"ok": False, "data": [], "error": str(e)})

    def browse_dir(self, initial: str = "") -> str:
        """Open a native folder picker."""
        try:
            initial = str(Path(initial).expanduser())
            result = webview.windows[0].create_file_dialog(
                webview.FOLDER_DIALOG, directory=initial or None,
            )
            if not result:
                return json.dumps({"ok": True, "data": ""})
            path = result[0] if isinstance(result, (list, tuple)) else str(result)
            return json.dumps({"ok": True, "data": path})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def launch_acs(self) -> str:
        """Launch ACS GUI (native binary) — platform-specific via data layer.

        The binary path comes from agent_box config (config.acs_binary),
        resolved by the data layer (Linux direct / WSL python3 -c).
        """
        try:
            self._data.launch_acs()
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})


# ── Entry point ───────────────────────────────────────────────────────


def main():
    data = WslDataAccess() if _is_windows() else LinuxDataAccess()
    api = Api(data)
    url = "http://localhost:5173"

    if getattr(sys, "frozen", False):
        frontend_dir = Path(sys._MEIPASS) / "gui-web" / "dist"
        if frontend_dir.exists():
            url = str(frontend_dir / "index.html")
    elif "--prod" in sys.argv:
        frontend_dir = Path(__file__).parent / "dist"
        if frontend_dir.exists():
            url = str(frontend_dir / "index.html")
    if "--url" in sys.argv:
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
