"""agent_box access from the Windows host via ``wsl.exe`` + an RPC shim.

The Windows GUI runs on Windows Python and cannot import agent_box, but it
must not depend on the ``agent-box`` CLI binary being installed in WSL —
the GUI and the CLI are independent tools.  So every agent_box operation
goes through ``rpc_server.py``: a tiny stdin/stdout JSON dispatcher that
imports ``LinuxDataAccess`` directly (the same code path ``data_linux.py``
uses in-process).  The GUI depends on the agent_box *library*, which is
bundled in the packaged runtime.

``launch_profile`` is the exception — it must appear in a fresh Windows
console — so it spawns ``wsl.exe`` with a small python3 snippet that calls
``agent_box.launch.launch`` (again the library, not the CLI binary).

File I/O methods use plain WSL shell commands (cat / find / rm / base64) and
touch no agent_box code, so they carry no CLI dependency either.
"""

import base64
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path


def _wsl_run(cmd: str, timeout: float = 30, input: bytes | None = None) -> str:
    """Run a command via ``wsl.exe bash -lc`` and return stdout."""
    wsl = shutil.which("wsl.exe")
    if wsl is None:
        raise RuntimeError("wsl.exe not found in PATH (install WSL).")
    kwargs: dict = {}
    if sys.platform == "win32":
        # Windows host: avoid console flashes + a startup-dir dependency.
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        kwargs["cwd"] = "C:\\"
    try:
        result = subprocess.run(
            [wsl, "bash", "-lc", cmd],
            capture_output=True,
            input=input,
            timeout=timeout,
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


def _to_wsl_path(win_path: str) -> str:
    """Deterministic Windows path → WSL path (UNC ``\\\\wsl$`` or drive)."""
    p = win_path.strip()
    m = re.match(r"^\\\\wsl\$\\([^\\]+)\\(.+)$", p, re.IGNORECASE)
    if m:
        return "/" + m.group(2).replace("\\", "/")
    m = re.match(r"^([A-Za-z]):\\(.+)$", p)
    if m:
        return f"/mnt/{m.group(1).lower()}/" + m.group(2).replace("\\", "/")
    return p


def _runtime_dir() -> str:
    """WSL path to the GUI runtime (``rpc_server.py`` + the agent_box library).

    Frozen: the runtime is bundled under ``sys._MEIPASS/runtime`` (a Windows
    temp dir WSL reads via /mnt/<drive>/...).  Dev: the repo's ``gui-web/``
    directory.  Always run through ``_to_wsl_path`` — in dev the Windows GUI
    may load this module via a ``\\\\wsl$\\`` UNC path, which WSL bash's
    ``cd`` cannot handle.
    """
    if getattr(sys, "frozen", False):
        base = str(Path(sys._MEIPASS) / "runtime")
    else:
        base = str(Path(__file__).parent.resolve())
    return _to_wsl_path(base)


def _wsl_rpc(method: str, *args, **kwargs):
    """Call an agent_box operation as a *library* over the wsl.exe pipe.

    Sends ``{method, args, kwargs}`` JSON on stdin to ``rpc_server.py`` and
    returns the parsed ``data``.  Raises RuntimeError on a library error.
    """
    payload = json.dumps(
        {"method": method, "args": list(args), "kwargs": kwargs},
        ensure_ascii=False,
    )
    runtime = _runtime_dir()
    cmd = (
        f"cd {shlex.quote(runtime)} && "
        f"PYTHONPATH={shlex.quote(runtime)} python3 rpc_server.py"
    )
    out = _wsl_run(cmd, timeout=60, input=payload.encode("utf-8"))
    try:
        resp = json.loads(out)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"rpc_server.py returned invalid JSON: {out!r}") from e
    if not resp.get("ok"):
        raise RuntimeError(resp.get("error", "RPC failed"))
    return resp.get("data")


