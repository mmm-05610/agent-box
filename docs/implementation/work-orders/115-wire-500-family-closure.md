---
id: "115"
slug: wire-500-family-closure
batch: b2
baseline: "bca77821fac530133d19a48bedea1d3f02969116"
depends_on: []
write_paths: ["src/agent_box/server/wire/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "release/**"]
ruling: R-0052
terminal: ["WIRE_FAMILY_CLOSURE_DONE", "WIRE_FAMILY_CLOSURE_PARTIAL"]
waive: []
parallel_units: ["closure-mapping", "gate"]
serialize_with: ["117"]
---

# Work Order 115 — 错误族位误用这一族必须**闭合**：任何未登记的域内码都不可能再冒成裸 HTTP 500（`QA-008` A 面）

## Objective

**来源：`QA-008 (v2)`（confirmed / 中高 / wire，`docs/qa/findings.md`）＋ `R-0052 ①(a)`（用户裁定"当轮转两张单"）＋ `R-0054 ⑧(a)`（ops 第一轮交接单）。**

`101` 把**这一处**修对了（A 树 `src/agent_box/server/wire/handlers.py:1238/1297` 已是 `UNAVAILABLE` + `details.internalCode`），
但**这一族并没有闭合**：`WireError.__post_init__` 仍然对不在 `FAMILIES` 的第一参**抛 `ValueError`**
（`src/agent_box/server/wire/errors.py` `__post_init__`），而 HTTP 层把 `ValueError` 翻成**裸 500 ＋ 21 字节纯文本**
（不是 JSON-RPC 错误体）。⇒ 今天**任何一个**新写的调用点只要把内部码写进 family 位，用户看到的就是 500；
**而这个形状是"单元门咬不到"的**（`101` 的守卫测试 `tests/server/test_wire_error_family_101.py` **只在本树存在**）。

**本单要的是"闭合"这一件事**：让"域内错误码"与"wire 家族"之间**不存在**能冒出裸 500 的通路，并让这条不变量**被门咬住**。

**明确不做**：改 12 项 `FAMILIES` 集合；改 `from_server_error` 的既有收敛语义；写 runtime 树（那是 `116` 的活，本树对兄弟树只读）；
给用户可见的新协议字段（那属 settings 线的合同面）；为了让门绿而把某个方法从合同里摘掉。

## Current state（一手，ops 逐行核对；两树 HEAD 见 `baseline` 与下表）

| 事实 | 出处 |
| --- | --- |
| `WireError` 第一参＝family；不在 `FAMILIES` ⇒ `raise ValueError` ⇒ 裸 500 | `agent-box-env-provider` `src/agent_box/server/wire/errors.py`（`__post_init__`） |
| `family_for()` 对未登记码**已有**兜底（`return "UNAVAILABLE"`）——但**只有 `from_server_error` 走它** | 同文件（`family_for` 紧邻 `WireError`） |
| A 树两处调用点**已正确**（`UNAVAILABLE` + `internalCode`） | A 树 `wire/handlers.py:1238`（artifact store）、`:1297`（usage aggregator） |
| **runtime 树同一文件仍是坏的**：family 位收内部码 | runtime HEAD `d12e9917` 的 `wire/handlers.py:1196`、`:1244`（逐字核过） |
| 守卫测试**只在 A 树**：`tests/server/test_wire_error_family_101.py`；runtime 树 `tests/server/` 下 0 个 | 两树 `ls tests/server`（ops 实测） |
| 后果（用户视角）：`usage.aggregate`/`usage.export` 回 500；`providerArtifacts.list` 也回 500（live 2/2） | `QA-008 (v2)`；`docs/qa/e2e-runs/r1-2026-09-19.md` §3 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `WireError.__post_init__` 的未知 family | 补一条**兜底收敛**：未知 family ⇒ 落到合法族（`INTERNAL`/`UNAVAILABLE` 择一，报告写清依据）＋ 原码进 `details.internalCode`；**不得**抛 `ValueError` 到 HTTP 层 | 让"未映射的域内码永远出不来裸 500"成为结构事实，而不是靠人记得 |
| 裸 500 的通路 | 第一手确认 HTTP 边界对"构造期异常"的处理，并断言**每一个**出站错误都带 JSON-RPC 错误体 | 合同破裂是这条缺陷的真正代价（`R-0032 ⑤`） |
| 门 | 新增**反例门**：构造一个**未登记**域码走真实 wire，断言出站是**合规错误对象**（含 `family` ∈ `FAMILIES`、`details.internalCode` 保留原码），**不是** 500 | 这条正是"单元门咬不到"的形状（`QA-008` 自述只在真实装配组合上触发） |
| 守卫测试的**在场** | 把 `test_wire_error_family_101.py` 这类守卫的**在场清单**写进 `docs/server-round1/` 的报告（路径 + 断言），供运维侧核对兄弟树是否带着它 | `D-002`/`D-005`：守卫只在一侧 ⇒ 合并即回退（**本单只登记与出报告，不写兄弟树**） |

**必须保持不变**：`FAMILIES` 12 项的集合与名字；`from_server_error` 的映射；098/101 已收口的行为。
**边界**：runtime 树那两处调用点 **不在本单写面** ⇒ 与本单**同一缺陷的另一侧**，已派 `116`（runtime 线），本单**只**在报告里引用其行号。

## Requirements

### Requirement: 未登记码不得变成裸 500

#### Scenario: 未登记域码

**WHEN** 一个域内错误带未登记码（既不在 `FAMILIES`、也不在 `_BY_CODE`）走到出站
**THEN** 出站是**合法 JSON-RPC 错误对象**（合法 family ＋ `details.internalCode`＝原码），HTTP 状态**不是** 500 的裸文本

#### Scenario: 反例（门要能咬）

**WHEN** 把兜底收敛退回当前实现（或让某调用点直接把内部码传进 family 位）
**THEN** 本单新增的门**必须红**（`Gates` 给出这条反例的跑法）

### Requirement: 既有方法面不回归

#### Scenario: 五方法

**WHEN** 在无对应服务的组合上调用 `usage.aggregate`/`usage.export`/`providerArtifacts.{list,install,rollback}`
**THEN** 全部回类型化信封（与 `101` 已验形态一致），并且新门**覆盖它们**

## Stages

- [ ] 1. 观测：一手确认"未知 family ⇒ ValueError ⇒ 裸 500"的通路（进程内 + 真服务各一次），并把通路画成报告（提交）
- [ ] 2. 补兜底收敛（未知 family ⇒ 合法族 + `internalCode`）（提交）
- [ ] 3. 门：未登记码 → 合规错误体的正例 + "退回旧实现必红"的反例（提交）
- [ ] 4. 交叉核验：runtime 树 `wire/handlers.py:1196/1244` 的形态与守卫在场清单写进报告（只读，不写兄弟树）（提交）
- [ ] 5. 账与证据（`docs/implementation/status.md` 一行 + `docs/server-round1/` 报告）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 闭合 | 未登记域码的出站是合规错误对象（非裸 500） | 退回当前实现必须门红 | fail (typed) |
| G2 家族合法 | 出站 `family` 恒 ∈ `FAMILIES`（12 项），原码在 `details.internalCode` | 构造一处 family 位误用必须门红 | fail (typed) |
| G3 真 wire | 新门**驱动真实 wire**（`raise_server_exceptions=False`），不是直调实现 | 改成直调实现必须门红 | fail (typed) |
| G4 不回归 | 既有错误面测试 + 套件计数入账（附「Worker 工件在/不在」行，`QA-007`） | 任一变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 通路观测报告（含行号）· 2. 兜底收敛落地 · 3. 反例门（旧实现必红）· 4. 真 wire 覆盖 ·
5. 回归计数（带 Worker 工件行）· 6. 账与证据 + 兄弟树在场面清单。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`WIRE_FAMILY_CLOSURE_DONE`
- 否则：`WIRE_FAMILY_CLOSURE_PARTIAL` + 精确剩余

## Notes for the executor

- **前提是待验的**（`OF-02`）：本单 `Current state` 两处行号由 ops 逐字核过（A 树 `bca7782`、runtime `d12e9917`），但**执行第一步先自己复核**；
  若实测推翻（例如"未知码其实已被别处收敛"），**交回 ops**，不要照单硬做。
- 兄弟树那两处调用点由 `116` 负责（runtime 线）；**你不要写 runtime 树**（跨树只读核验允许）。
- 审阅者 `dispatched@<sha>` 标记由 ops 标；你只在 status 写证据。
