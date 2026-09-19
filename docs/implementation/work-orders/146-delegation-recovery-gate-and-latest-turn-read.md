---
id: "146"
slug: delegation-recovery-gate-and-latest-turn-read
batch: b2
baseline: "0528f1e"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "src/agent_box/server/profiles/**", "src/agent_box/server/sessions/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**", "protocols/**", "workers/**"]
ruling: R-0046
terminal: ["DELEGATION_RECOVERY_GATE_AND_LATEST_READ_DONE", "DELEGATION_RECOVERY_GATE_AND_LATEST_READ_PARTIAL"]
waive: []
parallel_units: ["recovery-gate", "roster-availability", "latest-turn-read", "gate"]
serialize_with: ["092", "120", "121", "122", "126", "127", "130", "131", "133", "134", "135", "136", "137", "138", "140", "141", "142", "144"]
---

# Work Order 146 — 委派链**绕过 `PROFILE_RECOVERY_REQUIRED` 门** ＋ roster 的「不可用」是装饰 ＋ 取回窗口**截最旧 200 行**（`AUD-B-031`/`AUD-B-032`/`AUD-B-029`）

## Objective

**来源：后端审阅者第 89/90 轮三条发现（`AUD-B-031` **confirmed/medium**、`AUD-B-032` **confirmed/low**、`AUD-B-029` **confirmed/high**）＋ ops 第 137 轮转单。**

**为什么合成一张单**（判据，不是图省事）：三条**同段代码、同一判据、审阅者各自都写了"同批做"**——
`031` 与 `032` 是**同一个洞的两头**（门被绕 ↔ 门后的"不可用"维度没供给），审阅者明写"与 `AUD-B-031` 同一批做最省（同一处代码、同一个判据）"；
`029` 的取回链与它们同在 `delegation.py`（`_await_terminal`/`_final_message`/`_create_child_turn`）。
**⚠️ 一条留史说明**：`029` 原本被并入 **已收口的 `139`**（我的错——单已 `0528f1e` 收口，我 `f44b3af` 才加阶段）⇒ 我已把 `139` 复原（阶段 6/7 与门 G6/G7/G8 **移除**）并**改投本单**。
⇒ **教训**：**"同族别分开做"不等于"塞进已收口的单"**；收口后新发现一律新开单。

## Current state（一手，三条 finding）

| 事实 | 出处 |
| --- | --- |
| **委派绕过既有门**：既有链在两处**无条件拒** `recovery_pending` 并回 **409 `PROFILE_RECOVERY_REQUIRED`**（`repository.py:195` accept_intent、`:600` create_turn）；而 `delegation.py:103-104` **只挡 `archived_at`**，`validate_run_arguments`（`subagents.py:178-266`）里**没有 recovery 这一项**；且 `delegation.py:277-286` **自己 `INSERT INTO server_turns`**（`_create_child_turn`）⇒ `:600` 那道 409 **永不触发** | `AUD-B-031` |
| **可达性（非脏数据）**：`repository.py:645-676` `seal_interrupted_turns` 对**全部** active 轮生效、**跨会话** ⇒ 重启时正在跑的子轮被封成 `unknown/SERVER_RESTART_INTERRUPTED` 并给它的 profile 打 `recovery_pending=1` | 同上 |
| **状态永不清**：`117` 号已承认**无清除入口** ⇒ 一次重启后该 profile **对用户永久不可用、对父模型永久可用** | 同上 |
| **roster 的"不可用"是装饰**：`subagents.py:65` 形参 `availability` 的**全仓调用者只有两个**（`delegation.py:69-71` `list_for`、`:88-90` `run`），**都不传** ⇒ `available` **恒 True**、`reason` **恒 None**；实测喂进带 `recovery_pending=1` 的 profile 仍 `{available: true, reason: null}`；`validate_run_arguments` 里"带内联可选项"那段**今天不可达** | `AUD-B-032` |
| **取回窗口截最旧**：`repository.py:1021` `get_session(..., event_limit: int = 200)`（默认 200，**全仓无人传别的值**），`:1026-1037` 的 `turns`/`events` **两条查询都是升序 `LIMIT`** ⇒ **截掉最新、留下最旧**；对照正确读法 `list_events_page`（`:1145-1160`）用 `ORDER BY seq DESC` 再 `reversed` | `AUD-B-029` |
| **三后果**：① 长答复被**静默截头**（无标记）；② 带 `task_id` 续接**必取回空摘要**（实测 213 条事件只回 200、真实答复 `ANSWER-PART-1..3` 取回 **`''`**、state 仍 `completed` ⇒ 父侧无从区分「子执行没话说」与「我们把话说丢了」）；③ 会话轮数超窗 ⇒ **假超时** | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 委派建轮前的门 | 在 `delegation.run()` 的 `archived` 检查旁**加 `recovery_pending` 拒绝**（类型化 `SUBAGENT_UNAVAILABLE`，理由 inline），**或**在 `_create_child_turn` 的 `INSERT` 前复查 | `65:102`「子执行走**既有执行链**」⇒ 同一条门必须同一条链生效 |
| roster 的可用性 | 二选一：**① 真的喂**（把子 profile 的可判定事实注进 `availability`——至少 `archived`／`recovery_pending`／harness 未装配三类）；**② 删掉**这个恒真的形参与随之不可达的分支 | 别给后续验收留一个**恒真门**（与 `AUD-B-011`「声明有、发射点为零」同类） |
| 取回链 | 改按「**本轮、最新**」读：复用 `list_events_page` 的 `DESC`+反转，或新增 `turn_events(turn_id, after)`；**不再读会话快照的列表** | 合同声明的上界是 `MAX_SUMMARY_CHARS`=**4096**（有界＝**摘要**），实测上界却是「会话事件表前 200 行」这个**未声明的内部窗口** |
| `get_session` 窗口语义 | **定死**：要么明确返回「最近 N 条」并**两处查询一起改 `DESC`**，要么**去掉列表**、在文档里写死「只可用作标量读取」 | 别让下一个消费者再踩 |
| 门 | 三条各有会红的断言（见 Gates），且**反例自证**（注释掉即红） | `OF-14`：门要走真腿 |

