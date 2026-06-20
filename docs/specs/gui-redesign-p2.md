# agent-box Windows GUI — Redesign Phase 2

> 阶段 2 交付：完整设计规范 + 组件库 + 视觉方案
>
> 日期：2026-06-20
> 状态：设计规范完成，待实施验证
> 关联：`docs/specs/gui-redesign-p1.md`（已确认的功能与 IA 决策）
>
> 技术栈：CustomTkinter（单 Python 文件 / 零额外依赖 / dark-light 主题开箱即用）

---

## 0. 设计原则

agent-box GUI 设计的 5 条原则（贯穿所有规范）：

1. **深 > 易** — power user 视角优先。复杂配置能精细操作，胜过"一键傻瓜化"
2. **隔离 > 共享** — 视觉上也强化"每个 profile 是独立黑盒"的认知（颜色、状态、边界都体现隔离）
3. **静 > 动** — 减少装饰性动画。功能导向，动效只服务信息传达（状态变化、过渡、加载）
4. **系统 > 自定义** — 优先系统字体 / 系统控件语义 / 系统主题感知。特殊值才自定义
5. **可读 > 漂亮** — 信息密度可以高，但永远不能让用户找不到信息。间距、对比度、字号优先

**设计参考**（主要灵感来源）：

- **VS Code** — 开发者工具信息密度、侧边栏导航、tab 多层切换
- **Linear** — 现代 dark 配色、干净 typography、卡片克制
- **Arc Browser** — 侧边栏、空间感、status pill
- **Docker Desktop** — 容器 lifecycle 状态指示、logs 内嵌
- **shadcn/ui**（cc-switch 用的）— 圆角、阴影、border 范式

---

## 1. 配色方案

### 1.1 设计原则

- **3 套 light/dark 配色** — 用户可切换
- **每套都包含**：primary（品牌色）、accent（强调）、background、foreground、border、surface、success / warning / error
- **风格统一**：developer tool 调性（低饱和度 + 高对比度文本）
- **WCAG AA 合规**：正文文本对比度 ≥ 4.5:1

### 1.2 配色 A：**Slate Indigo**（默认推荐）

> 主调：深 slate 灰 + 紫蓝 accent。Linear / VS Code 风格，最稳妥。

#### Dark mode

| Token              | Color             | Hex       | 用途                |
| ------------------ | ----------------- | --------- | ------------------- |
| `--bg`             | 深 slate          | `#0F1115` | 主背景              |
| `--bg-elevated`    | 微亮 slate        | `#181B22` | 卡片 / 面板         |
| `--bg-hover`       | hover slate       | `#22262E` | 列表项 hover        |
| `--bg-active`      | active slate      | `#2A2F3A` | 选中行              |
| `--surface`        | 表面色            | `#1E2128` | 弹窗、tooltip       |
| `--border`         | 边框              | `#2A2F3A` | 分隔线、卡片边      |
| `--border-strong`  | 强边框            | `#3A4150` | 输入框、focus       |
| `--fg`             | 主文本            | `#E6E8EC` | 标题、正文          |
| `--fg-muted`       | 次文本            | `#8A8F9A` | 描述、placeholder   |
| `--fg-subtle`      | 弱文本            | `#5C6270` | 辅助、disable       |
| `--primary`        | 紫蓝              | `#7B6CF6` | 主按钮、链接、focus |
| `--primary-hover`  | hover             | `#8E7FF9` | 主按钮 hover        |
| `--primary-fg`     | 文字在 primary 上 | `#FFFFFF` | 主按钮文字          |
| `--accent`         | 强调              | `#56B6F9` | 信息强调、tab 指示  |
| `--success`        | 绿                | `#7FB069` | 成功、运行中        |
| `--warning`        | 黄                | `#E0A458` | 警告、dirty         |
| `--error`          | 红                | `#E06C75` | 错误、失败          |
| `--status-running` | 绿                | `#7FB069` | profile running     |
| `--status-stopped` | 灰                | `#5C6270` | profile stopped     |
| `--status-warning` | 黄                | `#E0A458` | dirty / warning     |
| `--status-error`   | 红                | `#E06C75` | launch failed       |

#### Light mode

| Token             | Hex       | 说明                  |
| ----------------- | --------- | --------------------- |
| `--bg`            | `#FFFFFF` | 主背景                |
| `--bg-elevated`   | `#F7F8FA` | 卡片                  |
| `--bg-hover`      | `#EEF0F4` | hover                 |
| `--bg-active`     | `#E4E8EE` | 选中                  |
| `--surface`       | `#FFFFFF` | 弹窗                  |
| `--border`        | `#E4E8EE` | 边框                  |
| `--border-strong` | `#CDD2DA` | 输入框                |
| `--fg`            | `#1A1D24` | 主文本                |
| `--fg-muted`      | `#5C6270` | 次文本                |
| `--fg-subtle`     | `#8A8F9A` | 弱文本                |
| `--primary`       | `#5945D6` | 主色（dark 模式稍亮） |
| `--primary-hover` | `#6E5BE0` | hover                 |
| `--primary-fg`    | `#FFFFFF` | 文字                  |
| `--accent`        | `#1976D2` | 强调                  |
| `--success`       | `#3F8E3F` | 绿                    |
| `--warning`       | `#C77F30` | 黄                    |
| `--error`         | `#C1353F` | 红                    |

### 1.3 配色 B：**Forest Teal**（备选）

> 主调：深炭灰 + 青绿 accent。偏工程师 / 终端调性。

#### Dark mode

| Token           | Hex               |
| --------------- | ----------------- |
| `--bg`          | `#0E1416`         |
| `--bg-elevated` | `#161E21`         |
| `--bg-hover`    | `#1E282C`         |
| `--bg-active`   | `#263236`         |
| `--border`      | `#263236`         |
| `--fg`          | `#E0E6E8`         |
| `--fg-muted`    | `#86969B`         |
| `--primary`     | `#3FB8AF`（青绿） |
| `--accent`      | `#5BCBF7`         |
| `--success`     | `#7BC77B`         |
| `--warning`     | `#D4A14A`         |
| `--error`       | `#E57180`         |

#### Light mode

| Token           | Hex       |
| --------------- | --------- |
| `--bg`          | `#FCFCFA` |
| `--bg-elevated` | `#F2F4F1` |
| `--fg`          | `#161E21` |
| `--primary`     | `#2A8A82` |

### 1.4 配色 C：**Mono Orange**（极简备选）

> 主调：纯灰阶 + 单一橙色 accent。最克制、最 terminal-like。

#### Dark mode

| Token           | Hex             |
| --------------- | --------------- |
| `--bg`          | `#0E0E0E`       |
| `--bg-elevated` | `#181818`       |
| `--bg-hover`    | `#222222`       |
| `--bg-active`   | `#2A2A2A`       |
| `--border`      | `#262626`       |
| `--fg`          | `#E8E8E8`       |
| `--fg-muted`    | `#8C8C8C`       |
| `--primary`     | `#FF8C42`（橙） |
| `--accent`      | `#FF8C42`       |
| `--success`     | `#73C991`       |
| `--warning`     | `#E0AF68`       |
| `--error`       | `#F26D6D`       |

#### Light mode

| Token           | Hex       |
| --------------- | --------- |
| `--bg`          | `#FAFAFA` |
| `--bg-elevated` | `#F2F2F2` |
| `--fg`          | `#1A1A1A` |
| `--primary`     | `#E0701A` |

### 1.5 主题切换

- CustomTkinter 原生支持 `set_appearance_mode("dark" | "light" | "system")`
- 启动时默认 `"system"`（跟系统）
- Settings 页可手动锁定 dark / light
- 切换时**不重启**，实时变（CustomTkinter 支持）

### 1.6 配色决策

**推荐 A（Slate Indigo）** 作为默认。理由：

- 业界最成熟的开发者工具配色
- 紫蓝 accent 在 linear 渐变上表现好
- dark/light 切换对比度稳定
- 跟 cc-switch、VS Code、Linear 视觉接近 → power user 零适应

