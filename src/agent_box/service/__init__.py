"""Product service facade package (modular-baseline service domain entry).

The single `ProductService` implementation lives in
`agent_box.service.facade`; this package entry re-exports the same class
object for the composition root. No assembly, registration or state here.
"""
from __future__ import annotations

from agent_box.service.facade import ProductService

__all__ = ["ProductService"]
