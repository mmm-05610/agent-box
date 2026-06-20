# agent-box Windows GUI — Redesign Phase 1

> 阶段 1 交付：功能扩展方向 + 交互原型方案（**已通过对话确认最终决策**）
>
> 日期：2026-06-20
> 状态：✅ 决策已全部确认
> 关联：`docs/specs/dw-design-prompt.md`、`docs/specs/windows-gui.md`、`docs/ROADMAP.md`

---

## 0. 战略定位（核心）

### 0.1 一句话定位

> **agent-box 是给"需要给每个 agent 角色做深度配置"的 power user 使用的隔离配置管理工具。**

**不是** cc-switch 的替代品，**不是**竞品关系，**不**做"取代/挑战"叙事。

### 0.2 用户分层

| 工具               | 用户群       | 解决的问题                          | 粒度                                                |
| ------------------ | ------------ | ----------------------------------- | --------------------------------------------------- |
| cc-switch（105k★） | 普通用户     | 简单切换 API key / model            | agent 系统层（整个 Claude Code）                    |
| **agent-box**      | **深度用户** | **给每个 agent 角色做完整深度配置** | **identity 层**（DW/decision/spec-writer 各自独立） |

### 0.3 最重要的现实

> **用户自己就是主要用户**（dogfooding）。

含义：

- 不需要为"假想的其他 power user"过度设计
- 可以做最 opinionated 的工具
- 验证标准 = 自己用得爽，不是用户访谈
- 决策收敛快 — 不需要 A/B 测试，用户自己能立刻判断

### 0.4 风险认知

power user 市场**现在小**（niche 早期），但用户判断"过段时间会有人琢磨这个事"。agent-box 提前占位。GUI 做得"够 power user" 比"够普及"重要。

---

## 1. 不做什么（关键决策）

| #    | 不做                     | 理由                                                                                       |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------ |
| 1.1  | 全局 provider 切换       | agent-box 的 provider 是 **profile 级别属性**，不是顶层对象；全局切换会污染 bwrap 隔离边界 |
| 1.2  | 持续云同步               | profile 是 ≥10MB 目录树，sync 体验差；个人工具跨设备场景稀少                               |
| 1.3  | 用量仪表盘（本轮）       | P2 可选（用脚本式代理加）；P0 不做                                                         |
| 1.4  | 系统托盘快速切换         | profile 数量小（5-20），主窗口够用；托盘是普通用户便利功能                                 |
| 1.5  | Web Server 模式          | agent-box 是 Windows + WSL 桌面工具，**不要 web / 远程 / 手机 surface**                    |
| 1.6  | 资源池 / 跨 profile 共享 | **P0 完全无视，做彻底隔离**；P2 再考虑                                                     |
| 1.7  | Welcome 屏 / 引导        | P1 才有；P0 极简空状态（"No profiles yet" + [+ New Profile]）                              |
| 1.8  | MCP 服务器编辑           | **整个推 P1**；P0 MCP tab 只读 placeholder                                                 |
| 1.9  | Team 模式                | **推迟到 P2**；本轮专注单 agent 配置管理打磨                                               |
| 1.10 | "取代 cc-switch"叙事     | 见 0.1；niche 工具不参与大众市场叙事                                                       |

---

## 2. 信息架构（已定）

### 2.1 顶层侧边栏（5 项）

```
┌──────────┐
│ [logo]   │
│ Home     │   ← 仪表盘：状态卡 + Quick launch + Recent + 分布图
│ Profiles │   ← profile 列表（主要操作区）
│ Sessions │   ← 跨 profile 的 launch 监控（Active + Recent）
│ Settings │   ← app 级配置：主题 / WSL / 默认行为
│ Help     │   ← 文档 / 快捷键 / 关于
│          │
│ ● N run  │   ← 底部状态指示（active 数量）
└──────────┘
```

**MCP / Skills / Hooks / CLAUDE.md / settings.json 都是 profile 详情页的 tab，不是侧边栏一级项**。

### 2.2 Profiles 页 = 横向 agent type tab

