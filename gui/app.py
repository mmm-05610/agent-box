"""AgentBoxApp — main orchestrator + entry point.

Owns the root ``ctk.CTk``, the sidebar, the content area, the bottom
status bar, and the toast manager. Routes navigation between page
instances and triggers data refresh.

Run directly: ``python -m gui.app``
"""
from __future__ import annotations

import sys
import threading
from collections import OrderedDict
from pathlib import Path
from tkinter import messagebox
from typing import Any, Dict, List, Optional

import customtkinter as ctk

from .components import NAV_ITEMS, Sidebar, ToastManager
from .pages import (
    CreationWizard,
    HelpPage,
    HomePage,
    ProfileDetailPage,
    ProfilesPage,
    SessionsPage,
    SettingsPage,
)
from .state import cleanup_stale_sessions, fetch_sessions
from .theme import C, Theme
from .tokens import FONT_MICRO, SPACE_LG
from .wsl import MODE_RESUME, fetch_profiles, launch_profile


# Maximum number of page instances kept in the cache. Older pages are
# discarded when the cap is exceeded (LRU).
_PAGE_CACHE_CAP = 5

# All paths are WSL-side paths with forward slashes.
# The GUI runs on Windows for rendering, but all config operations
# happen in WSL. We use a string to preserve forward slashes.
_PROFILE_ROOT_STR = "/home/maoqh/.agent-box/profiles"

# Agent type → config directory name mapping
AGENT_CONFIG_DIR = {
    "cc":       "dot-claude",
    "codex":    "dot-codex",
    "hermes":   "dot-hermes",
    "opencode": "dot-opencode",
}


