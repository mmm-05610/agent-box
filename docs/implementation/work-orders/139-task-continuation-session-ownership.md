---
id: "139"
slug: task-continuation-session-ownership
batch: b2
baseline: "58e037c"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "src/agent_box/server/profiles/**", "src/agent_box/server/sessions/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**", "protocols/**", "workers/**"]
ruling: R-0046
terminal: ["SUBAGENT_TASK_OWNERSHIP_DONE", "SUBAGENT_TASK_OWNERSHIP_PARTIAL"]
waive: []
parallel_units: ["ownership-predicates", "ambiguity-determinism", "gate-on-live-continuation", "bounded-turn-read"]
serialize_with: ["092", "120", "121", "122", "126", "127", "130", "131", "133", "134", "135", "136", "137", "138", "140", "141"]
revisions: [{"at": "a10b7c2", "what": "**并入 `AUD-B-029`（confirmed/**high**）**：委派取回子答复用的 `get_session` 窗口**截的是最旧 200 行**（`repository.py:1021` 默认 `event_limit=200`、`:1026-1037` 的 `turns`/`events` 两条查询都是**升序** `LIMIT` ⇒ **截掉最新、留下最旧**），而对照读法 `list_events_page`（`:1145-1160`）用的是 `DESC` 再 `reversed` ⇒ 后果三条：① **长答复被静默截头**（无标记）；② **带 `task_id` 续接必取回空摘要**（实测：库里 213 条事件、`get_session` 只回 200 ⇒ 本轮 3 条 delta 在窗外，真实答复 `ANSWER-PART-1..3` 取回 **`''`**，而 state 是 completed ⇒ 父侧**无从区分「子执行没话说」与「我们把话说丢了」**）；③ **会话轮数超窗必假超时**（`_await_terminal` 在最旧 200 条轮里找子轮终态）。**并入依据＝审阅者自己的批注**（『建议与 021/022/023/028 同批做（同一段 `delegation.py`，分开必互相覆盖）』）——与本单同段代码（`run()`/`_resolve_child_session`/取回链），且 `138` 已吸收 `028`，故本条落在本单。**⚠️ 该并入未生效**：`139` 已在 `0528f1e` 收口（早于本修订 `f44b3af`）⇒ 本单的阶段 6/7 与门 G6/G7/G8 **已移除**（避免「单里有未勾阶段、树里说全」的自相矛盾），内容**改投独立单 `146`**（`agent-box-runtime-round1`）。留此记录以防「同族别分开做」的批注被误读为「必须塞进已收口的单」。", "after_stage": 5, "ruling": "R-0046"}]
---

# Work Order 139 — `task_id` 续接**不校验会话归属**：只比 harness **家族**，不问"这条会话是不是本次被授权的那个子 profile 的"（`AUD-B-021` **confirmed/high**）

## Objective

**来源：后端审阅者 `AUD-B-021`（`confirmed` / **high**）＋ ops 第 131 轮转单（含 ops 对"新错误码 vs 复用"的裁决）。**

审阅者实测：续接处**全库按 `checkpoint_native_id` 找会话**，随后**只拒一次"跨 harness 家族"**，
⇒ **只被授权调 C 的父，可以用 D 的原生句柄把子轮续到 D 的会话**（D 未授权，且其会话在**另一个工作区**）。
**跨家族会拒、跨授权不拒** ⇒ 门禁做成了"**同一家的随便接**"——而合同整句前提是：
**可调用的子＝被授权的那几个 profile** ⇒ 续接是**对某条会话的再执行**，不是对某个"家族"的再执行。

**放大器（同一条 finding）**：`server_sessions.checkpoint_native_id` **无唯一约束** ⇒ 同一原生句柄命中多行时
`fetchone()` 取**行序第一条** ⇒ **续接目标不确定**（不可复现）。

**本单要的是**：把"**这条会话属于本次被授权的那个子 profile**"变成续接的**硬判据**（与名册同一份事实），
并让"句柄歧义"**确定性报错**而不是随机挑行。

**ops 裁决（审阅者在 finding 里点名"两案择一"）**：**取①复用既有码 `SUBAGENT_NOT_AUTHORIZED`**——
**零合同变更**（审阅者亦倾向此条）；**不新造 `SUBAGENT_TASK_NOT_CALLABLE`**（新增错误码属合同增补，须走重锁对表，
`R-0070 ②` 属"留早上/用户"的一档）。

**明确不做**：改 `65` 的合同文字；改 `wire/**`；动 `protocols/**`/`workers/**`；**不给 `checkpoint_native_id` 加唯一索引**（见下"边界"）。

## Current state（一手，`AUD-B-021`）

