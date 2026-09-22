"""Compatibility alias — the implementation moved to `agent_box.service.facade` (MB-S2a).

Thin one-way re-export of the same `ProductService` class object; the
composition root imports from the new entry `agent_box.service`. No second
implementation, assembly, registration or state is permitted here.
"""
from __future__ import annotations

from agent_box.service.facade import ProductService

__all__ = ["ProductService"]
