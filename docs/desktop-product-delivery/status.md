# Desktop产品交付状态（执行工作树维护）

> **当前有效状态以本文件末尾的「更正（2026-09-15）P06 诚实性返修」及其后的 release 行为准。**
> 开头这几行是 `9fe414a2` 时的记录；该点的 `P06_GREEN` / `DESKTOP_IMPLEMENTATION_READY` /
> `writer_lease=RELEASED` 因协调验收发现两个本端缺陷而**暂停**，修复与 r2 新证据见末尾。
> 历史行一律保留，不删除、不改写。

调度：**FRONTEND_GOAL_CLOSED / writer_lease=RELEASED — 等待后端执行者按 handoff-policy 接管全栈**。
本文件是产品工作树的执行事实（前端侧已冻结）；
发布源初始表不代表实时状态。消费文档更新时保留执行状态行，只合入规则/新订单。

## 交付终态（前端已停止写入）

- **P06 = `P06_GREEN — FRONTEND_INDEPENDENT_ACCEPTANCE`**
- **`DESKTOP_IMPLEMENTATION_READY`**（前端实现交接就绪；证据与入口见
  `evidence/P06.md`、`evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md`）
- `REAL_FLOW_VERIFIED = 否`（无真实 Server/Harness/模型链路证据）
- `AGENTBOX_DESKTOP_PRODUCT_GREEN = 否 / 待全栈`（整体产品需外围能力矩阵另验，核心联调 GREEN 不等于产品 GREEN）
- **`writer_lease = ACTIVE（UI 逐屏走查：后端调度维护者，2026-09-17 21:32）`** —— 前端 goal 已停止全部写入（含文档）。
  **后端执行者可按 `docs/desktop-product-delivery/handoff-policy.md` 的 42 双门规则接管全栈**：
  读取本文件与 `evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md`，核对分支/HEAD/摘要/可运行性，
  确认无新前端 writer、无子代理、无未交接修改后，在正式派单指定的工作树记录
  `FULLSTACK_INTEGRATION_OWNER` 成为唯一集成人并安装 lifecycle connection。
  若需要前端配合的跨端修复，请由用户另派前端任务并重新划分写权——本 goal 不会自行恢复写入。

## 执行快照（handoff-policy 每阶段必填）— P06 独立验收完成

- updated_at: 2026-09-14 23:20 (+08:00), writer_lease=RELEASED（本行之后本文件冻结）
- 执行者: Zcode 前端产品 goal（新一轮会话，串行施工）；**已从 Codex 前端产品 goal 接管**
- 工作树/分支: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product
- 本阶段（P06 独立验收、证据交付与写权释放）起点核验: HEAD `9ecf1a0a`、
  分支 feature/agentbox-desktop-product、`git status --short` 为空、`git diff --check` exit 0；
  writer lease 仍为同一前端 goal 的 ACTIVE lease；WSL 无残留 Vite/Vitest/Playwright/Electron 进程，
  Windows 构建树无 Electron/node 进程。执行方式：两个只读子代理（A 最终功能矩阵审计、
  B 最终边界/交接审计，均禁止写文件/stage/commit/跑全量测试）与主执行者复核；主执行者单独持有
  Linux 全量门、Windows 构建树与验收驱动的串行资源。**范围与结果**：
  （a）三项目 typecheck、shared typecheck、tests-js、层序/合同守卫、构建全部 exit 0；完整 Desktop
  Vitest **987 files（2 failed/983 passed/2 skipped）、10218 tests（4 failed/10208 passed/6 skipped）**，
  其中 **UI 815 files / 7915 tests 全通过**、electron 172 files / 2303 tests（4 failed 为自建 loopback
  服务在本 WSL 环境 ECONNREFUSED）；lint **exit 0 / 0 error / 141 warning**（全部为既有且不在本分支
  改动文件内；唯一落在改动文件内的 preload 警告已按规则修掉）。
  （b）**发现并修复三条可达 legacy 路径**：B10 失败面板 legacy 网关设置可经
  `hermes:connections:test` 触发 `startHermes()`（**会启动运行时**）、B11 状态栏连接/网关切换器走
  不受 `hermes:api` 门保护的 `hermes:connections:*`、B12 Agents/Cron/Webhooks/Starmap 视图及其
  命令面板/状态栏入口——即上一阶段「已知 legacy 可达面已清零」的结论在**产品外壳面之外**不成立；
  修复提交 `eef059a9`（含行为测试与正反例）。
  （c）**Windows 原应用验收首轮 18 PASS / 2 FAIL，据此再查出两个真实缺陷并当场修复**：全屏 legacy
  CONNECTING 遮罩在产品运行期永不退出（P06 硬性阻断项，实测覆盖 100% 视口，P02A 当时记为
  PENDING 的同一现象）、渲染端仍向 main 发 `/api/config`（约 2s 轮询）与 `/api/profiles`；
  已加 `GatewayConnectingOverlay` 必填 authority（产品传 `agentbox` → 不渲染）与渲染端唯一入口的
  legacy REST 门（`src/api/legacy-rest.ts` + `src/app/composition/product-runtime.ts`，
  在组合根 import 期应用）。
  （d）最终 Windows 驱动 **20 PASS / 0 FAIL / 0 SKIP / 0 PENDING**：无遮罩（0.0%）、旧 Hermes
  fake-boot/fake-error 环境被忽略且未启动运行时、真实命中点击可达侧栏、Settings 开合、
  Profiles/产品设置诚实、命令面板无 legacy 行、Command Center 为 AgentBox authority、
  发送 fail closed 不建假 Session、四视图深链落到诚实产品页、关闭后 20s 内启动进程树全空、
  main 侧 legacy 拒绝 **0** 行（无 IPC）。
  （e）loopback 两文件经 Windows 同测试 **2 files / 32 tests passed**，定性为 **WSL 环境基线**。
  （f）交付 `evidence/P06.md`、`evidence/P06-assets/**`（6 截图 + results.json + 两日志 + SHA256SUMS）、
  `evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md` 与 P02/P04/P05 附录。完成后进入 release 检查点，
  不再顺手修文档。

- 本阶段（P05 返修：B9 关闭与 GREEN 时点更正）起点核验: HEAD `30e3cf42277d41ac8a5bda023c71e4bef7141ffb`、
  分支 feature/agentbox-desktop-product、`git status --short` 为空；writer lease 仍为同一前端 goal 的 ACTIVE
  lease，未发现同工作树写入者或残留 Electron/Vitest/Playwright 进程。单写者执行（未开子代理），只改
  renderer 的侧栏筛选菜单与命令面板贡献行过滤；未改后端、wire schema、Electron（含 `hermes:api` 硬门）、
  preload、shared、package/lock，未运行模型。完成后停止写入并回报，不提前 RELEASE。
- 上一阶段（P05 最终收口）起点核验: HEAD `a94a197cb71e5dd960c1a9b8c27d8d80accde72a`、
  分支 feature/agentbox-desktop-product、`git status --short` 为空、`git diff --check` exit 0；writer lease 仍为
  同一前端 goal 的 ACTIVE lease，未发现同工作树写入者或残留 Electron/Vitest/Playwright 进程。执行方式为
  两个平行 Luna 子代理（A：Command Center authority + 架构账本 + i18n；B：P07 §9.5/§9.6/§9.8 fixture 深度）
  与主执行者同时做 Electron HTTP/WS transport，三方写集互不重叠；子代理禁止 stage/commit/改文档。
  **意外产物与更正**：子代理早期的 `npx tsc --build tsconfig.json`（无 `outDir`）在源树内产出 2160 个被
  gitignore 遮蔽的 `.js` 影子文件，Vite 解析 `.js` 优先于 `.ts`，故当时的测试可能加载旧编译副本；已全部删除、
  确认无 tracked 删除，并在干净树上重跑全部门。此后统一使用 `tsc -p … --noEmit`。完成后停止写入并回报，
  不提前 RELEASE。
- 上一阶段（P05 legacy 客户端收口）起点核验: HEAD `ad3feb165953251955815d12739107bccb2142b8`、
  分支 feature/agentbox-desktop-product、`git status --short` 为空、`git diff --check` exit 0；writer lease 仍为
  同一前端 goal 的 ACTIVE lease，未发现同工作树写入者或残留 Electron/Vitest/Playwright 进程。本阶段
  先串行立 Electron 结构门（`hermes:api` 在 agentbox runtime 下于任何路由/`ensureBackend` 之前以稳定码
  `LEGACY_RUNTIME_DISABLED_FOR_PRODUCT` 拒绝），再开两个平行 Luna 子代理（A：状态栏 + 命令面板；
  B：侧栏搜索/Archived/未匹配本地行），共享文件与组合接线由主执行者持有；两个写集互不重叠、委派时
  工作树 clean、子代理禁止 stage/commit/改文档。完成后停止写入并回报，不提前 RELEASE。
- 上一阶段（P05 最终客户端审计）起点核验: HEAD `6ca5d17aff32d0f984fccd90cd507c98994bfe96`、
  分支 feature/agentbox-desktop-product、`git status --short` 为空、`git diff --check` exit 0；
  writer lease 仍为同一前端 goal 的 ACTIVE lease，无同工作树并发写入者。本阶段只做**只读审计**：
  两个只读子代理（A 合同/事件/fixture、B legacy 可达性）并行调查且均被禁止写文件/stage/commit，
  主执行者复核结论、逐行复验四处关键事实、跑定向门并串行写文档；完成后停止写入并回报，不提前 RELEASE。
- 接管核验（历史，Zcode→Codex 交接）: 用户指定交接 HEAD `5c0fbfe` 与实际 HEAD
  `5c0fbfe119de5c2fe979e3964ad59223767398d7` 一致；接管前 `writer_lease=RELEASED`；
  未发现该工作树、Windows 构建树的 Electron/Vite/Vitest/Playwright/验收驱动进程；
  dirty 集合仅为下列 4 项已授权交接改动。发布源规则文件与本执行树逐文件 SHA-256 一致，
  保留本文件实时进度，不复制发布源初始状态。
- 上一阶段起点核验（历史）: HEAD `bd1b28b44a7565f6864d26b90bb30a991b0654e1`、分支
  feature/agentbox-desktop-product、工作树 clean，无同工作树并发写入者；writer lease 仍为同一
  前端 goal 的 ACTIVE lease。该阶段按用户增量开了两个并行子代理（application/当前会话命令、
  侧栏归档交互），两个写集互不重叠且在委派时均未被主代理修改；主代理负责 `features.tsx` 三分支装配、
  定向/回归门、文档与提交。完成后停止写入并回报，不提前 RELEASE。
- 代码检查点（已提交 HEAD）: `d31897dc`（P05 返修：B9 profile 分享在 AgentBox authority 下隐藏 +
  GREEN 声明时点更正）；阶段标记 **`P05_GREEN — CLIENT_IMPLEMENTATION_COMPLETE`**（在 `d31897dc` 上
  **重新成立**——`30e3cf42` 的同一标记**是过早的**，因为该检查点刚发现并登记了 B9，两者不能同时成立；
  该检查点应记为 `P05_PARTIAL`，详见 [P05-final-audit.md](../../evidence/P05-final-audit.md) §12.1）。
  前序检查点 `e087c976`（P05 最终收口：Command Center authority + 命令面板 legacy
  快捷项 + §9.5/§9.6/§9.8 fixture 深度 + 陈旧 IN_FLIGHT 清除）、`4efd1ec5`（AgentBox HTTP/WS transport
  安全对齐）；再前为 `a6b751ff`（P05 legacy 客户端收口：面迁移与组合接线；其前为 `f7759148` 的
  `hermes:api` 结构门；阶段标记 `LEGACY_CLIENT_CLOSEOUT_READY`——该标记**只表示 B1–B6 收口**，
  不表示 B1–B6 之外也完成）。历史检查点
  `cbdccf7c`（P05 sessions.archive 生产接线：统一侧栏服务 Session 归档 +
  当前会话归档命令；矩阵 28 reachable / 0 gap，阶段状态 SESSIONS_ARCHIVE_CLIENT_READY）
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
  → 矩阵审计文档检查点（evidence/P05-client-matrix.md）→ 940c9df4（config.resolve 生产接线）
  → b6d0bc6f（返修：旧 pending 发送优先恢复）→ 3e207376（workspaces.open 生产接线）
  → 072c7eac（返修：Workspace 身份完整三元组匹配）→ f6b457b5（workspaces.archive 生产接线）
  → a8142125（workspaces.browse 生产接线）→ 4a057609（返修：远端保存迟到响应收口；
  WORKSPACES_BROWSE_CLIENT_READY 以该次提交为最终依据）
  → **8cdd1381（sessions.update 生产接线：统一侧栏服务 Session 投影 + 改名/置顶 CAS + 当前会话置顶命令；
  SESSIONS_UPDATE_CLIENT_READY 原以本次提交为依据）**
  → **86911029（P05 返修：侧栏服务投影的服务状态边界 —— 归属与可调用性分离、缓存权威跨 loading/unavailable
  保持、维护与归档 fail closed）**
  → **cbdccf7c（P05 sessions.archive 生产接线：统一侧栏服务 Session 归档（独立归档菜单项 + 唯一确认框与
  exact CAS，不乐观隐藏、pending 单发、服务/能力消失零调用）+ 当前会话归档命令（route id 权威、同 seam 同
  CAS、缺失/已归档 fail closed、不回落 legacy）；矩阵 28 reachable / 0 gap，SESSIONS_ARCHIVE_CLIENT_READY
  以该次提交为最终依据）**
  → 6ca5d17a（sessions.archive 客户端检查点文档）/ ad3feb16（P05 最终客户端审计与文档收口）
  → **f7759148（P05 legacy 收口：`hermes:api` 结构门——显式 `legacyApiAllowed` 依赖，禁用态稳定拒绝，
  不静默成功）** → **a6b751ff（P05 legacy 收口：状态栏注入 null 状态源、命令面板改读 `$agentBoxSessions`、
  侧栏显式 `sessionAuthority`，B1–B6 关闭）**
  → **4efd1ec5（P05 最终收口：AgentBox HTTP/WS transport 安全对齐——共用 loopback endpoint 判据、HTTP 在
  fetch 前拒绝、WS 无连接恰好报告一次 + typed code、生产只记录稳定类别的安全 sink）**
  → **e087c976（P05 最终收口：Command Center 必填 authority + 命令面板 legacy 快捷项（含注册贡献行
  `Toggle logs`）+ §9.5/§9.6/§9.8 fixture 深度 + 陈旧 IN_FLIGHT 清除）**
  → **d31897dc（P05 返修：B9 关闭——`SidebarFilterMenu` 必填 `sessionAuthority`（两处挂载显式传入）、
  agentbox 下隐藏 `Import profile…` 与 legacy per-profile 过滤框、命令面板 `profile.export`/`profile.import`
  进入 legacy 贡献行过滤集；Profile 创建与 Profiles 页能力不变）**
- 已消费发布文档提交: 86d5a7b、61c7ff7、d3c0196、ffbcfaf
- 当前检查点改动（**P05 返修：B9 关闭与 GREEN 时点更正，已实施**，代码提交 `d31897dc`，产物
  `evidence/P05.md` §9、`evidence/P05-final-audit.md` §12、`evidence/P05-client-matrix.md` §9、
  `evidence/P04.md` B9 回填）:
  起点 HEAD `30e3cf42`，工作树 clean，单写者执行（未开子代理）。实际结果——
  （a）**时点更正**：`30e3cf42` 的 `P05_GREEN` 声明**作废**（同一检查点刚登记 B9，二者不能同时成立），
  该检查点记为 `P05_PARTIAL`；两份事实已显式对齐，**不删除任何历史数字**，只追加口径更正。
  （b）**B9 关闭**：`SidebarFilterMenu` 取得与 `ChatSidebar` 同一 `SessionAuthority` 的**必填** prop，
  两处挂载（工作区根列表 header 与扁平列表 header）分别显式传入；agentbox 下 `Import profile…` 不渲染，
  `runImportProfileFlow` 与 `window.hermesDesktop.selectPaths` 均 **0 次**，legacy per-profile 过滤框
  **门控在 authority 上**（测试特意填满 `$profiles` 再断言不出现，不依赖缓存为空）；命令面板
  `profile.export`/`profile.import` 进入既有 `LEGACY_PALETTE_ROW_IDS`，列表与搜索都取不到、也不可执行。
  （c）**保留项**：Profile 创建 `requestProfileCreate` → `SidebarNavMenu` 导航 `PROFILES_ROUTE`（AgentBox
  服务权威 Profile 管理页）在两种 authority 下都保留；Profiles 页新建/编辑/归档/配置零改动；
  `store/profile-share.ts`/`api/profiles.ts`/`profile-switcher.tsx` 未改，helper 保留但不可达；
  `wire-v1` 无 Profile bundle 方法，故不放"暂不支持"假入口、不接 mock、不把 legacy bundle 当 AgentBox Profile。
  实测门：B9 定向 4 files / 43 tests；`src/features/chat/sidebar` 回归 31 files / 256 tests；
  `command-palette/` 回归 2 files / 17 tests；`npm run typecheck` exit 0；改动/新增 7 个 TS/TSX ESLint exit 0；
  `git diff --check` exit 0。只读核验：AgentBox 侧栏与命令面板均不可达 profile 分享 flow；
  `profile-switcher.tsx` 仍无生产挂载点；B8 无挂载消费点且硬门未变（electron/ 0 文件改动）；
  28/28 矩阵集合全等、`wire-v1.ts` 摘要不变、fixture 与 transport 未改。
  阶段标记在新 HEAD 上重新成立 **`P05_GREEN — CLIENT_IMPLEMENTATION_COMPLETE`**；同时保留
  `REAL_FLOW_VERIFIED=否`、lifecycle connection 为外部缺口、未运行真实模型、writer_lease 保持 ACTIVE，
  **不声明** P06 GREEN 或 DESKTOP_IMPLEMENTATION_READY。**B7 关闭；B8 = `UNREACHABLE_OR_PROTECTED`；
  B9 关闭**——当前没有已知的 AgentBox 产品可达 legacy 调用路径。
- 上一检查点改动（**P05 最终收口，已实施**，代码提交 `4efd1ec5` + `e087c976`，产物
  `evidence/P05.md` 最终收口检查点、`evidence/P05-final-audit.md` §11、`evidence/P04.md` 切片 9、
  `evidence/P07.md` 检查点 7、`evidence/P05-client-matrix.md` §4/§9）:
  起点 HEAD `a94a197c`，工作树 clean。实际结果——
  > 本检查点的 `P05_GREEN` 声明已由 `d31897dc` 更正为**过早**（同检查点发现 B9），其 B9 条目**已被
  > `d31897dc` 关闭**；下方原文保留为该检查点当时的记录。
  （a）**Command Center 数据面（B7 关闭）**：`CommandCenterView` 增加**必填** `authority: 'agentbox' | 'hermes'`，
  生产组合显式传 `'agentbox'`（不按错误/gateway 状态/缓存推断），实现拆为两个组件而非条件 hook，使"不订阅"
  成为字面事实；agentbox 下 legacy system/usage/maintenance/session 子树不构造，`getStatus`/`getLogs`/
  `getUsageAnalytics`/`restartGateway`/`updateHermes`/`getActionStatus` 各 0 次，不订阅 `$sessions`/
  `$pinnedSessionIds`，无 legacy delete/export/pin；会话取 `$agentBoxSessions`（排除 archived、服务 displayName/
  id/updatedAt/pinned、本地只匹配 displayName 与服务 id、以服务 id 经中立 seam 打开、不做 SessionInfo 转换）；
  无 wire 对应能力的 section 深链显示六语言本地化说明而不是 `LEGACY_RUNTIME_DISABLED_FOR_PRODUCT`；
  hermes authority 保持既有面板与动作（隔离测试）。新增 i18n 键 2 个（type + 六语言）。
  （b）**命令面板 legacy 快捷项**：`CommandPaletteBody` 同一必填 authority；agentbox 下
  `cc-restart-gateway`/`cc-update-hermes`/`cc-system`/`cc-usage` 不渲染不可执行（动作 mock 成"会应答"，
  断言只看调用次数），已迁移的服务 Session 行继续工作；**新发现并关闭** registry 贡献行 `Toggle logs`
  （其 pane 每 5s 轮询 legacy `GET /api/logs`），插件行保留。
  （c）**P07 §9.5/§9.6/§9.8 fixture 深度**：队列续派（终态移出活动投影、后续 `queue.updated` 纳入下一项、
  重复/乱序不复活、零 send）、审批失效（`expired`/`invalidated` 结算 + 重放不重复决定、不扩 schema）、
  前端重连（先 `history.snapshot` 后订阅、原 requestId 查询 outcome、终态清 stop 状态含"终态只在快照里"
  的情形，非终态一律不动）；fixture 自述为前端重连行为 fixture，不声称执行真实 Server 重启。
  （d）**HTTP/WS transport**：`electron/security/agentbox-wire-endpoint-policy.ts` 成为唯一 endpoint 裁决处
  （loopback `localhost`/`::1`/合法 `127/8`、仅 `http(s)`、禁凭据；拒绝只给 `invalid`/`non_loopback` 且不回显
  endpoint）；HTTP 在 `fetch` 前拒绝非 loopback（既有 typed UNAVAILABLE，不泄漏 token，`/wire/v1/` 目标规则不变）；
  WS 无 connection/accessor 抛错/无 token 统一 `onError` 恰好一次并返回幂等 cleanup（不再静默 no-op），
  `AgentBoxWireEventError.code` 稳定分类且不附带原始 cause；composition 默认 sink 只记录稳定类别。
  （e）**架构账本**：`IN_FLIGHT` 由 2 项变 `[]`（`agentbox` 与 `plugins/agentbox-lab` 均已不存在），
  长度断言 2→0，陈旧检查由顶层目录名加强为全前缀 `statSync`（旧写法下 `plugins/agentbox-lab` 永远不会被报出）；
  账本只缩短，未新增豁免或债务。
  实测门：UI 定向 10 files / 141 tests；B1–B7 legacy 回归 10 files / 135 tests；Electron 定向 7 files / 75 tests；
  `renderer-layers.test.ts` 单独 1 file / 16 tests（陈旧 IN_FLIGHT 失败消失）；`npm run typecheck` exit 0；
  改动 29 个 TS/TSX ESLint exit 0；`git diff --check` exit 0；**全量 UI 811 files / 7882 tests 全部通过**；
  **全量 Electron 171 files / 2288 tests：2 files / 4 tests failed（另一轮 5 failed）**，失败文件为
  `host-capabilities/credentials/mcp-oauth-callback-ipc.test.ts` 与 `legacy-hermes/api-transport.test.ts`
  （自建 loopback 服务在本环境 `ECONNREFUSED`，且不 import 本阶段改动模块），原样记录不重跑掩盖。
  阶段标记 **`P05_GREEN — CLIENT_IMPLEMENTATION_COMPLETE`**；同时保留 `REAL_FLOW_VERIFIED=否`、
  lifecycle connection 为外部缺口、未运行真实模型、writer_lease 保持 ACTIVE，**不声明** P06 GREEN 或
  DESKTOP_IMPLEMENTATION_READY。**B7 关闭；B8 归类 `UNREACHABLE_OR_PROTECTED`（非活动产品阻断，
  按工单不删除、不重构插件 API）；B9 新登记未修**（profile 分享经 `api/profiles.ts`，入口为侧栏筛选菜单
  `Import profile…` 与命令面板 Export/Import 两行，被结构门拒绝但未迁移）——因此"产品外壳所有可达 UI
  均无 legacy API 调用"这一只读核验**不成立**，B9 为精确剩余项。
  **→ 本检查点的 GREEN 声明已由下一检查点 `d31897dc` 更正为过早，B9 亦在该点关闭**；上方原文保留为
  该检查点当时的记录。
