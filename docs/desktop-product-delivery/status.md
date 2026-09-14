# Desktop产品交付状态（执行工作树维护）

调度：ACTIVE_EXECUTOR_INCREMENT_AVAILABLE。本文件是产品工作树的执行事实；
发布源初始表不代表实时状态。消费文档更新时保留执行状态行，只合入规则/新订单。

## 执行快照（handoff-policy 每阶段必填）— 接管施工中

- updated_at: 2026-09-14 14:52 (+08:00)
- 执行者: Codex 前端产品 goal（接力会话）；**已从暂停的 Zcode 执行者接管**
- 工作树/分支: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product
- 接管核验（历史，Zcode→Codex 交接）: 用户指定交接 HEAD `5c0fbfe` 与实际 HEAD
  `5c0fbfe119de5c2fe979e3964ad59223767398d7` 一致；接管前 `writer_lease=RELEASED`；
  未发现该工作树、Windows 构建树的 Electron/Vite/Vitest/Playwright/验收驱动进程；
  dirty 集合仅为下列 4 项已授权交接改动。发布源规则文件与本执行树逐文件 SHA-256 一致，
  保留本文件实时进度，不复制发布源初始状态。
- 本阶段起点核验: HEAD `1cbc4f58d602b212f55c7c4dd9c2bc38718cba83`、分支
  feature/agentbox-desktop-product、工作树 clean，无同工作树并发写入者；writer lease 仍为同一
  前端 goal 的 ACTIVE lease，本阶段串行施工，完成后停止写入并回报，不提前 RELEASE。
- 代码检查点（已提交 HEAD）: `940c9df4`（P05：`config.resolve` 生产接线）
  链: ebb1233（P00）→ 8d4b3df/47b5b47/dbb902f（P01 代码与几何修复）→ 26b32fc（P01 GREEN 证据）
  → 468e6ac/d7e9a57（发布源 d3c0196+ffbcfaf 导入）→ 893d560（P07 检查点2 wire-v1）
  → 957a523（P02A 盘点）→ 07f5386（P02A slice 1：失败面非阻塞）→ 3a25edc（P02A slice 2）
  → df84838（P02A GREEN）→ 91305d8（P02B1）→ 2a5b65d（P02B2）→ a132a49（wire 回应）
  → 0b3a341（wire client/replay/fixture）→ e4337c8（P02C1）→ fffbf443（P02C2）
  → 22125f3（P02D/B3）→ 57ceae6（P03 持久幂等 send）→ d179dba（P03 服务投影）
  → 9881bb8（P07 核心维护覆盖增量）
  → 3f3bbb9（P04 隔离 host transport）→ b10e455（P07 检查点5）
  → ff05157（P03 Composer send seam）→ 2c3aa7f（P03 主 route 生产挂载）
  → b9b816d（P04 event subscription seam）→ 292d351（P04 状态记录）
  → 3aba5c5（P07 queue 终态机械对齐）→ 7b38cf5（P04 WorkCore supervisor）
  → 34d9e48（P04 状态记录）→ 9d9adc0（renderer legacy autostart 退役）
  → 72b0371（P04 状态记录）→ 342b9df（Electron window autostart 退役）
  → 08a116d（wire-v1 双端锁定登记）→ 00d8862（main-only WS event transport）
  → 35659c5（Session/cursor IPC + renderer replay 接线）→ 1513ff2（P04 event 证据）
  → 5f8b2a5（AgentBox service composition）→ 405f6be（main 注册与退出 cleanup）
  → e1adda9（P04 状态记录）→ f8807b1（AgentBox 模型控件中立化）
  → 0db8bc7（中立模型控件状态）→ 1331a1d（Profile/ProviderModel 维护端口）
  → d6ec993（服务模型目录与临时槽）→ 2991bff（中立 Provider/Model 设置）
  → 1cbc4f58（Provider 模型检查点）→ dfcd7027（Profile 默认配置编辑与串行 CAS）
  → 88f3d934（enum/boolean 编辑覆盖）→ af0c08e3（返修：服务权威名称回写）
  → 矩阵审计文档检查点（evidence/P05-client-matrix.md）→ **940c9df4（config.resolve 生产接线）**
