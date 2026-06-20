"""Provider selector — radio-card style picker for Anthropic / Bedrock / Vertex.

Used in Profile detail (Meta tab) and the creation wizard (Step 3).
The selector emits ``on_change`` callbacks when the user picks a card.
"""
from __future__ import annotations

from typing import Callable, List, Optional, Tuple

import customtkinter as ctk

from ..theme import C
from ..tokens import (
    FONT_BODY,
    FONT_BOLD,
    FONT_CAPTION,
    FONT_SUBTITLE,
    RADIUS_LG,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
)


# Canonical provider list — keep this in sync with whatever
# ``agent-box launch`` actually accepts.
PROVIDERS: List[Tuple[str, str, str]] = [
    # (key, label, description)
    ("anthropic", "Anthropic", "Direct Claude API"),
    ("bedrock",   "AWS Bedrock", "Enterprise IAM-based access"),
    ("vertex",    "Google Vertex", "GCP integration"),
]


class _ProviderCard(ctk.CTkFrame):
    """Single selectable provider card."""

    def __init__(self, master, key: str, label: str, description: str,
                 selected: bool, on_select: Callable[[str], None]):
        super().__init__(
            master, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=2,
            border_color=C("primary") if selected else C("border"),
            cursor="hand2",
        )
        self._key = key
        self._on_select = on_select

        self.grid_columnconfigure(1, weight=1)

        # Radio indicator (left)
        self._radio_lbl = ctk.CTkLabel(
            self,
            text="●" if selected else "○",
            text_color=C("primary") if selected else C("fg_muted"),
            font=FONT_SUBTITLE, width=24,
        )
        self._radio_lbl.grid(
            row=0, column=0, padx=(SPACE_LG, SPACE_SM),
            pady=SPACE_LG, sticky="w",
        )

        # Label (top)
        lbl = ctk.CTkLabel(
            self, text=label, text_color=C("fg"),
            font=FONT_BOLD, anchor="w",
        )
        lbl.grid(row=0, column=1, sticky="w",
                 padx=(0, SPACE_LG), pady=(SPACE_LG, 0))

        # Description (below)
        desc = ctk.CTkLabel(
            self, text=description, text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        )
        desc.grid(row=1, column=1, sticky="w",
                  padx=(0, SPACE_LG), pady=(0, SPACE_LG))

        # Bindings on the whole card so clicking anywhere selects it
        for w in (self, self._radio_lbl, lbl, desc):
            w.bind("<Button-1>", self._handle_click)

    def set_selected(self, selected: bool) -> None:
        self.configure(
            border_color=C("primary") if selected else C("border"),
        )
        self._radio_lbl.configure(
            text="●" if selected else "○",
            text_color=C("primary") if selected else C("fg_muted"),
        )

    def _handle_click(self, _event) -> None:
        self._on_select(self._key)


class ProviderSelector(ctk.CTkFrame):
    """Card-style radio list. Stack of selectable cards, single selection."""

    def __init__(
        self,
        master,
        current: str = "anthropic",
        on_change: Optional[Callable[[str], None]] = None,
    ):
        super().__init__(master, fg_color="transparent")
        self._on_change = on_change
        self._current = current
        self._cards: dict = {}

        self.grid_columnconfigure(0, weight=1)
        for i, (key, label, desc) in enumerate(PROVIDERS):
            card = _ProviderCard(
                self, key=key, label=label, description=desc,
                selected=(key == current),
                on_select=self._select,
            )
            card.grid(row=i, column=0, sticky="ew",
                      pady=(0, SPACE_SM))
            self._cards[key] = card

    def get(self) -> str:
        return self._current

    def set(self, key: str) -> None:
        self._select(key, notify=False)

    def _select(self, key: str, *, notify: bool = True) -> None:
        if key not in self._cards or key == self._current:
            return
        old = self._current
        self._current = key
        self._cards[old].set_selected(False)
        self._cards[key].set_selected(True)
        if notify and self._on_change is not None:
            self._on_change(key)


__all__ = ["PROVIDERS", "ProviderSelector"]