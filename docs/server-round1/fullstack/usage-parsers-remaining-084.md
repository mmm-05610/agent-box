# 工单 084 — 51/53 剩余解析器：hermes/claude 门级观测轮 + opencode/kilo blob

**契约**：`docs/implementation/work-orders/084-usage-parsers-remaining.md`（baseline `4c32992`）
**本文件写于**：2026-09-18　**执行者**：`agent-box-env-provider`（b2 第 3 张）

## 0 基线核对（先手）

工单声明 baseline `4c32992`。`git log --oneline 4c32992..HEAD -- src plugins workers` **为空**
（其间 7 个提交全是契约/证据/账本：`ba5c4f1` 派单、`73c7da0`/`d83511c` 082、`b7ca376`/`a38d2bd` 090/091 与章程、
`0d92aad`/`f2c657e` 083 的测试与证据）⇒ 本轮观测跑在当前代码面上，**不是**在旧实现上重述结论。

工单 premise 陈旧之处（如实记，不改契约）：51 阶段 A/C 已把六家解析器写好并在真实库上验证过
（`eb0c307` opencode/kilo blob、`6bc3681` hermes/claude 观测轮 + WAL 侧车根因），本单实际要做的是
**在当前基线一手复现** 这两块、补 **G2/G3 可证伪门**、并把 51/53 的账行对齐。

## 1 运行入口（环境事实，不是回归）

两条门命令（真实 bwrap + c11 worker，**假端点**，零真实模型调用）：

```bash
export PYTHONPATH="$PWD/src:$(ls -d $PWD/plugins/*/src | tr '\n' ':')"
export AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap
python3 scripts/server-round1/hermes-production-chain-gate.py \
  --worker workers/agent-box-worker/.acceptance-bundle-c11/agent-box-worker --keep --json
python3 scripts/server-round1/claude-production-chain-gate.py \
  --worker workers/agent-box-worker/.acceptance-bundle-c11/agent-box-worker --keep --json
```

- **不带 `AGENT_BOX_SANDBOX_MODULE` 时本轮实测失败**：`SANDBOX_PROVIDER_UNRESOLVED: … serves sandbox
  provider 'sandbox-bwrap'`（PYTHONPATH 运行态没有 installed entry point，`_default_provider` 在非 nt 宿主取
  `sandbox-bwrap`）。这是**运行态前置**，与 67/069 证据里记的同一条；本单 write_paths 不含 `scripts/**`，
  故**不改门脚本**，只把入口写在这里。
- `--keep` 是取账本一手事实的手段：门的 Server 数据根在 `<temporary>/server/state/agentbox.sqlite`，
  用完由本文件 §5 的清理步骤删除。
- 两家 worker 摘要同一：`sha256:c1e353c89609ab2feed0765205feeb3eb4c8db9679f353ba4065302df35a2457`。

## 2 hermes 门级观测轮（第一手，实测）

门结果：`HERMES_PRODUCTION_CHAIN_GATE_OK`，`mode=loopback-fake-endpoint`，
`sessionId=session_b9b78de91e224716bf6fe49c4d7b7d6c`，`nativeSessionId=39459a7a-eb1d-4d20-8af2-baf75bcf8e04`，
`chainProviderRequests={round1:1, round2:1}`，`deltaAttribution.deltas=2 / unattributed=0`。
假端点对每轮发一条 `usage = {prompt_tokens:11, completion_tokens:7, total_tokens:18}`。

**账本 `server_turns` 逐行（只读打开门的 Server 库）**：

| turn id | state | input | output | total | source |
| --- | --- | --- | --- | --- | --- |
| `execution_bf42486075714797938d0eb5d5c17fd5` | completed | 11 | 7 | **null** | `hermes-state-db` |
| `execution_25acac13028646ba9dc09c6b1ea9efcb` | completed | 22 | 14 | **null** | `hermes-state-db` |

`server_sessions.latest_usage`（该会话）逐字：
`{"cacheReadTokens":0,"cacheWriteTokens":0,"inputTokens":22,"outputTokens":14,"reasoningTokens":0,"turnId":"execution_25acac13028646ba9dc09c6b1ea9efcb","usageSource":"hermes-state-db"}`
⇒ 会话级最新值 = 轮 2 的值，`turnId` 指回该行。

**`total` 为 null 是该家的诚实形状**：hermes 的 `sessions` 表只报 input/output/cache/reasoning，没有 total 列；
解析器**不代求和**（`_neutral` 只搬运，缺字段即缺字段）。假端点报的 `total_tokens:18` 不进账本，正是
"不拿别家的数字冒充"。

**与原生库逐字段对齐（现场库，四份 profile-home 全查）**：门的原生载体确实是 `state.db` + `state.db-wal`
（`nativeStorePath.files`）。用 `parse_hermes_state_db` 直接跑这四份现场库：