def _resume_args(agent_type: str) -> tuple:
    """Fetch ``runtime.launch.resume`` (minus the binary name) from the
    agent-type registry inside WSL, through the bundled runtime."""
    runtime = _runtime_dir()
    # json.dumps gives a valid Python string literal (shlex.quote would emit
    # a bare token like `claude` that Python reads as a variable → NameError).
    snippet = (
        "import json; "
        "from agent_box.core.library import get_agent_config; "
        f"cfg = get_agent_config({json.dumps(agent_type)}) or {{}}; "
        "resume = ((cfg.get('runtime') or {}).get('launch') or {}).get('resume') or []; "
        "print(json.dumps(resume))"
    )
    out = _wsl_run(
        f"cd {shlex.quote(runtime)} && PYTHONPATH={shlex.quote(runtime)} "
        f"python3 -c {shlex.quote(snippet)}",
        timeout=15,
    )
    try:
        args = json.loads(out)
        return tuple(args[1:]) if isinstance(args, list) and len(args) > 1 else ()
    except (json.JSONDecodeError, TypeError):
        return ()


class WslDataAccess:
    """agent_box access from Windows via ``wsl.exe`` + the RPC library shim.

    Every agent_box operation goes through ``rpc_server.py`` (a direct
    ``LinuxDataAccess`` import) — the GUI never needs the ``agent-box`` CLI
    installed in WSL.  ``launch_profile`` spawns a fresh Windows console with
    a python3 snippet that calls ``agent_box.launch.launch`` directly.
    """

    # ── Profiles ────────────────────────────────────────────────────

    def list_profiles(self) -> list:
        return _wsl_rpc("list_profiles")

    def get_profile(self, name: str) -> dict:
        return _wsl_rpc("get_profile", name)

    def create_profile(
        self, name: str, agent_type: str,
        display_name: str = "", description: str = "", preset: str = "",
    ) -> dict:
        return _wsl_rpc(
            "create_profile", name, agent_type,
            display_name, description, preset,
        )

    def delete_profile(self, name: str) -> None:
        _wsl_rpc("delete_profile", name)

    def edit_profile(
        self, name: str,
        display_name: str = "", description: str = "",
        provider: str = "", prompt: str = "",
    ) -> dict:
        return _wsl_rpc(
            "edit_profile", name, display_name, description, provider, prompt,
        )

    def launch_profile(self, name: str, agent_type: str, mode: str, cwd: str = "") -> dict:
        """Launch a profile in a new Windows console, calling
        ``agent_box.launch.launch`` (library) instead of ``agent-box exec``."""
        resume_args = _resume_args(agent_type)
        extra_args = list(resume_args) if mode == "resume" else []
        # json.dumps → valid Python string literal; shlex.quote would emit a
        # bare token (NameError/SyntaxError) inside the python -c snippet.
        cwd_py = json.dumps(cwd) if cwd else "None"
        snippet = (
            "from agent_box.launch import launch; "
            f"launch({json.dumps(name)}, {json.dumps(extra_args)}, cwd={cwd_py})"
        )
        setup = 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"'
        cmd = (
            f"cd {shlex.quote(_runtime_dir())} && "
            f"PYTHONPATH={shlex.quote(_runtime_dir())} python3 -c {shlex.quote(snippet)}"
        )
        script = f"{setup} && {cmd}"
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
        return _wsl_rpc("list_sessions")

    def cleanup_sessions(self) -> int:
        return _wsl_rpc("cleanup_sessions")

    # ── Config ──────────────────────────────────────────────────────

    def home_dir(self) -> str:
        """The WSL home directory (echo $HOME)."""
        return _wsl_run("echo \"$HOME\"").strip()

    def get_version(self) -> str:
        return _wsl_rpc("get_version")

    def get_default_agent(self) -> str:
        return _wsl_rpc("get_default_agent")

    def get_agent_configs(self) -> dict:
        return _wsl_rpc("get_agent_configs")

    def get_projects_dir(self) -> str:
        return _wsl_rpc("get_projects_dir")

    def save_projects_dir(self, value: str) -> None:
        _wsl_rpc("save_projects_dir", value)

    # ── Apply / Remove ──────────────────────────────────────────────

    def apply_provider(self, profile_name: str, provider_id: str) -> None:
        _wsl_rpc("apply_provider", profile_name, provider_id)

    def apply_prompt(self, profile_name: str, md_id: str) -> None:
        _wsl_rpc("apply_prompt", profile_name, md_id)

    def list_profile_providers(self, profile_name: str) -> list:
        return _wsl_rpc("list_profile_providers", profile_name)

    def remove_profile_provider(self, profile_name: str, provider_id: str) -> None:
        _wsl_rpc("remove_profile_provider", profile_name, provider_id)

    def apply_mcp_to_profile(self, profile_name: str, mcp_id: str) -> None:
        _wsl_rpc("apply_mcp_to_profile", profile_name, mcp_id)

    def get_profile_mcp(self, profile_name: str) -> list:
        return _wsl_rpc("get_profile_mcp", profile_name)

    def remove_mcp_from_profile(self, profile_name: str, mcp_id: str) -> None:
        _wsl_rpc("remove_mcp_from_profile", profile_name, mcp_id)

    def apply_skill_to_profile(self, profile_name: str, skill_id: str) -> None:
        _wsl_rpc("apply_skill_to_profile", profile_name, skill_id)

    def remove_skill_from_profile(self, profile_name: str, skill_id: str) -> None:
        _wsl_rpc("remove_skill_from_profile", profile_name, skill_id)

    # ── ACS Library ─────────────────────────────────────────────────

    def list_providers(self, agent_type: str) -> list:
        return _wsl_rpc("list_providers", agent_type)

    def get_provider(self, agent_type: str, provider_id: str) -> dict | None:
        return _wsl_rpc("get_provider", agent_type, provider_id)

    def list_prompts(self, agent_type: str) -> list:
        return _wsl_rpc("list_prompts", agent_type)

    def get_prompt(self, agent_type: str, md_id: str) -> dict | None:
        return _wsl_rpc("get_prompt", agent_type, md_id)

    def list_mcp_servers(self, agent_type: str) -> list:
        return _wsl_rpc("list_mcp_servers", agent_type)

    def get_mcp_server(self, server_id: str) -> dict | None:
        return _wsl_rpc("get_mcp_server", server_id)

    def list_skills(self, agent_type: str) -> list:
        return _wsl_rpc("list_skills", agent_type)

    def fetch_models(
        self, base_url: str, api_key: str,
        models_url: str = "", is_full_url: bool = False, timeout_sec: int = 10,
    ) -> list:
        return _wsl_rpc(
            "fetch_models", base_url, api_key,
            models_url, is_full_url, timeout_sec,
        )

    # ── File I/O (WSL filesystem — pure shell, no agent_box) ────────

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
        return _wsl_rpc("last_cwd_map")

    def launch_acs(self) -> None:
        """Launch the ACS (cc-switch) GUI binary on the Windows host directly.

        The binary path is computed here (no agent_box import) — the exe
        bundles it under ``_MEIPASS/acs/...`` when packaged.  It must launch
        on the Windows host, not through the WSL RPC (whose runtime has no
        notion of the bundled binary path).
        """
        override = os.environ.get("AGENT_BOX_ACS_BINARY")
        if override:
            binary = Path(override).expanduser()
        elif getattr(sys, "frozen", False):
            binary = (
                Path(sys._MEIPASS) / "acs" / "src-tauri" / "target"
                / "release" / "cc-switch.exe"
            )
        else:
            # Dev: the repo's acs submodule release build.
            binary = (
                Path(__file__).resolve().parent.parent / "acs" / "src-tauri"
                / "target" / "release" / "cc-switch.exe"
            )
        subprocess.Popen(
            [str(binary)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
