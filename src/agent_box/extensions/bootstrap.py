"""Application bootstrap for the Core registry plus installed plugins."""
from __future__ import annotations

from .loader import PluginLoadReport, load_installed_plugins
from ..work_core.registry import ExtensionRegistry


def build_extension_registry(
    *, strict: bool = False
) -> tuple[ExtensionRegistry, PluginLoadReport]:
    registry = ExtensionRegistry()
    report = load_installed_plugins(registry, strict=strict)
    return registry, report


__all__ = ["build_extension_registry"]
