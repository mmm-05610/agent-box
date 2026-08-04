"""Skill management — apply only. CRUD is done in ACS."""

from .apply import apply_skill, remove_skill_from_profile

__all__ = [
    "apply_skill",
    "remove_skill_from_profile",
]
