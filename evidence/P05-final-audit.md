# P05 最终客户端审计（只读）— 28 RPC 矩阵、事件链、fixture 与 legacy 可达性

日期：2026-09-14。审计起点/终点 HEAD `6ca5d17aff32d0f984fccd90cd507c98994bfe96`（分支
`feature/agentbox-desktop-product`，工作树 clean，`git diff --check` exit 0）。本阶段只做只读审计、
定向运行既有测试与文档收口：未修改任何 TS/TSX、测试、schema、合同、Electron、preload、package/lock
或后端文件；未运行完整 9600+ 套件、未跑 Windows、未运行模型、未读密钥。

本文件是本轮审计的权威结论。判定规则采信用户派单口径：**凡用户从 AgentBox 产品正常界面、不经过
明确 legacy 产品选择即可触达 Hermes gateway/API 的路径，都属于 `ACTIVE_AGENTBOX_BLOCKER`**；
"共享外壳"不自动等于允许保留。

## 0. 结论摘要

| 项 | 结论 |
| --- | --- |
| 28 RPC 方法矩阵 | **完成**：`WireMethods` 28 键 ↔ 矩阵 28 行集合全等（无遗漏/重复/多余），28/28 有真实生产调用者，矩阵状态计数 28 `PRODUCTION_REACHABLE` 与表内逐行一致 |
| wire-v1 摘要 | **三方一致**：TS 权威 `11e3b3e7…c10035`、生成工件 `5d4fa3bf…5e4ed`，与后端 `wire-review.md` 12:15 登记逐字节相同；生成工件可由 TS 权威按文档命令逐字节复现 |
| 事件流生产链 | **前端路径完成**：subscribe → preload → main sender-owned → main-only token/WS → 帧 schema → reducer → gap 补水重订阅 → route/will-quit cleanup 全部为生产接线 |
| P07 检查点 3 fixture | **部分完成**：§9 九组编号齐全且核心行为有真实行为测试；三处深度缺口（见 §3） |
| legacy Hermes 可达性 | **未通过**：存在 5 条 `ACTIVE_AGENTBOX_BLOCKER`（B1–B5）与 1 条已上膛但当前无数据源的 B6 |
| 阶段状态 | P05 保持 **PARTIAL / IN_PROGRESS**，阶段标记 **`CLIENT_MATRIX_COMPLETE_LEGACY_CLOSEOUT_REQUIRED`** |
| P05_CLIENT_GREEN | **不得声明**（已证明相反事实） |
| REAL_FLOW_VERIFIED / P06 GREEN / DESKTOP_IMPLEMENTATION_READY | **不得声明** |
| writer_lease | 保持 **ACTIVE** |

> **2026-09-14 后续增量（已实施）**：本表记录的 legacy 可达性与阶段标记是**审计当时**的事实；
> B1–B6 已按其后的收口检查点关闭（结构门 `f7759148`、面迁移 `a6b751ff`），B7 与其后的 transport/
> fixture/账本项已由 **§11** 的最终收口关闭；新发现残留（B8/B9）见 **§10.4** 与 **§11.5**。
> 本表"P05_CLIENT_GREEN 不得声明"一行记录的是**审计当时**的判定，最终判定以 §11.3 为准。
> 本文件 §1–§9 保持审计当时原样，不回填。

一句话：**28 个 wire 方法的客户端接线确实完整，但"产品已完成"不成立**——AgentBox 正常产品外壳里仍有
5 条不经任何 legacy 选择即可触达 Hermes REST 数据的路径，其中 4 条还会经 lazily 启动门拉起 legacy
Hermes 运行时。方法矩阵完成与产品完成必须分开记账。

## 1. 28 RPC 机械矩阵结论

### 1.1 机械集合与计数（主执行者实跑）

```bash
# 从 WireMethods 机械导出键、从矩阵抽取首列方法名，排序后比较
node -e '…'   # 见 §8 命令表
```

| 核验 | 结果 |
| --- | --- |
| `WireMethods` 键数 | **28**（`apps/desktop/src/types/wire/wire-v1.ts:896-925`） |
| 矩阵数据行 | **28**（`evidence/P05-client-matrix.md:113-140`），去重后仍 28 |
| 矩阵缺失 / 多余 / 重复 | **0 / 0 / 0**；排序后集合全等 `true` |
| 逐行状态计数 | `PRODUCTION_REACHABLE` **28**，其余状态 0；与表格声明 `:146`、合计 `:151` 一致 |
| 生成工件交叉核对 | `generated/wire-v1.schema.json` 含 28×2 方法 schema 对；方法名集合与 `WireMethods` 全等 |

### 1.2 逐方法生产调用者（子代理 A 全量核对，主执行者抽验一致）

28/28 均有非测试生产调用者；**没有任何方法**只被测试调用、只被死导出引用或只在未注册 IPC 通道后。
产品面挂载点：`AgentBoxChatView`（`app/composition/registrations/surfaces.tsx:113`）、
`SidebarSurface`→`ChatSidebar`（同文件 `:48`）、`ProfilesView`（`features.tsx:1266` 覆盖层）、
`AgentBoxModelSettings`（`features.tsx:1200`→`features/settings/product-settings.tsx`）、
`WslWorkspaceWizard`（`chat-sidebar.tsx:1642`）、快捷键（`app/composition/registrations/keybindings.ts:230-231`）。

调用者链与矩阵登记一致（文件身份全部命中；矩阵登记的**行号已陈旧**，见 §7 文档偏差 D1）。

### 1.3 能力门 / 服务状态门 / typed failure / 重复·迟到·CAS 证据

| 类别 | 方法 | 证据 |
| --- | --- | --- |
| hello 能力门 + 服务 ready | `workspaces.open/list/browse/archive`、`profiles.*`、`providerModels.*`、`config.resolve`、发送三件套（`sessions.createAndSend`/`sessions.send`/`sendOutcome.query`）、`sessions.update/archive` | `wireCapability` 缺行即 `supported:false`（`api/wire-v1-client.ts:133-141`；`store/agentbox-service.ts:46-48`）；发送面 `agentbox-main-chat.ts:256-274` |
| **无**逐方法 hello 门 | `config.describe`、`sessions.switchProfile`、`queue.get`、`queue.withdraw`、`runs.stop`、`approvals.decide`、`history.snapshot` | 读码确认；这些面只受服务 ready/会话存在约束 |
| typed failure | 全部 | `WireRemoteError` 带 `code/current/details`；传输层失败统一 `WireUnavailableError`（`wire-v1-client.ts:46-58,94-99,111-113`）；信封 id 不符直接拒绝（`:107-109`） |
| CAS（`expectedVersion`） | `profiles.update/updateConfig/archive`、`providerModels.update/archive`、`workspaces.archive`、`sessions.update/archive`、`sessions.switchProfile`、`queue.withdraw`、`approvals.decide` | 各 application seam（见矩阵 §1 逐行） |
| 重复 / 未知结果 | 发送面 | pending 意图先落盘再传输、复用原 `requestId`、`WireUnavailableError → unknown` 保留身份（`application/session/wire-send.ts:83-90,144-186`） |
| 迟到保护（版本单调） | store 与各 seam | `store/agentbox-service.ts:65-76`、`wire-session-catalog.ts:29-37`、`wire-composer-profile.ts:93,99`、`use-composer-profile.ts:169,203`、`agentbox-main-chat.ts:214` |
| 队列终态 | `queue.updated` | 仅采纳已应用且连续的帧；四终态移除活动投影（`wire-session-control.ts:21,132-145`） |

