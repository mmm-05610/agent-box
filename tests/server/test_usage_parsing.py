"""Order 51 B: the neutral usage fact and its registered parsers.

The rules under test are the order's hard rules: a field the family reported
is copied, a field it did not report is absent, nothing is estimated, nothing
is substituted, and an unregistered format is a typed refusal.
"""
from __future__ import annotations

import json
import pathlib
import tempfile

import pytest

from agent_box.server.execution.usage import (
    UsageParseError,
    parse_pi_acp_journal,
    parse_usage,
)


def _journal(*rows: dict) -> bytes:
    return ("\n".join(json.dumps(row) for row in rows) + "\n").encode("utf-8")


ASSISTANT = {
    "id": "as-1", "parentId": "user-1", "type": "message",
    # The real journal shape (first-hand): the usage sits inside the row's
    # message object, next to role/content.
    "message": {"role": "assistant", "content": "...",
                "usage": {"input": 11, "output": 7, "cacheRead": 0, "cacheWrite": 0,
                          "reasoning": 0, "totalTokens": 18,
                          "cost": {"input": 0.00000484, "total": 0.00001408}}},
}


def test_the_pi_journal_maps_the_neutral_fields():
    fact = parse_pi_acp_journal(_journal(
        {"cwd": "/w", "id": "s", "timestamp": 1, "type": "version", "version": 1},
        ASSISTANT,
    ))
    assert fact == {
        "inputTokens": 11, "outputTokens": 7, "cacheReadTokens": 0,
        "cacheWriteTokens": 0, "reasoningTokens": 0, "totalTokens": 18,
    }
    # The cost is the family's own money figure, not part of the neutral fact.
    assert "cost" not in fact


def test_the_last_usage_row_wins_and_absent_fields_stay_absent():
    partial = {**ASSISTANT, "message": {**ASSISTANT["message"],
                                        "usage": {"input": 5, "totalTokens": 5}}}
    later = {**ASSISTANT, "id": "as-2",
             "message": {**ASSISTANT["message"],
                         "usage": {"input": 20, "output": 4, "totalTokens": 24}}}
    fact = parse_pi_acp_journal(_journal(ASSISTANT, partial, later))
    assert fact == {"inputTokens": 20, "outputTokens": 4, "totalTokens": 24}
    assert "cacheReadTokens" not in fact  # never guessed, never defaulted


def test_a_journal_without_usage_yields_none():
    assert parse_pi_acp_journal(_journal(
        {"cwd": "/w", "id": "s", "timestamp": 1, "type": "version", "version": 1},
        {"id": "u", "type": "user"},
    )) is None
    assert parse_pi_acp_journal(b"") is None


def test_malformed_lines_are_skipped_not_fatal():
    content = b"not json at all\n" + _journal(ASSISTANT)
    fact = parse_pi_acp_journal(content)
    assert fact is not None and fact["totalTokens"] == 18


def test_an_unregistered_format_is_a_typed_refusal():
    # codex-rollout is registered now (order 51's per-family parsers); the
    # refusal check uses a name that no parser claims.
    with pytest.raises(UsageParseError) as refusal:
        parse_usage("made-up-format", b"{}")
    assert refusal.value.code == "USAGE_FORMAT_UNREGISTERED"


def test_the_registered_parser_is_reachable_by_name():
    fact = parse_usage("pi-acp-journal", _journal(ASSISTANT))
    assert fact is not None and fact["totalTokens"] == 18


def test_codex_rollout_copies_the_cumulative_counters():
    """First-hand shape (stage A): rollout lines carry the harness's own
    session-to-date counters — copied verbatim, not re-derived."""
    from agent_box.server.execution.usage import parse_codex_rollout

    # The real nesting (first-hand): payload.info.total_token_usage.
    content = _journal(
        {"timestamp": "2026-09-17T09:00:00Z", "type": "session_meta"},
        {"type": "event_msg", "payload": {"type": "token_count", "info": {
            "total_token_usage": {"input_tokens": 120, "output_tokens": 45,
                                  "total_tokens": 165}}}},
        {"type": "event_msg", "payload": {"type": "token_count", "info": {
            "total_token_usage": {"input_tokens": 200, "output_tokens": 90,
                                  "total_tokens": 290}}}},
    )
    fact = parse_codex_rollout(content)
    assert fact == {"inputTokens": 200, "outputTokens": 90, "totalTokens": 290}
    assert parse_codex_rollout(b'{"type": "session_meta"}\n') is None


def test_claude_projects_line_maps_the_message_usage():
    """First-hand shape (stage A): assistant rows carry message.usage with the
    Anthropic token names, including the two cache fields."""
    from agent_box.server.execution.usage import parse_claude_projects_line

    content = _journal(
        {"type": "user", "message": {"role": "user", "content": "hi"}},
        {"type": "assistant", "message": {"role": "assistant", "content": [], "usage": {
            "input_tokens": 9, "output_tokens": 3,
            "cache_creation_input_tokens": 100, "cache_read_input_tokens": 7,
        }}},
    )
    fact = parse_claude_projects_line(content)
    assert fact == {"inputTokens": 9, "outputTokens": 3,
                    "cacheReadTokens": 7, "cacheWriteTokens": 100}


