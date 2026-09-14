# Backend Server — status

更新：2026-09-14（执行者：后端 goal 会话，分支 feature/server-harness-extension-v1）。
37 的独立验收仍为 PARTIAL；历史证据保留。
当前授权39→40→41→42。执行进度：39 完成；40 A/B/C/D 完成（四家组件门通过，
无真实模型）；41 的 28 方法与队列终态已按前端 `3aba5c5c` 新摘要严格 29/29 重锁，当前为
**BACKEND_WINDOWS_R4_PENDING**：代码检查点 `3e4282b` 已把真实 adapter/二进制/配置投影和有界 native
state 捕获/Windows ObjectStore 持久化/下一 turn 回投接入生产 sidecar，真实 Worker+bwrap 的两个新
sidecar 进程已证明同一 native id 的 ACP resume；现须按锁定工件跑 Windows r4 关闭41平台门；
42 的独立模型任务可并行继续，前端仍由其 writer 施工，尚未进入跨仓联调。检查点见下表。
DeepSeek 官方 API 授权见42 §D；累计发生 1 次 API 可达性调用（12 tokens，费用 <¥0.01），
Codex 旧 chat 配置尝试在模型请求前失败；新 Responses 配置已通过无模型读取门，二者都不能记作模型调用
或 Harness 验收。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [39](work-orders/39-server-boundaries.md) | **READY_FOR_HARNESS** | [阶段证据](../server-round1/server-boundary/stage-a-b-c.md)：幂等并发双派发缺陷先复现后修复、能力声明改为注册派生、双中立provider测试、legacy codex 退出生产装配 | wire反馈通道 [wire-review.md](../server-round1/wire-review.md) 已建立并写入首轮 |
| [40](work-orders/40-four-harness-integration.md) | **FOUR_HARNESS_COMPONENTS_READY** | [40-A 底座](../server-round1/harness-integration/stage-a.md) / [40-B 通道](../server-round1/harness-integration/stage-b.md) / [40-C 矩阵](../server-round1/harness-integration/stage-c.md) / [40-D 汇总](../server-round1/harness-integration/stage-d.md) + [握手证据JSON](../server-round1/harness-integration/handshake-40c.json)：四家组件门 25/25；全量 227 passed/4 skipped/0 failed；Rust 4 passed；真实二进制零凭据握手 pi/hermes INITIALIZED、opencode HEALTH_OK、codex 诚实要求凭据 | 本单终态；Server 侧编排与 wire 锁定进入 41；真实模型门留待 42 §D |
| [41](work-orders/41-core-service-acceptance.md) | **BACKEND_WINDOWS_R4_PENDING** | [后端验收](../server-round1/backend-acceptance.md)：28 方法+队列终态严格 schema 回归 29/29；`3e4282b` 增加有界 native state 回收/不可变 checkpoint/回投，真实 Worker+bwrap 两个新 sidecar 进程以同一 native id resume；Server 98/1 skip、runtime+bwrap 43、定向71、Node 13；Windows r3仍为旧代码证据 | 串行 Windows r4；通过后关闭41平台门，整体READY仍受42-D未验项约束 |
| [42](work-orders/42-fullstack-delivery.md) | **PRE_GATE_WORK_IN_PROGRESS**（两端门当前均未满足，未联调） | [进度与费用账](../server-round1/fullstack/progress.md)：前端仍 PARTIAL、writer_lease ACTIVE；28 方法 wire 已重锁；DeepSeek 官方 API 可达（12 tokens）；Codex 官方 Responses 配置读取及通用 native resume 已通过无模型生产链门，尚未发真实 Harness 模型请求 | 串行 Windows r4与逐家真实门；双门后联调 |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed；同键并发双accept已由39复现并修复；能力不诚实已由39结构性修复 | abandon 断言经探针定性为**测试侧竞态**（终止状态持久化后约50ms才 abandon；负载高时10/10失败），已改为有界等待、断言强度不变，修后10/10通过；原生语义迁移由40执行 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | 两轮 A/B/C 完成：[最终建议与边界](../server-round1/harness-selection/boundary.md)。保留有条件首选 `harness-remote v3.0.2`；零模型/凭据 | 首选已由40消费进入有门禁接入；不再等待决定 |

## 当前长期goal状态字段（执行者每阶段维护）

- backend_implementation: **POST_RESUME_GATES_PENDING**（39/40组件门完成；41的28方法+队列终态已按
  锁定摘要29/29；`3e4282b` 已以两个新 sidecar 进程证明有界 native state 回收/回投及同 native id
  resume。仍须收口 Pi/Hermes/OpenCode 原生运行时进入生产 Server链、串行逐家真实门及 Windows r4）。
- frontend_observed_state: IN_PROGRESS（只读观察，2026-09-14 12:15 +08:00；前端仍在施工，
  P07 28方法队列终态已提交，writer工作树随后进入P04下一切片）。
- frontend_worktree: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product。
- frontend_checked_at: 2026-09-14 12:15 +08:00；observed_head: `3aba5c5c`。
  其 status.md 记录 frontend_implementation=**PARTIAL**
  （P00/P01 GREEN、P07 28方法增量完成、P02 A/B1/B2/C/D完成；P03继续施工），
  writer_lease=**ACTIVE — Codex frontend goal**（09:20 接管）；其合同已消费后端终态反馈。
- 42 双门判定（2026-09-14 13:24 +08:00）：BACKEND_IMPLEMENTATION_READY=**否（暂时）**；
  DESKTOP_IMPLEMENTATION_READY=**否**（PARTIAL 且写权未释放）。**未进入全栈联调**，
  未写前端任何文件；wire 交换经 [wire-review.md](../server-round1/wire-review.md) 进行，
  前端已答复安全确认并提交28方法+队列终态增量；同摘要已严格通过。
