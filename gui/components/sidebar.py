"""Left navigation rail.

Width is fixed at ``SIDEBAR_WIDTH`` (220px). Five nav items render as
accent-bar + label rows; the active item gets a primary-coloured left
bar and a subtle primary fill.
"""
from __future__ import annotations

from typing import Callable, Dict, List, Tuple

import customtkinter as ctk

from ..theme import C
from ..tokens import (
    FONT_BODY,
    FONT_BOLD,
    FONT_LABEL,
    FONT_MICRO,
    FONT_TITLE,
    RADIUS_MD,
    SIDEBAR_WIDTH,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
)
from .status import StatusPill


NAV_ITEMS: List[Tuple[str, str, str]] = [
    # (key, label, icon)
    ("home",     "Home",     "🏠"),
    ("profiles", "Profiles", "📁"),
    ("sessions", "Sessions", "📊"),
    ("settings", "Settings", "⚙"),
    ("help",     "Help",     "❓"),
]


class Sidebar(ctk.CTkFrame):
    """Left navigation rail (220px wide).

    Layout: pure pack. Top: brand, section, nav items (each a row-frame).
    Bottom: status pill + wsl text. No grid — pack is more predictable.
    """

    def __init__(
        self,
        master,
        on_nav: Callable[[str], None],
        on_settings: Callable[[str], None],
        status_getter: Callable[[], int],
    ):
        super().__init__(
            master, width=SIDEBAR_WIDTH, fg_color=C("bg_sidebar"), corner_radius=0,
        )

        self._on_nav = on_nav
        self._on_settings = on_settings
        self._status_getter = status_getter
        self._buttons: Dict[str, ctk.CTkButton] = {}
        self._indicators: Dict[str, ctk.CTkFrame] = {}

        # === Top: brand + section + nav items ===
        brand = ctk.CTkLabel(
            self, text="⚡  Agent Box", text_color=C("fg"),
            font=FONT_TITLE, anchor="w",
        )
        brand.pack(anchor="w", padx=SPACE_LG, pady=(20, 24))

        section = ctk.CTkLabel(
            self, text="NAVIGATE", text_color=C("fg_subtle"),
            font=FONT_LABEL, anchor="w",
        )
        section.pack(anchor="w", padx=SPACE_LG, pady=(0, 6))

        # Nav items — each is a small row-frame with accent + button
        for key, label, icon in NAV_ITEMS:
            item = ctk.CTkFrame(self, fg_color="transparent")
            item.pack(fill="x", padx=10, pady=2)

            # Accent (left, narrow vertical bar)
            accent = ctk.CTkFrame(
                item, fg_color="transparent",
                width=3, height=24, corner_radius=2,
            )
            accent.pack(side="left", padx=(0, 6))
            self._indicators[key] = accent

            # Button (fills remaining width)
            btn = ctk.CTkButton(
                item, text=f"{icon}   {label}",
                fg_color="transparent", text_color=C("fg_muted"),
                hover_color=C("bg_hover"),
                anchor="w", height=32, corner_radius=RADIUS_MD,
                font=FONT_BODY,
                command=lambda k=key: self._on_nav(k),
            )
            btn.pack(side="left", fill="x", expand=True)
            self._buttons[key] = btn

        # === Bottom: wsl text + status pill (anchored) ===
        self.wsl_lbl = ctk.CTkLabel(
            self, text="", text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="w",
        )
        self.wsl_lbl.pack(side="bottom", fill="x", padx=SPACE_LG, pady=(SPACE_SM, 0))

        status_holder = ctk.CTkFrame(
            self, fg_color="transparent", corner_radius=0, height=44,
        )
        status_holder.pack(side="bottom", fill="x", padx=SPACE_MD, pady=SPACE_MD)
        status_holder.pack_propagate(False)
        status_holder.grid_columnconfigure(0, weight=1)

        self.status_pill = StatusPill(status_holder, status="stopped", size="md")
        self.status_pill.grid(row=0, column=0, sticky="ew", padx=SPACE_SM)

        # Initial status update + active state
        self.update_status()
        self.set_active("home")

    def set_active(self, key: str) -> None:
        for k, btn in self._buttons.items():
            accent = self._indicators[k]
            if k == key:
                btn.configure(
                    fg_color=C("primary_subtle"),
                    text_color=C("fg"),
                    font=FONT_BOLD,
                )
                accent.configure(fg_color=C("primary"))
            else:
                btn.configure(
                    fg_color="transparent",
                    text_color=C("fg_muted"),
                    font=FONT_BODY,
                )
                accent.configure(fg_color="transparent")

    def update_status(self) -> None:
        active = self._status_getter()
        if active > 0:
            self.status_pill.set_status("running")
        else:
            self.status_pill.set_status("stopped")
        self.wsl_lbl.configure(text=f"{active} running  ·  WSL healthy")