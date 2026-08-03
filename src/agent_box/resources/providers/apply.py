"""Provider apply — write provider settings to profile config files.

Strategy dispatch is driven by ``resources.provider.strategy`` in the
agent-type registry.  Zero agent-type references in the apply logic —
adding a new agent type that uses an existing strategy requires no
code changes, only a registry entry.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from ... import config
from ...adapters import acs as _acs
from ...core.io import read_json, read_jsonc, read_text, write_json, write_text
from ...core.library import get_agent_config
from ..profile import ProfileError, _repo, load_meta


# ── Strategy dispatch ──────────────────────────────────────────────────────
# Maps resources.provider.strategy → writer function.  Strategies are
# agent-type-agnostic — any agent type can use any strategy by setting
# the right provider block in its registry entry.

def _strategy_json_merge(
    profile_name: str,
    agent_type: str,
    provider: Dict[str, Any],
    settings: Dict[str, Any],
    provider_cfg: Dict[str, Any],
) -> None:
    """Overwrite: read JSON config, set env + metadata keys, write back."""
    config_file: str = provider_cfg["config_file"]
    config_path = config.profile_agent_dir(profile_name, agent_type) / config_file

    provider_env = settings.get(provider_cfg.get("env_source_key", "env")) or {}
    if not isinstance(provider_env, dict):
        raise ProfileError(f"provider {provider['id']}: env must be a JSON object")

    try:
        existing = read_json(config_path)
    except json.JSONDecodeError as exc:
        raise ProfileError(
            f"{profile_name}: {config_file} is not valid JSON: {exc}"
        ) from exc
    if not isinstance(existing, dict):
        existing = {}

    existing[provider_cfg.get("env_source_key", "env")] = provider_env

    # Build metadata dict from registry-specified fields.
    # ``website_url`` may live on the top-level provider OR inside
    # ``settings`` (ACS data normalisation quirk) — prefer provider.
    metadata: Dict[str, Any] = {}
    for field in provider_cfg.get("metadata_fields") or []:
        val = provider.get(field)
        if field == "website_url" and not val:
            val = settings.get("website_url", "")
        if field == "notes" and val is None:
            val = ""
        if val is not None:
            metadata[field] = val

    existing[provider_cfg.get("metadata_key", "_provider")] = metadata
    write_json(config_path, existing)


def _strategy_multi_file(
    profile_name: str,
    agent_type: str,
    provider: Dict[str, Any],
    settings: Dict[str, Any],
    provider_cfg: Dict[str, Any],
) -> None:
    """Overwrite: write config text and auth JSON to separate files."""
    config_dir = config.profile_agent_dir(profile_name, agent_type)
    config_dir.mkdir(parents=True, exist_ok=True)

    for file_spec in provider_cfg.get("files") or []:
        dest: str = file_spec["dest"]
        source_key: str = file_spec["source_key"]
        fmt: str = file_spec.get("format", "text")
        value = settings.get(source_key)

        if fmt == "text":
            if isinstance(value, str) and value.strip():
                write_text(config_dir / dest, value)
        elif fmt == "json":
            if isinstance(value, dict):
                write_json(config_dir / dest, value)


def _strategy_yaml_custom_providers(
    profile_name: str,
    agent_type: str,
    provider: Dict[str, Any],
    settings: Dict[str, Any],
    provider_cfg: Dict[str, Any],
) -> None:
    """Additive: manage model + custom_providers sections in a YAML config."""
    config_dir = config.profile_agent_dir(profile_name, agent_type)
    config_dir.mkdir(parents=True, exist_ok=True)

    provider_id = str(provider.get("id") or "")
    config_file: str = provider_cfg["config_file"]
    config_path = config_dir / config_file

    model_section: str = provider_cfg.get("model_section", "model")
    cp_section: str = provider_cfg.get("custom_providers_section", "custom_providers")
    cp_marker = f"{cp_section}:"

    # Resolve default model (first model id)
    models = settings.get("models")
    first_model_id = None
    if isinstance(models, list) and models:
        first = models[0] if isinstance(models[0], dict) else {}
        first_model_id = (first.get("id") or first.get("model") or "") or None

    # Build model section
    model_lines: List[str] = []
    if first_model_id:
        model_lines.append(f'  default: "{first_model_id}"')
    model_lines.append(f'  provider: "{provider_id}"')
    model_yaml = f"{model_section}:\n" + "\n".join(model_lines) + "\n"

    # Parse existing config — preserve non-model/non-custom_providers sections
    preamble_lines: List[str] = []
    custom_entries: List[str] = []
    in_custom = False
    current_entry: List[str] = []
    if config_path.is_file():
        existing_text = read_text(config_path) or ""
        for line in existing_text.split("\n"):
            stripped = line.rstrip()
            if stripped.strip() == cp_marker:
                in_custom = True
                continue
            if in_custom:
                if stripped.startswith("  - "):
                    if current_entry:
                        custom_entries.append("\n".join(current_entry))
                    current_entry = [stripped]
                elif stripped.startswith("    ") and current_entry:
                    current_entry.append(stripped)
                else:
                    if current_entry:
                        custom_entries.append("\n".join(current_entry))
                        current_entry = []
                    in_custom = False
            else:
                preamble_lines.append(stripped)
        if current_entry:
            custom_entries.append("\n".join(current_entry))

    # Filter out preamble sections we will rewrite.
    # managed_yaml_keys lists the top‑level keys this strategy
    # controls — they (and their value lines) are stripped from the
    # preamble and rewritten by the strategy.
    managed_keys = set(provider_cfg.get("managed_yaml_keys") or [])

    filtered_preamble: List[str] = []
    skip_until_next_section = False
    for line in preamble_lines:
        stripped = line.strip()
        if stripped == f"{model_section}:" or stripped.startswith(f"{model_section} "):
            skip_until_next_section = True
            continue
        if skip_until_next_section:
            if line and not line.startswith("  "):
                skip_until_next_section = False
            else:
                continue
        is_managed_key = any(
            stripped.startswith(f"{key}:") or stripped.startswith(f"{key} ")
            for key in managed_keys
        )
        if is_managed_key:
            skip_until_next_section = True
            continue
        if skip_until_next_section:
            if line and not line.startswith("  "):
                skip_until_next_section = False
            else:
                continue
        filtered_preamble.append(line)

    # Upsert provider into custom_entries
    new_entry = _build_yaml_custom_entry(provider_id, settings, provider_cfg)
    replaced = False
    for i, entry in enumerate(custom_entries):
        if f"name: {provider_id}" in entry:
            custom_entries[i] = new_entry
            replaced = True
            break
    if not replaced:
        custom_entries.append(new_entry)

    # Assemble and write
    output = "\n".join([l for l in filtered_preamble if l.strip()]) + "\n"
    output += model_yaml
    if custom_entries:
        output += f"{cp_section}:\n"
        for entry in custom_entries:
            output += entry + "\n"

    write_text(config_path, output)


def _strategy_jsonc_provider(
    profile_name: str,
    agent_type: str,
    provider: Dict[str, Any],
    settings: Dict[str, Any],
    provider_cfg: Dict[str, Any],
) -> None:
    """Additive: merge a provider entry into a JSONC config's provider key."""
    config_dir = config.profile_agent_dir(profile_name, agent_type)
    config_dir.mkdir(parents=True, exist_ok=True)

    provider_name = (provider.get("id") or "").replace("/", "_")
    config_file: str = provider_cfg["config_file"]
    provider_key: str = provider_cfg.get("provider_key", "provider")
    jsonc_path = config_dir / config_file

    npm = settings.get("npm") or ""
    options = settings.get("options") or {}

    provider_config: Dict[str, Any] = {}
    if isinstance(options, dict):
        provider_config.update(options)
    elif isinstance(npm, str) and npm:
        provider_config["npm"] = npm

    models = settings.get("models") or {}
    if isinstance(models, dict) and models:
        provider_config["models"] = models

    existing = read_jsonc(jsonc_path)
    if not isinstance(existing, dict):
        existing = {}

    existing.setdefault(provider_key, {})
    if isinstance(existing[provider_key], dict) and provider_name:
        existing[provider_key][provider_name] = provider_config

    # Write back as plain JSON (OpenCode tolerates it)
    write_text(jsonc_path, json.dumps(existing, indent=2, ensure_ascii=False) + "\n")


