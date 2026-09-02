from types import MappingProxyType
from agent_box.extensions.contribution import ContributionDescriptor, CatalogContribution
from .protocol import HostTransport, HostTransportOperation, TransportOperationDescriptor, TransportOperationHandler
class TransportOperationResolver:
    def __init__(self, contributions): self._contributions = MappingProxyType(dict(contributions))
    @classmethod
    def from_catalog(cls, catalog): return cls({r.component_id: r for r in catalog.contributions() if r.kind == "agent-box.runtime.transport-operation@1"})
    def resolve(self, operation_type): return self._contributions[operation_type]
    def operation_types(self): return tuple(sorted(self._contributions))
def transport_operation(component):
    descriptor = component.descriptor
    return CatalogContribution(ContributionDescriptor("agent-box.runtime.transport-operation@1", descriptor.operation_type), component)
__all__ = ["HostTransport", "HostTransportOperation", "TransportOperationDescriptor", "TransportOperationHandler", "TransportOperationResolver"]