### 1.4 死接线 / 仅测试引用（不计入生产接线，记录备查）

- `planWireReconnect`（`application/session/wire-reconnect-plan.ts:17`）仅被 `types/wire/fixtures/core-v1.test.ts:267` 引用，无生产调用者。
- `unavailableAgentBoxWireDispatcher`（`electron/security/agentbox-wire-transport.ts:98`）全仓无导入者；生产在 `electron/main.ts:808` 注册真实 HTTP transport。

矩阵对此二者未作生产声明，**不构成矩阵错误**，但应避免在后续文档中被当作生产接线引用。

## 2. 事件链与外部 lifecycle 边界

### 2.1 生产链逐跳（全部为生产接线）

| 跳 | 实现 | 生产性 |
| --- | --- | --- |
| renderer subscribe | `app/composition/wiring/agentbox-main-chat.ts:302-381`（需非空 `sessionId`、hydration 得到 `resumeCursor`、`!needsResync`） | 是（`useAgentBoxMainChat`，挂载自 `AgentBoxChatView`） |
| preload IPC | `electron/preload.ts:18-35`（`request`/`subscribeEvents`/`on('agentbox:wire:event')`，`{sessionId,cursor}` 为唯一输入） | 是（`contextBridge` 生产桥） |
| main sender-owned 订阅 | `electron/ipc/workcore-wire-ipc.ts:84-204`（按 `webContents.id` 持有 cleanup、陈旧帧丢弃、`destroyed` 清理、幂等退订） | 是（`main.ts:807-810` 注册，`:812` will-quit 释放） |
| main-only token/WS | `composition/agentbox-service-composition.ts:31,58`（收口 closure）；WS `security/agentbox-wire-event-transport.ts:87-179` | 是 |
| 帧 schema 校验 | renderer `EventFrameSchema.safeParse`（`agentbox-main-chat.ts:340`），非法帧静默丢弃，再校验 Session 归属；main 只转发 `unknown` | 是 |
| reducer | `agentbox-main-chat.ts:350` → `wire-session-control.ts:117-148` → 纯函数 `wire-session-projection.ts:62-160`（eventId 去重、连续性） | 是 |
| seq gap → 快照/重订阅 | `agentbox-main-chat.ts:352-363`（先退订再 hydrate，取新 `resumeCursor` 重订阅）；`resync_required` 二次干净快照，持续失败标 `needsResync` 并阻止订阅（`:310`） | 是 |
| route 卸载 / will-quit cleanup | renderer effect cleanup `agentbox-main-chat.ts:376-380` → preload 退订 → `removeSubscription` → WS close；`main.ts:812` will-quit | 是 |

**已核对的安全事实**：token 只存在于 main 闭包，只进入 HTTP `authorization` 头与 WS upgrade header
（`agentbox-wire-transport.ts:68`、`agentbox-wire-event-transport.ts:119`）；renderer 类型不含
endpoint/token（`src/global.d.ts`）。WS 有 loopback 限制（`agentbox-wire-event-transport.ts:26-65`
`isLoopbackHost`）。

### 2.2 外部 lifecycle 边界（唯一外部缺口）

- `electron/composition/agentbox-service-composition.ts:31`：`activeConnection` 初始 `null`；
  `connectionSlot.install` 在生产**无任何调用者**（全仓 grep 确认）。
- `electron/workcore/slot.ts`：生产无安装者（仅测试），注释自述 "intentionally unpopulated"。
- 由此 28 个方法与事件流的**真实运行终态**统一属于同一 `EXTERNAL_LIFECYCLE_BLOCKED`，不是 28 个前端缺口。
- 缺口内容（后端侧）：Server artifact 解析、发现/动态端口公告、readiness 判据（同一 session token）、
  token 文件 ACL、进程 owner 与退出期限、以及在 readiness 后调用
  `connectionSlot.install({endpoint, sessionToken})`。

**两处需要如实记录的边界质量差异（本轮新发现，主执行者读码确认）**：

1. **HTTP 空连接是诚实的**：抛 `AgentBoxWireHostUnavailableError`（`UNAVAILABLE`，
   `agentbox-wire-transport.ts:57-59,98-100`）。
2. **WS 空连接是不诚实的**：`agentbox-wire-event-transport.ts:103-105` 在无连接/无 token 时返回
   **静默 no-op unsubscribe**，不发任何信号；生产组合未传 `onError`
   （`agentbox-service-composition.ts:50-53`），因此"事件源不可用"在 renderer 侧完全不可见。
   矩阵 §4/§6 与 P04 切片 7 的"honest unavailable"表述对 WS 不成立。
3. **HTTP dispatcher 无 loopback 限制**：`requestUrl`（`agentbox-wire-transport.ts:29-43`）只校验
   protocol/credentials/same-origin/`/wire/v1/` 前缀，**不校验 host**；status.md 中"限制 loopback"
   只对 WS 成立。当前 slot 为 null 因此无实际暴露，但 lifecycle 接线后该断言不成立，
   应在接线同批收紧（见 §6 不变量 I5）。

## 3. P07 检查点 3 行为 fixture 覆盖矩阵

§9 九组编号在 `src/types/wire/fixtures/core-v1.ts:87-97` 齐全，执行验证
`src/types/wire/fixtures/core-v1.test.ts`（10 个 `it`）。该文件**不是**只验 schema parse：它驱动纯重放
reducer、能力门、真实 `WireV1Client`+脚本化 transport（幂等重放、`CONFLICT_REQUEST`、`unknown`）与
严格帧反例；但场景 04/09 的部分断言是单字段 schema parse。

