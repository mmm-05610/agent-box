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
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

# Hide console windows for PowerShell/installer child processes — the GUI is a
# windowed app, every spawned powershell.exe would otherwise flash a console.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


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


def _windows_proxy() -> dict:
    """Read the Windows system proxy (HKCU Internet Settings) into a
    urllib-friendly ``{'http': ..., 'https': ...}`` dict.

    The packaged GUI runs on the Windows host where GitHub may only be
    reachable through the user's proxy (Clash etc.).  urllib does NOT honor
    the WinINET system proxy on its own, so we read it from the registry.
    Returns ``{}`` (direct) when no proxy is configured.
    """
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
        )
        if not winreg.QueryValueEx(key, "ProxyEnable")[0]:
            return {}
        server = winreg.QueryValueEx(key, "ProxyServer")[0]
        if not server:
            return {}
        return {"http": server, "https": server}
    except Exception:
        return {}


def _latest_via_atom() -> dict:
    """Latest agent-box release via the public releases.atom feed.

    The atom feed lives on ``github.com`` (the same host the installer
    downloads from), which stays reachable where ``api.github.com`` is
    rate-limited (shared NAT/proxy IPs hit the 60/hr unauthenticated cap) or
    blocked outright.  Returns ``{latest, asset_url, release_url, notes}``,
    never raises.
    """
    import urllib.request
    empty = {"latest": "", "asset_url": "", "release_url": "", "notes": ""}
    try:
        req = urllib.request.Request(
            "https://github.com/mmm-05610/agent-box/releases.atom",
            headers={"User-Agent": "agent-box-gui"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            root = ET.fromstring(resp.read())
        ns = {"a": "http://www.w3.org/2005/Atom"}
        entry = root.find("a:entry", ns)
        if entry is None:
            return empty
        tag = (entry.findtext("a:title", "", ns) or "").strip().lstrip("v")
        release_url = ""
        for link in entry.findall("a:link", ns):
            if link.get("rel") in (None, "alternate"):
                release_url = link.get("href", "")
                break
        asset_url = (
            f"https://github.com/mmm-05610/agent-box/releases/download/"
            f"v{tag}/agent-box-setup-{tag}.exe"
        )
        return {"latest": tag, "asset_url": asset_url,
                "release_url": release_url, "notes": ""}
    except Exception:
        return empty


def _to_wsl_path(win_path: str) -> str:
    """Deterministic Windows path → WSL path (UNC ``\\\\wsl$``/``\\\\wsl.localhost`` or drive)."""
    p = win_path.strip()
    # Both WSL share spellings: legacy \\wsl$\<distro>\… and modern
    # \\wsl.localhost\<distro>\… — the latter is what Windows shows when
    # the repo is accessed over the 9P share.
    m = re.match(r"^\\\\wsl(?:\$|\.localhost)\\([^\\]+)\\(.+)$", p, re.IGNORECASE)
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


def _wsl_rpc(method: str, *args, timeout: float = 60, **kwargs):
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
    out = _wsl_run(cmd, timeout=timeout, input=payload.encode("utf-8"))
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

    # ── Environment ─────────────────────────────────────────────────

    def check_environment(self) -> dict:
        """Detect whether the WSL runtime the whole GUI depends on works.

        Structured status, never raises — the Windows host calls this on
        startup to decide between the WSL install guide (setup screen) and
        the app itself.  The probe exercises the exact code path every other
        call uses (``wsl.exe bash -lc``), so a bootable default distro is
        confirmed — not just a ``wsl.exe`` sitting on PATH.
        """
        wsl = shutil.which("wsl.exe")
        if wsl is None:
            return {
                "ready": False, "wsl": False, "distro": False,
                "detail": "wsl.exe not found in PATH. "
                          "Install WSL2 from an admin PowerShell: wsl --install -d Ubuntu",
            }
        try:
            _wsl_run("echo ready", timeout=60)
        except RuntimeError as e:
            return {
                "ready": False, "wsl": True, "distro": False,
                "detail": str(e),
            }
        return {"ready": True, "wsl": True, "distro": True, "detail": ""}

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
        """Launch the ACS (cc-switch) GUI binary inside WSL via the RPC.

        The binary is the WSL/Linux cc-switch — the Windows GUI never bundles
        or launches a Windows cc-switch.exe.  The WSL side auto-provisions the
        bundled Linux binary on first use.
        """
        _wsl_rpc("launch_acs")

    def install_acs_deps(self) -> dict:
        """Install the Tauri GUI libs cc-switch needs, inside WSL (sudo -n)."""
        return _wsl_rpc("install_acs_deps")

    def install_acs_deps_manual(self) -> dict:
        """Pop a real WSL terminal that runs the apt install interactively.

        The headless ``sudo -n`` path fails when sudo needs a password.  This
        launches a NEW Windows console running ``wsl.exe bash -lc '<apt cmd>'``
        so the user only has to type their sudo password in the terminal (no
        command to remember — it's already there).  Fire-and-forget.
        """
        info = _wsl_rpc("install_acs_deps_manual_cmd")
        cmd = (info or {}).get("cmd") or ""
        if not cmd:
            raise RuntimeError("cc-switch 运行库齐全，无需安装")
        wsl = shutil.which("wsl.exe")
        if wsl is None:
            raise RuntimeError("wsl.exe not found in PATH (install WSL).")
        subprocess.Popen(
            [wsl, "bash", "-lc", cmd],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        return {"launched": True, "cmd": (info or {}).get("manual") or cmd}

    # ── Environment / provisioning ──────────────────────────────────

    def check_binaries(self) -> list:
        return _wsl_rpc("check_binaries")

    def get_install_command(self, agent_type: str) -> str:
        return _wsl_rpc("get_install_command", agent_type)

    def install_binary(self, agent_type: str) -> dict:
        """Start a detached install inside WSL; poll get_install_progress()."""
        return _wsl_rpc("install_binary", agent_type)

    def get_install_progress(self) -> dict:
        """Poll the detached WSL install (status/elapsed/output/error)."""
        return _wsl_rpc("get_install_progress")

    def get_latest_version(self, force: bool = False) -> dict:
        """Latest agent-box version via the public releases.atom feed.

        The API endpoint (``api.github.com/releases/latest``) is rate-limited
        per-IP (60/hr unauthenticated) and exhausted on shared NAT/proxy IPs,
        so we read the ``releases.atom`` feed on ``github.com`` instead — no
        rate cap, same host as the installer download.  Cached ~10min so the
        per-page-load badge check doesn't re-fetch; the Environment page's
        explicit "re-check" passes ``force=True`` to bypass the cache (else a
        stale cached version hides a freshly-published release until restart).
        """
        current = self.get_version()
        cached = getattr(self, "_latest_cache", None)
        if not force and cached and cached[0] > time.monotonic() - 600:
            info = dict(cached[1])
            info["current"] = current
            return info
        info = _latest_via_atom()
        self._latest_cache = (time.monotonic(), info)
        info["current"] = current
        return info

    def download_update(self) -> dict:
        """Start a background Python download of the installer.

        Zero PowerShell/BITS: ``urllib`` streams the asset through the WinINET
        system proxy (read from the registry), reporting progress as it goes.
        Returns immediately — callers poll :meth:`get_download_progress`.
        (BITS was version-fragile and overkill: the installer downloads in
        seconds, so resume/retry machinery buys nothing on every Windows.)
        """
        info = self.get_latest_version()
        if not info.get("asset_url") or info.get("latest") == info.get("current"):
            raise RuntimeError("no update available")
        dest = Path.home() / "Downloads" / f"agent-box-setup-{info['latest']}.exe"
        dest.parent.mkdir(parents=True, exist_ok=True)
        if sys.platform != "win32":
            import webbrowser
            webbrowser.open(info["asset_url"])
            return {"started": True, "dest": "", "mode": "browser"}
        state = getattr(self, "_dl_state", None)
        if state and state.get("status") == "downloading":
            return {"started": True, "dest": str(dest), "mode": "urllib"}
        self._dl_state = {
            "status": "downloading",
            "bytes_written": 0,
            "bytes_total": 0,
            "dest": str(dest),
        }
        threading.Thread(
            target=self._download_worker, args=(info["asset_url"], dest),
            daemon=True,
        ).start()
        return {"started": True, "dest": str(dest), "mode": "urllib"}

    @staticmethod
    def _wininet_proxy():
        """System HTTP/HTTPS proxy from the WinINET registry — the same
        settings browsers and BITS use (``ProxyEnable`` + ``ProxyServer``)."""
        try:
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            )
            try:
                enabled, _ = winreg.QueryValueEx(key, "ProxyEnable")
            except OSError:
                enabled = 0
            if enabled:
                try:
                    server, _ = winreg.QueryValueEx(key, "ProxyServer")
                    return server or None
                except OSError:
                    return None
            return None
        except Exception:
            return None

    @staticmethod
    def _proxy_handler(server):
        """Map a WinINET ProxyServer string to a urllib ProxyHandler.

        Handles both ``host:port`` and ``http=h;https=h;...`` forms.  Returns
        an env-fallback handler when *server* is empty (rare on Windows)."""
        if not server:
            return urllib.request.ProxyHandler()
        if "=" in server:
            proxies = {}
            for part in server.split(";"):
                if "=" in part:
                    scheme, value = part.split("=", 1)
                    if scheme in ("http", "https"):
                        proxies[scheme] = value
            return urllib.request.ProxyHandler(proxies)
        return urllib.request.ProxyHandler({"http": server, "https": server})

    def _download_worker(self, url: str, dest: Path) -> None:
        """Stream *url* to *dest* in 64 KiB chunks, updating ``_dl_state``.

        Verifies before reporting done: a proxy drop can close the connection
        early, urllib's read() then returns EOF WITHOUT raising, and the result
        is a truncated installer that fails to install (observed: 2.75MB of a
        48MB file marked "done").  Checks bytes-vs-Content-Length + the PE
        ``MZ`` magic, and retries a truncated fetch up to twice.
        """
        state = self._dl_state
        for attempt in range(3):
            state["status"] = "downloading"
            try:
                proxy = self._wininet_proxy()
                if proxy:
                    opener = urllib.request.build_opener(self._proxy_handler(proxy))
                else:
                    opener = urllib.request.build_opener()
                req = urllib.request.Request(url, headers={"User-Agent": "agent-box-updater"})
                with opener.open(req, timeout=30) as resp, open(dest, "wb") as fh:
                    total = int(resp.headers.get("Content-Length") or 0)
                    state["bytes_total"] = total
                    done = 0
                    while True:
                        chunk = resp.read(64 * 1024)
                        if not chunk:
                            break
                        fh.write(chunk)
                        done += len(chunk)
                        state["bytes_written"] = done
                # Truncation check: content-length promised N, we got less.
                if total and done != total:
                    raise OSError(f"下载不完整（{done}/{total} 字节）")
                # A valid Windows installer starts with the PE "MZ" magic.
                with open(dest, "rb") as fh:
                    if fh.read(2) != b"MZ":
                        raise OSError("下载的文件不是有效的安装程序")
                state["status"] = "done"
                return
            except Exception as e:
                if attempt < 2:
                    state["error"] = f"下载中断，重试中（第 {attempt + 1}/2 次）：{e}"
                    continue
                state["status"] = "error"
                state["error"] = f"下载失败：{e}"

    def get_download_progress(self) -> dict:
        """Read the background download's live state.  ``{status, bytes_written,
        bytes_total, dest}``; status: idle | downloading | done | error.  The
        worker thread mutates the dict in place, so this is a plain read."""
        state = getattr(self, "_dl_state", None)
        if not state:
            return {"status": "idle", "bytes_written": 0, "bytes_total": 0, "dest": ""}
        return state

    def launch_update_installer(self) -> dict:
        """Launch the downloaded Inno installer silently — UNELEVATED.

        setup.iss uses ``PrivilegesRequired=lowest``, so an unelevated run
        installs PER-USER to ``{localappdata}\\Programs\\AgentBox`` — exactly
        where the app lives.  Elevating (``-Verb RunAs``) would make ``{autopf}``
        resolve to the machine-wide ``Program Files``, installing a SECOND copy
        the user's shortcut never points at — the update appeared to "not
        take".  No elevation, no UAC, same directory.  ``CloseApplications``
        force-closes the running app mid-RPC, so we fire-and-forget.
        """
        state = getattr(self, "_dl_state", None)
        dest = (state or {}).get("dest") or ""
        if not dest or not Path(dest).exists():
            raise RuntimeError("installer not downloaded yet")
        # Sanity-check the file BEFORE launching: a truncated/partial installer
        # (from an interrupted or pre-fix download) would fail silently.  The
        # worker now verifies, but refuse a bad file here too (belt + braces).
        size = Path(dest).stat().st_size
        total = (state or {}).get("bytes_total") or 0
        if total and size < total:
            raise RuntimeError(f"安装包不完整（{size}/{total} 字节）— 请重新下载")
        if size < 1_000_000 or open(dest, "rb").read(2) != b"MZ":
            raise RuntimeError("安装包无效 — 请重新下载")
        subprocess.Popen(
            [str(dest), "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"],
            cwd=str(Path(dest).parent),
            creationflags=_NO_WINDOW,
        )
        return {"launched": str(dest)}
