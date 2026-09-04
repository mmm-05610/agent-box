# Agent-Box Studio — 五 Harness 后端 Phase 2 验证记录

> 状态：IMPLEMENTED / AUTOMATED SYNTHETIC VERIFIED / REAL-CREDENTIAL SMOKE PENDING
>
> 日期：2026-09-04　|　分支：`feat/studio-backend-core`　|　基线 HEAD：`532cc99`
>
> 范围：Phase 1 全部 P0/P1 审计项闭合（Gate A）+ 五个真实 Harness（codex /
> claude-code / opencode / hermes / pi）接入 Studio 生产调用链（Gate B）。
> 跨 Harness Session Codec、compact、MCP Resource 明确未实施（§16）。

## 1. Baseline / branch / HEAD / dirty preservation

- 仓库：agent-box（worktree `agent-box-studio-backend-core`），分支
  `feat/studio-backend-core`，基线 HEAD `532cc993bcc95e4dae96176893f73bb95b68b2c7`。
- Phase 1 的全部未提交修改原样保留并在其上继续；全程未执行
  add/commit/push/merge/reset/checkout/clean/stash。

## 2. Gate A：Phase 1 审计项修复清单

| 项 | 修复 | 证据 |
|---|---|---|
| A1 Turn Run transaction | 新增 durable run journal（`turn_runs` 表 + `TurnRunPhase` 状态机），§3 | `test_turn_run_transaction.py`（24 项） |
| A2 DispatchAmbiguous | 不再封 FAILED：run → RECOVERY_REQUIRED，dispatch identity + 错误分类入 journal；普通 provider exception 也不写 FAILED（仅确定失败证据才 FAILED） | service `_execute_turn`；`test_dispatch_crash_window_never_fabricates_a_terminal` |
| A3 严格 idempotency | create_session/begin_turn 在 saga INTENT 时计算 canonical request digest 并持久；同 key 异 digest → IdempotencyConflict（先于任何外部副作用）；跨 scope 复用 → IdempotencyConflict | `test_idempotency_digests.py`（22 项，含 7 个正式反例） |
| A4 Recovery Session 隔离 | `recovery_operations(session_id)` 严格过滤；`recover` 双绑定 session+op，越界 → `RecoveryScopeMismatch`；break lease CAS | `test_recovery_isolation.py`、`test_break_lease_cas.py` |
| A5 Recovery HTTP API | GET recovery / POST recovery/{op} / POST lease/break（expected_owner_id+expected_turn_id+reason+confirm 字段，服务端重读 lease/Turn 状态 CAS） | `test_recovery_and_lease.py` |
| A6 DTO/脱敏 | 严格 Pydantic DTO（extra=forbid、长度限制、非 str 拒绝、空 project_path=422）；稳定错误 envelope + correlation_id；未知异常仅 code/message/correlation_id；path/token 模式脱敏 | `test_error_envelopes.py`、`schemas.py`、`server/errors.py` |
| A7 Workspace registry durability | projects.json → SQLite registry（WAL+FULL、schema_version fail-closed、注册幂等、symlink/空路径 fail closed、并发注册、fault-injection） | `registry.py`、workspace 34 测试 |
| A8 Session schema version | SCHEMA_VERSION=2；fresh/current/newer/older/corrupt 全 fail-closed；显式事务化 v1→v2 migration | `test_schema_versioning.py`（9 项） |
| A9 SPI 一致性 | Protocol 与实现全签名一致；`link_execution` 返回 `TurnExecutionLink`；conformance 测试；contribution 结构校验 | `test_spi_conformance.py`（7 项） |
| A10 工程卫生 | `httpx2>=2.0,<3`（见 §15 说明）；tracked .pyc 内容恢复；CI wheels job 补 agent-box-acp；wheel 数量 13 | `git diff --check` 干净 |

## 3. Turn Run transaction 最终状态机