| 派单要求 | 覆盖位置 | 判定 |
| --- | --- | --- |
| create-and-send **accepted** | `wire-send.test.ts:59`、`agentbox-composer.test.ts:49,75`、fixture `core-v1.test.ts:96` | 真实行为 |
| create-and-send **rejected** | `wire-send.test.ts:130`、`agentbox-composer.test.ts:451` | 真实行为 |
| create-and-send **unknown** | `wire-send.test.ts:77`、`agentbox-composer.test.ts:424` | 真实行为 |
| 同 requestId outcome query（不重发） | 同上 + `wire-send.test.ts:153`；fixture `core-v1.test.ts:104-140` | 真实行为 |
| queue **终态** | `wire-session-control.test.ts:149` `it.each(['completed','failed','cancelled'])` 终态移除活动项；`:139` `withdrawn` | 真实行为（含三终态） |
| `stop_requested` 与终态事件 | `wire-session-control.test.ts:94`（请求≠已停）、`:115`（unconfirmed 保持运行）、`:126`（传输失败→unconfirmed）；终态事件 `core-v1.test.ts:278-289`（仅 `failed`） | 真实行为 |
| approval / version conflict | approval 保留至服务事件 `wire-session-control.test.ts:187`、重放不重复决定 `core-v1.test.ts:200-218`；版本冲突行为见 sessions/profiles/workspaces 各测试 | 部分：approval **invalid/过期/内容变更/取消**无行为测试 |
| history snapshot/resume/resync | `wire-session-control.test.ts:220`（过期游标→干净快照，断言恰 2 次调用）、`:261`（如实保留 resync 态）、`:156`（去重+gap）；生产 gap 路径 `agentbox-main-chat.ts:352-363` + `agentbox-main-chat.test.tsx:163,254,311,352` | 真实行为 |
| 不得只验证 schema parse | fixture 混合纯函数/客户端层真实行为；**产品面行为在 application/feature 测试中**，fixture 本身不挂载产品面 | 满足，但层次需如实标注 |

**未覆盖缺口（只登记，本阶段不修）**：

1. §9.5 "正常完成继续队列"（完成后下一项被派发）无测试；只有终态移除。
2. §9.6 approval 失效族（过期/内容变更/取消 → `invalid`）无行为测试。
3. §9.8 "Server 重启先核对"无 fixture；`execution.state` 只验了 `failed`，`completed`/`cancelled`
   清 `$agentBoxStopStates` 的转移（`wire-session-control.ts:125-130`）无测试。
4. §9.9 是 schema 级秘密拒绝，非"远端工具清理"证据（该义务本属服务端）。

## 4. legacy Hermes 可达性逐链清单

### 4.1 两道自动启动门：确实关闭（已核验）

| 门 | 证据 | 状态 |
| --- | --- | --- |
| renderer | `app/composition/wiring/features.tsx:778` 硬编码 `legacyGatewayAutostart: false` → `use-gateway-boot.ts:188-203` 关闭全部 gateway、`setPrimaryGateway(null)`、`setSessionsLoading(false)`、`completeDesktopBoot()`，并在读取 `window.hermesDesktop` **之前** return | **关闭** |
| Electron 窗口生命周期 | `electron/app/product-runtime-policy.ts:3`（仅 `legacy-hermes` 允许）→ `bootstrap-env-composition.ts:7194` 以 `'agentbox'` 调用，`startHermes()` 0 次 | **关闭** |

### 4.2 但 `hermes:api` 惰性门不受这两道门保护（根因）

`src/api/client.ts:96-98` `window.hermesDesktop.api` → `electron/preload.ts` `'hermes:api'` →
`electron/ipc/api-proxy-ipc.ts:36-64` `registerApiProxyIpc` → `handleHermesApiRequest`
（`api-proxy-composition.ts:1322-1372`）→ `ensureBackend(routeProfile)`
（`bootstrap-env-composition.ts:5570-5589`）→ `route.backend === 'primary'` 时
**`await startHermes()`**。

`startHermes()`（`bootstrap-env-composition.ts:6359+`）**不读取产品 runtime 策略**
（全仓仅 `:7194` 一处消费该策略）：任何 renderer `hermesApi()` 调用都会启动/回收 legacy Hermes 后端。
因此 P04 切片 5 的"正常冷启动对 legacy starter 调用 0 次"只对**急切启动**成立，对**惰性 REST 门**不成立。

### 4.3 逐链记录

分类口径：`A`=ACTIVE_AGENTBOX_BLOCKER，`U`=UNREACHABLE_OR_UNMOUNTED，
`H`=HOST_CAPABILITY_NEUTRAL，`E`=EXPLICIT_LEGACY_COMPAT_ALLOWED。

