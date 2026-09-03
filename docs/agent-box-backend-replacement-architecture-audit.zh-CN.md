# Codeg → Agent-Box 后端替换架构审计报告

> 审计对象：`xintaofei/codeg` fork（agent-box-studio），目标：以后端完全替换为 Agent-Box（Execution Governance Core + Plugin SDK）为前提，判定**保留到哪个层级、替换哪些层级、删除哪些层级**。
>
> 审计方式：只读。全程未修改源码/配置/依赖，未执行 Git 写操作，未启动真实 Agent。所有结论附 `file:line` 证据（行号基于本次审计时的工作区快照）。行内路径缩写：`RT` = `src-tauri/src`，`FE` = `src`。
>
> 前序工作：`docs/codeg-architecture-audit.zh-CN.md`（上一轮摘要）。本报告在其骨架上做了逐链验证与大幅深化，两者结论冲突处以本报告为准。

---

## 0. 执行摘要

1. **Codeg 实际是 16 层**，而不是"前端 + Tauri 后端"两层。真正的承重结构是：Visual Components → Feature Composition → Frontend State → Conversation Model（手工 DTO 镜像）→ Backend Client → Tauri/Axum 双 IPC → Use-case Core（`*_core` 函数）→ ACP 协议层 → Agent 进程运行时 → 双 Terminal 系统 → Folder/Worktree 治理 → 权限队列 → SeaORM/SQLite → 恢复引擎 → 桌面平台集成 → 打包/更新。
2. **切割线不在"前端/后端"，而在 Conversation Model**。`FE/lib/types.ts`（4632 行，手工镜像，无任何代码生成）+ `FE/lib/api.ts`（5582 行，415 个命令）是全部 Codeg 语义的凝结核；组件层（`ui/`、`message/`、`chat/`、`ai-elements/`）只消费中间形态（`MessageTurn`/`ContentBlock`/`AdaptedToolCallPart`），可以整体保留。
3. **推荐最终架构 = 方案 B + E + F**：保留页面与组件，重写 frontend 的 application/state/ports 层；最终协议用 **Agent-Box Host API（HTTP/WS）直连**，**不用 ACP 作终态**；Windows Tauri → **Rust 内 WSL bridge** → Agent-Box Host。过渡期允许把 Agent-Box 临时包装成 custom ACP agent 做流式/权限联调（方案 G），但不沉淀为架构。
4. **最终删除的核心后端 authority**：`acp/`（连接与进程）、`db/`（26 实体）、`parsers/`（19 个解析器）、`work_task/`、`automation/`、`chat_channel/`、`acp/delegation/` + `codeg-mcp`、`terminal/manager.rs`（移交 Agent-Box TerminalSession 后）、`web/handlers` 的大部分。可复用代码比例：前端约 **55–65%**（其中 30–35% 零改动），Rust 约 **8–12%**。
5. **Verdict：READY FOR AGENT-BOX BACKEND REPLACEMENT PROTOTYPE**——切割缝存在且干净（transport 抽象 + 单一 DTO 凝结核 + 组件只吃中间形态），但必须先建 anti-corruption 层，禁止把 ACP `session_id` / `conversation_id` 泄漏进新 ViewModel。

---

## 第一部分：完整运行链

### 链 1 — 桌面应用启动

| 环节 | 位置 | 证据 |
|---|---|---|
| 进程入口 | `git credential helper` 短路 → `codeg_lib::run()` | `src-tauri/src/main.rs:5-20` |
| 日志最先初始化；Windows `--disable-gpu` 覆盖 | logging init / preferences.json | `RT/lib.rs:162`、`RT/lib.rs:127-154` |
| 插件链（single-instance、window-state、updater、notification、autostart…） | tauri Builder | `RT/lib.rs:186-244` |
| Managed State 创建序：ConnectionManager → TerminalManager → ChatChannelManager → 各窗口态 → WebServerState → RemoteProxyState → WorkspaceTransfer → WebEventBroadcaster → InternalEventBus → pet/update 句柄 | setup 前 | `RT/lib.rs:245-279` |
| 数据根统一（`CODEG_DATA_DIR` 写回）+ DB 初始化（先备份再迁移） | `resolve_effective_data_dir` → `db::init_database` | `RT/lib.rs:316-353`；`RT/db/mod.rs:32-60` |
| 后台任务：二进制缓存 GC、experts/science 技能安装、chat scratch GC、shell 配置种子、worktree 别名回填 | spawn | `RT/lib.rs:394-505` |
| Delegation 栈（UDS listener）+ LifecycleSubscriber | `build_delegation_stack`、`lifecycle_subscriber_task` | `RT/lib.rs:608-736`；`RT/acp/lifecycle.rs:1577` |
| Web 服务自启（Axum，449 条路由） | `do_start_web_server_tauri` | `RT/lib.rs:738-757`；`RT/web/router.rs` |
| automation / work_task 引擎启动 | `build_engine` / `build_task_engine` | `RT/lib.rs:786-815` |
| 主窗口创建，webview 加载 `workspace` 路由 | `WebviewUrl::App("workspace")` | `RT/lib.rs:821-838`；`src-tauri/tauri.conf.json:8-10`（dev `:3000`，产物 `../out`） |

- 前端入口：`FE/app/workspace/page.tsx`（静态导出，`next.config.ts:30` `output:"export"`）。
- state/store：启动时尚无（由链 2 水合）。
- 进程 owner：单个 `codeg` 桌面进程（内嵌可选 Axum）；服务器模式镜像见 `RT/bin/codeg_server.rs:255-300`（同一 `AppState` 组装）。
- 数据库 owner：`AppDatabase`（SeaORM/SQLite，26 实体），manage 于 `RT/lib.rs:353`。
- UI 消费者：整个 `/workspace`。

### 链 2 — 前端页面初始化

| 环节 | 位置 | 证据 |
|---|---|---|
| 根 Provider 链：NextIntl → Theme → Appearance + WebConnectionGuard | `FE/app/layout.tsx:35-84` | |
| `/` 跳转判定：`__TAURI_INTERNALS__` → `/workspace`；web 校验 token | `FE/app/page.tsx:9-47`；`FE/lib/transport/detect.ts:3-8` | |
| `/workspace` Provider 嵌套：AppWorkspace → Alert → GitCredential → Task → **AcpConnections** → Delegation → ConversationRuntime(shim) → Workspace → Tab → Sidebar → AuxPanel → Terminal → … | `FE/app/workspace/layout.tsx:1268-1336` | |
| 主组件树：FolderLayoutShell → FolderWorkspaceShell（Sidebar / TabBar / ConversationDetailPanel / TerminalPanel / AuxPanel） | `FE/app/workspace/layout.tsx:697-1240` | |
| 初始拉取：`fetchFolders()`（`list_open_folder_details`+`list_all_folder_details`+`list_folder_groups`）+ `refreshConversations()`（`list_all_conversations`） | `FE/contexts/app-workspace-context.tsx:47-52`；`FE/stores/app-workspace-store.ts:342-408` | |
| Tab 恢复：`list_opened_tabs` → tab-store hydrate | `FE/contexts/tab-context.tsx:115`；`FE/stores/tab-store.ts:1982-2070` | |
| 事件水合订阅：`conversation://changed`、`folder://changed`、`folder-group://changed`、`tabs://changed`、`acp://event`（桌面单监听） | `app-workspace-context.tsx:57-215`；`FE/contexts/acp-connections-context.tsx:4466-4572` | |

- state/store：`app-workspace-store`、`tab-store`（localStorage `workspace:tab-groups:v1`）、`conversation-runtime-store`（懒加载）。
- IPC：上述命令经 `getTransport().call()` → Tauri `invoke` 或 web `POST /api/{command}`（`FE/lib/transport/index.ts:27-62`）。
- UI 消费者：Sidebar / TabBar / ConversationDetailPanel。

### 链 3 — 创建/打开会话

| 环节 | 位置 | 证据 |
|---|---|---|
| 前端入口：发送驱动创建（无会话先建会话）；画布入口；打开文件夹对话框 | `FE/components/conversations/conversation-detail-panel.tsx:1133`、`FE/components/canvas/canvas-conversation-surface.tsx:437`、`FE/components/layout/workspace-folder-dialog.tsx:183` | |
| API：`createConversation(folderId, agentType, title)`；`openFolder(path)` / `open_folder_by_id` | `FE/lib/api.ts:3146-3155`、`api.ts:2928-2930`、`api.ts:2017-2019` | |
| IPC → Rust：`create_conversation`（`lib.rs:1034`）→ `create_conversation_core`（查 folder → `detect_git_branch` → service） | `RT/commands/conversations.rs:1825-1835` | |
| DB：`conversation_service::create`（status=InProgress, kind=Regular, message_count=0） | `RT/db/service/conversation_service.rs:14-27, 81-123`；实体 `RT/db/entities/conversation.rs:39-75` | |
| 打开文件夹：`open_folder_core` → `folder_service::add_folder`（按 path 复活或插入；worktree 变体记 `parent_id`+alias） | `RT/commands/folders.rs:679-761`；`RT/db/service/folder_service.rs:106-160` | |
| 返回/消费：conversation id 回填 tab（`bindConversationTab`），`conversation://changed` 广播同步其他窗口 | `conversation-detail-panel.tsx:1111-1163`；`RT/commands/conversations.rs:1574-1594` | |

- 会话行创建在**任何 prompt 之前**；`folder_id` 是 Conversation 与 Project 的唯一关联键。

### 链 4 — 用户发送消息

