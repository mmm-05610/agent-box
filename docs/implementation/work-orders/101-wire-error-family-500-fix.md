---
id: "101"
slug: wire-error-family-500-fix
batch: b2
baseline: "fc961945b15074a710267b0ed055280b4e5495a4"
depends_on: []
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0011
terminal: ["WIRE_ERROR_FAMILY_FIX_DONE", "WIRE_ERROR_FAMILY_FIX_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "已收口的历史单：执行时未拆分单元，补记为单线程（不是本单引入的并行缺口）；再次触碰时按当时实际重declared。"
parallel_units: []
---

# Work Order 101 — 五个合同方法在任何生产组合上必然 500（错误族被内部码顶位）

## Objective

**来源：审阅者发现 `AUD-B-001`（confirmed / medium / wire），调度者转单。**

`usage.aggregate`、`usage.export`、`providerArtifacts.list`、`providerArtifacts.install`、`providerArtifacts.rollback`
这**五个已登记的合同方法**在任何生产组合下 **100% 回 HTTP 500**：`WireError` 的**第一个位置参数是错误族**
（12 项闭集），而这些调用点把**内部码**（`USAGE_AGGREGATOR_UNAVAILABLE` / `ARTIFACT_STORE_UNAVAILABLE` / `INVALID_PARAMS`）
传进了 family 位 ⇒ `__post_init__` 抛 `ValueError` ⇒ 500（**不是**类型化拒绝）。全部门绿，是因为
`tests/server/test_wire_v1.py` 对这五个方法**零引用**——与 099 的"测试直调实现、线从未被驱动"同构。

**明确不做**：改错误族的**集合**（12 家族不动）；为了让门绿而把方法从合同里摘掉（它们是已交付面）；
把 500 换成静默成功。

## Current state（审阅者第一手，调度者核对）

| 事实 | 出处 |
| --- | --- |
| `WireError` 第一参＝family，且对不在 `FAMILIES` 的值抛 `ValueError` | `src/agent_box/server/wire/errors.py:105-114`；`FAMILIES` 12 项在 `errors.py:13-26` |
| `usage.aggregate`/`usage.export`：`aggregator is None ⇒ raise WireError("USAGE_AGGREGATOR_UNAVAILABLE", …)` | `handlers.py:1255-1259` |
| `providerArtifacts.*` 同形（`ARTIFACT_STORE_UNAVAILABLE`） | 同文件（审阅者点名为 1208/1256 两处；`INVALID_PARAMS` 两处在 1347/1356，属 098 射程） |
| 前端 P26 已实测 live 500 并交回后端，但**无人接手**（53/57 已闭单） | 前端树 `status.md:2031-2033` |
| 生产组合的注入点唯一 | `src/agent_box/server/bootstrap/runtime.py:406` 一带 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 家族位误用点 | 改传**合法家族**（建议 `UNAVAILABLE`），原内部码进 `details.internalCode`（与 `from_server_error` 的收敛语义一致） | 类型化拒绝，不是 500 |
| 全文件扫描 | 扫 `handlers.py` 全部 `WireError(` 第一参，凡不在 `FAMILIES` 的**同类误用**一并修（098 射程的 `INVALID_PARAMS` 两处可并入或留给 098，但要在报告里写明归属） | 同类缺陷一次清 |
| 组合面 | 第一手核对：这些服务在**哪些**组合里被注入、哪些组合没有；没有的 ⇒ 类型化 `UNAVAILABLE` + `internalCode`；**不得** 500 | 诚实 |
| 门 | **驱动真实 wire** 的用例覆盖这五个方法（正例：注入服务后成功；反例：不注入 ⇒ 类型化 `UNAVAILABLE`），并且**旧代码必须让门红** | 补上缺的覆盖 |
| 前端 | 若某些组合确实不提供这些面 ⇒ 在前端合同/交回里写明"该部署不支持"，让界面显示"不可用"而不是崩 | 不假装 |

**必须保持不变**：12 家族集合与既有错误信封形状；`from_server_error` 的映射；098 的 provenance 修复边界。

## Requirements

### Requirement: 不再 500

#### Scenario: 无服务时类型化

**WHEN** 组合未注入 usage aggregator / artifact store 时调用这五个方法
**THEN** 返回**类型化错误信封**（合法家族 + `details.internalCode` 保留内部码），**不是** 500

#### Scenario: 有服务时可用

**WHEN** 组合注入了对应服务
**THEN** 方法按合同返回成功结果

#### Scenario: 反例（门要能咬）

**WHEN** 把家族位改回内部码（或退回当前实现）
**THEN** 新增的门**必须红**（gate 里给出这条反例的跑法）

### Requirement: 同类误用一次清

#### Scenario: 全文件扫描

**WHEN** 扫 `handlers.py` 所有 `WireError(` 第一参
**THEN** 报告列出"误用点 → 修法/归属（098 或本单）"，**零遗漏**

## Stages

- [ ] 1. 观测：复现 500（真服务或进程内），扫同类误用点并落表（提交）
- [ ] 2. 修家族位 + `internalCode` 收敛（提交）
- [ ] 3. 组合面核对（哪些注入、哪些没有）+ 前端交回说明（提交）
- [ ] 4. 门：五方法正/反例 + 旧代码必红（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 不 500 | 五方法在无服务组合下回类型化信封；有服务组合下成功 | 退回旧实现必须门红 | fail (typed) |
| G2 家族合法 | 所有 `WireError(` 第一参 ∈ `FAMILIES`（文本级扫描 + 运行期构造都过） | 留一处内部码必须门红 | fail (typed) |
| G3 覆盖 | 新门**驱动真实 wire**（不是直调实现）覆盖五方法 | 只直调实现必须门红 | fail (typed) |
| G4 回归 | 既有错误面测试与套件计数入账 | 任一变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 修家族位 + 组合面核对 · 2. 反例（G1 的"旧代码必红"）· 3. 真实环境（真服务上五方法各一次，含无服务组合）·
4. 回归计数 · 5. 账务与清理 · 6. status 分账（并回填前端 P26 的交回项）。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`WIRE_ERROR_FAMILY_FIX_DONE`
- 否则：`WIRE_ERROR_FAMILY_FIX_PARTIAL` + 精确剩余

## Notes for the executor

- 来源是审阅者发现（`AUD-B-001`）；修复后请在 `docs/reviews/auditor-backend/findings.json` 的对应条目上**不要**自己改状态——
  调度者负责标 `dispatched@<sha>`；你只在 status 里写你的证据。
- 本单在 **b2 追加**（真缺陷、小改大收益）；与 098 有交叠，报告里写清归属避免重复修。
