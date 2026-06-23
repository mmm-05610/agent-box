# cc-switch 视觉风格指南

> 目标：让 agent-box GUI 接近 cc-switch 的现代 shadcn/ui 风格
> 技术约束：CustomTkinter（无法用 Web 组件，只能用 Python 模拟）

---

## 0. cc-switch 视觉DNA

cc-switch 的核心视觉特征：

```
┌─────────────────────────────────────────────────────────────────┐
│  CC Switch                                          [−] [□] [×] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Claude Code                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ● Official Anthropic                              [⋯]  │   │
│  │    claude-sonnet-4-6                                    │   │
│  │    Last used: 2 hours ago                        [Enable]│   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ○ Custom Provider A                               [⋯]  │   │
│  │    deepseek-v3 / custom-endpoint                        │   │
│  │    Last used: yesterday                          [Enable]│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ Add Provider]                                               │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Codex                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ● OpenAI Official                                 [⋯]  │   │
│  │    codex-mini-latest                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**关键视觉语言：**

- 极简，大量留白
- 1px 细边框，低对比度
- 圆角 8px
- 灰度为主，强调色极少
- 字体：Inter / 系统无衬线
- 卡片无阴影或极微阴影

---

## 1. 色彩系统（cc-switch 风格）

### 1.1 Dark Mode（主要）

| Token          | Hex       | 用途                     |
| -------------- | --------- | ------------------------ |
| `bg`           | `#09090B` | 主背景（近纯黑）         |
| `bg_card`      | `#18181B` | 卡片背景                 |
| `bg_hover`     | `#27272A` | hover 态                 |
| `bg_active`    | `#3F3F46` | 选中/pressed             |
| `bg_input`     | `#27272A` | 输入框背景               |
| `border`       | `#27272A` | 边框（极低对比）         |
| `border_focus` | `#A1A1AA` | focus 态边框             |
| `fg`           | `#FAFAFA` | 主文本                   |
| `fg_muted`     | `#A1A1AA` | 次文本                   |
| `fg_subtle`    | `#71717A` | 弱文本                   |
| `primary`      | `#FAFAFA` | 主按钮（白色！不是紫色） |
| `primary_fg`   | `#18181B` | 主按钮文字（黑色）       |
| `accent`       | `#3B82F6` | 强调色（蓝色，极少用）   |
| `success`      | `#22C55E` | 成功/运行中              |
| `error`        | `#EF4444` | 错误                     |
| `warning`      | `#F59E0B` | 警告                     |

### 1.2 Light Mode

| Token          | Hex       | 用途               |
| -------------- | --------- | ------------------ |
| `bg`           | `#FFFFFF` | 主背景             |
| `bg_card`      | `#FFFFFF` | 卡片背景           |
| `bg_hover`     | `#F4F4F5` | hover 态           |
| `bg_active`    | `#E4E4E7` | 选中/pressed       |
| `bg_input`     | `#F4F4F5` | 输入框背景         |
| `border`       | `#E4E4E7` | 边框               |
| `border_focus` | `#71717A` | focus 态边框       |
| `fg`           | `#09090B` | 主文本             |
| `fg_muted`     | `#71717A` | 次文本             |
| `fg_subtle`    | `#A1A1AA` | 弱文本             |
| `primary`      | `#18181B` | 主按钮（黑色）     |
| `primary_fg`   | `#FAFAFA` | 主按钮文字（白色） |
| `accent`       | `#2563EB` | 强调色             |

### 1.3 与当前 Slate Indigo 的对比

| 方面   | Slate Indigo        | cc-switch 风格          |
| ------ | ------------------- | ----------------------- |
| 主背景 | `#0F1115`（偏蓝灰） | `#09090B`（纯黑）       |
| 主色   | `#7B6CF6`（紫色）   | `#FAFAFA`（白色/黑色）  |
| 边框   | `#2A2F38`（可见）   | `#27272A`（几乎不可见） |
| 卡片   | 有边框 + hover 变色 | 极简边框 + 微妙 hover   |
| 强调色 | 紫色为主            | 蓝色，极少使用          |

---

## 2. 字体系统

### 2.1 cc-switch 字体

cc-switch 使用 **Inter**（Web 标准字体）。在 CustomTkinter 中，我们用系统字体模拟：

```python
# Windows 11
FONT_SANS = "Segoe UI Variable"      # 最接近 Inter
FONT_SANS_FALLBACK = "Segoe UI"       # Windows 10

# macOS
FONT_SANS = "SF Pro Display"          # Apple 系统字体
FONT_SANS_FALLBACK = "Helvetica Neue"

# Linux
FONT_SANS = "Inter"                   # 如果安装了
FONT_SANS_FALLBACK = "Noto Sans"
```

