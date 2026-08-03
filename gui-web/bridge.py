"""PyWebView Bridge — exposes agent-box to JavaScript.

Environment-agnostic shell. Picks the right DataAccess at startup:
  Windows host → WslDataAccess (wsl.exe bridge)
  Linux/WSL    → LinuxDataAccess (direct import)
"""

import json
import os
import re
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
        provider: str = "", claude_md: str = "",
    ) -> str:
        try:
            return json.dumps({
                "ok": True,
                "data": self._data.edit_profile(
                    name,
                    display_name=display_name, description=description,
                    provider=provider, claude_md=claude_md,
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

    def list_library_skills(self, agent_type: str) -> str:
        """Alias for list_skills — used by Profile detail SkillsTab."""
        try:
            return json.dumps({"ok": True, "data": self._data.list_skills(agent_type)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_library_prompts(self, agent_type: str) -> str:
        """Alias for list_prompts — used by Profile detail PromptTab."""
        try:
            return json.dumps({
                "ok": True, "data": self._data.list_prompts(agent_type),
            })
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_library_mcp(self, agent_type: str) -> str:
        """Alias for list_mcp_servers — used by Profile detail McpTab."""
        try:
            return json.dumps({
                "ok": True, "data": self._data.list_mcp_servers(agent_type),
            })
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
        """Fetch available models from an API endpoint."""
        curl = shutil.which("curl")
        if not curl:
            return json.dumps({"ok": False, "data": [], "error": "curl not found"})

        KNOWN_COMPAT_SUFFIXES = [
            "/api/claudecode", "/api/anthropic", "/apps/anthropic",
            "/api/coding", "/claudecode", "/anthropic",
            "/step_plan", "/coding", "/claude",
        ]

        def _strip_compat_suffix(url: str):
            lower = url.lower()
            for suffix in sorted(KNOWN_COMPAT_SUFFIXES, key=len, reverse=True):
                if lower.endswith(suffix):
                    return url[: -len(suffix)]
            return None

        def _build_candidates(base: str, full_url: bool, override: str):
            if override and override.strip():
                return [override.strip()]
            base = base.strip().rstrip("/")
            if not base:
                return []
            candidates = []
            if full_url:
                idx = base.find("/v1/")
                if idx != -1:
                    candidates.append(f"{base[:idx]}/v1/models")
                else:
                    idx = base.rfind("/")
                    if idx > 0:
                        root = base[:idx]
                        if "://" in root and len(root) > root.index("://") + 3:
                            candidates.append(f"{root}/v1/models")
                return candidates
            last = base.rsplit("/", 1)[-1]
            if re.match(r"^v\d+$", last):
                candidates.append(f"{base}/models")
                if not base.endswith("/v1"):
                    candidates.append(f"{base}/v1/models")
            else:
                candidates.append(f"{base}/v1/models")
            stripped = _strip_compat_suffix(base)
            if stripped and "://" in stripped:
                root = stripped.rstrip("/")
                candidates.append(f"{root}/v1/models")
                candidates.append(f"{root}/models")
            seen = set()
            return [c for c in candidates if not (c in seen or seen.add(c))]

        candidates = _build_candidates(base_url, is_full_url, models_url)
        if not candidates:
            return json.dumps({"ok": False, "data": [], "error": "No candidate URLs"})

        last_err = ""
        for url in candidates:
            try:
                auth = ["-H", f"Authorization: Bearer {api_key}"] if api_key else []
                result = subprocess.run(
                    [curl, "-s", "-w", "\n%{http_code}",
                     "--connect-timeout", str(timeout_sec),
                     "--max-time", str(timeout_sec), *auth, url],
                    capture_output=True, text=True, timeout=timeout_sec + 3,
                )
                out = result.stdout.strip()
                lines = out.rsplit("\n", 1)
                body = lines[0] if len(lines) > 1 else out
                code_str = lines[-1] if len(lines) > 1 else ""
                code = int(code_str) if code_str.isdigit() else 0
                if code == 0:
                    last_err = f"HTTP 0: {body[:200] if body else 'no response'}"
                    continue
                if 200 <= code < 300:
                    data = json.loads(body)
                    models_raw = data.get("data", data) if isinstance(data, dict) else data
                    if isinstance(models_raw, list):
                        models = [
                            {"id": m["id"], "owned_by": m.get("owned_by")}
                            if isinstance(m, dict) and "id" in m
                            else {"id": m, "owned_by": None}
                            if isinstance(m, str) else None
                            for m in models_raw
                        ]
                        models = [m for m in models if m is not None]
                        models.sort(key=lambda x: x["id"])
                        return json.dumps({"ok": True, "data": models})
                    return json.dumps({"ok": True, "data": []})
                if code in (404, 405):
                    last_err = f"HTTP {code}"
                    continue
                return json.dumps({"ok": False, "data": [], "error": f"HTTP {code}: {body[:200]}"})
            except Exception as e:
                last_err = str(e)
                continue
        return json.dumps({"ok": False, "data": [], "error": f"All candidates failed: {last_err}"})

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
        """Launch ACS GUI (native binary)."""
        acs_binary = os.path.expanduser(
            "~/projects/agent-config-store/src-tauri/target/release/cc-switch"
        )
        try:
            subprocess.Popen(
                [acs_binary],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
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
