"""Thin horizontal / vertical separator line."""
from __future__ import annotations

import customtkinter as ctk

from ..theme import C


class Divider(ctk.CTkFrame):
    """Horizontal or vertical 1px line in ``border`` color."""

    def __init__(self, master, vertical: bool = False):
        super().__init__(
            master, fg_color=C("border"),
            height=1 if not vertical else None,
            width=1 if vertical else None,
        )
        if not vertical:
            self.pack(fill="x", padx=0, pady=0)
        else:
            self.pack(fill="y", padx=0, pady=0)