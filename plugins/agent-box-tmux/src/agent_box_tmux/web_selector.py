from __future__ import annotations
from pathlib import Path
from typing import Mapping
from agent_box.extensions import ResourceSelection, SelectorField
from .contract import TmuxPaneV1
from .provider import TmuxConsoleResourceProvider

class TmuxPaneSelector:
    id = "tmux-pane"
    contract_id = TmuxPaneV1.contract_id
    title = "Existing tmux pane (optional)"
    fields = (SelectorField("pane", "Pane id", kind="text", required=True), SelectorField("socket", "Socket path", required=False), SelectorField("replace_policy", "Replace policy", kind="select", default="idle-shell-only"))
    def __init__(self): self.provider = None
    def bind(self, registry):
        self.provider = registry.get_resource_provider("tmux-console")
    def choices(self, parameters: Mapping[str, str]):
        panes = self.provider.list_existing_panes(socket_path=Path(parameters["socket"]).expanduser() if parameters.get("socket") else None)
        return tuple({"value": p["pane_id"], "label": f'{p["pane_id"]} {p["session_name"]}:{p["window_name"]}', "detail": p["command"] or "unknown"} for p in panes)
    def prepare(self, parameters: Mapping[str, str], *, execution_id: str) -> ResourceSelection:
        del execution_id
        ref = self.provider.make_existing_pane_ref(parameters["pane"].strip(), socket_path=Path(parameters["socket"]).expanduser() if parameters.get("socket") else None, replace_policy=parameters.get("replace_policy", "idle-shell-only"))
        return ResourceSelection(self.contract_id, ref, ref.metadata["pane_id"], f'{ref.metadata["session_name"]} · {ref.metadata["window_id"]} · {ref.metadata["pane_id"]}')
