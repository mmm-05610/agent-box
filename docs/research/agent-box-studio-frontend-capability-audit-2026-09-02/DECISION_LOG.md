# 决策日志（Phase 1 审计）

> 每次用户裁决记录一行。格式：
> Decision ID / Date / Topic / Options / Chosen / Reason / Consequences / Affected matrix rows / Revisit trigger

## 决策记录

### D-005 · 2026-09-02 · Q3 裁决：主区单会话 + 右侧多功能面板（标签页住面板，不属会话）
- **Topic**：Q3 主区模型（单会话 vs 多标签 vs 钉住条）。
- **Options**：A 纯单会话 / B 保留多标签 / C 单会话+钉住条
- **Chosen**：**A + 右侧面板标签**——主区一次只有一个 main 会话；ZCode 右上角“切换面板”按钮展开的右侧区域**保留**，其内是标签页（基准截图含：辅助对话、审查、终端、浏览器）。
- **Reason**：用户裁决——“那里可以放标签页，主区一个 main 会话就够了”。
- **Consequences**：
  - **Q1 消解**：不存在会话标签集 → `save_opened_tabs`/`list_opened_tabs`/`tabs://changed` CAS+三向合并协议整体不迁移。恢复 = 每项目“最后活跃会话”（设备本地即可）。
  - `tabs:restore` → REMOVE（替代能力 `session:restore-last`）；`tabs:cross-client-sync` → REMOVE；`tabs:active-folder` → REDESIGN（activeProject 由当前会话派生）。
  - Codeg 的 TabBar、分屏（split）、`KeptMountedSurface` 隐藏保活机制全部不迁移。
  - 后台会话不断线：由后端连接保活 + 切回时快照重连（Phase 4 attach 协议）承担，前端不再做隐藏保活。
  - 新增 `shell:aux-panel`：右侧面板带标签头，由 Codeg 的 AuxPanel（右侧）+ TerminalPanel（底部条）改型合并；终端从底部移入面板。四个标签（辅助对话/审查/终端/浏览器）在各自 Phase 审内容。
- **Affected matrix rows**：tabs:restore、tabs:cross-client-sync、tabs:active-folder、session:restore-last（新增）、shell:aux-panel（新增）
- **Revisit trigger**：若未来要求两个会话并排（真分屏），回本决策重开。

### D-004 · 2026-09-02 · Shell 布局改型：ZCode 款顶栏 + 项目/会话侧栏
- **Topic**：应用外壳（顶栏 + 侧栏）整体采用 ZCode 布局（用户提供 ZCode 截图为基准）。
- **Chosen**：**改型**。顶栏 = 单条横幅承载 Logo + 后退/前进导航 + 当前会话标题 + `项目@主机` 上下文 + git 分支选择器 + 面板开关 + 窗口控件；侧栏 = 新建会话 / 搜索(Ctrl+K) / 自动化 / 插件市场 + “分组|项目”切换 + 项目→会话两级树（项目带远程 origin 云图标）+ 任务区。
- **Reason**：用户裁决——喜欢 ZCode 布局，顶部和侧边栏都要同款。
- **Consequences**：
  - Codeg 现有 shell 部件全部重画/替换：FolderTitleBar、TabBar 顶部条、LeftEdgeChrome/RightEdgeChrome（四角悬浮）、WorkbenchRouteStrip → 统一顶栏；sidebar.tsx 列表区 → 项目/会话树。
  - 新增能力行：shell:top-bar（REDESIGN，含 Codeg 没有的后退/前进导航）；侧栏改型由 workspace:folder-list（REDESIGN，D-003）覆盖。
  - “插件市场”导航项：与 Agent-Box Extension Kernel 天然契合（generic registration/catalog），记为 P3 新能力候选，Phase 10 细化。
  - ZCode 顶栏的前提是**无标签条**——主区单会话 vs 多标签未决（见 OPEN_QUESTIONS Q3），此决策的最终形态依赖 Q3。
- **Affected matrix rows**：shell:top-bar（新增）、shell:sidebar-nav（新增）、workspace:folder-list（已 REDESIGN）、sidebar:open-close（保留，宽度/开合语义不变）
- **Revisit trigger**：Q3 裁决后回写本决策的顶栏组成（有无标签条）。

