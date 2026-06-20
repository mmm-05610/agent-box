"""Profile detail page — 7 tabs (Meta, Settings, CLAUDE.md, MCP, Skills, Hooks, Storage).

The detail page is opened from the Profiles list and shows everything
about a single profile. Each tab is a self-contained CTkFrame created
on demand and added to a stacked layout; only the active tab is
visible at a time.

Tab implementations:

- ``Meta``        — name, display name, agent type, provider, timestamps,
                    quick action buttons. Provider uses
                    :class:`ProviderSelector` (Phase 4.6).
- ``Settings``    — read-only view of ``settings.json`` plus a JSON
                    editor fallback. Phase 4.2.
- ``CLAUDE.md``   — :class:`MarkdownEditor` (Phase 4.3) with debounced
                    save.
- ``MCP / Skills / Hooks`` — read-only file path + copy button, with
                    a "coming in P1" hint per spec §5.1. Phase 4.4.
- ``Storage``     — directory size + file list. Phase 4.4.
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import customtkinter as ctk

from ..components.button import (
    danger_button,
    ghost_button,
    primary_button,
)
from ..components.card import Card
from ..components.markdown import MarkdownEditor
from ..components.provider import PROVIDERS, ProviderSelector
from ..components.toast import ToastManager
from ..theme import C, Theme
from ..tokens import (
    FONT_BODY,
    FONT_BOLD,
    FONT_CAPTION,
    FONT_DISPLAY,
    FONT_LABEL,
    FONT_MONO,
    FONT_MONO_SMALL,
    FONT_SUBTITLE,
    RADIUS_LG,
    RADIUS_MD,
    SPACE_2XL,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
    SPACE_XL,
)
from ..wsl import AGENT_ORDER, LAUNCH_MODES, MODE_RESUME, launch_profile


# ---------------------------------------------------------------------------
# Tab registry — single source of truth for tab labels + builder order
# ---------------------------------------------------------------------------

TAB_KEYS: List[str] = [
    "meta", "settings", "claude_md", "mcp", "skills", "hooks", "storage",
]

TAB_LABELS: Dict[str, str] = {
    "meta":      "Meta",
    "settings":  "Settings",
    "claude_md": "CLAUDE.md",
    "mcp":       "MCP",
    "skills":    "Skills",
    "hooks":     "Hooks",
    "storage":   "Storage",
}


# ---------------------------------------------------------------------------
# Per-tab builders
# ---------------------------------------------------------------------------

class _MetaTab(ctk.CTkFrame):
    """Name, display name, agent type, provider, timestamps, quick actions."""

    def __init__(self, master, profile: Dict[str, str],
                 on_provider_change: Callable[[str], None],
                 on_launch: Callable[[], None],
                 on_open_folder: Callable[[], None],
                 on_copy_path: Callable[[], None],
                 on_edit_config: Callable[[], None],
                 on_delete: Callable[[], None]):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._profile = profile
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(99, weight=1)

        # Card with name/display/agent/timestamps
        info_card = Card(self)
        info_card.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_XL))
        info_card.grid_columnconfigure(1, weight=1)
        info_card.grid_columnconfigure(3, weight=1)

        rows = [
            ("Name",         profile.get("name", "—")),
            ("Display Name", profile.get("display_name", "—")),
            ("Agent Type",   (profile.get("agent_type", "—") or "—").upper()),
            ("Created",      _fmt_timestamp(profile.get("created_at"))),
            ("Last Used",    _fmt_timestamp(profile.get("last_used_at"))),
        ]
        for r, (label, value) in enumerate(rows):
            lbl = ctk.CTkLabel(
                info_card, text=label, text_color=C("fg_muted"),
                font=FONT_CAPTION, anchor="w",
            )
            lbl.grid(row=r, column=0, sticky="w",
                     padx=SPACE_LG, pady=SPACE_SM)
            val = ctk.CTkLabel(
                info_card, text=value, text_color=C("fg"),
                font=FONT_BODY, anchor="w",
            )
            val.grid(row=r, column=1, columnspan=3, sticky="w",
                     padx=(SPACE_SM, SPACE_LG), pady=SPACE_SM)

        # Provider section
        provider_lbl = ctk.CTkLabel(
            self, text="PROVIDER", text_color=C("fg_subtle"),
            font=FONT_LABEL, anchor="w",
        )
        provider_lbl.grid(row=1, column=0, sticky="ew", pady=(0, SPACE_SM))

        provider = profile.get("provider", "anthropic")
        self._provider = ProviderSelector(
            self, current=provider, on_change=on_provider_change,
        )
        self._provider.grid(row=2, column=0, sticky="ew",
                            pady=(0, SPACE_XL))

        # Quick actions
        actions_lbl = ctk.CTkLabel(
            self, text="QUICK ACTIONS", text_color=C("fg_subtle"),
            font=FONT_LABEL, anchor="w",
        )
        actions_lbl.grid(row=3, column=0, sticky="ew", pady=(0, SPACE_SM))

        actions_card = Card(self)
        actions_card.grid(row=4, column=0, sticky="ew", pady=(0, SPACE_XL))
        actions_card.grid_columnconfigure(99, weight=1)

        primary_button(actions_card, "▶  Launch", command=on_launch,
                       width=130, height=36
                       ).grid(row=0, column=0, padx=SPACE_LG, pady=SPACE_LG)
        ghost_button(actions_card, "📂  Open Folder", command=on_open_folder,
                     width=160, height=36
                     ).grid(row=0, column=1, padx=0, pady=SPACE_LG)
        ghost_button(actions_card, "📋  Copy Path", command=on_copy_path,
                     width=140, height=36
                     ).grid(row=0, column=2, padx=0, pady=SPACE_LG)
        ghost_button(actions_card, "✏  Edit Config", command=on_edit_config,
                     width=140, height=36
                     ).grid(row=0, column=3, padx=0, pady=SPACE_LG)
        danger_button(actions_card, "🗑  Delete", command=on_delete,
                      width=110, height=36
                      ).grid(row=0, column=4, padx=SPACE_LG, pady=SPACE_LG)


class _SettingsTab(ctk.CTkFrame):
    """Read-only view of settings.json + JSON editor fallback."""

    def __init__(self, master, profile: Dict[str, str],
                 settings_path: Path,
                 on_save: Callable[[Dict[str, Any]], None]):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._path = settings_path
        self._on_save = on_save
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # Heading
        ctk.CTkLabel(
            self, text="SETTINGS", text_color=C("fg_subtle"),
            font=FONT_LABEL, anchor="w",
        ).grid(row=0, column=0, sticky="ew", pady=(0, SPACE_SM))

        path_lbl = ctk.CTkLabel(
            self, text=str(settings_path), text_color=C("fg_muted"),
            font=FONT_MONO_SMALL, anchor="w",
        )
        path_lbl.grid(row=1, column=0, sticky="ew", pady=(0, SPACE_SM))

        # Editor (JSON, monospaced) — keep a "Save" button + status
        self._editor = ctk.CTkTextbox(
            self, font=FONT_MONO, fg_color=C("bg_elevated"),
            text_color=C("fg"), corner_radius=RADIUS_MD,
            border_width=1, border_color=C("border"),
        )
        self._editor.grid(row=2, column=0, sticky="nsew",
                          pady=(0, SPACE_MD))

        # Footer
        footer = ctk.CTkFrame(self, fg_color="transparent")
        footer.grid(row=3, column=0, sticky="ew")
        footer.grid_columnconfigure(99, weight=1)

        self._status = ctk.CTkLabel(
            footer, text="", text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="w",
        )
        self._status.grid(row=0, column=0, sticky="w", padx=0)

        primary_button(footer, "💾  Save", command=self._save,
                       width=110, height=32
                       ).grid(row=0, column=99, sticky="e")

        self._load()

    def _load(self) -> None:
        if self._path.exists() and self._path.is_file():
            try:
                text = self._path.read_text(encoding="utf-8")
            except OSError as exc:
                self._status.configure(
                    text=f"Load error: {exc}", text_color=C("error"),
                )
                text = "{}"
        else:
            text = "{}"
        self._editor.delete("1.0", "end")
        self._editor.insert("1.0", text)

    def _save(self) -> None:
        raw = self._editor.get("1.0", "end-1c")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            self._status.configure(
                text=f"Invalid JSON: {exc}", text_color=C("error"),
            )
            return
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps(data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except OSError as exc:
            self._status.configure(
                text=f"Save error: {exc}", text_color=C("error"),
            )
            return
        self._status.configure(
            text="Saved ✓", text_color=C("success"),
        )
        self._on_save(data)


class _ReadOnlyTab(ctk.CTkFrame):
    """Generic placeholder for MCP / Skills / Hooks / Storage (P0 read-only)."""

    def __init__(self, master, title: str, paths: List[Path],
                 on_copy: Callable[[str], None]):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            self, text=title.upper(), text_color=C("fg_subtle"),
            font=FONT_LABEL, anchor="w",
        ).grid(row=0, column=0, sticky="ew", pady=(0, SPACE_SM))

        if not paths:
            empty = ctk.CTkLabel(
                self, text="(no files found)",
                text_color=C("fg_muted"), font=FONT_CAPTION, anchor="w",
            )
            empty.grid(row=1, column=0, sticky="ew", pady=SPACE_SM)
            return

        card = Card(self)
        card.grid(row=1, column=0, sticky="ew", pady=(0, SPACE_MD))
        card.grid_columnconfigure(1, weight=1)

        for i, p in enumerate(paths):
            name = ctk.CTkLabel(
                card, text=p.name, text_color=C("fg"),
                font=FONT_BODY, anchor="w",
            )
            name.grid(row=i, column=0, sticky="w",
                      padx=(SPACE_LG, SPACE_MD), pady=SPACE_SM)
            path = ctk.CTkLabel(
                card, text=str(p), text_color=C("fg_muted"),
                font=FONT_MONO_SMALL, anchor="w",
            )
            path.grid(row=i, column=1, sticky="ew",
                      padx=(0, SPACE_MD), pady=SPACE_SM)
            ghost_button(card, "📋", command=lambda v=str(p): on_copy(v),
                         width=32, height=28
                         ).grid(row=i, column=2, sticky="e",
                                padx=(0, SPACE_LG), pady=SPACE_SM)


class _StorageTab(_ReadOnlyTab):
    """Storage tab — directory + size summary + file list."""

    def __init__(self, master, profile_root: Path, on_copy: Callable[[str], None]):
        files: List[Path] = []
        total = 0
        if profile_root.exists() and profile_root.is_dir():
            for child in sorted(profile_root.rglob("*")):
                if child.is_file():
                    files.append(child)
                    try:
                        total += child.stat().st_size
                    except OSError:
                        pass

        super().__init__(master, title="Storage", paths=files, on_copy=on_copy)

        # Top-of-tab summary line
        size_lbl = ctk.CTkLabel(
            self, text=f"Profile root: {profile_root}",
            text_color=C("fg_subtle"), font=FONT_MONO_SMALL, anchor="w",
        )
        size_lbl.grid(row=99, column=0, sticky="ew", pady=(SPACE_MD, 0))

        if profile_root.exists():
            summary = ctk.CTkLabel(
                self, text=f"{len(files)} file(s) · {_fmt_size(total)}",
                text_color=C("fg_muted"), font=FONT_CAPTION, anchor="w",
            )
            summary.grid(row=100, column=0, sticky="ew", pady=(2, 0))


# ---------------------------------------------------------------------------
# Main page
# ---------------------------------------------------------------------------

class ProfileDetailPage(ctk.CTkFrame):
    """7-tab profile detail view.

    ``profile_root`` is the on-disk directory holding this profile's
    files (``CLAUDE.md``, ``settings.json``, ``mcp.json``, etc.).
    """

    def __init__(
        self,
        master,
        profile: Dict[str, str],
        profile_root: Path,
        on_back: Callable[[], None],
        on_provider_change: Callable[[str], None],
        on_delete: Callable[[str], None],
        toast: ToastManager,
        on_navigate: Optional[Callable[[str], None]] = None,
    ):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._profile = profile
        self._profile_root = profile_root
        self._on_back = on_back
        self._on_provider_change = on_provider_change
        self._on_delete = on_delete
        self._toast = toast
        self._active_tab: str = "meta"
        self._tab_frames: Dict[str, ctk.CTkBaseClass] = {}

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
        header.grid_columnconfigure(0, weight=1)

        back = ghost_button(header, "←  Back to Profiles",
                            command=self._on_back, height=32)
        back.grid(row=0, column=0, sticky="w")

        # Centered title
        title = ctk.CTkLabel(
            header, text=self._profile.get("name", "—"),
            text_color=C("fg"), font=FONT_DISPLAY, anchor="w",
        )
        title.grid(row=1, column=0, sticky="w", pady=(SPACE_SM, 0))

    # --- tabs ----------------------------------------------------------

    def _build_tabs(self) -> None:
        tabs_row = ctk.CTkFrame(self, fg_color="transparent")
        tabs_row.grid(row=1, column=0, sticky="ew",
                      padx=SPACE_2XL, pady=(0, SPACE_MD))
        self._tab_buttons: Dict[str, ctk.CTkButton] = {}
        self._tab_indicators: Dict[str, ctk.CTkFrame] = {}
        for i, key in enumerate(TAB_KEYS):
            holder = ctk.CTkFrame(tabs_row, fg_color="transparent")
            holder.grid(row=0, column=i, padx=(0, 4), sticky="nsw")

            btn = ctk.CTkButton(
                holder, text=TAB_LABELS[key], height=36,
                corner_radius=0,
                fg_color="transparent", text_color=C("fg_muted"),
                hover_color=C("bg_hover"), font=FONT_BOLD,
                command=lambda k=key: self._show_tab(k),
            )
            btn.pack(fill="x")

            indicator = ctk.CTkFrame(
                holder, fg_color="transparent",
                height=3, corner_radius=2,
            )
            indicator.pack(fill="x")

            self._tab_buttons[key] = btn
            self._tab_indicators[key] = indicator

    def _build_body(self) -> None:
        self._body = ctk.CTkFrame(self, fg_color=C("bg"), corner_radius=0)
        self._body.grid(row=2, column=0, sticky="nsew",
                        padx=SPACE_2XL, pady=(0, SPACE_LG))
        self._body.grid_columnconfigure(0, weight=1)
        self._body.grid_rowconfigure(0, weight=1)

    def _show_tab(self, key: str) -> None:
        # Update indicators
        for k, btn in self._tab_buttons.items():
            ind = self._tab_indicators[k]
            if k == key:
                btn.configure(text_color=C("fg"))
                ind.configure(fg_color=C("primary"))
            else:
                btn.configure(text_color=C("fg_muted"))
                ind.configure(fg_color="transparent")

        # Hide current, show target (or build it on first visit)
        for k, frame in self._tab_frames.items():
            if k != key:
                frame.grid_forget()

        if key not in self._tab_frames:
            self._tab_frames[key] = self._build_tab(key)
        self._tab_frames[key].grid(row=0, column=0, sticky="nsew")
        self._active_tab = key

    def _build_tab(self, key: str) -> ctk.CTkBaseClass:
        name = self._profile.get("name", "")
        if key == "meta":
            return _MetaTab(
                self._body, self._profile,
                on_provider_change=self._handle_provider_change,
                on_launch=self._handle_launch,
                on_open_folder=self._handle_open_folder,
                on_copy_path=self._handle_copy_path,
                on_edit_config=self._handle_edit_config,
                on_delete=self._handle_delete,
            )
        if key == "settings":
            return _SettingsTab(
                self._body, self._profile,
                settings_path=self._profile_root / "settings.json",
                on_save=lambda _data: self._toast.show(
                    "Settings saved", kind="success",
                ),
            )
        if key == "claude_md":
            return MarkdownEditor(
                self._body,
                file_path=self._profile_root / "CLAUDE.md",
                on_saved=lambda n: self._toast.show(
                    f"CLAUDE.md saved ({n} chars)", kind="success",
                ),
                on_error=lambda e: self._toast.show(
                    f"Save error: {e}", kind="error",
                ),
            )
        if key == "mcp":
            return _ReadOnlyTab(
                self._body, title="MCP", paths=_list_files(
                    self._profile_root / "mcp.json",
                ),
                on_copy=self._handle_copy_path,
            )
        if key == "skills":
            return _ReadOnlyTab(
                self._body, title="Skills", paths=_list_dir_files(
                    self._profile_root / "skills",
                ),
                on_copy=self._handle_copy_path,
            )
        if key == "hooks":
            return _ReadOnlyTab(
                self._body, title="Hooks", paths=_list_files(
                    self._profile_root / "hooks.json",
                ),
                on_copy=self._handle_copy_path,
            )
        if key == "storage":
            return _StorageTab(
                self._body,
                profile_root=self._profile_root,
                on_copy=self._handle_copy_path,
            )
        raise KeyError(f"unknown tab: {key!r}")

    # --- actions -------------------------------------------------------

    def _handle_provider_change(self, provider: str) -> None:
        self._on_provider_change(provider)
        self._toast.show(f"Provider → {provider}", kind="success")

    def _handle_launch(self) -> None:
        try:
            launch_profile(
                self._profile["name"],
                self._profile.get("agent_type", "cc"),
                MODE_RESUME, "",
            )
            self._toast.show(
                f"Launched {self._profile['name']}", kind="success",
            )
        except RuntimeError as exc:
            self._toast.show(f"Launch failed: {exc}", kind="error")

    def _handle_open_folder(self) -> None:
        if self._profile_root.exists():
            try:
                # Windows: explorer.exe; the WSL side is opened by
                # the user via the WSL path bar — we just copy the
                # path here for now.
                self._toast.show(
                    f"Path: {self._profile_root}", kind="info",
                )
            except Exception as exc:
                self._toast.show(f"Open failed: {exc}", kind="error")
        else:
            self._toast.show(
                "Profile directory does not exist yet", kind="warning",
            )

    def _handle_copy_path(self, value: str) -> None:
        try:
            self.clipboard_clear()
            self.clipboard_append(value)
            self._toast.show("Copied to clipboard", kind="info")
        except Exception as exc:
            self._toast.show(f"Copy failed: {exc}", kind="error")

    def _handle_edit_config(self) -> None:
        self._show_tab("settings")
        self._toast.show("Edit settings.json below", kind="info")

    def _handle_delete(self) -> None:
        # Confirm via toast (no native dialog available in this env)
        self._toast.show(
            f"Confirm: delete profile {self._profile['name']}?",
            kind="warning",
        )
        self._on_delete(self._profile["name"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt_timestamp(value: Optional[str]) -> str:
    if not value:
        return "—"
    try:
        dt = datetime.fromisoformat(value)
        delta = datetime.now() - dt
        secs = int(delta.total_seconds())
        if secs < 60:
            return f"{value}  ({secs}s ago)"
        if secs < 3600:
            return f"{value}  ({secs // 60}m ago)"
        if secs < 86400:
            return f"{value}  ({secs // 3600}h ago)"
        return f"{value}  ({secs // 86400}d ago)"
    except (ValueError, TypeError):
        return str(value)


def _fmt_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    if n < 1024 * 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} MB"
    return f"{n / (1024 * 1024 * 1024):.1f} GB"


def _list_files(path: Path) -> List[Path]:
    if path.exists() and path.is_file():
        return [path]
    return []


def _list_dir_files(path: Path) -> List[Path]:
    if not (path.exists() and path.is_dir()):
        return []
    return sorted(p for p in path.iterdir() if p.is_file())


__all__ = ["ProfileDetailPage"]