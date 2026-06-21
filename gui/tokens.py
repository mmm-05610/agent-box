"""Design tokens — typography, spacing, radius, sizes.

cc-switch / shadcn/ui style: Inter font (if installed), subtle borders,
moderate radius, generous whitespace.

Font strategy:
- Try "Inter" first (best match for cc-switch look)
- Fallback to "Segoe UI Variable" (Windows 11)
- Fallback to "Segoe UI" (Windows 10)

Reference: docs/specs/cc-switch-style-guide.md §2-4.
"""
from __future__ import annotations

import tkinter as tk


# ---------------------------------------------------------------------------
# Font detection — find the best available sans-serif font
# ---------------------------------------------------------------------------

def _detect_font_family() -> str:
    """Find the best available sans-serif font."""
    try:
        root = tk.Tk()
        root.withdraw()
        available = set(root.tk.splitlist(root.tk.call("font", "families")))
        root.destroy()
    except Exception:
        available = set()

    # Priority: Inter > Segoe UI Variable > Segoe UI > system default
    candidates = [
        "Inter",
        "Segoe UI Variable",
        "Segoe UI",
        "Helvetica Neue",
        "Helvetica",
        "Noto Sans",
        "Liberation Sans",
        "Arial",
    ]
    for font in candidates:
        if font in available:
            return font
    return "TkDefaultFont"  # absolute fallback


def _detect_mono_family() -> str:
    """Find the best available monospace font."""
    try:
        root = tk.Tk()
        root.withdraw()
        available = set(root.tk.splitlist(root.tk.call("font", "families")))
        root.destroy()
    except Exception:
        available = set()

    candidates = [
        "Cascadia Code",
        "Cascadia Mono",
        "JetBrains Mono",
        "Fira Code",
        "Consolas",
        "SF Mono",
        "Menlo",
        "DejaVu Sans Mono",
        "Courier New",
    ]
    for font in candidates:
        if font in available:
            return font
    return "TkFixedFont"


# Auto-detected font families
FONT_FAMILY_SANS = _detect_font_family()
FONT_FAMILY_MONO = _detect_mono_family()


# ---------------------------------------------------------------------------
# Typography — core type scale
#
# Tk only supports "normal" and "bold" weights.
# To simulate "semibold" we use bold at a slightly smaller size,
# or just accept bold as the "heavy" weight.
# ---------------------------------------------------------------------------

FONT_SANS          = (FONT_FAMILY_SANS, 13, "normal")
FONT_SANS_BOLD     = (FONT_FAMILY_SANS, 13, "bold")

# Headings — bold is the only heavy weight Tk supports
FONT_DISPLAY       = (FONT_FAMILY_SANS, 22, "bold")     # Page title
FONT_TITLE         = (FONT_FAMILY_SANS, 17, "bold")     # Section title
FONT_SUBTITLE      = (FONT_FAMILY_SANS, 14, "bold")     # Card title

# Body — all normal weight, different sizes
FONT_BODY          = (FONT_FAMILY_SANS, 13, "normal")   # Body text
FONT_CAPTION       = (FONT_FAMILY_SANS, 12, "normal")   # Secondary text
FONT_MICRO         = (FONT_FAMILY_SANS, 11, "normal")   # Tertiary text
FONT_LABEL         = (FONT_FAMILY_SANS, 10, "bold")     # Uppercase labels

# Display sizes
FONT_ICON_LG       = (FONT_FAMILY_SANS, 18, "normal")
FONT_BIG           = (FONT_FAMILY_SANS, 26, "bold")
FONT_HUGE          = (FONT_FAMILY_SANS, 30, "bold")

# Monospace
FONT_MONO          = (FONT_FAMILY_MONO, 12, "normal")
FONT_MONO_SMALL    = (FONT_FAMILY_MONO, 11, "normal")
FONT_MONO_LARGE    = (FONT_FAMILY_MONO, 13, "normal")

# Legacy aliases
FONT_BOLD          = FONT_SANS_BOLD
FONT_BODY_MEDIUM   = FONT_BODY  # Tk has no medium, use normal


# ---------------------------------------------------------------------------
# Spacing scale (4px grid, shadcn/ui standard)
# ---------------------------------------------------------------------------

SPACE_XS  = 4
SPACE_SM  = 8
SPACE_MD  = 12
SPACE_LG  = 16
SPACE_XL  = 24
SPACE_2XL = 32
SPACE_3XL = 48


# ---------------------------------------------------------------------------
# Radius scale (cc-switch style: moderate, not too round)
# ---------------------------------------------------------------------------

RADIUS_SM   = 4      # badges, small elements
RADIUS_MD   = 6      # buttons, inputs
RADIUS_LG   = 8      # cards
RADIUS_XL   = 12     # large cards, modals
RADIUS_FULL = 9999   # pills


# ---------------------------------------------------------------------------
# Component sizes
# ---------------------------------------------------------------------------

SIDEBAR_WIDTH    = 180      # Narrower (was 220)
ROW_HEIGHT       = 40
BUTTON_HEIGHT    = 36       # Taller (was 32)
BUTTON_HEIGHT_LG = 40
INPUT_HEIGHT     = 36       # Taller (was 32)
