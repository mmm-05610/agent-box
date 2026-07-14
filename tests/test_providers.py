"""Provider CRUD + apply tests (CLI side)."""
from __future__ import annotations

import json

import pytest

from agent_box import config, profile, providers
from agent_box.profile import ProfileError

from _editor_mock import patch_editor, patch_editor_with


# --- CRUD -----------------------------------------------------------------

def test_provider_crud(tmp_agent_box_home):
    """add \u2192 list \u2192 show \u2192 edit \u2192 delete round-trip."""
    with patch_editor_with({
        "name": "minimax",
        "description": "MiniMax API",
        "env": {"ANTHROPIC_BASE_URL": "https://api.minimax.chat/v1"},
    }):
        providers.add_provider("claude", "minimax")

    listed = providers.list_providers("claude")
    assert len(listed) == 1
    assert listed[0]["id"] == "minimax"
    assert listed[0]["name"] == "minimax"

    shown = providers.get_provider("claude", "minimax")
    assert shown is not None
    assert shown["settings"]["env"]["ANTHROPIC_BASE_URL"] == \
        "https://api.minimax.chat/v1"

    # Edit changes the env body.
    with patch_editor_with({
        "name": "minimax",
        "description": "updated",
        "env": {"ANTHROPIC_AUTH_TOKEN": "sk-new"},
    }):
        providers.edit_provider("claude", "minimax")

    shown = providers.get_provider("claude", "minimax")
    assert shown["settings"]["description"] == "updated"
    assert shown["settings"]["env"]["ANTHROPIC_AUTH_TOKEN"] == "sk-new"
    # Original env key is gone \u2014 edit overwrites, not merges.
    assert "ANTHROPIC_BASE_URL" not in shown["settings"]["env"]

    # Delete
    providers.delete_provider("claude", "minimax")
    assert providers.get_provider("claude", "minimax") is None
    assert providers.list_providers("claude") == []


def test_provider_duplicate(tmp_agent_box_home):
    """Adding a provider with the same (id, app_type) twice raises."""
    with patch_editor_with({"name": "p1", "env": {}}):
        providers.add_provider("claude", "p1")
    with patch_editor():
        with pytest.raises(ProfileError, match="already exists"):
            providers.add_provider("claude", "p1")


def test_provider_get_missing(tmp_agent_box_home):
    """get_provider returns None for unknown ids (not an exception)."""
    assert providers.get_provider("claude", "nope") is None


def test_provider_delete_missing(tmp_agent_box_home):
    """delete_provider raises for unknown ids."""
    with pytest.raises(ProfileError, match="not found"):
        providers.delete_provider("claude", "nope")


# --- apply ----------------------------------------------------------------

def test_provider_apply(tmp_agent_box_home):
    """apply_provider merges env into settings.json, preserving other keys."""
    # 1. Create a profile (CC).
    profile.create("mycc", "claude")
    settings_path = config.profile_agent_dir("mycc", "claude") / "settings.json"
    assert settings_path.is_file()

    # Sanity: template settings.json has its own structure.
    initial = json.loads(settings_path.read_text(encoding="utf-8"))
    assert isinstance(initial, dict)
    initial_top_keys = set(initial.keys())

    # 2. Add a provider with a non-empty env.
    with patch_editor_with({
        "name": "minimax",
        "description": "",
        "env": {
            "ANTHROPIC_BASE_URL": "https://api.minimax.chat/v1",
            "ANTHROPIC_AUTH_TOKEN": "sk-test-123",
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2",
        },
    }):
        providers.add_provider("claude", "minimax")

    # 3. Apply.
    providers.apply_provider("mycc", "minimax")

    # 4. settings.json.env has all three keys, other top-level keys intact.
    after = json.loads(settings_path.read_text(encoding="utf-8"))
    assert after["env"]["ANTHROPIC_BASE_URL"] == "https://api.minimax.chat/v1"
    assert after["env"]["ANTHROPIC_AUTH_TOKEN"] == "sk-test-123"
    assert after["env"]["ANTHROPIC_DEFAULT_HAIKU_MODEL"] == "MiniMax-M2"
    # Top-level keys preserved.
    assert set(after.keys()) == initial_top_keys

    # 5. profiles.provider_ref updated.
    meta = profile.load_meta("mycc")
    assert meta["provider"] == "minimax"


def test_provider_apply_merges_existing_env(tmp_agent_box_home):
    """Apply doesn't clobber keys already in settings.json.env."""
    profile.create("mycc", "claude")
    settings_path = config.profile_agent_dir("mycc", "claude") / "settings.json"
    # Inject a pre-existing env key.
    data = json.loads(settings_path.read_text(encoding="utf-8"))
    data.setdefault("env", {})["ANTHROPIC_MODEL"] = "preset-model"
    settings_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    with patch_editor_with({
        "name": "p",
        "env": {"ANTHROPIC_BASE_URL": "https://x", "ANTHROPIC_MODEL": "override"},
    }):
        providers.add_provider("claude", "p")
    providers.apply_provider("mycc", "p")

    after = json.loads(settings_path.read_text(encoding="utf-8"))
    # Provider overwrites the conflicting key.
    assert after["env"]["ANTHROPIC_MODEL"] == "override"
    # Non-conflicting new key applied.
    assert after["env"]["ANTHROPIC_BASE_URL"] == "https://x"


