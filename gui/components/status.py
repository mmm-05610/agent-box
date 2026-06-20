"""Status indicators — StatusPill and Badge.

``StatusPill`` is a compact coloured chip (● / ○ / ◐ / ✖ / ⓘ) that replaces
raw status characters in profile rows and session lists. ``Badge`` is a
small uppercase label for grouping or meta information (e.g. "DRAFT").
"""
from __future__ import annotations

from typing import Tuple

import customtkinter as ctk

from ..theme import C
from ..tokens import FONT_CAPTION, FONT_LABEL, FONT_MICRO, RADIUS_FULL, RADIUS_SM


class StatusPill(ctk.CTkFrame):
    """Compact status indicator.

    Usage::

        StatusPill(parent, status="running")
        StatusPill(parent, status="stopped", size="sm")
    """

    _STYLES = {
        "running": ("success_subtle", "success",   "●", "active"),
        "stopped": ("neutral_subtle", "fg_muted",  "○", "idle"),
        "warning": ("warning_subtle", "warning",   "◐", "warning"),
        "error":   ("error_subtle",   "error",     "✖", "error"),
        "info":    ("info_subtle",    "info",      "ⓘ", "info"),
    }

    def __init__(self, master, status: str = "stopped", size: str = "md"):
        bg_key, fg_key, glyph, label = self._STYLES.get(status, self._STYLES["stopped"])
        super().__init__(master, fg_color=C(bg_key), corner_radius=RADIUS_FULL)
        self._status = status

        # Compact: just glyph; Medium: glyph + label
        padx = 6 if size == "sm" else 8
        if size == "sm":
            text = glyph
            width = 18
        else:
            text = f"{glyph}  {label}"
            width = 0

        self._lbl = ctk.CTkLabel(
            self, text=text, text_color=C(fg_key),
            font=FONT_MICRO if size == "sm" else FONT_CAPTION,
            width=width,
        )
        self._lbl.pack(side="left", padx=padx, pady=2)

    def set_status(self, status: str) -> None:
        bg_key, fg_key, glyph, label = self._STYLES.get(status, self._STYLES["stopped"])
        self._status = status
        self.configure(fg_color=C(bg_key))
        # Re-derive the text from current font to preserve size
        # (sm: just glyph; md: glyph + label)
        if self._lbl.cget("width") == 18:
            self._lbl.configure(text=glyph, text_color=C(fg_key))
        else:
            self._lbl.configure(text=f"{glyph}  {label}", text_color=C(fg_key))


class Badge(ctk.CTkLabel):
    """Small uppercase label for grouping / meta info.

    Usage::

        Badge(parent, text="CLAUDE CODE")
        Badge(parent, text="DRAFT", variant="warning")
    """

    _VARIANTS = {
        "neutral":  ("neutral_subtle", "fg_muted"),
        "primary":  ("primary_subtle", "primary"),
        "success":  ("success_subtle", "success"),
        "warning":  ("warning_subtle", "warning"),
        "error":    ("error_subtle",   "error"),
        "info":     ("info_subtle",    "info"),
    }

    def __init__(self, master, text: str, variant: str = "neutral"):
        bg_key, fg_key = self._VARIANTS.get(variant, self._VARIANTS["neutral"])
        super().__init__(
            master, text=text.upper(),
            fg_color=C(bg_key), text_color=C(fg_key),
            font=FONT_LABEL,
            corner_radius=RADIUS_SM,
            padx=8, pady=3,
        )