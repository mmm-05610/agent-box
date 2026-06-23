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
from .wsl import fetch_sessions, health_check, install_dependency, sessions_cleanup
from .theme import C, Theme
from .tokens import FONT_MICRO, SPACE_LG
from .wsl import (
    MODE_RESUME,
    create_profile,
    fetch_profiles,
    launch_profile,
    resolve_profile_root,
)


# Maximum number of page instances kept in the cache. Older pages are
# discarded when the cap is exceeded (LRU).
_PAGE_CACHE_CAP = 5

# Profile root is resolved lazily from WSL at runtime (see gui.wsl.resolve_profile_root).

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
        try:
            cleaned = sessions_cleanup()
        except RuntimeError:
            cleaned = 0
        if cleaned > 0:
            self._status_text = f"Cleaned {cleaned} stale session(s)."

        # Initial load + render — profiles load immediately
        self.refresh()
        self._show_page("home")

        # Health check runs after UI is visible (non-blocking)
        self.root.after(500, self._run_health_check)

    def _run_health_check(self) -> None:
        """Run health check and show dialog if deps are missing."""
        try:
            problems = health_check()
        except RuntimeError:
            problems = [("WSL 连接失败", "")]
        if not problems:
            return
        self._show_missing_deps(problems)

    def _show_missing_deps(self, problems) -> None:
        """Show a dialog for each missing dependency with an install option."""
        from tkinter import messagebox

        for desc, cmd in problems:
            if not cmd:
                messagebox.showwarning("环境检查", f"检测到 {desc}。\n请确认 WSL 已安装并运行后重启本程序。")
                continue
            ok = messagebox.askokcancel(
                "环境检查",
                f"检测到 {desc}，将无法启动 agent 实例。\n\n"
                f"是否现在安装？",
            )
            if ok:
                install_dependency(cmd)
                messagebox.showinfo(
                    "正在安装",
                    f"安装终端已打开。\n请在终端中完成操作后重新启动本程序。",
                )

    # --- state ----------------------------------------------------------

    def _active_count(self) -> int:
        try:
            return len(fetch_sessions(active_only=True))
        except RuntimeError:
            return 0

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
            profile_root = resolve_profile_root() + "/" + name
            config_root = profile_root + "/" + config_dir
            def _on_detail_delete(_name: str = name) -> None:
                self._invalidate_pages([f"detail:{_name}"])
                self.refresh()
                self._on_nav(self._return_to or "profiles")

            def _on_detail_launch() -> None:
                try:
                    launch_profile(
                        name, profile.get("agent_type", "cc"),
                        MODE_RESUME, "",
                    )
                    self.toast.show(
                        f"Launched {name} (resume last)", kind="success",
                    )
                except RuntimeError as exc:
                    self.toast.show(f"Launch failed: {exc}", kind="error")

            return ProfileDetailPage(
                self.content,
                profile=profile,
                profile_root=profile_root,
                config_root=config_root,
                on_back=lambda: self._on_nav(
                    self._return_to or "profiles"
                ),
                on_provider_change=lambda _p: None,
                on_delete=_on_detail_delete,
                on_launch=_on_detail_launch,
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
                self.sidebar.update_status()
                self._invalidate_pages(["sessions"])
            except RuntimeError as exc:
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
        # Clean up wizard page
        if "wizard" in self._pages:
            try:
                self._pages["wizard"].destroy()
            except Exception:
                pass
            del self._pages["wizard"]

        name = payload.get("name", "")
        agent_type = payload.get("agent_type", "cc")
        if not name:
            self.toast.show("Missing profile name.", kind="error")
            self._on_nav("profiles")
            return

        # v0.4: pull optional meta scalars and the CLAUDE.md body out
        # of the wizard payload. Scalars go through CLI flags; the
        # body is sent AFTER create via save_file (multi-line content
        # does not survive shell quoting reliably).
        display_name = (payload.get("display_name") or "").strip() or None
        description = (payload.get("description") or "").strip() or None
        provider = (payload.get("provider") or "").strip() or None
        # WS5: wizard now ships a preset NAME, not a CLAUDE.md body. The
        # preset's CLAUDE.md is applied by profile.create on the WSL side.
        # Keep the legacy "claude_md body via save_file" path as back-compat
        # for any caller that still emits a body without a preset.
        preset = (payload.get("preset") or "").strip() or None
        claude_md = payload.get("claude_md") or ""
        write_claude_md = (not preset) and bool(claude_md) and agent_type == "cc"
        claude_md_wsl_path = (
            f"{resolve_profile_root()}/{name}/dot-claude/CLAUDE.md"
            if write_claude_md else ""
        )

        self.toast.show(f"Creating '{name}'…", kind="info")

        import threading

        def _worker() -> None:
            try:
                create_profile(
                    name, agent_type,
                    display_name=display_name,
                    description=description,
                    provider=provider,
                    preset=preset,
                )
                if write_claude_md:
                    from .wsl import save_file
                    save_file(claude_md_wsl_path, claude_md)
                self.root.after(0, _on_ok)
            except RuntimeError as exc:
                self.root.after(0, lambda e=exc: _on_err(e))

        def _on_ok() -> None:
            self.toast.show(
                f"Profile '{name}' created ({agent_type.upper()}).",
                kind="success",
            )
            self._return_to = "profiles"
            self.refresh()
            # Invalidate and navigate to the new profile's detail page
            self._invalidate_pages([f"detail:{name}"])
            self._show_page(f"detail:{name}")

        def _on_err(exc: Exception) -> None:
            self.toast.show(f"Create failed: {exc}", kind="error")
            self._on_nav("profiles")

        threading.Thread(target=_worker, daemon=True).start()

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

    # Set window icon — look next to this file (source checkout) or in
    # PyInstaller's bundled directory.
    import os as _os
    _candidates = [
        _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "logo.ico"),
        _os.path.join(sys._MEIPASS, "logo.ico") if getattr(sys, "frozen", False) else "",
    ]
    for _p in _candidates:
        if _p and _os.path.isfile(_p):
            try:
                root.iconbitmap(_p)
                break
            except Exception:
                pass

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