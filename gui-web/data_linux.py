"""Direct-import data access for Linux/WSL environments."""

import json
import os
import re
import shlex
import shutil
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from agent_box import config
from agent_box.adapters import acs, models as models_adapter
from agent_box.core.library import get_agent_config, get_agent_types
from agent_box.resources import mcp, profile, providers, sessions, skills
from agent_box.resources.prompts import apply_prompt


def _dir_tree_node(p: Path, max_depth: int = 4) -> Optional[dict]:
    """Build a directory tree. Hidden files excluded."""
    try:
        p = p.expanduser().resolve()
    except Exception:
        return None
    if not p.is_dir():
        return None

    entries = []
    for child in sorted(p.iterdir()):
        name = child.name
        if name.startswith("."):
            continue
        try:
            rel = str(child)
            if child.is_dir():
                entries.append({"path": rel, "type": "dir"})
            elif child.is_file():
                stat = child.stat()
                entries.append({
                    "path": rel, "type": "file",
                    "size": stat.st_size,
                    "mtime": int(stat.st_mtime * 1000),
                })
        except OSError:
            continue
    return {"path": str(p), "type": "dir", "children": entries}


_VERSION_RE = re.compile(r"\d+(?:\.\d+)+[a-zA-Z0-9.\-]*")

# When an install command fails because a prerequisite tool is missing, map
# the shell error to a targeted hint the UI can show verbatim.  We remind,
# we never auto-install — runtimes (Node/Python) are system-level choices.
_PRE_REQ_HINTS = (
    (re.compile(r"(?:npm|node).*?(?:not found|command not found|no such file)", re.I),
     "缺 Node.js / npm — 先安装 Node.js (https://nodejs.org)，装完重开 agent-box 再装"),
    (re.compile(r"(?:python3?|pip).*?(?:not found|command not found|no such file)", re.I),
     "缺 Python — 先安装 Python3 + pip（Ubuntu: sudo apt install python3-pip）"),
    (re.compile(r"E: Unable to locate package", re.I),
     "apt 源里没有该包 — 先运行 sudo apt update"),
    (re.compile(r"permission denied", re.I),
     "权限不足 — 在 WSL 里手动跑 sudo 命令安装"),
)


def _install_error_hint(output: str) -> str | None:
    """Return a targeted prereq hint for a failed install, else None."""
    for pattern, hint in _PRE_REQ_HINTS:
        if pattern.search(output):
            return hint
    return None


def _npm_enotempty_path(output: str) -> str | None:
    """If npm failed with ENOTEMPTY, return the exact blocked dir to remove.

    Self-heal for an interrupted earlier install: npm leaves a partial package
    dir and the next ``npm install`` dies renaming into it.  Scoped for
    safety — the path must come from npm's own ``npm error path:`` line and
    resolve under the npm global node_modules root, so we never remove
    anything npm didn't flag.
    """
    if "ENOTEMPTY" not in output:
        return None
    m = re.search(r"(?:npm error\s+)?path:\s*(\S+)", output)
    if not m:
        return None
    target = Path(m.group(1)).expanduser()
    try:
        root = Path(
            subprocess.run(["npm", "root", "-g"], capture_output=True, text=True,
                           timeout=15).stdout.strip()
        )
    except Exception:
        return None
    if not root.is_absolute() or not target.is_relative_to(root):
        return None
    if not target.is_dir():
        return None
    return str(target)
# Fallback search dirs when the RPC shell's PATH misses the user's installs
# (mirrors cc-switch's scan_cli_version: npm-global / user bin / cargo bin).
_COMMON_BIN_DIRS = ("~/.npm-global/bin", "~/.local/bin", "~/.cargo/bin")

# cc-switch-style latest-version cache: one fetch per package per TTL.
# Cache value: (timestamp, version, error).  Errors are surfaced to the UI so
# a failed fetch is visible instead of silently missing.
_latest_cache: dict[str, tuple[float, str | None, str | None]] = {}


