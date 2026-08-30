from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from .codex.contracts import CodexContinuationV1
from .codex.manager import CodexHarnessManager, CodexProfileSelector
from .codex.launch import CodexLaunchAdapter
from .codex.control import CodexAppServerHostControl
from .codex.app_server.provider import CodexInteractiveExecutionProvider
from .codex.tmux.provider import CodexTmuxInteractiveExecutionProvider
from .codex.tmux.control import CodexTmuxHostControl
from .codex.continuation import CodexContinuationResourceProvider


def create_plugin():
    return HarnessesPlugin()


class HarnessesPlugin:
    def descriptor(self):
        return PluginDescriptor(
            "harnesses", "Agent-Box Harnesses", "0.1.0",
            description="Official Harness integrations; Codex is supported.",
            config_namespace="harnesses",
        )

    def build(self, context: PluginContext):
        manager = CodexHarnessManager(context.plugin_data_dir)
        adapter = CodexLaunchAdapter(manager.provider.projection)
        evidence_root = context.plugin_data_dir / "evidence"
        app_server = CodexInteractiveExecutionProvider(
            evidence_root, launch_adapter=adapter
        )
        tmux_interactive = CodexTmuxInteractiveExecutionProvider(
            evidence_root, launch_adapter=adapter
        )
        return PluginRegistration(
            contracts=(CodexContinuationV1,),
            resource_providers=(manager.provider, CodexContinuationResourceProvider()),
            execution_providers=(app_server, tmux_interactive),
            host_controls=(
                CodexAppServerHostControl(app_server),
                CodexTmuxHostControl(),
            ),
            harness_managers=(manager,),
            resource_selectors=(CodexProfileSelector(manager),),
        )
