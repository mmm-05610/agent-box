"""Profile detail page — dynamic tabs based on agent type.

This module ONLY renders data. All data fetching is done in gui/data.py.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import customtkinter as ctk

from ..components.button import ghost_button
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
    "cc": [
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
        toast: ToastManager,
    ):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._profile = profile
        self._profile_root = profile_root
        self._config_root = config_root
        self._on_back = on_back
        self._toast = toast
        self._active_tab: str = "meta"
        self._tab_frames: Dict[str, ctk.CTkBaseClass] = {}

        # Fetch ALL data once, store as dict
        agent_type = profile.get("agent_type", "cc")
        self._data = get_profile_data(profile_root, agent_type)
        self._tabs = AGENT_TABS.get(agent_type, AGENT_TABS["cc"])

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
                            command=self._on_back, height=32)
        back.grid(row=0, column=0, sticky="w")

        name = self._data.get("name", "—")
        agent_type = self._data.get("agent_type", "").upper()
        title = ctk.CTkLabel(
            header, text=name,
            text_color=C("fg"), font=FONT_DISPLAY, anchor="w",
        )
        title.grid(row=0, column=1, sticky="w", padx=SPACE_LG)

        badge = ctk.CTkLabel(
            header, text=agent_type,
            text_color=C("fg_muted"), font=FONT_CAPTION,
            fg_color=C("bg_elevated_2"), corner_radius=RADIUS_MD,
            padx=SPACE_SM, pady=2,
        )
        badge.grid(row=0, column=2, sticky="w", padx=SPACE_SM)

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

    # --- Meta tab ------------------------------------------------------

    def _build_meta_tab(self) -> ctk.CTkFrame:
        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)

        card = Card(frame)
        card.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_LG))
        card.grid_columnconfigure(1, weight=1)

        rows = [
            ("Name",       self._data.get("name", "—")),
            ("Agent Type", (self._data.get("agent_type", "—") or "—").upper()),
            ("Provider",   self._data.get("provider", "—")),
            ("Model",      self._data.get("model", "—")),
            ("Config Dir", self._data.get("config_dir", "—")),
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

        return frame

    # --- Settings tab (CC: settings.json) ------------------------------

    def _build_settings_tab(self) -> ctk.CTkFrame:
        settings = self._data.get("settings", {})
        if not settings:
            return self._build_placeholder_tab("Settings")

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

        formatted = json.dumps(settings, indent=2, ensure_ascii=False)
        textbox.insert("1.0", formatted)
        textbox.configure(state="disabled")

        return frame

    # --- Config tab (Codex/Hermes/OpenCode) ----------------------------

    def _build_config_tab(self) -> ctk.CTkFrame:
        config = self._data.get("config", {})
        if not config:
            return self._build_placeholder_tab("Config")

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

        formatted = json.dumps(config, indent=2, ensure_ascii=False)
        textbox.insert("1.0", formatted)
        textbox.configure(state="disabled")

        return frame

    # --- CLAUDE.md tab (CC only) ---------------------------------------

    def _build_claude_md_tab(self) -> ctk.CTkFrame:
        content = self._data.get("claude_md")
        if not content:
            return self._build_placeholder_tab("CLAUDE.md")

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
        textbox.insert("1.0", content)
        textbox.configure(state="disabled")

        return frame

    # --- Persona tab (Hermes: SOUL.md) ---------------------------------

    def _build_persona_tab(self) -> ctk.CTkFrame:
        content = self._data.get("persona")
        if not content:
            return self._build_placeholder_tab("SOUL.md")

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
        textbox.insert("1.0", content)
        textbox.configure(state="disabled")

        return frame

    # --- Hooks tab (CC) ------------------------------------------------

    def _build_hooks_tab(self) -> ctk.CTkFrame:
        hooks = self._data.get("hooks", {})
        if not hooks:
            return self._build_placeholder_tab("Hooks")

        frame = ctk.CTkFrame(self._body, fg_color=C("bg"), corner_radius=0)
        frame.grid_columnconfigure(0, weight=1)

        row = 0
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

    def _build_auth_tab(self) -> ctk.CTkFrame:
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
        textbox.insert("1.0", content)
        textbox.configure(state="disabled")

        return frame

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