```text
PREPARED → DISPATCH_REQUESTED → DISPATCH_ACCEPTED → RUNNING
         → EXECUTION_TERMINAL → FINALIZATION_APPLIED → SESSION_COMMITTED
终态：SESSION_COMMITTED（成功）｜FAILED｜RECOVERY_REQUIRED
```

- 每个不可逆副作用前写 intent：dispatch 前记录 (dispatch_id, dispatch_digest)；
  terminal 前记录 provider 证据（outcome、exit_code、dispatch identity）。
- `unfinished_turn_runs()` 供重启发现；`mark_turn_recovery_required` 幂等且
  绝不改写 `terminal_outcome`；commit_turn 在同一事务封存 turn + 追加
  TURN_COMMITTED + 推进 watermark + 盖 terminal run phase。
- 接受 202 响应前 Turn intent 已持久；Session commit 成功后同 key 重试精确
  重放原结果（`replayed=true`）；清理/lease 释放失败不改写已提交结果。

### Crash/recovery truth table

| 崩溃窗口 | 重启后 | 依据 |
|---|---|---|
| begin_turn 事务内 | saga 重放/回滚（Phase 1 已有） | session saga |
| dispatch intent 已记、dispatch 未调 | RECOVERY_REQUIRED（RESTART_DISCOVERY） | run journal phase |
| dispatch 副作用已发生、receipt 丢失 | DispatchAmbiguous → RECOVERY_REQUIRED（dispatch identity 保留，幂等 recover） | §4 |
| observation 中途 | RECOVERY_REQUIRED（进程已死，不可证明） | restart discovery |
| execution terminal 后、finalization 前 | **roll-forward**：按 journal 证据 apply_finalization + commit | `recover_on_startup` |
| finalization 后、commit 前 | **roll-forward**：record_terminal + commit | 同上 |
| commit 后、HTTP 响应丢失 | 同 key 精确重放（replayed=true） | idempotency receipt |

## 4. DispatchAmbiguous 处理

`ExecutionService.dispatch_execution` 抛出 DispatchAmbiguous（replay 未决 /
provider.start 非拒绝异常）时：不写任何 terminal；run → RECOVERY_REQUIRED；
journal 保存 dispatch key/id + `reason_code=DISPATCH_AMBIGUOUS`；ledger 追加
`execution.recovery_required` 事件；`recover(session_id, op_id)` 幂等可重入。
普通 provider exception（如 observation 解码失败）→ RECOVERY_REQUIRED
（`OBSERVATION_ERROR`/`ORCHESTRATION_ERROR`）；只有 provider 拒绝启动
（ExecutionStartRejected → DispatchFailed）这类**确定失败证据**才封 FAILED。

## 5. Request digest / idempotency

- create_session digest 覆盖：title/objective/workspace Ref 全量/mode/
  project_identity/metadata。
- begin_turn digest 覆盖：session_id + sha256(input) + 完整 BindingSnapshot
  （provider id/version、model、全部 Ref、codec、capability_digest、extra；
  `session_watermark` 为服务端派生值，显式豁免并记录于测试文档）。
- 反例测试：同 key 异 title/project/prompt/harness/profile revision；create-session
  key 被 turn 重用；HTTP 响应丢失后精确重放 —— 全部锁定。

## 6. Recovery Session 隔离 / 7. Recovery & break-lease API

见 §2 A4/A5；两 Session 隔离、CAS 矩阵、跨 session 404 无存在性泄漏均为
HTTP 级测试。GET recovery 响应含 `leases`（owner_id/acquired_at），为人工
break-lease 提供 CAS 事实。

## 8. DTO / error envelope

- 全部请求走严格 Pydantic v2 DTO；`TurnCreateRequest` 为最终形状
  （harness_type / execution_provider_id / profile{id,revision,digest} /
  model{id,provider} / launch_mode / runtime_host / sandbox / terminal /
  continue_from_turn_id / idempotency_key / input）。
- 422 稳定 envelope（field+issue，无 pydantic repr）；未知异常 500 仅含
  INTERNAL_ERROR + correlation_id（X-Correlation-Id 头）；所有消息过
  `redact_message()`（绝对路径 → `[path]`，token 形态 → `[redacted]`）。
