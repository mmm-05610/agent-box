"""Typed Host protocol pack; the Extension Kernel treats these as opaque."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Mapping, Protocol, runtime_checkable
from agent_box.work_core.models import Ref
from agent_box.work_core.resource_observations import ResourceObservation
from agent_box.extensions.contribution import ContributionDescriptor, CatalogContribution

RESOURCE_SELECTOR_KIND = "agent-box.host.resource-selector@1"
FINALIZATION_CONTRIBUTOR_KIND = "agent-box.host.finalization-contributor@1"
HOST_CONTROL_KIND = "agent-box.host.control@1"
CONTINUATION_ROUTE_KIND = "agent-box.host.continuation-route@1"
RESOURCE_LIBRARY_KIND = "agent-box.host.resource-library@1"

@dataclass(frozen=True)
class ResourceSelection:
    contract_id: str
    ref: Ref
    requested_summary: str = ""
    exact_summary: str = ""

@dataclass(frozen=True)
class SelectorField:
    key: str; label: str; kind: str = "text"; default: str = ""; required: bool = True; help: str = ""

@dataclass(frozen=True)
class SelectorCompatibility:
    execution_provider_ids: frozenset[str] = frozenset()
    contract_ids: frozenset[str] = frozenset()
    capability_ids: frozenset[str] = frozenset()
    supports_multi_slot: bool = False
    supports_exact_revision: bool = False
    requires_external_config: bool = False
    available_without_web: bool = True
    recommended: bool = False

@runtime_checkable
class ResourceSelector(Protocol):
    id: str; contract_id: str; title: str; fields: tuple[SelectorField, ...]
    def prepare(self, parameters: Mapping[str, str], *, execution_id: str) -> ResourceSelection: ...

@dataclass(frozen=True)
class FinalizationContribution:
    output_refs: tuple[Ref, ...] = ()
    resource_observations: tuple[ResourceObservation, ...] = ()

@runtime_checkable
class FinalizationContributor(Protocol):
    id: str; supported_contract_ids: frozenset[str]
    def prepare_finalization(self, *, execution_id: str, dispatch_id: str | None, frozen_input_ref: Ref, resolved_resource: object | None, contract_id: str | None = None) -> FinalizationContribution: ...

@runtime_checkable
class HostControl(Protocol):
    provider_id: str
    def attach_command(self, facts: object) -> tuple[str, ...] | None: ...
    def observe(self, facts: object, handle: object | None = None) -> object: ...
    def finish(self, facts: object, handle: object | None = None) -> object: ...

@dataclass(frozen=True)
class ContinuationRouteDescriptor:
    id: str; source_native_providers: frozenset[str]; target_execution_providers: frozenset[str]
    contract_id: str; resource_provider_id: str; selector_id: str; continuation_kind: str; compatibility: str

@runtime_checkable
class ContinuationRoute(Protocol):
    def descriptor(self) -> ContinuationRouteDescriptor: ...
    def supports(self, source_execution: object, native_ref: Ref, target_provider_id: str) -> bool: ...
    def prepare(self, source_execution: object, native_ref: Ref, target_provider_id: str) -> ResourceSelection: ...

@dataclass(frozen=True)
class ResourceLibraryDescriptor:
    id: str; contract_id: str; title: str; capabilities: frozenset[str] = frozenset()

@runtime_checkable
class ResourceLibrary(Protocol):
    def descriptor(self) -> ResourceLibraryDescriptor: ...
    def list_resources(self) -> tuple[object, ...]: ...
    def get_resource(self, ref: object) -> object: ...
    def create_revision(self, *args, **kwargs) -> object: ...
    def disable(self, *args, **kwargs) -> object: ...

def _wrap(kind, component, component_id):
    if not isinstance(component_id, str) or not component_id: raise TypeError("typed contribution requires an id")
    return CatalogContribution(ContributionDescriptor(kind, component_id), component)

def resource_selector(component):
    if not isinstance(component, ResourceSelector): raise TypeError("component is not a ResourceSelector")
    return _wrap(RESOURCE_SELECTOR_KIND, component, component.id)
def finalization_contributor(component):
    if not isinstance(component, FinalizationContributor): raise TypeError("component is not a FinalizationContributor")
    return _wrap(FINALIZATION_CONTRIBUTOR_KIND, component, component.id)
def host_control(component):
    if not isinstance(component, HostControl): raise TypeError("component is not a HostControl")
    return _wrap(HOST_CONTROL_KIND, component, component.provider_id)
def resource_library(component):
    if not isinstance(component, ResourceLibrary): raise TypeError("component is not a ResourceLibrary")
    descriptor = component.descriptor() if hasattr(component, "descriptor") and isinstance(component.descriptor(), ResourceLibraryDescriptor) else component.library_descriptor()
    if not isinstance(descriptor, ResourceLibraryDescriptor): raise TypeError("resource library descriptor is invalid")
    return _wrap(RESOURCE_LIBRARY_KIND, component, descriptor.id)

__all__ = ["ResourceSelection", "SelectorField", "SelectorCompatibility", "ResourceSelector", "FinalizationContribution", "FinalizationContributor", "HostControl", "ContinuationRouteDescriptor", "ContinuationRoute", "ResourceLibraryDescriptor", "ResourceLibrary", "resource_selector", "finalization_contributor", "host_control", "resource_library"]
