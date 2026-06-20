# Phase 4: 功能补全

> 目标：Profile 详情页 + 创建向导 + Provider 切换

---

## task-4.1-detail-page-meta

### 目标

实现 Profile 详情页的 Meta Tab。

### 设计方案

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Profiles                    DW              [🗑]  │
│                                                              │
│ [Meta] [Settings] [CLAUDE.md] [MCP] [Skills] [Hooks] [Storage]
│ ─────────────────────────────────────────────────────────────│
│                                                              │
│  Name          DW                                            │
│  Display Name  Decision Writer                               │
│  Agent Type    CC (Claude Code)                               │
│  Provider      Anthropic                              [Change]
│  Created       2026-06-15 14:32                              │
│  Last Used     2026-06-20 19:45                              │
│                                                              │
│  ─────────────────────────────────────────────────────────── │
│                                                              │
│  Quick Actions                                               │
│  [▶ Launch]  [📂 Open Folder]  [📋 Copy Path]  [✏ Edit Config]
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 输出

`gui/pages/detail.py` — ProfileDetailPage

### 实现

```python
"""Profile detail page — Meta tab."""
from __future__ import annotations
import customtkinter as ctk
from gui.theme import C
from gui.tokens import *
from gui.components.button import primary_button, ghost_button, danger_button
from gui.components.card import Card


class ProfileDetailPage(ctk.CTkFrame):
    """Profile detail page with tab navigation."""

    TABS = ["Meta", "Settings", "CLAUDE.md", "MCP", "Skills", "Hooks", "Storage"]

    def __init__(self, master, profile: dict, on_back):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._profile = profile
        self._on_back = on_back

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # Header
        self._build_header()

        # Tabs
        self._build_tabs()

        # Content area
        self._content = ctk.CTkFrame(self, fg_color=C("bg"), corner_radius=0)
        self._content.grid(row=2, column=0, sticky="nsew", padx=SPACE_2XL, pady=(0, SPACE_2XL))
        self._content.grid_columnconfigure(0, weight=1)
        self._content.grid_rowconfigure(0, weight=1)

        # Show Meta tab by default
        self._show_tab("Meta")

    def _build_header(self):
        """Build header with back button, title, and delete button."""
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew", padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_LG))
        header.grid_columnconfigure(1, weight=1)

        # Back button
        ghost_button(header, text="← Back to Profiles",
                     command=self._on_back).grid(row=0, column=0, sticky="w")

        # Profile name
        ctk.CTkLabel(header, text=self._profile["name"],
                     font=FONT_DISPLAY, text_color=C("fg")).grid(row=0, column=1, padx=SPACE_LG)

        # Delete button
        danger_button(header, text="🗑 Delete",
                      command=self._delete_profile).grid(row=0, column=2, sticky="e")

    def _build_tabs(self):
        """Build tab navigation."""
        tab_frame = ctk.CTkFrame(self, fg_color="transparent")
        tab_frame.grid(row=1, column=0, sticky="ew", padx=SPACE_2XL, pady=(0, SPACE_LG))

        self._tab_buttons = {}
        self._tab_indicators = {}

        for i, tab in enumerate(self.TABS):
            btn_frame = ctk.CTkFrame(tab_frame, fg_color="transparent")
            btn_frame.grid(row=0, column=i, padx=(0, SPACE_LG))

            btn = ctk.CTkButton(
                btn_frame, text=tab, height=32,
                fg_color="transparent", text_color=C("fg_muted"),
                hover_color=C("bg_hover"), font=FONT_BOLD,
                command=lambda t=tab: self._show_tab(t),
            )
            btn.pack()

            indicator = ctk.CTkFrame(btn_frame, fg_color="transparent", height=3)
            indicator.pack(fill="x", pady=(4, 0))

            self._tab_buttons[tab] = btn
            self._tab_indicators[tab] = indicator

        # Separator
        ctk.CTkFrame(self, fg_color=C("border"), height=1).grid(
            row=1, column=0, sticky="ew", padx=SPACE_2XL, pady=(40, 0))

    def _show_tab(self, tab: str):
        """Show the specified tab content."""
        # Update tab styles
        for t, btn in self._tab_buttons.items():
            if t == tab:
                btn.configure(text_color=C("fg"))
                self._tab_indicators[t].configure(fg_color=C("primary"))
            else:
                btn.configure(text_color=C("fg_muted"))
                self._tab_indicators[t].configure(fg_color="transparent")

        # Clear content
        for w in self._content.winfo_children():
            w.destroy()

        # Build tab content
        if tab == "Meta":
            self._build_meta_tab()
        elif tab == "Settings":
            self._build_settings_tab()
        elif tab == "CLAUDE.md":
            self._build_claude_md_tab()
        elif tab == "MCP":
            self._build_mcp_tab()
        elif tab == "Skills":
            self._build_skills_tab()
        elif tab == "Hooks":
            self._build_hooks_tab()
        elif tab == "Storage":
            self._build_storage_tab()

    def _build_meta_tab(self):
        """Build Meta tab content."""
        # Info section
        info_card = Card(self._content)
        info_card.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_LG))

        fields = [
            ("Name", self._profile["name"]),
            ("Display Name", self._profile.get("display_name", "")),
            ("Agent Type", self._profile.get("agent_type", "").upper()),
            ("Provider", self._profile.get("provider", "Anthropic")),
            ("Created", self._profile.get("created_at", "Unknown")),
            ("Last Used", self._profile.get("last_used", "Unknown")),
        ]

        for i, (label, value) in enumerate(fields):
            row = ctk.CTkFrame(info_card, fg_color="transparent")
            row.grid(row=i, column=0, sticky="ew", padx=SPACE_LG, pady=SPACE_SM)
            row.grid_columnconfigure(1, weight=1)

            ctk.CTkLabel(row, text=label, font=FONT_CAPTION,
                         text_color=C("fg_muted"), width=120, anchor="w").grid(row=0, column=0)
            ctk.CTkLabel(row, text=value, font=FONT_BODY,
                         text_color=C("fg"), anchor="w").grid(row=0, column=1, sticky="w")

        # Quick Actions section
        actions_card = Card(self._content)
        actions_card.grid(row=1, column=0, sticky="ew")

        ctk.CTkLabel(actions_card, text="Quick Actions", font=FONT_SUBTITLE,
                     text_color=C("fg")).grid(row=0, column=0, padx=SPACE_LG, pady=(SPACE_LG, SPACE_SM))

        actions_row = ctk.CTkFrame(actions_card, fg_color="transparent")
        actions_row.grid(row=1, column=0, sticky="ew", padx=SPACE_LG, pady=(0, SPACE_LG))

        primary_button(actions_row, text="▶ Launch",
                       command=self._launch).pack(side="left", padx=(0, SPACE_SM))
        ghost_button(actions_row, text="📂 Open Folder",
                     command=self._open_folder).pack(side="left", padx=(0, SPACE_SM))
        ghost_button(actions_row, text="📋 Copy Path",
                     command=self._copy_path).pack(side="left", padx=(0, SPACE_SM))
        ghost_button(actions_row, text="✏ Edit Config",
                     command=self._edit_config).pack(side="left")
```

