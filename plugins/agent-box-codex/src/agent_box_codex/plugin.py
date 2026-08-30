from __future__ import annotations

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration

from .contract import CodexContinuationV1
from .provider import CodexInteractiveExecutionProvider
from .tmux_provider import CodexTmuxInteractiveExecutionProvider
from .host_control import CodexTmuxHostControl


class CodexPlugin:
    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor(
            "codex",
            "Agent-Box Codex providers",
            "0.1.0",
            description=(
                "Codex ExecutionProviders: app-server automation and a "
                "visible, attachable tmux TUI window"
            ),
            docs_url="https://github.com/mmm-05610/agent-box/tree/main/plugins/agent-box-codex",
        )

    def build(self, context: PluginContext) -> PluginRegistration:
        evidence_root = context.plugin_data_dir / "evidence"
        app_server = CodexInteractiveExecutionProvider(evidence_root)
        tmux_interactive = CodexTmuxInteractiveExecutionProvider(
            evidence_root
        )
        return PluginRegistration(
            contracts=(CodexContinuationV1,),
            execution_providers=(app_server, tmux_interactive),
            host_controls=(CodexTmuxHostControl(),),
        )


def create_plugin() -> CodexPlugin:
    return CodexPlugin()
