"""Plugin descriptor for the not-yet-registered WSL workspace provider."""
from __future__ import annotations

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration

from .provider import WslLiveWorkspaceProvider

PLUGIN_ID = "workspace-wsl"


class WorkspaceWslPlugin:
    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor(
            PLUGIN_ID,
            "Agent-Box WSL Live Workspace",
            "0.1.0a1",
            description="Remote WSL project identity and path mapping skeleton",
        )

    def build(self, context: PluginContext) -> PluginRegistration:
        return PluginRegistration(
            resource_providers=(
                WslLiveWorkspaceProvider(
                    context.host_operations,
                    context.plugin_data_dir / "workspace-registry.json",
                ),
            )
        )


def create_plugin() -> WorkspaceWslPlugin:
    return WorkspaceWslPlugin()
