from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from agent_box.protocols.host import SelectorField, SelectorCompatibility, ResourceSelection, resource_selector, host_control
from agent_box.protocols.runtime import SandboxUnavailable

from .provider import BwrapSandboxProvider


class BwrapSandboxPlugin:
    def descriptor(self):
        return PluginDescriptor(
            "sandbox-bwrap", "Agent-Box Bubblewrap Sandbox", "2.0.0a1",
            description="Deny-by-default provider-neutral sandbox wrapper",
            docs_url="https://github.com/mmm-05610/agent-box/tree/main/plugins/agent-box-sandbox-bwrap",
            config_namespace="sandbox-bwrap",
        )

    def build(self, context: PluginContext):
        provider = BwrapSandboxProvider(context.plugin_data_dir)
        return PluginRegistration(
            contracts=(),
            resource_providers=(provider,),
            contributions=(resource_selector(BwrapSandboxSelector(provider)), host_control(BwrapSandboxDiagnostics(provider))),
        )


class BwrapSandboxSelector:
    id = "bwrap-sandbox"
    contract_id = "agent-box.sandbox@1"
    title = "Bubblewrap sandbox template"
    fields = (SelectorField("host_affinity", "Frozen RuntimeHost affinity", required=False), SelectorField("template_id", "Sandbox template", kind="select", default="bwrap-offline", required=False))
    compatibility = SelectorCompatibility(recommended=True)

    def __init__(self, provider):
        self.provider = provider

    def choices(self, parameters):
        return tuple(
            {"value": name, "label": f"{name} · network={spec['network']}",
             "detail": "Inherited host network; workload/tool network is not independently restricted."
             if spec["network"] == "inherit" else "No network namespace access."}
            for name, spec in self.provider.templates.items()
            if name != "safe-default"
        )

    def prepare(self, parameters, *, execution_id):
        unknown = set(parameters) - {"host_affinity", "template_id"}
        if unknown:
            raise ValueError("sandbox selector accepts no arbitrary policy parameters")
        # Selector construction is intentionally bounded; provider resolves and
        # verifies the same manifest before dispatch.
        template_id = parameters.get("template_id", "bwrap-offline")
        return ResourceSelection(self.contract_id, self.provider.make_ref(template_id, host_affinity=parameters.get("host_affinity", "local:bwrap")), exact_summary=f"{template_id}@1")


class BwrapSandboxDiagnostics:
    provider_id = "bwrap-sandbox"
    def __init__(self, provider):
        self.provider = provider

    def doctor(self):
        try:
            return self.provider.availability()
        except SandboxUnavailable as exc:
            return {"status": "SandboxUnavailable", "error": str(exc), "probe": self.provider.probe()}

    def observe(self, facts, handle=None):
        del handle
        return {"provider": self.provider_id, "status": "bounded-diagnostics", "fact_type": type(facts).__name__}
    def attach_command(self, facts):
        del facts
        return None
    def finish(self, facts, handle=None):
        del facts, handle
        return {"provider": self.provider_id, "status": "finish-is-host-coordinated"}


def create_plugin():
    return BwrapSandboxPlugin()
