# Desktop产品交付状态（执行工作树维护）

调度：ACTIVE_EXECUTOR_INCREMENT_AVAILABLE。本文件是产品工作树的执行事实；
发布源初始表不代表实时状态。消费文档更新时保留执行状态行，只合入规则/新订单。

## 执行快照（handoff-policy 每阶段必填）— 接管施工中

- updated_at: 2026-09-14 11:28 (+08:00)
- 执行者: Codex 前端产品 goal（接力会话）；**已从暂停的 Zcode 执行者接管**
- 工作树/分支: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product
- 接管核验: 用户指定交接 HEAD `5c0fbfe` 与实际 HEAD
  `5c0fbfe119de5c2fe979e3964ad59223767398d7` 一致；接管前 `writer_lease=RELEASED`；
  未发现该工作树、Windows 构建树的 Electron/Vite/Vitest/Playwright/验收驱动进程；
  dirty 集合仅为下列 4 项已授权交接改动。发布源规则文件与本执行树逐文件 SHA-256 一致，
  保留本文件实时进度，不复制发布源初始状态。
- 代码检查点（已提交 HEAD）: `9881bb8`（P07 检查点 4 / 核心维护覆盖增量）
  链: ebb1233（P00）→ 8d4b3df/47b5b47/dbb902f（P01 代码与几何修复）→ 26b32fc（P01 GREEN 证据）
  → 468e6ac/d7e9a57（发布源 d3c0196+ffbcfaf 导入）→ 893d560（P07 检查点2 wire-v1）
  → 957a523（P02A 盘点）→ 07f5386（P02A slice 1：失败面非阻塞）→ 3a25edc（P02A slice 2）
  → df84838（P02A GREEN）→ 91305d8（P02B1）→ 2a5b65d（P02B2）→ a132a49（wire 回应）
  → 0b3a341（wire client/replay/fixture）→ e4337c8（P02C1）→ fffbf443（P02C2）
  → 22125f3（P02D/B3）→ 57ceae6（P03 持久幂等 send）→ d179dba（P03 服务投影）
  → 9881bb8（P07 核心维护覆盖增量）
- 已消费发布文档提交: 86d5a7b、61c7ff7、d3c0196、ffbcfaf
- 当前检查点改动: P04 宿主纵切 1（待提交）：main-only authenticated HTTP transport、窄 IPC/
  preload bridge、空 lifecycle 诚实 unavailable，且无 Hermes fallback。
- 当前阶段: P00 GREEN；P01 GREEN；**P07 检查点 1–4 完成**；P02 A/B1/B2/C/D 已提交；
  P02B3 UI 边界已完成、服务投影随 P03；P03 纵切 1–2 已提交
- 完成范围: P00；P01 全部返修（真机 27 PASS）；P07 检查点 1（语义映射）、检查点 2
  （wire-v1 候选：17 方法 + schema 测试 + JSON Schema 工件；已消费后端机械反馈并回应）；
  P02A（失败面非阻塞+可关闭、Artifacts 页退役、失败终态竞态修复与真机门）
- 下一项: 补齐 Session 列表/完整 history/事件订阅的 wire 必要字段并继续 P03 生产
  Composer/Session 调用者接线；随后完成 P04 lifecycle 与遗留 Hermes 控制流退役。
- 阻断: 无真实阻断。剩余 P02B3–D（上层产品）、P03 生产投影、P04 Electron transport/
  legacy 退役、P05 生产接线和 P06 独立验收待续；wire 新摘要待后端登记但不阻塞本端施工

- contract_semantics_version: core-semantics/1（APPROVED_SEMANTICS，2026-09-14）
- wire_version/schema_digest: wire-v1 WIRE_REVISION_PENDING_BACKEND；新权威
  sha256:2874fae7c763a6e7，工件 sha256:c9be8a63097aa6b1；17 方法已由后端按上一摘要
  通过，11:05 核心维护覆盖增量已在本端落实为 25 方法并待后端登记
- 合同测试: schema/client/fixture 3 files / 33 tests passed；core v1 §9 九组场景矩阵已完整执行；
  真实 wire event stream 与后端投影差异仍是联调项，不以 fixture 伪称服务通过
- UI_READY: 侧栏工作区列表（36R+P01）真机全绿；P02A 真机 8 PASS / 0 FAIL / 1 PENDING
- CONTRACT_CLIENT_READY: 隔离客户端与 fixture READY；生产 Electron transport 待 P04，wire 新摘要待后端登记
- REAL_FLOW_VERIFIED: 否（无真实 Server/Harness 链路证据）

- frontend_implementation: PARTIAL（P02A、P02B1、P02B2、P02C1、P02C2、P02D 已完成；
  B3 UI 权威门完成、服务投影待 P03）
- writer_lease: **ACTIVE — Codex frontend goal**（2026-09-14 09:20 +08:00 接管；
  后端工作树只读，Windows 构建/验收资源串行）

## 测试与基线（接力会话实跑）

