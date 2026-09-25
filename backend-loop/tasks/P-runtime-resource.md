# 任务卡 P — 运行环境与资源插件组（platform）

> 2026-09-22：先读 [GOAL-START.md](../GOAL-START.md)。已切换原生 goal，
> 允许中央批准后实施；下文旧沙箱路径、fake 启动与只准准备限制由该文件覆盖。

## 输入 SHA
共同基线 `b067c5718556c8efa93b054e6573ad3d186b3cf6`。Pi 线另列，不并入。

## 必读材料
`backend-coordinated-loop.md` §P；源码只读六个插件：`/source/plugins/agent-box-runtime-local`、
`agent-box-sandbox-bwrap`、`agent-box-skills`、`agent-box-git`、`agent-box-artifacts`、`agent-box-terminal-session`；
`contracts/catalog.md`（`C-RUNTIME@v1`、`C-RES@v1`）。研究现状 + **寻找成熟可复用实现**，设计后再实施。

## 职责
- **Runtime 负责进程操作**，**Sandbox 负责隔离保证**，**资源插件负责解析 / 准备 / 释放**。
- 明确：原始资源 vs 投影、拥有 vs 借用、部分失败、重复释放。
- **不得**误删用户资源；**不得**静默从受限环境退化为裸跑；**不得**把秘密置于普通配置或日志。
- 初期**聚焦六个已列举插件**（local、bwrap、skills、git、artifacts、terminal-session）。

## 不负责什么
不定产品业务策略（S）、执行协调语义（E）、原生 ACP（H）。**Windows/WSL/旧 Web/Studio 不在本轮写入范围**。
**没有"其他所有文件"的自动兜底**——未列举即不碰。插件格局调整先与 C 协商。

## 精确写入清单
研究阶段：无产品写权，仅 `/reports /outbox /tests`。
实施阶段（APPROVED 后）：上述六个插件目录内部实现；**排除**各插件公共出口 / capability 定义（单列走契约发布）。
`work_core`、`resource_contracts` 只读。

## 接口依赖
- 提供：`C-RUNTIME@v1`（进程/隔离）、`C-RES@v1`（资源租约、释放）给 E/H。
- 消费：无（处于下层，被 E/H 调用）。资源释放操作与结果由本层定义，E 只经契约调用。

## 反例
- 沙箱不可用时静默裸跑 → 隔离保证失效，须**如实呈现能力缺失**而非退化。
- 重复释放 / 部分失败后未清理 → 误删用户资源或租约泄漏。
- 把凭据写进插件普通配置/日志 → 秘密暴露，违反边界。
- 无批准去改 `agent-box-sandbox-windows`/wsl/web/studio → 越出本轮范围。

## 方案审批条件 + Sol 规则
先研究现状 + 复用对照 + 设计，C 先审；**插件拆分/组合调整须先与 C 协商**，再由 C 决定是否调用 Sol 后批准。
P **无预留**，按风险/价值从机动额度分配；不分配时 C 可直接批准。

## 首次实施任务如何获批
某插件内部小改动（不触公共出口、不改格局）：方案经 C 审 → `approve platform <task> <逐条插件内部路径>`
→ IMPLEMENTING。涉及公共出口或插件格局 → 契约发布流程 / 交 I。

## 输出与状态格式
`/outbox/msg.platform.N.json`；`/reports/` 落现状地图、复用对照、资源生命周期（原始/投影、拥有/借用、部分失败、重复释放）矩阵。
状态按状态机；能力/凭据缺失如实 BLOCKED 交 I，不绕过、不静默退化。