### 2.2 字号层级（cc-switch 风格）

| Token       | Size | Weight | 用途             |
| ----------- | ---- | ------ | ---------------- |
| `text-xs`   | 11px | 400    | 辅助文本、时间戳 |
| `text-sm`   | 12px | 400    | 次要文本、描述   |
| `text-base` | 13px | 400    | 正文             |
| `text-md`   | 14px | 500    | 列表项标题       |
| `text-lg`   | 16px | 600    | 卡片标题         |
| `text-xl`   | 18px | 600    | 页面标题         |
| `text-2xl`  | 24px | 700    | 大标题           |

### 2.3 关键变化

**Before（当前）：**

- 标题用粗体（bold/700）
- 正文 13px

**After（cc-switch 风格）：**

- 标题用 semibold（600），不是 bold
- 正文 13-14px
- 字间距更宽松
- 更多使用 `fg_muted` 而非 `fg`

---

## 3. 组件风格

### 3.1 卡片

**cc-switch 风格：**

```python
# 极简卡片：纯背景 + 1px 边框 + 8px 圆角
Card(
    fg_color=C("bg_card"),        # 不是 bg_elevated
    corner_radius=8,              # 不是 12
    border_width=1,
    border_color=C("border"),     # 极低对比度
)
```

**关键区别：**

- 无 hover 变色（或极微妙）
- 无阴影
- 边框几乎不可见
- 内容靠左对齐，不是居中

### 3.2 按钮

**cc-switch 风格的按钮：**

| 类型        | 样式                                | 用途       |
| ----------- | ----------------------------------- | ---------- |
| Primary     | 白底黑字（dark）/ 黑底白字（light） | 主操作     |
| Secondary   | 透明底 + 边框                       | 次要操作   |
| Ghost       | 透明底，无边框                      | 最次要操作 |
| Destructive | 红底白字                            | 危险操作   |

**关键区别：**

- Primary 按钮不是紫色，是白色/黑色
- 按钮高度 36px（不是 32px）
- 圆角 6px（不是 8px）
- 字重 500（medium），不是 700（bold）

### 3.3 列表项（Profile Row）

**cc-switch 风格：**

```
┌─────────────────────────────────────────────────────────────────┐
│  ● Official Anthropic                                           │
│    claude-sonnet-4-6 · Last used 2h ago                 [Enable]│
└─────────────────────────────────────────────────────────────────┘
```

**关键特征：**

- 状态点在最左侧（小，8px）
- 名称用 `text-md`（14px, medium）
- 描述用 `text-sm`（12px, muted）
- 操作按钮在最右侧
- hover 时背景微变（`bg_hover`）
- 选中时有左边框强调（不是背景变色）

### 3.4 Tab

**cc-switch 风格：**

```
Claude Code    Codex    Gemini CLI    OpenCode
──────────
```

**关键特征：**

- 选中态：底部 2px 白色/黑色条 + 文字变 `fg`
- 未选中：文字 `fg_muted`，无底部条
- Tab 之间间距 24px
- 无计数显示（或用小灰字）

### 3.5 输入框

**cc-switch 风格：**

```
┌─────────────────────────────────────────┐
│  API Key                                │
│  ┌─────────────────────────────────┐   │
│  │  sk-ant-api03-...               │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**关键特征：**

- 标签在输入框上方（不是左侧）
- 输入框背景 `bg_input`
- 边框 1px `border`
- focus 时边框变 `border_focus`
- 圆角 6px
- 高度 36px

---

## 4. 布局风格

### 4.1 整体布局

**cc-switch 风格：**

- 无侧边栏（或极窄的 tab 导航）
- 内容居中，最大宽度 640-800px
- 大量留白
- 分组用标题 + 卡片列表

**agent-box 适配：**

- 保留侧边栏（因为有 5 个顶级页面）
- 但侧边栏更窄（180px → 160px）
- 内容区更紧凑

### 4.2 间距

| Token     | 值   | 用途       |
| --------- | ---- | ---------- |
| `space-1` | 4px  | 最小间距   |
| `space-2` | 8px  | 紧凑间距   |
| `space-3` | 12px | 列表项间距 |
| `space-4` | 16px | 卡片内边距 |
| `space-6` | 24px | 区块间距   |
| `space-8` | 32px | 页面边距   |

### 4.3 圆角

| Token       | 值   | 用途            |
| ----------- | ---- | --------------- |
| `radius-sm` | 4px  | 小元素（badge） |
| `radius-md` | 6px  | 按钮、输入框    |
| `radius-lg` | 8px  | 卡片            |
| `radius-xl` | 12px | 大卡片、模态框  |

---

## 5. 实施清单

### 5.1 Theme 改造

```python
# gui/theme.py — cc-switch 风格
DARK = {
    "bg":           "#09090B",
    "bg_card":      "#18181B",
    "bg_hover":     "#27272A",
    "bg_active":    "#3F3F46",
    "bg_input":     "#27272A",
    "border":       "#27272A",
    "border_focus": "#A1A1AA",
    "fg":           "#FAFAFA",
    "fg_muted":     "#A1A1AA",
    "fg_subtle":    "#71717A",
    "primary":      "#FAFAFA",
    "primary_fg":   "#18181B",
    "accent":       "#3B82F6",
    "success":      "#22C55E",
    "error":        "#EF4444",
    "warning":      "#F59E0B",
}

