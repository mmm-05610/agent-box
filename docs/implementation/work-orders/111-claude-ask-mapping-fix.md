---
id: "111"
slug: claude-ask-mapping-fix
batch: c2
baseline: "53583d7"
depends_on: []
write_paths: ["plugins/agent-box-harnesses/**", "src/agent_box/server/profiles/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0032
terminal: ["CLAUDE_ASK_MAPPING_DONE", "CLAUDE_ASK_MAPPING_PARTIAL"]
waive: []
parallel_units: ["single"]
revisions: [{"at": "015c91c", "what": "write_paths 增补 src/agent_box/server/profiles/**：真正的修复点在 posture_translation.py 的 translate_claude（ask 被塞进 allowedTools＝自动放行），不在 plugins 家；并裁定 profiles/** 归 runtime 线", "after_stage": 1, "ruling": "R-0032"}]
---

# Work Order 111 — claude 的权限映射：`ask` 必须映射成**会提问**（AQ-0005，用户已拍）

## Objective

**来源：R-0032 ①（AQ-0005 用户选 1）**：60 的 claude 姿态映射里，`ask` 目前**不是**映射到 claude 的**提问**语义 ⇒
"要问用户"在翻译后就变成了"不问"。**修成 `ask → permissions.ask`（一处修正）**，并**重跑 60 的翻译测试**。
**顺序硬约束**：**必须先于 `093`（原生配置落盘）落地**——否则落盘会把错的映射写进配置。

## Current state（调度者只读核对；阶段 1 请自己复核）

| 事实 | 出处 |
| --- | --- |
| **实际修复点（执行者一手定位 `015c91c`）**：`src/agent_box/server/profiles/posture_translation.py:53-81` 的 `translate_claude`——`ask` 被塞进 **`allowedTools`**（:72-77）⇒ 工具**自动放行**＝"不问"；claude 家插件里**没有** ask 映射（grep 空） | 执行者一手 + AQ-0005 的争点 |
| 60 的翻译测试（姿态逐家翻译）在 `tests/**` | 60 单的 Validation 段 |
| `093` 尚未落盘（runtime 线 `c2`） | runtime 树章程的 c2 表 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| claude 映射 | `ask → permissions.ask`（一处修正，按 claude 的原生键名与语义） | 不让"要问"被吃掉 |
| 测试 | 重跑 60 的翻译测试；若测试里断言的是旧映射，**改成新映射并写明理由**（不许放宽） | 门要跟着真相走 |
| 顺序 | 本单**先于 093**；093 的阶段 1 必须先核本单已落 | 防错映射落盘 |

**必须保持不变**：其它档位（allow/deny 等）的映射语义；claude 家的其它键；凭据纪律。
**明确不做**：顺手改别的家；改 wire；改前端（前端只消费翻译结果）。

## Requirements

### Requirement: ask 会提问

#### Scenario: 翻译

**WHEN** 把 `ask` 档翻成 claude 原生配置
**THEN** 结果是 claude 的**提问**语义（`permissions.ask`）；测试断言新映射

#### Scenario: 顺序门

**WHEN** `093` 开工时
**THEN** 本单已落地（093 的阶段 1 检查点里核到本单的提交）；未落 ⇒ 093 不得落盘

## Stages

- [ ] 1. 观测：claude 映射的现状与 60 的翻译测试断言（提交）
- [ ] 2. 修正 `ask → permissions.ask` + 测试同步（提交）
- [ ] 3. 证据 + 回归计数（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 映射 | `ask` 翻出来是 `permissions.ask` | 旧映射 ⇒ 门红 | fail (typed) |
| G2 测试 | 60 的翻译测试全绿且断言的是新映射 | 放宽断言 ⇒ 门红 | fail (typed) |
| G3 不越界 | 其它档位/其它家/前端零改动（diff 面点名） | 触碰 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/ -k "posture or claude or translate"
git diff --check && git status --short
```

## DoD

1. 修正 · 2. 测试同步 · 3. 证据与计数 · 4. 终态行。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`CLAUDE_ASK_MAPPING_DONE`；否则 `CLAUDE_ASK_MAPPING_PARTIAL` + 精确剩余

## Notes for the executor

- **必须排在 093 之前**（R-0032 ① 的顺序硬约束）；093 的阶段 1 会核本单是否已落。
- 这是"合同/口径统一"类修正，判据是**不让信息在系统中间被吃掉**（R-0032 ⑤ 的长期授权口径）。