def _fetch_latest_version(source: dict, ttl: float = 600) -> tuple[str | None, str | None]:
    """Best-effort latest version from npm/pypi (never raises, cached).

    Returns ``(version, error)`` — version on success, or None plus a
    human-readable error so the UI can echo the failure back to the user.
    """
    if not isinstance(source, dict):
        return None, "bad latest source"
    kind, pkg = source.get("type"), source.get("package")
    if not kind or not pkg:
        return None, "no latest source declared"
    key = f"{kind}:{pkg}"
    now = time.monotonic()
    if key in _latest_cache and now - _latest_cache[key][0] < ttl:
        return _latest_cache[key][1], _latest_cache[key][2]

    # npm primary + China-friendly mirror fallback; pypi single endpoint.
    urls = {
        "npm": (
            f"https://registry.npmjs.org/{pkg}/latest",
            f"https://registry.npmmirror.com/{pkg}/latest",
        ),
        "pip": (f"https://pypi.org/pypi/{pkg}/json",),
    }.get(kind)
    if not urls:
        return None, f"unsupported latest source type {kind!r}"

    import urllib.request
    result: str | None = None
    error: str | None = None
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "agent-box-gui"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if kind == "npm":
                result = data.get("version")
            elif kind == "pip":
                result = (data.get("info") or {}).get("version")
            if result:
                error = None
                break
            error = f"no version in response from {url}"
        except Exception as e:
            error = f"{type(e).__name__}: {e}"
            continue
    _latest_cache[key] = (now, result, error)
    return result, error


_acs_version_cache: dict[str, str | None] = {}


def _acs_version(path: str) -> str | None:
    """Extract cc-switch's version from the binary without launching it.

    cc-switch is a Tauri GUI app — running it with any arg LAUNCHES the window
    (it has no CLI ``--version``), so we read the version out of the embedded
    startup banner (``CC Switch vX.Y.Z started``) instead.  Cached per path.
    """
    if path in _acs_version_cache:
        return _acs_version_cache[path]
    result: str | None = None
    try:
        with open(path, "rb") as f:
            head = f.read(64 * 1024 * 1024)  # binary is ~30MB, cap generously
        m = re.search(rb"CC Switch v(\d+\.\d+\.\d+)", head)
        if m:
            result = m.group(1).decode("utf-8", "replace")
    except Exception:
        pass
    _acs_version_cache[path] = result
    return result


def _which_wsl(binary: str) -> str | None:
    """``shutil.which`` that skips Windows-mounted (``/mnt/...``) candidates.

    ``wsl.exe bash -lc`` injects the Windows PATH, so the first match for e.g.
    ``claude`` can be a Windows npm shim at ``/mnt/c/Users/.../Roaming/npm``
    that reports "claude binary not installed" — wrong for the WSL runtime.
    On WSL a real agent binary never lives under /mnt, so skipping those is
    safe and keeps the probe honest.
    """
    for d in os.environ.get("PATH", "").split(os.pathsep):
        if not d or d.startswith("/mnt/"):
            continue
        p = os.path.join(d, binary)
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


def _probe_binary(binary: str, path: str | None = None) -> dict:
    """Detect a binary the way cc-switch does.

    PATH first (``shutil.which``), then scan common install dirs.  ``installed``
    means a runnable file was located; ``broken`` means it exists but
    ``--version`` fails (installed-but-can't-run, e.g. a Windows PE on Linux or
    an npm shim whose real binary is missing).  The version is pulled out of
    ``--version`` output with a semver regex — never the raw first line.
    """
    result = {"installed": False, "broken": False, "version": None, "path": None}
    if not binary:
        return result

    if path is None:
        path = _which_wsl(binary)
        if path is None:
            for d in _COMMON_BIN_DIRS:
                p = Path(d).expanduser() / binary
                if p.is_file() and os.access(p, os.X_OK):
                    path = str(p)
                    break
    if not path:
        return result

    result["installed"] = True
    result["path"] = path
    try:
        out = subprocess.run(
            [path, "--version"], capture_output=True, text=True, timeout=15,
            encoding="utf-8", errors="replace",
        )
    except subprocess.TimeoutExpired:
        # installed but --version is just slow (e.g. hermes) — not broken.
        return result
    except OSError:
        # located but can't exec — broken symlink / Windows PE on Linux.
        result["broken"] = True
        return result
    if out.returncode != 0:
        # located but --version failed — installed-but-can't-run.
        result["broken"] = True
        return result
    raw = (out.stdout or out.stderr).strip()
    m = _VERSION_RE.search(raw)
    result["version"] = m.group(0) if m else (raw[:60] or None)
    return result


