"""Harness-owned HostControl adapters."""
from agent_box.protocols.host import HostControl

class ProviderHostControl:
    """Adapter with an explicit provider port; no handle-shape reflection."""
    def __init__(self, provider_id, provider): self.provider_id, self.provider = provider_id, provider
    def _handle(self, facts):
        dispatch = getattr(facts, "dispatch", facts)
        dispatch_id = dispatch.get("id") if isinstance(dispatch, dict) else getattr(dispatch, "id", None)
        if not dispatch_id: raise ValueError("HostControl requires dispatch identity")
        getter = getattr(self.provider, "get_handle", None)
        if not callable(getter): raise TypeError("provider has no typed handle port")
        return getter(dispatch_id)
    def attach_command(self, facts): return None
    def observe(self, facts, handle=None): return self.provider.observe(handle if handle is not None else self._handle(facts))
    def finish(self, facts, handle=None): return self.provider.finish(handle if handle is not None else self._handle(facts))
