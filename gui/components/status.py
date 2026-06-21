"""Status indicators — StatusPill and Badge.

cc-switch style: very minimal, small dots, muted colors.
No background pills — just colored dots or text.
"""
from __future__ import annotations

from typing import Tuple

import customtkinter as ctk

from ..theme import C
from ..tokens import FONT_CAPTION, FONT_LABEL, FONT_MICRO, RADIUS_FULL, RADIUS_SM


class StatusPill(ctk.CTkFrame):
    """Minimal status indicator — cc-switch style.

    sm: just a colored dot (●)
    md: colored dot + label
    """

    _STYLES = {
        "running": ("success",   "●", "Running"),
        "stopped": ("fg_subtle", "○", "Idle"),
        "warning": ("warning",   "◐", "Warning"),
        "error":   ("error",     "✖", "Error"),
        "info":    ("info",      "ⓘ", "Info"),
    }

    def __init__(self, master, status: str = "stopped", size: str = "md"):
        super().__init__(master, fg_color="transparent")
        self._status = status
        self._size = size

        fg_key, glyph, label = self._STYLES.get(status, self._STYLES["stopped"])

        if size == "sm":
            # Just a colored dot
            self._lbl = ctk.CTkLabel(
                self, text=glyph, text_color=C(fg_key),
                font=FONT_MICRO, width=16,
            )
            self._lbl.pack(side="left")
        else:
            # Dot + label
            self._lbl = ctk.CTkLabel(
                self, text=f"{glyph}  {label}", text_color=C(fg_key),
                font=FONT_CAPTION,
            )
            self._lbl.pack(side="left", padx=4)

    def set_status(self, status: str) -> None:
        fg_key, glyph, label = self._STYLES.get(status, self._STYLES["stopped"])
        self._status = status
        if self._size == "sm":
            self._lbl.configure(text=glyph, text_color=C(fg_key))
        else:
            self._lbl.configure(text=f"{glyph}  {label}", text_color=C(fg_key))


class Badge(ctk.CTkLabel):
    """Small uppercase label — cc-switch style: very subtle.

    Usage::

        Badge(parent, text="CC")
        Badge(parent, text="RUNNING", variant="success")
    """

    _VARIANTS = {
        "neutral":  ("bg_elevated_2", "fg_muted"),
        "primary":  ("bg_elevated_2", "fg"),
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
            padx=6, pady=2,
        )
