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
- 成本（实测轮次）：本家共 3 次运行（含两次因缺口失败的运行）× 每轮 1 请求 ≈ 10 次请求，
  输入数百 tokens、输出 ≤64 tokens/次 → **< ¥0.01**；累计仍远低于 ¥10。

实现要点（`--live`，四家共用同一模式）：官方 base URL 不覆盖、不装载 loopback guard、
locator 内容只经 SecretStore 注入（gate 自建临时 token 文件、绝不删用户文件）、
假端点专有断言（请求计数/授权头）在 live 下改为"真实答复即证据"或显式不可用（不静默通过）。

## 7. 当前状态

- 已就绪：四家生产封装、c8 release Worker、五门无模型证据、官方价格核对、本 preflight。
- 待做：`--live` 通道实现（四家）→ 串行跑门 → 记账 → 更新 status → 登记
  `BACKEND_IMPLEMENTATION_READY`（仍需 Codex 额度恢复后的 Reviewer closure）。
- 阻塞：无（唯一外部约束是固定 Reviewer 额度，仅影响审查登记，不影响执行本身）。
