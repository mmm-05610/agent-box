"""Help page — quick reference."""
from __future__ import annotations

import customtkinter as ctk

from ..theme import C
from ..tokens import (
    FONT_BODY,
    FONT_CAPTION,
    FONT_DISPLAY,
    RADIUS_LG,
    SPACE_2XL,
    SPACE_LG,
    SPACE_MD,
)


class HelpPage(ctk.CTkFrame):
    """Quick reference — placeholders for shortcuts and feedback."""

    def __init__(self, master):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self.grid_columnconfigure(0, weight=1)

        # Title block
        title_block = ctk.CTkFrame(self, fg_color="transparent")
        title_block.grid(row=0, column=0, sticky="ew",
                         padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_LG))
        title_block.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            title_block, text="Help", text_color=C("fg"),
            font=FONT_DISPLAY, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w")

        subtitle = ctk.CTkLabel(
            title_block, text="Quick reference for agent-box",
            text_color=C("fg_muted"), font=FONT_CAPTION, anchor="w",
        )
        subtitle.grid(row=1, column=0, sticky="w", pady=(2, 0))

        body = ctk.CTkFrame(
            self, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        body.grid(row=1, column=0, sticky="new",
                  padx=SPACE_2XL, pady=(0, SPACE_LG))
        body.grid_columnconfigure(0, weight=1)

        for i, line in enumerate([
            "📖  Documentation: docs/specs/gui-redesign-p1.md and p2.md",
            "⌨  Shortcuts: coming in Stage B",
            "💬  Feedback: this is your own tool — improve it yourself",
            "",
            "Stage A: visual rebuild complete.",
            "Stage B: profile detail page + create wizard + provider switch.",
            "Stage C: full sessions page + state tracking.",
            "Stage D: home page polish + tests + docs.",
        ]):
            lbl = ctk.CTkLabel(
                body, text=line, text_color=C("fg_muted"),
                font=FONT_BODY, anchor="w",
            )
            lbl.grid(row=i, column=0, sticky="ew",
                     padx=SPACE_LG, pady=SPACE_MD)