```
┌──────┬──────┬────────┬──────────┬──────┐
│ All  │  CC  │ Codex  │ Hermes   │ OpenCode│
│  12  │  5   │  2     │  1       │  4    │
└──────┴──────┴────────┴──────────┴──────┘
```

设计依据：UI 结构镜像文件系统结构（每个 agent type 一个目录），**隔离感更强**。power user 配 30+ profile 不慌。

### 2.3 Profile 详情页 = 7 tab

```
[Meta] [Settings] [CLAUDE.md] [MCP] [Skills] [Hooks] [Storage]
```

| Tab           | P0 范围                                                            |
| ------------- | ------------------------------------------------------------------ |
| **Meta**      | name / display_name / provider / description / 时间戳 / 快速操作   |
| **Settings**  | settings.json 可视化（env 块、permissions、alwaysThinkingEnabled） |
| **CLAUDE.md** | 内置 Markdown 编辑器（实时保存 + preview toggle）                  |
| **MCP**       | 只读 placeholder（P1 才有完整编辑）                                |
| **Skills**    | 只读列表                                                           |
| **Hooks**     | 只读列表 + 简单 toggle                                             |
| **Storage**   | profile 目录大小、文件浏览                                         |

---

## 3. 视觉与布局

### 3.1 主布局

**单窗口 + 左侧栏（200px）+ 主内容区**（VS Code / Linear 风格）

理由：10 个一级导航项只有侧栏放得下；跟 cc-switch / OpenCode 桌面 / Docker Desktop 视觉一致。

### 3.2 Home 页

```
┌──────────────────────────────────────────────────────────┐
│  Welcome back                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│  │  3 run   │ │ 12 profs │ │  WSL ✓   │                  │
│  └──────────┘ └──────────┘ └──────────┘                  │
│                                                            │
│  Quick launch (Pinned)                                    │
│  ⭐ DW    ⭐ decision   ⭐ spec                            │
│                                                            │
│  Recent activity                                          │
│  ● DW (cc)        14:32  resume  2h 13m                  │
│  ● spec (codex)   11:08  new      31m                    │
│                                                            │
│  Agent type distribution                                  │
│  CC ███████ 5   Codex ██ 2                                │
│  Hermes █ 1   OpenCode ████ 4                             │
└──────────────────────────────────────────────────────────┘
```

- 状态卡 3 个
- Quick launch 复用最近 5 个 launch（P1 再加 pin 功能）
- Recent activity 复用 sessions.db
- Agent type 分布用条形图

---

## 4. 技术栈

### 4.1 首选 CustomTkinter

| 方案          | 视觉 | 实施  | 部署        | 学习 | 维护 | 决定               |
| ------------- | ---- | ----- | ----------- | ---- | ---- | ------------------ |
| CustomTkinter | 80%  | 低    | pip install | 平缓 | 低   | ✅ **P0**          |
| PySide6       | 95%  | 中-高 | ~50MB       | 较陡 | 中   | ❌                 |
| Tauri         | 100% | 高    | ~10MB       | 陡   | 高   | ❌（双语言污染）   |
| Electron      | 100% | 高    | ~100MB      | 中   | 高   | ❌（违背轻量哲学） |
| NiceGUI       | 85%  | 中    | pip install | 平缓 | 低   | ❌（web 包袱）     |

**CustomTkinter 关键优势**：还是 Python，零 CLI 依赖变化；dark/light 主题开箱即用；80% 视觉收益 / 10% 实施成本。

**Fallback**：如果 CustomTkinter 性能不够（复杂动画/canvas），可切 PySide6（agent-box CLI 没依赖 GUI 库，切换无成本）。

---

## 5. 竞品借鉴

