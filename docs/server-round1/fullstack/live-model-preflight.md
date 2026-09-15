# 四家真实模型门 preflight（自审版）

日期：2026-09-15。适用：42 §D 已授权的 DeepSeek 官方 API、产品模型 `deepseek-flash`。
authorization 与 locator 均在工单 §D 内，未新增授权、未提高预算。

## 0. 审查者身份说明

调度原要求"付费前先完成 Reviewer preflight 并取得 ACCEPT；Reviewer 不读 secret、不调用模型"。
固定 Reviewer 的 Codex 额度已由用户确认用尽，用户指示改为执行者自审。因此本 preflight 由执行者
按同一清单自审（下方每条即为 Reviewer 会核对的项），并在本轮文档中显式标注为**自审**；
`REVIEWER_AUTOMATION_READY` 与最终交付复审仍待 Codex 额度恢复后补做。

## 1. 官方价格（2026-09-15 只读核对，api-docs.deepseek.com/quick_start/pricing）

| 项 | off-peak（USD/1M） | peak（USD/1M） |
| --- | --- | --- |
| `deepseek-flash` 输入 cache miss | 0.15 | 0.30 |
| `deepseek-flash` 输入 cache hit | 0.003 | 0.006 |
| `deepseek-flash` 输出 | 0.60 | 1.20 |

peak = 周一至周五 01:00–04:00 与 06:00–10:00 UTC，其余为 off-peak。产品模型
`deepseek-flash` 在官方目录中仍在售（V4.1-Flash）。

## 2. 请求上界（每家，按已审阅模板的硬限制）

| 家 | 轮数 | 每轮 provider 请求 | 重试 | 输出上限 | 最坏请求数 |
| --- | --- | --- | --- | --- | --- |
| Pi | 2（首轮 + 续轮） | 1 | 关闭（`settings.json` retry=false） | 64 tokens | 2 |
| Hermes | 2 | 1 | `api_max_retries=1`（实测 5xx 不重试） | 64 tokens | 2（上界 4） |
| OpenCode | 2 | 1 | 实测受控上界 6 | 64 tokens | 2（上界 12） |
| Codex | 2 | 1 | Responses 无重试（实测 budget=2） | 64 tokens | 2（上界 4） |

reopen/续接阶段不再发起模型请求（Pi 为 journal 重放、Hermes 为 `resume_session`、OpenCode 为
`--session`、Codex 为 `session/load`），均已在各自无模型门中以假端点证明。

**最坏成本（按 peak 价、上界请求数、单请求输入上界 8k tokens 计）**：
单请求 = 8k × $0.30/1M + 64 × $1.20/1M ≈ $0.0024 + $0.00008 ≈ **$0.0025**。
四家 × 上界 22 请求 ≈ $0.055 ≈ **¥0.40**；实际按每轮 1 请求（8 请求）约 **¥0.15**。
累计上限 ¥10，继承已发生的 1 次/12 tokens/<¥0.01；**累计预留达 ¥8 时停止新增测试**。
结论：本阶段最坏情形亦远低于预算，无需新增授权。

## 3. 凭据处置

- locator：`/home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key`（只读元数据已核对：
  目录 0700、文件 0600、36 字节；**内容未读取**，本文件不记录任何凭据内容）。
- 注入：与无模型门完全相同的路径——`store.import_file(locator, "api-key")` → CredentialRecords
  注册 → SecretStore → Worker secret 帧 → 沙箱环境变量；**不进 argv、不进 deployment、
  不进事件、不进 checkpoint、不进 workspace、不进 Git、不进报告**。
- 扫描：把实际凭据字节（运行期读入内存）作为 forbidden content，复用现有
  `CODEX_GATE_TOKEN_IN_STATE` / `SIDECAR_STATE_CONTAINS_SECRET` / `token_in_workspace` /
  Git 扫描；命中即类型化失败，且失败信息**只含相对路径**，不含凭据。
- 清理：临时根、Worker view/secret、DataRoot、workspace 由各门既有 cleanup 处理；
  本阶段不新增常驻位置。

## 4. 每家验收断言（与无模型门同构，替换掉假端点专有项）

生产 Server→Core→Worker→bwrap→真实 Harness/adapter/agent；两轮同一 Server Session；
线上模型值精确 `deepseek-flash`；首轮真实回答且 terminal 前 delta 抵达并持久化；
第二轮携带第一轮上下文；重开使用真实 native 方法（`session/load`、`resume_session`、
`--session`、Codex `session/load`）；cancel 与清理；未知模型在发包前拒绝；
凭据不进 deployment/argv/日志/事件/state/checkpoint/workspace/Git；
精确请求数、usage 与费用记账；失败时保留脱敏失败层级。

