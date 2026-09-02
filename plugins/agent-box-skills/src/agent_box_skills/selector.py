from __future__ import annotations

from typing import Mapping
from agent_box.protocols.host import ResourceSelection, SelectorCompatibility, SelectorField
from agent_box.resource_contracts import AgentSkillV1


class SkillSelector:
    id = "agent-skill"
    contract_id = AgentSkillV1.contract_id
    title = "Agent Skill"
    fields = (SelectorField("skill_id", "Skill", required=True), SelectorField("revision", "Revision", required=False), SelectorField("digest", "Digest", required=False))
    compatibility = SelectorCompatibility(supports_multi_slot=True, supports_exact_revision=True)

    def __init__(self, store): self.store = store

    def prepare(self, parameters: Mapping[str, str], *, execution_id: str) -> ResourceSelection:
        del execution_id
        skill_id = str(parameters.get("skill_id", "")).strip()
        revision = int(parameters["revision"]) if parameters.get("revision") else None
        ref = self.store.ref(skill_id, revision)
        if parameters.get("digest") and parameters["digest"] != ref.metadata["digest"]:
            raise ValueError("SKILL_DIGEST_MISMATCH")
        return ResourceSelection(self.contract_id, ref, f"{skill_id} requested", f"{skill_id} r{ref.metadata['revision']} {ref.metadata['digest']}")

    def choices(self, query: Mapping[str, str] | None = None):
        needle = str((query or {}).get("q", "")).lower()
        return tuple({"value": skill.skill_id, "label": f"{skill.name} · r{skill.revision} · {skill.digest}", "description": skill.description} for skill in self.store.list() if not needle or needle in skill.name.lower() or needle in skill.description.lower())
