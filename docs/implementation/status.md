# Backend Server — status

更新：2026-09-14（执行者：后端 goal 会话，分支 feature/server-harness-extension-v1）。
37 的独立验收仍为 PARTIAL；历史证据保留。
当前授权39→40→41→42。执行进度：39 完成；40 A/B/C/D 完成（四家组件门通过，
无真实模型）；41 为 **BACKEND_IMPLEMENTATION_PARTIAL**，正在补真实 Worker 纵向接线、
wire 事件流、审批、附件与 Windows 独立验收；42 仅执行了不依赖双门的只读合同协调和
有界模型前置验证，尚未进入等待/联调阶段。检查点见下表。
DeepSeek 官方 API 授权见42 §D；累计发生 1 次 API 可达性调用（12 tokens，费用 <¥0.01），
Codex 配置尝试在模型请求前失败，不能记作模型调用或 Harness 验收。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [39](work-orders/39-server-boundaries.md) | **READY_FOR_HARNESS** | [阶段证据](../server-round1/server-boundary/stage-a-b-c.md)：幂等并发双派发缺陷先复现后修复、能力声明改为注册派生、双中立provider测试、legacy codex 退出生产装配 | wire反馈通道 [wire-review.md](../server-round1/wire-review.md) 已建立并写入首轮 |
| [40](work-orders/40-four-harness-integration.md) | **FOUR_HARNESS_COMPONENTS_READY** | [40-A 底座](../server-round1/harness-integration/stage-a.md) / [40-B 通道](../server-round1/harness-integration/stage-b.md) / [40-C 矩阵](../server-round1/harness-integration/stage-c.md) / [40-D 汇总](../server-round1/harness-integration/stage-d.md) + [握手证据JSON](../server-round1/harness-integration/handshake-40c.json)：四家组件门 25/25；全量 227 passed/4 skipped/0 failed；Rust 4 passed；真实二进制零凭据握手 pi/hermes INITIALIZED、opencode HEALTH_OK、codex 诚实要求凭据 | 本单终态；Server 侧编排与 wire 锁定进入 41；真实模型门留待 42 §D |
| [41](work-orders/41-core-service-acceptance.md) | **BACKEND_IMPLEMENTATION_PARTIAL** | [后端验收](../server-round1/backend-acceptance.md)：复用前端P07 wire-v1候选（未自造第二套）+16方法实现+schema v3迁移；全量 255 passed/4 skipped/0 failed；wire答复见[wire-review](../server-round1/wire-review.md) `ACCEPTED_WITH_MECHANICAL_CORRECTIONS` | 缺41-E Windows真机段与经 WSL Worker 的部署接线；补齐后方可转 READY，再进42 |
| [42](work-orders/42-fullstack-delivery.md) | **PRE_GATE_WORK_IN_PROGRESS**（双门未满足，未联调） | [进度与费用账](../server-round1/fullstack/progress.md)：前端仍 PARTIAL、writer_lease ACTIVE；前端已答复三项 wire 更正并提交新摘要，待后端对齐；DeepSeek 官方 API 可达（12 tokens）；**Codex 家与 DeepSeek 协议不兼容**（codex 0.147.0 只收 Responses API，DeepSeek 为 chat 形状） | 先完成41与独立模型门；后端 READY 后才进入42-A等待，前端 READY+释放写权+wire锁定后联调 |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed；同键并发双accept已由39复现并修复；能力不诚实已由39结构性修复 | abandon 断言经探针定性为**测试侧竞态**（终止状态持久化后约50ms才 abandon；负载高时10/10失败），已改为有界等待、断言强度不变，修后10/10通过；原生语义迁移由40执行 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | 两轮 A/B/C 完成：[最终建议与边界](../server-round1/harness-selection/boundary.md)。保留有条件首选 `harness-remote v3.0.2`；零模型/凭据 | 首选已由40消费进入有门禁接入；不再等待决定 |

## 当前长期goal状态字段（执行者每阶段维护）

- backend_implementation: IN_PROGRESS（39完成；40 A/B/C/D完成；41部分完成，未达 READY）。
- frontend_observed_state: IN_PROGRESS（只读观察，2026-09-14 10:02 +08:00；前端仍在施工，
  wire 修订已提交，客户端文件存在未提交改动）。
