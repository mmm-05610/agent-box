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
import threading
import time
from pathlib import Path
from typing import Optional

import webview

AGENT_BOX_CMD = "agent-box"

# GUI settings file (Windows side, persists across sessions)
_SETTINGS_DIR = Path(os.environ.get("APPDATA", "~")) / "agent-box"
_SETTINGS_FILE = _SETTINGS_DIR / "gui-settings.json"
_DEFAULT_SETTINGS = {
    "projects_dir": "~/projects",
}


def _load_settings() -> dict:
    try:
        if _SETTINGS_FILE.exists():
            with open(_SETTINGS_FILE, encoding="utf-8") as f:
                data = json.load(f)
            # Merge with defaults so new keys are always present
            merged = dict(_DEFAULT_SETTINGS)
            merged.update(data)
            return merged
    except Exception:
        pass
    return dict(_DEFAULT_SETTINGS)


def _save_settings(data: dict) -> None:
    _SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


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


def _dir_tree_node(path: str, max_depth: int = 4) -> Optional[dict]:
    """Build a directory tree via `find -printf`. Returns None if path doesn't exist.

    Runs entirely inside WSL via `_wsl_run`, so this works even when the
    bridge host is Windows-side PyWebView. Hidden files (`.`-prefix) are
    excluded. Children are returned as a flat list — the frontend performs
    its own lazy expansion by re-calling with the appropriate sub-path.
    """
    if path.startswith("~"):
        try:
            home = _wsl_run("echo -n $HOME", timeout=5)
            path = home + path[1:]
        except Exception:
            return None
    quoted = f"'{path}'" if " " in path else path
    try:
        # Sentinel `test -e` lets us distinguish a missing path from an empty dir.
        out = _wsl_run(
            f"test -e {quoted} && find {quoted} -maxdepth {max_depth} "
            f"-mindepth 1 -not -path '*/.*' "
            f"-printf '%y|%p|%s|%T@\\n' 2>/dev/null || true",
            timeout=15,
        )
    except Exception:
        return None
    if not out:
        # Path missing or no children — let caller decide.
        return None
    entries = []
    for line in out.splitlines():
        parts = line.split("|", 3)
        if len(parts) != 4:
            continue
        kind, fullpath, size, mtime = parts
        if fullpath == path:
            continue
        size_val = int(size) if size.isdigit() else None
        try:
            mtime_val = int(float(mtime) * 1000)  # ms
        except ValueError:
            mtime_val = None
        if kind == "d":
            entries.append({"path": fullpath, "type": "dir"})
        else:
            entry: dict = {"path": fullpath, "type": "file"}
            if size_val is not None:
                entry["size"] = size_val
            if mtime_val is not None:
                entry["mtime"] = mtime_val
            entries.append(entry)
    return {"path": path, "type": "dir", "children": entries}


