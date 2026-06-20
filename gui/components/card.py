"""Reusable card containers.

Two flavors:
- ``Card`` — generic elevated surface with border and hover state.
- ``StatCard`` — pre-laid-out card for the dashboard's stat tiles
  (icon + label + big value).

See ``docs/specs/frontend-overhaul.md §4.2`` for the layout.
"""
from __future__ import annotations

import customtkinter as ctk

from ..theme import C
from ..tokens import (
    FONT_BIG,
    FONT_ICON_LG,
    FONT_LABEL,
    RADIUS_LG,
    SPACE_LG,
    SPACE_SM,
)


class Card(ctk.CTkFrame):
    """Generic elevated surface.

    Use as a container for grouped content. ``set_hover`` swaps to the
    hover palette so list items can adopt this widget without writing
    the bind/leave boilerplate themselves.
    """

    def __init__(self, master, **kwargs):
        super().__init__(
            master,
            fg_color=C("bg_elevated"),
            corner_radius=RADIUS_LG,
            border_width=1,
            border_color=C("border"),
            **kwargs,
        )

    def set_hover(self, hover: bool) -> None:
        if hover:
            self.configure(
                fg_color=C("bg_hover"),
                border_color=C("border_strong"),
            )
        else:
            self.configure(
                fg_color=C("bg_elevated"),
                border_color=C("border"),
            )


class StatCard(Card):
    """Dashboard tile — accent icon + uppercase label + large value.

    Layout (2-col grid):
        row 0: icon (left) | label (right, uppercase)
        row 1: value spans both columns
    """

    def __init__(self, master, icon: str, value: str, label: str,
                 accent: str | None = None, **kwargs):
        super().__init__(master, **kwargs)
        if accent is None:
            accent = C("primary")

        self.grid_columnconfigure(1, weight=1)

        icon_lbl = ctk.CTkLabel(
            self, text=icon, text_color=accent,
            font=FONT_ICON_LG,
        )
        icon_lbl.grid(
            row=0, column=0, sticky="w",
            padx=(SPACE_LG, 0), pady=(SPACE_LG, 0),
        )

        top_lbl = ctk.CTkLabel(
            self, text=label, text_color=C("fg_muted"),
            font=FONT_LABEL,
        )
        top_lbl.grid(
            row=0, column=1, sticky="e",
            padx=(SPACE_SM, SPACE_LG), pady=(SPACE_LG, 0),
        )

        val = ctk.CTkLabel(
            self, text=value, text_color=accent,
            font=FONT_BIG, anchor="w",
        )
        val.grid(
            row=1, column=0, columnspan=2, sticky="w",
            padx=SPACE_LG, pady=(SPACE_SM, SPACE_LG),
        )


__all__ = ["Card", "StatCard"]