- frontend_worktree: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product。
- frontend_checked_at: 2026-09-14 10:02 +08:00；observed_head: `a132a491`。
  其 status.md 记录 frontend_implementation=**PARTIAL**
  （P00/P01 GREEN、P07 检查点1–2、P02A GREEN、P02B1完成；P02B2及后续待施工），
  writer_lease=**ACTIVE — Codex frontend goal**（09:20 接管），CONTRACT_CLIENT_READY=否（wire 未锁定）。
- 42 双门判定（2026-09-14）：BACKEND_IMPLEMENTATION_READY=**否**（41-E 与 Worker→sidecar 缺）；
  DESKTOP_IMPLEMENTATION_READY=**否**（PARTIAL 且写权未释放）。**未进入全栈联调**，
  未写前端任何文件；wire 交换经 [wire-review.md](../server-round1/wire-review.md) 进行，
  前端已答复 3 项确认并提交新摘要，等待后端机械对齐与登记。
- wire_version / schema_digest: 前端 `wire-v1` WIRE_REVISION_PENDING_BACKEND 权威
  `59529dfc4ca01dc5`、生成工件 `4f90256d5545af6a`；前端已接受 hello 认证、受保护
  token 文件、Harness 仅作数据三项。后端尚未按新工件对齐并登记，**未锁定**。
- code_checkpoint_pair: 后端=41 提交HEAD；前端无交接检查点。
- wire_status: WIRE_REVISION_PENDING_BACKEND（前端新工件 `4f90256d5545af6a`）；
  未锁定：前端已答复三项确认，后端需补齐新工件机械差异、回归并登记同一摘要。
- backend_implementation_ready: 否（41-E Windows真机段未做；经 WSL Worker 的部署接线未完成
  —— 本地进程启动器上的 Server→sidecar→fake Harness 路径已通过 6 项集成测试；
  wire.eventStream/1 未实现；附件投递未实现；侧车授权往返未接入审批仓储）。
- integration_owner: NONE；workbench_model_verified_count: **0**（指本轮；组件门通过不等于真实模型可用）。
- model_authorization: DEEPSEEK_OFFICIAL_AUTHORIZED_MAX_CNY_10；凭据locator见42 §D，不写内容。
- 本轮调用数1（DeepSeek官方API可达性检查，12 tokens，<¥0.01；上限¥10），
  预留0；Codex真实模型尝试在 session/new 阶段即失败、未发起模型请求。
  后续执行者统一记账，所有Harness/重试累计计算。
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
  - 四家均 **MODEL_NOT_VERIFIED**；其中 **codex 已证伪**：内嵌 Codex 0.147.0 要求
    `wire_api="responses"`，与 DeepSeek 官方 chat-completions 形状不兼容（证据见42进度文档）；
    pi/hermes/opencode 的 Provider 配置未完成，未执行真实门。
- 已知待办/风险：内嵌 codex 二进制安装后**必须校验**（本轮发现过一次截断安装，
  已更正40-A证据）；Hermes 启动有 lazy 依赖安装与 PYTHONPATH 要求，需生产级收口；
  Worker→sidecar 的 Python 封装尚未串接（属41）。
- 调度维护：39即参与wire反馈，通道docs/server-round1/wire-review.md（首轮已写入）。
- 42 双门（2026-09-14）：后端 READY=否、前端 READY=否 → 未记录集成人、未写前端、未联调。
- 每阶段与goal结束前检查状态已更新；41READY后进入42等待，不提前报整体完成。

以下是37/38历史说明，不覆盖39–42新授权。
终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
37 不按完整 GREEN 接受。38 的 READY_FOR_DECISION 仅指研究可交付，不替代37验收或生产授权。

已知边界：Codex CLI 此路径没有硬输出 token cap，验收以短回答提示、4 KiB 输入与 120 秒超时约束；首轮仅白名单 `deepseek-flash`。后续 Desktop 接线/Pi/记忆并发合并/安装器未派。

38终态：`HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION` / `HARNESS_EXTENSION_SELECTION_NO_FIT` / `HARNESS_EXTENSION_SELECTION_PARTIAL`；阶段态 `HARNESS_EXTENSION_SELECTION_RESEARCHING`。没有合格候选不得转手写。
