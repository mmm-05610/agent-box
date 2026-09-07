"""Pure validation + normalization for the model-provider authority fields.

Standalone (stdlib only) so a thin REST layer and the durable stores
re-validate the exact same rules: violations surface as 422
VALIDATION_ERROR envelopes and the stores re-check fail-closed so no
hand-edited store file can smuggle a bad record in.
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

# Shared bounded-id shape for account ids and harness config ids.
PROVIDER_ID_PATTERN = r"^[a-z0-9][a-z0-9-]{0,63}$"
PROVIDER_ID_RE = re.compile(PROVIDER_ID_PATTERN)

HARNESS_TYPE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")

PROTOCOL_FAMILIES = (
    "openai-completions",
    "openai-responses",
    "anthropic-messages",
)

# The registry provider id of the harness config store (shared identity
# constant, lives on this leaf module to avoid import cycles).
PROVIDER_ID = "harness-model-providers"

LOCATOR_NAMESPACE = "gateway"
ACCOUNT_LOCATOR_NAMESPACE = "account"


class FieldValidationError(ValueError):
    """A bounded field violation (safe to surface as VALIDATION_ERROR)."""

    def __init__(self, field: str, reason: str) -> None:
        super().__init__(f"{field}: {reason}")
        self.field = field
        self.reason = reason


def validate_provider_id(provider_id: str) -> str:
    if not isinstance(provider_id, str) or not PROVIDER_ID_RE.fullmatch(provider_id):
        raise FieldValidationError(
            "provider_id",
            "must match ^[a-z0-9][a-z0-9-]{0,63}$",
        )
    return provider_id


def validate_config_id(config_id: str) -> str:
    """Config ids share the provider-id shape (mutable record keys)."""
    if not isinstance(config_id, str) or not PROVIDER_ID_RE.fullmatch(config_id):
        raise FieldValidationError(
            "config_id",
            "must match ^[a-z0-9][a-z0-9-]{0,63}$",
        )
    return config_id


def validate_account_id(account_id: str) -> str:
    if not isinstance(account_id, str) or not PROVIDER_ID_RE.fullmatch(account_id):
        raise FieldValidationError(
            "account_id",
            "must match ^[a-z0-9][a-z0-9-]{0,63}$",
        )
    return account_id


def validate_harness_type(harness_type: str) -> str:
    if not isinstance(harness_type, str) or not HARNESS_TYPE_RE.fullmatch(harness_type):
        raise FieldValidationError(
            "harness_type",
            "must match ^[a-z0-9][a-z0-9._-]{0,63}$",
        )
    return harness_type


def validate_protocol_family(protocol_family: str) -> str:
    if protocol_family not in PROTOCOL_FAMILIES:
        raise FieldValidationError(
            "protocol_family",
            "must be one of " + ", ".join(PROTOCOL_FAMILIES),
        )
    return protocol_family


def validate_base_url(base_url: str) -> str:
    """HTTPS anywhere, or explicit loopback HTTP only; normalized.

    Normalization: surrounding whitespace stripped, no userinfo, no query
    or fragment, trailing slash removed (a lone origin keeps its '//').
    """
    if not isinstance(base_url, str):
        raise FieldValidationError("base_url", "must be a string")
    candidate = base_url.strip()
    if not candidate:
        raise FieldValidationError("base_url", "must not be empty")
    try:
        parts = urlsplit(candidate)
    except ValueError as exc:
        raise FieldValidationError("base_url", "is not a valid URL") from exc
    if parts.scheme not in ("https", "http"):
        raise FieldValidationError("base_url", "scheme must be https or loopback http")
    if parts.scheme == "http":
        hostname = (parts.hostname or "").lower()
        loopback = hostname == "localhost" or hostname.startswith("127.")
        if not loopback:
            raise FieldValidationError(
                "base_url",
                "plain http is allowed only for 127.0.0.1* or localhost:*",
            )
    if parts.username or parts.password:
        raise FieldValidationError("base_url", "userinfo is not allowed")
    if parts.query or parts.fragment:
        raise FieldValidationError("base_url", "query and fragment are not allowed")
    if not parts.netloc:
        raise FieldValidationError("base_url", "host is required")
    normalized = candidate.rstrip("/")
    if "://" not in normalized:
        raise FieldValidationError("base_url", "is not a valid URL")
    return normalized


def locator_for(provider_id: str) -> str:
    """The credential locator of a provider: ``gateway/<provider_id>``."""
    validate_provider_id(provider_id)
    return f"{LOCATOR_NAMESPACE}/{provider_id}"


def validate_credential_locator(locator: str) -> str:
    """A config's credential locator must be exactly ``gateway/<id>``."""
    if not isinstance(locator, str) or not locator:
        raise FieldValidationError("credential_ref", "must be a non-empty locator")
    namespace, _, provider_id = locator.partition("/")
    if namespace != LOCATOR_NAMESPACE or not provider_id:
        raise FieldValidationError(
            "credential_ref", "must be of the form gateway/<id>"
        )
    validate_provider_id(provider_id)
    return locator


