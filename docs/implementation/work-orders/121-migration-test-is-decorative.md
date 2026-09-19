---
id: "121"
slug: migration-test-is-decorative
batch: b2
baseline: "d12e9917771f4be4972a8abd194b0b1fb8393e67"
depends_on: []
write_paths: ["tests/server/test_stage_a_server.py", "src/agent_box/storage/database.py", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**"]
ruling: R-0054
terminal: ["MIGRATION_TEST_IS_NOT_DECORATIVE_DONE", "MIGRATION_TEST_IS_NOT_DECORATIVE_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "单线程：一个测试文件的定性/改名 + 一处死分支处置，产物不可拆（拆了要两次提交同一文件）。"
parallel_units: []
serialize_with: ["092", "120"]
revisions: [{"at": "f594b08", "what": "修订 v2：把 Work Core 的 SQL \u6587\u4ef6\u8fc1\u79fb\uff08migrations/001..009\uff09\u7684\u300c\u5347\u7ea7\u21d4\u5168\u65b0\u5b89\u88c5\u300d\u7b49\u4ef7\u95e8\u4e5f\u7eb3\u5165\uff08\u540c\u4e00\u683c\uff1b\u7a2e\u5b50\uff1dAUD-B-009 \u7684 W1\u2013W4 \u624b\u5de5\u5b9e\u9a8c\uff0c\u5ba1\u9605\u8005\u81ea\u8ff0\u5c5e\u5efa\u8bae\u3001\u672a\u7acb\u6848\uff09\u3002", "after_stage": 0, "ruling": "R-0054"}]
---

# Work Order 121 — 唯一覆盖"升级"的那条测试是装饰（`AUD-B-006` confirmed/low）

## Objective

**来源：后端审阅者 `AUD-B-006`（`confirmed` / low，`docs/reviews/auditor-backend/findings.json`，第 73 轮）——原话：**"唯一覆盖升级的那条测试是装饰"**。**

`tests/server/test_stage_a_server.py:279` 手写了一个 **"v1" 形状**，但**这个形状从未发布过**（审阅者实测：`git log --all -S"agentbox_product_schema" --diff-filter=A` 只有 `5a45303`，而那笔已经写 `PRODUCT_SCHEMA_VERSION = 2`）；
更要紧的是**它断言不到结构**：只断言 `version == 18` 与两个索引名，**一列都不看**。⇒ 覆盖账上"有升级测试"，实际**不咬任何结构**。

审阅者给的处置（本单采用 ①／② 二选一）：① **如实改名/改定性**——它验的不是"真实 v1 根升级"，而是"一条从未发布的形状"；
② **二选一**：删掉 v1 死分支（`if current == 1` ＋ `_migrate_1_to_2`，并在本树 status 记一句"本产品 schema 从 2 起，v1 从未发布"），**或**让 v1→… 真能跑到 18。

**明确不做**：改**已发布**版本的迁移语义（审阅者 `AUD-B-007` 已实测 `v2..v17 → 18` **15/15 结构等价、值无丢失** ⇒ 那条面**不是**缺陷，别顺手"修"）；
不动 wire；不把测试改弱（`R-0033 ①`）。

## Current state（一手，审阅者实测 + ops 核过文件存在性）

| 事实 | 出处 |
| --- | --- |
| "v1 升级"测试手写形状；`git log --all -S"agentbox_product_schema" --diff-filter=A` ⇒ 只有 `5a45303`，那笔已是 `PRODUCT_SCHEMA_VERSION = 2` | `AUD-B-006`（findings.json，含复现命令） |
| 该测试只断言 `version==18` 与两个索引名 | `tests/server/test_stage_a_server.py:279`（本树与 A 树都带这份文件） |
| `v2..v17 → 18` **15/15 结构等价**（逐表列名/类型/NOT NULL/默认值/主键、外键集、索引名与 SQL，并与 greenfield 18 对表） | `AUD-B-007`（**`rejected`**，留档防重复报） |
| `092` 正在被要求做"迁移测试"那一格 ⇒ 本单与它**同片**（`serialize_with: ["092"]`） | 092 单正文 + 审阅者建议 |


## 修订 v2（2026-09-19 20:5x，ops；`at` = `f594b08`，**after_stage 0**）

**新依据**：后端审阅者 `AUD-B-009` 从"未测外推"**升格为实测证伪**（它用**仓内真 SQL ＋ 真 `_run_migrations`** 跑了 W1–W4：全新安装 ledger＝`[1..9]`/16 表/9 索引；「004 形状 ＋ 真数据」升到 9 ⇒ 结构 DRIFT＝clean，
`core_dispatches` 重建的状态映射与 SQL 文档逐字一致（`started→accepted`、`dispatching→legacy-unverifiable`、`inputs_digest` 保持 NULL 不拿旧摘要冒充）、旧行留在 `_pre_v006_archive`；按 006 注释重建的旧 005 形状升到 9 只多 4 个归档列；三种根重跑**全幂等**）。
它在报告里明确：**"Work Core 侧也没有常设「升级⇔全新安装」门（本轮是手工跑）⇒ 与 `121` 同一格可合做"**。

**修订内容（只加一格，不改原有 ①②③④）**：
- 新增 Stage：把 Work Core SQL 文件迁移（`migrations/001..009`）的**等价门**做成**常设、可跑**的检查（种子＝审阅者 W1–W4 的可复算步骤：全新安装 vs 升级到 9 的**结构与 ledger 等价**、幂等性、归档表语义、`inputs_digest` 不许被旧摘要冒充）。
- Gate 增加一行 **G5**：该等价门在**人为改坏一处升级后的列/迁移**时**必须红**。
- **注意**：`005_resource_contract_inputs.sql` 只含注释，写明他们**自己踩过「复用编号 ⇒ runner 静默跳过新 schema」**并用预留编号堵死 ⇒ 该坑在产品侧仍无门（正是本单 ① 的对象）；Work Core 侧那条注释**不要删**，它是**一次真事故换来的**记录。

**修订回执**：纳入后在下一个阶段提交信息或本树 status 记一行「已纳入 work order 121 修订 @<sha>」。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 那条测试的**定性** | 如实改名/改注释：它验的是"一条从未发布的形状"，**不是**"真实 v1 根升级" | 覆盖账不许撒谎 |
| 结构断言 | **至少**断言"升级后的表结构与 greenfield 一致"这一类**结构事实**（列/类型/NOT NULL/主键/索引），而不是只看 `version` 与索引名 | 让门真的咬结构 |
| v1 死分支 | ① 删除并在本树 status 写明"schema 从 2 起、v1 从未发布"，**或** ② 让 `v1 → …` 真跑到 18（写清选了哪个、依据是什么） | 删死代码或补真链，二选一 |
| 与 `092` 的协调 | 若 `092` 执行者已在同一片（迁移测试格）动过手 ⇒ **同片只留一个写者**：先看 `092` 的进度，必要时交回 ops 串行 | 一文件一写者 |

**必须保持不变**：`v2..v17 → 18` 的既有迁移行为（`AUD-B-007` 已判等价）；其它测试的断言强度；`wire/**`。

## Requirements

### Requirement: 覆盖账说真话

#### Scenario: 定性正确

**WHEN** 读该测试的名字与注释
**THEN** 它**不自称**覆盖"真实发布版本的升级"（除非真的覆盖）

#### Scenario: 结构被抓

**WHEN** 人为改坏一处升级后的列/类型/主键（受控反例）
**THEN** 该测试**必须红**（当前只断言 `version`＋索引名 ⇒ 抓不到）

### Requirement: 死分支有结论

#### Scenario: 二选一

**WHEN** 处置 `if current == 1` ＋ `_migrate_1_to_2`
**THEN** 要么**删掉**并在 status 写一句"schema 从 2 起、v1 从未发布"，要么让 `v1 → 18` **真的跑到**；报告写清选了哪个与依据

## Stages

- [ ] 1. 观测：复核 `AUD-B-006` 的复现命令（一手），并把"当前测试抓不到什么"列出来（提交）
- [ ] 2. 改定性/改名（如实）（提交）
- [ ] 3. 补结构断言（含受控反例：改坏一列必须红）（提交）
- [ ] 4. 处置 v1 死分支（二选一 + 依据）（提交）
- [ ] 5. 与 `092` 的同片协调说明 + 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 真咬结构 | 改坏一处升级后的列/类型/主键 ⇒ 测试红 | 只断 `version`＋索引名（现状）必须红 | fail (typed) |
| G2 定性诚实 | 名字/注释不冒充"真实发布版本升级" | 冒充即门红 | fail (typed) |
| G3 死分支有结论 | 删除＋status 说明，或 v1→18 真跑通（可复算命令） | 两头都不做 ⇒ fail | fail (typed) |
| G4 不误伤 | `v2..v17 → 18` 既有行为与其它测试计数不变 | 任一变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server/test_stage_a_server.py -q
python3 -m pytest tests/server -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 复现命令的一手复核 · 2. 定性改正 · 3. 结构断言 + 受控反例 · 4. 死分支处置与依据 · 5. 与 092 的同片说明 · 6. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`MIGRATION_TEST_IS_NOT_DECORATIVE_DONE`
- 否则：`MIGRATION_TEST_IS_NOT_DECORATIVE_PARTIAL` + 精确剩余

## Notes for the executor

- **排序（低优先，不插队）**：排在 `092` 的迁移测试格**同片或之后**；`120` 在主路径上，先做 `120`。
- **前提待验**（`OF-02`）：`AUD-B-006` 的复现命令请自己跑一遍；被推翻就交回（`AUD-B-007` 就是被审阅者自己推翻的那类，如实留档）。
- **不要**顺手改已发布版本的迁移语义（已被 `AUD-B-007` 判为等价）。