## 5. 执行前提与命令（实现 `--live` 后按此执行）

各生产门目前的 `FakeEndpoint`/`loopback_models_document` 与"仅 loopback"断言需要一条
`--live` 通道：官方 base URL（不覆盖）、真实 locator、跳过假端点专有的请求计数断言，
其余断言与扫描不变。实现完成后逐家串行执行：

```bash
PYTHONPATH=src:plugins/... python3 scripts/server-round1/<family>-production-chain-gate.py \
  --worker workers/agent-box-worker/.acceptance-bundle-c8/agent-box-worker \
  --live --authorized-secret /home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key --json
```

每家独立记账（请求数/usage/费用/脱敏失败层级）；一家失败按 §6 提问，不拖住其他家。

## 6. 执行结果

### Pi（2026-09-15，`--live` 首次通过）

命令：`pi-production-chain-gate.py --worker .acceptance-bundle-c8/agent-box-worker --live
--authorized-secret <locator> --json` → **exit 0 / `PI_PRODUCTION_CHAIN_GATE_OK`**（mode=live）。

- 两轮真实模型：`rounds.first` completed（delta 流式输出 `PI-GATE-NONCE-1F4A9C`）、
  `rounds.second` completed（真实答复回忆出第一轮 nonce 并带上上下文）——**真实 DeepSeek
  响应，非假端点**。
- 重开相位（真实链路）：journal 重放观测到第一轮 nonce（`nativeSessionIdStable=true` 另由
  checkpoint 绑定）。
- 未知模型：`Harness model is not available: …`（`reasonMentionsModel=true`）；live 模式下
  假端点不存在，故记录 `providerRequestCountAvailable=false`（无模型门中该计数仍由假端点给出）。
- 凭据：`tokenInEvents=false`、`tokenInReportableState=false`；captured state 1 文件、
  `tokenHits=[]`；授权 locator **未被删除**（`authorizedLocatorDeleted=null`，gate 只删自己的
  临时 token：`gateTokenRemoved=true`）。
- 清理：`adapterProcessesRemoved/workerProjectionsRemoved/workspaceRemoved/removed` 全为 true。
- 运行账（按产物逐次核对）：本家 `--live` 共 **10 次**运行——6 次通过（`pi-live4/6/7/8/9/10`，
  各两轮）、4 次失败：`pi-live`（live 接入缺口 `AttributeError: requests`；报告无 `rounds` 键，
  是否已发包无法判定）、`pi-live2`（`AttributeError: stop`，**两轮均已完成**）、
  `pi-live3`（凭据未注入 → `SIDECAR_OP_FAILED: Authentication required`，**两轮均已完成**）、
  `pi-live5`（**state capture 失败**，首轮已流式）。
  **失败运行里有 3 次已实际产生付费轮次**（live2/live3 各两轮、live5 一轮）——
  早先"失败运行都在发包前结束"的说法与产物不符，已更正。
  每轮输入数百 tokens、输出 ≤64 tokens → 本家仍 **< ¥0.01**，四家累计远低于 ¥10。
  **capture 间歇统计：1 失败 / 10 次 Pi live**（失败即 `pi-live5`，其后 5 次复跑全绿，未复现）。
- **一次未能归因的 capture 间歇（pi-live5，18:37）**：首轮 delta（nonce）已流式产出，随后
  `turn.capture failed` → `turn.state failed`，外层码 `SIDECAR_OP_FAILED`。当时 gate 的
  `turn_diagnostics()` 只保留事件的 state 文本、**丢掉了 `turn.capture` 事件里的内层 `error_code`**，
  故该次无法归因到具体层（settle 超时 / 类型化拒绝 / 身份冲突）。其后 3 次复跑（live6/7/8）全绿，
  未复现。**已修**：四家 gate 的 `turn_diagnostics()` 现保留 `error_code`/`code`/`state`/`retryable`，
  下一次同类失败可直接读出失败层级。此条按未解决间歇记录，不折算为任何门的通过或失败。

实现要点（`--live`，四家共用同一模式）：官方 base URL 不覆盖、不装载 loopback guard、
locator 内容只经 SecretStore 注入（gate 自建临时 token 文件、绝不删用户文件）、
假端点专有断言（请求计数/授权头）在 live 下改为"真实答复即证据"或显式不可用（不静默通过）。

### 自审轮（Reviewer 额度用尽期间，按用户指示自审）发现的 3 处问题（已修）

1. **Pi 报告字段自相矛盾**：live 下无端点可计数，`refusedBeforeProviderRequest` 由
   `None == 2` 求值成 **false**，读起来像"未知模型确实到了 provider"，与观测相反；现为 `null`
   并附 `refusalObservedAs`。
