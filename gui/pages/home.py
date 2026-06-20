"""Home page — dashboard with status cards, quick launch, activity."""
from __future__ import annotations

from typing import Any, Callable, Dict, List

import customtkinter as ctk

from ..components.card import StatCard
from ..components.status import StatusPill
from ..theme import C
from ..tokens import (
    FONT_BODY,
    FONT_CAPTION,
    FONT_DISPLAY,
    FONT_LABEL,
    FONT_MICRO,
    FONT_SUBTITLE,
    RADIUS_LG,
    SPACE_2XL,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
    SPACE_XL,
)
from ..wsl import AGENT_ORDER


class HomePage(ctk.CTkFrame):
    """Welcome screen — stats, quick launch, recent activity, distribution."""

    def __init__(
        self,
        master,
        on_nav: Callable[[str], None],
        profiles: List[Dict[str, str]],
        sessions_getter: Callable[..., List[Dict[str, Any]]],
    ):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._on_nav = on_nav
        self._profiles = profiles
        self._sessions_getter = sessions_getter

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # Title block
        title_block = ctk.CTkFrame(self, fg_color="transparent")
        title_block.grid(row=0, column=0, sticky="ew",
                         padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_LG))
        title_block.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            title_block, text="Welcome back", text_color=C("fg"),
            font=FONT_DISPLAY, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w")

        subtitle = ctk.CTkLabel(
            title_block, text="Your agent-box overview",
            text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        )
        subtitle.grid(row=1, column=0, sticky="w", pady=(2, 0))

        body = ctk.CTkScrollableFrame(self, fg_color=C("bg"), corner_radius=0)
        body.grid(row=1, column=0, sticky="nsew",
                  padx=SPACE_2XL, pady=(0, SPACE_LG))
        body.grid_columnconfigure(0, weight=1)

        # 1. Status cards row (uses StatCard component)
        cards_row = ctk.CTkFrame(body, fg_color="transparent")
        cards_row.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_XL))
        cards_row.grid_columnconfigure((0, 1, 2), weight=1)

        active_count = sum(1 for s in self._sessions_getter(active_only=True))
        profile_total = len(self._profiles)
        agent_types = len({p.get("agent_type", "") for p in self._profiles})

        self._stat(cards_row, 0, "▶", "RUNNING", str(active_count),
                   C("status_running"))
        self._stat(cards_row, 1, "◫", "PROFILES", str(profile_total),
                   C("primary"))
        self._stat(cards_row, 2, "▦", "AGENT TYPES", f"{agent_types} / 4",
                   C("accent"))

        # 2. Quick launch
        self._section_label(body, 1, "QUICK LAUNCH")
        ql_frame = ctk.CTkFrame(
            body, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        ql_frame.grid(row=2, column=0, sticky="ew", pady=(0, SPACE_XL))

        recent_sessions = self._sessions_getter(limit=5)
        if not recent_sessions:
            ql_empty = ctk.CTkLabel(
                ql_frame,
                text="No launches yet — go to Profiles and launch one.",
                text_color=C("fg_muted"), font=FONT_CAPTION,
            )
            ql_empty.pack(padx=SPACE_LG, pady=SPACE_LG)
        else:
            for s in recent_sessions:
                self._quick_row(ql_frame, s)

        # 3. Recent activity
        self._section_label(body, 3, "RECENT ACTIVITY")
        ra_frame = ctk.CTkFrame(
            body, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        ra_frame.grid(row=4, column=0, sticky="ew", pady=(0, SPACE_XL))
        for s in self._sessions_getter(limit=8):
            self._recent_row(ra_frame, s)

        # 4. Agent type distribution
        self._section_label(body, 5, "AGENT TYPE DISTRIBUTION")
        dist_frame = ctk.CTkFrame(
            body, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        dist_frame.grid(row=6, column=0, sticky="ew", pady=(0, SPACE_LG))
        dist_frame.grid_columnconfigure(1, weight=1)
        for i, at in enumerate(AGENT_ORDER):
            count = sum(1 for p in self._profiles if p.get("agent_type") == at)
            self._dist_row(dist_frame, i, at, count, profile_total or 1)

    def _section_label(self, master, row: int, text: str) -> None:
        """Small uppercase section divider."""
        lbl = ctk.CTkLabel(
            master, text=text, text_color=C("fg_subtle"),
            font=FONT_LABEL, anchor="w",
        )
        lbl.grid(row=row, column=0, sticky="ew", pady=(0, SPACE_SM))

    def _stat(self, master, col: int, icon: str, label: str,
              value: str, accent: str) -> None:
        """Stat tile — uses the StatCard component."""
        card = StatCard(master, icon=icon, value=value, label=label,
                        accent=accent)
        card.grid(
            row=0, column=col, sticky="ew",
            padx=(0 if col == 0 else SPACE_SM, SPACE_SM if col < 2 else 0),
        )

    def _quick_row(self, master, s: Dict[str, Any]) -> None:
        star = ctk.CTkLabel(
            master, text="⭐", text_color=C("warning"), font=FONT_BODY,
        )
        star.pack(side="left", padx=(SPACE_LG, SPACE_SM), pady=6)

        name = ctk.CTkLabel(
            master, text=s['profile'], text_color=C("fg"),
            font=FONT_SUBTITLE, anchor="w",
        )
        name.pack(side="left", pady=6)

        meta = ctk.CTkLabel(
            master, text=f"{s['agent_type']}  ·  {s['mode']}",
            text_color=C("fg_muted"), font=FONT_MICRO, anchor="e",
        )
        meta.pack(side="right", padx=(0, SPACE_LG), pady=6)

    def _recent_row(self, master, s: Dict[str, Any]) -> None:
        is_active = s.get("exited_at") is None
        pill = StatusPill(
            master, status="running" if is_active else "stopped", size="sm",
        )
        pill.pack(side="left", padx=(SPACE_LG, SPACE_MD), pady=4)

        line = ctk.CTkLabel(
            master,
            text=f"{s['profile']}  ·  {s['mode']}  ·  {s['cwd']}",
            text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        )
        line.pack(side="left", fill="x", expand=True,
                  padx=(0, SPACE_LG), pady=4)

    def _dist_row(self, master, row: int, at: str,
                  count: int, total: int) -> None:
        label = ctk.CTkLabel(
            master, text=at, text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        )
        label.grid(row=row, column=0, sticky="w",
                   padx=(SPACE_LG, SPACE_MD), pady=6)

        bar = ctk.CTkProgressBar(
            master, height=8, corner_radius=4,
            fg_color=C("bg"), progress_color=C("primary"),
        )
        bar.set(count / total if total else 0)
        bar.grid(row=row, column=1, sticky="ew",
                 padx=(0, SPACE_MD), pady=6)

        val = ctk.CTkLabel(
            master, text=str(count), text_color=C("fg"),
            font=FONT_CAPTION, anchor="e",
        )
        val.grid(row=row, column=2, sticky="e",
                 padx=(0, SPACE_LG), pady=6)