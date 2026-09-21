---
id: "128"
slug: wire-seq-numbering-spaces
batch: b2
baseline: "1753f6f"
depends_on: []
write_paths: ["src/agent_box/server/wire/**", "src/agent_box/server/sessions/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0046
terminal: ["WIRE_SEQ_SPACES_DONE", "WIRE_SEQ_SPACES_PARTIAL"]
waive: []
parallel_units: ["numbering", "gate"]
serialize_with: ["068", "069", "070", "072", "080", "081", "082", "083", "084", "085", "086", "087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "124", "125", "129"]
---

# Work Order 128 — wire 帧上的 `seq` 在**两个数字空间**之间来回跳：4 类真产帧事件不参与编号（`AUD-B-010` confirmed/medium）

## Objective

**来源：后端审阅者 `AUD-B-010`（`confirmed` / medium）＋ ops 第 120 轮转单。**

审阅者实测：**4 个会真实产帧的事件种类**——`thought.delta`、`plan.updated`、`mode.updated`、`usage.updated`——**不参与 `wire_seq` 编号**，
于是同一批帧上的 `seq` 在**两个数字空间**之间来回跳。⇒ **按 `seq` 排序或去重的客户端会丢掉正文与工具卡**（错序/误判重复）。
这与 `server.hello` "漏报 37 法"是**同族**：**声明面与实际面不一致**。

**本单要的是**：`seq` 语义**唯一**——要么**所有**产帧事件都参与同一编号空间，要么把**为什么有两套**写清并让客户端**可判定地分辨**（并有门咬住）。

**明确不做**：改 `server.hello` 的方法集（那是另一族）；改事件种类集合本身；改客户端（桌面线）。

## Current state（一手，`AUD-B-010`）

| 事实 | 出处 |
| --- | --- |
| 4 类真产帧事件（`thought.delta`/`plan.updated`/`mode.updated`/`usage.updated`）不参与 `wire_seq` 编号 ⇒ `seq` 在两套数字空间跳跃 | `AUD-B-010`（含复现） |
| 后果：按 `seq` 排序/去重的客户端丢正文与工具卡 | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `seq` 编号 | 让**所有**产帧事件参与**同一**编号空间（默认路）；**或**——若确有两套——让客户端**可判定地分辨**（两个显式字段/命名空间），并把依据写清 | 一个字段不许有两种含义 |
| 门 | **反例门**：构造"两类事件交替到达"的序列，断言客户端按文档口径排序/去重**不丢帧**；把编号退回当前实现 ⇒ 门必须红 | 让"不丢帧"被咬住 |
| 报告 | 写清客户端**应该**怎么排序/去重（一页可执行口径） | 客户端现在写不出正确逻辑 |

**必须保持不变**：既有事件的种类与载荷；`server.hello` 的方法集；`wire/**` 之外的边界。

## Requirements

### Requirement: `seq` 只有一个含义

#### Scenario: 交替到达不丢帧

**WHEN** `thought.delta`/`plan.updated`/`mode.updated`/`usage.updated` 与正文/工具帧交替到达
**THEN** 客户端按单里写明的口径排序/去重后**不丢任何帧**（正文与工具卡齐全）

#### Scenario: 反例（门要能咬）

**WHEN** 把编号退回当前实现（4 类不参与）
**THEN** 本单新增的门**必须红**

## Stages

- [ ] 1. 观测：一手复现"两套数字空间"（列出每类事件的编号行为与一次交替序列的 `seq` 取值）（提交）
- [ ] 2. 归一（或给出可判定的两套口径 ＋ 依据）（提交）
- [ ] 3. 门：交替序列不丢帧（反例：退回即红）＋ 客户端口径一页（提交）
- [ ] 4. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 不丢帧 | 交替序列按口径排序/去重后零丢失 | 退回旧实现必须门红 | fail (typed) |
| G2 单义（或可判定） | `seq` 单一含义，或有显式可分辨的两套命名空间 + 依据 | 一个字段两种含义 ⇒ 门红 | fail (typed) |
| G3 真 wire | 门驱动**真实帧序列**（不是直调编号函数） | 直调 ⇒ 门红 | fail (typed) |
| G4 不越界 | 未改事件种类/载荷与 `server.hello` 方法集 | 越界 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现（交替序列的 seq 取值表）· 2. 归一或可判定两套 · 3. 门（含反例）＋ 客户端口径一页 · 4. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`WIRE_SEQ_SPACES_DONE`
- 否则：`WIRE_SEQ_SPACES_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：排在 `123/124/125` 之后、`103` 之前（同属 wire 面，且它直接决定**客户端能否正确显示**）。
- **前提待验**（`OF-02`）：审阅者已给复现；第一步自己复核。若你发现"两套空间其实是刻意的"，**交回**并附依据（`R-0032 ⑤`）。
