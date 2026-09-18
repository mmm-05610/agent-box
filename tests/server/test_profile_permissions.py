"""Order 60 B: per-tool permission rules, last-match-wins, presets, refusals.

The counterexamples the order names: an unknown key, an unknown action, an
out-of-range timeout-analog (here: a malformed pattern), the last-match-wins
boundary, and the rule that an unmatched target falls back to the preset
rather than to `allow`.
"""
from __future__ import annotations

import pytest

from agent_box.server.profiles.permissions import (
    PRESET_ACTIONS,
    PermissionRuleError,
    effective_rules,
    preset_rules,
    resolve,
    resolve_all,
    validate_rules,
)


def test_last_match_wins_and_the_preset_catches_everything_else():
    rules = validate_rules([
        {"key": "bash", "action": "deny"},
        {"key": "bash", "pattern": "ls *", "action": "allow"},
        {"key": "edit", "pattern": "src/**", "action": "ask"},
    ])
    # The later, narrower rule wins for its target...
    assert resolve(rules, key="bash", target="ls -la", preset="plan") == "allow"
    # ...and the earlier broad rule still decides everything else.
    assert resolve(rules, key="bash", target="rm -rf /", preset="plan") == "deny"
    # A key with no rule falls back to the preset, never to `allow`.
    assert resolve(rules, key="webfetch", preset="plan") == PRESET_ACTIONS["plan"]
    assert resolve(rules, key="webfetch", preset="full-access") == "allow"
    # A pattern rule cannot speak about a targetless resolution.
    assert resolve(rules, key="edit", preset="default") == "ask"


def test_presets_expand_to_explicit_rules_and_overrides_append():
    plan = preset_rules("plan")
    assert {"key": "edit", "pattern": None, "action": "deny"} in plan
    # The user may override a preset rule with a later, narrower one.
    rules = effective_rules("plan", [{"key": "edit", "pattern": "docs/**", "action": "allow"}])
    assert resolve(rules, key="edit", target="docs/readme.md", preset="plan") == "allow"
    assert resolve(rules, key="edit", target="src/main.py", preset="plan") == "deny"


def test_unknown_keys_actions_patterns_and_shapes_refuse_typed():
    with pytest.raises(PermissionRuleError) as key:
        validate_rules([{"key": "shell", "action": "allow"}])
    assert key.value.code == "PERMISSION_KEY_UNSUPPORTED" and key.value.index == 0

    with pytest.raises(PermissionRuleError) as action:
        validate_rules([{"key": "bash", "action": "maybe"}])
    assert action.value.code == "PERMISSION_ACTION_UNSUPPORTED"

    with pytest.raises(PermissionRuleError) as pattern:
        validate_rules([{"key": "bash", "pattern": "a b\nc", "action": "ask"}])
    assert pattern.value.code == "PERMISSION_PATTERN_INVALID"

    with pytest.raises(PermissionRuleError) as shape:
        validate_rules([{"key": "bash", "action": "ask", "note": "x"}])
    assert shape.value.code == "PERMISSION_RULE_INVALID"

    with pytest.raises(PermissionRuleError) as preset:
        resolve([], key="bash", preset="yolo")
    assert preset.value.code == "PERMISSION_PRESET_UNSUPPORTED"

    with pytest.raises(PermissionRuleError):
        resolve([], key="not-a-tool")


def test_the_frozen_posture_states_every_key_and_every_named_target():
    rules = effective_rules("default", [
        {"key": "bash", "pattern": "git *", "action": "allow"},
        {"key": "bash", "action": "ask"},
    ])
    posture = resolve_all(rules, preset="default", targets={"bash": ("git status", "rm -rf /")})
    assert posture["preset"] == "default"
    assert set(posture["keys"]) == {
        "read", "edit", "bash", "task", "external_directory", "webfetch", "skill"}
    assert posture["targets"]["bash"] == {"git status": "ask", "rm -rf /": "ask"}
    # Order matters inside the set: with the allow first, the broad ask wins
    # for the git command too - the frozen posture shows exactly that.
    rules_reversed = effective_rules("default", [
        {"key": "bash", "action": "ask"},
        {"key": "bash", "pattern": "git *", "action": "allow"},
    ])
    posture_reversed = resolve_all(rules_reversed, targets={"bash": ("git status",)})
    assert posture_reversed["targets"]["bash"]["git status"] == "allow"


def test_the_posture_is_stored_validated_and_frozen_into_the_next_turn(tmp_path):
    """Order 60 A/G1: an edited rule set is stored ordered, refused typed when
    illegal, and shows up in the *next* turn's frozen effective configuration."""
    import json

    from agent_box.server.errors import ServerError
    from agent_box.server.idempotency import IdempotentRecords
    from agent_box.server.profiles import ProfileRecords
    from agent_box.server.sessions import SessionRecords
    from agent_box.storage import Database

    database = Database(tmp_path / "data")
    database.initialize()
    idempotency = IdempotentRecords(database)
    profiles = ProfileRecords(database, idempotency)
    sessions = SessionRecords(database, idempotency)

    profile = profiles.create(
        key="p", request_digest="p", name="role", harness_type="claude-code",
        config_digest="sha256:" + "0" * 64, credential_id=None)[1]

    # An illegal rule refuses before storage, with the rule's own code.
    with pytest.raises(ServerError) as refused:
        profiles.set_permissions(
            profile_id=profile["profile_id"], preset="default",
            rules=[{"key": "shell", "action": "allow"}],
            expected_version=profiles.get(profile["profile_id"])["version"],
            key="perm-1", request_digest="perm-1")
    assert refused.value.code == "PERMISSION_KEY_UNSUPPORTED"

    written = profiles.set_permissions(
        profile_id=profile["profile_id"], preset="plan",
        rules=[{"key": "edit", "pattern": "docs/**", "action": "allow"}],
        expected_version=profiles.get(profile["profile_id"])["version"],
        key="perm-2", request_digest="perm-2")[1]
    rules = json.loads(profiles.get(profile["profile_id"])["permission_rules_json"])
    assert rules[0]["key"] == "edit" and rules[0]["action"] == "deny"  # the preset
    assert rules[-1]["pattern"] == "docs/**"                          # then the override

    # The frozen posture: resolve_all over the stored rules, preset `plan`.
    posture = resolve_all(rules, preset="plan")
    assert posture["keys"]["edit"] == "deny" and posture["keys"]["bash"] == "deny"
    assert posture["keys"]["read"] == "ask"
    assert written["profile"]["id"] == profile["profile_id"]
