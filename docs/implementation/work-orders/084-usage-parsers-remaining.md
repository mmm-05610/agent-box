---
id: 084
slug: usage-parsers-remaining
batch: b2
baseline: "4c32992"
depends_on: []
write_paths: ["src/agent_box/**", "tests/**", "docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["plugins/**", "/home/maoqh/projects/agent-box-server-round1/**"]
ruling: R-0002
terminal: ["USAGE_PARSERS_DONE", "USAGE_PARSERS_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 084 — 51/53 剩余解析器（hermes/claude 观测轮 + opencode/kilo blob）

## Objective

51/53 的解析器面已对 pi/codex 端到端；**剩下三块**：hermes 与 claude 的**门级观测轮**（把已写好、已在真实
数据上验证过的解析器在门里跑成一手证据），以及 **opencode/kilo 的 `*.db` JSON blob 解析**（51 阶段 A 记
"用量藏在 `data` JSON 内，需逐行解析"）。补齐后 51/53 的解析覆盖面才算完整。

## Current state

- 53 账行：`USAGE_AGGREGATION_DONE`，剩余写明 opencode/kilo blob 解析与 hermes/claude 观测轮
- 51 账行：`USAGE_FACT_PARTIAL`，剩余同上；解析器已在真实数据上验证（`28ed31c` 前）
- schema 7 已有 `turns.usage_*` 与 `sessions.latest_usage`；`usageProbe` 是部署声明（未知即拒绝）

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| hermes / claude 的门 | 各跑一次观测轮，回填 source 与计数 | 门级一手证据 |
| `src/agent_box/**`（解析器） | opencode/kilo 的 blob 解析（只读 `data` 列，**不读凭据表**） | 剩余来源 |
| 账与证据 | 51/53 行刷新 + 证据 | 收口 |

- **库含凭据/账号表**：只按会话读取 `message`/`part`（或等价）的 `data` 列；**绝不触碰** `credential`/`account`；
  解析失败按 `unknown` 如实记账
- 零真实模型调用；不改 wire

## Requirements

### Requirement: 两家的门级观测轮

#### Scenario: hermes 观测轮

**WHEN** 以假端点跑 hermes 门并让一轮完成
**THEN** `turns` 记到该家的用量与 `source`（字段名按该家真实载体），失败轮为 NULL

### Requirement: 库内 blob 的用量解析

#### Scenario: opencode/kilo

**WHEN** 对一份含会话的 `*.db` 解析 blob
**THEN** 得到逐轮用量或**类型化的 unknown**（写明为何取不到）；**没有**任何一次查询触及凭据/账号表

## Stages

- [ ] 1. hermes 观测轮（提交）
- [ ] 2. claude 观测轮（提交）
- [ ] 3. opencode/kilo blob 解析 + 反例（缺字段 ⇒ unknown）（提交）
- [ ] 4. 51/53 收口 + 证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 观测轮 | 两家各有门级一轮的 source 与计数 | 只有单测没有门即失败 | fail (typed) |
| G2 零凭据 | 解析路径的 SQL 与测试里**无** `credential`/`account` 查询 | 加一句读凭据表的查询即失败 | fail (typed) |
| G3 unknown 诚实 | 字段缺失时写 unknown + 原因 | 写 0 冒充即失败 | fail (typed) |

## Validation

```bash
grep -rn "credential\|account" src/agent_box/server/usage*.py | grep -i "select\|from" || echo "零凭据查询 ✓"
python3 -m pytest -q tests/server -k usage
git diff --check && git status --short
```

## DoD

1. 实现：blob 解析。2. 反例：G2/G3。3. 真实环境：两家门级观测轮。4. 回归：套件计数。
5. 账务：零调用 + 清理。6. 账：51/53 行 + 本单终态行。

## Acceptance

- 绿：`USAGE_PARSERS_DONE`；否则 `USAGE_PARSERS_PARTIAL` + 精确剩余
