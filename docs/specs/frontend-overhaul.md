# agent-box 前端全面改造方案

> 日期：2026-06-20
> 状态：方案待确认
> 作者：frontend-designer agent

---

## 0. 诊断总结

### 当前状态：骨架已搭，血肉未生

`gui-redesign.py` 完成了 Stage A（视觉重做），设计 token 系统是扎实的，但存在 **5 个核心问题**：

| #   | 问题                | 严重度 | 影响                            |
| --- | ------------------- | ------ | ------------------------------- |
| 1   | **1555 行单文件**   | 🔴 高  | 无法维护、无法测试、无法协作    |
| 2   | **4/8 P0 功能缺失** | 🔴 高  | 核心价值（profile 详情）未实现  |
| 3   | **交互体验粗糙**    | 🟡 中  | 每次导航重建全部 UI、闪烁、阻塞 |
| 4   | **组件复用为零**    | 🟡 中  | 按钮/卡片/行模式重复 N 遍       |
| 5   | **视觉缺乏灵魂**    | 🟡 中  | token 齐全但没有"设计师的手"    |

### 什么是好的

- ✅ 设计 token 系统（色彩、间距、圆角、字号）完整且一致
- ✅ Slate Indigo 配色方案成熟、专业
- ✅ 侧边栏 + 内容区的基础布局正确
- ✅ StatusPill、Badge、Toast 组件思路正确
- ✅ 深色/浅色主题切换已实现
- ✅ WSL 集成逻辑（路径转换、launch 流程）稳固

---

## 1. 架构改造：单文件 → 模块化

### 目标结构

```
gui/
├── __init__.py
├── app.py              # AgentBoxApp 主类 + 入口
├── theme.py            # Theme 类 + 所有设计 token
├── tokens.py           # 非色彩 token（字号、间距、圆角）
├── components/
│   ├── __init__.py
│   ├── button.py       # primary_button(), ghost_button(), danger_button()
│   ├── card.py         # Card, StatCard
│   ├── status.py       # StatusPill, Badge
│   ├── toast.py        # ToastManager
│   ├── divider.py      # Divider
│   ├── input.py        # LabeledEntry, LabeledOptionMenu
│   ├── sidebar.py      # Sidebar
│   └── markdown.py     # MarkdownEditor (Stage B)
├── pages/
│   ├── __init__.py
│   ├── home.py         # HomePage
│   ├── profiles.py     # ProfilesPage + ProfileRow
│   ├── detail.py       # ProfileDetailPage (Stage B)
│   ├── sessions.py     # SessionsPage
│   ├── settings.py     # SettingsPage
│   └── help.py         # HelpPage
├── state.py            # SQLite 操作 + session 管理
└── wsl.py              # WSL 集成（fetch_profiles, launch, path conversion）
```

### 迁移策略

1. **先提取无依赖模块** — `theme.py`、`tokens.py`、`state.py`、`wsl.py`
2. **再提取组件** — `components/` 下各文件
3. **最后提取页面** — `pages/` 下各文件
4. **每步运行测试** — 确保不破坏现有功能

---

## 2. 视觉改造：从"能用"到"想用"

### 2.1 问题诊断

当前 UI 的视觉问题：

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Agent Box                                                 │
│                                                              │
│ NAVIGATE                                                     │
│ ▎🏠 Home        ← 问题：emoji 图标在 Windows 上渲染不一致    │
│ ▎📁 Profiles                                                 │
│ ▎📊 Sessions    ← 问题：active 状态不够醒目                  │
│ ▎⚙ Settings                                                 │
│ ▎❓ Help                                                     │
│                                                              │
│ ● 0 running  ·  WSL healthy                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Profiles                                [+ New profile]      │
│                                                              │
│ [All 12] [CC 5] [Codex 2] [Hermes 1] [OpenCode 4]           │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ●  DW                         ▶  ⋯                      │ │
│ │    cc · active                                           │ │
│ │    cwd [~/projects/dw        ] [📁] [继续上次 ▾]         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ○  spec                       ▶  ⋯                      │ │
│ │    codex · idle                                          │ │
│ │    cwd [~/projects/spec      ] [📁] [继续上次 ▾]         │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**具体问题：**

1. **Profile 行太扁平** — 没有视觉层次，所有信息挤在一起
2. **操作按钮不直观** — ▶ 和 ⋯ 没有文字说明，新用户不知道点什么
3. **CWD 输入框暴露** — 每行都显示 cwd 输入框，视觉噪音大
4. **Tab 样式弱** — agent type tab 没有底部指示条，选中态不明显
5. **空状态太简陋** — "No profiles yet" 没有视觉引导
6. **状态指示不够** — StatusPill 太小，running 状态不够醒目