class AgentBoxApp:
    """Top-level controller for the agent-box desktop GUI.

    Page caching (Phase 3.1): instead of destroying + rebuilding every
    child of ``self.content`` on each navigation, we keep page instances
    alive in an LRU cache and just show/hide them. This eliminates the
    flicker users reported when switching between Home and Profiles.
    """

    def __init__(self, root: ctk.CTk) -> None:
        self.root = root
        self.root.title("Agent Box")
        self.root.geometry("1280x800")
        self.root.minsize(960, 600)
        self.root.configure(fg_color=C("bg_canvas"))

        # State
        self._profiles: List[dict] = []
        self._current_page: str = "home"
        self._status_text: str = "Ready."
        self._pages: "OrderedDict[str, ctk.CTkBaseClass]" = OrderedDict()
        self._refreshing = False
        # When set, the next ``_show_page`` returns here instead of the
        # sidebar's last key — used by the detail / wizard "back" buttons.
        self._return_to: Optional[str] = None
        self.toast = ToastManager(self.root)

        # Build layout
        self.root.grid_columnconfigure(1, weight=1)
        self.root.grid_rowconfigure(0, weight=1)
        self.root.grid_rowconfigure(1, weight=0)

        self.sidebar = Sidebar(
            self.root,
            on_nav=self._on_nav,
            on_settings=self._on_nav,
            status_getter=self._active_count,
        )
        self.sidebar.grid(row=0, column=0, sticky="nsew")

        self.content = ctk.CTkFrame(self.root, fg_color=C("bg"), corner_radius=0)
        self.content.grid(row=0, column=1, sticky="nsew")
        self.content.grid_columnconfigure(0, weight=1)
        self.content.grid_rowconfigure(0, weight=1)

        # Bottom status bar — thin row with a top border separator
        status_holder = ctk.CTkFrame(
            self.root, fg_color=C("bg"), corner_radius=0, height=26,
        )
        status_holder.grid(row=1, column=0, columnspan=2, sticky="ew")
        status_holder.grid_propagate(False)
        status_holder.grid_columnconfigure(0, weight=1)

        top_border = ctk.CTkFrame(
            status_holder, fg_color=C("border"), height=1, corner_radius=0,
        )
        top_border.grid(row=0, column=0, sticky="ew")

        self.status_bar = ctk.CTkLabel(
            status_holder, text=self._status_text, text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="w",
        )
        self.status_bar.grid(row=1, column=0, sticky="ew",
                             padx=SPACE_LG, pady=4)

        # Clean up zombie sessions from previous runs
        cleaned = cleanup_stale_sessions()
        if cleaned > 0:
            self._status_text = f"Cleaned {cleaned} stale session(s)."

        # Initial load + render
        self.refresh()
        self._show_page("home")

    # --- state ----------------------------------------------------------

    def _active_count(self) -> int:
        return len(fetch_sessions(active_only=True))

    def _on_nav(self, key: str) -> None:
        if key not in {k for k, _, _ in NAV_ITEMS}:
            return
        # Sidebar nav always clears the "return to" target
        self._return_to = None
        self._show_page(key)

    # --- page caching ---------------------------------------------------

    def _build_page(self, key: str) -> ctk.CTkBaseClass:
        """Instantiate a fresh page object for ``key``.

        Detail / wizard pages are addressed by special keys that include
        a payload suffix (e.g. ``detail:dw``) so we can cache multiple
        detail pages independently.
        """
        if key == "home":
            return HomePage(self.content, self._on_nav,
                            self._profiles, fetch_sessions)
        if key == "profiles":
            return ProfilesPage(
                self.content, self._profiles,
                on_profile_action=self._on_profile_action,
                on_new=self._on_new_profile,
                toast=self.toast,
            )
        if key == "sessions":
            return SessionsPage(self.content, fetch_sessions)
        if key == "settings":
            return SettingsPage(self.content,
                                on_theme_change=self._apply_theme)
        if key == "help":
            return HelpPage(self.content)
        if key == "wizard":
            return CreationWizard(
                self.content,
                toast=self.toast,
                on_finish=self._on_wizard_finish,
                on_cancel=self._on_wizard_cancel,
            )
        if key.startswith("detail:"):
            name = key.split(":", 1)[1]
            profile = next(
                (p for p in self._profiles if p.get("name") == name),
                {"name": name, "agent_type": "cc"},
            )
            agent_type = profile.get("agent_type", "cc")
            config_dir = AGENT_CONFIG_DIR.get(agent_type, "dot-claude")
            profile_root = _PROFILE_ROOT_STR + "/" + name
            config_root = profile_root + "/" + config_dir
            return ProfileDetailPage(
                self.content,
                profile=profile,
                profile_root=profile_root,
                config_root=config_root,
                on_back=lambda: self._on_nav(
                    self._return_to or "profiles"
                ),
                on_provider_change=lambda _p: None,
                on_delete=lambda n: self.toast.show(
                    f"Delete {n} (Phase 4.x)", kind="info",
                ),
                toast=self.toast,
            )
        raise KeyError(f"unknown page key: {key!r}")

    def _evict_if_needed(self) -> None:
        """Drop the oldest cached pages beyond the cap."""
        while len(self._pages) > _PAGE_CACHE_CAP:
            _, old = self._pages.popitem(last=False)
            try:
                old.destroy()
            except Exception:
                pass

    def _show_page(self, key: str, *, force_rebuild: bool = False) -> None:
        """Navigate to ``key``. Reuses cached instances when possible.

        ``force_rebuild=True`` evicts the cached instance first; used by
        the theme change handler so colors pick up the new palette.
        """
        # Hide whatever is currently shown
        current = self._pages.get(self._current_page)
        if current is not None:
            try:
                current.grid_forget()
            except Exception:
                pass

        # Drop the cached page if a rebuild is requested (theme change,
        # explicit refresh, etc.)
        if force_rebuild and key in self._pages:
            try:
                self._pages[key].destroy()
            except Exception:
                pass
            del self._pages[key]

        # Get or create the target page
        page = self._pages.get(key)
        if page is None:
            page = self._build_page(key)
            self._pages[key] = page
            self._evict_if_needed()

        # Refresh LRU order
        self._pages.move_to_end(key)

        # Show the target page
        page.grid(row=0, column=0, sticky="nsew")

        self._current_page = key
        # Only highlight the sidebar for top-level nav keys
        if key in {k for k, _, _ in NAV_ITEMS}:
            self.sidebar.set_active(key)

    def _invalidate_pages(self, keys: Optional[List[str]] = None) -> None:
        """Drop cached pages so the next navigation rebuilds them."""
        targets = keys if keys is not None else list(self._pages.keys())
        for k in targets:
            if k in self._pages:
                try:
                    self._pages[k].destroy()
                except Exception:
                    pass
                del self._pages[k]

    # --- actions --------------------------------------------------------

    def _apply_theme(self) -> None:
        """Rebuild the current page so all colors pick up new theme."""
        self._show_page(self._current_page, force_rebuild=True)
        self.sidebar.update_status()

    def _on_profile_action(self, profile: dict, action: str) -> None:
        if action == "launch":
            try:
                launch_profile(
                    profile["name"], profile.get("agent_type", "cc"),
                    MODE_RESUME, "",
                )
                self.toast.show(
                    f"Launched {profile['name']} (resume last)",
                    kind="success",
                )
            except RuntimeError as exc:
                messagebox.showerror("Launch failed", str(exc))
                self.toast.show(f"Launch failed: {exc}", kind="error")
        elif action == "open_detail":
            self._return_to = "profiles"
            self._show_page(f"detail:{profile['name']}")

    def _on_new_profile(self) -> None:
        """Open the creation wizard."""
        self._return_to = "profiles"
        # Evict any stale wizard instance
        if "wizard" in self._pages:
            try:
                self._pages["wizard"].destroy()
            except Exception:
                pass
            del self._pages["wizard"]
        self._show_page("wizard")

    def _on_wizard_finish(self, payload: Dict[str, Any]) -> None:
        # In a real implementation we'd shell out to
        # ``agent-box create ...`` here. For now the payload has been
        # collected and a toast has been shown.
        if "wizard" in self._pages:
            try:
                self._pages["wizard"].destroy()
            except Exception:
                pass
            del self._pages["wizard"]
        # Refresh profile list so the new profile appears (when CLI
        # integration is wired up); for now just navigate back.
        self.refresh()
        self._on_nav("profiles")

    def _on_wizard_cancel(self) -> None:
        if "wizard" in self._pages:
            try:
                self._pages["wizard"].destroy()
            except Exception:
                pass
            del self._pages["wizard"]
        self._on_nav(self._return_to or "profiles")

    # --- refresh (Phase 3.2 — async) ------------------------------------

    def refresh(self) -> None:
        """Kick off an async profile fetch.

        Falls back to a blocking refresh if a refresh is already in
        flight (prevents overlapping ``wsl.exe`` calls).
        """
        if self._refreshing:
            return
        self._refreshing = True
        self._set_status("Refreshing…")

        def _worker() -> None:
            try:
                profiles = fetch_profiles()
                self.root.after(0, lambda: self._on_profiles_loaded(profiles))
            except RuntimeError as exc:
                self.root.after(0, lambda e=exc: self._on_profiles_error(e))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_profiles_loaded(self, profiles: List[dict]) -> None:
        self._refreshing = False
        self._profiles = profiles
        self._set_status(f"Loaded {len(profiles)} profile(s).")
        self.sidebar.update_status()
        # Re-render pages that depend on profile data
        for key in ("home", "profiles"):
            if key in self._pages:
                self._invalidate_pages([key])
        if self._current_page in ("home", "profiles"):
            self._show_page(self._current_page)

    def _on_profiles_error(self, exc: RuntimeError) -> None:
        self._refreshing = False
        self._profiles = []
        self._set_status(f"Error: {exc}")
        self.sidebar.update_status()
        for key in ("home", "profiles"):
            if key in self._pages:
                self._invalidate_pages([key])
        if self._current_page in ("home", "profiles"):
            self._show_page(self._current_page)

    def _set_status(self, text: str) -> None:
        self._status_text = text
        self.status_bar.configure(text=text)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    Theme.set_mode("system")
    ctk.set_default_color_theme("blue")  # accent palette (overridden by Theme)
    root = ctk.CTk()
    try:
        AgentBoxApp(root)
    except Exception:
        import traceback
        traceback.print_exc()
        raise
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())