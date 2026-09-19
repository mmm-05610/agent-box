---
id: 098
slug: provenance-500-fix
batch: b2
baseline: "f6cbc113791347e20acc85ec34c2e697d2345dd0"
depends_on: []
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0013
terminal: ["PROVENANCE_500_DONE", "PROVENANCE_500_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "已收口的历史单：执行时未拆分单元，补记为单线程（不是本单引入的并行缺口）；再次触碰时按当时实际重declared。"
parallel_units: []
---

# Work Order 098 — `providerModels.create/update` 带 provenance 直接 500（试用抓到）

## Objective

试用实测（2026-09-19，调度者第一手）：对当前代码的 Server 调 `providerModels.create` 并带 `provenance`
（order 55 的"端点事实来源"字段），服务端抛 `NameError: name '_PROVENANCE_COLUMNS' is not defined` → **HTTP 500**。
前端 P28（Providers 页）正要用这个字段，不修的话"来源标注"整块功能一用就崩。

修法：`_PROVENANCE_ENUMS` / `_PROVENANCE_COLUMNS` 是**类属性**，而 `_provenance()`（`@staticmethod`）用**裸名**引用 →
改成类限定（或把两个常量提到模块级）；并补**穿过 wire 的测试**（这正是它烂掉的原因：55 的 provenance 面从未被 wire 测过）。

**明确不做**：改 wire 形状/枚举值（`authStyle ∈ {api_key,oauth,none}`、`wireApi ∈ {chat_completions,responses}`、
`fieldsSource ∈ {preset,pulled,manual}` 逐字不变——092 才扩词汇）；改存储列名。

## Current state

| 事实 | 出处（第一手） |
| --- | --- |
| `_PROVENANCE_ENUMS`（`:1328`）与 `_PROVENANCE_COLUMNS`（`:1333`）是**类属性** | `src/agent_box/server/wire/handlers.py`（缩进在类体内） |
| `_provenance()`（`:1341`，`@staticmethod`）裸名引用它们 | 同上 `:1346`、`:1349` |
| 触发条件：`providerModels.create/update` 带 `provenance`（**不带就没事**） | 试用实测：不带 → 201；带 → 500 |
| 该面从未被 wire 测试覆盖 | `tests/server/` 里没有发送 `provenance` 的用例（grep 可证）；55 的登记只覆盖了 service/record 层 |
| 前端 P28 依赖它（"来源标注 preset\|pulled\|manual"） | `work-orders/P28-provider-page-redesign.md` |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 两个常量 | 类限定引用（`WireHandlers._PROVENANCE_COLUMNS`）**或**提到模块级（执行者选，写明理由） | 修 NameError |
| 测试 | 新增**穿过 wire**的用例：create/update 带合法 provenance → 201/200 且四列落库读回一致 | 补缺失的覆盖 |
| 反例 | 未知字段 ⇒ `INVALID_PARAMS`；枚举外值 ⇒ `INVALID_PARAMS`；**两者都必须真的被拒**（不是 500） | 门要能咬 |

**必须保持不变**：不带 provenance 的路径逐字不变；存储列名（`auth_style`/`wire_api`/`fields_source`/`base_url`）；
`project()` 里 `provenance` 的"缺席即未知"语义。

## Requirements

### Requirement: 带 provenance 不再 500

#### Scenario: 合法值落库并读回

**WHEN** `providerModels.create` 带 `provenance={"baseUrl":"https://api.deepseek.com","authStyle":"api_key","wireApi":"chat_completions","fieldsSource":"manual"}`
**THEN** HTTP 201，记录读回 `provenance` 四字段一致；`providerModels.update` 同理

#### Scenario: 拒绝是类型化的（反例）

**WHEN** `provenance={"unknown":"x"}` 或 `{"authStyle":"telepathy"}`
**THEN** 类型化 `INVALID_PARAMS`（**不是** 500）；gate 的反例：把两者任一变成 500 或静默接受必须门红

## Stages

- [ ] 1. 观测：复现 500（第一手日志）+ 核对两个常量的作用域（提交）
- [ ] 2. 修引用（类限定或模块级）+ 保留语义（提交）
- [ ] 3. 穿 wire 的正例与两条反例测试（提交）
- [ ] 4. 门与账：套件 + 真机复跑（带 provenance 的 create 返回 201）+ status（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 不再 500 | 带合法 provenance 的 create/update 返回 201/200 | 任一仍 500 必须门红 | fail (typed) |
| G2 落库一致 | 四列写入且 `project()` 读回一致 | 少写/改名必须门红 | 缺席保持缺席 |
| G3 类型化拒绝 | 未知字段/枚举外值 ⇒ `INVALID_PARAMS` | 变成 500 或静默接受必须门红 | fail (typed) |
| G4 回归 | 不带 provenance 的路径与全套件计数不变 | 任一既有用例变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
# 真机复跑：对试用 Server 发一条带 provenance 的 create（token 见 runbook），期望 201
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 实现 · 2. 正例与两条反例 · 3. 真机复跑（201）· 4. 回归计数 · 5. 账务与清理 · 6. status 分账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`PROVENANCE_500_DONE`
- 否则：`PROVENANCE_500_PARTIAL` + 精确剩余

## Notes for the executor

- 本单在 **b2 追加**（试用抓到；前端 P28 等它）。**范围极小**：作用域 + 三条测试，别顺手重构。
- 需要人拍的事 → 本树 status §Questions。
