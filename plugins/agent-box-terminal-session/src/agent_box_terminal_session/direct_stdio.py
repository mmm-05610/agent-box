from __future__ import annotations

from agent_box.work_core import ProviderDescriptor
from agent_box.protocols.runtime import (
    CapabilitySet, CapabilityStatus, HostTransport, IsolatedProcessSpec,
    TerminalAllocation, TerminalRunHandle, TerminalSessionRef,
    TerminalSessionV1,
)
from .common import AttemptLedger, attach_descriptor, exact_ref, submit_direct


class DirectStdioSession:
    provider_id = "direct-stdio"
    supported_contract_ids = frozenset({"agent-box.terminal-session@1"})

    def __init__(self, ref: TerminalSessionRef, *, transport: HostTransport | None = None) -> None:
        if ref.provider != self.provider_id or ref.native_id != "direct-stdio":
            raise ValueError("direct-stdio requires the exact direct-stdio TerminalSessionRef")
        self.ref = ref
        self.transport = transport
        self.capabilities = CapabilitySet({
            "pty": CapabilityStatus.SUPPORTED,
            "persistence": CapabilityStatus.CONDITIONAL,
            "detach_attach": CapabilityStatus.UNSUPPORTED,
            "safe_direct_spawn": CapabilityStatus.SUPPORTED,
            "exact_unit_identity": CapabilityStatus.SUPPORTED,
        }, affinity=ref.affinity)
        self._allocation: TerminalAllocation | None = None
        self._ledger = AttemptLedger()

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "direct stdio terminal", "1.0.0")

    @classmethod
    def make_ref(cls, *, host_affinity: str) -> TerminalSessionRef:
        if not host_affinity:
            raise ValueError("direct-stdio host affinity is required")
        return exact_ref(provider=cls.provider_id, native_id="direct-stdio", affinity=host_affinity, payload={"kind": cls.provider_id, "affinity": host_affinity})

    def resolve(self, ref: TerminalSessionRef) -> "DirectStdioSession":
        if ref != self.ref:
            raise ValueError("direct-stdio Ref is not exact")
        return self

    def allocate(self) -> TerminalAllocation:
        # Allocation is only a lease record. It deliberately does not call the
        # transport and therefore cannot create a target process.
        self._allocation = TerminalAllocation("direct-stdio:allocation", self.ref, self.ref.session_digest)
        return self._allocation

    def run(self, host_transport: HostTransport, spec: IsolatedProcessSpec, attempt_key: str) -> TerminalRunHandle:
        if self._allocation is None:
            raise RuntimeError("allocate must precede run")
        prior = self._ledger.prior(attempt_key)
        if prior:
            return prior
        transport_affinity = getattr(host_transport, "affinity", None)
        if transport_affinity is not None and transport_affinity != self.ref.affinity:
            raise ValueError("direct-stdio transport is outside the frozen host affinity")
        native = submit_direct(host_transport, spec, attempt_key)
        # Direct stdio has no durable attach surface.  Presentation is explicit
        # and remains unavailable rather than inventing a terminal descriptor.
        handle = TerminalRunHandle(attempt_key, native, "running", self._allocation.allocation_id,
                                   transport=getattr(host_transport, "last_native", None))
        return self._ledger.remember(handle)

    def observe(self, scope: object = None) -> dict[str, object]:
        return {"reachable": True, "unit_alive": self._allocation is not None, "identity": self.ref.native_id, "scope": scope}

    def attach(self):
        return None

    def release(self, request: object = None) -> dict[str, object]:
        self._allocation = None
        return {"released": True, "destroyed": False}


class DirectStdioResourceProvider(DirectStdioSession):
    def __init__(self, ref: TerminalSessionRef | None = None, *, transport: HostTransport | None = None) -> None:
        self._provider_transport = transport
        if ref is not None:
            super().__init__(ref, transport=transport)

    def resolve(self, *args, **kwargs):
        # Registry/resource-provider shape: resolve(contract_id, Ref, context=...)
        if len(args) >= 2 and isinstance(args[0], str):
            contract_id, ref = args[0], args[1]
            if contract_id != "agent-box.terminal-session@1":
                raise ValueError("unsupported terminal-session contract")
            if not isinstance(ref, TerminalSessionRef):
                ref = TerminalSessionRef(ref.provider, ref.native_id,
                                         ref.metadata.get("session_digest", ""),
                                         ref.metadata.get("affinity", ""),
                                         metadata=ref.metadata)
            port = DirectStdioSession(ref, transport=self._provider_transport)
            return TerminalSessionV1(port.ref, port)
        return super().resolve(*args, **kwargs)