_STRATEGIES: Dict[str, Any] = {
    "json_merge": _strategy_json_merge,
    "multi_file": _strategy_multi_file,
    "yaml_custom_providers": _strategy_yaml_custom_providers,
    "jsonc_provider": _strategy_jsonc_provider,
}


# ── apply ──────────────────────────────────────────────────────────────────

def apply_provider(profile_name: str, provider_id: str) -> None:
    """Write a provider's settings to the profile's config file.

    Strategy selection is driven by ``resources.provider.strategy`` in the
    agent-type registry — zero per-agent branching.
    """
    meta = load_meta(profile_name)
    agent_type = meta["agent_type"]
    agent_config = get_agent_config(agent_type)
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {agent_type!r}")

    provider_cfg = (agent_config.get("resources") or {}).get("provider")
    if not isinstance(provider_cfg, dict):
        raise ProfileError(f"provider apply is not supported for {agent_type!r}")

    provider = _acs.get_provider(agent_type, provider_id)
    if provider is None:
        raise ProfileError(
            f"provider {provider_id!r} for {agent_type!r} not found in ACS"
        )
    settings = provider.get("settings") or {}

    strategy: str = provider_cfg["strategy"]
    writer = _STRATEGIES.get(strategy)
    if writer is None:
        raise ProfileError(
            f"unknown provider strategy {strategy!r} for {agent_type!r}"
        )

    # Additive agents track applied providers in a JSON store so
    # list / remove can enumerate them.
    if (agent_config.get("resources") or {}).get("provider", {}).get("apply_mode") == "additive":
        _add_to_providers_store(profile_name, agent_type, provider, provider_cfg)

    writer(profile_name, agent_type, provider, settings, provider_cfg)
    _repo.set_provider_ref(profile_name, provider_id)


