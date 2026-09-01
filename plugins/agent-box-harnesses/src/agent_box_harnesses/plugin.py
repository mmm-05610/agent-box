from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration, ContinuationRouteDescriptor, ProviderContinuationRoute, ProfileEnvelopeManager
from .codex.contracts import CodexContinuationV1
from .codex.manager import CodexHarnessManager, CodexProfileSelector
from .codex.launch import CodexLaunchAdapter
from .codex.control import CodexAppServerHostControl
from .codex.app_server.provider import CodexInteractiveExecutionProvider as CodexAppServerExecutionProvider
from .codex.interactive.control import CodexInteractiveHostControl
from .codex.interactive.provider import CodexInteractiveExecutionProvider
from .codex.continuation import CodexContinuationResourceProvider
from .codex.credentials import CodexCredentialSelector
from agent_box.work_core import Ref, RefType


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
        app_server = CodexAppServerExecutionProvider(
            evidence_root, launch_adapter=adapter, credential_materializer=manager.credentials
        )
        interactive = CodexInteractiveExecutionProvider(
            evidence_root, launch_adapter=adapter, credential_materializer=manager.credentials
        )
        return PluginRegistration(
            contracts=(CodexContinuationV1,),
            resource_providers=(manager.provider, CodexContinuationResourceProvider(), manager.credentials),
            execution_providers=(app_server, interactive),
            credential_materializers=(manager.credentials,),
            host_controls=(
                CodexAppServerHostControl(app_server),
                CodexInteractiveHostControl(interactive),
            ),
            harness_managers=(ProfileEnvelopeManager(manager, harness_type="codex", provider_id=manager.provider.provider_id),),
            resource_selectors=(CodexProfileSelector(manager), CodexCredentialSelector(manager.credentials)),
            continuation_routes=(ProviderContinuationRoute(ContinuationRouteDescriptor("codex-native-session", frozenset({"codex-app-server","codex-interactive"}), frozenset({"codex-app-server","codex-interactive"}), CodexContinuationV1.contract_id, "codex-continuation", "codex-continuation", "native-session", "Codex native thread continuation"), lambda ref: Ref(RefType.SESSION, "codex-continuation", ref.native_id, metadata={"source_provider":ref.provider})),),
        )