| # | 用户如何触达 | 生产挂载/调用链 | 生效条件 | 数据面 | 分类 |
| --- | --- | --- | --- | --- | --- |
| B1 | **无需操作**：状态栏默认开启（`store/statusbar-prefs.ts:19` 默认 `true`），挂载即轮询、每次窗口聚焦立即刷新 | `app-composition.tsx:931` `{statusbarVisible && <WiredPane part="statusbar"/>}` → `registrations/surfaces.tsx:62-78` `StatusbarSurface` → `features/runtime/use-status-snapshot.ts:44-60,103` `getStatus()` → `api/config.ts:19-24` → `hermesApi` → `hermes:api` → `ensureBackend`→`startHermes` | 仅 `visibilityState==='visible' && hasFocus()`；**不查** `$gatewayState` | legacy `GET /api/status`（并拉起 legacy 运行时） | **A** |
| B2 | ⌘K / ⌘P（`lib/keybinds/actions.ts:101` 默认键位），或 Settings 搜索 | `features.tsx:1192` 常挂 `CommandPalette` → `host.tsx:27-45`（打开时挂载 body）→ `registrations/command-palette/body.tsx:203-206` `useQuery({queryFn: () => listAllProfileSessions(200,1,'exclude')})`（无 `enabled` 门） → `application/session-lists.ts:69-84` → `api/sessions.ts:96-117` → `hermesApi` | 打开命令面板 | legacy `GET /api/profiles/sessions` | **A** |
| B3 | 侧栏搜索框输入任意非空串 | `SidebarSurface`→`ChatSidebar`（`surfaces.tsx:48`）→ `chat-sidebar.tsx:438-469`（200ms 防抖后 `:451` `searchSessions(trimmedQuery)`）→ `api/sessions.ts:325-329` → `hermesApi` | `showSessionSections`（`chat-sidebar.tsx:1227-1232`）= 有骨架/筛选/会话/本地项目行/WSL 行之一；`$sessionsLoading` 默认 `true` 使其瞬时成立，加入任一项目或 WSL 工作区后长期成立。**不查** `$gatewayState` | legacy `GET /api/sessions/search?q=` | **A** |
| B4 | 侧栏筛选菜单 → "Archived"（`filter-menu.tsx:403-405`） | `chat-sidebar.tsx:1153-1157` effect `if (showArchived) void loadArchivedSessions()` → `store/sidebar-archive.ts:15-31` → `application/session-lists.ts` → `api/sessions.ts` → `hermesApi` | `showArchived` 为真；筛选菜单与 B3 同一可见条件 | legacy `GET /api/profiles/sessions?...archived=only` | **A** |
| B5 | 侧栏空态 "Open folder"（`chat-sidebar.tsx:1617`）或 File>Open Folder / ⌘O（`app/composition/bridges/desktop-integrations.ts:368`） | `store/projects/worktrees.ts:288` `refreshProjectTree()` → `store/projects/refresh.ts:149-154`（`$profileScope===ALL_PROFILES` 分支）→ `:167-192`（`:172-175` `hermesApi`） | `$showAllProfiles` 已被持久化为 `true`（`store/profile/sidebar-scope.ts:31`；产品侧过滤菜单该项仅在 `profileNames.length>1 || showAllProfiles` 时显示，故只有**迁移自旧安装**的用户会命中） | legacy `GET /api/profiles/projects/tree` | **A**（条件性：需已持久化标志） |
| B6 | 未匹配的**本地** shell 工作区行展开 | `features/chat/sidebar/workspace-list/workspace-list.tsx:150-166`：未匹配行走 legacy 预览渲染，匹配行走 `AgentBoxSessionList`（服务权威，无回落） | 需要 `$sessions`/`$projectTree` 有数据；当前无 AgentBox 写入者，故**当前不触发** | legacy 预览投影 | **U（已上膛）**：一行写入者即可变成 A，应与 B1–B4 同批加门 |
| — | 批量会话清单刷新（`application/session-lists.ts`→`api/sessions.ts`→`api/client.ts`） | `use-session-list-actions.ts:122-247` 仅由已禁用的 `useGatewayBoot`、`useBackgroundSync`（`background-sync.ts:614-621` 非 open 即返回）、`useDesktopIntegrations` 的 BroadcastChannel（仅 legacy 流程会广播）与 legacy 会话动作调用 | 需要 `$gatewayState==='open'`；产品路径无写入者（`atoms.ts:111` 初值 `idle`；`registry-state.ts:416` 只在活 gateway/激活时写） | legacy | **U** |
| — | 进入工作区后的会话钻取 | `chat-sidebar.tsx:807` `useEnteredProjectSessions(..., gatewayReady, ...)` → `use-entered-project-sessions.ts:27-32` | 需 open | legacy | **U** |
| — | 项目树 / PR / 仓库扫描副作用 | `chat-sidebar.tsx:540,549-584,604-612,681-718`；`projects/refresh.ts:100-143`、`projects/gateway.ts:71-87`→`ensureActiveGatewayOpen()` 返回 null primary | 均以 `gatewayReady` 为前置 | legacy | **U** |
| — | 旧 Profile 对话框/侧栏角色轨道 | `features/chat/sidebar/profile-switcher.tsx` 及 `use-profile-rail-*` **零生产导入者**（仅测试） | — | legacy | **U** |
| — | 旧模型浮层 / 会话选择浮层 | `features.tsx:1175-1188` 挂载，但 `$gatewayState!=='open'` 时 `return null` | 需 open | legacy | **U** |
| — | legacy pin 镜像 | `app-composition.tsx:482` `watchSessionPins()`；仅当 pin id 命中已加载行才 PATCH；`$sessions` 等为空 | 需有 legacy 行 | legacy | **U** |
| — | `requestGateway` | `components/hooks/use-gateway-request.ts:127-129` 无 gateway 即抛 `Hermes gateway unavailable`，**无惰性拨号** | — | — | **U**（诚实失败，非 blocker） |
| — | hermes-bots 插件 | 随包激活（`extension/contrib/plugins.ts`），但 pane 注册被注释（`plugins/hermes-bots/plugin.tsx:375-387`）；relay 在 <2 连接时 no-op（`relay.ts:264-276`） | — | legacy（无触发点） | **U** |
| — | 产品 Settings | `features/settings/index.tsx:17-27` + `product-settings.tsx` + `agentbox-model-settings.tsx`；legacy 视图经 `settings-navigation.ts:17-28` 重定向到 `product:*`（`connections`→`product:harnesses`、`gateway`→`product:harnesses`） | — | AgentBox wire | **U**（legacy 入口不可达） |
| — | WSL 工作区宿主服务 | `api/workspace.ts:25-77` → preload `wslWorkspace` IPC | — | 宿主能力 | **H** |
| — | 本机文件/git/终端/窗口 | `lib/desktop-fs.ts:109-186` 走 Electron IPC；REST 镜像仅 `isDesktopFsRemoteMode()` 时使用（产品路径无远程 legacy 连接） | — | 宿主能力 | **H** |
| — | 更新/通知/HUD/pet/quick-entry/i18n/键位/外观 | Electron 或 renderer 本地 | — | 无 Hermes 数据面 | **H** |

**`EXPLICIT_LEGACY_COMPAT_ALLOWED` 生产条目：0**。当前没有任何产品入口让用户显式选择 legacy 产品
（`legacyGatewayAutostart` 是 composition 常量，产品内无处置真）。因此凡可达者按派单规则一律为 blocker，
其余为死代码或已门控代码。

### 4.4 与既有文档的口径矛盾（按实际可达性裁决）

- `evidence/P05-client-matrix.md` §5 结论"**AgentBox 产品主路径不含 Hermes 专属控制流**"**不成立**。
  正确表述应为：**主 route 的聊天面确实只有 AgentBox 面**（`ChatCard` 仅 `AgentBoxChatView`），
  但**共享外壳**（状态栏、命令面板、侧栏搜索/归档）存在 4 条不经 legacy 选择的 Hermes 数据面路径。
- 该节同时正确记录"侧栏会话列表部分迁移"与 `$gatewayState==='open'` 条件——**该条件对批量会话树成立**，
  但**不能推广到 B1–B4**：B1–B4 根本不查该状态。这解释了为什么"28/28 RPC 可达"与"legacy 仍可达"可以同时为真。
- 用户派单提到的"§5"不存在于本工作树 `docs/`（`status.md` 的小节名为 执行快照/测试与基线/工单状态/
  测试与证据基线）。实质矛盾落在 `evidence/P05-client-matrix.md` §5 与 `status.md:419,234`，均已在上表裁决。

## 5. 带注解的产品调用目录树（实测）