---

## task-4.2-detail-page-settings

### 目标

实现 Profile 详情页的 Settings Tab。

### 设计方案

```
Settings Tab:
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  Environment Variables                                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Key                    Value                    [Edit] │ │
│  │ ANTHROPIC_API_KEY      sk-ant-...***           [Edit] │ │
│  │ CLAUDE_MODEL           claude-sonnet-4-6       [Edit] │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Permissions                                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [✓] Allow Bash commands                                │ │
│  │ [✓] Allow file operations                              │ │
│  │ [ ] Allow network access                               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Advanced Settings                                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ alwaysThinkingEnabled    [✓]                           │ │
│  │ maxTokens                [4096]                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 实现

```python
def _build_settings_tab(self):
    """Build Settings tab content."""
    # 读取 profile 的 settings.json
    settings_path = Path.home() / ".agent-box" / "profiles" / self._profile["name"] / "dot-claude" / "settings.json"

    if settings_path.exists():
        with open(settings_path) as f:
            settings = json.load(f)
    else:
        settings = {}

    # Environment Variables section
    env_card = Card(self._content)
    env_card.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_LG))

    ctk.CTkLabel(env_card, text="Environment Variables",
                 font=FONT_SUBTITLE, text_color=C("fg")).grid(row=0, column=0, padx=SPACE_LG, pady=(SPACE_LG, SPACE_SM))

    env_vars = settings.get("env", {})
    for i, (key, value) in enumerate(env_vars.items()):
        row = ctk.CTkFrame(env_card, fg_color="transparent")
        row.grid(row=i+1, column=0, sticky="ew", padx=SPACE_LG, pady=SPACE_XS)
        row.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(row, text=key, font=FONT_MONO_SMALL,
                     text_color=C("fg"), anchor="w").grid(row=0, column=0, sticky="w")

        # 隐藏敏感值
        display_value = value[:8] + "***" if len(value) > 8 else value
        ctk.CTkLabel(row, text=display_value, font=FONT_MONO_SMALL,
                     text_color=C("fg_muted"), anchor="w").grid(row=0, column=1, sticky="w", padx=SPACE_LG)

        ghost_button(row, text="Edit", command=lambda k=key, v=value: self._edit_env(k, v)).grid(row=0, column=2)

    # Permissions section
    perm_card = Card(self._content)
    perm_card.grid(row=1, column=0, sticky="ew", pady=(0, SPACE_LG))

    ctk.CTkLabel(perm_card, text="Permissions",
                 font=FONT_SUBTITLE, text_color=C("fg")).grid(row=0, column=0, padx=SPACE_LG, pady=(SPACE_LG, SPACE_SM))

    # ... 实现 permissions 复选框
