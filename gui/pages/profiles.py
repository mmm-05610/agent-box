"""Profiles page — agent-type tabs + profile rows."""
from __future__ import annotations

from tkinter import filedialog, messagebox
from typing import Any, Callable, Dict, List

import customtkinter as ctk

from ..components.button import primary_button
from ..components.card import Card
from ..components.status import Badge, StatusPill
from ..components.toast import ToastManager
from ..state import fetch_sessions
from ..theme import C
from ..tokens import (
    FONT_BODY,
    FONT_BOLD,
    FONT_CAPTION,
    FONT_DISPLAY,
    FONT_LABEL,
    FONT_MONO_SMALL,
    FONT_SUBTITLE,
    RADIUS_LG,
    RADIUS_MD,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
    SPACE_XL,
    SPACE_XS,
)
from ..wsl import (
    AGENT_ORDER,
    LAUNCH_MODES,
    MODE_RESUME,
    browse_dir,
    launch_profile,
    to_wsl_path,
)


# Map raw agent_type to the badge variant used in the redesigned row.
AGENT_BADGE_VARIANT = {
    "cc":       "primary",
    "codex":    "info",
    "hermes":   "warning",
    "opencode": "neutral",
}


class ProfilesPage(ctk.CTkFrame):
    """Profile list with horizontal agent-type tabs."""

    def __init__(
        self,
        master,
        profiles: List[Dict[str, str]],
        on_profile_action: Callable[[Dict[str, str], str], None],
        on_new: Callable[[], None],
        toast: ToastManager,
    ):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._profiles = profiles
        self._on_profile_action = on_profile_action
        self._on_new = on_new
        self._toast = toast
        self._active_tab = "all"

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # Title row
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew", padx=32, pady=(32, 16))
        header.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            header, text="Profiles", text_color=C("fg"),
            font=FONT_DISPLAY, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w")

        # Header uses the shared primary_button factory
        new_btn = primary_button(header, text="+ New profile", command=on_new)
        new_btn.grid(row=0, column=1, sticky="e")

        # Agent type tabs
        counts: Dict[str, int] = {}
        for p in profiles:
            at = p.get("agent_type", "")
            counts[at] = counts.get(at, 0) + 1
        self._tab_counts = counts

        tabs_row = ctk.CTkFrame(self, fg_color="transparent")
        tabs_row.grid(row=1, column=0, sticky="ew", padx=32, pady=(0, 16))
        self._tab_buttons: Dict[str, ctk.CTkButton] = {}
        self._tab_indicators: Dict[str, ctk.CTkFrame] = {}
        tabs = [("all", "All", sum(counts.values()))] + [
            (at, at.upper(), counts.get(at, 0)) for at in AGENT_ORDER
        ]
        for i, (key, label, count) in enumerate(tabs):
            # Wrap each tab in a vertical frame: button on top, 3px indicator below.
            # The indicator toggles fg_color to show active state (Phase 2.4).
            holder = ctk.CTkFrame(tabs_row, fg_color="transparent")
            holder.grid(row=0, column=i, padx=(0, 4), sticky="nsw")

            btn = ctk.CTkButton(
                holder, text=f"{label} ({count})", height=36,
                corner_radius=0,
                fg_color="transparent", text_color=C("fg_muted"),
                hover_color=C("bg_hover"), font=FONT_BOLD,
                command=lambda k=key: self._select_tab(k),
            )
            btn.pack(fill="x")

            indicator = ctk.CTkFrame(
                holder, fg_color="transparent",
                height=3, corner_radius=2,
            )
            indicator.pack(fill="x", pady=(0, 0))

            self._tab_buttons[key] = btn
            self._tab_indicators[key] = indicator

        # Profile list (must be created before _select_tab which calls _rebuild_list)
        self.list_holder = ctk.CTkScrollableFrame(
            self, fg_color=C("bg"), corner_radius=0,
        )
        self.list_holder.grid(row=2, column=0, sticky="nsew",
                              padx=32, pady=(0, 16))
        self.list_holder.grid_columnconfigure(0, weight=1)

        self._select_tab("all")

    def _select_tab(self, key: str) -> None:
        self._active_tab = key
        for k, btn in self._tab_buttons.items():
            indicator = self._tab_indicators[k]
            if k == key:
                btn.configure(text_color=C("fg"))
                indicator.configure(fg_color=C("primary"))
            else:
                btn.configure(text_color=C("fg_muted"))
                indicator.configure(fg_color="transparent")
        self._rebuild_list()

    def _rebuild_list(self) -> None:
        for w in self.list_holder.winfo_children():
            w.destroy()

        if self._active_tab == "all":
            visible = self._profiles
        else:
            visible = [p for p in self._profiles
                       if p.get("agent_type") == self._active_tab]

        if not visible:
            self._render_empty(self.list_holder)
            return

        active_profiles = {s["profile"] for s in fetch_sessions(active_only=True)}

        last_cwd_by_profile: Dict[str, str] = {}
        for s in fetch_sessions(limit=200):
            cwd = s.get("cwd") or ""
            if cwd and s["profile"] not in last_cwd_by_profile:
                last_cwd_by_profile[s["profile"]] = cwd

        for i, p in enumerate(visible):
            ProfileRow(
                self.list_holder, p,
                active=(p["name"] in active_profiles),
                on_action=self._on_profile_action,
                toast=self._toast,
                last_cwd=last_cwd_by_profile.get(p["name"], ""),
            ).grid(row=i, column=0, sticky="ew", pady=(0, 8))

    @staticmethod
    def _render_empty(parent: ctk.CTkBaseClass) -> None:
        """Centered empty-state card with CTA-style headline.

        Phase 2.5 — replaces the plain centered label with a Card.
        """
        empty = Card(parent)
        empty.grid(row=0, column=0, sticky="ew", padx=0, pady=48)
        empty.grid_columnconfigure(0, weight=1)

        icon = ctk.CTkLabel(
            empty, text="📁", text_color=C("fg_subtle"),
            font=("Segoe UI Variable", 48, "normal"),
        )
        icon.grid(row=0, column=0, pady=(SPACE_XL, SPACE_SM))

        title = ctk.CTkLabel(
            empty, text="No profiles yet",
            text_color=C("fg"), font=FONT_SUBTITLE,
        )
        title.grid(row=1, column=0)

        body = ctk.CTkLabel(
            empty,
            text="Create your first agent profile to get started.",
            text_color=C("fg_muted"), font=FONT_CAPTION,
        )
        body.grid(row=2, column=0, pady=(SPACE_XS, SPACE_LG))


