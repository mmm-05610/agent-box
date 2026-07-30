"""Profile lifecycle: create, list, show, delete.

Profiles are created by copying the agent type's template directory
into ``$AGENT_BOX_HOME/profiles/<name>/dot-<type>/``. Profile metadata
(name, agent_type, display_name, description, provider_ref, claude_md_ref)
lives in the ``profiles`` table of ``agent-box.db`` (see :mod:`agent_box.core.db`).

For backward compatibility with v0.4 profiles (which stored meta in
``profiles/<name>/meta.yaml``), :func:`load_meta` lazily migrates a
legacy YAML file into the ``profiles`` table on first access and
renames it to ``meta.yaml.migrated``.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List

from .. import config
from ..core import library
from ..core.io import deep_merge


class ProfileError(Exception):
    """Raised for any profile-level operation failure."""


# --- meta IO (DB-backed) -------------------------------------------------

def _row_to_meta(row: Any) -> Dict[str, str]:
    """Map a ``profiles`` table row to the public meta dict.

    Always returns a dict with all v0.4 keys present (empty string for
    optional unset fields) so callers don't have to handle None.
    """
    d = dict(row)
    return {
        "name": d.get("name") or "",
        "agent_type": d.get("agent_type") or "",
        "display_name": d.get("display_name") or "",
        "description": d.get("description") or "",
        "provider": d.get("provider_ref") or "",
        "claude_md": d.get("claude_md_ref") or "",
        "preset": "",  # v1 doesn't activate preset
    }


def load_meta(name: str) -> Dict[str, str]:
    """Load profile metadata from the ``profiles`` table.

    Raises :class:`ProfileError` if the profile does not exist.
    """
    config.validate_profile_name(name)
    from ..core import db
    conn = db.get_conn()
    row = conn.execute(
        "SELECT name, agent_type, display_name, description, "
        "provider_ref, claude_md_ref FROM profiles WHERE name = ?",
        (name,),
    ).fetchone()
    if row is None:
        raise ProfileError(
            f"{name}: profile not found. Try: agent-box create {name} --type claude"
        )
    return _row_to_meta(row)


def update_meta(
    name: str,
    *,
    display_name: str | None = None,
    description: str | None = None,
    provider: str | None = None,
    claude_md: str | None = None,
) -> Dict[str, str]:
    """Update editable metadata fields for *name*.

    Only the fields that are explicitly provided (not ``None``) are
    updated in the ``profiles`` table. Returns the full meta dict
    after the update.
    """
    config.validate_profile_name(name)
    from ..core import db
    conn = db.get_conn()
    row = conn.execute(
        "SELECT 1 FROM profiles WHERE name = ?", (name,)
    ).fetchone()
    if row is None:
        raise ProfileError(
            f"{name}: profile not found. Try: agent-box create {name} --type claude"
        )

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
        return load_meta(name)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [name]
    conn.execute(
        f"UPDATE profiles SET {set_clause} WHERE name = ?",
        values,
    )
    conn.commit()
    return load_meta(name)


# --- create ---------------------------------------------------------------

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
    """Create a new profile by copying the agent type's template directory.

    Profile metadata is written to the ``profiles`` table. The template
    is copied into ``profiles/<name>/dot-<type>/`` (bwrap bind-mounts
    that path on launch).
    """
    config.validate_profile_name(name)
    if agent_type not in library.get_agent_types():
        raise ProfileError(
            f"unknown agent_type {agent_type!r}. "
            f"Valid: {', '.join(library.get_agent_types())}"
        )

    from ..core import db
    conn = db.get_conn()
    # DB uniqueness check (cheap; avoids relying on the directory's
    # presence for duplicate detection).
    existing = conn.execute(
        "SELECT 1 FROM profiles WHERE name = ?", (name,)
    ).fetchone()
    if existing is not None:
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

    # Copy the main config template directory
    template_dir = library.get_template_dir(agent_type)
    if template_dir is None:
        raise ProfileError(f"no template directory for {agent_type!r}")
    target = config.profile_agent_dir(name, agent_type)
    shutil.copytree(template_dir, target, symlinks=True)

    agent_config = library.get_agent_config(agent_type)
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {agent_type!r}")
    for relative_path in agent_config.get("extra_profile_files", []):
        extra_path = root / relative_path.rstrip("/")
        if relative_path.endswith("/"):
            extra_path.mkdir(parents=True, exist_ok=True)
        else:
            extra_path.write_text("{}\n", encoding="utf-8")

    # Copy the secondary data template directory (e.g. OpenCode auth)
    data_template = library.get_template_data_dir(agent_type)
    if data_template is not None:
        data_target = config.profile_agent_data_dir(name, agent_type)
        if data_target is not None:
            shutil.copytree(data_template, data_target, symlinks=True)

    # Optional preset copy (CC only in v0.4; reused for v1).
    if agent_type == "claude" and preset is not None:
        _apply_preset(target, agent_type, preset)
    elif claude_md is not None and agent_type == "claude":
        (target / "CLAUDE.md").write_text(claude_md)

    # Persist to DB.
    conn.execute(
        "INSERT INTO profiles "
        "(name, agent_type, display_name, description, provider_ref, claude_md_ref) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            name,
            agent_type,
            display_name or "",
            description or "",
            provider or None,
            claude_md or None,  # raw body, not a ref — see v1 spec
        ),
    )
    conn.commit()
    return root


def _apply_preset(target: Path, agent_type: str, preset_name: str) -> None:
    """Apply a preset's CLAUDE.md / hooks / settings overlay (CC-only)."""
    import json as _json
    preset_dir = library.get_preset_dir(agent_type, preset_name)
    if preset_dir is None:
        raise ProfileError(
            f"unknown preset {preset_name!r} for agent_type {agent_type!r}. "
            f"Available: {', '.join(library.list_presets(agent_type)) or '(none)'}"
        )
    if agent_type != "claude":
        raise ProfileError(
            f"presets are not yet supported for agent_type {agent_type!r} "
            f"(v1 ships CC presets only)"
        )

    claude_md_src = preset_dir / "CLAUDE.md"
    if claude_md_src.is_file():
        (target / "CLAUDE.md").write_text(claude_md_src.read_text(encoding="utf-8"))

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
                f"preset {preset_name!r}: settings overlay requires object base + overlay"
            ) from exc
        if not isinstance(base, dict) or not isinstance(overlay, dict):
            raise ProfileError(
                f"preset {preset_name!r}: settings overlay requires object base + overlay"
            )
        merged = deep_merge(base, overlay)
        settings_path.write_text(_json.dumps(merged, indent=2) + "\n")


