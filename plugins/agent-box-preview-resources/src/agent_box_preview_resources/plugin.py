from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from agent_box.work_core.providers.resources import ArtifactPromptResourceProvider

from .web_selectors import ResponsibilitySelector


class PreviewResourcesPlugin:
    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor(
            "preview-resources",
            "Agent-Box Preview resources",
            "0.1.0",
            description=(
                "Preview artifact and profile ResourceProviders"
            ),
            docs_url="https://github.com/mmm-05610/agent-box/tree/main/plugins/agent-box-preview-resources",
            config_namespace="preview-resources",
        )

    def build(self, context: PluginContext) -> PluginRegistration:
        # All providers are registered here, once. Construction stays
        # side-effect free: no directory creation or external probing.
        return PluginRegistration(
            resource_providers=(ArtifactPromptResourceProvider(),),
            resource_selectors=(ResponsibilitySelector(),),
        )


def create_plugin() -> PreviewResourcesPlugin:
    return PreviewResourcesPlugin()
