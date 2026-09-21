---
id: "119"
slug: load-independent-counter-example
batch: b2
baseline: "bca77821fac530133d19a48bedea1d3f02969116"
depends_on: []
write_paths: ["tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "release/**"]
ruling: R-0054
terminal: ["LOAD_INDEPENDENT_COUNTER_EXAMPLE_DONE", "LOAD_INDEPENDENT_COUNTER_EXAMPLE_PARTIAL"]
waive: []
parallel_units: ["determinism", "gate"]
serialize_with: ["115", "117", "118"]
---

# Work Order 119 — `080` 的反例门不许把"绿不绿"交给机器忙闲（`QA-011`，墙钟判据）

## Objective

**来源：`QA-011`（confirmed / 低 / 测试自身的稳定性）＋ ops 第 111 轮转单。**

`tests/server/test_first_run_lock.py::test_without_the_gate_the_same_first_runs_overlap` 是 `080` 的**反例门**（"拆掉守卫 ⇒ 同样的两次首跑就会重叠"），
但它用**墙钟区间是否相交**当判据 ⇒ **机器一忙，两个区间就不重叠**，断言 `assert False` ⇒ **假红**。
**同一条件在不同负载下给出相反结论 ⇒ "绿不绿"被交给了调度器**，这正好破坏 `R-0054 ⑦`（负载策略）想保住的东西：我们得能相信门。

**本单要的是**：反例**仍然要能咬**（falsifiable），但判据**只由被测对象决定**，不由机器忙闲决定。

**明确不做**：放宽或删掉这条反例（`R-0033 ①`：每门必须有反例）；改被测门 `080` 的语义；改别的门。

## Current state（一手，ops 核过）

| 事实 | 出处 |
| --- | --- |
| 反例门用墙钟间隔演示"没有守卫 ⇒ 重叠" | `tests/server/test_first_run_lock.py:180`（`test_without_the_gate_the_same_first_runs_overlap`，docstring 自述"the same shape overlaps when the gate is not there"） |
| **隔离跑两次 5 passed**（114 s / 132 s）；**加 8 个 busy loop 后同文件 1 failed, 4 passed**（109 s） | `QA-011` 的对照实验（触发器确定、可复现；归因落 `docs/qa/env-attribution.md`） |
| 该门是 `080` 的反例腿，`080` 属本树（A） | manifest `080` → `agent-box-env-provider`（`FIRST_RUN_LOCK` 系） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 反例的判据 | 改成**与负载无关**的形态（例：由被测对象自己的**共享状态/闩锁**决定"是否重叠"，或直接断言"没有守卫时两次首跑**进入同一临界区**"这一类**结构性**事实） | 判据只能由被测对象决定 |
| 可复现性 | 门里写清**怎么复现假红历史**（把 8 个 busy loop 那条实验写成可跑命令或注释，留作回归证据） | 让"曾经假红"成为可核对的事实 |
| 反例强度 | 反例**仍必须**在"拆掉守卫"时红（不能因为改判据而变弱） | `R-0033 ①` |

**必须保持不变**：被测门 `080` 的语义与正向断言；该文件的其它用例；不引入 sleep-based 的新判据。

## Requirements

### Requirement: 判据与负载无关

#### Scenario: 忙时不假红

**WHEN** 在机器高负载（或人为注入 busy loop）下跑该反例
**THEN** 结果与空闲时**一致**（都是 pass），判据不依赖墙钟间隔

#### Scenario: 反例仍能咬

**WHEN** 把守卫拆掉（或退回旧实现）
**THEN** 该反例**必须红**

### Requirement: 假红历史可复现

#### Scenario: 可复算

**WHEN** 按单里给的命令制造负载
**THEN** 能得到与 `QA-011` 一致的历史观测（或在报告里写明为何该形态已不可能复现）

## Stages

- [ ] 1. 观测：复现两种负载下的相反结论（一手，记计数与耗时）（提交）
- [ ] 2. 判据改成与负载无关（结构事实而非墙钟）（提交）
- [ ] 3. 反例强度复核（拆守卫必红）+ 假红历史的可复现说明（提交）
- [ ] 4. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 不假红 | 高负载下与空闲时结论一致（pass） | 退回墙钟判据必须门红 | fail (typed) |
| G2 仍可咬 | 拆掉守卫 ⇒ 该反例红 | 反例变弱（拆守卫仍绿）必须门红 | fail (typed) |
| G3 无新 sleep | 新判据不含 `sleep`/墙钟间隔依赖 | 引入即门红 | fail (typed) |
| G4 回归 | 该文件其它用例与既有计数不变 | 任一变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server/test_first_run_lock.py -q
python3 -m pytest tests/server -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现两种负载结论 · 2. 判据与负载无关 · 3. 反例仍能咬 · 4. 假红历史可复算 · 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`LOAD_INDEPENDENT_COUNTER_EXAMPLE_DONE`
- 否则：`LOAD_INDEPENDENT_COUNTER_EXAMPLE_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：低优先——排在今晚队列（`087 → 115/117 → 118 → 103 → 099 → 089`）**之后**，不插队。
- **前提待验**（`OF-02`）：行号与实验数字引自 `QA-011`，第一步自己复核。
