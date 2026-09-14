# Desktop产品交付状态（执行工作树维护）

调度：ACTIVE_EXECUTOR_INCREMENT_AVAILABLE。本文件是产品工作树的执行事实；
发布源初始表不代表实时状态。消费文档更新时保留执行状态行，只合入规则/新订单。

## 执行快照（handoff-policy 每阶段必填）— 接管施工中

- updated_at: 2026-09-14 09:39 (+08:00)
- 执行者: Codex 前端产品 goal（接力会话）；**已从暂停的 Zcode 执行者接管**
- 工作树/分支: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product
- 接管核验: 用户指定交接 HEAD `5c0fbfe` 与实际 HEAD
  `5c0fbfe119de5c2fe979e3964ad59223767398d7` 一致；接管前 `writer_lease=RELEASED`；
  未发现该工作树、Windows 构建树的 Electron/Vite/Vitest/Playwright/验收驱动进程；
  dirty 集合仅为下列 4 项已授权交接改动。发布源规则文件与本执行树逐文件 SHA-256 一致，
  保留本文件实时进度，不复制发布源初始状态。
- 代码检查点（已提交 HEAD）: `df84838`（P02A GREEN）
  链: ebb1233（P00）→ 8d4b3df/47b5b47/dbb902f（P01 代码与几何修复）→ 26b32fc（P01 GREEN 证据）
  → 468e6ac/d7e9a57（发布源 d3c0196+ffbcfaf 导入）→ 893d560（P07 检查点2 wire-v1）
  → 957a523（P02A 盘点）→ 07f5386（P02A slice 1：失败面非阻塞）→ 3a25edc（P02A slice 2）
- 已消费发布文档提交: 86d5a7b、61c7ff7、d3c0196、ffbcfaf
- 当前检查点改动: P02B1 将侧栏项目、项目新会话、命令面板项目项、打开文件夹统一到
  Workspace 本地草稿；删除主面已占用时提前 `session.create` 的 tile 分支。
- 当前阶段: P00 GREEN；P01 GREEN；P07 检查点 1–2 完成；**P02A GREEN，P02B1 待提交**
- 完成范围: P00；P01 全部返修（真机 27 PASS）；P07 检查点 1（语义映射）、检查点 2
  （wire-v1 PROPOSED_WIRE：17 方法 + 12 项 schema 测试 + JSON Schema 工件）；
  P02A（失败面非阻塞+可关闭、Artifacts 页退役、失败终态竞态修复与真机门）
- 下一项: 提交 P02B1；继续 B2 版本化 Workspace/Session 草稿；并行消费 P07 后端 wire 机械反馈。
- 阻断: 无真实阻断。剩余 P02B–D（上层产品）、P07 检查点 3（§9 fixture 矩阵）、
  P03/P04/P05/P06 均未开工或待续

- contract_semantics_version: core-semantics/1（APPROVED_SEMANTICS，2026-09-14）
- wire_version/schema_digest: wire-v1 PROPOSED_WIRE；权威 sha256:8e20ccd3e0718214，
  工件 sha256:cd80103b3effbc4e（contracts/wire-v1/README.md 登记）；后端 wire-review.md
  已出现但首段仍基于“P07 候选未产出”的旧时点，正在按实际双方文件机械核对
- 合同测试: 12 项 schema/信封测试通过（src/types/wire/wire-v1.test.ts）；
  覆盖缺口 = core v1 §9 九组场景的完整 fixture 矩阵（P07 检查点 3，未开工）
- UI_READY: 侧栏工作区列表（36R+P01）真机全绿；P02A 真机 8 PASS / 0 FAIL / 1 PENDING
- CONTRACT_CLIENT_READY: 否（wire 未锁定）
- REAL_FLOW_VERIFIED: 否（无真实 Server/Harness 链路证据）

- frontend_implementation: PARTIAL（P02A GREEN；B/C/D 待施工）
- writer_lease: **ACTIVE — Codex frontend goal**（2026-09-14 09:20 +08:00 接管；
  后端工作树只读，Windows 构建/验收资源串行）

## 测试与基线（接力会话实跑）

- 本地：P02A 相关组件/连接面 3 files / 22 tests passed；合并面 3 files / 31 tests passed；
  改动文件 ESLint 0 error / 0 warning；三项目 typecheck 通过；`git diff --check` 干净。
- Windows P02A：`docs/validation/windows-acceptance-p02a/runs/` 保留 p02a6/p02a7 两轮
  7 PASS / 1 FAIL / 1 PENDING 诊断证据；p02a8 最终 **8 PASS / 0 FAIL / 1 PENDING，exit 0**。
  PENDING 为无可达后端时的健康启动探针；所有失败态非阻塞必需门已执行并 PASS。

## 测试与基线（上一执行者交接时点，历史）

