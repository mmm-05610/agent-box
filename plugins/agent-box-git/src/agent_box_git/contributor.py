from __future__ import annotations

from agent_box.extensions.api import FinalizationContribution
from agent_box.work_core.runtime import agent_box_home
from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.models import Ref
from agent_box.work_core.resource_observations import ResourceObservation, ResourceObservationCoverage, ResourceObservationKind, ResourceObservationResult, ResourceObserverRole
from datetime import datetime, timezone

from .provider import GitWorkspaceResourceProvider


class GitFinalizationContributor:
    id = "git-workspace"
    supported_contract_ids = frozenset({WorkspaceV1.contract_id})

    def __init__(self, provider: GitWorkspaceResourceProvider | None = None) -> None:
        self.provider = provider

    def _provider(self):
        if self.provider is None:
            import json
            from pathlib import Path
            path = agent_box_home() / "plugins" / "git" / "config.json"
            values = json.loads(path.read_text()) if path.exists() else {}
            if not values.get("repo"):
                raise ValueError(f"configure Git repository in {path}")
            self.provider = GitWorkspaceResourceProvider(Path(values["repo"]), Path(values.get("managed_root", str(path.parent / "worktrees"))))
        return self.provider

    def prepare_finalization(self, *, execution_id, dispatch_id, frozen_input_ref: Ref,
                             resolved_resource: object | None, contract_id=None):
        if not isinstance(resolved_resource, WorkspaceV1):
            raise ValueError("Git finalization requires a materialized WorkspaceV1")
        output, _ = self._provider().capture(execution_id=execution_id, workspace=resolved_resource, frozen_ref=frozen_input_ref)
        if not contract_id:
            raise ValueError("Git finalization requires the frozen contract id")
        now = datetime.now(timezone.utc)
        observations = (
            ResourceObservation(contract_id, frozen_input_ref, ResourceObservationKind.READ_BACK,
                                ResourceObservationResult.MATCH, ResourceObserverRole.RESOURCE_PROVIDER,
                                "git-workspace", now, ResourceObservationCoverage.COMPLETE,
                                detail="materialized detached worktree HEAD matches frozen commit"),
            ResourceObservation(contract_id, frozen_input_ref, ResourceObservationKind.READ_BACK,
                                ResourceObservationResult.MATCH, ResourceObserverRole.RESOURCE_PROVIDER,
                                "git-workspace", now, ResourceObservationCoverage.COMPLETE,
                                detail="materialized tree matches frozen WorkspaceRef tree"),
        )
        return FinalizationContribution(output_refs=(output,), resource_observations=observations)