def test_provider_apply_non_claude(tmp_agent_box_home):
    """Non-CC agent types raise 'not yet supported' on apply."""
    profile.create("hermes1", "hermes")
    with patch_editor_with({"name": "p", "env": {"X": "1"}}):
        providers.add_provider("hermes", "p")
    with pytest.raises(ProfileError, match="not yet supported"):
        providers.apply_provider("hermes1", "p")


def test_provider_apply_unknown_provider(tmp_agent_box_home):
    """apply_provider raises if the provider id is unknown."""
    profile.create("mycc", "claude")
    with pytest.raises(ProfileError, match="not found"):
        providers.apply_provider("mycc", "does-not-exist")


# --- upsert (bypass $EDITOR) -------------------------------------------

def test_upsert_provider_insert(tmp_agent_box_home):
    """upsert_provider creates a new row for a fresh id."""
    result = providers.upsert_provider(
        "claude", "test-upsert-new",
        json.dumps({
            "name": "tu-new",
            "description": "desc",
            "env": {"KEY": "val"},
        }),
    )
    assert result is not None
    assert result["id"] == "test-upsert-new"
    assert result["app_type"] == "claude"
    assert result["name"] == "tu-new"
    assert result["settings"]["env"] == {"KEY": "val"}

    # Visible via list / get
    listed = providers.list_providers("claude")
    assert any(p["id"] == "test-upsert-new" for p in listed)


def test_upsert_provider_update(tmp_agent_box_home):
    """upsert_provider updates an existing row in place."""
    providers.upsert_provider(
        "claude", "test-upsert-upd",
        json.dumps({"name": "v1", "env": {"K1": "v1"}}),
    )
    result = providers.upsert_provider(
        "claude", "test-upsert-upd",
        json.dumps({"name": "v2", "env": {"K1": "v2", "K2": "added"}}),
    )
    assert result["name"] == "v2"
    assert result["settings"]["env"] == {"K1": "v2", "K2": "added"}

    # Still only one row for this id.
    listed = providers.list_providers("claude")
    matches = [p for p in listed if p["id"] == "test-upsert-upd"]
    assert len(matches) == 1


def test_upsert_provider_invalid_json(tmp_agent_box_home):
    """upsert_provider raises ProfileError on invalid JSON."""
    with pytest.raises(ProfileError, match="not valid JSON"):
        providers.upsert_provider("claude", "bad-json", "not-json")


def test_upsert_provider_not_a_dict(tmp_agent_box_home):
    """upsert_provider rejects non-object JSON (e.g. arrays)."""
    with pytest.raises(ProfileError, match="must be a JSON object"):
        providers.upsert_provider("claude", "bad-arr", "[]")


def test_upsert_provider_env_not_dict(tmp_agent_box_home):
    """upsert_provider rejects env values that aren't objects."""
    with pytest.raises(ProfileError, match="'env' must be an object"):
        providers.upsert_provider("claude", "bad-env", json.dumps({"env": "oops"}))


# ── resolve_usage_credentials ─────────────────────────────────────────────
#
# Mirrors the per-app credential extraction contract in cc-switch's
# `Provider::resolve_usage_credentials` (provider.rs) and the TS sibling
# `getProviderCredentials` in UsageScriptModal.tsx. If you change a branch
# here, update the corresponding TS/Rust side too.

_CLAUDE_SETTINGS = {
    "env": {
        "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "sk-claude",
    }
}
_CODEX_AUTH_TOML = (
    'model_provider = "deepseek"\n'
    "\n"
    "[model_providers.deepseek]\n"
    'base_url = "https://api.deepseek.com"\n'
)
_CODEX_BEARER_TOML = (
    'model_provider = "custom"\n'
    'experimental_bearer_token = "sk-bearer"\n'
    "\n"
    "[model_providers.custom]\n"
    'base_url = "https://custom.example.com"\n'
)


def _wrap(settings):
    """Wrap a settings dict the way get_provider() would."""
    return {"id": "p", "settings": settings}


def test_resolve_claude_basic():
    r = providers.resolve_usage_credentials("claude", _wrap(_CLAUDE_SETTINGS))
    assert r["api_key"] == "sk-claude"
    assert r["base_url"] == "https://api.deepseek.com/anthropic"
    # Legacy keys mirror so existing bash scripts keep working.
    assert r["ANTHROPIC_AUTH_TOKEN"] == "sk-claude"
    assert r["ANTHROPIC_BASE_URL"] == "https://api.deepseek.com/anthropic"


