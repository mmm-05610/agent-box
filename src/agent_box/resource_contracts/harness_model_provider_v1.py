"""Harness-scoped model provider configuration contract (provider-neutral).

A HarnessProviderConfig is the execution-facing, immutable, revisioned
resource derived from a user-visible ProviderAccount: exact endpoint,
protocol family, model catalog, credential locator and per-Harness native
projection facts.  It — never the account — enters the Execution Binding as
a formal Ref (``RefType.ARTIFACT``, native_id ``<config_id>/revisions/<n>``).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, ClassVar, Mapping


@dataclass(frozen=True)
class HarnessModelProviderV1:
    """Exact-revision Harness model provider configuration (locator-only)."""

    contract_id: ClassVar[str] = "agent-box.harness-model-provider@1"

    config_id: str
    harness_type: str
    revision: int
    digest: str
    protocol_family: str
    base_url: str
    # Model catalog (exact model ids) + optional display/metadata entries.
    models: tuple[Mapping[str, str], ...] = ()
    # Credential locator (never a value): "<namespace>/<id>" owned by the
    # write-only credential authority.
    credential_ref: str = ""
    # Harness-native projection facts (bounded, non-secret): e.g. the guest
    # env var the credential is delivered under, native provider id.
    projection: Mapping[str, str] = field(default_factory=dict)
    # Optional user-view account locator this config derives from.
    provider_account_ref: str = ""
    enabled: bool = True

    def __post_init__(self) -> None:
        for name, value in (
            ("config_id", self.config_id),
            ("harness_type", self.harness_type),
            ("digest", self.digest),
            ("protocol_family", self.protocol_family),
            ("base_url", self.base_url),
            ("credential_ref", self.credential_ref),
        ):
            if not isinstance(value, str) or not value or len(value) > 256 or "\0" in value:
                raise ValueError(f"invalid harness model provider {name}")
        if self.revision < 1:
            raise ValueError("harness model provider revision must be >= 1")
        if len(self.models) > 64:
            raise ValueError("too many models in harness provider config")
        if len(self.projection) > 16 or any(
            not isinstance(k, str) or not isinstance(v, str) or len(k) > 64 or len(v) > 256
            for k, v in self.projection.items()
        ):
            raise ValueError("invalid harness provider projection facts")
        if not isinstance(self.enabled, bool):
            raise ValueError("enabled must be a boolean")

    @property
    def model_ids(self) -> tuple[str, ...]:
        ids = []
        for entry in self.models:
            model_id = str(entry.get("model_id", ""))
            if model_id:
                ids.append(model_id)
        return tuple(ids)

    def has_model(self, model_id: str) -> bool:
        return model_id in self.model_ids