- 已消费发布文档提交: 86d5a7b、61c7ff7、d3c0196、ffbcfaf
- 当前检查点改动（config.resolve 接线）: 已锁定 `config.resolve` 接入产品路径——application 窄函数
  发 exact `{profileId, workspaceId, overrides}`；发送前强制服务校验（rejected→`invalidControls`
  且零 send，transport/typed 失败零 send）；Composer 预览按 scope/overrides latest-wins 且 hello
  未声明不发请求；`sendAvailable` 收紧为「hello 声明 `config.resolve` + 该路由的发送动词」。矩阵中
  `config.resolve` 由 FIXTURE_ONLY_FRONTEND_GAP 改为 PRODUCTION_REACHABLE（EXT），汇总 **23
  reachable / 5 gap**；G4 改写为接线记录（含原不变量与已执行验收）。
- 上一检查点改动（返修）: 保存成功后除 upsert store 外，`profiles.update` 与 `profiles.updateConfig`
  两次被采纳的服务返回都立即回写本地 `displayName`（服务规范化名称必须显示在输入框、成功后不得
  残留 dirty/Save）；名称输入在保存未决期间进入与配置控件、保存按钮一致的禁用态，避免产生当前
  请求无法携带的新意图。串行 CAS、部分成功保留草稿与「重试只发 updateConfig」语义不变。
- 上一检查点改动: Profiles 页从只读 `config.describe` 升级为可编辑的 Profile 默认配置，接到
  wire-v1 已锁定的 `profiles.updateConfig`（整份替换语义）。生产能力门要求
  `profiles.create`/`update`/`updateConfig`/`archive` 四条齐备，缺任一方法不渲染可保存控件；
  保存提交整份 `values`（未编辑与安全锁定值按服务当前值带回、显式恢复默认的控件省略、模型只发
  exact `{providerId, modelId}`）。改名与配置同时变化时按服务返回的新 version 串行 CAS，
  部分成功保留服务确认的名称/版本与草稿，重试不重发改名；成功后重读 describe 采用服务规范化结果。
- 当前阶段: P00 GREEN；P01 GREEN；**P07 检查点 1–6 完成且 wire 已锁定**；
  P02 A/B1/B2/C（角色页只读→默认配置编辑）/D 与 B3 服务投影已提交；P03 纵切 1–4 已提交；
  P04 切片1–8已提交
- 完成范围: P00；P01 全部返修（真机 27 PASS）；P07 检查点 1（语义映射）、检查点 2
  （wire-v1 候选：17 方法 + schema 测试 + JSON Schema 工件；已消费后端机械反馈并回应）；
  P02A（失败面非阻塞+可关闭、Artifacts 页退役、失败终态竞态修复与真机门）
- 下一项: 按 evidence/P05-client-matrix.md §3 补剩余 5 个前端缺口（workspaces.open/browse/archive、
  sessions.update/archive 的目标文件与不变量已列出），随后按 P06 收口无模型独立验收；Server
  lifecycle connection 合同到达后接生产接线。不再重新研究协议。
- 阻断: 无真实阻断。剩余 P04 production lifecycle connection 与显式 legacy 消费者收口、
  P05 生产接线核查和 P06 独立验收待续；wire 摘要已锁定，真实全栈仍由后续集成人验证

- contract_semantics_version: core-semantics/1（APPROVED_SEMANTICS，2026-09-14）
- wire_version/schema_digest: wire-v1 WIRE_LOCKED_FOR_IMPLEMENTATION；当前权威
  sha256:11e3b3e70d332585，工件 sha256:5d4fa3bfeec6c327；后端 `c8d9d3c` 以该工件
  29 passed in 67.57s 并登记同一摘要；锁定不替代生产联调
