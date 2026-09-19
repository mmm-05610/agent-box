"""Work Order 093 stage 2: canonical protocol -> per-family native-config dialect.

Layer 1 froze an upstream (`{provider, model, endpoint, protocol}`); 093 makes a
harness *actually use* it by writing it into that family's native configuration
file, replacing the status quo where each `production.py`'s `OFFICIAL_BASE_URL`
is the only endpoint the family can reach.

The canonical protocol vocabulary and the dialect->canonical normalization are
**092's contract** (four values: `openai-chat` / `openai-responses` /
`anthropic-messages` / `gemini-generate`). This module does not define them - it
consumes them and maps each to the *native* dialect string that family writes,
which is first-hand from the checked-in `deploy/<family>/` templates (093 stage 1).

The one rule that makes this honest (R-0013 §4, 085's discipline): **a family
that cannot express a protocol with a first-hand-pinned native field is refused
with `PROTOCOL_UNSUPPORTED_BY_HARNESS` - never a guessed dialect value, never a
silent default.** A dialect is only emitted when a real native file key holds it.

Nothing here reads or writes credentials: the endpoint, protocol and model id are
non-secret facts; the API key stays an environment reference the projection
channel injects (R-0012 - the one-time credential projection is the only path).
"""
from __future__ import annotations

from typing import Mapping

#: The canonical protocol vocabulary (092's contract, four values).
CANONICAL_PROTOCOLS = ("openai-chat", "openai-responses", "anthropic-messages", "gemini-generate")

#: For each family, the native field a protocol is written to and the dialect
#: value that family's own file uses for that canonical protocol - each value is
#: first-hand from the checked-in template (see the citation). A family/protocol
#: pair absent here has NO pinned native field -> :func:`translate_protocol`
#: refuses it (it is not "unsupported forever", only "not pinned yet: refuse").
#:
#:   family        protocol           native field      dialect value            first-hand source
_FAMILY_DIALECTS: dict[str, dict[str, tuple[str, str]]] = {
    "codex": {
        # deploy/codex/config.toml [model_providers.deepseek] wire_api="responses";
        # wire/handlers.py accepts wireApi {chat_completions, responses}.
        "openai-responses": ("wire_api", "responses"),
        "openai-chat": ("wire_api", "chat"),
    },
    "pi": {
        # deploy/pi/models.json providers.deepseek.api = "openai-completions".
        "openai-chat": ("api", "openai-completions"),
    },
    "hermes": {
        # deploy/hermes/config.yaml providers.custom.transport = "chat_completions".
        "openai-chat": ("transport", "chat_completions"),
    },
    "opencode": {
        # deploy/opencode/opencode.json provider.deepseek.npm = "@ai-sdk/openai-compatible".
        "openai-chat": ("npm", "@ai-sdk/openai-compatible"),
    },
    "kilo": {
        # deploy/kilo/kilo.json is a fork of opencode; same @ai-sdk dialect.
        "openai-chat": ("npm", "@ai-sdk/openai-compatible"),
    },
    "claude-code": {
        # deploy/claude/settings.json env.ANTHROPIC_BASE_URL=".../anthropic": claude
        # speaks anthropic-messages only; there is NO pinned native field for a
        # chat protocol, so openai-chat/responses/gemini are refused below.
        "anthropic-messages": ("ANTHROPIC_BASE_URL", None),  # None -> no dialect token, only the endpoint
    },
    # dsh has no independent protocol field (the vendor key `llm-<vendor>` carries
    # the endpoint; there is no first-hand native *protocol* key) and qwen is
    # env-only (OPENAI_BASE_URL with no per-protocol native file). Both are pinned
    # to nothing here -> every protocol-specific write is refused, per the rule.
    "dsh": {},
    "qwen": {},
}

#: Families with a first-hand-pinned native config target path (relative to the
#: guest home) for the endpoint/protocol/limit fields (093 stage 1).
_NATIVE_TARGET = {
    "codex": "config.toml",
    "opencode": "opencode.json",
    "kilo": "kilo.json",
    "pi": "models.json",
    "hermes": "config.yaml",
    "claude-code": "settings.json",
}


class NativeMaterializationError(RuntimeError):
    """A typed refusal of one native-config write."""

    def __init__(self, code: str, message: str, *, harness: str | None = None,
                 protocol: str | None = None) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.harness = harness
        self.protocol = protocol


def is_pinnable(harness: str, protocol: str) -> bool:
    """Whether this family has a first-hand native field for this protocol."""
    return protocol in _FAMILY_DIALECTS.get(harness, {})


def translate_protocol(harness: str, protocol: str) -> tuple[str, str | None]:
    """(native field, dialect value) for one family/protocol, or typed refusal.

    Raises :class:`NativeMaterializationError` with ``PROTOCOL_UNSUPPORTED_BY_HARNESS``
    naming both the family and the protocol when the family has no pinned native
    field for it - the caller must then write nothing (no approximation).
    """
    if protocol not in CANONICAL_PROTOCOLS:
        raise NativeMaterializationError(
            "PROTOCOL_CANONICAL_UNKNOWN",
            f"{protocol!r} is not a canonical protocol", protocol=protocol)
    dialect = _FAMILY_DIALECTS.get(harness, {}).get(protocol)
    if dialect is None:
        raise NativeMaterializationError(
            "PROTOCOL_UNSUPPORTED_BY_HARNESS",
            f"{harness} has no first-hand native field for protocol {protocol!r}",
            harness=harness, protocol=protocol)
    return dialect


def render_codex_provider_section(*, provider: str, base_url: str, protocol: str,
                                  ) -> str:
    """The `[model_providers.<id>]` TOML block codex reads an endpoint from.

    Order-093 G1 point: the endpoint/protocol live *inside* the
    `[model_providers.<id>]` table, never at the top level - a key moved up one
    level is a different setting and must fail the family's gate. Idempotent: the
    same input yields byte-identical output (stable key order).
    """
    field, dialect = translate_protocol("codex", protocol)  # refuses unsupported
    lines = [
        f"[model_providers.{provider}]",
        f"name = \"{provider}\"",
        f"base_url = \"{base_url}\"",
        f"{field} = \"{dialect}\"",
        # The credential is a name the environment supplies, never a value.
        "env_key = \"CODEX_API_KEY\"",
    ]
    return "\n".join(lines) + "\n"


def render_pi_provider(*, provider: str, base_url: str, protocol: str) -> dict:
    """The `providers.<id>` object pi's models.json reads for one upstream."""
    field, dialect = translate_protocol("pi", protocol)
    return {
        "baseUrl": base_url,
        field: dialect,
        "apiKey": "$DEEPSEEK_API_KEY",  # a reference, never credential content
    }


def render_claude_env(*, base_url: str, protocol: str) -> dict:
    """claude's `env` block: anthropic-only; the endpoint carries the dialect.

    claude speaks `anthropic-messages` and nothing else here: a chat/responses/
    gemini provider is refused by :func:`translate_protocol` before this runs, so
    there is no way to write a wrong value into the file.
    """
    field, _dialect = translate_protocol("claude-code", protocol)
    return {"ANTHROPIC_BASE_URL": base_url}