**必须保持不变**：既有链那两处 409 的行为（本单是让委派**也**走它）；`117` 的 recovery 语义；其它 roster 字段；`wire/**`。

**边界**：
- **`recovery_pending` 的清除入口**（`117` 已承认没有）＝**另一件事**（本单只做"门生效"这一半）⇒ 若你判断"没有清除入口就不算修好" ⇒ 在 `status.md` 写明并**交回 ops**（那可能属产品语义 ⇒ `R-0070 ②` 留用户），**不要**在本单顺手发明一个清除入口。
- 若修法需要改合同/协议/数据模型 ⇒ **交回 ops**。

## Requirements

### Requirement: 委派走**同一条**执行链门；roster 的可用性要么有供给、要么删掉；取回读**最新**

#### Scenario: 重启后委派被拒（正例，`AUD-B-031`）

**WHEN** 用 `seal_interrupted_turns` 封一条子轮（⇒ 该 profile `recovery_pending=1`）后再委派
**THEN** **类型化拒绝**（`SUBAGENT_UNAVAILABLE` 或同义），且 **`server_turns` 行数不增**

#### Scenario: roster 说得清（正例，`AUD-B-032`）

**WHEN** 名册里含带 `recovery_pending`／已归档／harness 未装配的子 profile
**THEN** 该条 `available=false` 且 `reason` 是**类型码**（**或**形参与分支已删除——二选一，写清选哪支）

#### Scenario: 单轮答复超窗（正例，`AUD-B-029`）

**WHEN** 子轮 delta 数 > 窗口
**THEN** summary **要么完整、要么带合同声明的截断标记**（**不得静默**）

#### Scenario: 续接取回非空（正例，`AUD-B-029`）

**WHEN** 同一子会话**第二次**带 `task_id` 续接
**THEN** 取回的 summary **非空**（当前必空）

#### Scenario: 反例（门要能咬）

**WHEN** 分别把 ① recovery 拒绝 ② availability 供给 ③ 最新读法 **注释掉**
**THEN** 对应门**必须红**

## Stages

- [ ] 1. 观测：三条一手复现（含 `seal_interrupted_turns` 真入口触发 ＋ roster 实测 ＋ 213 条事件取回 `''`）（提交）
- [ ] 2. `AUD-B-031`：委派过 recovery 门（类型化拒绝）（提交）
- [ ] 3. `AUD-B-032`：availability 真供给 **或** 删形参（二选一，写清）（提交）
- [ ] 4. `AUD-B-029`：取回按「本轮、最新」读 ＋ `get_session` 窗口语义定死（提交）
- [ ] 5. 门与反例（三处"注释掉必须红"）（提交）
- [ ] 6. 账与证据（含"recovery 清除入口属另一件事"的边界声明）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 委派过 recovery 门 | 封印后委派 ⇒ 类型化拒绝且 `server_turns` 不增 | 注释掉拒绝 ⇒ 门红 | fail (typed) |
| G2 与既有链同源 | 同 profile、同库下，**两条路径给出同一答案**（既有链 409 / 委派拒绝） | 两者不一致 ⇒ 门红 | fail (typed) |
| G3 availability 有据 | `available=false` ＋ 类型码 reason（或形参已删） | 仍恒 True 且未删 ⇒ 门红 | fail (typed) |
| G4 取回按本轮读 | delta 数 > 窗口 ⇒ 完整或带截断标记（不静默） | 改回读快照前 200 行 ⇒ 门红 | fail (typed) |
| G5 续接非空 | 第二次续接 summary 非空 | 仍空 ⇒ 门红 | fail (typed) |
| G6 窗口语义定死 | `get_session` 列表语义明确；机检：`grep -rn 'get_session' src/agent_box/server/execution/delegation.py` 后仍读 `events`/`turns` 的位点为 **0** | 留模糊语义 ⇒ 门红 | fail (typed) |
| G7 真链 | 门经 `run_subagent` 真入口驱动 | 直调私有函数 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现三条 · 2. `031` 门生效 · 3. `032` 二选一落地 · 4. `029` 最新读法 ＋ 窗口语义 · 5. 门与反例 · 6. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`DELEGATION_RECOVERY_GATE_AND_LATEST_READ_DONE`
- 否则：`DELEGATION_RECOVERY_GATE_AND_LATEST_READ_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：`031` 是 **medium 但属"授权/边界"**（同一 profile 对用户不可用、对父模型可用）⇒ 与 `138`/`139`/`140`/`141` 同档；本单**整张**做完再动 `126`。
- **`132` 的两个新亚型（请收口时点名）**：① **「门在多条路径上必须同源」**（既有链拒、委派不拒 ＝ `031`）；② **「同一行里关于『哪份配置/哪个窗口』的多个字段必须同源」**（`029` 的窗口方向 ＋ `138` 并入的 `028` 账本两栏）。
- **前提待验**（`OF-02`）：三条均引自审阅者一手（含行号与实测输出）；第一步自己复核。