| 现场 home | 只读主文件 | 主文件 + `-wal`/`-shm` 侧车 | `-wal` 字节 |
| --- | --- | --- | --- |
| `hermes-production-gate-664c176a` | **null** | **(22, 14, cache 0/0, reasoning 0)** | 1,034,152 |
| `hermes-gate` | (22, 14, …) | (0, 0, …) | 181,312 |
| `hermes-model-control-product-9f35fa54` | null | (0, 0, …) | 473,832 |
| `hermes-model-control-unknown-b2de3fe4` | null | (0, 0, …) | 473,832 |

- 第一行就是**轮 2 的原生库**：主文件单读取不到（行只在 `-wal` 里）、带侧车读到 **(22,14)** 与账本逐字段一致
  ⇒ `6bc3681` 定位的 WAL 侧车根因在当前基线上**仍然成立且已被修好**（侧车随主文件一并取回）。
- 后三行的"带侧车=全零"不是失败：那是该 home 里**更新的**一行（门的负例/重开会话新建的 session，其计数器真为 0）；
  解析器按库自己的最新行取值，**如实报 0**，与"缺字段 ⇒ 不写 0"是两件事。

## 3 claude 门级观测轮（第一手，实测）

门结果：`CLAUDE_PRODUCTION_CHAIN_GATE_OK`，`mode=loopback-fake-endpoint`，
`sessionId=session_b3e81ae6136c4287bcd80d6f4b2f18d8`。

**账本 `server_turns` 逐行**：

| turn id | state | input | output | total | source |
| --- | --- | --- | --- | --- | --- |
| `execution_162dae272ca74861b3abdb2adb633287` | completed | null | null | null | null |
| `execution_b025118957d54fa8ba8facf22f74dcfa` | completed | **11** | **7** | null | `claude-projects-line` |
| `execution_66411c296e18415ead73bedb54408ab7` | **failed** | null | null | null | null |

`server_sessions.latest_usage`：`session_b3e81ae6…` =
`{"cacheReadTokens":0,"cacheWriteTokens":0,"inputTokens":11,"outputTokens":7,"turnId":"execution_b025118957d54fa8ba8facf22f74dcfa","usageSource":"claude-projects-line"}`；
`session_281ad8d496954ec1afa672e0a9981c96` = **null**。

- 中间那行 = 门链路里被记进会话的一轮 ⇒ G1 的"门级一轮的 source 与计数"成立，`usage_source` 等于
  部署声明的探针格式（`plugins/agent-box-harnesses/src/agent_box_harnesses/claude/production.py:216`
  的 `{"journalSuffix": ".jsonl", "format": "claude-projects-line"}`）。
- 第一行是"捕获时该轮的 projects journal 尚未落盘"⇒ **未知**，不猜（与 51 阶段 C 记录的同一现象一致）。
  两行 completed 之间**未做 round 归因**（门 JSON 未带 turn↔round 映射），此点按未验证处理。
- 第三行 state=`failed`，用量四字段全 null（其失败原因见门 stderr 一手：
  `SIDECAR_OP_FAILED: Harness model is not available: deepseek-unknown`）⇒ 工单 Scenario 的
  "**失败轮为 NULL**" 这条在本轮**直接命中真实行**，不是靠单测。

**两家合起来**：`usage_source` 均等于部署声明的探针格式，且 hermes 的 fact 与原生 `sessions` 表逐字段一致
⇒ **逐家解析器在真实家族链路上端到端成立**（G1）。反例（"只有单测没有门即失败"）的形态即 §2/§3 若缺任一家的
门级行则 G1 不成立——本轮两家各有，故 G1 pass。

## 4 凭据面（同两轮附带的第一手事实）

两家的门都自带凭据审计，本轮值：`tokenInEvents=false`、`tokenInReportableState=false`、
`unauthorizedRequests=0`、hermes `stateScan.tokenHits=[]`（扫 8 文件 / 1,086,291 字节）。
即：**注入 token 只到假端点，未进事件流、未进可上报状态、未落现场库**。本文件与门 JSON 里无任何凭据内容；
真实 locator 未被这两轮读取（假端点模式）。

## 5 账务与清理

- **真实模型调用 0 次 / 费用 ¥0**（两家门都是 loopback 假端点；`chainProviderRequests` 打到本机端口）。
- 两轮用 `--keep` 取完账本事实后，`/tmp/agentbox-hermes-gate-c10p8120` 与
  `/tmp/agentbox-claude-gate-fgzbfnoo` **已删除**（工件目录只读，需先 `chmod -R u+wX` 再删；实测根不存在）。
- `ps -eo comm | grep -c agent-box-worker` → **0**（注：`pgrep -x` 对 >15 字符名字恒 0，不作证据）。
- `/tmp` 下其余 `agentbox-*` 根与 16 个 `server_*` 根不是本轮产物，未触碰。

## 6 本阶段剩余（不是通过声明）

- G2（零凭据查询）与 G3（缺字段 ⇒ unknown 而非 0）的**可证伪门**尚未落成本单的测试与反例 ⇒ 阶段 3。
- 51/53 账行对齐（`status.md:78` 仍是旧的 `USAGE_FACT_PARTIAL`）⇒ 阶段 4。
- `dsh`/`qwen`/`kilo`/`opencode` 的模板仍**未声明 `usageProbe`**（沿用 51 阶段 C 的"未知"，本单不扩协议）。
