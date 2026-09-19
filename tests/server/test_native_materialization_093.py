"""Work Order 093 stage 2 gates for the native-config materializer.

Each family must (G1) write the endpoint/protocol into its OWN native key at the
CORRECT hierarchy, (G2) translate the canonical protocol to its first-hand
dialect and refuse what it cannot express, and never (G4) put credential content
in the output. Idempotency (G5) is asserted for the TOML renderer.
"""
from __future__ import annotations

import pytest

from agent_box_harnesses import native_materialization as nm


# -- G2: canonical -> dialect, and typed refusal -----------------------------

def test_canonical_protocols_are_the_four_092_defines():
    assert nm.CANONICAL_PROTOCOLS == (
        "openai-chat", "openai-responses", "anthropic-messages", "gemini-generate")


@pytest.mark.parametrize("harness,protocol,field,dialect", [
    ("codex", "openai-responses", "wire_api", "responses"),
    ("codex", "openai-chat", "wire_api", "chat"),
    ("pi", "openai-chat", "api", "openai-completions"),
    ("hermes", "openai-chat", "transport", "chat_completions"),
    ("opencode", "openai-chat", "npm", "@ai-sdk/openai-compatible"),
    ("kilo", "openai-chat", "npm", "@ai-sdk/openai-compatible"),
])
def test_supported_protocols_translate_to_the_first_hand_dialect(harness, protocol, field, dialect):
    assert nm.translate_protocol(harness, protocol) == (field, dialect)


@pytest.mark.parametrize("harness,protocol", [
    ("claude-code", "openai-chat"),      # claude speaks anthropic only
    ("codex", "anthropic-messages"),     # no pinned codex anthropic field
    ("pi", "openai-responses"),          # only openai-chat pinned for pi
    ("dsh", "openai-chat"),              # dsh has no independent protocol field
    ("qwen", "openai-chat"),             # qwen is env-only, no native protocol field
])
def test_unexpressible_protocol_refuses_by_name(harness, protocol):
    with pytest.raises(nm.NativeMaterializationError) as refused:
        nm.translate_protocol(harness, protocol)
    assert refused.value.code == "PROTOCOL_UNSUPPORTED_BY_HARNESS"
    assert refused.value.harness == harness and refused.value.protocol == protocol
    assert nm.is_pinnable(harness, protocol) is False


def test_non_canonical_protocol_is_refused_separately():
    with pytest.raises(nm.NativeMaterializationError) as refused:
        nm.translate_protocol("codex", "martian-wire")
    assert refused.value.code == "PROTOCOL_CANONICAL_UNKNOWN"


def test_claude_is_pinnable_for_anthropic_and_writes_the_endpoint():
    assert nm.is_pinnable("claude-code", "anthropic-messages") is True
    env = nm.render_claude_env(base_url="https://gateway.test/anthropic",
                               protocol="anthropic-messages")
    assert env == {"ANTHROPIC_BASE_URL": "https://gateway.test/anthropic"}


# -- G1: the codex keys sit inside [model_providers.<id>], not at top level --

def test_codex_endpoint_and_protocol_are_nested_under_the_provider_table():
    block = nm.render_codex_provider_section(
        provider="custom-loopback", base_url="http://127.0.0.1:8123/v1",
        protocol="openai-chat")
    header, *keys = block.strip().splitlines()
    assert header == "[model_providers.custom-loopback]"     # keys follow the header
    assert any(line.startswith("base_url =") for line in keys)
    assert any(line.startswith("wire_api = \"chat\"") for line in keys)
    # G1 counter-example: a base_url/wire_api at TOP level (before any table
    # header) is a different setting; this renderer must never emit one.
    assert not block.split("[model_providers.", 1)[0].strip(), \
        "no key may precede the [model_providers] header"


def test_codex_render_is_idempotent_and_credential_free():
    args = dict(provider="p2", base_url="https://up.test/v1", protocol="openai-responses")
    first = nm.render_codex_provider_section(**args)
    second = nm.render_codex_provider_section(**args)
    assert first == second                                   # G5 byte-stable
    assert "sk-" not in first                                 # G4 no credential content
    assert "env_key = \"CODEX_API_KEY\"" in first             # the key is a NAME only
    assert "responses" in first


def test_pi_render_carries_endpoint_and_dialect_and_only_an_api_key_reference():
    obj = nm.render_pi_provider(
        provider="deepseek", base_url="https://other.test/v1", protocol="openai-chat")
    assert obj["baseUrl"] == "https://other.test/v1"
    assert obj["api"] == "openai-completions"
    assert obj["apiKey"] == "$DEEPSEEK_API_KEY"               # reference, never a value
    assert not any(v.startswith("sk-") for v in obj.values())


def test_unpinnable_family_cannot_be_rendered_at_all():
    """Refusal is structural: dsh/qwen have no pinned native field, so any write refuses."""
    for harness in ("dsh", "qwen"):
        for protocol in nm.CANONICAL_PROTOCOLS:
            with pytest.raises(nm.NativeMaterializationError) as refused:
                nm.translate_protocol(harness, protocol)
            assert refused.value.code == "PROTOCOL_UNSUPPORTED_BY_HARNESS"
