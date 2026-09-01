from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from agent_box.protocols.host import resource_selector

from .provider import ArtifactPromptResourceProvider
from .selector import ResponsibilitySelector


class ArtifactsPlugin:
    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor(
            "artifacts", "Agent-Box Artifacts", "0.1.0",
            description="Immutable local text artifact provider",
            config_namespace="artifacts",
        )

    def build(self, context: PluginContext) -> PluginRegistration:
        del context
        return PluginRegistration(
            resource_providers=(ArtifactPromptResourceProvider(),),
            contributions=(resource_selector(ResponsibilitySelector()),),
        )


def create_plugin() -> ArtifactsPlugin:
    return ArtifactsPlugin()