| 事实 | 出处 |
| --- | --- |
| 续接**全库查** `server_sessions WHERE checkpoint_native_id=?`、**不带** profile/父作用域；随后**只**拿 `owner['harness_type'] != child_profile['harness_type']` 拒一次 | `AUD-B-021`（含复现） |
| 缺的两个判据：`session['profile_id'] == chosen['profileId']`、且该 profile 在**本次父的名册**里 | 同上 |
| 对照（证明门在、射程窄）：**同家族**的已授权 child 去续 ⇒ 放行并返回**未授权 profile D 的会话**；换**别家** ⇒ 立刻 `SUBAGENT_TASK_FAMILY_MISMATCH` | 同上 |
| `server_sessions` 除主键 autoindex **无任何索引** ⇒ `checkpoint_native_id` 无唯一约束 ⇒ 多行时 `fetchone()` 取行序第一条 | 同上 |
| 可达性：`task_id` 是工具**自己回给模型**的句柄 ⇒ 一次委派的返回值即可被下一轮复用，无需外部泄漏 | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 续接（`task_id` 有值分支） | 补**两条硬判据**：① `session.profile_id == 本次选定的 child profileId`；② 该 `profileId` **在本次父的名册里**（`resolve_roster` 的结果即权威名单） | 授权名单与续接判定必须是**同一份事实** |
| 拒绝形态 | **复用既有 `SUBAGENT_NOT_AUTHORIZED`**（类型化、不静默降级） | 零合同变更（ops 裁决，见 Objective） |
| 歧义（多行命中同一句柄） | **确定性报错**（类型化拒绝，不得随机挑一条、不得 `fetchone()` 取行序第一条） | 不可复现的落点＝缺陷本体 |
| 门 | **必须驱动真委派链**（经 `run_subagent`/工具入口，不直调私有函数）：未授权句柄 ⇒ 拒；歧义句柄 ⇒ 确定性拒；跨家族反例**保持红**；把新判据注释掉 ⇒ 门**必须红** | `OF-14`：门要走真腿 |

**必须保持不变**：**已授权且同 profile** 的续接行为（正例必须仍绿）；既有 `SUBAGENT_TASK_FAMILY_MISMATCH` 反例；
`65` 的合同文字；`wire/**`。

**边界**：
- **唯一部分索引**（`WHERE checkpoint_native_id IS NOT NULL`）＝**schema 变更** ⇒ **不在本单范围**。本单只要求**代码层确定性**（歧义 ⇒ 类型化拒绝）。
  若你一手判断"不加索引就不算修好" ⇒ **不要自己抬 schema**，按 `R-0069` 在 `status.md` 写**解卡入口＝`需用户裁定`**（附判据与代价），我当轮路由进 `handoffs.md`。
- 若修法需要改合同/协议/数据模型 ⇒ **交回 ops**（`R-0070 ②` 属"留早上/用户"的一档）。

## Requirements

### Requirement: 续接是"对某条会话的再执行"，不是"对某个家族的再执行"

#### Scenario: 已授权同 profile 续接（正例，必须保持绿）

**WHEN** 父轮用**本次名册里那个** child profile 的、已授权会话句柄续接
**THEN** 续接成功，落点就是那条会话（可断言）

#### Scenario: 未授权 profile 的句柄

**WHEN** 父轮用**未授权** profile D 的（同家族）句柄续接
**THEN** **类型化拒绝**（复用 `SUBAGENT_NOT_AUTHORIZED`），且**不产生**任何写副作用

#### Scenario: 跨家族（既有反例，必须保持红）

**WHEN** 句柄属别家 harness
**THEN** 维持既有 `SUBAGENT_TASK_FAMILY_MISMATCH`

#### Scenario: 句柄歧义

**WHEN** 两条会话共用同一 `checkpoint_native_id`
**THEN** **确定性**类型化报错（不得随机挑一条、不得取行序第一条）

#### Scenario: 反例（门要能咬）

**WHEN** 把新补的两条归属判据注释掉
**THEN** 本单的门**必须红**

## Stages

- [ ] 1. 观测：一手复现"未授权 profile 的句柄续接成功"＋"歧义句柄取行序第一条"（提交）
- [ ] 2. 补两条归属硬判据（复用既有码）（提交）
- [ ] 3. 歧义 ⇒ 确定性类型化拒绝（提交）
- [ ] 4. 门：正例 ＋ 未授权反例 ＋ 歧义反例 ＋ 跨家族保持 ＋ 注释掉必须红（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 归属判据 | 未授权 profile 的句柄 ⇒ 类型化拒绝 | 注释掉判据必须门红 | fail (typed) |
| G2 名册同源 | 判定用的是 `resolve_roster`（本次父的名册），不是全库 | 换成"任意 profile 存在"即视为放行 ⇒ 门红 | fail (typed) |
| G3 歧义确定性 | 多行命中 ⇒ 确定性类型化报错 | 退回 `fetchone()` 取行序第一条 ⇒ 门红 | fail (typed) |
| G4 真链 | 门经 `run_subagent` 真入口驱动 | 直调私有函数 ⇒ 门红 | fail (typed) |
| G5 既有反例保持 | 跨家族仍 `SUBAGENT_TASK_FAMILY_MISMATCH` | 该反例变绿 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现（未授权续接 ＋ 句柄歧义）· 2. 两条归属判据（复用既有码）· 3. 歧义确定性拒绝 · 4. 门（五条，含"注释掉必须红"）· 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`SUBAGENT_TASK_OWNERSHIP_DONE`
- 否则：`SUBAGENT_TASK_OWNERSHIP_PARTIAL` + 精确剩余

## Notes for the executor

- **排序：插队（high，授权/边界缺陷）** ⇒ 与 `138`/`140`/`141` **同一段代码**（`delegation.run()` / `_resolve_child_session`），
  按 `serialize_with` **逐单串行、逐单提交**；**不要**把四张单的函数体改动混在一个提交里（审阅者建议"四条合成一张单"，
  ops 选择拆开以便**分档追踪**，代价用串行化消掉）。
- **归批**：审阅者点名这与已投的 **`132` 号'同一事实只允许一处记账'** 对账门同族（新亚型＝**授权名单 vs 续接时的归属判定**）
  ⇒ 在收口里写明这一亚型，供 `132` 的通用判据吸收。
- **前提待验**（`OF-02`）：引自 `AUD-B-021`（含复现）；第一步自己复核。
