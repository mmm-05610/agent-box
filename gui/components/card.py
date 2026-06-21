"""Reusable card containers — cc-switch / shadcn/ui style.

Two flavors:
- ``Card`` — generic elevated surface with subtle border, no shadow.
- ``StatCard`` — pre-laid-out card for the dashboard's stat tiles.

Style: minimal, 8px radius, 1px border nearly invisible, no hover flash.
"""
from __future__ import annotations

import customtkinter as ctk

from ..theme import C
from ..tokens import (
    FONT_BIG,
    FONT_CAPTION,
    FONT_ICON_LG,
    FONT_LABEL,
    FONT_MICRO,
    RADIUS_LG,
    SPACE_LG,
    SPACE_SM,
    SPACE_XL,
)


class Card(ctk.CTkFrame):
    """Generic elevated surface — cc-switch style.

    Minimal: bg_card + 1px subtle border + 8px radius.
    No shadow, no dramatic hover effects.
    """

    def __init__(self, master, **kwargs):
        super().__init__(
            master,
            fg_color=kwargs.pop("fg_color", C("bg_elevated")),
            corner_radius=kwargs.pop("corner_radius", RADIUS_LG),
            border_width=kwargs.pop("border_width", 1),
            border_color=kwargs.pop("border_color", C("border")),
            **kwargs,
        )

    def set_hover(self, hover: bool) -> None:
        """Subtle hover — cc-switch uses very muted bg change."""
        if hover:
            self.configure(
                fg_color=C("bg_hover"),
                border_color=C("border"),
            )
        else:
            self.configure(
                fg_color=C("bg_elevated"),
                border_color=C("border"),
            )


class StatCard(Card):
    """Dashboard tile — cc-switch style: compact, left-aligned.

    Layout:
        Icon (left) | Value (big) + Label (small, right)
    """

    def __init__(self, master, icon: str, value: str, label: str,
                 accent: str | None = None, **kwargs):
        super().__init__(master, **kwargs)
        if accent is None:
            accent = C("fg")

        self.grid_columnconfigure(1, weight=1)

        # Icon — muted, not accent-colored
        icon_lbl = ctk.CTkLabel(
            self, text=icon, text_color=C("fg_subtle"),
            font=FONT_ICON_LG,
        )
        icon_lbl.grid(
            row=0, column=0, rowspan=2,
            padx=(SPACE_LG, SPACE_SM), pady=SPACE_LG,
            sticky="w",
        )

        # Value — big, primary text color
        val = ctk.CTkLabel(
            self, text=value, text_color=C("fg"),
            font=FONT_BIG, anchor="w",
        )
        val.grid(
            row=0, column=1, sticky="sw",
            padx=(0, SPACE_LG), pady=(SPACE_LG, 0),
        )

        # Label — muted, small
        top_lbl = ctk.CTkLabel(
            self, text=label, text_color=C("fg_muted"),
            font=FONT_MICRO,
        )
        top_lbl.grid(
            row=1, column=1, sticky="nw",
            padx=(0, SPACE_LG), pady=(0, SPACE_LG),
        )


__all__ = ["Card", "StatCard"]
