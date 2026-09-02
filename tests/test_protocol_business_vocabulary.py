"""Root protocol pack business-vocabulary boundary (determined repair 14).

The Root Runtime and Credentials protocol packs must never mention Harness
business identities (Codex, Claude Code, OpenCode, Hermes, Pi) or the
Profile/Skill/MCP resource concepts — they are provider-neutral by design.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROTOCOL_DIRS = (
    ROOT / "src" / "agent_box" / "protocols" / "runtime",
    ROOT / "src" / "agent_box" / "protocols" / "credentials",
)

FORBIDDEN = re.compile(
    r"\b(codex|claude|claude-code|opencode|hermes|skill|skills|mcp|profile|profiles)\b|\bpi\b",
    re.IGNORECASE,
)


def test_runtime_and_credential_protocol_packs_are_business_vocabulary_free():
    violations = []
    for directory in PROTOCOL_DIRS:
        assert directory.exists(), directory
        for path in sorted(directory.rglob("*.py")):
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                if FORBIDDEN.search(line):
                    violations.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()[:120]}")
    assert violations == []


def test_work_core_error_and_registry_surfaces_stay_provider_neutral():
    """Work Core is out of this round's modification scope, but its public
    provider-facing registry module must not gain harness vocabulary."""
    path = ROOT / "src" / "agent_box" / "work_core" / "registry.py"
    text = path.read_text(encoding="utf-8")
    assert not FORBIDDEN.search(text)
