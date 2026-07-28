"""Skill management — CRUD + apply."""

from .crud import (
    delete_skill,
    get_skill,
    get_skill_agents,
    list_skills,
    set_skill_agent,
    upsert_skill,
)
from .apply import apply_skill, remove_skill_from_profile

__all__ = [
    "apply_skill",
    "delete_skill",
    "get_skill",
    "get_skill_agents",
    "list_skills",
    "remove_skill_from_profile",
    "set_skill_agent",
    "upsert_skill",
]
