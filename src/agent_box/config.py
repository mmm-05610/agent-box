"""Path resolution, constants, and validation for agent-box."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

AGENT_BOX_HOME_ENV = "AGENT_BOX_HOME"
DISPLAY_NAME = "agent-box"
DEFAULT_AGENT_TYPE = "claude"
BWRAP = "bwrap"

# Session mode — symbolic protocol values shared with the GUI launch dialog
# (profiles LAUNCH_MODES values) and written to sessions.db.  The display
# strings live in the frontend i18n (profiles.launchMode.*), not here.
MODE_NEW = "new"
MODE_RESUME = "resume"


# --- package resolution ─────────────────────────────────────────────────

_PKG_DIR = Path(__file__).resolve().parent


def package_dir() -> Path:
    """Absolute path to the :mod:`agent_box` package directory.

    Used to resolve package data like ``schema.sql``, ``templates/``,
    and ``presets/`` without relying on ``__file__`` relative hacks in
    callers.
    """
    return _PKG_DIR


def migrations_dir() -> Path:
    """Absolute path to the SQL migration files directory."""
    return package_dir() / "migrations"


def agent_types_file() -> Path:
    """Absolute path to the agent-type registry (``core/agent_types.json``)."""
    return package_dir() / "core" / "agent_types.json"


def provider_endpoints_file() -> Path:
    """Absolute path to the models-endpoint table (``core/provider_endpoints.json``)."""
    return package_dir() / "core" / "provider_endpoints.json"


# --- root resolution -------------------------------------------------------

def agent_box_home() -> Path:
    override = os.environ.get(AGENT_BOX_HOME_ENV)
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / ".agent-box").resolve()


def profiles_dir() -> Path:
    return agent_box_home() / "profiles"


def skills_source_dir() -> Path:
    """ACS-managed skill source directory."""
    return agent_box_home() / "config" / "skills"


def acs_db() -> Path:
    """Path to the ACS (agent-config-store) SQLite database."""
    return agent_box_home() / "config" / "cc-switch.db"


def acs_binary() -> Path:
    """Path to the ACS (cc-switch) native GUI binary.

    The ACS repo is vendored as a git submodule (``acs/``) that ships with
    the app — the default points at its release build inside the repo, NOT
    a per-machine checkout.  Override with ``AGENT_BOX_ACS_BINARY``.
    """
    override = os.environ.get("AGENT_BOX_ACS_BINARY")
    if override:
        return Path(override).expanduser()
    # Frozen (PyInstaller): the submodule binary is bundled into _MEIPASS.
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "acs" / "src-tauri" / "target" / "release" / "cc-switch"
    # Source checkout: acs/ sits next to the package at the repo root.
    return package_dir().parent.parent / "acs" / "src-tauri" / "target" / "release" / "cc-switch"


def default_projects_dir() -> str:
    """Default projects directory for the GUI launch dialog / settings.

    Override with the ``AGENT_BOX_PROJECTS_DIR`` env var.  Kept as a tilde
    path — consumers resolve it against ``$HOME`` (WSL / Linux).
    """
    return os.environ.get("AGENT_BOX_PROJECTS_DIR") or "~/projects"


def _gui_settings_path() -> Path:
    """Per-machine GUI settings store (projects dir, …)."""
    return agent_box_home() / "gui-settings.json"


def projects_dir() -> str:
    """The current projects dir — user-stored value, else the backend default.

    Persisted in ``gui-settings.json`` so it survives GUI restarts
    (browser localStorage for a ``file://`` origin is not reliable).
    """
    try:
        data = json.loads(_gui_settings_path().read_text(encoding="utf-8"))
        value = data.get("projects_dir")
        if isinstance(value, str) and value:
            return value
    except (OSError, json.JSONDecodeError):
        pass
    return default_projects_dir()


def set_projects_dir(value: str) -> None:
    """Persist the projects dir for the GUI (survives restarts)."""
    path = _gui_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data: dict = {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        pass
    if not isinstance(data, dict):
        data = {}
    data["projects_dir"] = value
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def library_db() -> Path:
    """Path to the agent-box SQLite database (``agent-box.db``)."""
    return agent_box_home() / "agent-box.db"


def history_file() -> Path:
    """Path to the REPL command-history file."""
    return agent_box_home() / "history"


def profile_dir(name: str) -> Path:
    return profiles_dir() / name


def profile_meta(name: str) -> Path:
    return profile_dir(name) / "meta.yaml"


# --- multi-agent paths ----------------------------------------------------

def agent_config_dir(agent_type: str) -> str:
    """Unexpanded config-dir path (e.g. '~/.codex')."""
    from .core import library
    info = library.get_agent_config(agent_type)
    if info is None:
        raise ValueError(f"Unknown agent type: {agent_type!r}")
    return info["runtime"]["config_dir"]


def real_agent_dir(agent_type: str) -> Path:
    """Resolved absolute path to the agent config directory on the host."""
    return Path(os.path.expanduser(agent_config_dir(agent_type))).resolve()


def profile_agent_dir(name: str, agent_type: str) -> Path:
    """Profile-local copy of the agent config directory.

    The directory suffix comes from the agent-type registry's
    ``profile_dir_suffix`` field (Rule 5) — adding a new agent type
    is a registry-only change.
    """
    from .core import library
    info = library.get_agent_config(agent_type)
    if info is None:
        raise ValueError(f"Unknown agent type: {agent_type!r}")
    return profile_dir(name) / info["runtime"]["profile_dir_suffix"]


def agent_binary(agent_type: str) -> str:
    """The executable name for an agent type."""
    from .core import library
    info = library.get_agent_config(agent_type)
    if info is None:
        raise ValueError(f"Unknown agent type: {agent_type!r}")
    return info["identity"]["binary"]


def agent_data_dir(agent_type: str) -> str | None:
    """Secondary data dir path, if any (e.g. OpenCode auth)."""
    from .core import library
    info = library.get_agent_config(agent_type)
    if info is None:
        raise ValueError(f"Unknown agent type: {agent_type!r}")
    return info.get("runtime", {}).get("data_dir")


def real_agent_data_dir(agent_type: str) -> Path | None:
    """Resolved absolute path to the secondary data dir, or None."""
    d = agent_data_dir(agent_type)
    return Path(os.path.expanduser(d)).resolve() if d else None


def profile_agent_data_dir(name: str, agent_type: str) -> Path | None:
    """Profile-local copy of the secondary data dir, or None."""
    if agent_data_dir(agent_type) is None:
        return None
    return profile_dir(name) / f"dot-{agent_type}-data"


def profile_skills_dir(name: str, agent_type: str) -> Path:
    """Profile's per-agent skills directory (copy target for skill apply).

    Dir name comes from the registry (``resources.skills.dir``), not a
    hardcoded "skills" — lazy import avoids a config ↔ library cycle.
    """
    from .core.library import get_agent_config
    agent_config = get_agent_config(agent_type)
    dir_name = ((agent_config.get("resources") or {})
                .get("skills", {}).get("dir") or "skills")
    return profile_agent_dir(name, agent_type) / dir_name


def profile_providers_store(name: str, agent_type: str) -> Path:
    """Profile's per-agent provider store (additive-mode _providers.json)."""
    return profile_agent_dir(name, agent_type) / "_providers.json"


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
