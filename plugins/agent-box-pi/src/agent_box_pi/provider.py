"""Pi (DeepSeek) interactive TUI ExecutionProvider running in an exact tmux pane.

One accountable responsibility window per Execution.  A completed Pi turn, an
idle TUI, or even a dead pane does not close the Core Execution: only the
provider's explicit ``finish()`` changes the provider-owned submitted signal.
Native identity is the Pi session id (fresh ids are provider-generated and
passed via ``--session-id``; continuations resume an existing native session
inside a brand-new Core Execution).
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping

from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
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
    TmuxPaneObservation,
    TmuxPaneV1,
)

from .config import PiConfigError, PiPluginConfig, plugin_config_file
from .contract import PiContinuationV1

_MAX_SCROLLBACK_CHARS = 64 * 1024
_SESSION_FILE_SUFFIX = ".jsonl"


def _model_family(model: str) -> str:
    """Normalize ``deepseek/deepseek-v4-flash`` -> ``deepseek-v4-flash``."""
    return model.rsplit("/", 1)[-1]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_session_id() -> str:
    return str(uuid.uuid4())


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


def _projected_prompt(request: ExecutionStartRequest) -> str:
    fragments = request.inputs.get(PromptFragmentV1.contract_id, ())
    body = "\n\n".join(
        f"# {fragment.title}\n\n{fragment.content}"
        for fragment in fragments
        if isinstance(fragment, PromptFragmentV1)
    )
    if not body:
        raise ValueError("Pi provider requires at least one prompt fragment")
    return (
        "You are Pi running inside one Agent-Box Execution responsibility "
        "window for a DeepSeek-powered research task. The frozen context below "
        "has already been selected for this Execution. Work only in the "
        "supplied workspace and treat this context as your fixed responsibility.\n\n"
        + body
    )


def build_launch_command(
    config: PiPluginConfig,
    *,
    workspace: WorkspaceV1 | Path,
    execution_id: str,
    session_id: str,
    prompt: str,
    continuation: PiContinuationV1 | None = None,
    inherit_deepseek_api_key: str | None = None,
    env_binary: str = "/usr/bin/env",
) -> list[str]:
    """Return the exact argv respawned inside the tmux pane.

    Long-term Pi/DeepSeek configuration comes from the plugin config; the
    session/evidence roots are plugin-owned paths.  The DeepSeek credential is
    referenced through ``DEEPSEEK_API_KEY`` only when the launching environment
    already carries it — it is never written to config, Refs, or evidence.
    """
    roots: list[str] = [
        f"PI_CODING_AGENT_DIR={config.resolved_agent_dir}",
        f"PI_CODING_AGENT_SESSION_DIR={config.resolved_session_root}",
    ]
    if config.offline:
        roots.append("PI_OFFLINE=1")
    if inherit_deepseek_api_key:
        roots.append(f"DEEPSEEK_API_KEY={inherit_deepseek_api_key}")

    binary = config.resolved_binary
    args: list[str] = [
        binary,
        "--provider",
        "deepseek",
        "--model",
        config.canonical_model,
        "--thinking",
        config.thinking,
        "--session-dir",
        str(config.resolved_session_root),
        "--name",
        execution_id,
    ]
    if continuation is not None:
        target = continuation.session_file or continuation.session_id
        args += ["--session", target]
    else:
        args += ["--session-id", session_id]
    args.append(prompt)
    return [env_binary, *roots, *args]


def _script_hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


@dataclass
class PiTmuxHandle:
    execution_id: str
    dispatch_id: str
    inputs_digest: str
    workspace: WorkspaceV1
    pane: TmuxPaneV1
    config: PiPluginConfig
    session_id: str
    prompt_digest: str
    projected_contracts: tuple[str, ...]
    start_record_path: Path
    requested_continuation: PiContinuationV1 | None = None
    submitted: bool = False
    submitted_outcome: Outcome | None = None
    final_pane: TmuxPaneObservation | None = None
    capture_path: Path | None = None
    session_file: Path | None = None
    runtime_facts: Mapping[str, str] = field(default_factory=dict)

    @property
    def provider_correlation_ref(self) -> str:
        return self.session_id

    @property
    def attach_command(self) -> tuple[str, ...]:
        return self.pane.attach_command


@dataclass(frozen=True)
class PiObservation:
    projection: ExecutionProjection
    native_refs: tuple[Ref, ...]
    output_refs: tuple[Ref, ...]
    projected_contracts: tuple[str, ...]
    pane: TmuxPaneObservation
    pi_session_id: str | None
    session_file: Path | None
    runtime_facts: Mapping[str, str]


class PiTmuxInteractiveExecutionProvider:
    """One Pi process per Execution, visible and attachable in an exact pane."""

    provider_id = "pi"

    def __init__(
        self,
        *,
        config_loader: Callable[[], PiPluginConfig] = PiPluginConfig.load,
        console_controller: TmuxConsoleController | None = None,
        version_probe: Callable[[str], str] | None = None,
    ) -> None:
        self._config_loader = config_loader
        self._console = console_controller or TmuxConsoleController()
        self._version_probe = version_probe
        self._handles: dict[str, PiTmuxHandle] = {}
        self._installed_version: str | None = None

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Pi / DeepSeek", "0.1.0")

    def capabilities(self) -> Mapping[str, str]:
        return {
            "start": "supported",
            "observe": "supported",
            "attach": "supported",
            "attach-transport": "tmux",
            "continuation-input": "supported",
            "finish": "supported",
            "completion-signal": "explicit",
            "terminal-evidence": "session-jsonl+scrollback",
            "provider": "deepseek",
        }

    def input_limits(self) -> Mapping[str, tuple[int, int | None]]:
        return {
            WorkspaceV1.contract_id: (1, 1),
            PromptFragmentV1.contract_id: (1, None),
            TmuxPaneV1.contract_id: (1, 1),
            PiContinuationV1.contract_id: (0, 1),
        }

    # ------------------------------------------------------------------ start

    @staticmethod
    def _one(request: ExecutionStartRequest, contract_id: str) -> object:
        values = request.inputs.get(contract_id, ())
        if len(values) != 1:
            raise ValueError(f"expected one {contract_id}, got {len(values)}")
        return values[0]

    def _verify_pi_installed(self, config: PiPluginConfig) -> str:
        """Return the installed pi version or raise a clear configuration error."""
        if self._installed_version is not None:
            return self._installed_version
        binary = config.resolved_binary
        if self._version_probe is not None:
            output = self._version_probe(binary)
            config.verify_installed_version(output)
            self._installed_version = output
            return output
        if binary == "pi" and not shutil.which("pi"):
            raise PiConfigError(
                "Pi binary 'pi' is not in PATH; set plugins/pi/config.json binary "
                "to the absolute path of the installed pi executable"
            )
        if binary != "pi":
            path = Path(binary)
            if not path.is_file() or not os.access(path, os.X_OK):
                raise PiConfigError(f"Pi binary is not executable: {path}")
        try:
            completed = subprocess.run(
                [binary, "--version"],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=20,
            )
        except OSError as exc:
            raise PiConfigError(f"failed to run pi --version: {exc}") from exc
        if completed.returncode != 0:
            raise PiConfigError(
                "pi --version failed: " + (completed.stderr.strip() or completed.stdout.strip())
            )
        output = completed.stdout.strip().splitlines()[0].strip() if completed.stdout.strip() else ""
        config.verify_installed_version(output)
        self._installed_version = output
        return output

    def start(self, request: ExecutionStartRequest) -> ExecutionStartReceipt:
        if not isinstance(request, ExecutionStartRequest):
            raise TypeError("Pi provider requires ExecutionStartRequest")
        config = self._config_loader()
        workspace = self._one(request, WorkspaceV1.contract_id)
        pane = self._one(request, TmuxPaneV1.contract_id)
        if not isinstance(workspace, WorkspaceV1):
            raise TypeError("resolved workspace contract type mismatch")
        if not isinstance(pane, TmuxPaneV1):
            raise TypeError("resolved tmux pane contract type mismatch")

        continuation_values = request.inputs.get(PiContinuationV1.contract_id, ())
        continuation: PiContinuationV1 | None = None
        if continuation_values:
            value = continuation_values[0]
            if not isinstance(value, PiContinuationV1):
                raise TypeError("continuation contract type mismatch")
            continuation = value
            if value.model and _model_family(value.model) != _model_family(
                config.canonical_model
            ):
                raise PiConfigError(
                    "Pi continuation model "
                    f"{value.model!r} differs from the configured DeepSeek model "
                    f"{config.canonical_model!r}"
                )

        prompt = _projected_prompt(request)
        installed_version = self._verify_pi_installed(config)

        # 1. Verify the exact pane before touching it.
        self._console.inspect(pane, pane.pane_id)

        # 2. Provider-owned native identity.
        session_id = continuation.session_id if continuation is not None else _new_session_id()

        # 3. Persist the recoverable provider-owned start record BEFORE launch.
        config.resolved_evidence_root.mkdir(parents=True, exist_ok=True)
        start_record_path = config.resolved_evidence_root / f"{request.dispatch_id}.start.json"
        auth_source = "env:DEEPSEEK_API_KEY" if "DEEPSEEK_API_KEY" in os.environ else "pi-auth-file"
        start_record = {
            "dispatch_id": request.dispatch_id,
            "execution_id": request.execution_id,
            "inputs_digest": request.inputs_digest,
            "workspace": str(workspace.path),
            "source_digest": workspace.source_digest,
            "pane_id": pane.pane_id,
            "pane_identity_digest": _pane_identity_digest(pane),
            "provider": "deepseek",
            "model": config.canonical_model,
            "thinking": config.thinking,
            "pi_version": installed_version,
            "session_id": session_id,
            "continuation": (
                {"session_id": continuation.session_id, "session_file": continuation.session_file}
                if continuation is not None
                else None
            ),
            "auth_source": auth_source,
            "prompt_digest": _script_hash(prompt),
            "started_at": _now().isoformat(),
        }
        start_record_path.write_text(
            json.dumps(start_record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        start_record_path.chmod(0o600)

        # 4. Launch pi inside the exact pane (credential referenced, never stored).
        argv = build_launch_command(
            config,
            workspace=workspace,
            execution_id=request.execution_id,
            session_id=session_id,
            prompt=prompt,
            continuation=continuation,
            inherit_deepseek_api_key=os.environ.get("DEEPSEEK_API_KEY"),
        )
        self._console.launch(pane, pane.pane_id, argv, cwd=workspace.path)

        handle = PiTmuxHandle(
            execution_id=request.execution_id,
            dispatch_id=request.dispatch_id,
            inputs_digest=request.inputs_digest,
            workspace=workspace,
            pane=pane,
            config=config,
            session_id=session_id,
            prompt_digest=start_record["prompt_digest"],
            projected_contracts=tuple(sorted(request.inputs)),
            start_record_path=start_record_path,
            requested_continuation=continuation,
            runtime_facts={
                "pi_version": installed_version,
                "model": config.canonical_model,
                "thinking": config.thinking,
                "pane_id": pane.pane_id,
                "provider": "deepseek",
            },
        )
        self._handles[request.dispatch_id] = handle
        return ExecutionStartReceipt(
            request.execution_id,
            request.dispatch_id,
            request.inputs_digest,
            correlation_ref=Ref(
                RefType.SESSION,
                self.descriptor().id,
                session_id,
                uri=f"pi://session/{session_id}",
            ),
            runtime_handle=handle,
        )

    # -------------------------------------------------------------- discovery

    def get_handle(self, dispatch_id: str) -> PiTmuxHandle:
        try:
            return self._handles[dispatch_id]
        except KeyError as exc:
            raise KeyError(f"unknown Pi Dispatch: {dispatch_id}") from exc

    @staticmethod
    def _session_file_suffix(session_id: str) -> str:
        return f"_{session_id}{_SESSION_FILE_SUFFIX}"

    def locate_session_file(
        self, session_id: str, *, config: PiPluginConfig | None = None
    ) -> Path | None:
        """Find the native session JSONL by id anywhere under the session root.

        Pi writes ``<timestamp>_<id>.jsonl``; the layout (flat root vs
        ``--<cwd>--`` project dir) depends on runtime discovery rules, so we
        scan conservatively and take the newest match.
        """
        root = (config or self._config_loader()).resolved_session_root
        if not root.is_dir():
            return None
        suffix = self._session_file_suffix(session_id)
        candidates: list[Path] = []
        for path in root.rglob(f"*{suffix}"):
            if path.is_file():
                candidates.append(path)
        if not candidates:
            return None
        return max(candidates, key=lambda path: path.stat().st_mtime)

    def wait_session_file(
        self, handle: PiTmuxHandle, *, timeout: float = 15
    ) -> Path | None:
        deadline = time.monotonic() + timeout
        while True:
            found = self.locate_session_file(handle.session_id, config=handle.config)
            if found is not None:
                return found
            pane = self._console.inspect(handle.pane, handle.pane.pane_id)
            if not pane.reachable or pane.dead:
                return None
            if time.monotonic() >= deadline:
                return None
            time.sleep(0.1)

    def recover_handle(
        self,
        *,
        execution_id: str,
        dispatch_id: str,
        inputs_digest: str,
        workspace: WorkspaceV1,
        pane: TmuxPaneV1,
        projected_contracts: tuple[str, ...],
        continuation: PiContinuationV1 | None = None,
    ) -> PiTmuxHandle:
        """Rebuild control for an existing accepted Dispatch without start().

        Never respawns the pane and never creates a second Dispatch.  The
        native session id is read from the durable start record when present.
        """
        config = self._config_loader()
        start_record_path = config.resolved_evidence_root / f"{dispatch_id}.start.json"
        session_id = continuation.session_id if continuation is not None else ""
        try:
            record = json.loads(start_record_path.read_text(encoding="utf-8"))
            if isinstance(record, dict) and isinstance(record.get("session_id"), str):
                session_id = str(record["session_id"])
        except (OSError, json.JSONDecodeError):
            pass
        if not session_id:
            raise ValueError(
                f"Pi recovery cannot determine the native session id for {dispatch_id}"
            )
        self._console.inspect(pane, pane.pane_id)
        handle = PiTmuxHandle(
            execution_id=execution_id,
            dispatch_id=dispatch_id,
            inputs_digest=inputs_digest,
            workspace=workspace,
            pane=pane,
            config=config,
            session_id=session_id,
            prompt_digest="",
            projected_contracts=projected_contracts,
            start_record_path=start_record_path,
            requested_continuation=continuation,
            runtime_facts={"provider": "deepseek", "model": config.canonical_model},
        )
        handle.session_file = self.locate_session_file(session_id, config=config)
        self._handles[dispatch_id] = handle
        return handle

    # ----------------------------------------------------------------- finish

    @staticmethod
    def _artifact_ref(provider_id: str, path: Path, kind: str, *, evidence: str) -> Ref:
        content = path.read_bytes()
        digest = "sha256:" + hashlib.sha256(content).hexdigest()
        return Ref(
            RefType.ARTIFACT,
            provider_id,
            digest,
            uri=path.as_uri(),
            metadata={"kind": kind, "evidence": evidence},
        )

    def finish(
        self, handle: PiTmuxHandle, *, session_wait_timeout: float = 3
    ) -> PiObservation:
        """Explicitly submit this responsibility window and preserve evidence."""
        if isinstance(handle, ExecutionStartReceipt):
            handle = handle.runtime_handle
        if handle.submitted:
            return self.observe(handle)
        self.wait_session_file(handle, timeout=session_wait_timeout)
        handle.final_pane = self._console.inspect(handle.pane, handle.pane.pane_id)
        try:
            captured = self._console.capture(handle.pane, handle.pane.pane_id)
        except RuntimeError:
            captured = ""
        captured = captured[-_MAX_SCROLLBACK_CHARS:]
        capture_path = handle.config.resolved_evidence_root / f"{handle.dispatch_id}.tmux.txt"
        capture_path.parent.mkdir(parents=True, exist_ok=True)
        capture_path.write_text(captured, encoding="utf-8")
        capture_path.chmod(0o600)
        handle.capture_path = capture_path
        handle.session_file = self.locate_session_file(handle.session_id, config=handle.config)
        pane_ok = handle.final_pane.reachable and (
            handle.final_pane.dead is False
            or (handle.final_pane.dead is True and handle.final_pane.exit_status == 0)
        )
        handle.submitted_outcome = (
            Outcome.SUCCEEDED if pane_ok and handle.session_file is not None else Outcome.FAILED
        )
        handle.submitted = True
        self._console.cleanup(handle.pane)
        return self.observe(handle)

    # ---------------------------------------------------------------- observe

    def observe(self, native_ref: Any) -> PiObservation:
        if isinstance(native_ref, ExecutionStartReceipt):
            native_ref = native_ref.runtime_handle
        handle = self.get_handle(native_ref) if isinstance(native_ref, str) else native_ref
        if not isinstance(handle, PiTmuxHandle):
            raise TypeError("observe requires dispatch id or PiTmuxHandle")
        pane = handle.final_pane or self._console.inspect(handle.pane, handle.pane.pane_id)
        session_file = handle.session_file or self.locate_session_file(handle.session_id, config=handle.config)
        session_id = handle.session_id if (session_file is not None or handle.submitted) else None

        identity_digest = _pane_identity_digest(handle.pane)
        native_refs: list[Ref] = [
            Ref(
                RefType.SESSION,
                "tmux-console",
                identity_digest,
                uri=handle.pane.identity_uri,
                metadata={
                    key: str(getattr(handle.pane, key))
                    for key in (
                        "socket_path",
                        "server_pid",
                        "session_id",
                        "session_name",
                        "window_id",
                        "pane_id",
                    )
                    if getattr(handle.pane, key, None) is not None
                }
                | {"identity_digest": identity_digest},
            ),
            Ref(
                RefType.RUN,
                "tmux-console",
                identity_digest,
                uri=handle.pane.identity_uri,
                metadata={
                    "pane_id": handle.pane.pane_id,
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
                    uri=session_file.as_uri() if session_file is not None else None,
                    metadata={
                        "provider": "deepseek",
                        "model": handle.runtime_facts.get("model", ""),
                        "session_root": str(handle.config.resolved_session_root),
                    },
                )
            )
            native_refs.append(
                Ref(
                    RefType.RUN,
                    self.provider_id,
                    session_id,
                    metadata={"pid": str(pane.pid) if pane.pid is not None else "unknown"},
                )
            )

        output_refs: list[Ref] = []
        if handle.submitted:
            if handle.capture_path is not None:
                output_refs.append(
                    self._artifact_ref(
                        self.provider_id, handle.capture_path, "tmux-scrollback", evidence="partial"
                    )
                )
            if handle.session_file is not None:
                output_refs.append(
                    self._artifact_ref(
                        self.provider_id, handle.session_file, "pi-session-jsonl", evidence="bounded"
                    )
                )
            if handle.start_record_path.is_file():
                output_refs.append(
                    self._artifact_ref(
                        self.provider_id,
                        handle.start_record_path,
                        "pi-start-record",
                        evidence="bounded",
                    )
                )

        if handle.submitted:
            # Native continuity advisory: the session JSONL was actually
            # located iff it exists, so only then can this native session
            # serve as a continuation source for a NEW Execution.
            projection = ExecutionProjection(
                Phase.TERMINAL,
                handle.submitted_outcome or Outcome.FAILED,
                session_file is not None,
                Freshness.OBSERVED,
                _now(),
            )
        elif pane.reachable and pane.dead is False:
            # A completed turn, idle TUI, or process exit is a reachability
            # fact only; never permission for Core to infer submission.
            projection = ExecutionProjection(
                Phase.ACTIVE, None, True, Freshness.OBSERVED, _now()
            )
        else:
            projection = ExecutionProjection(
                Phase.UNKNOWN, None, None, Freshness.UNREACHABLE, _now()
            )
        return PiObservation(
            projection,
            tuple(native_refs),
            tuple(output_refs),
            handle.projected_contracts,
            pane,
            session_id,
            session_file,
            dict(handle.runtime_facts),
        )


__all__ = [
    "PiObservation",
    "PiTmuxHandle",
    "PiTmuxInteractiveExecutionProvider",
    "build_launch_command",
    "plugin_config_file",
]