- 上一检查点改动（**P05 legacy 客户端收口，已实施**，代码提交 `f7759148` + `a6b751ff`，
  产物 `evidence/P05-final-audit.md` §10、`evidence/P05-client-matrix.md` §5、`evidence/P05.md`、`evidence/P04.md`）:
  起点 HEAD `ad3feb16`，工作树 clean。实际结果——
  （a）**结构门（W4）**：`registerApiProxyIpc` 增加显式依赖 `legacyApiAllowed: boolean`，由 `main.ts` 以既有
  `shouldAutostartLegacyHermes(DESKTOP_PRODUCT_RUNTIME)` 组合得出（未新造 runtime 常量、未在 main.ts 声明函数），
  `hermes:api` handler 在**任何**请求解析、profile deletion gate、registry dispatch、`handleHermesApiRequest`、
  `ensureBackend` 之前检查该门；禁用态抛 `code = LEGACY_RUNTIME_DISABLED_FOR_PRODUCT`（message 同前缀），
  **不静默成功**；`hermes:data-url-read-max:get/set` 不受影响；显式 legacy runtime 下既有路由逐项不变。
  证据：`electron/ipc/api-proxy-ipc.test.ts`（新增 5 用例）＋ `product-runtime-policy.test.ts`（3）＝ electron 2 files / 8 tests passed。
  （b）**B1 状态栏**：`useStatusSnapshot(source | null, gatewayState, gatewayScope)`，产品组合传 `null` →
  挂载/聚焦/可见性/定时器零 `getStatus`/`requestGateway`，返回中立 null；hook 不再 import `@/api/config`。
  （c）**B2 命令面板**：会话行改读 `$agentBoxSessions` 并经纯投影（`archivedAt === null`；pinned → updatedAt desc
  → id tie-break），行 label = `displayName`、打开用服务 id 走既有 `openSession` seam；`listAllProfileSessions`
  与 React Query 会话查询已从该文件移除（测试用“会答复的 legacy mock”断言 0 次调用）。
  （d）**B3/B4 侧栏搜索与 Archived**：`ChatSidebar` 增加**必填** `sessionAuthority: 'agentbox' | 'hermes'`
  （不按 gateway/缓存/方法存在性推断）；agentbox 下搜索为对 `$agentBoxSessions` 的本地、大小写不敏感过滤
  （displayName 与服务 id，排除 archived），Archived 仅在服务 ready 且 hello 声明 `sessions.list` 时调用一次
  `refreshAgentBoxSessions(client, { includeArchived: true })`，只显示 `archivedAt !== null`，typed failure 显示
  真实原因并保留缓存行，unavailable 保留缓存行 + 状态；`$gatewayState` 翻转无法使其回落 legacy。
  （e）**B5**：all-profiles 项目刷新的 REST 分支被挡在 `ensureBackend` 之前（零 `ensureBackend`/`startHermes`）；
  打开本地文件夹未破坏——该分支失败被 `markProjectsRpcFailure` 吞掉、`refreshProjectTree()` 不 reject
  （只读核验 `store/projects/refresh.ts:161-186`、`worktrees.ts:288`，既有 `store/projects.test.ts` 通过）。
  （f）**B6**：agentbox authority 下未匹配本地行不再渲染 legacy 预览，改中立文案（Home 桶不展开）。
  （g）组合接线：`surfaces.tsx` 的 `SidebarSurface` 显式传 `sessionAuthority="agentbox"`、`StatusbarSurface`
  传 `null` 状态源；渲染端不重复定义产品 runtime 常量。新增 i18n 键 4 个（type + 六语言）。
  （h）**本阶段新发现（登记不修）**：Command Center 浮层仍可达（route `command-center`）且是 legacy 数据面（B7）；
  插件 SDK 的 legacy 适配（`host-system.ts` 的 status/restartGateway/listPersistedSessions 等）同理（B8，当前无已挂载消费点）——结构门使其不再拉起运行时，只得到稳定拒绝码。
  实测门：electron 定向 2 files / 8 tests；UI 定向 10 files / 113 tests；回归 4 files / 61 tests；`npm run typecheck`
  三项目 exit 0；改动文件 ESLint exit 0；`git diff --check` exit 0；全量 UI 810 files / 7843 tests（809/7842 通过，
  仅 `renderer-layers` 陈旧 IN_FLIGHT 失败，文件与本阶段无交集）、全量 electron 170 files / 2243 tests（2 files /
  5 tests 失败，均为测试自建 loopback 服务在本环境 `ECONNREFUSED`，已用最小探针证明与改动无关）。
  阶段标记 **`LEGACY_CLIENT_CLOSEOUT_READY`**；P05 仍 **IN_PROGRESS**（下阶段 P07 §9.5/§9.6/§9.8 fixture 深度门
  与 HTTP/WS transport 一致性/无连接可观测性）；不声明 P05_CLIENT_GREEN、REAL_FLOW_VERIFIED、P06 GREEN、
  DESKTOP_IMPLEMENTATION_READY；writer_lease 保持 ACTIVE。
- 上一检查点改动（**P05 最终客户端审计，只读 + 文档收口，无生产代码变化**，
  产物 `evidence/P05-final-audit.md`）: 起点=终点 HEAD `6ca5d17a`，工作树 clean。实际结果——
  （a）`WireMethods` 28 键与 `evidence/P05-client-matrix.md` 28 行**集合全等**（无遗漏/重复/多余），
  逐行状态计数 28 `PRODUCTION_REACHABLE` 与表格声明一致，28/28 有真实生产调用者；
  （b）摘要三方一致：TS 权威 `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`、
  生成工件 `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`，与后端
  `wire-review.md` 12:15 `WIRE_LOCKED_FOR_IMPLEMENTATION` 登记逐字节相同，且工件可由 TS 权威
  按文档命令流式复现且逐字节相同；
  （c）事件流九跳（renderer subscribe → preload → main sender-owned → main-only token/WS → 帧 schema
  → reducer → gap 补水重订阅 → route 卸载/will-quit cleanup）**全部为生产接线**，token 只在 main
  闭包与 HTTP/WS 头；
  （d）**legacy 可达性未通过**：发现 5 条 `ACTIVE_AGENTBOX_BLOCKER`——状态栏 `getStatus()` 轮询
  （挂载/聚焦即发，**无需用户任何操作**）、命令面板打开时的 `listAllProfileSessions`、侧栏搜索
  `searchSessions`、Archived 视图 `loadArchivedSessions`（四条均**不查** `$gatewayState`），以及
  持久化 "All profiles" 后的 Open folder；它们经 `api/client.ts` → `hermes:api` →
  `api-proxy-ipc.ts` → `handleHermesApiRequest` → `ensureBackend` → **`startHermes()`**，
  即不只读 legacy 数据还会**拉起 legacy 运行时**，而 `startHermes()` 不读取产品 runtime 策略
  （全仓仅 `bootstrap-env-composition.ts:7194` 一处消费）；另有 1 条已上膛但当前无数据源的未匹配
  本地行预览。两道 autostart 门（renderer `features.tsx:778`、Electron
  `product-runtime-policy.ts`）**确实关闭**，但只约束急切启动；
  （e）两处如实性更正：WS 空连接是静默 no-op（生产未传 `onError`），"诚实 unavailable"只对 HTTP 成立；
  loopback 限制只在 WS，HTTP `requestUrl` 不校验 host；
  （f）P07 检查点 3 fixture 九组编号齐全且核心行为有真实行为测试（含 accepted/rejected/unknown、
  同 requestId 回查、队列三终态、`stop_requested`→终态、审批重放、history 快照/重同步），
  但 §9.5 队列续派、§9.6 审批失效族、§9.8 Server 重启核对**无测试**，`execution.state` 只验了 `failed`；
  （g）矩阵两处事实错误就地更正（发送三件套其实有 hello 门；队列能力门在 AgentBox 面不生效）。
  定向门：UI 4 files / **63 tests passed, exit 0**（core-v1 fixture、wire-v1-client、
  wire-session-control、agentbox-main-chat）；Electron 4 files / **22 tests passed, exit 0**
  （workcore-wire-ipc、agentbox-wire-transport、agentbox-wire-event-transport、
  agentbox-service-composition）。本阶段**未修改任何 TS/TSX、测试、schema、合同、Electron、preload、
  package/lock 或后端文件**，未跑完整 9600+ 套件、未跑 Windows、未运行模型。
- 上一检查点改动（sessions.archive 生产接线，代码提交 `cbdccf7c`）: 归档的是服务 SessionRecord——底层
  `$agentBoxSessions` **保留**归档记录（含服务返回的 `archivedAt`），侧栏纯投影因 `archivedAt !== null` 移除
  该行；不删除历史/消息、不停止运行、不归档 Workspace/Profile、不触碰文件，不做 `SessionRecord`→`SessionInfo`
  转换。application 侧 `archiveAgentBoxSession` 仍是唯一 seam，payload 收窄为显式 `{sessionId,
  expectedVersion, requestId}`，每次意图新 requestId，只采纳服务返回记录（版本单调 upsert，store 的 archived
  保留策略未改）。命令侧新增纯决策 `decideAgentBoxSessionArchive` 与生产入口
  `archiveRoutedAgentBoxSession`（与 pin 命令同形）：Session route 要求服务 ready + hello 声明
  `sessions.archive` + route id 记录已到 + `archivedAt === null`，缺一即 fail closed（`SERVICE_NOT_READY`/
  `CAPABILITY_NOT_DECLARED`/`SESSION_RECORD_NOT_ARRIVED`/`ALREADY_ARCHIVED`），绝不回落同 id legacy Session；
  非 Session route 保留 legacy 决策。侧栏 `AgentBoxSessionRow` 新增独立归档菜单项，
  `AgentBoxSessionList` 持有唯一 `{displayName, sessionId, version}` target 与唯一 `ConfirmDialog`：确认前
  不隐藏行、不发请求；确认时复检实时服务与能力，服务下线或能力消失 → 零 wire 调用、对话框保持并显示本地化
  `archiveFailed`；pending 连点单发；`CONFLICT_VERSION` 保留对话框、记录与投影且不自动重试；返回未归档记录则
  行保留并采用服务 version/名称；unavailable 时缓存行与真实状态继续显示但无归档入口；`sessions.update` 与
  `sessions.archive` 能力门独立（只有 update / 只有 archive / 两者都有 / 两者都无四种组合各自正确）。
  `features.tsx` 的当前会话归档命令（`session.archive` 快捷键）在 AgentBox route 走同一 CAS，成功后不导航、
  不清 route、不停止运行；非 Session route 旧行为不变。i18n 新增 `menuArchive`/`archiveTitle`/`archiveDesc`/
  `archiveFailed`（type 与六语言同步）。矩阵 `sessions.archive` 改为 `PRODUCTION_REACHABLE`（EXT），汇总
  **28 reachable / 0 gap**；G5b 改写为接线记录；该检查点当时记 P05 仍 IN_PROGRESS（待最终矩阵/fixture/legacy
  审计，**该审计已于 `6ca5d17a` 执行**，结果见本文件当前检查点）；REAL_FLOW_VERIFIED 仍为否。
- 上一检查点改动（sessions.update 侧栏投影服务状态边界返修）: 把 Workspace **归属**与**服务可调用性**分开——
  `agentBoxWorkspaceFor` 只按缓存 `$agentBoxWorkspaces` 与既有完整 `{kind,user,host}` + normalized path 匹配，
  不再要求 `phase === 'ready'`，因此 loading/unavailable 期间本地行不再回落 legacy `SessionInfo` 预览、WSL 行
  不再回落「sessions unavailable」、已建立的 AgentBox 权威不消失；`agentBoxArchiveFor` 单独继续要求 `ready` +
  hello 声明 `workspaces.archive` + 缓存匹配（旧 hello 不能让不可用服务继续提供无法执行的入口）。
  `AgentBoxSessionList` 先算缓存 records 再决定展示：有缓存时任何相位都显示服务行（unavailable 附紧凑状态与
  `service.detail` 纯文本、空则本地化 fallback；loading 或 catalog 未 ready 附紧凑 loading 标记），绝不回落
  legacy；改名/置顶只在 ready + `sessions.update` 已声明时可执行，其余状态行仍可打开（先选 shell 行再
  `sessionRoute(id)`）且零 wire 调用（跨服务下线的已打开改名对话框也不发送）；无缓存时 unavailable 显示
  unavailable（不是 spinner）、loading/idle 或 catalog 未 ready 显示 loading、仅 ready + catalog ready 显示
  空态。新增 i18n 键 `agentBoxSession.unavailable` / `unavailableReasonFallback`（type 与六语言同步）。
  矩阵仍 **27 reachable / 1 gap**，唯一剩余前端缺口仍为 sessions.archive；阶段状态 `SESSIONS_UPDATE_CLIENT_READY`
  以本次返修提交 `86911029` 为最终依据；P05 仍 IN_PROGRESS。本单只修 authority fallback，未开始 sessions.archive。
- 上一检查点改动（sessions.update 生产接线）: 统一侧栏在**服务 Workspace 匹配后**由其 AgentBox Session
  投影接管展开内容——新增纯投影（exact workspaceId、排除 archived、pinned-first、updatedAt 降序、id tie-break）
  与 `agentbox-sessions/` 行/列表；store 改为 version 单调采纳（旧 list/mutation 响应不覆盖更高 version，
  部分页不擦除其他 id）；改名与置顶走 `sessions.update` exact CAS（打开时捕获 id/version/displayName，不乐观、
  只采纳服务返回、conflict 保留草稿/对话框/投影、pending 连点单发、无能力零 wire 调用）；当前会话置顶命令经
  窄 seam 走同一 CAS，记录缺失/服务未 ready/能力未声明 fail closed 且不回落 legacy pin；未匹配 shell 行保持
  原行为，WSL 不再对已匹配 Workspace 显示 “sessions unavailable”。矩阵 **27 reachable / 1 gap**，唯一剩余
  前端缺口 sessions.archive（G5 拆为 G5a 已接 / G5b 待接）；阶段状态 `SESSIONS_UPDATE_CLIENT_READY`。
- 上一检查点改动（远端保存迟到响应返修）: 向导在关闭、Back、以及每次重新打开时使当前 save turn 失效，
  迟到保存成功不再 selectWorkspaceView/释放连接/关闭对话框（不会误关重新打开的新向导），当前保存语义不变、
  不伪称取消宿主保存；浏览组件在保存期间锁定 Back/Up/路径输入/Go/隐藏项/目录导航与 Enter，卸载后 choose 的
  成功/失败/throw 均不写 state 且无未处理 rejection；误命名常量改为 `BROWSE_CAPABILITY_UNSUPPORTED`（值不变）。
  矩阵仍 26 reachable / 2 gap。
- 上一检查点改动（workspaces.browse 接线）: WSL「Open remote folder」的目录枚举由宿主切到服务
  （`workspaces.browse`）：宿主只 discover/connect/验证 `{distribution,user,home}` 并保存 shell 记录，产品
  路径不再调用 `listWslDirectories` 且无兜底。浏览组件采用服务权威路径、latest-wins、失败保留上次清单、
  只读可进入可选、不可打开禁用并显示服务 reason、file/other 不导航、隐藏项仅本地过滤；能力缺失/服务未就绪
  时显示真实原因且零请求。确认目录后保存宿主记录并 `selectWorkspaceView`，由既有 workspaces.open 路径完成
  登记（浏览本身不建 Session/不启 Harness）。矩阵 `workspaces.browse` 改为 PRODUCTION_REACHABLE（EXT），
  汇总 **26 reachable / 2 gap**；G2 改写为接线记录。
- 上一检查点改动（workspaces.archive 接线）: 统一侧栏新增独立的「Archive in AgentBox」：只归档 AgentBox
  Server 的 WorkspaceRecord（不删文件、不隐藏本地行、不删 WSL 宿主记录、不级联 Session/历史、不停止运行中
  任务），与本地 Hide 与宿主 Remove 是三个不同条目。匹配沿用完整 identity + normalized path，且需 service
  ready + hello 声明该能力；应用的 `archiveAgentBoxWorkspace` 只发 exact CAS 请求并返回服务记录、不写 store。
  成功时**先清 neutral selection 再移除服务投影**（测试断言监听事件顺序），防止主聊天立即重新 open；冲突时
  对话框保持打开、投影与选择不变。矩阵 `workspaces.archive` 改为 PRODUCTION_REACHABLE（EXT），汇总
  **25 reachable / 3 gap**；G3 改写为接线记录。
- 上一检查点改动（workspaces.open 接线）: 已有本地/WSL 侧栏选择经 `workspaces.open` 登记为服务权威
  Workspace，并进入服务 Workspace 的新会话草稿（**不建 Session、不启 Harness**）。身份 exact：本地
  `{local,null,null}` + `project.path`（严格取项目自身文件夹；null/空串=无路径项目，不产生 open），
  WSL `{wsl, actualUser, distribution}` + rootPath，path 不改写；匹配要求完整 `{kind,user,host}` +
  normalized path 全等（WSL 含 actualUser，local 必须 host/user 双 null）；
  唯一身份是服务返回的 `WorkspaceRecord.id`（shell row id 不参与命中，直查走显式 `serviceWorkspaceId`）。
  同一 target 单飞、迟到只入服务缓存不切回界面/草稿/选择；provisional shell 草稿经既有
  `migrateSessionDraft` 迁移到服务 scope（目标非空则不覆盖、两边不删除）；能力未声明不发请求并呈现 hello
  reason，失败保留选择与草稿且不无限重试；服务 Workspace 未到前 `sendAvailable=false`。矩阵
  `workspaces.open` 改为 PRODUCTION_REACHABLE（EXT），汇总 **24 reachable / 4 gap**；G1 改写为接线记录。
- 上一检查点改动（pending 恢复顺序返修）: 发送边界顺序修正——已产生 `requestId` 的旧 pending 优先级
  最高，只以原 requestId 调 `sendOutcome.query`；当前草稿的配置 rejected/unavailable、Profile/Workspace
  缺失、附件未 stage、文本不同都不得阻断该恢复（`resolvePendingAgentBoxSend`，单一查询状态机，
  `sendAgentBoxMessage` 内部仍复检 pending 防并发）。生产能力门区分「恢复」与「新建」：有 pending 时
  `sendAvailable` 只要求可调用服务 + `sendOutcome.query` + draftScopeKey，不要求 `config.resolve`、发送
  动词或当前 Profile/Workspace，`onSubmit` 也不因 !workspace 提前返回。`config.resolve` 只在 scope 清空
  后执行——**不是跳过新发送的配置校验**，rejected/typed error 仍不发送。矩阵 23 reachable / 5 gap 不变。
- 上一检查点改动（config.resolve 接线）: 已锁定 `config.resolve` 接入产品路径——application 窄函数
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
  P04 切片1–9已提交；P05 sessions.archive 客户端接线已提交（`cbdccf7c`）；
  **P05 最终客户端审计已执行（只读，`6ca5d17a`）**：28 方法矩阵 28 生产可达 / 0 前端缺口且集合与
  计数机械全等、摘要三方一致、事件链生产接线完整；
  **随后 legacy 收口、最终收口与返修均已实施**：B1–B6 由 `f7759148`/`a6b751ff` 关闭；B7（Command Center）、
  命令面板 legacy 快捷项（含注册贡献行 `Toggle logs`）、P07 §9.5/§9.6/§9.8 fixture 深度、HTTP/WS
  transport 一致性、陈旧 `IN_FLIGHT` 由 `4efd1ec5`/`e087c976` 关闭；**B9（profile 分享）由 `d31897dc` 关闭**
  　→ **P05 = `P05_GREEN — CLIENT_IMPLEMENTATION_COMPLETE`（成立于 `d31897dc`；`30e3cf42` 的同一标记
  因同检查点刚登记 B9 而作废，该点记为 `P05_PARTIAL`）**；仍不声明 `REAL_FLOW_VERIFIED`、
  P06 GREEN、DESKTOP_IMPLEMENTATION_READY（lifecycle connection 为后端/集成外部缺口）；
  **B8 = `UNREACHABLE_OR_PROTECTED`；B9 已关闭**；
  **P06 独立验收入口已执行并收口**（`evidence/P06.md`）：在 P05 的「产品外壳面」之外另查出并关闭
  B10/B11/B12 三条可达 legacy 路径，以及 Windows 原应用验收查出的连接遮罩与渲染端 legacy 请求；
  最终 Windows 驱动 **20 PASS / 0 FAIL / 0 SKIP / 0 PENDING**，完整 UI 全通过，
  loopback 两文件由 Windows 同测试裁决为 WSL 环境基线
- 完成范围: P00；P01 全部返修（真机 27 PASS）；P07 检查点 1（语义映射）、检查点 2
  （wire-v1 候选：17 方法 + schema 测试 + JSON Schema 工件；已消费后端机械反馈并回应）；
  P02A（失败面非阻塞+可关闭、Artifacts 页退役、失败终态竞态修复与真机门）
- 下一项: 前端本端范围已全部交付，现停止写入并释放写权。剩余工作按其归属分列——
  （1）**Server lifecycle connection 合同到达后接生产接线**（后端/全栈集成人），再验证 REAL_FLOW；
  （2）**外围合同**（Skills/MCP/Data/备份恢复）下单后按既有诚实不可用页替换为真实页面；
  （3）`history.snapshot` 旧页游标在 wire 允许时挂载「向上翻旧页」；
  （3）**B9 已关闭**（原入口 `features/chat/sidebar/filter-menu.tsx` 与命令面板贡献行过滤；
  `profile-switcher.tsx`、`store/profile-share.ts`、`api/profiles.ts` 保留为不可达的 legacy 兼容代码，
  将来若 AgentBox 需要 profile 打包能力，需先有 wire-v1 合同）；
  B8 按工单不删除、不重构插件 API，仅在将来误挂载时由 `hermes:api` 硬门保护。
  不再重新研究协议，不因矩阵 28/28 跳过上述任一项。
