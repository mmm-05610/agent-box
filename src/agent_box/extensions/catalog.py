"""Generic transactional catalog: identity, provenance and opaque queries only."""
from __future__ import annotations
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Mapping, Protocol, runtime_checkable
from .api import RegistryBindable
from .contribution import ContributionDescriptor, CatalogContribution

@dataclass(frozen=True)
class ExtensionContribution:
    descriptor: ContributionDescriptor
    plugin_id: str
    distribution_name: str | None = None
    distribution_version: str | None = None
    component: object = field(default=None, compare=False, repr=False)
    @property
    def kind(self): return self.descriptor.kind
    @property
    def component_id(self): return self.descriptor.component_id

@dataclass(frozen=True)
class ExtensionCatalog:
    _contributions: Mapping[tuple[str, str], ExtensionContribution]
    @classmethod
    def from_contributions(cls, values):
        return cls(MappingProxyType({(v.kind, v.component_id): v for v in values}))
    def contributions(self): return tuple(self._contributions.values())
    def query(self, kind: str, component_id: str | None = None):
        if component_id is not None:
            record = self._contributions.get((kind, component_id))
            return None if record is None else record.component
        return tuple(record.component for record in self._contributions.values() if record.kind == kind)
    def owner_of(self, kind, component_id): return self._contributions.get((kind, component_id))

class ExtensionCatalogBuilder:
    def __init__(self): self._seen = {}; self._records = []
    def prepare(self, registration: Any, *, plugin_id: str, distribution_name=None, distribution_version=None, known_contracts=frozenset()):
        local = {}; records = []
        for item in registration.contributions:
            if not isinstance(item, CatalogContribution): raise TypeError("PluginRegistration.contributions must contain CatalogContribution")
            d = item.descriptor; key = (d.kind, d.component_id)
            if key in local or key in self._seen: raise ValueError(f"duplicate contribution: {d.kind}/{d.component_id}")
            local[key] = plugin_id
            records.append(ExtensionContribution(d, plugin_id, distribution_name, distribution_version, item.component))
        return tuple(records)
    def commit(self, records):
        for record in records:
            self._seen[(record.kind, record.component_id)] = record.plugin_id; self._records.append(record)
    def build(self): return ExtensionCatalog.from_contributions(tuple(self._records))

def build_catalog_from_report(report, *, registry=None):
    builder = ExtensionCatalogBuilder()
    for record in report.ready:
        if record.registration is None: continue
        pending = builder.prepare(record.registration, plugin_id=record.descriptor.id, distribution_name=record.distribution_name, distribution_version=record.distribution_version)
        builder.commit(pending)
    return builder.build()

@runtime_checkable
class CatalogBindable(Protocol):
    def bind_catalog(self, catalog: ExtensionCatalog) -> None: ...

def activate_registry_bindings(catalog, registry):
    bound=[]
    for contribution in catalog.contributions():
        component=contribution.component
        if isinstance(component, RegistryBindable): component.bind_registry(registry); bound.append(f"{contribution.kind}:{contribution.component_id}")
    for provider in (*registry.resource_providers(), *registry.execution_providers()):
        if isinstance(provider, RegistryBindable): provider.bind_registry(registry)
    return tuple(bound)
def activate_catalog_bindings(catalog):
    bound=[]
    for contribution in catalog.contributions():
        if isinstance(contribution.component, CatalogBindable): contribution.component.bind_catalog(catalog); bound.append(f"{contribution.kind}:{contribution.component_id}")
    return tuple(bound)

__all__ = ["ExtensionContribution", "ExtensionCatalog", "ExtensionCatalogBuilder", "build_catalog_from_report", "CatalogBindable", "activate_registry_bindings", "activate_catalog_bindings"]
