# 103 — wire 驱动覆盖元门（证据）

工单基线 `fc96194`；本单在 `62f8b7c`（101 收口后）上执行，A 线队列第 4 张。
产物三件：扫描器 `scripts/server-round1/wire_drive_coverage.py`、账
`docs/server-round1/fullstack/wire-drive-coverage.md`（**生成**）、豁免册
`docs/server-round1/fullstack/wire-drive-exemptions.md`；门 `tests/server/test_wire_drive_coverage_103.py`。

## 1 实测：工单的前提**在一半上成立**，另一半已经不等本单

| 口径（本单一手） | 数字 |
| --- | --- |
| 派发表 `_handlers` | **64** |
| 只算 `tests/server/test_wire_v1.py` 一个文件 | 驱动 **28** ⇒ 缺 **36** |
| 把整个 `tests/` 当语料 | 驱动 **64** ⇒ 缺 **0** |

⇒ 调度者那句"64 里 test_wire_v1 只出现 28 个 ⇒ 36 从未被驱动"**逐字复现**（28/36 都对得上），
但"从未被驱动"要看语料范围：`assets.*` 在 `test_asset_hubs.py`、`hooks.*` 在 `test_hook_models.py`、
`accounts.*` 在 `test_accounts.py`、`profiles.clone/setPermissions` 在 `test_profile_permissions.py`、
`profiles.memory` 在 `test_profile_memory.py`、`profiles.subagentGrants/revokeSubagent` 在 `test_delegation.py`、
`executions.list` 在 `test_execution_inventory.py`、`workspaces.gitStatus` 在 `test_git_status.py`、
`sessions.switchProfile` 在 `test_shared_session_store.py`、`providerModels.probe*` 在 `test_usage_parsing.py`
（loopback 假端点）——**都在真实 wire 上被驱动过**，只是不在那个门文件里。

真正"此前零驱动、本批补上"的是 101 点名的**那五条**：
`usage.aggregate`、`usage.export`、`providerArtifacts.list/install/rollback`，
它们唯一的证据是 101 自己写的 `test_wire_error_family_101.py`（扫描器逐条给出 file:line）。

⇒ 本单因此**不新写覆盖、也不留豁免**；它交付的是"这件事从此是个断言"：
派发表 ⊆ 证据 ∪ 豁免，账与生成器**逐行一致**，并且**藏掉一个文件的证据就必然出现缺口**。

## 2 造工具时自己踩的两个坑（都是本单要防的那类，被自己的门逮住）

1. **按缩进正则解析派发表 ⇒ 只数到 54**。`METHOD_RE` 要求 12 个空格的行首，
   于是换行写法不同的 10 条被静默吞掉——**这恰是 097 那张手写表的行为：看起来全，其实少**。
   改成读 AST 找 `self._handlers` 那个字典字面量（`AnnAssign` 也要认，第一版只认 `Assign` 又踩一次）。
   门里留了一条 `test_the_scanner_sees_every_method_the_dispatcher_can_dispatch`：
   解析出的集合必须等于**活运行时** `runtime.wire._handlers` 的键集合，且恰为 64。
2. **方法名的第一段是驼峰**（`providerModels.*`、`providerArtifacts.*`、`sendOutcome.query`）。
   正则里写了 `[a-z]+\.` ⇒ 账上少了 4 行而**没有任何报错**。
   门里那条"账与生成器逐行一致"正是靠 `set(rows) == 派发表` 逮到它的（第一次跑就红）。

⇒ 两条都不是"工具写好后再补测试"，是先有门、门把工具修对。这条事实值得留在账里：
**元门本身也需要被证伪**，否则它只是另一份会腐烂的手写清单。

## 3 判"驱动"的规则（为什么不是一次 grep）

一条证据 = 方法名出现在**请求驱动的调用位置**上（`ok(` / `err(` / `call(` / `_wire(` /
`_wire_post(` / `post(` / `wire(`，或直接是 `"/wire/v1/<method>"` 字面量），
且该文件本身含 `/wire/v1/`（同文件多行调用点用 3 行回看窗口）。

**数据字面量不算**。这条不是洁癖：本仓现在有三处成堆的方法名字符串
——097 的 `MISSING_AT_BASELINE`（37 条）、101 的 `FIVE_METHODS` 与 `PARAMS` 表、
以及若干 `assert "x.y" in ...` 式断言。一次 `grep -c '"usage.aggregate"'` 会把它全算成覆盖。
门里 `test_naming_a_method_in_a_data_literal_is_not_evidence` 就地构造了这种语料（tuple ＋ dict ＋
list 三种），要求证据为 0，**同时**要求同文件里那条真 `"/wire/v1/sessions.send"` 被算作证据——
规则的两个方向一起钉，不然它可以被写成"什么都不算"来假绿。

## 4 门（9 条）