- 阻断: **本端无活动阻断**。B1–B7、B9 关闭；P06 另关闭 B10（失败面板 legacy 网关设置 →
  `hermes:connections:test` → `startHermes()`）、B11（状态栏连接/网关切换器）与 B12
  （Agents/Cron/Webhooks/Starmap 视图及入口）；B8 属 `UNREACHABLE_OR_PROTECTED`。
  剩余非本端项为 P04 production lifecycle connection（外部合同）与外围合同；
  wire 摘要已锁定，真实全栈仍由后续集成人验证。
  **已知残余（如实登记）**：1 处渲染端 `/api/config` 读取被渲染端门拒绝、不产生 IPC、不触达 Hermes
  （产品组合根的配置记录 + MCP 健康巡检），关闭需 wire 偏好项或 MCP 外围合同；
  `SessionPickerOverlay` 潜在未门控但当前不可达；`SessionRecord` 旧页游标未挂载。

- contract_semantics_version: core-semantics/1（APPROVED_SEMANTICS，2026-09-14）
- wire_version/schema_digest: wire-v1 WIRE_LOCKED_FOR_IMPLEMENTATION；当前权威
  sha256:11e3b3e70d332585，工件 sha256:5d4fa3bfeec6c327；后端 `c8d9d3c` 以该工件
  29 passed in 67.57s 并登记同一摘要；锁定不替代生产联调
- 合同测试: schema/client/fixture 3 files / 34 tests passed；queue 终态合并面 2 files / 31 tests、
  core fixture 1 file / 10 tests passed；core v1 §9 九组场景矩阵已执行，但**最终审计确认三处深度缺口**
  （§9.5 队列续派、§9.6 审批失效族、§9.8 Server 重启核对无测试；`execution.state` 只验 `failed`），
  故不得声称 fixture 覆盖完整；真实 wire event stream 与后端投影差异仍是联调项，
  不以 fixture 伪称服务通过
- UI_READY: 侧栏工作区列表（36R+P01）真机全绿；P02A 真机 8 PASS / 0 FAIL / 1 PENDING
- CONTRACT_CLIENT_READY: wire-v1 客户端/fixture 与 28 方法摘要 LOCKED；production request/event
  transport 已接线，28 个方法在 AgentBox 产品组合中全部有生产调用者（`cbdccf7c` 后 0 前端缺口）；
  摘要三方一致且工件可流式复现（`6ca5d17a` 复核）；Server lifecycle connection 来源待正式跨端合同。
  **该标签只覆盖 wire-v1 方法面，不覆盖 legacy REST 可达性**（见下行）
- LEGACY_CLIENT_CLOSEOUT: **通过 + P06 追加权威门**。P05 阶段标记 `LEGACY_CLIENT_CLOSEOUT_READY`
  （`f7759148` + `a6b751ff`）覆盖**产品外壳面**；P06 在此外另关闭 B10/B11/B12
  （失败面板 legacy 网关设置、状态栏连接/网关切换器、四个 legacy 视图与入口），并新增渲染端
  legacy REST 门（`src/api/legacy-rest.ts`）。**当前不存在会把 AgentBox 产品带向 legacy Hermes 的路径**：
  渲染端不再发出 `hermes:api` 请求（Windows 驱动实测 main 侧拒绝 0 行），
  `hermes:connections:test` 不再可达（其本地分支会 `startHermes()`）。残余如实登记见「阻断」行。
  阶段标记 `f7759148` + `a6b751ff` 的语义如下——
  B1–B6 关闭：状态栏/命令面板/侧栏搜索/Archived 在产品 authority 下零 legacy 请求，未匹配本地行不再渲染
  legacy 预览，all-profiles 项目刷新在 `ensureBackend` 之前被结构门挡住且打开本地文件夹未破坏。
  **同批新发现仍未迁移**：Command Center 浮层（route 可达）与插件 SDK `host.status()`（B7/B8），
  结构门使其不再拉起运行时、只得到 `LEGACY_RUNTIME_DISABLED_FOR_PRODUCT`。
  见 `evidence/P05-final-audit.md` §10
- REAL_FLOW_VERIFIED: **否**（无真实 Server/Harness/模型链路证据；`UI_READY` 与
  `CONTRACT_CLIENT_READY` 成立，三者不互相替代）。真实全栈由接管 `FULLSTACK_INTEGRATION_OWNER`
  的后端执行者按 handoff-policy 验证；本端不声明 `AGENTBOX_DESKTOP_PRODUCT_GREEN`。

- frontend_implementation: **DESKTOP_IMPLEMENTATION_READY**（P06 独立验收完成，`evidence/P06.md` +
  `evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md`）——已批准且前端可独立完成的产品面、application/store、
  wire 客户端与 Electron 客户端边界均已实现；无真实 Server 时应用可打开、离线/Unavailable 状态诚实且
  不阻塞本地界面；AgentBox 产品不启动也不调用 legacy Hermes；核心合同客户端与行为 fixture 已锁定；
  完整测试、Windows 原应用与交付材料达到前端交接标准。
  **它不表示** `REAL_FLOW_VERIFIED`、真实 Server/Harness/模型已联调、全栈 GREEN 或外围合同已到。
  （历史：同一行曾记录为 PARTIAL；分阶段完成记录见本文各检查点与 `evidence/P02..P07.md`。）
- writer_lease: **RELEASED（2026-09-14，P06 收口）** —— 前端 goal 已停止全部写入，现无前端 writer。
  释放前逐项确认：所有子代理已结束（A 功能矩阵审计、B 边界/交接审计均为只读且已回报）；
  WSL 无 Vitest/Vite/Playwright/Electron/tsc 进程，Windows 无 electron/node/hermes 进程；
  工作树与暂存区 clean（`git status --short` 为空、`git diff --check` exit 0）；
  `evidence/P06.md`、`evidence/P06-assets/**`、`evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md` 已提交；
  无剩余本端实现缺陷（P06 查出并修复 B10/B11/B12、连接遮罩、渲染端 legacy 请求）。
  释放前的 lease 记录：ACTIVE — Zcode frontend goal（2026-09-14 接管自 Codex 前端产品 goal），
  各阶段起点与子代理划分见下方各检查点。released 之后本文件不再修改。

## 测试与基线（接力会话实跑）

- **P06 独立验收（`eef059a9` + 本轮修复，实跑）**：三项目 `npm run --workspace apps/desktop typecheck`
  exit 0；`apps/shared` typecheck exit 0；`npm test --prefix tests-js` **8 files / 47 tests passed**；
  层序/合同守卫（`renderer-layers.test.ts`、`renderer-layers.debt.test.ts`、`types/wire/fixtures/core-v1.test.ts`）
  **3 files / 30 tests passed**；`npm run --workspace apps/desktop lint` **exit 0 / 0 error / 141 warning**
  （135 `no-restricted-globals` + 6 `react-hooks/exhaustive-deps`，全部位于本分支未改动文件；
  改动文件 0 warning）；`npm run --workspace apps/desktop build` exit 0，`src/`/`electron/` 无 TS 影子 `.js`
  （仅保留 tracked 的两个真实插件 `.js`），dist 新于全部源码。
  **完整 Desktop Vitest（正式最终门）**：`987 files（2 failed / 983 passed / 2 skipped）、
  10218 tests（4 failed / 10208 passed / 6 skipped）`，其中 **UI 815 files / 7915 tests 全部通过**、
  electron **172 files / 2303 tests（2 files / 4 tests failed）**——失败恒为
  `legacy-hermes/api-transport.test.ts`（1）与 `host-capabilities/credentials/mcp-oauth-callback-ipc.test.ts`（3），
  两文件自建 loopback 服务在本 WSL 环境 `ECONNREFUSED`、不 import 本阶段改动模块。
  过程：修复前 983 files / 10182 tests（2/4 failed）→ 首轮修复 984 / 10194（2/4）→ 二轮修复 987 / 10218（2/4），
  失败文件恒为同一对，计数只随新增测试上升。**Windows 同测试裁决**：上述两文件
  `npx vitest run --project electron …` → **2 files / 32 tests passed, exit 0** ⇒ WSL 环境基线，非产品缺陷。
  **Windows 原应用验收**：`apps/desktop/e2e/p06-independent-acceptance-driver.mjs` →
  **20 PASS / 0 FAIL / 0 SKIP / 0 PENDING**（`evidence/P06-assets/results.json` + 6 张必需截图 + 两日志 + SHA256SUMS）；
  关键读数：遮罩覆盖率 100% → **0.0%**、首窗 1018ms、main 侧 legacy 拒绝 **0** 行、
  关闭后 20s 内启动进程树全空、假 `hermes` 从未被以 `serve` 调用。
  驱动纯 helper 单测 `e2e/p06-independent-acceptance-driver.unit.test.ts` **15 tests passed**。
  本阶段未读密钥、未运行模型、未改后端。

- **P05 返修（`d31897dc`，实跑）**：B9 定向 4 文件（`features/chat/sidebar/filter-menu.test.tsx`（新增 5）、
  `chat-sidebar.integration.test.tsx`(10)、`chat-sidebar.workspace-assembly.test.tsx`(16)、
  `command-palette/body.test.tsx`(12)）→ **4 files / 43 tests passed, exit 0**；
  `src/features/chat/sidebar` 回归 → **31 files / 256 tests passed, exit 0**；
  `command-palette/` 回归 → **2 files / 17 tests passed, exit 0**；
  `npm run --workspace apps/desktop typecheck` 三项目 exit 0；改动/新增 7 个 TS/TSX ESLint exit 0；
  `git diff --check` exit 0。未重跑完整 UI（上一 HEAD 已通过 811 files / 7882 tests，P06 统一跑最终全量门）。
  两处 `SidebarFilterMenu` 挂载分别由组装测试覆盖，均翻转 `$gatewayState` 证明 authority 不随 gateway
  状态改变、无 legacy 回落；测试先证明 Profile 子菜单确实打开再断言 `Import profile…` 不存在。

- **P05 最终收口（`4efd1ec5` + `e087c976`，实跑）**：UI 定向 10 文件（`features/command-center`（index 15 +
  delete-confirm 3）、`command-palette/body.test.tsx`(9) + `palette-helpers.test.ts`(5)、
  `dev/contracts/renderer-layers.test.ts`(16)、`types/wire/fixtures/core-v1.test.ts`(13)、
  `application/session/wire-session-control.test.ts`(29)、`wiring/agentbox-main-chat.test.tsx`(32)、
  `application/session/agentbox-composer.test.ts`(15)、`application/session/wire-send.test.ts`(6)）
  → **10 files / 141 tests passed, exit 0**；B1–B7 legacy 回归 10 文件（`use-status-snapshot.test.ts`、
  `registrations/surfaces.test.tsx`、`sidebar/agentbox-sessions/*`、`chat-sidebar.integration.test.tsx`、
  `sidebar/workspace-list/*`、`wire-session-catalog.test.ts`、`agentbox-session-projection.test.ts`、
  `store/projects.test.ts`）→ **10 files / 135 tests passed, exit 0**；`renderer-layers.test.ts` 单独
  → **1 file / 16 tests passed**（陈旧 `IN_FLIGHT` 失败消失）；Electron 定向 7 文件（`agentbox-wire-endpoint-policy`
  25、`agentbox-wire-transport` 17、`agentbox-wire-event-transport` 15、`agentbox-service-composition` 6、
  `workcore-wire-ipc` 4、`api-proxy-ipc` 5、`product-runtime-policy` 3）→ **7 files / 75 tests passed, exit 0**；
  i18n 5 files / 34 tests passed；`npm run --workspace apps/desktop typecheck` 三项目 exit 0；
  改动/新增 29 个 TS/TSX ESLint exit 0；`git diff --check` / `git diff --cached --check` exit 0。
  全量：**UI 811 files / 7882 tests 全部通过（exit 0）**；**Electron 171 files / 2288 tests：
  2 files / 4 tests failed（另一轮 5 failed）** —— `host-capabilities/credentials/mcp-oauth-callback-ipc.test.ts`
  与 `legacy-hermes/api-transport.test.ts`，两文件自建 loopback 服务在本环境 `ECONNREFUSED`（不 import 本阶段
  改动模块），**原样记录、不靠重跑掩盖**。意外产物更正：子代理早期 `tsc --build tsconfig.json`（无 outDir）
  在源树生成 2160 个被 gitignore 遮蔽的 `.js` 影子文件（Vite 优先解析 `.js`，会加载旧编译副本），已全部删除、
  无 tracked 删除，并在干净树上重跑上列全部门。

- **P05 legacy 客户端收口（`f7759148` + `a6b751ff`，实跑）**：electron 定向
  `npx vitest run --project electron electron/ipc/api-proxy-ipc.test.ts electron/app/product-runtime-policy.test.ts`
  → **2 files / 8 tests passed, exit 0**；UI 定向 10 文件
  （`use-status-snapshot.test.ts`、`command-palette/body.test.tsx`、`palette-helpers.test.ts`、
  `chat-sidebar.integration.test.tsx`、`chat-sidebar.workspace-assembly.test.tsx`、
  `agentbox-sessions/agentbox-session-list.test.tsx`、`agentbox-sessions/agentbox-global-sessions.test.tsx`、
  `unified-workspace-list.test.tsx`、`registrations/surfaces.test.tsx`、`gateway-groups.test.tsx`）
  → **10 files / 113 tests passed, exit 0**；回归（`wire-session-catalog.test.ts`、
  `agentbox-session-commands.test.ts`、`agentbox-main-chat.test.tsx`、`agentbox-chat-view.test.ts`）
  → **4 files / 61 tests passed, exit 0**；`npm run typecheck` 三项目 exit 0；改动文件 ESLint exit 0；
  `git diff --check` exit 0。全量：UI **810 files / 7843 tests（809 files / 7842 tests 通过）**，
  唯一失败 `src/dev/contracts/renderer-layers.test.ts` 的陈旧 `IN_FLIGHT: agentbox`（该目录自 `5fae0dcc`
  起不存在，文件与本阶段无交集）；electron **170 files / 2243 tests（2 files / 5 tests 失败）**，
  失败为 `mcp-oauth-callback-ipc.test.ts` 与 `legacy-hermes/api-transport.test.ts` 自建 loopback 服务在
  本环境 `ECONNREFUSED`（最小探针复现：vitest worker 内 bind+fetch 同样被拒，同 shell 直接 node 成功；
  两文件不 import 本阶段任何改动）。

- **P05 最终客户端审计（`6ca5d17a`，只读）**：定向门 `npx vitest run --project ui
  src/types/wire/fixtures/core-v1.test.ts src/api/wire-v1-client.test.ts
  src/application/session/wire-session-control.test.ts
  src/app/composition/wiring/agentbox-main-chat.test.tsx` → **4 files / 63 tests passed, exit 0**；
  `npx vitest run --project electron electron/ipc/workcore-wire-ipc.test.ts
  electron/security/agentbox-wire-transport.test.ts
  electron/security/agentbox-wire-event-transport.test.ts
  electron/composition/agentbox-service-composition.test.ts` → **4 files / 22 tests passed, exit 0**。
  机械核验：`WireMethods` 28 键 ↔ 矩阵 28 行集合全等（missing/extra/duplicate 均空）、
  逐行状态计数 28 `PRODUCTION_REACHABLE`、`git diff --check` exit 0、`git status --short` 空。
  摘要：TS `11e3b3e7…c10035` / 工件 `5d4fa3bf…5e4ed`，工件可由 TS 权威流式复现且逐字节相同。
  未跑完整 9600+ 套件、未跑 Windows、未运行模型、未装依赖、未读密钥、未改生产代码。
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
  open，旧 boot overlay 退出，AgentBox availability 保持独立。**范围更正（`6ca5d17a` 最终审计）**：
  "在读取 Hermes bridge 前关闭"只对 `useGatewayBoot` 这条路径成立——状态栏、命令面板、侧栏搜索/归档
  等其他已挂载面**不经过该门**即读取 bridge，见 `evidence/P05-final-audit.md` §4.3。
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
- sessions.update 生产接线（8cdd1381）：验收 `npx vitest run --project ui
  src/application/session/wire-session-catalog.test.ts
  src/application/session/agentbox-session-projection.test.ts src/store/agentbox-service.test.ts
  src/features/chat/sidebar/agentbox-sessions/agentbox-session-list.test.tsx
  src/features/chat/sidebar/agentbox-sessions/agentbox-session-row.test.tsx
  src/features/chat/sidebar/unified-workspace-list.test.tsx
  src/features/chat/sidebar/workspace-list/workspace-row.test.tsx
  src/app/composition/wiring/agentbox-session-commands.test.ts` → **8 files / 76 tests passed，exit 0**；
  相关回归 5 files / 70 tests passed（agentbox-main-chat、agentbox-chat-view、sidebar workspace assembly、
  agentbox-composer、wire-send）；`npm run typecheck` 三项目通过；改动 24 个 TS/TSX 文件 ESLint 0 error /
  0 warning；`git diff --check` 干净。覆盖：投影隔离/排序、v7→v6 不覆盖、部分页保留、本地与 WSL 投影接管、
  空/loading 不回落 legacy、打开顺序与零 create/send/open 调用、改名 exact CAS/唯一 requestId/规范化回写/
  conflict 保留草稿/pending 连点单发、置顶 exact CAS/无 optimistic/成功排序/失败保持/高 version 采纳、
  命令 route 权威与 fail closed、非 Session route 行为不回归；测试内无 SessionRecord→SessionInfo 转换与
  源码文本断言。
- sessions.update 服务状态边界返修（86911029）：验收 `npx vitest run --project ui
  src/features/chat/sidebar/agentbox-sessions/agentbox-session-list.test.tsx
  src/features/chat/sidebar/unified-workspace-list.test.tsx` → **2 files / 46 tests passed，exit 0**
  （新增 12 例）；要求的相关回归 6 files / 40 tests passed（agentbox-session-row、workspace-row、
  project-menu、agentbox-session-commands、wire-session-catalog、agentbox-service）；扩大扫
  `src/features/chat/sidebar` + `src/i18n` 34 files / 252 tests passed；上一检查点同口径回归
  5 files / 70 tests passed；`npm run typecheck` 三项目通过；改动 11 个 TS/TSX 文件 ESLint 0 error /
  0 warning；`git diff --check` 干净。覆盖：本地/WSL 缓存行跨 ready→unavailable 保持归属、legacy 预览
  各相位均不出现、unavailable detail 纯文本与空值本地化 fallback、无缓存 unavailable 不显示 spinner、
  loading/catalog 未 ready 与缓存行并存、归档入口在旧 hello + unavailable 下消失且零 archive 调用、
  恢复 ready 后维护入口回归且无重复行、既有 CAS/conflict/pending 断言不降级；新增断言在修复前
  10 failed / 36 passed（临时以 `git show HEAD:` 还原组件复跑，未改仓库）。
- sessions.archive 生产接线（cbdccf7c）：定向门 `npx vitest run --project ui
  src/application/session/wire-session-catalog.test.ts
  src/application/session/agentbox-session-projection.test.ts src/store/agentbox-service.test.ts
  src/features/chat/sidebar/agentbox-sessions/agentbox-session-row.test.tsx
  src/features/chat/sidebar/agentbox-sessions/agentbox-session-list.test.tsx
  src/app/composition/wiring/agentbox-session-commands.test.ts` → **6 files / 77 tests passed，exit 0**；
  相关回归 6 files / 93 tests passed（unified-workspace-list、workspace-row、agentbox-main-chat、
  agentbox-chat-view、agentbox-composer、wire-send）；扩大扫 `src/features/chat/sidebar` + `src/i18n` +
  `src/app` 114 files / 1042 tests passed；`npm run typecheck` 三项目通过；改动 16 个 TS/TSX 文件
  ESLint 0 error / 0 warning；`git diff --check` 干净。覆盖：侧栏 exact `{sessionId, expectedVersion,
  requestId}` 与唯一 requestId、确认前不隐藏、pending 连点单发、conflict 保留对话框/记录/投影、
  服务下线与能力消失零 wire 调用、archived 返回后行消失而 `$agentBoxSessions[id]` 仍带 `archivedAt`、
  未归档返回行保留并采用服务 version/名称、能力四组合、unavailable 缓存行无归档入口；
  当前会话命令的 route 权威/同 seam 同 CAS/四种 fail closed/非 Session route 不回归；
  无 runs.stop、无 send/update/workspaces.archive 级联；archive v3 后迟到 list v2 与 update v1 不复活
  active 行而相同/更高版本仍权威采纳；测试内无源码文本断言与 SessionRecord→SessionInfo 转换。
- 远端保存迟到响应返修（4a057609）：验收 `npx vitest run --project ui
  src/features/workspace/agentbox-workspace-browser.test.tsx
  src/features/workspace/wsl-workspace-wizard.test.tsx` → **2 files / 33 tests passed，exit 0**；扩大门
  （+ wire-workspace-browser、latest-wins）**4 files / 40 tests passed，exit 0**；相关门（wire-workspace-catalog、
  agentbox-main-chat、unified workspace list）3 files / 63 tests passed；`src/features/workspace` +
  `src/features/chat` 96 files / 673 tests passed；`src/application/workspace` + `src/app/composition`
  12 files / 145 tests passed；`npm run typecheck` 三项目通过；改动 4 个 TS/TSX 文件 ESLint 0 error /
  0 warning；`git diff --check` 干净。
- workspaces.browse 生产接线（a8142125）：验收 `npx vitest run --project ui
  src/application/workspace/wire-workspace-browser.test.ts src/application/workspace/latest-wins.test.ts
  src/features/workspace/agentbox-workspace-browser.test.tsx
  src/features/workspace/wsl-workspace-wizard.test.tsx` → **4 files / 31 tests passed，exit 0**；
  相关回归 5 files / 90 tests passed（wire-workspace-catalog、wsl-workspace-usecases、agentbox-main-chat、
  unified workspace list、sidebar workspace assembly）；`src/features/chat` + `src/features/workspace`
  96 files / 664 tests passed；`npm run typecheck` 三项目通过；改动文件 ESLint 0 error / 0 warning；
  `git diff --check` 干净。
- workspaces.archive 生产接线（f6b457b5）：验收 `npx vitest run --project ui
  src/application/workspace/wire-workspace-catalog.test.ts
  src/features/chat/sidebar/unified-workspace-list.test.tsx
  src/features/chat/sidebar/workspace-list/workspace-row.test.tsx
  src/features/chat/sidebar/projects/project-menu.test.tsx` → **4 files / 45 tests passed，exit 0**；
  相关回归 5 files / 67 tests passed（agentbox-main-chat、agentbox-service、sidebar workspace assembly、
  workspace-view、wsl-workspace-usecases）；`src/features/chat` 全目录 94 files / 640 tests passed；
  `npm run typecheck` 三项目通过；改动文件 ESLint 0 error / 0 warning；`git diff --check` 干净。