| 环节 | 位置 | 证据 |
|---|---|---|
| UI 提交 + 队列门 | `handleSend` | `conversation-detail-panel.tsx:953-1075` |
| **乐观 turn 由前端造 id**：`optimistic-${randomUUID()}` | `conversation-detail-panel.tsx:174-201`（id 在 :197） | |
| store：`APPEND_OPTIMISTIC_TURN`、`setSyncState("awaiting_persist")` | `FE/stores/conversation-runtime-store.ts:3647-3688` | |
| API：`acpPrompt(connectionId, blocks, folderId, conversationId, clientMessageId)`（web/远程剥离图片 base64） | `FE/lib/api.ts:279-298` | |
| IPC：Tauri `invoke("acp_prompt")`（`lib.rs:1260`）或 `POST /api/acp_prompt`（`RT/web/router.rs:715`） | | |
| Rust 命令 → manager：`manager.send_prompt_linked_with_message_id` | `RT/commands/acp.rs:10010-10026`；`RT/acp/manager.rs:869+` | |
| manager 语义：prompt_lock 串行、`turn_in_flight` → `TurnInProgress`、图片水合、会话行绑定（前端已建行不重写；后端补建 `create_with_delegation`）、`bind_external_id`、**状态写库先于发送**（`update_status(InProgress)`） | `RT/acp/manager.rs:889-1283`（状态写库 :1262-1283） | |
| 消息 id 定稿：保留 `turn-<n>` 命名空间，回退 `user-{conn}-{seq}` | `RT/acp/manager.rs:1310-1319` | |
| 连接循环：`ConnectionCommand::Prompt` → 注入路由块 → emit `StatusChanged(Prompting)` → 广播 `AcpEvent::UserMessage` → **写 codeg 自录 transcript** → ACP `session/prompt` | `RT/acp/connection.rs:8109-8229`（RPC 发送 :8216-8229） | |
| 响应后：`TurnComplete(stop_reason=end_turn)` → lifecycle 订阅者写 `PendingReview`；turn 正文**从不进 SQLite** | `RT/acp/lifecycle.rs:260-295`；`RT/commands/conversations.rs:1064-1120`（parser 现场解析原生 transcript） | |

- 协议：ACP JSON-RPC over stdio（vendored `sacp-tokio`，`src-tauri/vendor/sacp-tokio/src/lib.rs:26-96`）。
- 进程 owner：Rust `ConnectionManager`；前端只持 `connectionId`。
- DB owner：会话元数据（title/status/external_id）在 SQLite；**消息正文在 agent 原生文件或 `~/.codeg` 下自录 transcript**（`RT/acp_transcript.rs:48-49`）。
- UI 消费者：`COMPLETE_TURN` 把 liveMessage/optimisticTurns 晋升为 localTurns（刻意不 refetch 以避开 transcript 写入竞态，`conversation-runtime-store.ts:1881-1946, 3630-3644`）。

### 链 5 — Agent/Harness 进程启动

| 环节 | 位置 | 证据 |
|---|---|---|
| Agent 注册表：15 内置 + custom；每 agent 的 npx/uvx/binary 分发配方、cmd/args/env | `RT/acp/registry.rs:226-300, 465-1391`；`RT/acp/custom_registry.rs:182+, 504-565` | |
| 安装/缓存：uv/npx 解析、binary 下载 + sha256、整树解压、版本 probe | `RT/acp/binary_cache.rs:16-638`；`RT/commands/acp.rs:200-421, 2264` | |
| 触发：`acp_connect` → `spawn_agent`（去重锁 + 活连接复用）→ `spawn_agent_connection`（专用 8MiB 栈线程跑 `run_connection`） | `FE/lib/api.ts:217-231`；`RT/acp/manager.rs:439-549`；`RT/acp/connection.rs:1892-2165` | |
| 子进程构造：`build_agent`（Npx/Binary/Uvx 三分支；env 序列化为前导 `KEY=value` argv；codex 强制 `DISABLE_MCP_CONFIG_FILTERING`；Antigravity 启动前写 settings.json）；cwd 绑定 | `RT/acp/connection.rs:1462-1865`（cwd :1860-1864） | |
| 协议握手：`initialize`（60s 超时）→ capability 读取 → **codeg-mcp 注入**（UDS+token）→ `StatusChanged(Connected)` → **resume → load → new** 链 | `RT/acp/connection.rs:4851-5160, 5230-5535`；MCP 注入 :5027-5080 | |
| Claude Code / Codex 不是 ACP 原生：经第三方适配器包（`@agentclientprotocol/claude-agent-acp`、`codex-acp`），`acp_adapter_relation` 显式记录 | `RT/acp/registry.rs:302-313, 335-355, 580-588, 781-788` | |

- **Harness 判定事实**：Codeg 的 "Agent" 是**分发单元 + ACP 接入点**，不是 Harness 本体；Claude Code 的 Harness 是 `claude` CLI，Agent 是 `claude-agent-acp` 包。这是 Codeg 中唯一接近 Agent-Box Harness/Profile 区分的地方，但只覆盖"接入方式"，不含治理语义。

### 链 6 — 流式事件进入前端

| 环节 | 位置 | 证据 |
|---|---|---|
| ACP 通知 → `AcpEvent`（ContentDelta/Thinking/ToolCall/ToolCallUpdate/Plan…） | `emit_conversation_update` | `RT/acp/connection.rs:7635-7666, 11619-11834` |
| `emit_with_state`：`SessionState::apply_event` → `seq+=1` → `EventEnvelope{seq, connection_id, payload}` → per-connection 环形缓冲（4096 broadcast / 128 条 replay） | `RT/web/event_bridge.rs:438-541`；`RT/acp/types.rs:53-58`；`RT/acp/event_stream.rs:12-84` | |
| 桌面：`app.emit("acp://event")` + InternalEventBus（lifecycle/pet/chat-channel）；ACP 事件**不再**进全局 WS firehose | `RT/web/event_bridge.rs:495-512, 433-437` | |
| web：per-connection attach 协议（snapshot / replay / event 帧，`since_seq` 断线续传） | `RT/web/ws_attach.rs`；`RT/web/ws.rs:275-306`；`FE/lib/transport/web-event-stream.ts:17-152, 188-192` | |
| 前端：单一全局监听 + `reverseMapRef` 按 connection_id 路由 + seq 去重 + reducer 分派（status/content/tool_call/permission/question/plan/background） | `FE/contexts/acp-connections-context.tsx:4485-4542, 3439-3932` | |
| 流式节流：16ms/256 条批量合并 → `conn.liveMessage` → runtime store `SET_LIVE_MESSAGE` → `buildStreamingTurnsFromLiveMessage` → 时间线 | `acp-connections-context.tsx:3055-3288, 1629`；`conversation-runtime-store.ts:2250-2279, 974-1340` | |
| 渲染：`content-parts-renderer.tsx` 工具卡/文本/计划 | `FE/components/message/content-parts-renderer.tsx:14, 424` | |

- **归一化责任在 Rust**（`emit_conversation_update` 里就有 codex/grok/pi/claude 专属分流，`connection.rs:11633-11834`）——这是"事件归一化放哪里"问题的现状答案：目前归一化分散在 Rust 事件层 + 前端 `lib/adapters` + 约 20 个 harness 特化 lib 模块。

### 链 7 — 工具调用与权限确认

| 环节 | 位置 | 证据 |
|---|---|---|
| 工具卡：`AcpEvent::ToolCall/ToolCallUpdate` → liveMessage → `buildStreamingTurnsFromLiveMessage` 工具卡分块；历史侧由 parser 重建同形 `ContentBlock` | `connection.rs:11723+`；`conversation-runtime-store.ts:1240-1340`；`FE/lib/adapters/tool-kind-classifier.ts:30-45` | |
| 权限：`session/request_permission` → `handle_permission_request`（生成 request_id、codex plan_review 合成卡、选项映射 allow/reject once/always）→ **PermissionQueue**（屏幕空闲才发卡，否则只发 `PermissionQueueDepth`） | `RT/acp/connection.rs:4623-4645, 6148-6257, 2292-2455` | |
| 阻塞模型：`PendingPermission::Acp(Responder)` parked，**agent RPC 挂起等待**，Codeg 无代码级超时（唯一超时是 codex elicitation 自带的 `autoResolutionMs`）；idle sweep 跳过含 pending permission 的连接 | `RT/acp/connection.rs:2173-2179, 6077-6088`；`RT/acp/manager.rs:603-605` | |
| 前端：`PermissionRequest` → `conn.pendingPermission` → `PermissionDialog` → `onRespond(request_id, option_id)` | `acp-connections-context.tsx:3706-3734`；`FE/components/chat/permission-dialog.tsx:52-54, 330` | |
| 应答：`acpRespondPermission` → `respond_permission` → `ConnectionCommand::RespondPermission` → `resolve_permission`（先发下一张卡再发 `PermissionResolved`） | `FE/lib/api.ts:370-377`；`RT/commands/acp.rs:10140-10149`；`RT/acp/manager.rs:1589-1609`；`RT/acp/connection.rs:2466-2505, 8890-8894` | |
| 决策存储：**不持久化**。`allow_always` 的记忆责任在 agent 侧；相关扩展通道：codex elicitation（approval/questions 两类）、Grok ask、Grok `exit_plan_mode` 计划批准 | `RT/acp/session_state.rs:265, 827-845`；`RT/acp/connection.rs:4803-4845, 5960-6109, 4780-4801`；`RT/acp/plan_approval.rs` | |

- **权限是纯 live 请求**：Codeg 没有 permission entity，没有 policy 持久层。Agent-Box 的 Review/Freeze/Dispatch 是全新 authority，不是替换而是填补。

### 链 8 — 终端创建与显示（两套独立系统）

