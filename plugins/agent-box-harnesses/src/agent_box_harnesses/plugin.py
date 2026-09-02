"""Compatibility-free official Harness plugin entry point facade."""
from .entrypoints import create_profile_store, create_codex, create_claude, create_opencode, create_hermes, create_pi
from agent_box.protocols.credentials import credential_materializer
def create_plugin(): return create_codex()
# Direct-instantiation facade retained for the SDK's bundle-level catalog
# checks. It is not an entry point and owns no alternate registry.
class HarnessesPlugin:
    def descriptor(self):
        from agent_box.extensions import PluginDescriptor
        return PluginDescriptor("harnesses", "Agent-Box Harnesses", "2.0.0a1", description="Official declarative Harness bundle", config_namespace="harnesses")
    def build(self, context):
        from agent_box.extensions import PluginRegistration
        from .codex.credentials import CodexCredentialSource
        registration=create_codex().build(context)
        return PluginRegistration(execution_providers=registration.execution_providers, contributions=registration.contributions + (credential_materializer(CodexCredentialSource(home=context.agent_box_home)),))