- 合同测试: schema/client/fixture 3 files / 34 tests passed；queue 终态合并面 2 files / 31 tests、
  core fixture 1 file / 10 tests passed；core v1 §9 九组场景矩阵已完整执行；
  真实 wire event stream 与后端投影差异仍是联调项，不以 fixture 伪称服务通过
- UI_READY: 侧栏工作区列表（36R+P01）真机全绿；P02A 真机 8 PASS / 0 FAIL / 1 PENDING
- CONTRACT_CLIENT_READY: wire-v1 客户端/fixture 与 28 方法摘要 LOCKED；production request/event
  transport 已接线，`profiles.updateConfig` 客户端与 Profile 默认配置编辑已接（组件级验证）；
  Server lifecycle connection 来源待正式跨端合同
- REAL_FLOW_VERIFIED: 否（无真实 Server/Harness 链路证据）

- frontend_implementation: PARTIAL（P02A、P02B1、P02B2、P02C1、P02C2、P02D/B3、Profile 默认配置
  编辑与 P03 主 route 服务投影已完成；P04/P05/P06 待收口）
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
- P07 检查点 5：Session/history 合并面 7 files / 55 tests passed；合同核心 3 files / 34 tests；
  改动文件 ESLint 0/0；三项目 typecheck 通过。覆盖重启目录、消息角色/顺序、双 cursor、queue
  event、停止 transport unknown 与 send outcome queue 身份。
- P03 纵切 3：Composer/send 合并面 3 files / 38 tests passed；改动文件 ESLint 0/0；三项目
  typecheck 通过。AgentBox busy follow-up 不 steer/不进本地 queue，draftVersion 贯穿 CAS，
  未 stage 附件在 transport 前拒绝；route composition 与服务 transcript 仍待下一纵切。
- P03 纵切 4：主 route/Workspace/Session/投影合并面 11 files / 64 tests passed；改动文件
  ESLint 0/0；三项目 typecheck 通过。主 route 不装配 Hermes gateway；服务 queue 只 withdraw，
  approval 等事件 settle，旧壳 Workspace id 未经环境+路径证明不得作为 wire id。
- P04 宿主纵切 2：事件 IPC + route 投影 3 files / 18 tests passed；改动文件 ESLint 0/0；
  三项目 typecheck 通过。IPC/preload 保持帧不透明，renderer 先作 wire schema 校验；非法帧不入
  reducer，gap 请求 history resync，route 与 source 均有 cleanup。真实事件源仍待 lifecycle 接线。
- P07 检查点 6：queue 终态合并面 2 files / 31 tests、core fixture 1 file / 10 tests passed；
  renderer TypeScript、受影响文件 ESLint、schema 一致性与 diff check 通过。活动快照拒绝终态，
  终态事件移除活动投影；新摘要待后端登记。
- P04 宿主纵切 3：WorkCore 2 files / 13 tests passed；Electron typecheck、受影响文件 ESLint、
  Prettier 与 diff check 通过。supervisor 单飞协调六动词、null resolve 不 fallback、readiness 失败
  回收 owned process，shutdown/晚到启动不能发布 ready；production artifact/plan 仍待正式合同。
- P04 宿主纵切 4：gateway boot 1 file / 48 tests passed；三项目 typecheck、受影响文件 ESLint 与
  diff check 通过。产品 composition 在读取 Hermes bridge 前关闭 legacy autostart；gateway 不伪造
  open，旧 boot overlay 退出，AgentBox availability 保持独立。
- P04 宿主纵切 5：product runtime policy + main-window lifecycle 2 files / 7 tests passed；Electron
  typecheck、受影响文件 ESLint、Prettier 与 diff check 通过。正常 createWindow 对 AgentBox runtime
  调 legacy starter 0 次；仅显式 legacy 分支保留，不伪造 AgentBox ready。
