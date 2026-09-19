---
id: 068
slug: ledger-catchup
batch: b1
baseline: "e39959f"
depends_on: []
write_paths: ["docs/implementation/status.md"]
forbidden: ["src/**", "plugins/**", "tests/**", "docs/implementation/work-orders/**"]
ruling: R-0002
terminal: ["LEDGER_CATCHUP_DONE", "LEDGER_CATCHUP_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "已收口的历史单：执行时未拆分单元，补记为单线程（不是本单引入的并行缺口）；再次触碰时按当时实际重declared。"
parallel_units: []
---

# Work Order 068 — 本树执行账补齐（60–65 终态 + 52/54/55 刷新）


## Objective

本树的 `status.md` 落后于本树自己的提交：**60–65 没有终态行**，`52`/`54`/`55` 的行仍写着提交里已经推进过的状态。
本单把账补齐，使主树的观察与合并评审有据可依。**不改任何代码、不改任何契约**——只写账。

## Current state

- `git log` 显示 60–65 均有提交（`ff0c578` 61、`76e7c35` 62、`4d7b0e0` 63、`faaeedf` 64、`6854e4c`/`07b43fa`/`e39959f` 65、`27dfa26`/`3b73c7d` 60），
  但 `status.md` 无 `| [60] |`…`| [65] |` 行（实测 `grep -c '^| \[6[0-5]\]'` = 0）。
- `52` 的行仍写"真 harness 观测轮待做"，而 `3e945b3` 已跑完并记为否定观测；`54`/`55` 的行同样未反映同一轮的实测值。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `docs/implementation/status.md` | 补 6 行（60–65）+ 刷新 3 行（52/54/55） | 账落后于提交 |

- 每行的**终态**必须与证据一致：DONE / PARTIAL / 未做，三者选一，并写清剩余项
- 数字必须能追溯（提交 sha、门报告路径、套件计数）；**不得沿用旧数字冒充当前**
- 不改代码、不改契约、不重跑套件（沿用最近一次实测并标明其提交）

## Requirements

### Requirement: 每个已完成单有一行可追溯的终态

#### Scenario: 查到 60–65 的行

**WHEN** 在 `status.md` 搜索 `| [60] |` 至 `| [65] |`
**THEN** 六行都存在，各含终态、证据指针与（若有）剩余项，且其声明的提交在当前分支可达

### Requirement: 陈旧行被刷新而不是追加

#### Scenario: 52/54/55 的行反映最近一次实测

**WHEN** 阅读 52/54/55 三行
**THEN** 它们描述的是最近一次真实运行的结果（含否定观测，如"四类过程事实零出现"），并标出剩余项；
不出现"待做"但实际已做、或"已完成"但无证据的措辞

## Stages

- [x] 1. 逐单核对提交与证据，写下六行终态（提交）
- [x] 2. 刷新 52/54/55 三行，标出剩余项（提交）
- [x] 3. 自查：任一行的数字都能在提交/报告里找到（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 行数 | `grep -c '^| \[6[0-5]\]' status.md` = 6 | 删掉一行即失败 | fail (typed) |
| G2 可追溯 | 六行引用的每个 sha 都 `git cat-file -e` 通过 | 写一个不存在的 sha 即失败 | fail (typed) |
| G3 不冒充 | 无证据的单写 PARTIAL/未做，而非 DONE | 把仅有代码提交、无门的单写成 DONE 即失败 | fail (typed) |

## Validation

```bash
grep -c '^| \[6[0-5]\]' docs/implementation/status.md
for s in $(grep -oE '\b[0-9a-f]{7,40}\b' docs/implementation/status.md | sort -u | head -20); do git cat-file -e "$s" || echo "MISSING $s"; done
git diff --check && git status --short
```

## DoD

1. 实现：只改 `status.md`。2. 反例：G2 的"不存在的 sha"与 G3 的"无门却写 DONE"各演练一次（写在报告里）。
3. 真实环境：`git log` 与门报告可查。4. 回归：无代码改动，套件不计。5. 账务与清理：无临时文件。
6. 账：本单自身在 `status.md` 有一行终态。

## Acceptance

- 绿：`LEDGER_CATCHUP_DONE`
- 否则：`LEDGER_CATCHUP_PARTIAL` + 精确剩余项与证据
