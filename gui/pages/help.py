"""Help page — quick reference and about info."""
from __future__ import annotations

import customtkinter as ctk

from ..theme import C
from ..tokens import (
    FONT_BODY,
    FONT_CAPTION,
    FONT_DISPLAY,
    FONT_LABEL,
    FONT_MICRO,
    FONT_MONO_SMALL,
    RADIUS_LG,
    SPACE_2XL,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
    SPACE_XL,
)


class HelpPage(ctk.CTkFrame):
    """Quick reference + about."""

    def __init__(self, master):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # Title
        title_block = ctk.CTkFrame(self, fg_color="transparent")
        title_block.grid(row=0, column=0, sticky="ew",
                         padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_LG))
        ctk.CTkLabel(
            title_block, text="Help", text_color=C("fg"),
            font=FONT_DISPLAY, anchor="w",
        ).grid(row=0, column=0, sticky="w")

        body = ctk.CTkScrollableFrame(self, fg_color=C("bg"), corner_radius=0)
        body.grid(row=1, column=0, sticky="nsew",
                  padx=SPACE_2XL, pady=(0, SPACE_LG))
        body.grid_columnconfigure(0, weight=1)

        # Quick reference
        self._section(body, 0, "QUICK REFERENCE")
        self._card(body, 1, [
            ("CLI 帮助", "agent-box --help"),
            ("列出 profile", "agent-box list"),
            ("创建 profile", "agent-box create <name> --type cc"),
            ("启动 profile", "agent-box cc <name>"),
            ("查看预设", "agent-box presets"),
            ("会话历史", "agent-box sessions"),
        ])

        # Links
        self._section(body, 2, "LINKS")
        links_card = ctk.CTkFrame(
            body, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        links_card.grid(row=3, column=0, sticky="ew", pady=(0, SPACE_XL))
        links_card.grid_columnconfigure(0, weight=1)

        links = [
            ("GitHub", "https://github.com/mmm-05610/agent-box"),
            ("Issues", "https://github.com/mmm-05610/agent-box/issues"),
        ]
        for i, (label, url) in enumerate(links):
            ctk.CTkLabel(
                links_card, text=f"{label}: {url}", text_color=C("accent"),
                font=FONT_CAPTION, anchor="w",
            ).grid(row=i, column=0, sticky="w",
                   padx=SPACE_LG, pady=(SPACE_MD, SPACE_SM))

        # About
        self._section(body, 4, "ABOUT")
        about = ctk.CTkFrame(
            body, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        about.grid(row=5, column=0, sticky="ew")
        about.grid_columnconfigure(0, weight=1)

        try:
            from agent_box import __version__
            ver = __version__
        except Exception:
            ver = "0.4.0"

        for i, line in enumerate([
            f"agent-box v{ver}",
            "隔离型 AI 编码 Agent 启动器",
            "bwrap 内核级配置隔离 · 零运行时依赖",
            "MIT License",
        ]):
            ctk.CTkLabel(
                about, text=line, text_color=C("fg_muted"),
                font=FONT_CAPTION if i else FONT_BODY, anchor="w",
            ).grid(row=i, column=0, sticky="w",
                   padx=SPACE_LG, pady=(SPACE_MD, SPACE_SM if i < 3 else SPACE_MD))

    def _section(self, parent, row: int, text: str) -> None:
        ctk.CTkLabel(
            parent, text=text, text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="w",
        ).grid(row=row, column=0, sticky="ew", pady=(SPACE_XL, SPACE_SM))

    def _card(self, parent, row: int, items) -> None:
        card = ctk.CTkFrame(
            parent, fg_color=C("bg_elevated"), corner_radius=RADIUS_LG,
            border_width=1, border_color=C("border"),
        )
        card.grid(row=row, column=0, sticky="ew", pady=(0, SPACE_XL))
        card.grid_columnconfigure(1, weight=1)

        for i, (label, value) in enumerate(items):
            ctk.CTkLabel(
                card, text=label, text_color=C("fg"), font=FONT_CAPTION,
                anchor="w",
            ).grid(row=i, column=0, sticky="w", padx=SPACE_LG,
                   pady=(SPACE_MD, SPACE_SM))
            ctk.CTkLabel(
                card, text=value, text_color=C("fg_muted"),
                font=FONT_MONO_SMALL, anchor="e",
            ).grid(row=i, column=1, sticky="e", padx=SPACE_LG,
                   pady=(SPACE_MD, SPACE_SM))
