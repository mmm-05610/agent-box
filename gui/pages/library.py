"""Library page — manage Providers and Claude.md templates.

Single page, two tabs (Providers / ClaudeMDs), one agent-type
selector. Reads via WSL ``agent-box ... list --json`` and writes via
``agent-box ... upsert <type> <id>`` (the content is piped through
stdin — the GUI runs on Windows, so ``$EDITOR`` is not available).

Visual style: cc-switch / shadcn cards. Each item is a single row
with a name + category badge + 3 action buttons (Edit / Delete /
Apply). Edit expands the row in place with a textbox and Save/Cancel.
Apply pops an inline dropdown of profiles.
"""
from __future__ import annotations

import json
import threading
from tkinter import messagebox
from typing import Any, Callable, Dict, List, Optional

import customtkinter as ctk

from ..components.button import ghost_button, primary_button
from ..components.status import Badge
from ..components.toast import ToastManager
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
    SPACE_2XL,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
    SPACE_XL,
    SPACE_XS,
)
from ..wsl import (
    AGENT_ORDER,
    apply_claude_md_to_profile,
    apply_provider_to_profile,
    delete_claude_md,
    delete_provider,
    fetch_claude_mds,
    fetch_providers,
    save_claude_md,
    save_provider,
)


# --- helpers ------------------------------------------------------------

# Known env key → provider category mapping.
# Keep in sync with src/agent_box/providers.py _ENV_CATEGORY.
_ENV_CATEGORY_MAP: Dict[str, str] = {
    "ANTHROPIC_API_KEY": "anthropic",
    "ANTHROPIC_AUTH_TOKEN": "anthropic",
    "OPENAI_API_KEY": "openai",
    "GOOGLE_API_KEY": "google",
    "GEMINI_API_KEY": "google",
    "AWS_ACCESS_KEY_ID": "aws",
    "AWS_SECRET_ACCESS_KEY": "aws",
    "AWS_BEDROCK_API_KEY": "aws",
    "DEEPSEEK_API_KEY": "deepseek",
    "OPENROUTER_API_KEY": "openrouter",
    "MISTRAL_API_KEY": "mistral",
    "GROQ_API_KEY": "groq",
    "TOGETHER_API_KEY": "together",
    "COHERE_API_KEY": "cohere",
    "REPLICATE_API_TOKEN": "replicate",
    "HF_TOKEN": "huggingface",
    "HUGGING_FACE_HUB_TOKEN": "huggingface",
    "FIREWORKS_API_KEY": "fireworks",
    "PERPLEXITY_API_KEY": "perplexity",
    "SILICONFLOW_API_KEY": "siliconflow",
}


def _infer_category(settings: Dict[str, Any]) -> str:
    """Infer provider category from settings.

    Claude Code uses ``ANTHROPIC_*`` env vars for ALL providers — the
    actual provider identity comes from the ``ANTHROPIC_BASE_URL`` domain.
    """
    from .config import _extract_provider_name

    env = settings.get("env") or {}

    # 1. Claude Code: ANTHROPIC_BASE_URL determines the real provider.
    base_url = env.get("ANTHROPIC_BASE_URL", "")
    if base_url:
        name = _extract_provider_name(base_url)
        if name:
            return name
        # URL present but unrecognised domain — still not Anthropic official
        return "custom"
    # No ANTHROPIC_BASE_URL → official Anthropic endpoint.
    # But only claim "anthropic" if there IS an Anthropic key.
    if "ANTHROPIC_API_KEY" in env or "ANTHROPIC_AUTH_TOKEN" in env:
        return "anthropic"

    # 2. Non-Claude agent types: check other known URL env vars.
    _URL_ENV_KEYS = [
        "OPENAI_BASE_URL", "GOOGLE_API_BASE", "DEEPSEEK_BASE_URL",
        "OPENROUTER_BASE_URL", "MISTRAL_BASE_URL", "GROQ_BASE_URL",
    ]
    for key in _URL_ENV_KEYS:
        url = env.get(key, "")
        if url:
            name = _extract_provider_name(url)
            if name:
                return name

    # 3. Fallback: scan all env values for any URL.
    for val in env.values():
        if isinstance(val, str) and "://" in val:
            name = _extract_provider_name(val)
            if name:
                return name

    return ""


# Tab keys
TAB_PROVIDERS = "providers"
TAB_CLAUDE_MDS = "claude_mds"
TABS: List[tuple] = [
    (TAB_PROVIDERS, "Providers"),
    (TAB_CLAUDE_MDS, "Claude.md"),
]


