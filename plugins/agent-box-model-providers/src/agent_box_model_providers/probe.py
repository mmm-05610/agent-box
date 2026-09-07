"""The bounded probe runner and model discovery (P2 contract §4).

Per protocol family, ONE minimal request is issued against the provider's
``base_url`` with the credential value from the credential authority:

- ``openai-completions``: ``POST {base}/chat/completions``
  ``{"model", "messages":[{"role":"user","content":"ping"}], "max_tokens": 1}``
  with ``Authorization: Bearer <value>``;
- ``openai-responses``: ``POST {base}/responses``
  ``{"model", "input": "ping", "max_output_tokens": 16}`` (16 is the
  documented minimum) with ``Authorization: Bearer <value>``;
- ``anthropic-messages``: ``POST {base}/v1/messages``
  ``{"model", "max_tokens": 1, "messages":[{"role":"user","content":"ping"}]}``
  with ``x-api-key: <value>`` + ``anthropic-version``.

Hard 10s timeout.  Response handling is truncated by construction: the
body is read once with a bounded read, parsed only to extract the model
id, and then DISCARDED — never stored, logged, or returned.  Evidence is
exactly ``{at, outcome, model_id, latency_ms, detail_class}`` — never
prompts, never response text, never secret material, never hashes.

Outcome classification (deterministic, status-only):

- HTTP 200                      -> ``ok``
- HTTP 401 / 403                -> ``auth-rejected``
- HTTP 400 / 404 / 422          -> ``model-rejected``
- any other HTTP status         -> ``protocol-rejected``
- transport timeout             -> ``timeout``
- any other transport failure   -> ``unreachable``

Exactly one request is ever made: there is no retry path, so a
deterministic auth/model/protocol rejection stops the route.
"""
from __future__ import annotations

import json
import socket
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

from .errors import ProviderAuthorityError
from .validation import validate_base_url, validate_protocol_family

PROBE_TIMEOUT_SECONDS = 10.0
DISCOVERY_TIMEOUT_SECONDS = 10.0

# Bounded single-read cap: a gateway response larger than this is simply
# not read further; nothing beyond the first chunk is ever parsed.
_MAX_RESPONSE_BYTES = 65536

_ANTHROPIC_VERSION = "2023-06-01"

# evidence outcomes (frozen vocabulary)
OUTCOME_OK = "ok"
OUTCOME_AUTH_REJECTED = "auth-rejected"
OUTCOME_MODEL_REJECTED = "model-rejected"
OUTCOME_PROTOCOL_REJECTED = "protocol-rejected"
OUTCOME_UNREACHABLE = "unreachable"
OUTCOME_TIMEOUT = "timeout"

_OPENAI_FAMILIES = ("openai-completions", "openai-responses")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _minimal_body(protocol_family: str, model: str) -> bytes:
    if protocol_family == "openai-completions":
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
        }
    elif protocol_family == "openai-responses":
        payload = {"model": model, "input": "ping", "max_output_tokens": 16}
    elif protocol_family == "anthropic-messages":
        payload = {
            "model": model,
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "ping"}],
        }
    else:  # defensive: the store validates before calling
        raise ProviderAuthorityError(
            409, "PROBE_REJECTED", "protocol family does not support probes"
        )
    return json.dumps(payload).encode("utf-8")


def _probe_target(
    protocol_family: str, base_url: str, model: str
) -> tuple[str, str, dict[str, str], bytes]:
    """(method, url, headers, body) for one minimal probe request."""
    headers = {"Content-Type": "application/json"}
    if protocol_family == "openai-completions":
        return (
            "POST",
            f"{base_url}/chat/completions",
            headers,
            _minimal_body(protocol_family, model),
        )
    if protocol_family == "openai-responses":
        return (
            "POST",
            f"{base_url}/responses",
            headers,
            _minimal_body(protocol_family, model),
        )
    if protocol_family == "anthropic-messages":
        headers["anthropic-version"] = _ANTHROPIC_VERSION
        return (
            "POST",
            f"{base_url}/v1/messages",
            headers,
            _minimal_body(protocol_family, model),
        )
    raise ProviderAuthorityError(
        409, "PROBE_REJECTED", "protocol family does not support probes"
    )


def _classify_status(status: int) -> str:
    if status == 200:
        return OUTCOME_OK
    if status in (401, 403):
        return OUTCOME_AUTH_REJECTED
    if status in (400, 404, 422):
        return OUTCOME_MODEL_REJECTED
    return OUTCOME_PROTOCOL_REJECTED


class _TransportOutcome(Exception):
    """Internal: a transport-level probe end (no HTTP status)."""

    def __init__(self, outcome: str, detail_class: str) -> None:
        super().__init__(outcome)
        self.outcome = outcome
        self.detail_class = detail_class