### 2.2 改造方案

#### Profile 行重新设计

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

**改动点：**

- StatusPill 放大，running 时带脉动动画
- 标题行变大，加 agent type 徽章
- CWD 默认折叠，只显示路径文本，hover 时出现编辑按钮
- Launch 按钮变宽，加文字 "Launch"
- "⋯" 改为 "Edit ⋯"，明确语义
- 加运行时长显示（从 sessions.db 获取）

#### Tab 样式改造

**Before:**

```
[All 12] [CC 5] [Codex 2] [Hermes 1] [OpenCode 4]
```

**After:**

```
All (12)    CC (5)    Codex (2)    Hermes (1)    OpenCode (4)
──────────
```

**改动点：**

- 选中态加底部 3px 强调条（primary 色）
- 计数用括号而非空格分隔
- Tab 间距加大，hover 态更明显

#### 空状态改造

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

**改动点：**

- 居中卡片式布局
- 大图标 + 引导文案 + 明确 CTA 按钮
- 背景用 `bg_elevated` 色，带圆角和边框

---

## 3. 交互改造：从"能点"到"好用"

### 3.1 导航闪烁问题

**问题：** `_show_page()` 每次销毁重建所有子组件，导致页面切换闪烁。

**方案：** 页面缓存 + 显示/隐藏切换

```python
class AgentBoxApp:
    def __init__(self):
        self._pages: Dict[str, ctk.CTkFrame] = {}

    def _show_page(self, key: str) -> None:
        # 隐藏当前页面
        if self._current_page and self._current_page in self._pages:
            self._pages[self._current_page].grid_forget()

        # 创建或显示目标页面
        if key not in self._pages:
            self._pages[key] = self._create_page(key)

        self._pages[key].grid(row=0, column=0, sticky="nsew")
        self._current_page = key
        self.sidebar.set_active(key)
```

### 3.2 Profile 列表闪烁问题

**问题：** `_rebuild_list()` 每次 tab 切换销毁重建所有 ProfileRow。

**方案：** 增量更新 + 虚拟化

```python
class ProfilesPage:
    def _rebuild_list(self) -> None:
        visible = self._get_visible_profiles()

        # 隐藏不可见的行
        for row in self._rows.values():
            row.grid_forget()

        # 显示可见的行
        for i, p in enumerate(visible):
            name = p["name"]
            if name not in self._rows:
                self._rows[name] = ProfileRow(self.list_holder, p, ...)
            self._rows[name].grid(row=i, column=0, sticky="ew", pady=(0, 8))
```

### 3.3 阻塞式刷新

**问题：** `refresh()` 同步调用 `fetch_profiles()`，阻塞 UI。

**方案：** 异步刷新 + 加载状态

```python
def refresh(self) -> None:
    self._show_loading(True)
    threading.Thread(target=self._fetch_profiles_async, daemon=True).start()

def _fetch_profiles_async(self) -> None:
    try:
        profiles = fetch_profiles()
        self.root.after(0, lambda: self._on_profiles_loaded(profiles))
    except RuntimeError as exc:
        self.root.after(0, lambda: self._on_profiles_error(exc))

def _on_profiles_loaded(self, profiles):
    self._profiles = profiles
    self._show_loading(False)
    self._refresh_current_page()
```

### 3.4 SQLite 线程安全

**问题：** 每次操作创建新连接，后台线程写、主线程读。

**方案：** 单例连接 + 锁

```python
import threading

class SessionDB:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._conn = sqlite3.connect(
                    str(DB_PATH), check_same_thread=False
                )
                cls._instance._conn.execute("PRAGMA journal_mode=WAL")
            return cls._instance

    def execute(self, sql, params=()):
        with self._lock:
            return self._conn.execute(sql, params)
```

---

## 4. 组件库改造：从"重复"到"复用"

### 4.1 按钮组件

