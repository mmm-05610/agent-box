"""Theme — color tokens (cc-switch / shadcn/ui style).

Single source of truth for every color used in the GUI. Components and
pages read colors via the ``C(key)`` convenience alias and switch
between palettes via :meth:`Theme.set_mode`.

Style reference: docs/specs/cc-switch-style-guide.md
Inspired by: shadcn/ui Zinc palette, cc-switch desktop app.
"""
from __future__ import annotations

from typing import Dict

import customtkinter as ctk


class Theme:
    """Color tokens — cc-switch / shadcn/ui Zinc style (dark + light)."""

    DARK = {
        # Backgrounds — near-pure-black, minimal hierarchy
        "bg":              "#09090B",   # main content (near-black)
        "bg_canvas":       "#09090B",   # outermost = same as bg (flat)
        "bg_sidebar":      "#0F0F11",   # sidebar — barely lighter
        "bg_elevated":     "#18181B",   # cards — Zinc 900
        "bg_elevated_2":   "#27272A",   # controls — Zinc 800
        "bg_hover":        "#27272A",   # hover state
        "bg_active":       "#3F3F46",   # pressed / selected
        "bg_input":        "#27272A",   # input fields
        "surface":         "#18181B",
        "surface_overlay": "#27272A",

        # Borders — extremely subtle, almost invisible
        "border":          "#27272A",   # Zinc 800 — low contrast
        "border_subtle":   "#1E1E21",   # even more subtle
        "border_strong":   "#3F3F46",   # stronger for focus rings
        "border_focus":    "#A1A1AA",   # Zinc 400 — focus ring

        # Text — Zinc palette
        "fg":              "#FAFAFA",   # Zinc 50 — primary text
        "fg_muted":        "#A1A1AA",   # Zinc 400 — secondary text
        "fg_subtle":       "#71717A",   # Zinc 500 — tertiary text
        "fg_disabled":     "#52525B",   # Zinc 600 — disabled
        "fg_inverse":      "#09090B",   # text on light bg

        # Primary — WHITE in dark mode (cc-switch style: primary = foreground)
        "primary":         "#FAFAFA",   # white button
        "primary_hover":   "#E4E4E7",   # Zinc 200
        "primary_pressed": "#D4D4D8",   # Zinc 300
        "primary_subtle":  "#27272A",   # subtle primary bg
        "primary_fg":      "#09090B",   # black text on white button
        "accent":          "#3B82F6",   # Blue 500 — rare accent

        # Status — Tailwind defaults, muted
        "success":         "#22C55E",   # Green 500
        "warning":         "#F59E0B",   # Amber 500
        "error":           "#EF4444",   # Red 500
        "info":            "#3B82F6",   # Blue 500

        # Status — subtle backgrounds
        "success_subtle":  "#052E16",   # Green 950
        "warning_subtle":  "#422006",   # Amber 950
        "error_subtle":    "#450A0A",   # Red 950
        "info_subtle":     "#172554",   # Blue 950
        "neutral_subtle":  "#18181B",   # Zinc 900

        # Status — dot colors
        "status_running":  "#22C55E",   # Green 500
        "status_stopped":  "#71717A",   # Zinc 500
        "status_warning":  "#F59E0B",   # Amber 500
        "status_error":    "#EF4444",   # Red 500
    }

    LIGHT = {
        # Backgrounds — pure white, minimal hierarchy
        "bg":              "#FFFFFF",
        "bg_canvas":       "#FFFFFF",
        "bg_sidebar":      "#FAFAFA",   # Zinc 50
        "bg_elevated":     "#FFFFFF",
        "bg_elevated_2":   "#F4F4F5",   # Zinc 100
        "bg_hover":        "#F4F4F5",   # Zinc 100
        "bg_active":       "#E4E4E7",   # Zinc 200
        "bg_input":        "#F4F4F5",   # Zinc 100
        "surface":         "#FFFFFF",
        "surface_overlay": "#FFFFFF",

        # Borders — subtle
        "border":          "#E4E4E7",   # Zinc 200
        "border_subtle":   "#F4F4F5",   # Zinc 100
        "border_strong":   "#D4D4D8",   # Zinc 300
        "border_focus":    "#71717A",   # Zinc 500

        # Text
        "fg":              "#09090B",   # Zinc 950
        "fg_muted":        "#71717A",   # Zinc 500
        "fg_subtle":       "#A1A1AA",   # Zinc 400
        "fg_disabled":     "#D4D4D8",   # Zinc 300
        "fg_inverse":      "#FAFAFA",

        # Primary — BLACK in light mode
        "primary":         "#18181B",   # Zinc 900 — black button
        "primary_hover":   "#27272A",   # Zinc 800
        "primary_pressed": "#3F3F46",   # Zinc 700
        "primary_subtle":  "#F4F4F5",   # Zinc 100
        "primary_fg":      "#FAFAFA",   # white text on black button
        "accent":          "#2563EB",   # Blue 600

        # Status
        "success":         "#16A34A",   # Green 600
        "warning":         "#D97706",   # Amber 600
        "error":           "#DC2626",   # Red 600
        "info":            "#2563EB",   # Blue 600

        # Status — subtle backgrounds
        "success_subtle":  "#F0FDF4",   # Green 50
        "warning_subtle":  "#FFFBEB",   # Amber 50
        "error_subtle":    "#FEF2F2",   # Red 50
        "info_subtle":     "#EFF6FF",   # Blue 50
        "neutral_subtle":  "#F4F4F5",   # Zinc 100

        # Status — dot colors
        "status_running":  "#16A34A",
        "status_stopped":  "#A1A1AA",
        "status_warning":  "#D97706",
        "status_error":    "#DC2626",
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