- wire_version / schema_digest: 当前28方法提交 `3aba5c5c` 为 **WIRE_LOCKED_FOR_IMPLEMENTATION**，TS
  `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`、生成工件
  `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。
- code_checkpoint_pair: 后端=`3e4282b`；前端合同检查点=`3aba5c5c`；前端尚无最终交接检查点。
- wire_status: **WIRE_LOCKED_FOR_IMPLEMENTATION**（28方法+队列终态严格schema 29/29通过）。
- backend_implementation_ready: **否（暂时）**（Windows r3原生Server→真实WSL Worker→bwrap增量门通过；
  新28方法合同已重锁，`3e4282b` 已证明第二 turn 的 Worker→Windows native state 捕获/回投与同 native id
  ACP resume；仍需 Windows r4；
  正式 WS 事件流、附件、审批、取消/断连、队列续派/暂停、Profile/Provider-Model 维护均有证据；
  Codex模型选择与凭据生产投影代码已接线但尚未以真实受管 Harness 执行，Pi/Hermes/OpenCode 的
  原生运行时工件进入生产 bwrap 封装及逐家真实验证也未完成）。
- integration_owner: NONE；workbench_model_verified_count: **0**（指本轮；组件门通过不等于真实模型可用）。
- model_authorization: DEEPSEEK_OFFICIAL_AUTHORIZED_MAX_CNY_10；凭据locator见42 §D，不写内容。
- 本轮调用数1（DeepSeek官方API可达性检查，12 tokens，<¥0.01；上限¥10），
  预留0；Codex真实模型尝试在 session/new 阶段即失败、未发起模型请求。
  后续执行者统一记账，所有Harness/重试累计计算。
- 41 既有门实绩：python 266 passed/4 skipped/0 failed；node 25/25；cargo 4/4；
  Windows r3 真机 WSL 全链路 exit 0。`3e4282b` 后最新受影响门为 Server 98 passed/1 skipped、
  runtime+bwrap 43 passed、定向 Python 71 passed、Node 13 passed；Windows r4尚未执行。
- four_harness_matrix（组件级）：
  - codex：COMPONENT_VERIFIED（快照+fake peer 全门通过；真实二进制握手 TYPED_FAILURE，
    适配器要求 API key，app-server 路径已由工件证据确认，未退回 exec JSONL）；
  - pi：COMPONENT_VERIFIED（真实二进制零凭据 INITIALIZED）；
  - hermes：COMPONENT_VERIFIED（上游无 profile，由 AgentBox 窄注册胶水接入 `hermes acp`；
    真实二进制零凭据 INITIALIZED）；
  - opencode：COMPONENT_VERIFIED（同快照 ManagedOpenCodeHost；真实二进制 HEALTH_OK，
    不伪装为 ACP profile）。
  - 四家均 **MODEL_NOT_VERIFIED**。Codex 0.147.0 先前只证明 `wire_api="chat"` 配置被客户端拒绝；
    DeepSeek 官方 `codex-deepseek-setup.sh` 1.3.0 明确给出 Responses 配置，故已撤回“不兼容/证伪”
    结论并保留原始失败为错误配置证据。`399d78d` 已纳入官方1.3.0完整两模型目录（运行仅允许
    `deepseek-flash`）、Responses非敏感配置、adapter source、摘要固定native binary和`CODEX_API_KEY`
    首选认证接缝；`3e4282b` 固化隔离 TOML 并完成通用 native state 双轮 resume，实际 wheel 同时包含
    完整目录与TOML；真实 codex-acp→app-server 配置读取通过，但尚未发送真实模型请求。
    pi/hermes/opencode 的无模型 Provider 配置准备已在 `bc7d95b` 完成；三家付费真实门仍未执行。
- 已知待办/风险：内嵌 codex 二进制安装后**必须校验**（本轮发现过一次截断安装，
  已更正40-A证据）；Hermes 启动有 lazy 依赖安装与 PYTHONPATH 要求，42-D需生产级收口；
  真实凭据只可经授权 SecretStore→限时 Worker 投影；该路径已有实现和反例测试，尚待真实受管 Harness。
  native会话目录的有界回读/回投及凭据原文扫描已在 `3e4282b` 收口；Pi/Hermes/OpenCode 原生运行时
  工件进入 bwrap 的生产封装仍需收口。
- 调度维护：39即参与wire反馈，通道docs/server-round1/wire-review.md（首轮已写入）。
- 42 双门（2026-09-14 13:24）：后端 READY=否（Pi/Hermes/OpenCode生产封装、逐家真实门与Windows r4
  待做）、前端 READY=否 →
  未记录集成人、未写前端、未联调。
- 每阶段与goal结束前检查状态已更新；41READY后进入42等待，不提前报整体完成。

以下是37/38历史说明，不覆盖39–42新授权。
终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
37 不按完整 GREEN 接受。38 的 READY_FOR_DECISION 仅指研究可交付，不替代37验收或生产授权。

已知边界：Codex CLI 此路径没有硬输出 token cap，验收以短回答提示、4 KiB 输入与 120 秒超时约束；首轮仅白名单 `deepseek-flash`。后续 Desktop 接线/Pi/记忆并发合并/安装器未派。

38终态：`HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION` / `HARNESS_EXTENSION_SELECTION_NO_FIT` / `HARNESS_EXTENSION_SELECTION_PARTIAL`；阶段态 `HARNESS_EXTENSION_SELECTION_RESEARCHING`。没有合格候选不得转手写。
