---
id: 091
slug: control-plane-sync
batch: b2
baseline: "4c32992"
depends_on: []
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**"]
ruling: R-0012
terminal: ["CONTROL_PLANE_SYNC_DONE", "CONTROL_PLANE_SYNC_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 091 — 控制面同步：首次部署 + 增量 + 凭据只在 Windows（每执行投影）

## Objective

按 **R-0012** 实现：**Windows 侧是控制面的权威**（profile、供应商/模型记录、权限规则、指令/资产绑定、工作区记录），
**执行侧**（WSL 或被管理的远端）在**首次连接时**得到一次**部署**，之后每次变更**增量同步**；**凭据内容只在 Windows 侧持有**，
执行侧只在**每次执行**时拿到**一次性投影**，**不进执行侧的持久存储**。**原生 home 与会话仍按平台、不迁移**（跨平台执行＝新的原生会话，保持 45 的语义）。

## Current state

- R-0012 取代 45 §6 中"控制面记录也不同步"的部分；45 §6 其余（home/会话按平台）保持
- 现状：执行侧的记录要么为空（新根）、要么靠手工脚本灌（`desktop-setup.py` 那套）；**没有**"首次连接自动部署 + 变更增量"的机制
- 凭据现状：Windows 根有 2 条（DPAPI 侧），执行侧按执行由部署文档的 `credentialEnvironment` 注入（一次性投影已在 45 §13/56 的规则里）

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 连接建立（执行侧接入/hello 阶段） | **首次部署**：把受同步集合全量推过去；记部署清单与摘要 | 首次连接 |
| 记录变更路径 | **增量同步**：变更即推（幂等键 + 版本号），失败可重放 | 后续变更 |
| 凭据 | 只在 Windows 侧持有；每次执行**一次性投影**到执行侧运行时 | 密钥不落执行侧 |

- **同步集合**（写进文档并逐项实现）：profile 记录（含权限规则/模型槽/指令与资产绑定）、provider/model 记录、工作区记录；
  **不含**：原生 home、会话与转写（按平台）、**凭据内容**
- **冲突规则**：Windows 胜；执行侧不接受"本地改记录"（类型化拒绝并提示在 Windows 侧改）
- 不改 wire 的方法数/形状（若确需新方法 ⇒ 停下交回，与 51–65 同一批重锁）

## Requirements

### Requirement: 首次连接部署

#### Scenario: 空执行侧

**WHEN** 一个空的执行侧首次被接入
**THEN** 受同步集合在两侧**逐项一致**（有部署清单与逐项摘要）；执行侧随后可列出同样的角色/模型

### Requirement: 变更增量

#### Scenario: Windows 侧改一条

**WHEN** 在 Windows 侧修改某条记录
**THEN** 执行侧在下一次同步后与该条一致；重复投递幂等（同版本不重复应用）

### Requirement: 凭据不落执行侧

#### Scenario: 反例

**WHEN** 在执行侧全盘扫描注入值
**THEN** **零命中**（凭据只在执行进程的运行时投影里，不落持久存储）

## Stages

- [ ] 1. 同步集合与冲突规则写进文档（提交）
- [ ] 2. 首次部署（含清单与摘要）（提交）
- [ ] 3. 增量同步（幂等 + 版本）（提交）
- [ ] 4. 凭据投影路径 + 零命中反例 + 收口（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 首次部署 | 空执行侧接入后逐项一致（清单+摘要） | 只同步一半即失败 | fail (typed) |
| G2 增量幂等 | 同版本重复投递不重复应用；改动必达 | 丢一条改动即失败 | fail (typed) |
| G3 凭据零落盘 | 执行侧零命中注入值 | 命中即失败 | fail (typed) |
| G4 冲突 Windows 胜 | 执行侧改记录 ⇒ 类型化拒绝 | 静默接受本地改即失败 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "sync or replicate"
grep -rn "sk-\|DEEPSEEK_API_KEY" <执行侧根> 2>/dev/null | grep -v credentialEnvironment || echo "零命中 ✓"
git diff --check && git status --short
```

## DoD

1. 实现：部署 + 增量 + 投影。2. 反例：G1/G2/G3/G4 各一。3. 真实环境：Windows ↔ WSL 一次真实部署与一次增量。
4. 回归：套件计数。5. 账务：零/逐笔。6. 账：本单终态行 + 同步集合清单。

## Acceptance

- 绿：`CONTROL_PLANE_SYNC_DONE`；否则 `CONTROL_PLANE_SYNC_PARTIAL` + 精确剩余