B 和 C 作为 Settings 里的"主题选择"，power user 可按个人偏好切换。

---

## 2. 字体与排版

### 2.1 字体栈

**仅使用系统字体**，零安装：

```python
# Windows
FONT_SANS = "Segoe UI Variable"    # 优先；Win 11+
FONT_SANS_FALLBACK = "Segoe UI"     # Win 10
FONT_MONO = "Cascadia Code"         # 等宽；Win 11+
FONT_MONO_FALLBACK = "Consolas"     # Win 10 等宽

# CustomTkinter 字体设置
ctk.set_default_color_theme("blue")  # 内置；后期可自定义
```

### 2.2 字号层级（type scale）

| Token       | Size (px) | Weight | Line-height | 用途                   |
| ----------- | --------- | ------ | ----------- | ---------------------- |
| `text-xs`   | 11        | 400    | 1.4         | 标签、提示、辅助文本   |
| `text-sm`   | 12        | 400    | 1.45        | 次要文本、表格内容     |
| `text-base` | 13        | 400    | 1.5         | 正文、按钮、输入框     |
| `text-md`   | 14        | 500    | 1.5         | 重要正文、列表项主文本 |
| `text-lg`   | 16        | 500    | 1.4         | 卡片标题、tab 标签     |
| `text-xl`   | 18        | 600    | 1.35        | 页面标题、section 标题 |
| `text-2xl`  | 22        | 600    | 1.3         | 主页大标题             |
| `text-3xl`  | 28        | 700    | 1.25        | Welcome 文案           |

注：CustomTkinter 用 `font=("Segoe UI Variable", size, weight)` 配置。

### 2.3 字重

| Token      | Value | 用途               |
| ---------- | ----- | ------------------ |
| `regular`  | 400   | 正文、placeholder  |
| `medium`   | 500   | 强调、按钮、列表项 |
| `semibold` | 600   | 标题、section      |
| `bold`     | 700   | 主页标题、强调     |

### 2.4 间距系统（4px / 8px grid）

| Token      | Value (px) | 用途                     |
| ---------- | ---------- | ------------------------ |
| `space-0`  | 0          | 紧贴                     |
| `space-1`  | 2          | 极小间距（icon 与文字）  |
| `space-2`  | 4          | 行内元素                 |
| `space-3`  | 8          | 列表项内边距、tab 内边距 |
| `space-4`  | 12         | 卡片内边距、按钮内边距   |
| `space-5`  | 16         | 区块内边距、section 间距 |
| `space-6`  | 20         | 面板内边距               |
| `space-7`  | 24         | 页面边距、卡片间距       |
| `space-8`  | 32         | 大区块分隔               |
| `space-9`  | 40         | 页面顶部留白             |
| `space-10` | 48         | 极大大区块分隔           |

CustomTkinter 的 `padx/pady` 全部对齐这套 token。

### 2.5 圆角（corner radius）

| Token         | Value (px) | 用途                     |
| ------------- | ---------- | ------------------------ |
| `radius-sm`   | 4          | tag、badge、checkbox     |
| `radius-md`   | 6          | 按钮、输入框、tab        |
| `radius-lg`   | 8          | 卡片、popover            |
| `radius-xl`   | 12         | 大卡片、dialog           |
| `radius-full` | 9999       | pill、avatar、status dot |

CustomTkinter 内部统一 `corner_radius=8`（按钮、输入框、tab、卡片一致）。

### 2.6 阴影

**极简使用**。dark 模式下阴影几乎看不见，主要靠 border 区分层级。light 模式用 1-2 级阴影。

| Token       | Definition                    | 用途             |
| ----------- | ----------------------------- | ---------------- |
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)`  | tag、badge       |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.1)`  | popover、tooltip |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.15)` | dialog           |

CustomTkinter 阴影有限；优先用 border 表达层级，阴影只用于浮层（popover / dialog / dropdown）。

---

## 3. 组件库 catalog

### 3.1 按钮（Button）

**变体**：

| Variant     | 背景            | 文本           | 边框       | 用途                            |
| ----------- | --------------- | -------------- | ---------- | ------------------------------- |
| `primary`   | `--primary`     | `--primary-fg` | 无         | 主操作（Save / Launch）         |
| `secondary` | `--bg-elevated` | `--fg`         | `--border` | 次要操作（Cancel）              |
| `ghost`     | 透明            | `--fg`         | 无         | 工具栏、inline（Edit / Delete） |
| `danger`    | `--error`       | 白             | 无         | 删除、强制停止                  |

**尺寸**：

| Size | Height (px) | Padding (H) | Padding (V) | Font      |
| ---- | ----------- | ----------- | ----------- | --------- |
| `sm` | 24          | 8           | 4           | text-sm   |
| `md` | 32          | 12          | 6           | text-base |
| `lg` | 40          | 16          | 8           | text-md   |

**状态**（每种 variant 都适用）：

| State              | 视觉变化                            |
| ------------------ | ----------------------------------- |
| `default`          | 见上表                              |
| `hover`            | 背景亮度 +5%，cursor=pointer        |
| `active`/`pressed` | 背景亮度 -5%                        |
| `focus`            | 2px outline `--primary`，offset 2px |
| `disabled`         | opacity 0.5，cursor=not-allowed     |
| `loading`          | 内容替换为 spinner，禁用点击        |

**CustomTkinter 实现**：

```python
ctk.CTkButton(
    master, text="Launch",
    command=...,
    fg_color=PRIMARY, hover_color=PRIMARY_HOVER,
    text_color=PRIMARY_FG,
    height=32, corner_radius=6,
    font=("Segoe UI Variable", 13, "normal"),
)
```

### 3.2 输入框（Input / Entry）

**单行输入**：

```
┌────────────────────────────┐
│  placeholder                │  ← text-base, fg-muted
└────────────────────────────┘
   ↑ border, radius-md
```

| State    | Border            | Background      |
| -------- | ----------------- | --------------- |
| default  | `--border`        | `--bg`          |
| hover    | `--border-strong` | `--bg`          |
| focus    | 2px `--primary`   | `--bg`          |
| error    | 2px `--error`     | `--bg`          |
| disabled | `--border`        | `--bg-elevated` |

**多行输入**（CLAUDE.md / settings.json）：

```
┌────────────────────────────┐
│                              │  ← text-mono, 自动换行
│  content...                  │
│                              │
└────────────────────────────┘
   ↑ 等宽字体，支持滚动
```

**CustomTkinter**：

```python
ctk.CTkEntry(master, placeholder_text="...", height=32, corner_radius=6,
             border_color=BORDER, fg_color=BG)
ctk.CTkTextbox(master, font=("Cascadia Code", 13), wrap="word",
               corner_radius=6, border_width=1, border_color=BORDER)
```

### 3.3 下拉框（Dropdown / Combobox）

**P0 范围**：

- 简单 select（provider 选择、agent type 选择）
- 静态选项

**P1 范围**：

- 可搜索下拉（"🔍 Search providers..."）

**视觉**：

```
┌─────────────────────┐
│ MiniMax M3        ▾ │  ← text-base, 显示当前选中
└─────────────────────┘
       ↓ 点击
┌─────────────────────┐
│ ● MiniMax M3   ★   │  ← 选中项（圆点 + 加粗）
│ ○ DeepSeek V4 Pro  │
│ ○ Kimi K2          │
│ ─────────────────  │
│ + Add custom       │  ← P1
└─────────────────────┘
```

### 3.4 卡片（Card）

**P0 用途**：

- profile 列表行（每行一个 card）
- Home 页状态卡
- MCP / Skills / Hooks tab 的列表项

**视觉**：

```
┌─────────────────────────────────────────┐
│ ● DW                  [▶] [⋯]          │  ← row
│   claude code · MiniMax M3             │  ← meta line
│   "DW 多步骤编排执行者"                  │  ← description
│   14:32 · resume last · 2h 13m         │  ← status
└─────────────────────────────────────────┘
   ↑ bg-elevated, border, radius-lg
   ↑ hover: bg-hover
   ↑ active: bg-active + 2px primary 左边框
