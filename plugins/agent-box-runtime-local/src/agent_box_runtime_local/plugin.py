from __future__ import annotations

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration, ResourceSelection, SelectorField, SelectorCompatibility
from .provider import CONTRACT_ID, LocalRuntimeHostProvider


class LocalRuntimeHostSelector:
    id = "runtime-host-local"
    contract_id = CONTRACT_ID
    title = "Exact local Linux/WSL RuntimeHost"
    fields = (SelectorField("realm", "Realm", default="native-linux", required=True),)
    compatibility = SelectorCompatibility(recommended=True)

    def __init__(self, provider: LocalRuntimeHostProvider) -> None:
        self.provider = provider

    def prepare(self, parameters, *, execution_id: str) -> ResourceSelection:
        del execution_id
        realm = parameters.get("realm", "native-linux")
        ref = self.provider.make_ref(realm)
        return ResourceSelection(self.contract_id, ref, realm, f"{realm} · {ref.native_id}")


class LocalRuntimeHostDiagnostics:
    provider_id = "runtime-host-local"

    def __init__(self, provider: LocalRuntimeHostProvider) -> None:
        self.provider = provider

    def doctor(self):
        return {realm: self.provider.availability(realm) for realm in ("native-linux", "wsl")}

    def attach_command(self, facts):
        del facts
        return None

    def observe(self, facts, handle=None):
        del handle
        return {"provider": self.provider_id, "status": "bounded-diagnostics", "fact_type": type(facts).__name__}

    def finish(self, facts, handle=None):
        del facts, handle
        return {"provider": self.provider_id, "status": "finish-is-host-coordinated"}


class LocalRuntimeHostPlugin:
    def descriptor(self):
        return PluginDescriptor(
            "runtime-local", "Agent-Box local RuntimeHost", "2.0.0a1",
            description="Exact typed local Linux and WSL RuntimeHost adapter",
            config_namespace="runtime-local",
        )

    def build(self, context: PluginContext):
        del context
        provider = LocalRuntimeHostProvider()
        return PluginRegistration(
            # agent-box.runtime-host@1 is a Root-owned shared runtime contract;
            # it is registered once by the Root Extension bootstrap.
            contracts=(),
            resource_providers=(provider,),
            resource_selectors=(LocalRuntimeHostSelector(provider),),
            host_controls=(LocalRuntimeHostDiagnostics(provider),),
        )


def create_plugin():
    return LocalRuntimeHostPlugin()
