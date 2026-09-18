---
id: 080
slug: first-run-lock
batch: b2
baseline: "f819ad3"
depends_on: []
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0009
terminal: ["FIRST_RUN_LOCK_DONE", "FIRST_RUN_LOCK_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 080 — 共享库"首次运行"加锁（066-G5 的实测失败）

## Objective

066 的 G5 真并发轮给出一手事实：**全新共享库 + 两个 opencode 首次运行 = 6/7 失败**（5×`database-is-locked`、1× workspace FK 竞态，约 0.7s 退出）；
而**初始化完成之后**的并发是 3/3 绿。结论已经写定：**"每库首次运行"需要一把锁**。本单把这把锁实现掉，让首次运行也 7/7。

## Current state

- 66 的账行：`SHARED_SESSION_STORE_PARTIAL`；G1/G2/G4 通过，**G5 未过**（首次运行失败率与码见提交 `3fefa03` 的 JSON 证据）
- 技能发现：闸门存在但**首次并行**未被串行化；"初始化后"路径已绿 ⇒ 锁的作用域应覆盖**建库/建 workspace 的窗口**

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 共享库的首次建库窗口 | 一把**按库（不是按 profile）**的锁：首次运行串行、就绪后放行 | 首次运行竞态 |
| `tests/**` | 复现脚本变成门：**冷库 + 双首跑必须 7/7 绿**；反例：去掉锁必须复现失败 | 门有牙 |

- 锁必须**有界等待**（超时即类型化失败，不永久阻塞）；不得引入全局串行（就绪后仍并行）
- 不改 wire；不改 66 已通过的 G1/G2/G4 语义

## Requirements

### Requirement: 冷库双首跑成功

#### Scenario: 全新库上两个 profile 同时首次运行

**WHEN** 在一个全新共享库上让两个 profile 各起一次首跑
**THEN** 两次都完成、`database-is-locked` 零次、`project` 恰好一行、`project_directory` 无重复

## Stages

- [x] 1. 用提交 `3fefa03` 的 JSON 复现 6/7 失败（记录复现命令与计数）（提交）
- [x] 2. 实现按库首跑锁（有界等待）（提交）
- [x] 3. 冷库 + 双首跑 7/7 + 反例（去锁复现失败）+ 刷新 66 行（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 首跑 7/7 | 冷库双首跑 7/7、零 `database-is-locked` | 去掉锁后必须复现失败 | fail (typed) |
| G2 就绪后仍并行 | 初始化后并发 3/3 绿（不因锁变串行） | 把锁做成全局即失败 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "shared or concurrency or first_run"
git diff --check && git status --short
```

## DoD

1. 实现：按库首跑锁。2. 反例：G1 去锁复现、G2 全局锁反例。3. 真实环境：冷库双首跑真跑。
4. 回归：套件计数（沿用 882 并标新值）。5. 账务：零真实模型调用。6. 账：66 行刷新 + 本单终态行。

## Acceptance

- 绿：`FIRST_RUN_LOCK_DONE`；否则 `FIRST_RUN_LOCK_PARTIAL` + 精确剩余项
