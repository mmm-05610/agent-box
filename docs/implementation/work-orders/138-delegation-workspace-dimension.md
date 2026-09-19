---
id: "138"
slug: delegation-workspace-dimension
batch: b2
baseline: "8fe7aa1"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "src/agent_box/server/profiles/**", "plugins/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**", "protocols/**", "workers/**"]
ruling: R-0046
terminal: ["DELEGATION_WORKSPACE_DIMENSION_DONE", "DELEGATION_WORKSPACE_DIMENSION_PARTIAL"]
waive: []
parallel_units: ["workspace-axis", "gate-on-live-delegation"]
serialize_with: ["092", "120", "121", "122", "126", "127", "130", "131", "133", "134", "135", "136", "137", "139", "140", "141"]
---

# Work Order 138 — 委派**根本没有工作区这一维**：子轮落到"子 profile 最近动过的会话"的工作区（`AUD-B-020` **confirmed/high**）

## Objective

**来源：后端审阅者 `AUD-B-020`（`confirmed` / **high**）＋ ops 第 131 轮转单。**

审阅者实测：**子轮被放到"子 profile 最近一次动过的会话"所在的工作区**——**可以是完全另一个项目**；
而 **建授权**与**选名册**两处**都没有** `65:83` 要求的「**默认只允许同工作区**」判据，
**名册连合同点名的「工作区」字段都不发** ⇒ **一次关于项目 A 的对话，可以让子代理写进项目 B**，且**落点随时漂移**。

⇒ 这是**授权/边界**缺陷（不只是显示）：它是**"用户授权范围"与"实际写入位置"脱钩**。

**本单要的是**：把**工作区**变成委派的**一维**（授权、名册、放置三处同源），并让"跨工作区"**必须显式**（默认拒绝或显式授权之一，写清依据）。

**明确不做**：改 `65` 的合同文字（本单是**执行**它）；改 `wire/**`（方法集）；动 `protocols/**`/`workers/**`。

## Current state（一手，`AUD-B-020`）

| 事实 | 出处 |
| --- | --- |
| 子轮放到"子 profile 最近动过的会话"的工作区；建授权与选名册**都无**同工作区判据 | `AUD-B-020`（含复现） |
| 名册**不发**合同点名的「工作区」字段 | 同上 |
| 合同依据：`65:83`「默认只允许同工作区」 | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 授权（建授权处） | 加**工作区**这一维（默认＝父轮工作区；跨工作区需**显式**授权/拒绝之一，写清依据） | 授权范围必须含"能写哪" |
| 名册（选名册处） | 发合同点名的**工作区**字段；选择时按它过滤 | 名册是授权的可见面 |
| 放置（子轮落点） | **由授权的那个工作区决定**，不再按"最近动过的会话"推断 | 落点不许漂移 |
| 门 | **必须驱动真委派链**：父轮在项目 A ⇒ 子轮落 A；构造"跨工作区"请求 ⇒ 按选定语义**显式拒绝或显式授权**（可断言）；反例：退回"最近动过的会话"⇒ 门**必须红** | `OF-14`：门要走真腿 |

**必须保持不变**：同工作区内的既有委派行为；`65` 的合同文字；`wire/**`。
**边界**：若修法需要改合同/协议/数据模型 ⇒ **交回 ops**（那属"留早上/用户"的一档，`R-0070 ②`）。

## Requirements

### Requirement: 工作区是授权的一维

#### Scenario: 同工作区

**WHEN** 父轮在项目 A 发起委派且授权未含其它工作区
**THEN** 子轮**落在 A**（可断言），与"最近动过的会话"无关

#### Scenario: 跨工作区

**WHEN** 请求要写到另一个工作区
**THEN** **显式**（按选定语义拒绝，或要求显式授权）；**不许**静默落到别处

#### Scenario: 反例（门要能咬）

**WHEN** 把放置退回"子 profile 最近动过的会话"
**THEN** 本单的门（驱动真委派链）**必须红**

## Stages

- [ ] 1. 观测：一手复现"子轮落到别的工作区"（含名册缺字段）（提交）
- [ ] 2. 授权加工作区维 ＋ 名册发字段（提交）
- [ ] 3. 放置由授权决定（不再推断）（提交）
- [ ] 4. 门：同工作区正例 ＋ 跨工作区显式化 ＋ 反例（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 落点由授权定 | 父 A ⇒ 子落 A（与最近会话无关） | 退回推断必须门红 | fail (typed) |
| G2 跨区显式 | 跨工作区请求被显式拒绝/授权（可断言） | 静默落别处 ⇒ 门红 | fail (typed) |
| G3 名册含字段 | 名册发合同点名的「工作区」字段 | 缺字段 ⇒ 门红 | fail (typed) |
| G4 真链 | 门驱动真委派链（不是直调私有函数） | 直调 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现（含名册缺字段）· 2. 授权工作区维 ＋ 名册字段 · 3. 放置由授权定 · 4. 门（正/跨/反例）· 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`DELEGATION_WORKSPACE_DIMENSION_DONE`
- 否则：`DELEGATION_WORKSPACE_DIMENSION_PARTIAL` + 精确剩余

## Notes for the executor

- **排序：插队（high，边界缺陷）** ⇒ 与 `135`/`137` 同档，先于 `126`；**它和 `139`/`140`/`141` 是同一天的同一片**（同一段 `delegation.run()`／`_resolve_child_session`）⇒ 按 `serialize_with` **逐单串行、逐单提交**，别把四张单的函数体改动混进一个提交（审阅者建议"四条合成一张单"；ops 选择拆开以便**分档追踪**，代价用串行化消掉）。
- **ops 对审阅者"两案请 I 裁"的裁决（`R-0070 ①`）**：**取字面实现那一案**——`65:83` 原文是「**默认作用域：只允许同工作区的 profile**」，
  照它的字面做：**落点＝父轮工作区**、名册发 `workspace` 字段、按父工作区筛候选。**不取**"跨工作区时类型化拒绝
  （`SUBAGENT_WORKSPACE_MISMATCH`）"这一案——那等于把 `:83` 的『**默认**』读成**可覆盖**，属**产品语义** ⇒ 按 `R-0070 ②` **留给用户**（已记入 `bulletin` 的"要用户拍的"清单，一句话可决策，**不阻塞本单**）。
- **若你判断"跨工作区该不该允许"必须由用户定才走得下去** ⇒ **不要自己定**：按 `R-0069` 在 `status.md` 写**解卡入口＝`需用户裁定`**，我当轮路由进 `handoffs.md`（`handoffs.md` 已建）。
- **前提待验**（`OF-02`）：引自 `AUD-B-020`（含复现）；第一步自己复核。
