"""Prompt (Claude.md) template management — CRUD + apply."""

from .crud import (
    add_claude_md,
    delete_claude_md,
    edit_claude_md,
    get_claude_md,
    list_claude_mds,
    upsert_claude_md,
)
from .apply import apply_claude_md

__all__ = [
    "add_claude_md",
    "apply_claude_md",
    "delete_claude_md",
    "edit_claude_md",
    "get_claude_md",
    "list_claude_mds",
    "upsert_claude_md",
]
