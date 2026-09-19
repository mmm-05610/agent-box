---
id: "137"
slug: worker-stop-reason-field
batch: b2
baseline: "3e2241b"
depends_on: [{"order": "134", "condition": "agent-box-runtime-round1 tree：消费侧（读到 stopReason 就用、缺席安全、写 terminal_reason）已落地且门在场"}]
write_paths: ["protocols/worker/**", "workers/**", "src/agent_box/server/execution/**", "src/agent_box/work_core/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**"]
ruling: R-0064
terminal: ["WORKER_STOP_REASON_FIELD_DONE", "WORKER_STOP_REASON_FIELD_PARTIAL"]
waive: []
parallel_units: ["schema-and-worker", "sidecar-parse", "gate-102-recompute"]
serialize_with: ["092", "120", "121", "122", "126", "127", "130", "131", "133", "134", "135", "136"]
---

# Work Order 137 — **Worker 契约加 `stopReason`**（`AQ-0013` **已获批**，`R-0064`）：生产侧字段 ＋ 解析 ＋ 三元门 `102` 复算

## Objective

**来源：`122` 的字段需求交回 ＋ **`AQ-0013` 经用户批准（`R-0064`）** ＋ ops 第 129 轮派单。**
（`R-0055` 当时**刻意不动** Worker schema；本条是**获批后**才动的那一侧——两件事互为对照。）

`122` 一手判定「**执行段手里没有'被截断'这个事实**」：Worker/ACP 完成事件**不带 stop reason**，
于是 `122` 只能落 `PARTIAL`。字段需求（`122` 证据 §2）是：

- **需要什么**：Worker→Server 的 turn 完成结果（`run.result`，ACP `PromptResponse` 形）带**机器可读的 `stopReason`**，
  值取 **ACP 既有枚举**（`end_turn` / `max_tokens` / `max_turn_requests` / `refusal`）——**不是新造词**；
- **谁消费**：Server 侧 `_complete` 读到 `stopReason != end_turn` ⇒ 经 `complete_turn` 写 `server_turns.terminal_reason`
  （**列已存在**：`storage/database.py:125`）⇒ `wire/projection.py:173` 的 `reason` 已能透给客户端（**下游无需新字段**）；
- **影响面**：Worker 控制合同变更（`protocols/worker/v1.schema.json` ＋ `workers/**` 出字段 ＋ `sidecar.py` 解析 ＋ **三元门 `102` 复算**）。

**消费侧已另派 `134`**（读到就用、缺席安全、无源不写）⇒ **本单只做生产侧**；两单合起来 `122` 才能收口为"可见"。

**明确不做**：改 ACP 的枚举值（**只落字段，不新造词**）；把 `PROTOCOL_VERSION` 语义与既有字段改名；
**不许**绕开两道已知守卫（`test_the_control_protocol_is_named_in_both_sources` 与 `Bootstrap(deny_unknown_fields)`）——见下 Gates。

## Current state（一手）

| 事实 | 出处 |
| --- | --- |
| 完成事件不带 stop reason（`trunc/stop/finish/max/cap` 键 **0 个**） | `122` 阶段 1 ＋ A 的 T6-4 键扫描 |
| 字段需求（要什么／给谁／影响哪张单）已写清 | `docs/server-round1/fullstack/truncation-visible-122-stage1.md` §2 |
| 消费侧已派 | 本单 `depends_on`（`134`） |
| `R-0055` 当时**不动** schema 的理由：会撞两道守卫（`deny_unknown_fields` 与两源命名守卫） | `R-0055` 原文（本条获批正是为了正面处理它们） |
| 三元门 `102`（Worker 协议漂移：op 枚举/正例/三元门）在本树队列 | 章程 §3 表（`102`） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `protocols/worker/v1.schema.json` | 在**完成结果**上**增** `stopReason`（枚举＝ACP 既有四值；**只增不改**，不动既有字段/版本语义） | 字段是"事实位"，不是新协议 |
| `workers/**`（出字段） | 完成时把**真实**的 stop reason 填进去（因输出上限被砍 ⇒ `max_tokens`；正常 ⇒ `end_turn`）——**不许猜** | 上游必须真的量出来 |
| `sidecar.py`（解析） | 把该字段**结构化**带进 `_complete` 的消费路径（与 `134` 约定一致） | 消费侧 `134` 已就位 |
| 三元门 `102` | **复算**（op 枚举/正例/三元门随字段变化重跑并记账） | 合同变了，门必须跟上 |
| 两道守卫 | ① `test_the_control_protocol_is_named_in_both_sources` ② `Bootstrap(deny_unknown_fields)`：**逐条确认不破**；若必须动 ⇒ **交回 ops**（附一线证据） | `R-0055` 点名的风险点 |

