---
id: "141"
slug: subagent-timeout-must-stop-not-just-wait
batch: b2
baseline: "58e037c"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "src/agent_box/server/sessions/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**", "protocols/**", "workers/**"]
ruling: R-0046
terminal: ["SUBAGENT_TIMEOUT_STOPS_DONE", "SUBAGENT_TIMEOUT_STOPS_PARTIAL"]
waive: []
parallel_units: ["cancel-before-raise", "error-carries-handle", "gate-on-live-timeout"]
serialize_with: ["092", "120", "121", "122", "126", "127", "130", "131", "133", "134", "135", "136", "137", "138", "139", "140"]
---

# Work Order 141 — `SUBAGENT_TIMEOUT` **只截断等待、不截断执行**：超时抛错时既不取消子轮也不留句柄（`AUD-B-023` **confirmed/medium**）

## Objective

**来源：后端审阅者 `AUD-B-023`（`confirmed` / **medium**）＋ ops 第 131 轮转单（含 ops 对"两案"的裁决）。**

审阅者实测：`_await_terminal` 轮询到 deadline 后**直接 `raise DelegationError('SUBAGENT_TIMEOUT', ...)`**，
**没有任何取消动作**，异常路径上**不再生成返回体** ⇒ 1.00s 后抛 `SUBAGENT_TIMEOUT`，**子轮状态仍是 `running`，全程 0 次 cancel 调用**。
后果：`65:81` 把「单次超时 10 分钟」当作**资源边界**，而**边界下面的子代理继续跑、继续花**，父侧**既拿不到 `task_id` 也无从停它**
⇒「**资源边界的声明**」与「**真的停不停**」**不是同一份事实**。

**同族形状（第 6 例同形）**：能力就在旁边——`sessions/service.py` 的 `cancel_descendants` ＋ `repository.py` 的 `live_child_turn_ids`
（`086` stage 3b 建的）**本可一行调用**；`grep -n cancel delegation.py` **只命中 docstring** ⇒ 取消只在**两个 stop 入口**做，**超时不是 stop 入口**。
（与 `018` 的 `child_limits` 未接线、`013` 的 killpg 同族：**机制有、这一条路径没接**。）

**本单要的是**：超时**先停再报**，且**错误体自带可定位句柄**——两件都要，别只做一件。

**ops 裁决（审阅者在 finding 里点名"两案请 ops 交 I 裁决，别保持现状"）**：
**按字面实现取①＋②的最小部分一起做**，理由＝**这是既有合同文字的直接后果，不是新的产品语义选择**：
- `:81`「单次超时 10 分钟……（**资源边界**）」⇒ **边界必须真的停**，只截断等待就不是边界（`R-0070 ①`：契约**字面**澄清属夜间可自拍）。
- `:90`「类型化……**不静默降级**」⇒ 超时**保持类型化码 `SUBAGENT_TIMEOUT`**，但**不许静默丢事实**：把**已发生的用量**与**可定位句柄**放进拒绝信息（现在连 `turnId` 都不回）。
- 审阅者给的第二案（"若裁定超时不该取消子轮、让它跑完算数"）＝**把 `:81` 的'资源边界'读成可覆盖** ⇒ 那是**产品语义**，
  按 `R-0070 ②` **留给用户**；本单**按②的最小部分（回句柄）一并做掉**，于是**无论将来怎么裁，错误体都已经是可定位的**。
  ⇒ 该语义分歧已记入 `bulletin` 的"**要用户拍的**"清单（低优先，一句话可决策），**不阻塞本单**。

**明确不做**：改 `65` 的合同文字/数值（10 分钟、每轮 ≤4 不动）；改 `wire/**`；动 `protocols/**`/`workers/**`；
不动**两个既有 stop 入口**的取消级联（那是已复核的**正半**，`AUD-B-023` 只打超时路径）。

## Current state（一手，`AUD-B-023`）