- 泄漏测试：prompt marker 不进 error 响应/recovery 面/TURN_INPUT（仅 digest）。

## 9. Workspace registry durability

SQLite registry（`workspace-registry.db`）：`register_project` 幂等（保留原
registered_at）、path/identity 冲突 typed、malformed fail-closed（永不当作空）、
空路径与 symlink root 拒绝（`ProjectPathRejected`）、`BEGIN IMMEDIATE` 并发安全、
fault_hook 注入崩溃后 old-or-new 无部分态、重启恢复。

## 10. Session schema/version

SCHEMA_VERSION 2；`store_meta.schema_version` 缺失/损坏 → MalformedSessionState；
更新版本 → `SchemaVersionUnsupported`；旧版本仅当显式注册迁移才打开（内置
v1→v2 迁移为单事务 + fsync）。

## 11. 五 Harness provider selection

精确选择（无"遍历取第一个"）：

- 显式 `execution_provider_id`（必须存在；与 harness_type 同时给出时校验一致）；
- 或 `harness_type` 精确匹配唯一 provider（0 → fail，>1 → fail）；
- 未给出时仅当**恰好一个** provider 声明 session-turn 能力才允许（离线/fake
  环境）；preview 环境五家均不声明 → 必须显式选择；
- 选中后验证：start 能力 truth READY、launch mode 注册声明、Profile harness
  归属、input limits 合同满足（缺失 → fail closed）。

Studio 无任何 `if harness == ...` 分支；品牌事实只存在于 agent-box-harnesses
（`provider.harness_type` / `runtime_requirements()` / `profile_model()` /
`cancel_truth()` / `continuation_ref()` 等通用面）。

## 12. 五家 Profile/Model/mode binding（capability matrix）

| | provider id | launch modes | model 来源 | continuation | cancel | 凭据 |
|---|---|---|---|---|---|---|
| codex | codex-execution | interactive/exec/app-server | profile `model`（.codex/config.toml） | `exec resume <thread_id>` | 运行时终止可证明 | codex-login locator-only mount |
| claude-code | claude-code-execution | interactive/exec | profile `model`（settings.json） | `--resume <session_id>` | 运行时终止可证明 | 无（原生 home 内） |
| opencode | opencode-execution | exec/acp | profile `model`（opencode.json） | exec `-s <id>`；acp 协议 resume | exec 运行时终止；acp driver cancel | 无 |
| hermes | hermes-execution | exec | profile `model`（config.yaml） | `--resume <locator>`（transcript handoff，非原生 resume） | 运行时终止可证明 | 无 |
| pi | pi-execution | exec | profile `defaultModel`(+`defaultProvider`) | `--session <id>` | 运行时终止可证明 | 无 |

每次 Turn 冻结：harness_type、provider id/version、profile Ref（revision+digest，
Native Profile Home freeze 链路验证 revision/digest/generation，
`PROFILE_FREEZE_*` mismatch fail closed）、model（来自冻结 profile；请求 model
与 profile 声明不一致 → fail closed）、launch mode、workspace/runtime/sandbox/
terminal Refs、capability digest。Studio 不读 Profile native-home 文件、不重建
Harness 配置、不解析 credential、不猜 home 路径。

## 13. 真实 production call path / async worker

调用链（无一步绕过）：

```text
StudioService.submit_turn
→ 精确选择 + 冻结 BindingSnapshot + durable begin-turn saga（202 前持久）
→ record_dispatch_intent（journal 先行）
→ ExecutionService.dispatch_execution（freeze → resolve → preflight → start，经 Registry）
→ GenericExecutionProvider.start_mode → LaunchPlan → staging/freeze → lowering
→ Root assembler → RuntimeCompositionCoordinator（sandbox.wrap → terminal.allocate → terminal.run）
→ 观察循环（driver poll 或 legacy observe）→ 事件映射 → durable session events
→ record_execution_terminal（provider 证据）→ apply_finalization（Work Core）
→ record_finalization_applied → after-observation → record_terminal（terminal-once）
→ commit_turn（watermark）→ release lease
```