| 来源                 | 借鉴                                                     | P 优先级 |
| -------------------- | -------------------------------------------------------- | -------- |
| **cc-switch**        | Provider 切换、shadcn/ui 视觉风格                        | P0       |
| **cc-switch**        | MCP 服务器管理（双向同步，agent-box 简化为 per-profile） | P1       |
| **cc-switch**        | CLAUDE.md 编辑                                           | P0       |
| **OpenCode**         | Tauri 桌面 Beta 视觉参考                                 | P0 风格  |
| **OpenCode**         | Session 心智模型                                         | P0       |
| **VS Code Profiles** | Profile 导入/导出（tar.gz）                              | P1       |
| **VS Code Profiles** | Profile icon / emoji                                     | P1       |
| **VS Code Profiles** | 临时 profile                                             | P2       |
| **Docker Desktop**   | 状态指示（green/gray/yellow/red）                        | P0       |
| **Docker Desktop**   | Logs 内嵌（read-only stdout tail）                       | P1       |
| **Docker Desktop**   | 快捷按钮 hover 出现                                      | P0       |
| **Docker Desktop**   | 状态过滤（All / Active）                                 | P0 简化  |

---

## 6. 关键交互流程（P0 范围 6 个，P1+ 2 个）

### 6.1 创建新 profile（4 步向导）

```
Step 1/4: 选 agent type  →  卡片网格（默认选中当前 tab）
Step 2/4: 基本信息       →  name + display_name
Step 3/4: 选 provider    →  预设列表 + 搜索
Step 4/4: 选 CLAUDE.md   →  模板列表（空白 / decision / DW / spec-writer）
```

实时校验 name（重名 / 字符 / 长度）。完成后自动跳到 profile 详情页。

### 6.2 Launch profile（最高频，< 1s）

- **单击 [▶] 按钮** = 默认 launch（用 last_mode + last_cwd，记忆在 meta.yaml）
- **长按 / 右键** = mini popup，可选 New / Resume last / Pick session / 改 cwd / 填 extra args
- spawn `wsl.exe bash -lc "cd ... && agent-box launch <name> [--resume]"`

### 6.3 切换 provider（per-profile）

profile 详情 → Meta tab → Provider 字段下拉 → 写入 profile 的 settings.json。**P0 范围：仅预设切换**（P1 再加 "+ Add custom provider"）。

### 6.4 编辑 MCP servers — **整个推 P1**

P0 范围内 MCP tab 只读：

```
MCP management is coming in a future release.
For now, edit mcp.json directly:
  /home/maoqh/.agent-box/profiles/DW/dot-claude/.mcp.json
Or use CLI:  agent-box edit DW
[📋 Copy path]  [📂 Open in Explorer]
```

### 6.5 Team 模式 — **P2**

推迟到 P2。本轮 P0 范围不规划。

### 6.6 编辑 CLAUDE.md（内置编辑器）

```
[B] [I] [S] [Link] [Code]   [👁 Preview]
─────────────────────────────────────
# 你是 DW 执行者

核心职责：
- 编排多步骤任务
- ...
```

实时保存（debounce 1s）+ 状态指示（saving/saved/error）+ Preview toggle。

P0 范围：4 个基础按钮 + 实时保存 + preview。P1 加：语法高亮 / 模板片段 / 多文件 tab / 撤销重做。

### 6.7 导入/导出 — **P1**

P0 范围不实现。spec 注明 P1 待做。

### 6.8 首次启动 / 空状态（极简）

```
[+ New Profile]   🔍 Search (灰显)
─────────────────────────────────
No profiles yet.

Create one to get started.
```

无 Welcome 屏，无 onboarding，无引导文案。

---

## 7. 功能优先级矩阵

### P0（本轮 GUI，8 项）

| #    | 功能                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------- |
| P0-1 | 侧边栏导航（5 项）                                                                                   |
| P0-2 | Profiles 页横向 agent type tab                                                                       |
| P0-3 | Profile 列表 + 状态指示                                                                              |
| P0-4 | Profile 详情页（7 tab：Meta / Settings / CLAUDE.md / MCP 只读 / Skills 只读 / Hooks 只读 / Storage） |
| P0-5 | Profile 创建向导（4 步）                                                                             |
| P0-6 | Provider 切换（per-profile，仅预设）                                                                 |
| P0-7 | 内置 Markdown 编辑器（CLAUDE.md）                                                                    |
| P0-8 | dark/light 主题切换                                                                                  |

### P1（下一轮，6 项）

