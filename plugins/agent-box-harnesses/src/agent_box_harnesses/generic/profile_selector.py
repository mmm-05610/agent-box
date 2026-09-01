from agent_box.extensions import ResourceSelection, SelectorCompatibility, SelectorField
from agent_box.resource_contracts import AgentBoxProfileV1
class GenericProfileSelector:
    contract_id=AgentBoxProfileV1.contract_id; fields=(SelectorField("profile_id","Profile",kind="select"),); recommended=True
    def __init__(self, store, definition):
        self.store=store; self.definition=definition; self.id=f"{definition.harness_type}-profile-selector"; self.title=f"{definition.display_name} profile"
        self.compatibility=SelectorCompatibility(execution_provider_ids=frozenset({f"{definition.harness_type}-execution"}),harness_types=frozenset({definition.harness_type}),supports_exact_revision=True,recommended=True)
    def prepare(self,parameters,*,execution_id):
        del execution_id
        pid=str(parameters.get("profile_id", "")); value=self.store.get(self.definition.harness_type,pid); ref=self.store.ref(self.definition.harness_type,pid,value["revision"])
        return ResourceSelection(self.contract_id,ref,pid,value["digest"])
