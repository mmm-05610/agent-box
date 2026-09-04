"""Stable error envelopes, correlation ids, and defensive redaction.

Every HTTP error response carries the same envelope shape::

    {"error": {"code": ..., "message": ..., "correlation_id": ..., ...}}

with the correlation id also mirrored in the ``X-Correlation-Id`` response
header.  Before any message is put into a response body it passes through
:func:`redact_message`, which strips absolute host paths and anything that
resembles a token/authorization value.  Unexpected exceptions never reach
a client: their handler logs only the exception *type name* plus the
correlation id and returns a content-free ``INTERNAL_ERROR`` envelope —
never ``str(exc)``, tracebacks, prompts, paths, or credentials.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Mapping

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request

logger = logging.getLogger("agent_box_studio.server")

# Absolute host paths: "/home/x", '/var/lib/y', "( /etc/z" ...  Keep the
# leading boundary so relative mentions and words like "a/b" are untouched.
_ABSOLUTE_PATH_PATTERN = re.compile(r'(^|[\s"\'(=:\[])/[A-Za-z0-9._/-]+')

# Credential-shaped values: "token: abc", "authorization=Bearer x y",
# "api-key: ..." etc.  The keyword is kept; the remainder of the line is
# replaced so multi-word values ("Bearer x y") cannot survive.
_CREDENTIAL_VALUE_PATTERN = re.compile(
    r"(?i)\b((?:access[-_ ]?token|auth[-_ ]?token|api[-_ ]?key|authorization"
    r"|bearer|credential|password|secret|token)\s*[:=]\s*)[^\n]*"
)

REDACTED_PATH = "[path]"
REDACTED_VALUE = "[redacted]"

# Stable codes for statuses produced by the framework itself (unknown
# routes, bad methods, ...) rather than by application logic.
_STATUS_CODE_MAP = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_ERROR",
}


def redact_message(message: Any) -> str:
    """Defensively scrub a message before it is put into a response body."""
    if not message:
        return ""
    text = str(message)
    text = _CREDENTIAL_VALUE_PATTERN.sub(lambda m: m.group(1) + REDACTED_VALUE, text)
    text = _ABSOLUTE_PATH_PATTERN.sub(lambda m: m.group(1) + REDACTED_PATH, text)
    return text


def new_correlation_id() -> str:
    return uuid.uuid4().hex


def request_correlation_id(request: Request) -> str:
    """The request's correlation id, creating one when the middleware did
    not run (e.g. framework-level errors outside the HTTP middleware)."""
    cid = getattr(request.state, "correlation_id", None)
    if not cid:
        cid = new_correlation_id()
        request.state.correlation_id = cid
    return cid


def error_body(
    code: str,
    message: str,
    correlation_id: str,
    **extra: Any,
) -> dict[str, Any]:
    error: dict[str, Any] = {
        "code": code,
        "message": redact_message(message),
        "correlation_id": correlation_id,
    }
    for key, value in extra.items():
        if value is not None:
            error[key] = value
    return {"error": error}


def _correlation_headers(correlation_id: str) -> dict[str, str]:
    return {"X-Correlation-Id": correlation_id}


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Flatten HTTPException into the stable error envelope.

    Application errors raise ``HTTPException`` with a structured
    ``{"error": {...}}`` detail; framework errors (unknown route, bad
    method, ...) carry plain-string details and get a stable code here.
    """
    correlation_id = request_correlation_id(request)
    detail = exc.detail
    if isinstance(detail, Mapping) and isinstance(detail.get("error"), Mapping):
        error = dict(detail["error"])
        error.setdefault("code", _STATUS_CODE_MAP.get(exc.status_code, "HTTP_ERROR"))
    else:
        error = {
            "code": _STATUS_CODE_MAP.get(exc.status_code, "HTTP_ERROR"),
            "message": redact_message(detail if detail is not None else ""),
        }
    error.setdefault("message", "")
    error["message"] = redact_message(error.get("message", ""))
    error["correlation_id"] = correlation_id
    headers = dict(exc.headers or {})
    headers.setdefault("X-Correlation-Id", correlation_id)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": error},
        headers=headers,
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
):
    """Strict 422 envelope: field paths + short stable issue codes only.

    Raw Pydantic ``msg``/``ctx``/``input`` values are deliberately omitted:
    they can echo request content (including prompt text) back to the
    caller.
    """
    correlation_id = request_correlation_id(request)
    details: list[dict[str, str]] = []
    for item in exc.errors():
        loc = [part for part in item.get("loc", ()) if part != "body"]
        details.append(
            {
                "field": ".".join(str(part) for part in loc) or "<body>",
                "issue": str(item.get("type", "invalid")),
            }
        )
    return JSONResponse(
        status_code=422,
        content=error_body(
            "VALIDATION_ERROR",
            "request validation failed",
            correlation_id,
            details=details[:50],
        ),
        headers=_correlation_headers(correlation_id),
    )


async def unhandled_exception_handler(request: Request, exc: Exception):
    """Content-free 500 envelope for unexpected exceptions.

    Logs the exception *type name* and correlation id only; the response
    body never contains the exception message, traceback, host paths,
    credentials, prompts, or native session content.
    """
    correlation_id = request_correlation_id(request)
    log_unhandled_exception(request, exc)
    return JSONResponse(
        status_code=500,
        content=error_body("INTERNAL_ERROR", "internal error", correlation_id),
        headers=_correlation_headers(correlation_id),
    )


def log_unhandled_exception(request: Request, exc: Exception) -> None:
    """ERROR-level log with the exception type name and correlation id.

    ``str(exc)`` and tracebacks are intentionally not logged here: they can
    embed host paths, credentials, or prompt content.
    """
    logger.error(
        "unhandled exception exception_type=%s correlation_id=%s",
        type(exc).__name__,
        request_correlation_id(request),
    )
