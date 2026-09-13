"""Work Order 37 historical Codex execution path.

NOT part of production assembly: nothing in `server/bootstrap` imports this
module. It is retained so the retained 37 stage-C regression suites keep
exercising the recorded behavior while Work Order 40 replaces the native
path with the fixed third-party Harness integration.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import PurePosixPath
import re
import threading
import time
from typing import Any, Callable, Mapping

from agent_box.resource_contracts import (
    AgentBoxProfileV1,
    CredentialRefV1,
    PromptFragmentV1,
    WorkspaceV1,
)
from agent_box.server.errors import ServerError
from agent_box.server.persistence import ProductRepositoryView as ProductRepository
from agent_box.storage import ObjectStore, SecretStore
from agent_box.work_core import (
    ExecutionFinalizationRequest,
    ExecutionProjection,
    Freshness,
    Outcome,
    Phase,
    ProviderDescriptor,
    Ref,
    RefType,
)
from agent_box.work_core.registry import ExtensionRegistry
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.services import ExecutionService, WorkService
from agent_box_harnesses.codex.contracts import CodexContinuationV1
from agent_box_harnesses.codex.remote import (
    RemoteCodexExecutionProvider,
    classify_native_session_path,
    decode_codex_jsonl,
    materialize_remote_credential,
)
from agent_box_runtime_wsl import WslAttempt, WslExecutionTransport


@dataclass
class ActiveTurn:
    turn_id: str
    work_id: str
    execution_id: str
    dispatch_id: str
    attempt: WslAttempt
    continuation_id: str | None
    done: threading.Event


class _BoundResources:
    provider_id = "server-turn-input"
    supported_contract_ids = frozenset({
        WorkspaceV1.contract_id,
        PromptFragmentV1.contract_id,
        AgentBoxProfileV1.contract_id,
        CredentialRefV1.contract_id,
        CodexContinuationV1.contract_id,
    })

    def __init__(self) -> None:
        self._values: dict[tuple[str, str], object] = {}
        self._lock = threading.Lock()

    def descriptor(self):
        return ProviderDescriptor(self.provider_id, "Server frozen Turn inputs", "1")

    def bind(self, contract_id: str, native_id: str, value: object) -> Ref:
        with self._lock:
            self._values[(contract_id, native_id)] = value
        ref_type = (
            RefType.WORKSPACE if contract_id == WorkspaceV1.contract_id else
            RefType.SESSION if contract_id == CodexContinuationV1.contract_id else
            RefType.ARTIFACT
        )
        return Ref(ref_type, self.provider_id, native_id)

    def resolve(self, contract_id: str, ref: Ref, *, context=None) -> object:
        del context
        if ref.provider != self.provider_id:
            raise ValueError("SERVER_INPUT_REF_MISMATCH")
        try:
            return self._values[(contract_id, ref.native_id)]
        except KeyError as exc:
            raise ValueError("SERVER_INPUT_NOT_BOUND") from exc

    def release_turn(self, turn_id: str) -> None:
        suffixes = {
            turn_id, f"workspace-{turn_id}", f"profile-{turn_id}",
            f"credential-{turn_id}", f"continuation-{turn_id}",
        }
        with self._lock:
            self._values = {
                key: value for key, value in self._values.items()
                if key[1] not in suffixes
            }


class CodexExecutionBackend:
    def __init__(
        self, repository: ProductRepository, objects: ObjectStore,
        secrets: SecretStore, transport: WslExecutionTransport,
        *, on_event: Callable[[], None] | None = None,
    ) -> None:
        self.repository = repository
        self.objects = objects
        self.secrets = secrets
        self.transport = transport
        self.on_event = on_event or (lambda: None)
        self.core_repository = CoreRepository()
        self.work_service = WorkService(self.core_repository)
        self.execution_service = ExecutionService(self.core_repository)
        self.resources = _BoundResources()
        self.provider = RemoteCodexExecutionProvider(
            profile_loader=self._load_configuration,
            attempt_starter=self,
        )
        self.registry = ExtensionRegistry()
        self.registry.register_contract(CodexContinuationV1)
        self.registry.register_resource_provider(self.resources.provider_id, self.resources)
        self.registry.register_execution_provider(self.provider)
        self._active: dict[str, ActiveTurn] = {}
        self._lock = threading.Lock()

    def _load_configuration(self, digest: str) -> Mapping[str, Any]:
        value = json.loads(self.objects.read(digest))
        if value.get("schema_version") != 1 or value.get("harness_type") != "codex":
            raise ValueError("CODEX_PROFILE_OBJECT_INVALID")
        return value["configuration"]

    def accept(self, turn_id: str, *, overrides: Mapping[str, Any] | None = None) -> None:
        handle = None
        receipt = None
        context = self.repository.get_turn_context(turn_id)
        input_value = json.loads(self.objects.read(context["input_object_digest"]))
        profile_value = json.loads(self.objects.read(context["config_object_digest"]))
        configuration = dict(profile_value["configuration"])
        if overrides:
            configuration.update(overrides)
        effective = self.objects.publish(json.dumps(
            {"schema_version": 1, "harness_type": "codex", "configuration": configuration},
            ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        ).encode())
        work = self.work_service.create_work(
            "AgentBox Session Turn", metadata={"session_id": context["session_id"], "turn_id": turn_id},
        )
        execution = self.execution_service.create_execution(
            work.id, self.provider.provider_id,
            responsibility_intent="execute one accepted Session Turn",
            provenance={"session_id": context["session_id"], "turn_id": turn_id},
        )
        inputs = [
            (WorkspaceV1.contract_id, self.resources.bind(
                WorkspaceV1.contract_id, f"workspace-{turn_id}",
                WorkspaceV1(PurePosixPath(context["remote_path"]), "remote-live"),
            )),
            (PromptFragmentV1.contract_id, self.resources.bind(
                PromptFragmentV1.contract_id, turn_id,
                PromptFragmentV1("User Turn", input_value["text"], context["input_object_digest"]),
            )),
            (AgentBoxProfileV1.contract_id, self.resources.bind(
                AgentBoxProfileV1.contract_id, f"profile-{turn_id}",
                AgentBoxProfileV1(context["profile_id"], "codex", effective.digest,
                                  int(context["profile_revision"])),
            )),
            (CredentialRefV1.contract_id, self.resources.bind(
                CredentialRefV1.contract_id, f"credential-{turn_id}",
                CredentialRefV1("server-secret-store", context["credential_id"], "codex"),
            )),
        ]
        if context["checkpoint_native_id"]:
            inputs.append((CodexContinuationV1.contract_id, self.resources.bind(
                CodexContinuationV1.contract_id, f"continuation-{turn_id}",
                CodexContinuationV1(context["checkpoint_native_id"]),
            )))
        try:
            receipt = self.execution_service.dispatch_execution(
                execution.id, tuple(inputs), self.registry, f"turn-dispatch:{turn_id}",
            )
            handle = self.provider.get_handle(receipt.dispatch_id)
            active = ActiveTurn(
                turn_id, work.id, execution.id, receipt.dispatch_id,
                handle, context["checkpoint_native_id"], threading.Event(),
            )
            with self._lock:
                self._active[turn_id] = active
            self.repository.set_turn_dispatch(
                turn_id, work_id=work.id, execution_id=execution.id,
                dispatch_id=receipt.dispatch_id,
            )
            self.on_event()
            threading.Thread(target=self._complete, args=(active,), daemon=True).start()
        except BaseException as exc:
            code = _safe_code(exc)
            if handle is not None:
                try:
                    self.transport.cancel(handle)
                except BaseException:
                    pass
                abandon = getattr(self.transport, "abandon", None)
                if callable(abandon):
                    try:
                        abandon(handle)
                    except BaseException:
                        pass
            if receipt is not None:
                self.provider.release_handle(receipt.dispatch_id)
            self.resources.release_turn(turn_id)
            self.repository.fail_turn(turn_id, code)
            if code not in {"WORKER_DISCONNECTED", "DISPATCH_AMBIGUOUS"}:
                self._finalize(execution.id, turn_id, Outcome.FAILED)
                self.work_service.complete_work(work.id, f"Turn failed: {code}")
            self.on_event()
            raise

    def start_codex_attempt(
        self, *, request, workspace, profile, credential, continuation, plan,
    ) -> WslAttempt:
        turn_id = next(
            item.ref.native_id for item in request.resolved_inputs
            if item.contract_id == PromptFragmentV1.contract_id
        )
        context = self.repository.get_turn_context(turn_id)
        record = self.repository.get_credential(credential.native_locator, kind="codex-login")
        try:
            material = self.secrets.read(record["secret_locator"])
        except BaseException as exc:
            raise RuntimeError("CREDENTIAL_UNAVAILABLE") from exc
        restored: dict[str, bytes] = {}
        if continuation is not None:
            restored = self._restore_checkpoint(context, continuation.thread_id)
        try:
            projection = materialize_remote_credential(plan, material)
            attempt = self.transport.start(
                workspace=context, attempt_id=request.dispatch_id,
                generation=int(context["native_generation"]) + 1,
                plan=plan, credential=projection.content,
                credential_target=projection.target,
                projected_files=projection.view_files,
                restored_files=restored,
            )
            self.repository.mark_workspace_verified(context["workspace_id"])
            return attempt
        finally:
            material = b""

    def _restore_checkpoint(self, context: Mapping[str, Any], thread_id: str) -> dict[str, bytes]:
        digest = context.get("checkpoint_object_digest")
        if not digest:
            raise ValueError("CONTINUATION_REF_STALE")
        manifest = json.loads(self.objects.read(digest))
        if manifest.get("thread_id") != thread_id or manifest.get("schema_version") != 1:
            raise ValueError("CONTINUATION_REF_STALE")
        result = {}
        for item in manifest.get("files", ()):
            path = item.get("path")
            if not classify_native_session_path(path, thread_id):
                raise ValueError("CONTINUATION_STATE_CLASSIFICATION_FAILED")
            content = self.objects.read(item["digest"])
            if len(content) != item["size"]:
                raise ValueError("CONTINUATION_STATE_DIGEST_MISMATCH")
            result[path] = content
        if not result:
            raise ValueError("CONTINUATION_REF_STALE")
        return result

    def _complete(self, active: ActiveTurn) -> None:
        try:
            terminal = self.transport.wait(active.attempt, timeout=125)
            stdout, stdout_digest = self.transport.result_bytes(active.attempt, "stdout")
            _stderr, stderr_digest = self.transport.result_bytes(active.attempt, "stderr")
            decoded = decode_codex_jsonl(stdout)
            if terminal.get("cancelled"):
                raise RuntimeError("TURN_CANCELLED")
            if terminal.get("timedOut"):
                raise RuntimeError("TURN_TIMEOUT")
            if terminal.get("exitCode") != 0 or not decoded.completed or decoded.error_code:
                raise RuntimeError(decoded.error_code or "CODEX_EXECUTION_FAILED")
            if not decoded.thread_id:
                raise RuntimeError("CODEX_THREAD_ID_MISSING")
            if active.continuation_id and decoded.thread_id != active.continuation_id:
                raise RuntimeError("CODEX_THREAD_ID_CONFLICT")
            for message in decoded.messages:
                self.repository.append_turn_event(
                    active.turn_id, "message.delta", {"text": message},
                )
                self.on_event()
            self.repository.set_turn_dispatch(
                active.turn_id, work_id=active.work_id,
                execution_id=active.execution_id, dispatch_id=active.dispatch_id,
                state="capturing",
            )
            self.on_event()
            captured = []
            for item in self.transport.list_view(active.attempt):
                path = item.get("path")
                if not classify_native_session_path(path, decoded.thread_id):
                    continue
                content, digest = self.transport.view_bytes(active.attempt, path)
                record = self.objects.publish(content)
                if record.digest != digest or record.size != item.get("size"):
                    raise RuntimeError("CODEX_CAPTURE_DIGEST_MISMATCH")
                captured.append({"path": path, "digest": digest, "size": record.size})
            if not captured:
                raise RuntimeError("CODEX_NATIVE_STATE_MISSING")
            checkpoint = self.objects.publish(json.dumps({
                "schema_version": 1, "thread_id": decoded.thread_id,
                "source_execution_id": active.execution_id, "files": captured,
            }, sort_keys=True, separators=(",", ":")).encode())
            output = self.objects.publish(stdout)
            now = datetime.now(timezone.utc)
            self.execution_service.apply_finalization(ExecutionFinalizationRequest(
                active.execution_id,
                f"turn-finalize:{active.turn_id}",
                ExecutionProjection(Phase.TERMINAL, Outcome.SUCCEEDED, False, Freshness.OBSERVED, now),
                native_refs=(Ref(RefType.SESSION, self.provider.provider_id, decoded.thread_id),),
                output_refs=(Ref(RefType.ARTIFACT, self.provider.provider_id, stdout_digest,
                                 metadata={"stderr_digest": stderr_digest}),),
            ))
            self.repository.complete_turn(
                active.turn_id, checkpoint_object_digest=checkpoint.digest,
                checkpoint_native_id=decoded.thread_id,
                result_object_digest=output.digest,
            )
            self.on_event()
            try:
                self.transport.acknowledge_and_cleanup(active.attempt)
                self.repository.mark_turn_cleanup(active.turn_id, "cleaned")
            except BaseException:
                self.repository.mark_turn_cleanup(active.turn_id, "failed")
            self.work_service.complete_work(active.work_id, "Turn completed and captured")
        except BaseException as exc:
            code = _safe_code(exc)
            if code == "TURN_CANCELLED":
                self.repository.finish_cancelled(active.turn_id)
            else:
                self.repository.fail_turn(active.turn_id, code)
            if code not in {"WORKER_DISCONNECTED", "DISPATCH_AMBIGUOUS"}:
                outcome = Outcome.CANCELLED if code == "TURN_CANCELLED" else Outcome.FAILED
                try:
                    self._finalize(active.execution_id, active.turn_id, outcome)
                    self.work_service.complete_work(active.work_id, f"Turn ended: {code}")
                except BaseException:
                    pass
            abandon = getattr(self.transport, "abandon", None)
            if callable(abandon):
                try:
                    abandon(active.attempt)
                except BaseException:
                    pass
            self.on_event()
        finally:
            with self._lock:
                self._active.pop(active.turn_id, None)
            self.provider.release_handle(active.dispatch_id)
            self.resources.release_turn(active.turn_id)
            active.done.set()

    def _finalize(self, execution_id: str, turn_id: str, outcome: Outcome) -> None:
        self.execution_service.apply_finalization(ExecutionFinalizationRequest(
            execution_id, f"turn-terminal:{turn_id}",
            ExecutionProjection(
                Phase.TERMINAL, outcome, False, Freshness.OBSERVED,
                datetime.now(timezone.utc),
            ),
        ))

    def cancel(self, turn_id: str) -> bool:
        with self._lock:
            active = self._active.get(turn_id)
        if active is None:
            return False
        return self.transport.cancel(active.attempt)

    def stop(self) -> bool:
        with self._lock:
            active = list(self._active.values())
        for item in active:
            try:
                self.transport.cancel(item.attempt)
            except BaseException:
                pass
        deadline = time.monotonic() + 15
        for item in active:
            item.done.wait(max(0, deadline - time.monotonic()))
        return all(item.done.is_set() for item in active)


def _safe_code(exc: BaseException) -> str:
    chain = []
    current: BaseException | None = exc
    while current is not None and current not in chain:
        chain.append(current)
        current = current.__cause__ or current.__context__
    pattern = re.compile(r"^[A-Z][A-Z0-9_]{2,127}$")
    for item in reversed(chain):
        explicit = getattr(item, "code", None)
        values = (explicit, str(item)) if explicit else (str(item),)
        for value in values:
            if isinstance(value, str) and pattern.fullmatch(value.strip().upper()):
                return value.strip().upper()
    return "EXECUTION_FAILED"
