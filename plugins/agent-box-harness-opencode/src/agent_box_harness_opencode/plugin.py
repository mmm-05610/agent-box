from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from .provider import OpenCodeExecutionProvider, OpenCodeContinuationV1
from .profiles import OpenCodeProfileProvider, OpenCodeProfileSelector, OpenCodeManager, OpenCodeContinuationResourceProvider
from agent_box.extensions import ContinuationRouteDescriptor, ProviderContinuationRoute, ProfileEnvelopeManager
from agent_box.work_core import Ref, RefType


class OpenCodePlugin:
    def descriptor(self):
        return PluginDescriptor("harness-opencode", "OpenCode Harness Projection", "0.1.0", description="Independent OpenCode P0 projection", config_namespace="harness-opencode")

    def build(self, context: PluginContext):
        profiles = OpenCodeProfileProvider(context.plugin_data_dir / "profiles")
        provider = OpenCodeExecutionProvider(context.plugin_data_dir, authority=profiles)
        route=ProviderContinuationRoute(ContinuationRouteDescriptor("opencode-native-session", frozenset({"opencode-direct"}), frozenset({"opencode-direct"}), OpenCodeContinuationV1.contract_id, "opencode-continuation", "opencode-continuation", "native-session", "OpenCode native session"), lambda ref: Ref(RefType.SESSION, "opencode-continuation", ref.native_id, metadata={"source_provider":ref.provider}))
        return PluginRegistration(contracts=(OpenCodeContinuationV1,), resource_providers=(profiles, OpenCodeContinuationResourceProvider()), resource_selectors=(OpenCodeProfileSelector(profiles),), execution_providers=(provider,), harness_managers=(ProfileEnvelopeManager(OpenCodeManager(profiles), harness_type="opencode", provider_id=profiles.provider_id),), continuation_routes=(route,))


def create_plugin():
    return OpenCodePlugin()