# --- list / show / delete -------------------------------------------------

def list_profiles() -> List[Dict[str, Any]]:
    """Return all profiles (newest first) from the ``profiles`` table.

    Returns full meta so the GUI can show which provider each profile
    references without an extra round-trip per profile.
    """
    from ..core import db
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT name, agent_type, display_name, provider_ref, claude_md_ref "
        "FROM profiles ORDER BY id DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def show(name: str) -> Dict[str, Any]:
    """Return a dict describing *name* (metadata + on-disk paths)."""
    config.validate_profile_name(name)
    meta = load_meta(name)
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
    # Surface the v0.4-style optional fields at top level.
    for k in ("display_name", "description", "provider", "preset"):
        v = meta.get(k)
        if v:
            info[k] = v
    return info


def delete(name: str, force: bool = False) -> bool:
    """Delete *name* from the DB and remove its on-disk directory.

    The DB delete runs first (so the row is gone even if rmtree fails).
    A failed rmtree raises ProfileError but the DB row stays removed.
    """
    config.validate_profile_name(name)
    from ..core import db
    conn = db.get_conn()
    row = conn.execute(
        "SELECT 1 FROM profiles WHERE name = ?", (name,)
    ).fetchone()
    if row is None:
        raise ProfileError(f"{name}: profile not found")

    if not force:
        confirm = input(f"Delete profile {name!r}? [y/N] ").strip().lower()
        if confirm not in ("y", "yes"):
            print("aborted.", file=sys.stderr)
            return False

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


__all__ = [
    "ProfileError",
    "create",
    "delete",
    "list_profiles",
    "load_meta",
    "show",
    "update_meta",
]
