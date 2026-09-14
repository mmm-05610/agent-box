# Desktop产品交付状态（执行工作树维护）

调度：ACTIVE_EXECUTOR_INCREMENT_AVAILABLE。本文件是产品工作树的执行事实；
发布源初始表不代表实时状态。消费文档更新时保留执行状态行，只合入规则/新订单。

## 执行快照（handoff-policy 每阶段必填）— 交接记录

- updated_at: 2026-09-14 04:10 (+08:00)
- 执行者: 前端产品 goal（本会话）；**交回原因：用户指示暂停新增施工并交接写权**
- 工作树/分支: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product
- 代码检查点（已提交 HEAD）: `3a25edc`（P02A slice 2：退役全局 Artifacts 页）
  链: ebb1233（P00）→ 8d4b3df/47b5b47/dbb902f（P01 代码与几何修复）→ 26b32fc（P01 GREEN 证据）
  → 468e6ac/d7e9a57（发布源 d3c0196+ffbcfaf 导入）→ 893d560（P07 检查点2 wire-v1）
  → 957a523（P02A 盘点）→ 07f5386（P02A slice 1：失败面非阻塞）→ 3a25edc（P02A slice 2）
- 已消费发布文档提交: 86d5a7b、61c7ff7、d3c0196、ffbcfaf
- **未提交改动（原样保留，未 reset/stash/clean/删除）**:
  1. `M apps/desktop/src/components/boot-failure-overlay.tsx` — 抑制条件收紧
     （只在 onboarding 真的拥有屏幕时让位）+ 新增稳定钩子 `data-boot-failure-panel` /
     `data-boot-failure-dismiss`（供真机驱动断言，不依赖本地化文案）
  2. `M apps/desktop/src/components/boot-failure-overlay.test.tsx` — 新增 1 条反例：
     就绪检查未决（configured===null）时失败面板仍须可见
  3. `M apps/desktop/src/components/onboarding/index.tsx` — 首启门：就绪检查未决不再全屏遮罩
     （产品决定 §1：无服务也能用壳；AGENTS.md 的 HERMES_EXECUTABLE_NOT_FOUND 不改写为假连接）
  4. `?? apps/desktop/e2e/boot-nonblocking-p02a-driver.mjs` — P02A 真机驱动（新增）
  5. `?? docs/validation/windows-acceptance-p02a/` — p02a4 真机证据（4 截图 + log）
  6. `M evidence/P02.md` — 切片记录（本文件同批提交）
- 当前阶段: P00 GREEN；P01 GREEN；P07 检查点 1–2 完成；**P02A 切片 1–2 已提交，
  切片 3 未提交（代码就绪、真机重跑未做）**
- 完成范围: P00；P01 全部返修（真机 27 PASS）；P07 检查点 1（语义映射）、检查点 2
  （wire-v1 PROPOSED_WIRE：17 方法 + 12 项 schema 测试 + JSON Schema 工件）；
  P02A slice 1（失败面非阻塞+可关闭）、slice 2（Artifacts 页退役）
- 下一项（接手者第 1 件）: 同步 `boot-failure-overlay.tsx` 与
  `e2e/boot-nonblocking-p02a-driver.mjs` 到 Windows 构建树 → `npm run build` →
  `node e2e\boot-nonblocking-p02a-driver.mjs <sandbox> <out>` 重跑，预期 9 PASS
  （无后端时 healthy 探针如实 PENDING）→ 与本切片一并提交 P02A 检查点
- 阻断: 无真实阻断。剩余 P02A/P02B–D（上层产品）、P07 检查点 3（§9 fixture 矩阵）、
  P03/P04/P05/P06 均未开工或待续

- contract_semantics_version: core-semantics/1（APPROVED_SEMANTICS，2026-09-14）
- wire_version/schema_digest: wire-v1 PROPOSED_WIRE；权威 sha256:8e20ccd3e0718214，
  工件 sha256:cd80103b3effbc4e（contracts/wire-v1/README.md 登记）；后端 wire-review.md
  尚未出现（无答复≠拒绝）
- 合同测试: 12 项 schema/信封测试通过（src/types/wire/wire-v1.test.ts）；
  覆盖缺口 = core v1 §9 九组场景的完整 fixture 矩阵（P07 检查点 3，未开工）
- UI_READY: 侧栏工作区列表（36R+P01）真机全绿；P02A 失败态非阻塞真机 7/9（2 项断言收尾见下）
- CONTRACT_CLIENT_READY: 否（wire 未锁定）
- REAL_FLOW_VERIFIED: 否（无真实 Server/Harness 链路证据）

- frontend_implementation: PARTIAL（P02A 切片 3 未提交/未重跑；B/C/D 未开工）
- writer_lease: **RELEASED**（本会话已停止全部写入；构建/驱动进程已确认退出；
  无残留子代理。接管者与时间：待新 Codex 前端会话在原工作树接力时填写）

## 测试与基线（本轮实跑，交接时点）

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
| P02 上层产品 | IN_PROGRESS（P02A 切片 1–2 已提交，切片 3 未提交） | P01 已满足 |
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
