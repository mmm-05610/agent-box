"""Sessions page — launch history with active and recent sections."""
from __future__ import annotations

from typing import Any, Callable, Dict

import customtkinter as ctk

from ..components.status import StatusPill
from ..theme import C
from ..tokens import (
    FONT_CAPTION,
    FONT_DISPLAY,
    FONT_LABEL,
    RADIUS_MD,
    SPACE_2XL,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
    SPACE_XL,
    SPACE_XS,
)


class SessionsPage(ctk.CTkFrame):
    """Launch history — active + recent (read-only)."""

    def __init__(self, master,
                 sessions_getter: Callable[..., list]):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._sessions_getter = sessions_getter

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # Title block
        title_block = ctk.CTkFrame(self, fg_color="transparent")
        title_block.grid(row=0, column=0, sticky="ew",
                         padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_LG))
        title_block.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            title_block, text="Sessions", text_color=C("fg"),
            font=FONT_DISPLAY, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w")

        subtitle = ctk.CTkLabel(
            title_block, text="Launch history and active processes",
            text_color=C("fg_muted"), font=FONT_CAPTION, anchor="w",
        )
        subtitle.grid(row=1, column=0, sticky="w", pady=(2, 0))

        body = ctk.CTkScrollableFrame(self, fg_color=C("bg"), corner_radius=0)
        body.grid(row=1, column=0, sticky="nsew",
                  padx=SPACE_2XL, pady=(0, SPACE_LG))
        body.grid_columnconfigure(0, weight=1)

        # Active section
        sec1 = ctk.CTkLabel(
            body, text="● ACTIVE", text_color=C("fg_subtle"),
            font=FONT_LABEL, anchor="w",
        )
        sec1.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_SM))

        active = sessions_getter(active_only=True)
        if not active:
            none_lbl = ctk.CTkLabel(
                body, text="No active sessions.",
                text_color=C("fg_muted"), font=FONT_CAPTION, anchor="w",
            )
            none_lbl.grid(row=1, column=0, sticky="ew", pady=(0, SPACE_XL))
        else:
            for i, s in enumerate(active):
                self._session_row(body, i + 1, s, active=True)

        # Recent section
        sec2 = ctk.CTkLabel(
            body, text="RECENT", text_color=C("fg_subtle"),
            font=FONT_LABEL, anchor="w",
        )
        sec2.grid(row=20, column=0, sticky="ew", pady=(SPACE_LG, SPACE_SM))

        recent = [s for s in sessions_getter(limit=30)
                  if s.get("exited_at") is not None][:20]
        for i, s in enumerate(recent):
            self._session_row(body, i + 21, s, active=False)

    def _session_row(self, master, row: int,
                     s: Dict[str, Any], active: bool) -> None:
        frame = ctk.CTkFrame(
            master, fg_color=C("bg_elevated"), corner_radius=RADIUS_MD,
            border_width=1, border_color=C("border"),
        )
        frame.grid(row=row, column=0, sticky="ew", pady=(0, SPACE_XS))
        frame.grid_columnconfigure(1, weight=1)

        pill = StatusPill(
            frame, status="running" if active else "stopped", size="sm",
        )
        pill.grid(row=0, column=0, padx=SPACE_MD, pady=SPACE_MD, sticky="w")

        info = ctk.CTkLabel(
            frame,
            text=f"{s['profile']} ({s['agent_type']})  ·  {s['mode']}  "
                 f"·  {s['cwd']}  ·  {s['launched_at']}",
            text_color=C("fg_muted") if not active else C("fg"),
            font=FONT_CAPTION, anchor="w",
        )
        info.grid(row=0, column=1, sticky="ew",
                  pady=SPACE_MD, padx=(0, SPACE_MD))