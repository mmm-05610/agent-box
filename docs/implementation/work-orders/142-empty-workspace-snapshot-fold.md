---
id: "142"
slug: empty-workspace-snapshot-fold
batch: c2
baseline: "58e037c"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**", "protocols/**"]
ruling: R-0046
terminal: ["EMPTY_SNAPSHOT_FOLD_DONE", "EMPTY_SNAPSHOT_FOLD_PARTIAL"]
waive: []
parallel_units: ["truthiness-fix", "counter-example-test"]
serialize_with: ["092", "093", "094", "095", "096", "100", "102", "107", "108", "109", "110", "111", "114", "116", "120", "121", "122", "126", "127", "130", "131", "133", "134", "135", "136", "137", "138", "139", "140", "141"]
---

# Work Order 142 — **空快照被折叠成"没有快照"**：`{}` 与 `None` 语义不同，却用真值判断合并（A 线 `B3` 交回的一行修）

## Objective

**来源：A 线执行者第 069 轮一手登记（`docs/server-round1/fullstack/wsl-change-set-observation-069.md:57/74/75`）
＋ A 线 `status.md` 的「阻塞（待人拍）」表 `B3` 行 ＋ ops 第 131 轮 route（`R-0069` ③ 的机检/路由）。**

A 线一手实测的**根因**：`src/agent_box/server/execution/sidecar.py:631-632` 用**真值判断**收快照——

```python
self.workspace_before_snapshot = (
    dict(workspace_before_snapshot) if workspace_before_snapshot else None
)
```

`{}`（**声明过的空工作区**）是 falsy ⇒ 被折叠成 `None`（**没有快照**）。于是 `:893` 的 `if self.workspace_before_snapshot is None`
这条分支把"**合法空快照**"当成"**未声明**"⇒ WSL 通道的变更集**恒 `unknown`**（首轮必现）。
⇒ **两种语句在账上是两件事**，实现却把它们合成一件（`132` 号"同一事实只允许一处记账"的对偶面：**一处记账不允许吞掉两件事**）。

**本单要的是**：**一行修**（真值判断 → `is not None`）＋ **配套测试**（空快照 ＋ 轮内新增文件 ⇒ 变更集应为"全部新增"，当前为 `unknown`）＋ **复跑 069 的观测轮**。

**明确不做**：改 `54` 的合同/声明形状；动 `wire/**`；动 `protocols/**`；**不**顺手把 `:893` 之后的分支语义一起重构（除非复核发现它同样吞事实 ⇒ 在 `status.md` 写明并**交回 ops**，别自行扩大范围）。

## Current state（一手，A 线 069 轮）

| 事实 | 出处 |
| --- | --- |
| 折叠点：`sidecar.py:631-632` 真值判断；`:893` 用 `is None` 分流 ⇒ `{}` 与"未声明"不可分 | `069` 报告 `:57`（A 线一手，含落点行号） |
| 后果：空快照（合法）⇒ 变更集恒 `unknown`（首轮必现） | `069` 报告 `:57/:74` |
| 修法（A 线建议原文）：「`:631-632` 改真值判断为 `is not None`——`{}` 与 `None` 语义不同（前者=空工作区，后者=没有快照）」 | `069` 报告 `:74` |
| 配套测试（A 线建议原文）：空快照 ＋ 轮内新增文件 ⇒ 变更集应为"全部新增"（当前为 `unknown`） | `069` 报告 `:75` |
| 正例证据**不需要会写文件的 harness**（空快照 ＋ 该审计文件即构成真实非空变更集） | `069` 报告 `:78` |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `sidecar.py:631-632` | 真值判断 → **`is not None`**（`{}` 保留为**空工作区**，`None` 才是**没有快照**） | 两种语句在账上必须是两件事 |
| `:893` 之后的分流 | **先复核**它是否仍有同类吞事实；若有 ⇒ 同单内一并修正（并在账里点名）；若涉及语义扩展 ⇒ **交回 ops** | 一行修不等于旁边那一行也对 |
| 测试 | **配套反例/正例**：① 空快照 ＋ 轮内新增文件 ⇒ 变更集＝"全部新增"（**当前为 `unknown`**）；② 未声明快照 ⇒ 仍 `unknown`（**不许把"未声明"也变成"全部新增"**） | 修一边不许碰坏另一边 |
| 复跑 | **复跑 069 的观测轮**（同一套三态探针）并落证据 | 口径以能重复的真机为准 |
| 归批备注 | 在收口里写明：这与 `132` 的对偶面——**"一处记账不允许吞掉两件事"**（供 `132` 的通用判据吸收） | 审阅者/QA 已建的对账门形制 |

**必须保持不变**：真的"没有快照"路径（`None`）的既有行为；`54` 的声明形状与账的既有键；`wire/**`。

**边界**：若复核发现"空工作区"与"未声明"在**上游合同**上本来就不可区分（即 `54` 的声明不允许发空快照）⇒ **交回 ops**（那属合同面，`R-0070 ②` 留给早上/用户），**不要**自己改合同。

## Requirements

### Requirement: 「声明过的空快照」与「没有快照」在账上是两件事

#### Scenario: 空快照（正例）

**WHEN** 声明了**空**工作区快照（`{}`）且轮内新增了一个文件
**THEN** 变更集＝**全部新增**（不再 `unknown`）

#### Scenario: 没有快照（必须保持）

**WHEN** **未声明**快照（`None`）
**THEN** 变更集仍为 `unknown`（既有行为逐字不变）

#### Scenario: 反例（门要能咬）

**WHEN** 把真值判断改回 `if workspace_before_snapshot else None`
**THEN** 本单的门**必须红**（空快照那条回到 `unknown`）

## Stages

- [ ] 1. 观测：一手复现"空快照 ⇒ 变更集 `unknown`"（提交）
- [ ] 2. 一行修（`is not None`）＋ 复核 `:893` 之后是否有同类吞事实（提交）
- [ ] 3. 测试：空快照正例 ＋ 未声明保持 ＋ 注释掉必须红（提交）
- [ ] 4. 复跑 069 观测轮并落证据（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 空快照可判 | 空快照 ＋ 新增文件 ⇒ 变更集＝全部新增 | 改回真值判断 ⇒ 门红 | fail (typed) |
| G2 未声明不变 | `None` ⇒ 仍 `unknown` | `None` 被当成"空工作区"⇒ 门红 | fail (typed) |
| G3 真链 | 门经真 sidecar 收快照路径驱动（不是直调私有函数） | 直调 ⇒ 门红 | fail (typed) |
| G4 复跑 | 069 观测轮可复跑且结论与账一致 | 只写"已修"无复跑 ⇒ 不算过 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现 · 2. 一行修 ＋ 复核 `:893` · 3. 测试（正/保持/反例）· 4. 复跑观测轮落证据 · 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`EMPTY_SNAPSHOT_FOLD_DONE`
- 否则：`EMPTY_SNAPSHOT_FOLD_PARTIAL` + 精确剩余

## Notes for the executor

- **归属说明**：本行原在 A 线 `status.md` 的「阻塞（待人拍）」表 `B3`；A 线自己记的处置是"并入 b2 的 `066-G5` 收尾单（同文件族）一起改"。
  但 `066-G5` 已由 `080` 关闭、且**落点在 `server/execution/**`（本树写面）**⇒ ops 按 `R-0069` 把它**路由到本树**（`bulletin` 第 131 轮的 `H-002`）；**不是催活**，进队即可。
- **排序**：小单（一行修 ＋ 一条测试 ＋ 一次复跑）⇒ **可以在当前阶段边界后插入**，不必等 `126` 全完。
- **前提待验**（`OF-02`）：引自 A 线 069 轮（含行号与建议原文）；第一步自己复核。
