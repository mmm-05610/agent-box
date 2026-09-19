---
id: "112"
slug: provider-update-omitted-keeps-value
batch: b2
baseline: "4ac8263"
depends_on: []
write_paths: ["src/agent_box/server/wire/**", "src/agent_box/server/model_configs/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "release/**"]
ruling: R-0032
terminal: ["PROVIDER_UPDATE_KEEPS_OMITTED_DONE", "PROVIDER_UPDATE_KEEPS_OMITTED_PARTIAL"]
waive: []
parallel_units: ["single"]
---

# Work Order 112 — `providerModels.update`：**省略即保留原值**（AQ-0007，用户已同意）

## Objective

**来源：R-0032 ③（AQ-0007 用户同意）**：`providerModels.update` 今天对**省略的字段**的处理与"省略即保留"不一致
（会写空/写默认，等于**静默改写**用户没提的东西）。**改成：请求里没给的字段保持原值**（只有显式给 `null` 才是清空，若协议允许；
不允许清空的字段则类型化拒绝，按现状核实）。

## Current state（调度者只读核对；阶段 1 请自己复核）

| 事实 | 出处 |
| --- | --- |
| `providerModels.update` 的 handler 在 `server/wire/handlers.py`（A 线写面） | 097/098/101 的单与本树证据 |
| 模型配置记录与 update 语义在 `server/model_configs/**` | 同上；本单与 runtime 线的 `092` 共享该目录 ⇒ **串行**（公告点名） |
| 前端会"把整条记录发回来"，因此省略字段的真实出现路径是**老客户端/部分更新** | 需要阶段 1 一手确认 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| update 语义 | 省略 ⇒ 保留原值；显式 `null`/空 ⇒ 按协议（若不允许清空则**类型化拒绝**，不静默） | 不静默改写 |
| 测试 | 加"省略字段保持原值"的用例 + 反例（把实现退回 ⇒ 红） | 门要能咬 |
| 顺序 | 与 runtime 线的 `092` **串行**（共享 `server/model_configs/**`） | R-0022 ③ |

**必须保持不变**：`providerModels.update` 的 CAS/版本语义、`provenance` 的写入规则（098 已修）、错误族（101 已修）。
**明确不做**：改 wire 参数形状；顺手改 `create` 的语义（那是另一件事，需要单独证据）。

## Requirements

### Requirement: 省略即保留

#### Scenario: 部分更新

**WHEN** 请求只给 `displayName`，不给 `baseUrl`/`models`
**THEN** `baseUrl`/`models` 保持原值（读回逐字相同）

#### Scenario: 反例

**WHEN** 把实现退回"省略即写默认/清空"
**THEN** 同一条用例**必须红**

#### Scenario: 显式清空（按协议）

**WHEN** 请求显式给 `null`（或空数组）而该字段不允许清空
**THEN** **类型化拒绝**（不静默）；允许清空的字段按协议清空并读回为"空"而不是"缺省"

## Stages

- [ ] 1. 观测：现状语义 + 省略/显式的真实出现路径（提交）
- [ ] 2. 修（省略即保留）（提交）
- [ ] 3. 门（正例 + 反例）（提交）
- [ ] 4. 收口：回归计数 + 账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 省略即保留 | 部分更新后未给字段逐字不变 | 退回旧实现 ⇒ 门红 | fail (typed) |
| G2 显式清空类型化 | 不允许清空的字段给 null/空 ⇒ 类型化拒绝 | 静默清空 ⇒ 门红 | fail (typed) |
| G3 不退化 | CAS/版本、provenance（098）、错误族（101）全绿 | 任一变红 ⇒ 门红 | fail (typed) |
| G4 不越界 | wire 形状与 `create` 零改动 | 触碰 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "provider or update or provenance"
python3 -m pytest -q tests/
git diff --check && git status --short
```

## DoD

1. 修法 · 2. 门（含反例）· 3. 回归计数 · 4. 终态行。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`PROVIDER_UPDATE_KEEPS_OMITTED_DONE`；否则 `PROVIDER_UPDATE_KEEPS_OMITTED_PARTIAL` + 精确剩余

## Notes for the executor

- 与 runtime 线的 `092` **共享 `server/model_configs/**` ⇒ 串行**（公告点名谁先谁后；按 R-0032 的次序，本单可在 092 之前或之后，但不得同时）。
- 判据同 R-0032 ⑤：**选不让信息被静默改写的那种写法**。