- 真实模型 Turn 不在 HTTP handler 内阻塞：POST /turns 返回 202
  （session/turn/execution id、accepted state、frozen binding summary）；
  单进程后台 worker 执行生产链（`AGENT_BOX_STUDIO_WORKER_MODE=thread`，测试
  可用 inline）；durable queue = Session Store journal，重启由
  `recover_on_startup()` 依 truth table 恢复；不以内存 task dict 为 authority。
- 事件词汇（B6）：execution.session / assistant.message / tool.requested /
  tool.output / permission.requested / usage.updated / execution.progress /
  execution.completed / execution.failed / execution.recovery_required；
  payload 有界、携带 origin_harness；unknown 原生事件记
  `execution.observation.unknown`（不静默丢弃）；loss 进入 `loss` 字段；
  seq 单调、terminal-once、WS 断线 after=<seq> 精确重放。

## 14. Cancel / Permission truth

- **Cancel**：`POST /turns/{turn_id}/cancel` 先持久 CANCEL_REQUESTED 事件 →
  SessionDriver.cancel()（acp）或 runtime transport terminate/kill（进程模式）
  → `dispatch_state` 证明终止才写 CANCELLED；无法证明 → RECOVERY_REQUIRED；
  已 terminal 幂等返回。逐家 cancel truth 见 §12（pty interactive 模式诚实
  unsupported）。
- **Permission/Question**：durable 请求 ledger（request_id 与 execution/turn
  关联）+ respond API；deliver 仅当 session-driver 绑定（acp）；headless exec
  模式由 harness 侧自动拒绝（plan warning `OPENCODE_PERMISSIONS_AUTO_REJECTED...`）；
  超时 fail-closed；重启后 pending 请求绝不自动批准；绝不默认 auto-approve。

## 15. wheel / clean install / CI

- 13 个 wheel（root + 12 插件，含新增 session / workspace-local / studio /
  **agent-box-acp**）全部构建成功；CI wheels job 清单与数量一致。
- Root-only clean venv：root import OK、SESSION_PROTOCOL_VERSION=1、
  `plugins list --json` → `[]`、doctor exit 0、root wheel 内容无 concrete
  Store/Studio/Harness。
- Preview clean venv：15 插件全 READY、doctor exit 0 无 FAILED、五家
  execution provider 可发现（input limits 已声明）、launch-selection /
  五家 continuation / codex-login resolver 全部注册、无 fake provider；
  `agent-box-studio serve` 真实进程：health 200、无 token 401、带 token 的
  capability truth 含五家且 execution READY。
- **httpx2 说明（对 Phase 1 审计项的修正）**：本环境 starlette 1.6 的
  TestClient 明确要求 `httpx2` 包（其源码 import httpx2）；`httpx2>=2.0`
  并非笔误，本轮将其收窄为 `httpx2>=2.0,<3` 并以全部 62 个 studio 测试
  在 httpx2 2.12.0 上验证通过。Phase 1 报告的"A10 依赖笔误"判断据此修正。

## 16. Continuation 边界（B10）

- 已实施：同 Harness 原生 continuation（§12 各家 argv/协议形态；由上一
  Turn 持久化的 session locator 构造 continuation Ref，`continue_from_turn_id`
  要求源 Turn 已提交且属于本 Session）。
- 未实施（留给跨 Harness Codec 阶段）：跨 Harness 历史转译、Unified Session
  Codec、Native Original 落盘、Loss Report 消费、compact、MCP Resource。
  不声称任何跨 Harness 历史连续性。

## 17. 测试证据