- 本地（WSL，`3a25edc` + 未提交改动）:
  - `npx vitest run --project ui src/components/boot-failure-overlay.test.tsx
    src/components/desktop-install-overlay.test.tsx src/components/onboarding src/store/boot.ts`
    → 3 files / 29 tests passed，exit 0
  - `npx vitest run --project ui src/components/boot-failure-overlay.test.tsx` → 11/11
  - `npm run typecheck`（renderer+electron+e2e 三项目）→ 0 error
  - `npx eslint`（本轮改动文件）→ 0 error / 0 warning
  - `git diff --check` → 干净
  - 更早基线：P01 期间 sidebar 全量 241 项、store 全量 1465 项、app+lib 1886 项通过；
    层序守卫 15/16，唯一失败 = 已知环境基线（`leaves no in-flight exclusion stale`，
    IN_FLIGHT 含 agentbox 而干净树无 `src/agentbox/`；未复制 POC、未删守卫、账本 md5 不变）
- Windows 真机:
  - P01：`docs/validation/windows-acceptance-round36r-p01/`，executed 27 →
    PASS 27 / FAIL 0 / SKIP 2 / PENDING 1，exit 0
  - P02A（切片 1–2 + 部分 3）：`docs/validation/windows-acceptance-p02a/`（p02a4），
    executed 9 → PASS 7 / FAIL 2，**2 项 FAIL 均为驱动断言问题，非产品缺陷**：
    ① 面板断言依赖本地化文案（已改稳定钩子，未重跑）；② 无后端沙箱下 healthy 探针被
    boot 连接遮罩挡住（已改为等遮罩清空或如实 PENDING，未重跑）
  - Windows 构建树 `C:\Users\maoqh\agentbox-wsl-round1` 已同步切片 3 的源码
    （onboarding 门控修复 + 面板/关闭钩子 + 新驱动，三文件 md5 与 WSL 一致），
    dist 已于源码之后重建（index.html mtime 09:14:17 > 源码 09:13:49）；
    **驱动重跑被暂停中止**（p02a5 acceptance-out 为空，未入库）→ 接手者只需跑驱动，不必重建
- 中间产物（本轮可证归属，保留备查不对外引用）：`C:\Users\maoqh\agentbox-wsl-p02a{,2,3,4,5}-sandbox`
、`/home/maoqh/p01r{4,5,6,7}-run.log`、`apps/desktop/test-results/`（gitignored）
- 网关状态: 隔离网关 `127.0.0.1:9127` 当前**未运行**（curl 连接被拒）；需要健康启动真机证据时
  按 36R 文档启动 `"$HOME/wsl-round1-gateway-home/start-gateway.sh"`（不碰用户真实配置）

## 工单状态（实际进度）

调度维护：已消除P06“等用户体验才交接”的歧义；核心wire通过contracts/index规定的后端
wire-review.md通道自39阶段协调。执行者下个检查点消费这些规则，不覆盖本端已有进度。

| 工单 | 状态 | 前置 |
| --- | --- | --- |
| P00 接管与基线 | GREEN | 旧Desktop会话无并发写入（evidence/P00.md） |
| P01 36R收口 | GREEN | 真机 27 PASS/2 SKIP/1 PENDING（evidence/P01.md；本地打开 PENDING 转 P05） |
| P02 上层产品 | IN_PROGRESS（P02A GREEN；P02B1 实现待提交；B2–D 待施工） | P01 已满足 |
| P03 用例状态与API | READY_AFTER_P02 | P02 |
| P04 宿主与遗留退役 | READY_AFTER_P03 | P03 |
| P05 正式合同接入 | SEMANTICS_AVAILABLE_WIRE_PENDING | core-semantics/1已批准；P07编制；真实服务证据另计 |
| P06 前端验收与交接 | IMPLEMENTATION_HANDOFF_GATE | 本端独立范围完成；真实全栈门由后续集成人负责 |
| P07 核心合同与状态交接 | 检查点1完成；检查点2=wire-v1 编制 | 与P02–P05串行穿插 |

## 测试与证据基线（本轮实跑）

- 本地：sidebar 全量 241 项通过（含 3 条 P01 装配反例）；三项目 typecheck exit 0；
  改动文件 eslint 0/0；层序账本 md5 57011a54… 逐字节不变；层序守卫 15/16，
  唯一失败=已知环境基线（IN_FLIGHT 含 agentbox，干净树无 src/agentbox/），未复制 POC。
- Windows：`docs/validation/windows-acceptance-round36r-p01/`（p01r7，exit=0，
  24 截图+log）；36R postfix 旧证据原样保留；r1–r6 迭代失败史见 evidence/P01.md §3。

初始36R基线39291df，整体PARTIAL。38研究READY_FOR_DECISION，不是Harness生产依赖批准。
不继承旧GREEN，不因工单文件存在宣称功能已交付。