def account_locator_for(account_id: str) -> str:
    """The user-view account locator: ``account/<account_id>``."""
    validate_account_id(account_id)
    return f"{ACCOUNT_LOCATOR_NAMESPACE}/{account_id}"


def validate_account_locator(locator: str) -> str:
    """An optional config origin locator must be ``account/<id>`` (or empty)."""
    if locator in (None, ""):
        return ""
    if not isinstance(locator, str):
        raise FieldValidationError("provider_account_ref", "must be a locator string")
    namespace, _, account_id = locator.partition("/")
    if namespace != ACCOUNT_LOCATOR_NAMESPACE or not account_id:
        raise FieldValidationError(
            "provider_account_ref", "must be of the form account/<id>"
        )
    validate_account_id(account_id)
    return locator


def validate_projection(projection: Any) -> dict[str, str]:
    """Bounded, non-secret harness projection facts (flat str -> str)."""
    if projection in (None, {}):
        return {}
    if not isinstance(projection, dict) or len(projection) > 16:
        raise FieldValidationError("projection", "must be a bounded flat object")
    for key, value in projection.items():
        if (
            not isinstance(key, str)
            or not isinstance(value, str)
            or not 0 < len(key) <= 64
            or not len(value) <= 256
            or "\0" in key
            or "\0" in value
            or "\n" in value
        ):
            raise FieldValidationError(
                "projection", "entries must be bounded flat string facts"
            )
    return dict(projection)


def validate_model_entries(models: Any) -> list[dict[str, Any]]:
    """Bounded model catalog entries: ``{model_id, display_name?, metadata?}``."""
    if models is None:
        return []
    if not isinstance(models, list) or len(models) > 64:
        raise FieldValidationError("models", "must be a bounded list (max 64)")
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in models:
        if not isinstance(entry, dict):
            raise FieldValidationError("models", "entries must be objects")
        unknown = set(entry) - {"model_id", "display_name", "metadata"}
        if unknown:
            raise FieldValidationError(
                "models", "unknown entry fields: " + ", ".join(sorted(unknown))
            )
        model_id = entry.get("model_id")
        if not isinstance(model_id, str) or not 0 < len(model_id) <= 128:
            raise FieldValidationError("models", "model_id must be 1..128 chars")
        if model_id in seen:
            raise FieldValidationError("models", "model_id entries must be unique")
        seen.add(model_id)
        row: dict[str, Any] = {"model_id": model_id}
        display_name = entry.get("display_name")
        if display_name is not None:
            if not isinstance(display_name, str) or not 0 < len(display_name) <= 128:
                raise FieldValidationError("models", "display_name must be 1..128")
            row["display_name"] = display_name
        metadata = entry.get("metadata")
        if metadata is not None:
            if (
                not isinstance(metadata, dict)
                or len(metadata) > 16
                or any(
                    not isinstance(k, str)
                    or not isinstance(v, str)
                    or not 0 < len(k) <= 64
                    or len(v) > 256
                    for k, v in metadata.items()
                )
            ):
                raise FieldValidationError(
                    "models", "metadata must be a bounded flat string object"
                )
            row["metadata"] = dict(metadata)
        normalized.append(row)
    return normalized


def validate_endpoint_candidates(candidates: Any) -> list[str]:
    """Bounded, validated endpoint candidate list (the first one is primary)."""
    if candidates is None:
        return []
    if not isinstance(candidates, list) or len(candidates) > 8:
        raise FieldValidationError(
            "endpoint_candidates", "must be a bounded list (max 8)"
        )
    normalized = [validate_base_url(candidate) for candidate in candidates]
    if len(set(normalized)) != len(normalized):
        raise FieldValidationError("endpoint_candidates", "must be unique")
    return normalized


def validate_credential_refs(credential_refs: Any) -> list[str]:
    """Bounded credential locator list (each is a ``gateway/<id>`` locator)."""
    if credential_refs is None:
        return []
    if not isinstance(credential_refs, list) or len(credential_refs) > 8:
        raise FieldValidationError(
            "credential_refs", "must be a bounded list (max 8)"
        )
    normalized = [validate_credential_locator(ref) for ref in credential_refs]
    if len(set(normalized)) != len(normalized):
        raise FieldValidationError("credential_refs", "must be unique")
    return normalized


def validate_bounded_metadata(metadata: Any) -> dict[str, str]:
    """Bounded flat user-view metadata (never secret material)."""
    if metadata in (None, {}):
        return {}
    if not isinstance(metadata, dict) or len(metadata) > 16:
        raise FieldValidationError("metadata", "must be a bounded flat object")
    for key, value in metadata.items():
        if (
            not isinstance(key, str)
            or not isinstance(value, str)
            or not 0 < len(key) <= 64
            or len(value) > 256
        ):
            raise FieldValidationError(
                "metadata", "entries must be bounded flat string facts"
            )
    return dict(metadata)