class _ItemRow(ctk.CTkFrame):
    """One item row (provider or ClaudeMD) — view mode + inline edit mode.

    State machine:
        ``mode == "view"``  → name + meta + 3 action buttons
        ``mode == "edit"``  → textbox (pre-filled) + Save/Cancel
        ``mode == "apply"`` → profile dropdown + Apply/Cancel
    """

    HEIGHT_VIEW = 64
    HEIGHT_EDIT = 320

    def __init__(
        self,
        master,
        *,
        kind: str,            # "provider" | "claude_md"
        item_id: str,
        display_name: str,
        meta_text: str,       # e.g. "anthropic" or description
        badge_text: str,      # category for providers, kind for MDs
        edit_content: str,    # pre-filled textbox content (JSON or MD)
        edit_kind: str,       # "json" | "text"
        profiles: List[Dict[str, str]],
        on_save: Callable[[str], None],   # (new_content) -> None
        on_delete: Callable[[], None],
        on_apply: Callable[[str, Callable[[], None]], None],
        # (profile_name, on_done) -> None
    ):
        super().__init__(
            master, fg_color=C("bg_elevated"),
            corner_radius=RADIUS_LG, border_width=1,
            border_color=C("border"),
        )
        self._kind = kind
        self._item_id = item_id
        self._display_name = display_name
        self._meta_text = meta_text
        self._badge_text = badge_text
        self._edit_content = edit_content
        self._edit_kind = edit_kind
        self._profiles = profiles
        self._on_save = on_save
        self._on_delete = on_delete
        self._on_apply = on_apply

        # Always tracks the currently-shown sub-state
        self._mode: str = "view"
        self._saving: bool = False
        self._applying: bool = False

        # View widgets
        self._view_frame: Optional[ctk.CTkFrame] = None
        self._edit_frame: Optional[ctk.CTkFrame] = None
        self._apply_frame: Optional[ctk.CTkFrame] = None

        # Edit widgets (created on demand)
        self._textbox: Optional[ctk.CTkTextbox] = None
        self._save_btn: Optional[ctk.CTkButton] = None
        self._error_lbl: Optional[ctk.CTkLabel] = None

        # Apply widgets (created on demand)
        self._profile_menu: Optional[ctk.CTkOptionMenu] = None
        self._apply_btn: Optional[ctk.CTkButton] = None
        self._apply_err: Optional[ctk.CTkLabel] = None

        self.grid_columnconfigure(0, weight=1)
        self._build_view()
        self._show_view()

    # --- view mode -----------------------------------------------------

    def _build_view(self) -> None:
        self._view_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._view_frame.grid(row=0, column=0, sticky="ew", padx=SPACE_LG, pady=SPACE_MD)
        self._view_frame.grid_columnconfigure(0, weight=1)

        # Left: name + meta
        left = ctk.CTkFrame(self._view_frame, fg_color="transparent")
        left.grid(row=0, column=0, sticky="w")
        left.grid_columnconfigure(1, weight=1)

        title = ctk.CTkLabel(
            left, text=self._display_name,
            text_color=C("fg"), font=FONT_SUBTITLE, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w", padx=(0, SPACE_SM))

        if self._badge_text:
            Badge(left, text=self._badge_text, variant="neutral").grid(
                row=0, column=1, sticky="w", padx=(0, SPACE_SM),
            )

        meta = ctk.CTkLabel(
            left, text=self._meta_text or "—",
            text_color=C("fg_muted"), font=FONT_CAPTION, anchor="w",
        )
        meta.grid(row=1, column=0, columnspan=2, sticky="w", pady=(2, 0))

        # Right: action buttons
        actions = ctk.CTkFrame(self._view_frame, fg_color="transparent")
        actions.grid(row=0, column=1, sticky="e")
        ghost_button(actions, text="Edit", width=64,
                     command=self._enter_edit).pack(side="left", padx=(0, SPACE_XS))
        ghost_button(actions, text="Apply", width=64,
                     command=self._enter_apply).pack(side="left", padx=(0, SPACE_XS))
        ghost_button(actions, text="Delete", width=64,
                     command=self._confirm_delete).pack(side="left")

    def _show_view(self) -> None:
        self._hide_all()
        assert self._view_frame is not None
        self._view_frame.grid(row=0, column=0, sticky="ew")
        self._mode = "view"

    # --- edit mode -----------------------------------------------------

    def _enter_edit(self) -> None:
        if self._saving or self._applying:
            return
        self._hide_all()
        if self._edit_frame is None:
            self._build_edit()
        assert self._edit_frame is not None
        self._edit_frame.grid(row=0, column=0, sticky="ew", padx=SPACE_LG, pady=SPACE_MD)
        if self._error_lbl is not None:
            self._error_lbl.configure(text="")
        if self._textbox is not None:
            self._textbox.delete("1.0", "end")
            self._textbox.insert("1.0", self._edit_content)
            self._textbox.focus_set()
        self._mode = "edit"

    def _build_edit(self) -> None:
        self._edit_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._edit_frame.grid_columnconfigure(0, weight=1)

        # Header label
        hint = (
            "Edit JSON settings (env block is required):"
            if self._edit_kind == "json"
            else "Edit markdown content:"
        )
        ctk.CTkLabel(
            self._edit_frame, text=hint, text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        ).grid(row=0, column=0, sticky="w", pady=(0, SPACE_XS))

        self._textbox = ctk.CTkTextbox(
            self._edit_frame,
            font=FONT_MONO_SMALL,
            fg_color=C("bg_input"), text_color=C("fg"),
            corner_radius=RADIUS_MD, border_width=1,
            border_color=C("border"), wrap="word",
            height=200,
        )
        self._textbox.grid(row=1, column=0, sticky="ew")

        # Error line
        self._error_lbl = ctk.CTkLabel(
            self._edit_frame, text="", text_color=C("error"),
            font=FONT_CAPTION, anchor="w",
        )
        self._error_lbl.grid(row=2, column=0, sticky="w", pady=(SPACE_XS, 0))

        # Buttons
        btn_row = ctk.CTkFrame(self._edit_frame, fg_color="transparent")
        btn_row.grid(row=3, column=0, sticky="e", pady=(SPACE_SM, 0))
        ghost_button(btn_row, text="Cancel", width=80,
                     command=self._cancel_edit).pack(side="left", padx=(0, SPACE_SM))
        self._save_btn = primary_button(btn_row, text="Save", width=80,
                                        command=self._do_save)
        self._save_btn.pack(side="left")

    def _cancel_edit(self) -> None:
        if self._saving:
            return
        self._show_view()

    def _do_save(self) -> None:
        if self._saving or self._textbox is None or self._save_btn is None:
            return
        new_content = self._textbox.get("1.0", "end-1c")
        # Local JSON validation: surface errors before going to WSL.
        if self._edit_kind == "json":
            try:
                parsed = json.loads(new_content)
            except json.JSONDecodeError as exc:
                if self._error_lbl is not None:
                    self._error_lbl.configure(text=f"Invalid JSON: {exc}")
                return
            if not isinstance(parsed, dict):
                if self._error_lbl is not None:
                    self._error_lbl.configure(text="JSON must be an object")
                return
            if not isinstance(parsed.get("env"), dict):
                if self._error_lbl is not None:
                    self._error_lbl.configure(text="'env' must be a JSON object")
                return

        self._saving = True
        self._save_btn.configure(state="disabled", text="Saving…")
        if self._error_lbl is not None:
            self._error_lbl.configure(text="")

        # Hand the actual save to the page (which dispatches by kind)
        try:
            self._on_save(new_content)
        finally:
            # Re-enable — the page may close this row (delete) or just
            # collapse the edit frame on success. The page-level handlers
            # call ``refresh()`` to redraw.
            self._saving = False
            try:
                if self._save_btn is not None and self._save_btn.winfo_exists():
                    self._save_btn.configure(state="normal", text="Save")
            except Exception:
                pass

    # --- apply mode ----------------------------------------------------

    def _enter_apply(self) -> None:
        if self._saving or self._applying:
            return
        if not self._profiles:
            messagebox.showinfo(
                "No profiles",
                "There are no profiles to apply to. "
                "Create one from the Profiles page first.",
            )
            return
        self._hide_all()
        if self._apply_frame is None:
            self._build_apply()
        assert self._apply_frame is not None
        self._apply_frame.grid(row=0, column=0, sticky="ew",
                               padx=SPACE_LG, pady=SPACE_MD)
        if self._apply_err is not None:
            self._apply_err.configure(text="")
        self._mode = "apply"

    def _build_apply(self) -> None:
        self._apply_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._apply_frame.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            self._apply_frame, text="Apply to profile:",
            text_color=C("fg_muted"), font=FONT_CAPTION, anchor="w",
        ).grid(row=0, column=0, sticky="w", padx=(0, SPACE_SM))

        names = [p.get("name", "?") for p in self._profiles] or ["(no profiles)"]
        self._profile_var = ctk.StringVar(value=names[0])
        self._profile_menu = ctk.CTkOptionMenu(
            self._apply_frame, values=names,
            variable=self._profile_var,
            fg_color=C("bg_elevated_2"), button_color=C("bg_hover"),
            button_hover_color=C("bg_active"),
            text_color=C("fg"), dropdown_text_color=C("fg"),
            dropdown_fg_color=C("surface_overlay"),
            dropdown_hover_color=C("bg_hover"),
            font=FONT_CAPTION, dropdown_font=FONT_CAPTION,
            width=220,
        )
        self._profile_menu.grid(row=0, column=1, sticky="w")

        self._apply_err = ctk.CTkLabel(
            self._apply_frame, text="", text_color=C("error"),
            font=FONT_CAPTION, anchor="w",
        )
        self._apply_err.grid(row=1, column=0, columnspan=2, sticky="w",
                             pady=(SPACE_XS, 0))

        btn_row = ctk.CTkFrame(self._apply_frame, fg_color="transparent")
        btn_row.grid(row=2, column=0, columnspan=2, sticky="e",
                     pady=(SPACE_SM, 0))
        ghost_button(btn_row, text="Cancel", width=80,
                     command=lambda: self._show_view()).pack(side="left",
                                                            padx=(0, SPACE_SM))
        self._apply_btn = primary_button(btn_row, text="Apply", width=80,
                                         command=self._do_apply)
        self._apply_btn.pack(side="left")

    def _do_apply(self) -> None:
        if self._applying:
            return
        profile_name = (self._profile_var.get()
                        if hasattr(self, "_profile_var") else "")
        if not profile_name or profile_name == "(no profiles)":
            return
        self._applying = True
        if self._apply_btn is not None:
            self._apply_btn.configure(state="disabled", text="Applying…")
        if self._apply_err is not None:
            self._apply_err.configure(text="")

        def on_done() -> None:
            self._applying = False
            try:
                if self._apply_btn is not None and self._apply_btn.winfo_exists():
                    self._apply_btn.configure(state="normal", text="Apply")
            except Exception:
                pass

        self._on_apply(profile_name, on_done)

    # --- delete --------------------------------------------------------

    def _confirm_delete(self) -> None:
        if self._saving or self._applying:
            return
        kind_label = "provider" if self._kind == "provider" else "Claude.md"
        if not messagebox.askyesno(
            f"Delete {kind_label}",
            f"Delete {kind_label} {self._item_id!r} ({self._display_name})?\n\n"
            "This cannot be undone.",
        ):
            return
        self._on_delete()

    # --- helpers -------------------------------------------------------

    def _hide_all(self) -> None:
        for f in (self._view_frame, self._edit_frame, self._apply_frame):
            if f is not None:
                try:
                    f.grid_forget()
                except Exception:
                    pass

    def show_error(self, message: str) -> None:
        """Surface a backend error in whichever sub-frame is active."""
        if self._mode == "edit" and self._error_lbl is not None:
            self._error_lbl.configure(text=message)
        elif self._mode == "apply" and self._apply_err is not None:
            self._apply_err.configure(text=message)


