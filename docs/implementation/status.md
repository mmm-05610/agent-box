# Backend Server — status

更新：2026-09-14（执行者：后端 goal 会话，分支 feature/server-harness-extension-v1）。
37 的独立验收仍为 PARTIAL；历史证据保留。
当前授权39→40→41→42。执行进度：39 完成；40 A/B/C 完成（四家组件门通过，无真实模型）；
41/42 排队。检查点 b84dc87（39）、38b28d6（40-A）、05053f9（40-B）、40-C 见本表。
新增DeepSeek官方API授权见42 §D；本轮仍未发生任何模型调用（费用¥0）。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [39](work-orders/39-server-boundaries.md) | **READY_FOR_HARNESS** | [阶段证据](../server-round1/server-boundary/stage-a-b-c.md)：幂等并发双派发缺陷先复现后修复、能力声明改为注册派生、双中立provider测试、legacy codex 退出生产装配 | wire反馈通道 [wire-review.md](../server-round1/wire-review.md) 已建立并写入首轮 |
| [40](work-orders/40-four-harness-integration.md) | **FOUR_HARNESS_COMPONENTS_READY** | [40-A 底座](../server-round1/harness-integration/stage-a.md) / [40-B 通道](../server-round1/harness-integration/stage-b.md) / [40-C 矩阵](../server-round1/harness-integration/stage-c.md) / [40-D 汇总](../server-round1/harness-integration/stage-d.md) + [握手证据JSON](../server-round1/harness-integration/handshake-40c.json)：四家组件门 25/25；全量 227 passed/4 skipped/0 failed；Rust 4 passed；真实二进制零凭据握手 pi/hermes INITIALIZED、opencode HEALTH_OK、codex 诚实要求凭据 | 本单终态；Server 侧编排与 wire 锁定进入 41；真实模型门留待 42 §D |
| [41](work-orders/41-core-service-acceptance.md) | **BACKEND_IMPLEMENTATION_PARTIAL** | [后端验收](../server-round1/backend-acceptance.md)：复用前端P07 wire-v1候选（未自造第二套）+16方法实现+schema v3迁移；全量 249 passed/4 skipped/0 failed；wire答复见[wire-review](../server-round1/wire-review.md) `ACCEPTED_WITH_MECHANICAL_CORRECTIONS` | 缺41-E Windows真机段与Worker→sidecar串接；补齐后方可转 READY，再进42 |
| [42](work-orders/42-fullstack-delivery.md) | **QUEUED** | 循环检查与双门后全栈接管已授权；DeepSeek官方API授权见§D | 后端READY后每5分钟检查前端；联调、修复、两仓提交 |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed；同键并发双accept已由39复现并修复；能力不诚实已由39结构性修复 | abandon 断言经探针定性为**测试侧竞态**（终止状态持久化后约50ms才 abandon；负载高时10/10失败），已改为有界等待、断言强度不变，修后10/10通过；原生语义迁移由40执行 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | 两轮 A/B/C 完成：[最终建议与边界](../server-round1/harness-selection/boundary.md)。保留有条件首选 `harness-remote v3.0.2`；零模型/凭据 | 首选已由40消费进入有门禁接入；不再等待决定 |

## 当前长期goal状态字段（执行者每阶段维护）

- backend_implementation: IN_PROGRESS（39完成；40 A/B/C完成，D未完；41未完）。
- frontend_observed_state: IN_PROGRESS（只读观察，2026-09-14；前端P07 checkpoint 1、wire未产出）。
- frontend_worktree: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product。
- frontend_checked_at: 2026-09-14；observed_head: 文档消费61c7ff7、代码ebb1233/8d4b3df/2e8a1c7；
  writer_lease: ACTIVE（未交接）；next_check_at: 41 READY后开始5分钟只读循环。
- wire_version / schema_digest: 尚无（前端P07 checkpoint 2未产出；后端37 HTTP候选事实已写入wire-review.md）。
- code_checkpoint_pair: 后端=41 提交HEAD；前端无交接检查点。
- wire_status: WIRE_CANDIDATE_ACCEPTED_BY_BACKEND（对前端 wire-v1 工件 cd80103b3effbc4e）；
  未锁定：需双方登记同一摘要，前端尚未答复 wire-review.md 的3项确认。
- backend_implementation_ready: 否（41-E Windows真机段未做；Worker→sidecar 未串接；
  wire.eventStream/1 未实现；附件投递未实现）。
- integration_owner: NONE；workbench_model_verified_count: **0**（指本轮；组件门通过不等于真实模型可用）。
- model_authorization: DEEPSEEK_OFFICIAL_AUTHORIZED_MAX_CNY_10；凭据locator见42 §D，不写内容。
- 本轮调用数0，已知费用0，预留0；后续执行者统一记账，所有Harness/重试累计计算。
- 40 全量门实绩（40-D 记录）：python 227 passed/4 skipped/0 failed；node 25/25；
  cargo 4 passed。平台未执行项=Windows 真机 WSL 全链路与全部真实模型门。
- four_harness_matrix（组件级）：
  - codex：COMPONENT_VERIFIED（快照+fake peer 全门通过；真实二进制握手 TYPED_FAILURE，
    适配器要求 API key，app-server 路径已由工件证据确认，未退回 exec JSONL）；
  - pi：COMPONENT_VERIFIED（真实二进制零凭据 INITIALIZED）；
  - hermes：COMPONENT_VERIFIED（上游无 profile，由 AgentBox 窄注册胶水接入 `hermes acp`；
    真实二进制零凭据 INITIALIZED）；
  - opencode：COMPONENT_VERIFIED（同快照 ManagedOpenCodeHost；真实二进制 HEALTH_OK，
    不伪装为 ACP profile）。
  - 四家均 **MODEL_NOT_VERIFIED**。
- 已知待办/风险：内嵌 codex 二进制安装后**必须校验**（本轮发现过一次截断安装，
  已更正40-A证据）；Hermes 启动有 lazy 依赖安装与 PYTHONPATH 要求，需生产级收口；
  Worker→sidecar 的 Python 封装尚未串接（属41）。
- 调度维护：39即参与wire反馈，通道docs/server-round1/wire-review.md（首轮已写入）。
- 每阶段与goal结束前检查状态已更新；41READY后进入42等待，不提前报整体完成。

以下是37/38历史说明，不覆盖39–42新授权。
终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
37 不按完整 GREEN 接受。38 的 READY_FOR_DECISION 仅指研究可交付，不替代37验收或生产授权。

已知边界：Codex CLI 此路径没有硬输出 token cap，验收以短回答提示、4 KiB 输入与 120 秒超时约束；首轮仅白名单 `deepseek-flash`。后续 Desktop 接线/Pi/记忆并发合并/安装器未派。

38终态：`HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION` / `HARNESS_EXTENSION_SELECTION_NO_FIT` / `HARNESS_EXTENSION_SELECTION_PARTIAL`；阶段态 `HARNESS_EXTENSION_SELECTION_RESEARCHING`。没有合格候选不得转手写。