| | A：用户交互终端 | B：ACP agent 终端 |
|---|---|---|
| 触发 | 用户（TerminalPanel） | agent 的 `terminal/create` RPC |
| 前端 | `FE/components/terminal/terminal-view.tsx:237-268`（**先订阅后 spawn**）、写队列 `FE/lib/terminal/write-queue.ts:5-44` | 无 UI（pi 特例从 `_meta` 桥进工具卡，`connection.rs:11763-11775, 9990-10030`） |
| IPC | `terminal_spawn/write/resize/kill/list`（`lib.rs:1438-1442`；web 路由 `RT/web/router.rs:1600-1606`） | ACP 方法 `terminal/create|output|wait_for_exit|kill|release`（`RT/acp/connection.rs:4677-4779`） |
| 进程 | portable-pty 真伪终端 + 交互 shell（`RT/terminal/manager.rs:241-273`；shell 解析 `:28-61`） | `tokio::process` 管道、stdin null（`RT/acp/terminal_runtime.rs:488-524, 526-661`） |
| 事件 | `terminal://output/{id}`、`terminal://exit/{id}` 推流（`RT/terminal/manager.rs:484-523`；`emit_event` 双发 `RT/web/event_bridge.rs:397-418`） | 不推流；agent 拉 `terminal/output` 快照 / offset delta（`terminal_runtime.rs:663-699`） |
| 所有权 | `owner_window_label` → 主窗口关闭时 `kill_by_owner_window`（`RT/lib.rs:1012-1015`） | `session_id` → 会话结束 `release_all_for_session`（`RT/acp/connection.rs:5185, 5417, 5601, 5682, 7487`） |
| 凭据/环境 | git credential helper 注入 `GIT_CONFIG_*`（`RT/commands/terminal.rs:23-63, 66-105`） | base_env 只透传 `GIT_CONFIG_*`（`connection.rs:1994-1998`） |

### 链 9 — Worktree/项目管理

| 环节 | 位置 | 证据 |
|---|---|---|
| 数据模型：folder 表 `parent_id`（worktree→根，扁平化）、`alias`（缺省=分支名）、`kind`（regular/chat）、`group_id` | `RT/db/entities/folder.rs:21-51`；`RT/db/service/folder_service.rs:118-127` | |
| 三个 worktree 创建者：①用户分支下拉；②work_task 引擎 `ensure_worktree`（base_sha 先记录、分支 `task/{id}`、冲突后缀重试）；③automation 引擎 per-run worktree | `FE/components/layout/branch-dropdown.tsx:407-413`；`RT/work_task/engine.rs:1388-1489`；`RT/automation/engine.rs:596-699` | |
| 注册唯一通道：`open_worktree_folder_core`（记 parent_id + `seed_worktree_alias`）+ 启动回填 | `RT/commands/folders.rs:692-800`；`RT/lib.rs:492-505` | |
| 删除收敛：`git_remove_worktree_core`（任务占用拒删；`worktree remove/prune`；`converge_removed_worktree_folder`：会话 reparent→删 tab→软删 folder→解绑任务→三事件→停 watch） | `RT/commands/folders.rs:3095-3373` | |
| work_task 合并状态机：merge 由**再起一个 agent 代**执行（提示词里写 git 命令、禁 push/删树），落地判定看 git 真相（HEAD 前移 + is_ancestor） | `RT/work_task/engine.rs:3292-3604`（提示词 :5961-6023，落地判定 :3574-3590） | |
| 侧栏消费：`FE/lib/folder-display.ts:15-73` | | |

- **Git 突变权责在提示层而非能力层**：agent 在 worktree 内自由 commit（`engine.rs:6065-6070`），merge 代直接在 base 上 merge（`:6007-6014`）；Codeg 用 CAS + git 真相校验兜底，`git_remove_worktree_core` 与引擎 `remove_worktree_inner` 是**两套相似但独立**的收敛实现（`folders.rs:3293` vs `engine.rs:5498`，注释自认同构）——典型的双重治理债。

### 链 10 — 会话恢复

| 环节 | 位置 | 证据 |
|---|---|---|
| 前端入口：打开 tab 时等 `external_id`（DB 行 ∨ SessionStarted 回填）→ `acpConnect(agentType, cwd, sessionId)` | `conversation-detail-panel.tsx:489-510`；`FE/contexts/acp-connections-context.tsx:5256-5262` | |
| 复用判定：按 conversation_id，再按 `(session_id, agent_type)` 兜底（external_id 仅 per-agent 唯一） | `RT/commands/acp.rs:10252-10277`；`RT/acp/manager.rs:463` | |
| 协议链：能力探测 load/resume → ①`session/resume`（不重放历史，UI 历史来自磁盘 parser）→ ②失败落 `session/load`（重放仅用于给 custom agent 补录 transcript）→ ③`ResourceNotFound/-32002/-32603` = agent 遗忘 → 对内置 agent 发 `SessionLoadFailed`（前端给 Reload/New），对 custom agent 落 `session/new`，新 transcript 以 `continues_from` 链回旧文件 | `RT/acp/connection.rs:4907-4919, 5106-5227, 5230-5435, 5436-5549`；链结构 `RT/acp_transcript.rs:68-86, 1118-1167` | |
| 状态转换中心：lifecycle 订阅者写 `end_turn→PendingReview`、`refusal/max_tokens…→Cancelled`；DB 先写后发事件 | `RT/acp/lifecycle.rs:237-295` | |
| fork：untyped `session/fork` + 当前行换 external_id + 兄弟行 preserved | `RT/acp/fork.rs:19-39`；`RT/acp/manager.rs:1618, 1921-1986` | |
| work_task 的 retry/return 复用同链：resume 失败回退 fresh session 并记 `resume_fallback` 事件 | `RT/work_task/engine.rs:1118-1183` | |

### 链 11 — Agent 结束与状态持久化

| 环节 | 位置 | 证据 |
|---|---|---|
| 进程退出：child_pid 原子量兜底 kill_tree；循环返回 `handle_fork_or_exit`；`Disconnected` 是拆除信号；空闲回收默认 180s/60s 周期 | `RT/acp/connection.rs:1958-1973, 7377`；`RT/acp/idle_sweep.rs:19-64`；`RT/lib.rs:764-771` | |
| Turn 完成：stop_reason 来自 prompt 响应 + stderr_tail 诊断；`record_turn_end` 为历史 parser 记录；`journal_turn_span` 计时；非 end_turn 级联取消子 delegation | `RT/acp/connection.rs:8425-8569, 8475-8479` | |
| 持久化分工：**无 message 表**。会话元数据=SQLite；消息正文=agent 原生 transcript（15 个 parser 现场解析）或 codeg 自录 JSONL（append-only + continues_from，write-behind 合并窗口）；`token_usage_turn` 是 parser 同步出的物化表（整会话事务替换，前端触发 sync） | `RT/parsers/mod.rs:266-288`；`RT/acp_transcript.rs:44-86`；`RT/db/entities/token_usage_turn.rs:13-32`；`RT/commands/token_usage.rs:914-1033` | |
| `Disconnected`（进程退出）**不等于** Finish：turn 正常结束才 `PendingReview`；进程退出只置连接 Disconnected，会话行状态保持 InProgress 直到用户/生命周期改动 | `RT/acp/lifecycle.rs:259-263`；`RT/acp/manager.rs:1531` | |

- **Process exit ≠ Execution Finish** 在 Codeg 中没有显式建模——这正是 Agent-Box explicit Finish / Atomic Finalization 要接管的语义。

### 链 12 — 应用重启后的恢复

| 状态 | 结局 | 证据 |
|---|---|---|
| folder 行 / opened_tab / conversation 元数据 / work_task（状态+merge_state+base_sha）/ automation / token_usage_turn / transcript 文件 | **存活** | `RT/db/entities/*`；`RT/acp_transcript.rs:79-82` |
| ACP 连接与 SessionState | 全内存，**丢失** | `RT/acp/session_state.rs:244-262` |
| automation 运行中 run | boot 一律 CAS `Failed("interrupted by restart")`，**不重放** | `RT/automation/engine.rs:219-228`；`RT/db/service/automation_service.rs:575-593` |
| work_task queued/preparing/running/awaiting | boot 标 failed(interrupted)；**merging 豁免**——从 git 真相恢复（已落地→merge_landed+写回+按需删树；未落地→清残留回 review） | `RT/work_task/engine.rs:334-408`；`RT/work_task_service.rs:2517-2547, 5007-5090` |
| tabs / folders / conversations | 前端 hydrate 重建：`list_opened_tabs`（CAS 版本）、`list_open_folder_details`、`list_all_conversations`（每次启动重解析 agent 原生文件，summary_cache 加速） | `FE/stores/tab-store.ts:1982-2070`；`RT/commands/conversations.rs:152-239` |
| work_task `connection_id` / 引擎内存映射 | 明示 "Lost on restart (boot reconcile covers that)" | `RT/db/entities/work_task.rs:73-75`；`RT/work_task/engine.rs:96-99` |
| 附件清理 | chat scratch GC 只漏删不误删；ACP 二进制缓存 trash 清扫 | `RT/commands/conversations.rs:1905-1984`；`RT/acp/binary_cache.rs:248-268` |

---

## 第二部分：按真实职责划层

> 不沿用目录命名，按**实际依赖方向**重划。依赖方向总体：Visual ↑ Feature ↑ State ↑ Model ↑ Client ↑ IPC ↑ Core ↑ Runtime/Protocol ↑ Storage。

