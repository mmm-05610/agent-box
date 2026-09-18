---
id: 082
slug: ledger-45-closeout
batch: b2
baseline: "4c32992"
depends_on: []
write_paths: ["docs/implementation/status.md", "docs/server-round1/fullstack/native-home-storage.md"]
forbidden: ["src/**", "plugins/**", "tests/**", "/home/maoqh/projects/agent-box-server-round1/**"]
ruling: R-0002
terminal: ["LEDGER_45_CLOSEOUT_DONE", "LEDGER_45_CLOSEOUT_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 082 — 45 收口：G3 已 pass，把 PARTIAL 转 DONE

## Objective

067 让 **45-G3**（同一 profile 两个并行轮都完成）在**当前基线上通过**（提交 `460781c` 记录：两轮都完成、
同会话排队、运行中切绑定被拒）。45 现在唯一未过的门没了 ⇒ 把 45 的账行从 `NATIVE_HOME_STORAGE_PARTIAL`
转为 **DONE**，并在 45 的报告里补一条注记（写明 G3 由 067 的后置复跑转 pass、基线、提交）。**只写账与报告注记。**

## Current state

- 45 账行现为 `NATIVE_HOME_STORAGE_PARTIAL`，理由是 G3 未过；G7 记部分覆盖
- `460781c` 的提交信息与 67 的账行都写着 "G3/45-G3 pass in both runs"
- 45 的报告文件：`docs/server-round1/fullstack/native-home-storage.md`

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 45 账行 | 终态改为 DONE（保留 G7 的部分覆盖说明） | G3 已 pass |
| 45 报告 | 追加"G3 转 pass"的注记（提交、基线、复跑命令） | 可追溯 |

- 不改代码、不改其它账行；若与 45 报告既有文字冲突，以**实测记录**为准并把冲突写进报告

## Requirements

### Requirement: 终态与证据一致

#### Scenario: 查 45 的终态

**WHEN** 读 45 的账行与报告注记
**THEN** 终态为 DONE，注记引 `460781c` 与复跑结论，且不含"G3 未过"的残留表述

## Stages

^- [x] 1. 核对 `460781c` 的结论与 67 账行（提交）
^- [x] 2. 改 45 终态 + 报告注记（提交）
^- [x] 3. 自查：全文件搜索"G3"确认无矛盾（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 终态 | 45 行含 `NATIVE_HOME_STORAGE_DONE` | 保留 PARTIAL 且无注记即失败 | fail (typed) |
| G2 可追溯 | 注记含 `460781c` 与复跑命令 | 注记无提交引用即失败 | fail (typed) |

## Validation

```bash
grep -n "NATIVE_HOME_STORAGE" docs/implementation/status.md | head -3
grep -n "460781c" docs/server-round1/fullstack/native-home-storage.md | head -3
git diff --check && git status --short
```

## DoD

1. 实现：只改账与报告。2. 反例：G1 的残留表述演练。3. 真实环境：提交可查。4. 回归：无代码改动。
5. 账务：零调用。6. 账：本单终态行。

## Acceptance

- 绿：`LEDGER_45_CLOSEOUT_DONE`；否则 `LEDGER_45_CLOSEOUT_PARTIAL` + 剩余项
