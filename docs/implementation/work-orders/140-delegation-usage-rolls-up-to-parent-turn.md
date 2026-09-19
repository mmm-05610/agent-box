---
id: "140"
slug: delegation-usage-rolls-up-to-parent-turn
batch: b2
baseline: "58e037c"
depends_on: []
write_paths: ["src/agent_box/server/usage_aggregate.py", "src/agent_box/server/execution/**", "src/agent_box/server/sessions/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**", "protocols/**", "workers/**"]
ruling: R-0046
terminal: ["DELEGATION_USAGE_PARENT_ROLLUP_DONE", "DELEGATION_USAGE_PARENT_ROLLUP_PARTIAL"]
waive: []
parallel_units: ["rollup-read-side", "root-declaration", "gate-no-double-count"]
serialize_with: ["092", "120", "121", "122", "126", "127", "130", "131", "133", "134", "135", "136", "137", "138", "139", "141"]
---

# Work Order 140 — 委派的**用量/费用不落到父轮**：聚合按 session 算，而子轮按设计跑在**另一条会话**里（`AUD-B-022` **confirmed/medium**）

## Objective

**来源：后端审阅者 `AUD-B-022`（`confirmed` / **medium**）＋ ops 第 131 轮转单（含 ops 对"两条实现口径"的裁决）。**

审阅者实测：**一个用了委派的对话只报父轮自己那点数**——同一时刻父侧聚合 **110 tokens**，而子轮带着
`parent_turn_id=t-parent` 烧掉 **9500**。`65:78`／`:113 G3` 要求「**子执行的用量/费用记到发起它的那一轮**（接 `51`/`53` 的账）」，
**这一条没落地**。而同一行合同的另外两句（审批上浮、取消级联）**都实现了**（`AUD-B-024`/`AUD-B-025` 均为 rejected，两轮复核）
⇒ 这不是"归属这件事设计上没做"，而是**被漏了的那一条**。

**同一条 finding 的反证强度（不是审阅者扩大射程）**：`repository.py:881-893` 的 `live_child_turn_ids`
**能**按 `parent_turn_id` 找到子轮（`086` stage 3b 为取消除建的），但 `grep -rn live_child_turn_ids src/`
**只有 `cancel_descendants` 一处命中** ⇒ **归属这一维没人用**：能力有、接线无。

**本单要的是**：**把子轮用量并入父轮账**（聚合根＝父轮），并把**聚合根**写成显式声明；
**不许双计**（同一份 token 既算父轮又单算一份）。

**ops 裁决（审阅者在 finding 里点名"两条实现口径请 I 选一"）**：**取读侧口径**——
在 `usage_aggregate` 里**沿 `parent_turn_id` 收子会话的 completed 轮**并入父轮；
**不取**"子轮终态时把用量累加登记到父轮的一条归属记录"（那是**写侧改写**：动到**已落库事实的语义** ⇒ `R-0070 ②` 属"留早上/用户"的一档）。
判据：`65:78` 说的是**归到发起它的那一轮**＝**记账根**问题；读侧并账是它的**字面实现**（也是**收紧**：账从"少记"变"记全"），
而写侧改写会引入"同一事实两处存"的新面（正是 `132` 号对账门要治的形状）。

**明确不做**：改 `65` 的合同文字；改 `wire/**`（投影形状属 A 树）；动 `protocols/**`/`workers/**`；改 `51`/`53` 既有列与既有记账契约。

## Current state（一手，`AUD-B-022`）