```python
def primary_button(master, text, command, **kwargs):
    """标准主操作按钮"""
    return ctk.CTkButton(
        master, text=text, command=command,
        height=BUTTON_HEIGHT, corner_radius=RADIUS_MD,
        fg_color=C("primary"), hover_color=C("primary_hover"),
        text_color=C("primary_fg"), font=FONT_BOLD,
        **kwargs,
    )

def ghost_button(master, text, command, **kwargs):
    """次要操作按钮（透明背景）"""
    return ctk.CTkButton(
        master, text=text, command=command,
        height=BUTTON_HEIGHT, corner_radius=RADIUS_MD,
        fg_color="transparent", hover_color=C("bg_hover"),
        text_color=C("fg_muted"), font=FONT_BODY,
        **kwargs,
    )

def danger_button(master, text, command, **kwargs):
    """危险操作按钮（红色）"""
    return ctk.CTkButton(
        master, text=text, command=command,
        height=BUTTON_HEIGHT, corner_radius=RADIUS_MD,
        fg_color=C("error"), hover_color="#C0505A",
        text_color="#FFFFFF", font=FONT_BOLD,
        **kwargs,
    )
```

### 4.2 卡片组件

```python
class Card(ctk.CTkFrame):
    """通用卡片容器"""
    def __init__(self, master, **kwargs):
        super().__init__(
            master,
            fg_color=C("bg_elevated"),
            corner_radius=RADIUS_LG,
            border_width=1,
            border_color=C("border"),
            **kwargs,
        )

    def set_hover(self, hover: bool):
        if hover:
            self.configure(fg_color=C("bg_hover"), border_color=C("border_strong"))
        else:
            self.configure(fg_color=C("bg_elevated"), border_color=C("border"))

class StatCard(Card):
    """统计数字卡片"""
    def __init__(self, master, icon, value, label, **kwargs):
        super().__init__(master, **kwargs)
        # icon
        ctk.CTkLabel(self, text=icon, font=FONT_ICON_LG,
                     text_color=C("fg_muted")).grid(row=0, column=0, rowspan=2,
                                                     padx=SPACE_LG, pady=SPACE_LG)
        # value
        ctk.CTkLabel(self, text=str(value), font=FONT_BIG,
                     text_color=C("fg")).grid(row=0, column=1, sticky="sw",
                                               padx=(0, SPACE_LG), pady=(SPACE_LG, 0))
        # label
        ctk.CTkLabel(self, text=label, font=FONT_CAPTION,
                     text_color=C("fg_muted")).grid(row=1, column=1, sticky="nw",
                                                     padx=(0, SPACE_LG), pady=(0, SPACE_LG))
```

### 4.3 输入组件

```python
class LabeledEntry(ctk.CTkFrame):
    """带标签的输入框"""
    def __init__(self, master, label, placeholder="", variable=None, **kwargs):
        super().__init__(master, fg_color="transparent")
        self.grid_columnconfigure(1, weight=1)

        lbl = ctk.CTkLabel(self, text=label, font=FONT_CAPTION,
                           text_color=C("fg_muted"), width=80, anchor="w")
        lbl.grid(row=0, column=0, padx=(0, SPACE_SM), sticky="w")

        self.entry = ctk.CTkEntry(
            self, placeholder_text=placeholder,
            textvariable=variable, font=FONT_MONO_SMALL, height=INPUT_HEIGHT,
            fg_color=C("bg"), border_color=C("border"), border_width=1,
            corner_radius=RADIUS_MD,
        )
        self.entry.grid(row=0, column=1, sticky="ew")

    def get(self):
        return self.entry.get()
```

---

## 5. 功能补全：P0 剩余 4 项

### 5.1 Profile 详情页（P0-4）— 最高优先级

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
│  Provider      Anthropic                                     │
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

**Meta Tab 实现要点：**

- 只读字段用 Label，可编辑字段用 Entry
- Provider 用 OptionMenu（预设列表）
- Quick Actions 用 Ghost Button 行
- 时间戳格式化为相对时间（"2 hours ago"）

**Settings Tab 实现要点：**

- 读取 `settings.json`，可视化展示
- env 块用 Key-Value 表格
- permissions 用 Checkbox 列表
- JSON 编辑器 fallback（高级用户）

**CLAUDE.md Tab 实现要点：**

- 内置文本编辑器（CTkTextbox）
- 工具栏：Bold / Italic / Code / Link
- 实时保存（debounce 1s）
- 状态指示：Saving… / Saved ✓ / Error

**MCP / Skills / Hooks Tab 实现要点：**

- P0 只读 placeholder
- 显示文件路径 + 复制按钮
- "Coming in P1" 提示

**Storage Tab 实现要点：**

- 目录大小显示
- 文件列表（CTkTreeView 或简化为 Label 列表）
- 打开文件夹按钮

### 5.2 Profile 创建向导（P0-5）

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

Step 2/4: Basic Info
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  Name*         [dw____________]                              │
│                ✅ Available                                   │
│                                                              │
│  Display Name  [Decision Writer____]                         │
│                                                              │
│  Description   [Multi-step decision orchestration agent___]  │
│                                                              │
│                              [← Back]  [Next →]              │
└─────────────────────────────────────────────────────────────┘