```

**层级规则**：

- 卡片间间距 = `space-4` (12px)
- 卡片内 padding = `space-4` (12px) 横向 / `space-3` (8px) 纵向
- 卡片标题字号 = `text-md` (14px medium)
- 卡片描述字号 = `text-sm` (12px regular muted)

### 3.5 标签 / 徽章（Badge / Tag）

**用途**：

- agent type 标签（"claude code" / "codex" / "hermes" / "opencode"）
- status pill（"● running" / "○ stopped" / "⚠ dirty" / "✗ error"）
- meta 标签（"Pinned" / "Default"）

**视觉**：

```
┌──────────────┐
│  claude code  │  ← 灰底，深灰字
└──────────────┘   radius-full, padding 4px 8px, text-xs
```

| Variant   | Background            | Text         | 用途            |
| --------- | --------------------- | ------------ | --------------- |
| `neutral` | `--bg-hover`          | `--fg-muted` | agent type 标签 |
| `primary` | `--primary` 20% alpha | `--primary`  | 强调标签        |
| `success` | `--success` 20%       | `--success`  | 成功状态        |
| `warning` | `--warning` 20%       | `--warning`  | 警告状态        |
| `error`   | `--error` 20%         | `--error`    | 错误状态        |

**CustomTkinter**：

```python
# CustomTkinter 没有原生 badge，用 Label 模拟
ctk.CTkLabel(master, text="claude code", fg_color=BG_HOVER, text_color=FG_MUTED,
             corner_radius=999, padx=8, pady=2, font=("Segoe UI Variable", 11))
```

### 3.6 开关（Switch / Toggle）

**用途**：Hooks 启用/禁用、Settings 项开关

**视觉**：

```
○───    ← off 状态（灰圆点在左）
───●    ← on 状态（主色圆点在右）
```

| State    | Track             | Knob          |
| -------- | ----------------- | ------------- |
| off      | `--border-strong` | `--fg-muted`  |
| on       | `--primary`       | 白            |
| disabled | `--bg-elevated`   | `--fg-subtle` |

**CustomTkinter**：

```python
ctk.CTkSwitch(master, text="Enabled", command=...,
              fg_color=PRIMARY, progress_color=PRIMARY,
              font=("Segoe UI Variable", 13))
```

### 3.7 对话框（Dialog）

**P0 用途**：

- 创建 profile 向导
- 删除确认
- Provider 切换确认（如果 agent 在跑）

**视觉**：

```
┌──────────────────────────────────────────┐
│  Delete profile?                    [×]   │  ← title bar
│ ──────────────────────────────────────── │
│                                            │
│  Are you sure you want to delete          │  ← body
│  profile "DW"?                             │
│                                            │
│  This will remove the entire              │  ← warning
│  /home/maoqh/.agent-box/profiles/DW/      │
│  directory.                                │
│                                            │
│ ──────────────────────────────────────── │
│              [Cancel]  [Delete]          │  ← footer
└──────────────────────────────────────────┘
```

- 居中弹出，半透明背景遮罩
- 圆角 12px，shadow-lg
- width 400-500px，padding `space-6`
- Esc 关闭，Enter 触发 primary action

**CustomTkinter**：

```python
dialog = ctk.CTkToplevel(root)
dialog.geometry("500x250")
dialog.title("Confirm")
dialog.transient(root)
dialog.grab_set()  # modal
```

### 3.8 Toast / 通知

**P0 用途**：

- "Profile 'DW' created"
- "Provider changed to MiniMax M3"
- "Launched DW in ~/projects/agent-box"
- "MCP server 'github' deleted"（P1）

**视觉**：

```
                              ┌────────────────────────────────────┐
                              │ ✓  Profile 'DW' created  [Dismiss] │
                              └────────────────────────────────────┘
                                                  ↑ 右下角浮起
```

- 屏幕**右下角**堆叠（最多 3 个，更早的往上挤）
- 自动消失：info 3s / success 4s / error 6s / warning 5s
- 不可聚焦（不影响主操作）
- 可手动 dismiss

**CustomTkinter 实现**：

```python
# 用 CTkToplevel + after() 定时关闭
toast = ctk.CTkToplevel(root)
toast.overrideredirect(True)  # 无标题栏
toast.geometry(f"+{x}+{y}")
# ... 3s 后销毁
```

### 3.9 进度条（Progress Bar）

**P0 用途**：

- WSL 启动 loading
- 大型 agent launch（如果未来要显示进度）
- Home 页 agent type 分布图（条形图替代）

**视觉**：

```
████████████░░░░░░░░  60%
```

- 圆角 4px，高度 6-8px
- 进度色 `--primary`，底色 `--bg-elevated`
- 不显示百分比文字（除非用户 hover）

**CustomTkinter**：

```python
ctk.CTkProgressBar(master, height=8, corner_radius=4,
                   fg_color=BG_ELEVATED, progress_color=PRIMARY)
# set value 0.0 - 1.0
```

### 3.10 列表项（List Item / Row）

**profile 列表行**的完整规范：

```
┌──────────────────────────────────────────────────────────┐
│ ●   DW                              [▶]  [⋯]            │
│     claude code · MiniMax M3                            │
│     "DW 多步骤编排执行者"                                 │
│     14:32 · resume last · 2h 13m                        │
└──────────────────────────────────────────────────────────┘
 ↑  ↑                                                ↑
 │  status dot (8px)                                 action buttons (hover 显示)
 title (text-md, medium)
 meta line (text-sm, muted)
 description (text-sm, muted)
 timestamp (text-xs, subtle)
```

**状态指示色**：

| Status  | Color                   | 用途                         |
| ------- | ----------------------- | ---------------------------- |
| running | `--status-running` (绿) | active agent process         |
| stopped | `--status-stopped` (灰) | idle                         |
| dirty   | `--status-warning` (黄) | provider 改了但 agent 没重启 |
| error   | `--status-error` (红)   | 上次 launch failed           |

**Hover 时**：

- 背景变 `--bg-hover`
- [▶] 和 [⋯] 按钮从 50% opacity → 100% opacity
- 整行点击范围包括空白处（不只是 [▶] 按钮）

**Active / 选中**：

- 背景 `--bg-active`
- 左边 2px 边 `--primary`

### 3.11 分组标题（Section Header）

**横向 agent type tab** 是分组标题的特殊形式（已定，见 2.2）。

**通用 section header**（如 Settings 页内分组）：

```
─── APPEARANCE ─────────────────────────────
```

- 大写字母，text-xs，letter-spacing 0.05em
- 颜色 `--fg-subtle`
- 上下 padding `space-3` / `space-4`

### 3.12 侧边栏（Sidebar）

**完整规范**：

```
┌────────────────┐
│ [logo]          │  ← 高度 60px，居中 logo
│                 │
│ ▸ Home          │  ← 当前页
│   Profiles      │
│   Sessions      │
│   Settings      │
│   Help          │
│                 │
│                 │  ← 弹性空间
│                 │
│ ● 3 running    │  ← 状态栏，高度 32px
└────────────────┘
   宽度 200px
   背景 bg-elevated
   右边框 1px border
```

**导航项**：

- 高度 36px
- 左右 padding 16px / 12px
- 字号 text-md (14px)
- icon (16px) + 文字 (text-md)
- 选中：背景 `--bg-active` + 左边 3px `--primary`（或圆角左边）
- hover：背景 `--bg-hover`

**CustomTkinter**：

```python
# 侧栏用 CTkFrame + CTkButton 模拟
sidebar = ctk.CTkFrame(master, width=200, fg_color=BG_ELEVATED)
for item in nav_items:
    btn = ctk.CTkButton(sidebar, text=item["label"], image=item["icon"],
                        fg_color="transparent", text_color=FG,
                        hover_color=BG_HOVER, anchor="w",
                        height=36, corner_radius=0,
                        command=item["on_click"])
