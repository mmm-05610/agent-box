"""Studio plugin shell (API v2).

The service itself is a plain application over the Extension Environment;
this registration exists so clean Preview installs discover the Studio
plugin and its version through the standard plugin surface.  It registers
no contracts or providers: Session Store and Live Workspace come from their
own plugins via the Catalog.
"""
from __future__ import annotations

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration

PLUGIN_ID = "studio"


class StudioPlugin:
    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor(
            PLUGIN_ID,
            "Agent-Box Studio service",
            "2.0.0a1",
            description="Upper-layer Session/Turn orchestration service (HTTP/WS shell)",
        )

    def build(self, context: PluginContext) -> PluginRegistration:
        return PluginRegistration()


def create_plugin():
    return StudioPlugin()