Step 3/4: Choose Provider
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ● Anthropic (default)                                  │ │
│  │   Claude API, direct access                            │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ○ AWS Bedrock                                          │ │
│  │   Enterprise, IAM-based access                         │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ○ Google Vertex                                        │ │
│  │   GCP integration                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│                              [← Back]  [Next →]              │
└─────────────────────────────────────────────────────────────┘

Step 4/4: CLAUDE.md Template
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ● Blank                                                │ │
│  │   Start from scratch                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ○ Decision Writer                                      │ │
│  │   Multi-step decision orchestration                    │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ○ Spec Writer                                          │ │
│  │   Technical specification author                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│                              [← Back]  [Create Profile]      │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Provider 切换（P0-6）

在 Profile 详情页的 Meta Tab 中实现：

```python
class ProviderSelector(ctk.CTkFrame):
    PROVIDERS = [
        ("anthropic", "Anthropic", "Direct Claude API"),
        ("bedrock", "AWS Bedrock", "Enterprise IAM"),
        ("vertex", "Google Vertex", "GCP integration"),
    ]

    def __init__(self, master, current="anthropic", on_change=None):
        super().__init__(master, fg_color="transparent")
        # ... 实现卡片式选择器
```

### 5.4 CLAUDE.md 编辑器（P0-7）

```python
class MarkdownEditor(ctk.CTkFrame):
    def __init__(self, master, file_path, **kwargs):
        super().__init__(master, fg_color=C("bg"), **kwargs)
        self._file_path = Path(file_path)
        self._save_job = None

        # Toolbar
        toolbar = ctk.CTkFrame(self, fg_color=C("bg_elevated"), height=40)
        toolbar.pack(fill="x", padx=1, pady=(1, 0))

        ghost_button(toolbar, "B", self._bold).pack(side="left", padx=2)
        ghost_button(toolbar, "I", self._italic).pack(side="left", padx=2)
        ghost_button(toolbar, "Code", self._code).pack(side="left", padx=2)
        ghost_button(toolbar, "Link", self._link).pack(side="left", padx=2)

        # Status
        self._status = ctk.CTkLabel(toolbar, text="Saved ✓",
                                     font=FONT_MICRO, text_color=C("fg_subtle"))
        self._status.pack(side="right", padx=SPACE_MD)

        # Editor
        self._editor = ctk.CTkTextbox(self, font=FONT_MONO, fg_color=C("bg"),
                                       text_color=C("fg"), corner_radius=0)
        self._editor.pack(fill="both", expand=True)
        self._editor.bind("<<Modified>>", self._on_edit)

        # Load content
        self._load()
```

---

## 6. 视觉细节打磨

### 6.1 侧边栏改造

**Before:** Emoji 图标 + 纯文字
**After:** Unicode 图标 + 更精致的样式

```python
NAV_ITEMS = [
    ("home",     "Home",     "⌂"),      # 或用 ▸ ◈ ▣ 等
    ("profiles", "Profiles", "◉"),
    ("sessions", "Sessions", "◈"),
    ("settings", "Settings", "⚙"),
    ("help",     "Help",     "?"),
]
```

**改动点：**

- Brand 区域加版本号
- 导航项 hover 态更平滑
- Active 项加左侧 3px 强调条（已有，保持）
- 底部状态区域加分隔线

### 6.2 状态栏改造

**Before:** 纯文字 "Loaded 12 profile(s)."
**After:** 结构化信息

```
✓ 12 profiles loaded  ·  ● 3 running  ·  WSL Ubuntu  ·  v0.1.0
```

### 6.3 Home 页改造

**Before:** 3 个 stat 卡片 + 简陋的快速启动
**After:** 更丰富的仪表盘

