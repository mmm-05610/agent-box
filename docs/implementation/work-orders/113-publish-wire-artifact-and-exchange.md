---
id: "113"
slug: publish-wire-artifact-and-exchange
batch: b2
baseline: "4ac8263"
depends_on: []
write_paths: ["docs/server-round1/**", "scripts/server-round1/**", "tests/**", "src/agent_box/server/wire/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "release/**"]
ruling: R-0032
terminal: ["WIRE_ARTIFACT_PUBLISHED_DONE", "WIRE_ARTIFACT_PUBLISHED_PARTIAL"]
waive: []
parallel_units: ["publish","generation-rule","stale-copy"]
revisions: [{"at": "6df2213", "what": "修订 v2（ops \u7b2c 118 \u8f6e\uff09\uff1a\u628a 092 \u4ea4\u56de\u7684 ② \u5408\u5e76\u8fdb\u672c\u5355\uff08\u751f\u6210 wire-v1 schema/\u5de5\u4ef6 + \u4e24\u4ed3\u91cd\u9501\uff09\uff0c\u5e76\u70b9\u540d\u684c\u9762\u4fa7\u6d88\u8d39\u8005\uff08P28 \u91cd\u751f\u6210\uff09\uff1bG7 \u6750\u6599\u5df2\u5907\u3002", "after_stage": 0, "ruling": "R-0032"}]
---

# Work Order 113 — 后端发布 64 方法工件 + 两仓交换本体 + 定生成/比较口径 + 替换本树旧副本（AQ-0008，用户选 1）

## Objective

**来源：R-0032 ④（AQ-0008 用户选 1）**：把"合同工件"这件事**一次性做对**，四处一起：

1. **后端发布 64 方法工件**（后端自己的生成物，随本树提交，带摘要）；
2. **两仓交换本体**——把"谁的本体是权威"讲清楚并把两边的本体对齐（前端 settings 树的重锁对已登记，见公告第 58 轮：TS `58d61ebb…` / 工件 `c4255b31…`）；
3. **定生成/比较口径**——工件怎么生成、怎么比较、门的入口参数怎么写（**门必须显式指路径**，不得默认读某棵树里的副本）；
4. **替换本树旧副本**——后端树里那份停在 57 号单时代的 `docs/server-round1/fullstack/generated/wire-v1.schema.json`（33 方法，`a1bd52a4…`）**必须**被替换或改名带日期，消除"当前工件"的暗示。

**背景（审阅者 AUD-B-003，confirmed/low）**：那份副本零消费者、事件面仍真，但路径名 `generated/` 诱导误用；未来的门一旦把它当当前工件喂给 `AGENT_BOX_WIRE_SCHEMA`，schema 结论只覆盖 33/64 且**全绿**——正是假绿形状。

## Current state（第一手，审阅者与调度者）

| 事实 | 出处 |
| --- | --- |
| 后端树 `docs/server-round1/fullstack/generated/wire-v1.schema.json`：sha256 `a1bd52a4…`，#params **33** 方法，最后触碰 `391b76b`（57 号单时代） | AUD-B-003 |
| 权威对（当前）：TS `58d61ebb…` / 工件 `c4255b31…`（settings 树 `ed6592b7` 登记；我复算相符） | 主树 status 第 58 轮 |
| 门今天的入口：`AGENT_BOX_WIRE_SCHEMA` 环境变量（`tests/server/test_wire_v1.py:118-127`）；**全树无代码指向那份旧副本** | AUD-B-003 |
| 后端 handler 方法集 = 64 | 097/101/105 的账 |


## 修订 v2（2026-09-19 21:1x，ops；`at` = `6df2213`，**after_stage 0**）

**新依据**：`092` 收口（runtime `6df2213`，终态 `PROVIDER_REGISTRY_PARTIAL`）把它的**精确剩余 ②** 明确交回：
"**生成 wire-v1 schema/工件 ＋ P28 重生成 ＋ 两仓重锁（G7 材料已备：见 wire-review 092 节）**"。
这与**本单**（发布 64 方法工件 ＋ 两仓交换本体 ＋ 定生成/比较口径 ＋ 替换本树旧副本）是**同一件事**（`R-0032 ④`／`AQ-0008` 的口径）
⇒ **按 §2c「合并重复」并入本单，不要两处各做一遍**。

**修订加的（只加两件，不改原 4 阶段）**：
- **吸收 `092` 的 ②**：本单的工件生成要把 `092` 立下的 **canonical 词汇**（runtime 侧 `execution/protocols.py` 是单一真相）与**六家 `wire_protocols` 声明**纳入工件口径；
  并在报告里**逐条引用 `092` 的 wire-review 节**（G7 材料），说明"工件里哪一段对应它的哪一条"。
- **点名桌面侧消费者**：工件/口径发布后，**桌面 settings 线**要据此**重生成**（其 `P28` 上下文）——本单负责**把可判定的触发写清**（工件 sha／摘要对），
  **不替它生成**（跨树只读）。触发写法：把"哪份工件、哪个摘要、settings 侧要重生成什么"写成一行可核对的事实，供 `P28` 引用。

**修订回执（`README §3.5b`）**：纳入后在下一个阶段提交信息或本树 status 记一行「已纳入 work order 113 修订 @<sha>」。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 后端工件 | 生成并提交**后端自己的** 64 方法工件（脚本 + 摘要 + 方法数），落点避开 `generated/` 的旧暗示（或用日期后缀） | 有本体可交换 |
| 旧副本 | 替换/改名/删除那份 33 方法的副本，并在原位置留一行说明（"权威在桌面树 + 当前摘要"） | 消除假绿入口 |
| 生成/比较口径 | 写进 `docs/server-round1/wire-review.md`：生成命令、比较命令、门必须显式指路径、摘要在哪登记 | 一处规则 |
| 交换 | 与桌面 settings 线对表：两边本体摘要一致（**跨树只读核验**，不写对方树） | 两仓一致 |

**必须保持不变**：wire 方法集与形状（本单**不**改协议）；既有门的语义（只把入口参数讲清楚）。
**明确不做**：改 wire；改前端合同（那是 settings 线的写面）；把 33 方法的副本"改成 64"却不换名字（那仍是同一陷阱）。

## Requirements

### Requirement: 后端有本体

#### Scenario: 生成与提交

**WHEN** 跑本单给的生成命令
**THEN** 得到 64 方法工件 + 摘要，且**随本树提交**（脚本与产物都在）

### Requirement: 旧副本不再冒充当前

#### Scenario: 替换/改名

**WHEN** 看 `docs/server-round1/fullstack/generated/`（或其替代位置）
**THEN** 不再有一份**无声**停在 33 方法、却长得像"当前工件"的文件；原位置有一行说明指向权威与当前摘要

### Requirement: 口径唯一

#### Scenario: 门

**WHEN** 任何门要校验 schema
**THEN** 它**显式**指向一个路径（`AGENT_BOX_WIRE_SCHEMA=<path>`），且规则写在 `wire-review.md` 的同一节里；**不得**默认读某棵树里的副本

### Requirement: 两仓一致

#### Scenario: 对表

**WHEN** 比较后端工件与桌面 settings 树登记的工件
**THEN** 摘要一致（不一致 ⇒ 交回调度者，不自行改对方树）

## Stages

- [ ] 1. 观测：旧副本的消费者与门的入口（一手复核）（提交）
- [ ] 2. 后端工件生成 + 提交（提交）
- [ ] 3. 旧副本替换/改名 + 说明（提交）
- [ ] 4. 口径写进 `wire-review.md` + 与桌面树对表（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 本体 | 生成命令可复跑，产物 64 方法、摘要稳定（两次一致） | 两次摘要不同 ⇒ 门红 | fail (typed) |
| G2 旧副本 | 不再有冒充当前的 33 方法副本；原位置有说明 | 原样留着 ⇒ 门红 | fail (typed) |
| G3 口径 | `wire-review.md` 写明生成/比较/入口参数三件事 | 缺一 ⇒ 门红 | fail (typed) |
| G4 两仓 | 与桌面 settings 树登记的工件摘要一致 | 不一致且未交回 ⇒ 门红 | fail (typed) |
| G5 不越界 | wire 方法集/形状零改动；不写另两棵树 | 触碰 ⇒ 门红 | fail (typed) |

## Validation

```bash
# 生成与比较（把本单脚本的实际命令写在这里，可复跑）
python3 scripts/server-round1/<本单新增的脚本> --print-digest
python3 -m pytest -q tests/server -k "wire"
git diff --check && git status --short
```

## DoD

1. 本体 · 2. 旧副本处置 · 3. 口径 · 4. 对表 · 5. 回归计数 · 6. 终态行。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`WIRE_ARTIFACT_PUBLISHED_DONE`；否则 `WIRE_ARTIFACT_PUBLISHED_PARTIAL` + 精确剩余

## Notes for the executor

- 与 **105 的重锁面同族**：105 已完成（`58d61ebb`/`c4255b31` 已登记），本单是"把工件与口径这件事做完整"，**不改**那对摘要本身（除非对表发现不一致 ⇒ 交回）。
- 判据同 R-0032 ⑤：**选不让信息在系统中间被吃掉/静默改写的那种写法**——这里就是"别再留一份会冒充当前工件的旧副本"。
