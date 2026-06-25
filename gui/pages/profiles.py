"""Profiles page — agent-type tabs + profile rows."""
from __future__ import annotations

from tkinter import filedialog, messagebox
from typing import Any, Callable, Dict, List

import customtkinter as ctk

from ..components.button import primary_button
from ..components.card import Card
from ..components.status import Badge, StatusPill
from ..components.toast import ToastManager
from ..wsl import fetch_sessions
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
    "claude":   "primary",
    "codex":    "info",
    "hermes":   "warning",
    "opencode": "neutral",
}


class ProfilesPage(ctk.CTkFrame):
    """Profile list with horizontal agent-type tabs.

    Phase 3.4: incremental list update. Instead of destroying every
    child of ``list_holder`` on tab switch / refresh, we cache
    ``ProfileRow`` instances keyed by profile name and reuse them.
    """

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

        # Cached rows: profile_name -> ProfileRow instance.
        # ``_empty_card`` is shown when no rows match the active tab.
        self._rows: Dict[str, "ProfileRow"] = {}
        self._empty_card: Optional[ctk.CTkBaseClass] = None

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
        new_btn = primary_button(header, text="+ New profile", command=on_new, state="disabled")
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

    def _visible_profiles(self) -> List[Dict[str, str]]:
        if self._active_tab == "all":
            return list(self._profiles)
        return [p for p in self._profiles
                if p.get("agent_type") == self._active_tab]

    def _active_set(self) -> set:
        return {s["profile"] for s in fetch_sessions(active_only=True)}

    def _last_cwd_map(self) -> Dict[str, str]:
        out: Dict[str, str] = {}
        for s in fetch_sessions(limit=200):
            cwd = s.get("cwd") or ""
            if cwd and s["profile"] not in out:
                out[s["profile"]] = cwd
        return out

    def _rebuild_list(self) -> None:
        """Phase 3.4 incremental update.

        Hide rows that aren't visible, create rows for new profiles,
        destroy rows whose profiles no longer exist, then re-grid.
        """
        visible = self._visible_profiles()
        visible_names = {p["name"] for p in visible}

        # Hide cached rows that aren't visible in the current tab
        for name, row in list(self._rows.items()):
            if name not in visible_names:
                row.grid_forget()

        # Remove rows for profiles that no longer exist (e.g. deleted
        # via the CLI between refreshes).
        for name in list(self._rows.keys()):
            if name not in {p["name"] for p in self._profiles}:
                self._rows[name].destroy()
                del self._rows[name]

        # Hide the empty card if we'll have rows; remove it otherwise
        if visible:
            if self._empty_card is not None:
                self._empty_card.destroy()
                self._empty_card = None
        else:
            if self._empty_card is None:
                self._empty_card = self._make_empty_card()
            # Hide rows so the empty card is the only visible thing
            for row in self._rows.values():
                row.grid_forget()
            self._empty_card.grid(row=0, column=0, sticky="ew",
                                  padx=0, pady=48)
            return

        # Build any missing rows + re-grid visible ones in correct order
        active_profiles = self._active_set()
        last_cwd = self._last_cwd_map()
        for i, p in enumerate(visible):
            name = p["name"]
            row = self._rows.get(name)
            if row is None:
                row = ProfileRow(
                    self.list_holder, p,
                    active=(name in active_profiles),
                    on_action=self._on_profile_action,
                    toast=self._toast,
                    last_cwd=last_cwd.get(name, ""),
                )
                self._rows[name] = row
            else:
                # Refresh active status / cwd hint in case state changed
                row.update_state(
                    active=(name in active_profiles),
                    last_cwd=last_cwd.get(name, ""),
                )
            row.grid(row=i, column=0, sticky="ew", pady=(0, 8))

    def _make_empty_card(self) -> ctk.CTkBaseClass:
        """Build the centered empty-state card (lazy — only on first show)."""
        from ..components.card import Card

        empty = Card(self.list_holder)
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
        return empty

    @staticmethod
    def _render_empty(parent: ctk.CTkBaseClass) -> None:
        """Backward-compat helper for direct callers (mostly tests).

        Use :meth:`ProfilesPage._make_empty_card` from the page itself —
        it returns the card so the page can keep a reference and avoid
        rebuilding it on every tab switch.
        """
        page = ProfilesPage.__new__(ProfilesPage)
        card = page._make_empty_card()
        card.grid(row=0, column=0, sticky="ew", padx=0, pady=48)
        return card


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
        self._on_action = on_action

        # Per-row state (preserved across rebuilds via sessions.db history)
        self.cwd_var = ctk.StringVar(value=last_cwd or "~")
        self.mode_var = ctk.StringVar(value=MODE_RESUME)

        self.grid_columnconfigure(1, weight=1)
        self.bind("<Enter>", lambda e: self._set_hover(True))
        self.bind("<Leave>", lambda e: self._set_hover(False))

        at = profile.get("agent_type", "claude")
        self._build_layout(at)

        # Bind click to specific non-interactive areas only
        self._bind_detail_clicks()

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
        self._status_pill.configure(cursor="hand2")

        title_text = self._profile.get("name", "?")
        title = ctk.CTkLabel(
            self, text=title_text, text_color=C("fg"),
            font=FONT_SUBTITLE, anchor="w",
        )
        title.grid(row=0, column=1, sticky="w",
                   padx=(SPACE_SM, SPACE_SM), pady=(SPACE_LG, 2))
        title.bind("<Button-1>", lambda e: self._open_detail())
        title.configure(cursor="hand2")

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
        self._meta_lbl = ctk.CTkLabel(
            self, text=self._compose_meta_text(), text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        )
        self._meta_lbl.grid(row=1, column=1, columnspan=2, sticky="ew",
                            padx=(SPACE_SM, SPACE_SM), pady=(2, SPACE_SM))
        self._meta_lbl.bind("<Button-1>", lambda e: self._open_detail())
        self._meta_lbl.configure(cursor="hand2")

        # --- CWD row (row 2): path text + Edit ⋯ button ---
        cwd_label = ctk.CTkLabel(
            self, textvariable=self.cwd_var,
            text_color=C("fg_subtle"), font=FONT_MONO_SMALL,
            anchor="w",
        )
        cwd_label.grid(row=2, column=1, sticky="ew",
                       padx=(SPACE_SM, SPACE_SM), pady=(0, SPACE_LG))

        self._edit_btn = ctk.CTkButton(
            self, text="Edit  ⋯", width=90, height=28,
            corner_radius=RADIUS_MD,
            fg_color="transparent", hover_color=C("bg_hover"),
            text_color=C("fg_muted"), font=FONT_BODY,
            command=self._open_detail,
        )
        self._edit_btn.grid(row=2, column=2, padx=(0, SPACE_SM),
                            pady=(0, SPACE_LG), sticky="e")

        # Mode dropdown (right of edit, used on launch — kept compact)
        self._mode_menu = ctk.CTkOptionMenu(
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
        self._mode_menu.grid(row=2, column=3, sticky="e",
                             padx=(0, SPACE_LG), pady=(0, SPACE_LG))

        # Browse button for cwd (small icon button in cwd row, column 0)
        self._browse_btn = ctk.CTkButton(
            self, text="📁", width=28, height=28, corner_radius=RADIUS_MD,
            fg_color=C("bg_elevated_2"), hover_color=C("bg_hover"),
            text_color=C("fg_muted"), font=FONT_CAPTION,
            command=self._browse_cwd,
        )
        self._browse_btn.grid(row=2, column=0, padx=(SPACE_LG, 0),
                              pady=(0, SPACE_LG), sticky="w")

    def update_state(self, *, active: bool, last_cwd: str) -> None:
        """Phase 3.4 incremental-update hook.

        Called by ``ProfilesPage._rebuild_list`` when reusing a cached
        ``ProfileRow`` instance. Only the parts that can change without
        rebuilding the layout (status pill, meta text, cwd hint) are
        touched.
        """
        if active != self._active:
            self._active = active
            self._status_pill.set_status("running" if active else "stopped")
        self.cwd_var.set(last_cwd or "~")
        if hasattr(self, "_meta_lbl"):
            self._meta_lbl.configure(text=self._compose_meta_text())

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

    def _bind_detail_clicks(self) -> None:
        """Bind click to open detail on specific non-interactive areas only.

        Only binds to: StatusPill, title, meta label.
        Does NOT bind to: Launch button, Edit button, mode dropdown, browse button.
        """
        # These widgets were already bound in _build_layout
        # - self._status_pill
        # - title
        # - self._meta_lbl
        pass  # No additional binding needed

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
        # Hand off to the page's on_action callback so the app can route
        # navigation properly (with cache + return-to semantics).
        if self._on_action is not None:
            self._on_action(self._profile, "open_detail")
        else:
            self._toast.show(
                f"Detail view for '{self._profile['name']}' — coming soon",
                kind="info",
            )

    def _quick_launch(self) -> None:
        cwd = self.cwd_var.get().strip()
        mode = self.mode_var.get()
        try:
            launch_profile(
                self._profile["name"],
                self._profile.get("agent_type", "claude"),
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