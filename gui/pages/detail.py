"""Profile detail page — dynamic tabs based on agent type.

Tabs are editable where applicable (settings, config, claude_md,
persona, env).  The Meta tab has action buttons (Delete, Open in
Terminal).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import customtkinter as ctk

from ..components.button import danger_button, ghost_button, primary_button
from ..components.card import Card
from ..components.toast import ToastManager
from ..data import get_profile_data
from ..theme import C
from ..tokens import (
    FONT_BODY,
    FONT_BOLD,
    FONT_CAPTION,
    FONT_DISPLAY,
    FONT_LABEL,
    FONT_MICRO,
    FONT_MONO_SMALL,
    FONT_SUBTITLE,
    RADIUS_MD,
    SPACE_2XL,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
    SPACE_XL,
    SPACE_XS,
)


# ---------------------------------------------------------------------------
# Tab definitions per agent type
# ---------------------------------------------------------------------------

AGENT_TABS: Dict[str, List[tuple]] = {
    "claude": [
        ("meta",      "Meta",      "Profile info"),
        ("settings",  "Settings",  "settings.json"),
        ("claude_md", "CLAUDE.md", "System prompt"),
        ("hooks",     "Hooks",     "Pre/Post tool hooks"),
        ("plugins",   "Plugins",   "Installed plugins"),
        ("storage",   "Storage",   "Files & size"),
    ],
    "codex": [
        ("meta",    "Meta",    "Profile info"),
        ("config",  "Config",  "config.toml"),
        ("auth",    "Auth",    "API keys"),
        ("rules",   "Rules",   "Custom rules"),
        ("skills",  "Skills",  "Installed skills"),
        ("storage", "Storage", "Files & size"),
    ],
    "hermes": [
        ("meta",    "Meta",    "Profile info"),
        ("config",  "Config",  "config.yaml"),
        ("env",     "Env",     "Environment vars"),
        ("persona", "Persona", "SOUL.md"),
        ("skills",  "Skills",  "Installed skills"),
        ("storage", "Storage", "Files & size"),
    ],
    "opencode": [
        ("meta",    "Meta",    "Profile info"),
        ("config",  "Config",  "opencode.jsonc"),
        ("auth",    "Auth",    "API keys"),
        ("storage", "Storage", "Files & size"),
    ],
}

# Agent-type -> (config dir name, config file name) for raw reads
_CONFIG_FILE_MAP: Dict[str, tuple] = {
    "claude":   ("dot-claude",   "settings.json"),
    "codex":    ("dot-codex",    "config.toml"),
    "hermes":   ("dot-hermes",   "config.yaml"),
    "opencode": ("dot-opencode", "opencode.jsonc"),
}


# ---------------------------------------------------------------------------
# Main page
# ---------------------------------------------------------------------------

class ProfileDetailPage(ctk.CTkFrame):
    """Dynamic tab-based profile detail view.

    Data is fetched ONCE in __init__ and stored in self._data.
    All tab builders use self._data, never fetch data themselves.
    """

    def __init__(
        self,
        master,
        profile: Dict[str, str],
        profile_root: Path,
        config_root: Path,
        on_back: Callable[[], None],
        on_provider_change: Callable[[str], None],
        on_delete: Callable[[str], None],
        on_launch: Callable[[], None],
        toast: ToastManager,
    ):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._profile = profile
        self._profile_root = profile_root
        self._config_root = config_root
        self._on_back = on_back
        self._on_delete = on_delete
        self._on_launch = on_launch
        self._toast = toast
        self._active_tab: str = "meta"
        self._tab_frames: Dict[str, ctk.CTkBaseClass] = {}
        self._dirty_tabs: set = set()  # tabs with unsaved changes

        # Fetch ALL data once, store as dict
        agent_type = profile.get("agent_type", "claude")
        self._data = get_profile_data(profile_root, agent_type)
        self._tabs = AGENT_TABS.get(agent_type, AGENT_TABS["claude"])

        # Debug: print what we got
        import sys
        print(f"[DEBUG] profile_root={profile_root}", file=sys.stderr)
        print(f"[DEBUG] agent_type={agent_type}", file=sys.stderr)
        print(f"[DEBUG] provider={self._data.get('provider')}", file=sys.stderr)
        print(f"[DEBUG] model={self._data.get('model')}", file=sys.stderr)

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        self._build_header()
        self._build_tabs()
        self._build_body()
        self._show_tab("meta")

    # --- header --------------------------------------------------------

    def _build_header(self) -> None:
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew",
                    padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_MD))
        header.grid_columnconfigure(1, weight=1)

        back = ghost_button(header, "←  Back",
                            command=self._on_back_clicked, height=32)
        back.grid(row=0, column=0, sticky="w")

        self._name_label = ctk.CTkLabel(
            header, text=self._data.get("name", "—"),
            text_color=C("fg"), font=FONT_DISPLAY, anchor="w",
        )
        self._name_label.grid(row=0, column=1, sticky="w", padx=SPACE_LG)

        agent_type = self._data.get("agent_type", "").upper()
        badge = ctk.CTkLabel(
            header, text=agent_type,
            text_color=C("fg_muted"), font=FONT_CAPTION,
            fg_color=C("bg_elevated_2"), corner_radius=RADIUS_MD,
            padx=SPACE_SM, pady=2,
        )
        badge.grid(row=0, column=2, sticky="w", padx=SPACE_SM)

        # Refresh button — reload all data from WSL
        refresh_btn = ghost_button(
            header, "↻  Refresh", command=self._refresh_data, height=32,
        )
        refresh_btn.grid(row=0, column=3, sticky="e")

    # --- tabs ----------------------------------------------------------

    def _build_tabs(self) -> None:
        # Use pack layout for tabs to handle overflow gracefully
        tabs_frame = ctk.CTkFrame(self, fg_color="transparent")
        tabs_frame.grid(row=1, column=0, sticky="ew",
                        padx=SPACE_2XL, pady=(0, SPACE_MD))

        # Scrollable tab row
        tabs_row = ctk.CTkFrame(tabs_frame, fg_color="transparent")
        tabs_row.pack(fill="x")

        self._tab_buttons: Dict[str, ctk.CTkButton] = {}
        self._tab_indicators: Dict[str, ctk.CTkFrame] = {}
        for i, (key, label, _desc) in enumerate(self._tabs):
            holder = ctk.CTkFrame(tabs_row, fg_color="transparent")
            holder.pack(side="left", padx=(0, SPACE_MD))

            btn = ctk.CTkButton(
                holder, text=label, height=32,
                corner_radius=0,
                fg_color="transparent", text_color=C("fg_muted"),
                hover_color=C("bg_hover"), font=FONT_BOLD,
                command=lambda k=key: self._show_tab(k),
            )
            btn.pack(fill="x")

            indicator = ctk.CTkFrame(
                holder, fg_color="transparent",
                height=2, corner_radius=1,
            )
            indicator.pack(fill="x", pady=(2, 0))

            self._tab_buttons[key] = btn
            self._tab_indicators[key] = indicator

    def _build_body(self) -> None:
        self._body = ctk.CTkFrame(self, fg_color=C("bg"), corner_radius=0)
        self._body.grid(row=2, column=0, sticky="nsew",
                        padx=SPACE_2XL, pady=(0, SPACE_LG))
        self._body.grid_columnconfigure(0, weight=1)
        self._body.grid_rowconfigure(0, weight=1)

    def _show_tab(self, key: str) -> None:
        # --- dirty guard: warn before leaving an unsaved tab ---
        if self._active_tab != key and self._active_tab in self._dirty_tabs:
            if not self._confirm_discard(self._active_tab):
                return  # user chose to stay
            self._dirty_tabs.discard(self._active_tab)

        for k, btn in self._tab_buttons.items():
            ind = self._tab_indicators[k]
            if k == key:
                btn.configure(text_color=C("fg"))
                ind.configure(fg_color=C("fg"))
            else:
                btn.configure(text_color=C("fg_muted"))
                ind.configure(fg_color="transparent")

        for k, frame in self._tab_frames.items():
            if k != key:
                frame.grid_forget()

        if key not in self._tab_frames:
            self._tab_frames[key] = self._build_tab(key)
        self._tab_frames[key].grid(row=0, column=0, sticky="nsew")
        self._active_tab = key

    def _build_tab(self, key: str) -> ctk.CTkBaseClass:
        builders = {
            "meta":      self._build_meta_tab,
            "settings":  self._build_settings_tab,
            "config":    self._build_config_tab,
            "claude_md": self._build_claude_md_tab,
            "persona":   self._build_persona_tab,
            "hooks":     self._build_hooks_tab,
            "plugins":   self._build_plugins_tab,
            "auth":      self._build_auth_tab,
            "env":       self._build_env_tab,
            "rules":     self._build_rules_tab,
            "skills":    self._build_skills_tab,
            "storage":   self._build_storage_tab,
        }
        builder = builders.get(key)
        if builder is None:
            return self._build_placeholder_tab(key)
        return builder()

    # --- dirty tracking + refresh -------------------------------------

    def _mark_tab_dirty(self, tab_key: str) -> None:
        """Mark a tab as having unsaved changes."""
        self._dirty_tabs.add(tab_key)

    def _mark_tab_clean(self, tab_key: str) -> None:
        """Mark a tab as saved (no unsaved changes)."""
        self._dirty_tabs.discard(tab_key)

    def _has_unsaved_changes(self) -> bool:
        """Return True if any tab has unsaved edits."""
        return bool(self._dirty_tabs)

    def _confirm_discard(self, tab_key: str) -> bool:
        """Ask the user to confirm discarding unsaved changes.

        Returns True if the user agrees to discard (or there's nothing
        to discard), False if the user wants to stay.
        """
        from tkinter import messagebox
        if tab_key not in self._dirty_tabs:
            return True
        return messagebox.askyesno(
            "Unsaved Changes",
            f"The '{tab_key}' tab has unsaved changes.\n\n"
            "Discard and continue?",
        )

    def _on_back_clicked(self) -> None:
        """Back button handler — warns about unsaved changes."""
        if self._has_unsaved_changes():
            from tkinter import messagebox
            if not messagebox.askyesno(
                "Unsaved Changes",
                "You have unsaved changes in one or more tabs.\n\n"
                "Leave without saving?",
            ):
                return
            self._dirty_tabs.clear()
        self._on_back()

    def _refresh_data(self) -> None:
        """Re-fetch all profile data from WSL and rebuild tabs.

        Called after a successful save and by the Refresh button.
        """
        from ..data import get_profile_data

        agent_type = self._profile.get("agent_type", "claude")
        self._data = get_profile_data(self._profile_root, agent_type)

        # Update header name (in case it changed)
        if hasattr(self, "_name_label"):
            self._name_label.configure(text=self._data.get("name", "—"))

        # Destroy all cached tab frames — they'll rebuild from fresh data
        for frame in self._tab_frames.values():
            try:
                frame.destroy()
            except Exception:
                pass
        self._tab_frames.clear()
        self._dirty_tabs.clear()

        # Rebuild the active tab
        self._show_tab(self._active_tab)

    # --- editable tab helper -------------------------------------------

    def _build_editable_tab(
        self, content: str, wsl_path: str, *, tab_key: str = "",
    ) -> ctk.CTkFrame:
        """Build a cc-switch style editor with View/Edit modes.

        P0: View/Edit mode toggle (default = view/read-only).
        P0: Staleness detection (re-reads file before save).
        P1: FileInfoBar (line count, file size).
        P1: originalContent baseline (precise dirty tracking).

        *content* is the initial text.  *wsl_path* is the absolute WSL
        path written to on save.  *tab_key* is used for dirty tracking.
        """
        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)
        frame.grid_rowconfigure(1, weight=1)

        # --- state ------------------------------------------------------
        original_content = content  # baseline for staleness + dirty
        mode = {"v": "view"}        # "view" | "edit"
        fname = wsl_path.rsplit("/", 1)[-1] if "/" in wsl_path else wsl_path
        line_count = content.count("\n") + 1
        size_bytes = len(content.encode("utf-8"))
        size_str = (
            f"{size_bytes / 1024:.1f} KB" if size_bytes >= 1024
            else f"{size_bytes} B"
        )

        # --- file header bar -------------------------------------------
        header = ctk.CTkFrame(
            frame, fg_color=C("bg_elevated"),
            corner_radius=RADIUS_MD, border_width=1, border_color=C("border"),
        )
        header.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_SM))

        # File name
        ctk.CTkLabel(
            header, text=f"  {fname}", text_color=C("fg"),
            font=FONT_BOLD, anchor="w",
        ).pack(side="left", padx=(SPACE_SM, 0))

        # Full path
        ctk.CTkLabel(
            header, text=wsl_path, text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="w",
        ).pack(side="left", padx=(SPACE_MD, 0))

        # Line count + size (P1: FileInfoBar)
        info_text = f"{line_count} lines  ·  {size_str}"
        ctk.CTkLabel(
            header, text=info_text, text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="w",
        ).pack(side="left", padx=(SPACE_MD, 0))

        # Edit / Done button (right side)
        edit_btn = ctk.CTkButton(
            header, text="Edit", width=60, height=28,
            corner_radius=RADIUS_MD,
            fg_color="transparent", hover_color=C("bg_hover"),
            text_color=C("fg_muted"), font=FONT_BODY,
        )
        edit_btn.pack(side="right", padx=(0, SPACE_SM))

        # --- textbox (cc-switch style: bg_input, focus border) ----------
        textbox = ctk.CTkTextbox(
            frame, font=FONT_MONO_SMALL,
            fg_color=C("bg_input"), text_color=C("fg"),
            corner_radius=RADIUS_MD, border_width=1, border_color=C("border"),
            wrap="word",
        )
        textbox.grid(row=1, column=0, sticky="nsew")
        textbox.insert("1.0", content)
        textbox.configure(state="disabled")  # default: view mode

        # Focus border effect (only meaningful in edit mode)
        def _on_focus_in(_e=None) -> None:
            if mode["v"] == "edit":
                textbox.configure(border_color=C("border_focus"))

        def _on_focus_out(_e=None) -> None:
            textbox.configure(border_color=C("border"))
        textbox.bind("<FocusIn>", _on_focus_in)
        textbox.bind("<FocusOut>", _on_focus_out)

        # --- toolbar (hidden in view mode) ------------------------------
        bar = ctk.CTkFrame(frame, fg_color="transparent")
        bar.grid(row=2, column=0, sticky="ew", pady=(SPACE_SM, 0))
        bar.grid_columnconfigure(1, weight=1)
        bar.grid_remove()  # hidden until edit mode

        # Status dot
        status_dot = ctk.CTkLabel(
            bar, text="●", text_color=C("warning"),
            font=FONT_MICRO, width=12,
        )

        # Status text
        status_lbl = ctk.CTkLabel(
            bar, text="modified", text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        )

        # Keyboard hint
        hint_lbl = ctk.CTkLabel(
            bar, text="Ctrl+S save  ·  Esc cancel", text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="e",
        )
        hint_lbl.grid(row=0, column=1, sticky="e", padx=(0, SPACE_MD))

        # Save button
        save_btn = primary_button(bar, "Save", width=80, height=36)
        save_btn.grid(row=0, column=2, sticky="e")
        save_btn.configure(state="disabled")

        # --- dirty tracking (P1: originalContent baseline) --------------
        def _check_dirty() -> None:
            """Compare current content against original baseline."""
            current = textbox.get("1.0", "end-1c")
            is_dirty = current != original_content
            if is_dirty:
                status_dot.grid(row=0, column=0, padx=(0, SPACE_XS))
                status_lbl.grid(row=0, column=1, sticky="w")
                hint_lbl.grid_remove()
                save_btn.configure(state="normal")
                if tab_key:
                    self._mark_tab_dirty(tab_key)
            else:
                status_dot.grid_forget()
                status_lbl.grid_forget()
                hint_lbl.grid(row=0, column=1, sticky="e", padx=(0, SPACE_MD))
                save_btn.configure(state="disabled")
                if tab_key:
                    self._mark_tab_clean(tab_key)

        def _on_text_change(_event=None) -> None:
            if mode["v"] == "edit":
                _check_dirty()

        textbox.bind("<KeyRelease>", _on_text_change)
        textbox.bind("<<Modified>>", lambda _e: (
            _on_text_change() if mode["v"] == "edit" else None,
            textbox.edit_modified(False),
        ))

        # --- View / Edit mode toggle (P0) -------------------------------
        def _enter_edit() -> None:
            """Switch from view → edit mode."""
            mode["v"] = "edit"
            textbox.configure(state="normal")
            edit_btn.configure(text="Done", text_color=C("fg"))
            bar.grid()
            _check_dirty()

        def _exit_edit(*, save_first: bool = False) -> None:
            """Switch from edit → view mode.

            If *save_first* is True, triggers save (which will rebuild).
            Otherwise discards changes and reverts to original.
            """
            if save_first:
                _save()
                return
            # Discard changes — revert to original
            mode["v"] = "view"
            textbox.configure(state="normal")
            textbox.delete("1.0", "end")
            textbox.insert("1.0", original_content)
            textbox.configure(state="disabled")
            edit_btn.configure(text="Edit", text_color=C("fg_muted"))
            bar.grid_remove()
            if tab_key:
                self._mark_tab_clean(tab_key)

        def _toggle_mode() -> None:
            if mode["v"] == "view":
                _enter_edit()
            else:
                # In edit mode, "Done" button: if dirty → save, else → view
                current = textbox.get("1.0", "end-1c")
                if current != original_content:
                    _exit_edit(save_first=True)
                else:
                    _exit_edit(save_first=False)

        edit_btn.configure(command=_toggle_mode)

        # Esc to cancel editing
        def _on_esc(_event=None) -> str:
            if mode["v"] == "edit":
                current = textbox.get("1.0", "end-1c")
                if current != original_content:
                    from tkinter import messagebox
                    if not messagebox.askyesno(
                        "Discard Changes",
                        "You have unsaved edits. Discard them?",
                    ):
                        return "break"
                _exit_edit(save_first=False)
            return "break"
        textbox.bind("<Escape>", _on_esc)

        # Ctrl+S shortcut
        def _on_ctrl_s(_event=None) -> str:
            if mode["v"] == "edit":
                current = textbox.get("1.0", "end-1c")
                if current != original_content:
                    _save()
            return "break"
        textbox.bind("<Control-s>", _on_ctrl_s)

        # --- save logic with staleness detection (P0) -------------------
        def _save() -> None:
            new_content = textbox.get("1.0", "end-1c")
            save_btn.configure(state="disabled", text="Saving…")
            self.update_idletasks()

            import threading

            def _worker() -> None:
                from ..wsl import save_file, read_file
                try:
                    # P0: Staleness check — re-read file before writing
                    current_on_disk = read_file(wsl_path)
                    if (current_on_disk is not None
                            and current_on_disk != original_content):
                        # File was modified externally
                        self.after(0, lambda: _on_stale(current_on_disk))
                        return
                    save_file(wsl_path, new_content)
                    self.after(0, _on_ok)
                except Exception as exc:
                    self.after(0, lambda e=exc: _on_err(e))

            def _on_stale(disk_content: str) -> None:
                from tkinter import messagebox
                save_btn.configure(text="Save", state="normal")
                overwrite = messagebox.askyesno(
                    "File Modified Externally",
                    f"'{fname}' was modified outside the editor.\n\n"
                    "Overwrite with your changes?",
                )
                if overwrite:
                    # Force save without staleness check
                    _force_save(new_content)
                # else: user chose to keep disk version, do nothing

            def _on_ok() -> None:
                if tab_key:
                    self._mark_tab_clean(tab_key)
                self._toast.show("Saved.", kind="success")
                # Re-fetch data and rebuild (enters view mode via _refresh_data)
                self._refresh_data()

            def _on_err(exc: Exception) -> None:
                save_btn.configure(text="Save", state="normal")
                self._toast.show(f"Save failed: {exc}", kind="error")

            threading.Thread(target=_worker, daemon=True).start()

        def _force_save(new_content: str) -> None:
            """Save without staleness check (user confirmed overwrite)."""
            save_btn.configure(state="disabled", text="Saving…")
            self.update_idletasks()

            import threading

            def _worker() -> None:
                from ..wsl import save_file
                try:
                    save_file(wsl_path, new_content)
                    self.after(0, _on_ok)
                except Exception as exc:
                    self.after(0, lambda e=exc: _on_err(e))

            def _on_ok() -> None:
                if tab_key:
                    self._mark_tab_clean(tab_key)
                self._toast.show("Saved.", kind="success")
                self._refresh_data()

            def _on_err(exc: Exception) -> None:
                save_btn.configure(text="Save", state="normal")
                self._toast.show(f"Save failed: {exc}", kind="error")

            threading.Thread(target=_worker, daemon=True).start()

        save_btn.configure(command=_save)
        return frame

    # --- Meta tab ------------------------------------------------------

    def _build_meta_tab(self) -> ctk.CTkFrame:
        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)

        # --- info card -------------------------------------------------
        card = Card(frame)
        card.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_LG))
        card.grid_columnconfigure(1, weight=1)

        # v0.4: surface display_name / description / preset from meta
        # alongside the inline-detected fields.
        rows = [
            ("Name",         self._data.get("name", "—")),
            ("Display Name", self._data.get("display_name") or "—"),
            ("Description",  self._data.get("description") or "—"),
            ("Agent Type",   (self._data.get("agent_type", "—") or "—").upper()),
            ("Provider",     self._data.get("provider", "—")),
            ("Preset",       self._data.get("preset") or "—"),
            ("Model",        self._data.get("model", "—")),
            ("Config Dir",   self._data.get("config_dir", "—")),
        ]
        for r, (label, value) in enumerate(rows):
            ctk.CTkLabel(
                card, text=label, text_color=C("fg_muted"),
                font=FONT_CAPTION, anchor="w",
            ).grid(row=r, column=0, sticky="w", padx=SPACE_LG, pady=SPACE_SM)
            ctk.CTkLabel(
                card, text=str(value), text_color=C("fg"),
                font=FONT_BODY, anchor="w",
            ).grid(row=r, column=1, sticky="w", padx=SPACE_SM, pady=SPACE_SM)

        # --- action buttons --------------------------------------------
        actions = ctk.CTkFrame(frame, fg_color="transparent")
        actions.grid(row=1, column=0, sticky="ew")

        delete_btn = danger_button(
            actions, "Delete Profile", width=140, height=36,
            command=self._confirm_delete,
        )
        delete_btn.pack(side="left")

        launch_btn = primary_button(
            actions, "Open in Terminal", width=160, height=36,
            command=self._on_launch,
        )
        launch_btn.pack(side="left", padx=(SPACE_MD, 0))

        return frame

    def _confirm_delete(self) -> None:
        """Show a confirmation dialog, then delete the profile."""
        from tkinter import messagebox

        name = self._data.get("name", "?")
        if not messagebox.askyesno(
            "Delete Profile",
            f"Are you sure you want to delete '{name}'?\n\n"
            "This cannot be undone.",
        ):
            return

        self._toast.show(f"Deleting {name}…", kind="info")

        import threading

        def _worker() -> None:
            from ..wsl import delete_profile
            try:
                delete_profile(name)
                self.after(0, _on_ok)
            except Exception as exc:
                self.after(0, lambda e=exc: _on_err(e))

        def _on_ok() -> None:
            self._toast.show(f"Deleted {name}.", kind="success")
            self._on_delete(name)

        def _on_err(exc: Exception) -> None:
            self._toast.show(f"Delete failed: {exc}", kind="error")

        threading.Thread(target=_worker, daemon=True).start()

    # --- Settings tab (CC: settings.json) ------------------------------

    def _build_settings_tab(self) -> ctk.CTkFrame:
        # Raw text is preloaded off the UI thread by get_profile_data into
        # self._data["config_raw"].  No sync wsl read here.
        content = self._data.get("config_raw") or ""
        if not content:
            return self._build_placeholder_tab("Settings")

        wsl_path = f"{self._profile_root}/dot-claude/settings.json"
        return self._build_editable_tab(content, wsl_path, tab_key="settings")

    # --- Config tab (Codex/Hermes/OpenCode) ----------------------------

    def _build_config_tab(self) -> ctk.CTkFrame:
        # Raw text is preloaded off the UI thread by get_profile_data into
        # self._data["config_raw"].  No sync wsl read here.
        content = self._data.get("config_raw") or ""
        if not content:
            return self._build_placeholder_tab("Config")

        agent_type = self._data.get("agent_type", "codex")
        mapping = _CONFIG_FILE_MAP.get(agent_type)
        dir_name = mapping[0] if mapping else "dot-codex"
        file_name = mapping[1] if mapping else "config.toml"
        wsl_path = f"{self._profile_root}/{dir_name}/{file_name}"
        return self._build_editable_tab(content, wsl_path, tab_key="config")

    # --- CLAUDE.md tab (CC only) ---------------------------------------
    # Reference implementation for the raw-edit pattern: the raw text
    # is preloaded off the UI thread by get_profile_data into
    # self._data["claude_md"], and this tab just hands it to
    # _build_editable_tab.  Settings/Config/Hooks now follow the same
    # pattern (see _data["config_raw"] / _data["hooks_raw"]).

    def _build_claude_md_tab(self) -> ctk.CTkFrame:
        content = self._data.get("claude_md")
        if not content:
            return self._build_placeholder_tab("CLAUDE.md")

        wsl_path = f"{self._profile_root}/dot-claude/CLAUDE.md"
        return self._build_editable_tab(content, wsl_path, tab_key="claude_md")

    # --- Persona tab (Hermes: SOUL.md) ---------------------------------
    # Same raw-edit pattern as CLAUDE.md (see comment above).

    def _build_persona_tab(self) -> ctk.CTkFrame:
        content = self._data.get("persona")
        if not content:
            return self._build_placeholder_tab("SOUL.md")

        wsl_path = f"{self._profile_root}/dot-hermes/SOUL.md"
        return self._build_editable_tab(content, wsl_path, tab_key="persona")

    # --- Hooks tab (CC) ------------------------------------------------
    #
    # Two cases, based on what get_profile_data preloaded:
    #   hooks_raw is not None  -> separate dot-claude/hooks/hooks.json
    #                              file exists; use the raw editor.
    #   hooks_raw is None      -> hooks live inline in settings.json
    #                              (current state for all CC profiles);
    #                              keep read-only display + add a one-
    #                              line note pointing to the Settings
    #                              tab.
    def _build_hooks_tab(self) -> ctk.CTkFrame:
        hooks_raw = self._data.get("hooks_raw")
        if hooks_raw is not None:
            hooks_wsl_path = f"{self._profile_root}/dot-claude/hooks/hooks.json"
            return self._build_editable_tab(
                hooks_raw, hooks_wsl_path, tab_key="hooks",
            )

        # Inline case: read-only summary + note.
        hooks = self._data.get("hooks", {})
        if not hooks:
            # No hooks at all -> still show the inline note so the user
            # knows where to add them.
            frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
            frame.grid_columnconfigure(0, weight=1)
            ctk.CTkLabel(
                frame,
                text="Hooks are defined inline in settings.json — "
                     "edit them on the Settings tab.",
                text_color=C("fg_muted"), font=FONT_CAPTION,
            ).grid(row=0, column=0, sticky="w", padx=SPACE_MD, pady=SPACE_MD)
            return frame

        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            frame,
            text="Hooks are defined inline in settings.json — "
                 "edit them on the Settings tab.",
            text_color=C("fg_muted"), font=FONT_CAPTION,
        ).grid(row=0, column=0, sticky="w", padx=SPACE_MD, pady=SPACE_MD)

        row = 1
        for event_name, hook_list in hooks.items():
            ctk.CTkLabel(
                frame, text=event_name,
                text_color=C("fg"), font=FONT_SUBTITLE, anchor="w",
            ).grid(row=row, column=0, sticky="w", pady=(SPACE_MD, SPACE_SM))
            row += 1

            for hook_group in hook_list:
                matcher = hook_group.get("matcher", "always")
                for hook in hook_group.get("hooks", []):
                    cmd = hook.get("command", "")
                    card = Card(frame)
                    card.grid(row=row, column=0, sticky="ew", pady=(0, SPACE_SM))
                    card.grid_columnconfigure(1, weight=1)

                    ctk.CTkLabel(
                        card, text=matcher,
                        text_color=C("fg_muted"), font=FONT_CAPTION,
                        fg_color=C("bg_elevated_2"), corner_radius=RADIUS_MD,
                        padx=SPACE_SM, pady=2,
                    ).grid(row=0, column=0, padx=SPACE_LG, pady=SPACE_SM)

                    ctk.CTkLabel(
                        card, text=cmd,
                        text_color=C("fg"), font=FONT_MONO_SMALL, anchor="w",
                    ).grid(row=0, column=1, sticky="w", padx=SPACE_SM, pady=SPACE_SM)
                    row += 1

        return frame

    # --- Plugins tab (CC) ----------------------------------------------

    def _build_plugins_tab(self) -> ctk.CTkFrame:
        plugins = self._data.get("plugins", {})
        marketplaces = self._data.get("settings", {}).get("extraKnownMarketplaces", {})

        if not plugins and not marketplaces:
            return self._build_placeholder_tab("Plugins")

        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)

        row = 0
        if plugins:
            ctk.CTkLabel(
                frame, text="Enabled Plugins",
                text_color=C("fg"), font=FONT_SUBTITLE, anchor="w",
            ).grid(row=row, column=0, sticky="w", pady=(0, SPACE_SM))
            row += 1

            card = Card(frame)
            card.grid(row=row, column=0, sticky="ew", pady=(0, SPACE_LG))
            card.grid_columnconfigure(1, weight=1)

            for i, (plugin, is_enabled) in enumerate(plugins.items()):
                status = "✓" if is_enabled else "✗"
                color = C("success") if is_enabled else C("fg_muted")
                ctk.CTkLabel(
                    card, text=status, text_color=color, font=FONT_BODY,
                ).grid(row=i, column=0, padx=(SPACE_LG, SPACE_SM), pady=SPACE_XS)
                ctk.CTkLabel(
                    card, text=plugin, text_color=C("fg"),
                    font=FONT_MONO_SMALL, anchor="w",
                ).grid(row=i, column=1, sticky="w", padx=SPACE_SM, pady=SPACE_XS)
            row += 1

        if marketplaces:
            ctk.CTkLabel(
                frame, text="Marketplaces",
                text_color=C("fg"), font=FONT_SUBTITLE, anchor="w",
            ).grid(row=row, column=0, sticky="w", pady=(0, SPACE_SM))
            row += 1

            card = Card(frame)
            card.grid(row=row, column=0, sticky="ew")
            card.grid_columnconfigure(1, weight=1)

            for i, (name, config) in enumerate(marketplaces.items()):
                source = config.get("source", {})
                repo = source.get("repo", "—")
                ctk.CTkLabel(
                    card, text=name, text_color=C("fg"),
                    font=FONT_BODY, anchor="w",
                ).grid(row=i, column=0, padx=(SPACE_LG, SPACE_SM), pady=SPACE_SM)
                ctk.CTkLabel(
                    card, text=repo, text_color=C("fg_muted"),
                    font=FONT_MONO_SMALL, anchor="w",
                ).grid(row=i, column=1, sticky="w", padx=SPACE_SM, pady=SPACE_SM)

        return frame

    # --- Auth tab (Codex, OpenCode) ------------------------------------
    # Same raw-edit pattern as Settings/Config/Hooks.  The raw auth.json
    # text is preloaded off the UI thread by get_profile_data into
    # self._data["auth_raw"].  The previous read-only textbox used to
    # mask secret values with "***" before display — that is GONE: the
    # stored file holds the real secrets, so the raw editor must show
    # them too (otherwise the user could not actually edit them).
    def _build_auth_tab(self) -> ctk.CTkFrame:
        auth_raw = self._data.get("auth_raw")
        if auth_raw is not None:
            agent_type = self._data.get("agent_type", "codex")
            if agent_type == "opencode":
                wsl_path = f"{self._profile_root}/dot-opencode-data/auth.json"
            else:
                wsl_path = f"{self._profile_root}/dot-codex/auth.json"
            return self._build_editable_tab(
                auth_raw, wsl_path, tab_key="auth",
            )

        # No auth file on disk (or read failed): fall back to the
        # old read-only view of the parsed dict, with secrets masked.
        auth = self._data.get("auth", {})
        if not auth:
            return self._build_placeholder_tab("Auth")

        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)
        frame.grid_rowconfigure(0, weight=1)

        textbox = ctk.CTkTextbox(
            frame, font=FONT_MONO_SMALL,
            fg_color=C("bg_elevated"), text_color=C("fg"),
            corner_radius=RADIUS_MD, border_width=1, border_color=C("border"),
            wrap="word",
        )
        textbox.grid(row=0, column=0, sticky="nsew")

        formatted = json.dumps(auth, indent=2, ensure_ascii=False)
        import re
        for key in ["api_key", "key", "token", "secret", "password"]:
            pattern = rf'("{key}"\s*:\s*")([^"]*?)(")'
            formatted = re.sub(
                pattern,
                lambda m: m.group(1) + "***" + m.group(3),
                formatted, flags=re.IGNORECASE,
            )

        textbox.insert("1.0", formatted)
        textbox.configure(state="disabled")

        return frame

    # --- Env tab (Hermes: .env) ----------------------------------------

    def _build_env_tab(self) -> ctk.CTkFrame:
        content = self._data.get("env")
        if not content:
            return self._build_placeholder_tab("Environment")

        wsl_path = f"{self._profile_root}/dot-hermes/.env"
        return self._build_editable_tab(content, wsl_path, tab_key="env")

    # --- Rules tab (Codex) ---------------------------------------------

    def _build_rules_tab(self) -> ctk.CTkFrame:
        rules = self._data.get("rules", [])
        if not rules:
            return self._build_placeholder_tab("Rules")

        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)

        for i, name in enumerate(rules):
            card = Card(frame)
            card.grid(row=i, column=0, sticky="ew", pady=(0, SPACE_SM))
            card.grid_columnconfigure(1, weight=1)

            ctk.CTkLabel(
                card, text=name, text_color=C("fg"),
                font=FONT_BODY, anchor="w",
            ).grid(row=0, column=0, padx=SPACE_LG, pady=SPACE_SM)

        return frame

    # --- Skills tab (Codex, Hermes) ------------------------------------

    def _build_skills_tab(self) -> ctk.CTkFrame:
        skills = self._data.get("skills", [])
        if not skills:
            return self._build_placeholder_tab("Skills")

        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)

        for i, name in enumerate(skills):
            card = Card(frame)
            card.grid(row=i, column=0, sticky="ew", pady=(0, SPACE_SM))
            card.grid_columnconfigure(1, weight=1)

            icon = "📁" if not name.endswith((".md", ".txt")) else "📄"
            ctk.CTkLabel(
                card, text=f"{icon} {name}", text_color=C("fg"),
                font=FONT_BODY, anchor="w",
            ).grid(row=0, column=0, padx=SPACE_LG, pady=SPACE_SM)

        return frame

    # --- Storage tab ---------------------------------------------------

    def _build_storage_tab(self) -> ctk.CTkFrame:
        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)

        card = Card(frame)
        card.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_LG))
        card.grid_columnconfigure(1, weight=1)

        rows = [
            ("Profile Root", str(self._profile_root)),
            ("Config Dir",   self._data.get("config_dir", "—")),
        ]
        for r, (label, value) in enumerate(rows):
            ctk.CTkLabel(
                card, text=label, text_color=C("fg_muted"),
                font=FONT_CAPTION, anchor="w",
            ).grid(row=r, column=0, sticky="w", padx=SPACE_LG, pady=SPACE_SM)
            ctk.CTkLabel(
                card, text=value, text_color=C("fg"),
                font=FONT_MONO_SMALL, anchor="w",
            ).grid(row=r, column=1, sticky="w", padx=SPACE_SM, pady=SPACE_SM)

        ctk.CTkLabel(
            frame,
            text="To browse files, open WSL and navigate to the profile root.",
            text_color=C("fg_muted"), font=FONT_CAPTION,
        ).grid(row=1, column=0, sticky="w", pady=(0, SPACE_LG))

        return frame

    # --- Placeholder ---------------------------------------------------

    def _build_placeholder_tab(self, key: str) -> ctk.CTkFrame:
        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            frame, text=f"{key.title()} — not available",
            text_color=C("fg_muted"), font=FONT_CAPTION,
        ).grid(row=0, column=0, pady=SPACE_XL)

        return frame


__all__ = ["ProfileDetailPage", "AGENT_TABS"]
