"""Versioned, secret-safe profile normalization for the Harness plugin."""
from __future__ import annotations

from typing import Any

PROFILE_FIELDS = (
    "model", "model_provider", "provider_endpoint", "instructions",
    "mcp", "skills", "native_plugins", "hooks", "permissions",
    "approval_policy", "sandbox_policy", "environment",
)
_SECRET_WORDS = ("secret", "token", "api_key", "apikey", "password", "private_key", "authorization", "cookie", "auth_json")


def _looks_secret(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    return any(word in normalized for word in _SECRET_WORDS)


def validate_public_value(value: Any, path: str = "profile") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str) or len(key) > 80:
                raise ValueError("PROFILE_FIELD_INVALID")
            if _looks_secret(key):
                raise ValueError("SECRET_FIELD_FORBIDDEN")
            validate_public_value(child, f"{path}.{key}")
    elif isinstance(value, list):
        if len(value) > 128:
            raise ValueError("FIELD_LIMIT_EXCEEDED")
        for child in value:
            validate_public_value(child, path)
    elif isinstance(value, str) and len(value) > 8192:
        raise ValueError("FIELD_TOO_LARGE")


def redact_secret_fields(value: Any, path: str = "profile") -> tuple[Any, tuple[str, ...]]:
    """Return a safe copy and paths removed from an external config preview."""
    rejected: list[str] = []
    if isinstance(value, dict):
        safe = {}
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if _looks_secret(str(key)) or str(key).lower() in {"env", "headers", "auth", "credentials"}:
                rejected.append(child_path)
                continue
            clean, child_rejected = redact_secret_fields(child, child_path)
            safe[key] = clean; rejected.extend(child_rejected)
        return safe, tuple(rejected)
    if isinstance(value, list):
        safe_list = []
        for index, child in enumerate(value):
            clean, child_rejected = redact_secret_fields(child, f"{path}[{index}]")
            safe_list.append(clean); rejected.extend(child_rejected)
        return safe_list, tuple(rejected)
    return value, ()


def normalize_profile(data: dict[str, Any]) -> dict[str, Any]:
    """Convert UI/import input into the stable v1 public profile shape.

    ``config`` remains accepted as a compatibility input, but the named fields
    are the canonical schema and are also exposed in the stored revision.
    """
    config = data.get("config") if isinstance(data.get("config"), dict) else {}
    normalized = {key: data[key] for key in PROFILE_FIELDS if key in data}
    for key in PROFILE_FIELDS:
        if key not in normalized and key in config:
            normalized[key] = config[key]
    normalized.setdefault("environment", {})
    normalized.setdefault("mcp", [])
    normalized.setdefault("skills", [])
    normalized.setdefault("native_plugins", [])
    normalized.setdefault("hooks", {})
    normalized.setdefault("permissions", {})
    normalized.setdefault("approval_policy", normalized.get("approval_policy", "on-request"))
    normalized.setdefault("sandbox_policy", normalized.get("sandbox_policy", "workspace-write"))
    validate_public_value(normalized)
    return normalized