class ProfileRow(Card):
    """Redesigned single profile row.

    Layout per spec §2.2:
      ● DW                                            ▶ Launch
        Claude Code · Running · 2h 13m
        ~/projects/dw                              [Edit ⋯]
    """

    def __init__(
        self,
        master,
        profile: Dict[str, str],
        active: bool,
        on_action: Callable[[Dict[str, str], str], None],
        toast: ToastManager,
        last_cwd: str = "",
    ):
        super().__init__(master)
        self._profile = profile
        self._toast = toast
        self._active = active

        # Per-row state (preserved across rebuilds via sessions.db history)
        self.cwd_var = ctk.StringVar(value=last_cwd or "~")
        self.mode_var = ctk.StringVar(value=MODE_RESUME)

        self.grid_columnconfigure(1, weight=1)
        self.bind("<Enter>", lambda e: self._set_hover(True))
        self.bind("<Leave>", lambda e: self._set_hover(False))

        at = profile.get("agent_type", "cc")
        self._build_layout(at)

    def _build_layout(self, at: str) -> None:
        # --- Title row (row 0): StatusPill + Name + Agent Badge + Launch ---
        self._status_pill = StatusPill(
            self, status="running" if self._active else "stopped", size="md",
        )
        self._status_pill.grid(
            row=0, column=0, padx=(SPACE_LG, SPACE_SM),
            pady=(SPACE_LG, 0), sticky="w",
        )
        self._status_pill.bind("<Button-1>", lambda e: self._open_detail())

        title_text = self._profile.get("name", "?")
        title = ctk.CTkLabel(
            self, text=title_text, text_color=C("fg"),
            font=FONT_SUBTITLE, anchor="w",
        )
        title.grid(row=0, column=1, sticky="w",
                   padx=(SPACE_SM, SPACE_SM), pady=(SPACE_LG, 2))
        title.bind("<Button-1>", lambda e: self._open_detail())

        # Agent type badge next to name (Phase 2 visual upgrade)
        variant = AGENT_BADGE_VARIANT.get(at, "neutral")
        badge = Badge(self, text=at.upper(), variant=variant)
        badge.grid(row=0, column=2, sticky="w",
                   padx=(0, SPACE_SM), pady=(SPACE_LG + 4, 0))

        # Launch button — wider, with text per spec
        self._launch_btn = ctk.CTkButton(
            self, text="▶  Launch", width=110, height=36,
            corner_radius=RADIUS_MD,
            fg_color=C("primary"), hover_color=C("primary_hover"),
            text_color=C("primary_fg"), font=FONT_BOLD,
            command=self._quick_launch,
        )
        self._launch_btn.grid(
            row=0, column=3, padx=(SPACE_SM, 0), pady=(SPACE_LG, 0),
            sticky="e",
        )

        # --- Meta row (row 1): Agent type · Status · Runtime ---
        meta_text = self._compose_meta_text()
        meta = ctk.CTkLabel(
            self, text=meta_text, text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        )
        meta.grid(row=1, column=1, columnspan=2, sticky="ew",
                  padx=(SPACE_SM, SPACE_SM), pady=(2, SPACE_SM))
        meta.bind("<Button-1>", lambda e: self._open_detail())

        # --- CWD row (row 2): path text + Edit ⋯ button ---
        cwd_label = ctk.CTkLabel(
            self, textvariable=self.cwd_var,
            text_color=C("fg_subtle"), font=FONT_MONO_SMALL,
            anchor="w",
        )
        cwd_label.grid(row=2, column=1, sticky="ew",
                       padx=(SPACE_SM, SPACE_SM), pady=(0, SPACE_LG))

        edit_btn = ctk.CTkButton(
            self, text="Edit  ⋯", width=90, height=28,
            corner_radius=RADIUS_MD,
            fg_color="transparent", hover_color=C("bg_hover"),
            text_color=C("fg_muted"), font=FONT_BODY,
            command=self._open_detail,
        )
        edit_btn.grid(row=2, column=2, padx=(0, SPACE_SM),
                      pady=(0, SPACE_LG), sticky="e")

        # Mode dropdown (right of edit, used on launch — kept compact)
        mode_menu = ctk.CTkOptionMenu(
            self, variable=self.mode_var,
            values=list(LAUNCH_MODES),
            width=100, height=28, corner_radius=RADIUS_MD,
            fg_color=C("bg_elevated_2"), button_color=C("bg_hover"),
            button_hover_color=C("bg_active"),
            text_color=C("fg"), dropdown_text_color=C("fg"),
            dropdown_fg_color=C("surface_overlay"),
            dropdown_hover_color=C("bg_hover"),
            font=FONT_CAPTION, dropdown_font=FONT_CAPTION,
        )
        mode_menu.grid(row=2, column=3, sticky="e",
                       padx=(0, SPACE_LG), pady=(0, SPACE_LG))

        # Browse button for cwd (small icon button in cwd row, column 0)
        browse_btn = ctk.CTkButton(
            self, text="📁", width=28, height=28, corner_radius=RADIUS_MD,
            fg_color=C("bg_elevated_2"), hover_color=C("bg_hover"),
            text_color=C("fg_muted"), font=FONT_CAPTION,
            command=self._browse_cwd,
        )
        browse_btn.grid(row=2, column=0, padx=(SPACE_LG, 0),
                        pady=(0, SPACE_LG), sticky="w")

    def _compose_meta_text(self) -> str:
        at = self._profile.get("agent_type", "")
        runtime = self._runtime_for(self._profile.get("name", ""))
        if self._active:
            base = f"{at.upper()}  ·  Running"
            if runtime:
                base += f"  ·  {runtime}"
            return base
        return f"{at.upper()}  ·  Idle"

    @staticmethod
    def _runtime_for(profile_name: str) -> str:
        """Return '2h 13m' for the active session of ``profile_name`` (if any)."""
        if not profile_name:
            return ""
        for s in fetch_sessions(active_only=True):
            if s.get("profile") == profile_name and s.get("launched_at"):
                from datetime import datetime
                try:
                    started = datetime.fromisoformat(s["launched_at"])
                except ValueError:
                    return ""
                delta = datetime.now() - started
                secs = int(delta.total_seconds())
                if secs < 60:
                    return f"{secs}s"
                if secs < 3600:
                    return f"{secs // 60}m"
                return f"{secs // 3600}h {(secs % 3600) // 60}m"
        return ""

    def _set_hover(self, hover: bool) -> None:
        # Card.set_hover handles bg + border swap; preserves our overrides
        super().set_hover(hover)
        # Also reveal / dim the cwd edit affordance to reinforce affordance
        if hasattr(self, "_edit_btn"):
            try:
                self._edit_btn.configure(
                    text_color=C("fg") if hover else C("fg_muted"),
                )
            except Exception:
                pass

    def _browse_cwd(self) -> None:
        browse_dir(self.cwd_var)

    def _open_detail(self) -> None:
        # Stage A placeholder — Phase 4 wires up the real detail view.
        self._toast.show(
            f"Detail view for '{self._profile['name']}' — Stage B",
            kind="info",
        )

    def _quick_launch(self) -> None:
        cwd = self.cwd_var.get().strip()
        mode = self.mode_var.get()
        try:
            launch_profile(
                self._profile["name"],
                self._profile.get("agent_type", "cc"),
                mode, cwd,
            )
            launch_label = (
                f"Launched {self._profile['name']} ({mode})"
                + (f" in {cwd}" if cwd else "")
            )
            self._toast.show(launch_label, kind="success")
            self._active = True
            self.set_hover(True)  # visual confirmation
        except RuntimeError as exc:
            messagebox.showerror("Launch failed", str(exc))
            self._toast.show(f"Launch failed: {exc}", kind="error")