# ── Additive provider store ────────────────────────────────────────────────

def _providers_store_path(profile_name: str, agent_type: str) -> Path:
    return config.profile_providers_store(profile_name, agent_type)


def _add_to_providers_store(
    profile_name: str, agent_type: str, provider: Dict[str, Any],
    provider_cfg: Dict[str, Any],
) -> None:
    store_path = _providers_store_path(profile_name, agent_type)
    store_path.parent.mkdir(parents=True, exist_ok=True)
    entries = read_json(store_path)
    if not isinstance(entries, dict):
        entries = {}
    provider_id = str(provider.get("id") or "")

    # Build store entry from registry-specified metadata fields.
    entry: Dict[str, Any] = {
        "settings": provider.get("settings") or {},
    }
    for field in provider_cfg.get("metadata_fields") or []:
        val = provider.get(field)
        if val is None:
            val = "" if field in ("notes", "website_url", "category") else None
        entry[field] = val

    entries[provider_id] = entry
    write_json(store_path, entries)


def list_profile_providers(profile_name: str, agent_type: str) -> List[Dict[str, Any]]:
    store_path = _providers_store_path(profile_name, agent_type)
    if not store_path.is_file():
        return []
    entries = read_json(store_path)
    if not isinstance(entries, dict):
        return []
    return sorted(entries.values(), key=lambda e: e.get("name", ""))


def remove_profile_provider(
    profile_name: str, agent_type: str, provider_id: str
) -> bool:
    """Remove a provider from the profile's store and config file.

    Uses the agent-type registry to decide *how* to remove the provider
    from the native config file — no per-agent branching.
    """
    agent_config = get_agent_config(agent_type)
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {agent_type!r}")

    # 1. Remove from _providers.json store
    store_removed = False
    if (agent_config.get("resources") or {}).get("provider", {}).get("apply_mode") == "additive":
        store_path = _providers_store_path(profile_name, agent_type)
        if store_path.is_file():
            entries = read_json(store_path)
            if isinstance(entries, dict) and provider_id in entries:
                del entries[provider_id]
                write_json(store_path, entries)
                store_removed = True

    # 2. Remove from native config file (strategy-driven)
    provider_cfg = (agent_config.get("resources") or {}).get("provider")
    if isinstance(provider_cfg, dict):
        handler = _REMOVE_HANDLERS.get(provider_cfg.get("strategy"))
        if handler is not None:
            handler(profile_name, agent_type, provider_id, provider_cfg)

    return store_removed


# ── Remove helpers (strategy-specific) ─────────────────────────────────────