- workspaces.open 生产接线（3e207376）：验收 `npx vitest run --project ui
  src/application/workspace/wire-workspace-catalog.test.ts src/store/agentbox-service.test.ts
  src/app/composition/wiring/agentbox-main-chat.test.tsx src/features/chat/agentbox-chat-view.test.ts`
  → **4 files / 55 tests passed，exit 0**；相关回归 4 files / 59 tests passed（agentbox-composer、
  wire-send、sidebar workspace assembly、composer store）；`src/features/chat` 全目录 94 files /
  627 tests passed；`npm run typecheck` 三项目通过；改动文件 ESLint 0 error / 0 warning；
  `git diff --check` 干净。覆盖本地/WSL exact payload、created=false 采纳服务 id、同 path 不同环境不互认、
  shell id 与无关 wire id 相同不误命中、服务已有记录不 open、单飞、迟到 A/B、capability/失败处理、
  provisional→authoritative 草稿迁移（含目标非空不覆盖）、无自身文件夹的项目（含其有 repo 路径者）与
  Home bucket/空路径均不 open、Session route 不 open；身份匹配返修后同 distro/path 的错 user 记录不误命中、
  只有错 user 时仍 open 且 payload user 精确、exact user 命中时 open 零调用。
- pending 恢复顺序返修（b6d0bc6f）：`npx vitest run --project ui
  src/application/session/wire-send.test.ts src/application/session/agentbox-composer.test.ts
  src/app/composition/wiring/agentbox-main-chat.test.tsx src/application/profile/wire-composer-profile.test.ts
  src/features/chat/composer/hooks/use-composer-profile.test.tsx
  src/features/chat/composer/profile-controls.test.tsx` → **6 files / 62 tests passed，exit 0**；
  回归面（composer 全目录 + legacy chat view + agentbox chat view）44 files / 265 tests passed；
  `npm run typecheck` 三项目通过；改动 6 个 TS/TSX 文件 ESLint 0 error / 0 warning；
  `git diff --check` 干净。覆盖 pending 优先于配置与草稿校验（调用序列严格 `['sendOutcome.query']`）、
  旧 accepted 不清新草稿、unknown 保持同一 requestId、rejected 清 pending 保留草稿、恢复/新建/缺 query
  三种能力门，以及无 pending 时 resolve→send、rejected、typed error 的回归。
- config.resolve 生产接线（940c9df4）：`npx vitest run --project ui
  src/application/profile/wire-composer-profile.test.ts src/application/session/agentbox-composer.test.ts
  src/features/chat/composer/profile-controls.test.tsx
  src/app/composition/wiring/agentbox-main-chat.test.tsx
  src/features/chat/composer/hooks/use-composer-profile.test.tsx` → **5 files / 47 tests passed，exit 0**；
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
| P02 上层产品 | IN_PROGRESS（A/B/C/D 主面与服务投影完成；Profile 默认配置编辑、Workspace 选择登记、统一侧栏服务 Session 投影/改名/置顶与 **Session 归档**已接（含 `86911029` 服务状态边界返修与 `cbdccf7c` 归档接线）；矩阵 28 生产可达 / 0 前端缺口） | P01 已满足 |
| P03 用例状态与API | IN_PROGRESS（主 route 生产调用者与 event reducer 接入已完成；真实 Server 源待 P04） | 与 P02 穿插 |
| P04 宿主与遗留退役 | IN_PROGRESS（production request/Session-event transport + IPC + supervisor；两道急切 autostart 门已退役，**惰性 `hermes:api` 门已于 `f7759148` 收口**——agentbox runtime 下任何 `hermes:api` 请求都在路由/`ensureBackend` 之前以 `LEGACY_RUNTIME_DISABLED_FOR_PRODUCT` 拒绝；**HTTP/WS loopback 判据已统一、WS 无连接可观测已由 `4efd1ec5` 关闭（切片 9）**；B7 已于 `e087c976` 关闭；**B9 profile 分享 legacy 数据面已于 `d31897dc` 在 renderer 侧关闭（该点 electron/ 零改动，门与 transport 未变）**；B8 归类 `UNREACHABLE_OR_PROTECTED`（无已挂载消费点 + 硬门保护，非活动阻断）；Server connection 合同待后端） | 与 P03 穿插 |
| P05 正式合同接入 | **`P05_GREEN — CLIENT_IMPLEMENTATION_COMPLETE`（成立于 `d31897dc`）**（`6ca5d17a` 最终审计：28 方法矩阵 **28 生产可达 / 0 前端缺口**、集合与计数机械全等、摘要三方一致、事件链生产接线完整；legacy 可达性 5 条 `ACTIVE_AGENTBOX_BLOCKER` + 1 条已上膛**已在 `f7759148`/`a6b751ff` 收口（B1–B6）**；**B7、命令面板 legacy 快捷项（含 `Toggle logs`）、§9.5/§9.6/§9.8 fixture 深度、HTTP/WS transport 一致性、陈旧 `IN_FLIGHT` 已由 `4efd1ec5`/`e087c976` 关闭；B9 profile 分享已由 `d31897dc` 关闭**；全量 UI 811 files / 7882 tests 全通过。`30e3cf42` 的 GREEN 声明因同检查点刚登记 B9 而**作废**，该点记为 `P05_PARTIAL`。仍不声明 `REAL_FLOW_VERIFIED`（lifecycle connection 为后端/集成外部缺口）、P06 GREEN、DESKTOP_IMPLEMENTATION_READY；**B8 = `UNREACHABLE_OR_PROTECTED`；B9 已关闭——无已知 AgentBox 可达 legacy 调用路径**） | wire 双端锁定 |
| P06 前端验收与交接 | **`P06_GREEN — FRONTEND_INDEPENDENT_ACCEPTANCE`**（`evidence/P06.md`：Linux/WSL 全门、Windows 同测试 loopback 裁决、静态只读核验、交付 handoff；**r2 Windows 原应用驱动 22 PASS/0 FAIL/0 SKIP/0 PENDING，`allOk=true`，两道 legacy REST 门独立成立**；`DESKTOP_IMPLEMENTATION_READY`；`REAL_FLOW_VERIFIED=否`，真实全栈门由后续集成人负责）。**r1 的「20 PASS」读数已被证伪并保留为失败门历史**（`P06.md` §1–§9、`evidence/P06-assets/`、`evidence/P06-assets-r2-attempt1/`），本次 GREEN 建立在 §10 的缺陷修复与 §11 的新证据上 | P05 已 GREEN、P07 wire 已锁定；lifecycle connection 属外部缺口，不阻塞本端 READY |
| P07 核心合同与状态交接 | 检查点1–6已提交；WIRE_LOCKED（**检查点 3 的 fixture 深度经最终审计下调**：§9.5/§9.6/§9.8 无测试，不得声称完整覆盖） | 28 方法双端摘要一致；fixture/客户端已锁定 |

## 测试与证据基线（本轮实跑）

- **最新（P05 最终收口，`4efd1ec5` + `e087c976`）**：全量 UI 811 files / 7882 tests 全通过；
  全量 Electron 171 files / 2288 tests（2 files / 4 tests failed，自建 loopback 服务环境问题，原样记录）；
  定向与回归门、三项目 typecheck、改动文件 ESLint、`git diff --check` 全绿。层序守卫
  **16/16 通过**——陈旧 `IN_FLIGHT` 已清除（`IN_FLIGHT = []`，两项目录均不存在），
  **此前"唯一失败=已知环境基线"就此消失**，不再作为基线残留。
- 本地（历史，P01–P05 期间）：sidebar 全量 241 项通过（含 3 条 P01 装配反例）；三项目 typecheck exit 0；
  改动文件 eslint 0/0；层序账本 md5 57011a54… 逐字节不变。当时层序守卫 15/16，唯一失败为
  `IN_FLIGHT` 陈旧项（已在 P05 最终收口清除，见上）。
- Windows：`docs/validation/windows-acceptance-round36r-p01/`（p01r7，exit=0，
  24 截图+log）；36R postfix 旧证据原样保留；r1–r6 迭代失败史见 evidence/P01.md §3。

初始36R基线39291df，整体PARTIAL。38研究READY_FOR_DECISION，不是Harness生产依赖批准。
不继承旧GREEN，不因工单文件存在宣称功能已交付。

---

## 更正（2026-09-15）：P06 诚实性返修 — writer_lease=ACTIVE

- **updated_at: 2026-09-15（+08:00），writer_lease = `ACTIVE — P06 honesty repair`**。
  本行覆盖本文件此前所有 `RELEASED` 陈述的**当前**效力；旧记录一律保留，不删除、不改写。
- **授权来源**：用户本派单显式重新授予**有限前端写权**（仅本返修范围）。原前端 goal 不自动恢复写入；
  本会话完成后重新释放。

### 暂停声明（不删除 9fe414a2 的历史记录）

`9fe414a2` 所声明的 **`P06_GREEN — FRONTEND_INDEPENDENT_ACCEPTANCE`** 与
**`DESKTOP_IMPLEMENTATION_READY`** 因**协调验收发现两个缺陷**而**暂停生效**（非作废记录，
历史行保留于本文件与 `evidence/P06.md`）。两项缺陷均为**本端**缺陷，不是后端缺口：

1. **`/api/config` 活动 legacy 控制流**：AgentBox 产品组合根仍以
   `useHermesConfigRecord()`（`wiring/features.tsx:824`，供 `resume_last_session`）决定冷启动恢复；
   `useDesktopIntegrations` 在 agentbox 下仍启动 MCP legacy 健康巡检
   （`bridges/desktop-integrations.ts:79`）。两者都在渲染端 legacy REST 门前被拒、不触达 Hermes
   ——但**产品仍在发起 legacy 请求**，而 P06 驱动把该事实只当作 detail 记录、不当作门，
   于是 `no-legacy-rest-reached-main` 在 `residualLegacyPaths=["/api/config"]` 下仍判 PASS。
   `evidence/P06.md` §6 把这一残余登记为 `WAITING_PERIPHERAL_CONTRACT` 属于**错误归类**：
   它是本端可达的 legacy 控制流，不是外围合同缺失。
2. **P06 驱动 fail-open**：`legacy-view-routes-retired` 的 `record(id, step, status, detail)`
   参数顺序写错（`driver.mjs:556-562` 把 `no-legacy-rest-reached-main` 当作 step、把路由明细当作
   status），使该步的 `status` 是描述文本而非 `PASS/FAIL`；`summarizeResults` 对未知 status
   **静默忽略**，该步既不计入 counts（`results.json` 21 条 steps 对 20 个 counts）也不参与
   `allOk`——**一次真实的 FAIL 会被无声吞掉**。驱动同时缺少「必需 step 缺失/重复/非法 status」
   与「renderer `residualLegacyPaths` 必须严格为 `[]`」两条独立门。

在返修与新 Windows r2 证据齐备之前，本文件**不维持** `P06_GREEN` / `DESKTOP_IMPLEMENTATION_READY`
的现行效力。`REAL_FLOW_VERIFIED=否` 与 `AGENTBOX_DESKTOP_PRODUCT_GREEN=否` 不变。

### 本轮返修范围（有限写权）

- 产品 authority 与 legacy config/MCP 控制流：`app/composition/**`（组合边界停止安装/调用，
  **不修改** `application/config/use-config-record.ts`、`store/mcp-health.ts` 的 Hermes 兼容实现）。
- P06 驱动 fail-closed：`e2e/p06-*`（driver/helper/单测）。
- 文档：`evidence/P06.md`、`evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md`、
  `evidence/P02.md`/`P04.md`/`P05.md`（只追加必要更正）、本文件。
- 不动后端/wire schema/contracts/package/lock；不读密钥；不运行模型；不 reset/stash/clean/push/merge。
- 旧 `evidence/P06-assets/` **原样保留**为失败门证据；新证据写入 `evidence/P06-assets-r2/`。

---

## 执行快照（handoff-policy 每阶段必填）— P06 诚实性返修

- updated_at: 2026-09-15（+08:00），writer_lease = `ACTIVE — P06 honesty repair`（本行之后本文件
  仍由本会话持有，直到末尾 release 行）
- 执行者: Zcode 前端产品 goal（新一轮会话）；**用户通过派单显式重新授予有限前端写权**
- 工作树/分支: `/home/maoqh/projects/agent-box-desktop-next-wsl-round1` @ feature/agentbox-desktop-product
- 起点核验: HEAD `9fe414a2`（与派单一致）、`git status --short` 为空、无并发写入、
  WSL 无残留 Vite/Vitest/Playwright/Electron 进程、Windows 构建树无 Electron/node 进程；
  未 reset/stash/clean/push/merge，未读密钥，未运行模型，未改后端/wire schema/contracts/package/lock
- 执行方式: 两个并行子代理（A 产品 authority 与 legacy config/MCP 控制流；B P06 驱动 fail-closed），
  写集互不重叠；主执行者负责审查、共享状态、Windows 构建树、提交与最终验收
- **范围与结果**:
  （a）**关闭四条可达 legacy 控制流**（并非 r1 登记的「一处外围合同缺口」）：组合根
  `useHermesConfigRecord()`（`/api/config`）、每次窗口启动并 10×3s 重试的 i18n locale port
  （`/api/config`）、无条件安装的 MCP legacy 健康巡检、内置默认开启的 `hermes-bots` relay 经
  `host.profileRoutes()` 发起的 `GET /api/profiles`。**未修改** `use-config-record.ts` /
  `mcp-health.ts` 的 Hermes 兼容实现，**未放宽**两道 legacy REST 硬门，未隐藏日志，
  未靠清空 `reportedPaths` 凑绿。
  （b）**驱动 fail-closed 五处**：`record()` 参数错位（使 r1 的 21 条 steps 只统计 20 条）、
  `summarizeResults` 静默忽略未知 status、必需步缺失/重复/PENDING/SKIP/非法 status 未强制、
  legacy REST 只有一道门且 renderer 残余不设门、console 捕获晚于 `domcontentloaded`。
  现为**两道独立必需门**（main refusals 恰为 0；renderer `residualLegacyPaths` 严格 `[]`），
  并要求覆盖被证明。
  （c）**Linux/WSL 定向门**：组合根 13 files/171 tests、驱动单测 1 file/45 tests、渲染端全量
  816 files/7929 tests（0 failed）、三项目 typecheck、改动文件 ESLint、`git diff --check`、
  `apps/desktop build` 全部 exit 0；另有**自校验 CDP 探针**（临时、未入库）沿驱动同一路径得到
  renderer 残余 `[]`、main refusals 0，且两条正向对照（注入门日志行被识别、直连 preload bridge
  使 main refusals 0→2）同时成立。
  （d）**Windows 重新验收**：同步 13+4 项 tracked 改动（逐文件 SHA-256 一致，未重装依赖）、
  `npm run build` exit 0；**r2 第一次运行 21 PASS/1 FAIL**，唯一 FAIL 是驱动的 boot 覆盖证明
  竞态（产品侧 `residualLegacyPaths=[]`），失败输出保留为 `evidence/P06-assets-r2-attempt1/`；
  修好驱动后**r2 最终 22 PASS / 0 FAIL / 0 SKIP / 0 PENDING，`allOk=true`，exit 0**，
  计数与 steps 数机械一致（脚本复核）。旧 `evidence/P06-assets/` **原样保留未动**。
- 本阶段提交: `f47e5219`（产品 authority 门 + 驱动 fail-closed）、`1ed11197`（驱动挣得 boot 覆盖证明）
- **首次失败与真实修复**（不靠重跑掩盖）: ①我移植的 `requiredStepIssues` 用例写法错误
  （只传非必需步 ⇒ 所有必需 id 成了 missing），改为「完整必需集 + 两条非必需步」后通过；
  ②r2 第一次运行 FAIL 判为**驱动**缺陷并修驱动，**未降低任何断言**。
- **终态**: `P06_GREEN — FRONTEND_INDEPENDENT_ACCEPTANCE`、`DESKTOP_IMPLEMENTATION_READY`
  在 r2 证据齐备后重新声明；`REAL_FLOW_VERIFIED=否`、`AGENTBOX_DESKTOP_PRODUCT_GREEN=否/待全栈`
  不变；`history.snapshot` 旧页分页与不可达 `SessionPickerOverlay` 保持已知项，本单未扩范围。

---

## release（2026-09-15）：P06 诚实性返修结束，写权再次释放

- updated_at: 2026-09-15（+08:00），**writer_lease = RELEASED**（本行之后本文件冻结）
- 代码与证据最终 HEAD: `2a728d91`（产品+驱动修复与证据文档）；**最终 HEAD 为本 release
  文档检查点自身**——即 `git rev-parse HEAD`（`git log -1`），它只改本文件，不含代码或证据变更
- 返修提交链: `9fe414a2`（起点）→ `f47e5219`（产品 authority 门 + 驱动 fail-closed）→
  `1ed11197`（驱动挣得 boot 覆盖证明）→ `2a728d91`（证据与状态文档）→ 本 release 检查点
- **重新声明的终态**（以 r2 Windows 证据为据，`evidence/P06.md` §11）：
  - **P06 = `P06_GREEN — FRONTEND_INDEPENDENT_ACCEPTANCE`** —— r2 驱动
    **22 PASS / 0 FAIL / 0 SKIP / 0 PENDING，`allOk=true`**，两道 legacy REST 门独立成立
    （main refusals **0**；renderer `residualLegacyPaths` 严格 **`[]`**），计数与 steps 数机械一致
  - **`DESKTOP_IMPLEMENTATION_READY`** —— 入口 `evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md`
  - `REAL_FLOW_VERIFIED = 否`（无真实 Server/Harness/模型链路证据）
  - `AGENTBOX_DESKTOP_PRODUCT_GREEN = 否 / 待全栈`（外围能力矩阵未下单）
- 用户通过本派单重新授予的**有限前端写权已用完并交回**：停写范围含文档 amend。原前端 goal 不因
  后端等待或其他原因自行恢复写入。
- 工作树 `git status --short` 为空（含未跟踪文件）；无残留 Vitest/Playwright/Electron 进程
  （WSL 与 Windows 构建树均已核对）；子代理全部结束。
- **后端接管**：按 `docs/desktop-product-delivery/handoff-policy.md` 的 42 双门规则，读取本文件与
  `evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md`，核对分支/HEAD/摘要/可运行性，确认无新前端 writer、
  无子代理、无未交接修改后，在正式派单指定的工作树记录 `FULLSTACK_INTEGRATION_OWNER` 并安装
  lifecycle connection。**本轮未开始后端全栈联调，未改后端。**
- **已知边界（本单未扩范围，见 `P06.md` §12）**：`history.snapshot` 旧页分页未挂载、
  `SessionPickerOverlay` 潜在未门控且当前不可达、Appearance 设置页直接导航仍有一次被拒的
  `GET /api/config`、`hermes-bots` session sweep 的 REST 读取需活服务、WSL loopback 环境基线、
  未删除的 dead legacy 模块清单。

---

## 接管（2026-09-15）：P06 product-surface closeout — writer_lease=ACTIVE

- **writer_lease = `ACTIVE — P06 product-surface closeout`**。用户通过本派单显式**一次性重新授予**
  前端写权（范围见下）。本行覆盖本文件此前所有 `RELEASED` 陈述的**当前**效力；
  历史行一律保留，不删除、不改写。
- 起点核验: HEAD `6ddf6be9f4912c234fa8b248e56a231de5e2447d`（与派单预期一致）、
  分支 `feature/agentbox-desktop-product`、`git status --short` 为空、无并发写入、
  WSL 无残留 Vitest/Vite/Playwright/Electron 进程。未 reset/stash/clean/push/merge。

### 暂停声明（不删除 `6ddf6be9` 的 GREEN 记录与 r1/r2 证据）

`6ddf6be9` 声明的 **`P06_GREEN — FRONTEND_INDEPENDENT_ACCEPTANCE`** 与
**`DESKTOP_IMPLEMENTATION_READY`** 因**协调验收发现三个产品面缺口**而**暂停生效**
（非作废记录；`evidence/P06.md` §1–§13、`evidence/P06-assets/`、`-r2-attempt1/`、`-r2/`
全部原样保留）：

1. **Appearance 设置页是活动 legacy config 路径**：`#/settings?tab=appearance` 直接导航仍以
   `useHermesConfigRecord()` 读 `GET /api/config`（`P06.md` §10.1/§12.3 曾登记为"已知残余"，
   实为**产品面决定**，本轮关闭：给 `SettingsView`/`AppearanceSettings` 明确 authority）。
2. **语言（locale）静默不持久化**：agentbox 下 `hermesLocalePreference` 的 `save()` 成为
   **会话内 no-op**（`hermes-locale-preference.ts:63-66`），切换语言"看起来成功"却重启即丢——
   违反「写失败必须诚实呈现、禁止 silent no-op」。
3. **`hermes-bots` 内置插件默认启用**：bundled Bot Mode 在产品组合中仍被
   `discoverBundledPlugins()`（`plugin.defaultEnabled ?? true`）注册并激活，
   而 master-plan §4 已把 Bots/群聊列为**退役项**。

在三个缺口修复与**新的 Windows r3 证据**齐备之前，本文件**不维持** `P06_GREEN` /
`DESKTOP_IMPLEMENTATION_READY` 的现行效力。`REAL_FLOW_VERIFIED=否` 与
`AGENTBOX_DESKTOP_PRODUCT_GREEN=否` 不变。`history.snapshot` 旧页分页、
当前不可达的 `SessionPickerOverlay`、外围合同等待项继续作为已知项，本单不扩范围。

### 本轮范围（有限写权）

- 任务 A：Appearance 与本地 Desktop 偏好（Settings authority、resume、终端字体、语言本地端口）。
- 任务 B：从 AgentBox 产品组合退役 bundled Bot Mode（发现/激活边界，不删实现）。
- 主执行者：共享文档、P06 验收驱动扩展、Windows 构建树与最终 release。
- 不动后端/wire schema/contracts/package/lock；不读密钥；不运行模型。

---

## 执行快照（handoff-policy 每阶段必填）— P06 product-surface closeout（r3）

- updated_at: 2026-09-15（+08:00），writer_lease = `ACTIVE — P06 product-surface closeout`
- 执行者: Zcode 前端产品 goal（新一轮会话）；用户通过派单显式**一次性重新授予**前端写权
- 工作树/分支: `/home/maoqh/projects/agent-box-desktop-next-wsl-round1` @ `feature/agentbox-desktop-product`
- 起点核验: HEAD `6ddf6be9`（与派单一致）、`git status --short` 为空、无并发写入、
  WSL 无残留 Vitest/Vite/Playwright/Electron 进程、Windows 构建树无 electron/node/hermes 进程；
  未 reset/stash/clean/push/merge，未读密钥，未运行模型，未改后端/wire schema/contracts/package/lock
- 代码检查点: **`3b22aae7`**（产品缺口修复 + 驱动扩展 + 测试；docs 见本行之后的检查点）
- 执行方式: 两个并行子代理（A：Appearance 与本地 Desktop 偏好；B：bundled Bot Mode 退役），写集互不重叠；
  主执行者审查实际 diff 后**串行集成**，并自行完成运行时门（磁盘门同策）、Linux 自校验探针、
  Windows 构建树、验收与文档。子代理未 stage/commit/改文档/使用 Windows 树。

