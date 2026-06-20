# DW 任务：agent-box 美工设计 + 功能扩展方向

## 项目背景

agent-box 是一个 WSL agent 配置目录隔离启动器。用 bwrap bind-mount 实现每个 agent（CC/Codex/Hermes/OpenCode）的多角色 profile 隔离。当前 Windows GUI（gui-windows.py）是 Tkinter 写的，功能最简：按 agent type 分组列出 profile，每行一个 Launch 按钮 + 新会话/继续上次下拉框 + 目录选择器。

GUI 代码是 Windows Python + Tkinter，零依赖。通过 wsl.exe 调用 WSL 内的 agent-box CLI。源码在 `/home/maoqh/projects/agent-box/gui-windows.py`。

## 任务分两阶段

### 阶段 1：功能扩展方向调研 + 原型设计

用多个 subagent 并行调研，然后 synthesize 出一份"功能扩展方向 + 产品原型"方案。包括但不限于：

**研究方向（至少 3 个子方向并行）：**

1. **竞品调研** — cc-switch 的功能清单、OpenCode GUI、VS Code 的 profile 管理、Docker Desktop 的容器管理 GUI。它们分别提供了什么功能？agent-box 可以借鉴什么？
2. **用户需求挖掘** — 从现有 `~/ai-runtime/start.sh` 的交互流程、cc-switch 的使用模式、日常开发中反复切换 agent/profile/project 的场景出发，推断 agent-box 还需要什么功能（profile 创建向导？配置编辑？会话管理？MCP server 管理？批量启动/team 模式？）
3. **技术可行性评估** — Tkinter 能做到什么程度的 UI？是否需要迁移到其他框架（CustomTkinter / PyQt / Electron / Tauri / Web-based）？如果要做好看，迁移成本多大？Windows 原生控件 vs 自绘 UI 的取舍？

**原型设计方向（至少 3 个子方向并行）：**

4. **信息架构** — agent-box 的信息层级是什么？主页应该展示什么？二级页面是什么？导航方式？
5. **交互流程原型** — 关键操作（创建 profile、切换 provider、编辑配置、启动 agent、多 agent team 模式）的用户旅程
6. **布局方案** — 至少出 3 套不同的布局方案（侧边栏导航 / 顶部 Tab / 仪表盘卡片 / 两栏布局），各有优缺点

**阶段 1 产物**：

将这些 subagent 的结果 synthesize，产出一份"agent-box 功能扩展方向 + 交互原型方案"，包含：

- 功能优先级矩阵（P0/P1/P2）
- 信息架构图
- 关键交互流程
- 至少 2 套布局方案对比推荐

**阶段 1 完成后，必须暂停并展示给我审批。不要进入阶段 2 直到我说通过。**

---

### 阶段 2：完整设计规范 + 组件库 + 视觉方案

我审批通过阶段 1 后，进入阶段 2。用更多 subagent 并行跑：

**视觉设计方向（至少 4 个子方向并行）：**

7. **配色方案** — 至少 3 套完整的亮色/暗色配色方案（每套包含：主色、辅色、背景色、文字色、边框色、强调色、成功/警告/错误色）。参考 VS Code 主题、Linear、Figma、Arc Browser 的设计语言
8. **字体与排版规范** — 字号层级、字重、行高、间距系统（4px/8px grid）、圆角规范、阴影规范
9. **组件库** — 完整的 UI 组件规范：按钮（primary/secondary/ghost/danger）、输入框、下拉框、卡片、标签、徽章、开关、对话框、通知 Toast、进度条、列表项、分组标题、侧边栏、导航栏。每个组件注明尺寸、状态（hover/focus/active/disabled）、颜色映射
10. **图标系统** — agent type 图标（CC/Codex/Hermes/OpenCode 各一个）、功能图标（启动、停止、编辑、删除、加号、刷新、目录、设置）、状态图标（运行中/已停止/错误）

**视觉原型方向（至少 3 个子方向并行）：**

11. **主页视觉稿** — 基于阶段 1 确定的布局，出完整的主页视觉设计（ASCII art 或描述性渲染，精确到每个像素块的布局）
12. **关键页面视觉稿** — Profile 创建向导、配置编辑页、Team 模式页
13. **交互动效描述** — 按钮 hover/press 效果、页面切换动画、卡片展开/收起、Toast 弹出/消失、加载状态

**阶段 2 产物**：

- 完整的设计规范文档（Design System）
- 组件库 catalog
- 关键页面视觉稿
- 一份 `gui-redesign.py` 的实现建议（哪些改 CSS/样式，哪些改布局结构）

---

## 执行要求

1. **必须使用 Workflow 功能**，每个阶段内用 pipeline/parallel 跑 subagent
2. **Subagent 能并行就并行**，不要串行
3. **完全不用考虑 token 消耗和时间**，尽量多的 agent、尽量多的研究维度
4. **阶段 1 的每个子方向可以再拆分子 agent**（比如竞品调研可以拆成：cc-switch 功能调研 agent、OpenCode GUI 调研 agent、VS Code Profile 机制调研 agent，并行跑）
5. **设计规范要具体到可执行**，不要泛泛而谈
6. **每份产物要标注信息来源或推理依据**
7. **最终产物要求精致、完整、可直接用于实现**