```

### 3.13 导航栏（Top Bar）

**P0 不需要**（侧栏 + 主内容区已经够）。如未来要加，会是：

```
┌────────────────────────────────────────────────┐
│ [☰]  Profiles                  [🔍] [⚙] [👤] │  ← 高度 48px
└────────────────────────────────────────────────┘
```

### 3.14 Tab

**横向 agent type tab**（核心）：

```
┌──────┬──────┬────────┬──────────┬──────┐
│ All  │  CC  │ Codex  │ Hermes   │ OpenCode│
│  12  │  5   │  2     │  1       │  4    │
└──────┴──────┴────────┴──────────┴──────┘
 ↑ 选中
```

- 高度 40px
- 字号 text-sm (12px medium) for label + text-xs (11px) for count
- 未选中：文本 `--fg-muted`
- 选中：文本 `--fg` + 底部 2px `--primary`
- hover：背景 `--bg-hover`

**Profile 详情内的 tab**（Meta / Settings / CLAUDE.md / MCP / Skills / Hooks / Storage）：

```
[ Meta ] [ Settings ] [ CLAUDE.md ] [ MCP ] [ Skills ] [ Hooks ] [ Storage ]
   ↑ 选中
```

- 高度 32px
- 字号 text-sm
- 未选中：透明背景
- 选中：底部 2px `--primary` + 文本 `--fg`（其他 `--fg-muted`）

### 3.15 表格（Table）

**P0 用途**：

- Sessions 页的 launch 历史

**视觉**：

```
┌──────────────────────────────────────────────────────────────┐
│ PROFILE        TIME          MODE   CWD              ACTION │
│ ──────────────────────────────────────────────────────────── │
│ DW (cc)        14:32         resume ~/p/agent-box    [⋯]    │
│ spec (codex)   11:08         new    ~/p/agent-box    [⋯]    │
│ decision (cc)  2026-06-19    new    ~/p/agent-box    [⋯]    │
└──────────────────────────────────────────────────────────────┘
```

- 表头：text-xs uppercase `--fg-subtle`
- 行：text-sm `--fg`，hover `--bg-hover`
- 行动作：右对齐 [⋯] 按钮（hover 出现）
- 行高 32px

---

## 4. 图标系统

### 4.1 设计原则

**P0 用 emoji**（零依赖），P1 可换 outline SVG。

理由：

- Emoji 内置支持，跨平台
- 不需要额外资源文件
- 在 CustomTkinter 里直接当文本用
- Power user 看到 emoji 觉得"这工具不装"

### 4.2 Agent Type 图标

| Agent Type        | Emoji | Unicode | 备选    |
| ----------------- | ----- | ------- | ------- |
| cc (Claude Code)  | 🤖    | U+1F916 | 🧠 / 💬 |
| codex (Codex CLI) | 💻    | U+1F4BB | 🛠️ / ⚡ |
| hermes            | 📨    | U+1F4E8 | 📜 / ✉️ |
| opencode          | 🌐    | U+1F310 | 🔓 / 🌍 |

> 注：emoji 在不同系统显示可能不同。Windows 11 上 emoji 彩色；Win 10 可能黑白。如果要稳定，备选字符（`🧠 💬 🛠️`）跨平台更一致。

### 4.3 功能图标（action icons）

| 动作              | Emoji | Unicode |
| ----------------- | ----- | ------- |
| Launch / Run      | ▶     | U+25B6  |
| Stop              | ■     | U+25A0  |
| Pause             | ⏸     | U+23F8  |
| Edit              | ✎     | U+270E  |
| Delete            | 🗑    | U+1F5D1 |
| Add / New         | ＋    | U+FF0B  |
| Refresh           | ⟳     | U+27F3  |
| Settings / Config | ⚙     | U+2699  |
| Folder            | 📁    | U+1F4C1 |
| Search            | 🔍    | U+1F50D |
| More menu         | ⋯     | U+22EF  |
| Close             | ✕     | U+2715  |
| Check             | ✓     | U+2713  |
| Warning           | ⚠     | U+26A0  |
| Error             | ✗     | U+2717  |
| Info              | ⓘ     | U+24D8  |
| Save              | 💾    | U+1F4BE |
| Copy              | 📋    | U+1F4CB |
| Open external     | ↗     | U+2197  |
| Pin               | ⭐    | U+2B50  |
| Import            | ⬇     | U+2B07  |
| Export            | ⬆     | U+2B06  |

### 4.4 状态图标

| Status  | Emoji | Unicode | 颜色                    |
| ------- | ----- | ------- | ----------------------- |
| Running | ●     | U+25CF  | `--status-running` (绿) |
| Stopped | ○     | U+25CB  | `--status-stopped` (灰) |
| Warning | ⚠     | U+26A0  | `--status-warning` (黄) |
| Error   | ✗     | U+2717  | `--status-error` (红)   |
| Dirty   | ◐     | U+25D0  | `--status-warning` (黄) |
| Pinned  | ⭐    | U+2B50  | `--warning` (金)        |

### 4.5 P1 升级路径

如未来要换 outline SVG（更精致）：

- 推荐图标库：**Lucide**（https://lucide.dev）— MIT、tree-shakeable、~1.5k 图标
- 用 `cairo` 或 `Pillow` 渲染为 PNG，然后用 `CTkImage` 加载
- 文件大小可控（每图标 1-2KB）

但 P0 直接用 emoji，**0 依赖**。Power user 工具不堆复杂度。

---

## 5. 关键页面视觉稿

> 所有页面用 ASCII art + 注释。配色按 §1.2 Slate Indigo Dark。

### 5.1 Home 页

```
┌─ logo ─┬──────────────────────────────────────────────────────────────────────┐
│        │  Welcome back                                                          │
│ Home   │  ──────────────────────────────────────────────────────────────       │
│ Profi… │                                                                        │
│ Sess…  │  ┌────────────┐ ┌────────────┐ ┌────────────┐                       │
│ Sett…  │  │ ● 3        │ │ 12         │ │ WSL ✓      │                       │
│ Help   │  │ running    │ │ profiles   │ │ healthy    │                       │
│        │  │            │ │ 4 types    │ │            │                       │
│        │  └────────────┘ └────────────┘ └────────────┘                       │
│        │                                                                        │
│        │  Quick launch (recent 5)                                              │
│        │  ⭐ DW    ⭐ decision   spec    helper    hermes                      │
│        │                                                                        │
│        │  Recent activity                                                      │
│        │  ● DW (cc)        14:32   resume   ~/p/agent-box     2h 13m          │
│        │  ● spec (codex)   11:08   new      ~/p/agent-box       31m           │
│        │  ○ decision (cc)  2026-06-19 16:00  new  exit 0                      │
│        │                                                                        │
│        │  Agent type distribution                                              │
│        │  CC     ████████████ 5                                                │
│        │  Codex  ████ 2                                                        │
│        │  Hermes ██ 1                                                          │
│        │  OpenCode ████████ 4                                                 │
└────────┴──────────────────────────────────────────────────────────────────────┘
```

**视觉细节**：

- 3 个状态卡：圆角 8px，bg-elevated，等宽
- Recent activity 列表：每行 32px，hover bg-hover
- Agent type 分布：CTkProgressBar 横条 + 数字
- Quick launch：⭐ emoji + profile 名字（点 ⭐ 不再 remove，简化交互）

### 5.2 Profiles 页

```
┌─ logo ─┬──────────────────────────────────────────────────────────────────────┐
│        │  Profiles                                       [+ New profile]       │
│ Home   │  ┌──────┬──────┬────────┬──────────┬──────┐                          │
│ ▸ Pro… │  │ All  │  CC  │ Codex  │ Hermes   │OpenCd│                          │
│ Sess…  │  │  12  │  5   │  2     │  1       │  4   │                          │
│ Sett…  │  └──────┴──────┴────────┴──────────┴──────┘                          │
│ Help   │                                                                        │
│        │  🔍 Search...                                                         │
│        │  ──────────────────────────────────────────────────────────────       │
│        │                                                                        │
│        │  ┌────────────────────────────────────────────────────────────┐      │
│        │  │ ●  DW                           [▶] [⋯]                  │      │
│        │  │    claude code · MiniMax M3                                │      │
│        │  │    "DW 多步骤编排执行者"                                    │      │
│        │  │    14:32 · resume last · 2h 13m                            │      │
│        │  └────────────────────────────────────────────────────────────┘      │
│        │  ┌────────────────────────────────────────────────────────────┐      │
│        │  │ ●  decision                     [▶] [⋯]                  │      │
│        │  │    claude code · DeepSeek V4 Pro                          │      │
│        │  │    "决策者身份"                                            │      │
│        │  │    yesterday · new · 12m                                   │      │
│        │  └────────────────────────────────────────────────────────────┘      │
│        │  ... (more rows)                                                       │
└────────┴──────────────────────────────────────────────────────────────────────┘
```

**视觉细节**：

- 顶栏右侧 [+ New profile] 是 primary 按钮
- Tab 角标用 text-xs，颜色 fg-muted；选中 tab 角标变 fg
- Profile 行：card 样式（bg-elevated, radius-lg, border）
- 行内：左边 8px status dot，中间主信息，右边 hover 出现 [▶] [⋯]
- 点击行任意位置 = 打开详情（不只是 [▶] 按钮）

### 5.3 Profile 详情页

```
┌─ logo ─┬──────────────────────────────────────────────────────────────────────┐
│        │  ← Profiles   ● DW   claude code · MiniMax M3    [▶ Launch] [⋯]     │
│ Home   │  ──────────────────────────────────────────────────────────────       │
│ ▸ Pro… │  [Meta] [Settings] [CLAUDE.md] [MCP] [Skills] [Hooks] [Storage]      │
│ Sess…  │                                                                        │
│ Sett…  │  ┌─ Meta tab ──────────────────────────────────────────────────┐      │
│ Help   │  │                                                              │      │
│        │  │  Name           DW                                          │      │
│        │  │  Display name   🌟 DW 执行者                                 │      │
│        │  │  Agent type     claude code                                 │      │
│        │  │  Provider       MiniMax M3                       [▾ Change] │      │
│        │  │  Description    DW 多步骤编排执行者                          │      │
│        │  │                                                              │      │
│        │  │  ────  ──────────────────────────────────────────────         │      │
│        │  │                                                              │      │
│        │  │  Created        2026-06-01                                  │      │
│        │  │  Last launched  2026-06-20 14:32 (32 min ago)                │      │
│        │  │  Cwd (last)     ~/projects/agent-box                         │      │
│        │  │  Mode (last)    resume                                       │      │
│        │  │                                                              │      │
│        │  │  ──────────────────────────────────────────────────          │      │
│        │  │                                                              │      │
│        │  │  Quick actions                                               │      │
│        │  │  [▶ Launch (new)]  [↻ Resume last]  [📁 Open dir]             │      │
│        │  │                                                              │      │
│        │  │  [Delete profile...]                                         │      │
│        │  └──────────────────────────────────────────────────────────────┘      │
└────────┴──────────────────────────────────────────────────────────────────────┘
```

**视觉细节**：

- 顶栏：左边 ← 返回链接，中间 profile 名 + status + meta，右边 Launch 按钮（primary）
- 7 个 tab 用顶部 tab 样式（§3.14）
- Meta tab 内容：label + value 形式（label fg-muted, value fg）
- Quick actions：3 个 secondary 按钮
- Delete profile：底部 text 链接（危险色）

### 5.4 Profile 创建向导

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Create new profile                                              [×]    │
│ ──────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  ●  ○  ○  ○                                                              │
│  Type Info  Provider  CLAUDE.md                                          │
│                                                                          │
│  Choose agent type                                                      │
│                                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ 🤖           │ │ 💻           │ │ 📨           │ │ 🌐           │    │
│  │              │ │              │ │              │ │              │    │
│  │ Claude Code  │ │ Codex CLI    │ │ Hermes       │ │ OpenCode     │    │
│  │              │ │              │ │              │ │              │    │
│  │ claude       │ │ codex        │ │ hermes       │ │ opencode     │    │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                                          │
│ ──────────────────────────────────────────────────────────────────────  │
│                                            [Cancel]   [Next →]            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Step 2 (Info)**：

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Create new profile                                              [×]    │
│ ──────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  ✓  ●  ○  ○                                                              │
│  Type  Info  Provider  CLAUDE.md                                         │
│                                                                          │
│  Profile name                                                            │
│  ┌──────────────────────────────────────────────────────────────┐        │
│  │ spec-writer                                                    │        │
│  └──────────────────────────────────────────────────────────────┘        │
│  Letters, numbers, dash, underscore. Max 64 chars.                        │
│                                                                          │
│  Display name (optional)                                                 │
│  ┌──────────────────────────────────────────────────────────────┐        │
│  │ 🌟 Spec Writer                                                  │        │
│  └──────────────────────────────────────────────────────────────┘        │
│  Shown in GUI only. Folder name is still "spec-writer".                  │
│                                                                          │
│  Description (optional)                                                  │
│  ┌──────────────────────────────────────────────────────────────┐        │
│  │                                                               │        │
│  └──────────────────────────────────────────────────────────────┘        │
│                                                                          │
│ ──────────────────────────────────────────────────────────────────────  │
│                                       [← Back]   [Cancel]   [Next →]     │
└──────────────────────────────────────────────────────────────────────────┘
```

