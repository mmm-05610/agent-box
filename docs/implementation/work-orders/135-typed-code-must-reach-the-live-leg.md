---
id: "135"
slug: typed-code-must-reach-the-live-leg
batch: b2
baseline: "5f2ea2b"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "src/agent_box/server/sessions/**", "src/agent_box/work_core/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**", "protocols/**", "workers/**"]
ruling: R-0032
terminal: ["TYPED_CODE_ON_LIVE_LEG_DONE", "TYPED_CODE_ON_LIVE_LEG_PARTIAL"]
waive: []
parallel_units: ["preserve-code", "gate-on-live-leg"]
serialize_with: ["068", "069", "070", "072", "080", "081", "088", "090", "091", "092", "093", "094", "095", "096", "100", "102", "106", "107", "108", "109", "110", "111", "114", "116", "120", "121", "122", "126", "127", "130", "131", "133", "134"]
---

# Work Order 135 — 类型化码必须走到**真出去的那条腿**：`EXECUTION_FAILED` 泛码吞掉了 `CREDENTIAL_NOT_AVAILABLE`（`120` 的真机复算仍红，**第 4 次同形**）

## Objective

**来源：A 的第 3–4 次真机复算（`A-轮4`，`d8fba5a`；`t6-e2e-chain.md` 轮 4）＋ ops 第 126 轮转单。**

`120` **在它自己的射程内做对了**（代码在分支里：`storage/secrets.py:28-34` 的 `SecretLocatorUnavailable(code="CREDENTIAL_NOT_AVAILABLE")`、`bootstrap/runtime.py:855`），
它自己的门 G1–G3 也绿。**但 A 在更晚的树上真机复算 3/3 稳定，读到的仍是泛码**：

```
{"kind":"execution.state","state":"failed","reason":"EXECUTION_FAILED"}   # executions.list 里也不含 CREDENTIAL_NOT_AVAILABLE
```

**A 的读法（它明确说是读法、不是断言执行者错）**：类型化发生在 `secrets.py`/`runtime.py` 那两层（**日志里确实有** `RuntimeError: CREDENTIAL_NOT_AVAILABLE`），
但**真发出去的那条腿**在 `work_core/services.py:206-217` 被包成 `DispatchAmbiguous`——那里的消息是
`message = f"{type(exc).__name__}: {exc}"[:256]` ⇒ **类型化码只剩"文本"**，到 `execution.state` 再被收成通用码。
⇒ **门测的是低层，用户看的是高层**。（A 点名：同一形状今天已在 `101/098/117/120` 上出现**四次**。）

**本单要的是**：把类型化码**结构性地**带到**用户能看到的那条腿**（`execution.state.reason`），并且**门必须驱动那条腿**。

**明确不做**：改 Worker 契约（另一条审批链）；改 `wire/**`；把泛码删掉（**真正未知**的失败仍该是泛码）；凭据内容进任何消息（`R-0011`/`R-0032 ⑤`）。

## Current state（一手：`120` 的收口行 ＋ A 的 3/3 真机 ＋ ops 逐行读源码）

| 事实 | 出处 |
| --- | --- |
| 类型化**已落地在本层**：`SecretLocatorUnavailable`（`code="CREDENTIAL_NOT_AVAILABLE"`）＋ `port_factory` 在读失败处 `raise RuntimeError("CREDENTIAL_NOT_AVAILABLE")` | `storage/secrets.py:28-34`、`bootstrap/runtime.py:848,855` |
| 120 的门 G1–G3 绿（**在那一层**） | `120` 收口行（runtime status 行 1206） |
| **真腿被包成泛码**：`except Exception` ⇒ `message = f"{type(exc).__name__}: {exc}"[:256]` ⇒ `DispatchAmbiguous` | `work_core/services.py:206-217`（ops 实读） |
| **A 的真机 3/3**：`{"state":"failed","reason":"EXECUTION_FAILED"}`；`executions.list` 不含具名码；0 真调用 | `d8fba5a`；`docs/acceptance/e2e-runs/a-e2e-runtime-probe.json`（`head=de8d8f1`） |
| 同形已 4 次：`101/098/117/120` ⇒ **"实现有门、门只走一条腿"** | A 的轮 4 读法 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 包装点（`work_core/services.py` 一族） | 把上游异常里的**类型化 code 结构化保留**（例：`DispatchAmbiguous`/`DispatchFailed` 带 `code` 或被 `_safe_code` 一路认出来），**不许**只把码拼进字符串再丢 | 码进了文本＝等于丢了 |
| 结果/转录路径 | `execution.state.reason`（用户看到的那条腿）在"缺凭据"情形给出**具名码** `CREDENTIAL_NOT_AVAILABLE`；`executions.list` 同样能看到 | A 的判据 G2 |
| 门 | **必须驱动真腿**：`accept → dispatch → outcome → execution.state/转录`（可复用 A 的探针形态或等价夹具）；**反例**：把包装退回字符串化 ⇒ 门红 | 这是本单存在的理由（"门只走一条腿"） |
| 未知失败 | 真未知 ⇒ 仍给泛码 `EXECUTION_FAILED`（**不许**把所有失败都改叫具名码） | 别把泛码的价值也丢掉 |
| 报告 | 把"低层绿/高层红"的**层次图**画清楚（哪一层产生码、哪一层吞掉） | 让第 5 次不再发生 |

