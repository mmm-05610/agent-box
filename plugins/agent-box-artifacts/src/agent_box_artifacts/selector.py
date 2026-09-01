from __future__ import annotations

from typing import Mapping

from agent_box.work_core.runtime import agent_box_home
from agent_box.extensions import ResourceSelection, SelectorField


class ResponsibilitySelector:
    id = "responsibility"
    contract_id = "agent-box.prompt-fragment@1"
    title = "Responsibility brief"
    fields = (
        SelectorField("text", "Brief"),
        SelectorField("title", "Title", default="responsibility", required=False),
    )

    def __init__(self):
        self.registry = None

    def bind_registry(self, registry):
        self.registry = registry

    def prepare(self, parameters: Mapping[str, str], *, execution_id: str) -> ResourceSelection:
        text = parameters.get("text", "").strip()
        if not text or len(text) > 32768:
            raise ValueError("responsibility brief is required and bounded")
        root = agent_box_home() / "host" / "prompts"
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{execution_id}.txt"
        path.write_text(text, encoding="utf-8")
        title = parameters.get("title", "responsibility").strip()[:128] or "responsibility"
        ref = self.registry.get_resource_provider("artifact-file").make_ref(path, title=title)
        return ResourceSelection(self.contract_id, ref, title,
                                 f"{ref.native_id} · {len(text)} chars")