### D-003 · 2026-09-02 · Folder → Project（领域模型根改型）
- **Topic**：侧栏主轴与工作区身份：Codeg 的 Folder 概念改为 ZCode 式 **Project**；新建（"+"）支持 本地文件夹 + 远程连接（SSH / WSL / Docker 向导：选择方式→填写配置→连接中→选择目录）。
- **Options**：A 保留 Folder 概念 / B Project 改型（ZCode 式）/ C 折中（Folder 保留 + 远程入口另列）
- **Chosen**：**B — Project 改型**。侧栏以“项目 → 会话”为主轴（参照 ZCode，用户提供了 ZCode 侧栏与远程连接向导截图作为基准）。
- **Reason**：用户裁决。“打开文件夹”的文件夹中心模型不喜欢；项目是一等公民，会话挂在项目下；项目可以来自本地目录或远程主机。
- **Consequences**：
  - 领域对象改名/改型：`FolderDetail` → `Project {id, name, origin: local | ssh | wsl | docker, …}`；会话按项目聚合（替代 folder 分组带成为主轴）。
  - 现有 Codeg 远程机制是**另一种架构**：`RemoteWorkspaceConnection {base_url, token}` = 远端跑一整个 codeg-server，窗口只是遥控器（RemoteDesktopTransport 把全部 API/文件操作指到远端，transport/index.ts:73-85）。ZCode 式 = **界面在本地，每个项目指定代码所在主机**。Agent-Box 采用后者 → 远程项目的 harness/git/terminal/文件都要在项目所属主机上执行。此项是 Phase 9 的核心议题，本轮只记录产品意图，**不冻结设计**。
  - `workspace:folder-list` 行 disposition 改为 REDESIGN；新增 `workspace:remote-project` 行（预审区）。
  - Q2 范围收窄：从“folder 注册表归谁”变为“**Project 注册表**归谁（Studio Backend DB vs 设备本地）”，仍开放。
  - D-DEFER-001（分组带 drag 布局）大概率随主轴改型失去意义，待 Phase 9 复核。
- **Affected matrix rows**：workspace:folder-list（改）、workspace:remote-project（新增）、tabs:active-folder（措辞随 Project 改）、boot:deep-link（不变，机制通用）
- **Revisit trigger**：Phase 9 审远程执行时，若 SSH/WSL/Docker 三种 origin 的执行语义出现分歧（如 Docker 一次性容器），回到本决策细化 origin 枚举。

### D-002 · 2026-09-02 · 项目启动器（Project Boot）
- **Topic**：侧栏“项目启动器”入口及其脚手架能力（shadcn 配置器 + HyperFrames 视频项目 + agent 技能软链安装）
- **Options**：KEEP_UI / KEEP_REWIRE / REDESIGN / REMOVE / DEFER
- **Chosen**：**REMOVE**
- **Reason**：用户裁决——破坏简洁性；shadcn/HyperFrames 模板是 Codeg 个人趣味的产物，非通用工作台需求。
- **Consequences**：
  - Agent-Box Studio 不实现项目脚手架向导；后端不需要 `create_shadcn_project` / `create_hyperframes_project` / `detect_hyperframes_skills` / `install_hyperframes_skills`。
  - HyperFrames 的“往 agent 技能目录塞软链”是审计点名的 direct native Skill directory management 泄漏实例，随能力一并消失（Phase 8 复核时引用本决策）。
  - **不受影响**：`folder://open-in-workspace` 跨窗口打开机制是通用的（deep-link/启动器交接），由 boot:deep-link 行承载，继续审计。
- **Affected matrix rows**：workspace:project-boot（新增行，见矩阵“预审区”）
- **Revisit trigger**：若 Agent-Box 未来需要“模板化创建工作区”，应作为通用 WorkspacePort 的 create 能力重新立项，而非恢复 Codeg 的 shadcn/HyperFrames 向导。

## 搁置/延期记录

| ID | Date | Topic | Status | 说明 |
|---|---|---|---|---|
| D-DEFER-001 | 2026-09-02 | workspace 分组的 UI 重设计（drag 布局乐观更新） | DEFERRED | 与 Q2（folder 注册表归属）绑定，待 Q2 裁决后再定 disposition |