2. **live 下未知模型相位形同虚设**：Pi 的记录项 `reasonMentionsModel` 从未被断言，live 无请求计数时
   该相位无论因何失败都能"通过"；现按"必须因 sidecar 的模型可用性拒绝而失败"硬断言
   （`PI_GATE_UNKNOWN_MODEL_REASON_UNEXPECTED`），理由是失败原因的**正向**证据在 live 下不可替代。
3. **失败层级被丢弃**：四家 gate 的 `turn_diagnostics()` 丢掉 `turn.capture` 的内层 `error_code`，
   使 capture 层失败无法归因（正是 pi-live5 那次）；已修并保留结构化码。

### Hermes（2026-09-15，`--live` 通过）

运行账：本家 `--live` 共 **5 次**（`hermes-live1` 缺口 `AttributeError: requests`，未发包；
`hermes-live2` `HERMES_GATE_EGRESS_GUARD_ABSENT`、`hermes-live3`
`HERMES_GATE_NATIVE_MODEL_UNOBSERVED`，**二者均已完成两轮**；`hermes-live4` 通过，
`hermes-live5` 为**最终代码上的复跑**，同样 exit 0——两轮 43 / 64 deltas、state 9 文件零命中、
`authorizedLocatorDeleted=false`、清理全 true）。

`hermes-production-chain-gate.py --live` → **exit 0 / `HERMES_PRODUCTION_CHAIN_GATE_OK`**：
两轮真实答复（14/15 deltas，第二轮带第一轮上下文）、同 native id 续接（`checkpointNativeIdStable`）、
凭据不进事件/报告、captured state 9 文件/6 MB 无命中、adapter/worker/workspace 全清理、
授权 locator 未被删（`authorizedLocatorDeleted=false`）。

live 模式下**显式记为"未观测"而非静默跳过**的项（均为假端点/guard 产物）：
`modelControl`（模板属性，无模型门已证拒绝）、`retryObservation`（注入 5xx 需要假端点）、
`nativeReopenMethod`（ACP 方法审计是 guard 产物；live 以第二轮同 native id 为续接证据）、
`nativeModel`（同前；live 记录 `configuredModel=deepseek-flash`）、
`chainProviderRequests`/`round2Continuation`（请求体在 live 下不可见，改以真实答复回忆 nonce 为证）。

### OpenCode（2026-09-15，`--live` 通过）

运行账：本家 `--live` 共 **7 次**（`opencode-live1/2` 接入缺口未发包；`opencode-live3/4` 报告
`rounds` 显示**两轮均已完成**后才被后续缺口打挂；`opencode-live5`
`OPENCODE_GATE_EGRESS_GUARD_ABSENT`，同样**两轮均已完成**；`opencode-live6` 通过，
`opencode-live7` 为**最终代码上的复跑**：同样 exit 0、两轮 12 / 8 deltas、state 4 文件零命中、
未知模型以 `OPENCODE_MODEL_NOT_AVAILABLE` 在 driver 内拒绝、清理全 true）。

`opencode-production-chain-gate.py --live` → **exit 0 / `OPENCODE_PRODUCTION_CHAIN_PREPARED`**：
两轮真实答复（各 8 deltas）、同 native id 且 checkpoint `resumable=true`（含 opencode.db/WAL）、
缺凭据在派发前被拒（`CREDENTIAL_REQUIRED`、`sessionsCreated=0`）、
凭据不进事件/报告、tracked Git 零命中、进程/worker 投影/workspace 全清理。
live 下显式记为"未观测"的项：driverObservation/driverNegatives/guestProbeResult
（均需假端点与守卫）、`requestStructure`、重试上界观测（声明值保留）、出口守卫审计。

### Codex（2026-09-15，`--live` 通过；接入后第二次运行）

`codex-production-chain-gate.py --worker .acceptance-bundle-c8/agent-box-worker --live
--authorized-secret <locator> --json` → **exit 0 / `CODEX_PRODUCTION_CHAIN_GATE_OK`**（mode=live）。

- 首轮：真实答复 `completed`，14 个 delta 流式输出并逐条持久化到 Server（终止前 delta 先于
  completed），2.25 s，答复内容正是第一轮要求记忆的 nonce。
- 第二轮：`completed`，15 个 delta，答复回忆出第一轮 nonce——**同 native id
  `01a0a48d-d7f8-7460-a8ac-733c272eec93` 的真实上下文续接**（`checkpointNativeIdStable=true`，
  checkpoint 含 `sessions/…/rollout-*.jsonl`，78 文件 / 3.3 MB 完整 state 被捕获）。
