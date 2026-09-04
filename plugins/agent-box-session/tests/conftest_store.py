"""Shared helpers for the Official Session Store plugin tests.

Imported by the test modules as ``conftest_store`` (a plain module, not a
pytest conftest, so imports stay explicit and collision-free).
"""
from __future__ import annotations

from agent_box.protocols.session import BindingSnapshot, SessionCreationRequest, TurnBeginRequest
from agent_box.work_core.models import Ref, RefType

from agent_box_session.store import StoreCallbacks


def _workspace_ref(native_id: str = "proj-1") -> Ref:
    return Ref(
        RefType.WORKSPACE,
        "local-live-workspace",
        native_id,
        metadata={
            "workspace_mode": "live",
            "mutability": "externally_mutable",
            "input_frozen": "false",
        },
    )


def _creation_request(
    key: str = "idem-create-1",
    *,
    title: str = "Probe session",
    project_identity: str = "proj-1",
    workspace_ref: Ref | None = None,
) -> SessionCreationRequest:
    return SessionCreationRequest(
        idempotency_key=key,
        title=title,
        objective="probe objective",
        workspace_ref=workspace_ref or _workspace_ref(),
        workspace_mode="live",
        project_identity=project_identity,
    )


def _binding(turn_id: str = "", **overrides) -> BindingSnapshot:
    fields = dict(
        turn_id=turn_id,
        session_watermark=0,
        harness_provider_id="fake-harness",
        harness_provider_version="1",
        workspace_ref=_workspace_ref(),
        workspace_mode="live",
    )
    fields.update(overrides)
    return BindingSnapshot(**fields)


def _begin(store, session_id: str, key: str, owner: str = "w", text: str = "hello", binding: BindingSnapshot | None = None):
    lease = store.acquire_writer_lease(session_id, owner)
    return store.begin_turn(
        TurnBeginRequest(
            session_id=session_id,
            idempotency_key=key,
            input_text=text,
            binding=binding or _binding(),
        ),
        lease,
    )


class FakeWorkAuthority:
    """In-memory stand-in for the Work Core side of the sagas."""

    def __init__(self) -> None:
        self.works: dict[str, dict] = {}
        self.executions: dict[str, dict] = {}
        self.work_fail_after_create = False
        self.execution_fail_after_create = False

    def create_work(self, work_id: str, objective: str, metadata) -> str:
        self.works[work_id] = {"objective": objective, "metadata": dict(metadata)}
        if self.work_fail_after_create:
            self.work_fail_after_create = False
            raise RuntimeError("simulated crash after work creation")
        return work_id

    def work_exists(self, work_id: str) -> bool:
        return work_id in self.works

    def create_execution(self, work_id: str, turn_id: str, provider_id: str) -> str:
        execution_id = f"exec_{turn_id}"
        self.executions[execution_id] = {
            "work_id": work_id,
            "turn_id": turn_id,
            "provider_id": provider_id,
        }
        if self.execution_fail_after_create:
            self.execution_fail_after_create = False
            raise RuntimeError("simulated crash after execution creation")
        return execution_id

    def callbacks(self) -> StoreCallbacks:
        return StoreCallbacks(
            create_work=self.create_work,
            work_exists=self.work_exists,
            create_execution=self.create_execution,
        )
