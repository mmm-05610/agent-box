"""Data layer — fetches profile data from WSL.

This module is completely independent of the GUI.
All data fetching happens here, returns plain dicts/strings.
The GUI only calls these functions and displays the results.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional


def get_profile_data(profile_root, agent_type: str) -> Dict[str, Any]:
    """Get all profile data as a dict.

    Args:
        profile_root: WSL path as string (e.g. "/home/maoqh/.agent-box/profiles/decision")
        agent_type: Agent type (cc, codex, hermes, opencode)

    Returns:
        {
            "name": str,
            "agent_type": str,
            "display_name": str | None,  # v0.4
            "description": str | None,   # v0.4
            "provider": str,             # v0.4: prefer meta.provider, else inline-detected
            "preset": str | None,        # v0.4
            "model": str,
            "config_dir": str,
            "settings": dict,      # For CC
            "config": dict,        # For Codex/Hermes/OpenCode
            "claude_md": str,      # For CC
            "persona": str,        # For Hermes (SOUL.md)
            "env": str,            # For Hermes (.env)
            "hooks": dict,         # For CC
            "plugins": dict,       # For CC
            "auth": dict,          # For Codex/OpenCode
            "rules": list,         # For Codex
            "skills": list,        # For Codex/Hermes
            "config_raw": str | None,   # Raw text of main config file (all agent types)
            "hooks_raw": str | None,    # CC only: raw text of hooks/hooks.json if separate file exists
            "error": str,          # Error message if any
        }
    """
    # Ensure profile_root is a Path with forward slashes preserved
    if isinstance(profile_root, str):
        profile_root = Path(profile_root)

    from .config import (
        ProfileConfigReader,
        CCConfig,
        CodexConfig,
        HermesConfig,
        OpenCodeConfig,
        read_text_file,
        read_yaml_file,
    )

    result = {
        "name": profile_root.name,
        "agent_type": agent_type,
        "display_name": None,
        "description": None,
        "preset": None,
        "provider": "—",
        "model": "—",
        "config_dir": "—",
        "settings": {},
        "config": {},
        "claude_md": None,
        "persona": None,
        "env": None,
        "hooks": {},
        "plugins": {},
        "auth": {},
        "rules": [],
        "skills": [],
        "config_raw": None,
        "hooks_raw": None,
        "error": None,
    }

    try:
        # Read meta.yaml
        meta = read_yaml_file(profile_root / "meta.yaml") or {}
        result["name"] = meta.get("name", profile_root.name)
        result["agent_type"] = meta.get("agent_type", agent_type)
        # v0.4: surface optional meta fields to the UI.
        for k in ("display_name", "description", "preset"):
            v = meta.get(k)
            if v is not None:
                result[k] = v

        # Create config reader
        reader = ProfileConfigReader(profile_root, agent_type)
        result["config_dir"] = reader.config_dir.as_posix()

        # Get provider and model.
        # v0.4: prefer the wizard-stored meta.provider; fall back to
        # the inline-detected provider from settings.json/config.toml
        # (existing behavior for old profiles without the field).
        meta_provider = meta.get("provider")
        result["provider"] = meta_provider or reader.get_provider()
        result["model"] = reader.get_model()

        # Debug
        import sys
        print(f"[DATA] provider={result['provider']}, model={result['model']}", file=sys.stderr)

        # ----------------------------------------------------------------
        # Preload raw config + hooks text (all wsl reads happen here, off
        # the UI thread).  Same mechanism as CCConfig.read_claude_md.
        #
        # config_raw: raw text of the main config file for every agent
        # type, used by the Settings/Config tabs in detail.py.
        # hooks_raw: CC only.  After surveying the 4 CC profiles
        # (decision, dw, frontend-designer, strategy-advisor) we found
        # CC hooks live INLINE in dot-claude/settings.json (top-level
        # "hooks" key).  No separate dot-claude/hooks/hooks.json exists
        # in any of them.  So hooks_raw stays None for CC, and the Hooks
        # tab will show a one-line note pointing the user to the
        # Settings tab.  If a future profile gets a separate hooks
        # file, preload that file's text here.
        # ----------------------------------------------------------------
        _raw_config_files = {
            "cc":       "settings.json",
            "codex":    "config.toml",
            "hermes":   "config.yaml",
            "opencode": "opencode.jsonc",
        }
        _raw_file = _raw_config_files.get(agent_type)
        if _raw_file is not None:
            try:
                result["config_raw"] = read_text_file(
                    reader.config_dir / _raw_file
                )
            except Exception:
                result["config_raw"] = None
        if agent_type == "cc":
            _hooks_file = reader.config_dir / "hooks" / "hooks.json"
            try:
                # Only preload when the separate hooks file actually
                # exists on disk.  Inline-only hooks (current state) get
                # hooks_raw = None and the tab shows a note.
                if _hooks_file.exists():
                    result["hooks_raw"] = read_text_file(_hooks_file)
            except Exception:
                result["hooks_raw"] = None

        # Get agent-specific data
        if agent_type == "cc":
            result["settings"] = CCConfig.read(reader.config_dir)
            result["claude_md"] = CCConfig.read_claude_md(reader.config_dir)
            result["hooks"] = CCConfig.get_hooks(reader.config_dir)
            result["plugins"] = CCConfig.get_plugins(reader.config_dir)

        elif agent_type == "codex":
            result["config"] = CodexConfig.read(reader.config_dir)
            result["auth"] = CodexConfig.read_auth(reader.config_dir)
            result["rules"] = CodexConfig.get_rules(reader.config_dir)
            result["skills"] = CodexConfig.get_skills(reader.config_dir)

        elif agent_type == "hermes":
            result["config"] = HermesConfig.read(reader.config_dir)
            result["persona"] = HermesConfig.read_soul(reader.config_dir)
            result["env"] = HermesConfig.read_env(reader.config_dir)
            result["skills"] = HermesConfig.get_skills(reader.config_dir)

        elif agent_type == "opencode":
            result["config"] = OpenCodeConfig.read(reader.config_dir)
            data_dir = profile_root / "dot-opencode-data"
            result["auth"] = OpenCodeConfig.read_auth(data_dir)

            # OpenCode: provider config is nested under provider ID
            # Format: {"provider": {"provider-id": {"npm": "...", "name": "...", "models": {...}}}}
            config = result["config"]
            providers = config.get("provider", {})

            if providers:
                # Get the first (and usually only) provider
                for provider_id, provider_config in providers.items():
                    result["provider"] = provider_config.get("name", provider_id)

                    # Extract first model name from "models" field
                    models = provider_config.get("models", {})
                    if models:
                        first_model = next(iter(models.keys()), None)
                        if first_model:
                            result["model"] = first_model
                    break
            else:
                # Fallback: try auth.json
                auth = result["auth"]
                if auth:
                    for provider_name, provider_data in auth.items():
                        result["provider"] = provider_name
                        base_url = provider_data.get("base_url", "")
                        if base_url:
                            from .config import _extract_provider_name
                            friendly = _extract_provider_name(base_url)
                            if friendly:
                                result["provider"] = friendly
                        break

    except Exception as e:
        result["error"] = str(e)

    return result


def get_meta_data(profile_root: Path) -> Dict[str, str]:
    """Get meta.yaml data."""
    from .config import read_yaml_file
    return read_yaml_file(profile_root / "meta.yaml") or {}
