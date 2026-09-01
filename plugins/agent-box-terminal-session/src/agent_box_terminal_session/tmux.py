from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import shutil
import subprocess
from typing import Callable, Mapping
import json

from agent_box.work_core import ProviderDescriptor
from agent_box.protocols.runtime import (
    CapabilitySet, CapabilityStatus, HostTransport, IsolatedProcessSpec,
    TerminalAllocation, TerminalRunHandle, TerminalSessionRef,
    CompositionErrorCode, CompositionRejected, HostTransportOperation,
    TerminalSessionV1, TransportOperationDescriptor,
)
from .common import AttemptLedger, attach_descriptor, bridge_command, exact_ref, safe_token_file


@dataclass(frozen=True)
class TmuxIdentity:
    socket: str
    server_generation: str
    session_id: str
    window_id: str
    pane_id: str

    @property
    def key(self) -> str:
        return ":".join((self.socket, self.server_generation, self.session_id, self.window_id, self.pane_id))


class TmuxSession:
    provider_id = "tmux"
    supported_contract_ids = frozenset({"agent-box.terminal-session@1"})

    def __init__(self, ref: TerminalSessionRef, *, binary: str | Path | None = None,
                 runner: Callable[..., subprocess.CompletedProcess[str]] | None = None) -> None:
        if ref.provider != self.provider_id:
            raise ValueError("tmux provider requires a tmux TerminalSessionRef")
        self.ref = ref
        self.binary = str(binary or shutil.which("tmux") or "tmux")
        self._runner = runner or self._real_runner
        self.capabilities = CapabilitySet({
            "pty": CapabilityStatus.SUPPORTED, "persistence": CapabilityStatus.SUPPORTED,
            "detach_attach": CapabilityStatus.SUPPORTED, "scrollback": CapabilityStatus.SUPPORTED,
            "resize": CapabilityStatus.SUPPORTED, "signal_terminate": CapabilityStatus.SUPPORTED,
            "multiple_clients": CapabilityStatus.SUPPORTED, "multiple_units": CapabilityStatus.SUPPORTED,
            "safe_direct_spawn": CapabilityStatus.SUPPORTED, "exact_unit_identity": CapabilityStatus.SUPPORTED,
        }, affinity=ref.affinity)
        self._allocation: TerminalAllocation | None = None
        self._identity: TmuxIdentity | None = None
        self._ledger = AttemptLedger()
        self._ambiguous: set[str] = set()
        self._managed = ref.native_id.startswith("managed:")
        self._token_dir: Path | None = None

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "tmux terminal session", "1.0.0")

    @classmethod
    def managed_ref(cls, *, host_affinity: str, socket: str, template_id: str = "one-pane", revision: str = "1") -> TerminalSessionRef:
        if not host_affinity or not socket or "/" in socket or " " in socket:
            raise ValueError("managed tmux Ref has unsafe or missing socket/affinity")
        payload = {"kind": "managed-template", "socket": socket, "template": template_id, "revision": revision}
        return exact_ref(provider=cls.provider_id, native_id="managed:" + template_id + ":" + revision, affinity=host_affinity, payload=payload)

    @classmethod
    def existing_ref(cls, *, host_affinity: str, socket: str, server_generation: str, session_id: str, window_id: str, pane_id: str, replacement_policy: str = "idle-shell-only") -> TerminalSessionRef:
        if replacement_policy not in {"idle-shell-only", "occupied-reject", "explicit-respawn"}:
            raise ValueError("invalid fail-closed replacement policy")
        if not pane_id.startswith("%") or not all((socket, server_generation, session_id, window_id)):
            raise ValueError("existing tmux Ref must contain exact identity")
        payload = {"kind": "existing", "socket": socket, "server_generation": server_generation, "session_id": session_id, "window_id": window_id, "pane_id": pane_id, "replacement_policy": replacement_policy}
        return exact_ref(provider=cls.provider_id, native_id="existing:" + pane_id, affinity=host_affinity, payload=payload)

    def resolve(self, ref: TerminalSessionRef) -> "TmuxSession":
        if ref != self.ref:
            raise ValueError("tmux Ref is not exact")
        if self._managed:
            return self
        identity = self._read_identity(self._target_from_ref())
        expected = self._expected_from_ref()
        if identity != expected:
            raise CompositionRejected(CompositionErrorCode.AFFINITY_MISMATCH, "tmux server/session/window/pane generation changed")
        self._identity = identity
        return self

    def allocate(self) -> TerminalAllocation:
        if self._managed:
            # Creation is an empty tmux shell pane, not target launch.  No
            # ProcessSpec or HostTransport is available at this point.
            self._call("new-session", "-d", "-s", self._session_name(), "-n", "execution")
            # Preserve a completed/failed managed pane long enough for bounded
            # evidence capture; this is terminal allocation policy, not target
            # creation or completion interpretation.
            self._call("set-option", "-t", self._session_name(), "remain-on-exit", "on")
            self._identity = self._read_identity(self._session_name())
        elif self._identity is None:
            self.resolve(self.ref)
        assert self._identity is not None
        self._allocation = TerminalAllocation("tmux:" + self._identity.pane_id, self.ref, self.ref.session_digest)
        return self._allocation

    def run(self, host_transport: HostTransport, spec: IsolatedProcessSpec, attempt_key: str) -> TerminalRunHandle:
        if self._allocation is None or self._identity is None:
            raise RuntimeError("allocate/resolve must precede run")
        prior = self._ledger.prior(attempt_key)
        if prior:
            return prior
        if attempt_key in self._ambiguous:
            raise RuntimeError("START_AMBIGUOUS: tmux bridge submission outcome is unknown")
        transport_affinity = getattr(host_transport, "affinity", None)
        if transport_affinity is not None and transport_affinity != self.ref.affinity:
            raise ValueError("tmux transport is outside the frozen host affinity")
        policy = self._policy()
        if not self._managed and policy not in {"explicit-respawn", "idle-shell-only", "occupied-reject"}:
            raise CompositionRejected(CompositionErrorCode.INVALID_BINDING, "replacement policy is not fail-closed")
        if not self._managed and policy != "explicit-respawn":
            state = self.observe()
            if state.get("foreground") not in {None, "shell", "bash", "sh", "zsh", "fish"}:
                raise CompositionRejected(CompositionErrorCode.CAPABILITY_UNAVAILABLE, "occupied existing pane rejected")
        if spec.local_argv is None:
            raise CompositionRejected(CompositionErrorCode.CAPABILITY_UNSUPPORTED, "tmux P0 requires provider-owned local argv bridge")
        token = safe_token_file(spec.carrier_argv or spec.local_argv)
        # This one sealed carrier operation is the native-creation operation:
        # LocalHostTransport consumes its token and invokes the registered
        # respawn handler in one submit call.  TmuxSession never pre-submits
        # an empty operation and never calls respawn-pane itself.
        payload = json.dumps({
            "binary": self.binary,
            "socket": self.ref.metadata.get("socket", ""),
            "pane_id": self._identity.pane_id,
            "token_path": str(token),
            "bridge": bridge_command(token),
        }, sort_keys=True, separators=(",", ":"))
        try:
            native = host_transport.submit(HostTransportOperation(
                attempt_key, spec.spawn_token, spec.spec_digest,
                "tmux-respawn@1", payload,
            ))
        except Exception:
            self._ambiguous.add(attempt_key)
            raise
        handle = TerminalRunHandle(attempt_key, native, "running", self._allocation.allocation_id,
                                   attach_descriptor("tmux", self._identity.key, "tmux://pane/" + self._identity.pane_id, "tmux " + self._identity.pane_id))
        return self._ledger.remember(handle)

    def observe(self, scope: object = None) -> dict[str, object]:
        if self._identity is None:
            return {"reachable": False, "unit_alive": False, "state": "unresolved"}
        try:
            identity = self._read_identity(self._identity.pane_id)
        except Exception:
            return {"reachable": False, "unit_alive": False, "state": "gone", "identity": self._identity.key}
        return {"reachable": True, "unit_alive": True, "identity": identity.key, "foreground": "shell"}

    def attach(self):
        if self._identity is None:
            return None
        return attach_descriptor("tmux", self._identity.key, "tmux://pane/" + self._identity.pane_id, "tmux " + self._identity.pane_id)

    def release(self, request: object = None) -> dict[str, object]:
        if self._managed and self._identity is not None:
            self._call("kill-session", "-t", self._identity.session_id)
            return {"released": True, "destroyed": True, "managed": True}
        return {"released": True, "destroyed": False, "managed": False}

    def _policy(self) -> str:
        return str(self.ref_payload().get("replacement_policy", "idle-shell-only"))

    def ref_payload(self) -> Mapping[str, object]:
        # The public Ref intentionally has no arbitrary command payload.  The
        # adapter stores the frozen selector projection in native_id/session
        # digest; tests and callers can use explicit constructors instead.
        return self.ref.metadata

    def _session_name(self) -> str:
        return self.ref.metadata.get("session_name", "abx-" + self.ref.session_digest.split(":")[-1][:20])

    def _target_from_ref(self) -> str:
        return self.ref.metadata.get("pane_id", str(self.ref.native_id.removeprefix("existing:")))

    def _expected_from_ref(self) -> TmuxIdentity:
        metadata = self.ref.metadata
        if not all(metadata.get(key) for key in ("socket", "server_generation", "session_id", "window_id", "pane_id")):
            raise ValueError("existing tmux identity is incomplete")
        return TmuxIdentity(metadata["socket"], metadata["server_generation"], metadata["session_id"], metadata["window_id"], metadata["pane_id"])

    def _read_identity(self, target: str) -> TmuxIdentity:
        row = self._call("display-message", "-p", "-t", target, "#{socket_path}\t#{pid}\t#{session_id}\t#{window_id}\t#{pane_id}", capture=True)
        values = row.stdout.rstrip("\n").split("\t")
        if len(values) != 5:
            raise ValueError("tmux returned invalid exact identity")
        socket, pid, session, window, pane = values
        return TmuxIdentity(socket, "server-pid:" + pid, session, window, pane)

    def _call(self, *argv: str, capture: bool = False):
        socket = self.ref.metadata.get("socket")
        prefix = [self.binary]
        if socket:
            prefix += ["-L", socket]
        return self._runner([*prefix, *argv], capture_output=capture, text=True, check=True)

    @staticmethod
    def _real_runner(argv, **kwargs):
        return subprocess.run(argv, shell=False, **kwargs)