```

---

## task-4.3-detail-page-claude-md

### 目标

实现 Profile 详情页的 CLAUDE.md Tab（内置编辑器）。

### 设计方案

```
CLAUDE.md Tab:
┌─────────────────────────────────────────────────────────────┐
│ [B] [I] [S] [Link] [Code]              Saving… / Saved ✓   │
│ ────────────────────────────────────────────────────────────│
│ # 你是 DW 执行者                                            │
│                                                              │
│ 核心职责：                                                   │
│ - 编排多步骤任务                                             │
│ - 管理子 agent                                               │
│ - 生成决策文档                                               │
│                                                              │
│ ## 约束                                                      │
│ - 不直接写代码                                               │
│ - 不做实现决策                                               │
│ - 只做编排和文档                                             │
└─────────────────────────────────────────────────────────────┘
```

### 实现

```python
def _build_claude_md_tab(self):
    """Build CLAUDE.md editor tab."""
    editor_frame = ctk.CTkFrame(self._content, fg_color=C("bg"), corner_radius=0)
    editor_frame.grid(row=0, column=0, sticky="nsew")
    editor_frame.grid_columnconfigure(0, weight=1)
    editor_frame.grid_rowconfigure(1, weight=1)

    # Toolbar
    toolbar = ctk.CTkFrame(editor_frame, fg_color=C("bg_elevated"), height=40)
    toolbar.grid(row=0, column=0, sticky="ew", padx=1, pady=(1, 0))

    ghost_button(toolbar, text="B", command=self._md_bold, width=32).pack(side="left", padx=2)
    ghost_button(toolbar, text="I", command=self._md_italic, width=32).pack(side="left", padx=2)
    ghost_button(toolbar, text="S", command=self._md_strikethrough, width=32).pack(side="left", padx=2)
    ghost_button(toolbar, text="Link", command=self._md_link).pack(side="left", padx=2)
    ghost_button(toolbar, text="Code", command=self._md_code).pack(side="left", padx=2)

    # Status
    self._save_status = ctk.CTkLabel(toolbar, text="Saved ✓",
                                       font=FONT_MICRO, text_color=C("fg_subtle"))
    self._save_status.pack(side="right", padx=SPACE_MD)

    # Editor
    self._editor = ctk.CTkTextbox(
        editor_frame, font=FONT_MONO, fg_color=C("bg"),
        text_color=C("fg"), corner_radius=0,
    )
    self._editor.grid(row=1, column=0, sticky="nsew")
    self._editor.bind("<<Modified>>", self._on_edit)

    # Load content
    claude_md_path = Path.home() / ".agent-box" / "profiles" / self._profile["name"] / "dot-claude" / "CLAUDE.md"
    if claude_md_path.exists():
        content = claude_md_path.read_text(encoding="utf-8")
        self._editor.insert("1.0", content)
        self._editor.edit_modified(False)

    self._claude_md_path = claude_md_path
    self._save_job = None

