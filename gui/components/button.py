"""Reusable button factories — primary / ghost / danger / icon.

cc-switch / shadcn/ui style:
- Primary: white bg + black text (dark) / black bg + white text (light)
- Ghost: transparent, no border
- Destructive: red bg
- All: 36px height, 6px radius, medium weight

If you need a one-off button, build it inline; if it appears 3+ times,
add a factory here.
"""
from __future__ import annotations

from typing import Any, Callable, Optional

import customtkinter as ctk

from ..theme import C
from ..tokens import (
    BUTTON_HEIGHT,
    FONT_BODY,
    FONT_SANS_BOLD,
    FONT_SUBTITLE,
    RADIUS_MD,
)


def _base(master: ctk.CTk, height: int = BUTTON_HEIGHT, **kw: Any) -> ctk.CTkButton:
    """Common defaults shared by every factory."""
    defaults: dict = dict(
        height=height,
        corner_radius=RADIUS_MD,
    )
    defaults.update(kw)
    return ctk.CTkButton(master, **defaults)


def primary_button(
    master: ctk.CTk,
    text: str,
    command: Optional[Callable] = None,
    **kwargs: Any,
) -> ctk.CTkButton:
    """Standard primary CTA — filled with brand color.

    cc-switch style: white bg + black text (dark mode),
    black bg + white text (light mode).
    """
    return _base(
        master, text=text, command=command,
        fg_color=C("primary"),
        hover_color=C("primary_hover"),
        text_color=C("primary_fg"),
        font=FONT_SANS_BOLD,
        **kwargs,
    )


def ghost_button(
    master: ctk.CTk,
    text: str,
    command: Optional[Callable] = None,
    **kwargs: Any,
) -> ctk.CTkButton:
    """Secondary action — transparent background, muted text.

    cc-switch style: no border, hover shows subtle bg.
    """
    return _base(
        master, text=text, command=command,
        fg_color="transparent",
        hover_color=C("bg_hover"),
        text_color=C("fg_muted"),
        font=FONT_BODY,
        **kwargs,
    )


def danger_button(
    master: ctk.CTk,
    text: str,
    command: Optional[Callable] = None,
    **kwargs: Any,
) -> ctk.CTkButton:
    """Destructive action — red fill."""
    return _base(
        master, text=text, command=command,
        fg_color=C("error"),
        hover_color="#DC2626",
        text_color="#FFFFFF",
        font=FONT_SANS_BOLD,
        **kwargs,
    )


def icon_button(
    master: ctk.CTk,
    glyph: str,
    command: Optional[Callable] = None,
    *,
    width: int = 36,
    primary: bool = False,
    **kwargs: Any,
) -> ctk.CTkButton:
    """Square icon-only button (▶, ⋯, 📁, etc.)."""
    fg = C("primary") if primary else "transparent"
    hover = C("primary_hover") if primary else C("bg_hover")
    text_color = C("primary_fg") if primary else C("fg_muted")
    return _base(
        master, text=glyph, command=command,
        width=width, height=width,
        fg_color=fg, hover_color=hover,
        text_color=text_color,
        font=FONT_SUBTITLE,
        **kwargs,
    )


__all__ = [
    "danger_button",
    "ghost_button",
    "icon_button",
    "primary_button",
]
