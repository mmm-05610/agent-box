"""Provider apply tests — agent-box reads providers from ACS only."""
from __future__ import annotations

import json

from agent_box import config
from agent_box.resources import profile, providers


def test_provider_apply(tmp_agent_box_home, acs_stub):
    """apply_provider merges env into settings.json, preserving other keys."""
    profile.create("mycc", "claude")
    settings_path = config.profile_agent_dir("mycc", "claude") / "settings.json"
    assert settings_path.is_file()

    initial = json.loads(settings_path.read_text(encoding="utf-8"))
    assert isinstance(initial, dict)
    initial_top_keys = set(initial.keys())

    acs_stub.add_provider(
        "claude", "minimax",
        settings={
            "env": {
                "ANTHROPIC_BASE_URL": "https://api.minimax.chat/v1",
                "ANTHROPIC_AUTH_TOKEN": "sk-test-123",
                "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2",
            },
        },
    )

    providers.apply_provider("mycc", "minimax")

    after = json.loads(settings_path.read_text(encoding="utf-8"))
    assert after["env"]["ANTHROPIC_BASE_URL"] == "https://api.minimax.chat/v1"
    assert after["env"]["ANTHROPIC_AUTH_TOKEN"] == "sk-test-123"
    assert after["env"]["ANTHROPIC_DEFAULT_HAIKU_MODEL"] == "MiniMax-M2"
    # Top-level keys preserved (_provider is added by apply to track active provider).
    assert initial_top_keys.issubset(set(after.keys()))

    meta = profile.load_meta("mycc")
    assert meta["provider"] == "minimax"


def test_provider_apply_merges_existing_env(tmp_agent_box_home, acs_stub):
    """Apply doesn't clobber keys already in settings.json.env."""
    profile.create("mycc", "claude")
    settings_path = config.profile_agent_dir("mycc", "claude") / "settings.json"
    data = json.loads(settings_path.read_text(encoding="utf-8"))
    data.setdefault("env", {})["ANTHROPIC_MODEL"] = "preset-model"
    settings_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    acs_stub.add_provider(
        "claude", "p",
        settings={"env": {"ANTHROPIC_BASE_URL": "https://x",
                           "ANTHROPIC_MODEL": "override"}},
    )
    providers.apply_provider("mycc", "p")

    after = json.loads(settings_path.read_text(encoding="utf-8"))
    assert after["env"]["ANTHROPIC_MODEL"] == "override"
    assert after["env"]["ANTHROPIC_BASE_URL"] == "https://x"
    meta = profile.load_meta("mycc")
    assert meta["provider"] == "p"
