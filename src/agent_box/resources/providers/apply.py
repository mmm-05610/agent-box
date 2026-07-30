"""Provider CRUD + apply — operates on the ``providers`` table.

Provider application behavior is selected from the agent type registry,
then delegated to the format-specific overwrite or additive writer.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List

from ... import config
from ...core.io import write_json, write_text
from ...core.library import get_agent_config
from ..profile import ProfileError, load_meta


# --- apply ----------------------------------------------------------------

def apply_provider(profile_name: str, provider_id: str) -> None:
    """Write a provider's settings to the profile's config file.

    Per agent type:
      Claude:   overwrite settings.json.env + _provider metadata
      Codex:    overwrite config.toml + auth.json
      Hermes:   overwrite config.yaml + .env
      OpenCode: write provider section to opencode.jsonc + auth.json
    """
    meta = load_meta(profile_name)
    agent_type = meta["agent_type"]
    agent_config = get_agent_config(agent_type)
    mode = agent_config.get("provider_apply_mode") if agent_config else None
    if mode is None:
        raise ProfileError(f"provider apply is not supported for {agent_type!r}")

    # Read from ACS (single source of truth — no agent-box DB fallback)
    from ...adapters import acs as _acs
    provider = _acs.get_provider(agent_type, provider_id)
    if provider is None:
        raise ProfileError(
            f"provider {provider_id!r} for {agent_type!r} not found in ACS"
        )
    provider_settings = provider.get("settings") or {}

    if mode == "overwrite":
        _apply_overwrite(
            profile_name, agent_type, provider, provider_settings
        )
    elif mode == "additive":
        _apply_additive(
            profile_name, agent_type, provider, provider_settings
        )
    else:
        raise ProfileError(
            f"unknown provider apply mode {mode!r} for {agent_type!r}"
        )

    from ...core import db
    conn = db.get_conn()
    conn.execute(
        "UPDATE profiles SET provider_ref = ? WHERE name = ?",
        (provider_id, profile_name),
    )
    conn.commit()


def _apply_overwrite(
    profile_name: str,
    agent_type: str,
    provider: Dict[str, Any],
    settings: Dict[str, Any],
) -> None:
    if agent_type == "claude":
        _apply_claude(profile_name, provider, settings)
    elif agent_type == "codex":
        _apply_codex(profile_name, provider, settings)
    else:
        raise ProfileError(
            f"overwrite provider apply is not implemented for {agent_type!r}"
        )


def _apply_additive(
    profile_name: str,
    agent_type: str,
    provider: Dict[str, Any],
    settings: Dict[str, Any],
) -> None:
    if agent_type == "hermes":
        apply_settings = _apply_hermes
    elif agent_type == "opencode":
        apply_settings = _apply_opencode
    else:
        raise ProfileError(
            f"additive provider apply is not implemented for {agent_type!r}"
        )
    _add_to_providers_store(profile_name, agent_type, provider)
    apply_settings(profile_name, provider, settings)


def _apply_claude(profile_name: str, provider: Dict[str, Any], settings: Dict[str, Any]) -> None:
    provider_env = settings.get("env") or {}
    if not isinstance(provider_env, dict):
        raise ProfileError(f"provider {provider['id']}: env must be a JSON object")

    settings_path = config.profile_agent_dir(profile_name, "claude") / "settings.json"
    existing: Dict[str, Any] = {}
    if settings_path.is_file():
        try:
            existing = json.loads(settings_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ProfileError(f"{profile_name}: invalid settings.json: {exc}") from exc
    if not isinstance(existing, dict):
        existing = {}

    existing["env"] = provider_env
    existing["_provider"] = {
        "id": provider.get("id"),
        "name": provider.get("name"),
        "notes": settings.get("notes", ""),
        "website_url": provider.get("website_url", "") or settings.get("website_url", ""),
        "icon": provider.get("icon"),
        "icon_color": provider.get("icon_color"),
        "category": provider.get("category"),
    }
    existing["_provider"] = {k: v for k, v in existing["_provider"].items() if v is not None}
    write_json(settings_path, existing)


def _apply_codex(profile_name: str, provider: Dict[str, Any], settings: Dict[str, Any]) -> None:
    config_dir = config.profile_agent_dir(profile_name, "codex")
    config_dir.mkdir(parents=True, exist_ok=True)

    # config.toml
    config_text = settings.get("config")
    if isinstance(config_text, str) and config_text.strip():
        config_toml_path = config_dir / "config.toml"
        write_text(config_toml_path, config_text)

    # auth.json
    auth = settings.get("auth")
    if isinstance(auth, dict):
        auth_path = config_dir / "auth.json"
        write_json(auth_path, auth)


def _build_hermes_custom_entry(provider_id: str, settings: Dict[str, Any]) -> str:
    """Build a single custom_providers YAML entry matching CC Switch format."""
    base_url = settings.get("base_url") or ""
    api_key = settings.get("api_key") or ""
    api_mode = settings.get("api_mode") or ""
    env_api_key = (settings.get("env") or {}).get("api_key") or ""

    mode_map = {"chat_completions": "openai_compatible", "openai_compatible": "openai_compatible",
                "anthropic": "anthropic", "codex_responses": "codex_responses"}
    mapped_mode = mode_map.get(api_mode, api_mode or "openai_compatible")

    lines = [f"  - name: {provider_id}"]
    lines.append(f'    base_url: "{base_url}"')
    lines.append(f'    api_key: "{api_key or env_api_key}"')
    lines.append(f'    api_mode: "{mapped_mode}"')

    models = settings.get("models")
    if isinstance(models, list) and models:
        first = models[0] if isinstance(models[0], dict) else {}
        first_id = (first.get("id") or first.get("model") or "")
        if first_id:
            lines.append(f'    model: "{first_id}"')
        lines.append("    models:")
        for m in models:
            if not isinstance(m, dict):
                continue
            mid = m.get("id") or m.get("model") or ""
            mname = m.get("name") or mid
            ctx = m.get("context_length")
            if mid:
                lines.append(f'      {mid}:')
                lines.append(f'        name: "{mname}"')
                if ctx is not None:
                    lines.append(f"        context_length: {ctx}")
    else:
        default_model = settings.get("default_model") or ""
        if default_model:
            lines.append(f'    model: "{default_model}"')

    return "\n".join(lines)


def _apply_hermes(profile_name: str, provider: Dict[str, Any], settings: Dict[str, Any]) -> None:
    """CC Switch style: write model.default + model.provider + add to custom_providers."""
    config_dir = config.profile_agent_dir(profile_name, "hermes")
    config_dir.mkdir(parents=True, exist_ok=True)

    provider_id = str(provider.get("id") or "")

    # Resolve default model (first model id)
    models = settings.get("models")
    first_model_id = None
    if isinstance(models, list) and models:
        first = models[0] if isinstance(models[0], dict) else {}
        first_model_id = (first.get("id") or first.get("model") or "") or None

    # 1. Write model section (switch)
    model_lines = []
    if first_model_id:
        model_lines.append(f'  default: "{first_model_id}"')
    model_lines.append(f'  provider: "{provider_id}"')
    model_yaml = "model:\n" + "\n".join(model_lines) + "\n"

    # 2. Read existing config, preserve non-model/non-custom_providers sections
    config_path = config_dir / "config.yaml"
    preamble_lines: List[str] = []
    custom_entries: List[str] = []
    in_custom = False
    current_entry: List[str] = []
    if config_path.is_file():
        for line in config_path.read_text(encoding="utf-8").split("\n"):
            stripped = line.rstrip()
            if stripped.strip() == "custom_providers:":
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

    # 3. Filter out preamble sections we will rewrite
    #    - old top-level keys managed by model: / custom_providers:
    _managed_keys = {
        "base_url", "api_key", "api_mode", "default", "models",
        "model", "providers", "custom_providers",
    }
    filtered_preamble: List[str] = []
    skip_until_next_section = False
    for line in preamble_lines:
        stripped = line.strip()
        # Skip managed sections (model:, custom_providers:)
        if stripped == "model:" or stripped.startswith("model "):
            skip_until_next_section = True
            continue
        if skip_until_next_section:
            if line and not line.startswith("  "):
                skip_until_next_section = False
            else:
                continue
        # Skip old top-level managed keys
        is_managed_key = False
        for key in _managed_keys:
            if stripped.startswith(f"{key}:") or stripped.startswith(f'{key} '):
                is_managed_key = True
                break
        if is_managed_key:
            skip_until_next_section = True
            continue
        # Also skip lines indented under a managed top-level key that wasn't
        # caught above (e.g. old `models:\n  - id: ...`)
        if skip_until_next_section:
            if line and not line.startswith("  "):
                skip_until_next_section = False
            else:
                continue
        filtered_preamble.append(line)

    # 4. Upsert provider into custom_entries
    new_entry = _build_hermes_custom_entry(provider_id, settings)
    replaced = False
    for i, entry in enumerate(custom_entries):
        if f"name: {provider_id}" in entry:
            custom_entries[i] = new_entry
            replaced = True
            break
    if not replaced:
        custom_entries.append(new_entry)

    # 5. Write
    output = "\n".join([l for l in filtered_preamble if l.strip()]) + "\n"
    output += model_yaml
    if custom_entries:
        output += "custom_providers:\n"
        for entry in custom_entries:
            output += entry + "\n"

    config_path.write_text(output, encoding="utf-8")
    # API key lives in custom_providers entry — .env is not managed for additive mode


def _apply_opencode(profile_name: str, provider: Dict[str, Any], settings: Dict[str, Any]) -> None:
    config_dir = config.profile_agent_dir(profile_name, "opencode")
    config_dir.mkdir(parents=True, exist_ok=True)

    provider_name = (provider.get("id") or "") .replace("/", "_")
    npm = settings.get("npm") or ""
    options = settings.get("options") or {}

    # Build provider section
    provider_config: Dict[str, Any] = {}
    if isinstance(options, dict):
        provider_config.update(options)
    elif isinstance(npm, str) and npm:
        provider_config["npm"] = npm

    models = settings.get("models") or {}
    if isinstance(models, dict) and models:
        provider_config["models"] = models

    # Read existing opencode.jsonc, update provider section
    jsonc_path = config_dir / "opencode.jsonc"
    existing: Dict[str, Any] = {}
    if jsonc_path.is_file():
        try:
            raw = jsonc_path.read_text(encoding="utf-8")
            cleaned = _strip_jsonc_comments(raw)
            existing = json.loads(cleaned)
        except (json.JSONDecodeError, ValueError):
            existing = {}
    if not isinstance(existing, dict):
        existing = {}

    existing["provider"] = existing.get("provider") or {}
    if isinstance(existing["provider"], dict) and provider_name:
        existing["provider"][provider_name] = provider_config

    from ...core.io import write_text
    write_text(jsonc_path, json.dumps(existing, indent=2, ensure_ascii=False) + "\n")


def _strip_jsonc_comments(raw: str) -> str:
    """Strip JSONC comments without touching // inside strings."""
    result: List[str] = []
    i = 0
    in_string = False
    in_block_comment = False
    while i < len(raw):
        c = raw[i]
        if in_block_comment:
            if c == '*' and i + 1 < len(raw) and raw[i + 1] == '/':
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue
        if in_string:
            result.append(c)
            if c == '\\' and i + 1 < len(raw):
                result.append(raw[i + 1])
                i += 2
                continue
            if c == '"':
                in_string = False
            i += 1
            continue
        if c == '"':
            in_string = True
            result.append(c)
            i += 1
            continue
        if c == '/' and i + 1 < len(raw):
            nxt = raw[i + 1]
            if nxt == '/':
                # Line comment — skip to end of line
                while i < len(raw) and raw[i] != '\n':
                    i += 1
                continue
            if nxt == '*':
                in_block_comment = True
                i += 2
                continue
        result.append(c)
        i += 1
    cleaned = ''.join(result)
    # Strip trailing commas
    cleaned = re.sub(r',(\s*[}\]])', r'\1', cleaned)
    return cleaned


