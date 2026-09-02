"""Harness-owned, typed, immutable HarnessStartContext.

The formal launch chain no longer scans the raw ExecutionStartRequest, looks
values up by contract string ad hoc, or duck-types profile dicts.  Every
input is extracted exactly once, typed, and frozen into this context before
any Adapter planning happens.  The context is Harnesses-plugin owned and is
deliberately not part of the Work Core ontology.

Ordinary Executions carry NO ``agent-box.skill@1`` input: skills reach the
Harness through the Profile's installed native home (central installed +
profile-local) and the Workspace (project skills).  SkillRefs remain
management/install identities only (Skill Library, receipts, updates).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from agent_box.protocols.runtime import RuntimeHostV1, SandboxV1, TerminalSessionV1
from agent_box.resource_contracts import AgentBoxProfileV1, CredentialRefV1, PromptFragmentV1, WorkspaceV1

from ..registry.schema import HarnessDefinition, LaunchMode
from .failures import PlanRejected

MAX_PROMPT_FRAGMENTS = 32
MAX_PROMPT_CHARS = 262144


@dataclass(frozen=True)
class ResolvedExecutableRef:
    """Typed stand-in for one resolved executable (identity-level here).

    The full typed :class:`ResolvedExecutable` is produced by the executable
    resolver (resources/executable.py) before planning; adapters only ever
    consume it.
    """

    identity: str
    resolved_path: str
    version: str
    digest: str
    platform_metadata: Mapping[str, str] = field(default_factory=dict)
    members: tuple[Mapping[str, str], ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class HarnessStartContext:
    """Everything a Harness Adapter is allowed to plan from."""

    harness_type: str
    execution_id: str
    dispatch_id: str
    launch_mode: LaunchMode
    workspace: WorkspaceV1
    executable: Any
    runtime_host: RuntimeHostV1
    sandbox: SandboxV1
    terminal: TerminalSessionV1
    prompt: str = ""
    profile: AgentBoxProfileV1 | None = None
    continuation: Any | None = None
    credential_ref: CredentialRefV1 | None = None
    launch_selection: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for name in ("harness_type", "execution_id", "dispatch_id"):
            value = getattr(self, name)
            if not isinstance(value, str) or not value or len(value) > 256 or "\0" in value:
                raise ValueError(f"invalid start context {name}")
        if not isinstance(self.launch_mode, LaunchMode):
            raise ValueError("start context requires a typed launch mode")
        if not isinstance(self.workspace, WorkspaceV1):
            raise ValueError("start context requires a typed workspace")
        if not isinstance(self.runtime_host, RuntimeHostV1) or not isinstance(self.sandbox, SandboxV1) or not isinstance(self.terminal, TerminalSessionV1):
            raise ValueError("start context requires typed runtime ports")
        if self.profile is not None and not isinstance(self.profile, AgentBoxProfileV1):
            raise ValueError("start context profile must be a typed profile envelope")
        if len(self.prompt) > MAX_PROMPT_CHARS:
            raise ValueError("prompt exceeds bounds")
        if self.launch_selection and (len(self.launch_selection) > 16 or any(not isinstance(k, str) or not isinstance(v, str) for k, v in self.launch_selection.items())):
            raise ValueError("invalid launch selection metadata")


def _exact(request: Any, contract_id: str, *, minimum: int, maximum: int | None) -> tuple[Any, ...]:
    values = [item.value for item in request.resolved_inputs if item.contract_id == contract_id]
    if len(values) < minimum or (maximum is not None and len(values) > maximum):
        raise PlanRejected("INPUT_CARDINALITY_VIOLATION", contract_id)
    return tuple(values)


def select_launch_mode(definition: HarnessDefinition, *, preferred: str = "exec") -> LaunchMode:
    """Explicit, deterministic launch-mode selection (never silently ``[0]``).

    The headless ``exec`` mode is the formal default when the registry
    declares one.  A requested mode that is NOT declared is a plan failure
    (``LAUNCH_MODE_UNDECLARED``) — there is no implicit first-mode fallback.
    The selection is recorded in the context's launch_selection metadata.
    """
    if not definition.launch_modes:
        raise PlanRejected("LAUNCH_MODE_UNDECLARED", definition.harness_type)
    for mode in definition.launch_modes:
        if mode.name == preferred:
            return mode
    raise PlanRejected("LAUNCH_MODE_UNDECLARED", preferred)


def build_start_context(
    definition: HarnessDefinition,
    request: Any,
    *,
    executable: Any,
    preferred_launch_mode: str = "exec",
) -> HarnessStartContext:
    """Freeze one typed start context from a resolved dispatch request."""
    harness_type = definition.harness_type
    workspace_values = _exact(request, WorkspaceV1.contract_id, minimum=1, maximum=1)
    host_values = _exact(request, RuntimeHostV1.contract_id, minimum=1, maximum=1)
    sandbox_values = _exact(request, SandboxV1.contract_id, minimum=1, maximum=1)
    terminal_values = _exact(request, TerminalSessionV1.contract_id, minimum=1, maximum=1)
    profile_values = _exact(request, AgentBoxProfileV1.contract_id, minimum=0, maximum=1)
    credential_values = _exact(request, CredentialRefV1.contract_id, minimum=0, maximum=1)
    prompt_values = _exact(request, PromptFragmentV1.contract_id, minimum=0, maximum=MAX_PROMPT_FRAGMENTS)
    for value in prompt_values:
        if not isinstance(value, PromptFragmentV1):
            raise PlanRejected("PROMPT_FRAGMENT_TYPE_MISMATCH")
    for value in credential_values:
        if not isinstance(value, CredentialRefV1):
            raise PlanRejected("CREDENTIAL_REF_TYPE_MISMATCH")

    continuation = None
    continuation_contract = definition.continuation.contract_id if definition.continuation else None
    if continuation_contract:
        matches = [item.value for item in request.resolved_inputs if item.contract_id == continuation_contract]
        if len(matches) > 1:
            raise PlanRejected("CONTINUATION_CARDINALITY_VIOLATION", continuation_contract)
        continuation = matches[0] if matches else None

    mode = select_launch_mode(definition, preferred=preferred_launch_mode)
    prompt = "\n\n".join(f"# {fragment.title}\n\n{fragment.content}" for fragment in prompt_values)
    return HarnessStartContext(
        harness_type=harness_type,
        execution_id=request.execution_id,
        dispatch_id=request.dispatch_id,
        launch_mode=mode,
        workspace=workspace_values[0],
        executable=executable,
        runtime_host=host_values[0],
        sandbox=sandbox_values[0],
        terminal=terminal_values[0],
        prompt=prompt,
        profile=profile_values[0] if profile_values else None,
        continuation=continuation,
        credential_ref=credential_values[0] if credential_values else None,
        launch_selection={
            "selected_mode": mode.name,
            "selection_policy": "explicit-preferred",
            "declared_modes": ",".join(item.name for item in definition.launch_modes),
        },
    )


__all__ = [
    "HarnessStartContext",
    "ResolvedExecutableRef",
    "build_start_context",
    "select_launch_mode",
]