| 套件 | 结果（provenance 修复后复测） |
|---|---|
| Root tests（含 integration/native，bwrap 0.9.0 + tmux 3.4 实测） | 159 passed |
| agent-box-session（含真实入口 v1→v3 迁移链、facts 隔离/原子性） | 130 passed |
| agent-box-workspace-local | 34 passed |
| agent-box-studio（含 studio 级 pi 真实链 vertical、continuation/provenance 反例 13 项） | 75 passed |
| agent-box-harnesses（含 5 家 synthetic vertical） | 476 passed, 4 skipped* |
| agent-box-acp / runtime-local / sandbox-bwrap / terminal-session / skills / git / artifacts | 40 / 6 / 12 / 3 / 8 / 4 / 2 passed |
| compileall / git diff --check | 通过 / 干净 |

\* 4 skips 全部为真实能力探测失败（官方 Codex 二进制 bundle 3 项、
five-harness 项目 skill root 1 项），无 fake/协议/事务测试被 skip。

关键新增测试层：Session transaction adversarial（fault_hook + barrier，无
sleep 时序）、五 Harness synthetic vertical（真实 production provider +
真实 bwrap 组合；exact Profile freeze、argv/env/config、live workspace 真实
修改、observation decode、terminal、nonzero exit、cancellation、redaction、
Work Core dispatch 端到端）、provider selection 反例（unknown/duplicate/
mismatch/undeclared mode/unavailable executable/capability drift）、
studio 级 `test_harness_vertical.py`（StudioService → Work Core → 真实
sandbox spawn → live workspace 修改 → 事件 → commit 全链）。

## 18. Secret / path / boundary

- 新代码扫描：无 credential 常量、无宿主绝对路径硬编码、无品牌分支；
  公开事件/诊断/redaction 测试锁定（含 `/runtime/bin/pi`、tmp_path、token）。
- 本轮未读取 credential 内容、未发起真实模型请求。

## 19. Work Core / schema / migrations diff

`git diff 532cc99 -- src/agent_box/work_core src/agent_box/migrations
src/agent_box/resource_contracts`：work_core 与 migrations **零修改**；
resource_contracts 仅**新增** `launch_selection_v1.py`（中性 dispatch 输入
契约）并注册进 CONTRACT_TYPES —— 无既有语义变更。

## 20. Remaining limitations（诚实清单）

1. REAL-CREDENTIAL SMOKE PENDING：五家均未做真实凭据端到端（见
   `SMOKE_REAL_HARNESS.md`，未执行）。
2. 权限投递仅 acp/driver 模式；exec 模式为 harness 自动拒绝（如实）。
3. codex 凭据为唯一 materializer；其余四家凭据留在原生 home。
4. 事件流为单进程（1s 轮询 + 进程内通知）；跨进程总线未做。
5. Session Store 单连接（RLock）；多进程写未支持。
6. live workspace 在 lowering/sandbox 的 digest 窗口期为 launch 时快照
   （外部并发修改可能触发 fail-closed，属诚实拒绝）。
7. Git/Terminal/Files/Profiles/Skills/Attachments API 未实现（capability 如实）。
8. 前端换绑、Domain Ports、Tauri 集成未动（Studio 仓库零修改，已核实）。

## 21. READY / NOT READY

- **READY FOR FRONTEND BINDING**（在上述限制内：Session/Turn/事件/恢复/
  取消契约已稳定，五家 synthetic 全链验证）。
- **NOT READY FOR CROSS-HARNESS SESSION CODEC PHASE**（本轮明确未实施，
  需按 SESSION_HARNESS_SEPARATION write admission 逐家准入）。

## 22. 架构补充裁决（同日追加）：Execution DAG 预留字段

按后续架构裁决，本轮**不扩展、不依赖** `HarnessSessionCodec` 的对称双向转换
假设：该 SPI（Phase 1 纯协议骨架）保持未接线状态，本轮交付的是五 Harness
真实独立执行 + 原生 Session 输出 Ref + 各家现有原生 continuation。

为未来 Execution DAG + per-Execution immutable `native_session_ref` 设计
（Codec 拆分为 Importer / Materializer / Resumer），按允许清单**只**预留了
以下 set-once、immutable 的 per-Execution 事实（Session Store 层，Work Core
ontology 零修改）：

