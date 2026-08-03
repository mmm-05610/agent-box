"""WSL-bridged data access for Windows host mode."""

import base64
import json
import shlex
import shutil
import subprocess
from pathlib import Path


def _wsl_run(cmd: str, timeout: float = 30) -> str:
    """Run a command via ``wsl.exe bash -lc`` and return stdout.

    Only used in Windows host mode, where agent-box lives inside WSL
    and this bridge process runs on Windows Python.
    """
    wsl = shutil.which("wsl.exe")
    if wsl is None:
        raise RuntimeError("wsl.exe not found in PATH (install WSL).")
    try:
        result = subprocess.run(
            [wsl, "bash", "-lc", cmd],
            capture_output=True,
            timeout=timeout,
            cwd="C:\\",
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


def _resume_args(agent_type: str) -> tuple:
    """Fetch ``runtime.launch.resume`` (minus the binary name) from the
    agent-type registry inside WSL.

    Windows Python cannot import agent_box, so read the registry through
    ``python3 -c`` — the same pattern as the ACS library methods below.
    Mirrors ``data_linux.launch_profile``'s direct ``get_agent_config``
    read, so there is no per-agent table to keep in sync.
    """
    out = _wsl_run(
        "python3 -c 'import json; "
        "from agent_box.core.library import get_agent_config; "
        f"cfg = get_agent_config(\"{agent_type}\") or {{}}; "
        "resume = ((cfg.get(\"runtime\") or {}).get(\"launch\") or {}).get(\"resume\") or []; "
        "print(json.dumps(resume))'",
        timeout=15,
    )
    try:
        args = json.loads(out)
        # The registry array includes the binary name (["claude", "-c"]);
        # launch passes everything after the profile name through, so skip it.
        return tuple(args[1:]) if isinstance(args, list) and len(args) > 1 else ()
    except (json.JSONDecodeError, TypeError):
        return ()


class WslDataAccess:
    """agent_box access via wsl.exe + ``agent-box exec``. Launch in a
    fresh Windows console (CREATE_NEW_CONSOLE)."""

    # ── Profiles ────────────────────────────────────────────────────

    def list_profiles(self) -> list:
        out = _wsl_run("agent-box exec 'list profiles --json'")
        return json.loads(out)

    def get_profile(self, name: str) -> dict:
        out = _wsl_run(f"agent-box exec 'show {name} --json'")
        return json.loads(out)

    def create_profile(
        self, name: str, agent_type: str,
        display_name: str = "", description: str = "", preset: str = "",
    ) -> dict:
        flags = f" --type {agent_type}"
        if display_name:
            flags += f" --display-name \"{display_name}\""
        if description:
            flags += f" --description \"{description}\""
        if preset:
            flags += f" --preset \"{preset}\""
        _wsl_run(f"agent-box exec {shlex.quote(f'create {name}{flags}')}")
        return {"name": name, "agent_type": agent_type}

    def delete_profile(self, name: str) -> None:
        _wsl_run(f"agent-box exec {shlex.quote(f'delete {name} --force')}")

    def edit_profile(
        self, name: str,
        display_name: str = "", description: str = "",
        provider: str = "", claude_md: str = "",
    ) -> dict:
        flags = "configure " + name
        if display_name:
            flags += f" --display-name \"{display_name}\""
        if description:
            flags += f" --description \"{description}\""
        if provider:
            flags += f" --provider \"{provider}\""
        if claude_md:
            flags += f" --prompt \"{claude_md}\""
        _wsl_run(f"agent-box exec {shlex.quote(flags)}")
        return json.loads(_wsl_run(f"agent-box exec {shlex.quote(f'show {name} --json')}"))

    def launch_profile(self, name: str, agent_type: str, mode: str, cwd: str = "") -> dict:
        """Launch a profile in a new Windows console via wsl.exe."""
        resume_args = _resume_args(agent_type)
        launch_cmd = f"launch {name}"
        if mode == "继续上次" and resume_args:
            launch_cmd += " " + " ".join(resume_args)

        setup = 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"'
        script = f'{setup} && agent-box exec "{launch_cmd}"'
        if cwd:
            script = f'cd "{cwd}" && {script}'
        script += (
            ' || { ec=$?; echo; echo agent-box failed code $ec; '
            'read -p "Press Enter to close..." ; }'
        )

        wsl = shutil.which("wsl.exe")
        if wsl is None:
            raise RuntimeError("wsl.exe not found in PATH (install WSL).")
        proc = subprocess.Popen(
            [wsl, "bash", "-lc", script],
            cwd="C:\\",
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        return {"pid": proc.pid}

    # ── Sessions ────────────────────────────────────────────────────

    def list_sessions(self) -> list:
        out = _wsl_run("agent-box exec 'list sessions --json'")
        return json.loads(out)

    def cleanup_sessions(self) -> int:
        return int(_wsl_run("agent-box exec 'sessions --cleanup'"))

    # ── Apply / Remove ──────────────────────────────────────────────

    def apply_provider(self, profile_name: str, provider_id: str) -> None:
        _wsl_run(f"agent-box exec 'use {profile_name}; apply provider {provider_id}'")

    def apply_prompt(self, profile_name: str, md_id: str) -> None:
        _wsl_run(f"agent-box exec 'use {profile_name}; apply prompt {md_id}'")

    def list_profile_providers(self, profile_name: str) -> list:
        out = _wsl_run(f"agent-box exec 'use {profile_name}; list providers --json'")
        return json.loads(out)

    def remove_profile_provider(self, profile_name: str, provider_id: str) -> None:
        _wsl_run(f"agent-box exec 'use {profile_name}; remove provider {provider_id}'")

    def apply_mcp_to_profile(self, profile_name: str, mcp_id: str) -> None:
        _wsl_run(f"agent-box exec 'use {profile_name}; apply mcp {mcp_id}'")

    def get_profile_mcp(self, profile_name: str) -> list:
        out = _wsl_run(f"agent-box exec 'use {profile_name}; list mcp --json'")
        return json.loads(out)

    def remove_mcp_from_profile(self, profile_name: str, mcp_id: str) -> None:
        _wsl_run(f"agent-box exec 'use {profile_name}; remove mcp {mcp_id}'")

    def apply_skill_to_profile(self, profile_name: str, skill_id: str) -> None:
        _wsl_run(f"agent-box exec 'use {profile_name}; apply skill {skill_id}'")

    def remove_skill_from_profile(self, profile_name: str, skill_id: str) -> None:
        _wsl_run(f"agent-box exec 'use {profile_name}; remove skill {skill_id}'")

    # ── ACS Library (no CLI command exists → python3 -c) ────────────

    def list_providers(self, agent_type: str) -> list:
        out = _wsl_run(
            "python3 -c 'from agent_box.adapters.acs import list_providers; "
            f"import json; print(json.dumps(list_providers(\"{agent_type}\")))'"
        )
        return json.loads(out)

    def get_provider(self, agent_type: str, provider_id: str) -> dict | None:
        out = _wsl_run(
            "python3 -c 'from agent_box.adapters.acs import get_provider; "
            f"import json; print(json.dumps(get_provider(\"{agent_type}\", \"{provider_id}\")))'"
        )
        return json.loads(out)

    def list_prompts(self, agent_type: str) -> list:
        out = _wsl_run(
            "python3 -c 'from agent_box.adapters.acs import list_prompts; "
            f"import json; print(json.dumps(list_prompts(\"{agent_type}\")))'"
        )
        return json.loads(out)

    def get_prompt(self, agent_type: str, md_id: str) -> dict | None:
        out = _wsl_run(
            "python3 -c 'from agent_box.adapters.acs import get_prompt; "
            f"import json; print(json.dumps(get_prompt(\"{agent_type}\", \"{md_id}\")))'"
        )
        return json.loads(out)

    def list_mcp_servers(self, agent_type: str) -> list:
        out = _wsl_run(
            "python3 -c 'from agent_box.adapters.acs import list_mcp_servers; "
            f"import json; print(json.dumps(list_mcp_servers(\"{agent_type}\")))'"
        )
        return json.loads(out)

    def get_mcp_server(self, server_id: str) -> dict | None:
        out = _wsl_run(
            "python3 -c 'from agent_box.adapters.acs import get_mcp_server; "
            f"import json; print(json.dumps(get_mcp_server(\"{server_id}\")))'"
        )
        return json.loads(out)

    def list_skills(self, agent_type: str) -> list:
        out = _wsl_run(
            "python3 -c 'from agent_box.adapters.acs import list_skills; "
            f"import json; print(json.dumps(list_skills(\"{agent_type}\")))'"
        )
        return json.loads(out)

    # ── File I/O (WSL filesystem) ───────────────────────────────────

    def read_file(self, path: str) -> str:
        quoted = f"'{path}'" if " " in path else path
        check = _wsl_run(f"test -f {quoted} && echo exists || echo missing")
        if "missing" in check:
            return ""
        return _wsl_run(f"cat {quoted}")

    def save_file(self, path: str, content: str) -> None:
        encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
        parent = str(Path(path).parent) or "/"
        _wsl_run(
            f"mkdir -p '{parent}' && echo {encoded} | base64 -d > '{path}'",
            timeout=10,
        )

    def patch_json_file(self, path: str, key: str, value_json: str) -> None:
        existing = {}
        check = _wsl_run(f"test -f '{path}' && echo exists || echo missing")
        if "exists" in check:
            raw = _wsl_run(f"cat '{path}'")
            if raw.strip():
                existing = json.loads(raw)
        if not isinstance(existing, dict):
            existing = {}
        existing[key] = json.loads(value_json)
        new_content = json.dumps(existing, indent=2, ensure_ascii=False) + "\n"
        encoded = base64.b64encode(new_content.encode("utf-8")).decode("ascii")
        parent = str(Path(path).parent) or "/"
        _wsl_run(
            f"mkdir -p '{parent}' && echo {encoded} | base64 -d > '{path}'",
            timeout=10,
        )

    def list_dir(self, path: str) -> str:
        quoted = f"'{path}'" if " " in path else path
        check = _wsl_run(f"test -d {quoted} && echo exists || echo missing")
        if "missing" in check:
            return ""
        return _wsl_run(f"ls -la {quoted}")

    def find_files(self, path: str) -> list:
        quoted = f"'{path}'" if " " in path else path
        check = _wsl_run(f"test -d {quoted} && echo exists || echo missing")
        if "missing" in check:
            return []
        out = _wsl_run(f"find {quoted} -type f 2>/dev/null", timeout=10)
        return [l.strip() for l in out.split("\n") if l.strip()]

    def delete_path(self, path: str) -> None:
        if not path or path.strip() in {"/", ".", "..", "~"}:
            raise ValueError("refusing to delete an unsafe path")
        _wsl_run(f"rm -rf -- {shlex.quote(path)}", timeout=10)

    def list_dir_tree(self, path: str, max_depth: int = 4) -> dict | None:
        """Build a directory tree via ``find -printf`` inside WSL.
        Returns None when the path is missing/unreadable."""
        if path.startswith("~"):
            try:
                home = _wsl_run("echo -n $HOME", timeout=5)
                path = home + path[1:]
            except Exception:
                return None
        quoted = f"'{path}'" if " " in path else path
        try:
            out = _wsl_run(
                f"test -e {quoted} && find {quoted} -maxdepth {max_depth} "
                f"-mindepth 1 -not -path '*/.*' "
                f"-printf '%y|%p|%s|%T@\\n' 2>/dev/null || true",
                timeout=15,
            )
        except Exception:
            return None
        if not out:
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

    # ── Misc ────────────────────────────────────────────────────────

    def last_cwd_map(self) -> dict:
        rows = json.loads(_wsl_run("agent-box exec 'list sessions --json'"))
        result: dict[str, str] = {}
        for s in rows:
            name = s.get("profile", "")
            cwd = s.get("cwd") or ""
            if name and cwd and name not in result:
                result[name] = cwd
        return result