**视觉细节**：

- 4 步进度指示（顶部 4 个圆点 + 文字）
- 当前步骤圆点用 primary 色，已完成用 success
- Step 1：4 张卡片（agent type 选），选中边框 2px primary
- Step 2：输入框 + 帮助文字（fg-muted）
- Step 3：provider 列表（左侧）+ 右侧详情（API key 输入）
- Step 4：CLAUDE.md 模板列表 + 右侧 preview

### 5.5 MCP tab（只读 placeholder，P0）

```
┌─ logo ─┬──────────────────────────────────────────────────────────────────────┐
│        │  ← Profiles   ● DW   claude code · MiniMax M3    [▶ Launch] [⋯]     │
│        │  ──────────────────────────────────────────────────────────────       │
│        │  [Meta] [Settings] [CLAUDE.md] [▸ MCP] [Skills] [Hooks] [Storage]   │
│        │                                                                        │
│        │  ┌─ MCP tab ─────────────────────────────────────────────────┐      │
│        │  │                                                              │      │
│        │  │  MCP servers                                                │      │
│        │  │                                                              │      │
│        │  │  ─────────────────────────────────────────────────────       │      │
│        │  │                                                              │      │
│        │  │  ℹ MCP management is coming in a future release.            │      │
│        │  │                                                              │      │
│        │  │  For now, edit mcp.json directly:                           │      │
│        │  │  /home/maoqh/.agent-box/profiles/DW/dot-claude/.mcp.json    │      │
│        │  │                                                              │      │
│        │  │  Or use the CLI:                                            │      │
│        │  │  agent-box edit DW                                          │      │
│        │  │                                                              │      │
│        │  │  [📋 Copy path]      [📂 Open in Explorer]                  │      │
│        │  │                                                              │      │
│        │  └──────────────────────────────────────────────────────────────┘      │
└────────┴──────────────────────────────────────────────────────────────────────┘
```

**视觉细节**：

- 极简：info icon + 文案 + 两个 secondary 按钮
- 没有 form 控件，纯展示

### 5.6 CLAUDE.md tab（内置编辑器）

