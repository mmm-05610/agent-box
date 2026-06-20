"""Design tokens — non-color values shared across the GUI.

Typography (system fonts only, zero install), spacing on a 4px grid,
radius scale, and component size constants. See
``docs/specs/gui-redesign-p2.md`` §1.2 for the design rationale.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Typography — system fonts (Segoe UI Variable on Windows)
# ---------------------------------------------------------------------------

FONT_SANS         = ("Segoe UI Variable", 13, "normal")
FONT_SANS_BOLD    = ("Segoe UI Variable", 13, "bold")
FONT_DISPLAY      = ("Segoe UI Variable", 24, "bold")
FONT_TITLE        = ("Segoe UI Variable", 18, "bold")
FONT_SUBTITLE     = ("Segoe UI Variable", 14, "bold")
FONT_BOLD         = ("Segoe UI Variable", 13, "bold")
FONT_BODY         = ("Segoe UI Variable", 13, "normal")
FONT_CAPTION      = ("Segoe UI Variable", 12, "normal")
FONT_MICRO        = ("Segoe UI Variable", 11, "normal")
FONT_LABEL        = ("Segoe UI Variable", 10, "bold")  # small uppercase section labels
FONT_ICON_LG      = ("Segoe UI Variable", 18, "bold")  # large icons in stat cards
FONT_BIG          = ("Segoe UI Variable", 28, "bold")  # big stat values
FONT_HUGE         = ("Segoe UI Variable", 32, "bold")  # hero numbers
FONT_MONO         = ("Cascadia Code", 12, "normal")
FONT_MONO_SMALL   = ("Cascadia Code", 11, "normal")
FONT_MONO_LARGE   = ("Cascadia Code", 13, "normal")

# ---------------------------------------------------------------------------
# Spacing scale (4px grid)
# ---------------------------------------------------------------------------

SPACE_XS  = 4
SPACE_SM  = 8
SPACE_MD  = 12
SPACE_LG  = 16
SPACE_XL  = 24
SPACE_2XL = 32
SPACE_3XL = 48

# ---------------------------------------------------------------------------
# Radius scale
# ---------------------------------------------------------------------------

RADIUS_SM   = 4
RADIUS_MD   = 6
RADIUS_LG   = 8
RADIUS_XL   = 12
RADIUS_FULL = 9999

# ---------------------------------------------------------------------------
# Component sizes
# ---------------------------------------------------------------------------

SIDEBAR_WIDTH    = 220
ROW_HEIGHT       = 40
BUTTON_HEIGHT    = 32
BUTTON_HEIGHT_LG = 40
INPUT_HEIGHT     = 32