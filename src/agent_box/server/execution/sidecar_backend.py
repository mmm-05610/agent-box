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
from agent_box.server.execution.sidecar import SidecarError, SidecarHarnessPort
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
    #: The worker that persists the durable turn result. It outlives the prompt
    #: worker by design, so a runtime is only really stopped once it is done:
    #: the Work Core connection is shared and is not safe to use after shutdown.
    completion_thread: threading.Thread | None = None


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
        """Work Core execution-provider operation contract (NOT Harness abilities).

        This mapping belongs to the Work Core SPI: `ExtensionRegistry.require_capability`
        reads it to decide whether a provider may be asked for an operation, and its
        keys are Work Core operation names (`streaming`, `cancel`, `approvals`).

        The Harness capability contract is a *different* namespace with a different
        question ("what can this harness do, as declared and observed?"), and the
        two must never be projected into one another: these keys are not canonical
        abilities, they must not reach a Profile view, a Session/execution effective
        capability view, `server.hello` or a deployment's `capabilityClaims`, and a
        canonical ability must not be invented here. `test_capability_namespace_boundary.py`
        fails if that separation is broken.
        """
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
        #: Completion workers still running. A run is retired from `_active` when
        #: its durable result is written, but the worker itself may still be
        #: finishing; stopping must wait for every live one, so they are tracked
        #: here rather than only on the run.
        self._completion_threads: set[threading.Thread] = set()
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
            run.completion_thread = threading.Thread(
                target=self._complete_then_retire, args=(run,), daemon=True,
            )
            with self._lock:
                self._completion_threads.add(run.completion_thread)
            run.completion_thread.start()
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
        # 附件先投影出来（有界对象读取），再打开执行：有效 attach=false 时必须在派发前
        # 类型化拒绝，而不是打开一个原生会话再静默丢弃附件。
        stored = json.loads(self.objects.read(context["input_object_digest"]))
        attachments, file_refs = _sidecar_attachments(self.objects, stored)
        native_id = port.open_execution(turn_id)
        if attachments and not _effective_attachment_support(port, turn_id):
            # 拒绝时不留一个没有归属的原生会话（否则 _complete 永远不会回收它）。
            try:
                port.close_execution(turn_id)
            except BaseException:
                pass
            raise SidecarError(
                "ATTACHMENT_UNSUPPORTED",
                "this execution has no effective 'attach' capability",
            )
        run = _Run(turn_id, "", core_execution_id, dispatch_id, port, native_id, threading.Event())
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
                # A cancel is not an erasure. The Harness kept writing its own
                # home up to the moment it stopped; audit what is there now and
                # keep the reference, so the next turn reopens the same native
                # session and sees the input that was already on disk. If the
                # audit itself cannot run, the record honestly stays as it was.
                try:
                    audit, native_resume_supported = _audited_home(run)
                    manifest = {
                        "schema_version": 3,
                        "nativeSessionId": run.native_id,
                        "harnessType": self._contexts[run.turn_id]["harness_type"],
                        "nativePlatform": audit["nativePlatform"],
                        "homeLocator": audit["homeLocator"],
                        "resumable": bool(native_resume_supported and audit["files"]),
                        "sourceExecutionId": run.core_execution_id,
                        "audited": audit["audited"],
                        "truncated": audit["truncated"],
                        "files": audit["files"],
                    }
                    checkpoint = self.objects.publish(
                        json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
                    )
                except BaseException:
                    checkpoint = None
                self.records.finish_cancelled(
                    run.turn_id, queue_records=self.queue,
                    **({"checkpoint_object_digest": checkpoint.digest,
                        "checkpoint_native_id": run.native_id,
                        "native_platform": audit["nativePlatform"],
                        "home_locator": audit["homeLocator"]} if checkpoint is not None else {}),
                )
                self.work_service.complete_work(run.work_id, "Turn cancelled through Harness sidecar")
                return
            if run.error is not None:
                raise run.error
            with self._lock:
                text = "".join(self._message_parts.get(run.turn_id, ()))
            audit, native_resume_supported = _audited_home(run)
            resumable = bool(native_resume_supported and audit["files"])
            # The manifest is a *record*: it references the home on the machine
            # that ran the turn (platform + locator, never a host path) and
            # fixes what that home looked like when the turn ended. The native
            # bytes themselves are never published.
            checkpoint = self.objects.publish(json.dumps({
                "schema_version": 3, "nativeSessionId": run.native_id,
                "harnessType": self._contexts[run.turn_id]["harness_type"],
                "nativePlatform": audit["nativePlatform"],
                "homeLocator": audit["homeLocator"],
                "resumable": resumable,
                "sourceExecutionId": run.core_execution_id,
                "audited": audit["audited"],
                "truncated": audit["truncated"],
                "files": audit["files"],
            }, sort_keys=True, separators=(",", ":")).encode())
            result = self.objects.publish(json.dumps({
                "schema_version": 1, "text": text, "nativeResult": run.result or {},
            }, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode())
            self.records.append_turn_event(run.turn_id, "message.final", {"text": text})
            self.execution_service.apply_finalization(ExecutionFinalizationRequest(
                run.core_execution_id, f"turn-finalize:{run.turn_id}",
                ExecutionProjection(
                    Phase.TERMINAL, Outcome.SUCCEEDED, resumable, Freshness.OBSERVED,
                    datetime.now(timezone.utc),
                ),
                native_refs=(Ref(RefType.SESSION, self.provider.provider_id, run.native_id),),
            ))
            completed, _event = self.records.complete_turn(
                run.turn_id, checkpoint_object_digest=checkpoint.digest,
                checkpoint_native_id=run.native_id, result_object_digest=result.digest,
                queue_records=self.queue,
                native_platform=audit["nativePlatform"], home_locator=audit["homeLocator"],
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

    def _complete_then_retire(self, run: "_Run") -> None:
        """Run the durable completion and stop being a live worker afterwards."""
        try:
            self._complete(run)
        finally:
            with self._lock:
                self._completion_threads.discard(threading.current_thread())

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

    #: How long `stop()` waits for prompts and durable completions to settle.
    STOP_DEADLINE_SECONDS = 15.0

    def stop(self) -> bool:
        with self._lock:
            runs = list(self._active.values())
        for run in runs:
            self.cancel(run.turn_id)
        deadline = time.monotonic() + self.STOP_DEADLINE_SECONDS
        for run in runs:
            run.done.wait(max(0, deadline - time.monotonic()))
        # The prompt worker finishing is not the end of the turn: the completion
        # worker still writes the durable result through the shared Work Core
        # connection. Returning before it finishes let a later shutdown (or the
        # next test) reset that connection underneath it, which crashed the
        # interpreter inside SQLite. Wait for it, bounded, and report honestly.
        for thread in list(self._completion_threads):
            thread.join(max(0, deadline - time.monotonic()))
        prompts_done = all(run.done.is_set() for run in runs)
        with self._lock:
            # Keep the set meaning "workers still running": a finished worker is
            # retired here even if it was not started through the wrapper.
            self._completion_threads = {
                thread for thread in self._completion_threads if thread.is_alive()
            }
            completions_done = not self._completion_threads
        return prompts_done and completions_done


def _sidecar_attachments(
    objects, stored: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Project stored attachments into (native image attachments, file refs).

    Image bytes are read from the bounded object store only when the attachment
    carries a content digest; every other attachment stays a workspace file
    reference that the prompt text may name.
    """
    attachments: list[dict[str, Any]] = []
    file_refs: list[str] = []
    for item in (stored.get("message") or stored).get("attachments", ()):
        digest_value = item.get("_contentDigest")
        if not digest_value:
            continue
        if item.get("mediaKind") == "image":
            attachments.append({
                "mime": item.get("_mime") or "application/octet-stream",
                "filename": item.get("displayName") or item.get("ref"),
                "data": base64.b64encode(objects.read(digest_value)).decode(),
            })
        else:
            file_refs.append(str(item.get("ref")))
    return attachments, file_refs


def _effective_attachment_support(port, execution_id: str) -> bool:
    """Read the effective `attach` capability from the port's canonical view.

    The answer comes from the intersection of the deployment's static
    declaration and what this execution actually observed, never from a stored
    snapshot or from the mere presence of an attachment.
    """
    view = port.effective_capabilities(execution_id)
    for entry in view.get("capabilities", ()):
        if entry.get("id") == "attach":
            return bool(entry.get("supported"))
    return False


def _audited_home(run: "_Run") -> tuple[dict[str, Any], bool]:
    """Audit the home of a finished attempt, applying the credential rule.

    An injected value found in the home means the one-shot projection leaked:
    the file that carries it is deleted (the home stays usable for the next
    turn), and the typed failure records the fact - the turn does not pass
    with a secret sitting in a durable directory.
    """
    try:
        return run.port.capture_execution(run.turn_id)
    except BaseException as exc:
        if getattr(exc, "code", None) == "SIDECAR_STATE_CONTAINS_SECRET":
            relative = getattr(exc, "path", None)
            if relative:
                try:
                    run.port.delete_home_file(run.turn_id, relative)
                except BaseException:  # noqa: BLE001 - the leak failure stands
                    pass
        raise


def _safe_code(exc: BaseException) -> str:
    explicit = getattr(exc, "code", None)
    value = str(explicit or exc).strip().upper()
    return value if re.fullmatch(r"[A-Z][A-Z0-9_]{2,127}", value) else "EXECUTION_FAILED"