class TmuxResourceProvider(TmuxSession):
    def __init__(self, ref: TerminalSessionRef | None = None, *, binary: str | Path | None = None,
                 runner: Callable[..., subprocess.CompletedProcess[str]] | None = None) -> None:
        self._provider_binary, self._provider_runner = binary, runner
        if ref is not None:
            super().__init__(ref, binary=binary, runner=runner)

    def resolve(self, *args, **kwargs):
        if len(args) >= 2 and isinstance(args[0], str):
            contract_id, ref = args[0], args[1]
            if contract_id != "agent-box.terminal-session@1":
                raise ValueError("unsupported terminal-session contract")
            if not isinstance(ref, TerminalSessionRef):
                ref = TerminalSessionRef(ref.provider, ref.native_id,
                                         ref.metadata.get("session_digest", ""),
                                         ref.metadata.get("affinity", ""),
                                         metadata=ref.metadata)
            port = TmuxSession(ref, binary=self._provider_binary, runner=self._provider_runner)
            return TerminalSessionV1(port.ref, port)
        return super().resolve(*args, **kwargs)


_TMUX_RESPAWN_OPERATION_TYPE = "tmux-respawn@1"


class TmuxRespawnOperationHandler:
    """Explicit transport operation handler for the sealed tmux carrier.

    Registered through the generic runtime transport ``CatalogContribution`` — never at
    module import time.  Its payload is bounded JSON, and its bridge is a
    fixed executable rather than a shell string.  The enclosing HostTransport
    owns single-use token consumption; a lost response escalates to
    START_AMBIGUOUS at the coordinator, never a blind retry.
    """

    def __init__(self) -> None:
        self._descriptor = TransportOperationDescriptor(
            operation_type=_TMUX_RESPAWN_OPERATION_TYPE,
            version=1,
            display_name="Managed tmux pane respawn",
            supported_runtime_host_capabilities=("process.spawn.typed@1",),
        )

    def descriptor(self) -> TransportOperationDescriptor:
        return self._descriptor

    def validate(self, operation: HostTransportOperation) -> None:
        payload = self._payload(operation)

    def _payload(self, operation: HostTransportOperation) -> dict:
        if operation.transport_kind != self._descriptor.operation_type:
            raise CompositionRejected(
                CompositionErrorCode.SPAWN_TOKEN_INVALID,
                f"operation kind does not match {self._descriptor.operation_type}",
            )
        try:
            payload = json.loads(operation.sealed_payload or "")
            binary, socket, pane, token, bridge = (
                payload["binary"], payload["socket"], payload["pane_id"],
                payload["token_path"], payload["bridge"],
            )
        except (TypeError, KeyError, ValueError, json.JSONDecodeError) as exc:
            raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "invalid tmux carrier payload") from exc
        if (not all(isinstance(value, str) and value and "\0" not in value for value in (binary, socket, pane, token))
                or bridge != "agent-box-terminal-session-bridge" or not pane.startswith("%")):
            raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "unsafe tmux carrier payload")
        return payload

    def execute(self, transport: HostTransport, operation: HostTransportOperation) -> str:
        payload = self._payload(operation)
        prefix = [payload["binary"], "-L", payload["socket"]]
        subprocess.run([*prefix, "set-environment", "-t", payload["pane_id"], "AGENT_BOX_LAUNCH_TOKEN", payload["token_path"]], shell=False, check=True)
        subprocess.run([*prefix, "respawn-pane", "-k", "-t", payload["pane_id"], payload["bridge"]], shell=False, check=True)
        return "tmux:" + payload["pane_id"]
