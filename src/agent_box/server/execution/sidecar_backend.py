"""Provider-neutral Server/Core orchestration for the Harness sidecar port."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import base64
import json
import re
import threading
import time
from pathlib import PurePosixPath
from typing import Any, Callable, Mapping

from agent_box.resource_contracts import AgentBoxProfileV1, PromptFragmentV1, WorkspaceV1
from agent_box.server.execution.sidecar import SidecarHarnessPort
from agent_box.work_core import (
    ExecutionFinalizationRequest, ExecutionProjection, ExecutionStartReceipt,
    Freshness, Outcome, Phase, ProviderDescriptor, Ref, RefType,
)
from agent_box.work_core.registry import ExtensionRegistry
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.services import ExecutionService, WorkService


@dataclass
class _Run:
    turn_id: str
    work_id: str
    core_execution_id: str
    dispatch_id: str
    port: SidecarHarnessPort
    native_id: str
    done: threading.Event
    cancel_lock: threading.Lock = field(default_factory=threading.Lock)
    cancel_confirmed: bool = False
    result: Mapping[str, Any] | None = None
    error: BaseException | None = None


class _BoundResources:
    provider_id = "server-sidecar-input"
    supported_contract_ids = frozenset({
        WorkspaceV1.contract_id, PromptFragmentV1.contract_id, AgentBoxProfileV1.contract_id,
    })

    def __init__(self) -> None:
        self._values: dict[tuple[str, str], object] = {}
        self._lock = threading.Lock()

    def descriptor(self):
        return ProviderDescriptor(self.provider_id, "Server frozen sidecar inputs", "1")

    def bind(self, contract_id: str, native_id: str, value: object) -> Ref:
        with self._lock:
            self._values[(contract_id, native_id)] = value
        ref_type = RefType.WORKSPACE if contract_id == WorkspaceV1.contract_id else RefType.ARTIFACT
        return Ref(ref_type, self.provider_id, native_id)

    def resolve(self, contract_id: str, ref: Ref, *, context=None) -> object:
        del context
        with self._lock:
            return self._values[(contract_id, ref.native_id)]

    def release(self, turn_id: str) -> None:
        with self._lock:
            self._values = {
                key: value for key, value in self._values.items() if not key[1].endswith(turn_id)
            }


class _CoreSidecarProvider:
    provider_id = "harness-sidecar"

    def __init__(self, backend: "SidecarExecutionBackend") -> None:
        self.backend = backend
        self._handles: dict[str, _Run] = {}

    def descriptor(self):
        return ProviderDescriptor(self.provider_id, "Harness sidecar execution", "1")

    def capabilities(self):
        return {"streaming": "supported", "cancel": "supported", "approvals": "supported"}

    def input_limits(self):
        return {
            WorkspaceV1.contract_id: (1, 1),
            PromptFragmentV1.contract_id: (1, 1),
            AgentBoxProfileV1.contract_id: (1, 1),
        }

    def start(self, request):
        values = {item.contract_id: item.value for item in request.resolved_inputs}
        run = self.backend._start_run(
            request.execution_id, request.dispatch_id,
            values[WorkspaceV1.contract_id], values[PromptFragmentV1.contract_id],
            values[AgentBoxProfileV1.contract_id],
        )
        self._handles[request.dispatch_id] = run
        return ExecutionStartReceipt(
            request.execution_id, request.dispatch_id, request.inputs_digest,
            correlation_ref=Ref(RefType.SESSION, self.provider_id, run.native_id),
            runtime_handle=run,
        )

    def get_handle(self, dispatch_id: str) -> _Run:
        return self._handles[dispatch_id]

    def release_handle(self, dispatch_id: str) -> None:
        self._handles.pop(dispatch_id, None)

    def observe(self, native_ref):
        del native_ref
        return None


class SidecarExecutionBackend:
    """TurnExecutionPort using Core dispatch and a sidecar factory.

    The factory is the deployment composition seam. It receives a stored,
    provider-neutral Turn context and an event callback, and returns a port
    whose Node sidecar owns all native Harness semantics.
    """

    def __init__(
        self, records, objects, approvals, *,
        port_factory: Callable[[Mapping[str, Any], Callable[..., None]], SidecarHarnessPort],
        on_event: Callable[[], None] | None = None,
    ) -> None:
        self.records = records
        self.objects = objects
        self.approvals = approvals
        self.port_factory = port_factory
        self.on_event = on_event or (lambda: None)
        self.core_repository = CoreRepository()
        self.work_service = WorkService(self.core_repository)
        self.execution_service = ExecutionService(self.core_repository)
        self.resources = _BoundResources()
        self.provider = _CoreSidecarProvider(self)
        self.registry = ExtensionRegistry()
        self.registry.register_resource_provider(self.resources.provider_id, self.resources)
        self.registry.register_execution_provider(self.provider)
        self._turn_by_core: dict[str, str] = {}
        self._contexts: dict[str, Mapping[str, Any]] = {}
        self._active: dict[str, _Run] = {}
        self._approval_ports: dict[str, SidecarHarnessPort] = {}
        self._message_parts: dict[str, list[str]] = {}
        self._lock = threading.RLock()
        self.queue = None

    def bind_queue(self, queue) -> None:
        self.queue = queue

    def accept(self, turn_id: str, *, overrides: Mapping[str, Any] | None = None) -> None:
        context = self.records.get_turn_context(turn_id)
        stored = json.loads(self.objects.read(context["input_object_digest"]))
        message = stored.get("message") or stored
        profile_value = json.loads(self.objects.read(context["config_object_digest"]))
        configuration = dict(profile_value.get("configuration") or {})
        configuration.update(dict(overrides or {}))
        effective_value = {
            "schema_version": 1, "harness_type": context["harness_type"],
            "configuration": configuration,
        }
        if profile_value.get("execution") is not None:
            effective_value["execution"] = profile_value["execution"]
        effective = self.objects.publish(json.dumps(
            effective_value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        ).encode())
        work = self.work_service.create_work(
            "AgentBox Session Turn", metadata={"session_id": context["session_id"], "turn_id": turn_id},
        )
        core_execution = self.execution_service.create_execution(
            work.id, self.provider.provider_id,
            responsibility_intent="execute one accepted Session Turn through its Harness extension",
            provenance={"session_id": context["session_id"], "turn_id": turn_id},
        )
        inputs = (
            (WorkspaceV1.contract_id, self.resources.bind(
                WorkspaceV1.contract_id, f"workspace-{turn_id}",
                WorkspaceV1(PurePosixPath(context["remote_path"]), "remote-live"),
            )),
            (PromptFragmentV1.contract_id, self.resources.bind(
                PromptFragmentV1.contract_id, f"prompt-{turn_id}",
                PromptFragmentV1("User Turn", str(message["text"]), context["input_object_digest"]),
            )),
            (AgentBoxProfileV1.contract_id, self.resources.bind(
                AgentBoxProfileV1.contract_id, f"profile-{turn_id}",
                AgentBoxProfileV1(
                    context["profile_id"], context["harness_type"], effective.digest,
                    int(context["profile_revision"]),
                ),
            )),
        )
        with self._lock:
            self._turn_by_core[core_execution.id] = turn_id
            self._contexts[turn_id] = context
            self._message_parts[turn_id] = []
        try:
            receipt = self.execution_service.dispatch_execution(
                core_execution.id, inputs, self.registry, f"turn-dispatch:{turn_id}",
            )
            run = self.provider.get_handle(receipt.dispatch_id)
            run.work_id = work.id
            self.records.set_turn_dispatch(
                turn_id, work_id=work.id, execution_id=core_execution.id,
                dispatch_id=receipt.dispatch_id, state="running",
            )
            with self._lock:
                self._active[turn_id] = run
            self.on_event()
            threading.Thread(target=self._complete, args=(run,), daemon=True).start()
        except BaseException as exc:
            self.records.fail_turn(turn_id, _safe_code(exc), queue_records=self.queue)
            self.resources.release(turn_id)
            self.on_event()
            raise

    def _start_run(self, core_execution_id, dispatch_id, workspace, prompt, profile) -> _Run:
        del workspace, profile
        with self._lock:
            turn_id = self._turn_by_core[core_execution_id]
            context = self._contexts[turn_id]
        port = self.port_factory(context, lambda execution_id, kind, data: self._native_event(
            execution_id, kind, data, port,
        ))
        native_id = port.open_execution(turn_id)
        run = _Run(turn_id, "", core_execution_id, dispatch_id, port, native_id, threading.Event())
        attachments = []
        file_refs = []
        stored = json.loads(self.objects.read(context["input_object_digest"]))
        for item in (stored.get("message") or stored).get("attachments", ()):
            digest_value = item.get("_contentDigest")
            if not digest_value:
                continue
            if item.get("mediaKind") == "image":
                attachments.append({
                    "mime": item.get("_mime") or "application/octet-stream",
                    "filename": item.get("displayName") or item.get("ref"),
                    "data": base64.b64encode(self.objects.read(digest_value)).decode(),
                })
            else:
                file_refs.append(str(item.get("ref")))
        prompt_content = prompt.content
        if file_refs:
            prompt_content += "\n\nWorkspace attachments (validated):\n" + "\n".join(
                f"- {path}" for path in file_refs
            )

        def prompt_worker() -> None:
            try:
                run.result = port.prompt(turn_id, prompt_content, attachments)
            except BaseException as exc:  # surfaced by the completion owner
                run.error = exc
            finally:
                run.done.set()

        threading.Thread(target=prompt_worker, daemon=True).start()
        return run

    def _native_event(self, turn_id: str, kind: str, data: Mapping[str, Any], port) -> None:
        if kind == "message.delta":
            text = str(data.get("text", ""))
            if text:
                self.records.append_turn_event(turn_id, kind, {"text": text})
                with self._lock:
                    self._message_parts.setdefault(turn_id, []).append(text)
        elif kind == "approval.requested":
            context = self.records.get_turn_context(turn_id)
            raw = dict(data.get("request") or {})
            approval = self.approvals.request(
                session_id=context["session_id"], execution_id=turn_id, request=raw,
            )
            request_id = str(raw.get("requestId") or "")
            if request_id:
                port.register_approval(approval["approvalId"], turn_id, request_id)
                with self._lock:
                    self._approval_ports[approval["approvalId"]] = port
        elif kind == "failed":
            self.records.append_turn_event(turn_id, "tool.update", {
                "state": "failed", "tool_call_id": "harness", "tool": None,
                "summary": str(data.get("code") or "HARNESS_FAILED"),
            })
        self.on_event()

    def decide_approval(self, approval_id: str, decision: str, scope: Mapping[str, Any]) -> None:
        with self._lock:
            port = self._approval_ports.get(approval_id)
        if port is not None:
            port.decide_approval(approval_id, decision, scope)
        self.on_event()

    def _complete(self, run: _Run) -> None:
        run.done.wait()
        next_execution_id = None
        try:
            # The prompt can become idle before the abort envelope response is
            # delivered.  Serialize that race so a confirmed stop can never be
            # persisted as a successful completion.
            with run.cancel_lock:
                cancelled = run.cancel_confirmed
            if cancelled:
                self.execution_service.apply_finalization(ExecutionFinalizationRequest(
                    run.core_execution_id, f"turn-terminal:{run.turn_id}",
                    ExecutionProjection(
                        Phase.TERMINAL, Outcome.CANCELLED, False, Freshness.OBSERVED,
                        datetime.now(timezone.utc),
                    ),
                ))
                self.records.finish_cancelled(run.turn_id, queue_records=self.queue)
                self.work_service.complete_work(run.work_id, "Turn cancelled through Harness sidecar")
                return
            if run.error is not None:
                raise run.error
            with self._lock:
                text = "".join(self._message_parts.get(run.turn_id, ()))
            self.records.append_turn_event(run.turn_id, "message.final", {"text": text})
            checkpoint = self.objects.publish(json.dumps({
                "schema_version": 1, "nativeSessionId": run.native_id,
                "resumable": False, "sourceExecutionId": run.core_execution_id,
            }, sort_keys=True, separators=(",", ":")).encode())
            result = self.objects.publish(json.dumps({
                "schema_version": 1, "text": text, "nativeResult": run.result or {},
            }, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode())
            self.execution_service.apply_finalization(ExecutionFinalizationRequest(
                run.core_execution_id, f"turn-finalize:{run.turn_id}",
                ExecutionProjection(
                    Phase.TERMINAL, Outcome.SUCCEEDED, False, Freshness.OBSERVED,
                    datetime.now(timezone.utc),
                ),
                native_refs=(Ref(RefType.SESSION, self.provider.provider_id, run.native_id),),
            ))
            completed, _event = self.records.complete_turn(
                run.turn_id, checkpoint_object_digest=checkpoint.digest,
                checkpoint_native_id=run.native_id, result_object_digest=result.digest,
                queue_records=self.queue,
            )
            next_execution_id = completed.get("next_execution_id")
            self.work_service.complete_work(run.work_id, "Turn completed through Harness sidecar")
        except BaseException as exc:
            code = _safe_code(exc)
            if code == "TURN_CANCELLED":
                self.records.finish_cancelled(run.turn_id, queue_records=self.queue)
            else:
                self.records.fail_turn(run.turn_id, code, queue_records=self.queue)
        finally:
            approval_cleanup_failed = False
            try:
                self.approvals.invalidate_for_execution(run.turn_id, "execution_terminal")
            except BaseException:
                # The execution terminal fact is already durable; retain a
                # visible failed-cleanup fact and never turn it into a grant.
                approval_cleanup_failed = True
            try:
                run.port.close_execution(run.turn_id)
                self.records.mark_turn_cleanup(
                    run.turn_id, "failed" if approval_cleanup_failed else "cleaned",
                )
            except BaseException:
                self.records.mark_turn_cleanup(run.turn_id, "failed")
            with self._lock:
                self._active.pop(run.turn_id, None)
                self._contexts.pop(run.turn_id, None)
                self._message_parts.pop(run.turn_id, None)
                self._turn_by_core.pop(run.core_execution_id, None)
                self._approval_ports = {
                    key: value for key, value in self._approval_ports.items() if value is not run.port
                }
            self.resources.release(run.turn_id)
            self.provider.release_handle(run.dispatch_id)
            self.on_event()
        if next_execution_id is not None:
            try:
                self.accept(next_execution_id)
            except BaseException:
                # accept() already persisted this dispatch failure and paused
                # any still-pending items; the completed predecessor stays final.
                pass

    def cancel(self, turn_id: str) -> bool:
        with self._lock:
            run = self._active.get(turn_id)
        if run is None:
            return False
        with run.cancel_lock:
            accepted = run.port.cancel(turn_id)
            if accepted:
                run.cancel_confirmed = True
            return accepted

    def stop(self) -> bool:
        with self._lock:
            runs = list(self._active.values())
        for run in runs:
            self.cancel(run.turn_id)
        deadline = time.monotonic() + 15
        for run in runs:
            run.done.wait(max(0, deadline - time.monotonic()))
        return all(run.done.is_set() for run in runs)


def _safe_code(exc: BaseException) -> str:
    explicit = getattr(exc, "code", None)
    value = str(explicit or exc).strip().upper()
    return value if re.fullmatch(r"[A-Z][A-Z0-9_]{2,127}", value) else "EXECUTION_FAILED"
