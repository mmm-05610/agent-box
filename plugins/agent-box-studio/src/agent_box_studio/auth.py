"""REST bearer-token auth and short-lived single-use WS tickets.

Decisions locked by tests:

- every ``/api/v1`` route except ``GET /api/v1/health`` requires the bearer
  token — loopback included;
- token comparison is constant-time (``secrets.compare_digest``);
- browsers cannot set WS headers, so WS connects use a short-lived,
  single-use ticket minted over an authenticated REST call; the long-lived
  token never appears in a URL or access log;
- tokens/tickets are never written to logs or error responses.
"""
from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass

from .config import WS_TICKET_TTL_SECONDS


def generate_token() -> str:
    return secrets.token_urlsafe(32)


class TokenGuard:
    """Constant-time bearer token verification."""

    def __init__(self, token: str) -> None:
        if not token or len(token) < 16:
            raise ValueError("studio auth token must be at least 16 characters")
        self._token = token

    def check(self, supplied: str | None) -> bool:
        if not supplied:
            return False
        return secrets.compare_digest(supplied, self._token)

    def check_bearer(self, authorization: str | None) -> bool:
        if not authorization:
            return False
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() != "bearer":
            return False
        return self.check(value.strip())


@dataclass(frozen=True)
class Ticket:
    value: str
    subject: str
    expires_at: float


class TicketIssuer:
    """Short-lived, single-use WS tickets bound to an authenticated subject."""

    def __init__(self, ttl_seconds: int = WS_TICKET_TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._tickets: dict[str, Ticket] = {}

    def issue(self, subject: str) -> Ticket:
        ticket = Ticket(
            value=secrets.token_urlsafe(24),
            subject=subject,
            expires_at=time.time() + self._ttl,
        )
        with self._lock:
            self._tickets[ticket.value] = ticket
        return ticket

    def redeem(self, value: str | None) -> str | None:
        """Redeem one ticket; single use, expiry enforced."""
        if not value:
            return None
        with self._lock:
            ticket = self._tickets.pop(value, None)
        if ticket is None:
            return None
        if ticket.expires_at < time.time():
            return None
        return ticket.subject