- P04 宿主纵切 6：事件 IPC 1 file / 4 tests、AgentBox chat 1 file / 8 tests passed；三项目
  typecheck、ESLint（0 error，仅既有 formatting warnings）与 diff check 通过。订阅按 sender、Session、
  cursor 隔离；gap 先退订后补水，逐帧 cursor 不重连，源异常/销毁/同步 gap 均不会泄漏 cleanup。
- P04 宿主纵切 7：event transport 1 file / 11 tests passed；Electron typecheck、ESLint、Prettier 与
  diff check 通过。动态读取 main-only connection，Bearer 仅在 WS upgrade header，限制 loopback；
  不重连、不解释 frame、不回落 Hermes。production connection slot 仍待正式接线。
- P04 宿主纵切 8：composition 1 file / 4 tests；HTTP/WS/IPC 跨模块 4 files / 22 tests passed；Electron
  typecheck、接线文件 ESLint 0/0 与 diff check 通过。HTTP/event 共用动态 main-only slot，main 注册
  production seam 并在 will-quit 清理；slot 初始 null，不猜 Server 端口/argv、不回落 Hermes。
- P02/P05 模型控件中立化：AgentBox composer controls 1 file / 10 tests passed；desktop 三项目
  typecheck、改动文件 ESLint 0/0 与 diff check 通过。主聊天区不再显示 Hermes 模型 pill 或读取
  legacy model-loading 状态；动态 descriptor（含 model_slot）仍是产品配置权威，legacy route 不变。
- P05 Provider/Model：application 端口 2 files / 6 tests；目录/Composer/Settings 合并门 7 files /
  36 tests passed；desktop renderer/electron/e2e 三项目 typecheck 通过；全部受影响 TS/TSX ESLint
  0 error / 0 warning，diff check 干净。覆盖 capability 缺失、缓存保留/single-flight、带斜杠 id、
  opaque Harness 隔离、多 model_slot、服务当前值、模型多行增删、防双发、CAS/引用冲突与服务返回投影。
- Profile 默认配置编辑（dfcd7027）：定向门 4 files / **29 tests passed，exit 0**
  （`src/application/profile/profile-maintenance-port.test.ts` 3、
  `src/application/provider-model/wire-provider-model-catalog.test.ts` 3、
  `src/features/profiles/index.test.tsx` 13、`src/features/profiles/profile-config-editor.test.tsx` 10）；
  相关回归面 5 files / 23 tests passed（composer profile-controls、wire-composer-profile、
  agentbox-model-settings、settings 首页、composition surfaces）；`npm run typecheck` 三项目通过；
  改动 13 个文件 ESLint 0 error / 0 warning；`git diff --check` 干净。覆盖四方法能力门、
  描述式控件（enum/string/boolean/model_slot 均可编辑并按其值发送）、整份 values（保留未编辑/锁定、
  省略恢复默认、exact 模型引用与带斜杠 id）、
  双 model_slot 独立编辑、unavailable 禁选与目录外当前值、CAS 顺序 update(N)→updateConfig(N+1)、
  部分成功重试不重发改名、pending 连点单发、服务规范化后采用返回 descriptor、迟到 descriptor 不串写。
- config.resolve 生产接线（940c9df4）：`npx vitest run --project ui
  src/application/profile/wire-composer-profile.test.ts src/application/session/agentbox-composer.test.ts
  src/features/chat/composer/profile-controls.test.tsx
  src/app/composition/wiring/agentbox-main-chat.test.tsx
  src/features/chat/composer/hooks/use-composer-profile.test.tsx` → **5 files / 46 tests passed，exit 0**；
  回归面（composer 全目录 + legacy chat view + agentbox chat view）44 files / 264 tests passed；
  `npm run typecheck` 三项目通过；实际改动 18 个 TS/TSX 文件 ESLint 0 error / 0 warning；
  `git diff --check` 干净。认证 resolve→send 顺序、同一 overrides 快照、rejected 全原因零 send、
  transport 失败零 send、latest-wins、切 scope 迟到保护、capability 零请求、预览 UI 四态。
