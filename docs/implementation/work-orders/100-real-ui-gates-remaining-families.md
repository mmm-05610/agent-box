---
id: "100"
slug: real-ui-gates-remaining-families
batch: c3
baseline: "b2 checkpoint"
depends_on: [{"order": "089", "condition": "agent-box-env-provider tree：089 收口行（四个真 UI 门）出现在该树 status"}]
write_paths: ["docs/server-round1/fullstack/**", "docs/implementation/status.md", "scripts/server-round1/**"]
forbidden: ["src/agent_box/**", "plugins/**", "tests/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**"]
ruling: R-0015
terminal: ["REMAINING_REAL_UI_GATES_DONE", "REMAINING_REAL_UI_GATES_PARTIAL"]
waive: []
parallel_units: ["per-family"]
---

# Work Order 100 — 其余家的真实 UI 门（089 之后逐个补）

## Objective

Stage 1 的广度策略是**先立住两家**（pi + codex，见 089 与 R-0015），再把其余家逐个接到同一条真实路径上。
本单就是那"其余家"：**hermes / opencode / claude-code / dsh / kilo / qwen**（以本树现状与工件齐备程度定序，
报告里写清选择依据与顺序理由）。

**与 089 的关系**：同一套门结构（真实 Electron → **Windows 侧 Server** → `wsl.exe` → release Worker → bwrap →
该家 harness → 真实 DeepSeek）；089 只做两家。**本单不重做 089 的门，只按家扩面**。

## Current state

- 089（它的第二版修订）已确立：控制面＝Windows（R-0014）、广度＝授权给调度者（R-0015）、成本＝假端点优先（R-0017）。
- 各家状态以本树 `status.md` 的"四家封装就绪/真实门"行与工件清单为准；**未核实项写"未验证"**，不猜。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 逐家 | 按 089 的门结构补真实 UI 门；家与家的顺序按"工件齐备 + 已有真实门证据 + 用户使用概率"排 | 扩面 |
| 报告 | **逐家**一行：终端码、门的计数、真实调用次数与用途、失败路径证据、未过项 | 可审计 |
| 顺序 | 建议 hermes → opencode → claude-code → dsh → kilo → qwen（可改，但要在报告里给理由） | 与既有封装/门证据对齐 |

**必须保持不变**：089 已确认的路径与前提（Windows 控制面）；假端点优先的成本纪律（R-0017）；
不把"封装就绪"写成"模型门已过"。

**明确不做**：为凑齐家数放宽门；把某家的失败悄悄标成 PARTIAL 而不列证据。

## Requirements

### Requirement: 逐家真实 UI 门

#### Scenario: 一家一轮

**WHEN** 对某家跑门：选该家 profile → 发送 → 真实 DeepSeek 回答
**THEN** 终端码 + 计数 + 真实调用次数齐；思考/工具/审批按该家能力如实记录（没有就写"该家未产生"）；
失败路径至少一条给类型化原因

#### Scenario: 未备齐的家如实标注（反例）

**WHEN** 某家工件不齐或门结构不适用
**THEN** 写 `PARTIAL` 并列出缺什么；gate 的反例：把未跑的家写成 DONE 必须门红

## Stages

- [ ] 1. 观测：逐家现状（工件、既有门证据、缺口）与顺序理由（提交）
- [ ] 2. 逐家补门（每家一次提交，报告里逐家成行）（提交）
- [ ] 3. 全量收口与账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 逐家 | 每家一行：终端码/计数/真实调用/失败路径 | 缺任一项必须门红 | 未跑写"未跑" |
| G2 成本纪律 | 机械部分用假端点；报告写真实调用次数与用途 | 用真机跑机械验证必须门红 | fail (typed) |
| G3 诚实 | 未备齐的家标 PARTIAL 并列出缺口 | 标 DONE 必须门红 | fail (typed) |

## Validation

```bash
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 逐家实现/观测 · 2. 反例（G2/G3）· 3. 真实环境（每家有证据）· 4. 回归计数 · 5. 账务与清理 · 6. status 分账。
缺一项 ⇒ `REMAINING_REAL_UI_GATES_PARTIAL`。

## Acceptance

- 绿：`REMAINING_REAL_UI_GATES_DONE`
- 否则：`REMAINING_REAL_UI_GATES_PARTIAL` + 逐家剩余

## Notes for the executor

- 本单在 **b3 之后**（089 绿了再开）；广度顺序可调但要在报告里给理由（R-0015 把该判断授权给调度者，执行者按单执行）。
- 成本：DeepSeek 额度是本阶段的稀缺资源（R-0017），**假端点优先**。
