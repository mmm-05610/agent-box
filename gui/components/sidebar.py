"""Left navigation rail — cc-switch style.

Narrower (180px), minimal, text-only nav items with bottom indicator
for active state. No emoji icons (they render inconsistently on Windows).
"""
from __future__ import annotations

import sys
from typing import Callable, Dict, List, Tuple

import customtkinter as ctk

from ..theme import C
from ..tokens import (
    FONT_BODY,
    FONT_CAPTION,
    FONT_LABEL,
    FONT_MICRO,
    FONT_SANS_BOLD,
    FONT_SUBTITLE,
    RADIUS_MD,
    SIDEBAR_WIDTH,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
    SPACE_XL,
    SPACE_XS,
)
from .status import StatusPill


NAV_ITEMS: List[Tuple[str, str, str]] = [
    # (key, label, icon) — icon kept for future, but not rendered
    ("home",     "Home",     ""),
    ("profiles", "Profiles", ""),
    ("sessions", "Sessions", ""),
    ("settings", "Settings", ""),
    ("help",     "Help",     ""),
]


def _find_logo() -> str | None:
    """Return the path to logo.png, working in both source and frozen modes."""
    import os
    candidates = [
        # Source checkout: gui/components/sidebar.py → ../.. → project root
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "logo.png"),
    ]
    if getattr(sys, "frozen", False):
        candidates.append(os.path.join(sys._MEIPASS, "logo.png"))
    for p in candidates:
        if os.path.isfile(p):
            return p
    return None


class Sidebar(ctk.CTkFrame):
    """Left navigation rail — cc-switch style (180px, minimal).

    Layout: pack-based. Brand at top, nav items in middle,
    status at bottom.
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

        # === Top: brand ===
        logo_img = None
        if _logo_path := _find_logo():
            try:
                from PIL import Image as _PILImage
                logo_img = _PILImage.open(_logo_path)
            except Exception:
                pass

        if logo_img:
            self._logo_img = ctk.CTkImage(light_image=logo_img, size=(28, 28))
            brand_holder = ctk.CTkFrame(self, fg_color="transparent")
            brand_holder.pack(anchor="w", padx=SPACE_LG, pady=(SPACE_XL, SPACE_LG))
            ctk.CTkLabel(brand_holder, image=self._logo_img, text="").pack(
                side="left", padx=(0, SPACE_SM))
            ctk.CTkLabel(brand_holder, text="Agent Box", text_color=C("fg"),
                         font=FONT_SUBTITLE, anchor="w").pack(side="left")
        else:
            ctk.CTkLabel(self, text="Agent Box", text_color=C("fg"),
                         font=FONT_SUBTITLE, anchor="w").pack(
                anchor="w", padx=SPACE_LG, pady=(SPACE_XL, SPACE_LG))

        # === Nav items ===
        for key, label, _icon in NAV_ITEMS:
            item = ctk.CTkFrame(self, fg_color="transparent")
            item.pack(fill="x", padx=SPACE_SM, pady=1)

            # Bottom indicator (hidden by default)
            # We use a different approach: active item gets bg_hover + left border
            btn = ctk.CTkButton(
                item, text=label,
                fg_color="transparent", text_color=C("fg_muted"),
                hover_color=C("bg_hover"),
                anchor="w", height=32, corner_radius=RADIUS_MD,
                font=FONT_BODY,
                command=lambda k=key: self._on_nav(k),
            )
            btn.pack(fill="x")
            self._buttons[key] = btn

        # === Bottom: status ===
        self.wsl_lbl = ctk.CTkLabel(
            self, text="", text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="w",
        )
        self.wsl_lbl.pack(side="bottom", fill="x", padx=SPACE_LG, pady=(SPACE_SM, SPACE_MD))

        # Separator
        sep = ctk.CTkFrame(self, fg_color=C("border"), height=1, corner_radius=0)
        sep.pack(side="bottom", fill="x", padx=SPACE_LG, pady=(0, SPACE_SM))

        # Status pill
        status_holder = ctk.CTkFrame(
            self, fg_color="transparent", corner_radius=0, height=32,
        )
        status_holder.pack(side="bottom", fill="x", padx=SPACE_MD, pady=SPACE_SM)
        status_holder.pack_propagate(False)
        status_holder.grid_columnconfigure(0, weight=1)

        self.status_pill = StatusPill(status_holder, status="stopped", size="sm")
        self.status_pill.grid(row=0, column=0, sticky="w", padx=SPACE_SM)

        # Initial state
        self.update_status()
        self.set_active("home")

    def set_active(self, key: str) -> None:
        for k, btn in self._buttons.items():
            if k == key:
                btn.configure(
                    fg_color=C("bg_hover"),
                    text_color=C("fg"),
                    font=FONT_SANS_BOLD,
                )
            else:
                btn.configure(
                    fg_color="transparent",
                    text_color=C("fg_muted"),
                    font=FONT_BODY,
                )

    def update_status(self) -> None:
        active = self._status_getter()
        if active > 0:
            self.status_pill.set_status("running")
        else:
            self.status_pill.set_status("stopped")
        self.wsl_lbl.configure(text=f"{active} running")