| 事实 | 出处 |
| --- | --- |
| 轮询到 deadline ⇒ `raise DelegationError('SUBAGENT_TIMEOUT', ...)`，**无任何取消动作**；异常路径不生成返回体 ⇒ `task_id` 只存在于成功路径 | `AUD-B-023`（含复现） |
| 实测：1.00s 抛 `SUBAGENT_TIMEOUT`，子轮状态仍 `running`，全程 **0 次** cancel 调用 | 同上 |
| `delegation.py` 内 `grep -n cancel` **只命中 `:16` 的 docstring** ⇒ 取消只在两个 stop 入口（`service.py` 的 cancel_turn 递归、`handlers.py` 的 runs_stop） | 同上 |
| 能力就在旁边：`cancel_descendants` ＋ `live_child_turn_ids`（`086` stage 3b）本可一行调用 | 同上 |
| 对照正半（不冤枉这条链）：G3 第三句「取消父 → 子被取消」**是实现的**（两个 stop 入口都级联） | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 超时路径 | **先取消再报错**：抛 `SUBAGENT_TIMEOUT` **之前**取消该子轮（复用既有 `cancel_descendants`／同类既有能力），并把**取消结果**放进拒绝信息 | `:81` 的"资源边界"必须真停 |
| 拒绝体 | **保持类型化** `SUBAGENT_TIMEOUT`，并**必带可定位句柄**（`task_id`/`turn_id`）＋**已发生用量** | `:90` 不静默降级；否则用户"连停的手段都没有" |
| 门 | **必须走真实链路**：子轮不结束 ⇒ 超时后**账上该子轮不得留在 active 态**；超时错误体**必须含可定位句柄**；把"先取消"注释掉 ⇒ 门**必须红** | `OF-14`：门要走真腿 |

**必须保持不变**：成功的委派返回体与既有 `task_id` 语义；**两个 stop 入口的取消级联**；其它类型化码与其触发条件；`65` 的合同文字；`wire/**`。

**边界**：若你一手判断"超时**不该**取消子轮"（＝第二案）⇒ **本单**仍按①做（理由见 Objective：这是 `:81` 的字面后果）；
把那句判断写进 `status.md`（`R-0069` 的解卡入口＝`需用户裁定`）**并继续做**，**不要**因为语义分歧停下整张单。
若修法需要改合同/协议/数据模型 ⇒ **交回 ops**（`R-0070 ②`）。

## Requirements

### Requirement: 超时是**资源边界**，必须真的停；且错误必须自带可定位事实

#### Scenario: 子轮不结束（超时，正例）

**WHEN** 子轮在 deadline 内不结束
**THEN** ① 抛**类型化** `SUBAGENT_TIMEOUT`；② **此前**已取消该子轮；③ 错误体含可定位句柄与已发生用量；
④ 账上该子轮**不再**是 active（可断言）

#### Scenario: 正常结束（必须不变）

**WHEN** 子轮在 deadline 内结束
**THEN** 行为与本单之前**逐字相同**（含成功返回体的 `task_id`）

#### Scenario: 既有 stop 级联（必须保持）

**WHEN** 父轮被 stop／cancel
**THEN** 子轮照旧被级联取消（既有正半不得回归）

#### Scenario: 反例（门要能咬）

**WHEN** ① 把"先取消"注释掉 ② 把句柄从错误体里拿掉
**THEN** 两种情形下本单的门**都必须红**（子轮留在 active 态 / 错误体不可定位）

## Stages

- [ ] 1. 观测：一手复现"超时后子轮仍 running、0 次 cancel、错误体无句柄"（提交）
- [ ] 2. 超时路径先取消再加报错（复用既有能力）（提交）
- [ ] 3. 拒绝体带句柄＋已发生用量（保持类型化码）（提交）
- [ ] 4. 门：正例 ＋ 注释掉必须红 ＋ 句柄缺失必须红 ＋ 既有 stop 级联保持（走真链）（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 超时真停 | 超时后该子轮不在 active 态 | 注释掉"先取消" ⇒ 门红 | fail (typed) |
| G2 码保持类型化 | 仍 `SUBAGENT_TIMEOUT`（不降级、不换泛码） | 退化成泛码 ⇒ 门红 | fail (typed) |
| G3 错误可定位 | 拒绝体含 `task_id`/`turn_id` ＋ 已发生用量 | 缺句柄 ⇒ 门红 | fail (typed) |
| G4 真链 | 门经真委派链（真子轮不结束）驱动 | 直调私有函数/只手插状态 ⇒ 门红 | fail (typed) |
| G5 正半不回归 | 成功路径与既有 stop 级联逐字不变 | 任一漂移 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现 · 2. 超时先取消 · 3. 拒绝体带句柄＋用量（码保持类型化）· 4. 门（五条，含两处"注释掉必须红"）· 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`SUBAGENT_TIMEOUT_STOPS_DONE`
- 否则：`SUBAGENT_TIMEOUT_STOPS_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：medium，但**与 `138`/`139`/`140` 同一段代码**（`delegation.run()` / `_await_terminal`）⇒ 按 `serialize_with` **逐单串行、逐单提交**。
- **归批（审阅者点名）**：这是 `132` 号对账门的新亚型——**『资源边界的声明』与『真的停不停』必须是同一份事实**；
  在收口里写明该亚型，供 `132` 的通用判据吸收（与 `139` 的"授权名单 vs 续接归属"、`136` 的"约束记两处"同族）。
- **前提待验**（`OF-02`）：引自 `AUD-B-023`（含复现）；第一步自己复核。
