---
id: "103"
slug: wire-drive-coverage-meta-gate
batch: b2
baseline: "fc961945b15074a710267b0ed055280b4e5495a4"
depends_on: [{"order": "101", "condition": "先修掉五方法的 500，再谈覆盖（否则覆盖门会把 500 记成“已驱动”）"}]
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0011
terminal: ["WIRE_DRIVE_COVERAGE_DONE", "WIRE_DRIVE_COVERAGE_PARTIAL"]
waive: []
parallel_units: ["serve-all-64","account-the-36","exemptions","counterexample"]
---

# Work Order 103 — 元门：每个已登记方法至少被**真实 wire** 驱动过一次

## Objective

**来源：调度者据审阅者两轮发现的第一手测量**（`AUD-B-001` 的形状："测试直调实现、线从未被驱动"）。

第一手测量（调度者，`@fc961945`）：派发表 `_handlers` **64** 个方法，`tests/server/test_wire_v1.py` 里出现过的
只有 **28** 个 ⇒ **36 个方法从未在该门里被驱动**（`accounts.*` 4、`assets.*` 11、`hooks.*` 6、
`profiles.clone/memory/setPermissions/subagent*` 6、`providerArtifacts.*` 3、`providerModels.probe*` 2、
`usage.*` 2、`executions.list`、`workspaces.gitStatus`）。其中五个（`usage.*` + `providerArtifacts.*`）
**已经在生产组合上 100% 500 却全门绿**——这就是本单要根除的形状。

**本单要的**：一张**驱动覆盖账**（方法 → 证据在哪：门/脚本/driver/手工）+ 一道**元门**（没证据就红）+
把**廉价可覆盖**的补上。不是"为每个方法写一个大测试"，而是"没有证据必须有理由"。

**明确不做**：为凑覆盖放宽门；把"某处手工跑过"当永久证据而不落进可复跑的门里；把需要真机/真模型的方法硬塞进本单
（那些记为**带理由的豁免**，进后续候选）。

## Current state

| 事实 | 出处（第一手） |
| --- | --- |
| 64 方法 vs `test_wire_v1` 覆盖 28 ⇒ 36 无驱动 | 调度者静态测量（正则扫方法名 vs `_handlers` 键） |
| 五方法 500 全门绿 | 101（`AUD-B-001`） |
| 前端有两个真实服务驱动（`p21-read-faces` 13/13、`p22-write-faces` 13/13）覆盖了部分写面/只读面 | 前端树 `e2e/p21-*.mjs`、`e2e/p22-*.mjs` 与其 status 账 |
| 既有门的惯例：反例 + 缺席即失败 | `docs/implementation/README.md §3`/§4 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 覆盖账 | 生成 `docs/server-round1/fullstack/wire-drive-coverage.md`：**逐方法**一行（64 行），标"驱动证据"（哪个门/脚本/driver + 文件名行号）或"无" | 让缺口可见 |
| 元门 | 新增门（脚本或 pytest）：**每个 `_handlers` 方法必须有驱动证据或一条豁免**（豁免要写理由）；证据来源可跨仓（前端 driver 路径以路径+说明入账） | 防假绿 |
| 豁免册 | 豁免格式：`方法 / 理由 / 类型（需真机·需真模型·需外部服务·内部面）/ 复验条件` | 可审计 |
| 补覆盖 | 把**廉价可覆盖**的补进 `test_wire_v1`（无外部依赖的只读面优先：`accounts.list`、`assets.list/catalog`、`hooks.list`、`executions.list`、`workspaces.gitStatus`、`providerModels.list`；探针类用 loopback 假端点） | 有证据 |
| 边界 | 机械部分**不做真实模型调用**（R-0017） | 成本 |

**必须保持不变**：既有门的语义与计数；101/098 的修复边界；豁免不得成为"永远不覆盖"的借口（要有复验条件）。

## Requirements

### Requirement: 覆盖账完整

#### Scenario: 64 行齐全

**WHEN** 读 `wire-drive-coverage.md`
**THEN** `_handlers` 的**每个**方法都有一行，且每行的"驱动证据"或"豁免理由"至少其一非空

#### Scenario: 反例（账要能咬）

**WHEN** 临时从账里删掉一行（或给一个方法既不写证据也不写豁免）
**THEN** 元门**红**

### Requirement: 元门可复跑

#### Scenario: 门在 CI/本地跑

**WHEN** 跑元门
**THEN** 它比对 `_handlers` 现行方法集与账的覆盖集合，**差集非空即失败**（并列出差集）；
反例：把一个方法从 `_handlers` 里删掉（或新增一个）而账未同步 ⇒ 门红

### Requirement: 廉价覆盖真的补上

#### Scenario: 只读面被驱动

**WHEN** 跑新增的用例
**THEN** 至少上述六个只读面在**真实 wire**（进程内或 loopback）上被驱动成功；探针类用假端点且断言"失败也是类型化"

## Stages

- [ ] 1. 覆盖账（64 行）+ 缺口清单（提交）
- [ ] 2. 元门 + 反例（提交）
- [ ] 3. 补廉价覆盖（只读面 + 探针假端点）（提交）
- [ ] 4. 豁免册（逐条理由与复验条件）+ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 账完整 | 64 行齐全且每行有证据或豁免 | 删一行/留空 ⇒ 门红 | fail (typed) |
| G2 元门 | 差集非空即失败 | 新增方法未同步账 ⇒ 门红 | fail (typed) |
| G3 覆盖真实 | 新覆盖用例**驱动真实 wire**（非直调实现） | 直调实现必须门红 | fail (typed) |
| G4 成本 | 机械部分零真实模型调用 | 出现真实调用必须门红 | fail (typed) |
| G5 回归 | 既有门与套件计数入账 | 任一变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 账 + 元门 + 覆盖 + 豁免册 · 2. 反例（G1/G2/G3）· 3. 真机/进程内 wire 证据 · 4. 回归计数 · 5. 账务（零真实调用）与清理
· 6. status 分账。缺一项 ⇒ `WIRE_DRIVE_COVERAGE_PARTIAL`。

## Acceptance

- 绿：`WIRE_DRIVE_COVERAGE_DONE`
- 否则：`WIRE_DRIVE_COVERAGE_PARTIAL` + 精确剩余（哪些方法仍无证据、为什么）

## Notes for the executor

- 依赖 **101**（先修 500 再谈覆盖）；本单在 **b2 追加**。
- 账要**跨仓**如实：前端 driver 已覆盖的面（`p21`/`p22`）可以在账里以"外部 driver + 路径"入账，但**不能**当作本仓可复跑的证据——
  要么在本仓门里补等价覆盖，要么标豁免并写复验条件。
- 豁免册是给后续单的**输入**（谁该被补覆盖），不是终点。