class _AddPanel(ctk.CTkFrame):
    """Collapsible top-of-list "+ Add" panel.

    Collapsed: single clickable row with "+ Add {kind}" label.
    Expanded: full inline form with id + (name/desc) + textbox + Create.
    """

    def __init__(
        self,
        master,
        *,
        kind: str,            # "provider" | "claude_md"
        edit_kind: str,       # "json" | "text"
        template_content: str,
        on_create: Callable[[str, str, Optional[str], Optional[str]], None],
        # provider:   (id, content_json, None, None)
        # claude_md:  (id, content, name_or_None, description_or_None)
    ):
        super().__init__(
            master, fg_color=C("bg_elevated"),
            corner_radius=RADIUS_LG, border_width=1,
            border_color=C("border"),
        )
        self._kind = kind
        self._edit_kind = edit_kind
        self._on_create = on_create
        self._saving = False
        self._expanded = False

        self.grid_columnconfigure(0, weight=1)

        # --- Collapsed header (always visible) ---
        self._header = ctk.CTkFrame(self, fg_color="transparent")
        self._header.grid(row=0, column=0, sticky="ew",
                          padx=SPACE_LG, pady=SPACE_MD)
        self._header.grid_columnconfigure(0, weight=1)

        self._header_label = ctk.CTkLabel(
            self._header,
            text=f"+  Add {kind.replace('_', '.')}",
            text_color=C("fg_muted"), font=FONT_SUBTITLE, anchor="w",
        )
        self._header_label.grid(row=0, column=0, sticky="w")

        # Make the header clickable
        for widget in (self._header, self._header_label):
            widget.bind("<Button-1>", lambda _e: self._toggle())
            widget.configure(cursor="hand2")

        # --- Expandable form body (hidden initially) ---
        self._body = ctk.CTkFrame(self, fg_color="transparent")
        self._body.grid_columnconfigure(1, weight=1)
        self._body.grid_rowconfigure(3, weight=1)

        ctk.CTkLabel(self._body, text="ID", text_color=C("fg_muted"),
                     font=FONT_CAPTION, anchor="w").grid(
            row=0, column=0, sticky="w", padx=(SPACE_LG, SPACE_SM),
            pady=(SPACE_SM, SPACE_XS))
        self._id_var = ctk.StringVar()
        ctk.CTkEntry(
            self._body, textvariable=self._id_var,
            fg_color=C("bg_input"), text_color=C("fg"),
            border_color=C("border"), border_width=1,
            corner_radius=RADIUS_MD, height=32, font=FONT_CAPTION,
            placeholder_text="my-provider-id (a-z, 0-9, '-', '_')",
        ).grid(row=0, column=1, sticky="ew", padx=(0, SPACE_LG),
               pady=(SPACE_SM, SPACE_XS))

        # Optional name / description row (for claude_md)
        self._name_var: Optional[ctk.StringVar] = None
        if kind == "claude_md":
            ctk.CTkLabel(self._body, text="Name", text_color=C("fg_muted"),
                         font=FONT_CAPTION, anchor="w").grid(
                row=1, column=0, sticky="w", padx=(SPACE_LG, SPACE_SM),
                pady=(0, SPACE_XS))
            self._name_var = ctk.StringVar()
            ctk.CTkEntry(
                self._body, textvariable=self._name_var,
                fg_color=C("bg_input"), text_color=C("fg"),
                border_color=C("border"), border_width=1,
                corner_radius=RADIUS_MD, height=32, font=FONT_CAPTION,
            ).grid(row=1, column=1, sticky="ew",
                   padx=(0, SPACE_LG), pady=(0, SPACE_XS))

        # Content textbox
        ctk.CTkLabel(self._body, text="Content", text_color=C("fg_muted"),
                     font=FONT_CAPTION, anchor="w").grid(
            row=2, column=0, sticky="nw",
            padx=(SPACE_LG, SPACE_SM), pady=(SPACE_XS, 0))
        self._textbox = ctk.CTkTextbox(
            self._body, font=FONT_MONO_SMALL,
            fg_color=C("bg_input"), text_color=C("fg"),
            corner_radius=RADIUS_MD, border_width=1,
            border_color=C("border"), wrap="word", height=160,
        )
        self._textbox.grid(row=2, column=1, sticky="nsew",
                           padx=(0, SPACE_LG), pady=(SPACE_XS, SPACE_SM))
        self._textbox.insert("1.0", template_content)
        self._template_content = template_content

        # Error + actions
        self._error_lbl = ctk.CTkLabel(
            self._body, text="", text_color=C("error"),
            font=FONT_CAPTION, anchor="w",
        )
        self._error_lbl.grid(row=3, column=0, columnspan=2, sticky="w",
                             padx=SPACE_LG, pady=(0, SPACE_XS))

        btn_row = ctk.CTkFrame(self._body, fg_color="transparent")
        btn_row.grid(row=4, column=0, columnspan=2, sticky="e",
                     padx=SPACE_LG, pady=(0, SPACE_MD))
        ghost_button(btn_row, text="Cancel", width=80,
                     command=self._collapse).pack(side="left", padx=(0, SPACE_SM))
        self._create_btn = primary_button(btn_row, text="Create", width=100,
                                          command=self._do_create)
        self._create_btn.pack(side="left")

    # --- expand / collapse -----------------------------------------------

    def _toggle(self) -> None:
        if self._expanded:
            self._collapse()
        else:
            self._expand()

    def _expand(self) -> None:
        if self._expanded:
            return
        self._expanded = True
        self._header_label.configure(text_color=C("fg"))
        self._body.grid(row=1, column=0, sticky="ew")
        self._id_var.set("")  # clear stale input
        if self._name_var is not None:
            self._name_var.set("")

    def _collapse(self) -> None:
        if not self._expanded:
            return
        self._expanded = False
        self._header_label.configure(text_color=C("fg_muted"))
        self._body.grid_forget()

    # --- create ----------------------------------------------------------

    def _do_create(self) -> None:
        if self._saving:
            return
        item_id = self._id_var.get().strip()
        if not item_id:
            self._error_lbl.configure(text="ID is required")
            return
        content = self._textbox.get("1.0", "end-1c")
        if self._edit_kind == "json":
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError as exc:
                self._error_lbl.configure(text=f"Invalid JSON: {exc}")
                return
            if not isinstance(parsed, dict):
                self._error_lbl.configure(text="JSON must be an object")
                return
            if not isinstance(parsed.get("env"), dict):
                self._error_lbl.configure(text="'env' must be a JSON object")
                return
        name = (self._name_var.get().strip()
                if self._name_var is not None else None) or None
        description: Optional[str] = "" if self._kind == "claude_md" else None

        self._saving = True
        self._create_btn.configure(state="disabled", text="Creating…")
        self._error_lbl.configure(text="")
        try:
            self._on_create(item_id, content, name, description)
        finally:
            self._saving = False
            try:
                if self._create_btn.winfo_exists():
                    self._create_btn.configure(state="normal", text="Create")
            except Exception:
                pass

    def reset(self) -> None:
        """Clear the form and collapse (called after a successful create)."""
        self._id_var.set("")
        if self._name_var is not None:
            self._name_var.set("")
        self._textbox.delete("1.0", "end")
        self._textbox.insert("1.0", self._template_content)
        self._error_lbl.configure(text="")
        self._collapse()