| # | 层 | 主要位置 | 输入→输出 | 知道 Harness？ | 知道 Codeg 实体？ | 绑定 Tauri/Rust？ | Agent-Box authority | 裁决 |
|---|---|---|---|---|---|---|---|---|
| 1 | Visual Components / Design System | `FE/components/ui`（48 文件 4.4k 行）、`message/`、`ai-elements/`、`diff/` | ViewModel props → DOM | **否**（经 `tool-kind-classifier` 仅感知工具名形态） | 否（吃 `MessageTurn`/`ContentBlock`） | 否 | 无对应（UI 资产） | **保留** |
| 2 | Page/Feature Composition | `FE/app/*`、`components/{conversations,chat,layout,settings,tasks,forge,automations,canvas}` | 用户意图 → store 动作 | 部分（agent 选择器/设置面板） | 是（conversation/folder/tab id） | 否 | Work/Execution 视图 | **保留+重接线** |
| 3 | Frontend State | `FE/stores`（7.9k）+ `FE/contexts`（11.8k，17 个） | 事件/命令结果 → UI 快照 | `acp-connections-context` 内嵌 harness 分流 | **深度**（conversationId/agentType/connectionId/prefix_hash 协议） | 否 | 应降级为 cache | **重写**（保留 reducer/prefix-cache 机制） |
| 4 | Conversation Model（DTO 凝结核） | `FE/lib/types.ts`（4632 行） | Rust serde → TS | `AcpEvent` 全家、`agent_type` 15 枚举 | **是，全部** | 否（纯类型） | 必须 anti-corruption | **替换** |
| 5 | Frontend Application/Use-case | `FE/hooks`（6.6k）、`lib/*` 业务模块（约 20 个 harness 特化） | store+api 编排 | 是（codex-code-mode、pi-thinking、opencode-permissions…） | 是 | 否 | 归 ports/application | **重写** |
| 6 | Backend Client / API Port | `FE/lib/api.ts`（5582）、`tauri.ts`（1335，仅 3 个独有命令）、`transport/*` | 命令名+参数 → Promise/事件流 | 是 | 是 | transport 感知 Tauri | agent-box-client | **替换** |
| 7 | Tauri IPC | `RT/lib.rs:1019-1491`（约 309 个命令）；web 侧 449 条路由镜像 | invoke → core 函数 | 是 | 是 | **是** | 换成 bridge 命令 | **替换** |
| 8 | Desktop Platform Integration | `commands/windows.rs`、tray/autostart/updater/插件链、`preferences.rs` | 窗口/系统事件 → 原生动作 | 否 | 弱（窗口 label） | **是** | 无对应（shell 资产） | **保留** |
| 9 | Agent Protocol (ACP) | `RT/acp/connection.rs`（20k 行）+ vendor sacp | JSON-RPC ↔ AcpEvent | 深度（claude/codex/grok/pi `_meta` 特化） | 是 | Rust | RuntimeHost 之下 | **删除**（终态）；过渡可桥 |
| 10 | Agent Process Runtime | `RT/acp/{manager,registry,custom_registry,binary_cache}.rs`、`process.rs` | 配方 → 子进程 | 是（分发配方） | connection/conversation | Rust | RuntimeHost/Sandbox | **删除** |
| 11 | Terminal/PTY | `RT/terminal/` + `RT/acp/terminal_runtime.rs` | spawn ↔ 字节流 | 否 | 弱 | Rust | **TerminalSession/Presenter** | **移交** |
| 12 | Workspace/Worktree | `commands/folders.rs`（3.4k）、`git_repo.rs`、`work_task/`、`automation/`、`folder_links.rs` | git 操作 → folder 表/事件 | 部分（default_agent） | 是 | Rust | Workspace 插件 + agent-box-git | **删除/移交** |
| 13 | Permission/Approval | `RT/acp/{connection PermissionQueue, plan_approval, question, feedback}` + 前端 `permission-dialog` | live 请求 → option_id | 是（codex elicitation/grok ask 特化） | 是 | Rust | **Review/Freeze/Dispatch** | **UI 保留，authority 替换** |
| 14 | Persistence/SQLite | `RT/db/`（26 实体，44 迁移）+ `RT/parsers/`（19 个）+ `acp_transcript.rs` | core 调用 → 行/文件 | parser 按 agent 分派 | **是** | Rust | Agent-Box 持久层 + Observation/Evidence | **删除**（迁移必要元数据） |
| 15 | Recovery | lifecycle 订阅者、boot reconcile（automation/work_task）、idle sweep、GC | 事件/启动 → 状态收敛 | 弱 | 是 | Rust | explicit Finish/Atomic Finalization | **删除** |
| 16 | Packaging/Updater/Telemetry | tauri-plugin-updater、`update/`、`logging/`、`supervise.rs`、backup | 版本 → 自更新 | 否 | 弱 | Tauri 插件 | 无对应 | **保留**（无 telemetry：全库未发现上报代码） |

每层对"替换它影响哪些上层"的答案浓缩在裁决列：**层 4（DTO）是唯一的总开关**——换掉它，层 1-2 需重接线但可保留，层 3-7 必须重写；层 9-15 整体属于 Codeg 后端 authority，Agent-Box 已有对应或更优概念。

---

## 第三部分：所有权矩阵

> owner 缩写：TS=前端类型/store；Rust=Rust 结构体/服务；DB=SQLite 表；RT=运行时进程内状态；AB=Agent-Box 对应概念。"语义同"=两边概念外延一致。

| 实体 | TS owner | Rust owner | DB owner | RT owner | UI consumer | AB 概念 | 语义同？ | 裁决 |
|---|---|---|---|---|---|---|---|---|
| Project | `FolderInfo` types.ts:306 | `models/folder.rs:172` | `folder` 表（path 唯一，parent_id=worktree） | — | Sidebar/TabBar/文件树 | **Workspace**（插件） | 部分同：folder 还承担 worktree 注册、chat scratch、画布节点、侧栏分组 | UI 保留；后端语义移交 Workspace，UI 分组留本地 |
| Conversation | `ConversationSummary/DbConversationDetail` types.ts:98-110 | `models/conversation.rs:9-146` | `conversation` 表（agent_type/external_id/status/kind/parent_id…） | SessionState.conversation_id | ConversationDetailPanel/Timeline/TabBar | **无直接对应**；≈ Work 的 UI 线程视图 + Execution 的 read-model | **不同**：Conversation=1 个 ACP session 的 UI 线程+元数据行；Work=治理单元，1 Work 可含多 Execution | **适配**：降级为 presentation cache；Work 才是主键 |
| Session | `OpenedTab`+runtime sessionId | `SessionState.external_id` | `conversation.external_id` 列 | ConnectionManager 连接表 | 连接状态徽标/重连 UI | **Execution** | **不同**：Codeg Session 是 ACP 协议会话（agent 侧 id，per-agent 唯一）；Execution 是治理实例 | **重命名+映射**：Execution id 为新主键，ACP session id 至多作 harness 侧 detail |
| Message | `MessageTurn/ContentBlock` types.ts | `models/message.rs:6-208` | **无表**（agent 原生 transcript + codeg 自录 JSONL） | liveMessage/optimisticTurns | 时间线/工具卡 | **Observation**（text/tool 流）+ transcript | 部分：Observation 是流式事件，MessageTurn 是 UI 回合投影 | **适配**：MessageTurn 保留为 ViewModel 形状，来源换成 Observation replay |
| Agent | `BuiltinAgentType` 15 联合 + `custom:` 前缀 types.ts:2-40 | `AgentType` models/agent.rs:23-45 | `agent_setting`/`custom_agent` 表 | registry + 连接 | agent 选择器/图标/设置面板 | **Harness**（分发与接入） | **不同**：Codeg Agent=分发单元+ACP 接入（claude-agent-acp 包 ≠ claude CLI）；AB Harness=Claude Code/Codex/OpenCode/Hermes/Pi 五类 | **重命名**：UI 里 Agent→Harness 选择；`custom:` 开放前缀可保留为逃生门 |
| Model | provider model 字符串 | `model_provider` 表 + agent_setting.model | 同左 | env/args 注入 | model 下拉 | **Profile 的属性之一** | **不同**：Model≠Profile | 并入 Profile 属性 |
| Profile | **不存在** | 分散：`agent_setting.env_json`、session config options、custom_agent.spec_json、各 agent native config | 分散 | `fingerprint_config` connection.rs:2016 | 模式/配置选择器 | **Profile**（一等插件） | AB 全新 | **新建** UI 概念，映射到 AB Profile |
| Harness | 同 Agent 行 | registry.rs | 同 Agent | spawn 配方 | 同 Agent | **Harness** | AB 更准确 | 同 Agent 行 |
| Process | 无（只持 connectionId） | child_pid、`run_connection` 线程、`ConnectionManager` | `conversation.connection_id`（弱引用） | 子进程 owner | 连接状态 | **RuntimeHost/Sandbox** | 不同：Codeg 进程=ACP stdio 子进程；AB=受治理 runtime | **移交** |
| Terminal | terminal-view 组件 + command-terminal-link-store | `TerminalManager`（PTY）+ `TerminalRuntime`（ACP） | 无表 | PTY/管道进程 | TerminalPanel | **TerminalSession/Presenter** | 部分：用户裸 shell 终端在 AB 中也应成为 TerminalSession 资源 | **移交**；前端 xterm UI 保留 |
| Worktree | folder-display/branch-dropdown | `git_repo.rs`+`folders.rs`+`work_task/git.rs` | `folder.parent_id`+`work_task.worktree_folder_id` | git 命令直执行 | 分支下拉/侧栏/workbench | **Workspace/Resource(git Ref) + agent-box-git** | **不同**：Codeg 是"注册表+git 命令直执行"，且与 agent 侧 git 突变并存（双 authority） | **移交 agent-box-git** |
| Permission Request | `pendingPermission` types | `PendingPermission`/PermissionQueue（内存） | **无表** | Responder parked | PermissionDialog/plan 卡/ask 卡 | **Review/Freeze/Dispatch 批准环节** | **不同**：Codeg=live ACP 请求无持久无 policy；AB=治理流程 | **UI 保留，authority 替换** |
| Tool Call | `AdaptedToolCallPart`/工具卡 | `AcpEvent::ToolCall` + parser 重建 | **无表**（在 transcript 文件里） | liveMessage | 工具卡 | **Observation/Evidence** | 部分 | 适配：映射为 Evidence/Observation 渲染 |
| Resource | 仅 path 字符串 | cwd/FsAccessPolicy 白名单 | `folder.path` | spawn cwd | 文件树/目录选择 | **Resource Binding（requested→exact Ref）** | **不同**：Codeg 只有"启动时 cwd 字符串"；AB 有绑定生命周期 | **新建**；这是最大语义升级点 |
| Output | result 卡/merge_commit 展示 | work_task.result_summary/merge_commit、conversation message_count | work_task 列 | — | 任务详情 | **Outputs + Atomic Finalization** | **不同**：Codeg 无显式产出物模型 | **新建** |
| Execution Status | `ConnectionStatus`+conversation.status+WorkTaskStatus **三套并存** | 三处枚举 | conversation.status 列 + work_task.status 列 | 连接/任务状态机 | 徽标/任务板 | **Execution 状态机** | **不同**：Codeg 三套互不同步（见风险 §9） | **替换**：唯一来源=AB Execution |
| Continuation | 无一等概念（tab 重开≈） | session resume/load/new 链 + `continues_from` transcript 链 + fork | `conversation` 兄弟 preserved 行 | 连接重建 | Reload/New 对话框、fork UI | **continuation/context handoff**（跨 Harness） | **不同**：Codeg continuation 是单 harness 内的协议恢复；AB 是跨 harness 交接 | 长期新建；短期保留 resume 链不迁移 |
| Recovery Record | 无 | boot_reconcile（automation/work_task）、lifecycle 订阅者 | work_task_event、automation_run、conversation.status | 启动收敛 | 任务板错误态 | **explicit Finish/Atomic Finalization** | 部分 | 替换 |

