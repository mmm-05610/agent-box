from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration, ProviderHostControl, ResourceSelection, SelectorField, SelectorCompatibility
from .contracts import ClaudeContinuationV1
from .profile import ClaudeProfileProvider, ClaudeProjection, ClaudeContinuationResourceProvider
from agent_box.extensions import ContinuationRouteDescriptor, ProviderContinuationRoute, ProfileEnvelopeManager
from agent_box.work_core import Ref, RefType
from .launch import ClaudeLaunchAdapter
from .provider import ClaudeCodeExecutionProvider

def create_plugin(): return ClaudeCodePlugin()

class ClaudeCodePlugin:
    def descriptor(self):
        return PluginDescriptor("claude-code", "Claude Code Harness", "0.1.0", description="Official Claude Code projection", config_namespace="claude_code")
    def build(self, context: PluginContext):
        profiles=ClaudeProfileProvider(context.plugin_data_dir)
        projection=ClaudeProjection(context.plugin_data_dir / "projections", profiles)
        launch=ClaudeLaunchAdapter(projection)
        execution=ClaudeCodeExecutionProvider(context.plugin_data_dir / "evidence", launch_adapter=launch)
        route=ProviderContinuationRoute(ContinuationRouteDescriptor("claude-native-session", frozenset({"claude-code-execution"}), frozenset({"claude-code-execution"}), ClaudeContinuationV1.contract_id, "claude-code-continuation", "claude-continuation", "native-session", "Claude project-keyed native session"), lambda ref: Ref(RefType.SESSION, "claude-code-continuation", ref.native_id, metadata={"source_provider":ref.provider}))
        return PluginRegistration(contracts=(ClaudeContinuationV1,), resource_providers=(profiles, ClaudeContinuationResourceProvider()), execution_providers=(execution,), resource_selectors=(ClaudeProfileSelector(profiles),), host_controls=(ProviderHostControl(execution.provider_id, execution),), harness_managers=(ProfileEnvelopeManager(ClaudeManager(profiles), harness_type="claude-code", provider_id=profiles.provider_id),), continuation_routes=(route,))

class ClaudeProfileSelector:
    id="claude-code-profile-selector"; contract_id="agent-box.profile@1"; title="Claude Code profile"; fields=(SelectorField("profile_id", "Profile", kind="select"),)
    compatibility=SelectorCompatibility(execution_provider_ids=frozenset({"claude-code-execution"}), harness_types=frozenset({"claude-code"}), supports_exact_revision=True, recommended=True)
    def __init__(self, provider): self.provider=provider
    def prepare(self, parameters, *, execution_id):
        del execution_id
        pid=str(parameters.get("profile_id", "")); ref=self.provider.make_ref(pid)
        return ResourceSelection(self.contract_id, ref.as_ref(), pid, ref.digest)

class ClaudeManager:
    harness_id="claude-code"
    def __init__(self, provider): self.provider=provider
    def descriptor(self): return {"id":"claude-code","display_name":"Claude Code","version":"2.1.247","status":"ready","supported":True}
    def list_profiles(self): return tuple({"profile_id":r.profile_id,"revision":r.revision,"digest":r.digest,"name":r.profile_id} for r in self.provider.list_profiles()) if hasattr(self.provider,"list_profiles") else ()
    def get_profile(self, profile_id, revision=None): return self.provider.get(profile_id, revision or 1)
