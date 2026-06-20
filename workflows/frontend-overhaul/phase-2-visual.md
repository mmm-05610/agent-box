# Phase 2: 视觉打磨

> 目标：组件化 + 样式改造

---

## task-2.1-button-components

### 目标

创建可复用的按钮组件，消除重复的 `ctk.CTkButton(...)` 调用。

### 输出

`gui/components/button.py`

### 实现

```python
"""Button components — primary, ghost, danger."""
from __future__ import annotations
import customtkinter as ctk
from gui.theme import C
from gui.tokens import *


def primary_button(master, text: str, command=None, **kwargs) -> ctk.CTkButton:
    """标准主操作按钮（紫色背景）"""
    return ctk.CTkButton(
        master, text=text, command=command,
        height=kwargs.pop("height", BUTTON_HEIGHT),
        corner_radius=kwargs.pop("corner_radius", RADIUS_MD),
        fg_color=kwargs.pop("fg_color", C("primary")),
        hover_color=kwargs.pop("hover_color", C("primary_hover")),
        text_color=kwargs.pop("text_color", C("primary_fg")),
        font=kwargs.pop("font", FONT_BOLD),
        **kwargs,
    )


def ghost_button(master, text: str, command=None, **kwargs) -> ctk.CTkButton:
    """次要操作按钮（透明背景）"""
    return ctk.CTkButton(
        master, text=text, command=command,
        height=kwargs.pop("height", BUTTON_HEIGHT),
        corner_radius=kwargs.pop("corner_radius", RADIUS_MD),
        fg_color=kwargs.pop("fg_color", "transparent"),
        hover_color=kwargs.pop("hover_color", C("bg_hover")),
        text_color=kwargs.pop("text_color", C("fg_muted")),
        font=kwargs.pop("font", FONT_BODY),
        **kwargs,
    )


def danger_button(master, text: str, command=None, **kwargs) -> ctk.CTkButton:
    """危险操作按钮（红色背景）"""
    return ctk.CTkButton(
        master, text=text, command=command,
        height=kwargs.pop("height", BUTTON_HEIGHT),
        corner_radius=kwargs.pop("corner_radius", RADIUS_MD),
        fg_color=kwargs.pop("fg_color", C("error")),
        hover_color=kwargs.pop("hover_color", "#C0505A"),
        text_color=kwargs.pop("text_color", "#FFFFFF"),
        font=kwargs.pop("font", FONT_BOLD),
        **kwargs,
    )


def icon_button(master, text: str, command=None, **kwargs) -> ctk.CTkButton:
    """图标按钮（方形，透明背景）"""
    return ctk.CTkButton(
        master, text=text, command=command,
        width=kwargs.pop("width", BUTTON_HEIGHT),
        height=kwargs.pop("height", BUTTON_HEIGHT),
        corner_radius=kwargs.pop("corner_radius", RADIUS_MD),
        fg_color=kwargs.pop("fg_color", "transparent"),
        hover_color=kwargs.pop("hover_color", C("bg_hover")),
        text_color=kwargs.pop("text_color", C("fg_muted")),
        font=kwargs.pop("font", FONT_BODY),
        **kwargs,
    )
```

### 迁移指南

将所有 `ctk.CTkButton(...)` 替换为对应的 helper：

- 主操作按钮 → `primary_button()`
- 次要操作 → `ghost_button()`
- 危险操作 → `danger_button()`
- 图标按钮 → `icon_button()`

---

## task-2.2-card-components

### 目标

创建通用卡片组件，消除重复的卡片样式代码。

### 输出

`gui/components/card.py`

### 实现

```python
"""Card components — Card, StatCard."""
from __future__ import annotations
import customtkinter as ctk
from gui.theme import C
from gui.tokens import *


class Card(ctk.CTkFrame):
    """通用卡片容器（圆角 + 边框 + hover 态）"""

    def __init__(self, master, **kwargs):
        super().__init__(
            master,
            fg_color=kwargs.pop("fg_color", C("bg_elevated")),
            corner_radius=kwargs.pop("corner_radius", RADIUS_LG),
            border_width=kwargs.pop("border_width", 1),
            border_color=kwargs.pop("border_color", C("border")),
            **kwargs,
        )

    def set_hover(self, hover: bool):
        if hover:
            self.configure(fg_color=C("bg_hover"), border_color=C("border_strong"))
        else:
            self.configure(fg_color=C("bg_elevated"), border_color=C("border"))


class StatCard(Card):
    """统计数字卡片（图标 + 数值 + 标签）"""

    def __init__(self, master, icon: str, value, label: str, **kwargs):
        super().__init__(master, **kwargs)
        self.grid_columnconfigure(1, weight=1)

        # 图标
        self._icon = ctk.CTkLabel(
            self, text=icon, font=FONT_ICON_LG, text_color=C("fg_muted"),
        )
        self._icon.grid(row=0, column=0, rowspan=2, padx=SPACE_LG, pady=SPACE_LG)

        # 数值
        self._value = ctk.CTkLabel(
            self, text=str(value), font=FONT_BIG, text_color=C("fg"),
        )
        self._value.grid(row=0, column=1, sticky="sw", padx=(0, SPACE_LG), pady=(SPACE_LG, 0))

        # 标签
        self._label = ctk.CTkLabel(
            self, text=label, font=FONT_CAPTION, text_color=C("fg_muted"),
        )
        self._label.grid(row=1, column=1, sticky="nw", padx=(0, SPACE_LG), pady=(0, SPACE_LG))

    def update_value(self, value):
        self._value.configure(text=str(value))


class ClickableCard(Card):
    """可点击的卡片（带 hover 效果）"""

    def __init__(self, master, command=None, **kwargs):
        super().__init__(master, **kwargs)
        self._command = command

        self.bind("<Enter>", lambda e: self.set_hover(True))
        self.bind("<Leave>", lambda e: self.set_hover(False))
        if command:
            self.bind("<Button-1>", lambda e: command())
```

