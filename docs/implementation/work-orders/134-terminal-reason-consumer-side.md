---
id: "134"
slug: terminal-reason-consumer-side
batch: b2
baseline: "312be9e"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "src/agent_box/server/sessions/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**", "protocols/**", "workers/**"]
ruling: R-0032
terminal: ["TERMINAL_REASON_CONSUMER_DONE", "TERMINAL_REASON_CONSUMER_PARTIAL"]
waive: []
parallel_units: ["consume-if-present", "gate"]
serialize_with: ["068", "069", "070", "072", "080", "081", "088", "090", "091", "092", "093", "094", "095", "096", "100", "102", "106", "107", "108", "109", "110", "111", "114", "116", "120", "121", "122", "126", "127", "130", "131", "133"]
---

# Work Order 134 — 截断可见的**消费侧**：`stopReason` 到位就用它（缺席安全）＋把 `terminal_reason` 写下去（`122` 交回的剩余）

## Objective

**来源：`122` 的收口交回（runtime `status.md` §工单 122 ＋ 证据 `docs/server-round1/fullstack/truncation-visible-122-stage1.md`）＋ ops 第 125 轮的拆单决定。**

`122` 把它自己的剩余**精确交回**了，一手结论是：

> **执行段手里没有"被截断"这个事实**（不是"有而不说"）——Worker/ACP 完成事件**根本不携带 stop reason**；
> `_complete`（`sidecar_backend.py:539-548`）**无条件** `Outcome.SUCCEEDED` 且把 `run.result` 整块塞 `nativeResult` **从不解析**；
> `complete_turn`（`sessions/repository.py:747`）**不写** `terminal_reason`（该文件在 `122` 的 `write_paths` 外）。
> 而下游**可见通道本就在**：`wire/projection.py:173` `reason = terminal_reason or error_code` ⇒ **只缺上游字段 ＋ 一处写入**。

**ops 拆单（关键）**：把它拆成**消费侧**（本单）与**生产侧**（＝Worker 合同变更，**交 I 落审批**，见公告）：

- **本单（消费侧）**：`_complete` **读到 `run.result` 里的 `stopReason` 就用它**（**缺席安全**：没有该字段时**行为与今天逐字相同**），
  并把非 `end_turn` 的情形经 `complete_turn` 写入 `server_turns.terminal_reason`（**列已存在**：`storage/database.py:125`）＋ 让 `Outcome` **可区分**；配**反例门**（用**合成** `run.result`）。
- **不在本单**：`protocols/worker/v1.schema.json` 与 `workers/**`（**合同变更 ⇒ 审批队列**）；`wire/**`。

**为什么可以现在做**：消费侧**不发明信息**（没有 `stopReason` 就什么都不写 ⇒ 与今天一致），
一旦生产侧落地，`122` 的"可见"**即刻成立**；而"先写一个不存在的值"正是 `R-0032 ⑤` 禁止的**凭空造信息**。

**明确不做**：改 Worker 契约/出字段（审批未过）；改 `wire/**`；把 `122` 的判定改回"有而不说"（一手证据已判"没有"）。

## Current state（一手，`122` 的阶段 1；ops 逐条引用）

| 事实 | 出处 |
| --- | --- |
| 完成语义**无条件** `SUCCEEDED`；`run.result` 整块塞 `nativeResult`、**从不解析** stop reason | `sidecar_backend.py:539-548`（`_complete`） |
| 停止原因词表在 `execution/**`/`sessions/**`/`protocols/worker/**` **零命中** | `122` 阶段 1（`grep stopReason\|stop_reason\|finish_reason\|end_turn\|MAX_TOKENS`） |
| `complete_turn` 只 `UPDATE ... SET state='completed'`，**不写** `terminal_reason` | `sessions/repository.py:747`（写入点 `:785`） |
| 下游可见通道**已在**：`reason = terminal_reason or error_code` | `wire/projection.py:173` |
| `terminal_reason` 列**已存在** | `storage/database.py:125` |
| ACP 既有词表（**不新造**）：`end_turn`/`max_tokens`/`max_turn_requests`/`refusal` | `122` 交回 §2 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `_complete`（执行段） | **读** `run.result` 的 `stopReason`（**缺席 ⇒ 与今天逐字相同**）；非 `end_turn` ⇒ 让 `Outcome` **可区分**（标志或独立终态之一，写清依据） | 消费侧就绪，不等生产侧 |
| `complete_turn`（`sessions/repository.py`） | 把该 reason **写进** `server_turns.terminal_reason`（**列已存在**；null 语义＝"上游没给" ≠ "正常结束"） | 下游 `projection.py:173` 已能透出 |
| 门（反例） | 用**合成** `run.result`：① 带 `stopReason:"max_tokens"` ⇒ `terminal_reason` 被写入且**可区分**；② **不带** `stopReason` ⇒ 行为与今天**逐字相同**（`terminal_reason` 仍空）；把①退回 ⇒ 门红 | 让"消费 + 缺席安全"两条都咬住 |
| 报告 | 写清"生产侧到位后 `122` 的收口剩余几步"（引用 `122` 证据 §3 的四步） | 让 `122` 能即刻收口 |

