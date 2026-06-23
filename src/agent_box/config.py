"""Path resolution, constants, and validation for agent-box."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

AGENT_BOX_HOME_ENV = "AGENT_BOX_HOME"
AGENT_TYPE_CC = "cc"
BWRAP = "bwrap"


# --- root resolution -------------------------------------------------------

def agent_box_home() -> Path:
    override = os.environ.get(AGENT_BOX_HOME_ENV)
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / ".agent-box").resolve()


def profiles_dir() -> Path:
    return agent_box_home() / "profiles"


def profile_dir(name: str) -> Path:
    return profiles_dir() / name


def profile_meta(name: str) -> Path:
    return profile_dir(name) / "meta.yaml"


# --- multi-agent paths ----------------------------------------------------

def agent_config_dir(agent_type: str) -> str:
    """Unexpanded config-dir path (e.g. '~/.codex')."""
    from . import library
    info = library.get_agent_config(agent_type)
    if info is None:
        raise ValueError(f"Unknown agent type: {agent_type!r}")
    return info["config_dir"]


def real_agent_dir(agent_type: str) -> Path:
    """Resolved absolute path to the agent config directory on the host."""
    return Path(os.path.expanduser(agent_config_dir(agent_type))).resolve()


def profile_agent_dir(name: str, agent_type: str) -> Path:
    """Profile-local copy of the agent config directory."""
    suffix = "dot-claude" if agent_type == "cc" else f"dot-{agent_type}"
    return profile_dir(name) / suffix


def agent_binary(agent_type: str) -> str:
    """The executable name for an agent type."""
    from . import library
    info = library.get_agent_config(agent_type)
    if info is None:
        raise ValueError(f"Unknown agent type: {agent_type!r}")
    return info["binary"]


def agent_data_dir(agent_type: str) -> Optional[str]:
    """Secondary data dir path, if any (e.g. OpenCode auth)."""
    from . import library
    info = library.get_agent_config(agent_type)
    if info is None:
        raise ValueError(f"Unknown agent type: {agent_type!r}")
    return info.get("data_dir")


def real_agent_data_dir(agent_type: str) -> Optional[Path]:
    """Resolved absolute path to the secondary data dir, or None."""
    d = agent_data_dir(agent_type)
    return Path(os.path.expanduser(d)).resolve() if d else None


def profile_agent_data_dir(name: str, agent_type: str) -> Optional[Path]:
    """Profile-local copy of the secondary data dir, or None."""
    if agent_data_dir(agent_type) is None:
        return None
    return profile_dir(name) / f"dot-{agent_type}-data"


# --- validation ------------------------------------------------------------

def validate_profile_name(name: str) -> None:
    if not name:
        raise ValueError("profile name must not be empty")
    if name in (".", ".."):
        raise ValueError(f"invalid profile name: {name!r}")
    if name.startswith("."):
        raise ValueError(f"profile name must not start with '.': {name!r}")
    if len(name) > 64:
        raise ValueError("profile name too long (max 64 chars)")
    if any(c.isspace() for c in name):
        raise ValueError(f"profile name must not contain whitespace: {name!r}")
    for bad in ("/", "\\"):
        if bad in name:
            raise ValueError(f"profile name must not contain {bad!r}: {name!r}")
    for ch in name:
        if ord(ch) < 0x20:
            raise ValueError(f"profile name contains control character: {name!r}")
