# Agent-Box Studio 前端能力审计（Phase 1）

> **⚠ 使命变更（2026-09-02 晚）**：用户裁决——本仓库将**原地改造**为用户自己的项目
> （不再维持 Codeg 原样）。审计的"只读"约束由用户解除：
> - 开设 `studio-shell` 分支进行改造，main 保留 Codeg 原貌作对照；
> - 改造按切片提交，每个切片对应矩阵行/决策（MIGRATION_SLICES 即改造 backlog）；
> - 决策日志继续记录改造中的产品取舍；矩阵行随实现落地更新 status。
> - 已执行：第一刀 D-002（项目启动器 REMOVE）——前端引用全部摘除
>   （src/app/project-boot、src/components/project-boot、api/types/sidebar/
>   quick-actions/new-folder-dropdown、10 语言文件），eslint 0 错误、
>   vitest 393 文件 5607 用例全过、next build 静态导出通过。
>   后端路由/命令（router.rs 的 project_boot 段）成为死代码，留待后续切片清理。

审计日期基准：2026-09-02（会话内 "currentDate"）
审计对象：`/home/maoqh/projects/agent-box-studio`（Codeg v0.29.0，HEAD `93c33861`）
Agent-Box 只读参考：`/home/maoqh/projects/agent-box-resource-routing-phase2`（分支 `feat/resource-routing-phase2`，HEAD `1a3c308`）

## 审计目标

不是回答“Agent-Box 怎样兼容 Codeg 的 400 多个接口”，而是回答：

> “Agent-Box Studio 最终需要保留哪些用户能力，每项能力真正依赖什么，
> 哪些只是 Codeg 后端实现泄漏，新的前端领域模型应当是什么？”

审计主轴（每轮一个小主题）：

```text
页面/组件 → 用户行为 → 前端状态 → API command → 事件订阅 → 隐含时序
→ 当前后端 authority → Agent-Box 对应 authority → 保留/重接/重设计/删除/延期
```

## 证据标签约定

- OBSERVED：从代码直接确认（必须带 file:line）
- INFERRED：由多处代码推导，无明确契约
- DECIDED：用户已裁决
- PROPOSED：建议，尚未裁决
- UNKNOWN：证据不足
- DEFERRED：用户明确延期
- REJECTED：用户明确不采用

## 当前进度

| Phase | 主题 | 状态 |
|---|---|---|
| 1 | 应用 Shell 与 Bootstrap（启动 → Conversation 列表可见） | 已审（进行中，待用户裁决 2 问） |
| 2 | 新建 Conversation | 未开始 |
| 3 | 发送第一条 Prompt | 未开始 |
| 4 | 实时 Session | 未开始 |
| 5 | Permission / Question / Plan Approval | 未开始 |
| 6 | 历史与 Continuation | 未开始 |
| 7 | Profile / Harness Settings | 未开始 |
| 8 | Skills | 未开始 |
| 9 | Workspace / Files / Git / Terminal | 未开始 |
| 10 | 高级能力（delegation/tasks/automations/MCP/…） | 未开始 |

## 已完成主题（Round 1）

应用启动链：环境检测 → auth gate → 三层 Provider 嵌套 → 并发 bootstrap
fetch（folders×3 + conversations + tabs）→ 事件订阅 → 首屏渲染。
详见 [CURRENT_UI_SURFACE_MAP.md](./CURRENT_UI_SURFACE_MAP.md) 与
[CURRENT_COMMAND_EVENT_MAP.md](./CURRENT_COMMAND_EVENT_MAP.md)。

## 待审主题（下一轮开始）

Phase 2：新建 Conversation（Folder/Chat mode 选择、Harness/Profile 选择、
conversation row 何时创建、connection 何时创建、working dir 何时冻结）。

## 当前决策数量

4（D-002 项目启动器 REMOVE；D-003 Folder→Project；D-004 Shell 布局 ZCode 款；D-005 主区单会话+右侧面板标签，Q1 消解、tabs 三行 REMOVE/REDESIGN。待裁决：仅剩 Q2 Project 注册表归属，见 [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md)）

> 审计方式更新（2026-09-02）：自本轮起改为**交互式屏幕走查**——用户打开真实 Codeg
> Windows 客户端，按界面逐站走查（界面 → 背后机制 → 用户现场裁决 → 落账）。
> Phase 1 的启动链事实审计已完成；走查过程持续产出决策与矩阵行。

## 未决问题

见 [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md)。Round 1 两个待裁决问题：

1. Tab 集（打开的 conversation 标签）持久化归属：服务器共享 vs 设备本地
2. Folder/Workspace 注册表（打开过的目录列表 + 分组）在 Agent-Box 中归谁

## 如何继续下一次交互

1. 用户裁决 OPEN_QUESTIONS 中的问题（或 DECISION_LOG 里标记 REJECTED/延期）。
2. 把裁决写入 [DECISION_LOG.md](./DECISION_LOG.md)，更新
   [FRONTEND_CAPABILITY_MATRIX.md](./FRONTEND_CAPABILITY_MATRIX.md) 相关行
   （decision_status → DECIDED，target_disposition 落实）。
3. 进入 Phase 2：新建 Conversation。读取 `create_conversation` /
   `create_chat_conversation` / `create_chat_dir` / `list_agents`、
   composer 新建流、`use-connection.ts` 的 connect 时序。
4. 按第十节“每轮结束时的状态保存”流程收尾（更新 4 个文档 +
   `git diff --check` + 报告）。

## 约束声明（截至本轮）

- 未修改任何产品代码（src/、src-tauri/、package.json、lockfile 零改动）。
- 未执行 git add/commit/push/merge/reset/clean/stash。
- 未发起真实模型请求、未读取 credential、未实施 MCP Resource。
- 审计期间只修改本目录下的文档。