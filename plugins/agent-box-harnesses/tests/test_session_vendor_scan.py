"""Boundary scans: the session package stays pure; providers stay the only
process/environment authorities; no vendor names in the ACP engine."""
from __future__ import annotations

import re
from pathlib import Path

HARNESSES = Path(__file__).resolve().parents[1] / "src" / "agent_box_harnesses"
SESSION = HARNESSES / "session"
ACP_PACKAGE = Path(__file__).resolve().parents[2] / "agent-box-acp" / "src" / "agent_box_acp"

VENDOR_TOKENS = re.compile(
    r"\b(codex|claude|opencode|hermes|gemini|qwen|grok|cursor|kimi|deepseek|"
    r"codebuddy|openclaw|antigravity|qoder)\b", re.IGNORECASE,
)
FORBIDDEN_IMPORTS = re.compile(
    r"^\s*(import|from)\s+(subprocess|os\.environ|shutil|sqlite3|socket)"
)
FORBIDDEN_CALLS = re.compile(r"\b(subprocess|Popen|os\.environ|os\.putenv|os\.setenv)")


def test_session_package_has_no_process_or_environment_authority():
    """Session drivers must not spawn, mutate env, or touch the network."""
    hits = []
    for path in sorted(SESSION.rglob("*.py")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if FORBIDDEN_IMPORTS.search(line) or FORBIDDEN_CALLS.search(line):
                hits.append(f"{path.name}:{number}: {line.strip()[:100]}")
    assert not hits, "session package acquired side-effect authority:\n" + "\n".join(hits)


def test_session_package_never_mentions_vendor_env_or_credential_files():
    # "token" itself is generic protocol vocabulary (usage tokens); vendor
    # env names and credential file names are not.
    forbidden = ("CODEX_HOME", "CLAUDE_CONFIG_DIR", "OPENCODE_", "HERMES_", "PI_",
                 "auth.json", "credentials.json", "keychain")
    hits = []
    for path in sorted(SESSION.rglob("*.py")):
        text = path.read_text(encoding="utf-8")
        for token in forbidden:
            if token in text:
                hits.append(f"{path.name}: {token}")
    assert not hits, "vendor/credential vocabulary leaked into session package:\n" + "\n".join(hits[:20])


def test_acp_engine_package_has_no_vendor_tokens():
    hits = []
    for path in sorted(ACP_PACKAGE.rglob("*.py")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if VENDOR_TOKENS.search(line):
                hits.append(f"{path.name}:{number}: {line.strip()[:100]}")
    assert not hits, "vendor tokens in agent-box-acp:\n" + "\n".join(hits[:20])


def test_engine_has_no_harness_switch_shapes():
    forbidden = (
        re.compile(r"\bif\s+(harness|agent_type)\s*==\s*[\"']"),
        re.compile(r"\b(thread/goal|_session/goal|item/commandExecution)\b"),
    )
    hits = []
    for path in sorted(ACP_PACKAGE.rglob("*.py")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if "test_" in path.name:
                continue
            for pattern in forbidden:
                if pattern.search(line):
                    hits.append(f"{path.name}:{number}: {line.strip()[:100]}")
    assert not hits, "harness switches in agent-box-acp:\n" + "\n".join(hits[:20])


def test_driver_registration_is_the_only_harness_identity_surface():
    """The generic engine class must never be registered per vendor."""
    from agent_box_harnesses.session import SESSION_DRIVERS
    from agent_box_harnesses.session.registry import ensure_session_drivers

    ensure_session_drivers()
    keys = set(SESSION_DRIVERS)
    assert ("opencode", "acp") in keys
    assert not any(mode.startswith("acp") for (harness, mode) in keys if harness == "codex")
    assert not any(mode.startswith("acp") for (harness, mode) in keys if harness == "claude-code")
    assert not any(mode.startswith("acp") for (harness, mode) in keys if harness == "hermes")
    assert not any(mode.startswith("acp") for (harness, mode) in keys if harness == "pi")


def test_opencode_probe_is_contained_outside_adapter_package():
    """The bounded subprocess probe lives in the opencode subpackage, not in
    the pure adapters package."""
    adapter_paths = list((HARNESSES / "adapters").rglob("*.py"))
    probe_words = ("subprocess", "Popen")
    hits = []
    for path in adapter_paths:
        text = path.read_text(encoding="utf-8")
        for word in probe_words:
            if word in text:
                hits.append(f"{path.name}: {word}")
    assert not hits, "process authority leaked into the pure adapters package:\n" + "\n".join(hits)