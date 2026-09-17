"""Order 51: parse a family's native journal into the neutral usage fact.

The mapping is deliberately boring: every parser turns one family's own
vocabulary into the same optional fields, and a field the family did not
report simply stays absent - never guessed, never substituted by a character
count, never carried over from another family. The parsers are registered by
the deployment's `usageProbe.format`; an unregistered format is a typed
refusal, not a silent fallback.
"""
from __future__ import annotations

import json
from typing import Any


class UsageParseError(ValueError):
    """A typed failure: the declared source could not be parsed as declared."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


#: The neutral fields and the family vocabulary each comes from. A family's
#: parser only copies what is present; the neutral fact never invents a zero.
def _neutral(
    *, input_tokens: int | None = None, output_tokens: int | None = None,
    cache_read_tokens: int | None = None, cache_write_tokens: int | None = None,
    reasoning_tokens: int | None = None, total_tokens: int | None = None,
) -> dict[str, int]:
    fact: dict[str, int] = {}
    for key, value in (
        ("inputTokens", input_tokens),
        ("outputTokens", output_tokens),
        ("cacheReadTokens", cache_read_tokens),
        ("cacheWriteTokens", cache_write_tokens),
        ("reasoningTokens", reasoning_tokens),
        ("totalTokens", total_tokens),
    ):
        if isinstance(value, int) and not isinstance(value, bool):
            fact[key] = value
    return fact


def parse_pi_acp_journal(content: bytes) -> dict[str, Any] | None:
    """The pi-acp session journal: one JSON object per line.

    Assistant rows carry ``usage`` with ``input``/``output``/``cacheRead``/
    ``cacheWrite``/``reasoning``/``totalTokens`` exactly as the harness's
    provider reported them for that turn. The parser returns the *last*
    usage row's neutral fact (the harness's own latest numbers), or None
    when the journal carries none.
    """
    fact: dict[str, int] | None = None
    for line in content.decode("utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except ValueError:
            continue  # not every line is a JSON object; skip silently
        if not isinstance(row, dict):
            continue
        usage = row.get("usage")
        if not isinstance(usage, dict) and isinstance(row.get("message"), dict):
            # The assistant row carries the turn's usage inside its message.
            usage = row["message"].get("usage")
        if not isinstance(usage, dict):
            continue
        candidate = _neutral(
            input_tokens=usage.get("input"),
            output_tokens=usage.get("output"),
            cache_read_tokens=usage.get("cacheRead"),
            cache_write_tokens=usage.get("cacheWrite"),
            reasoning_tokens=usage.get("reasoning"),
            total_tokens=usage.get("totalTokens"),
        )
        if candidate:
            fact = candidate
    return fact


#: The registered formats. A deployment may only declare one of these names;
#: anything else is a deployment refusal.
FORMATS = {
    "pi-acp-journal": parse_pi_acp_journal,
}


def parse_usage(usage_format: str, content: bytes) -> dict[str, int] | None:
    parser = FORMATS.get(usage_format)
    if parser is None:
        raise UsageParseError(
            "USAGE_FORMAT_UNREGISTERED",
            f"no parser is registered for usage format {usage_format!r}",
        )
    return parser(content)


__all__ = ["FORMATS", "UsageParseError", "parse_pi_acp_journal", "parse_usage"]
