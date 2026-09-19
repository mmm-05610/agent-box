---
id: 086
slug: subagent-harness-round
batch: b2
baseline: "4c32992"
depends_on: []
write_paths: ["src/agent_box/**", "plugins/agent-box-harnesses/**", "tests/**", "docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**"]
ruling: R-0003
terminal: ["SUBAGENT_HARNESS_ROUND_DONE", "SUBAGENT_HARNESS_ROUND_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "已收口的历史单：执行时未拆分单元，补记为单线程（不是本单引入的并行缺口）；再次触碰时按当时实际重declared。"
parallel_units: []
---

# Work Order 086 — 65 最后一圈：真 harness 父侧自发起 tools/call

## Objective

65 已过真桥端到端（真 `subagent-bridge.mjs` 进程 → stdio MCP → 按次令牌 → loopback 委派端点 → 真本机通道子执行 →
有界摘要），但**父侧是夹具驱动**的："真 harness 自己发起 `tools/call`"这一圈因夹具形态限制未做。
本单用一家真实 harness（选**最省的一家**，例如 pi）把它跑出来：父轮由**真 harness** 发起子调用，Server 侧
按 65 的规则执行子轮并回摘要。

## Current state

- 65 账行：`PARTIAL`，剩余写明"受夹具限制的真 harness 父侧自发起 tools/call 一圈未做"
- 桥与服务端实现齐备（`subagents.py`、委派服务、审批镜像、父 deny 继承、并发 3/3）
- 授权：真实模型按 R-0011（仍逐笔记账）

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 真 harness 一轮 | 父轮内由 harness 自己发起 `tools/call run_subagent` | 补最后一圈 |
| 证据 | 摘要、日志、`parent_turn_id`、记账 | 可复核 |

- 若某家 harness 的工具表**不播发**我们的工具（例如 ACP 工具面缺失）⇒ **如实记录并把该家排除**，改用下一家；
  三家都不可行 ⇒ `PARTIAL` + 证据（不得用夹具冒充）

## Requirements

### Requirement: 父侧是 harness 自己发起的

#### Scenario: 一轮真实父轮

**WHEN** 真实 harness 完成一轮并在其中调用 `run_subagent`
**THEN** 账本里能看到：父轮带工具的调用记录、子轮 `parent_turn_id` 指向父轮、父轮收到**有界摘要**；且用量归属到父轮

### Requirement: 不可播发就诚实排除

#### Scenario: 反例

**WHEN** 目标 harness 不播发我们的工具
**THEN** 报告写明"该家排除 + 原因（工具表/协议缺口）"，不用夹具结果替代

## Stages

- [ ] 1. 选家并核对工具播发（提交）
- [ ] 2. 真 harness 父轮一轮（含子调用）（提交）
- [ ] 3. 归属/摘要/审批/取消四项核对 + 65 收口（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 真 harness | 证据含该家 harness 的进程/协议痕迹（不是夹具） | 夹具冒充即失败 | fail (typed) |
| G2 归属 | 子轮用量记在父轮、`parent_turn_id` 正确 | 归属错即失败 | fail (typed) |
| G3 记账 | 真实请求逐笔（R-0011 口径） | 无记账即失败 | fail (typed) |

## Validation

```bash
grep -rn "run_subagent" docs/server-round1/fullstack/*.md | tail -5
python3 -m pytest -q tests/server -k subagent
git diff --check && git status --short
```

## DoD

1. 实现：无（补一圈）。2. 反例：G1。3. 真实环境：真 harness 一轮。4. 回归：套件计数。
5. 账务：真实请求逐笔 + 清理。6. 账：65 行 + 本单终态行。

## Acceptance

- 绿：`SUBAGENT_HARNESS_ROUND_DONE`；否则 `SUBAGENT_HARNESS_ROUND_PARTIAL` + 精确剩余（含被排除的家与原因）