| 事实 | 出处 |
| --- | --- |
| 聚合谓词只按会话收：`WHERE session_id IN (...) AND state='completed' AND usage_input_tokens IS NOT NULL`，**不看 `parent_turn_id`** | `AUD-B-022`（含复现） |
| 子轮用量只在**成功返回体**里读一次当工具结果回给模型 ⇒ 那是**展示**不是记账；台账里子轮始终只属于子会话 | 同上 |
| 账本**能**按 `parent_turn_id` 找子轮（`live_child_turn_ids`），但**只有 `cancel_descendants` 用** | 同上 |
| 实测：父侧聚合 **110** tokens vs 同一时刻子轮 **9500** | 同上 |
| 不是罕见角落：子轮会话的工作区/归属本就与父不同（`_shared_workspace_id`）⇒ **只要发生一次跨会话委派，父侧账就少记** | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 聚合（读侧） | 父轮/父会话的账**并入**其子轮（沿 `parent_turn_id`，含**多级**：子轮还可能再委派） | `65:78` 的字面实现 |
| 聚合根 | 在代码与文档里**显式声明聚合根＝父轮**（父轮聚合值＝父自身 ＋ 其所有后代中 completed 轮的用量） | "根"不说清＝下一轮还会再挖一遍 |
| 双计 | **禁止双计**：同一条 completed 轮在父根下**只计一次**；根与叶**不得**各自成一份账再相加 | `132` 号的形制 |
| 门 | **必须驱动真链**（真建父子会话并落 completed 轮，不是手插聚合入参）：父聚合值**必须含**子轮 tokens；把并账接线注释掉 ⇒ 门**必须红**；双计反例 ⇒ 门红 | `OF-14`：门要走真腿 |

**必须保持不变**：不经委派的会话账（父＝自身，数值逐字不变）；子轮**自己**的账仍可查（不在本单禁止）；
`51`/`53` 既有列与既有记账契约；`wire/**`。

**边界**：若修法需要**改已落库事实的语义**、**改投影/`wire` 形状**、或**抬 schema** ⇒ **交回 ops**
（`R-0070 ②` 属"留早上/用户"的一档）；按 `R-0069` 在 `status.md` 写**解卡入口＝`需用户裁定`**（附判据与代价）。

## Requirements

### Requirement: 子执行的用量记在**发起它的那一轮**上

#### Scenario: 一次委派（正例）

**WHEN** 父轮委派子轮，子轮跑到 completed 并产生用量
**THEN** **父轮**的聚合用量**包含**子轮那部分（可断言），子轮自身的账仍在且不重复相加

#### Scenario: 多级委派（正例）

**WHEN** 子轮再委派孙轮
**THEN** 父轮聚合值包含**全部后代**（沿 `parent_turn_id` 递归），且每条 completed 轮**只计一次**

#### Scenario: 无委派（必须逐字不变）

**WHEN** 一条会话从不委派
**THEN** 其账与本单之前**逐字相同**

#### Scenario: 反例（门要能咬）

**WHEN** ① 把并账接线注释掉 ② 故意把子轮既并进父根又单列一份相加
**THEN** 两种情形下本单的门**都必须红**（父聚合值回落 / 双计被咬）

## Stages

- [ ] 1. 观测：一手复现"父侧 110 vs 子轮 9500"（提交）
- [ ] 2. 读侧并账（沿 `parent_turn_id`，含多级）＋ 显式声明聚合根（提交）
- [ ] 3. 无委派路径逐字不变（回归钉住）（提交）
- [ ] 4. 门：正例 ＋ 多级 ＋ 双计反例 ＋ 注释掉必须红（走真链）（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 父根含子 | 父聚合值含子轮 tokens | 注释掉并账 ⇒ 门红 | fail (typed) |
| G2 多级 | 含全部后代，逐条只计一次 | 只收一层 ⇒ 门红 | fail (typed) |
| G3 不双计 | 根与叶不重复相加 | 双计夹具 ⇒ 门红 | fail (typed) |
| G4 无委派不变 | 不经委派的账逐字不变 | 数值漂移 ⇒ 门红 | fail (typed) |
| G5 真链 | 门经真建会话/真落 completed 轮驱动 | 手插聚合入参 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现（110 vs 9500）· 2. 读侧并账 ＋ 聚合根显式声明 · 3. 无委派逐字不变 · 4. 门（五条，含双计与注释掉）· 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`DELEGATION_USAGE_PARENT_ROLLUP_DONE`
- 否则：`DELEGATION_USAGE_PARENT_ROLLUP_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：medium，但**与 `138`/`139`/`141` 同一张 usage 账／同一段 `delegation.run()`** ⇒ 按 `serialize_with` **逐单串行、逐单提交**。
- **不要**顺手把"展示用的用量回读"（`delegation.py:140-155` 的 `_usage_of`）当成记账一并改掉——那是返回给模型的工具结果，属另一件事；
  本单只动**账**。若你判断两者必须一起动才自洽 ⇒ 在 `status.md` 写明并**交回 ops**（不许自行扩大范围）。
- **前提待验**（`OF-02`）：引自 `AUD-B-022`（含复现）；第一步自己复核。
