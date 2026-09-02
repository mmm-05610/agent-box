# 未决问题（Phase 1 审计）

> 只保留尚未裁决的问题；已回答的移入 DECISION_LOG.md。
> 2026-09-02：Q3 已裁决（D-005，主区单会话+右侧面板标签）；Q1 随之消解（无会话标签集）。
> 当前仅剩 Q2。

## 仍未裁决

### Q2. Project 注册表在 Agent-Box 中归谁（blocking: workspace:folder-list, workspace:remote-project, session:restore-last）

**2026-09-02 更新（D-003 后收窄）**：领域形态已裁决——Folder 改型为 Project
（origin: local/ssh/wsl/docker），会话挂项目下。剩余问题只是**注册表存放位置**：

**选项**：
- A. Studio Backend DB 注册表（项目列表/排序/元数据服务端权威，多端同步；
  现 Codeg 的 folder/remote_workspace_connection 表即此模式，含变更广播）
- B. 设备本地（项目列表与远端连接凭据只存本机；启动无需注册表 API，丢多端同步）

**当前 Codeg**：A。
**Agent-Box 影响**：决定 WorkspacePort 是否需要服务端查询/事件 API。
**前端影响**：A → 列表查询 + 事件收敛（同现有模式）；B → 启动直接读本地存储。

## 已观察但非本轮裁决（进入后续 Phase 的问题池）

| 问题 | 主题 | 建议裁决时机 |
|---|---|---|
| Conversation 是否固定 Profile/Harness（tab 身份三元组重定义） | Phase 2 | 下一轮 |
| Chat mode（无目录会话）是否保留为一等公民 | Phase 2 | — |
| `conversation_status_changed` 的事件通道归属（ACP 通道 vs 业务通道） | Phase 4 | — |
| status/title/pinned 的收敛通道合并 | Phase 4 | — |
| 事件投递策略（firehose vs attach replay）是否影响 AB 事件通道设计 | Phase 4 | — |
| `folder.git_branch` 轮询能否被 AB Git 插件事件替代 | Phase 9 | — |
| Web 模式是否仍是 AB 部署形态（决定 auth-gate 与 ws-health 的 disposition） | Phase 10 或独立轮 | — |