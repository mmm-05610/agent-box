"""Compatibility alias — the implementation moved to `pacthold.service.facade` (MB-S2a).

Thin one-way re-export of the same `ProductService` class object; the
composition root imports from the new entry `pacthold.service`. No second
implementation, assembly, registration or state is permitted here.
"""
from __future__ import annotations

from pacthold.service.facade import ProductService

__all__ = ["ProductService"]