### 名称相似但语义不同（重点警示）

1. **Codeg Session ≠ Agent-Box Execution**。`external_id` 是 agent 侧 ACP session id，仅 per-agent 唯一（`RT/commands/acp.rs:10252-10277` 兜底逻辑即是证据）；Execution 是含 Resource Binding 与 Finish 语义的治理实例。若把 `conversation_id`/`external_id` 当 Execution id 用，会同时制造 ID 错位与生命周期错位。
2. **Conversation ≠ Work**。一个 Conversation 是一个 ACP session 的 UI 线程；Work 是带绑定/审批/产出的治理单元，可跨多轮 Execution。Codeg 的 `work_task` 接近 Work+Execution 混合体，但它是"任务流水线引擎"（`RT/work_task/engine.rs:334-408` 的状态机），不是治理核心。
3. **Agent ≠ Harness**。Claude Code 的 Codeg Agent 是 `@agentclientprotocol/claude-agent-acp` 适配器包（`registry.rs:580-588`），Harness 是 `claude` CLI；Codeg 自己也用 `acp_adapter_relation` 区分两者（`registry.rs:335-355`）——证明 UI 需要 Harness 概念而非 Agent 概念。
4. **Model ≠ Profile**。Codeg 的 model 是 provider 下的一项参数（`model_provider` 表）；Profile 是可整体切换、含 Sandbox/Workspace/Credential 的执行形态。Codeg 中"同 Harness 动态切换"只能靠 ACP session mode/config options（`connection.rs:4934-4962`），表达力远低于 AB Profile。
5. **Process exit ≠ Execution Finish**。`Disconnected` 只清连接（`lifecycle.rs:110-117`），turn 的 end_turn 才 `PendingReview`（`:260`）；Codeg 从不把"进程没了"建模为"产出定案"。AB 的 explicit Finish/Atomic Finalization 必须成为唯一 Finish 语义，前端不得从 `exit` 事件推断完成。

---

## 第四部分：前端对后端的耦合深度

### 4.1 全部到达路径枚举

| 通道 | 规模 | 证据 |
|---|---|---|
| A. `api.ts` 统一封装（`getTransport().call`） | **425 个调用点 / 415 个唯一命令**，被约 146 个文件引用 | `FE/lib/api.ts` 全文 |
| B. `tauri.ts` 遗留直连 | 168 命令中 165 个与 api.ts 重复，仅 3 个独有（`set_tray_locale`、`update_appearance_mode`、`update_traffic_light_position`） | `FE/lib/tauri.ts:349,526,530`；引用仅 4 文件 |
| C. 散落直接 invoke | `save_binary_file`（image-download.ts:33）、`save_text_file`（save-file.ts:49）、`plugin:event|listen`（tauri-transport.ts:42,62）、remote 5 命令（remote-desktop-transport.ts:173-416） | |
| D. 事件订阅 | `acp://event`（桌面 firehose）+ per-connection attach 流（web）；20+ 事件前缀（conversation://、folder://、terminal://、pet://、task://、automation://、canvas://、tabs://、logs://、backup://…） | `RT/web/event_bridge.rs:397-418, 495`；`FE/lib/transport/web-event-stream.ts:17-42` |
| E. 插件 IPC（非 command） | plugin-dialog/opener/updater/process/notification、`api/window`（窗口 chrome、拖拽） | `FE/lib/updater.ts:208-289`；`window-controls.tsx:10` |
| F. 类型绑定 | 纯手工镜像，无 schemars/ts-rs/specta/openapi（Cargo 全库零命中） | `FE/lib/types.ts`（4632 行）↔ `RT/models/*` |
| G. localStorage | 113 处调用，0 IndexedDB/sessionStorage；含**会话上下文类**：`codeg:last-active-context:v1`、`codeg:message-input-draft:v1`、tab-groups 持久化（含 `agent_type` 字段） | `last-active-context-storage.ts:3`、`message-input-draft.ts:26-148`、`tab-store.ts:310,491` |
| H. 文件系统假设 | 前端不直接读盘，但拼接绝对路径（`path-utils.ts:8-46` 识别 `C:\`/UNC）、知晓 `~/.codeg/{backgrounds,pets,uploads,skills}` 结构、解析 `file://` | `workspace-background.ts:3`、`pet/animation.ts:3`、`api.ts:3811`、`types.ts:3344-3440` |
| I. 远程代理 | 远程桌面窗口经 `remote_http_call`/`remote_ws_*` 由 Rust 代理（webview mixed-content 拦截 http://，须 reqwest 转发） | `remote-desktop-transport.ts:74-88,163-190`；`RT/commands/remote_proxy.rs:369` |

### 4.2 调用点 → 后端 → DTO → store → UI → 难度（代表性主链）

| 调用点（FE） | 后端方法 | DTO | store | UI consumer | 难度 |
|---|---|---|---|---|---|
| `acpPrompt` api.ts:287 | `acp_prompt`→`send_prompt_linked_with_message_id` manager.rs:869 | `PromptInputBlock`+clientMessageId | conversation-runtime-store（optimistic） | Composer/Timeline | **D** |
| `acpConnect` api.ts:224 | `acp_connect`→`spawn_agent` manager.rs:439 | `ConnectionInfo` | acp-connections-context | 连接徽标 | **D** |
| `acp://event` 订阅 | `emit_with_state` event_bridge.rs:495 | `EventEnvelope{seq}` | connection reducer + runtime store | 时间线/工具卡 | **D–E** |
| `createConversation` api.ts:3151 | `create_conversation_core` | `ConversationSummary` | app-workspace-store + tab-store | Sidebar/TabBar | **C** |
| `listAllConversations` api.ts:1967 | `list_conversations_sync`（parser 现场解析） | `ConversationSummary[]` | app-workspace-store | Sidebar | **C** |
| `getFolderConversation` api.ts:2123 | parser 链 `get_folder_conversation_core` | `DbConversationDetail`（含 prefix_hash/in_flight_user_turn_id） | runtime store prefix cache | Timeline | **C–D** |
| `terminalSpawn` api.ts:4534 | `terminal_spawn`→TerminalManager | TerminalInfo | terminal-context | xterm 视图 | **B**（换 attach descriptor） |
| `gitWorktreeAdd` api.ts:2273 | `git_worktree_add` | FolderDetail | app-workspace-store | 分支下拉 | **B→移交后 C** |
| `respondPermission` | `acp_respond_permission` | request_id+option_id | connection state | PermissionDialog | **B**（语义换 Review） |
| `listOpenedTabs/saveOpenedTabs` | `tab_service` CAS | `OpenedTabsSnapshot{version}` | tab-store | TabBar | **C**（持久化格式含 agent_type） |
| `workTaskCreate` api.ts:3439 | work_task 引擎 | `WorkTaskInfo` | tasks-view | 任务板 | **E**（被 AB Work 取代） |
| `automationCreate` api.ts:3358 | automation 引擎 | `AutomationInfo` | automations-view | 自动化页 | **E** |
| `startWebServer` api.ts:4578 | 内嵌 Axum | config | settings | web-service 设置页 | **E** |
| `remoteUploadAttachment` api.ts:3845 | remote_proxy | — | — | 上传控件 | **E**（换 WSL bridge 后） |
| `openCommitWindow` api.ts:2967 | `commands/windows.rs:599` | 窗口 label | — | git 窗口 | **A** |
| appearance/主题/语言 | tauri.ts 3 个独有命令 | 标量 | appearance store | 设置页 | **A** |

### 4.3 耦合分级结论

- **A 纯展示，可直接保留**（约 30–35% 前端代码）：`components/ui`、`message/`、`ai-elements/`、`diff/`、i18n（10 语言 3.0MB）、appearance/theme 体系、窗口 chrome/拖拽、pet 视觉层。
- **B 只需替换 API adapter**（约 10%）：terminal UI（换 attach descriptor）、文件树/目录浏览器（换 Workspace API）、通用设置表单、`open_in`/dialog 类。
- **C 依赖 Codeg DTO，需 anti-corruption mapping**（约 15%）：Sidebar/TabBar/Timeline 消费的 `ConversationSummary`/`MessageTurn`/`DbConversationDetail`、tab 持久化格式、git 文件树（folder 语义）。
- **D 依赖 Codeg 状态机，需重写 feature**（约 15–20%）：`acp-connections-context.tsx`（6150 行事件扇出/LiveMessage/seq 去重）、`conversation-runtime-store` 的 optimistic→persist→streaming 状态机、`use-connection-lifecycle`、delegation 体系。
- **E 与 Codeg backend/runtime 不可分割，应删除**（约 20–25%）：work_task/forge/automation/chat_channel/experts/science/import-sessions/token-usage 的 UI+API、web-service 管理、backup（绑 codeg DB）、remote_proxy、`lib/` 内约 20 个 harness 特化模块中的后端配对部分、`parsers` 对应的前端展示假设（codex-code-mode 等）。

