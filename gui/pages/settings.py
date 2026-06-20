"""Settings page — theme switcher and WSL info."""
from __future__ import annotations

import shutil
from typing import Callable

import customtkinter as ctk

from ..theme import C, Theme
from ..tokens import (
    FONT_BODY,
    FONT_CAPTION,
    FONT_DISPLAY,
    FONT_LABEL,
    FONT_MICRO,
    FONT_MONO_SMALL,
    RADIUS_LG,
    RADIUS_MD,
    SPACE_2XL,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
    SPACE_XL,
)


class SettingsPage(ctk.CTkFrame):
    """Theme switcher + WSL info + about panel."""

    def __init__(self, master,
                 on_theme_change: Callable[[], None]):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._on_theme_change = on_theme_change

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # Title block
        title_block = ctk.CTkFrame(self, fg_color="transparent")
        title_block.grid(row=0, column=0, sticky="ew",
                         padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_LG))
        title_block.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            title_block, text="Settings", text_color=C("fg"),
            font=FONT_DISPLAY, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w")

        subtitle = ctk.CTkLabel(
            title_block, text="App preferences and WSL configuration",
            text_color=C("fg_muted"), font=FONT_CAPTION, anchor="w",
        )
        subtitle.grid(row=1, column=0, sticky="w", pady=(2, 0))

        body = ctk.CTkScrollableFrame(self, fg_color=C("bg"), corner_radius=0)
        body.grid(row=1, column=0, sticky="nsew",
                  padx=SPACE_2XL, pady=(0, SPACE_LG))
        body.grid_columnconfigure(0, weight=1)

        # Section: Appearance
        sec1 = ctk.CTkLabel(
            body, text="APPEARANCE", text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="w",
        )
        sec1.grid(row=0, column=0, sticky="ew", pady=(0, 8))

        ap_card = ctk.CTkFrame(
            body, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        ap_card.grid(row=1, column=0, sticky="ew", pady=(0, SPACE_XL))
        ap_card.grid_columnconfigure(1, weight=1)

        theme_lbl = ctk.CTkLabel(
            ap_card, text="Theme", text_color=C("fg"),
            font=FONT_BODY, anchor="w",
        )
        theme_lbl.grid(row=0, column=0, padx=SPACE_LG, pady=SPACE_LG, sticky="w")

        theme_var = ctk.StringVar(value=Theme.current_mode().title() or "System")
        theme_menu = ctk.CTkOptionMenu(
            ap_card, variable=theme_var,
            values=["System", "Dark", "Light"],
            width=130, height=32, corner_radius=RADIUS_MD,
            fg_color=C("bg_elevated_2"), button_color=C("bg_hover"),
            button_hover_color=C("bg_active"),
            text_color=C("fg"), dropdown_text_color=C("fg"),
            dropdown_fg_color=C("surface_overlay"),
            dropdown_hover_color=C("bg_hover"),
            font=FONT_CAPTION, dropdown_font=FONT_CAPTION,
            command=lambda v: self._change_theme(v.lower()),
        )
        theme_menu.grid(row=0, column=1, padx=SPACE_LG, pady=SPACE_LG, sticky="e")

        # Section: WSL
        sec2 = ctk.CTkLabel(
            body, text="WSL", text_color=C("fg_subtle"),
            font=FONT_LABEL, anchor="w",
        )
        sec2.grid(row=2, column=0, sticky="ew", pady=(0, SPACE_SM))

        wsl_card = ctk.CTkFrame(
            body, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        wsl_card.grid(row=3, column=0, sticky="ew", pady=(0, SPACE_XL))
        wsl_card.grid_columnconfigure(1, weight=1)

        wsl_path = shutil.which("wsl.exe") or "(wsl.exe not found)"
        wsl_lbl = ctk.CTkLabel(
            wsl_card, text="wsl.exe", text_color=C("fg"),
            font=FONT_BODY, anchor="w",
        )
        wsl_lbl.grid(row=0, column=0, padx=SPACE_LG, pady=SPACE_LG, sticky="w")

        wsl_val = ctk.CTkLabel(
            wsl_card, text=wsl_path, text_color=C("fg_muted"),
            font=FONT_MONO_SMALL, anchor="e",
        )
        wsl_val.grid(row=0, column=1, padx=SPACE_LG, pady=SPACE_LG, sticky="e")

        # Section: About
        sec3 = ctk.CTkLabel(
            body, text="ABOUT", text_color=C("fg_subtle"),
            font=FONT_LABEL, anchor="w",
        )
        sec3.grid(row=4, column=0, sticky="ew", pady=(0, SPACE_SM))

        about_card = ctk.CTkFrame(
            body, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        about_card.grid(row=5, column=0, sticky="ew", pady=(0, SPACE_LG))

        about_lbl = ctk.CTkLabel(
            about_card,
            text="agent-box — isolated config launcher for AI agents\n"
                 "Stage A (visual rebuild) · CustomTkinter · Slate Indigo theme\n"
                 "See docs/specs/gui-redesign-p1.md and gui-redesign-p2.md",
            text_color=C("fg_muted"), font=FONT_CAPTION,
            justify="left", anchor="w",
        )
        about_lbl.pack(anchor="w", padx=SPACE_LG, pady=SPACE_LG)

    def _change_theme(self, mode: str) -> None:
        Theme.set_mode(mode)
        self._on_theme_change()