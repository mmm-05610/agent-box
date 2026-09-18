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

## 7 阶段 3：把 G2/G3 落成能被打断的门（实测）

**代码（`src/agent_box/server/execution/usage.py`，本单 write_paths 内）**

`_scratch_sqlite` 现在给临时库句柄挂 `set_trace_callback`，**逐条记录**该次解析执行过的语句，
在 with 块正常退出时过一遍 `_refuse_credential_queries`：任何点名
`credential(s)` / `account(s)` 的语句 ⇒ `UsageParseError("USAGE_PROBE_CREDENTIAL_QUERY", …)`（类型化拒绝，
且临时主文件/侧车照常删除）。三家 SQLite 载体（hermes/opencode/kilo）都走这一条，因为它就是它们的共同助手。

**阶段 3 的"blob 解析"这一项，实况是**已在基线里落地**：`parse_opencode_db`（读 `message.data` JSON 里的
`tokens` blob，取最后一条 assistant 行）与 `parse_kilo_db`（读 `session` 的专用列，按 `PRAGMA table_info`
只取存在的列）都由 **51 的 `eb0c307`** 写入，且各有 2 条测试在基线上就绿。所以本阶段**没有重复实现**，
补的是工单这一行真正缺的东西：**缺字段 ⇒ unknown 的反例**（下表第 3、4 条）与 G2 的守卫。
账面因此要在阶段 4 更正（51/53 行仍写着"blob 解析待续"）。

**测试（`tests/server/test_usage_parsing.py`，新增 5 条）**

| 测试 | 钉住什么 |
| --- | --- |
| `test_the_probe_own_statements_name_no_secret_bearing_table` | 载体里**放了** `credential`/`account` 两表（含哨兵值）时解析照常出 fact，且守卫亲眼看到的语句集合里没有任何一条点名它们 |
| `test_a_statement_that_reaches_for_the_credential_table_is_refused` | G2 反例：多加一句 `SELECT token FROM credential` ⇒ 类型化拒绝 + 临时文件不残留 |
| `test_a_null_column_is_unknown_and_never_becomes_a_zero` | G3 反例：列存在但值为 NULL ⇒ 该字段**缺席**，不会被补成 0（`(41, NULL, NULL, 0, NULL)` → `{inputTokens:41, cacheWriteTokens:0}`） |
| `test_a_failed_usage_read_keeps_the_fact_unknown_and_records_why` | G3 的"unknown + 原因"：读取抛错时 `usage_fact/usage_source` 保持 None，WARNING 日志带原因（`sidecar_backend.py:743`），该行不会变成 0 |
| `test_the_recorded_real_opencode_row_still_maps_to_the_recorded_fact` | opencode blob 的**真机形状**（51 阶段 A 逐字抄下的 10587 = 10446 in + 110 out + 31 reasoning，cache 0/0）作为回归钉住 |

**反例真的会咬（一次性演示，不改仓库代码）**：

```text
1) 守卫在场，凭据查询 -> 类型化拒绝 USAGE_PROBE_CREDENTIAL_QUERY
2) 守卫摘掉后同一句 -> 读到 [('a-token-that-must-never-be-read',)] （无拒绝 ⇒ 测试即失败）
3) 若把缺失值补 0 -> {'inputTokens': 41, 'outputTokens': 0, 'cacheReadTokens': 0, …}（正是要拦的冒充）
4) 现状            -> {'inputTokens': 41, 'cacheWriteTokens': 0}
```

即：G2 的失败**来自守卫**（把匹配面清空就漏），G3 的失败**来自不补 0**（补 0 的写法会被断言抓住）。
演示临时目录 `/tmp/084ce` 已删。

**工单自带的 Validation**：

```text
grep -rn "credential\|account" src/agent_box/server/usage*.py | grep -i "select\|from"  ->  零凭据查询 ✓
python3 -m pytest -q tests/server -k usage  ->  27 passed, 571 deselected in 2.49s
```

**回归计数（同一棵工作树、同一命令，`PYTHONPATH` 见 §1）**：

```text
python3 -m pytest -q                ->  898 passed in 239.53s        （根套件）
python3 -m pytest -q tests/server   ->  598 passed in 213.78s        （083 时为 593；+本单 5）
```

898 = 083 记录的 893 + 本单新增 5 条，**零退化、零 error**。顺带一个第一手事实：083 交回的
`test_opencode_gate_cleanup.py:388` 那 1 个 teardown error **本轮两根套件均未复现**——不声称修好，
只记录它在这两跑里缺席（该 fixture 断言"主仓状态前后逐字节相同"，对本单这种带脏树的运行敏感）。

**尚未做（G2 的诚实边界）**：守卫只覆盖**解析路径的 SQL**（工单 G2 的字面范围）。Worker 侧
`read_usage` 的**文件清单/取字节**不受它约束（那是文件读，不是 SQL）；本单未扩到那里。

## 8 阶段 3 剩余

- 51/53 账行对齐与 084 终态行 ⇒ 阶段 4。
- `kilo`/`opencode`/`dsh`/`qwen` 模板仍未声明 `usageProbe`（沿用"未知"）。
- 现场真库的再观测：本轮**未**重跑（读取他树/用户库不在本单必要面上）；
  51 阶段 A 的现场值以 `eb0c307` 证据为**引用**，本轮把其中逐字抄录的行值钉成了回归测试。

## 9 阶段 4：收口后的账面（本单终态）

- **51 行**：陈旧的"hermes/claude 观测轮 + 其余家 blob 解析待续"改为实况——观测轮两家齐（本文件 §2/§3），
  blob 解析核实自 `eb0c307` 已在树内；**精确剩余**只剩"四家模板未声明 `usageProbe`"（`plugins/**`，越界）。
- **53 行**：其"解析器与观测轮待续"同步更正，并注明聚合面本身未新增（它只消费账本的 usage 列）。
- **084 终态行**：`USAGE_PARSERS_DONE`，三门齐、五条反例、根套件 **898 passed / 0 error**。
  终态取 DONE 而非 PARTIAL 的理由写清楚：工单 G1 的字面断言是"**两家**各有门级一轮"，DoD 的 1–6 全部达成；
  剩余三条都**在门与 DoD 之外**（模板声明＝别的写权、现场库再观测＝本单刻意不做的越界读、轮次归属＝门脚本面）。
- 台账落点：[../../implementation/status.md](../../implementation/status.md) 的「工单 084」小节。
