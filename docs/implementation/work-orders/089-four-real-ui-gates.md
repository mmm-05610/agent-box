---
id: 089
slug: four-real-ui-gates
batch: b3
baseline: "b2 checkpoint"
depends_on: [{"order": "082", "condition": "merged into main as <sha>"}]
write_paths: ["docs/server-round1/fullstack/**", "docs/implementation/status.md", "scripts/server-round1/**"]
forbidden: ["src/agent_box/**", "plugins/**", "tests/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**"]
ruling: R-0011
terminal: ["FOUR_REAL_UI_GATES_DONE", "FOUR_REAL_UI_GATES_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 089 — 四家真实 UI 门（最终验收路径）

## Objective

长期目标的最后一段：在**真实 UI 路径**上逐家跑通一轮——真实 Electron → Server → `wsl.exe` → release Worker →
bwrap → 该家 harness → **真实 DeepSeek**（R-0011 已授权；逐笔记账）。四家选**已有真实门证据且工件齐**的
（例如 codex / pi / hermes / claude-code，具体以本树现状为准并在报告里写清选择依据）。

## Current state（试用轮的第一手教训，别重走）

- **Server 必须跑在 WSL 侧**：Windows 宿主会把执行解析成 `sandbox-windows`，而 Windows 侧**没有 harness 工件**
  （48 的门槛 B 从未通过）⇒ 第一轮派发即 `SANDBOX_PROVIDER_UNRESOLVED`。试用的 Server 现跑在 WSL（Linux 本地通道 + bwrap）。
- 应用的连接**只认环境变量**：`ORDESSA_SERVER_ROOT`（=Server 的 `--data-root`）+ `ORDESSA_SERVER_PORT`；
  与 `connection.json` 的 URL 无关（试用 runbook：`docs/server-round1/try-checkpoints.md`）。
- 真实请求按 R-0011 记账：请求数、tokens、估算费用，逐家逐轮。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 四家 × 真实 UI 一轮 | 走 UI 路径发出真实请求并拿到答复 | 最终验收 |
| 证据 | 每家的门报告、请求计数、费用、清理 | 可复核 |

- **只跑不改**：本单不改实现；发现缺陷 ⇒ 记录 + 交回（由调度者派单）
- 不碰凭据内容：只作 locator；报告只写路径与权限位

## Requirements

### Requirement: 每家一轮真实答复

#### Scenario: 单家

**WHEN** 从 UI 发出一个最小提示
**THEN** 拿到真实模型答复；账本记下该轮 usage 与 `source`；父侧无凭据泄漏；清理干净

### Requirement: 不可跑的家如实记录

#### Scenario: 反例

**WHEN** 某家因工件/部署/协议缺口跑不通
**THEN** 报告写明"该家 + 缺口 + 已有证据"，**不用假端点结果冒充**

## Stages

- [ ] 1. 环境就绪（WSL Server + 应用连上 + 一家试通）（提交）
- [ ] 2. 四家逐家真实一轮（提交）
- [ ] 3. 记账 + 清理 + 收口（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 真实路径 | 每家的证据含真 Electron + 真 Worker + 真模型答复 | 假端点冒充即失败 | fail (typed) |
| G2 记账 | 请求数/tokens/费用逐家逐轮 | 无记账即失败 | fail (typed) |
| G3 零泄漏 | 证据/日志/argv 零凭据命中 | 命中即失败 | fail (typed) |

## Validation

```bash
ls docs/server-round1/fullstack/ui-gates-89/ 2>/dev/null | head
grep -rn "sk-\|DEEPSEEK_API_KEY" docs/server-round1/fullstack/ui-gates-89/ 2>/dev/null | grep -v "credentialEnvironment" || echo "零命中 ✓"
git diff --check && git status --short
```

## DoD

1. 实现：无（验收轮）。2. 反例：G1/G3。3. 真实环境：四家真跑。4. 回归：套件沿用最近计数并标提交。
5. 账务：真实请求逐笔 + 清理证据。6. 账：本单终态行 + 费用合计。

## Acceptance

- 绿：`FOUR_REAL_UI_GATES_DONE`（四家全过）；否则 `FOUR_REAL_UI_GATES_PARTIAL` + 逐家结果与缺口
