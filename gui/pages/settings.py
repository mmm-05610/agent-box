"""Settings page — theme, environment info, and health re-check."""
from __future__ import annotations

import shutil
from tkinter import messagebox
from typing import Callable

import customtkinter as ctk

from ..theme import C, Theme
from ..tokens import (
    FONT_BODY,
    FONT_CAPTION,
    FONT_DISPLAY,
    FONT_LABEL,
    FONT_MICRO,
    FONT_MONO_SMALL,
    RADIUS_LG,
    RADIUS_MD,
    SPACE_2XL,
    SPACE_LG,
    SPACE_MD,
)


class SettingsPage(ctk.CTkFrame):
    """Theme switcher + environment info + health re-check."""

    def __init__(self, master, on_theme_change: Callable[[], None]):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._on_theme_change = on_theme_change

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # Title
        title_block = ctk.CTkFrame(self, fg_color="transparent")
        title_block.grid(row=0, column=0, sticky="ew",
                         padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_LG))
        title = ctk.CTkLabel(
            title_block, text="Settings", text_color=C("fg"),
            font=FONT_DISPLAY, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w")

        body = ctk.CTkScrollableFrame(self, fg_color=C("bg"), corner_radius=0)
        body.grid(row=1, column=0, sticky="nsew",
                  padx=SPACE_2XL, pady=(0, SPACE_LG))
        body.grid_columnconfigure(0, weight=1)

        # ----------------------------------------------------------------
        # Appearance
        # ----------------------------------------------------------------
        self._section_label(body, 0, "APPEARANCE")
        card = self._card(body, 1)
        theme_lbl = ctk.CTkLabel(
            card, text="Theme", text_color=C("fg"), font=FONT_BODY, anchor="w",
        )
        theme_lbl.grid(row=0, column=0, padx=SPACE_LG, pady=SPACE_LG, sticky="w")

        mode = Theme.current_mode()
        theme_var = ctk.StringVar(value=mode.title())
        theme_menu = ctk.CTkOptionMenu(
            card, variable=theme_var,
            values=["Dark", "Light", "System"],
            width=120, height=32, corner_radius=RADIUS_MD,
            fg_color=C("bg_elevated_2"), button_color=C("bg_hover"),
            button_hover_color=C("bg_active"),
            text_color=C("fg"), dropdown_text_color=C("fg"),
            dropdown_fg_color=C("surface_overlay"),
            dropdown_hover_color=C("bg_hover"),
            font=FONT_CAPTION, dropdown_font=FONT_CAPTION,
            command=lambda v: self._change_theme(v.lower()),
        )
        theme_menu.grid(row=0, column=1, padx=SPACE_LG, pady=SPACE_LG, sticky="e")

        # ----------------------------------------------------------------
        # Environment
        # ----------------------------------------------------------------
        env_info = self._env_info()

        row = 2
        for _label, _value in env_info:
            if _label == "—":  # section separator
                row += 1
                continue
            self._section_label(body, row, _label)
            row += 1
            c = self._card(body, row)
            val = ctk.CTkLabel(
                c, text=_value, text_color=C("fg_muted"),
                font=FONT_MONO_SMALL, anchor="w",
            )
            val.grid(row=0, column=0, padx=SPACE_LG, pady=SPACE_MD, sticky="w")
            row += 1

        # ----------------------------------------------------------------
        # Health re-check button
        # ----------------------------------------------------------------
        row += 1
        recheck = ctk.CTkButton(
            body, text="重新检查环境", font=FONT_CAPTION,
            fg_color=C("bg_elevated_2"), hover_color=C("bg_active"),
            text_color=C("fg"), corner_radius=RADIUS_MD,
            height=32, command=self._recheck,
        )
        recheck.grid(row=row, column=0, sticky="w", pady=(SPACE_LG, 0))

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    def _section_label(self, parent, row: int, text: str) -> None:
        lbl = ctk.CTkLabel(
            parent, text=text.upper(), text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="w",
        )
        lbl.grid(row=row, column=0, sticky="ew", pady=(SPACE_LG, SPACE_MD))

    def _card(self, parent, row: int) -> ctk.CTkFrame:
        card = ctk.CTkFrame(
            parent, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        card.grid(row=row, column=0, sticky="ew", pady=(0, SPACE_MD))
        card.grid_columnconfigure(0, weight=1)
        return card

    def _env_info(self):
        from ..wsl import resolve_profile_root, _wsl_try_output, _wsl_check_output

        info = []

        # Agent Box
        try:
            ver = _wsl_check_output("agent-box --version", timeout=10)
        except Exception:
            ver = "(未安装)"
        info.append(("AGENT-BOX", f"CLI v{ver}"))

        try:
            root = resolve_profile_root()
        except Exception:
            root = "(不可用)"
        info.append(("PROFILE ROOT", root))

        # WSL
        wsl_path = shutil.which("wsl.exe") or "C:\\Windows\\System32\\wsl.exe"
        info.append(("WSL", wsl_path))

        bw = _wsl_try_output("which bwrap && bwrap --version", timeout=10)
        if bw:
            # "which bwrap && bwrap --version" outputs two lines
            lines = bw.strip().splitlines()
            bw_path = lines[0] if lines else "?"
            bw_ver = lines[1] if len(lines) > 1 else ""
            info.append(("BWRAP", f"{bw_path}    {bw_ver}"))
        else:
            info.append(("BWRAP", "(未安装)"))

        # Python
        py = _wsl_try_output("python3 --version", timeout=10)
        info.append(("PYTHON", py or "(未安装)"))

        return info

    # ------------------------------------------------------------------
    # actions
    # ------------------------------------------------------------------

    def _change_theme(self, mode: str) -> None:
        Theme.set_mode(mode)
        self._on_theme_change()

    def _recheck(self) -> None:
        from ..wsl import health_check

        try:
            problems = health_check()
        except Exception:
            messagebox.showwarning("环境检查", "无法连接 WSL。")
            return

        if problems:
            lines = "\n".join(f"  • {desc}" for desc, _ in problems)
            messagebox.showwarning("环境检查", f"以下依赖缺失：\n\n{lines}")
        else:
            messagebox.showinfo("环境检查", "所有依赖正常，环境就绪。")
