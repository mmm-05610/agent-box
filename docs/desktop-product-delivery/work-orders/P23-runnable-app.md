---
id: P23
slug: runnable-app
batch: Q2
baseline: "84818534"
depends_on: []
write_paths: ["apps/desktop/**", "scripts/**", "docs/desktop-product-delivery/**", "tests-js/**"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0004
terminal: ["RUNNABLE_APP_DONE", "RUNNABLE_APP_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order P23 — 让当前代码真的能跑起来（补 Q1 的 DoD-3）

## Objective

Q1 的检查点报告写了"**未跑**：真实构建产物跑一遍应用（环境无 electron 二进制）"。这一条不补上，"试用"就无从开始。
本单把**运行环境**做出来：在当前源码上装好 Electron、把 Windows 侧运行时从**当前**代码重建（现存两份都是旧副本：
无 `work-status` 新面）、并给出**一条能起应用的命令**与**一条起真实后端的命令**。

## Current state（第一手，2026-09-19 实测）

- WSL 工作树**有**根 `node_modules`；`apps/desktop/node_modules/electron` **不存在**
- Windows 侧两份副本都**过时**：`C:\Users\maoqh\agentbox-wsl-round1`（无 electron、无 `work-status`）、
  `C:\agentbox-uigate46\desktop`（46 门时期的副本，features 仍是 Hermes 时代目录）
- 旧的服务脚本 `/mnt/c/agentbox-uigate46/desktop-serve.ps1`：**形状正确**（在 Windows 用 `%LOCALAPPDATA%\AgentBox\r4c9-env` 的 Python
  跑 `\\wsl.localhost\...\agent-box-env-provider` 的 Server，port 18770，`--data-root` 在 `%LOCALAPPDATA%\AgentBox\desktop`），
  但**钉的是旧 worker bundle `c8`**，需换成当前 bundle
- 桌面侧有 `npm run dev`（vite + electron）与 `npm run dev:mock`（本地 mock server）两个入口

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `apps/desktop` 依赖 | 装 Electron（WSL 侧，经 WSLg 显示；或 Windows 侧副本） | 现在跑不起来 |
| Windows 运行时 | 用**当前**源码重建一份（目录/脚本写进证据，不写进仓库） | 现存两份过时 |
| `scripts/`（本仓） | 一条**起应用**脚本 + 一条**起真实后端**脚本（后者指向当前 bundle 与 deployment） | 试用入口 |
| 证据 | 截图或日志摘要：应用起得来、四个新面可见 | Q1 的 DoD-3 |

- Windows 侧路径**不进仓库**（写进证据时用 `<win-runtime>` 占位）；凭据仍只作 locator
- 若 Electron 在当前环境确实装不起来 ⇒ **如实记录**（含命令与错误），不要用 mock 冒充真实应用

## Requirements

### Requirement: 一条命令起应用

#### Scenario: 从当前源码起

**WHEN** 在干净环境按本单给出的命令执行
**THEN** 应用窗口出现，且**四个新面可见**（Git 卡 / 记忆分区 / 执行清单卡 / 角色页增量）；命令与输出摘要进证据

### Requirement: 一条命令起真实后端

#### Scenario: 应用连真实 Server

**WHEN** 按脚本起真实 Server（当前 bundle + 当前 deployment）后再起应用
**THEN** 四个新面显示**真实**取值（或该方法不可用时的类型化原因），**不是** mock 数据

## Stages

- [ ] 1. 装 Electron 并记录实际可行路径（WSL / Windows 二选一并写明理由）（提交）
- [ ] 2. 重建 Windows 运行时（当前源码）并写两条入口脚本（提交）
- [ ] 3. 起应用 → 截图/日志证明四新面可见（提交）
- [ ] 4. 起真实后端并复跑一次（真实取值或类型化原因）+ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 真应用 | 证据含应用窗口与四新面的截图/日志 | 用 `dev:mock` 冒充"真实应用+真实后端"即失败 | fail (typed)：装不起来就如实记未跑 |
| G2 真后端 | 四个面显示来自 Server 的取值或类型化原因 | mock 数据充当真实取值即失败 | fail (typed) |
| G3 无宿主路径入库 | `git diff --check` 且新增文件无 Windows 绝对路径 | 写入 `C:\...` 即失败 | fail (typed) |

## Validation

```bash
cd apps/desktop && npm run dev        # 或本单产出的 scripts 入口
git diff --check && git status --short && grep -rn "C:\\\\" docs/desktop-product-delivery/evidence/ | head -3
```

## DoD

1. 实现：两条入口脚本 + 运行时。2. 反例：G1/G2 各演练一次。3. 真实环境：应用真起、真连。
4. 回归：四项检查计数入账。5. 账务：`§Spend` + 清理。6. 账：本单终态行 + "怎么起"写进证据（供用户照抄）。

## Acceptance

- 绿：`RUNNABLE_APP_DONE`；否则 `RUNNABLE_APP_PARTIAL` + 精确阻塞（哪一步、什么错误）
