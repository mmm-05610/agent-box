"""Profile lifecycle: create, list, show, delete.

Profiles are created by copying the agent type's template directory
into ``$AGENT_BOX_HOME/profiles/<name>/dot-<type>/``. Profile metadata
lives in the ``profiles`` table of ``agent-box.db``.

:class:`ProfileRepo` handles data access.  :func:`create` orchestrates
template copy + preset application + DB insert.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List

from .. import config
from ..core import db as _core_db
from ..core import library
from ..core.io import deep_merge


class ProfileError(Exception):
    """Raised for any profile-level operation failure."""


def _row_to_dict(row: Any) -> Dict[str, str]:
    """Map a ``profiles`` table row to the public meta dict."""
    d = dict(row)
    return {
        "name": d.get("name") or "",
        "agent_type": d.get("agent_type") or "",
        "display_name": d.get("display_name") or "",
        "description": d.get("description") or "",
        "provider": d.get("provider_ref") or "",
        "claude_md": d.get("claude_md_ref") or "",
        "preset": "",
    }


# ---------------------------------------------------------------------------
# Repository — data access only
# ---------------------------------------------------------------------------

class ProfileRepo:
    """Data access for the ``profiles`` table."""

    @staticmethod
    def _ensure_exists(name: str) -> None:
        conn = _core_db.get_conn()
        if conn.execute(
            "SELECT 1 FROM profiles WHERE name = ?", (name,)
        ).fetchone() is None:
            raise ProfileError(
                f"{name}: profile not found. "
                f"Try: agent-box create {name} --type claude"
            )

    def find_by_name(self, name: str) -> Dict[str, str]:
        config.validate_profile_name(name)
        conn = _core_db.get_conn()
        row = conn.execute(
            "SELECT name, agent_type, display_name, description, "
            "provider_ref, claude_md_ref FROM profiles WHERE name = ?",
            (name,),
        ).fetchone()
        if row is None:
            raise ProfileError(
                f"{name}: profile not found. "
                f"Try: agent-box create {name} --type claude"
            )
        return _row_to_dict(row)

    def update(
        self,
        name: str,
        *,
        display_name: str | None = None,
        description: str | None = None,
        provider: str | None = None,
        claude_md: str | None = None,
    ) -> Dict[str, str]:
        config.validate_profile_name(name)
        self._ensure_exists(name)

        updates: Dict[str, Any] = {}
        if display_name is not None:
            updates["display_name"] = display_name
        if description is not None:
            updates["description"] = description
        if provider is not None:
            updates["provider_ref"] = provider
        if claude_md is not None:
            updates["claude_md_ref"] = claude_md

        if not updates:
            return self.find_by_name(name)

        conn = _core_db.get_conn()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE profiles SET {set_clause} WHERE name = ?",
            list(updates.values()) + [name],
        )
        conn.commit()
        return self.find_by_name(name)

    def insert(
        self,
        name: str, agent_type: str,
        display_name: str = "",
        description: str = "",
        provider: str | None = None,
        claude_md: str | None = None,
    ) -> None:
        """INSERT a new profile row.  Does NOT create directories or files."""
        conn = _core_db.get_conn()
        conn.execute(
            "INSERT INTO profiles "
            "(name, agent_type, display_name, description, provider_ref, claude_md_ref) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (name, agent_type, display_name, description, provider, claude_md),
        )
        conn.commit()

    def list_all(self) -> List[Dict[str, Any]]:
        conn = _core_db.get_conn()
        rows = conn.execute(
            "SELECT name, agent_type, display_name, provider_ref, claude_md_ref "
            "FROM profiles ORDER BY id DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def show(self, name: str) -> Dict[str, Any]:
        config.validate_profile_name(name)
        meta = self.find_by_name(name)
        agent_type = meta.get("agent_type", "claude")
        config_dir = config.profile_agent_dir(name, agent_type)
        data_dir = config.profile_agent_data_dir(name, agent_type)

        info: Dict[str, Any] = {
            "path": str(config.profile_dir(name)),
            "meta": meta,
            "config_dir": str(config_dir),
        }
        if data_dir and data_dir.is_dir():
            info["data_dir"] = str(data_dir)
        for k in ("display_name", "description", "provider", "preset"):
            v = meta.get(k)
            if v:
                info[k] = v
        return info

    def delete(self, name: str, force: bool = False) -> bool:
        config.validate_profile_name(name)
        self._ensure_exists(name)

        if not force:
            confirm = input(f"Delete profile {name!r}? [y/N] ").strip().lower()
            if confirm not in ("y", "yes"):
                print("aborted.", file=sys.stderr)
                return False

        conn = _core_db.get_conn()
        conn.execute("DELETE FROM profiles WHERE name = ?", (name,))
        conn.commit()

        root = config.profile_dir(name)
        if root.exists():
            try:
                shutil.rmtree(root)
            except OSError as exc:
                raise ProfileError(
                    f"{name}: removed from DB, but rmtree failed: {exc}"
                ) from exc
        return True


# ---------------------------------------------------------------------------
# Module-level — file operations and orchestration
# ---------------------------------------------------------------------------

_repo = ProfileRepo()


def _copy_template(name: str, agent_type: str) -> None:
    """Copy the agent type template into the profile directory."""
    template_dir = library.get_template_dir(agent_type)
    if template_dir is None:
        raise ProfileError(f"no template directory for {agent_type!r}")
    target = config.profile_agent_dir(name, agent_type)
    shutil.copytree(template_dir, target, symlinks=True)

    # Extra profile files (e.g. dot-claude.json, dot-agents/)
    agent_config = library.get_agent_config(agent_type)
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {agent_type!r}")
    root = config.profile_dir(name)
    for relative_path in agent_config.get("extra_profile_files", []):
        extra_path = root / relative_path.rstrip("/")
        if relative_path.endswith("/"):
            extra_path.mkdir(parents=True, exist_ok=True)
        else:
            extra_path.write_text("{}\n", encoding="utf-8")

    # Secondary data template (e.g. OpenCode auth.json)
    data_template = library.get_template_data_dir(agent_type)
    if data_template is not None:
        data_target = config.profile_agent_data_dir(name, agent_type)
        if data_target is not None:
            shutil.copytree(data_template, data_target, symlinks=True)


def _apply_preset(
    name: str, agent_type: str,
    preset_name: str | None, claude_md_body: str | None,
) -> None:
    """Write preset CLAUDE.md / hooks / settings overlay (CC only)."""
    import json as _json

    target = config.profile_agent_dir(name, agent_type)

    if agent_type == "claude" and preset_name is not None:
        preset_dir = library.get_preset_dir(agent_type, preset_name)
        if preset_dir is None:
            raise ProfileError(
                f"unknown preset {preset_name!r} for {agent_type!r}. "
                f"Available: {', '.join(library.list_presets(agent_type)) or '(none)'}"
            )

        claude_md_src = preset_dir / "CLAUDE.md"
        if claude_md_src.is_file():
            (target / "CLAUDE.md").write_text(
                claude_md_src.read_text(encoding="utf-8")
            )

        hooks_src = preset_dir / "hooks.json"
        if hooks_src.is_file():
            hooks_dst = target / "hooks" / "hooks.json"
            hooks_dst.parent.mkdir(parents=True, exist_ok=True)
            hooks_dst.write_text(hooks_src.read_text(encoding="utf-8"))

        overlay_src = preset_dir / "settings.overlay.json"
        if overlay_src.is_file():
            settings_path = target / "settings.json"
            if not settings_path.is_file():
                raise ProfileError(
                    f"preset {preset_name!r}: missing base settings.json"
                )
            try:
                base = _json.loads(settings_path.read_text(encoding="utf-8"))
                overlay = _json.loads(overlay_src.read_text(encoding="utf-8"))
            except _json.JSONDecodeError as exc:
                raise ProfileError(
                    f"preset {preset_name!r}: settings overlay requires "
                    f"object base + overlay"
                ) from exc
            if not isinstance(base, dict) or not isinstance(overlay, dict):
                raise ProfileError(
                    f"preset {preset_name!r}: settings overlay requires "
                    f"object base + overlay"
                )
            settings_path.write_text(
                _json.dumps(deep_merge(base, overlay), indent=2) + "\n"
            )
    elif claude_md_body is not None and agent_type == "claude":
        (target / "CLAUDE.md").write_text(claude_md_body)


def create(
    name: str,
    agent_type: str = "claude",
    *,
    display_name: str | None = None,
    description: str | None = None,
    provider: str | None = None,
    claude_md: str | None = None,
    preset: str | None = None,
) -> Path:
    """Create a new profile.

    1. Copy the agent type template to disk
    2. Apply optional preset overlay
    3. INSERT into the profiles table
    """
    config.validate_profile_name(name)
    if agent_type not in library.get_agent_types():
        raise ProfileError(
            f"unknown agent_type {agent_type!r}. "
            f"Valid: {', '.join(library.get_agent_types())}"
        )

    # Guard against duplicates (both DB and disk).
    conn = _core_db.get_conn()
    if conn.execute(
        "SELECT 1 FROM profiles WHERE name = ?", (name,)
    ).fetchone() is not None:
        raise ProfileError(
            f"profile {name!r} already exists. "
            f"Use: agent-box delete {name} first"
        )
    root = config.profile_dir(name)
    if root.exists():
        raise ProfileError(
            f"profile {name!r} directory already exists at {root}. "
            f"Use: agent-box delete {name} first"
        )

    _copy_template(name, agent_type)
    _apply_preset(name, agent_type, preset, claude_md)
    _repo.insert(name, agent_type,
                 display_name=display_name or "",
                 description=description or "",
                 provider=provider,
                 claude_md=claude_md)
    return root


# Module-level wrappers
load_meta    = _repo.find_by_name
update_meta  = _repo.update
list_profiles = _repo.list_all
show         = _repo.show
delete       = _repo.delete


__all__ = [
    "ProfileError",
    "create",
    "delete",
    "list_profiles",
    "load_meta",
    "show",
    "update_meta",
]
