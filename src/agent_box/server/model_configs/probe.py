"""Order 55: the bounded provider probes — pull the model list, test the wire.

Two one-shot outbound actions, both bounded and auditable:

* ``pull_models`` — GET ``{base_url}/models`` and return the parsed model ids;
* ``probe_connection`` — the same lightweight request used only for its status.

Hard boundaries (order 55 §1/§2):

* **https only**, except an explicit loopback exception (``http`` to
  ``127.0.0.1``/``localhost``/``::1``) so tests can run against a local fake;
  private-network addresses that are not loopback are refused (no SSRF);
* connection and total deadlines, a response-size cap and an entry cap;
* the credential lives only in the request header inside this call — never in
  argv, never in a log line, never in an error message (errors quote the
  status code, not the request);
* **no probe result is ever written into a record**: the caller shows the
  list, and the user decides what to save.
"""
from __future__ import annotations

import ipaddress
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

#: One-shot outbound budget.
CONNECT_TIMEOUT_SECONDS = 10.0
TOTAL_TIMEOUT_SECONDS = 30.0
MAX_RESPONSE_BYTES = 1 * 1024 * 1024
MAX_MODEL_ENTRIES = 512

#: The loopback names the https-only rule exempts for local fakes.
_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


class ProbeError(RuntimeError):
    """A typed probe refusal/failure; the message never carries the request."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


@dataclass(frozen=True)
class ProbeResult:
    status: str            # "ok" for pull, "reachable"/"unreachable" for test
    detail: str            # typed code or short human fact (no headers, no body)
    models: tuple[str, ...] = ()


def _validate_endpoint(base_url: str) -> tuple[str, str]:
    """Return (normalized base, host), refusing anything the order forbids.

    https is the rule; http is allowed only to an explicit loopback host.
    A non-loopback private address is refused: the probe is one outbound
    request to the *declared* endpoint, not a port scanner.
    """
    parsed = urlsplit(base_url if "://" in base_url else f"https://{base_url}")
    scheme = parsed.scheme.lower()
    host = (parsed.hostname or "").lower()
    if scheme not in {"https", "http"} or not host:
        raise ProbeError("PROBE_ENDPOINT_BLOCKED", "the endpoint must be an http(s) URL with a host")
    if scheme == "http" and host not in _LOOPBACK_HOSTS:
        raise ProbeError("PROBE_ENDPOINT_BLOCKED", "plain http is allowed only to a loopback host")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_loopback and (
        address.is_private or address.is_reserved or address.is_multicast
    ):
        raise ProbeError(
            "PROBE_ENDPOINT_BLOCKED",
            "private network addresses are not probeable endpoints",
        )
    base = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"
    return base, host


def _typed_http_error(error: urllib.error.HTTPError) -> ProbeError:
    if error.code in {401, 403}:
        return ProbeError("PROBE_AUTH_FAILED", "the endpoint rejected the credential")
    return ProbeError("PROBE_HTTP_ERROR", f"the endpoint answered with HTTP {error.code}")


def _open_request(request: urllib.request.Request, timeout: float):
    """The one network touch. A module-level function so tests (and only
    tests) can substitute the transport without patching the stdlib."""
    return urllib.request.urlopen(request, timeout=timeout)


def _fetch_models_response(base_url: str, api_key: str | None) -> bytes:
    url = f"{base_url}/models"
    request = urllib.request.Request(url, method="GET")
    if api_key:
        request.add_header("Authorization", f"Bearer {api_key}")
    request.add_header("Accept", "application/json")
    deadline = time.monotonic() + TOTAL_TIMEOUT_SECONDS
    try:
        with _open_request(request, CONNECT_TIMEOUT_SECONDS) as response:
            # The socket timeout bounds each read; the total deadline bounds a
            # slow-drip answer, so the probe always returns within the budget.
            chunks: list[bytes] = []
            read = 0
            while read <= MAX_RESPONSE_BYTES:
                if time.monotonic() > deadline:
                    raise ProbeError("PROBE_TIMEOUT", "the endpoint did not answer in time")
                chunk = response.read(min(65536, MAX_RESPONSE_BYTES + 1 - read))
                if not chunk:
                    break
                chunks.append(chunk)
                read += len(chunk)
            return b"".join(chunks)
    except urllib.error.HTTPError as error:
        if error.code in {401, 403}:
            raise ProbeError("PROBE_AUTH_FAILED", "the endpoint rejected the credential") from error
        raise ProbeError(
            "PROBE_HTTP_ERROR", f"the endpoint answered with HTTP {error.code}",
        ) from error
    except urllib.error.URLError as error:
        reason = getattr(error, "reason", None)
        if isinstance(reason, TimeoutError) or "timed out" in str(reason):
            raise ProbeError("PROBE_TIMEOUT", "the endpoint did not answer in time") from error
        raise ProbeError("PROBE_UNREACHABLE", "the endpoint could not be reached") from error
    except TimeoutError as error:
        raise ProbeError("PROBE_TIMEOUT", "the endpoint did not answer in time") from error


def _parse_models_payload(content: bytes) -> tuple[str, ...]:
    if len(content) > MAX_RESPONSE_BYTES:
        raise ProbeError("PROBE_RESPONSE_TOO_LARGE", "the response exceeds the size cap")
    try:
        document = json.loads(content.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as error:
        raise ProbeError("PROBE_FORMAT_INVALID", "the response is not a JSON object") from error
    if not isinstance(document, dict):
        raise ProbeError("PROBE_FORMAT_INVALID", "the response is not a JSON object")
    entries = document.get("data")
    if not isinstance(entries, list):
        raise ProbeError("PROBE_FORMAT_INVALID", 'the response carries no "data" list')
    models: list[str] = []
    for entry in entries[:MAX_MODEL_ENTRIES]:
        if isinstance(entry, dict) and isinstance(entry.get("id"), str):
            models.append(entry["id"])
    if len(entries) > MAX_MODEL_ENTRIES:
        models = models[:MAX_MODEL_ENTRIES]
    return tuple(models)


def pull_models(base_url: str, api_key: str | None) -> ProbeResult:
    """Fetch and parse the model list; bounded, one request, nothing stored."""
    base, _host = _validate_endpoint(base_url)
    content = _fetch_models_response(base, api_key)
    models = _parse_models_payload(content)
    return ProbeResult(status="ok", detail=f"{len(models)} model ids", models=models)


def probe_connection(base_url: str, api_key: str | None) -> ProbeResult:
    """A lightweight reachability check: same endpoint, status-only verdict."""
    base, _host = _validate_endpoint(base_url)
    try:
        content = _fetch_models_response(base, api_key)
    except ProbeError as error:
        if error.code == "PROBE_AUTH_FAILED":
            # Reachable but unauthorized is still "the endpoint answered".
            return ProbeResult(
                status="reachable", detail="endpoint reachable; credential rejected",
            )
        return ProbeResult(status="unreachable", detail=error.code)
    return ProbeResult(
        status="reachable" if content else "unreachable", detail="endpoint answered",
    )


__all__ = [
    "MAX_MODEL_ENTRIES",
    "MAX_RESPONSE_BYTES",
    "ProbeError",
    "ProbeResult",
    "pull_models",
    "probe_connection",
]
