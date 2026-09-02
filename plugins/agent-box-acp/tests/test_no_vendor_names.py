"""Vendor-boundary scan: the generic ACP engine must stay Harness-free.

The engine source (and the built wheel) may not contain vendor product
names, Harness method switches, executable paths or environment variables.
This test is the lock; if it fails, the engine has absorbed a Harness
identity and must shed it.
"""
from __future__ import annotations

import re
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "src" / "agent_box_acp"

VENDOR_TOKENS = re.compile(
    r"\b(codex|claude|opencode|hermes|agent_box_harnesses|gemini|qwen|grok|"
    r"cursor|kimi|deepseek|codebuddy|openclaw|antigravity|qoder)\b",
    re.IGNORECASE,
)

FORBIDDEN_PATTERNS = (
    re.compile(r"\bif\s+.*\b(harness|agent_type)\s*==\s*[\"']"),
    re.compile(r"\b(harness|agent_type)\s*==\s*[\"'](codex|claude|opencode|hermes|pi)[\"']"),
)


def test_engine_source_has_no_vendor_names():
    hits = []
    for path in sorted(PACKAGE.rglob("*.py")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if VENDOR_TOKENS.search(line):
                hits.append(f"{path.name}:{number}: {line.strip()[:100]}")
    assert not hits, "vendor tokens leaked into the generic ACP engine:\n" + "\n".join(hits[:20])


def test_engine_source_has_no_harness_switches():
    hits = []
    allowed = 0
    for path in sorted(PACKAGE.rglob("*.py")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if "test_no_vendor" in path.name:
                allowed += 1
                continue
            for pattern in FORBIDDEN_PATTERNS:
                if pattern.search(line):
                    hits.append(f"{path.name}:{number}: {line.strip()[:100]}")
    assert not hits, "harness switches leaked into the generic ACP engine:\n" + "\n".join(hits[:20])


def test_engine_declares_no_harness_method_names():
    """The engine must not name any vendor-specific protocol method."""
    forbidden_methods = (
        "thread/goal", "thread/fork", "item/commandExecution",
        "_session/goal", "grok/", "kimi/", "cursor/",
    )
    hits = []
    for path in sorted(PACKAGE.rglob("*.py")):
        text = path.read_text(encoding="utf-8")
        for method in forbidden_methods:
            if method in text:
                hits.append(f"{path.name}: {method}")
    assert not hits, "vendor method names leaked into the engine:\n" + "\n".join(hits)


def test_engine_has_no_vendor_environment_variable_names():
    forbidden_env = ("CODEX", "CLAUDE", "OPENCODE_", "HERMES", "PI_", "OPENAI", "ANTHROPIC")
    hits = []
    for path in sorted(PACKAGE.rglob("*.py")):
        text = path.read_text(encoding="utf-8")
        for token in forbidden_env:
            if token in text:
                hits.append(f"{path.name}: {token}")
    assert not hits, "vendor env names leaked into the engine:\n" + "\n".join(hits[:20])