---

## task-2.3-profile-row-redesign

### 目标

重新设计 Profile 行，提升视觉层次和信息密度。

### 设计方案

**Before:**

```
┌─────────────────────────────────────────────────────────┐
│ ●  DW                         ▶  ⋯                      │
│    cc · active                                           │
│    cwd [~/projects/dw        ] [📁] [继续上次 ▾]         │
└─────────────────────────────────────────────────────────┘
```

**After:**

```
┌─────────────────────────────────────────────────────────┐
│  ● DW                                            ▶ Launch│
│    Claude Code · Running · 2h 13m                        │
│    ~/projects/dw                              [Edit ⋯]   │
└─────────────────────────────────────────────────────────┘
```

### 实现要点

1. **StatusPill 放大** — 使用 `md` 尺寸，running 时显示时长
2. **标题行变大** — 使用 `FONT_SUBTITLE`，加 agent type 徽章
3. **CWD 折叠** — 默认只显示路径文本，hover 时出现编辑按钮
4. **Launch 按钮变宽** — 加文字 "Launch"，使用 `primary_button()`
5. **"⋯" 改为 "Edit ⋯"** — 明确语义

### 代码结构

```python
class ProfileRow(ctk.CTkFrame):
    def __init__(self, master, profile, active, on_action, toast, last_cwd=""):
        super().__init__(master, fg_color=C("bg_elevated"),
                         corner_radius=RADIUS_LG, border_width=1, border_color=C("border"))

        self.grid_columnconfigure(1, weight=1)

        # Row 0: Status + Title + Launch button
        self._status_pill = StatusPill(self, status="running" if active else "stopped", size="md")
        self._status_pill.grid(row=0, column=0, padx=(SPACE_LG, SPACE_SM),
                                pady=(SPACE_LG, 0), sticky="nw")

        title_frame = ctk.CTkFrame(self, fg_color="transparent")
        title_frame.grid(row=0, column=1, sticky="ew", padx=(SPACE_MD, SPACE_SM),
                          pady=(SPACE_LG, 0))

        self._title = ctk.CTkLabel(title_frame, text=profile["name"],
                                     font=FONT_SUBTITLE, text_color=C("fg"))
        self._title.pack(side="left")

        self._agent_badge = Badge(title_frame, text=profile.get("agent_type", ""),
                                   variant="primary")
        self._agent_badge.pack(side="left", padx=(SPACE_SM, 0))

        self._launch_btn = primary_button(self, text="▶ Launch", command=self._quick_launch)
        self._launch_btn.grid(row=0, column=2, padx=(SPACE_SM, SPACE_LG),
                               pady=(SPACE_LG, 0), sticky="ne")

        # Row 1: Status meta + Duration
        meta_text = f"{'Running' if active else 'Idle'}"
        if active:
            meta_text += " · 2h 13m"  # 从 sessions.db 计算
        self._meta = ctk.CTkLabel(self, text=meta_text, font=FONT_CAPTION,
                                    text_color=C("fg_muted"))
        self._meta.grid(row=1, column=1, sticky="ew", padx=(SPACE_MD, SPACE_SM),
                          pady=(SPACE_XS, 0))

        # Row 2: CWD + Edit button
        cwd_frame = ctk.CTkFrame(self, fg_color="transparent")
        cwd_frame.grid(row=2, column=1, sticky="ew", padx=(SPACE_MD, 0),
                         pady=(SPACE_SM, SPACE_LG))
        cwd_frame.grid_columnconfigure(0, weight=1)

        self._cwd_label = ctk.CTkLabel(cwd_frame, text=last_cwd or "~",
                                         font=FONT_MONO_SMALL, text_color=C("fg_subtle"))
        self._cwd_label.grid(row=0, column=0, sticky="w")

        self._edit_btn = ghost_button(cwd_frame, text="Edit ⋯", command=self._open_detail)
        self._edit_btn.grid(row=0, column=1, padx=(SPACE_SM, 0))
```

