---
id: "130"
slug: sidecar-process-tree-reaping
batch: b2
baseline: "f4a0756"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**"]
ruling: R-0046
terminal: ["SIDECAR_PROCESS_TREE_REAPING_DONE", "SIDECAR_PROCESS_TREE_REAPING_PARTIAL"]
waive: []
parallel_units: ["session-leader", "gate"]
serialize_with: ["068", "069", "070", "072", "080", "081", "088", "090", "091", "092", "093", "094", "095", "096", "100", "102", "106", "107", "108", "109", "110", "111", "114", "116", "120", "121", "122", "126", "127"]
---

# Work Order 130 — 本地/验收用的 sidecar 启动器**收不掉进程树**：harness 进程变孤儿继续跑（`AUD-B-013` confirmed/medium）

## Objective

**来源：后端审阅者 `AUD-B-013`（`confirmed` / medium）＋ ops 第 120 轮转单。**

审阅者实测：`LocalProcessLauncher` **不带 `start_new_session`**，而 `close()` 的 `wait → terminate → kill` 阶梯**只作用在直接子进程**上
⇒ **sidecar 自己 spawn 的 harness 进程变成孤儿继续跑**。这违反既定不变式"**收得掉进程树**"（审阅者引 `40:35`），
而且**在验收现场直接可见**：一轮结束后机器上还挂着 harness 进程（后面的窗口/端口/数据根都可能被污染）。

**本单要的是**：本地/验收路径的 sidecar **确实收得掉整棵进程树**（会话/进程组层面），并让"收得掉"**被门咬住**（不是靠人 `pkill`）。

**明确不做**：改 Worker 侧（跨机）的实现——审阅者的 `AUD-B-014`（生产路径 Windows→Worker 的树回收）是 `needs_validation`，**不在本单**；
改 harness 自身的信号处理；改 `wire/**`。

## Current state（一手，`AUD-B-013`）

| 事实 | 出处 |
| --- | --- |
| `LocalProcessLauncher` 未 `start_new_session`；`close()` 的 `wait→terminate→kill` 只及**直接子进程** | `AUD-B-013`（含复现） |
| 后果：sidecar spawn 出来的 harness 进程成孤儿继续跑（违反"收得掉进程树"不变式） | 同上 |
| 生产路径（Windows→Worker）是否收树＝**未证**（`AUD-B-014` `needs_validation`） | 同上（**不在本单**） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 进程组/会话 | 启动器为子进程建**独立会话/进程组**，`close()` 时对**整组**发信号（阶梯照旧：先温柔后强） | 收树的最小结构改动 |
| 门 | **反例门**：让 sidecar 起一个会 spawn 孙进程的假 harness，`close()` 后断言**孙进程也不在**（按 pid/进程组核实）；退回当前实现 ⇒ 门红 | 让"收得掉"可判定 |
| 残留清理 | 若实现中仍可能出现孤儿 ⇒ 写清**检测与清理**的可跑步骤（不许只写"人工 pkill"） | 验收环境要干净 |

**必须保持不变**：`wait→terminate→kill` 的阶梯顺序与超时；现有 sidecar 的对外行为；跨机路径不动。

## Requirements

### Requirement: 收得掉整棵树

#### Scenario: 孙进程

**WHEN** sidecar 起的假 harness 自己再 spawn 一个孙进程，然后调用 `close()`
**THEN** **孙进程也不在**（本机 `ps`/进程组核实），不是只有直接子进程消失

#### Scenario: 反例（门要能咬）

**WHEN** 把实现退回当前（不带 `start_new_session`、只杀直接子进程）
**THEN** 本单新增的门**必须红**

## Stages

- [ ] 1. 观测：一手复现孤儿（起假 harness + 孙进程，`close()` 后列残留 pid）（提交）
- [ ] 2. 独立会话/进程组 ＋ 整组信号（阶梯不变）（提交）
- [ ] 3. 门：孙进程消失的正例 ＋ 退回必红的反例（提交）
- [ ] 4. 残留检测/清理的可跑步骤 ＋ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 收树 | `close()` 后**孙进程**不在（按 pid/进程组核实） | 退回旧实现必须门红 | fail (typed) |
| G2 阶梯不变 | `wait→terminate→kill` 顺序与超时逐字不变 | 改成先 kill ⇒ 门红 | fail (typed) |
| G3 真进程 | 门用**真进程**（假 harness 可复算），不是 mock | mock ⇒ 门红 | fail (typed) |
| G4 不越界 | 未改跨机路径与 `wire/**`；`needs_validation` 的 `AUD-B-014` 只登记不动手 | 越界 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 孤儿的一手复现（残留 pid 列表）· 2. 独立会话/进程组 ＋ 整组信号 · 3. 门（正例＋反例）· 4. 检测/清理可跑步骤 ＋ 账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`SIDECAR_PROCESS_TREE_REAPING_DONE`
- 否则：`SIDECAR_PROCESS_TREE_REAPING_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：与 `120/122` 同档（**验收环境直接可见**：残留进程会污染后续窗口/端口/数据根）；建议**紧跟 `122`**。
- **`AUD-B-014` 不在本单**：它是 `needs_validation`（生产路径是否收树未被审阅者证明）⇒ 若你在实现中**顺手拿到一手证据**，写进报告即可（别改跨机实现）。
- **前提待验**（`OF-02`）：引自 `AUD-B-013`；第一步自己复核。
