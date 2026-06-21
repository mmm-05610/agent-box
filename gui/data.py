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
            "provider": str,
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
        read_yaml_file,
    )

    result = {
        "name": profile_root.name,
        "agent_type": agent_type,
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
        "error": None,
    }

    try:
        # Read meta.yaml
        meta = read_yaml_file(profile_root / "meta.yaml") or {}
        result["name"] = meta.get("name", profile_root.name)
        result["agent_type"] = meta.get("agent_type", agent_type)

        # Create config reader
        reader = ProfileConfigReader(profile_root, agent_type)
        result["config_dir"] = reader.config_dir.as_posix()

        # Get provider and model
        result["provider"] = reader.get_provider()
        result["model"] = reader.get_model()

        # Debug
        import sys
        print(f"[DATA] provider={result['provider']}, model={result['model']}", file=sys.stderr)

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
