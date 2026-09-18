"""Order 59: the per-family hook models, the ledger, and the refusals.

The counterexamples the order asks for live here: an event the family does not
declare, a matcher where the family has none, a timeout out of range, a
handler type the family does not accept, and the rule that a hook is disabled
until a user enables it - with the exact command text visible first.
"""
from __future__ import annotations

import pytest

from agent_box.server.hooks.model import (
    DEFAULT_TIMEOUT_SECONDS,
    MAX_TIMEOUT_SECONDS,
    HookModelError,
    command_preview,
    schema_for,
    validate_model,
)
from agent_box.server.hooks.records import HookRecords
from agent_box.server.idempotency import IdempotentRecords
from agent_box.storage import Database


def _model(**overrides):
    model = {
        "event": "PreToolUse",
        "matcher": "Bash",
        "handlers": [{"type": "command", "command": "/bin/guard --check"}],
    }
    model.update(overrides)
    return model


def test_the_families_declare_their_own_models_and_unknown_ones_refuse():
    claude = schema_for("claude-code")
    codex = schema_for("codex")
    assert "PreToolUse" in claude.events and "PreToolUse" in codex.events
    assert claude.managed_only_flag == "disableAllHooks"
    assert codex.managed_only_flag == "hooks_only"
    # Codex declares only command handlers; claude declares the wider set.
    assert codex.handler_types == ("command",)
    assert "mcp_tool" in claude.handler_types

    with pytest.raises(HookModelError) as unsupported:
        schema_for("pi")
    assert unsupported.value.code == "HOOK_FAMILY_UNSUPPORTED"


def test_the_model_validates_and_canonicalises():
    canonical = validate_model("claude-code", _model())
    assert canonical["event"] == "PreToolUse" and canonical["matcher"] == "Bash"
    handler = canonical["handlers"][0]
    assert handler["type"] == "command" and handler["timeout"] == DEFAULT_TIMEOUT_SECONDS
    assert handler["async"] is False
    assert command_preview(canonical) == ["/bin/guard --check"]


def test_every_illegal_field_refuses_with_its_own_code():
    with pytest.raises(HookModelError) as event:
        validate_model("codex", _model(event="PreModelSwitch"))
    assert event.value.code == "HOOK_EVENT_UNSUPPORTED"

    with pytest.raises(HookModelError) as handler:
        validate_model("codex", _model(handlers=[{"type": "http", "url": "https://x.test"}]))
    assert handler.value.code == "HOOK_HANDLER_UNSUPPORTED"

    with pytest.raises(HookModelError) as timeout:
        validate_model("codex", _model(handlers=[
            {"type": "command", "command": "/bin/x", "timeout": MAX_TIMEOUT_SECONDS + 1}]))
    assert timeout.value.code == "HOOK_TIMEOUT_INVALID"

    with pytest.raises(HookModelError) as command:
        validate_model("codex", _model(handlers=[{"type": "command"}]))
    assert command.value.code == "HOOK_FIELD_INVALID"

    with pytest.raises(HookModelError) as shape:
        validate_model("codex", _model(extra=True))
    assert shape.value.code == "HOOK_MODEL_INVALID"

    # A loopback http handler is admissible for claude; a plain http one is not.
    with pytest.raises(HookModelError) as insecure:
        validate_model("claude-code", _model(handlers=[
            {"type": "http", "url": "http://example.test"}]))
    assert insecure.value.code == "HOOK_FIELD_INVALID"


def test_the_ledger_crud_keeps_hooks_disabled_until_enabled(tmp_path):
    database = Database(tmp_path / "data")
    database.initialize()
    records = HookRecords(database, IdempotentRecords(database))

    kind, created = records.create(
        key="a", request_digest="a", family="claude-code", name="guard-bash",
        model=_model())
    assert kind == "created" and created["enabled"] is False
    assert created["commands"] == ["/bin/guard --check"]
    hook_id = created["hook_id"]

    # An illegal edit is refused before storage; the stored model is untouched.
    from agent_box.server.errors import ServerError

    with pytest.raises(ServerError) as refused:
        records.update(hook_id=hook_id, model=_model(event="NotAnEvent"))
    assert refused.value.code == "HOOK_EVENT_UNSUPPORTED"
    assert records.get(hook_id)["model_json"] == records.get(hook_id)["model_json"]
    assert '"NotAnEvent"' not in records.get(hook_id)["model_json"]

    enabled = records.set_enabled(hook_id=hook_id, enabled=True)
    assert enabled["enabled"] is True
    assert [row["hook_id"] for row in records.enabled_for_family("claude-code")] == [hook_id]

    updated = records.update(hook_id=hook_id, model=_model(matcher="Edit"))
    assert updated["model"]["matcher"] == "Edit"

    records.set_enabled(hook_id=hook_id, enabled=False)
    assert records.enabled_for_family("claude-code") == []
    records.delete(hook_id=hook_id)
    assert records.list() == []

    # A hook with no command handler cannot be enabled: the switch would lie.
    declared_only = records.create(
        key="b", request_digest="b", family="claude-code", name="notify-only",
        model=_model(handlers=[{"type": "prompt", "prompt": "say hi"}]))[1]
    with pytest.raises(ServerError) as not_executable:
        records.set_enabled(hook_id=declared_only["hook_id"], enabled=True)
    assert not_executable.value.code == "HOOK_NOT_EXECUTABLE"
