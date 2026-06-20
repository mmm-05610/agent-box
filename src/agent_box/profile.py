"""Profile lifecycle: create, list, show, delete, meta IO.

Each profile is a directory under ``$AGENT_BOX_HOME/profiles/<name>/``
containing a copy of the agent's config directory (from the template)
and a ``meta.yaml`` file.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config
from . import library


class ProfileError(Exception):
    """Raised for any profile-level operation failure."""


# --- meta.yaml (tiny stdlib YAML subset) -----------------------------------

def _meta_to_yaml(meta: Dict[str, str]) -> str:
    lines = []
    for k, v in meta.items():
        if not isinstance(v, str):
            raise ProfileError(f"meta field {k!r} must be a string")
        if any(c in v for c in [":", "#", "\n", '"', "'"]) or v.strip() != v:
            esc = v.replace("'", "''")
            lines.append(f"{k}: '{esc}'")
        else:
            lines.append(f"{k}: {v}")
    return "\n".join(lines) + "\n"


def _parse_simple_yaml(text: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise ProfileError(f"malformed meta.yaml line: {raw!r}")
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] in ("'", '"') and value[-1] == value[0]:
            value = value[1:-1]
        out[key] = value
    return out


def write_meta(profile_root: Path, meta: Dict[str, str]) -> None:
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "meta.yaml").write_text(_meta_to_yaml(meta))


def load_meta(name: str) -> Dict[str, str]:
    meta_file = config.profile_meta(name)
    if not meta_file.is_file():
        raise ProfileError(
            f"{name}: meta.yaml missing. Try: agent-box create {name} --type cc"
        )
    try:
        data = _parse_simple_yaml(meta_file.read_text())
    except OSError as exc:
        raise ProfileError(f"{name}: meta.yaml unreadable: {exc}") from exc
    for required in ("name", "agent_type"):
        if required not in data:
            raise ProfileError(
                f"{name}: meta.yaml corrupted (missing {required!r})."
            )
    if data["name"] != name:
        raise ProfileError(
            f"{name}: meta.yaml name mismatch ({data['name']!r})."
        )
    return data


# --- create ----------------------------------------------------------------

def create(name: str, agent_type: str = "cc") -> Path:
    """Create a new profile by copying the agent type's template directory.

    The profile directory will be at ``profiles/<name>/`` and contain
    ``dot-<type>/`` (the config dir that bwrap bind-mounts).
    """
    config.validate_profile_name(name)
    if agent_type not in library.get_agent_types():
        raise ProfileError(
            f"unknown agent_type {agent_type!r}. "
            f"Valid: {', '.join(library.get_agent_types())}"
        )

    root = config.profile_dir(name)
    if root.exists():
        raise ProfileError(
            f"profile {name!r} already exists at {root}. "
            f"Use: agent-box delete {name} first"
        )

    # Copy the main config template directory
    template_dir = library.get_template_dir(agent_type)
    if template_dir is None:
        raise ProfileError(f"no template directory for {agent_type!r}")
    target = config.profile_agent_dir(name, agent_type)
    shutil.copytree(template_dir, target, symlinks=True)

    # CC: also seed dot-claude.json at the profile root
    if agent_type == "cc":
        (root / "dot-claude.json").write_text("{}\n")

    # Copy the secondary data template directory (e.g. OpenCode auth)
    data_template = library.get_template_data_dir(agent_type)
    if data_template is not None:
        data_target = config.profile_agent_data_dir(name, agent_type)
        if data_target is not None:
            shutil.copytree(data_template, data_target, symlinks=True)

    write_meta(root, {"name": name, "agent_type": agent_type})
    return root


# --- list / show / delete --------------------------------------------------

def list_profiles() -> List[Dict[str, str]]:
    pdir = config.profiles_dir()
    if not pdir.is_dir():
        return []
    out: List[Dict[str, str]] = []
    for entry in sorted(pdir.iterdir(), key=lambda p: p.name):
        if not entry.is_dir():
            continue
        meta_file = entry / "meta.yaml"
        if not meta_file.is_file():
            continue
        try:
            meta = _parse_simple_yaml(meta_file.read_text())
        except (OSError, ProfileError):
            continue
        out.append({
            "name": meta.get("name", entry.name),
            "agent_type": meta.get("agent_type", "?"),
        })
    return out


def show(name: str) -> Dict[str, Any]:
    config.validate_profile_name(name)
    root = config.profile_dir(name)
    if not root.is_dir():
        raise ProfileError(f"{name}: profile not found at {root}")

    meta = load_meta(name)
    agent_type = meta.get("agent_type", "cc")
    config_dir = config.profile_agent_dir(name, agent_type)
    data_dir = config.profile_agent_data_dir(name, agent_type)

    info: Dict[str, Any] = {
        "path": str(root),
        "meta": meta,
        "config_dir": str(config_dir),
    }
    if data_dir and data_dir.is_dir():
        info["data_dir"] = str(data_dir)
    return info


def delete(name: str, force: bool = False) -> bool:
    config.validate_profile_name(name)
    root = config.profile_dir(name)
    if not root.exists():
        raise ProfileError(f"{name}: profile not found at {root}")
    if not force:
        confirm = input(f"Delete profile {name!r} at {root}? [y/N] ").strip().lower()
        if confirm not in ("y", "yes"):
            print("aborted.", file=sys.stderr)
            return False
    shutil.rmtree(root)
    return True