def _on_edit(self, event=None):
    """Handle editor changes with debounce."""
    if self._save_job:
        self.root.after_cancel(self._save_job)
    self._save_status.configure(text="Saving…", text_color=C("warning"))
    self._save_job = self.root.after(1000, self._save_claude_md)

def _save_claude_md(self):
    """Save CLAUDE.md content."""
    try:
        content = self._editor.get("1.0", "end-1c")
        self._claude_md_path.write_text(content, encoding="utf-8")
        self._save_status.configure(text="Saved ✓", text_color=C("success"))
    except Exception as e:
        self._save_status.configure(text=f"Error: {e}", text_color=C("error"))
```

---

## task-4.4-detail-page-other-tabs

### 目标

实现 MCP/Skills/Hooks/Storage Tab（P0 只读 placeholder）。

### 实现

```python
def _build_mcp_tab(self):
    """Build MCP tab (read-only placeholder)."""
    self._build_placeholder_tab(
        "MCP",
        "MCP management is coming in a future release.",
        "For now, edit mcp.json directly:",
        self._get_mcp_path(),
    )

def _build_skills_tab(self):
    """Build Skills tab (read-only list)."""
    self._build_placeholder_tab(
        "Skills",
        "Skills management is coming in a future release.",
        "Current skills are managed via the CLI.",
    )

def _build_hooks_tab(self):
    """Build Hooks tab (read-only list)."""
    self._build_placeholder_tab(
        "Hooks",
        "Hooks management is coming in a future release.",
        "Current hooks are managed via the CLI.",
    )

def _build_storage_tab(self):
    """Build Storage tab with directory info."""
    storage_card = Card(self._content)
    storage_card.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_LG))

    profile_dir = Path.home() / ".agent-box" / "profiles" / self._profile["name"]

    # Directory size
    total_size = sum(f.stat().st_size for f in profile_dir.rglob("*") if f.is_file())
    size_mb = total_size / (1024 * 1024)

    ctk.CTkLabel(storage_card, text="Storage", font=FONT_SUBTITLE,
                 text_color=C("fg")).grid(row=0, column=0, padx=SPACE_LG, pady=(SPACE_LG, SPACE_SM))

    ctk.CTkLabel(storage_card, text=f"Total size: {size_mb:.2f} MB",
                 font=FONT_BODY, text_color=C("fg")).grid(row=1, column=0, padx=SPACE_LG, pady=SPACE_SM)

    ctk.CTkLabel(storage_card, text=f"Location: {profile_dir}",
                 font=FONT_MONO_SMALL, text_color=C("fg_muted")).grid(row=2, column=0, padx=SPACE_LG, pady=SPACE_SM)

    ghost_button(storage_card, text="📂 Open Folder",
                 command=lambda: os.startfile(str(profile_dir))).grid(row=3, column=0, padx=SPACE_LG, pady=(SPACE_SM, SPACE_LG))

def _build_placeholder_tab(self, title, message, detail, path=None):
    """Build a placeholder tab."""
    card = Card(self._content)
    card.grid(row=0, column=0, sticky="ew", pady=(0, SPACE_LG))

    ctk.CTkLabel(card, text=title, font=FONT_SUBTITLE,
                 text_color=C("fg")).grid(row=0, column=0, padx=SPACE_LG, pady=(SPACE_LG, SPACE_SM))

    ctk.CTkLabel(card, text=message, font=FONT_BODY,
                 text_color=C("fg_muted")).grid(row=1, column=0, padx=SPACE_LG, pady=SPACE_SM)

    ctk.CTkLabel(card, text=detail, font=FONT_BODY,
                 text_color=C("fg_muted")).grid(row=2, column=0, padx=SPACE_LG, pady=SPACE_SM)

    if path:
        path_frame = ctk.CTkFrame(card, fg_color="transparent")
        path_frame.grid(row=3, column=0, sticky="ew", padx=SPACE_LG, pady=SPACE_SM)
        path_frame.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(path_frame, text=path, font=FONT_MONO_SMALL,
                     text_color=C("fg_subtle")).grid(row=0, column=0, sticky="w")

        ghost_button(path_frame, text="📋 Copy",
                     command=lambda: self._copy_to_clipboard(path)).grid(row=0, column=1)
