"""Order 51 B: the neutral usage fact and its registered parsers.

The rules under test are the order's hard rules: a field the family reported
is copied, a field it did not report is absent, nothing is estimated, nothing
is substituted, and an unregistered format is a typed refusal.
"""
from __future__ import annotations

import json

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
    with pytest.raises(UsageParseError) as refusal:
        parse_usage("codex-rollout", b"{}")
    assert refusal.value.code == "USAGE_FORMAT_UNREGISTERED"


def test_the_registered_parser_is_reachable_by_name():
    fact = parse_usage("pi-acp-journal", _journal(ASSISTANT))
    assert fact is not None and fact["totalTokens"] == 18