```
┌─ logo ─┬──────────────────────────────────────────────────────────────────────┐
│        │  [Meta] [Settings] [▸ CLAUDE.md] [MCP] [Skills] [Hooks] [Storage]   │
│        │                                                                        │
│        │  ┌─ Toolbar ─────────────────────────────────────────────────┐      │
│        │  │ [B] [I] [S] [Link] [Code]      [👁 Preview]  ● saved     │      │
│        │  └─────────────────────────────────────────────────────────────┘      │
│        │  ┌─ Editor ────────────────────────────────────────────────────┐      │
│        │  │ # 你是 DW 执行者                                            │      │
│        │  │                                                              │      │
│        │  │ 核心职责：                                                   │      │
│        │  │ - 编排多步骤任务                                             │      │
│        │  │ - 调用合适的 agent 工具                                       │      │
│        │  │ - 验证输出质量                                               │      │
│        │  │                                                              │      │
│        │  │ 工作风格：                                                   │      │
│        │  │ 1. 先调研，后批判，再合成                                    │      │
│        │  │ 2. 重要决策暂停并给出多方案对比                                │      │
│        │  │ 3. 完成后给简洁摘要                                           │      │
│        │  │                                                              │      │
│        │  │ ...                                                          │      │
│        │  │                                                              │      │
│        │  └──────────────────────────────────────────────────────────────┘      │
│        │  Lines: 42    Characters: 1,247    Path: dot-claude/CLAUDE.md         │
└────────┴──────────────────────────────────────────────────────────────────────┘
```

**视觉细节**：

- Toolbar 高度 36px，bg-elevated
- Editor 用 CTkTextbox，等宽字体，自动换行
- 实时保存：右下角 "● saved" / "○ saving..." / "⚠ error"
- 状态栏：行数、字符数、相对路径
- Preview toggle 切换到渲染视图（用 markdown 库，CTkTextbox 不可滚动 RichText，用纯文本 + 等宽字体模拟，重要格式用颜色）

### 5.7 Sessions 页

```
┌─ logo ─┬──────────────────────────────────────────────────────────────────────┐
│        │  Sessions                                       [All profiles ▾]   │
│ Home   │  ──────────────────────────────────────────────────────────────       │
│ Profi… │                                                                        │
│ ▸ Ses… │  ● ACTIVE (3)                                                        │
│ Sett…  │  ┌─────────────────────────────────────────────────────────────┐      │
│ Help   │  │ ● DW (cc)          since 14:32  ~/p/agent-box  2h 13m      │      │
│        │  │   PID 12345  [Open in terminal]  [Stop]                    │      │
│        │  └─────────────────────────────────────────────────────────────┘      │
│        │  ┌─────────────────────────────────────────────────────────────┐      │
│        │  │ ● spec (codex)     since 11:08  ~/p/agent-box    31m        │      │
│        │  │   PID 12388  [Open in terminal]  [Stop]                    │      │
│        │  └─────────────────────────────────────────────────────────────┘      │
│        │  ┌─────────────────────────────────────────────────────────────┐      │
│        │  │ ● helper (hermes)  since yesterday  -        [Show]         │      │
│        │  └─────────────────────────────────────────────────────────────┘      │
│        │                                                                        │
│        │  RECENT (last 7 days)                                                │
│        │  ┌─────────────────────────────────────────────────────────────┐      │
│        │  │ decision (cc)   2026-06-19 16:00  new   ~/p/agent-box  12m  │      │
│        │  │   exit 0  [Resume]  [Rerun]                                  │      │
│        │  └─────────────────────────────────────────────────────────────┘      │
│        │  ┌─────────────────────────────────────────────────────────────┐      │
│        │  │ DW (cc)         2026-06-19 14:00  resume  ~/p/agent-box  1h │      │
│        │  │   exit 0  [Resume]  [Rerun]                                  │      │
│        │  └─────────────────────────────────────────────────────────────┘      │
│        │  ...                                                                  │
│        │                                                                        │
│        │  [Show all 47 launches...]                                            │
└────────┴──────────────────────────────────────────────────────────────────────┘
```

**视觉细节**：

- 顶部 filter：[All profiles ▾] 下拉（也可选 CC only / Codex only 等）
- ACTIVE 区：每行高 48px，hover 高亮
- RECENT 区：每行高 40px，紧凑
- [Show all] 链接展开完整历史

---

## 6. 交互动效

### 6.1 原则

- **动效只服务信息传达**：状态变化、空间关系、加载等待
- **避免装饰性动画**：bounce、parallax、粒子等不要
- **快速**：所有过渡 < 200ms
- **ease-out**：进入动画用 ease-out（减速），离开用 ease-in（加速）

### 6.2 具体动效

| 动效            | 时长     | 缓动     | 说明                            |
| --------------- | -------- | -------- | ------------------------------- |
| 按钮 hover      | 100ms    | ease-out | 背景色过渡                      |
| 按钮按下        | 50ms     | ease-in  | 背景色微变                      |
| 列表行 hover    | 80ms     | ease-out | 背景色                          |
| 列表行选中      | 120ms    | ease-out | 左边框 + 背景                   |
| Tab 切换        | 150ms    | ease-out | 下划线滑动                      |
| 页面切换        | 200ms    | ease-out | 淡入淡出（30ms → 100% opacity） |
| Card 出现       | 150ms    | ease-out | 淡入 + 8px translateY           |
| Dialog 弹出     | 180ms    | ease-out | scale 0.95 → 1.0 + fade in      |
| Dialog 关闭     | 120ms    | ease-in  | scale 1.0 → 0.95 + fade out     |
| Toast 出现      | 200ms    | ease-out | 右侧滑入 + fade in              |
| Toast 消失      | 180ms    | ease-in  | 右侧滑出 + fade out             |
| Status 变化     | 150ms    | ease-out | 颜色过渡（绿→黄）               |
| Loading spinner | infinite | linear   | 8 个 dot 轮转，每 100ms         |
| 进度条          | linear   | linear   | 平滑插值                        |
| Hover 按钮出现  | 120ms    | ease-out | opacity 0.5 → 1.0               |

### 6.3 实现方式

CustomTkinter 限制：

- **不支持** transform、scale 动画
- **支持**颜色过渡（用 `after()` + 颜色插值）
- **支持**几何过渡（用 `after()` + 位置/大小插值）

**实用技巧**：

```python
def animate_fade_in(widget, duration=150, steps=8):
    """淡入动画。"""
    step_ms = duration // steps
    for i in range(steps + 1):
        alpha = i / steps
        widget.after(i * step_ms, lambda a=alpha: setattr(widget, 'alpha', a))
    # 注：CTk 的 alpha 实际是 window attributes，需要 root 的支持
```

**简化策略**：

- 大部分动画用 `after(0, lambda: ...)` 单次调用（避免复杂插值）
- 颜色过渡靠 CustomTkinter 内部处理（它自己已经做了 hover 过渡）
- 复杂动画用 `CTkFrame.place()` 位置过渡 + 颜色过渡组合

**P0 范围动效**：

- 按钮 hover/press（CustomTkinter 自带）
- 列表行 hover（CustomTkinter 自带）
- Tab 切换（CustomTkinter 自带）
- Dialog 弹出/关闭（手动 after 50ms 延迟 + 配置）
- Toast 出现/消失（手动）
- Loading spinner（CTkLabel 文本循环 `⠋⠙⠹⠸⠼⠴⠦⠧`）

**P1 范围**：

- 进度条平滑插值
- Status 颜色过渡动画
- Card 出现淡入

### 6.4 不要做

- ❌ 整页切换的滑动动画（用淡入淡出够了）
- ❌ 卡片 flip / 3D 翻转
- ❌ 拖拽时的橡皮筋效果
- ❌ 弹跳/elastic 缓动
- ❌ 长动画（> 500ms）— 用户会觉得慢
- ❌ 全屏 modal 背景的渐变动画

---

## 7. gui-redesign.py 实现指导

### 7.1 文件结构

**单文件方案**（保持当前 `gui-windows.py` 单文件分发）：