class LibraryPage(ctk.CTkFrame):
    """Manage Providers and Claude.md templates via WSL bridge.

    Constructor signature follows the spec:
        __init__(master, toast, profiles, on_profiles_needed)
    """

    PROVIDER_TEMPLATE = json.dumps(
        {"name": "my-provider", "description": "", "env": {}},
        indent=2, ensure_ascii=False,
    )
    CLAUDE_MD_TEMPLATE = (
        "# My Claude.md\n\n"
        "<!-- Edit this Claude.md template. It's applied to a profile with: -->\n"
        "<!--   agent-box claude-md apply <profile> <id> -->\n\n"
    )

    def __init__(
        self,
        master,
        toast: ToastManager,
        profiles: List[Dict[str, Any]],
        on_profiles_needed: Callable[[], List[Dict[str, Any]]],
    ):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._toast = toast
        self._profiles = list(profiles) if profiles else []
        self._on_profiles_needed = on_profiles_needed

        self._agent_type: str = "claude"
        self._active_tab: str = TAB_PROVIDERS

        # Cached data
        self._providers: List[Dict[str, Any]] = []
        self._claude_mds: List[Dict[str, Any]] = []
        self._provider_details: Dict[str, Optional[Dict[str, Any]]] = {}
        self._claude_md_details: Dict[str, Optional[Dict[str, Any]]] = {}
        self._loading: bool = False

        # Per-row edit bookkeeping — separate per tab to avoid cross-tab loss.
        self._provider_row_owners: Dict[int, _ItemRow] = {}
        self._md_row_owners: Dict[int, _ItemRow] = {}

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        self._build_header()
        self._build_tabs()
        self._build_body()
        self._build_loading_overlay()
        self._show_tab(TAB_PROVIDERS)
        self._load_data()

    # --- layout --------------------------------------------------------

    def _build_header(self) -> None:
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew",
                    padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_LG))
        header.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            header, text="Library", text_color=C("fg"),
            font=FONT_DISPLAY, anchor="w",
        ).grid(row=0, column=0, sticky="w")

        # Agent-type selector (top-right)
        self._agent_var = ctk.StringVar(value="claude")
        agent_menu = ctk.CTkOptionMenu(
            header, values=list(AGENT_ORDER), variable=self._agent_var,
            command=self._on_agent_change,
            fg_color=C("bg_elevated_2"), button_color=C("bg_hover"),
            button_hover_color=C("bg_active"),
            text_color=C("fg"), dropdown_text_color=C("fg"),
            dropdown_fg_color=C("surface_overlay"),
            dropdown_hover_color=C("bg_hover"),
            font=FONT_CAPTION, dropdown_font=FONT_CAPTION, width=140,
        )
        agent_menu.grid(row=0, column=1, sticky="e")

    def _build_tabs(self) -> None:
        tabs_row = ctk.CTkFrame(self, fg_color="transparent")
        tabs_row.grid(row=1, column=0, sticky="ew",
                      padx=SPACE_2XL, pady=(0, SPACE_MD))

        self._tab_buttons: Dict[str, ctk.CTkButton] = {}
        self._tab_indicators: Dict[str, ctk.CTkFrame] = {}
        for i, (key, label) in enumerate(TABS):
            holder = ctk.CTkFrame(tabs_row, fg_color="transparent")
            holder.pack(side="left", padx=(0, SPACE_MD))

            btn = ctk.CTkButton(
                holder, text=label, height=32, corner_radius=0,
                fg_color="transparent", text_color=C("fg_muted"),
                hover_color=C("bg_hover"), font=FONT_BOLD,
                command=lambda k=key: self._show_tab(k),
            )
            btn.pack(fill="x")

            indicator = ctk.CTkFrame(
                holder, fg_color="transparent", height=2, corner_radius=1,
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

        # Two scrollable frames — one per tab.
        self._providers_holder = ctk.CTkScrollableFrame(
            self._body, fg_color=C("bg"), corner_radius=0,
        )
        self._providers_holder.grid_columnconfigure(0, weight=1)
        self._providers_holder.grid_rowconfigure(0, weight=0)

        self._mds_holder = ctk.CTkScrollableFrame(
            self._body, fg_color=C("bg"), corner_radius=0,
        )
        self._mds_holder.grid_columnconfigure(0, weight=1)

        # Add panels (one per tab)
        self._add_provider_panel = _AddPanel(
            self._providers_holder, kind="provider", edit_kind="json",
            template_content=self.PROVIDER_TEMPLATE,
            on_create=self._on_create_provider,
        )
        self._add_md_panel = _AddPanel(
            self._mds_holder, kind="claude_md", edit_kind="text",
            template_content=self.CLAUDE_MD_TEMPLATE,
            on_create=self._on_create_claude_md,
        )

        # Empty-state labels (one per tab)
        self._empty_provider = ctk.CTkLabel(
            self._providers_holder, text="(no providers yet)",
            text_color=C("fg_subtle"), font=FONT_CAPTION, anchor="w",
        )
        self._empty_md = ctk.CTkLabel(
            self._mds_holder, text="(no Claude.md templates yet)",
            text_color=C("fg_subtle"), font=FONT_CAPTION, anchor="w",
        )

    def _build_loading_overlay(self) -> None:
        self._loading_lbl = ctk.CTkLabel(
            self, text="Loading…", text_color=C("fg_muted"),
            font=FONT_CAPTION,
        )
        # Error state frame (shown on load failure with Retry button)
        self._error_frame = ctk.CTkFrame(
            self._body, fg_color="transparent",
        )
        self._error_frame.grid_columnconfigure(0, weight=1)
        self._error_icon = ctk.CTkLabel(
            self._error_frame, text="⚠", text_color=C("warning"),
            font=("Segoe UI Emoji", 28),
        )
        self._error_title = ctk.CTkLabel(
            self._error_frame, text="Failed to load",
            text_color=C("fg"), font=FONT_SUBTITLE,
        )
        self._error_detail = ctk.CTkLabel(
            self._error_frame, text="",
            text_color=C("fg_muted"), font=FONT_CAPTION, wraplength=400,
        )
        self._retry_btn = ghost_button(
            self._error_frame, text="Retry",
            command=self._load_data,
        )
        self._error_icon.grid(row=0, column=0, pady=(SPACE_XL, SPACE_SM))
        self._error_title.grid(row=1, column=0, pady=(0, SPACE_XS))
        self._error_detail.grid(row=2, column=0, pady=(0, SPACE_MD))
        self._retry_btn.grid(row=3, column=0)

    # --- tab switching -------------------------------------------------

    def _show_tab(self, key: str) -> None:
        for k, btn in self._tab_buttons.items():
            ind = self._tab_indicators[k]
            if k == key:
                btn.configure(text_color=C("fg"))
                ind.configure(fg_color=C("fg"))
            else:
                btn.configure(text_color=C("fg_muted"))
                ind.configure(fg_color="transparent")

        for holder in (self._providers_holder, self._mds_holder):
            try:
                holder.grid_forget()
            except Exception:
                pass

        if key == TAB_PROVIDERS:
            self._providers_holder.grid(
                row=0, column=0, sticky="nsew",
                padx=0, pady=0,
            )
        else:
            self._mds_holder.grid(
                row=0, column=0, sticky="nsew",
                padx=0, pady=0,
            )
        self._active_tab = key

    # --- data loading --------------------------------------------------

    def _set_loading(self, on: bool) -> None:
        self._loading = on
        if on:
            # Hide error state if visible
            try:
                self._error_frame.grid_forget()
            except Exception:
                pass
            self._loading_lbl.place(relx=0.5, rely=0.5, anchor="center")
        else:
            try:
                self._loading_lbl.place_forget()
            except Exception:
                pass

    def _load_data(self) -> None:
        if self._loading:
            return
        self._set_loading(True)

        from ..wsl import fetch_claude_md_detail, fetch_provider_detail

        def _worker() -> None:
            try:
                providers = fetch_providers(self._agent_type)
                mds = fetch_claude_mds(self._agent_type)
                # Pre-fetch full details so the edit textbox has content
                # the first time the user clicks Edit. Failures are
                # non-fatal — we just leave the row with empty content.
                p_details = {
                    p.get("id"): fetch_provider_detail(
                        self._agent_type, p.get("id", ""),
                    )
                    for p in providers if p.get("id")
                }
                m_details = {
                    m.get("id"): fetch_claude_md_detail(
                        self._agent_type, m.get("id", ""),
                    )
                    for m in mds if m.get("id")
                }
                self.after(0, lambda: self._on_data_loaded(providers, mds, p_details, m_details))
            except RuntimeError as exc:
                self.after(0, lambda e=exc: self._on_data_error(e))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_data_loaded(
        self,
        providers: List[Dict[str, Any]],
        mds: List[Dict[str, Any]],
        p_details: Dict[str, Optional[Dict[str, Any]]],
        m_details: Dict[str, Optional[Dict[str, Any]]],
    ) -> None:
        self._providers = providers
        self._claude_mds = mds
        self._provider_details = p_details
        self._claude_md_details = m_details
        self._set_loading(False)
        self._render_providers()
        self._render_mds()

    def _on_data_error(self, exc: RuntimeError) -> None:
        self._set_loading(False)
        self._toast.show(f"Library load failed: {exc}", kind="error")
        # Show inline error state with retry option
        self._error_detail.configure(text=str(exc))
        self._error_frame.grid(
            row=0, column=0, sticky="nsew",
            padx=SPACE_2XL, pady=SPACE_3XL,
        )
        # Keep last-known data; just re-render in case rows were stale
        self._render_providers()
        self._render_mds()

    def _on_agent_change(self, value: str) -> None:
        if value == self._agent_type:
            return
        # Confirm if any row is mid-edit
        if self._has_unsaved():
            if not messagebox.askyesno(
                "Unsaved Changes",
                "You have an edit in progress. Discard it?",
            ):
                # Revert the dropdown visually
                self._agent_var.set(self._agent_type)
                return
        self._agent_type = value
        self._load_data()

    def _has_unsaved(self) -> bool:
        for row in (*self._provider_row_owners.values(),
                    *self._md_row_owners.values()):
            if row._mode == "edit":  # noqa: SLF001 (intentional)
                return True
        return False

    # --- rendering -----------------------------------------------------

    def _render_providers(self) -> None:
        # Clear all rows in the providers holder (keep the add panel at top)
        for w in list(self._providers_holder.winfo_children()):
            if w is self._add_provider_panel:
                continue
            if w is self._empty_provider:
                try:
                    w.grid_forget()
                except Exception:
                    pass
                continue
            try:
                w.destroy()
            except Exception:
                pass
        self._provider_row_owners.clear()

        # Place the add panel at row 0
        self._add_provider_panel.grid(
            row=0, column=0, sticky="ew",
            padx=0, pady=(0, SPACE_MD),
        )

        if not self._providers:
            self._empty_provider.grid(
                row=1, column=0, sticky="w", pady=SPACE_MD,
            )
            return

        for i, p in enumerate(self._providers, start=1):
            row = self._build_provider_row(p)
            row.grid(row=i, column=0, sticky="ew", pady=(0, SPACE_SM))

    def _render_mds(self) -> None:
        for w in list(self._mds_holder.winfo_children()):
            if w is self._add_md_panel:
                continue
            if w is self._empty_md:
                try:
                    w.grid_forget()
                except Exception:
                    pass
                continue
            try:
                w.destroy()
            except Exception:
                pass
        self._md_row_owners.clear()

        self._add_md_panel.grid(
            row=0, column=0, sticky="ew",
            padx=0, pady=(0, SPACE_MD),
        )

        if not self._claude_mds:
            self._empty_md.grid(
                row=1, column=0, sticky="w", pady=SPACE_MD,
            )
            return

        for i, m in enumerate(self._claude_mds, start=1):
            row = self._build_md_row(m)
            row.grid(row=i, column=0, sticky="ew", pady=(0, SPACE_SM))

    def _build_provider_row(self, p: Dict[str, Any]) -> _ItemRow:
        item_id = p.get("id", "?")
        display_name = p.get("name") or item_id
        category = p.get("category") or ""
        profiles = self._current_profiles()
        # Pre-fill edit content from the pre-fetched detail.
        detail = self._provider_details.get(item_id) or {}
        settings = detail.get("settings") or {}
        try:
            edit_content = json.dumps(
                settings, indent=2, ensure_ascii=False,
            )
        except (TypeError, ValueError):
            edit_content = ""
        # Use a descriptive meta line: the JSON keys list, if any.
        env_keys = list((settings.get("env") or {}).keys())
        meta_text = f"id: {item_id}" + (
            f"   ·   env: {', '.join(env_keys[:4])}"
            + ("…" if len(env_keys) > 4 else "")
            if env_keys else ""
        )
        # Use a placeholder edit content; the real one is fetched lazily
        # on first save — we don't need it for view/delete/apply.
        row = _ItemRow(
            self._providers_holder,
            kind="provider",
            item_id=item_id,
            display_name=display_name,
            meta_text=meta_text,
            badge_text=category or _infer_category(settings),
            edit_content=edit_content,
            edit_kind="json",
            profiles=profiles,
            on_save=lambda content, _pid=item_id: self._on_provider_save(
                _pid, content,
            ),
            on_delete=lambda _pid=item_id: self._on_provider_delete(_pid),
            on_apply=lambda profile, done, _pid=item_id: self._on_provider_apply(
                _pid, profile, done,
            ),
        )
        # Stash the row by id(row) so we can address it from async callbacks
        self._provider_row_owners[id(row)] = row
        return row

    def _build_md_row(self, m: Dict[str, Any]) -> _ItemRow:
        item_id = m.get("id", "?")
        display_name = m.get("name") or item_id
        description = m.get("description") or ""
        detail = self._claude_md_details.get(item_id) or {}
        edit_content = detail.get("content") or ""
        meta_text = description or f"id: {item_id}"
        profiles = self._current_profiles()
        row = _ItemRow(
            self._mds_holder,
            kind="claude_md",
            item_id=item_id,
            display_name=display_name,
            meta_text=meta_text,
            badge_text="markdown",
            edit_content=edit_content,
            edit_kind="text",
            profiles=profiles,
            on_save=lambda content, _mid=item_id: self._on_md_save(
                _mid, content,
            ),
            on_delete=lambda _mid=item_id: self._on_md_delete(_mid),
            on_apply=lambda profile, done, _mid=item_id: self._on_md_apply(
                _mid, profile, done,
            ),
        )
        self._md_row_owners[id(row)] = row
        return row

    def _current_profiles(self) -> List[Dict[str, Any]]:
        """Return the latest profile list (refreshes from the callback)."""
        try:
            latest = self._on_profiles_needed() or []
            self._profiles = list(latest)
        except Exception:
            pass
        return self._profiles

    # --- save / delete / apply: providers ------------------------------

    def _on_provider_save(self, provider_id: str, content: str) -> None:
        # content is already JSON-validated in _ItemRow._do_save
        def _worker() -> None:
            try:
                save_provider(self._agent_type, provider_id, content)
                self.after(0, lambda: self._on_save_done(
                    f"Saved provider {provider_id!r}.",
                ))
            except RuntimeError as exc:
                self.after(0, lambda e=exc: self._on_save_error(e))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_provider_delete(self, provider_id: str) -> None:
        def _worker() -> None:
            try:
                delete_provider(self._agent_type, provider_id)
                self.after(0, lambda: self._on_delete_done(
                    f"Deleted provider {provider_id!r}.",
                ))
            except RuntimeError as exc:
                self.after(0, lambda e=exc: self._on_save_error(e))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_provider_apply(
        self, provider_id: str, profile: str, on_done: Callable[[], None],
    ) -> None:
        def _worker() -> None:
            try:
                apply_provider_to_profile(profile, provider_id)
                self.after(0, lambda: (
                    self._on_apply_done(
                        f"Applied provider {provider_id!r} → {profile!r}.",
                    ),
                    on_done(),
                ))
            except RuntimeError as exc:
                self.after(0, lambda e=exc: (self._on_save_error(e), on_done()))

        threading.Thread(target=_worker, daemon=True).start()

    # --- save / delete / apply: claude-mds -----------------------------

    def _on_md_save(self, md_id: str, content: str) -> None:
        def _worker() -> None:
            try:
                save_claude_md(self._agent_type, md_id, content)
                self.after(0, lambda: self._on_save_done(
                    f"Saved Claude.md {md_id!r}.",
                ))
            except RuntimeError as exc:
                self.after(0, lambda e=exc: self._on_save_error(e))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_md_delete(self, md_id: str) -> None:
        def _worker() -> None:
            try:
                delete_claude_md(self._agent_type, md_id)
                self.after(0, lambda: self._on_delete_done(
                    f"Deleted Claude.md {md_id!r}.",
                ))
            except RuntimeError as exc:
                self.after(0, lambda e=exc: self._on_save_error(e))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_md_apply(
        self, md_id: str, profile: str, on_done: Callable[[], None],
    ) -> None:
        def _worker() -> None:
            try:
                apply_claude_md_to_profile(profile, md_id)
                self.after(0, lambda: (
                    self._on_apply_done(
                        f"Applied Claude.md {md_id!r} → {profile!r}.",
                    ),
                    on_done(),
                ))
            except RuntimeError as exc:
                self.after(0, lambda e=exc: (self._on_save_error(e), on_done()))

        threading.Thread(target=_worker, daemon=True).start()

    # --- create (from add panels) --------------------------------------

    def _on_create_provider(
        self, item_id: str, content: str,
        _name: Optional[str], _desc: Optional[str],
    ) -> None:
        def _worker() -> None:
            try:
                save_provider(self._agent_type, item_id, content)
                self.after(0, lambda: self._on_create_done(
                    f"Created provider {item_id!r}.",
                    clear_provider=True,
                ))
            except RuntimeError as exc:
                self.after(0, lambda e=exc: self._on_save_error(e))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_create_claude_md(
        self, item_id: str, content: str,
        name: Optional[str], _desc: Optional[str],
    ) -> None:
        def _worker() -> None:
            try:
                save_claude_md(
                    self._agent_type, item_id, content,
                    name=name or None,
                    description="",  # empty on create
                )
                self.after(0, lambda: self._on_create_done(
                    f"Created Claude.md {item_id!r}.",
                    clear_md=True,
                ))
            except RuntimeError as exc:
                self.after(0, lambda e=exc: self._on_save_error(e))

        threading.Thread(target=_worker, daemon=True).start()

    # --- async results -------------------------------------------------

    def _on_save_done(self, msg: str) -> None:
        self._toast.show(msg, kind="success")
        self._load_data()

    def _on_delete_done(self, msg: str) -> None:
        self._toast.show(msg, kind="success")
        self._load_data()

    def _on_apply_done(self, msg: str) -> None:
        self._toast.show(msg, kind="success")
        # No reload needed — apply doesn't change library data

    def _on_create_done(
        self, msg: str, *, clear_provider: bool = False, clear_md: bool = False,
    ) -> None:
        self._toast.show(msg, kind="success")
        if clear_provider:
            self._add_provider_panel.reset()
        if clear_md:
            self._add_md_panel.reset()
        self._load_data()

    def _on_save_error(self, exc: RuntimeError) -> None:
        msg = str(exc)
        self._toast.show(f"Failed: {msg}", kind="error")
        # Try to surface in any row currently in edit mode
        for row in (*self._provider_row_owners.values(),
                    *self._md_row_owners.values()):
            if row._mode == "edit":  # noqa: SLF001
                row.show_error(msg)
                break


__all__ = ["LibraryPage"]
