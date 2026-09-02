# 前端领域词汇表（Phase 1 审计）

> 每个概念：当前 Codeg 含义（OBSERVED 带 file:line）→ Agent-Box 含义（OBSERVED/PROPOSED）
> → 是否等价 → 是否应改名 → 是否已裁决。
> 标 * 的概念在后续 Phase 补充证据后再定稿，本轮只记录首轮观察。

## 本轮已验证的概念

### AgentType ⚠（已观察，未裁决）
- **Codeg**：贯穿 wire 层的字符串枚举。出现在：`DbConversationSummary.agent_type`（types.ts:469）、`OpenedTab.agent_type`（types.ts:455）、`FolderDetail.default_agent_type`（types.ts:341）、sidebar 统计 `by_agent`（types.ts:318-322）、ACP connection 的 contextKey 构成。它同时语义载荷：harness 种类（claude/codex/opencode/gemini/…）、安装对象、配置 authority、tab 身份的一部分。证据：tab-store.ts:405-411、app-workspace-store.ts:162-179。
- **Agent-Box**：Harnesses plugin 区分 *harness facts* 与 *Profile*；AgentType 不应是 Profile 的替身（提示词约束：「把 Profile 伪装成 AgentType」被禁止）。
- **等价**：否。
- **改名建议**：PROPOSED——前端领域模型中拆成 HarnessRef / ProfileRef；AgentType 仅保留为 harness 标识（若有），不再兼任配置 authority 与 UI 身份。
- **裁决**：未裁决（Phase 2/7 主题）。

### Folder（⚠ 已观察，未裁决——即 Q2）
- **Codeg**：DB 行（`FolderDetail`，types.ts:336-376）；同时是 cwd authority（openTab 需要 folderId+path）、sidebar 组织单元（分组/排序/颜色）、git 上下文（父-子 worktree、分支徽标）、conversation 容器。`kind: repo|worktree|chat|...` 区分三种语义。chat folder 是“无目录会话”的隐藏载体（types.ts:351-357, store:571-580）。
- **Agent-Box**：`WorkspaceV1 = {path, source_digest}`，是执行适配器消费的材料化契约（resource_contracts/workspace_v1.py:10-18）；无 Codeg 式 folder 注册表/分组概念。AB 的 workspace 是否可枚举/可注册/可分组，phase2 参考中未见（UNKNOWN）。
- **等价**：否。Codeg Folder ≈ AB Workspace 概念的超集（多了注册表/UI 组织/历史）。
- **改名建议**：PROPOSED——若 AB 需要侧栏文件夹+分组，建议新概念 `WorkspaceEntry`/`StudioWorkspace`，避免与 AB `WorkspaceV1`（执行契约）混淆。
- **裁决**：未裁决（Q2 即为此）。

### Conversation（⚠ 已观察，未裁决）
- **Codeg**：DB 聚合根：`DbConversationSummary`（id/folder_id/title/title_locked/agent_type/status/kind/model/git_branch/external_id/message_count/child_count/…，types.ts:461-480）；`kind` 有 root/child/imported 等（详细枚举属 Phase 6 证据）；conversation 与 agent_type 固定绑定；`external_id` 指向 native session 文件（Phase 6）。实时状态由 ACP connection 承载，DB 行状态由后端在事件后更新。
- **Agent-Box**：Studio Backend 预期有 Conversation（提示词约束），但 Studio Backend 是否存在于 phase2 reference 中为 UNKNOWN（phase2 有 work_core/Work/Execution 与 resource contracts，未见 conversation 模块）。
- **等价**：概念名相同但内容待定。
- **裁决**：未裁决（Phase 2/6）。

### Tab（OBSERVED）
- **Codeg**：UI 对象，服务器持久化：`OpenedTab {id, folder_id, conversation_id, agent_type, position, is_active, is_pinned}`（types.ts:451-459），CAS 版本化（version + origin），跨客户端三向合并（tab-store.ts:2706-2889）。稳定 id `conv-{folderId}-{agentType}-{conversationId}`（tab-store.ts:405-411）。本地记忆（布局 blob `workspace:tab-groups:v1`）与服务器权威分离（tab-store.ts:313）。
- **Agent-Box**：无对应物。
- **裁决**：未裁决（Q1）。

### Connection（⚠ 已观察，未裁决）
- **Codeg**：运行时概念 = backend ACP ConnectionManager 里的 connection（`connection_id`），与 conversation 一对一（Phase 3/4 展开）；前端 `AcpConnectionsProvider`（acp-connections-context.tsx）按 contextKey 管理。desktop 走全局 acp://event firehose；web/remote 走 attach 协议（ws_attach.rs:38-54）。
- **Agent-Box**：Runtime protocol / Harnesses plugin 的 Session Driver 预期承载（提示词约束）。
- **裁决**：未裁决（Phase 4/6）。

## 后续 Phase 概念（占位，不展开）

| 概念 | 说明 | 展开 Phase |
|---|---|---|
| Turn / Execution | 一次提示-响应周期；AB Work/Execution 可能重新定义 | 3/4 |
| Native Session / ContinuationRef | 会话文件与恢复句柄 | 6 |
| ACP / AcpEvent / EventEnvelope / StudioSessionEvent | 事件语言与协议边界 | 4 |
| LiveSessionSnapshot / Observation | 快照/重放 | 4 |
| Workspace（AB 侧） | 执行契约 vs Studio 注册表 | 2/9 |
| Profile / HarnessType / ProfileRef | 配置 authority | 2/7 |
| Skill | 中央 SkillStore / 安装 receipt | 8 |