### 三个产品缺口（暂停 `6ddf6be9` GREEN 的原因）与关闭

（a）**Appearance 是活动 legacy config 路径** → `SettingsView`/`AppearanceSettings` 取得**必填**
`authority: 'agentbox' | 'hermes'`，生产组合显式传 `agentbox`；agentbox 分支**根本不构造**
Hermes-config 组件（组件拆分，不是条件 hook），因此「零 legacy 调用」是字面事实而非「请求恰好被拒」。
Appearance 仍是正式产品页：主题/模式/缩放/通知/快捷键/语言一行未减。
（b）**语言静默不持久化** → 新增 Desktop 本地 `LocalePreferencePort`（`main.tsx` 注入，
不再注入 `hermesLocalePreference`；后者保留给明确 Hermes authority），写入**写后 read-back 校验**，
没落地就 reject，由 i18n 既有契约回滚并弹错——不再有「看起来成功」的 no-op。
（c）**`hermes-bots` 默认启用** → `discoverBundledPlugins(authority)` 在**发现/激活边界**按纯策略
`bundledPluginRetired(id, authority)` 丢弃该 id：不产生 inventory 记录（因此无 enable 句柄）、
不 `register()`，历史持久化 `enabled:true` 无法绕过。**主执行者补的洞**：`loadRuntimePlugin` 的
必填 `authority` 使**磁盘门同策**，否则产品不再发布 bundled 记录后，用户机器上历史独立安装的
`desktop-plugins/hermes-bots/plugin.js` 会复活该面（现留可见的 `hermes-bots:retired` 禁用行）。
（d）**顺带产品化**：「重开上次聊天」（默认 true）与终端字体改为 Desktop 本地偏好
（`application/desktop-preferences/**`，persist-then-publish，冷启动从同一权威 hydrate）。

### 实测门（Linux/WSL，主执行者）

| 门 | 结果 |
| --- | --- |
| 定向面（Appearance/locale/terminal 偏好 + 插件发现/authority + settings + composition + 命令面板 + i18n） | **71 files / 635 tests passed，exit 0** |
| 完整 renderer Vitest | **823 files / 7970 tests passed，exit 0**（r2 时 816 / 7929） |
| P06 驱动单测 | **1 file / 52 tests passed，exit 0**（r2 时 45） |
| 三项目 typecheck | **exit 0** |
| 改动文件 ESLint（33 个） | **exit 0，0 error**（`.d.mts` 的「无匹配配置」是既有配置缺口，非本轮引入） |
| `git diff --check` / `apps/desktop build` | **exit 0** / **exit 0** |
| 自校验 CDP 探针（临时，未入库） | 8 项全 PASS；renderer 残余 `[]`、main refusals 0；**并抓到驱动自身两个缺陷**（resume 行钩子缺失、语言选项指针点击被列表容器拦截→改走选择器搜索框），Windows 轮之前已修 |

首次失败与真实修复（不靠重跑掩盖）：新增 `runtime-loader.test.ts` 两条用例首跑 2 failed（records 模块级
共享状态污染 + 误判磁盘门默认态）已按真实契约改正；`discoverRuntimePlugins` 必填化漏改两个调用点由
typecheck 当场暴露；新测试 4 条 ESLint warning 收口为 0。

### Windows r3（原应用，权威门）

- 同步：`git diff --name-only 6ddf6be9..3b22aae7` 的 **33 个 tracked 文件**，先 dry-run，
  逐文件 SHA-256 **33/33 逐字节一致**；**未重装依赖**。
- 构建：`npm run build` **exit 0**（vite + bundle + stage-native-deps + assert-dist-built；日志入库）。
- 驱动（全新沙箱 `agentbox-p06-sandbox-r3` → `agentbox-p06-evidence-r3`）：
  **28 PASS / 0 FAIL / 0 SKIP / 0 PENDING，`allOk=true`，exit 0**；counts 与 steps 机械一致
  （`PASS+FAIL+SKIP+PENDING+unknown = 28 = len(steps)`，无重复 id）；两道 legacy REST 门独立成立
  （main refusals **0**；renderer `residualLegacyPaths` 严格 **`[]`**）；无 Hermes runtime；
  `no-blocking-overlay` 覆盖 0.0%；`exit-no-orphans` 20s 进程树全空。
- 新增必需步全部 PASS：`appearance-page-operable`、`appearance-language-persists`
  （`en → ja → reload=ja → restored=en`）、`appearance-resume-pref-persists`
  （`true → off=false → reload=false → restored=true`）、`appearance-terminal-font-persists`
  （`"FiraCode Nerd Font" → reload 保留 → reset=""`）、`appearance-no-legacy-rest`（残余 `[]`）、
  `bot-mode-retired`（palette/入口/存储命中全为空）。原 20 条必需 id 一条未删、一条未降级。
- 证据：**`evidence/P06-assets-r3/`**（7 张截图含新增 `appearance-local-preferences.png`、
  `results.json`、两份日志、驱动 stdout、`windows-build.log`、`SHA256SUMS`）；脚本复核
  `results.json` 机械一致（`ISSUES=[]`）且 9 个文件哈希与入库文件相符。
  `P06-assets/`、`P06-assets-r2-attempt1/`、`P06-assets-r2/` **原样保留未动**。

### 已知边界（本单未扩范围）

`history.snapshot` 旧页分页未挂载；当前不可达的 `SessionPickerOverlay`；外围合同（Skills/MCP/Data/
备份恢复）未下单；WSL loopback 基线 2 文件（r1 Windows 裁决仍有效，本轮未改相关模块）；
4 个 Bot Mode Playwright spec 描述已退役的面且本就需外部真实 Hermes runtime（无则 skip），
不在 P06 门内、本轮未改；dead legacy 模块与 `hermes-bots` 实现按既有先例保留不删。

---

## release（2026-09-15）：P06 product-surface closeout 结束，写权再次释放

- updated_at: 2026-09-15（+08:00），**writer_lease = RELEASED**（本行之后本文件冻结）
- 代码检查点: `3b22aae7`（产品面缺口修复 + 驱动扩展 + 测试）
- 证据检查点: `b2dc261c`（`evidence/P06.md` §14、`evidence/P06-assets-r3/**`、
  `DESKTOP_IMPLEMENTATION_HANDOFF.md`、P02/P04/P05 追加更正、本文件的执行快照）
- **最终 HEAD 为本 release 检查点自身**——即 `git rev-parse HEAD`（`git log -1`），
  它只改本文件，不含代码或证据变更
- 提交链: `6ddf6be9`（起点，GREEN 暂停）→ `3b22aae7`（产品缺口修复 + 驱动扩展）→
  `b2dc261c`（证据与状态记录）→ 本 release 检查点
- **重新声明的终态**（以 r3 Windows 证据为据，`evidence/P06.md` §14.5）：
  - **P06 = `P06_GREEN — FRONTEND_INDEPENDENT_ACCEPTANCE`** —— r3 驱动
    **28 PASS / 0 FAIL / 0 SKIP / 0 PENDING，`allOk=true`，exit 0**，两道 legacy REST 门独立成立
    （main refusals **0**；renderer `residualLegacyPaths` 严格 **`[]`**），Appearance（页面可操作 +
    语言/resume/终端字体本地持久化 + 该阶段残余 `[]`）与 Bot Mode 退役均为必需步，
    计数与 steps 机械一致
  - **`DESKTOP_IMPLEMENTATION_READY`** —— 入口 `evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md`
  - `REAL_FLOW_VERIFIED = 否`（无真实 Server/Harness/模型链路证据）
  - `AGENTBOX_DESKTOP_PRODUCT_GREEN = 否 / 待全栈`（外围能力矩阵未下单）
- **历史保留**：`6ddf6be9` 的 GREEN 因三个产品缺口**暂停**（非作废记录）；r1 失败门证据
  (`P06-assets/`)、r2 第一次失败 (`P06-assets-r2-attempt1/`)、r2 通过 (`P06-assets-r2/`)
  与所有历史状态行一律保留，未删除、未改写。本 release 不追认旧结论，结论只建立在 r3 新证据上。
- 用户通过本派单重新授予的**一次性前端写权已用完并交回**：停写范围含文档 amend。
  原前端 goal 不因后端等待或其他原因自行恢复写入。
- **停止写入前的逐项确认**：两个子代理已结束（A/B 均只在其写集内改动，未 stage/commit/改文档/
  使用 Windows 树）；WSL 无残留 Vitest/Vite/Playwright/Electron/xvfb 进程，Windows 构建树无
  electron/node/hermes 进程；`git status --short` 为空（含未跟踪文件）；`git diff --check` exit 0
  （唯一提示是入库的 Windows 捕获日志 CRLF 的 CR，与 r2 证据同规格，规范化会改变捕获字节）。
- **后端接管**：按 `docs/desktop-product-delivery/handoff-policy.md` 的 42 双门规则，读取本文件与
  `evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md`，核对分支/HEAD/摘要/可运行性，确认无新前端 writer、
  无子代理、无未交接修改后，在正式派单指定的工作树记录 `FULLSTACK_INTEGRATION_OWNER` 并安装
  lifecycle connection。**本轮未开始后端全栈联调，未改后端。**

## 更正（2026-09-15，后端接管）：`FULLSTACK_INTEGRATION_OWNER` 已记录

- updated_at: 2026-09-15 20:50 (+08:00)
- **`FULLSTACK_INTEGRATION_OWNER` = 后端执行者（Zcode 后端 goal 会话，
  `/home/maoqh/projects/agent-box-server-round1` @ `feature/server-harness-extension-v1`）**
- 接管依据：42 §9 双门 + 用户 2026-09-15 明确指示（"前端已经完成了…如果你完成了就可以开始联调"）；
  范围限 42 `conditional_cross_repo_write.write_paths`，发布源 `main` 仍只读，不 push/不 merge。
- 接管时只读复核（本轮，`git rev-parse`/`git status`/就地重算摘要）：
  - HEAD `8e7c138c96337fc20ed61d3c21100e6449c8ec95`、分支 `feature/agentbox-desktop-product`
  - `git status --porcelain` **0 行**（含 untracked）、`writer_lease=RELEASED` 保持
  - `DESKTOP_IMPLEMENTATION_READY`、`P06_GREEN`（r3 `28 PASS/0 FAIL/0 SKIP/0 PENDING`、`allOk=true`）
  - wire 摘要就地重算与锁定值一致：TS `11e3b3e7…`、生成工件 `5d4fa3bf…`
  - 无 electron/node/tsc 写入者进程
- 后端侧对应证据（同一时刻）：四家真实模型门 `--live` 全部 exit 0（累计 <¥0.07）、
  Windows r4 + 独立 `-PostCheck` CLEAN、`tests` 576 passed/3 skipped/0 failed、
  事件帧严格 schema 门与错误家族 12 项机械核对通过。
- **`BACKEND_IMPLEMENTATION_READY` 的 closure 来源如实标注**：用户授权 + 执行者自审；
  固定 Reviewer 因额度硬限制（`try again at Sep 20th, 2026 12:11 PM`）未提供本阶段
  `ACCEPT`，阶段包固化于后端 `docs/server-round1/fullstack/stage-closure-dossier.md`，
  额度恢复后补一次只读复审。**这一点不被本次接管掩盖。**
- 下一步（§10）：安装 lifecycle connection（`workcore` slot 的唯一生产安装点），
  然后无模型联调 28 方法 + 生产 WS 事件流（幂等回查、双游标语义、队列终态、审批失效族、
  发送拒绝保留草稿），再按单独授权的凭据与预算做真实 UI 模型闭环。
- 本行之后：前端工作树由 `FULLSTACK_INTEGRATION_OWNER` 写入；原前端 goal 不恢复写入。

## 全栈联调（2026-09-15，后端集成人接管后）：无模型路径通过

- updated_at: 2026-09-15 21:00 (+08:00)
- **lifecycle connection 已安装**（`workcore` slot 的唯一生产安装点）：主进程从 Server 自己的
  数据根读 `secrets/http-token`，把 `{endpoint, sessionToken}` 装进 wire transports 读取的
  composition slot；未配置/令牌不可读/端口非法一律"无服务"并给稳定原因，绝不伪造连接。
  代码 `apps/desktop/electron/workcore/agentbox-server-connection.ts`（+6 项单测，Windows 上
  `tsc --noEmit` exit 0、eslint exit 0、vitest 6/6）。
- **无模型全栈联调 15/15 PASS、exit 0**（`evidence/p42-integration/integration-results.json`）：
  真实 Windows Electron → 本机 Server → `wsl.exe` release Worker → bwrap → 显式 no-model ACP
  fixture。覆盖 `server.hello`、Workspace 开/列、Profile/Provider-Model 创建与版本、config
  describe/resolve、**真实一轮（delta 先于 completed 持久化）**、同 requestId 幂等回放只产生一个
  执行、排队项可见且可撤回、停止发布 `queued → running → stopping → stopped`、双游标域（混用被
  拒）、归档保留历史、干净关闭（端口释放）。
- 驱动：`apps/desktop/e2e/p42-fullstack-integration-driver.mjs`（检查点 `b1136759`）。
  **不读任何凭据、不调任何模型**；fixture Harness 只回固定 nonce。
- **未做**：四家真实 UI 模型门（需单独授权的凭据与预算；后端侧四家真实模型门已分别通过）；
  跨端 bug 修复如有，将在真实 UI 门中记录。
- `REAL_FLOW_VERIFIED`：**部分**——无模型全链路已验证；真实模型链路仍未验（与后端模型门分账）。

## 四家真实 UI 模型门：被产品面缺口阻断（2026-09-15）

- 结论：**未执行**，原因两端都缺同一小段面——Desktop 的 Provider/Model 设置页恒发
  `credentialId: null`（`apps/desktop/src/features/settings/agentbox-model-settings.tsx:126/285`），
  wire 的 28 方法里没有任何凭据方法，Server 的凭据存储只由带外方式（CLI / 调用方 register）写入。
  因此从 UI 创建的角色没法挂凭据，真实模型轮发不出去。
- 链路本身已分别证明：后端四家真实模型门全绿；无模型全栈联调（本文件上一节）15/15 通过。
  **两者都不得冒充 UI 模型门。**
- 待用户裁决的方案见后端 `docs/server-round1/fullstack/ui-model-gate-blocker.md`：
  A（Desktop 拥有凭据记录 + 一处只读列举面，推荐、与"Windows 是凭据记录权威"一致）；
  B（wire 增 `credentials.*`，需重锁合同）；C（联调期绕过 UI，不得记作 UI 门）。
- 现状登记：`REAL_FLOW_VERIFIED = 否`（真实模型路径未验）——无模型全链路已验证不代表它成立。

## 凭据录入接线（2026-09-15，`3d0929a1`）

- **界面现在可以录入凭据**：设置页的 Provider/Model 区域有"新增凭据"表单；提交后 renderer →
  main → 运行中的 Server（`POST /api/v1/credentials`，body 只带路径）→ 得到不透明 id → 记入本机
  记录 → 临时来源文件在 `finally` 删除。
- 同区域的选择控件列出本机记录（label 供选择、id 用于挂载，**不含任何材料**），创建/更新
  Provider/Model 会带上所选 `credentialId`——此前恒为 `null`，因而 UI 永远发不出需要凭据的模型轮。
- 安全边界：秘密不进日志；来源路径不出 main；endpoint 先过 wire 同一套 loopback 判据；
  Server 的拒绝以它自己的错误码呈现。
- 验证：main 侧 11 项测试、设置页 2 项新测试、既有设置页 8 项全过；Windows 上 `tsc --noEmit`
  exit 0、eslint exit 0、`npm run build` exit 0；重建后的应用复跑无模型全栈联调 **15/15 PASS**。
- 期间修掉一个自己引入的缺陷：凭据 port 对象未 memo 化 → 渲染循环（既有页面测试当场抓住）。
- 下一步：四家真实 UI 模型门（凭据与预算已授权，累计 <¥0.07/≤¥10）。

## 四家真实 UI 模型门（2026-09-15，逐家结果）

- **Pi：8/8 PASS、exit 0**——凭据经界面自己的录入路径加入并挂到模型，两轮真实 DeepSeek 答复，
  首轮即回忆 nonce、次轮带首轮上下文，清理干净。证据 `evidence/p42-ui-model-gate/`。
- **OpenCode：6/8**——链路跑通（两轮都到 terminal、答复到达），但首轮助手文本是片段
  （`P42-1F4A9` vs 提问的 `P42-1F4A9C`），**未验证到完整回忆，不记通过**。
- **Hermes：派发前被拒**——`CREDENTIAL_REQUIRED: Profile has no authorized credential`；
  根因是**产品缺口**：wire 的 `profiles.create` 不接受凭据（`create_wire` 硬编码
  `credential_id: None`），而 Hermes 部署按既有设计不声明 model 控件，于是角色拿不到凭据。
  三条出路与完整分析见 `evidence/p42-ui-model-gate/README.md`。
- **Codex：未运行**（预算耗尽）；工件与部署已就绪，命令同其余三家。
- 驱动 `apps/desktop/e2e/p42-ui-model-gate.mjs`；证据写盘前先扫描自身输出，凭据内容命中即拒绝写出。
- UI 门过程中修掉两个真实缺陷：preload 把 `credentials` 错嵌进 `wire`（界面拿不到），
  以及 main 的导入请求缺 `Idempotency-Key`（Server 直接拒）。

## 合同增补与 UI 门最终结果（2026-09-15 晚）

- **`profiles.create` 增加可选 `credentialId`**（两端分别提交）：Hermes 因不声明 model 控件，
  凭据只能挂在角色上，而此前 wire 无此字段 → 角色永远拿不到凭据。现：缺省/null = 不携带；
  给值则校验存在性与 kind 与 Harness 声明一致。工件重生成并重锁：TS `7746404984…`、
  工件 `14f7f736…`（取代 `11e3b3e7…`/`5d4fa3bf…`）；后端对新工件 32 passed。
- **UI 真实模型门结果**：**Pi 8/8、Hermes 8/8、Codex 8/8 全绿**（凭据均经界面自己的录入路径加入、
  挂到模型或角色，两轮真实 DeepSeek 答复并回忆上下文）；**OpenCode 6/8**——链路跑通但首轮助手
  文本是片段，**未验证完整回忆，不记通过**。
- 证据 `evidence/p42-ui-model-gate/`；费用：四家 UI 门累计约 24 次请求、增量 < ¥0.02。

## 四家 UI 模型门全部通过（2026-09-15）

- **Pi 8/8、Hermes 8/8、OpenCode 8/8、Codex 8/8**：每家都从界面自己的录入路径加凭据，两轮真实
  DeepSeek 答复并回忆上下文，清理干净。证据 `evidence/p42-ui-model-gate/`。
- OpenCode 的尾巴丢失已定位并修复（后端 `5a8b6fc`）：驱动的兜底此前只在"零增量"时生效，
  导致"响应早于最后一个增量"时永久少一片（原生记录 87 字符 / 产品 83 字符的实测对比即为此）；
  现以 prompt 返回值为权威补后缀，规则 `tailSuffix` 有单测，复跑 OpenCode 门通过。
- 合同增补（`profiles.create` 可选 `credentialId`）与本次修复共同构成两家通过的前提；
  新旧 wire 摘要见 `docs/desktop-product-delivery/contracts/wire-v1/backend-response.md`。

## 联调收口（2026-09-15，自审替代 Reviewer 终审）

- **无模型全栈 22/22 PASS、exit 0**（`evidence/p42-integration/integration-results.json`）：在原有 15 步之上补齐
  §10 剩下的方法——workspace browse/archive、Provider/Model 与角色维护（更新/改名/归档）、
  session 元数据与**确认的角色切换**、`sendOutcome.query`（已知 + unknown）、**附件授权/投递**
  （正文不进转录）、**审批往返**（权限 fixture → 决策 recorded）、**事件流 resync**（不可寻址游标被拒）。
- **四家真实 UI 模型门各 8/8 PASS**：Pi / Hermes / OpenCode / Codex，凭据均经界面自己的录入路径加入。
- **重启门（真实模型，Pi）9/9 PASS**：两轮之间**停掉并重启 Server**，第二轮仍经 checkpoint 找回同一 native session。
- **自审一轮**（后端 `docs/server-round1/fullstack/self-review-2026-09-15.md`）：逐条核对声称与产物，
  记录四处缺口（步数清单校验只覆盖集成驱动、重启报告需改名区分、附件断言止于"接受+不外泄"、
  拒绝保留草稿的 UI 路径未验）与**最大未覆盖：真实 UI 控件路径**（发送走产品 renderer 传输，
  未驱动输入框/发送按钮/审批弹窗）。
- 最终状态：**`FULLSTACK_CORE_PARTIAL`**（不用无模型全绿冒充真实模型门，也不把后端门当 UI 门）。

## 接管（2026-09-17）：P08 / P09 前端增量

- writer_lease = **ACTIVE — P08/P09 frontend scoped writer**。依据本次用户持续交付授权及新增工单重新划分写集；只写两单前端范围，不接管后端或全栈运行环境。
- 起点 `d3d612e1`，分支 `feature/agentbox-desktop-product`，工作树 clean；P09 在恢复后的查派工中发现并完整阅读，按 P08 → P09 串行推进。
- Windows 单槽：使用现有 `C:\Users\maoqh\agentbox-wsl-round1`，无该树 node/electron 进程。另有 `C:\agentbox-uigate46` 的用户 Electron 进程，保持原样、不停止、不读取其数据。
- P08 基线：Windows Vitest 控制条四文件 **34/34 PASS**（controls 10、profile-controls 12、use-composer-profile 7、model-pill 5）；四个生产源文件与本工作树 SHA-256 相同。WSL 缺 node_modules，首次测试未启动（ERR_MODULE_NOT_FOUND: vitest），不记通过；不另装依赖。
- P08-A 代码事实：config.describe 只接 profileId/workspaceId，控制集合由 Harness 声明与 Profile 配置决定，不随临时 provider/model 选择变化；停掉 provider 动态集合子项，不伪造。config.resolve 接收 overrides 并返回该模型槽生效值，运行态实测尚待完成。权限档位、用量数据仍待后端声明/合同。
- 当前 P08/P09 均 **IN_PROGRESS**，不继承旧全绿结论，不运行付费模型。

## P08 收口（2026-09-17）：输入条改造完成 — `P08_GREEN — COMPOSER_INPUT_BAR_CLIENT_READY`

