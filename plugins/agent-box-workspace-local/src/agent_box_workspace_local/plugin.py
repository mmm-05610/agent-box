"""agent-box-workspace-local: live workspace Resource Provider plugin (API v2)."""
from __future__ import annotations

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration

from .provider import (
    REGISTRY_DB_FILENAME,
    LocalLiveWorkspaceProvider,
    PROVIDER_ID,
)

PLUGIN_ID = "workspace-local"


class WorkspaceLocalPlugin:
    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor(
            PLUGIN_ID,
            "Agent-Box Local Live Workspace",
            "2.0.0a1",
            description=(
                "Live-mode workspace provider over registered real project "
                "directories: externally mutable, unfrozen, honestly marked"
            ),
        )

    def build(self, context: PluginContext) -> PluginRegistration:
        # No filesystem access at discovery/build time; the registry
        # database is opened lazily on first use.
        provider = LocalLiveWorkspaceProvider(
            context.plugin_data_dir / REGISTRY_DB_FILENAME
        )
        return PluginRegistration(resource_providers=(provider,))


def create_plugin():
    return WorkspaceLocalPlugin()