LIGHT = {
    "bg":           "#FFFFFF",
    "bg_card":      "#FFFFFF",
    "bg_hover":     "#F4F4F5",
    "bg_active":    "#E4E4E7",
    "bg_input":     "#F4F4F5",
    "border":       "#E4E4E7",
    "border_focus": "#71717A",
    "fg":           "#09090B",
    "fg_muted":     "#71717A",
    "fg_subtle":    "#A1A1AA",
    "primary":      "#18181B",
    "primary_fg":   "#FAFAFA",
    "accent":       "#2563EB",
    "success":      "#16A34A",
    "error":        "#DC2626",
    "warning":      "#D97706",
}
```

### 5.2 组件改造

| 组件             | 改动                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| `Card`           | `fg_color=C("bg_card")`，圆角 8px，边框色 `C("border")`               |
| `primary_button` | `fg_color=C("primary")`（白色），`text_color=C("primary_fg")`（黑色） |
| `ghost_button`   | 透明背景，无边框                                                      |
| `StatusPill`     | 更小（8px 圆点），更低调                                              |
| `Badge`          | 更小，更紧凑                                                          |
| `ProfileRow`     | 去掉 hover 变色，只保留微妙的背景变化                                 |
| `Tab`            | 底部条更细（2px），颜色用 `fg` 而非 `primary`                         |

### 5.3 字体改造

```python
# 更接近 Inter 的字重
FONT_SANS = ("Segoe UI Variable", 13, "normal")
FONT_SANS_MEDIUM = ("Segoe UI Variable", 13, "medium")    # 新增
FONT_SANS_SEMIBOLD = ("Segoe UI Variable", 13, "semibold") # 新增
FONT_SANS_BOLD = ("Segoe UI Variable", 13, "bold")

# 标题用 semibold，不是 bold
FONT_TITLE = ("Segoe UI Variable", 18, "semibold")
FONT_SUBTITLE = ("Segoe UI Variable", 14, "semibold")
```

---

## 6. 视觉对比

### Before（当前 Slate Indigo）

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚡ Agent Box                                                    │
│                                                                 │
│ ▎🏠 Home                                                        │
│ ▎📁 Profiles     ← 紫色强调条                                   │
│ ▎📊 Sessions                                                   │
│ ▎⚙ Settings                                                    │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ●  DW (CC)                              [▶ Launch]          │ │
│ │    Running · 2h 13m                                         │ │
│ │    ~/projects/dw                              [Edit ⋯]      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 紫色主题，强调色明显，边框可见                                   │
└─────────────────────────────────────────────────────────────────┘
```

### After（cc-switch 风格）

```
┌─────────────────────────────────────────────────────────────────┐
│ Agent Box                                                       │
│                                                                 │
│ Home                                                            │
│ Profiles     ← 底部 2px 白色条                                  │
│ Sessions                                                        │
│ Settings                                                        │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ● DW                                                        │ │
│ │   CC · Running · 2h 13m                            [Launch] │ │
│ │   ~/projects/dw                                    [⋯]      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 纯黑/纯白，极简，边框几乎不可见，强调色极少                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 注意事项

1. **CustomTkinter 限制** — 无法实现 Web 的精细控制（如精确的 border-radius、box-shadow）
2. **字体渲染** — Windows 上 Segoe UI Variable 渲染质量好，接近 Inter
3. **颜色精度** — CustomTkinter 支持 hex 色，可以精确匹配
4. **圆角** — CustomTkinter 的 `corner_radius` 是像素值，可以直接用
5. **边框** — `border_width` 和 `border_color` 可以精确控制
