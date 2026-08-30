"""Visible Codex TUI ExecutionProvider backed by a tmux console resource."""
from __future__ import annotations

import hashlib
import json
import shlex
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from agent_box.resource_contracts import (
    AgentBoxProfileV1,
    PromptFragmentV1,
    WorkspaceV1,
)
from agent_box.work_core import (
    ExecutionProjection,
    ExecutionStartReceipt,
    ExecutionStartRequest,
    Freshness,
    Outcome,
    Phase,
    ProviderDescriptor,
    Ref,
    RefType,
)
from agent_box_tmux import (
    TmuxConsoleController,
    TmuxConsoleV1,
    TmuxPaneObservation,
    TmuxPaneV1,
)

from ..contracts import CodexContinuationV1
from ..launch import CodexLaunchAdapter


_MAX_SCROLLBACK_CHARS = 64 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pane_identity_digest(pane: TmuxPaneV1) -> str:
    identity = {
        "socket_path": str(pane.socket_path),
        "server_pid": pane.server_pid,
        "session_id": pane.session_id,
        "window_id": pane.window_id,
        "pane_id": pane.pane_id,
    }
    return "sha256:" + hashlib.sha256(
        json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


@dataclass
class CodexTmuxHandle:
    execution_id: str
    dispatch_id: str
    inputs_digest: str
    workspace: WorkspaceV1
    profile: AgentBoxProfileV1
    console: TmuxConsoleV1 | TmuxPaneV1
    pane_id: str
    session_event_path: Path
    projected_contracts: tuple[str, ...]
    requested_continuation: str | None = None
    submitted: bool = False
    submitted_outcome: Outcome | None = None
    final_pane: TmuxPaneObservation | None = None
    capture_path: Path | None = None

    @property
    def provider_correlation_ref(self) -> str:
        # Codex emits its session id asynchronously through SessionStart.  The
        # already-materialized tmux identity is the stable start correlation.
        if isinstance(self.console, TmuxPaneV1):
            return self.console.identity_uri
        return f"tmux://{self.console.socket_name}/{self.console.session_name}/{self.pane_id}"

    @property
    def attach_command(self) -> tuple[str, ...]:
        return self.console.attach_command


@dataclass(frozen=True)
class CodexTmuxObservation:
    projection: ExecutionProjection
    native_refs: tuple[Ref, ...]
    output_refs: tuple[Ref, ...]
    projected_contracts: tuple[str, ...]
    pane: TmuxPaneObservation
    codex_session_id: str | None


class CodexTmuxInteractiveExecutionProvider:
    """One interactive responsibility window displayed in a real tmux pane.

    A completed turn, an idle TUI, or a dead pane does not close the Core
    Execution.  Only ``finish()`` changes the provider-owned submitted signal.
    """

    provider_id = "codex-tmux-interactive"

    def __init__(
        self,
        evidence_root: Path,
        *,
        launch_adapter: CodexLaunchAdapter,
        console_controller: TmuxConsoleController | None = None,
    ) -> None:
        self.evidence_root = evidence_root.resolve()
        self._launch_adapter = launch_adapter
        self._console = console_controller or TmuxConsoleController()
        self._handles: dict[str, CodexTmuxHandle] = {}

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Codex TUI in tmux", "0.1.0")

    def capabilities(self) -> Mapping[str, str]:
        return {
            "start": "supported",
            "observe": "supported",
            "attach": "supported",
            "attach-transport": "tmux",
            "continuation-input": "supported",
            "finish": "supported",
            "completion-signal": "explicit",
            "terminal-evidence": "partial-scrollback",
        }

    def input_limits(self) -> Mapping[str, tuple[int, int | None]]:
        return {
            WorkspaceV1.contract_id: (1, 1),
            PromptFragmentV1.contract_id: (1, None),
            AgentBoxProfileV1.contract_id: (1, 1),
            CodexContinuationV1.contract_id: (0, 1),
            TmuxConsoleV1.contract_id: (0, 1),
            TmuxPaneV1.contract_id: (0, 1),
        }

    @staticmethod
    def _one(request: ExecutionStartRequest, contract_id: str) -> object:
        values = request.inputs.get(contract_id, ())
        if len(values) != 1:
            raise ValueError(f"expected one {contract_id}, got {len(values)}")
        return values[0]

    @staticmethod
    def _prompt(request: ExecutionStartRequest) -> str:
        fragments = request.inputs.get(PromptFragmentV1.contract_id, ())
        prompt = "\n\n".join(
            f"# {fragment.title}\n\n{fragment.content}"
            for fragment in fragments
            if isinstance(fragment, PromptFragmentV1)
        )
        if not prompt:
            raise ValueError("Codex tmux provider requires prompt content")
        return (
            "You are operating inside one Agent-Box Execution responsibility "
            "window. The following frozen context has already been selected "
            "for this Execution. Work only in the supplied workspace.\n\n"
            + prompt
        )

    @staticmethod
    def _hook_override(event_path: Path) -> str:
        command = shlex.join(
            (sys.executable, "-m", "agent_box_harnesses.codex.hooks", str(event_path))
        )
        # JSON string escaping is also valid for this TOML basic string.
        encoded_command = json.dumps(command)
        return (
            "hooks.SessionStart=[{matcher=\"startup|resume\",hooks=["
            f"{{type=\"command\",command={encoded_command},timeout=3}}]}}]"
        )

    def start(self, request: ExecutionStartRequest) -> ExecutionStartReceipt:
        if not isinstance(request, ExecutionStartRequest):
            raise TypeError("Codex tmux provider requires ExecutionStartRequest")
        workspace = self._one(request, WorkspaceV1.contract_id)
        profile = self._one(request, AgentBoxProfileV1.contract_id)
        console_values = request.inputs.get(TmuxConsoleV1.contract_id, ())
        pane_values = request.inputs.get(TmuxPaneV1.contract_id, ())
        if len(console_values) + len(pane_values) != 1:
            raise ValueError(
                "Codex tmux provider requires exactly one TmuxConsoleV1 or TmuxPaneV1"
            )
        console = console_values[0] if console_values else pane_values[0]
        if not isinstance(workspace, WorkspaceV1):
            raise TypeError("resolved workspace contract type mismatch")
        if not isinstance(profile, AgentBoxProfileV1):
            raise TypeError("resolved profile contract type mismatch")
        if not isinstance(console, (TmuxConsoleV1, TmuxPaneV1)):
            raise TypeError("resolved tmux resource contract type mismatch")
        if profile.agent_type != "codex":
            raise ValueError("Codex tmux provider requires an Agent-Box Codex profile")

        continuation_values = request.inputs.get(CodexContinuationV1.contract_id, ())
        continuation: CodexContinuationV1 | None = None
        if continuation_values:
            value = continuation_values[0]
            if not isinstance(value, CodexContinuationV1):
                raise TypeError("continuation contract type mismatch")
            continuation = value

        self.evidence_root.mkdir(parents=True, exist_ok=True)
        event_path = self.evidence_root / f"{request.dispatch_id}.session-start.json"
        event_path.unlink(missing_ok=True)
        common = [
            "--no-alt-screen",
            "--dangerously-bypass-hook-trust",
            "-c",
            self._hook_override(event_path),
        ]
        prompt = self._prompt(request)
        extra_args = (
            ["resume", *common, continuation.thread_id, prompt]
            if continuation is not None
            else [*common, prompt]
        )
        profile_ref = next(
            item.ref for item in request.resolved_inputs
            if item.contract_id == AgentBoxProfileV1.contract_id
        )
        plan = self._launch_adapter.plan_interactive(
            execution_id=request.execution_id,
            profile_ref=profile_ref,
            profile=profile,
            workspace=workspace,
            extra_args=extra_args,
        )
        pane_id = console.pane_ids[0] if isinstance(console, TmuxConsoleV1) else console.pane_id
        self._console.launch(console, pane_id, plan.argv, cwd=plan.cwd, env=plan.env)
        handle = CodexTmuxHandle(
            request.execution_id,
            request.dispatch_id,
            request.inputs_digest,
            workspace,
            profile,
            console,
            pane_id,
            event_path,
            tuple(sorted(request.inputs)),
            continuation.thread_id if continuation is not None else None,
        )
        self._handles[request.dispatch_id] = handle
        return ExecutionStartReceipt(
            request.execution_id,
            request.dispatch_id,
            request.inputs_digest,
            correlation_ref=Ref(
                RefType.SESSION,
                self.descriptor().id,
                handle.provider_correlation_ref,
            ),
            runtime_handle=handle,
        )

    def get_handle(self, dispatch_id: str) -> CodexTmuxHandle:
        try:
            return self._handles[dispatch_id]
        except KeyError as exc:
            raise KeyError(f"unknown Codex tmux Dispatch: {dispatch_id}") from exc

    def recover_handle(
        self,
        *,
        execution_id: str,
        dispatch_id: str,
        inputs_digest: str,
        workspace: WorkspaceV1,
        profile: AgentBoxProfileV1,
        console: TmuxConsoleV1 | TmuxPaneV1,
        projected_contracts: tuple[str, ...],
    ) -> CodexTmuxHandle:
        """Rebuild control for an existing accepted Dispatch without start().

        The Host must have already checked Dispatch identity and resolved the
        immutable frozen inputs. This only reconstructs provider control; it
        never respawns a pane or creates a second Dispatch.
        """
        pane_id = console.pane_id if isinstance(console, TmuxPaneV1) else console.pane_ids[0]
        handle = CodexTmuxHandle(
            execution_id=execution_id,
            dispatch_id=dispatch_id,
            inputs_digest=inputs_digest,
            workspace=workspace,
            profile=profile,
            console=console,
            pane_id=pane_id,
            session_event_path=self.evidence_root / f"{dispatch_id}.session-start.json",
            projected_contracts=projected_contracts,
        )
        self._console.inspect(console, pane_id)
        self._handles[dispatch_id] = handle
        return handle

    @staticmethod
    def _session_event(handle: CodexTmuxHandle) -> dict[str, Any] | None:
        try:
            value = json.loads(handle.session_event_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return None
        session_id = value.get("session_id") if isinstance(value, dict) else None
        if not isinstance(session_id, str) or not session_id:
            return None
        if (
            handle.requested_continuation is not None
            and session_id != handle.requested_continuation
        ):
            raise RuntimeError(
                "Codex resumed a different native session than the frozen continuation"
            )
        return value

    def wait_session_start(
        self, handle: CodexTmuxHandle, *, timeout: float = 10
    ) -> str | None:
        deadline = time.monotonic() + timeout
        while True:
            event = self._session_event(handle)
            if event is not None:
                return str(event["session_id"])
            if time.monotonic() >= deadline:
                return None
            pane = self._console.inspect(handle.console, handle.pane_id)
            if not pane.reachable or pane.dead:
                return None
            time.sleep(0.05)

    def finish(
        self, handle: CodexTmuxHandle, *, session_wait_timeout: float = 3
    ) -> CodexTmuxObservation:
        """Explicitly submit this responsibility window and preserve evidence."""
        if isinstance(handle, ExecutionStartReceipt):
            handle = handle.runtime_handle
        if handle.submitted:
            return self.observe(handle)
        self.wait_session_start(handle, timeout=session_wait_timeout)
        handle.final_pane = self._console.inspect(handle.console, handle.pane_id)
        try:
            captured = self._console.capture(handle.console, handle.pane_id)
        except RuntimeError:
            captured = ""
        captured = captured[-_MAX_SCROLLBACK_CHARS:]
        capture_path = self.evidence_root / f"{handle.dispatch_id}.tmux.txt"
        capture_path.write_text(captured, encoding="utf-8")
        capture_path.chmod(0o600)
        handle.capture_path = capture_path
        handle.submitted = True
        handle.submitted_outcome = (
            Outcome.SUCCEEDED
            if handle.final_pane.reachable
            and (
                handle.final_pane.dead is False
                or (
                    handle.final_pane.dead is True
                    and handle.final_pane.exit_status == 0
                )
            )
            else Outcome.FAILED
        )
        self._console.cleanup(handle.console)
        self._launch_adapter.cleanup(handle.execution_id)
        return self.observe(handle)

    @staticmethod
    def _artifact_ref(path: Path, kind: str) -> Ref:
        content = path.read_bytes()
        digest = "sha256:" + hashlib.sha256(content).hexdigest()
        return Ref(
            RefType.ARTIFACT,
            CodexTmuxInteractiveExecutionProvider.provider_id,
            digest,
            uri=path.as_uri(),
            metadata={
                "kind": kind,
                "evidence": "partial" if kind == "tmux-scrollback" else "bounded",
            },
        )

    def observe(self, native_ref: Any) -> CodexTmuxObservation:
        if isinstance(native_ref, ExecutionStartReceipt):
            native_ref = native_ref.runtime_handle
        handle = self.get_handle(native_ref) if isinstance(native_ref, str) else native_ref
        if not isinstance(handle, CodexTmuxHandle):
            raise TypeError("observe requires dispatch id or CodexTmuxHandle")
        pane = handle.final_pane or self._console.inspect(handle.console, handle.pane_id)
        event = self._session_event(handle)
        session_id = str(event["session_id"]) if event is not None else None

        if isinstance(handle.console, TmuxPaneV1):
            identity_digest = _pane_identity_digest(handle.console)
            native_refs: list[Ref] = [
                Ref(
                    RefType.SESSION,
                    "tmux-console",
                    identity_digest,
                    uri=handle.console.identity_uri,
                    metadata={
                        "socket_path": str(handle.console.socket_path),
                        "server_pid": str(handle.console.server_pid),
                        "session_id": handle.console.session_id,
                        "session_name": handle.console.session_name,
                        "window_id": handle.console.window_id,
                        "pane_id": handle.console.pane_id,
                        "identity_digest": identity_digest,
                    },
                ),
                Ref(
                    RefType.RUN,
                    "tmux-console",
                    identity_digest,
                    uri=handle.console.identity_uri,
                    metadata={
                        "socket_path": str(handle.console.socket_path),
                        "server_pid": str(handle.console.server_pid),
                        "session_id": handle.console.session_id,
                        "window_id": handle.console.window_id,
                        "pane_id": handle.console.pane_id,
                        "identity_digest": identity_digest,
                        "pid": str(pane.pid) if pane.pid is not None else "unknown",
                    },
                ),
            ]
        else:
            native_refs = [
                Ref(
                    RefType.SESSION,
                    "tmux-console",
                    handle.console.session_id,
                    uri=f"tmux://{handle.console.socket_name}/{handle.console.session_name}",
                    metadata={"spec_digest": handle.console.spec_digest},
                ),
                Ref(
                    RefType.RUN,
                    "tmux-console",
                    handle.pane_id,
                    metadata={
                        "session_id": handle.console.session_id,
                        "pid": str(pane.pid) if pane.pid is not None else "unknown",
                    },
                ),
            ]
        if session_id is not None:
            native_refs.append(
                Ref(
                    RefType.SESSION,
                    self.provider_id,
                    session_id,
                    uri=f"codex://session/{session_id}",
                    metadata={"source": str(event.get("source") or "unknown")},
                )
            )

        output_refs: list[Ref] = []
        if handle.submitted:
            if handle.capture_path is not None:
                output_refs.append(self._artifact_ref(handle.capture_path, "tmux-scrollback"))
            if handle.session_event_path.is_file():
                output_refs.append(
                    self._artifact_ref(handle.session_event_path, "codex-session-start")
                )
            # Native continuity advisory: the SessionStart hook recorded a
            # codex session id iff one exists, so only then can this native
            # session serve as a continuation source for a NEW Execution.
            projection = ExecutionProjection(
                Phase.TERMINAL,
                handle.submitted_outcome or Outcome.FAILED,
                False,
                Freshness.OBSERVED, _now()
            )
        elif pane.reachable and pane.dead is False:
            projection = ExecutionProjection(
                Phase.ACTIVE, None, True, Freshness.OBSERVED, _now()
            )
        else:
            # A pane disappearing is a reachability fact, not permission for
            # Core to infer that the responsibility was submitted.
            projection = ExecutionProjection(
                Phase.UNKNOWN, None, None, Freshness.UNREACHABLE, _now()
            )
        return CodexTmuxObservation(
            projection,
            tuple(native_refs),
            tuple(output_refs),
            handle.projected_contracts,
            pane,
            session_id,
        )


__all__ = [
    "CodexTmuxHandle",
    "CodexTmuxInteractiveExecutionProvider",
    "CodexTmuxObservation",
]