**必须保持不变**：ACP 枚举词表；既有字段与 `PROTOCOL_VERSION` 的语义；`wire/**`（下游无需新字段）；消费侧 `134` 的缺席安全语义。
**边界**：若改动溢出到 `wire/**` 或桌面合同 ⇒ **交回 ops**（那会触发两仓重锁链）。

## Requirements

### Requirement: 字段落地且是真的

#### Scenario: 被上限砍断

**WHEN** 一轮因**输出上限**被砍断
**THEN** 完成结果里的 `stopReason` ＝ **`max_tokens`**（不是 `end_turn`、不是缺失）

#### Scenario: 正常结束

**WHEN** 一轮正常结束
**THEN** `stopReason` ＝ `end_turn`（且 `134` 的消费侧**不写** `terminal_reason`）

#### Scenario: 反例（门要能咬）

**WHEN** 把 `stopReason` 从 schema/worker 里去掉（退回今天的形状）
**THEN** 本单的门（**驱动真腿**：worker → sidecar → `_complete`）**必须红**

### Requirement: 两道守卫不破

#### Scenario: 守卫

**WHEN** 跑 `test_the_control_protocol_is_named_in_both_sources` 与 `Bootstrap(deny_unknown_fields)` 相关测试
**THEN** **全绿**（新增字段**不**触发 `deny_unknown_fields`）；若结构性冲突 ⇒ 交回 ops 附证据

### Requirement: 门在真腿上

#### Scenario: 全链

**WHEN** 读门
**THEN** 至少一条门驱动 **worker 输出 → sidecar 解析 → `_complete` 判定** 的**真链**（不许只测 schema 或只测解析函数）

## Stages

- [ ] 1. 观测：一手确认今天"完成事件无 stop reason"（引 `122` §2 并自核）＋ 列两道守卫的现状（提交）
- [ ] 2. schema 增字段（只增）＋ worker 真的填值（提交）
- [ ] 3. `sidecar.py` 解析进消费路径（与 `134` 对齐）（提交）
- [ ] 4. 门：真链（`max_tokens` / `end_turn` 两向）＋ 反例（去掉字段必红）（提交）
- [ ] 5. **三元门 `102` 复算** ＋ 两道守卫逐条确认 ＋ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 真值 | 上限砍断 ⇒ `stopReason=max_tokens`；正常 ⇒ `end_turn` | 去掉字段／填错值必须门红 | fail (typed) |
| G2 真链 | 门驱动 worker→sidecar→`_complete` 的链 | 只测 schema/函数 ⇒ 门红 | fail (typed) |
| G3 守卫不破 | 两源命名守卫 ＋ `deny_unknown_fields` 全绿 | 任一红 ⇒ 门红（或已交回 ops） | fail (typed) |
| G4 元门复算 | `102` 的三元门随字段复算并入账 | 未复算 ⇒ fail | fail (typed) |
| G5 只增不改 | 既有字段/枚举/版本语义逐字不变 | 改名/删字段 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手观测 ＋ 守卫现状 · 2. schema ＋ worker 真值 · 3. sidecar 解析 · 4. 真链门（含反例）· 5. 元门 `102` 复算 ＋ 守卫确认 ＋ 账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`WORKER_STOP_REASON_FIELD_DONE`
- 否则：`WORKER_STOP_REASON_FIELD_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：与 `135` 同档（**主路径的最后一格**：`134` 消费侧 ＋ 本单生产侧 ⇒ `122` 才能收口）；`depends_on` 只要 `134` 的消费语义在位即可开工（不必等它收口）。
- **获批背景**：`R-0055` 当初**刻意不动** schema；本单是**获批后**正面处理它点名的两道守卫——所以**守卫的红不是"你写错了"，而是要如实交回**。
- **不许猜值**：`stopReason` 必须是 worker **真的**观测到的（拿不到 ⇒ 交回，别填默认值）。
- **前提待验**（`OF-02`）：字段需求引自 `122` 证据 §2；第一步自己复核。
