---
id: 072
slug: windows-48-closeout
batch: b1
baseline: "e39959f"
depends_on: []
write_paths: ["docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["src/**", "plugins/**", "tests/**", "/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**"]
ruling: R-0002
terminal: ["WINDOWS_48_CLOSEOUT_DONE", "WINDOWS_48_CLOSEOUT_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "已收口的历史单：执行时未拆分单元，补记为单线程（不是本单引入的并行缺口）；再次触碰时按当时实际重declared。"
parallel_units: []
---

# Work Order 072 — 48 的结案取证（只写证据，不改代码）

## Objective

48 的 AppContainer spike 已由用户手跑两轮（非提权 / 管理员），结论落定：**用 AppContainer 做读写隔离对本产品不成立**
（失败与提权无关；且"把用户目录降到 Low IL"需要管理员，产品路径不能假定）。本单把结案写进 48 自己的证据文件，
并逐条核对降级形态的声明是否仍然诚实——**只写证据，不动实现**。

## Current state

- 主树证据：`docs/server-round1/fullstack/windows-spike-elevated.md`（两轮 + 结案判据）与两份原始 JSON
- 本树旧结论：`docs/server-round1/fullstack/windows-placement-48.md`（降级形态）与 `windows-spike.md`（非提权轮）
- 现状待核：48 的能力声明是否**仍然**是"写隔离 false / 读隔离 false"，且文档写明"低于 Linux 侧"

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `docs/server-round1/fullstack/windows-placement-48.md` | 追记结案（两轮事实、判据、不再追测容器承载） | 证据完整 |
| 能力/注册表声明 | **核对**写/读隔离仍为 false；若被改高 ⇒ 类型化失败并交回 | 不许夸大 |
| `docs/implementation/status.md` | 48 行刷新 + 本单终态 | 账 |

- 不改 `src/**`、`plugins/**`、`tests/**`；不重跑门（沿用既有门结论并标明提交）

## Requirements

### Requirement: 结案可被独立复核

#### Scenario: 从证据文件复现结论

**WHEN** 只读 `windows-placement-48.md` 与主树 `windows-spike-elevated.md`
**THEN** 能读到两轮的原始退出码（`0xC0000142`）、H1 被排除的理由、以及"需要管理员"这条独立判据，并看到"容器承载不再追测"的明示

### Requirement: 声明不许被夸大

#### Scenario: 写/读隔离仍为 false

**WHEN** 检查 Windows 侧的能力与注册表声明
**THEN** 写隔离与读隔离**均为 false**，且文档里有"低于 Linux 侧"的一句话；若有任一处变成正向声明 ⇒ 停下、类型化失败、交回调度者

## Stages

- [x] 1. 追记 48 证据（两轮事实 + 判据 + 不再追测）（提交）
- [x] 2. 核对声明仍为 false 并留下核对记录（提交）
- [x] 3. 刷新 48 行与自查（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 事实可复核 | 证据文件含两轮退出码与 H1 排除理由 | 只写"结论：不支持"而无退出码即失败 | fail (typed) |
| G2 不夸大 | 写/读隔离声明均为 false 且有"低于 Linux 侧"说明 | 任一处改为 true 即失败 | fail (typed) |
| G3 只写证据 | `git diff --stat -- src plugins tests` 为空 | 出现实现改动即失败 | fail (typed) |

## Validation

```bash
grep -n "0xC0000142\|-1073741502" docs/server-round1/fullstack/windows-placement-48.md
grep -rn "低于 Linux\|lower than the Linux" docs/server-round1/fullstack/windows-placement-48.md
git diff --stat -- src plugins tests
git diff --check && git status --short
```

## DoD

1. 实现：无（本单只写证据）。2. 反例：G3 的"改了 src"演练一次。3. 真实环境：证据即真机产物（两轮 JSON 在主树）。
4. 回归：沿用既有门结论并标明提交。5. 账务：零真实模型调用。6. 账：48 行刷新 + 本单终态行。

## Acceptance

- 绿：`WINDOWS_48_CLOSEOUT_DONE`
- 否则：`WINDOWS_48_CLOSEOUT_PARTIAL` + 精确剩余项