```
gui-windows.py                    ← 主入口
├── class AgentBoxApp            ← 主窗口
│   ├── __init__()
│   ├── _build_layout()          ← 侧边栏 + 主内容区
│   ├── _build_sidebar()         ← 5 项导航
│   ├── _show_page(name)         ← 页面切换
│   ├── _build_home_page()       ← Home 页
│   ├── _build_profiles_page()   ← Profiles 页（含横向 tab）
│   ├── _build_sessions_page()   ← Sessions 页
│   ├── _build_settings_page()   ← Settings 页
│   └── _build_help_page()       ← Help 页
│
├── class ProfileListView        ← profile 列表
├── class ProfileDetailView      ← 详情页（7 tab）
├── class ProfileCreateWizard    ← 4 步向导
├── class MCPTab                 ← MCP tab（P0 只读）
├── class SkillsTab              ← Skills tab
├── class HooksTab               ← Hooks tab
├── class StorageTab             ← Storage tab
├── class SessionListView        ← Sessions 列表
├── class Toast                  ← 通知系统
└── class Theme                  ← 主题管理
```

**或者拆多文件**（如果单文件超 2000 行）：

```
gui/
├── __init__.py
├── app.py                  ← AgentBoxApp
├── theme.py                ← Theme + tokens
├── components.py           ← 通用组件（Button, Card, Badge, Toast）
├── pages/
│   ├── home.py
│   ├── profiles.py
│   ├── profile_detail.py
│   ├── create_wizard.py
│   ├── sessions.py
│   ├── settings.py
│   └── help.py
└── state.py                ← sessions.db + state tracking
```

### 7.2 关键类骨架

```python
# theme.py
import customtkinter as ctk

class Theme:
    # 配色 A: Slate Indigo
    DARK = {
        "bg": "#0F1115",
        "bg_elevated": "#181B22",
        "bg_hover": "#22262E",
        "bg_active": "#2A2F3A",
        "surface": "#1E2128",
        "border": "#2A2F3A",
        "border_strong": "#3A4150",
        "fg": "#E6E8EC",
        "fg_muted": "#8A8F9A",
        "fg_subtle": "#5C6270",
        "primary": "#7B6CF6",
        "primary_hover": "#8E7FF9",
        "primary_fg": "#FFFFFF",
        "accent": "#56B6F9",
        "success": "#7FB069",
        "warning": "#E0A458",
        "error": "#E06C75",
        "status_running": "#7FB069",
        "status_stopped": "#5C6270",
        "status_warning": "#E0A458",
        "status_error": "#E06C75",
    }
    LIGHT = {
        # ... light mode 同结构
    }

    _current = DARK

    @classmethod
    def get(cls, key: str) -> str:
        return cls._current[key]

    @classmethod
    def set_mode(cls, mode: str):  # "dark" | "light" | "system"
        ctk.set_appearance_mode(mode)
        # 根据实际 mode 切换 _current
```

```python
# app.py - 主入口
import customtkinter as ctk
import threading
from .theme import Theme
from .pages import home, profiles, sessions, settings, help

class AgentBoxApp:
    AGENT_ORDER = ("cc", "codex", "hermes", "opencode")

    def __init__(self, root: ctk.CTk):
        self.root = root
        self.root.title("Agent Box")
        self.root.geometry("1280x800")
        self.root.minsize(900, 600)

        # State
        self.profiles: list = []
        self.current_page = "home"
        self.theme = "system"  # "dark" | "light" | "system"
        self.sessions_db = self._init_sessions_db()

        # Build
        self._build_layout()
        self.refresh()

    def _build_layout(self):
        # root
        # ├── sidebar (200px)
        # └── main (rest)
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)
        self._build_sidebar()
        self.main = ctk.CTkFrame(self, fg_color=Theme.get("bg"))
        self.main.grid(row=0, column=1, sticky="nsew")
        self._show_page("home")

    def _build_sidebar(self):
        sidebar = ctk.CTkFrame(self, width=200, fg_color=Theme.get("bg_elevated"))
        sidebar.grid(row=0, column=0, sticky="nsew")
        # ... 5 nav items + 底部 status
        self.nav_buttons = {}
        for i, (key, label, icon) in enumerate(NavItems):
            btn = ctk.CTkButton(
                sidebar, text=f"{icon}  {label}",
                fg_color="transparent", text_color=Theme.get("fg"),
                hover_color=Theme.get("bg_hover"),
                anchor="w", height=36, corner_radius=0,
                command=lambda k=key: self._show_page(k),
            )
            btn.grid(row=i, column=0, sticky="ew", padx=12, pady=2)
            self.nav_buttons[key] = btn

    def _show_page(self, name: str):
        # 清空 main
        for w in self.main.winfo_children():
            w.destroy()
        # 构造新页
        page_builders = {
            "home": home.build,
            "profiles": profiles.build,
            "sessions": sessions.build,
            "settings": settings.build,
            "help": help.build,
        }
        page_builders[name](self.main, self)
        # 更新 nav 选中
        for k, btn in self.nav_buttons.items():
            btn.configure(fg_color=Theme.get("bg_active") if k == name else "transparent")
        self.current_page = name

    def refresh(self):
        """从 wsl.exe 拉 profile 列表。"""
        self.profiles = fetch_profiles()  # 已有逻辑
        # 当前页如果是 profiles，重新构建
        if self.current_page == "profiles":
            self._show_page("profiles")
```

### 7.3 CustomTkinter 关键技巧

#### 7.3.1 主题与 color 复用

```python
# 全局 helper
def color(key: str) -> str:
    return Theme.get(key)

# widget 使用
btn = ctk.CTkButton(..., fg_color=color("primary"), hover_color=color("primary_hover"))
```

#### 7.3.2 横向 tab

```python
class AgentTypeTabs(ctk.CTkFrame):
    def __init__(self, master, counts: dict, on_change: callable):
        super().__init__(master, fg_color="transparent")
        self.buttons = {}
        tabs = [("all", "All", sum(counts.values()))] + \
               [(at, at.upper(), counts.get(at, 0)) for at in AGENT_ORDER]
        for i, (key, label, count) in enumerate(tabs):
            btn = ctk.CTkButton(
                self, text=f"{label}  {count}",
                fg_color="transparent", text_color=color("fg_muted"),
                hover_color=color("bg_hover"),
                height=40, corner_radius=0,
                command=lambda k=key: on_change(k),
            )
            btn.grid(row=0, column=i, padx=4)
            self.buttons[key] = btn
        self._update_selection("all")

    def _update_selection(self, selected):
        for k, btn in self.buttons.items():
            if k == selected:
                btn.configure(text_color=color("fg"))
                # 加底部 2px primary 线（用 CTkLabel 放底下）
            else:
                btn.configure(text_color=color("fg_muted"))
```

#### 7.3.3 Profile 行

```python
class ProfileRow(ctk.CTkFrame):
    def __init__(self, master, profile: dict, on_launch, on_more, **kwargs):
        super().__init__(master, fg_color=color("bg_elevated"),
                         corner_radius=8, border_width=1,
                         border_color=color("border"), **kwargs)
        self.bind("<Enter>", lambda e: self.configure(fg_color=color("bg_hover")))
        self.bind("<Leave>", lambda e: self.configure(fg_color=color("bg_elevated")))
        self.bind("<Button-1>", lambda e: self._open_detail())

        # 8px status dot
        status_color = color("status_running" if profile.get("active") else "status_stopped")
        dot = ctk.CTkLabel(self, text="●", text_color=status_color,
                           font=("Segoe UI Variable", 12), width=8)
        dot.grid(row=0, column=0, padx=(12, 8), pady=8, sticky="w")

        # Title
        title = ctk.CTkLabel(self, text=profile["display_name"] or profile["name"],
                            font=("Segoe UI Variable", 14, "normal"),
                            text_color=color("fg"))
        title.grid(row=0, column=1, sticky="w")

        # Meta line
        meta = ctk.CTkLabel(self,
                            text=f'{profile["agent_type"]} · {profile.get("provider", "—")}',
                            font=("Segoe UI Variable", 12),
                            text_color=color("fg_muted"))
        meta.grid(row=1, column=1, sticky="w", padx=(0, 0), pady=(0, 4))

        # ... description, timestamp ...

        # Right side: launch + more buttons
        self.launch_btn = ctk.CTkButton(self, text="▶", width=32, height=32,
                                         command=lambda: on_launch(profile))
        self.launch_btn.grid(row=0, column=2, rowspan=2, padx=8, pady=8)
        self.more_btn = ctk.CTkButton(self, text="⋯", width=32, height=32,
                                       command=lambda: on_more(profile))
        self.more_btn.grid(row=0, column=3, rowspan=2, padx=(0, 12), pady=8)
        # hover 出现，default 50% opacity
        self.launch_btn.configure(text_color_disabled=color("fg_muted"))
```