---

## 第五部分：切割线方案比较

| 方案 | 可保留比例 | 需重写核心 | 语义泄漏风险 | Win/WSL 难度 | 流式 | terminal/attach | 权限确认 | multi-Harness/Profile | continuation | 长期成本 | 双 authority？ | 定位 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** 全前端保留+AgentBoxBackend adapter 模拟 415 命令 | 前端 90% | 一个巨型 adapter（模拟 309 Tauri 命令+415 调用点语义） | **极高**（Conversation/external_id/seq 协议全被搬进 adapter） | 低（同 E） | 可 | 难（terminal:// 事件模拟） | 需模拟 live 语义 | 差（UI 假设单 agent/tab） | 假 | **最高**（adapter 永久维护） | 是（adapter 成第二个 Codeg） | 否决 |
| **B** 保留页面与组件，重写 stores/use-cases/client | 前端 55–65% | api 层→ports；acp-connections-context→新 runtime provider；runtime store 输入侧；workspace store | 中（MessageTurn 保留为 ViewModel 可控） | 低（与传输无关） | 可（归一化到 Observation） | 可 | 可 | **好**（组件本就参数化 agentType） | 可设计 | 中 | **否**（唯一 authority=AB） | **最终架构（前端侧）** |
| **C** 只留 Design System 重写产品 | ~15% | 全部 feature | 低 | 低 | 可 | 可 | 可 | 好 | 可 | 高（重造 conversation/terminal/git UI） | 否 | 否决（浪费最大资产） |
| **D** ACP 包装 Agent-Box 为终态 | 高（不动 Codeg 后端思路） | 无 | **极高**（治理语义被 ACP 抹平：无 Binding/Freeze/Finish；GUI 仍自建会话行/进程/工作树） | 中 | 可 | 可（经 codeg 通道） | 经 ACP request | 差（Profile 只能塞 config options） | 单 harness 内 | 高（两套治理永久并存） | **是** | 仅作联调桥 |
| **E** 桌面直连 Agent-Box Host API（HTTP/WS） | 同 B | agent-box-client + 归一化层 | 低（DTO 显式映射） | 中（WSL 可达性+mixed-content） | **好**（WS 原生） | **好**（TerminalSession/Presenter） | **好**（Review/Dispatch 一等） | **好**（Host 一等概念） | 好 | 低 | 否 | **最终架构（协议侧）** |
| **F** Windows Tauri→WSL bridge→Host | 同 E | Rust `agent_box_bridge` 模块 | 低 | **中低**（复用 remote_proxy 成熟模式：webview 不直连 http，Rust 转发；`\\wsl.localhost\`/wslpath 转换集中一处） | 好（WS 经 Rust 透传，`remote-ws-event-{id}` 定向事件模式现成，remote_proxy.rs:1551） | 好 | 好 | 好 | 好 | 低 | 否 | **最终架构（传输侧）** |
| **G** 混合：先 ACP bridge 后换 native API | 前段同 A/D、后段同 B/E | 先 custom_agent 描述符+联调，后迁移 | 前段中→后段低 | 前段低 | 前段可 | 前段可 | 前段可 | 前段差 | 前段假 | 中（有明确淘汰计划） | **过渡期是**（须显式标记 deprecated） | **推荐过渡** |

### 推荐

**最终架构 = B + E + F**：
- 前端：保留页面与组件（B），`FE/lib/types.ts`+`api.ts`+`acp-connections-context` 替换为 `ports/`（Agent-Box Host API 的 TS 端口）+ `adapters/`（DTO→ViewModel）+ 新 runtime provider。
- 协议：**Agent-Box Host API 直连（E）**。理由：ACP 的会话语义（`session/new` 在 spawn 之后才发生，`connection.rs:3858-3906`）与 GUI 必须的"先选 Workspace/Harness/Profile/Sandbox 再建 Work"顺序相反；Binding/Freeze/Finish/Outputs 在 ACP 中没有承载点，硬套 ACP 会把 Agent-Box 降格为"第 16 个 agent"，重演双 authority。
- 传输：**Rust 内 WSL bridge（F）**。webview 是 secure context，直连 `http://127.0.0.1` 被 mixed-content 拦截——Codeg 已为远程模式解决过同一问题（`remote-desktop-transport.ts:74-88` 注释 + `remote_proxy.rs:369` reqwest 转发 + `remote-ws-event-{id}` 定向事件），模式照搬即可，同时把 token、重连、`\\wsl.localhost\` 路径转换收敛在 Rust 一处。

**过渡架构 = G（可选）**：若 Host API 尚未覆盖流式/权限，可先把 Agent-Box 注册为 Codeg custom ACP agent（custom_agent 表 + `custom:` 前缀已是现成逃生门，`types.ts:36-38`），只验证 prompt/streaming/permission 三件事；验证期产出的每一段 UI 代码都必须经由将来的 ViewModel 接口，禁止直接读 `external_id`。

---

## 第六部分：保留到哪个层级（精确裁决）

### 裁决表

| 路径/模块 | 裁决 | 说明 |
|---|---|---|
| `FE/components/ui/`（48 原语） | **必须保留** | 零后端耦合 |
| `FE/i18n/`（10 语言） | **必须保留** | key 需随 feature 调整 |
| 主题/外观/字体/背景体系（appearance-*, theme-presets, font-presets, window chrome） | **必须保留** | 纯桌面 |
| `FE/components/message/`、`ai-elements/`、`diff/` | **必须保留** | 只吃 `MessageTurn`/`AdaptedToolCallPart` 中间形态（`ai-elements-adapter.ts:25-53`） |
| `FE/components/chat/`（composer/permission-dialog/ask-question） | **推荐保留** | 换 ViewModel 与 Review 事件源 |
| `FE/components/conversations/` + `layout/`（shell/侧栏/tab） | **推荐保留** | 换 store 输入侧 |
| `FE/components/terminal/` + `lib/terminal/` | **推荐保留** | 渲染层保留；spawn/attach 改走 AB TerminalSession descriptor |
| `FE/components/{tasks,forge,automations,canvas}/`、`import-sessions`、`project-boot` | **最终删除**（前两者随迁移评估） | 被 AB Work/Outputs 取代；canvas 若保留需重绑资源 |
| `FE/components/settings/` | **拆分保留**：appearance/system/logs/shortcuts 保留；agents/model-providers/mcp/web-service/skill-packs 删除或由 AB Profile/Workspace 配置页替代 | settings 41.8k 行中约四成绑 Codeg 配置面 |
| `FE/lib/api.ts` + `tauri.ts` | **最终删除** | 415 命令的 Codeg 语义凝结核 |
| `FE/lib/transport/`（tauri 部分） | **必须保留**（`tauri-transport.ts` + detect）；web/remote 部分**替换**为 agent-box transport | |
| `FE/lib/types.ts` | **最终删除**（新 `ports/types.ts` 只保留 MessageTurn/ContentBlock 等 ViewModel 形状） | |
| `FE/stores/conversation-runtime-store.ts` | **重写输入侧，保留机制**：prefix-cache/乐观回滚/phase 标记机制可移植 | 输入类型全为 Codeg DTO |
| `FE/stores/{app-workspace,tab}.store` | **重写**（tab 持久化格式重设计） | |
| `FE/contexts/acp-connections-context.tsx` | **最终删除** | 6150 行 ACP 事件扇出 |
| `FE/contexts/` 其余（workspace/tab/theme/alert…） | **推荐保留**+重接线 | |
| `FE/hooks/` | 拆分：UI 钩子保留；14 个直连后端的钩子重写 | |
| `FE/lib/adapters/` | **推荐保留** `tool-kind-classifier`/ai-elements 适配，输入改为 Observation | |
| `FE/lib/` 约 20 个 harness 特化模块（codex-code-mode、pi-thinking、opencode-permissions、cursor-model-variants…） | **最终删除**（由 AB Harness/Profile 吸收） | |
| pet（前端+`pets/`+pet_state_mapper） | **可以暂时保留** | 纯娱乐层；事件源换 AB 状态后可低成本续命 |
| `RT/lib.rs` tauri_app::run | **拆解保留**：窗口/托盘/更新/插件链保留；ACP/delegation/pet/引擎 spawn 全删 | `lib.rs:245-840` 大部分是待删 authority 装配 |
| `RT/commands/windows.rs`、`preferences.rs`、`update/`、`logging/`、`supervise.rs`、`file_io.rs`、`git_credential.rs` | **必须保留** | 桌面平台层 |
| `RT/commands/folders.rs` 的文件树/目录枚举部分 | **推荐保留**（作为本地 Workspace 浏览的 presenter），worktree/git 命令**移交** agent-box-git | |
| `RT/acp/`（全部 20k+8k 行）、`vendor/sacp-tokio` | **最终删除** | 进程/协议 authority |
| `RT/db/`、`RT/parsers/`、`RT/acp_transcript.rs` | **最终删除**（一次性迁移脚本读旧库导出 UI 需要的元数据） | |
| `RT/terminal/manager.rs` | **adapter 接通后删**：PTY 属主换 AB TerminalSession | |
| `RT/work_task/`、`RT/automation/`、`RT/chat_channel/`、`RT/forge/`、`RT/acp/delegation/`、`bin/codeg_mcp.rs` | **最终删除** | 与 AB Work/Review 直接冲突的 authority |
| `RT/web/`（Axum 内嵌服务器） | **最终删除**（桌面端）；若保留浏览器访问形态，由 Agent-Box 前置网关承担 | |
| `RT/commands/remote_proxy.rs` + `remote_workspace*` | **替换**为 `agent_box_bridge`（模式复用） | |
| codeg-mcp 委派体系 | **最终删除**；多智能体委派由 AB 的 Harness 编排承担 | `RT/acp/delegation/`、`bin/codeg_mcp.rs:1-313` |