```text
Renderer shell（产品唯一外壳）
├── StatusbarSurface              app/composition/root/app-composition.tsx:931 → surfaces.tsx:62-78
│   └── useStatusSnapshot         features/runtime/use-status-snapshot.ts:44-60
│       ├── getStatus()           ── legacy REST /api/status ──────────────► B1 BLOCKER
│       └── evaluateRuntimeReadiness(gatewayState==='open' ? …)  ── 已门控（不触发）
├── CommandPalette                wiring/features.tsx:1192（常挂）
│   └── body.tsx:203-206          listAllProfileSessions(200,1,'exclude')
│                                 ── legacy REST /api/profiles/sessions ──► B2 BLOCKER
├── SidebarSurface → ChatSidebar  surfaces.tsx:48 → features/chat/sidebar/chat-sidebar.tsx
│   ├── 搜索框                     :1287-1297（showSessionSections 时渲染）
│   │   └── :438-469              searchSessions(q) ── legacy REST ────────► B3 BLOCKER
│   ├── 筛选菜单 → Archived        filter-menu.tsx:403-405
│   │   └── :1153-1157            loadArchivedSessions() ── legacy REST ───► B4 BLOCKER
│   ├── 会话树/项目树/PR 副作用      :540,549-584,604-612,681-718（gatewayReady 门）── U 不触发
│   └── 工作区展开                 workspace-list.tsx:150-166
│       ├── 匹配服务 Workspace → AgentBoxSessionList（wire 权威，无 legacy 回落）✔
│       └── 未匹配本地行 → legacy 预览（当前无写入者）───────────────────► B6 已上膛
├── AgentBoxChatView              surfaces.tsx:113（唯一聊天面）
│   └── useAgentBoxMainChat       wiring/agentbox-main-chat.ts
│       ├── catalog/history/queue/stop/approval … ── wire-v1 RPC（28/28 生产可达）✔
│       └── event ingest          :340-381（schema→reducer→gap 补水→cleanup）✔
├── ProfilesView / AgentBoxModelSettings   features.tsx:1266 / :1200 ── wire-v1 ✔
└── WslWorkspaceWizard            chat-sidebar.tsx:1642 ── 宿主 discover + wire browse ✔

Data plane（两条，互不相通）
├── AgentBox wire-v1 ✔
│   application 用例/port → api/wire-v1-client.ts → preload window.agentBoxDesktop.wire
│   → ipc/workcore-wire-ipc.ts → security/agentbox-wire-{transport,event-transport}.ts
│   → connection slot（当前 null；HTTP 诚实 UNAVAILABLE，WS 静默 no-op）
└── legacy Hermes ✘（本应仅在显式 legacy 分支）
    api/*.ts → api/client.ts:96-98 window.hermesDesktop.api → 'hermes:api'
    → ipc/api-proxy-ipc.ts:36-64 → handleHermesApiRequest → ensureBackend → startHermes()
    ↑ 不受 renderer/Electron 两道 autostart 门约束：B1–B5 由此触达
```

## 6. ACTIVE_AGENTBOX_BLOCKER 的后续最小写集、接口与不变量

原则：**先立结构性门（W4），再逐面迁移（W1–W3），最后收 B5/B6**。W4 先落地可把 B1–B4 立刻变成
"诚实不可用"，避免"迁移期间仍然触达"；但 W4 之后这些面会失去现有真实数据，故 W1–W3 必须同批给出中立来源。
写集互不重叠，可并行；共享文件（`chat-sidebar.tsx`）只属于 W3 一个写者。

| 写集 | 文件（精确） | 接口 | 不变量 | 建议验收 |
| --- | --- | --- | --- | --- |
| **W4 结构门**（先做） | `apps/desktop/src/api/client.ts`（`requestHermesApi` 前置策略）；`apps/desktop/electron/ipc/api-proxy-ipc.ts` 或 `composition/api-proxy-composition.ts`（main 侧同判） | 新增纯函数如 `hermesApiAllowedFor({runtime, explicitLegacy})`，runtime 由既有 `DESKTOP_PRODUCT_RUNTIME` 语义注入（不新造第二套 runtime 常量）；拒绝时抛既有 typed 错误文本而不是静默 | I1：产品 runtime 下 `hermes:api` **零调用**直达 `ensureBackend`；I2：显式 legacy 分支行为逐字不变；I3：拒绝必须可被 renderer 呈现（不静默） | 新增行为门：产品 runtime 下各 entry 调用次数 0、显式 legacy 下不变；定向重跑 `src/api` + `electron/ipc` 既有测试 |
| **W1 状态栏** | `apps/desktop/src/features/runtime/use-status-snapshot.ts`；`app/composition/registrations/surfaces.tsx:62-78` | 由调用方注入 status 来源（AgentBox 侧端口或 `null`），hook 不自行决定去 `hermesApi` | I4：状态栏不因挂载/聚焦发起任何 legacy REST；无来源时显示真实"不可用"，不伪造健康 | `use-status-snapshot` 行为门：注入 null 时 `getStatus` 0 次且状态如实 |
| **W2 命令面板** | `app/composition/registrations/command-palette/body.tsx`（`:203-206`）；必要时 `palette-helpers.ts` 的类型 | 会话行来源改为可注入（AgentBox 目录 ready 时读 `$agentBoxSessions`；否则空 + 说明） | I5：打开面板零 legacy 会话清单调用；行 id 仍是服务权威 id，不做 `SessionRecord→SessionInfo` 转换 | 面板行为门：打开时 legacy 0 次、wire 目录 ready 时显示服务行 |
| **W3 侧栏搜索/归档** | `features/chat/sidebar/chat-sidebar.tsx`（`:438-469` 与 `:1153-1157`）；`store/sidebar-archive.ts` | 搜索/归档数据源改为可注入；服务未声明对应能力时如实不可用（不得静默空态伪装"无结果"） | I6：任意查询串与 Archived 切换均零 legacy REST；匹配服务 Workspace 的展开内容**不变**为 wire 权威 | 定向门：搜索/归档 legacy 0 次；`sessions.list` 归档切片有数据时仍显示服务行 |
| **W5 资源层加固**（可与上并行，独立文件） | `electron/security/agentbox-wire-transport.ts:29-43`；`electron/security/agentbox-wire-event-transport.ts:103-105` + `composition/agentbox-service-composition.ts:50-53` | HTTP 复用 WS 的 `isLoopbackHost` 判据；WS 空连接改为显式报告（`onError` 或既 typed 通道） | I7：HTTP 与 WS 对 endpoint 的 host 政策一致；I8：连接缺失在两条 transport 上都可观测，不静默 | Electron 行为门：非 loopback endpoint 被拒；空连接 WS 产生一次可观测信号 |

**残余（不属本批 blocker，登记备查）**：
- B5 的 `$showAllProfiles` 分支属 `store/projects/refresh.ts:167-192`：W4 落门后即被结构性挡住；若要把
  "所有 Profile"视图做成产品能力，需另立合同，不在本轮。
- B6 的 `workspace-list.tsx:150-166` 未匹配本地行：应在 W3 同文件相邻位置加显式 legacy 选择门，
  或在 AgentBox 运行时不渲染 legacy 预览。

**不得**用"矩阵 28/28"抵消上述任何一条：28/28 是 wire-v1 方法面的结论，与 legacy REST 可达性是两件事。

## 7. 当前可以声明与不能声明的状态

**可以声明**

1. 28 个 wire-v1 方法在 AgentBox 产品组合中**全部有生产调用者**，矩阵集合/计数与 `WireMethods` 逐项一致。
2. wire-v1 摘要三方一致且工件可复现（TS `11e3b3e7…c10035`、工件 `5d4fa3bf…5e4ed`）。
3. 事件流前端链（renderer→preload→main sender-owned→main-only token/WS→schema→reducer→gap→cleanup）
   已生产接线；token 不进 renderer/URL/帧/日志；WS 限定 loopback。