- **门结果**（完整证据 `evidence/P08.md`）：
  - **G1 形状成立**：三段 grid 与 profile 选择条保留；新增 provider/model 选条（AI Elements copy-in 形状，
    本仓 popover/command 原语承载），分组/搜索/选择/清除/不可用禁用 8 例定向用例通过。
  - **G2 动态性如实收窄**：控制项集合随 Profile 变化、**不随临时 provider/model 变化（后端事实，停该项不伪造）**；
    模型槽生效值随选择经 `config.resolve` 立即反映（受控链路用例锁定）；运行态复测归全栈联调。
  - **G3 只渲染已声明成立**：无 model_slot 描述/声明 → 选条不渲染；未声明权限控制 → 无 permission 元素（反例）；
    声明 `permission_mode` 后自动出现（正例）。
  - **G4 用量诚实成立**：无数据 → 本地化「Unknown」，容器内零数字零百分号（正则锁死）；NaN/∞ → 未知；
    有精确值才显示。组合传 `percent={null}`（wire 零用量事实）。
  - **G5 不退化成立**：基线 34/34（controls 10、profile-controls 12、use-composer-profile 7、model-pill 5，
    Windows 树实跑）→ 终门 **55 files / 405 tests 全通过**（composer+profiles 全目录、wire-composer-profile、
    profile-maintenance-port、agentbox-composer、wire-provider-model-catalog、agentbox-main-chat、agentbox-chat-view）；
    三项目 typecheck exit 0；改动 20 文件 ESLint 0/0；`git diff --check` 干净；保护路径与后端仓零改动；e2e 计数不变。
- **实现要点**：copy-in `components/assistant-ui/model-selector.tsx`（Apache-2.0 © Vercel, Inc.，commit
  `6a9d5b1`，许可已核实并记录；未引入 AI SDK 运行时/传输层，远程 logo 部件弃用）；共享渲染器
  `features/profiles/config-control-input.tsx` 被 composer 临时配置面板与 Profiles 页编辑器共用
  （同一套 kind/样式约束，两套值语义）；纯函数 `features/profiles/model-slot.ts`；i18n 6 键 ×6 语言。
- **等待项（如实）**：①权限档位控制项待后端声明（声明即自动出现）；②上下文用量真实数据面在后端工单 51
  （本单只交付诚实容器）；③resolve 运行态即时性待真实 Server 联调；④e2e 未新增（无 AgentBox 输入条 harness，
  以定向 Vitest 满足门要求）。
- **状态标记 `P08_GREEN — COMPOSER_INPUT_BAR_CLIENT_READY`**（客户端实现就绪，不含真实服务联调）。
  调度方追加的 P10–P15 派单提交已复查；其中 `2b7dce49` 把本执行者已写的接管节一并提交（内容逐字保留）。
  下一步按派工表执行 **P09**（writer_lease 继续 ACTIVE，按单切换写集）。

## P09 收口（2026-09-17）：会话区过程呈现 — `P09_GREEN — TRANSCRIPT_PROCESS_VIEW_CLIENT_READY`

- **门结果**（完整证据 `evidence/P09.md`）：
  - **G1 事实对照表成立**：逐元素给出「事件名/字段」或「无」；并把「schema 已有但后端未上行」（tool 生命周期）
    与「合同不存在」（思考、输出摘要、分组、每步耗时、用量）分开记录。
  - **G2 不伪造成立**：wire 无 reasoning 事件 → 渲染层反例（无 `aui_thinking-disclosure`）+ 投影层反例
    （part 类型集合恒为 {text, tool-call}）；非终态调用不带 result/isError。
  - **G3 形状成立（按需取件）**：取 AI Elements `Shimmer`（Apache-2.0 © Vercel, Inc.，commit `6a9d5b1`，
    适配本仓 `.shimmer` CSS 动画以保住动画暂停纪律）；`Tool`/`Reasoning`/`Chain of Thought`/`Terminal`
    评估后不取，理由与触发条件（后端 51/52 落地时增量接入）写入 evidence。
  - **G4 时长诚实（如实收窄）**：尾部计时器为客户端观测间隔（既有语义）；整轮时长**不**声称事件时间戳推导
    （帧 `emittedAt` 未被投影消费，投影不在本单写集）；每步耗时无开始事件 → 不显示。
  - **G5 不退化成立**：wide gate `src/features/chat` + `src/components/assistant-ui` + `src/components/chat`
    **165 files / 1209 tests 全通过，exit 0**；定向 39 files / 233 tests；`tsc -p . --noEmit` exit 0；
    改动 7 文件 ESLint 0/0；`git diff --check` 干净；保护路径与后端仓零改动；e2e/tests-js 未改。
- **本轮修掉两个真实缺陷**（点亮过程中发现，均有用例锁定）：
  ①**失败工具行被渲染成成功活动行**（AgentBox 失败 part 缺 `isError`）→ 补 `isError`；
  ②**失败原因被吞**（共享工具行的 `view.subtitle` 从不显示，且 error 详情在 summary==subtitle 时被丢弃）
  → 共享行不再丢弃该 summary，投影把服务 `summary`+`resultExcerpt` 合并为 error 文本。
- **等待项（如实）**：整轮时长的事件时间戳来源（需改 `application/session/**`，不在本单写集）；
  思考行/工具生命周期/分组/输出摘要/每步耗时（等后端 52）、上下文用量（等后端 51）；
  状态尾品牌文案属 P14。
- 下一步按派工表执行 **P10**（侧栏重构；`depends_on: P07`，排序在 P08/P09 之后）。writer_lease 继续 ACTIVE。

## P10 收口（2026-09-17）：侧栏重构 — `P10_GREEN — SIDEBAR_RESTRUCTURE_CLIENT_READY`

- **门结果**（完整证据 `evidence/P10.md`）：
  - **G1 三栏表成立**：参考元素 → 实现方式 → 数据来源逐项齐全；无数据来源的两项（自动化 cron 段、插件市场）
    明确「不实现」及理由（cron 段当前未挂载任何面、数据来自 legacy `@/api/cron`，产品下被硬门拒绝 → 等 wire 能力）。
  - **G2 无新库成立**：零新增依赖，`package.json`/`package-lock.json` 未改。
  - **G3 数据不发明成立**：运行中来自服务 `execution.state`（与 composer busy 门同一集合）；未读为**本机游标**
    并在标签写明 "this window"，从未打开过的不标未读；归档行不标运行/未读；无投影即无点（反例用例）。
  - **G4 行为保留成立**：`src/features/chat/sidebar` 全目录 **33 files / 268 tests 全通过**（重排/拖拽/加载更多/过滤/
    右键/存档/搜索/profile 与 connection 切换既有用例未动）。
  - **G5 不退化成立**：宽面 `src/features/chat` + `src/store` + `src/i18n` **234 files / 2280 tests 全通过，exit 0**；
    `tsc -p . --noEmit` exit 0；改动文件 ESLint 0/0；`git diff --check` 干净；保护路径与后端仓零改动。
- **实现**：动作区（新建任务=既有新建会话路径，搜索=既有命令面板）+ 行内状态点（服务 running、本机 unread）；
  相对时间与分组控件为**既有能力**（本单只补用例锁定，不重造、不新增第三维度）。
- **本轮修掉两个自身/守卫缺陷**：①动作区最初挂在由 legacy 会话 store 计算的 `showSessionSections` 下
  （产品只有服务会话时会被藏）→ 改为仅按 authority 挂载并以集成用例锁定；②三个 store 边界守卫在 Windows 上
  因反斜杠路径**空转**（A/B 证明与本单无关）→ 统一 `srcRelative()` 归一，反向对照恢复真实。
- 下一步按派工表执行 **P11**（provider/model 配置交互改造）。writer_lease 继续 ACTIVE。

## P11 收口（2026-09-17）：供应商/模型配置交互 — `P11_GREEN — PROVIDER_MODEL_CONFIG_CLIENT_READY`

- **门结果**（完整证据 `evidence/P11.md`）：
  - **G1 无自由文本关键项（按 wire 事实收窄）**：harness/provider 改为**数据驱动选择**（服务自身记录的 harness；
  预设目录 + 目录在用的 provider）+ 显式覆盖；**端点/认证/协议在锁定 wire 上没有字段**（后端 55）→ 表单不收集、不发明。
  - **G2 凭据只引用**：只有 `credentialId`；界面只显示 label 与 present/absent；用例断言无密钥形状文本。
  - **G3 无来源即未知**：模型行 `data-model-meta="unknown"` + 来源缺失说明；不填默认值。
  - **G4 不做假按钮**：拉取模型/测试连接**禁用 + 原因**，用例逐项断言。
  - **G5 不退化**：settings+profiles+provider-model+i18n **52 files / 463 tests 全通过，exit 0**；`tsc -p . --noEmit` exit 0；
    改动文件 ESLint 0/0；`git diff --check` 干净；wire 与既有消费路径未动。
  - **G6 热切换（客户端半，第一手）**：新用例断言「下一轮发送带新 overrides、整条路径无任何重启/生命周期动词、
    运行中会话投影逐字节不变、reject 时零发送」；**服务侧物化属后端 55/56，不声称**。
- 参照决定（LibreChat `modelSpecs` / cc-switch 的学与不学）逐条记入 evidence §2，含「写 live 配置文件=其缺陷，我们按轮物化」。
- 下一步按派工表执行 **P12**（订阅账号）。writer_lease 继续 ACTIVE。

## P12 收口（2026-09-17）：订阅/账号 — `P12_GREEN — ACCOUNTS_CLIENT_READY`

- **门结果**（完整证据 `evidence/P12.md`）：
  - **G1 两类并列成立**：`subscription` 与 `api-key` 同一条记录形状承载（kind 为数据；未知 kind 原样显示），都只被引用、都不内联。
  - **G2 状态诚实成立**：状态与「最后验证」恒为**未知**并写明“服务尚未提供探测面”；用例断言页面不出现 valid/active/expired 占位。
  - **G3 零泄漏成立**：只渲染 id/kind/label；反例断言无密钥形状与 `Bearer` 文本；`credentials.add` 仍是唯一、单向上行的入口。
  - **G4 不越界成立**：无登录实现（不代填/不抓取/不读原生登录态）；**“下一轮生效”的热切换语义在界面可见**（用例锁定）。
  - **G5 不退化成立**：settings+i18n **47 files / 412 tests 全通过，exit 0**；`tsc -p . --noEmit` exit 0；改动文件 ESLint 0/0。
- **等待项**：状态探测/最后验证（后端 56）、归属家族字段、按家族的具体登录命令、并行各轮各号的服务侧物化。
- 下一步按派工表执行 **P13**（harness 程序管理器）。writer_lease 继续 ACTIVE。

## P13 收口（2026-09-17）：Harness 程序管理 — `P13_GREEN — HARNESS_PROGRAM_VIEW_CLIENT_READY`

- **事实**：程序目录/版本/工件/回滚全部属**后端 57**，今天不存在；因此**没有一行程序数据可画**。
- **门结果**（完整证据 `evidence/P13.md`）：
  - **G1 目录优先**：**不适用，未声称**（控制面尚无该目录）——如实登记为等待项，不假装目录已就绪。
  - **G2 状态不猜成立**：不显示任何版本/大小/可更新徽标；用例断言页面无 `N.N.N`、无 `N MB/GB` 形状文本。
  - **G3 动作诚实成立（当前形态）**：无可运行动作即不渲染按钮（用例断言 `queryByRole('button')` 为空）。
  - **G4 换版本下一轮生效成立（可见性半）**：界面写明“下一轮生效、无需重启、运行中的一轮保持开始时版本”；
    行为半与 P11 G6 同一客户端证据，服务侧物化归 57。
  - **G5 不退化成立**：settings+i18n **47 files / 416 tests 全通过，exit 0**；`tsc -p . --noEmit` exit 0；改动文件 ESLint 0/0。
- **交付**：`harnesses` 视图列出“程序行将携带的 7 个字段”+ 缺源声明 + 下一轮生效说明（不做列表/徽标/动作）。
- 下一步按派工表执行 **P14**（空状态 + 状态语义 + Hermes 品牌清理）。writer_lease 继续 ACTIVE。

## P14 收口（2026-09-17）：空状态 + 状态语义完成、品牌清理部分完成 —
## `P14_PARTIAL — EMPTY_STATE_AND_SEMANTICS_DONE / BRAND_SWEEP_IN_PROGRESS`

- **门结果**（完整证据 `evidence/P14.md`）：
  - **A 空状态达成**：`AgentBoxEmptyState`（品牌问候 + 一句话 + 起步项）；**与 P08 是同一个 composer**
    （`Thread.emptyState` 插槽，输入条本体未动）；起步项**只在 `sendAvailable` 时出现**，点击走**同一条 submit seam**
    （真的建会话并发出那一轮）；不可发送时显示原因而非陈设。
  - **B 状态语义达成**：逐处诊断后把裸 `'Unavailable'` 全部换成**带原因**的产品事实文案（服务不可达/未选项目/
    发送暂停（见横幅）/等待能力声明/服务未给出原因/服务离线/能力未声明/模型可用性“未给出原因”）；
    正常态**不出现任何横幅或 pill**。**G5** 由新守卫 `dev/contracts/product-copy-guard.test.ts` 锁定
    （深度感知 catalog 解析 + 六语言扫描，禁止恰好等于 unavailable/not available/offline/not connected/n/a/na 的取值）；
    P06 Windows 驱动的 `UNAVAILABLE_COPY_PATTERN` 同步扩展并仍要求页面说明不可用事实。
  - **C Gateway 台账达成**：产品 surface 侧**删除**（`LEGACY_STATUSBAR_ITEM_IDS` 含 `gateway-switcher`，
    `visibleStatusbarItems(..., 'agentbox')` 丢弃，既有用例断言）；台账记录 401 个仍命名 gateway 的生产文件
    均为 legacy data plane，产品面不渲染该词、无孤儿引用。
  - **D 品牌清理部分完成**：产品自有段落（`settings.product.*`、`sidebar.agentBox*`、P08 的 `composer.*` 键、
    `assistant.thread.loadingResponse/loadingSession`）清零并由守卫锁定；六语言 catalog 余量如实计数
    （en 175 / zh 183 / zh-hant 158 / ja 153 / ar 123 / ru 165），多为家族名与 legacy 句子。
    **G9 未达成**（逐句判别未完成）；**G10 达成**（i18n 组与边界用例通过）；**G11 达成**（两条字符串守卫）。
  - **顺带**：`renderer-layers` 守卫在 Windows 上同因（反斜杠路径）空转，已与 store 守卫同法修复。
  - 宽面终门 **346 files / 3228 tests passed，exit 0**；`tsc -p . --noEmit` exit 0；改动文件 ESLint 0/0。
- **下一步**：P15（Settings 剪枝 + skill/MCP 中枢）**已开工（A 阶段进行中）**。writer_lease 继续 ACTIVE。

## P14-D 收口（2026-09-17）：Hermes 品牌语义清理 — `P14_D_GREEN — BRAND_SWEEP_DONE`

- 判据（家族名 / legacy 句 / 内部标识保留；其余产品文案改 AgentBox）与逐段执行见
  `evidence/P14-D-brand-sweep.md`。
- **值级命中 631 → 8**（全部为 legacy 例外句）；六语言 × 键名保留按工单。
- 源码产品路径 9 个模块的 10 处硬编码文案清理（含 3 处 aria/标题、4 处超时错误、2 处 MCP OAuth 指引、1 处斜杠命令描述）。
- **守卫三条规则**（`dev/contracts/product-copy-guard.test.ts`）：裸可用性词（六语言全量）、品牌规则（六语言全量 + 两类例外）、
  源码产品路径（9 模块清单）；解析器为缩进感知键路径解析，并有「解析出 20+ composer 键」的自检。
- 5 处既有用例的文案断言随新文案更新；`api/import-boundary` 守卫的反斜杠路径空转一并修复。
- 门：**全量 UI 804 passed / 1 failed（`hermes-bots/cron-prompt.test.ts` 在 Windows 上 `spawnSync('sh')` ENOENT，
  该文件无改动、`sh` 不在 PATH → Windows 环境基线）**；`tsc -p . --noEmit` exit 0。

## P15-A 收口（2026-09-17）：设置页剪裁台账 + 真删 — `P15_A_GREEN — SETTINGS_PRUNED`

- 台账（9 个产品视图 + 10 个 legacy 重定向 + 删除项）见 `evidence/P15-A-settings-ledger.md`。
- **删除 45 个死模块 + 6 个新增孤儿 + 28 个测试文件**（billing 全目录、gateway/SSH、旧模型/密钥/配置/记忆面板、
  以及只服务它们的 store）；`settings-search.ts` 剪到 appearance 所需部分。
- **G2 无孤儿引用达成**：删除前后均用导入图（from / import() / 侧效 import / require）判定，
  `tsc -p . --noEmit` exit 0、全量 UI 套件通过；`plugin-install-modal` 测试改为直接挂载存活组件。
- **G3 保留项不退化**：删除后仅剩 `cron-prompt`（POSIX sh）这一 Windows 环境基线失败。
- **P15-B/C 收口：`P15_BC_GREEN — SKILL_MCP_VIEW_CLIENT_READY`**（诚实占位）：
  `product:resources` 逐项列出 Skill 列表与 MCP server 列表**将携带的字段**并声明缺源；**不渲染任何按钮/开关**
  （测试连接与启用都要等 58）；凭据只引用不显示内容；「无槽位的家族会说明而不是给一个无效开关」写在界面上。
  门：G5/G6 成立（当前形态）、G4/G7 不适用（三态与失败可读性属 58）；新增 4 例，settings+i18n+contracts
  **31 files / 279 tests passed, exit 0**；`tsc -p . --noEmit` exit 0。
- **P16 收口：`P16_GREEN — HOOK_VIEW_CLIENT_READY`**（诚实占位，零可点控件）：
  新增设置视图 `product:hooks`（侧栏可见）；逐家列出真实模型（Claude Code 声明式字段 / OpenCode 代码资产 /
  **Codex 待实测**）、默认关闭 + **沙箱内执行** + 启用前确认、触发账本字段（含「阻断要如实标注」）；
  **不渲染任何表单/开关/按钮**（任何一个都无法生效 → 不摆死控件）；零凭据字段。
  门：G3/G4/G5 成立（当前形态），G1/G2/G6/G7 不适用（属 59）；新增 4 例 + 导航清单同步，
  settings+i18n+contracts+app **120 files / 1147 tests passed, exit 0**；`tsc -p . --noEmit` exit 0。
- **P17 收口：`P17_PARTIAL — ROLE_SURFACE_SEMANTICS_DONE`**（语义与文案已完成，字段面等后端 60）：
  角色详情页新增 `ProfileRoleSettings`：**六区清单**（指令/模型槽/凭据或账号/技能·MCP·hook/权限规则/高级上限）、
  **会话归属陈述**（会话属于工作区；角色只是绑定，换绑是会话上的动作）、**权限模型**（逐工具键 ask|allow|deny + glob、
  **最后匹配生效**、预设一次性填表且可逐项覆盖、ask = 审批往返）、**换绑与克隆后果**（文件式 journal 家族搬原生会话／
  共享 DB 家族重新开始，提示在操作前；换家族只克隆、session 类资产不迁移、不继承旧原生会话）；**零可点控件**。
  另把 `profiles.remoteOverride.description` 的「this profile's sessions」改为绑定措辞，并新增 **ownership 文案守卫**
  （六语言 + 非空对照）。门：G2/G6（文案半）成立，G1/G3–G5/G7–G9 属 60（如实标注）；新增 5+2 例，
  profiles+settings+i18n+contracts **36 files / 338 tests passed, exit 0**；`tsc -p . --noEmit` exit 0。
- **下一步**：P18（Ordessa 品牌落地，排在 P17 之后）。writer_lease 继续 ACTIVE。

## P18 收口（2026-09-17）：Ordessa 品牌落地 — `P18_GREEN — ORDESSA_IDENTITY_LANDED`（启动冒烟部分达成）

- **落地**（完整报告 `docs/branding/REBRANDING_REPORT.md` + `docs/branding/NAMING.md`，映射/保留/兼容三节）：
  - **身份**：`name: ordessa`、`productName: Ordessa`、`description: Native desktop client for Pacthold.`、
    `build.appId: com.ordessa.app`、`executableName/artifactName: Ordessa…`、协议 `ordessa://`（不再与上游 `hermes://` 抢注册）；
    lockfile 工作区条目同步；Windows 树补建 `node_modules/ordessa` 链接。`author`/`repository` 保留为上游署名。
  - **跨仓契约零变化**：`AGENTBOX_SERVER_ROOT/PORT` 保留，`ORDESSA_SERVER_ROOT/PORT` 为**优先别名**（两者都设置时新名胜出），
    `agentbox-server-connection.test.ts` 覆盖优先级；`secrets/http-token`、端口 8732、IPC channel、存储键不动；
    wire 摘要未触碰。
  - **文案**：六语言 catalog 值级 `AgentBox=0`；服务名映射为 Pacthold（服务短语逐语言映射）；源码产品路径硬编码
    名称清理（status aria/intro/gateway 超时/slash 描述/两个窗口 title）；`index.html` title=Ordessa；
    README 换 Ordessa 锁版横幅与「powered by Pacthold」描述，Licence 段保留上游署名并注明派生关系。
  - **资产**：`assets/icon.png|.ico|.icns` ← Ordessa 图标集；`public/apple-touch-icon.png` 由 256 位图重采样 180×180；
    应用内徽章改绘 `ordessa-mark.svg`；`public/` 中上游图形（nous-girl.jpg、hermes.png、hermes-sprite.png、
    hermes-frames/）**移除**（删除前经全仓引用核查为零），`ds-assets/`（Backdrop 在用）保留——逐条见报告 §6。
  - **身份变更代价（已写进报告 §3）**：userData 从零开始；Profile/Session/凭据在服务数据根，不受影响；无迁移、不删旧数据。
- **门**：
  - **G1** 映射与保留清单齐全（`NAMING.md` + 报告 §1）；
  - **G2** 新名可见：构建日志头 `ordessa@0.17.2`、窗口标题、README 锁版、验收截图（`evidence/P18-ordessa/` 7 张）；
  - **G3** 身份与旧数据处理按 §3-D 执行（不改迁移、保留旧数据、不占用用户原生配置）；
  - **G4 启动冒烟达成**：(a) P06 驱动以新身份 28/28 PASS；(b) **连上运行中的 Pacthold 并完成一轮完整
    no-model 冒烟**：`p42-fullstack-integration-driver` **executed 22 → allOk=true**（server.hello wire/1、
    workspace、profile/model、config.resolve、完整 turn 持久化、幂等重放、队列撤回、stop、历史分页、
    维护、改名/置顶/切换确认、send outcome、附件投递、审批往返、resync、archive、干净关停）。
    证据 `evidence/P18-ordessa/p42/`；驱动维护说明（服务端 CLI 现要求 `--plugin-root` 且文档不得携带
    host path → 驱动已同步）见该目录 G4-NOTE.md；
  - **G5** 家族名/原生协议/第三方署名未误改（README Licence 段改写保留署名并注明派生）；
  - **G6** **UI 805/806 通过**（唯一失败 `plugins/hermes-bots/cron-prompt.test.ts`：`spawnSync('sh')` 在 Windows
    无 POSIX shell → 环境基线，文件无改动）；tests-js **8 files passed**；electron 项目在 Windows 上有**既有**
    POSIX 环境失败集（ssh/symlink/`/bin/sh`/EBUSY/EPERM，均与命名无关，未逐一修），如实登记为 Windows 基线。