- P05 客户端矩阵审计（只读，本阶段文档检查点）：`WireMethods` 键数 28；矩阵 28 行与
  `WireMethods` 排序逐项比较全等（无重复/遗漏/多余）；每行恰好一个合法状态，脚本计数
  22 `PRODUCTION_REACHABLE` + 6 `FIXTURE_ONLY_FRONTEND_GAP` = 28，与表格声明一致；摘要与后端登记
  一致（TS `11e3b3e7…c10035`、工件 `5d4fa3bf…5e4ed`）；`git diff --check` exit 0。本阶段无生产代码
  变化，未跑完整套件/Windows，未装依赖。前端缺口（只登记不修）：`workspaces.open`、
  `workspaces.browse`、`workspaces.archive`、`config.resolve`、`sessions.update`、`sessions.archive`。
- Profile 权威名称回写返修（af0c08e3）：`npx vitest run --project ui
  src/features/profiles/index.test.tsx src/features/profiles/profile-config-editor.test.tsx
  src/application/profile/profile-maintenance-port.test.ts` → **3 files / 27 tests passed，exit 0**
  （Profiles 页 14 + 编辑器 10 + 端口 3）；`npm run typecheck` 三项目通过；改动 2 个文件
  ESLint 0 error / 0 warning；`git diff --check` 干净。新增/加强 3 个行为测试：rename-only 服务
  规范化（store 与输入框均显示返回值、Save 消失、update 仅 1 次）、改名成功而配置失败（规范化
  名称 + 草稿保留、重试只发 updateConfig 且用 update 返回的 version、update 仍仅 1 次）、pending
  （Name/配置输入与保存按钮均禁用、连点只 1 次服务调用）。变异校验：移除回写后恰好这 3 个测试
  失败（11 passed / 3 failed），恢复后 14/14 通过。

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
| P02 上层产品 | IN_PROGRESS（A/B/C/D 主面与服务投影完成；Profile 默认配置编辑已接服务描述与串行 CAS；矩阵审计标出 6 项前端缺口） | P01 已满足 |
| P03 用例状态与API | IN_PROGRESS（主 route 生产调用者与 event reducer 接入已完成；真实 Server 源待 P04） | 与 P02 穿插 |
| P04 宿主与遗留退役 | IN_PROGRESS（production request/Session-event transport + IPC + supervisor；正常冷启动 Hermes 自动门已退役，Server connection合同待后端） | 与 P03 穿插 |
| P05 正式合同接入 | IN_PROGRESS（28 方法矩阵：23 生产可达 / 5 前端缺口；`config.resolve` 已接；lifecycle 外部缺口待续） | wire 双端锁定 |
| P06 前端验收与交接 | IMPLEMENTATION_HANDOFF_GATE | 本端独立范围完成；真实全栈门由后续集成人负责 |
| P07 核心合同与状态交接 | 检查点1–6已提交；WIRE_LOCKED | 28 方法双端摘要一致；fixture/客户端已锁定 |

## 测试与证据基线（本轮实跑）

- 本地：sidebar 全量 241 项通过（含 3 条 P01 装配反例）；三项目 typecheck exit 0；
  改动文件 eslint 0/0；层序账本 md5 57011a54… 逐字节不变；层序守卫 15/16，
  唯一失败=已知环境基线（IN_FLIGHT 含 agentbox，干净树无 src/agentbox/），未复制 POC。
- Windows：`docs/validation/windows-acceptance-round36r-p01/`（p01r7，exit=0，
  24 截图+log）；36R postfix 旧证据原样保留；r1–r6 迭代失败史见 evidence/P01.md §3。

初始36R基线39291df，整体PARTIAL。38研究READY_FOR_DECISION，不是Harness生产依赖批准。
不继承旧GREEN，不因工单文件存在宣称功能已交付。