# ── Additive provider store (Hermes / OpenCode) ────────────────────────────

def _providers_store_path(profile_name: str, agent_type: str) -> Path:
    return config.profile_agent_dir(profile_name, agent_type) / "_providers.json"


def _add_to_providers_store(profile_name: str, agent_type: str,
                             provider: Dict[str, Any]) -> None:
    store_path = _providers_store_path(profile_name, agent_type)
    store_path.parent.mkdir(parents=True, exist_ok=True)
    entries: Dict[str, Any] = {}
    if store_path.is_file():
        try:
            entries = json.loads(store_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            entries = {}
    if not isinstance(entries, dict):
        entries = {}
    provider_id = str(provider.get("id") or "")
    entries[provider_id] = {
        "id": provider_id,
        "name": provider.get("name") or provider_id,
        "settings": provider.get("settings") or {},
        "website_url": provider.get("website_url") or "",
        "icon": provider.get("icon") or None,
        "icon_color": provider.get("icon_color") or None,
        "category": provider.get("category") or "",
    }
    write_json(store_path, entries)


def list_profile_providers(profile_name: str, agent_type: str) -> List[Dict[str, Any]]:
    store_path = _providers_store_path(profile_name, agent_type)
    if not store_path.is_file():
        return []
    try:
        entries = json.loads(store_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(entries, dict):
        return []
    return sorted(entries.values(), key=lambda e: e.get("name", ""))


def remove_profile_provider(profile_name: str, agent_type: str, provider_id: str) -> bool:
    store_path = _providers_store_path(profile_name, agent_type)
    if not store_path.is_file():
        return False
    try:
        entries = json.loads(store_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(entries, dict) or provider_id not in entries:
        return False
    del entries[provider_id]
    write_json(store_path, entries)

    # Also remove from Hermes config.yaml custom_providers
    if agent_type == "hermes":
        config_path = config.profile_agent_dir(profile_name, "hermes") / "config.yaml"
        if config_path.is_file():
            text = config_path.read_text(encoding="utf-8")
            lines = text.split("\n")
            out_lines: List[str] = []
            in_custom = False
            skip_entry = False
            current_entry_indent = 0
            for line in lines:
                stripped = line.rstrip()
                if stripped.strip() == "custom_providers:":
                    in_custom = True
                    out_lines.append(stripped)
                    continue
                if in_custom and stripped.startswith("  - "):
                    skip_entry = f"name: {provider_id}" in stripped
                    current_entry_indent = len(stripped) - len(stripped.lstrip())
                if in_custom and skip_entry:
                    # Check if still in the same entry (indented)
                    if stripped and len(stripped) - len(stripped.lstrip()) <= current_entry_indent and not stripped.startswith("  - "):
                        skip_entry = False
                        out_lines.append(stripped)
                    elif not stripped.startswith("  - "):
                        continue  # skip this line (part of the entry being removed)
                    else:
                        skip_entry = f"name: {provider_id}" in stripped
                        if not skip_entry:
                            out_lines.append(stripped)
                else:
                    out_lines.append(stripped)
            config_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")

    # Also remove from OpenCode opencode.jsonc provider section
    elif agent_type == "opencode":
        jsonc_path = config.profile_agent_dir(profile_name, "opencode") / "opencode.jsonc"
        if jsonc_path.is_file():
            raw = jsonc_path.read_text(encoding="utf-8")
            cleaned = _strip_jsonc_comments(raw)
            try:
                config_json = json.loads(cleaned)
                if isinstance(config_json.get("provider"), dict):
                    config_json["provider"].pop(provider_id, None)
                from ...core.io import write_text
                write_text(jsonc_path, json.dumps(config_json, indent=2, ensure_ascii=False) + "\n")
            except json.JSONDecodeError:
                pass

    return True