| #    | 功能                                           |
| ---- | ---------------------------------------------- |
| P1-1 | MCP 服务器管理（添加/删除/启用/禁用）          |
| P1-2 | Profile 导入/导出（tar.gz）                    |
| P1-3 | Profile icon / emoji                           |
| P1-4 | Sessions 页 Logs 内嵌（read-only stdout tail） |
| P1-5 | Skill / Hook 编辑器（profile 详情 tab 升级）   |
| P1-6 | Welcome 屏 + 引导（P0 用极简空状态代替）       |

### P2（以后，8 项）

| #    | 功能                                 |
| ---- | ------------------------------------ |
| P2-1 | Team 模式（多 profile 同步启动）     |
| P2-2 | 临时 profile                         |
| P2-3 | 资源池 / 跨 profile 共享             |
| P2-4 | 跨 agent type 资源共享               |
| P2-5 | Session 历史（增强：完整 + 筛选）    |
| P2-6 | 用量仪表盘（脚本式）                 |
| P2-7 | Embedded terminal（pywinpty 完整版） |
| P2-8 | Agent 间通信（你提到的未来方向）     |

---

## 8. 实施路径（4 阶段）

| 阶段               | 内容                                                                             | 天数             |
| ------------------ | -------------------------------------------------------------------------------- | ---------------- |
| **A：视觉重做**    | 迁移 CustomTkinter + 侧边栏 + 横向 tab + dark/light + 状态指示 + 保留现有 launch | 2-3              |
| **B：核心功能**    | Profile 详情页 7 tab + 创建向导 + provider 切换 + Settings 页 + 删除             | 5-7              |
| **C：Sessions 页** | 顶层 Sessions + Active/Recent + sessions.db 写入 + Open/Stop 操作                | 2-3              |
| **D：Home + 收尾** | Home 页 4 模块 + 手动测试 + 单元测试 + 文档更新                                  | 2-3              |
| **合计**           |                                                                                  | **11-16 工作日** |

注：原 spec 的 "15-23 天" 估算因为 team 推迟 + MCP 推迟 + 简化 Welcome 已经下调。

---

## 9. 风险

| 风险                      | 等级   | 缓解                                                  |
| ------------------------- | ------ | ----------------------------------------------------- |
| CustomTkinter canvas 性能 | 中     | fallback PySide6（agent-box CLI 无 GUI 依赖）         |
| WSL 调用延迟              | 低     | 启动调一次 + 缓存；launch 异步                        |
| ~~cc-switch 碾压用户~~    | ~~高~~ | **已重定义为 niche 不竞品**（C1.2 / 0.4）             |
| Profile 数量大（>50）     | ~~中~~ | **已被 C2.2 横向 tab 设计解决**（每 tab 5-10 个）     |
| 大配置文件（>1MB）        | ~~低~~ | **几乎不存在**（真 power user 不会写 1MB CLAUDE.md）  |
| WSL 网络/挂载失败         | 中     | launch 后状态变 "⚠ error"，profile 详情页显示上次错误 |

---

## 10. 关键设计要点（贯穿全文）

1. **Profile 是一等公民** — 所有 UI 围绕 profile 展开
2. **隔离 > 共享** — 任何"要不要共享"的问题，默认选不共享
3. **深 > 易** — power user 视角下的"深"比普通用户视角下的"易"重要
4. **dogfooding** — 用户自己用得爽是唯一验证标准
5. **P0 极简** — 砍掉所有"锦上添花"功能（Welcome 屏、MCP 编辑、Team、系统托盘）

---

## 11. 下一步：阶段 2

阶段 2 启动条件：本 spec 已通过对话确认 ✅。可直接进入 P2。

P2 范围（7 个并行子方向 + 1 合成）：

1. 配色方案（3 套 light/dark pair）
2. 字体与排版规范
3. 组件库 catalog
4. 图标系统
5. 关键页面视觉稿（Home / Profiles / 详情 / 创建向导 / MCP placeholder / Settings）
6. 交互动效
7. gui-redesign.py 实现建议

最终交付：`docs/specs/gui-redesign-p2.md`（设计系统规范文档 + 组件库 + 关键页面 ASCII 视觉稿 + Python 实现指导）。