4. 两道 autostart 门（renderer、Electron 窗口生命周期）确实关闭，正常冷启动对 legacy starter 调用 0 次。
5. 当前无真实 Server/Harness 链路，**REAL_FLOW_VERIFIED 仍为否**；wire 锁定不等于联调通过。

**不能声明**

1. **P05_CLIENT_GREEN**：已证明相反事实（§4）。P05 保持 PARTIAL/IN_PROGRESS，
   阶段标记 **`CLIENT_MATRIX_COMPLETE_LEGACY_CLOSEOUT_REQUIRED`**。
2. **产品已完成 / 主路径无 Hermes 控制流**：B1–B4 无需用户任何 legacy 选择即可触达，B5 对迁移用户成立。
3. **REAL_FLOW_VERIFIED、P06 GREEN、DESKTOP_IMPLEMENTATION_READY**。
4. **"事件源不可用时诚实呈现"**（WS 静默 no-op）、**"transport 限制 loopback"**（仅 WS）。
5. **P07 检查点 3 已完整覆盖 §9**：缺口见 §3。

**文档偏差（本审计修正，只登记）**

| # | 偏差 | 处置 |
| --- | --- | --- |
| D1 | 矩阵 §1 多个 `file:line` 锚点陈旧（如 `wire-send.ts:60` 实为 `:76`、`agentbox-main-chat.ts:100` 实为 `:289`），文件身份正确 | 在下一次矩阵更新时以"文件+符号"为准，行号不作为合同 |
| D2 | 矩阵称发送三件套"只依赖 phase=ready，不逐方法查 hello" | **错误**：`agentbox-main-chat.ts:256-274` 确实查 `sendOutcome.query`/`config.resolve`/发送动词声明 |
| D3 | 矩阵称队列 UI 操作需 hello `queue` + `authority==='server'` | **对 AgentBox 面不成立**：`chat-bar.tsx:159` 的 `serverQueueSupported` 只用于 `!agentBoxAuthority` 分支 |
| D4 | 矩阵 §4/§6、P04 切片 7 的"WS 诚实 unavailable" | 见 §2.2 第 2 条 |
| D5 | `contracts/wire-v1/backend-response.md:94-95` 把 17 方法摘要标为"当前权威" | 陈旧标签（同文件 `:10-13` 已登记锁定摘要）；不影响锁定值 |
| D6 | 矩阵头部"审计 HEAD `280b3cbc`"与文件内增量至 `cbdccf7c` 不一致 | 本次更新头部 |

## 8. 本轮核验命令与结果

| 命令 | 结果 |
| --- | --- |
| `git rev-parse HEAD` | `6ca5d17aff32d0f984fccd90cd507c98994bfe96`（起点=终点） |
| `git status --short` | 空（clean） |
| `git diff --check` | exit 0 |
| `node -e`（从 `WireMethods` 抽键 + 从矩阵抽首列，排序比较） | 28 ↔ 28，missing/extra/duplicate 均 `[]`，`sorted equal: true` |
| 逐行状态正则统计 | `{PRODUCTION_REACHABLE: 28}`，与 `:146`/`:151` 声明一致 |
| `sha256sum apps/desktop/src/types/wire/wire-v1.ts` | `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035` |
| `sha256sum docs/.../wire-v1/generated/wire-v1.schema.json` | `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed` |
| 生成工件复现（流式，不落盘） | 与已入库工件逐字节相同 |
| `npx vitest run --project ui src/types/wire/fixtures/core-v1.test.ts src/api/wire-v1-client.test.ts src/application/session/wire-session-control.test.ts src/app/composition/wiring/agentbox-main-chat.test.tsx` | **4 files / 63 tests passed，exit 0** |
| `npx vitest run --project electron electron/ipc/workcore-wire-ipc.test.ts electron/security/agentbox-wire-transport.test.ts electron/security/agentbox-wire-event-transport.test.ts electron/composition/agentbox-service-composition.test.ts` | **4 files / 22 tests passed，exit 0** |

未运行：完整 9600+ 套件、Windows 真机验收、任何模型调用；未安装依赖；未触碰后端与 Windows 构建树。

## 9. 审计方法与本文件写集

- 两个只读子代理并行（A：合同/事件/fixture；B：legacy 可达性），均被明确禁止写文件、stage、commit、
  跑测试套件；主执行者复核其可判定结论并以实际源码裁决冲突（B1–B5、WS 静默、HTTP 无 loopback、
  队列门失效四处均由主执行者逐行复验）。子代理未写任何共享文件。
- 本阶段唯一写集：`evidence/P05-final-audit.md`（新增）、`evidence/P05-client-matrix.md`、
  `evidence/P05.md`、`evidence/P04.md`、`docs/desktop-product-delivery/status.md`。
  未修改任何 TS/TSX、测试、schema、合同、Electron、preload、package/lock 或后端文件。
- 本文件不实施任何 legacy 修复，也不开始 P06。

## 10. legacy 收口检查点（2026-09-14 后续增量，已实施）

本阶段按 §6 的最小写集**先立 W4 结构门，再迁移 W1–W3 与 B6**。起点 HEAD `ad3feb16`，
代码检查点 `f7759148`（`fix(desktop): block lazy Hermes API startup in AgentBox runtime`）与
`a6b751ff`（`fix(desktop): retire reachable Hermes control flow from AgentBox surfaces`）。
未修改后端、wire schema、preload、shared、package/lock；未跑 Windows、未运行模型、未读密钥。

### 10.1 W4 结构门：`hermes:api` 的 main 侧运行时门

| 项 | 事实 |
| --- | --- |
| 显式依赖 | `RegisterApiProxyIpcDeps.legacyApiAllowed: boolean`（`electron/ipc/api-proxy-ipc.ts`） |
| 组合来源 | `main.ts` **只做组合**：`legacyApiAllowed: shouldAutostartLegacyHermes(DESKTOP_PRODUCT_RUNTIME)`；未新造第二套 runtime 常量，未在 `main.ts` 声明函数 |
| 门的位置 | `hermes:api` handler 的**第一条语句**：早于请求解析（`profileNameFromDeleteRequest`）、deletion gate、`apiRequestRegistryConnectionId`、registry dispatch、`handleHermesApiRequest`、`ensureBackend` |
| 拒绝行为 | 抛 `Error`，`code = 'LEGACY_RUNTIME_DISABLED_FOR_PRODUCT'` 且 message 以该码为前缀（渲染端只看到 message，故两处都带）；**不静默返回成功** |
| 数据 URL 配置 IPC | `hermes:data-url-read-max:get/set` 不受影响（独立 channel，已测） |
| 隔离 legacy 兼容 | `legacyApiAllowed: true`（显式 legacy runtime）时既有路由逐项保持：普通请求、connection-scoped profile delete、rename 的 deletion gate 与释放 |

