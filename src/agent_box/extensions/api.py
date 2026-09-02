"""Small, semantic-free Extension Kernel SDK (API v2)."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import re
from typing import Protocol, runtime_checkable
from ..work_core.registry import ExecutionProvider, ExtensionRegistry, ResourceProvider

PLUGIN_API_VERSION = 2
_PLUGIN_ID = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
_DOCS_URL = re.compile(r"^https?://\S+$")

class HostControlUnavailable(RuntimeError):
    """A typed absence of an optional Host port."""

@dataclass(frozen=True)
class PluginDescriptor:
    id: str
    display_name: str
    version: str
    api_version: int = PLUGIN_API_VERSION
    description: str = ""
    docs_url: str | None = None
    config_namespace: str | None = None
    def __post_init__(self):
        if not isinstance(self.id, str) or not _PLUGIN_ID.fullmatch(self.id): raise ValueError(f"invalid plugin id: {self.id!r}")
        if not self.display_name.strip() or not self.version.strip(): raise ValueError("plugin display_name and version are required")
        if self.api_version < 1: raise ValueError("plugin api_version must be positive")
        if not isinstance(self.description, str) or len(self.description) > 512: raise ValueError("plugin description is invalid")
        if self.docs_url is not None and not _DOCS_URL.fullmatch(self.docs_url): raise ValueError("plugin docs_url must be an http(s) URL")
        if self.config_namespace is not None and (not _PLUGIN_ID.fullmatch(self.config_namespace) or len(self.config_namespace) > 64): raise ValueError("plugin config_namespace is invalid")

@dataclass(frozen=True)
class PluginContext:
    agent_box_version: str
    agent_box_home: Path
    plugin_data_dir: Path

@dataclass(frozen=True)
class PluginRegistration:
    contracts: tuple[type, ...] = ()
    resource_providers: tuple[ResourceProvider, ...] = ()
    execution_providers: tuple[ExecutionProvider, ...] = ()
    contributions: tuple[object, ...] = ()
    def __post_init__(self):
        for name in ("contracts", "resource_providers", "execution_providers", "contributions"):
            if not isinstance(getattr(self, name), tuple): raise ValueError(f"PluginRegistration.{name} must be a tuple")

class AgentBoxPlugin(Protocol):
    def descriptor(self) -> PluginDescriptor: ...
    def build(self, context: PluginContext) -> PluginRegistration: ...

@runtime_checkable
class RegistryBindable(Protocol):
    def bind_registry(self, registry: ExtensionRegistry) -> None: ...

__all__ = ["PLUGIN_API_VERSION", "AgentBoxPlugin", "PluginContext", "PluginDescriptor", "PluginRegistration", "RegistryBindable", "HostControlUnavailable"]