def test_resolve_claude_openrouter_fallback():
    """When ANTHROPIC_* keys are absent, fall back to OpenRouter / Google."""
    s = {"env": {"ANTHROPIC_BASE_URL": "https://openrouter.ai/api/v1",
                 "OPENROUTER_API_KEY": "sk-or"}}
    r = providers.resolve_usage_credentials("claude", _wrap(s))
    assert r["api_key"] == "sk-or"
    assert r["base_url"] == "https://openrouter.ai/api/v1"


def test_resolve_claude_skips_empty_token():
    """Empty ANTHROPIC_AUTH_TOKEN must not block later fallback keys."""
    s = {"env": {"ANTHROPIC_BASE_URL": "https://or.ai",
                 "ANTHROPIC_AUTH_TOKEN": "",
                 "ANTHROPIC_API_KEY": "",
                 "OPENROUTER_API_KEY": "sk-or"}}
    r = providers.resolve_usage_credentials("claude", _wrap(s))
    assert r["api_key"] == "sk-or"


def test_resolve_claude_trims_trailing_slash():
    s = {"env": {"ANTHROPIC_BASE_URL": "https://x.example.com/"}}
    r = providers.resolve_usage_credentials("claude", _wrap(s))
    assert r["base_url"] == "https://x.example.com"
    # The mirror key keeps the original (downstream callers may rely on it).
    assert r["ANTHROPIC_BASE_URL"] == "https://x.example.com/"


def test_resolve_codex_auth_and_active_section_toml():
    """Codex: prefer auth.OPENAI_API_KEY; resolve base_url from active section."""
    r = providers.resolve_usage_credentials(
        "codex",
        _wrap({"auth": {"OPENAI_API_KEY": "sk-codex"}, "config": _CODEX_AUTH_TOML}),
    )
    assert r["api_key"] == "sk-codex"
    assert r["base_url"] == "https://api.deepseek.com"
    assert r["OPENAI_API_KEY"] == "sk-codex"


def test_resolve_codex_falls_back_to_bearer_token():
    """When auth.OPENAI_API_KEY is absent, lift experimental_bearer_token."""
    r = providers.resolve_usage_credentials(
        "codex", _wrap({"config": _CODEX_BEARER_TOML}),
    )
    assert r["api_key"] == "sk-bearer"
    assert r["base_url"] == "https://custom.example.com"


def test_resolve_codex_top_level_base_url_fallback():
    """If no active section, fall back to the top-level base_url key."""
    s = {"config": 'base_url = "https://top.example.com"\n'}
    r = providers.resolve_usage_credentials("codex", _wrap(s))
    assert r["api_key"] == ""
    assert r["base_url"] == "https://top.example.com"


def test_resolve_hermes_snake_case_top_level():
    r = providers.resolve_usage_credentials(
        "hermes",
        _wrap({"base_url": "https://hermes.example.com", "api_key": "sk-hermes"}),
    )
    assert r["api_key"] == "sk-hermes"
    assert r["base_url"] == "https://hermes.example.com"


def test_resolve_opencode_nested_in_options():
    r = providers.resolve_usage_credentials(
        "opencode",
        _wrap({"options": {"baseURL": "https://oc.example.com/v1",
                            "apiKey": "sk-oc"}}),
    )
    assert r["api_key"] == "sk-oc"
    assert r["base_url"] == "https://oc.example.com/v1"


def test_resolve_gemini_legacy_google_key():
    """Gemini: GOOGLE_API_KEY is the legacy fallback for GEMINI_API_KEY."""
    s = {"env": {"GOOGLE_GEMINI_BASE_URL": "https://generativelanguage.googleapis.com",
                 "GOOGLE_API_KEY": "g-legacy"}}
    r = providers.resolve_usage_credentials("gemini", _wrap(s))
    assert r["api_key"] == "g-legacy"
    assert r["base_url"] == "https://generativelanguage.googleapis.com"


def test_resolve_unknown_agent_type_returns_empty():
    """Unknown agent types gracefully return empty credentials."""
    r = providers.resolve_usage_credentials("not-a-real-agent",
                                             _wrap({"env": {"X": "y"}}))
    assert r["api_key"] == ""
    assert r["base_url"] == ""


def test_resolve_handles_missing_settings():
    """provider with no settings key (or empty settings) returns empty creds."""
    r = providers.resolve_usage_credentials("claude", {"id": "x"})
    assert r["api_key"] == ""
    assert r["base_url"] == ""


def test_resolve_handles_non_dict_settings():
    r = providers.resolve_usage_credentials("claude", {"id": "x", "settings": "not-a-dict"})
    assert r["api_key"] == ""
    assert r["base_url"] == ""