行为证据：`electron/ipc/api-proxy-ipc.test.ts`（新增 5 用例）+ `electron/app/product-runtime-policy.test.ts`
（3 用例）＝ **electron 2 files / 8 tests passed**。禁用态断言 `handleHermesApiRequest` 0 次、
`ensureBackend` 0 次、registry dispatch 0 次、deletion gate 0 次。

### 10.2 B1–B6 最终状态与行为证据

| # | 最终状态 | 迁移后的权威数据源 | 行为证据 |
| --- | --- | --- | --- |
| B1 状态栏 | **关闭** | `useStatusSnapshot(source \| null, gatewayState, gatewayScope)`；产品组合传 `null` → 不注册 timer/focus/visibility，零 `getStatus`/`requestGateway`，返回中立 null；hook 不再 import `@/api/config` | `use-status-snapshot.test.ts` 10 用例（含 null 态 0 次调用、无定时器、非 null→null 清理）；`surfaces.test.tsx` 断言 source 为 null |
| B2 命令面板 | **关闭** | `$agentBoxSessions` → `projectAgentBoxPaletteSessions`（`archivedAt === null`；pinned → updatedAt desc → id tie-break）；行 label = `displayName`，打开用服务 id 走 `openSession` seam；`listAllProfileSessions` 与 React Query 会话查询已从该文件移除 | `body.test.tsx` 4 用例（legacy mock **会答复**却断言 0 次调用）、`palette-helpers.test.ts` 5 用例 |
| B3 侧栏搜索 | **关闭** | `ChatSidebar` 显式 `sessionAuthority`；agentbox 下 `AgentBoxGlobalSessions mode="search"` 本地、大小写不敏感过滤 displayName 与服务 id，排除 archived | `agentbox-global-sessions.test.tsx`、`chat-sidebar.integration.test.tsx`（`$gatewayState` closed/open 翻转后 `searchSessions` 仍 0 次） |
| B4 Archived | **关闭** | 同组件 `mode="archived"`：服务 ready 且 hello 声明 `sessions.list` 时**一次** `refreshAgentBoxSessions(client,{includeArchived:true})`；只显示 `archivedAt !== null`；typed failure 显示真实原因并保留缓存行；unavailable 保留缓存行 + 状态；未声明能力则明说 | 同上 + `unified-workspace-list.test.tsx`；legacy `loadArchivedSessions` 仅存在于 `sessionAuthority==='hermes'` 分支 |
| B5 all-profiles 项目刷新 | **结构性挡住** | 该 REST 分支在 agentbox runtime 下于 `ensureBackend` **之前**被拒（10.1），零 `ensureBackend`／零 `startHermes`；打开本地文件夹未被破坏（见 10.3） | electron 门测试（禁用态 0 次 `ensureBackend`）；`store/projects.test.ts` 与全量 UI 继续通过 |
| B6 未匹配本地行 | **关闭（不可达）** | agentbox authority 下不再渲染 legacy 预览，改中立文案；Home 桶不展开、不伪造行 | `unified-workspace-list.test.tsx` 新增用例 + `workspace-list.tsx` 分支 |

组合接线（主执行者）：`surfaces.tsx` 的 `SidebarSurface` 显式传 `sessionAuthority="agentbox"`，
`StatusbarSurface` 传 `null` 状态源；渲染端不重复定义 `DESKTOP_PRODUCT_RUNTIME`。

### 10.3 B5 的"打开本地文件夹"核验（只读）

`refreshProjectTreeAcrossProfiles()` 的失败被 `catch (err) { markProjectsRpcFailure(err) }` 吞掉，
`refreshProjectTree()` 本身不 reject；`openFolderAsProject()` 因此继续走本地登记/进入项目路径
（`store/projects/refresh.ts:161-186`、`store/projects/worktrees.ts:288`）。本阶段写集不含该 store，
故未为其新增测试；结论为静态核验 + 既有 `store/projects.test.ts`（含 ALL_PROFILES 用例）继续通过。

### 10.4 本阶段新发现（超出原 B1–B6，只登记不修）

**B7（新）：Command Center 浮层仍是可达 legacy 数据面。** route `command-center` 在生产外壳可达
（`app/composition/routing/overlay-routing.ts:22` `commandCenterOpen = currentView === 'command-center'`；
状态栏 command-center 入口与命令面板 `cc-sessions` 行都导航到该 route），`features.tsx:1231-1241` 挂载
`CommandCenterView`；其 System 分节 `refreshSystem` 调 `getStatus()`/`getLogs()`（`features/command-center/index.tsx:186-205`），
maintenance/usage 分节还调 `getUsageAnalytics` 与 `api/system` 系列，并对 legacy `$sessions` 做 pin/export。
原审计 §4 未覆盖该面。本阶段**未迁移**（不在任一写集内）：W4 门使其 legacy REST 调用只能得到
`LEGACY_RUNTIME_DISABLED_FOR_PRODUCT`、不再拉起运行时，但它仍是产品外壳内可达的 legacy 面。

**B8（新，低可达性）：插件 SDK 的 legacy 适配层**——`extension/sdk/host-system.ts` 的 `status()`（:62 直连
`getStatus()`）与同文件的 `restartGateway()`/`listPersistedSessions()`/`onEvent` 都仍是 legacy 数据面，经
`extension/sdk/index.ts:40` 暴露给插件；当前无已挂载的产品消费点（`plugins/hermes-bots` 的 pane 注册被注释），
全仓 `src/plugins/**` 无 `system.status` 调用者。与 B7 同类，留待同批处理；本阶段未迁移。

### 10.5 状态

阶段成功标记 **`LEGACY_CLIENT_CLOSEOUT_READY`**；P05 保持 **IN_PROGRESS**
（下阶段补 P07 §9.5/§9.6/§9.8 fixture 深度门与 HTTP/WS transport 一致性/无连接可观测性）。
不得声明 P05_CLIENT_GREEN、REAL_FLOW_VERIFIED、P06 GREEN、DESKTOP_IMPLEMENTATION_READY；
writer_lease 保持 **ACTIVE**。

> **口径更正（2026-09-14，§11 回填）**：`LEGACY_CLIENT_CLOSEOUT_READY` 只表示 **B1–B6 收口**，
> **不得**被解读为"B1–B6 之外也已完成"。该标记出现时仍明确存在 B7（Command Center 浮层）与
> B8（插件 SDK legacy 适配），且 §9.5/§9.6/§9.8 深度门与 HTTP/WS transport 一致性均未完成——
> 这些已由 §11 关闭。

## 11. P05 最终收口（2026-09-14 后续增量，已实施）

起点 HEAD `a94a197c`；代码检查点 `4efd1ec5`（transport）与 `e087c976`（Command Center / fixture /
账本）。本阶段未修改后端、wire schema、preload、shared、package/lock；未跑 Windows、未运行模型、
未读密钥。执行方式：两个并行子代理 + 主执行者同时做 Electron transport，三方写集不重叠。

### 11.1 本阶段关闭的项