**必须保持不变**：`DispatchAmbiguous`/`DispatchFailed` 的既有语义与调用方；真正未知失败的泛码；消息里**零凭据内容**（只 id）；Worker 契约与 `wire/**`。
**边界**：若修复需要动 `wire/**` 或 `protocols/**` ⇒ **交回 ops**（前者属 A 线、后者属审批后的合同单）。

## Requirements

### Requirement: 具名码走到真腿

#### Scenario: 缺凭据

**WHEN** 在执行链上因"凭据 locator 取不到"而失败（A 的一次性数据根形态）
**THEN** 用户可见的那条腿（`execution.state.reason` ／ `executions.list`）给出**具名码** `CREDENTIAL_NOT_AVAILABLE`，**不是**泛码

#### Scenario: 反例（门要能咬）

**WHEN** 把包装退回"字符串化 + 泛码"的形态
**THEN** 本单新增的门（**驱动真腿**的那条）**必须红**

### Requirement: 未知失败仍是泛码

#### Scenario: 真未知

**WHEN** 失败原因不在已知词表内
**THEN** 仍是 `EXECUTION_FAILED`（不许滥发具名码）

### Requirement: 零凭据内容

#### Scenario: 消息

**WHEN** 读失败消息/日志
**THEN** 只有**不敏感 id**（凭据 id/execution id），**零 key 内容、零文本化凭据**

## Stages

- [ ] 1. 观测：一手复现"低层具名／高层泛码"（含分级读源码：`secrets.py`→`runtime.py`→`work_core/services.py`→`execution.state`）（提交）
- [ ] 2. 结构化保留 code（包装点改造；消息仍给人读）（提交）
- [ ] 3. 真腿到 `execution.state`/`executions.list`（提交）
- [ ] 4. 门：驱动真腿（accept→…→state）＋ 反例（退回字符串化必红）＋ 未知失败仍泛码（提交）
- [ ] 5. 层次图报告（哪层产生/哪层吞掉）＋ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 真腿具名 | 缺凭据 ⇒ `execution.state.reason` ＝ `CREDENTIAL_NOT_AVAILABLE` | 退回字符串化必须门红 | fail (typed) |
| G2 门走真腿 | 门驱动 `accept→…→state`（不是只调低层函数） | 只测低层 ⇒ 门红 | fail (typed) |
| G3 泛码仍在 | 真未知失败 ⇒ 仍 `EXECUTION_FAILED` | 滥发具名码 ⇒ 门红 | fail (typed) |
| G4 零凭据内容 | 消息/日志只有不敏感 id | 出现 key 内容 ⇒ 门红 | fail (typed) |
| G5 层次图 | 报告给出层次图（产生/吞掉各一层） | 缺 ⇒ fail | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现（含分层读源码） · 2. 结构化保留 code · 3. 真腿到 state/list · 4. 门（真腿＋反例＋泛码仍在） · 5. 层次图报告 ＋ 账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`TYPED_CODE_ON_LIVE_LEG_DONE`
- 否则：`TYPED_CODE_ON_LIVE_LEG_PARTIAL` + 精确剩余

## Notes for the executor

- **排序：主路径**（`120` 的真机复算仍红 ⇒ `AQ-0009` 的前置之一；与 `134` 同档，排在 `126` 之前）。
- **A 明确说了它不断言你们错**：低层是对的，**缺的是那条腿**；请把这条当"层次接线"来做，别把它当成"120 没做"。
- **前提待验**（`OF-02`）：行号与 A 的 3/3 现场见 `d8fba5a` 与 `a-e2e-runtime-probe.json`；第一步自己复核（跨树引用可只读）。
