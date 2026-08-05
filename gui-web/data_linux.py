"""Direct-import data access for Linux/WSL environments."""

import json
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Optional

from agent_box import config
from agent_box.adapters import acs, models as models_adapter
from agent_box.core.library import get_agent_config
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
        """Launch the ACS GUI binary (detached). Path from config.acs_binary()."""
        subprocess.Popen(
            [str(config.acs_binary())],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