| 预留字段 | 位置 | 本轮写入事实 |
|---|---|---|
| `parent_execution_id` | `TurnExecutionLink` / `turn_executions` | continuation 时 = 源 Execution id；首 attempt 为 None |
| `input_session_ref` | 同上 | continuation Ref（由 provider 构造） |
| `output_native_session_ref` | 同上 | 该 Execution 实际产出的原生 Session Ref（`provider.continuation_ref(locator)`，session locator 来自本 Execution 的 SESSION observation） |
| workspace input/output Ref | 同上 | link 时 input = live workspace Ref；commit 前 output = 同 Ref |

- 全部 set-once：同值幂等、异值 → `ExecutionFactConflict`（provenance 永不改写）。
- schema v2 → v3（显式事务化迁移，新增 5 列）；`connect()` 支持多步迁移链。
- 新 API：`record_execution_input_facts` / `record_execution_output_facts` /
  `execution_link`（SPI + SQLiteSessionStore）。
- 测试：`test_execution_link_facts.py`（set-once/冲突/重启/迁移 5 项）；
  studio 级真实链 vertical 断言 `output_native_session_ref.native_id ==
  "studio-vertical-session"` 全链写入。
- 明确未做：任何跨 Harness 转译、Codec 接线、派生 session 内容持久化。

## 23. 人工验收缺陷修复（同日第二次追加）：MANUAL CHECKPOINT 边界修正

人工验收发现四个确定缺陷，已全部修复并有正式回归测试锁定（本节结论取代
本文此前与之冲突的表述）：

### A. v1 → v3 正式 connect 迁移链（P0，已修复）

根因：migration 函数用全局 `SCHEMA_VERSION` 写版本戳，v1→v2 在当前代码下
直接把库标成 3，`connect()` 的 while 循环随即结束，v2→v3 被跳过（库声称
v3 但 `turn_executions` 缺五个 provenance 列）。修复：

- 每个 migration 只写自己的精确目标版本（v1→v2 写 '2'，v2→v3 写 '3'）；
- `connect()` 每步迁移后验证版本严格等于旧版本 +1，跳级/停滞一律
  `SchemaVersionUnsupported` fail closed；
- 新增当前版本 required-columns 校验：版本戳正确但 schema 内容缺失的库
  （"stamp without work"）同样 fail closed，永不打开；
- 中途失败的迁移保持 `BEGIN IMMEDIATE → rollback` 完整事务边界。

真实入口测试（不手工调用 migration 模拟正式链路）：真 v1 库 →
`SQLiteSessionStore(...)` → 版本 3 + 五列齐全 + v1 数据保留 + facts API
可真实调用；v2→v3 中途失败 → 完整回滚到 v2 → 重新打开恰好执行一次。

### B. 同 Harness continuation 强制 + 精确源 Execution（P0，已修复）

- continuation 消费的 `input_session_ref` **精确等于**源 Execution 的
  set-once `output_native_session_ref`（由 provider 构造、Store 持久），
  绝不从 transcript locator 重推、绝不用目标 provider 重造；
- `parent_execution_id` 指向真正产生被消费 Session 的 Execution：按
  "持有 output Ref 的 Execution"集合选择；多个时仅当 run journal 的
  committed Execution 能唯一消歧才继续，否则 typed failure（`[0]` 不再使用）；
- 源 Harness ≠ 目标 Harness → 新 typed
  `CrossHarnessContinuationUnsupported`（HTTP 409
  `CROSS_HARNESS_CONTINUATION_UNSUPPORTED`），明确要求未来 cross-Harness
  Codec，绝不静默 native resume、绝不 handoff/summary 模拟；
- Ref 兼容性双验证：Ref.provider 必须等于该 continuation contract 的唯一
  Registry resolver id，且 metadata `harness_type` 必须等于所选 provider 的
  harness_type。

Studio 级反例测试：同 Harness 成功（codex-style stub 双向）、跨 Harness
typed 拒绝、源 Turn 未提交拒绝、源 Execution 缺 output Ref 拒绝、
双 Execution 时 parent 指向真正产出者、歧义源 typed 失败、Store 重启后
continuation 仍可解析。

