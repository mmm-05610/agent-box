from __future__ import annotations
from agent_box.extensions import PluginDescriptor, PluginRegistration
from agent_box.protocols.host import resource_selector, resource_library, host_control
from ..controls import ProviderHostControl
from agent_box.resource_contracts import AgentBoxProfileV1
from ..registry import load_builtin_registry
from ..adapters import ADAPTERS
from .profile_store import ProfileStore
from .profile_selector import GenericProfileSelector
from .profile_manager import GenericProfileManager
from .execution_provider import GenericExecutionProvider

def build_registration(context, harness_type: str | None = None):
    registry=load_builtin_registry(); definition=registry.get(harness_type) if harness_type else None
    # The shared provider is deliberately the only component which owns profile persistence.
    store=ProfileStore(context.agent_box_home/"profiles", validator=(lambda h,p: ADAPTERS[registry.get(h).driver].validate_native_payload(p)))
    if definition is None: return PluginRegistration(resource_providers=(store,))
    adapter=ADAPTERS.get(definition.driver)
    if adapter is None: raise ValueError("untrusted adapter key")
    provider=GenericExecutionProvider(definition,adapter); manager=GenericProfileManager(store,definition)
    return PluginRegistration(execution_providers=(provider,), contributions=(resource_selector(GenericProfileSelector(store,definition)), host_control(ProviderHostControl(provider.provider_id,provider)), resource_library(manager)))

def descriptor(harness_type=None):
    d=load_builtin_registry().get(harness_type) if harness_type else None
    return PluginDescriptor("harness-profile-store" if d is None else harness_type,d.display_name if d else "Harness Profile Store","2.0.0a1",description="Declarative official Harness registry",config_namespace="harnesses")
