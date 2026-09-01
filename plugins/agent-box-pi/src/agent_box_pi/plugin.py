from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration, ProviderHostControl, ContinuationRouteDescriptor, ProviderContinuationRoute, ProfileEnvelopeManager
from agent_box.work_core import Ref, RefType
from .contract import PiContinuationV1
from .config import PiProfile
from .provider import PiExecutionProvider
from .resources import PiSessionResourceProvider, PiProfileProvider, PiProfileSelector, PiManager

class PiPlugin:
    def descriptor(self):
        return PluginDescriptor("pi", "Agent-Box Pi Harness", "0.2.0",
            description="Third-party Pi/DeepSeek command producer using Runtime Composition",
            docs_url="https://github.com/mmm-05610/agent-box/tree/main/plugins/agent-box-pi", config_namespace="pi")
    def build(self, context: PluginContext):
        profiles=PiProfileProvider(context.plugin_data_dir / "profiles")
        execution=PiExecutionProvider()
        route=ProviderContinuationRoute(ContinuationRouteDescriptor("pi-native-session", frozenset({"pi"}), frozenset({"pi"}), PiContinuationV1.contract_id, "pi-session", "pi-continuation", "native-session", "Pi native session"), lambda ref: Ref(RefType.SESSION, "pi-session", ref.native_id, metadata={"source_provider":ref.provider}))
        return PluginRegistration(contracts=(PiContinuationV1,), resource_providers=(PiSessionResourceProvider(), profiles), execution_providers=(execution,), resource_selectors=(PiProfileSelector(profiles),), host_controls=(ProviderHostControl(execution.provider_id, execution),), harness_managers=(ProfileEnvelopeManager(PiManager(profiles), harness_type="pi", provider_id=profiles.provider_id),), continuation_routes=(route,))

def create_plugin(): return PiPlugin()
