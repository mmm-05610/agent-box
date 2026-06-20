"""Profiles page — agent-type tabs + profile rows."""
from __future__ import annotations

from tkinter import filedialog, messagebox
from typing import Any, Callable, Dict, List

import customtkinter as ctk

from ..components.status import StatusPill
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

        new_btn = ctk.CTkButton(
            header, text="+ New profile", height=32, corner_radius=RADIUS_MD,
            fg_color=C("primary"), hover_color=C("primary_hover"),
            text_color=C("primary_fg"), font=FONT_BOLD,
            command=on_new,
        )
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
        tabs = [("all", "All", sum(counts.values()))] + [
            (at, at.upper(), counts.get(at, 0)) for at in AGENT_ORDER
        ]
        for i, (key, label, count) in enumerate(tabs):
            btn = ctk.CTkButton(
                tabs_row, text=f"{label}  {count}", height=40, corner_radius=0,
                fg_color="transparent", text_color=C("fg_muted"),
                hover_color=C("bg_hover"), font=FONT_BOLD,
                command=lambda k=key: self._select_tab(k),
            )
            btn.grid(row=0, column=i, padx=(0, 4), sticky="w")
            self._tab_buttons[key] = btn

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
            if k == key:
                btn.configure(text_color=C("fg"))
            else:
                btn.configure(text_color=C("fg_muted"))
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
            empty = ctk.CTkLabel(
                self.list_holder,
                text="No profiles yet.\n\nCreate one to get started.",
                text_color=C("fg_muted"), font=FONT_BODY, justify="center",
            )
            empty.grid(row=0, column=0, pady=80)
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


class ProfileRow(ctk.CTkFrame):
    """Single profile row — status pill + name + meta + cwd + actions."""

    def __init__(
        self,
        master,
        profile: Dict[str, str],
        active: bool,
        on_action: Callable[[Dict[str, str], str], None],
        toast: ToastManager,
        last_cwd: str = "",
    ):
        super().__init__(
            master, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        self._profile = profile
        self._toast = toast
        self._active = active

        # CWD + mode state (per-row, remembered across rebuilds via sessions.db)
        self.cwd_var = ctk.StringVar(value=last_cwd or "~")
        self.mode_var = ctk.StringVar(value=MODE_RESUME)

        self.grid_columnconfigure(1, weight=1)
        self.bind("<Enter>", lambda e: self._set_hover(True))
        self.bind("<Leave>", lambda e: self._set_hover(False))

        # Status pill
        self._status_pill = StatusPill(
            self, status="running" if active else "stopped", size="sm",
        )
        self._status_pill.grid(row=0, column=0, padx=(SPACE_LG, SPACE_SM),
                               pady=(SPACE_LG, 0), sticky="nw")
        self._status_pill.bind("<Button-1>", lambda e: self._open_detail())

        # Title row
        title_text = profile.get("name", "?")
        title = ctk.CTkLabel(
            self, text=title_text, text_color=C("fg"),
            font=FONT_SUBTITLE, anchor="w",
        )
        title.grid(row=0, column=1, sticky="ew",
                   padx=(SPACE_MD, SPACE_SM), pady=(SPACE_LG, 2))
        title.bind("<Button-1>", lambda e: self._open_detail())

        # Meta row
        at = profile.get("agent_type", "")
        meta = ctk.CTkLabel(
            self, text=at, text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        )
        meta.grid(row=1, column=1, sticky="ew",
                  padx=(SPACE_MD, SPACE_SM), pady=(0, SPACE_MD))
        meta.bind("<Button-1>", lambda e: self._open_detail())

        # Bottom row: cwd entry + browse + mode dropdown
        ctrl_frame = ctk.CTkFrame(self, fg_color="transparent")
        ctrl_frame.grid(row=2, column=1, sticky="ew",
                        padx=(SPACE_MD, 0), pady=(0, SPACE_LG))
        ctrl_frame.grid_columnconfigure(1, weight=1)

        cwd_label = ctk.CTkLabel(
            ctrl_frame, text="cwd", text_color=C("fg_subtle"),
            font=FONT_LABEL, width=28, anchor="w",
        )
        cwd_label.grid(row=0, column=0, padx=(0, SPACE_SM), sticky="w")

        cwd_entry = ctk.CTkEntry(
            ctrl_frame, textvariable=self.cwd_var,
            placeholder_text="~/...",
            font=FONT_MONO_SMALL, height=28,
            fg_color=C("bg"), border_color=C("border"), border_width=1,
            corner_radius=RADIUS_MD,
        )
        cwd_entry.grid(row=0, column=1, sticky="ew", padx=(0, SPACE_XS))

        browse_btn = ctk.CTkButton(
            ctrl_frame, text="📁", width=30, height=28, corner_radius=RADIUS_MD,
            fg_color=C("bg_elevated_2"), hover_color=C("bg_hover"),
            text_color=C("fg_muted"), font=FONT_CAPTION,
            command=self._browse_cwd,
        )
        browse_btn.grid(row=0, column=2, padx=(0, SPACE_XS))

        mode_menu = ctk.CTkOptionMenu(
            ctrl_frame, variable=self.mode_var,
            values=list(LAUNCH_MODES),
            width=110, height=28, corner_radius=RADIUS_MD,
            fg_color=C("bg_elevated_2"), button_color=C("bg_hover"),
            button_hover_color=C("bg_active"),
            text_color=C("fg"), dropdown_text_color=C("fg"),
            dropdown_fg_color=C("surface_overlay"),
            dropdown_hover_color=C("bg_hover"),
            font=FONT_CAPTION, dropdown_font=FONT_CAPTION,
        )
        mode_menu.grid(row=0, column=3, sticky="e")

        # Right-side action buttons
        self._launch_btn = ctk.CTkButton(
            self, text="▶", width=40, height=40, corner_radius=RADIUS_MD,
            fg_color=C("primary"), hover_color=C("primary_hover"),
            text_color=C("primary_fg"), font=FONT_SUBTITLE,
            command=self._quick_launch,
        )
        self._more_btn = ctk.CTkButton(
            self, text="⋯", width=40, height=40, corner_radius=RADIUS_MD,
            fg_color="transparent", hover_color=C("bg_hover"),
            text_color=C("fg_muted"), font=FONT_BODY,
            command=self._open_detail,
        )
        self._launch_btn.grid(row=0, column=2, rowspan=2,
                              padx=(SPACE_SM, 0), pady=SPACE_LG, sticky="ne")
        self._more_btn.grid(row=0, column=3, rowspan=2,
                            padx=(0, SPACE_LG), pady=SPACE_LG, sticky="ne")

    def _set_hover(self, hover: bool) -> None:
        if hover:
            self.configure(
                fg_color=C("bg_hover"), border_color=C("border_strong"),
            )
        else:
            self.configure(
                fg_color=C("bg_elevated"), border_color=C("border"),
            )

    def _browse_cwd(self) -> None:
        """Open Windows directory picker, convert to WSL path, store in cwd_var."""
        browse_dir(self.cwd_var)

    def _open_detail(self) -> None:
        # Stage A: placeholder. Stage B will open detail view.
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
            self.configure(fg_color=C("bg_hover"))
        except RuntimeError as exc:
            messagebox.showerror("Launch failed", str(exc))
            self._toast.show(f"Launch failed: {exc}", kind="error")