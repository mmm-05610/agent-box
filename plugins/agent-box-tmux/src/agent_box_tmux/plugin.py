from __future__ import annotations

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration

from .contract import TmuxConsoleV1, TmuxPaneV1
from .provider import TmuxConsoleResourceProvider
from .web_selector import TmuxPaneSelector


class TmuxPlugin:
    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor(
            "tmux",
            "Agent-Box tmux console",
            "0.1.0",
            description=(
                "Versioned tmux console contracts and a ResourceProvider "
                "that materializes execution-scoped panes"
            ),
            docs_url="https://github.com/mmm-05610/agent-box/tree/main/plugins/agent-box-tmux",
        )

    def build(self, context: PluginContext) -> PluginRegistration:
        del context
        return PluginRegistration(
            contracts=(TmuxConsoleV1, TmuxPaneV1),
            resource_providers=(TmuxConsoleResourceProvider(),),
            resource_selectors=(TmuxPaneSelector(),),
        )


def create_plugin() -> TmuxPlugin:
    return TmuxPlugin()
