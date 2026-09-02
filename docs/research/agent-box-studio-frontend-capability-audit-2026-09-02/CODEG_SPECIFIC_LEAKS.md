# Codeg-specific 泄漏清单（Phase 1 审计，Round 1）

> 定义：Codeg 后端实现细节泄漏到前端领域模型/契约的东西。
> 每轮新增；每项带证据与影响。严重度：S1=影响领域模型，S2=影响契约，S3=影响实现。

## Round 1 发现

### L1. tab 身份由 `(folder_id, agent_type, conversation_id)` 三元组构成（S1）
- 证据：`conv-${folderId}-${agentType}-${conversationId}`（tab-store.ts:405-411）。
- 影响：agent_type 进入 UI 稳定身份 → Conversation 与 AgentType 的固定绑定被写进 UI 层；
  一旦 AB 允许“同一会话在不同 Profile 间切换/重接”（Phase 2 决策候选），tab 身份字段就要重定义。
  相反地，如果 AB 保留“conversation 与 profile 固定”，这个三元组可以换成二元组
  `(conversationId, profileRef)` 或直接 `conversationId`。

### L2. sidebar 会话状态收敛依赖 ACP 事件通道（S1）
- 证据：`ConversationStatusEventBridge` 用 `useAcpEvent`（acp://event）消费
  `conversation_status_changed`（app-workspace-context.tsx:266-276）；
  该事件定义在 `src/acp/types.rs:221`（“sidebar converges through conversation://changed”注释表明
  它本意是 ACP 侧行为，却驱动全局 UI 状态）。
- 影响：非 ACP harness（终端型、非事件型 harness）下 status 通道语义存疑；
  CB 自己也维护第二条通道 `conversation://changed`（status patch）。同事实三通道，属过渡态遗留。

### L3. Folder 三合一（cwd authority + sidebar 组织 + git 上下文）（S1）
- 证据：`FolderDetail` 同时携带 path、git_branch、sort_order/color/parent_id/group_id、
  default_agent_type（types.ts:336-376）；worktree 子文件夹挂在 parent_id 上。
- 影响：AB 若把 workspace 身份给 harness/runtime 侧（WorkspaceV1 是执行契约），
  Studio 侧仍需要自己的“打开过的目录 + 分组 + 历史”注册表——否则 sidebar 无数据源。
  Q2 即为此裁决。

### L4. `folder.git_branch` DB 列恒为 null，分支显示完全依赖前端轮询（S3）
- 证据：app-workspace-store.ts:872-877（“The folder's `git_branch` column is always null today…
  branch state is resolved by git-head polling”）；轮询 10s/60s（app-workspace-context.tsx:238-244）。
- 影响：前端背着“轮询才是真相”的时序负担；AB Git plugin 若提供事件/查询，
  `get_git_head` 轮询可以替换为订阅或按需查询（GitPort 候选输入）。

### L5. Web 模式 HTTP command 依赖 WS-ready 门控（S3）
- 证据：`waitForReady()`（web-transport.ts:117-139）被 `acp_connect` 等调用；
  broadcaster `receiver_count == 0` 时丢事件（event_bridge.rs:44-56）。
- 影响：HTTP 与 WS 的生命周期耦合——AB Studio 若要减少耦合，需要把“事件可靠投递”与
  “命令通道”解耦（如：事件带持久化游标/离线重放，而不是依赖 reconnect 全量 refetch）。

### L6. 断线窗口事件丢失靠“重连后全量 refetch”兜底（S2）
- 证据：app-workspace-context.tsx:89-94（conversation）、173-178（folder）；
  tab-context.tsx:171-173（tabs）；event_bridge.rs:48-56（丢帧根因）。
- 影响：这是 CB 的事件投递策略（至少一次解码成本在客户端），不是产品需求。
  AB 的事件通道若提供游标/重放（attach 协议已示范 replay），refetch 负担可降级。

### L7. `conversation_status_changed` 的“DB 先行、事件后到”顺序契约（S2）
- 证据：app-workspace-context.tsx:260-262（注释：“The DB row is already updated by the backend
  before this event fires, so this only patches the in-memory summary”）。
- 影响：前端状态收敛依赖后端内部写序；AB 需要明确事件与查询快照的相对顺序，
  否则会出现先看到旧状态、再被事件纠正的闪烁（CB 也有此风险，靠 refetch 掩盖）。

### L8. `acp_*` 命名扩散到非 ACP UI 面（S3，命名层面）
- 证据：`acp-connections-context.tsx`（providers 名）、`useAcpActions`/`useAcpEvent`
  遍布布局；`acp_get_session_snapshot`（router.rs:749）等。
- 影响：命名把“会话连接”与“ACP 协议”绑死；AB 若支持非 ACP harness，
  前端概念应改叫 `SessionConnections`/`useSessionActions`，ACP 只是众多协议之一。

### L9. 全局事件通道 double：legacy firehose `acp://event` 与 attach 协议并存（S2，过渡态）
- 证据：ws_attach.rs:11-12（“The legacy global `acp://event` channel remains active during
  Phase 1-3 for backward compatibility; Phase 4 retires it”）。
- 影响：前端同时支持两种投递路径（web-event-stream.ts 是新的）；审计 Phase 4 时
  必须以 attach 协议为准、firehose 为历史负担，不要让 AB 复刻 firehose。

### L10. chat folder 用隐藏 `kind: "chat"` 的 DB 行实现“无目录会话”（S1，产品策略）
- 证据：types.ts:351-357（chat folders 藏于 allFolders）；`CreateChatDirResult`（types.ts:447-449）
  显示 chat 模式先建 scratch 目录再连 ACP。
- 影响：folderless chat 在 CB 里是一个隐藏 folder + 磁盘 scratch dir；
  AB 若把 chat 做成一等公民（无 cwd 会话），不需要这个伪装（Phase 2 裁决）。

### L11. `default_agent_type` 存在但启动链不消费（S3，死契约）
- 证据：`FolderDetail.default_agent_type`（types.ts:341）存在；启动 bootstrap
  （list_open_folder_details/all）的消费方（sidebar 渲染、openTab 参数）未看到读取点
  ——openTab 的 agentType 来自 tab 恢复或默认解析（resolve-default-agent.ts 存在，Phase 2 确认）。
- 影响：契约字段冗余；若 AB 的 Workspace 不绑定默认 harness/profile，可删除。

## 轮次索引

| 轮次 | 新增 | 备注 |
|---|---|---|
| Round 1 | L1-L11 | 全部来自启动链审计 |