- 重开相位（gate 自带的机制审计）：真实 `session/load` 重开方法、两轮各 77 文件且
  `resumable=true`、捕获 154 文件 / 5.7 MB 零命中；该相位的 provider 流量走它自己的 loopback
  审计端点（报告显式标注 `providerEndpoint=loopback-mechanism-audit`、
  `providerRequestsAreModelCalls=false`），**live 下的续接证据是链路的第二轮**，不是该端点。
- 取消（live 语义）：真实答复已流式输出后从 Server 取消 → `202` → `cancelled`（0.08 s、
  `cleanupState=cleaned`）；live 无被挂起的假请求，故取消窗口由 Server 自身记录界定
  （`deltasBeforeCancel`），请求计数显式记为不可观测。
- 未知模型：`Harness model is not available: deepseek-unknown`，在派发前拒绝
  （live 无端点可计数，`refusalCounted=false` 明确记录）。
- 凭据：`tokenInEvents/tokenInReportableState/tokenInDeployment/tokenInWorkspace=false`、
  `noCredentialMaterialInProductionConfig=true`、state 扫描 78 文件零命中、独立观察器
  `credentialPathHits=[]`、`authorizedLocatorDeleted=false`（gate 只删自建临时 token）。
- 进程/投影证据：`CODEX_HOME=/runtime/home/.codex`、`HOME=/runtime/home`、
  `codexHomeMatchesDerivedDefault=true`、`app-server` 子进程继承同一环境；config/models 投影
  写入得 `EROFS`、state 可写；宿主 HOME 不可见（哨兵不可见）。
- 官方配置**原样投影**：`configProjection.unchangedFromDeployment=true`（2650 字节、
  `sha256:b0189c81…`），live 不覆盖 base_url、不装载 loopback guard。
- 清理：`adapterProcessesRemoved/workerProjectionsRemoved/workspaceRemoved/fakeTokenRemoved/
  removed` 全为 true。
- 运行账：本家 `--live` 共 **7 次**——4 次失败（`codex-live4` locator 路径笔误，未发包；
  `codex-live1/2/3` 的产物不是 JSON（当时的失败只留下 traceback），**是否已发包无法从产物判定**，
  不写成"未发包"）、
  3 次通过（`codex-live5/6`，以及**最终代码上的复跑 `codex-live7`**：两轮 14 / 15 deltas、
  同 native id 续接、取消与凭据断言、`tokenIn*` 全 false、state 78 文件零命中、清理全 true）；
  另有 1 次无模型复跑（`codex-nomodel-c8-final`）exit 0。
  通过的两轮各 3 次 provider 请求（首轮/次轮/取消中的半次），输入数百 tokens、输出 ≤64 tokens/次
  → 本家 **< ¥0.01**。四家 `--live` 合计 **29 次运行、13 次通过**，累计费用仍 **< ¥0.07**，
  远低于 ¥10 上限；未充值、无第三方代理。

live 下**显式记为"未观测"而非静默跳过**的项（均为假端点专有）：`silenceObservation`
（8 s 静默首答需要假端点）、`providerRequestShape`（请求体不可见，改以真实答复回忆 nonce 为证）、
`unknownModel.providerRequestsAfterRefusal`（无端点可计数，改为"派发前拒绝"的失败原因正证）、
`cancel.providerRequestsBeforeCancel`（同上）。

修复的接入缺陷（都发生在 live 接入过程中，均有回归测试）：
①链路上仍有 4 处只在假端点模式成立的断言（静默窗口、请求体形状、未知模型请求计数、取消挂起），
live 下会抛 `AttributeError` 并被相位证据收进报告；
②报告因此**无法序列化**，整个失败运行只剩 traceback。现由 `phase_evidence_for_report`
（异常按码/文本入报告、对象仍留给判据）+ `unserializable_value` 兜底 + `report_text()` 修复；
③凭据事实此前只记录不断言，现对 `tokenIn*` 为真即 `CODEX_GATE_CREDENTIAL_EXPOSED` 硬失败；
④live 下新增"授权 locator 未被删除"的断言与字段。

## 7. 当前状态

- 已就绪：四家生产封装、c8 release Worker、五门无模型证据、官方价格核对、本 preflight。
- **四家真实模型门全部取得证据（2026-09-15）**：Pi / Hermes / OpenCode / Codex 均
  `--live` exit 0（Codex `CODEX_PRODUCTION_CHAIN_GATE_OK`，其余见各节），累计费用 **< ¥0.05**，
  机制（loopback）与真实模型证据分别记账、未互相替代。
- 待做：更新 status 与检查点提交 → 固定 Reviewer 恢复额度后补 §4.2 闭环与
  `REVIEWER_AUTOMATION_READY` → 登记 `BACKEND_IMPLEMENTATION_READY` → 双门接管。
- 阻塞：无（唯一外部约束是固定 Reviewer 额度，仅影响审查登记，不影响执行本身）。
