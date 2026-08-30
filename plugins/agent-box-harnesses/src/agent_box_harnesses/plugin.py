from agent_box.extensions import PluginContext,PluginDescriptor,PluginRegistration
from agent_box_codex.plugin import CodexPlugin
from .codex.manager import CodexHarnessManager,CodexProfileSelector
from .codex.launch import CodexLaunchAdapter
from .codex.control import CodexAppServerHostControl
def create_plugin(): return HarnessesPlugin()
class HarnessesPlugin:
    def descriptor(self): return PluginDescriptor("harnesses","Agent-Box Harnesses","0.1.0",description="Official Harness integrations; Codex is supported.",config_namespace="harnesses")
    def build(self,context):
        manager=CodexHarnessManager(context.plugin_data_dir)
        legacy=CodexPlugin().build(context)
        provider=legacy.execution_providers[0]
        provider._launch_adapter=CodexLaunchAdapter(manager.provider.projection)
        # Codex App Server is the single canonical ExecutionProvider. The
        # compatibility package still contains the tmux/native control code,
        # but it is deliberately not registered as a second formal Codex
        # provider in this vertical.
        return PluginRegistration(contracts=legacy.contracts,resource_providers=(manager.provider,),execution_providers=(provider,),host_controls=(CodexAppServerHostControl(provider),),harness_managers=(manager,),resource_selectors=(CodexProfileSelector(manager),))
