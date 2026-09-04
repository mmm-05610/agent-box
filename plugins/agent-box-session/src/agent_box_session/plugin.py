"""agent-box-session: Official Session Store plugin (API v2)."""
from __future__ import annotations

from datetime import datetime, timezone

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from agent_box.protocols.session import SessionTurnInputV1, session_store_contribution
from agent_box.work_core.events import CoreEvent, EventType, execution_created_event
from agent_box.work_core.models import Execution, Work, WorkLifecycle
from agent_box.work_core.projection import ExecutionProjection, Freshness, Phase
from agent_box.work_core.repository import CoreRepository, ExecutionNotFound, WorkNotFound
from agent_box.work_core.services import WorkService

from .provider import SessionInputResourceProvider
from .store import SQLiteSessionStore, StoreCallbacks

PLUGIN_ID = "session"


class SessionPlugin:
    """Owns the concrete Official Session Store authority.

    The plugin wires the store's idempotent cross-authority callbacks to the
    real Work Core; the Work Core database and the session-store database
    remain two independent authorities joined only by resumable sagas.
    """

    def descriptor(self) -> PluginDescriptor:
        return PluginDescriptor(
            PLUGIN_ID,
            "Agent-Box Official Session Store",
            "2.0.0a1",
            description=(
                "Durable Official Session authority: sessions, turns, ledger, "
                "watermark, lease, idempotency, recovery"
            ),
        )

    def build(self, context: PluginContext) -> PluginRegistration:
        store = SQLiteSessionStore(
            context.plugin_data_dir / "session-store.db",
            callbacks=self._callbacks(),
        )
        return PluginRegistration(
            contracts=(SessionTurnInputV1,),
            resource_providers=(SessionInputResourceProvider(store),),
            contributions=(session_store_contribution(store),),
        )

    @staticmethod
    def _callbacks() -> StoreCallbacks:
        repository = CoreRepository()

        def create_work(work_id: str, objective: str, metadata) -> str:
            now = datetime.now(timezone.utc)
            work = Work(
                work_id,
                objective,
                WorkLifecycle.OPEN,
                now,
                now,
                metadata=dict(metadata or {}),
            )
            repository.create_work(
                work,
                CoreEvent(
                    f"evt_create_{work_id}",
                    EventType.WORK_CREATED,
                    work_id,
                    now,
                    {"objective": objective[:256]},
                ),
            )
            return work_id

        def work_exists(work_id: str) -> bool:
            try:
                repository.get_work(work_id)
            except WorkNotFound:
                return False
            return True

        def create_execution(work_id: str, turn_id: str, provider_id: str) -> str:
            execution_id = f"exec_{turn_id}"
            try:
                repository.get_execution(execution_id)
            except ExecutionNotFound:
                now = datetime.now(timezone.utc)
                projection = ExecutionProjection(Phase.UNKNOWN, None, None, Freshness.STALE, now)
                execution = Execution(
                    execution_id, work_id, provider_id, projection, now,
                    provenance={"turn_id": turn_id},
                )
                repository.create_execution(
                    execution,
                    execution_created_event(
                        f"evt_create_{execution_id}",
                        execution_id,
                        now,
                        provider_id=provider_id,
                        responsibility_intent="session_turn",
                    ),
                )
            return execution_id

        return StoreCallbacks(
            create_work=create_work,
            work_exists=work_exists,
            create_execution=create_execution,
        )


def create_plugin():
    return SessionPlugin()
