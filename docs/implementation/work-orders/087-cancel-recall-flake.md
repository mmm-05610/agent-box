---
id: 087
slug: cancel-recall-flake
batch: b2
baseline: "4c32992"
depends_on: []
write_paths: ["src/agent_box/**", "tests/**", "docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["plugins/**", "/home/maoqh/projects/agent-box-server-round1/**"]
ruling: R-0002
terminal: ["CANCEL_RECALL_FLAKE_DONE", "CANCEL_RECALL_FLAKE_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 087 — G8 取消/召回间歇（067 记录在案的维护债）

## Objective

067 复跑时记录：**45-G8（取消后仍连续）在本轮 run1 失败、run2 通过**——run1 的**召回流为空**，
根因未定位。间歇性失败不能只记一笔：本单要么**定位并修**，要么给出**有界且可复现的边界说明**
（在什么条件下必然发生、如何避免）。两种结果都算过，**但必须有证据**，不许写"未复现"了事。

## Current state

- 067 提交 `460781c` 记录：run1 空召回、run2 通过；当时记为新维护债
- 相关面：本机通道的取消传播 + 会话续接（45-G8 的语义：取消后仍连续）

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 复现脚本 | 连续 N 轮取消+召回，统计空召回率 | 让它可复现 |
| `src/agent_box/**` | 定位根因并修（若可定位） | 消除间歇 |
| 账与证据 | 45 行注记 + 证据 | 收口 |

- 若 N 轮全绿但历史上出现过：给出**当时的日志差异**与"何时可能再发生"的判据，并加**观测**（不假装已修）
- 零真实模型调用

## Requirements

### Requirement: 让间歇可判定

#### Scenario: 连续复跑

**WHEN** 连续跑 N≥20 轮"取消 → 召回"
**THEN** 报告给出成功率、失败样本的**原始日志片段**，以及（若修了）修前后的对比

### Requirement: 修不了就给出边界

#### Scenario: 反例

**WHEN** 无法定位
**THEN** 报告写明"在何种时序/负载下出现"的判据与观测手段，并把 45-G8 的结论保持为**部分覆盖**

## Stages

- [ ] 1. 复现脚本 + N 轮统计（提交）
- [ ] 2. 根因定位或边界判据（提交）
- [ ] 3. 修（若定位）+ 复跑 + 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 可复现 | N≥20 轮的统计与失败样本日志 | 只写"未复现"即失败 | fail (typed) |
| G2 诚实 | 修了就贴修前后；没修就贴边界判据 | 修前修后不对比即失败 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "cancel or recall"
git diff --check && git status --short
```

## DoD

1. 实现：复现脚本（+ 修复若有）。2. 反例：G1。3. 真实环境：N 轮真跑。4. 回归：套件计数。
5. 账务：零调用。6. 账：45 行注记 + 本单终态行。

## Acceptance

- 绿：`CANCEL_RECALL_FLAKE_DONE`；否则 `CANCEL_RECALL_FLAKE_PARTIAL` + 判据与观测手段