| 用例 | 钉哪道门 | 反例方向 |
| --- | --- | --- |
| `test_the_scanner_sees_every_method_the_dispatcher_can_dispatch` | 工具与活派发表一致（64） | 少解析一条即红（我第一版就红了） |
| `test_every_registered_method_is_driven_over_the_wire_or_exempted` | **G1/G2 本体**：差集必须为空，且 `证据 ∪ 豁免 == 派发表` | 任一方法既无证据又无豁免即红，并列出方法名 |
| `test_the_generated_ledger_lists_each_method_with_the_evidence_the_tool_found` | 账不能与生成器分家（方法集合、每条引用、条数列） | 账里删一行/改一行即红（我第二版就红了） |
| `test_hiding_the_only_evidence_for_a_method_opens_a_gap` | **门能咬**：把 `usage.aggregate` 唯一的证据文件从语料里拿掉 ⇒ 缺口出现 | 若输出与证据无关（写死名单），此条红 |
| `test_naming_a_method_in_a_data_literal_is_not_evidence` | 规则的方向性 | 放宽成 grep ⇒ 红；收紧成"只认 URL 字面量" ⇒ 也红 |
| `test_a_method_the_table_does_not_have_is_not_credited` | 账以派发表为键，不能用测试里的名字凑数 | — |
| `test_the_register_explains_every_row_and_hides_nothing_drivable` | **豁免册**每行需理由/类型/复验条件三格，且**能被驱动的方法不许进册** | 塞一条"能驱动但懒得写"的豁免即红 |
| `test_a_credited_line_asks_for_the_method_it_credits` | 引用的那一行里确有该名字 | — |
| `test_the_ledger_records_how_fragile_each_row_is` | 条数列必须非零（删文件会让账显出 0） | — |

G5 回归与全套件计数见 §5。

## 5 账、清理与交回

* **G5 回归**（同一提交 `6e6d72b` 上跑，exit 0）：`tests/server` **726 passed**（基线 717 ＋本单 9）、
  根 `tests/` **1026 passed**（基线 1017 ＋ 9）。本轮**无失败**——上一登记的那条负载敏感的
  `test_first_run_lock.py::test_without_the_gate_the_same_first_runs_overlap`（只在两棵树同时跑全量时红）
  这次没有复现；它仍留在 §待开单，不因一次绿而销账。
* **G4 成本**：真实模型 **0 次 / ¥0**——扫描器**读文件不执行文件**，门也不发任何请求
  （`build_runtime` 只在"比对派发表"那条里被建起来，用一个临时数据根，不产生出站）。
* 清理：无源码外产物；`/tmp` 下只有 pytest 自己的临时目录。
* **交回 1**：账上 **45/64 个方法只被一个文件驱动**（列在账的"观察名单"）。
  这不是缺口，是脆——删掉那一个文件就掉回缺口（门里有一条就拿 `usage.aggregate` 演这个）。
  建议后续单（若有）把"高价值面至少两处独立驱动"做成预算，而不是本单悄悄补 45 份重复用例。
* **交回 2**：`test_wire_v1.py` 之外的那些驱动文件**不在同一个门文件里**；
  103 的账回答了"有没有被驱动"，但"哪个门负责它"仍分散在各单。若要一个真正的 CI 门，
  把 `wire_drive_coverage.py --check` 挂进去即可（它就是为此写的，退出码即结论）。
* **交回 3（前提修正）**：工单 §Current state 的"36 从未被驱动"应读作
  "**在 `test_wire_v1.py` 里从未被驱动**"；按整个 `tests/` 扫是 0 缺。
  本单没有为此改契约，只在这里记事实（章程 §5）。

## 6 复核（112/113 落地之后重量，2026-09-19）

**为什么要有这一节**：112 补了 28 条门、113 补了 16 条，账上却仍写"**45**/64 个方法只被一个文件驱动"，
而且 112 那个文件**根本没进账**——读者有理由怀疑这张表过期了。两个问题分开量。

1. **表体没有过期**：把 `--markdown` 的现物与提交件逐行 diff ⇒ **64 行表体逐字一致**（差异只在该文件顶部
   那段手写前言，`--markdown` 本来不输出它）。门里"账与生成器逐行一致"那条也正是这么判的，112/113 之后重跑仍绿。
2. **"45" 没有被低估也没有被高估**：现行判"驱动"的规则要求**该文件本身含 `/wire/v1/`**，
   于是一个只用 `from test_wire_v1 import Wire` 助手驱动、不写 URL 字面量的文件（**112 的门文件就是这种**）
   完全不被记为证据。把规则放宽成"含 `/wire/v1/` **或** 导入该助手"再量一次：
   **只有 5 个方法的证据集合变大，且没有一个方法从"1 个文件"跨到"多个"** ⇒ 头名数字在两种规则下都是 **45**。
   ⇒ 这条误报方向是**安全的**：它只会把证据记少（可能虚报缺口），永远不会把"没被驱动"记成"被驱动过"。
   今天它没有虚报缺口（`--check` 退出码 0、缺 0）。

**留给读表人的一句话**：表里某行只列了一个文件，不等于"全仓只有一个文件驱动它"——它等于
"**按这条不宽的解释，只有这一处算证据**"。要判断脆不脆，看的是那一列的**条数**与门的咬合力（§4 那条藏证据的反例），
不是这一行有没有列全。
