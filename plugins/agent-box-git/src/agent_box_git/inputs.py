from __future__ import annotations
from typing import Any, Mapping
from agent_box.resource_contracts import WorkspaceV1
from agent_box.extensions.api import ResourceSelection, SelectorField

class GitWorkspaceSelector:
    id = "git-workspace"
    contract_id = WorkspaceV1.contract_id
    title = "Git workspace"
    fields = (SelectorField("selector", "Revision", default="HEAD", help="HEAD, a branch, or an exact commit"),)

    def __init__(self, provider):
        self.provider = provider

    def prepare(self, parameters: Mapping[str, str], *, execution_id: str) -> ResourceSelection:
        del execution_id
        selector = parameters.get("selector", "HEAD").strip()
        if not selector or len(selector) > 256:
            raise ValueError("revision selector is required and bounded")
        ref = self.provider.make_ref(selector)
        return ResourceSelection(
            self.contract_id, ref, selector,
            f"commit {ref.native_id} · tree {ref.metadata['tree']}",
        )
