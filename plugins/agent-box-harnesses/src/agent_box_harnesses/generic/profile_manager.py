from agent_box.protocols.host import ResourceLibraryDescriptor

class GenericProfileManager:
    def __init__(self,store,definition): self.store,self.definition=store,definition; self.harness_id=definition.harness_type
    def descriptor(self): return ResourceLibraryDescriptor(self.harness_id, "agent-box.profile@1", self.definition.display_name, frozenset({"list", "get", "create_revision", "disable"}))
    def list_resources(self): return tuple(self.store.list(self.harness_id))
    def get_resource(self,ref): return self.store.get(self.harness_id, ref.native_id, int(ref.metadata.get("revision", "0")))
    def list_profiles(self): return self.list_resources()
    def get_profile(self,profile_id,revision=None): return self.store.get(self.harness_id,profile_id,revision)
    def create_revision(self, data, expected_revision=None): return self.create(data)
    def disable(self, profile_id, revision): return self.update(profile_id, {"disabled": True}, revision)
    def create(self,data): return self.store.put(self.harness_id,data)
    def update(self,profile_id,data,expected_revision): return self.store.put(self.harness_id,{**data,"profile_id":profile_id},expected_revision)
    def disable(self,profile_id,revision): return self.update(profile_id,{"disabled":True},revision)