class Api:
    """JavaScript-accessible API via window.api."""

    # ── Settings ────────────────────────────────────────────────────────

    def get_settings(self) -> str:
        try:
            return json.dumps({"ok": True, "data": _load_settings()})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def save_settings(self, settings_json: str) -> str:
        try:
            data = json.loads(settings_json)
            current = _load_settings()
            current.update(data)
            _save_settings(current)
            return json.dumps({"ok": True, "data": current})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

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
            wsl = shutil.which("wsl.exe")
            if wsl is None:
                return json.dumps({"ok": False, "error": "wsl.exe not found"})
            result = subprocess.run(
                [wsl, "bash", "-lc", f"{AGENT_BOX_CMD} provider upsert {agent_type} {provider_id}"],
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

    def duplicate_provider(self, agent_type: str, provider_id: str, new_id: str) -> str:
        try:
            out = _wsl_run(
                f"{AGENT_BOX_CMD} provider duplicate {agent_type} {provider_id} {new_id}"
            )
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_presets(self, agent_type: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} provider presets --type {agent_type}")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def query_usage(self, agent_type: str, provider_id: str) -> str:
        try:
            out = _wsl_run(
                f"{AGENT_BOX_CMD} provider usage {agent_type} {provider_id}"
            )
            result = json.loads(out)
            return json.dumps({"ok": True, "data": result})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def save_usage_script(self, agent_type: str, provider_id: str,
                          script_json: str) -> str:
        try:
            wsl = shutil.which("wsl.exe")
            if wsl is None:
                return json.dumps({"ok": False, "error": "wsl.exe not found"})
            result = subprocess.run(
                [wsl, "bash", "-lc",
                 f"{AGENT_BOX_CMD} provider usage-script {agent_type} {provider_id}"],
                input=script_json,
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr.strip())
            return json.dumps({"ok": True, "data": json.loads(result.stdout.strip())})
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
            wsl = shutil.which("wsl.exe")
            if wsl is None:
                return json.dumps({"ok": False, "error": "wsl.exe not found"})
            flags = ""
            if name:
                flags += f" --name {name}"
            if description:
                flags += f" --description {description}"
            result = subprocess.run(
                [wsl, "bash", "-lc",
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

    # ── MCP Servers ────────────────────────────────────────────────────────────────

    def list_mcp_servers(self, agent_type: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} mcp-server list --type {agent_type} --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_mcp_server(self, server_id: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} mcp-server show {server_id} --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def save_mcp_server(self, server_id: str, data_json: str) -> str:
        try:
            wsl = shutil.which("wsl.exe")
            if wsl is None:
                return json.dumps({"ok": False, "error": "wsl.exe not found"})
            result = subprocess.run(
                [wsl, "bash", "-lc",
                 f"{AGENT_BOX_CMD} mcp-server upsert {server_id}"],
                input=data_json,
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr.strip())
            return json.dumps({"ok": True, "data": json.loads(result.stdout.strip())})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def delete_mcp_server(self, server_id: str) -> str:
        try:
            _wsl_run(f"{AGENT_BOX_CMD} mcp-server delete {server_id} --force")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def set_mcp_agent(self, server_id: str, agent_type: str, enabled: str) -> str:
        try:
            flag = "--enable" if enabled.lower() in ("true", "1", "yes") else "--disable"
            _wsl_run(f"{AGENT_BOX_CMD} mcp-server agents {server_id} {flag} {agent_type}")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    # ── Skills ────────────────────────────────────────────────────────────────

    def list_skills(self, agent_type: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} skill list --type {agent_type} --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def get_skill(self, skill_id: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} skill show {skill_id} --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def save_skill(self, skill_id: str, data_json: str) -> str:
        try:
            data = json.loads(data_json) if data_json.strip() else {}
            if not isinstance(data, dict):
                data = {}
            flags = f"{AGENT_BOX_CMD} skill upsert {skill_id}"
            name = data.get("name")
            if name:
                flags += f" --name {name}"
            desc = data.get("description")
            if desc:
                flags += f" --description {desc}"
            directory = data.get("directory")
            if directory:
                flags += f" --directory {directory}"
            repo_owner = data.get("repoOwner") or data.get("repo_owner")
            if repo_owner:
                flags += f" --repo-owner {repo_owner}"
            repo_name = data.get("repoName") or data.get("repo_name")
            if repo_name:
                flags += f" --repo-name {repo_name}"
            repo_branch = data.get("repoBranch") or data.get("repo_branch")
            if repo_branch:
                flags += f" --repo-branch {repo_branch}"
            readme_url = data.get("readmeUrl") or data.get("readme_url")
            if readme_url:
                flags += f" --readme-url {readme_url}"
            out = _wsl_run(flags)
            # Re-fetch and return as JSON
            detail_out = _wsl_run(f"{AGENT_BOX_CMD} skill show {skill_id} --json")
            return json.dumps({"ok": True, "data": json.loads(detail_out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def delete_skill(self, skill_id: str) -> str:
        try:
            _wsl_run(f"{AGENT_BOX_CMD} skill delete {skill_id} --force")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def set_skill_agent(self, skill_id: str, agent_type: str, enabled: str) -> str:
        try:
            flag = "--enable" if enabled.lower() in ("true", "1", "yes") else "--disable"
            _wsl_run(f"{AGENT_BOX_CMD} skill agents {skill_id} {flag} {agent_type}")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})


    # ── Profiles ────────────────────────────────────────────────────────────────

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

    def edit_profile(
        self, name: str,
        display_name: str = "", description: str = "",
        provider: str = "", claude_md: str = "",
    ) -> str:
        """Update profile metadata fields. Empty strings mean "don't change"."""
        try:
            flags = ""
            if display_name:
                flags += f" --display-name {display_name}"
            if description:
                flags += f" --description {description}"
            if provider:
                flags += f" --provider {provider}"
            if claude_md:
                flags += f" --claude-md {claude_md}"
            if not flags:
                return json.dumps({"ok": False, "error": "no fields to update"})
            _wsl_run(f"{AGENT_BOX_CMD} edit {name}{flags}")
            # Re-read to return updated meta.
            out = _wsl_run(f"{AGENT_BOX_CMD} show {name} --json")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def launch_profile(self, name: str, agent_type: str, mode: str, cwd: str = "") -> str:
        """Launch a profile in a new console window.

        Args:
            name: Profile name
            agent_type: Agent type (claude, codex, hermes, opencode)
            mode: Launch mode (新会话 or 继续上次)
            cwd: Working directory (optional)
        """
        try:
            # Resume args per agent type
            RESUME_ARGS = {
                "claude": ("--continue",),
                "codex": ("resume", "--last"),
                "hermes": ("-c",),
                "opencode": None,
            }

            # Build the launch command
            argv = [AGENT_BOX_CMD, "launch", name]
            if mode == "继续上次" and agent_type in RESUME_ARGS:
                extra = RESUME_ARGS[agent_type]
                if extra:
                    argv.extend(extra)

            # Quote arguments and build command line
            cmdline = " ".join(f"'{a}'" if " " in a else a for a in argv)

            # Build shell script
            setup = 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"'
            if cwd:
                # Expand ~ to WSL home before quoting (bash won't expand ~ in quotes)
                if cwd.startswith("~"):
                    home = _wsl_run("echo -n $HOME")
                    cwd = cwd.replace("~", home, 1)
                setup = f"cd '{cwd}' && {setup}"
            script = (
                f"{setup} && {cmdline} || "
                "{ ec=$?; echo; echo agent-box failed code $ec; read -p Enter...; }"
            )

            # Get wsl.exe path
            wsl = shutil.which("wsl.exe")
            if wsl is None:
                return json.dumps({"ok": False, "error": "wsl.exe not found"})

            # Spawn new console window
            kwargs = {"close_fds": True, "cwd": "C:\\"}
            if sys.platform == "win32":
                kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE

            proc = subprocess.Popen([wsl, "bash", "-lc", script], **kwargs)

            return json.dumps({"ok": True, "data": {"pid": proc.pid}})
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
            # Quote path for shell safety
            quoted = f"'{path}'" if " " in path else path
            check = _wsl_run(f"test -f {quoted} && echo exists || echo missing")
            if "missing" in check:
                return json.dumps({"ok": True, "data": ""})
            content = _wsl_run(f"cat {quoted}")
            return json.dumps({"ok": True, "data": content})
        except Exception as e:
            return json.dumps({"ok": True, "data": ""})

    def save_file(self, path: str, content: str) -> str:
        """Write *content* to *path* in WSL. Creates parent dirs if needed."""
        try:
            import base64, shlex
            encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
            dirname = "/".join(path.split("/")[:-1]) or "/"
            safe_path = shlex.quote(path)
            safe_dir = shlex.quote(dirname)
            _wsl_run(
                f"mkdir -p {safe_dir} && echo {shlex.quote(encoded)} | base64 -d > {safe_path}",
                timeout=10,
            )
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def patch_json_file(self, path: str, key: str, value_json: str) -> str:
        """Replace *key* in a JSON file at *path* with *value_json* (parsed).
        Other top-level keys are preserved. Creates the file + key if missing."""
        try:
            import base64
            existing = {}
            check = _wsl_run(f"test -f '{path}' && echo exists || echo missing")
            if "exists" in check:
                raw = _wsl_run(f"cat '{path}'")
                if raw.strip():
                    existing = json.loads(raw)
            if not isinstance(existing, dict):
                existing = {}
            parsed = json.loads(value_json)
            existing[key] = parsed
            new_content = json.dumps(existing, indent=2, ensure_ascii=False) + "\n"
            encoded = base64.b64encode(new_content.encode("utf-8")).decode("ascii")
            dirname = "/".join(path.split("/")[:-1]) or "/"
            _wsl_run(
                f"mkdir -p {dirname} && echo {encoded} | base64 -d > '{path}'",
                timeout=10,
            )
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def last_cwd_map(self) -> str:
        """Return {profile_name: last_cwd} from recent sessions."""
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} sessions --json", timeout=10)
            rows = json.loads(out)
            result: dict[str, str] = {}
            for s in rows:
                name = s.get("profile", "")
                cwd = s.get("cwd") or ""
                if name and cwd and name not in result:
                    result[name] = cwd
            return json.dumps({"ok": True, "data": result})
        except Exception as e:
            return json.dumps({"ok": True, "data": {}})

    def test_endpoint(self, url: str, timeout_sec: int = 5) -> str:
        """Connectivity check like cc-switch — checks base_url reachability.

        Returns structured result:
          { status: "operational" | "degraded" | "failed",
            message: str, response_time_ms: int, http_status?: int }
        """
        import time
        try:
            start = time.monotonic()
            out = _wsl_run(
                f"curl -s -o /dev/null -w '%{{http_code}}|%{{time_total}}|%{{time_connect}}|%{{time_starttransfer}}'"
                f" --connect-timeout {timeout_sec} --max-time {timeout_sec} '{url}'",
                timeout=timeout_sec + 3,
            )
            elapsed_ms = int((time.monotonic() - start) * 1000)
            parts = out.strip().split("|")
            code = int(parts[0]) if parts[0].isdigit() else 0
            response_time_ms = int(float(parts[1]) * 1000) if len(parts) > 1 and parts[1].replace(".", "").isdigit() else elapsed_ms

            if 200 <= code < 500:
                if response_time_ms <= 3000:
                    return json.dumps({
                        "ok": True,
                        "data": {"status": "operational", "message": "Reachable",
                                 "response_time_ms": response_time_ms, "http_status": code},
                    })
                else:
                    return json.dumps({
                        "ok": True,
                        "data": {"status": "degraded", "message": "Reachable but slow",
                                 "response_time_ms": response_time_ms, "http_status": code},
                    })
            elif code > 0:
                return json.dumps({
                    "ok": True,
                    "data": {"status": "failed", "message": f"HTTP {code}",
                             "response_time_ms": response_time_ms, "http_status": code},
                })
            else:
                return json.dumps({
                    "ok": True,
                    "data": {"status": "failed", "message": "No HTTP response",
                             "response_time_ms": response_time_ms},
                })
        except Exception as e:
            msg = str(e)
            if "timed out" in msg.lower() or "timeout" in msg.lower():
                msg = "Connection timed out"
            elif "could not resolve" in msg.lower() or "name resolution" in msg.lower():
                msg = "DNS resolution failed"
            elif "connection refused" in msg.lower():
                msg = "Connection refused"
            elif "ssl" in msg.lower() or "tls" in msg.lower() or "certificate" in msg.lower():
                msg = "TLS/SSL error"
            return json.dumps({
                "ok": True,
                "data": {"status": "failed", "message": msg, "response_time_ms": 0},
            })

    def fetch_models(self, base_url: str, api_key: str, models_url: str = "",
                     is_full_url: bool = False, timeout_sec: int = 10) -> str:
        """Fetch available models from an API endpoint.

        Tries multiple candidate URLs (OpenAI-compatible /v1/models).
        Returns: { ok: true, data: [ { id: str, owned_by: str|null }, ... ] }
        """
        import re

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

        def _ends_with_version(url: str) -> bool:
            last = url.rsplit("/", 1)[-1]
            return bool(re.match(r"^v\d+$", last))

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

            # Normal mode
            if _ends_with_version(base):
                candidates.append(f"{base}/models")
                if not base.endswith("/v1"):
                    candidates.append(f"{base}/v1/models")
            else:
                candidates.append(f"{base}/v1/models")

            # Compat suffix: also try root
            stripped = _strip_compat_suffix(base)
            if stripped:
                root = stripped.rstrip("/")
                if root and "://" in root:
                    candidates.append(f"{root}/v1/models")
                    candidates.append(f"{root}/models")

            # Deduplicate preserving order
            seen = set()
            unique = []
            for u in candidates:
                if u not in seen:
                    seen.add(u)
                    unique.append(u)
            return unique

        candidates = _build_candidates(base_url, is_full_url, models_url)
        if not candidates:
            return json.dumps({"ok": False, "data": [], "error": "No candidate URLs"})

        import shlex

        last_err = ""
        for url in candidates:
            try:
                auth_arg = f"-H {shlex.quote(f'Authorization: Bearer {api_key}')}" if api_key else ""
                cmd = (
                    f"curl -s -w '\\n%{{http_code}}' --connect-timeout {timeout_sec} --max-time {timeout_sec}"
                    f" {auth_arg} {shlex.quote(url)}"
                )
                out = _wsl_run(cmd, timeout=timeout_sec + 3)
                lines = out.strip().rsplit("\n", 1)
                body = lines[0] if len(lines) > 1 else out
                code_str = lines[-1] if len(lines) > 1 else ""
                code = int(code_str) if code_str.isdigit() else 0

                if code == 0:
                    last_err = f"连接失败 (HTTP 0): {body[:200] if body else '无响应'}"
                    continue

                if 200 <= code < 300:
                    data = json.loads(body)
                    models_raw = data.get("data", data) if isinstance(data, dict) else data
                    if isinstance(models_raw, list):
                        models = []
                        for m in models_raw:
                            if isinstance(m, dict) and "id" in m:
                                models.append({"id": m["id"], "owned_by": m.get("owned_by")})
                            elif isinstance(m, str):
                                models.append({"id": m, "owned_by": None})
                        models.sort(key=lambda x: x["id"])
                        return json.dumps({"ok": True, "data": models})
                    return json.dumps({"ok": True, "data": []})

                # 404/405: try next candidate
                if code in (404, 405):
                    last_err = f"HTTP {code}"
                    continue

                # Other errors: fail immediately
                return json.dumps({"ok": False, "data": [], "error": f"HTTP {code}: {body[:200]}"})
            except Exception as e:
                last_err = str(e)
                continue

        return json.dumps({"ok": False, "data": [], "error": f"All candidates failed: {last_err}"})

    def browse_dir(self, initial: str = "") -> str:
        """Open a native folder picker and return the selected path (WSL format).

        Uses PyWebView's native dialog (no Tk conflict).
        *initial* is a WSL path; if empty, uses projects_dir from settings.
        """
        try:
            # Use settings' projects_dir as default
            if not initial:
                settings = _load_settings()
                initial = settings.get("projects_dir", "~/projects")

            # Resolve initial directory
            initial_win = ""
            if initial:
                # Expand ~ to WSL home
                if initial.startswith("~"):
                    try:
                        home = _wsl_run("echo -n $HOME")
                        initial = home + initial[1:]
                    except Exception:
                        pass
                # Convert WSL path to Windows path for the dialog
                if initial.startswith("/mnt/") and len(initial) > 5:
                    drive = initial[5].upper()
                    rest = initial[6:].replace("/", "\\")
                    initial_win = f"{drive}:{rest}"
                else:
                    initial_win = r"\\wsl$\Ubuntu" + initial.replace("/", "\\")

            result = webview.windows[0].create_file_dialog(
                webview.FOLDER_DIALOG,
                directory=initial_win or None,
            )
            if not result:
                return json.dumps({"ok": True, "data": ""})

            # result is a tuple of paths; take the first
            path = result[0] if isinstance(result, (list, tuple)) else str(result)

            # Convert Windows path to WSL path
            p = path.replace("\\", "/")
            for prefix in ("//wsl$/Ubuntu/", "//wsl.localhost/Ubuntu/"):
                if p.startswith(prefix):
                    idx = p.find("/Ubuntu/")
                    if idx != -1:
                        wsl_path = p[idx + len("/Ubuntu"):]
                        return json.dumps({"ok": True, "data": wsl_path})
            if len(p) >= 2 and p[1] == ":":
                drive = p[0].lower()
                rest = p[2:]
                return json.dumps({"ok": True, "data": f"/mnt/{drive}{rest}"})
            return json.dumps({"ok": True, "data": p})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_dir(self, path: str) -> str:
        """List files in a directory (ls -la format). Returns empty string if not found."""
        try:
            quoted = f"'{path}'" if " " in path else path
            check = _wsl_run(f"test -d {quoted} && echo exists || echo missing")
            if "missing" in check:
                return json.dumps({"ok": True, "data": ""})
            out = _wsl_run(f"ls -la {quoted}")
            return json.dumps({"ok": True, "data": out})
        except Exception as e:
            return json.dumps({"ok": True, "data": ""})

    def find_files(self, path: str) -> str:
        """Return absolute paths of all files under *path* (find -type f)."""
        try:
            quoted = f"'{path}'" if " " in path else path
            check = _wsl_run(f"test -d {quoted} && echo exists || echo missing")
            if "missing" in check:
                return json.dumps({"ok": True, "data": "[]"})
            out = _wsl_run(f"find {quoted} -type f 2>/dev/null", timeout=10)
            paths = [l.strip() for l in out.split('\n') if l.strip()]
            return json.dumps({"ok": True, "data": paths})
        except Exception as e:
            return json.dumps({"ok": True, "data": "[]"})

    def delete_path(self, path: str) -> str:
        """Delete a file or directory from WSL."""
        try:
            if not path or path.strip() in {"/", ".", "..", "~"}:
                raise ValueError("refusing to delete an unsafe path")
            import shlex
            _wsl_run(f"rm -rf -- {shlex.quote(path)}", timeout=10)
            return json.dumps({"ok": True, "data": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_dir_tree(self, path: str, max_depth: int = 4) -> str:
        """Return a directory tree (depth-limited). Hidden files excluded.

        Errors are surfaced as ``{"ok": False, "error": str(e)}`` so the
        frontend can react; ``None`` from the worker means the WSL command
        failed (path missing, permission, etc.), which is NOT the same as
        "empty directory" and must not be reported as success.
        """
        try:
            node = _dir_tree_node(path, max_depth)
            if node is None:
                return json.dumps({"ok": False, "error": f"path not found or unreadable: {path}"})
            return json.dumps({"ok": True, "data": node})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

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

    def list_profile_providers(self, profile_name: str) -> str:
        try:
            out = _wsl_run(f"{AGENT_BOX_CMD} provider profile-list {profile_name}")
            return json.dumps({"ok": True, "data": json.loads(out)})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def remove_profile_provider(self, profile_name: str, provider_id: str) -> str:
        try:
            _wsl_run(f"{AGENT_BOX_CMD} provider profile-remove {profile_name} {provider_id}")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_library_skills(self, agent_type: str) -> str:
        """List skills from ACS database for *agent_type*."""
        try:
            out = _wsl_run(
                f"python3 -c 'from agent_box.ccswitch_adapter import list_skills; "
                f"import json; print(json.dumps(list_skills(\"{agent_type}\")))'",
                timeout=30,
            )
            return json.dumps({"ok": True, "data": out})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_library_prompts(self, agent_type: str) -> str:
        try:
            out = _wsl_run(
                f"python3 -c 'from agent_box.ccswitch_adapter import list_prompts; "
                f"import json; print(json.dumps(list_prompts(\"{agent_type}\")))'",
                timeout=10,
            )
            return json.dumps({"ok": True, "data": out})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def list_library_mcp(self, agent_type: str) -> str:
        try:
            out = _wsl_run(
                f"python3 -c 'from agent_box.ccswitch_adapter import list_mcp_servers; "
                f"import json; print(json.dumps(list_mcp_servers(\"{agent_type}\")))'",
                timeout=15,
            )
            return json.dumps({"ok": True, "data": out})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def apply_mcp_to_profile(self, profile_name: str, mcp_id: str) -> str:
        try:
            _wsl_run(f"{AGENT_BOX_CMD} mcp-server apply {profile_name} {mcp_id}")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def apply_skill_to_profile(self, profile_name: str, skill_id: str) -> str:
        """Copy a skill from ACS to the profile's skills directory."""
        try:
            _wsl_run(f"{AGENT_BOX_CMD} skill apply {profile_name} {skill_id}")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def remove_skill_from_profile(self, profile_name: str, skill_id: str) -> str:
        """Delete a skill from the profile's skills directory."""
        try:
            _wsl_run(f"{AGENT_BOX_CMD} skill profile-remove {profile_name} {skill_id}")
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})

    def launch_acs(self) -> str:
        """Launch ACS GUI via WSLg (WSL 2 built-in GUI support)."""
        import subprocess as _sp
        import os as _os
        acs_binary = "/home/maoqh/projects/agent-config-store/src-tauri/target/release/cc-switch"
        wsl = shutil.which("wsl.exe")
        if wsl is None:
            return json.dumps({"ok": False, "error": "wsl.exe not found"})
        try:
            # WSLg provides Wayland/X11 forwarding automatically.
            # DISPLAY / WAYLAND_DISPLAY are set inside WSL 2 by default.
            _sp.Popen(
                [wsl, "-e", acs_binary],
                stdout=_sp.DEVNULL, stderr=_sp.DEVNULL,
                start_new_session=True,
            )
            return json.dumps({"ok": True})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})


def main():
    api = Api()

    # Determine frontend URL
    # Priority: --url flag > built files > localhost:5173 (dev server)
    url = "http://localhost:5173"

    # PyInstaller bundle: frontend is extracted to sys._MEIPASS/gui-web/dist/
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
