"""Provider registration without Core knowledge of individual providers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Protocol

from .errors import CapabilityUnsupported, ProviderUnavailable


@dataclass(frozen=True)
class ProviderDescriptor:
    id: str
    display_name: str
    version: str


class ExecutionProvider(Protocol):
    def descriptor(self) -> ProviderDescriptor: ...
    def capabilities(self) -> Mapping[str, str]: ...
    def start(self, request: Any) -> Any: ...
    def observe(self, native_ref: Any) -> Any: ...


class ExtensionRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, ExecutionProvider] = {}

    def register_execution_provider(self, provider: ExecutionProvider) -> None:
        descriptor = provider.descriptor()
        if not descriptor.id:
            raise ValueError("provider descriptor id is required")
        if descriptor.id in self._providers:
            raise ValueError(f"provider already registered: {descriptor.id}")
        self._providers[descriptor.id] = provider

    def get(self, provider_id: str) -> ExecutionProvider:
        try:
            return self._providers[provider_id]
        except KeyError as exc:
            raise ProviderUnavailable(f"provider unavailable: {provider_id}") from exc

    def descriptors(self) -> tuple[ProviderDescriptor, ...]:
        return tuple(self._providers[key].descriptor() for key in sorted(self._providers))

    def require_capability(self, provider_id: str, operation: str) -> ExecutionProvider:
        """Return a provider only when it declares the requested operation."""
        provider = self.get(provider_id)
        if provider.capabilities().get(operation) not in {"supported", "emulated"}:
            raise CapabilityUnsupported(f"{provider_id} does not support {operation}")
        return provider
