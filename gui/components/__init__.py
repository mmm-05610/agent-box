"""Reusable CustomTkinter widgets for the agent-box GUI."""
from __future__ import annotations

from .button import danger_button, ghost_button, icon_button, primary_button
from .card import Card, StatCard
from .divider import Divider
from .markdown import SAVE_DEBOUNCE_MS, MarkdownEditor
from .provider import PROVIDERS, ProviderSelector
from .sidebar import NAV_ITEMS, Sidebar
from .status import Badge, StatusPill
from .toast import ToastManager

__all__ = [
    "Badge",
    "Card",
    "Divider",
    "MarkdownEditor",
    "NAV_ITEMS",
    "PROVIDERS",
    "ProviderSelector",
    "SAVE_DEBOUNCE_MS",
    "Sidebar",
    "StatCard",
    "StatusPill",
    "ToastManager",
    "danger_button",
    "ghost_button",
    "icon_button",
    "primary_button",
]