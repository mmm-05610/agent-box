"""AgentBoxApp — main orchestrator + entry point.

Owns the root ``ctk.CTk``, the sidebar, the content area, the bottom
status bar, and the toast manager. Routes navigation between page
instances and triggers data refresh.

Run directly: ``python -m gui.app``
"""
from __future__ import annotations

import sys
from tkinter import messagebox
from typing import Dict, List

import customtkinter as ctk

from .components import NAV_ITEMS, Sidebar, ToastManager
from .pages import HelpPage, HomePage, ProfilesPage, SessionsPage, SettingsPage
from .state import fetch_sessions
from .theme import C, Theme
from .tokens import FONT_MICRO, SPACE_LG
from .wsl import MODE_RESUME, fetch_profiles, launch_profile


class AgentBoxApp:
    """Top-level controller for the agent-box desktop GUI."""

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

        # Initial load + render
        self.refresh()
        self._show_page("home")

    # --- state ----------------------------------------------------------

    def _active_count(self) -> int:
        return len(fetch_sessions(active_only=True))

    def _on_nav(self, key: str) -> None:
        if key not in {k for k, _, _ in NAV_ITEMS}:
            return
        self._show_page(key)

    def _show_page(self, key: str) -> None:
        for w in self.content.winfo_children():
            w.destroy()
        self._current_page = key
        self.sidebar.set_active(key)

        if key == "home":
            page = HomePage(self.content, self._on_nav,
                            self._profiles, fetch_sessions)
        elif key == "profiles":
            page = ProfilesPage(
                self.content, self._profiles,
                on_profile_action=self._on_profile_action,
                on_new=self._on_new_profile,
                toast=self.toast,
            )
        elif key == "sessions":
            page = SessionsPage(self.content, fetch_sessions)
        elif key == "settings":
            page = SettingsPage(self.content,
                                on_theme_change=self._apply_theme)
        elif key == "help":
            page = HelpPage(self.content)
        else:
            return
        page.grid(row=0, column=0, sticky="nsew")

    def _apply_theme(self) -> None:
        """Rebuild current page so all colors pick up new theme."""
        self._show_page(self._current_page)
        self.sidebar.update_status()

    def _on_profile_action(self, profile: dict, action: str) -> None:
        # Stage A: actions are minimal. Stage B will handle edit/detail/etc.
        if action == "launch":
            try:
                launch_profile(
                    profile["name"], profile.get("agent_type", "cc"),
                    MODE_RESUME, "",
                )
                self.toast.show(
                    f"Launched {profile['name']} (resume last)", kind="success",
                )
            except RuntimeError as exc:
                messagebox.showerror("Launch failed", str(exc))
                self.toast.show(f"Launch failed: {exc}", kind="error")

    def _on_new_profile(self) -> None:
        # Stage A placeholder — Stage B will implement the wizard.
        self.toast.show(
            "Create-profile wizard — coming in Stage B", kind="info",
        )

    # --- refresh --------------------------------------------------------

    def refresh(self) -> None:
        self._status_text = "Refreshing…"
        self.status_bar.configure(text=self._status_text)
        self.root.update_idletasks()
        try:
            self._profiles = fetch_profiles()
            self._status_text = f"Loaded {len(self._profiles)} profile(s)."
        except RuntimeError as exc:
            self._profiles = []
            self._status_text = f"Error: {exc}"
        self.status_bar.configure(text=self._status_text)
        self.sidebar.update_status()
        # Re-render current page if it depends on profile data
        if self._current_page in ("home", "profiles"):
            self._show_page(self._current_page)


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