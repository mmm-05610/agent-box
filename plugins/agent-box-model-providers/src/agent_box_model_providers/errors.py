"""Typed failures of the model-provider authority.

Every failure carries its stable error-envelope code and HTTP status.
Messages are content-free facts: they NEVER contain credential values,
request/response bodies, or host paths.
"""
from __future__ import annotations

from typing import Any, Optional


class ProviderAuthorityError(Exception):
    """A typed, bounded provider-authority failure.

    ``http_status`` + ``code`` map 1:1 onto the Studio error envelope;
    ``extra`` carries additional bounded envelope fields (e.g. a coarse
    ``detail_class``) that never echo wire bodies or secrets.
    """

    def __init__(
        self,
        http_status: int,
        code: str,
        message: str,
        *,
        extra: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.http_status = http_status
        self.code = code
        self.extra = dict(extra or {})
