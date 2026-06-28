"""Hooks read/write tests — hooks are embedded in settings.json, not a
standalone file."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box import config, hooks, profile
from agent_box.profile import ProfileError


_HOOKS_BODY = {
    "PostToolUse": [
        {
            "matcher": "Write|Edit",
            "hooks": [
                {"type": "command", "command": "npx biome format --write $FILE_PATH"},
            ],
        },
    ],
    "PreToolUse": [
        {
            "matcher": "Bash",
            "hooks": [
                {"type": "command", "command": "echo about to run a bash command"},
            ],
        },
    ],
}


def _hooks_json() -> str:
    return json.dumps(_HOOKS_BODY)


def _settings_path(name: str) -> Path:
    """Path to settings.json in the test profile."""
    return config.profile_agent_dir(name, "claude") / "settings.json"


# --- upsert ---------------------------------------------------------------

def test_upsert_hooks_new(tmp_agent_box_home):
    """Hooks are written into settings.json → hooks key, preserving the
    other keys already present in the template."""
    profile.create("mycc", "claude")
    result = hooks.upsert_hooks("mycc", _hooks_json())
    assert result == _HOOKS_BODY

    target = _settings_path("mycc")
    assert target.is_file()
    data = json.loads(target.read_text(encoding="utf-8"))
    assert data["hooks"] == _HOOKS_BODY
    # Other template keys survive.
    assert "permissions" in data
    assert "env" in data


def test_upsert_hooks_update(tmp_agent_box_home):
    """Hooks overwrite inside settings.json — other keys untouched."""
    profile.create("mycc", "claude")
    hooks.upsert_hooks("mycc", _hooks_json())

    new_body = {
        "Notification": [
            {"hooks": [{"type": "command", "command": "echo notify"}]},
        ],
    }
    result = hooks.upsert_hooks("mycc", json.dumps(new_body))
    assert result == new_body

    data = json.loads(_settings_path("mycc").read_text(encoding="utf-8"))
    assert data["hooks"] == new_body
    assert "PostToolUse" not in data["hooks"]  # overwritten, not merged
    # Other keys still there.
    assert "permissions" in data
    assert "env" in data


def test_upsert_hooks_preserves_other_keys(tmp_agent_box_home):
    """Non-hooks keys in settings.json survive a hooks upsert."""
    profile.create("mycc", "claude")
    # Pre-populate settings with a custom key.
    s = json.loads(_settings_path("mycc").read_text(encoding="utf-8"))
    s["model"] = "opus"
    s["theme"] = "light"
    _settings_path("mycc").write_text(json.dumps(s, indent=2) + "\n")

    hooks.upsert_hooks("mycc", _hooks_json())

    data = json.loads(_settings_path("mycc").read_text(encoding="utf-8"))
    assert data["hooks"] == _HOOKS_BODY
    assert data["model"] == "opus"
    assert data["theme"] == "light"


def test_upsert_hooks_invalid_json(tmp_agent_box_home):
    profile.create("mycc", "claude")
    with pytest.raises(ProfileError, match="not valid JSON"):
        hooks.upsert_hooks("mycc", "not-json")


def test_upsert_hooks_not_object(tmp_agent_box_home):
    profile.create("mycc", "claude")
    with pytest.raises(ProfileError, match="must be a JSON object"):
        hooks.upsert_hooks("mycc", "[]")


def test_upsert_hooks_non_claude_profile(tmp_agent_box_home):
    profile.create("mycodex", "codex")
    with pytest.raises(ProfileError, match="only supported for claude profiles"):
        hooks.upsert_hooks("mycodex", _hooks_json())


# --- show -----------------------------------------------------------------

def test_show_hooks(tmp_agent_box_home):
    profile.create("mycc", "claude")
    hooks.upsert_hooks("mycc", _hooks_json())
    data = hooks.get_hooks("mycc")
    assert data == _HOOKS_BODY


def test_show_hooks_missing(tmp_agent_box_home):
    """get_hooks returns None when settings.json has no hooks key."""
    profile.create("mycc", "claude")
    assert hooks.get_hooks("mycc") is None


def test_show_hooks_corrupt_file(tmp_agent_box_home):
    """Corrupt settings.json → ProfileError."""
    profile.create("mycc", "claude")
    _settings_path("mycc").write_text("{ not valid json")
    with pytest.raises(ProfileError, match="not valid JSON"):
        hooks.get_hooks("mycc")


def test_show_hooks_non_object(tmp_agent_box_home):
    """settings.json → hooks is a list → ProfileError."""
    profile.create("mycc", "claude")
    _settings_path("mycc").write_text('{"hooks": []}\n')
    with pytest.raises(ProfileError, match="'hooks' must be a JSON object"):
        hooks.get_hooks("mycc")


def test_show_hooks_non_claude_profile(tmp_agent_box_home):
    profile.create("mycodex", "codex")
    with pytest.raises(ProfileError, match="only supported for claude profiles"):
        hooks.get_hooks("mycodex")


def test_show_hooks_unknown_profile(tmp_agent_box_home):
    with pytest.raises(ProfileError, match="profile not found"):
        hooks.get_hooks("nope")