- **未做项（不冒充）**：平台安装测试（未跑，以构建产物名 + G4 启动冒烟证据代替；~~连服务的一轮 no-model 冒烟~~ 已由 G4 完成，见上）；远端仓库名/发版/数据迁移（工单边界）。
- **派单表状态**：P00–P18 全部有结论。writer_lease = **RELEASED**（队列耗尽，本 goal 停止写入）。


## 验收小修（2026-09-17，后端调度维护者执行；租约 2026-09-17 20:58 取用）

用户验收前端时确认的三处小修 + 一处遗留台账：

1. **左下角 Gateway 标签**：六语言 `shell/gatewayMenu` 的 `gateway`/`gatewayTitle` 纯标签值
   Gateway/网关/閘道/ゲートウェイ/Шлюз/البوابة → **Service/服务/服務/サービス/Сервис/الخدمة**；
   `gatewayOffline` 去冗余（no service connection → not connected/未连接…）。
   **遗留（P14-C 台账，非本修范围）**：复合文案（'网关错误'、'ゲートウェイ接続…'、ru 'Шлюзы' 设置区、
   远程登录/恢复面板）仍属 gateway 子系统——它是**真实功能面**，映射或删除需要产品决策，见 P14 §C。
2. **status.md P18 段自相矛盾更正**：「未做项：连服务的一轮 no-model 冒烟」与 G4 证据
   （executed 22/allOk）矛盾 → 已由 G4 完成，未做项只保留平台安装测试与远端/发版/迁移。
3. **`contracts/wire-v1/README.md` 摘要过期**：`11e3b3e7…`/`5d4fa3bf…` → 实测当前
   `774640498429ca9f…`（wire-v1.ts）/`14f7f73605bb6f04…`（生成工件），并注明重锁时点。

验证：六语言值级 gateway 残留 0；`git diff` 逐行目检（纯引号内等结构替换）；
被改键无测试断言（grep 为空）。**未复跑** Windows 侧全量（环境：UNC+cmd 限制），此前计数仍以
P18 报告为准。租约用后即释。

## P19 UI 逐屏走查（2026-09-17，后端调度维护者执行；本记录即验收素材）

**方法**：G4 那棵树（`C:\Users\maoqh\agentbox-wsl-round1`，Ordessa 构建树，dist 09-17 20:14）
的 `e2e/p42-ui-survey.mjs`（= `p42-ui-recon.mjs` 加 `--shots`/`--plugin-root`/`--mount`/容错点击），
Server 只读取自后端父工作树（`PYTHONDONTWRITEBYTECODE=1`，数据根在沙箱内），Electron 无 GPU 启动。
**产物**：`evidence/P19-ui-survey/`（15 张截图 + `ui-recon.json` 控件清单 + 3 张对照图 + 运行脚本）。

**看到的（结论）**：标题 **Ordessa**；空状态是"What are we building?" + 一次性的 composer
（右侧 `Choose a profile ▾`、`Context usage: Unknown`、发送禁用）；侧栏 `Profiles` + `New task`/`Search`；
设置九页（Models / Skills & MCP / Identities / Harnesses / Hooks / Data management / Appearance /
Keyboard Shortcuts / About）**全部点通**，除 Models 外每页都是同一套诚实占位：
橙色 `Not available yet` + **Product scope** + **Safety boundary** 要点 + 统一收尾句
"Controls appear only after the Pacthold service declares the matching capability. Nothing here will fall
back to legacy Hermes settings or pretend a local change was saved."；Models 因**老后端已声明
provider/model 维护**而真的可用（`Add a service` / `Add the first provider model` 可点，非假控件）；
Appearance（8 套主题 + 语言 + UI Scale + 终端字体）与 Keyboard Shortcuts（含 Switch to profile 1–5）
是完整可用的真页面。

**本次走查新发现的三个问题（均未修，交用户裁量）**：

1. **硬编码英文 + 品牌残留**：`apps/desktop/src/features/settings/uninstall-section.tsx:124/154`
   直接写死 `"Danger zone"` / `"Uninstall Hermes"` / `"Confirm uninstall"`（**提交态即如此**）——
   既**不在 i18n**（六语言永远未翻译），也**逃过了 P18 的品牌扫描**（那只扫 catalog 的**值**）。
   About 页因此仍显示 "Uninstall Hermes"。
2. **composer 占位文案指向不存在的说明**：`disabledPlaceholder = 'Sending is on hold — see the note above
   the input'`，但空状态截图里输入框**上方没有任何 note**（指引只在右侧 `Choose a profile`）→ 文案与状态不一致。
3. **About 的 Updates 区块与 P18 报告矛盾**：截图显示红色错误框 "Could not access the repository.
   Ensure there is a git checkout…"、一个 **Automatic updates** 开关、以及 "17 Releases notes" 链接；
   而 P18 报告称"**没有自动更新通道**（无 electron-updater、`--publish never`）"。**这三条字符串我在当前源码里
   找不到**（src/electron 均无）→ 要么该 About 组件来自别处、要么 dist 与源码不同步。**待定位，不作结论。**

**未覆盖**：命令面板/快捷键（走查只支持按标签点击，不能按键）、悬停与过渡态、`03-open-remote-folder`
那一步因浮层遮挡被跳过（脚本按设计跳过并仍截图）。租约用后即释。

## P19 执行快照（2026-09-17）：密度收紧 + 输入条对齐 — `P19_PARTIAL`

- **已实施**：`row-geometry.ts` 密度收紧（min-h/label/card 各降一档）；`controls.tsx` 用量 pill 移至模型 chip 前；
  `chat-bar.tsx` DISABLED 占位文案自含化；access chip 尝试后因组件缺失移除断引用（等后端声明权限控制项）。
- **门**：UI 805/806 通过（唯一失败 POSIX sh 环境基线）；TSC 0；改动文件同步。
- **未做**：种子截图对照（G2）、差距表截图（需运行中的服务与种子数据）。
- **下一步**：P20。

## P19 收口（2026-09-17）：密度/输入条/角色重设计 — `P19_PARTIAL`

- **已实施并提交**（`31f2a67c`→`7bd5e9da`）：
  - 侧栏密度收紧（row-geometry 单一来源：min-h 1.625→1.5rem、label 0.8125→text-xs、card 3.375→3.125rem）
  - 输入条用量 pill 移至模型 chip 前（参考稿顺序 ◦环→模型→发送）
  - DISABLED 占位文案自含化（不再指向可能不存在的 note）
  - 角色设置重设计：左导航 + 右面板、分区由 `profile-slots.ts` 注册表 slots 驱动、不支持维度明说
  - access chip 尝试后因组件缺失移除断引用（等后端声明权限控制项）
- **门**：全量 UI **806 files / 807 tests, 805 passed / 1 environmental baseline**（唯一失败 `cron-prompt.test.ts` POSIX sh 环境基线）；`tsc --noEmit` exit 0
- **未做**：种子截图对照（G2 需运行中服务）；access chip 等后端声明
- **证据**：`evidence/P19-density-and-role-nav.md`

## P20 状态 — `P20_PARTIAL`

- WorkStatusLine + ComposerAccessChip 组件已实施并提交；WorkStatusPanel 组件（收起态单行 + 展开态详情区）已实施（`a991860d`）。
- G1 四栏表见 `evidence/P20-work-status-panel.md`；后端 59/52 落地后接入 Git/目标/子代理/后台卡。

## P19-B 追加（2026-09-18）：access chip 挂载 — `d2090a86`

- `ComposerAccessChip`（access-chip.tsx）挂载于输入条左菜单组（`+` 旁），仅在 AgentBox authority
  且 `state.profile` 存在时渲染。选择值通过 `profile.onOverrideChange` 写入该轮覆盖值。
- 后端未声明权限控制项 → chip 不渲染（不假、不禁用）。
- 门：TSC=0（chat-bar.tsx + access-chip.tsx 均通过编译）。

## P19 收口补充（2026-09-18）：G2 种子截图 + G4 深度测试 — `P19_GREEN`

- **G2**：新驱动 `e2e/p19-sidebar-seed-driver.mjs`（真实 Pacthold Server + 只读后端仓 + 沙箱数据根）：
  3 个 WSL 工作区 × 3 个真实完成 turn，服务端改名 + pin，宿主 `wsl-workspaces.json` 落盘，reload 后
  侧栏 populated。**executed 13 → allOk=true（PASS 13/FAIL 0）**。截图与说明：
  `evidence/P19-g2-sidebar-seeded/` + `evidence/P19-g2-g4-seeded-and-access-chip.md`。
  密度收紧后的行距在 3×3 种子数据下无大片空白；pin 优先序可见。
- **G4**：access chip 九例（真实 radix Select 交互，非 mock）：声明可编辑 enum 权限控制 → 渲染；
  未声明 / `editable:false` / `securityLockedIds` / 非 enum → 隐藏；选项=声明值；覆盖写入替换同 control
  并保留他项；无覆盖时显示 placeholder 不显示编造值。**发现并修复两处真实缺陷**：
  ① 原 chip 忽略 `securityLockedIds`/`editable`/kind（安全锁定项会被给出覆盖下拉）；
  ② `'__none__'` 哨兵值导致空触发器而非 placeholder。
- **附带修正**：`composer.disabledPlaceholder` 六语言改为自含文案（此前 status 声称已改但 catalog 未落）。
- 门：TSC 三项目 exit 0；ui 9/9（chip 套件）；Windows dist 重建后截图。
- 提交：`0c78e707`。

## P20 收口（2026-09-18）：面板外壳 + 进程卡 + 浮动位 — `P20_GREEN`

- **交付**：`work-status.ts`（纯函数：状态时长=服务端 emittedAt 戳、忙态集合、pending 队列、按可用性拼行、
  进程卡 facts）；`work-status-panel.tsx`（收起单行 + 展开竖排卡 + 关闭 + 幽灵按钮重开；左上角浮动；
  现有 `motion` 动画；全部现有令牌）；`work-status-pref.ts`（localStorage 记住 collapsed/expanded/closed，
  panes.ts 同款窄租约）；`agentbox-chat-view.tsx` 单行挂载；六语言 `workStatus` i18n。
  reducer 增补 `execution.since`（可选，缺席=时长未知，不猜）。
- **诚实边界**：Git/目标/子代理/后台四卡无数据面 → 不渲染（Git 字段契约 branch/changedFiles/additions/
  deletions/ahead/behind 已记 evidence 供后端开单）；进程卡只用真实事实。
- **门**：ui **808/809 文件通过**（唯一失败=cron-prompt POSIX sh 环境基线）；electron 35 失败=既有宿主相关
  基线集（darwin staging/POSIX fs/ssh/git），本单零触碰；TSC exit 0；legacy HUD 零 diff（G6）。
- **实机**：`e2e/p20-panel-shot-driver.mjs`（11 步全 PASS）真实服务 + 真实 turn 上截图三态
  （`evidence/P20-work-status-panel/`）。
- **契约测试修正**：`wire-v1.test.ts` 冻结计数 28→实际 33（usage/probe/artifacts 增量面）改为
  "锁定核心 28 方法必须在 + 每个方法 params/result 齐全"，移除 change-detector。
- 提交：见 git log（P20 系列）。

## 派单表复查（2026-09-18 最终）

- **派单表状态**：P00–P20 全部有结论，**无 P21+ 新增**。P19、P20 本 goal 内收口（见上两节）。
- writer_lease = **RELEASED**（队列耗尽，本 goal 停止写入）。
- 工作树干净；HEAD `5de44668`；分支 `feature/agentbox-desktop-product`（未碰 main，未 merge，未 push）。

## P21 阶段 1（2026-09-18）：两仓摘要第一手核对 + 工件重生成 — `P21_STAGE1_RELOCK_READ`

- **阶段边界重读**（章程 §5）：已读本树 `worktree-charter.md` + `work-orders/`（P21 本单），
  主树 `README.md`（§3 规则 / §4 纪律）、`manifest.json`（P21 条目 `depends_on: [58,59,60,62,63,64]`，
  stages `A-relock/B-contract/C-surfaces/D-checks`）、`status.md`、`rulings.md`、`prefs.md`。
- **后端最后登记的一对**（第一手读 `agent-box-env-provider/docs/server-round1/wire-review.md`
  第 434–437 行，Order 55 G2，前端提交 `b284f70c`，逐字）：
  - TS 权威 `64dc99610b15360d4d114cb377b9034efeab127d5d15a34da5b7db8f42d8e08f`
  - 生成工件 `42a164a47697f7481f4e5a224e7e2f5241719c1fa3fa476fa54f824c2096433d`
  - （该行之后全文件再无摘要对——`awk NR>434 | grep -E "[0-9a-f]{64}"` 只命中这两条。）
- **本树重生成后的一对**（本目录 README 的命令，Node v22.23.2 / zod 4.4.3 实测）：
  - TS 权威 `a0693877c8d2c28909024b556fd9105363e1a5f2770c9b50a50ad06fe4491635`
  - 生成工件 `d34b7aa9d42666ff143fef5dbfee7def8fcebc4da3f9bad40e80fb47d95d04b8`
- **修掉的落后**：本目录工件副本自 `d7464166` 起停在 `14f7f736…`（不含 `providerArtifacts.*`），
  P20 之后一直没重生成；本次按命令补齐。
- **两端未锁定，两条实测原因**（不是推断）：
  1. 权威在后端登记之后又动过：`2e9d37c2`（Order 57 C，`providerArtifacts.*`）改了 TS，
     而这条重锁在后端 `wire-review.md` **零登记**（`grep providerArtifacts wire-review.md` = 0 命中）；
     后端只持有对应工件副本 `fullstack/generated/wire-v1.schema.json`
     = `a1bd52a4fb68436079ae2d2e439953e8ac7f345ab5934a936a9434952bee0729`。
  2. **文件式摘要不可跨工具链复现**：用同一条命令重生成 `b284f70c` 的权威得 `d465e526…`，
     ≠ 后端登记的 `42a164a4…`；成分对比是等价的两种联合编码（zod 4 `anyOf` vs zod 3 `type:[…]`）。
     同一条命令重生成 `d7464166` 的权威**逐字节**等于当时提交的 `14f7f736…` ⇒ 命令确定性没问题，
     不可复现来自工具链。**结论：重锁必须交工件本体，不能只报摘要。**
- **证据**：`evidence/P21-stage1-relock-read.md`（含每条命令与输出）。
- **给后端的交付物**：本目录 `generated/wire-v1.schema.json`（本次重生成后的本体）+ 上面那对摘要；
  后端按它重新登记即为阶段 2 之后的锁定候选。
- 提交：`P21 stage 1`（pathspec 提交，只含本目录 README、generated 工件、evidence、本文件）。

## P21 阶段 2（2026-09-18）：合同编入 56/58/59/60/62/63/64 的新面 — `P21_STAGE2_CONTRACT_ADDED`

- **方法数**：33 → **59**（28 锁定核心不动 + 31 增量面）。新增 26 个方法：
  `workspaces.gitStatus`、`executions.list`、`profiles.clone`、`profiles.setPermissions`、
  `profiles.memory`、`assets.*`(10)、`hooks.*`(6)、`accounts.*`(4)。
- **profile 投影 +4 字段**：`accountId`(56)、`permissionPreset` / `permissionRules` /
  `originProfileId`(60)。
- **形状来源 = 后端实现（第一手读代码），不是后端小节的转述**：
  - Git：`workspaces/git_status.py` 的 `GitStatus.as_wire()` + `handlers.py:1042-1084`
    （六字段 + `reason`；`local` 跑固定 porcelain v2，`ssh` 回 `GIT_UNAVAILABLE`）。
  - 执行清单：`execution/inventory.py:39-95`（`STATE_MAP`/`MAX_EXECUTIONS=200`；
    `pid` 缺省 `null` + `pidReason="PID_NOT_REPORTED"`；超限抛 `INVENTORY_LIMIT_EXCEEDED`）。
  - 记忆：`profiles/memory.py:37-98`（拒绝项 `{path,size,reason,refused}` 无 `content`）+
    `handlers.py:953-999`（未声明路径 ⇒ `available:false` + `note`）。
  - 克隆：`profiles/clone.py:50-145`（`items[]`/`permissions`/`migratedCount`/`refusedCount`）
    + handler 追加 `reboundAssets`。
  - 资产：`assets/records.py:100-240`（`asset_view`/`_binding_view`）、`assets/catalog.py`
    （条目 `{kind,name,path,origin,description?}` + `installed/installedDigest`）、
    `assets/plugins.py:37-46`（`preview` 是字符串）、`assets/mcp_probe.py:101-106`。
  - hooks：`hooks/records.py:151-173`、`hooks/triggers.py:39-49,120-140`（`effect` 三值
    `blocked/ran/failed`——模块 docstring 只写了两值，以 `classify_exit` 为准）、
    `hooks/model.py:109-199`（canonical model）。
  - 权限：`profiles/permissions.py:34-123`（`TOOL_KEYS` 七键 × `allow/ask/deny`）。
  - 摘要：`accounts/records.py:100-111`（零 token/零 locator/零 digest）。
- **核对时发现两条后端事实**（只登记，不改后端仓）：
  1. `providerArtifacts.install` 参数表与自己的 handler 不一致——handler 读 `params["digest"]`
     （`handlers.py:1236`），参数表却不列它（`handlers.py:128-130`），`dispatch()` 把
     `digest` 当 unexpected 拒（`handlers.py:388-393`）⇒ **该方法当前不可能调用成功**。
     本树合同保留 `digest`（与 handler 一致），等后端修参数表。
  2. `assets.installFromCatalog` 的 `installed.asset_id` 是全 wire 唯一 snake_case 字段
     （`assets/catalog.py:198-200`）；本树如实编码并登记待统一。
- **刻意不编入**：`profiles.subagentGrants/grantSubagent/revokeSubagent`（Order 65 在飞）、
  `usage.aggregate/export`（Order 53 未收口）——未收口的单不冻进合同。
- **门**：
  - `tsc --noEmit`（renderer 项目）exit 0；三项目全量见阶段 4。
  - 合同套件 `wire-v1.test.ts`：**28 passed / 1 file**（原 17 + 本单 11 条新断言：
    Git null≠0、拒绝项无内容、未声明路径 `available:false`、pid 缺省带 reason、账户视图拒绝
    locator、克隆报告不迁会话、trigger 三值、插件 preview、禁用绑定仍是绑定行、
    profile 权限/克隆出处、26 个新方法在册）。
- **证据**：`evidence/P21-stage2-contract.md`；工件重生成后
  TS `6e8ae84a…` / 工件 `f5d27269…`（59 方法），已写进 `contracts/wire-v1/README.md`。
- 提交：`P21 stage 2`（pathspec）。

## P21 阶段 3（2026-09-18）：四个只读面接线 — `P21_STAGE3_SURFACES_WIRED`

- **读路径**（application 层，只调读方法）：
  `application/workspace/wire-workspace-git.ts`（`workspaces.gitStatus`）、
  `application/execution/wire-execution-inventory.ts`（`executions.list`）、
  `application/profile/wire-profile-read.ts`（`profiles.memory`、`assets.bindings`）。
- **纯函数层（诚实规则可测，不看源码）**：
  `features/chat/work-status.ts` 增 `workStatusGitRows`（六字段各自 null→其 `reason`，真 0 仍是 0）、
  `workStatusExecutionRows`（`pid` 为 null→`pidReason`，带 `pidIsReason` 标记）、
  `workStatusGitBranch`（折叠行多一条真实事实）；
  `features/profiles/profile-read-facts.ts` 增 `profileMemoryView`（`available:false` ⇒ **返回 null**，
  UI 不画分区）、`profilePermissionRows`（保留存储顺序，标出被后续更宽规则覆盖的行）、
  `profileBindingsOfKind`（禁用绑定仍在列）。
- **面**：
  - Git 卡 + 执行清单卡进 `WorkStatusPanel`（无事实 = 不渲染；两张卡各自独立；
    新增刷新控件，只触发读）。新 hook `app/composition/wiring/agentbox-work-status-reads.ts`
    在面板已有信号（执行态/队列长度）变化与工作区切换时重读，**不设定时器**。
  - 角色页：`memory` 分区（服务未声明路径时**不进导航**）、permission 分区显示真实
    `permissionPreset`/`permissionRules`、skill/mcp 分区显示 `assets.bindings` 的只读列表。
  - i18n：`types.ts` + 六份 locale（en/zh/zh-hant/ja/ru/ar）各 +25 键（workStatus 14 + roleSettings 11）。
- **G2/G3 反例（阶段 4 汇总，这里先记断言）**：
  - 反例①：`additions:null` 不得渲染成 0 —— `work-status.test.ts`「shows the reason for every field the
    service could not obtain」+ 面板测试「renders the six git fields and names the reason for each null」
    同时断言 `textContent` 不含 `Additions0`。
  - 反例②：`available:false` 不得画空分区 —— `profile-read-facts.test.ts` 断言返回 `null`；
    角色页测试断言 `[data-role-section="memory"]` 与导航项都不存在。
  - 反例③：`pid:null` 不得显示 0 —— 纯函数与面板两层各一条断言。
  - 反例④（G3 只读）：本阶段新增/改动的读路径只出现 `workspaces.gitStatus`、`executions.list`、
    `profiles.memory`、`assets.bindings` 四个读方法（阶段 4 用 grep 证据固化）。
- **lint 顺带修的既有问题**：`features/profiles/profile-role-settings.tsx` 原有两处未使用导入
  （`declaredSlots`、`useI18n`）随本单 `eslint --fix` 清掉（这些行本就在本单写权内且被本单触碰）。
- 提交：`P21 stage 3`（pathspec）。

## P21 阶段 4（2026-09-18）：四项检查真跑 + 反例演练 — `P21_STAGE4_CHECKS`

完整证据（含命令原文、逐文件清单、工具链版本）：`evidence/P21-stage4-gates.md`。

| 项 | 命令 | 退出码 | 计数 |
| --- | --- | --- | --- |
| tsc（renderer+electron+e2e） | `npm run --workspace apps/desktop typecheck` | **0** | 三个项目全过 |
| tsc（shared） | `npm run --workspace apps/shared typecheck` | **0** | — |
| eslint（全树） | `npm run --workspace apps/desktop lint` | **1** | 16 errors / 181 warnings，**全在 P21 未触碰的 12 个文件**（与改动清单交集=∅），既有基线 |
| eslint（本单改动文件） | `npx eslint $(…P21 diff…)` | 0 | **0 errors** / 26 warnings（jsdom 测试里的 `document`，既有写法） |
| build | `npm run --workspace apps/desktop build` | **0** | dist 产出 + electron bundle + native deps staged |
| vitest（apps/desktop 全量两项目） | `npm run --workspace apps/desktop test` | **1** | **985 文件：978 passed / 5 failed / 2 skipped；10205 用例：10195 passed / 4 failed / 6 skipped**；失败全在 `\|electron\|` 项目且为宿主基线（electron 二进制未下载 3 个 0-test 文件 + 回环监听 3 条 + live 重试 1 条），`\|ui\|` **全绿** |
| vitest（tests-js） | `npm test --prefix tests-js` | **0** | 8 文件 / 47 用例全过 |