def _resolve_acs(exists_only: bool = False) -> Optional[Path]:
    """Find a runnable cc-switch, provisioning from the bundle if needed.

    Order: env override → installed copy (~/.agent-box/bin) → bundled in the
    packaged runtime (``_MEIPASS/runtime/bin/cc-switch``, copied + chmod'ed
    because ELF cannot exec from the /mnt/c drvfs) → repo submodule (dev).
    """
    override = os.environ.get("AGENT_BOX_ACS_BINARY")
    if override:
        p = Path(override).expanduser()
        if p.is_file():
            return p
    installed = config.agent_box_home() / "bin" / "cc-switch"
    if installed.is_file():
        return installed
    bundled = Path(__file__).parent / "bin" / "cc-switch"
    if bundled.is_file():
        if exists_only:
            return bundled
        try:
            installed.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(bundled, installed)
            installed.chmod(installed.stat().st_mode | 0o111)
            return installed
        except OSError:
            return bundled
    repo = config.package_dir().parent.parent / "acs" / "src-tauri" / "target" / "release" / "cc-switch"
    if repo.is_file():
        return repo
    return None


def _github_latest() -> dict:
    """Fetch the latest agent-box release from GitHub (never raises)."""
    import urllib.request
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/mmm-05610/agent-box/releases/latest",
            headers={"User-Agent": "agent-box-gui", "Accept": "application/vnd.github+json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            release = json.loads(resp.read().decode("utf-8"))
        tag = (release.get("tag_name") or "").lstrip("v")
        asset_url = next(
            (a.get("browser_download_url", "") for a in release.get("assets", [])
             if a.get("name", "").startswith("agent-box-setup-")),
            "",
        )
        return {
            "current": "",
            "latest": tag,
            "asset_url": asset_url,
            "release_url": release.get("html_url", ""),
            "notes": (release.get("body") or "")[:500],
        }
    except Exception:
        return {"current": "", "latest": "", "asset_url": "", "release_url": "", "notes": ""}


class LinuxDataAccess:
    """agent_box access via direct import. Launch via xterm/WSLg."""

    def check_environment(self) -> dict:
        """The Linux host always satisfies the runtime gate (no WSL needed)."""
        return {"ready": True, "wsl": True, "distro": True, "detail": ""}

    # ── Profiles ────────────────────────────────────────────────────

    def list_profiles(self) -> list:
        return profile.list_profiles()

    def get_profile(self, name: str) -> dict:
        return profile.show(name)

    def create_profile(
        self, name: str, agent_type: str,
        display_name: str = "", description: str = "", preset: str = "",
    ) -> dict:
        profile.create(
            name, agent_type=agent_type,
            display_name=display_name, description=description,
            preset=preset or None,
        )
        return {"name": name, "agent_type": agent_type}

    def delete_profile(self, name: str) -> None:
        profile.delete(name, force=True)

    def edit_profile(
        self, name: str,
        display_name: str = "", description: str = "",
        provider: str = "", prompt: str = "",
    ) -> dict:
        if not any([display_name, description, provider, prompt]):
            raise ValueError("no fields to update")
        profile.update_meta(
            name,
            display_name=display_name or None,
            description=description or None,
            provider=provider or None,
            prompt=prompt or None,
        )
        return profile.show(name)

    def launch_profile(self, name: str, agent_type: str, mode: str, cwd: str = "") -> dict:
        """Launch a profile in a new terminal window via xterm/WSLg."""
        agent_config = get_agent_config(agent_type)
        launch_block = (
            (agent_config.get("runtime") or {}).get("launch")
            if agent_config is not None else None
        )
        resume_args = (launch_block or {}).get("resume") or []
        launch_cmd = f"launch {name}"
        # runtime.launch.resume is a full command array (["claude", "-c"]);
        # the CLI launch passes everything after the profile name through
        # to the agent binary, so the binary name is skipped here.
        if mode == config.MODE_RESUME and len(resume_args) > 1:
            launch_cmd += " " + " ".join(resume_args[1:])

        # cwd is resolved by the backend launch (expanduser) — pass it as a
        # flag, not a `cd` in the shell (which chokes on `~` and quoting).
        if cwd:
            launch_cmd += f" --cwd {shlex.quote(cwd)}"
        setup = 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"'
        script = f'{setup} && agent-box exec "{launch_cmd}"'
        script += (
            ' || { ec=$?; echo; echo agent-box failed code $ec; '
            'read -p "Press Enter to close..." ; }'
        )

        term = shutil.which("xterm") or shutil.which("gnome-terminal") or shutil.which("konsole")
        if not term:
            raise RuntimeError(
                "no terminal emulator found. Install: sudo apt install xterm"
            )
        subprocess.Popen(
            [term, "-e", f"bash -lc '{script}'"],
            start_new_session=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return {"pid": 0}

    # ── Config ──────────────────────────────────────────────────────

    def home_dir(self) -> str:
        """The OS home directory (config.home_dir)."""
        return config.home_dir()

    def get_version(self) -> str:
        """The agent-box backend version (agent_box.__version__)."""
        from agent_box import __version__
        return __version__

    def get_default_agent(self) -> str:
        """The backend's default agent type (config.DEFAULT_AGENT_TYPE)."""
        return config.DEFAULT_AGENT_TYPE

    def get_agent_configs(self) -> dict:
        """The full agent-type registry (identity/runtime/resources)."""
        from agent_box.core.library import get_agent_config, get_agent_types
        return {at: get_agent_config(at) for at in get_agent_types()}

    def get_projects_dir(self) -> str:
        """The current projects dir (config.projects_dir)."""
        return config.projects_dir()

    def save_projects_dir(self, value: str) -> None:
        """Persist the projects dir (config.set_projects_dir)."""
        config.set_projects_dir(value)

    # ── Sessions ────────────────────────────────────────────────────

    def list_sessions(self) -> list:
        return sessions.fetch_sessions()

    def cleanup_sessions(self) -> int:
        return sessions.cleanup_stale_sessions()

    # ── Apply / Remove ──────────────────────────────────────────────

    def apply_provider(self, profile_name: str, provider_id: str) -> None:
        providers.apply_provider(profile_name, provider_id)

    def apply_prompt(self, profile_name: str, md_id: str) -> None:
        apply_prompt(profile_name, md_id)

    def list_profile_providers(self, profile_name: str) -> list:
        meta = profile.load_meta(profile_name)
        return providers.list_profile_providers(profile_name, meta["agent_type"])

    def remove_profile_provider(self, profile_name: str, provider_id: str) -> None:
        meta = profile.load_meta(profile_name)
        providers.remove_profile_provider(profile_name, meta["agent_type"], provider_id)

    def apply_mcp_to_profile(self, profile_name: str, mcp_id: str) -> None:
        mcp.apply_mcp_server(profile_name, mcp_id)

    def get_profile_mcp(self, profile_name: str) -> list:
        return mcp.list_profile_mcp_servers(profile_name)

    def remove_mcp_from_profile(self, profile_name: str, mcp_id: str) -> None:
        mcp.remove_mcp_from_profile(profile_name, mcp_id)

    def apply_skill_to_profile(self, profile_name: str, skill_id: str) -> None:
        skills.apply_skill(profile_name, skill_id)

    def remove_skill_from_profile(self, profile_name: str, skill_id: str) -> None:
        skills.remove_skill_from_profile(profile_name, skill_id)

    # ── ACS Library (read-only) ─────────────────────────────────────

    def list_providers(self, agent_type: str) -> list:
        return acs.list_providers(agent_type)

    def get_provider(self, agent_type: str, provider_id: str) -> dict | None:
        return acs.get_provider(agent_type, provider_id)

    def list_prompts(self, agent_type: str) -> list:
        return acs.list_prompts(agent_type)

    def get_prompt(self, agent_type: str, md_id: str) -> dict | None:
        return acs.get_prompt(agent_type, md_id)

    def list_mcp_servers(self, agent_type: str) -> list:
        return acs.list_mcp_servers(agent_type)

    def get_mcp_server(self, server_id: str) -> dict | None:
        return acs.get_mcp_server(server_id)

    def list_skills(self, agent_type: str) -> list:
        return acs.list_skills(agent_type)

    def fetch_models(
        self, base_url: str, api_key: str,
        models_url: str = "", is_full_url: bool = False, timeout_sec: int = 10,
    ) -> list:
        return models_adapter.fetch_models(
            base_url, api_key, models_url, is_full_url, timeout_sec,
        )

    # ── File I/O (WSL/Linux filesystem) ─────────────────────────────

    def read_file(self, path: str) -> str:
        p = Path(path).expanduser()
        if p.is_file():
            return p.read_text(encoding="utf-8")
        return ""

    def save_file(self, path: str, content: str) -> None:
        p = Path(path).expanduser()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")

    def patch_json_file(self, path: str, key: str, value_json: str) -> None:
        p = Path(path).expanduser()
        existing = {}
        if p.is_file():
            raw = p.read_text(encoding="utf-8").strip()
            if raw:
                existing = json.loads(raw)
        if not isinstance(existing, dict):
            existing = {}
        existing[key] = json.loads(value_json)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(
            json.dumps(existing, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    def list_dir(self, path: str) -> str:
        p = Path(path).expanduser()
        if not p.is_dir():
            return ""
        lines = []
        for child in sorted(p.iterdir()):
            st = child.stat()
            lines.append(
                f"{'d' if child.is_dir() else '-'} "
                f"{st.st_size:>8}  {child.name}"
            )
        return "\n".join(lines)

    def find_files(self, path: str) -> list:
        p = Path(path).expanduser()
        if not p.is_dir():
            return []
        return [str(f) for f in p.rglob("*") if f.is_file()]

    def delete_path(self, path: str) -> None:
        p = Path(path).expanduser().resolve()
        if str(p) in {"/", str(Path.home())}:
            raise ValueError("refusing to delete unsafe path")
        if p.is_dir():
            shutil.rmtree(p)
        elif p.is_file():
            p.unlink()

    def list_dir_tree(self, path: str, max_depth: int = 4) -> dict | None:
        return _dir_tree_node(Path(path), max_depth)

    # ── Misc ────────────────────────────────────────────────────────

    def last_cwd_map(self) -> dict:
        rows = sessions.fetch_sessions()
        result: dict[str, str] = {}
        for s in rows:
            name = s.get("profile", "")
            cwd = s.get("cwd") or ""
            if name and cwd and name not in result:
                result[name] = cwd
        return result

    def launch_acs(self) -> None:
        """Launch the ACS GUI binary (detached).

        Resolves through ``_resolve_acs`` — on a bare machine this
        auto-provisions the bundled cc-switch into ``~/.agent-box/bin``
        (drvfs cannot exec ELF, so it must land on the WSL filesystem first).
        """
        binary = _resolve_acs()
        if binary is None:
            raise RuntimeError(
                "cc-switch not found — install it from the Environment page"
            )
        subprocess.Popen(
            [str(binary)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

    # ── Environment / provisioning ───────────────────────────────────

    def check_binaries(self) -> list:
        """Detect agent binaries + cc-switch inside WSL.  Registry-driven.

        Mirrors cc-switch's probe model: PATH first, then common install dirs,
        distinguishing installed-but-broken (``broken``) from not installed.
        Also fetches each agent's latest npm/pypi version in parallel (cached,
        best-effort) so the UI can show "update available".
        """
        out = []
        latest_sources: dict[str, dict] = {}
        for agent_type in get_agent_types():
            cfg = get_agent_config(agent_type) or {}
            binary = ((cfg.get("identity") or {}).get("binary")) or ""
            info = _probe_binary(binary)
            out.append({
                "kind": "agent",
                "agent_type": agent_type,
                "name": binary,
                "installed": info["installed"],
                "broken": info["broken"],
                "path": info["path"],
                "version": info["version"],
                "latest_version": None,
                "latest_error": None,
            })
            src = ((cfg.get("runtime") or {}).get("latest")) or {}
            if src:
                latest_sources[agent_type] = src
        with ThreadPoolExecutor(max_workers=4) as ex:
            futures = {at: ex.submit(_fetch_latest_version, src)
                       for at, src in latest_sources.items()}
            for row in out:
                fut = futures.get(row["agent_type"])
                if fut:
                    version, error = fut.result()
                    row["latest_version"] = version
                    row["latest_error"] = error
        acs = _resolve_acs(exists_only=True)
        # NOTE: never run `cc-switch --version` here — cc-switch is a Tauri GUI
        # app that does not answer a --version probe and instead LAUNCHES its
        # window, which the probe then kills on timeout.  Report presence only.
        out.append({
            "kind": "acs",
            "agent_type": "acs",
            "name": "cc-switch",
            "installed": acs is not None,
            "broken": False,
            "path": str(acs) if acs else None,
            "version": _acs_version(str(acs)) if acs else None,
            "latest_version": None,
            "latest_error": None,
        })
        return out

    def get_install_command(self, agent_type: str) -> str:
        """The one-line install command declared for *agent_type*."""
        cfg = get_agent_config(agent_type)
        if cfg is None:
            raise ValueError(f"unknown agent_type {agent_type!r}")
        cmd = ((cfg.get("runtime") or {}).get("install")) or ""
        if not cmd:
            raise ValueError(f"no install command declared for {agent_type!r}")
        return cmd

    def install_binary(self, agent_type: str) -> dict:
        """Run the agent's install command silently in the background.

        No console window — the RPC call blocks until the install finishes and
        returns ``{ok, error}`` so the UI can show a loading state and echo a
        real error message instead of silently spawning a terminal.
        """
        cmd = self.get_install_command(agent_type)
        setup = 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"; '
        for attempt in (1, 2):
            try:
                out = subprocess.run(
                    f"{setup}{cmd}", shell=True, capture_output=True, text=True,
                    timeout=600, encoding="utf-8", errors="replace",
                )
            except subprocess.TimeoutExpired:
                return {"ok": False, "error": "install timed out after 10 minutes"}
            except Exception as e:
                return {"ok": False, "error": str(e)}
            if out.returncode == 0:
                return {"ok": True, "error": None}
            combined = "\n".join(x for x in (out.stdout, out.stderr) if x)
            # Self-heal an interrupted earlier install: npm ENOTEMPTY means a
            # partial package dir blocks the rename.  Remove exactly the dir
            # npm flagged (scoped to its own node_modules) and retry once.
            if attempt == 1:
                target = _npm_enotempty_path(combined)
                if target:
                    shutil.rmtree(target, ignore_errors=True)
                    continue
            hint = _install_error_hint(combined)
            tail = "\n".join(combined.strip().splitlines()[-3:])
            error = f"{hint}\n原始输出: {tail}" if hint else f"exit {out.returncode}: {tail}"
            return {"ok": False, "error": error}
        return {"ok": False, "error": "install failed after cleanup"}

    def get_latest_version(self) -> dict:
        """Latest agent-box version from GitHub (best-effort in WSL)."""
        from agent_box import __version__
        info = _github_latest()
        info["current"] = __version__
        if not info["latest"]:
            info["latest"] = __version__
        return info