```
┌─────────────────────────────────────────────────────────────┐
│  Good evening 👋                                             │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  ● 3     │  │  📁 12   │  │  ✓ WSL   │                  │
│  │ Running  │  │ Profiles │  │ Healthy  │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                                                              │
│  Quick Launch                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ▶ DW (cc)          ~/projects/dw         2h ago        │ │
│  │ ▶ spec (codex)     ~/projects/spec       5h ago        │ │
│  │ ▶ decision (cc)    ~/projects/decision   yesterday     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Agent Distribution                                          │
│  CC      ████████████████████  5                            │
│  Codex   ████████              2                            │
│  Hermes  ████                  1                            │
│  OpenCode████████████████      4                            │
│                                                              │
│  Recent Activity                                             │
│  ● DW launched (resume)           14:32  ·  2h 13m          │
│  ○ spec exited (success)          11:08  ·  31m             │
│  ● decision launched (new)        09:15  ·  running         │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 色彩微调

当前 Slate Indigo 配色整体良好，但需要微调：

| Token                | 当前值    | 建议值    | 原因                       |
| -------------------- | --------- | --------- | -------------------------- |
| `primary` (dark)     | `#7B6CF6` | `#818CF8` | 稍亮，提升 dark 模式可见度 |
| `bg_elevated` (dark) | `#1A1E25` | `#1E2228` | 与 bg 对比度不够，稍亮一点 |
| `border` (dark)      | `#2A2F38` | `#2E3340` | 边框太弱，稍微加强         |
| `success`            | `#7FB069` | `#4ADE80` | 绿色太暗，用更现代的绿     |
| `error`              | `#E06C75` | `#F87171` | 红色偏灰，用更鲜明的红     |

### 6.5 动效添加

```python
# 状态变化时的渐变
def animate_color(widget, attr, from_color, to_color, duration=200):
    """颜色渐变动画"""
    steps = 10
    delay = duration // steps

    r1, g1, b1 = hex_to_rgb(from_color)
    r2, g2, b2 = hex_to_rgb(to_color)

    for i in range(steps + 1):
        t = i / steps
        r = int(r1 + (r2 - r1) * t)
        g = int(g1 + (g2 - g1) * t)
        b = int(b1 + (b2 - b1) * t)
        color = rgb_to_hex(r, g, b)
        widget.after(i * delay, lambda c=color: widget.configure(**{attr: c}))
```

---

## 7. 实施计划

### Phase 1: 架构重构（2-3 天）

| 任务                          | 优先级 | 天数 |
| ----------------------------- | ------ | ---- |
| 提取 `theme.py` + `tokens.py` | P0     | 0.5  |
| 提取 `wsl.py` + `state.py`    | P0     | 0.5  |
| 提取 `components/`            | P0     | 1    |
| 提取 `pages/`                 | P0     | 1    |
| 测试 + 修复                   | P0     | 0.5  |

### Phase 2: 视觉打磨（2-3 天）

| 任务             | 优先级 | 天数 |
| ---------------- | ------ | ---- |
| 按钮组件化       | P0     | 0.5  |
| 卡片组件化       | P0     | 0.5  |
| Profile 行重设计 | P0     | 1    |
| Tab 样式改造     | P0     | 0.5  |
| 空状态改造       | P1     | 0.5  |
| 色彩微调         | P1     | 0.5  |

### Phase 3: 交互优化（2-3 天）

| 任务                 | 优先级 | 天数 |
| -------------------- | ------ | ---- |
| 页面缓存（消除闪烁） | P0     | 1    |
| 异步刷新             | P0     | 0.5  |
| SQLite 线程安全      | P0     | 0.5  |
| Profile 列表增量更新 | P1     | 1    |

### Phase 4: 功能补全（5-7 天）

| 任务                         | 优先级 | 天数 |
| ---------------------------- | ------ | ---- |
| Profile 详情页 Meta Tab      | P0     | 1    |
| Profile 详情页 Settings Tab  | P0     | 1    |
| Profile 详情页 CLAUDE.md Tab | P0     | 1.5  |
| Profile 详情页其他 Tab       | P0     | 1    |
| Profile 创建向导             | P0     | 2    |
| Provider 切换                | P0     | 0.5  |

### 总计：11-16 天

与原 spec 估算一致，但产出质量显著提升。

---

## 8. 成功标准

| 指标           | 目标                         |
| -------------- | ---------------------------- |
| 单文件行数     | < 200 行（拆分后每个模块）   |
| 页面切换延迟   | < 50ms（无闪烁）             |
| Profile 详情页 | 7 tab 全部可用               |
| 创建向导       | 4 步完成，实时校验           |
| 组件复用率     | > 80%（按钮/卡片/输入框）    |
| 视觉一致性     | 所有颜色来自 token，无硬编码 |

---

## 9. 风险与缓解

| 风险                 | 等级 | 缓解                           |
| -------------------- | ---- | ------------------------------ |
| 模块化后 import 复杂 | 中   | 保持扁平结构，避免深层嵌套     |
| CustomTkinter 限制   | 中   | 关键组件准备 PySide6 fallback  |
| 页面缓存内存占用     | 低   | 最多缓存 5 个页面，可 LRU 淘汰 |
| 异步刷新竞态         | 低   | 用 `root.after()` 回到主线程   |
