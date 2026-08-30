"""Host-neutral selectors for the Preview Workbench."""
from __future__ import annotations

from typing import Any, Mapping
from agent_box.extensions import ResourceSelection, SelectorField
from agent_box.resource_contracts import AgentBoxProfileV1, PromptFragmentV1
from agent_box import config
class ProfileSelector:
    id = "agent-box-profile"
    contract_id = AgentBoxProfileV1.contract_id
    title = "Codex profile"
    fields = (SelectorField("name", "Profile", kind="select"),)
    def __init__(self): self.registry = None
    def bind(self, registry): self.registry = registry
    def choices(self, parameters: Mapping[str, str]):
        from agent_box.resources.profile import ProfileRepo
        return tuple({"value": str(p["name"]), "label": str(p.get("display_name") or p["name"]), "detail": str(p.get("agent_type") or "")} for p in ProfileRepo().list_all())
    def prepare(self, parameters: Mapping[str, str], *, execution_id: str) -> ResourceSelection:
        del execution_id
        name = parameters.get("name", "").strip()
        if not name: raise ValueError("profile is required")
        ref = self.registry.get_resource_provider("agent-box-profile").make_ref(name)
        return ResourceSelection(self.contract_id, ref, name, f"{ref.metadata.get('agent_type')} · {ref.metadata.get('digest')}")


class ResponsibilitySelector:
    id = "responsibility"
    contract_id = PromptFragmentV1.contract_id
    title = "Responsibility brief"
    fields = (SelectorField("text", "Brief"), SelectorField("title", "Title", default="responsibility", required=False))
    def __init__(self): self.registry = None
    def bind(self, registry): self.registry = registry
    def prepare(self, parameters: Mapping[str, str], *, execution_id: str) -> ResourceSelection:
        text = parameters.get("text", "").strip()
        if not text or len(text) > 32768: raise ValueError("responsibility brief is required and bounded")
        root = config.agent_box_home() / "host" / "prompts"; root.mkdir(parents=True, exist_ok=True)
        path = root / f"{execution_id}.txt"; path.write_text(text, encoding="utf-8")
        title = parameters.get("title", "responsibility").strip()[:128] or "responsibility"
        ref = self.registry.get_resource_provider("artifact-file").make_ref(path, title=title)
        return ResourceSelection(self.contract_id, ref, title, f"{ref.native_id} · {len(text)} chars")
