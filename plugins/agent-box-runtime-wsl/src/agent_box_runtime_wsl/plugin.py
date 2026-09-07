"""Descriptor for the WSL RuntimeHost primitive.

The plugin is intentionally not enabled by the root distribution yet; the
HostBridge and C1 receipt integration must land before production discovery.
"""
from __future__ import annotations

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration

from .provider import WslRuntimeProvider


PLUGIN_ID = "runtime-wsl"


class RuntimeWslPlugin:
    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor(
            PLUGIN_ID,
            "Agent-Box WSL RuntimeHost",
            "0.1.0a1",
            description="WSL runtime identity and primitive capability skeleton",
            config_namespace="runtime-wsl",
        )

    def build(self, context: PluginContext) -> PluginRegistration:
        return PluginRegistration(
            resource_providers=(WslRuntimeProvider(context.host_operations),)
        )


def create_plugin() -> RuntimeWslPlugin:
    return RuntimeWslPlugin()
