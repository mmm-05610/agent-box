"""agent-box-pi plugin: Pi / DeepSeek ExecutionProvider for parallel research."""
from __future__ import annotations

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration

from .contract import PiContinuationV1
from .provider import PiTmuxInteractiveExecutionProvider
from .resources import PiSessionResourceProvider


class PiPlugin:
    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor(
            "pi",
            "Agent-Box Pi providers (DeepSeek)",
            "0.1.0",
            description=(
                "Pi (DeepSeek) ExecutionProvider running in a tmux pane, "
                "with native session continuation as a frozen INPUT"
            ),
            docs_url="https://github.com/mmm-05610/agent-box/tree/main/plugins/agent-box-pi",
            config_namespace="pi",
        )

    def build(self, context: PluginContext) -> PluginRegistration:
        # Pi long-term configuration (binary, model, thinking, roots) is owned
        # by the plugin and read lazily at first use; discovery never fails
        # because of a missing or drifting config.
        del context
        return PluginRegistration(
            contracts=(PiContinuationV1,),
            resource_providers=(PiSessionResourceProvider(),),
            execution_providers=(PiTmuxInteractiveExecutionProvider(),),
        )


def create_plugin() -> PiPlugin:
    return PiPlugin()