```

---

## task-4.5-creation-wizard

### 目标

实现 4 步 Profile 创建向导。

### 设计方案

```
Step 1/4: Choose Agent Type
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   CC     │  │  Codex   │  │  Hermes  │  │ OpenCode │   │
│  │ Claude   │  │  OpenAI  │  │  Custom  │  │  Multi   │   │
│  │  Code    │  │          │  │          │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│                                          [Next →]           │
└─────────────────────────────────────────────────────────────┘
```

### 输出

`gui/pages/wizard.py` — ProfileCreationWizard

### 实现

```python
"""Profile creation wizard — 4 steps."""
from __future__ import annotations
import customtkinter as ctk
from gui.theme import C
from gui.tokens import *
from gui.components.button import primary_button, ghost_button
from gui.components.card import Card


class ProfileCreationWizard(ctk.CTkFrame):
    """4-step profile creation wizard."""

    STEPS = ["Agent Type", "Basic Info", "Provider", "CLAUDE.md Template"]

    AGENT_TYPES = [
        ("cc", "Claude Code", "Anthropic's coding agent"),
        ("codex", "Codex", "OpenAI's coding agent"),
        ("hermes", "Hermes", "Custom agent framework"),
        ("opencode", "OpenCode", "Multi-model agent"),
    ]

    PROVIDERS = [
        ("anthropic", "Anthropic", "Direct Claude API"),
        ("bedrock", "AWS Bedrock", "Enterprise IAM"),
        ("vertex", "Google Vertex", "GCP integration"),
    ]

    TEMPLATES = [
        ("blank", "Blank", "Start from scratch"),
        ("dw", "Decision Writer", "Multi-step decision orchestration"),
        ("spec", "Spec Writer", "Technical specification author"),
    ]

    def __init__(self, master, on_complete, on_cancel):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._on_complete = on_complete
        self._on_cancel = on_cancel

        self._current_step = 0
        self._data = {
            "agent_type": None,
            "name": "",
            "display_name": "",
            "provider": "anthropic",
            "template": "blank",
        }

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # Progress bar
        self._build_progress()

        # Content area
        self._content = ctk.CTkFrame(self, fg_color=C("bg"), corner_radius=0)
        self._content.grid(row=1, column=0, sticky="nsew", padx=SPACE_2XL, pady=(0, SPACE_2XL))
        self._content.grid_columnconfigure(0, weight=1)
        self._content.grid_rowconfigure(0, weight=1)

        # Navigation buttons
        self._build_navigation()

        # Show first step
        self._show_step(0)

    def _build_progress(self):
        """Build progress indicator."""
        progress_frame = ctk.CTkFrame(self, fg_color="transparent")
        progress_frame.grid(row=0, column=0, sticky="ew", padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_LG))
        progress_frame.grid_columnconfigure(1, weight=1)

        self._step_label = ctk.CTkLabel(
            progress_frame, text=f"Step 1/{len(self.STEPS)}: {self.STEPS[0]}",
            font=FONT_SUBTITLE, text_color=C("fg"),
        )
        self._step_label.grid(row=0, column=0, sticky="w")

        # Progress dots
        dots_frame = ctk.CTkFrame(progress_frame, fg_color="transparent")
        dots_frame.grid(row=0, column=1, padx=SPACE_LG)

        self._dots = []
        for i in range(len(self.STEPS)):
            dot = ctk.CTkFrame(dots_frame, fg_color=C("border"),
                                width=12, height=12, corner_radius=RADIUS_FULL)
            dot.grid(row=0, column=i, padx=SPACE_XS)
            self._dots.append(dot)

    def _build_navigation(self):
        """Build navigation buttons."""
        nav_frame = ctk.CTkFrame(self, fg_color="transparent")
        nav_frame.grid(row=2, column=0, sticky="ew", padx=SPACE_2XL, pady=(0, SPACE_2XL))
        nav_frame.grid_columnconfigure(1, weight=1)

        self._back_btn = ghost_button(nav_frame, text="← Back", command=self._prev_step)
        self._back_btn.grid(row=0, column=0, sticky="w")

        self._next_btn = primary_button(nav_frame, text="Next →", command=self._next_step)
        self._next_btn.grid(row=0, column=2, sticky="e")

    def _show_step(self, step: int):
        """Show the specified step."""
        self._current_step = step

        # Update progress
        self._step_label.configure(text=f"Step {step+1}/{len(self.STEPS)}: {self.STEPS[step]}")
        for i, dot in enumerate(self._dots):
            if i <= step:
                dot.configure(fg_color=C("primary"))
            else:
                dot.configure(fg_color=C("border"))

        # Update navigation
        self._back_btn.configure(state="normal" if step > 0 else "disabled")
        if step == len(self.STEPS) - 1:
            self._next_btn.configure(text="Create Profile")
        else:
            self._next_btn.configure(text="Next →")

        # Clear content
        for w in self._content.winfo_children():
            w.destroy()

        # Build step content
        if step == 0:
            self._build_step_agent_type()
        elif step == 1:
            self._build_step_basic_info()
        elif step == 2:
            self._build_step_provider()
        elif step == 3:
            self._build_step_template()

    def _build_step_agent_type(self):
        """Build Step 1: Choose agent type."""
        ctk.CTkLabel(self._content, text="Choose Agent Type",
                     font=FONT_TITLE, text_color=C("fg")).grid(row=0, column=0, pady=(0, SPACE_LG))

        cards_frame = ctk.CTkFrame(self._content, fg_color="transparent")
        cards_frame.grid(row=1, column=0)

        for i, (key, name, desc) in enumerate(self.AGENT_TYPES):
            card = Card(cards_frame, width=180, height=120, cursor="hand2")
            card.grid(row=0, column=i, padx=SPACE_SM)
            card.grid_propagate(False)

            ctk.CTkLabel(card, text=name, font=FONT_SUBTITLE,
                         text_color=C("fg")).pack(pady=(SPACE_LG, SPACE_XS))
            ctk.CTkLabel(card, text=desc, font=FONT_CAPTION,
                         text_color=C("fg_muted")).pack()

            card.bind("<Button-1>", lambda e, k=key: self._select_agent_type(k))

    def _next_step(self):
        """Go to next step."""
        if self._current_step == len(self.STEPS) - 1:
            self._create_profile()
        else:
            self._show_step(self._current_step + 1)

    def _prev_step(self):
        """Go to previous step."""
        if self._current_step > 0:
            self._show_step(self._current_step - 1)

    def _create_profile(self):
        """Create the profile."""
        # 调用 agent-box CLI 创建 profile
        # ...
        self._on_complete(self._data)