---

## task-2.4-tab-styling

### 目标

改造 agent type Tab 样式，添加底部指示条。

### 设计方案

**Before:**

```
[All 12] [CC 5] [Codex 2] [Hermes 1] [OpenCode 4]
```

**After:**

```
All (12)    CC (5)    Codex (2)    Hermes (1)    OpenCode (4)
──────────
```

### 实现要点

1. **选中态** — 底部 3px primary 色条 + 文字变 fg 色
2. **hover 态** — 文字变 fg_muted 色
3. **计数格式** — 用括号 `(5)` 而非空格
4. **间距加大** — Tab 之间 16px

### 实现

```python
class AgentTypeTabs(ctk.CTkFrame):
    """Horizontal agent-type tabs with bottom indicator."""

    def __init__(self, master, counts: dict, on_select):
        super().__init__(master, fg_color="transparent")
        self._on_select = on_select
        self._active = "all"
        self._buttons = {}
        self._indicators = {}

        tabs = [("all", "All", sum(counts.values()))] + [
            (at, at.upper(), counts.get(at, 0)) for at in AGENT_ORDER
        ]

        for i, (key, label, count) in enumerate(tabs):
            btn_frame = ctk.CTkFrame(self, fg_color="transparent")
            btn_frame.grid(row=0, column=i, padx=(0, SPACE_LG))

            btn = ctk.CTkButton(
                btn_frame, text=f"{label} ({count})", height=32,
                fg_color="transparent", text_color=C("fg_muted"),
                hover_color=C("bg_hover"), font=FONT_BOLD,
                command=lambda k=key: self._select(k),
            )
            btn.pack()

            indicator = ctk.CTkFrame(btn_frame, fg_color="transparent", height=3)
            indicator.pack(fill="x", pady=(4, 0))

            self._buttons[key] = btn
            self._indicators[key] = indicator

        self._select("all")

    def _select(self, key):
        self._active = key
        for k, btn in self._buttons.items():
            if k == key:
                btn.configure(text_color=C("fg"))
                self._indicators[k].configure(fg_color=C("primary"))
            else:
                btn.configure(text_color=C("fg_muted"))
                self._indicators[k].configure(fg_color="transparent")
        self._on_select(key)
```

---

## task-2.5-empty-state

### 目标

改造空状态，提供更好的视觉引导。

### 设计方案

**Before:**

```
No profiles yet.

Create one to get started.
```

**After:**

```
┌───────────────────────────────────────┐
│                                       │
│        📁                             │
│                                       │
│   No profiles yet                     │
│                                       │
│   Create your first agent profile     │
│   to get started.                     │
│                                       │
│        [+ Create Profile]             │
│                                       │
└───────────────────────────────────────┘
```

### 实现

```python
class EmptyState(ctk.CTkFrame):
    """Empty state with icon, message, and CTA."""

    def __init__(self, master, icon: str, title: str, message: str,
                 cta_text: str = None, cta_command=None):
        super().__init__(master, fg_color=C("bg_elevated"),
                         corner_radius=RADIUS_XL, border_width=1, border_color=C("border"))

        # Icon
        ctk.CTkLabel(self, text=icon, font=FONT_HUGE,
                     text_color=C("fg_muted")).pack(pady=(SPACE_3XL, SPACE_LG))

        # Title
        ctk.CTkLabel(self, text=title, font=FONT_TITLE,
                     text_color=C("fg")).pack(pady=(0, SPACE_SM))

        # Message
        ctk.CTkLabel(self, text=message, font=FONT_BODY,
                     text_color=C("fg_muted")).pack(pady=(0, SPACE_XL))

        # CTA Button
        if cta_text and cta_command:
            primary_button(self, text=cta_text, command=cta_command).pack(pady=(0, SPACE_3XL))
```

---

## task-2.6-color-tuning

### 目标

微调色彩 token，提升视觉质量。

### 调整项

| Token                | 当前值    | 建议值    | 原因                       |
| -------------------- | --------- | --------- | -------------------------- |
| `primary` (dark)     | `#7B6CF6` | `#818CF8` | 稍亮，提升 dark 模式可见度 |
| `bg_elevated` (dark) | `#1A1E25` | `#1E2228` | 与 bg 对比度不够           |
| `border` (dark)      | `#2A2F38` | `#2E3340` | 边框太弱                   |
| `success`            | `#7FB069` | `#4ADE80` | 绿色太暗                   |
| `error`              | `#E06C75` | `#F87171` | 红色偏灰                   |

### 实现

在 `gui/theme.py` 的 DARK 字典中更新这些值。