### 十个具体问题

1. **React 页面值得保留吗？** 值得。`/workspace` 单页 + git 多窗口的骨架（`app/workspace/layout.tsx:697-1336`）就是目标产品形状；但 conversation detail 的数据管线要重接。
2. **stores 可以保留吗？** 机制可以（prefix cache、乐观回滚、CAS 版本），实例不行——三个主 store 的输入类型全是 Codeg DTO（`conversation-runtime-store.ts:9-18` 直接 import `DbConversationDetail`）。
3. **Conversation/Session 数据模型应保留吗？** 不作为 authority。Conversation 元数据（标题/置顶/folder 绑定）可一次性迁移进 AB Workspace/Work 的附属字段；`external_id` 不迁移。
4. **Rust/Tauri shell 值得保留吗？** 值得，但只保留"桌面壳"职责（窗口/托盘/更新/通知/文件对话框/凭据 helper），其余 298k 行 Rust 中约 88–92% 删除。
5. **SQLite 应继续存在吗？** 不作 authority。可短期保留为 **UI 偏好库**（tab 布局、侧栏分组、外观），长期迁到 JSON/AB 用户偏好。会话/任务/用量表全部废弃。
6. **ACP client 适合作为长期协议吗？** 不适合。它只覆盖 prompt/stream/permission，缺 Binding/Finish/Outputs；且 Codeg 的 ACP 层已堆满 per-harness `_meta` 特化（`connection.rs:3679-3774` client capabilities 广告），复用它=继承全部特化债。仅作过渡联调桥。
7. **terminal/PTY 后端归属？** 移交 Agent-Box TerminalSession/Presenter。Codeg 两套终端（用户 PTY 与 ACP 管道终端）本就是分裂实现（§链 8）；AB 统一为"终端是资源"，前端只保留 xterm 渲染 + attach descriptor。
8. **worktree 管理必须移交 agent-box-git 吗？** 必须。Codeg 已存在三重 git authority（用户命令层、work_task 引擎、agent 自身），且有提示词级（而非能力级）约束（`engine.rs:6007-6020`）与两套同构收敛实现（`folders.rs:3293` vs `engine.rs:5498`）。AB 的 requested→exact Ref 绑定正是解药。
9. **permission UI 保留到什么程度？** 组件层（PermissionDialog/plan 卡/ask 卡）保留；`request_id/option_id` 协议换成 AB Review 事件；`allow_always` 记忆从"agent 侧隐式"改为"AB policy 显式"，前端可新增"已批准规则"视图。
10. **updater/窗口管理/托盘/通知可完全保留吗？** 可以，零改动或近零改动（`tauri_plugin_updater`、`windows.rs` 托盘、notification 均不触后端语义）。

---

## 第七部分：目标边界（建议结构）

```
frontend/
  design-system/          # 现 components/ui + theme/appearance（零改动迁入）
  shell/                  # 窗口 chrome、布局、路由、i18n、平台钩子
  features/               # conversation / work / terminal / git-view / settings
  state/                  # ViewModel stores（只装 ViewModel + cache 标记）
  application/            # use-case 编排（createWork、dispatch、finish、subscribe）
  ports/                  # AgentBoxHost 端口定义（TS 接口 + 事件名）
  adapters/               # Host DTO → ViewModel 映射；Observation → MessageTurn 投影
  legacy/                 # 迁移期临时存在，逐季清空

src-tauri/
  desktop-shell/          # 窗口/托盘/更新/通知/对话框/单实例（现 windows.rs 等收编）
  wsl-bridge/             # wsl 可达性探测、http/ws 转发、token、路径翻译
  agent-box-client/       # Host API Rust 客户端（类型 + 重连 + 流透传）
  presenter/              # 把 AB 事件转成 Tauri 事件（ab://work/{id} 等）与本地文件操作
  updater/                # 现有 update/ 模块
```

**边界规则**

1. **React 不认识 Work Core 内部对象**：组件 props 只允许 `features/` 定义的 ViewModel（`WorkView`、`ExecutionView`、`TimelineTurnView`、`BindingView`、`TerminalAttachView`、`ReviewRequestView`）。禁止 import 任何 AB DTO 类型。
2. **DTO 转换点唯一**：TS 侧在 `adapters/`，Rust 侧仅在 `presenter/` 做事件通道命名。两侧都不做业务判断。
3. **流式事件归一化**：AB Observation/Tool 事件在 Rust `agent-box-client` 完成 harness 无关的定型，前端 reducer 只处理已定型事件——纠正现状（归一化散在 `connection.rs:11633-11834` + 前端 20 个特化模块）。
4. **optimistic UI**：沿用现机制但改主键——乐观 turn 用 `client_turn_id`（前端 UUID），confirm 以 AB 的 `execution_id + observation seq` 对账；`Conversation`/`Work` id 永远由 Host 返回，前端**不得生成实体 id**（现状反例：`conversation-detail-panel.tsx:197` 前端自造 optimistic id 属允许项，但 conversation id 由后端建——保持该分工）。
5. **权限映射**：AB Review 请求 → `ReviewRequestView{request_id, action, options, binding_context}`；用户选择经 `application/confirmReview()` 单通道回传；前端不缓存"已批准"状态（authority 在 AB policy）。
6. **terminal attach descriptor**：AB 返回 `{terminal_ref, attach_kind: ws|snapshot, initial_snapshot?, cwd_display}`；`terminal-view.tsx` 从"命令 spawn"改为"attach 到 ref"，写队列机制保留（`write-queue.ts:5-44`）。
7. **Windows/WSL transport 封装**：前端只见 `getTransport().call("ab_*")` 与 `subscribe("ab://…")`；wsl 寻址/转发/token 全在 `wsl-bridge/`。
8. **禁止前端成为第二个 Execution authority**：前端不得实现重试/自动完成/进程重启逻辑；执行生命周期动词（dispatch/cancel/finish/retry）只能调用 Host；断线重连后必须以 Host 快照为准（沿用 attach-with-snapshot 模式，`web-event-stream.ts:75-152` 的协议经验可平移）。
9. **cache-only 状态清单**：时间线窗口、侧栏快照、tab 布局、drafts——全部可丢弃可重建；凡带 `authority: true` 语义的字段（execution 状态、binding、review 结果）只读不写。

---

## 第八部分：最小替换原型

**原型目标**：证明 Windows/Tauri GUI → WSL Agent-Box Host 的全链路，且 GUI 不私建任何 authority。

- **最小页面范围**：新增独立路由 `/ab-prototype`（不触碰现有 `/workspace`），三栏：
  1. 资源选择：Workspace / Harness / Profile / Sandbox / Terminal 下拉（读 AB catalog）；
  2. Work 面板：Create Work（提交 requested bindings）→ 显示 **frozen exact Ref** → Dispatch → 状态徽标 → explicit Finish；
  3. 流面板：Observation 流（文本/工具卡复用 `content-parts-renderer`）+ Outputs/Evidence 列表。
- **最小 API/bridge**（Rust bridge 命令 10 个 + 1 条事件流）：
  `ab_health`、`ab_catalog`（harness/profile/workspace/sandbox/terminal 合一）、`ab_create_work(requested_bindings)`、`ab_get_work`（frozen binding）、`ab_dispatch(work_id)`、`ab_finish(work_id)`、`ab_list_outputs(work_id)`、`ab_cancel(work_id)`、`ab_attach_stream(work_id, since_seq)`、`ab_terminal_attach(terminal_ref)`；事件经 presenter 以 `ab://work/{id}`、`ab://review/{id}` 发给 webview。
- **需要保留的 Codeg 文件**：`components/ui/*`、i18n、theme/appearance、`transport/tauri-transport.ts` + `detect.ts`、`platform.ts`、`tauri.ts` 的 3 个窗口命令、`commands/windows.rs`、`update/`、`logging/`。
- **需要新增的 adapter**：`FE/lib/agent-box/{types,client,view-model}.ts`；`RT/agent_box_bridge/{mod,http,ws,paths}.rs`（HTTP 转发照抄 `remote_proxy.rs:369` 模式；WS 转发照抄 `remote-ws-event-{id}` 定向事件模式，`remote_proxy.rs:1551`）。
- **暂不触碰**：`/workspace` 全链路、`acp/`、`db/`、`parsers/`——原型期旧后端原样运行，两套并存由路由隔离。
- **验收标准**：
  1. WSL 内 Agent-Box 未启动时 GUI 显示不可达，启动后 30s 内自愈重连；
  2. 能列出 5 类 Harness 与各自 Profile；
  3. Create Work 返回的 binding 为 frozen exact Ref（修改请求不得改写已冻结 Ref）；
  4. Dispatch 后文本/工具/权限事件以 <200ms 首帧延迟呈现；
  5. Review 请求可确认并继续执行流；
  6. explicit Finish 后 Outputs/Evidence 可读；**进程退出不产生 Finish**（验证语义差）；
  7. 前端代码 grep 不到 `external_id`/`acp_prompt`/`conversation_id`（单 authority 验证）；
  8. 重启 GUI 后 attach 恢复，不重复创建 Work。
