"""Path resolution, constants, and validation for agent-box v2.

v2 layout (root = AGENT_BOX_HOME, default ~/.agent-box):

    template/
        dot-claude/                 # base template, produced by init-template
            settings.json
            settings.local.json
            CLAUDE.md
            commands/
            skills/  -> ~/.claude/skills
        dot-claude.json

    profiles/<name>/
        meta.yaml                   # name, agent_type, provider
        dot-claude/                 # per-profile, copied from template + provider injected
            settings.json
            settings.local.json
            CLAUDE.md
            commands/
            skills/ -> ~/.claude/skills
            projects/               # CC auto-maintains
        dot-claude.json

    library.db                      # component library (v0.2.0+)
"""
from __future__ import annotations

import os
from pathlib import Path

AGENT_BOX_HOME_ENV = "AGENT_BOX_HOME"

AGENT_TYPE_CC = "cc"

# Hard-coded fallback used by tests and by `providers.py` when the
# library has not been bootstrapped yet. The argparse `--provider`
# choices use `supported_providers()` (which hits the library).
BWRAP = "bwrap"
CLAUDE_BIN = "claude"


# --- root resolution -------------------------------------------------------

def agent_box_home() -> Path:
    """Return the root directory where profiles + template are stored.

    Honors $AGENT_BOX_HOME for tests/overrides; defaults to ~/.agent-box.
    """
    override = os.environ.get(AGENT_BOX_HOME_ENV)
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / ".agent-box").resolve()


def template_dir() -> Path:
    return agent_box_home() / "template"


def template_dot_claude() -> Path:
    return template_dir() / "dot-claude"


def template_dot_claude_json() -> Path:
    return template_dir() / "dot-claude.json"


def profiles_dir() -> Path:
    return agent_box_home() / "profiles"


def profile_dir(name: str) -> Path:
    return profiles_dir() / name


def profile_dot_claude(name: str) -> Path:
    return profile_dir(name) / "dot-claude"


def profile_dot_claude_json(name: str) -> Path:
    return profile_dir(name) / "dot-claude.json"


def profile_meta(name: str) -> Path:
    return profile_dir(name) / "meta.yaml"


def real_user_home() -> Path:
    """The host user's real $HOME. We bind-mount into this path inside the bwrap namespace."""
    return Path(os.path.expanduser("~")).resolve()


def real_claude_dir() -> Path:
    return real_user_home() / ".claude"


def real_claude_json() -> Path:
    return real_user_home() / ".claude.json"


# --- validation ------------------------------------------------------------

def validate_profile_name(name: str) -> None:
    """Reject names that would escape the profiles dir or break the filesystem.

    Empty, whitespace, control chars, path separators, leading dot,
    and "." / ".." are all rejected.
    """
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


# --- per-file profile paths (used by edit/config/test) -------------------

def profile_settings_json(name: str) -> Path:
    """~/.agent-box/profiles/<name>/dot-claude/settings.json"""
    return profile_dot_claude(name) / "settings.json"


def profile_settings_local_json(name: str) -> Path:
    """~/.agent-box/profiles/<name>/dot-claude/settings.local.json"""
    return profile_dot_claude(name) / "settings.local.json"


def profile_claude_md(name: str) -> Path:
    """~/.agent-box/profiles/<name>/dot-claude/CLAUDE.md"""
    return profile_dot_claude(name) / "CLAUDE.md"


# --- supported providers (v0.2.0: derived from library) ------------------

def supported_providers() -> tuple:
    """Return the sorted list of provider ids in the built-in library.

    v0.3.0: built-ins live in the ``library`` module's Python
    constants, so no DB touch is required — fresh checkouts work out
    of the box.
    """
    try:
        from . import library
        return tuple(library.get_provider_ids())
    except Exception:
        return ("anthropic", "deepseek", "minimax")


# Backwards-compat constant. Process-level cache; the library is the
# real source of truth. Used by `cli.py`'s `--provider` choices list.
SUPPORTED_PROVIDERS = supported_providers()