#### 7.3.4 Toast

```python
class Toast:
    def __init__(self, root):
        self.root = root
        self.toasts = []  # [(widget, after_id)]

    def show(self, message: str, kind: str = "info", duration_ms: int = None):
        """右下角弹出 toast。"""
        if duration_ms is None:
            duration_ms = {"info": 3000, "success": 4000, "error": 6000, "warning": 5000}[kind]

        # 计算位置（堆叠往上）
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        x = screen_w - 380 - 20
        y_offset = sum(1 for w, _ in self.toasts) * 60
        y = screen_h - 80 - y_offset

        # 创建
        colors = {
            "info": color("accent"),
            "success": color("success"),
            "error": color("error"),
            "warning": color("warning"),
        }[kind]

        toast = ctk.CTkToplevel(self.root)
        toast.geometry(f"380x56+{x}+{y}")
        toast.overrideredirect(True)
        toast.attributes("-topmost", True)

        frame = ctk.CTkFrame(toast, fg_color=color("surface"),
                              corner_radius=8, border_width=1, border_color=colors)
        frame.pack(fill="both", expand=True, padx=0, pady=0)
        icon = ctk.CTkLabel(frame, text="✓" if kind == "success" else "ℹ",
                            text_color=colors, font=("Segoe UI Variable", 14))
        icon.pack(side="left", padx=(12, 8))
        msg = ctk.CTkLabel(frame, text=message, text_color=color("fg"),
                            font=("Segoe UI Variable", 12))
        msg.pack(side="left", fill="x", expand=True)
        close = ctk.CTkButton(frame, text="✕", width=24, height=24, text_color=color("fg_muted"),
                              fg_color="transparent", hover_color=color("bg_hover"),
                              command=lambda: self._dismiss(toast))
        close.pack(side="right", padx=(0, 8))

        self.toasts.append((toast, None))
        aid = self.root.after(duration_ms, lambda: self._dismiss(toast))
        self.toasts[-1] = (toast, aid)

    def _dismiss(self, toast):
        for w, aid in self.toasts:
            if w is toast:
                if aid:
                    self.root.after_cancel(aid)
                w.destroy()
                self.toasts.remove((w, aid))
                break
        # 重排剩余 toast
        for i, (w, _) in enumerate(self.toasts):
            screen_h = self.root.winfo_screenheight()
            y = screen_h - 80 - i * 60
            w.geometry(f"+{w.winfo_x()}+{y}")
```

#### 7.3.5 sessions.db

```python
import sqlite3
from pathlib import Path

DB_PATH = Path.home() / ".agent-box" / "sessions.db"

def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            cwd TEXT,
            mode TEXT,  -- 'new' | 'resume'
            pid INTEGER,
            launched_at TEXT NOT NULL,
            exited_at TEXT,
            exit_code INTEGER
        )
    """)
    conn.commit()
    return conn

def record_launch(profile, agent_type, cwd, mode, pid):
    conn = init_db()
    conn.execute(
        "INSERT INTO sessions (profile, agent_type, cwd, mode, pid, launched_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        (profile, agent_type, cwd, mode, pid),
    )
    conn.commit()
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0]

def record_exit(session_id, exit_code):
    conn = init_db()
    conn.execute(
        "UPDATE sessions SET exited_at = datetime('now'), exit_code = ? WHERE id = ?",
        (exit_code, session_id),
    )
    conn.commit()
```

### 7.4 集成 launch.py

`launch_profile()` 函数已存在（`gui-windows.py:124`），不需要改。P0 范围内只需：

- launch 前调 `record_launch(...)` 写一条
- launch 后台 task `record_exit(session_id, exit_code)` 监听进程退出

### 7.5 实施检查清单

按阶段 A → D 顺序：

#### 阶段 A（视觉重做）

- [ ] `pip install customtkinter`
- [ ] 创建 `theme.py`（配色 + tokens）
- [ ] `app.py` 框架：侧边栏 + 主内容区
- [ ] 5 个 nav 项 + 路由
- [ ] Profiles 页：横向 tab + profile 行（list）
- [ ] dark/light 主题切换
- [ ] 状态指示（status dot）
- [ ] 保留现有 launch 功能
- [ ] 状态栏底部（active 数量）

#### 阶段 B（核心功能）

- [ ] Profile 详情页（7 tab 框架）
- [ ] Meta tab（所有字段 + provider 下拉 + 快速操作）
- [ ] Settings tab（settings.json 可视化）
- [ ] CLAUDE.md tab（内置编辑器 + 实时保存）
- [ ] MCP / Skills / Hooks / Storage tab（只读 placeholder）
- [ ] 创建向导（4 步）
- [ ] 删除确认对话框
- [ ] Settings 页面（app 级）

#### 阶段 C（Sessions）

- [ ] `state.py` / sessions.db 工具
- [ ] 集成 launch 流程：写记录 + 监听退出
- [ ] Sessions 页：Active + Recent 区
- [ ] Open / Stop 按钮
- [ ] filter 下拉

#### 阶段 D（Home + 收尾）

- [ ] Home 页 4 模块
- [ ] 状态卡 / Quick launch / Recent activity / Agent type 分布
- [ ] 手动测试 checklist
- [ ] 单元测试（state.py, theme.py, fetch_profiles）
- [ ] 文档更新（README, gui-windows.py 顶部 docstring）

### 7.6 验证脚本

P0 完成时跑：

```bash
# 1. 启动 GUI
python gui-windows.py

# 2. 验证 checklist
# [ ] 启动后能看到侧边栏 5 项
# [ ] Profiles 页能看到 4 个 agent type tab
# [ ] 选中 tab 后列表筛选正确
# [ ] 点 profile 行打开详情页
# [ ] 7 个 tab 都能切换
# [ ] 编辑 CLAUDE.md 后看 dot-claude/CLAUDE.md 已更新
# [ ] 创建向导 4 步走完，新 profile 出现在列表
# [ ] Launch profile 后 sessions.db 写入一条
# [ ] 进程退出后 sessions.db 写入 exit_code
# [ ] Sessions 页能看到 Active 和 Recent
# [ ] Home 页 4 个模块都显示
# [ ] dark/light 切换正常
# [ ] 设置改完重启保留（meta.yaml）

# 3. 跑单元测试
python -m pytest tests/
```

---

## 8. 总结

P2 设计系统规范包含：

- **3 套配色方案**（Slate Indigo / Forest Teal / Mono Orange），每套 dark + light
- **完整 typography / spacing / radius / shadow 系统**（4px grid）
- **15 个组件规范**（按钮 / 输入 / 卡片 / tab / dialog / toast / ...）
- **图标系统**（agent type / 功能 / 状态 = emoji 方案）
- **6 个关键页面 ASCII 视觉稿**（Home / Profiles / 详情 / 向导 / MCP / CLAUDE.md / Sessions）
- **14 种动效规范**（时长 / 缓动 / 实现方式）
- **完整 Python 实现指导**（文件结构 / 关键类骨架 / CustomTkinter 技巧 / 实施检查清单）

P0 实施总工时：**11-16 工作日**（单人）。
