from __future__ import annotations

import json

import pytest

from agent_box_harnesses.codex.contracts import CodexContinuationV1
from agent_box_harnesses.codex.remote import (
    build_remote_plan, classify_native_session_path, decode_codex_jsonl,
    materialize_remote_credential, validate_remote_configuration,
)


def test_plan_owns_bounded_fresh_and_native_resume_argv():
    configuration = {"model": "gpt-fixture", "reasoning_effort": "high"}
    fresh = build_remote_plan(configuration, "hello", None)
    assert fresh.command[:4] == ("/runtime/bin/codex", "exec", "--color", "never")
    assert fresh.command[-1] == "-"
    assert "hello" not in fresh.command
    assert fresh.stdin == b"hello"
    assert set(fresh.environment) == {"HOME", "CODEX_HOME", "PATH", "LANG"}

    resumed = build_remote_plan(
        configuration, "continue", CodexContinuationV1("thread-fixture"),
    )
    assert resumed.command[:4] == (
        "/runtime/bin/codex", "exec", "resume", "thread-fixture",
    )
    assert resumed.continuation_thread_id == "thread-fixture"


def test_deepseek_credential_becomes_isolated_config_and_catalog():
    plan = build_remote_plan({
        "model": "deepseek-flash", "provider": "deepseek",
        "reasoning_effort": "high",
    }, "hello", None)
    projection = materialize_remote_credential(plan, b"sk-fixture_value_123456\n")
    assert plan.provider == "deepseek"
    assert "--ignore-user-config" not in plan.command
    assert projection.target == "/runtime/home/config.toml"
    assert b'https://api.deepseek.com/' in projection.content
    assert b'experimental_bearer_token = "sk-fixture_value_123456"' in projection.content
    catalog = json.loads(projection.view_files["models.json"])
    assert catalog["models"][0]["slug"] == "deepseek-flash"
    assert "sk-fixture" not in repr(projection)


@pytest.mark.parametrize("value", [
    {},
    {"model": "bad model"},
    {"model": "ok", "argv": ["sh"]},
    {"model": "ok", "reasoning_effort": "unbounded"},
    {"model": "ok", "provider": "unknown"},
    {"model": "deepseek-chat", "provider": "deepseek"},
    {"model": "deepseek-v4-pro", "provider": "deepseek"},
])
def test_configuration_rejects_missing_or_injectable_fields(value):
    with pytest.raises(ValueError):
        validate_remote_configuration(value)


def test_decoder_and_path_classifier_fail_closed():
    content = b"\n".join(json.dumps(item).encode() for item in (
        {"type": "thread.started", "thread_id": "thread-fixture"},
        {"type": "item.completed", "item": {"type": "agent_message", "text": "answer"}},
        {"type": "turn.completed", "usage": {"output_tokens": 2}},
    ))
    decoded = decode_codex_jsonl(content)
    assert decoded.thread_id == "thread-fixture"
    assert decoded.messages == ("answer",)
    assert decoded.completed is True
    assert classify_native_session_path(
        "sessions/2026/09/13/rollout-thread-fixture.jsonl", "thread-fixture",
    )
    assert not classify_native_session_path("auth.json", "thread-fixture")
    assert not classify_native_session_path("history.jsonl", "thread-fixture")
    assert not classify_native_session_path(
        "sessions/2026/09/13/rollout-other.jsonl", "thread-fixture",
    )