def _remove_from_yaml_custom_providers(
    profile_name: str,
    agent_type: str,
    provider_id: str,
    provider_cfg: Dict[str, Any],
) -> None:
    """Remove a provider entry from the YAML custom_providers block."""
    config_file: str = provider_cfg["config_file"]
    config_path = config.profile_agent_dir(profile_name, agent_type) / config_file
    if not config_path.is_file():
        return

    cp_section: str = provider_cfg.get("custom_providers_section", "custom_providers")
    cp_marker = f"{cp_section}:"

    text = read_text(config_path) or ""
    lines = text.split("\n")
    out_lines: List[str] = []
    in_custom = False
    skip_entry = False
    current_entry_indent = 0
    for line in lines:
        stripped = line.rstrip()
        if stripped.strip() == cp_marker:
            in_custom = True
            out_lines.append(stripped)
            continue
        if in_custom and stripped.startswith("  - "):
            skip_entry = f"name: {provider_id}" in stripped
            current_entry_indent = len(stripped) - len(stripped.lstrip())
        if in_custom and skip_entry:
            if (
                stripped
                and len(stripped) - len(stripped.lstrip()) <= current_entry_indent
                and not stripped.startswith("  - ")
            ):
                skip_entry = False
                out_lines.append(stripped)
            elif not stripped.startswith("  - "):
                continue
            else:
                skip_entry = f"name: {provider_id}" in stripped
                if not skip_entry:
                    out_lines.append(stripped)
        else:
            out_lines.append(stripped)
    write_text(config_path, "\n".join(out_lines) + "\n")


def _remove_from_jsonc_provider(
    profile_name: str,
    agent_type: str,
    provider_id: str,
    provider_cfg: Dict[str, Any],
) -> None:
    """Remove a provider key from the JSONC config's provider section."""
    config_file: str = provider_cfg["config_file"]
    provider_key: str = provider_cfg.get("provider_key", "provider")
    jsonc_path = config.profile_agent_dir(profile_name, agent_type) / config_file
    if not jsonc_path.is_file():
        return

    existing = read_jsonc(jsonc_path)
    if isinstance(existing.get(provider_key), dict):
        existing[provider_key].pop(provider_id, None)
    write_text(jsonc_path, json.dumps(existing, indent=2, ensure_ascii=False) + "\n")


_REMOVE_HANDLERS: Dict[str, Any] = {
    "yaml_custom_providers": _remove_from_yaml_custom_providers,
    "jsonc_provider": _remove_from_jsonc_provider,
}


# ── YAML custom entry builder ──────────────────────────────────────────────

def _build_yaml_custom_entry(
    provider_id: str, settings: Dict[str, Any], provider_cfg: Dict[str, Any]
) -> str:
    """Build a ``custom_providers`` YAML entry from provider settings.

    All field names — settings keys, YAML output keys, model sub-keys —
    are declared in ``resources.provider.entry_yaml_spec``.  The YAML
    *structure* (indentation, quoting, nesting) is still format-level,
    but every named thing comes from the registry.
    """
    spec = provider_cfg.get("entry_yaml_spec") or {}
    lines = [f"  - name: {provider_id}"]

    # ── Simple key-value fields ──
    for field in spec.get("fields") or []:
        yaml_key: str = field["yaml_key"]
        settings_key: str = field["settings_key"]
        val = settings.get(settings_key) or ""

        if field.get("env_fallback"):
            env_val = (settings.get("env") or {}).get(settings_key) or ""
            val = val or env_val

        if field.get("mapped"):
            mode_map = provider_cfg.get("api_mode_mapping") or {}
            val = mode_map.get(val, val or "openai_compatible")

        lines.append(f'    {yaml_key}: "{val}"')

    # ── Model list (nested expansion) ──
    ml = spec.get("model_list")
    if not ml:
        return "\n".join(lines)

    models = settings.get(ml["settings_key"])
    if isinstance(models, list) and models:
        first = models[0] if isinstance(models[0], dict) else {}
        id_key: str = ml["id_key"]
        first_id = first.get(id_key) or first.get("model") or ""
        if first_id:
            yaml_model_key: str = ml.get("yaml_model_key", "model")
            lines.append(f'    {yaml_model_key}: "{first_id}"')

        yaml_section: str = ml.get("yaml_section_key", "models")
        lines.append(f"    {yaml_section}:")

        name_src: str = ml.get("name_key", "name")
        name_out: str = ml.get("yaml_name_key", name_src)
        ctx_src: str = ml.get("context_key", "context_length")
        ctx_out: str = ml.get("yaml_context_key", ctx_src)

        for m in models:
            if not isinstance(m, dict):
                continue
            mid = m.get(id_key) or m.get("model") or ""
            mname = m.get(name_src) or mid
            ctx = m.get(ctx_src)
            if mid:
                lines.append(f"      {mid}:")
                lines.append(f'        {name_out}: "{mname}"')
                if ctx is not None:
                    lines.append(f"        {ctx_out}: {ctx}")
    else:
        dm = spec.get("default_model")
        if dm:
            val = settings.get(dm["settings_key"]) or ""
            if val:
                yaml_key: str = dm.get("yaml_key", "model")
                lines.append(f'    {yaml_key}: "{val}"')

    return "\n".join(lines)