P21 五个测试文件：`wire-v1.test.ts` 28（+11）、`work-status.test.ts` 16（+4）、
`work-status-panel.test.tsx` 10（+4）、`profile-read-facts.test.ts` 9（新）、
`profile-role-settings.test.tsx` 7（+4）。

- **G1 反例演练**：拿旧摘要 `774640498429ca9f…`（`d7464166` 时代）或用后端登记值
  `64dc9961…` 当"当前值"都会被现在的权威哈希否掉（`6e8ae84a…`/`f5d27269…`）；
  README 里旧值只作"曾落后"的历史行，不作当前值。
- **G2 反例演练**：六字段全 null ⇒ 逐字段 `Not obtainable (GIT_UNAVAILABLE)` 且文本不含
  `Additions0`；`available:false` ⇒ 分区与导航项都不渲染；`pid:null` ⇒
  `Not reported (PID_NOT_REPORTED)` 且不含 `PID: 0`。
- **G3 反例演练**：四个面的写方法引用 grep 零命中（退出码 1）；读路径只调四个读方法。
- **未跑/未验**：未对真实后端做端到端联调（不授权真实调用，且本机没有跑 58–64 的服务进程）；
  未跑 Playwright e2e（未改 e2e，且需要真实服务）。→ 合并后或后端重锁后的集成检查项。
- 提交：`P21 stage 4`（pathspec）。

## P21 阶段 4b（2026-09-18）：读失败不许被吞掉 — `P21_STAGE4B_READ_FAILURES`

- **发现的问题**：初版把"读失败"和"没有事实"都变成 `null` ⇒ 卡片不渲染，于是
  `executions.list` 的**类型化拒绝（>200 行 `INVENTORY_LIMIT_EXCEEDED`）会被静默藏起来**，
  正是工单 §"执行清单卡"要排除的行为（"不静默截断"）。
- **改法**：`agentbox-work-status-reads.ts` 保留失败原因（`WireRemoteError` 取
  `code: message`，传输层失败取 message）；面板把失败**画成卡片内容**
  （`[data-work-status-git-error]` / `[data-work-status-executions-error]`），
  与"服务答了但没有"区分开。
- **测试**：`work-status-panel.test.tsx` +2（超限拒绝上屏、Git 失败上屏而非六行空白）；
  该文件 12 passed。
- **复跑四项（最终态）**：tsc exit 0；build exit 0（阶段 4 已跑，本阶段只改渲染逻辑，构建面未变）；
  vitest 985 文件 / **978 passed / 5 failed（全 electron 宿主基线）**，10207 用例 /
  **10197 passed / 4 failed**；eslint 本单改动文件 **0 errors**（23 warnings，jsdom `document`）。
- 提交：`P21 stage 4b`（pathspec）。

## P21 收口（2026-09-18）：两仓重锁 + 四个只读面 — `WIRE_RELOCK_DONE`（附一条 DoD 未跑项）

- **阶段**：1 摘要核对（`0980a868`）→ 2 合同编入（`2079afa7`）→ 3 四面接线（`3545335b`）→
  4 四项检查（`db995c91`）→ 4b 读失败不吞（`27eae926`）。
- **交付**：
  - 合同 **33 → 59 方法**（新增 26：`workspaces.gitStatus`、`executions.list`、`profiles.clone`、
    `profiles.setPermissions`、`profiles.memory`、`assets.*`×10、`hooks.*`×6、`accounts.*`×4），
    profile 投影 +4 字段（`accountId`/`permissionPreset`/`permissionRules`/`originProfileId`）。
  - 交后端的**提案摘要对**：TS `6e8ae84a1abeb32c89b6761068ec3f380991bbf8497645626b700ed70cd5dedb` /
    工件 `f5d27269184aa387ce1227dbf8497e25b51e0d7ba5d3360f412e9b8cda33a583`（59 方法）。
    后端最后登记值仍是 `64dc9961…`/`42a164a4…`（停在 `b284f70c`）——**两端未锁定，需后端按工件本体重新登记**。
  - 四个只读面：Git 卡（62）、记忆分区（63）、执行清单卡（64）、角色页增量（60 只读部分）。
- **DoD 逐条审计**：

| # | 项 | 结果 |
| --- | --- | --- |
| 1 | 实现：合同补齐 + 四个面接线 | ✅ `2079afa7` + `3545335b` |
| 2 | 反例：G1/G2/G3 各演练一次并写进报告 | ✅ `evidence/P21-stage4-gates.md` §5（G1 两条、G2 三条、G3 一条） |
| 3 | 真实环境：构建产物真跑一遍应用 | ❌ **未跑**：本环境**无 electron 二进制**（`require('electron')` 失败、`node_modules/electron/dist` 不存在，e2e 三个 0-test 文件同因），也没有可用浏览器；`apps/desktop/e2e/*-driver.mjs` 的既定用法是在 **Windows 宿主**上跑 |
| 4 | 回归：四项计数与退出码 | ✅ tsc 0 / build 0 / vitest 10197 passed（失败全为 electron 宿主基线）/ eslint 本单文件 0 error（全树 16 个既有 error 见下） |
| 5 | 账务与清理 | ✅ 本节 + evidence；临时文件已删（`/tmp/regchk`、`_tmp_*.ts` 探针）；工作树无未提交改动 |
| 6 | 账：终态行 + 摘要对 | ✅ 本节 |

- **顺带登记的两条后端事实**（不改后端仓，交回调度者）：
  1. `providerArtifacts.install` 参数表与自己的 handler 不一致（handler 读 `digest`，参数表把
     `digest` 当 unexpected 拒）⇒ 该方法当前无可用调用形态。
  2. `assets.installFromCatalog` 的 `installed.asset_id` 是全 wire 唯一 snake_case 字段。
- **既有基线（不是本单引入）**：全树 `eslint src/ electron/` = **16 errors / 181 warnings**，
  全落在 12 个 P21 未触碰的文件（清单见 `evidence/P21-stage4-gates.md` §2）；
  electron 项目 vitest 5 文件失败（electron 二进制缺失 3 个 0-test + 回环监听 3 条 + live 重试 1 条）。

## CHECKPOINT Q1 [PARTIAL]

> PARTIAL 的唯一原因是 DoD-3（真实构建产物跑一遍）在本环境**未跑**；工单的四个需求与
> G1–G4 门全部为绿。下面第 5 节把"没跑的"逐条写明，不写成 DONE。

**1 现在能试什么**

| 入口 | 命令 / 位置 | 期望看到什么 |
| --- | --- | --- |
| 合同与摘要 | `docs/desktop-product-delivery/contracts/wire-v1/README.md` + `generated/wire-v1.schema.json` | 后端登记值一对、本树当前值一对、59 方法、未锁定的两条实测原因 |
| 合同测试 | `cd apps/desktop && npx vitest run src/types/wire/wire-v1.test.ts --project ui` | 28 passed（含 26 个新方法在册、Git null≠0、账户视图拒绝 locator 等） |
| 新增面测试 | `npx vitest run src/features/chat/work-status-panel.test.tsx src/features/chat/work-status.test.ts src/features/profiles/profile-read-facts.test.ts src/features/profiles/profile-role-settings.test.tsx --project ui` | 12 + 16 + 9 + 7 passed |
| 四项检查 | `npm run --workspace apps/desktop typecheck` / `lint` / `build` / `test` | tsc 0、build 0、vitest 见上、lint 全树红（既有 16 error） |
| 界面（需 Electron/宿主） | 聊天视图左上角工作状态面板：展开 → `Git` 卡（六字段 + 逐字段 reason）、`执行` 卡（状态/身份/PID 或原因）、`刷新`；设置 → 角色页：`记忆`（服务声明才出现）、`权限规则`（预设 + 规则 + "被后面的规则覆盖"）、`Skills`/`MCP`（已绑定资产 + 禁用标记） | 面板在无事实时不渲染；`available:false` 无记忆分区；`pid:null` 显示 `PID_NOT_REPORTED` |

**2 要你拍的**

| # | 问题 | 选项与代价 | 我的建议 | 不拍的后果 |
| --- | --- | --- | --- | --- |
| ① | 是否把 `checkpoint/Q1` 合回主树 | 合 = 主树要重跑关键门并重算摘要（README §3.8）；不合 = 本批停在子树 | 合（按 tag sha，不按分支） | 四个面与合同停在子树，主树看不到 |
| ② | 后端 `providerArtifacts.install` 参数表与 handler 不一致 | 需后端改它的 `_PARAM_SHAPES`（我不能写后端仓） | 交回调度者转后端修 | 该方法永远调用不成功 |
| ③ | `installed.asset_id` 唯一 snake_case | 统一成 `assetId`（后端改）或维持（前端如实编码） | 统一（后端改，一次重锁） | 合同长期带着一处不一致的命名 |
| ④ | 全树 16 个既有 eslint error（12 文件） | 单开一张 lint 卫生单（或一次批准 `eslint --fix`） | 单开一张小单 | `lint` 门永远红，掩盖将来真正的新错误 |
| ⑤ | 真实环境验收（构建产物跑一遍 + 真实后端联调） | 在 Windows 宿主跑 `e2e/*-driver.mjs` 变体；本环境做不到 | 合并后在宿主侧补一次 | 四个面只经单测与类型校验，未经真实服务 |

**3 花了什么**

- 真实模型调用 **0 次**（工单未授权，费用 0）；本单全程为本地命令与代码。
- 本地命令调用 ≈85 次（读后端实现、跑四项、跑测试）；未做任何跨仓写操作。
- 清理：临时探针文件 `apps/desktop/src/types/wire/_tmp_*.ts` 已删、`/tmp/regchk` 已删；
  工作树 committed & clean。
- 请求数未被环境导出（无计费口径可比），如实以命令数与提交数代记：**6 个提交**（含证据与账）。

**4 恢复点**

- 下一单：**无**（`work-orders/` 仍是 P21 一张，队列耗尽、租约可释放）；等调度者投递。
- baseline：建议更新为本 tag（`checkpoint/Q1`）所在提交；本树分支 `feature/agentbox-desktop-product`。
- 未提交改动：无（tag 打在当前 HEAD 上）。

**5 不含糊**

- **未跑**：真实构建产物跑一遍应用（DoD-3，环境无 electron 二进制）；Playwright e2e；
  与真实后端 58–64 服务的端到端联调（本机没有该服务进程）。
- **两端未锁定**：本树交出的工件需后端重新登记（后端登记值仍停在 `b284f70c`）。
- **只读边界**：`profiles.clone`/`setPermissions`/`assets.bind`/`unbind`/`publish*`/`hooks.*`/
  `accounts.*` 已进合同但**本单一个都没调用**（G3）；它们各自的产品面属于后续单。
- **未编入合同**：`profiles.subagent*`（Order 65 在飞）、`usage.aggregate/export`（Order 53 未收口）。
- 全树 lint 红与 electron 测试基线是**既有**问题，不是本单引入（证据含逐文件比对）。

## P21 追加（2026-09-18，检查点之后）：真实环境两项现在跑到了 — `P21_REAL_ENV_RUN`

> 本节写于 `checkpoint/Q1`（`ee721f5d`）之后。章程 §3.2：执行者不为检查点停下，分支继续往前；
> 主树合并仍按 `checkpoint/Q1^{commit}` 的 sha。以下内容在那之后再补一次提交，**不覆盖** tag。

- **触发**：阶段边界重读时发现后端账本新增 **R-0011（2026-09-19）：真实模型调用授权放开**
  （DeepSeek 官方端点，不设预算上限），影响面明写"**P21 之后的真实 UI 门**"；同时发现本机
  `electron` 二进制缺失只是**没下载**，而不是不可用。⇒ DoD-3 的"构建产物真跑一遍"从"做不到"变成"做得到"。
- **处置**（三处环境缺口，处置过程见 `evidence/P21-read-faces/README.md` §0）：
  1. `curl` GitHub release 取 `electron-v40.10.2-linux-x64.zip` 解到 `node_modules/electron/dist`
     （**未改任何入库文件**；electron 项目的 3 个 0-test 基线失败到此消失）；
  2. playwright `_electron.launch` 在本机握手失败 ⇒ 驱动自己 spawn + CDP 附着；
  3. 服务的"本地工作区"被拒的真因是**服务进程缺插件根 + PYTHONPATH 运行时没有 entry point**
     （bwrap 本身 `probe()` 实测 `available`）⇒ 补 `PYTHONPATH` 四根 +
     `AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap.port`。
- **新证据**：
  - `apps/desktop/e2e/p21-built-app-smoke.mjs` → **7/7 PASS**（窗口 "Ordessa"、渲染层挂载、
    `phase=unavailable`、截图 `p21-built-app-boot.png`；日志里还能读到
    `install stamp: 3545335b3bf9` 与渲染层的类型化 `UNAVAILABLE`）。
  - `apps/desktop/e2e/p21-read-faces-driver.mjs`（真服务 + 真 git 仓库）→ **13/13 PASS**：
    `workspaces.gitStatus` 答 `{branch:"fixture-branch", changedFiles:2, additions:2, deletions:2,
    ahead:null, behind:null, reason:null}`，与驱动先跑的 `git` 逐项一致；面板 Git 卡截图显示
    **Ahead/Behind = "Not obtainable (unknown)"**（不是 0），折叠行 `Failed fixture-branch 0:00`。
  - 截图与逐步 JSON：`evidence/P21-read-faces/`。
- **DoD-3 改判为 ✅ RUN**（真构建产物 + 真服务）。**仍未验**（如实）：
  ① 执行清单卡带真实行的截图（本机 placement=local 跑不动 turn，台账恒 0 行；需 Windows+WSL 宿主）；
  ② 角色页记忆/权限分区在真实服务上的截图（现由 9+7 条渲染/纯函数测试覆盖）；
  ③ 真实模型调用 0 次（本轮用假 ACP peer fixture，不需要模型；真实 UI 门按 R-0011 归下一单）。
- 提交：`P21 real-env run`（pathspec：两个 e2e 驱动 + evidence/P21-read-faces/** + 本文件）。

## P21 计数更正（2026-09-18，补装 Electron 之后复跑）

检查点报告里的 vitest 数字是 **electron 二进制缺失时**的计数；补装后同一命令复跑，结果更好且更准：

| 项 | 检查点报告（无 electron 二进制） | 复核（有 electron 二进制） |
| --- | --- | --- |
| vitest 文件 | 985：**978 passed / 5 failed** / 2 skipped | 985：**981 passed / 2 failed** / 2 skipped |
| vitest 用例 | 10205：**10195 passed / 4 failed** | 10231：**10221 passed / 4 failed** |
| 失败文件 | 5（3 个 0-test 因 `getElectronPath` + 回环监听 3 条 + live 重试 1 条） | **2**：`electron/host-capabilities/credentials/mcp-oauth-callback-ipc.test.ts`（3 条回环监听）、`electron/legacy-hermes/api-transport.test.ts`（1 条 live 重试）——都在 `\|electron\|` 项目、都与 P21 的改动面（`src/**`、`e2e/**`）无交集，性质是宿主/网络基线 |
| eslint 全树 | 16 errors / 181 warnings | **16 errors / 185 warnings**（errors 不变，全是 P21 未触碰的 12 个文件；warnings +4 来自本单测试里的 `document`） |
| eslint 本单文件 | 0 errors / 23 warnings | 0 errors / 23 warnings；**两个新 e2e 驱动：0 problems** |

- `tsc`（三项目）与 `build` 在最终态仍为 exit 0（阶段 4 已跑，其后只改渲染逻辑、e2e 驱动与文档；类型与构建面未变）。
- 结论不变：**P21 的改动面全绿**；剩余失败与 lint 红是既有基线，已在检查点报告 §2 ④ 里作为待拍项登记。

## P21 阻塞登记（按"需要人拍的标成阻塞"要求，2026-09-18）

以下四项**是阻塞**（本执行者无权解除，且各自下游工作等它们）：

| # | 阻塞项 | 阻塞了什么 | 谁能解 |
| --- | --- | --- | --- |
| B1 | **合并回主树**：`checkpoint/Q1` 的 sha 待批 | 主树看不到合同与四个面；本树后续单的 baseline 也停在旧值 | 用户批（prefs：合并=ask，不可豁免） |
| B2 | 后端 `providerArtifacts.install` 参数表与 handler 不一致（handler 读 `params["digest"]`，参数表把它当 unexpected 拒） | 该方法在真实后端上**无可用调用形态**；合同里保留 `digest` 与 handler 一致，但联调会撞上 | 后端改自己的 `_PARAM_SHAPES`（本树禁写后端仓） |
| B3 | **两仓摘要未锁定**：本树交出 TS `6e8ae84a…` / 工件 `f5d27269…`，后端登记值仍停在 `b284f70c` 的 `64dc9961…`/`42a164a4…` | 合同虽两端可达，但"锁定"这个事实不成立；且工件哈希跨工具链不可复现，必须交**工件本体** | 后端按本树工件重新登记（调度者转交） |
| B4 | 全树 eslint 16 errors（12 个 P21 未触碰文件） | `lint` 门长期红，会掩盖将来真正的新错误 | 用户/调度者拍一张 lint 卫生单（或批准一次 `eslint --fix`） |

**不阻塞但未做**（已在"不含糊"与真实环境证据里写明）：执行清单卡带真实行的截图、角色页记忆/权限分区在真实服务上的截图、
真实模型调用（0 次）。这三项都需要**支持 placement 的宿主**（Windows + WSL，即既有验收驱动那台），按 R-0011 归"P21 之后的真实 UI 门"。

## P21 阶段边界重读的如实记录（过程检讨）

- **做了两次全量重读**：① 开工（阶段 1 提交前）读齐章程 §5 的六份（本树章程/工单目录、主树 README §3§4、
  manifest、status、rulings、prefs）；② 收口（阶段 4b 之后、打 tag 之前）重读同样六份。
- **没做的**：阶段 2/3/4 各自提交前没有再重读一遍。这段窗口里后端侧实际变动的是
  `status.md`（15:20）、`rulings.md`/`prefs.md`（15:07）——**在收口重读时已全部纳入**，
  R-0011（真实模型调用授权）正是那次收口重读发现的，并立刻改变了本单 DoD-3 的可执行性（见"追加"节）。
- **教训（写下来给下一单）**：重读的成本远低于错过一条改向的成本；本单靠"收口那次"补上了，
  但正确做法是每次阶段提交前扫一眼 `rulings.md`/`prefs.md`/`status.md` 的尾部（三份都短）。

## P22 阶段 1（2026-09-18）：五处写路径的合同签名与类型化码核对 — `P22_STAGE1_AUDIT`

- **阶段边界重读**（章程 §5）：本树章程（新增"队列不空规则"：做完无下一张就写 `QUEUE_EMPTY_AT <日期>`）+
  `work-orders/`（P22 已投递，baseline `8fc1a807`）+ 主树 `README.md`/`manifest.json`/`status.md`/`rulings.md`/`prefs.md`
  （README/rulings/prefs 自上次重读未变；status 尾部新增 `next_batches_2026-09-19`，列了前端 Q2 的五项）。
- **产出**：`evidence/P22-contract-audit.md`——五面逐方法的 params/result 签名（取自本树合同）与
  **内部类型化码**（取自后端实现文件，不是 wire-review 转述），以及每面的产品面设计与"不可用"判定表。
- **发现一条后端事实（登记，不改后端仓）**：`server.hello` 的能力表由静态 `CAPABILITY_IDS`
  （`wire/handlers.py:34-62`）生成，**不含** `assets.*`/`hooks.*`/`accounts.*`/`profiles.clone|memory|setPermissions`/
  `workspaces.gitStatus`/`executions.list`/`providerArtifacts.*`——即"实现了但没声明"。
  若照 `wireCapability()` 的 fail-closed 门控，本单五面会永久灰显，而真因是表陈旧。
  ⇒ 本单对这些增量面**不**用能力行做开关，改用可观测门：服务就绪 + 该面读成功 + 每次写的类型化回执
  （理由与反例写进审计 §5.0，**不是放宽验收**：不可用面仍必须点不出请求）。
- **错误呈现统一**：抽 `lib/wire-error-text.ts`（`FAMILY: message [internalCode]`），五面共用，不再各造格式。
- 提交：`P22 stage 1`（pathspec）。

## P22 阶段 2（2026-09-18）：角色页写路径（克隆 + 权限规则） — `P22_STAGE2_ROLE_WRITES`

- **新增合同调用**（`application/profile/wire-profile-writes.ts`）：
  `cloneAgentBoxProfile` → `profiles.clone`（家族未变时**不发** `harness`，让服务自己决定），
  `setAgentBoxProfilePermissions` → `profiles.setPermissions`（带调用方 `expectedVersion`）。
- **界面**：
  - 角色头部新增"克隆"按钮：服务不可用时**灰显并带原因**（G2），可用时开 `CloneProfileDialog`
    （新名 + 家族下拉；家族不变则不下发）→ 成功后**在对话框里显示逐项迁移报告**
    （`items[].migrated/reason`、`migratedCount/refusedCount`、`reboundAssets`）；拒绝时显示类型化码且**本地零变化**。
  - 权限分区从"只读行"升级为 `ProfilePermissionEditor`：预设输入（带建议列表，**不当闭集**）、
    规则行（工具键/模式/动作）增删、保存；**顺序原样提交**（最后匹配生效）；`disabled` 时**提交点不出请求**。
- **错误呈现**：新增 `lib/wire-error-text.ts`（`FAMILY: message [internalCode]`），本单五面共用；
  `details.internalCode` 由后端 `WireError.from_server_error` 写入（`wire/errors.py:117-125`，第一手核对）。
- **测试**（新增 4 文件 / 14 例，全绿）：
  - `wire-error-text.test.ts`：带/不带 internalCode、本地错误不被包装成服务答复。
  - `wire-profile-writes.test.ts`：两方法的参数与 `requestId` 生成、家族省略、CAS 版本透传。
  - `clone-profile-dialog.test.tsx`：报告逐条显示、家族仅在变化时下发、**类型化拒绝时零本地变化**。
  - `profile-permission-editor.test.tsx`：顺序原样、增删不重排、**G2：disabled 时不发请求**、拒绝后保留草稿。
  - 既有 `src/features/profiles` 8 文件 / 73 例仍全绿（`permissionEditor` 为可选 prop，未破坏 P17 语义）。
- **环境插曲（如实记）**：会话早期那个后台 `npm install` 被系统回收时把本仓 `node_modules` 带走了
  （`vitest` 一度无法加载）；已重装（`node_modules` 不入库、无仓库文件受损），并重新解出
  `electron` 二进制到 `node_modules/electron/dist`（`/tmp/electron.zip` 仍在，未重新下载）。
- 提交：`P22 stage 2`（pathspec）。