- **实施顺序**：① `wsl-bridge` 连通 `ab_health` → ② `ab_catalog` + 选择器 UI → ③ `create_work` + frozen binding 展示 → ④ `dispatch` + 事件流归一化渲染 → ⑤ review 确认 + `finish` + Outputs → ⑥ 删除清单第一刀（`acp_prompt` 相关死代码标记 deprecated）。
- **哪一步证明切割线**：第 ④ 步。若"Observation → 既有工具卡组件"能在**不修改任何 conversation 组件内部**的情况下完成渲染，即证明组件层/状态层切割线选对了；若做不到，说明组件仍隐含 Codeg 语义，需回退修补 `adapters/`。

---

## 第九部分：删除路径与风险

### 候选删除 ledger

| 阶段 | 项 |
|---|---|
| **立即可删**（原型期） | 无（原型只增不删；以下为"具备删除条件"清单） |
| **adapter 接通后可删** | `FE/lib/api.ts`、`tauri.ts`、`types.ts`、`acp-connections-context.tsx`、`components/{tasks,forge,automations}/`、import-sessions、token-usage 页、web-service 设置页、`RT/web/`（桌面内嵌 Axum）、`RT/commands/{remote_proxy,remote_workspace}.rs`（换 bridge 后） |
| **terminal 接通后可删** | `RT/terminal/manager.rs`、`RT/acp/terminal_runtime.rs`、`FE/components/terminal` 中的 spawn 逻辑（保 attach） |
| **migration 完成后可删** | `RT/acp/` 全部、`RT/db/`、`RT/parsers/`、`RT/acp_transcript.rs`、`RT/work_task/`、`RT/automation/`、`RT/chat_channel/`、`RT/forge/`、`RT/acp/delegation/`、`bin/codeg_mcp.rs`、`bin/codeg_server.rs`、experts/science/pets 后端（若不保留）、`RT/lib.rs` 中对应装配（`lib.rs:245-840` 大部）、约 20 个前端 harness 特化模块 |
| **暂时不能删** | SQLite（作 UI 偏好库）、`commands/folders.rs` 文件树部分、git 凭据 helper（`git_credential.rs`）、appearance/preferences、pet（若保留） |

### 风险清单（逐条对应证据）

1. **hidden process ownership**：主窗口关闭钩子直接杀 ACP 连接与终端（`lib.rs:1003-1015`）；`on_exit`/kill_tree 兜底（`connection.rs:1958-1973`）。替换后进程属主必须是 AB RuntimeHost；Tauri 侧只通知，不 kill。
2. **hidden session recovery**：resume→load→new 的静默回退链（`connection.rs:5106-5549`）+ custom agent 的"本地可恢复"分支。迁 AB 后由 Work/Execution 显式状态取代，禁止 GUI 猜。
3. **implicit DB authority**：26 张表中 `conversation.status`/`work_task.status` 是隐式执行事实来源；lifecycle 订阅者异步写（`lifecycle.rs:237-295`）——存在"DB 状态与运行态短暂不一致"窗口，AB Finish 后应删除该写路径。
4. **frontend-generated IDs**：`optimistic-${randomUUID()}`（`conversation-detail-panel.tsx:197`）+ tab id 规范 `conv-${folderId}-${agentType}-${conversationId}`（`tab-store.ts:407-410`）+ tab 持久化含 `agent_type`（`:491`）。新模型中仅允许 `client_turn_id` 一类临时 id。
5. **duplicate retry**：`spawn_agent` 的 SpawnDedupKey 去重 + 活连接复用（`manager.rs:468-496`）是 Codeg 自己补的幂等；AB Dispatch 必须内建幂等键，否则 GUI 双击即产生双 Execution。
6. **process exit 自动完成**：`Disconnected` 触发 reducer 状态清理与 UI 提示，但**不是** Finish（§链 11）；迁移时必须封死"连接断开→任务完成"的旧联想（任务板/侧栏徽标消费 `ConnectionStatus`）。
7. **worktree 双重管理**：用户命令层与引擎两套同构收敛（`folders.rs:3291-3293` 自认）+ agent 侧 git 突变仅受提示词约束（`engine.rs:6017-6020`）。移交 agent-box-git 前**不得**让 GUI 再提供第二个 worktree 创建入口。
8. **permission 双重确认**：迁移期 ACP request 与 AB Review 并存时，同一操作可能弹两张卡；必须按 authority 二选一渲染。
9. **Windows/WSL path translation**：前端已有 `C:\`/UNC 拼接（`path-utils.ts:8-46`）；引入 WSL 后同屏可能出现 `C:\...`（Windows 侧文件选择）与 `/home/...`（AB Workspace Ref）两套路径。规则：路径字符串只在 `wsl-bridge`/`presenter` 转换，ViewModel 携带"显示路径 + 原始 Ref"双字段。
10. **ACP 与 AB event 语义不一致**：ACP `session/update` 的 tool_call 无 Binding 上下文，AB Observation 有；`stop_reason=end_turn→PendingReview`（`lifecycle.rs:260`）与 AB explicit Finish 不同构。过渡桥（方案 G）里必须写映射表并标注不可映射项（Finish、Freeze）。
11. **UI 单 Harness/单 Profile 假设**：tab id 含单一 agentType、agent 选择器一 tab 一选（`tab-store.ts:60-107`）、work_task 一任务一 conversation。Profile 动态切换需要 Work 级而非 tab 级的形态模型——这是组件层改动最集中的地方。

---

## 第十部分：总结论

1. **层数**：16 层（§第二部分）。
2. **推荐保留到哪一层**：保留层 1–2（组件与页面骨架）、层 8（桌面平台集成）、层 16（打包/更新）；层 3–6 保留机制、重写实现（B 方案）；层 7 重写为 bridge；层 9–15 全部由 Agent-Box 接管。
3. **最终删除的核心后端 authority**：`acp/`（进程+协议）、`db/`+`parsers/`（持久+投影）、`work_task/`、`automation/`、`chat_channel/`、delegation+codeg-mcp、`terminal/manager.rs`、`web/` 内嵌服务器（§第六部分裁决表）。
4. **推荐最终接口**：Agent-Box Host API（HTTP/WS）直连；ACP 仅作可选过渡联调桥（G）。
5. **Windows/WSL bridge 位置**：Tauri Rust 进程内新模块 `agent_box_bridge`（复用 `remote_proxy.rs` 的 reqwest 转发 + 定向事件模式），不在 webview、不引入额外 sidecar。
6. **可复用代码比例**：前端约 55–65%（30–35% 零改动）；Rust 约 8–12%（桌面壳+presenter）。绝对量：前端 235k 行非测试代码中约 130–150k 可留，Rust 299k 行中约 25–35k 可留。
7. **第一段原型**：`/ab-prototype` 单页 + 10 个 bridge 命令 + `ab://work/{id}` 事件流（§第八部分）。
8. **是否需要修改 Agent-Box Work Core**：**基本不需要**。原型期唯一硬需求是幂等 Dispatch 键与跨进程事件重放的 snapshot 语义（若 Host 已有则零改动）；Codeg 侧的 resume/continuation、UI 偏好持久化可用 AB 现有概念承载。若 Host API 尚未覆盖 TerminalSession attach 或 Review 事件流，需要的是**补齐 Host API 表面**而非改 Work Core 语义。
9. **最大的三个迁移风险**：① 三套执行状态（ConnectionStatus/conversation.status/WorkTaskStatus）并入 AB Execution 时的语义映射错误——尤其 "process exit ≠ Finish" 被旧 UI 直觉污染；② worktree/git 三重 authority（用户命令、work_task 引擎、agent 自身）移交不彻底导致 AB Binding 与现实漂移；③ 迁移期双 authority 并存（ACP 桥 + Host API）中 permission/finish 双重确认与事件语义错配（§第九部分）。
10. **Verdict：READY FOR AGENT-BOX BACKEND REPLACEMENT PROTOTYPE**——切割缝清晰（transport 抽象、组件只吃中间形态、`custom:` agent 已是逃生门），无需先改 Agent-Box Work Core 即可开工；但正式替换必须以 anti-corruption 层 + 单 authority 纪律为前提。

---

### 附：关键证据索引（跨章复用）

- 启动装配：`RT/lib.rs:245-840`；服务器镜像：`RT/bin/codeg_server.rs:255-300`
- 共享状态：`RT/app_state.rs:16-78`
- ACP 连接：`RT/acp/connection.rs:1892-2165`（spawn）、`3858-3906`（session/new）、`8109-8229`（prompt 循环）、`11619-11834`（事件归一化）
- manager：`RT/acp/manager.rs:439-549`（spawn 去重）、`869-1346`（prompt 链接/状态先写/幂等 id）
- 事件桥：`RT/web/event_bridge.rs:438-541`；`RT/acp/types.rs:53-58`（EventEnvelope）
- 前端凝结核：`FE/lib/api.ts`（415 命令）、`FE/lib/types.ts:2-40`（AgentType）、`FE/contexts/acp-connections-context.tsx:3439-3932, 4485-4542`、`FE/stores/conversation-runtime-store.ts:1881-1946, 3630-3688`
- 权限：`RT/acp/connection.rs:2292-2505, 6148-6257`；UI `FE/components/chat/permission-dialog.tsx:52-54`
- 终端双系统：`RT/terminal/manager.rs:241-523` vs `RT/acp/terminal_runtime.rs:488-699`
- worktree/任务：`RT/commands/folders.rs:692-800, 3095-3373`；`RT/work_task/engine.rs:334-408, 1388-1489, 3292-3604, 5961-6023`
- 恢复：`RT/acp/lifecycle.rs:1577+, 237-295`；`RT/automation/engine.rs:219-228`；`RT/work_task/engine.rs:334-408`
- DTO 无代码生成佐证：`src-tauri/Cargo.toml`（无 schemars/ts-rs/specta）；手工镜像示例 `FE/lib/types.ts:98-110` ↔ `RT/models/conversation.rs:9-27`