def _bounded_request(
    method: str,
    url: str,
    headers: Mapping[str, str],
    body: Optional[bytes],
    timeout: float,
) -> tuple[int, bytes]:
    """One bounded HTTP request.  Returns (status, first-bytes).

    Transport failures raise :class:`_TransportOutcome` with the typed
    outcome class; the response body is bounded-read and the caller must
    discard it after extracting only bounded facts.
    """
    request = urllib.request.Request(url, data=body, headers=dict(headers), method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = int(response.status)
            raw = response.read(_MAX_RESPONSE_BYTES)
            return status, raw
    except urllib.error.HTTPError as exc:
        try:
            exc.read(_MAX_RESPONSE_BYTES)
        except Exception:
            pass
        return int(exc.code), b""
    except (socket.timeout, TimeoutError):
        raise _TransportOutcome(OUTCOME_TIMEOUT, "timeout") from None
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", None)
        if isinstance(reason, (socket.timeout, TimeoutError)):
            raise _TransportOutcome(OUTCOME_TIMEOUT, "timeout") from None
        if isinstance(getattr(exc, "reason", None), ValueError):
            raise _TransportOutcome(OUTCOME_UNREACHABLE, "invalid-url") from None
        raise _TransportOutcome(OUTCOME_UNREACHABLE, "connection-error") from None
    except ValueError:
        # e.g. non-integer port / malformed URL that slipped through
        raise _TransportOutcome(OUTCOME_UNREACHABLE, "invalid-url") from None
    except OSError:
        raise _TransportOutcome(OUTCOME_UNREACHABLE, "connection-error") from None


def _model_id_from_body(raw: bytes) -> Optional[str]:
    """Extract ONLY the model id from a response body; the body is then
    discarded.  Anything unparseable is simply no model id."""
    if not raw:
        return None
    try:
        parsed = json.loads(raw.decode("utf-8", errors="replace"))
    except ValueError:
        return None
    if not isinstance(parsed, dict):
        return None
    model = parsed.get("model")
    if isinstance(model, str) and model:
        return model[:128]
    return None


def run_probe(
    protocol_family: str,
    base_url: str,
    *,
    model: str,
    credential_value: str,
    timeout_seconds: Optional[float] = None,
) -> dict[str, Any]:
    """One bounded compatibility probe; returns the evidence record.

    ``credential_value`` goes ONLY into the auth header of the request to
    the provider's own base_url.  It never appears in the evidence, the
    error surfaces, or any log.
    """
    validate_protocol_family(protocol_family)
    validate_base_url(base_url)
    timeout = PROBE_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    method, url, headers, body = _probe_target(protocol_family, base_url, model)
    if credential_value:
        if protocol_family == "anthropic-messages":
            headers["x-api-key"] = credential_value
        else:
            headers["Authorization"] = f"Bearer {credential_value}"

    started = time.monotonic()
    try:
        status, raw = _bounded_request(method, url, headers, body, timeout)
    except _TransportOutcome as transport:
        return {
            "at": _now(),
            "outcome": transport.outcome,
            "model_id": None,
            "latency_ms": max(0, int((time.monotonic() - started) * 1000)),
            "detail_class": transport.detail_class,
        }
    latency_ms = max(0, int((time.monotonic() - started) * 1000))
    return {
        "at": _now(),
        "outcome": _classify_status(status),
        "model_id": _model_id_from_body(raw),
        "latency_ms": latency_ms,
        "detail_class": f"http-{status}",
    }
    # `raw` is deliberately never used again: the body is discarded here.


def discover_models(
    protocol_family: str,
    base_url: str,
    *,
    credential_value: Optional[str],
    timeout_seconds: Optional[float] = None,
) -> list[str]:
    """Bounded ``GET {base}/models`` listing (openai-* families only).

    ``anthropic-messages`` has no listing endpoint: a typed unsupported
    failure is raised.  Failures are typed and never echo the credential,
    the response body, or its text.
    """
    validate_protocol_family(protocol_family)
    validate_base_url(base_url)
    if protocol_family not in _OPENAI_FAMILIES:
        raise ProviderAuthorityError(
            409,
            "MODEL_DISCOVERY_UNSUPPORTED",
            "model discovery has no listing endpoint for this protocol family",
        )
    timeout = DISCOVERY_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    headers = {"Accept": "application/json"}
    if credential_value:
        headers["Authorization"] = f"Bearer {credential_value}"
    try:
        status, raw = _bounded_request(
            "GET", f"{base_url}/models", headers, None, timeout
        )
    except _TransportOutcome as transport:
        raise ProviderAuthorityError(
            409,
            "MODEL_DISCOVERY_FAILED",
            "model discovery request failed",
            extra={"detail_class": transport.detail_class},
        )
    if status != 200:
        raise ProviderAuthorityError(
            409,
            "MODEL_DISCOVERY_FAILED",
            "model discovery listing endpoint rejected the request",
            extra={"detail_class": f"http-{status}"},
        )
    try:
        parsed = json.loads(raw.decode("utf-8", errors="replace"))
    except ValueError:
        raise ProviderAuthorityError(
            409,
            "MODEL_DISCOVERY_FAILED",
            "model discovery response was not a bounded JSON listing",
            extra={"detail_class": "unparseable"},
        )
    data = parsed.get("data") if isinstance(parsed, dict) else None
    if not isinstance(data, list):
        raise ProviderAuthorityError(
            409,
            "MODEL_DISCOVERY_FAILED",
            "model discovery response was not a bounded JSON listing",
            extra={"detail_class": "unparseable"},
        )
    discovered: list[str] = []
    for entry in data[:256]:
        if not isinstance(entry, dict):
            continue
        model_id = entry.get("id")
        if isinstance(model_id, str) and 0 < len(model_id) <= 128:
            discovered.append(model_id)
    return discovered
