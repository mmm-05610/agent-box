---
id: 089
slug: four-real-ui-gates
batch: b3
baseline: "b2 checkpoint"
depends_on: [{"order": "082", "condition": "agent-box-env-provider tree：082-ledger-45-closeout DONE（同树，收口行见该树 status）"}, {"order": "090", "condition": "agent-box-runtime-round1 tree：090-placement-routing DONE（该树 status 记）"}, {"order": "091", "condition": "agent-box-runtime-round1 tree：`R-0056` 的判据成立——该树 status.md 的 `CP1 c1` 记账写着 091 的传输无关引擎＋进程内 G1–G4 已绿"}]
write_paths: ["docs/server-round1/fullstack/**", "docs/implementation/status.md", "scripts/server-round1/**"]
forbidden: ["src/agent_box/**", "plugins/**", "tests/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**"]
ruling: R-0011
terminal: ["FOUR_REAL_UI_GATES_DONE", "FOUR_REAL_UI_GATES_PARTIAL"]
waive: []
parallel_units: ["pi","codex"]
revisions: [{"at": "cc764a1", "what": "转录正文已有的修订（本记录由 ops 第 119 轮机械转录，内容取自该单正文的「## 修订 v2」段）：按用户裁定 R-0014（控制面=Windows）/ R-0015（广度授权给调度者）/ R-0017（假端点优先）改写四个真 UI 门的前提与成本口径。", "after_stage": 0, "ruling": "R-0014"}]
---

# Work Order 089 — 四家真实 UI 门（最终验收路径）

---

## 修订 v2（2026-09-19，用户裁定 R-0014 / R-0015 / R-0017）

**三处前提被用户裁定改写，以本节为准**：

1. **控制面就是 Windows**（R-0014，效仿 ZCode 的单一控制面设计）：执行侧（WSL/远程）只是 worker。
   ⇒ 本单**改在 Windows 侧的 Server 上验收**（真实数据根 + 真实凭据），**不再**用"Server 跑在 WSL"的试用绕行；
   前置＝**090（放置路由）与 091（控制面同步）**，它们不落地本单无意义。
   （本节以下"Current state"里"Server 必须跑在 WSL 侧"那段是**试用期的权宜之计**，被 R-0014 取代——保留以便溯源。）
2. **Stage 1 的广度＝先 pi + codex 两家**（R-0015，用户把广度判断授权给调度者）：本单**只做这两家**的端到端
   真实 UI 门（真实 Electron → **Windows Server** → wsl.exe → release Worker → bwrap → 该家 harness → **真实 DeepSeek**）。
   其余家（hermes / opencode / claude-code / dsh / kilo / qwen）**移到 100**，在本单绿之后再逐个补。
3. **成本纪律（R-0017）**：真实模型额度＝DeepSeek 账号余额，**用尽为止、不设上限**，但**机械验证一律优先假端点**
   （loopback/夹具），**真实调用只花在门本身**；逐笔记账照旧，报告里写清"本轮真实调用次数与用途"。

**验收判据（两家各一轮）**：用户在自己的 Desktop 里，选该家 profile → 发送 → 得到真实回答；
过程中的思考/工具/审批按该家能力如实出现（没有就写"该家未产生"）；失败路径至少一条（关掉凭据或指向坏端点）给类型化原因。


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
