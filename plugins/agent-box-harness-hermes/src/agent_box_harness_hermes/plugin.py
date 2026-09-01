from agent_box.extensions import PluginDescriptor, PluginRegistration, PluginContext, ProviderHostControl, ProfileEnvelopeManager
from .profile import HermesProfileProvider, HermesProfileSelector
from .projection import HermesProjection
from .launch import HermesLaunchAdapter
from .provider import HermesExecutionProvider
from .contracts import HermesContinuationV1

def create_plugin(): return HermesPlugin()
class HermesPlugin:
    def descriptor(self): return PluginDescriptor("hermes", "Hermes Harness", "0.1.0", description="Hermes native config/home projection")
    def build(self, context: PluginContext):
        profiles=HermesProfileProvider(context.plugin_data_dir/"profiles"); projection=HermesProjection(context.plugin_data_dir/"projections",profiles); adapter=HermesLaunchAdapter(projection)
        execution=HermesExecutionProvider(context.plugin_data_dir/"evidence",launch_adapter=adapter)
        manager=HermesManager(profiles)
        return PluginRegistration(contracts=(HermesContinuationV1,),resource_providers=(profiles,),execution_providers=(execution,),resource_selectors=(HermesProfileSelector(profiles),),host_controls=(ProviderHostControl(execution.provider_id, execution),),harness_managers=(ProfileEnvelopeManager(manager, harness_type="hermes", provider_id=profiles.provider_id),))
class HermesManager:
    harness_id="hermes"
    def __init__(self,provider): self.provider=provider
    def descriptor(self): return {"id":"hermes","display_name":"Hermes","version":"0.19.0","status":"ready","supported":True}
    def list_profiles(self): return self.provider.list_profiles()
    def get_profile(self,pid,revision=None): return self.provider.get(pid,revision)