### C. Output provenance 写入失败不再被吞（P0，已修复）

- 观察循环中的 `record_execution_output_facts` / `provider.continuation_ref`
  失败直接上抛：`ExecutionFactConflict` → 专用
  `OUTPUT_PROVENANCE_CONFLICT` 恢复路径；store/lease 错误 → 既有
  recovery-required 路径；turn 永不在 provenance 缺失/冲突时 commit；
- continuation 能力判断升级为真值检查（callable 且 contract 非空）；
- 故障注入测试：provider ref 抛错、store 写入抛
  ExecutionFactConflict/SessionWriterConflict、失败后重启状态仍为
  recovery_required（非 completed）、conflict 细节不进 ledger。

### D. execution_link 严格 Session isolation（P1，已修复）

`_load_link` 改为 `turn_executions JOIN turns` 并约束 `turns.session_id`；
外来 (turn, execution) 与不存在不可区分（同一 typed `TurnNotFound`），
不泄漏其他 Session 的存在性或 provenance。input/output facts API 的
ownership 由同事务内 session-scoped `_load_turn` 校验保持。测试：跨
Session 读/写拒绝、外来 lease+外来 Session fail closed、正确 Session 正常、
重启后隔离保持。

### Set-once 多字段事务原子性（补充锁定）

多字段调用在单事务内执行：任一字段 conflict → 整体回滚（新字段不部分
写入、旧字段保持）；同值整体 replay 幂等；仅 uri 不同的 Ref 也冲突；
事务失败后重启状态一致。语义不变：None=不写、首写=设置、同值=幂等、
异值=`ExecutionFactConflict`、无 clear/overwrite API。

### 其他

- 死路径清理：`_build_dispatch_inputs` 不再读取从未有写入者的
  `turn.continuation` 事件；continuation dispatch 输入改为读取本 Execution
  link 上持久化的 `input_session_ref`；
- **Committed Execution authority（Test-First 收口）**：continuation 的
  parent authority 始终且只能是 source Turn 的 committed
  `TurnRunView.execution_id`——唯一 output-Ref 持有者也不能绕过该权威；
  `input_session_ref` 精确复用 committed Execution 的 output Ref（对象级
  相等）；stale/failed/uncommitted/post-commit 白盒注入 link 永不成为
  父节点；committed run 指向未链接 Execution / 缺 execution_id /
  committed Execution 缺 Ref 一律 typed fail closed（RED 阶段 4 个反例在
  旧实现上确实失败后，GREEN 实现转绿，7 个反例全部锁定）；
- **Migration 版本验证前移到 commit 前（Test-First 收口）**：
  `_apply_migration` 在同一事务内执行"迁移 → 读取结果版本 → 验证严格
  old+1 → commit"；跳级/停滞 migration 完整回滚，数据库保持合法旧版本
  （不再把库留在虚假版本）；跳级与停滞两个 RED 反例在旧实现上失败
  （错误版本已持久化）后转绿；`_read_schema_version` 兼容 tuple/Row；
  current required-columns 校验保留；
- `httpx2` 修正说明与 §16 continuation 边界维持不变；
- 明确未实施：Codec 接线、Importer/Materializer/Resumer、跨 Harness 转译、
  Execution DAG 调度、Unified Transcript 派生、Native Original 新存储、
  Loss Report 消费、compact、MCP Resource、Work Core ontology 变更。
- 本轮修复为严格 Test-First：RED（仅测试）→ 记录失败原因 → GREEN（最小
  实现）→ 全量回归；修改面 = `agent_box_studio/service.py`（committed-run
  算法）、`agent_box_session/schema.py`（pre-commit 验证）与两个测试文件。
- 验证环境：全部测试以 `PYTHONDONTWRITEBYTECODE=1` 运行；两个跟踪的
  credentials pycache 文件已精确恢复到 HEAD（仅为测试再生成物）。