**必须保持不变**：`stopReason` 缺席时的**全部既有行为**；`Outcome` 既有取值对既有调用方的语义（只**增**可区分标志）；`wire/**`；Worker 契约。
**边界**：`protocols/**`、`workers/**` **禁写**（属审批后的生产侧单）；`wire/**` 属 A 线。

## Requirements

### Requirement: 消费侧就绪且缺席安全

#### Scenario: 上游给了 `max_tokens`

**WHEN** 完成结果的 `run.result` 带 `stopReason="max_tokens"`
**THEN** `server_turns.terminal_reason` 被写入该值（机器可读），且该轮的 `Outcome` **可区分**于正常结束

#### Scenario: 上游没给

**WHEN** `run.result` **不含** `stopReason`（今天的形状）
**THEN** 行为与今天**逐字相同**（`terminal_reason` 仍为空，`Outcome` 不变）

#### Scenario: 反例（门要能咬）

**WHEN** 把"消费 `stopReason`"退回未实现
**THEN** 场景①的门**必须红**

### Requirement: 不发明信息

#### Scenario: 无源不写

**WHEN** 上游没有任何停止原因信号
**THEN** **不写** `terminal_reason`（不许填默认值充当"事实"），报告里明说"等生产侧字段"

## Stages

- [ ] 1. 观测：一手确认今天的完成路径不解析 `run.result`、不写 `terminal_reason`（引 `122` 的行号并自核）（提交）
- [ ] 2. 消费侧实现（读 `stopReason`、缺席安全、`Outcome` 可区分）（提交）
- [ ] 3. `complete_turn` 写入 `terminal_reason`（null 语义写清）（提交）
- [ ] 4. 两条门（合成 `max_tokens` ⇒ 可区分；缺席 ⇒ 逐字不回归）＋ 反例（提交）
- [ ] 5. 报告：生产侧到位后 `122` 的收口剩余（引 `122` 证据 §3）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 消费 | 合成 `stopReason=max_tokens` ⇒ `terminal_reason` 写入且 `Outcome` 可区分 | 退回未实现必须门红 | fail (typed) |
| G2 缺席安全 | 无 `stopReason` ⇒ 既有行为逐字不变（快照/字段级） | 行为变化 ⇒ 门红 | fail (typed) |
| G3 不发明 | 无源时 `terminal_reason` 仍为空（不填默认值） | 填默认值 ⇒ 门红 | fail (typed) |
| G4 不越界 | 未改 `protocols/**`、`workers/**`、`wire/**` | 越界 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手观测（引 `122` 行号） · 2. 消费侧实现（缺席安全） · 3. `terminal_reason` 写入（null 语义） · 4. 两条门＋反例 · 5. 收口剩余报告。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`TERMINAL_REASON_CONSUMER_DONE`
- 否则：`TERMINAL_REASON_CONSUMER_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：**主路径**（`122` 的收口剩余）⇒ 排在 `126` 之前；它**不依赖**生产侧字段（缺席安全 ⇒ 今天就能落地并收口 `122` 的消费半）。
- **生产侧不在你手上**：Worker 契约字段（`protocols/worker/v1.schema.json` ＋ worker 出 `stopReason` ＋ `sidecar.py` 解析 ＋ 三元门 `102` 复算）＝**合同变更**，我已请 I 落审批；**获批后我另开单**给持 `protocols/**`/`workers/**` 的线。
- **前提待验**（`OF-02`）：行号引自 `122` 阶段 1 的一手（它逐层读过）；第一步自己复核。
