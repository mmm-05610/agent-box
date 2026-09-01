from __future__ import annotations
from typing import Any, Mapping
from agent_box.resource_contracts import WorkspaceV1
from agent_box.extensions.api import ResourceSelection, SelectorField, SelectorCompatibility

class GitWorkspaceSelector:
    id = "git-workspace"
    contract_id = WorkspaceV1.contract_id
    title = "Git workspace"
    fields = (SelectorField("selector", "Revision", default="HEAD", help="HEAD, a branch, or an exact commit"),)
    compatibility = SelectorCompatibility(supports_exact_revision=True, requires_external_config=True, recommended=True)

    def __init__(self, provider):
        self.provider = provider
    def choices(self, parameters):
        repositories = self.provider.list_repositories()
        return tuple({"value": "HEAD", "label": f'{item.get("name")} · HEAD', "detail": item.get("git_root", item.get("path", ""))} for item in repositories)

    def prepare(self, parameters: Mapping[str, str], *, execution_id: str) -> ResourceSelection:
        del execution_id
        selector = parameters.get("selector", "HEAD").strip()
        if not selector or len(selector) > 256:
            raise ValueError("revision selector is required and bounded")
        repository_id = parameters.get("repository_id")
        ref = self.provider.make_ref_for(repository_id, selector) if repository_id and hasattr(self.provider, "make_ref_for") else self.provider.make_ref(selector)
        return ResourceSelection(
            self.contract_id, ref, selector,
            f"commit {ref.native_id} · tree {ref.metadata['tree']}",
        )