```

---

## task-4.6-provider-selector

### 目标

实现 Provider 切换组件。

### 实现

```python
class ProviderSelector(ctk.CTkFrame):
    """Provider selection cards."""

    PROVIDERS = [
        ("anthropic", "Anthropic", "Direct Claude API", "🔵"),
        ("bedrock", "AWS Bedrock", "Enterprise IAM", "🟠"),
        ("vertex", "Google Vertex", "GCP integration", "🟢"),
    ]

    def __init__(self, master, current: str = "anthropic", on_change=None):
        super().__init__(master, fg_color="transparent")
        self._on_change = on_change
        self._selected = current
        self._cards = {}

        for i, (key, name, desc, icon) in enumerate(self.PROVIDERS):
            card = Card(self, cursor="hand2")
            card.grid(row=0, column=i, padx=SPACE_SM, sticky="ew")
            self.grid_columnconfigure(i, weight=1)

            ctk.CTkLabel(card, text=icon, font=FONT_ICON_LG).pack(pady=(SPACE_LG, SPACE_XS))
            ctk.CTkLabel(card, text=name, font=FONT_SUBTITLE, text_color=C("fg")).pack()
            ctk.CTkLabel(card, text=desc, font=FONT_CAPTION, text_color=C("fg_muted")).pack(pady=(0, SPACE_LG))

            card.bind("<Button-1>", lambda e, k=key: self._select(k))
            self._cards[key] = card

        self._update_selection()

    def _select(self, key: str):
        self._selected = key
        self._update_selection()
        if self._on_change:
            self._on_change(key)

    def _update_selection(self):
        for key, card in self._cards.items():
            if key == self._selected:
                card.configure(border_color=C("primary"), border_width=2)
            else:
                card.configure(border_color=C("border"), border_width=1)
```
