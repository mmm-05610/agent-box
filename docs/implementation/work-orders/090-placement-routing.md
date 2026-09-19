---
id: 090
slug: placement-routing
batch: b2
baseline: "4c32992"
depends_on: []
write_paths: ["src/agent_box/**", "tests/**", "docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["plugins/**", "/home/maoqh/projects/agent-box-server-round1/**"]
ruling: R-0012
terminal: ["PLACEMENT_ROUTING_DONE", "PLACEMENT_ROUTING_PARTIAL"]
waive: []
parallel_units: ["wsl-route","ssh-route"]
---

# Work Order 090 — 放置路由：WSL 工作区的执行必须去 WSL worker（否则类型化拒绝）

## Objective

实测（2026-09-19，试用）：Windows 宿主 + 标准数据根 + WSL worker env（c11）下，从 UI 发起的一轮**没有**被路由到 WSL worker，
而是回退到宿主默认 `sandbox-windows`（`bootstrap/runtime.py:862` 的 `os.name == "nt"`）⇒ `SANDBOX_PROVIDER_UNRESOLVED`，
再被包成 `DispatchAmbiguous`。**一次放置明确的执行不该走到"模糊派发"**：要么按工作区/环境声明的放置路由到 WSL worker，
要么在**派发前**以类型化码拒绝并说明缺什么。

## Current state

- 崩栈（Windows 宿主，2026-09-19）：`resolve_sandbox_port` → `SANDBOX_PROVIDER_UNRESOLVED: … 'sandbox-windows'` →
  `work_core.services.dispatch_execution` → `DispatchAmbiguous`
- 46 门当时在**同一宿主形态**（Windows Server + WSL Worker）跑过 8 家 ⇒ 路由曾经可行，需找出**与本轮条件的差异**
  （工作区如何创建/环境如何携带；部署文档里的 placement/environment 绑定）
- 应用侧对话框自述："Sessions in WSL workspaces are not part of this round yet" ⇒ 可能前端未携带环境（与 P27 配对）

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 放置解析（`runtime.py` / `sandbox_port.py` / 派发路径） | 按**工作区/环境的声明**解析放置；找不到即**派发前**类型化拒绝 | 不许回退宿主默认 |
| `tests/**` | 反例：无环境声明的执行必须类型化拒绝（**不得**报 `DispatchAmbiguous`） | 门有牙 |

- 与 P27 配对：前端负责把环境带上；本单负责**服务端正确解析与类型化**，不许把两端问题混在一起猜
- 若差异确在**部署文档**（缺 placement/environment 绑定）⇒ 记录并交回调度者（不改 46 门的部署文档）

## Requirements

### Requirement: 环境明确则路由正确

#### Scenario: WSL 工作区

**WHEN** 执行携带（或从工作区解析出）WSL 环境，且 worker 环境变量可用
**THEN** 该执行经 WSL worker 运行；证据含 worker 侧进程/通道痕迹

### Requirement: 环境缺失就拒绝

#### Scenario: 反例

**WHEN** 执行没有可解析的环境
**THEN** **派发前**类型化拒绝（码 + 缺什么 + 怎么补），**不出现** `DispatchAmbiguous`

## Stages

- [ ] 1. 复现并定位差异（对照 46 门当时的条件）（提交）
- [ ] 2. 实现按环境解析 + 派发前类型化（提交）
- [ ] 3. 反例 + WSL 工作区真跑一轮 + 账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 正确路由 | WSL 工作区的执行经 WSL worker（有痕迹） | 仍走宿主默认即失败 | fail (typed) |
| G2 派发前拒绝 | 无环境 ⇒ 类型化码（非 DispatchAmbiguous） | 出现 DispatchAmbiguous 即失败 | fail (typed) |
| G3 可复现 | 报告含复现命令与两侧条件对照 | 无对照即失败 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "placement or sandbox_port"
git diff --check && git status --short
```

## DoD

1. 实现：解析与拒绝。2. 反例：G2。3. 真实环境：WSL 工作区一轮。4. 回归：套件计数。
5. 账务：零/逐笔（若真实模型）。6. 账：本单终态行。

## Acceptance

- 绿：`PLACEMENT_ROUTING_DONE`；否则 `PLACEMENT_ROUTING_PARTIAL` + 精确差异
