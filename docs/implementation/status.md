# Backend Server — status

更新：2026-09-14（设计者派单，未执行生产修改）。37 的独立验收仍为 PARTIAL；历史证据保留。
当前授权39→40→41→42，覆盖下方历史“等待抽取授权/后续未派”表述；38研究已结束，不重跑广筛。
代码起点b415eb2；新分支由39建立。新增DeepSeek官方API授权见42 §D；不自动接管Desktop。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [41](work-orders/41-core-service-acceptance.md) | **QUEUED** | core-semantics/1已批准，本单未实施 | 同wire核心业务实现、Windows/WSL独立验收 |
| [42](work-orders/42-fullstack-delivery.md) | **QUEUED** | 循环检查与双门后全栈接管已授权 | 后端READY后每5分钟检查前端；联调、修复、两仓提交 |
| [39](work-orders/39-server-boundaries.md) | **READY** | [批准蓝图](server-architecture-v1.md) | 建立新分支，落实中立业务边界、事务与能力诚实性 |
| [40](work-orders/40-four-harness-integration.md) | **QUEUED** | 复用38固定来源；Codex/Hermes/Pi/OpenCode均NOT_STARTED | 39接缝就绪后按家验证；允许有门禁生产接入，不授权模型 |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed，另复现同键并发两次accept导致状态矛盾；非实时消息、角色状态未实现却报能力、composition混入原生语义，详见[38 §2](work-orders/38-harness-extension-selection.md) | 返修待选型后派单；本轮不重跑模型、不读取保留验收数据 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | 两轮 A/B/C 完成：[最终建议与边界](../server-round1/harness-selection/boundary.md) / [候选](../server-round1/harness-selection/candidates.md) / [检索覆盖](../server-round1/harness-selection/search-coverage.md) / [行为证据](../server-round1/harness-selection/verification.md)。保留有条件首选 `harness-remote v3.0.2`；`acp-adapter v0.3.8` 为待补 Go fake 验证的最佳新增备选；`acpx` 仅为已验证 ACP host 组件；零模型/凭据 | 等待用户决定是否另派最小无模型 Harness Remote 抽取单；本单不开始生产接入 |

## 当前长期goal状态字段（执行者每阶段维护）

- backend_implementation: NOT_STARTED；frontend_observed_state: NOT_CHECKED。
- frontend_worktree: /home/maoqh/projects/agent-box-desktop-next-wsl-round1。
- frontend_checked_at / observed_head / writer_lease / next_check_at: 未开始。
- wire_version / schema_digest / code_checkpoint_pair: 待核对。
- integration_owner: NONE；workbench_model_verified_count: 0（指本轮，非历史37）。
- model_authorization: DEEPSEEK_OFFICIAL_AUTHORIZED_MAX_CNY_10；凭据locator见42 §D，不写内容。
- 本轮调用数0，已知费用0，预留0；后续执行者统一记账，所有Harness/重试累计计算。
- four_harness_matrix: 40逐家记录；40历史表格中的“不授权模型”由42 §D窄授权覆盖。
- 每阶段与goal结束前检查状态已更新；41READY后进入42等待，不提前报整体完成。

以下是37/38历史说明，不覆盖39–42新授权。
终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
37 不按完整 GREEN 接受。38 的 READY_FOR_DECISION 仅指研究可交付，不替代37验收或生产授权。

已知边界：Codex CLI 此路径没有硬输出 token cap，验收以短回答提示、4 KiB 输入与 120 秒超时约束；首轮仅白名单 `deepseek-flash`。后续 Desktop 接线/Pi/记忆并发合并/安装器未派。

38终态：`HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION` / `HARNESS_EXTENSION_SELECTION_NO_FIT` / `HARNESS_EXTENSION_SELECTION_PARTIAL`；阶段态 `HARNESS_EXTENSION_SELECTION_RESEARCHING`。没有合格候选不得转手写。
