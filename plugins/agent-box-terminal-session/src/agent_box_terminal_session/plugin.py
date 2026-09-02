from __future__ import annotations

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from agent_box.protocols.runtime import TransportOperationContribution
from agent_box.protocols.runtime.transport import transport_operation
from agent_box.protocols.host import ResourceSelection, SelectorField, SelectorCompatibility, resource_selector
from agent_box.work_core import Ref, RefType
from .contract import TerminalSessionV1
from .direct_stdio import DirectStdioResourceProvider, DirectStdioSession
from .tmux import TmuxResourceProvider, TmuxRespawnOperationHandler, TmuxSession


class TerminalSessionPlugin:
    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor("terminal-session", "Agent-Box terminal sessions", "1.0.0", description="direct-stdio and tmux TerminalSession adapters")

    def build(self, context: PluginContext) -> PluginRegistration:
        del context
        respawn = TmuxRespawnOperationHandler()
        # agent-box.terminal-session@1 is a Root-owned shared runtime contract;
        # it is registered exactly once by the Root Extension bootstrap.
        # tmux-respawn@1 is an explicit, catalog-registered transport
        # operation; there is no import-time handler registration.
        return PluginRegistration(
            contributions=(transport_operation(TransportOperationContribution(respawn.descriptor(), respawn)), resource_selector(DirectStdioSelector()), resource_selector(ManagedTmuxSelector())),
            contracts=(), resource_providers=(
            DirectStdioResourceProvider(),
            TmuxResourceProvider(),
        ))


class DirectStdioSelector:
    id = "direct-stdio-session"
    contract_id = TerminalSessionV1.contract_id
    title = "Direct stdio terminal session"
    fields = (SelectorField("host_affinity", "Frozen RuntimeHost affinity", required=True),)
    compatibility = SelectorCompatibility(recommended=True)

    def prepare(self, parameters, *, execution_id: str) -> ResourceSelection:
        del execution_id
        ref = DirectStdioSession.make_ref(host_affinity=str(parameters["host_affinity"]))
        return ResourceSelection(self.contract_id, Ref(RefType.ARTIFACT, ref.provider, ref.native_id,
                                 metadata={"session_digest": ref.session_digest, "affinity": ref.affinity}), self.id, "explicit direct-stdio")


class ManagedTmuxSelector:
    id = "managed-tmux-session"
    contract_id = TerminalSessionV1.contract_id
    title = "Managed tmux terminal session"
    fields = (SelectorField("host_affinity", "Frozen RuntimeHost affinity", required=True), SelectorField("socket", "tmux socket", default="agent-box", required=True))
    compatibility = SelectorCompatibility()

    def prepare(self, parameters, *, execution_id: str) -> ResourceSelection:
        del execution_id
        ref = TmuxSession.managed_ref(host_affinity=str(parameters["host_affinity"]), socket=str(parameters.get("socket", "agent-box")))
        return ResourceSelection(self.contract_id, Ref(RefType.ARTIFACT, ref.provider, ref.native_id,
                                 metadata={"session_digest": ref.session_digest, "affinity": ref.affinity, **ref.metadata}), self.id, "explicit managed tmux")


def create_plugin() -> TerminalSessionPlugin:
    return TerminalSessionPlugin()