| 项 | 结论 | 行为证据 |
| --- | --- | --- |
| **B7** Command Center 浮层 | **关闭** | `CommandCenterView` 必填 `authority`，生产组合显式 `'agentbox'`；agentbox 下 system/usage/maintenance/session 子树不构造，六个 legacy API 各 0 次、不订阅 `$sessions`/`$pinnedSessionIds`、无 delete/export/pin；会话取 `$agentBoxSessions`（排除 archived、服务 displayName/id/updatedAt/pinned、本地只匹配 displayName 与服务 id、以服务 id 经中立 seam 打开）；深链到无 wire 对应能力的 section 显示六语言本地化说明而不是 `LEGACY_RUNTIME_DISABLED_FOR_PRODUCT`；hermes 面板隔离测试保持不变 |
| **命令面板 legacy 快捷项** | **关闭** | 同一必填 authority：agentbox 下 `cc-restart-gateway`/`cc-update-hermes`/`cc-system`/`cc-usage` 不渲染不可执行（动作 mock 成"会应答"，断言只看调用次数）；**新发现并关闭** registry 贡献行 `Toggle logs`（其 pane 每 5s 轮询 `GET /api/logs`），插件行保留；已迁移的服务 Session 行继续工作 |
| **§9.5/§9.6/§9.8 fixture 深度** | **关闭** | 见 [P07.md](P07.md) 检查点 7：事件序列与反例逐项登记；5 files / 95 tests passed |
| **HTTP/WS transport 一致性** | **关闭** | 见 [P04.md](P04.md) 切片 9 与 §11.2；5 files / 67 tests passed |
| **陈旧 `IN_FLIGHT`** | **清除** | `IN_FLIGHT` → `[]`（两项均已不存在）；长度断言 2→0，陈旧检查由顶层目录名加强为全前缀 `statSync` |
| **`LEGACY_CLIENT_CLOSEOUT_READY` 口径** | **更正** | 该标记只表示 B1–B6 收口，不表示 B1–B6 之外也完成；B7/B8 与 §9 深度门、transport 一致性当时均未完成 |

### 11.2 HTTP/WS 共用 endpoint 策略（本阶段事实）

- 唯一裁决处 `electron/security/agentbox-wire-endpoint-policy.ts`：允许 `localhost`、`::1`、合法 `127/8`；
  拒绝非 loopback hostname/IP、带 username/password、非 `http:`/`https:`，并（HTTP 侧）拒绝越出
  `/wire/v1/` 的目标。拒绝返回稳定类别（`invalid` / `non_loopback`），**从不抛错、从不回显 endpoint**。
- HTTP：判据在 `fetch` **之前**执行，失败抛既有 `AgentBoxWireHostUnavailableError`，消息为三条稳定文本
  之一，不含 endpoint 或 token；`redirect:'error'` 与 `/wire/v1/` 目标规则不变。
- WS：无 connection、connection accessor 抛错、无 token 三条推导统一 `onError` **恰好一次**并返回幂等
  cleanup（此前 null 是静默 no-op）；非法 endpoint、WebSocket 构造失败、socket error 走同一通道；
  `AgentBoxWireEventError` 带稳定 `code`、固定 message、**不附带原始 cause**；listener 抛错被吞、
  `onError` 抛错不崩 main、listener 注册失败会关掉半注册 socket 再报告。
- 生产出口：composition 默认 sink 只记录 `[agentbox-wire] event stream <code>`，不输出 connection/token；
  调用方可覆盖。
- 边界：不发明 renderer 业务事件，不把 transport 失败伪装成 Session 终态。

### 11.3 对本文件 §7「不能声明」清单的更新

| 原条目 | 现在 |
| --- | --- |
| §7.1 `P05_CLIENT_GREEN` 不得声明 | **更新**：本阶段列出的客户端实现门全部通过，可声明 **`P05_GREEN — CLIENT_IMPLEMENTATION_COMPLETE`**（见 [P05.md](P05.md) 最终收口检查点 §8） |
| §7.2 产品已完成 / 主路径无 Hermes 控制流 | **仍不成立**：B9（profile 分享经 `api/profiles.ts`，入口含侧栏筛选菜单与命令面板两行）仍是可达 legacy 调用路径，被结构门拒绝但未迁移 |
| §7.3 REAL_FLOW / P06 GREEN / DESKTOP_IMPLEMENTATION_READY | **仍不得声明**（lifecycle connection 仍是外部缺口） |
| §7.4 "事件源不可用时诚实呈现"/"transport 限制 loopback" | **现在成立**：WS 无连接可观测、HTTP 与 WS 共用 loopback 判据（§11.2） |
| §7.5 P07 检查点 3 未完整覆盖 §9 | **更新**：§9.5/§9.6/§9.8 深度缺口关闭；§9 其余场景维持既有覆盖层次（前端行为 fixture，非真实 Server 联调） |

### 11.4 本阶段实测门

| 门 | 结果 |
| --- | --- |
| UI 定向（10 files） | **141 tests passed** |
| B1–B7 legacy 回归（10 files） | **135 tests passed** |
| Electron 定向（7 files） | **75 tests passed** |
| `renderer-layers.test.ts` 单独 | **1 file / 16 tests passed**（陈旧 `IN_FLIGHT` 失败消失） |
| `npm run --workspace apps/desktop typecheck` | **exit 0** |
| ESLint（29 个改动/新增 TS/TSX） | **exit 0** |
| `git diff --check` | **exit 0** |
| 全量 UI suite | **811 files / 7882 tests 全部通过** |
| 全量 Electron suite（原样记录） | **171 files / 2288 tests：2 files / 4 tests failed**（另一轮 5 failed）——`mcp-oauth-callback-ipc.test.ts` 与 `legacy-hermes/api-transport.test.ts`，均为自建 loopback 服务在本环境 `ECONNREFUSED`，且不 import 本阶段改动模块 |

### 11.5 新登记（未修）

**B9 — profile 分享的 legacy 数据面**：`store/profile-share.ts` → `api/profiles.ts`（`hermesApi`）；
可达入口为侧栏筛选菜单 Profile 子菜单的 `Import profile…`（`features/chat/sidebar/filter-menu.tsx:362`，
无 authority 判据）与命令面板 `Export/Import profile…` 两行。需先经原生文件框选定路径；请求被 W4 结构门
在 `ensureBackend` 之前以 `LEGACY_RUNTIME_DISABLED_FOR_PRODUCT` 拒绝。因此本阶段**不能**声称"产品外壳
所有可达 UI 均无 legacy API 调用"——该只读核验不成立，B9 为精确剩余项，本阶段写集不含上述三文件。

**B8 最终分类**：`UNREACHABLE_OR_PROTECTED`（非活动产品阻断）。无已挂载消费点；唯一被激活路径
（hermes-bots hide-sweep 在插件激活时经 `profiles.list`/`listPersistedSessions`）同样被硬门拒绝。
本阶段按工单不删除、不扩大到插件 API 重构。
