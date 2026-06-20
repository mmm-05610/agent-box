"""Theme — color tokens for the Slate Indigo theme (dark + light).

Single source of truth for every color used in the GUI. Components and
pages read colors via the ``C(key)`` convenience alias and switch
between palettes via :meth:`Theme.set_mode`.

Reference: docs/specs/gui-redesign-p2.md §1.2.
Tokens are grouped by purpose: backgrounds, borders, text, brand, status.
"""
from __future__ import annotations

from typing import Dict

import customtkinter as ctk


class Theme:
    """Color tokens for Slate Indigo theme (dark + light)."""

    DARK = {
        # 4-tier background hierarchy (darkest -> lightest)
        # canvas: outermost frame (status bar background)
        # bg:     main content area
        # sidebar: navigation rail (1 step up from bg)
        # elevated: cards / panels on top of bg
        "bg":              "#0F1115",   # main content
        "bg_canvas":       "#0A0C10",   # outermost, darkest
        "bg_sidebar":      "#14171D",   # sidebar — 1 step lighter than bg
        "bg_elevated":     "#1A1E25",   # cards — 2 steps lighter
        "bg_elevated_2":   "#22272F",   # controls — 3 steps lighter
        "bg_hover":        "#262B33",
        "bg_active":       "#2E343D",
        "surface":         "#1A1E25",
        "surface_overlay": "#22272F",

        # Borders
        "border":          "#2A2F38",
        "border_subtle":   "#1F232B",
        "border_strong":   "#3D4350",
        "border_focus":    "#7B6CF6",

        # Text
        "fg":              "#E6E8EC",
        "fg_muted":        "#9CA1AC",
        "fg_subtle":       "#5C6270",
        "fg_disabled":     "#3F4550",
        "fg_inverse":      "#0F1115",

        # Brand / Primary
        "primary":         "#7B6CF6",
        "primary_hover":   "#8E7FF9",
        "primary_pressed": "#6E5FE6",
        "primary_subtle":  "#2A2547",   # bg-tinted for hover surfaces
        "primary_fg":      "#FFFFFF",
        "accent":          "#56B6F9",

        # Status — text/icon
        "success":         "#7FB069",
        "warning":         "#E0A458",
        "error":           "#E06C75",
        "info":            "#56B6F9",

        # Status — subtle backgrounds (for pills, badges)
        "success_subtle":  "#1F2A1E",
        "warning_subtle":  "#2D2418",
        "error_subtle":    "#2D1E20",
        "info_subtle":     "#19242C",
        "neutral_subtle":  "#22272F",

        # Status — dot color (slightly muted from main)
        "status_running":  "#7FB069",
        "status_stopped":  "#5C6270",
        "status_warning":  "#E0A458",
        "status_error":    "#E06C75",
    }

    LIGHT = {
        "bg":              "#FAFAFB",
        "bg_canvas":       "#F4F5F7",
        "bg_sidebar":      "#FFFFFF",
        "bg_elevated":     "#FFFFFF",
        "bg_elevated_2":   "#FFFFFF",
        "bg_hover":        "#EEF0F4",
        "bg_active":       "#E4E8EE",
        "surface":         "#FFFFFF",
        "surface_overlay": "#FFFFFF",

        "border":          "#E1E4EA",
        "border_subtle":   "#EDEFF3",
        "border_strong":   "#C4C9D2",
        "border_focus":    "#5945D6",

        "fg":              "#15171C",
        "fg_muted":        "#5C6270",
        "fg_subtle":       "#8A8F9A",
        "fg_disabled":     "#B8BDC5",
        "fg_inverse":      "#FFFFFF",

        "primary":         "#5945D6",
        "primary_hover":   "#6E5BE0",
        "primary_pressed": "#4A38BD",
        "primary_subtle":  "#EBE7FB",
        "primary_fg":      "#FFFFFF",
        "accent":          "#1976D2",

        "success":         "#3F8E3F",
        "warning":         "#C77F30",
        "error":           "#C1353F",
        "info":            "#1976D2",

        "success_subtle":  "#E2F0DE",
        "warning_subtle":  "#F5E8D2",
        "error_subtle":    "#F5DCDF",
        "info_subtle":     "#DCEAF7",
        "neutral_subtle":  "#EEF0F4",

        "status_running":  "#3F8E3F",
        "status_stopped":  "#8A8F9A",
        "status_warning":  "#C77F30",
        "status_error":    "#C1353F",
    }

    _current: Dict[str, str] = dict(DARK)

    @classmethod
    def get(cls, key: str) -> str:
        return cls._current[key]

    @classmethod
    def set_mode(cls, mode: str) -> None:
        """mode = "dark" | "light" | "system"."""
        actual = mode
        if mode == "system":
            actual = ctk.get_appearance_mode().lower()
        cls._current = dict(cls.DARK if actual == "dark" else cls.LIGHT)
        ctk.set_appearance_mode(mode)

    @classmethod
    def current_mode(cls) -> str:
        return ctk.get_appearance_mode().lower()


def C(key: str) -> str:
    """Convenience accessor — ``C("primary")`` returns the current primary color."""
    return Theme.get(key)