def test_hermes_state_db_reads_the_newest_session_row(tmp_path):
    """First-hand shape (stage A): the hermes store carries the fullest
    breakdown in its sessions table."""
    import sqlite3

    db = tmp_path / "state.db"
    connection = sqlite3.connect(db)
    connection.execute(
        "CREATE TABLE sessions (id TEXT PRIMARY KEY, input_tokens INTEGER, "
        "output_tokens INTEGER, cache_read_tokens INTEGER, "
        "cache_write_tokens INTEGER, reasoning_tokens INTEGER)"
    )
    connection.execute(
        "INSERT INTO sessions VALUES ('older', 1, 1, 0, 0, 0)"
    )
    connection.execute(
        "INSERT INTO sessions VALUES ('newest', 300, 40, 12, 5, 9)"
    )
    connection.commit()
    connection.close()

    from agent_box.server.execution.usage import parse_hermes_state_db

    fact = parse_hermes_state_db(db.read_bytes())
    assert fact == {"inputTokens": 300, "outputTokens": 40, "cacheReadTokens": 12,
                    "cacheWriteTokens": 5, "reasoningTokens": 9}


def test_hermes_db_without_the_sessions_table_is_a_none_not_a_guess(tmp_path):
    from agent_box.server.execution.usage import parse_hermes_state_db
    import sqlite3

    db = tmp_path / "state.db"
    connection = sqlite3.connect(db)
    connection.execute("CREATE TABLE unrelated (x INTEGER)")
    connection.commit()
    connection.close()
    assert parse_hermes_state_db(db.read_bytes()) is None
    db.unlink()


def test_probe_validates_the_endpoint_before_any_network_call():
    """SSRF/Order-55 §2: only https (loopback http exempt), no private nets."""
    from agent_box.server.model_configs.probe import ProbeError, pull_models

    with pytest.raises(ProbeError) as blocked:
        pull_models("http://10.1.2.3/v1", None)
    assert blocked.value.code == "PROBE_ENDPOINT_BLOCKED"
    with pytest.raises(ProbeError) as blocked:
        pull_models("ftp://example.com", None)
    assert blocked.value.code == "PROBE_ENDPOINT_BLOCKED"
    with pytest.raises(ProbeError) as blocked:
        pull_models("https://192.168.1.9/v1", None)
    assert blocked.value.code == "PROBE_ENDPOINT_BLOCKED"


def test_pull_models_parses_a_loopback_fake(tmp_path):
    """A loopback fake endpoint answers the OpenAI shape; the parser maps ids."""
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    body = json.dumps({"data": [{"id": "model-a"}, {"id": "model-b"},
                                {"no_id": True}]}).encode()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.headers.get("Authorization") != "Bearer secret-key":
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b"denied")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        from agent_box.server.model_configs.probe import (
            ProbeError,
            pull_models,
            test_connection,
        )

        base = f"http://127.0.0.1:{server.server_port}"
        with pytest.raises(ProbeError) as denied:
            pull_models(base, "wrong-key")
        assert denied.value.code == "PROBE_AUTH_FAILED"

        result = pull_models(base, "secret-key")
        assert result.status == "ok"
        assert result.models == ("model-a", "model-b")  # the shapeless entry drops

        check = test_connection(base, "secret-key")
        assert check.status == "reachable"
    finally:
        server.shutdown()
        server.server_close()


def test_pull_models_rejects_oversized_and_shapeless_responses():
    """Bounded and honest: too-large and wrong-shaped responses are typed
    refusals, never truncated-then-trusted."""
    from agent_box.server.model_configs.probe import (
        MAX_RESPONSE_BYTES,
        ProbeError,
        pull_models,
    )

    class FakeResponse:
        def __init__(self, content):
            self._content = content

        def read(self, limit):
            return self._content[:limit]

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    content = b'{"data": ["x" * 10]}'
    oversized = content + b" " * (MAX_RESPONSE_BYTES + 1)

    import agent_box.server.model_configs.probe as probe_module

    class _FakeUrlopen:
        def __init__(self, content):
            self._content = content

        def __call__(self, request, timeout):
            return FakeResponse(self._content)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    original = probe_module._open_request
    probe_module._open_request = _FakeUrlopen(oversized)
    try:
        with pytest.raises(ProbeError) as too_large:
            pull_models("https://models.example.com/v1", "key")
        assert too_large.value.code == "PROBE_RESPONSE_TOO_LARGE"
    finally:
        probe_module._open_request = original

    probe_module._open_request = _FakeUrlopen(b'{"nope": true}')
    try:
        with pytest.raises(ProbeError) as shapeless:
            pull_models("https://models.example.com/v1", "key")
        assert shapeless.value.code == "PROBE_FORMAT_INVALID"
    finally:
        probe_module._open_request = original
