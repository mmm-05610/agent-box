"""Host control adapter for the native Codex terminal."""
from __future__ import annotations
from typing import Any
from agent_box.resource_contracts import AgentBoxProfileV1, WorkspaceV1

class CodexTmuxHostControl:
    provider_id = "codex-tmux-interactive"
    def __init__(self): self.registry = None
    def bind(self, registry): self.registry = registry
    def attach_command(self, facts: Any):
        for _, ref in facts.inputs:
            command = ref.metadata.get("attach_command")
            if command: return tuple(command.split())
            socket, session = ref.metadata.get("socket_path"), ref.metadata.get("session_name")
            if socket and session: return ("tmux", "-S", socket, "attach", "-t", session)
        return None
    def _handle(self, facts):
        resolved = {}
        for contract_id, ref in facts.inputs:
            value = self.registry.get_resource_provider(ref.provider).resolve(contract_id, ref)
            resolved.setdefault(contract_id, []).append(value)
        workspaces = resolved.get(WorkspaceV1.contract_id, [])
        profiles = resolved.get(AgentBoxProfileV1.contract_id, [])
        consoles = [value for key, values in resolved.items() if key.startswith("agent-box-tmux.") for value in values]
        if len(workspaces) != 1 or len(profiles) != 1 or len(consoles) != 1: raise ValueError("frozen Binding cannot reconstruct Codex control")
        provider = self.registry.get(self.provider_id)
        return provider.recover_handle(execution_id=facts.execution.id, dispatch_id=facts.dispatch["id"], inputs_digest=facts.dispatch["inputs_digest"], workspace=workspaces[0], profile=profiles[0], console=consoles[0], projected_contracts=tuple(sorted(resolved)))
    def observe(self, facts, handle=None): return self.registry.get(self.provider_id).observe(handle or self._handle(facts))
    def finish(self, facts, handle=None): return self.registry.get(self.provider_id).finish(handle or self._handle(facts))