- 本地：P02A 相关组件/连接面 3 files / 22 tests passed；合并面 3 files / 31 tests passed；
  改动文件 ESLint 0 error / 0 warning；三项目 typecheck 通过；`git diff --check` 干净。
- Windows P02A：`docs/validation/windows-acceptance-p02a/runs/` 保留 p02a6/p02a7 两轮
  7 PASS / 1 FAIL / 1 PENDING 诊断证据；p02a8 最终 **8 PASS / 0 FAIL / 1 PENDING，exit 0**。
  PENDING 为无可达后端时的健康启动探针；所有失败态非阻塞必需门已执行并 PASS。
- P02B1：3 files / 56 tests passed；改动文件 ESLint 0/0；三项目 typecheck 通过；提交 `91305d8`。
- P02B2：5 files / 76 tests passed；改动文件 ESLint 0/0；三项目 typecheck 通过；
  `git diff --check` 干净。覆盖版本 CAS、v3 迁移、安全附件引用、Workspace 隔离及 WSL 草稿入口。
- P02C1：5 files / 41 tests passed（其中新纵切 3 files / 32 tests）；改动文件 ESLint 0/0；
  三项目 typecheck 通过；`git diff --check` 干净。覆盖不创建 Session、同 Harness 可选约束、
  rejected 保留旧 Profile、迟到描述丢弃、安全锁定控件、Workspace 最近角色与临时配置恢复。
- P02C2：Profiles 全组 3 files / 27 tests passed；与 C1/草稿合并面 4 files / 35 tests passed；
  改动文件 ESLint 0/0；三项目 typecheck 通过；`git diff --check` 干净。覆盖中立只读角色投影、
  Harness 只作数据、维护不可用诚实呈现、版本冲突保留旧投影，以及注入端口只采纳服务返回记录。
- P02D/B3：Settings 4 files / 20 tests、队列能力边界 4 files / 50 tests passed；改动文件
  ESLint 0/0；三项目 typecheck 通过；`git diff --check` 干净。覆盖五类产品设置、旧深链迁移、
  无外围合同时无假操作，以及 hello 单独存在不能重新激活 renderer 本地队列。
- P03 纵切 1：wire send + core fixture + capability 3 files / 17 tests passed；改动文件 ESLint 0/0；
  三项目 typecheck 通过。覆盖首发采纳服务 Session、传输模糊后同 requestId 查询、跨重试不重发、
  新草稿不得越过旧 unknown，以及明确拒绝才释放 pending identity。
- P03 纵切 2：session control + core fixture 2 files / 19 tests passed；改动文件 ESLint 0/0；
  三项目 typecheck 通过。覆盖服务队列替换、withdraw/too-late、stop requested/unconfirmed、approval
  等事件 settle、重复帧、序列缺口、tool 投影、过期 cursor 全量 resync 与持续不可补齐。
- P07 核心覆盖增量：wire/profile/client 4 files / 29 tests passed；改动文件 ESLint 0/0；三项目
  typecheck 通过。25 方法 schema、Profile wire 适配、不透明 Harness 候选与新生成工件已验证。
- P04 宿主纵切 1：Electron 2 files / 5 tests passed；改动文件 ESLint 0/0；三项目 typecheck
  通过。覆盖主进程独占 endpoint/token、IPC 目标约束、typed 401、危险 endpoint、空 slot 禁回落。

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
| P02 上层产品 | IN_PROGRESS（A、B1、B2、C、D 完成；B3 服务投影随 P03 收口） | P01 已满足 |
| P03 用例状态与API | IN_PROGRESS（send/queue/stop/history/event 用例完成；生产调用者待接） | 与 P02 穿插 |
| P04 宿主与遗留退役 | IN_PROGRESS（窄 request transport 完成；lifecycle/event/legacy 退役待续） | 与 P03 穿插 |
| P05 正式合同接入 | WIRE_REVISION_PENDING_BACKEND | 新摘要待后端登记；独立客户端先行 |
| P06 前端验收与交接 | IMPLEMENTATION_HANDOFF_GATE | 本端独立范围完成；真实全栈门由后续集成人负责 |
| P07 核心合同与状态交接 | 检查点1–4已提交 | 25 方法摘要待后端登记；Session/history 必要增量待编入 |

## 测试与证据基线（本轮实跑）

- 本地：sidebar 全量 241 项通过（含 3 条 P01 装配反例）；三项目 typecheck exit 0；
  改动文件 eslint 0/0；层序账本 md5 57011a54… 逐字节不变；层序守卫 15/16，
  唯一失败=已知环境基线（IN_FLIGHT 含 agentbox，干净树无 src/agentbox/），未复制 POC。
- Windows：`docs/validation/windows-acceptance-round36r-p01/`（p01r7，exit=0，
  24 截图+log）；36R postfix 旧证据原样保留；r1–r6 迭代失败史见 evidence/P01.md §3。

初始36R基线39291df，整体PARTIAL。38研究READY_FOR_DECISION，不是Harness生产依赖批准。
不继承旧GREEN，不因工单文件存在宣称功能已交付。
