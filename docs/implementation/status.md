# Backend Server — status

更新：2026-09-14（执行者：后端 goal 会话，分支 feature/server-harness-extension-v1）。
37 的独立验收仍为 PARTIAL；历史证据保留。
当前授权39→40→41→42。执行进度：39 完成（READY_FOR_HARNESS），40 进行中，41/42 排队。
新增DeepSeek官方API授权见42 §D；不自动接管Desktop。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [39](work-orders/39-server-boundaries.md) | **READY_FOR_HARNESS** | [阶段证据](../server-round1/server-boundary/stage-a-b-c.md)：幂等并发双派发缺陷先复现后修复、能力声明改为注册派生、双中立provider测试、legacy codex 退出生产装配；受影响门 108 passed / 1 既有37失败 / 1 skip | wire反馈通道 [wire-review.md](../server-round1/wire-review.md) 已建立并写入首轮 |
| [40](work-orders/40-four-harness-integration.md) | **IMPLEMENTING** | 复用38固定来源；Codex/Hermes/Pi/OpenCode均NOT_STARTED | 39接缝已就绪；先抽取harness-remote v3.0.2@21ce6db闭包，Codex先通；模型只依42 §D限定授权 |
| [41](work-orders/41-core-service-acceptance.md) | **QUEUED** | core-semantics/1已批准，本单未实施；前端P07 wire尚未产出（checkpoint 1） | 40至少一家通过后按41编制/核对wire候选并锁定，再做核心业务实现与独立验收 |
| [42](work-orders/42-fullstack-delivery.md) | **QUEUED** | 循环检查与双门后全栈接管已授权 | 后端READY后每5分钟检查前端；联调、修复、两仓提交 |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed，另复现同键并发两次accept导致状态矛盾；非实时消息、角色状态未实现却报能力、composition混入原生语义，详见[38 §2](work-orders/38-harness-extension-selection.md) | 同键并发双派发已由39先复现后修复；能力不诚实已由39结构性修复；abandon测试经复跑确认为偶发flaky而非确定失败（基线与本分支各3次均PASS，见39证据）；原生语义迁移由40执行 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | 两轮 A/B/C 完成：[最终建议与边界](../server-round1/harness-selection/boundary.md) / [候选](../server-round1/harness-selection/candidates.md) / [检索覆盖](../server-round1/harness-selection/search-coverage.md) / [行为证据](../server-round1/harness-selection/verification.md)。保留有条件首选 `harness-remote v3.0.2`；`acp-adapter v0.3.8` 为待补 Go fake 验证的最佳新增备选；`acpx` 仅为已验证 ACP host 组件；零模型/凭据 | 首选已由40消费进入有门禁接入；不再等待决定 |

## 当前长期goal状态字段（执行者每阶段维护）

- backend_implementation: IN_PROGRESS（39完成READY_FOR_HARNESS；40/41未完）。
- frontend_observed_state: IN_PROGRESS（只读观察，2026-09-14，见39证据§A；前端P07 checkpoint 1、wire未产出）。
- frontend_worktree: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product。
- frontend_checked_at: 2026-09-14（39-A）；observed_head: 文档消费61c7ff7、代码ebb1233/8d4b3df/2e8a1c7；
  writer_lease: ACTIVE（未交接）；next_check_at: 41 READY后开始5分钟只读循环。
- wire_version / schema_digest: 尚无（前端P07 checkpoint 2未产出；后端37 HTTP候选事实已写入wire-review.md）。
- code_checkpoint_pair: 后端39检查点=本提交HEAD；前端无交接检查点。
- integration_owner: NONE；workbench_model_verified_count: 0（指本轮，非历史37）。
- model_authorization: DEEPSEEK_OFFICIAL_AUTHORIZED_MAX_CNY_10；凭据locator见42 §D，不写内容。
- 本轮调用数0，已知费用0，预留0；后续执行者统一记账，所有Harness/重试累计计算。
- four_harness_matrix: 全部NOT_STARTED（40实施中，逐家记录于此）。
- 调度维护：已清理旧停止/授权冲突；39即参与wire反馈，通道docs/server-round1/wire-review.md（首轮已写入）。
- 每阶段与goal结束前检查状态已更新；41READY后进入42等待，不提前报整体完成。

以下是37/38历史说明，不覆盖39–42新授权。
终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
37 不按完整 GREEN 接受。38 的 READY_FOR_DECISION 仅指研究可交付，不替代37验收或生产授权。

已知边界：Codex CLI 此路径没有硬输出 token cap，验收以短回答提示、4 KiB 输入与 120 秒超时约束；首轮仅白名单 `deepseek-flash`。后续 Desktop 接线/Pi/记忆并发合并/安装器未派。

38终态：`HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION` / `HARNESS_EXTENSION_SELECTION_NO_FIT` / `HARNESS_EXTENSION_SELECTION_PARTIAL`；阶段态 `HARNESS_EXTENSION_SELECTION_RESEARCHING`。没有合格候选不得转手写。
