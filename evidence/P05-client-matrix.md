# P05 最终客户端矩阵审计（28 RPC + 事件流）

日期：2026-09-14。初次审计 HEAD：`280b3cbcae6b84fe7fce85b99698fdeef0d8a94f`；
**最终审计（本文件当前状态）HEAD：`6ca5d17aff32d0f984fccd90cd507c98994bfe96`**
（分支 `feature/agentbox-desktop-product`，工作树 clean，`git diff --check` exit 0）。
本文件只盘点**实际生产接线与缺口**，不修改生产代码。

> **最终审计更正（2026-09-14）**：28 方法矩阵、摘要与事件流结论经复核**维持不变**；
> §5 遗留 Hermes 可达性结论**作废并已改写**（下方 §5 就地更正）。完整依据与逐链清单见
> [`P05-final-audit.md`](P05-final-audit.md)。阶段状态因此为
> **P05 PARTIAL / IN_PROGRESS，标记 `CLIENT_MATRIX_COMPLETE_LEGACY_CLOSEOUT_REQUIRED`**。

**增量（2026-09-14，代码检查点 `cbdccf7c`）**：`sessions.archive` 已按 G5b 的目标文件与不变量完成生产接线
——统一侧栏的 `AgentBoxSessionRow` 增加独立归档菜单项，`AgentBoxSessionList` 持有唯一 `{displayName,
sessionId, version}` target 与唯一 `ConfirmDialog`（exact CAS、不乐观隐藏、pending 连点单发、conflict/typed
failure 保留对话框与投影、确认时复检服务与能力否则零 wire 调用）；当前会话归档命令
（`archiveRoutedAgentBoxSession` ← `features.tsx` 的 `session.archive` 快捷键）以 route id 为权威、经同一
application seam 发同一 CAS，记录/服务/能力缺失或已归档一律 fail closed 且绝不回落 legacy archive，成功后
不导航不清 route 不停止运行。矩阵中该行改为 `PRODUCTION_REACHABLE`（EXT），汇总 **28 reachable / 0 gap**；
G5b 改写为「已接线」记录。阶段状态记为 `SESSIONS_ARCHIVE_CLIENT_READY`（P05 仍 IN_PROGRESS，等待下一阶段
最终矩阵/fixture/legacy 审计），REAL_FLOW_VERIFIED 仍为否。详见 §3-G5b。

**增量（2026-09-14，代码检查点 `86911029`）**：`sessions.update` 侧栏投影的服务状态边界返修——Workspace
**归属**与**服务可调用性**分离：`agentBoxWorkspaceFor` 只按缓存 `$agentBoxWorkspaces` 与既有完整身份 +
normalized path 匹配，不再要求 `service.phase === 'ready'`，因此本地/WSL shell 行在 loading/unavailable 期间
仍由服务 Workspace 拥有（不再回落 legacy 预览或旧「sessions unavailable」）；`agentBoxArchiveFor` 单独继续要求
`ready` + hello 声明 `workspaces.archive` + 缓存匹配。`AgentBoxSessionList` 改为**先算缓存 records 再决定展示**：
有缓存时任何服务状态都显示服务行（unavailable 附紧凑状态与 `service.detail` 纯文本，loading 附紧凑 loading），
维护入口仅在 ready + 能力声明时可执行，其余状态行仍可打开且零 wire 调用；无缓存时 unavailable 显示
unavailable（不是 spinner），loading/idle 或 catalog 未 ready 显示 loading，仅 ready + catalog ready 显示空态。
矩阵状态计数不变（**27 reachable / 1 gap**，唯一剩余前端缺口仍为 `sessions.archive`）；`SESSIONS_UPDATE_CLIENT_READY`
以该次返修提交为最终依据（P05 仍 IN_PROGRESS，REAL_FLOW_VERIFIED 仍为否）。详见 §3-G5a 与 evidence/P05.md。

**增量（2026-09-14，代码检查点 `8cdd1381`）**：`sessions.update` 已按 G5a 的目标文件与不变量完成生产接线
——统一侧栏在**服务 Workspace 匹配后由其 AgentBox Session 投影接管展开内容**（新纯投影 + 版本单调缓存 +
`agentbox-sessions/` 行与列表 + 侧栏改名/置顶 CAS + 当前会话置顶命令走同一 seam），矩阵中该行改为
`PRODUCTION_REACHABLE`（EXT），汇总 **27 reachable / 1 gap**；G5 拆为「G5a `sessions.update` 已接线 /
G5b `sessions.archive` 待接」，**唯一剩余前端缺口为 `sessions.archive`**。阶段状态记为
`SESSIONS_UPDATE_CLIENT_READY`（P05 仍 IN_PROGRESS），REAL_FLOW_VERIFIED 仍为否。详见 §3-G5a。

**增量（2026-09-14，代码检查点 `4a057609`）**：`workspaces.browse` 选择/保存的**迟到响应**收口——向导在
Back/关闭/重新打开时使当前 save turn 失效，迟到答案不再 `selectWorkspaceView`/释放连接/关闭对话框（不会误关
重新打开的新向导）；浏览组件在保存进行中锁定 Back/Up/路径输入/Go/隐藏项/目录导航，并在卸载后丢弃 choose 的
成功、失败与 throw（无未处理 rejection）。矩阵当时为 **26 reachable / 2 gap**（workspaces.browse 仍
`PRODUCTION_REACHABLE`（EXT）），剩余 sessions.update、sessions.archive；`WORKSPACES_BROWSE_CLIENT_READY`
以该次返修后的提交为最终依据。

**增量（2026-09-14，代码检查点 `a8142125`）**：`workspaces.browse` 已接入 WSL「Open remote folder」流程——
宿主只负责 discover/connect/验证 {distribution,user,home} 与保存 shell 记录，**目录枚举改由服务**
（`workspaces.browse`，`features/workspace/agentbox-workspace-browser.tsx`），产品路径不再调用
`listWslDirectories` 且无兜底。矩阵中该行改为 `PRODUCTION_REACHABLE`（EXT），汇总 **26 reachable / 2 gap**；
G2 改写为「已接线」记录，剩余缺口为 sessions.update、sessions.archive。阶段状态记为
`WORKSPACES_BROWSE_CLIENT_READY`（P05 仍 IN_PROGRESS）。lifecycle 外部缺口不变。

**增量（2026-09-14，代码检查点 `f6b457b5`）**：`workspaces.archive` 已接入统一工作区侧栏（本地 `ProjectMenu`/
右键菜单与 WSL kebab 各自出现独立的「Archive in AgentBox」，只归档服务记录：不动文件、不隐藏本地行、不删
WSL 宿主记录、不级联 Session/历史/Profile、不停止运行中任务），矩阵中该行改为 `PRODUCTION_REACHABLE`（EXT），
汇总 **25 reachable / 3 gap**；G3 改写为「已接线」记录，剩余缺口为 workspaces.browse、sessions.update、
sessions.archive。阶段状态记为 `WORKSPACES_ARCHIVE_CLIENT_READY`（P05 仍 IN_PROGRESS）。lifecycle 外部缺口不变。

**增量（2026-09-14，代码检查点 `072c7eac`）**：Workspace 身份匹配返修——匹配改为**完整
`{kind,user,host}` 三元组 + normalized path 全等**（WSL 需 distro 与 actualUser 都相等，local 需 host/user
双 null），修复"同一 distro/path 下另一用户的记录被误当当前 Workspace"的缺口；矩阵状态计数不变
（24 reachable / 4 gap），lifecycle 外部缺口不变。

**增量（2026-09-14，代码检查点 `3e207376`）**：`workspaces.open` 已按 G1 的目标文件与不变量完成生产接线
（shell 选择 → open → 服务 WorkspaceRecord → 服务 Workspace 对应的新会话草稿，含 provisional 草稿迁移与
迟到响应保护），矩阵中该行改为 `PRODUCTION_REACHABLE`（EXT），汇总 **24 reachable / 4 gap**；G1 改写为
「已接线」记录，剩余缺口为 workspaces.browse、workspaces.archive、sessions.update、sessions.archive。
lifecycle 外部缺口不变。

**增量（2026-09-14，代码检查点 `b6d0bc6f`）**：发送边界的**顺序**修正——已产生 `requestId` 的旧
pending 优先级最高，先用原 requestId 查询（`sendOutcome.query`），配置/身份/附件/文本都不得阻断该恢复；
`config.resolve` 只在「当前 scope 没有旧 pending、准备建立新发送意图」时执行。**这不是跳过新发送的配置
校验**：scope 清空后仍严格 resolve→send，rejected/typed error 仍不发送。汇总 23 reachable / 5 gap 不变，
lifecycle 外部缺口不变。详见 §3-G4 与 evidence/P05.md。

**增量（2026-09-14，代码检查点 `940c9df4`）**：`config.resolve` 已按 G4 的目标文件与不变量完成生产接线
（application 用例 + 发送前强制校验 + renderer 预览 latest-wins + hello 能力门），矩阵中该行改为
`PRODUCTION_REACHABLE`（EXT），汇总当时为 23 reachable / 5 gap；G4 改写为「已接线」记录，其余缺口不变。

权威方法集合：`apps/desktop/src/types/wire/wire-v1.ts` 的 `WireMethods`（28 项）。
摘要核对：TS 权威 `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`、
生成工件 `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`，与后端
`docs/server-round1/wire-review.md`（2026-09-14 12:15 `WIRE_LOCKED_FOR_IMPLEMENTATION`）
登记的同一对摘要逐字节一致；后端已以该工件回归 `tests/server/test_wire_v1.py` 29 passed。

## 判定规则（本矩阵如何得出结论）

- **schema/client 列**只表示：方法在 `WireMethods` 中、且 `WireV1Client` 能按其
  `Params/Result` schema 调用并校验。**通用 client 可调用任意方法，不等于生产已接**。
- **application 入口**：非测试模块中真实发起调用的函数（fixture、`types/wire/**` 测试、
  client 单元测试都**不算**入口）。
- **生产调用者**：从 AgentBox 产品正常组合（`agentbox-main-chat` / `AgentBoxChatView` /
  `ProfilesView` / Products Settings）到该入口的真实链路。旧 `requestGateway`、Hermes
  gateway、legacy profile pool、legacy route 的调用**不算** AgentBox 生产接线。
- **capability gate**：只承认来自 `server.hello` 的声明（`wireCapability` /
  `agentBoxCapabilitySupported`）；不以方法存在、字符串命中或异常文本推断支持。
- connection slot 当前为 null。若「UI/application → main-only transport」路径已完整，
  该行仍判 `PRODUCTION_REACHABLE`，外部终态连接单独列在 §外部缺口，**不**把它当成本端缺口。

| 状态 | 含义 |
| --- | --- |
| `PRODUCTION_REACHABLE` | AgentBox 正常生产组合能触达，不依赖 legacy Hermes |
| `CLIENT_READY_NO_SURFACE` | typed application 入口存在，但批准产品当前没有直接 UI 触发点 |
| `FIXTURE_ONLY_FRONTEND_GAP` | 只有 schema/fixture 或测试调用，而批准产品行为仍需要前端实现 |
| `EXTERNAL_LIFECYCLE_BLOCKED` | 前端调用路径已完成，唯一缺口是正式 Server artifact/discovery/token/dynamic-port/readiness/owner connection |
| `WAITING_PERIPHERAL_CONTRACT` | 不属于 28 方法的外围产品能力（只出现在 §附录 A） |
| `NOT_APPLICABLE` | 合同明确无需独立生产入口（本矩阵 0 行） |

## 1. 主矩阵（每方法一行，28 行）

列含义：schema/client = 权威 schema 与 typed client；application 入口 = 真实调用点
（文件:行）；生产调用者 = 产品组合链路；行为测试 = 现有行为门文件；状态见上表。
`EXT` 标记表示该行的终态运行还依赖 §4 的同一外部 lifecycle connection。

| 方法 | schema/client | application 入口 | 生产调用者 | 行为测试 | 状态 | 缺口/依据 |
| --- | --- | --- | --- | --- | --- | --- |
| `server.hello` | ✓ `WireMethods`；`WireV1Client.hello()` `api/wire-v1-client.ts:121` | `refreshAgentBoxProfileCatalog` / `ensureAgentBoxProfileCatalog` `application/profile/wire-composer-profile.ts:39,65`（写 `$agentBoxHello`、`$agentBoxService`） | `useAgentBoxMainChat`→`ensureAgentBoxDesktopCatalog` `application/agentbox-desktop-catalog.ts:14`；`ProfilesView` 刷新 `features/profiles/index.tsx:102` | `api/wire-v1-client.test.ts`、`types/wire/fixtures/core-v1.test.ts` | `PRODUCTION_REACHABLE`（EXT） | 产品唯一能力来源：profiles/models 各 4 方法门、queue 控件门都读它；缺失能力 fail-closed（`wireCapability` 未声明即 `supported:false`） |
| `workspaces.open` | ✓ schema+client | `openAgentBoxWorkspace` `application/workspace/wire-workspace-catalog.ts`（exact environment/path、每次 attempt 新 requestId、expectedVersion 仅在提供时发送）；store `upsertAgentBoxWorkspace` | `useAgentBoxMainChat` 的自动登记 effect（`app/composition/wiring/agentbox-main-chat.ts`）：非 Session 路由 + 有效 shell target + catalog ready + hello 声明 + 服务尚无匹配记录 | `application/workspace/wire-workspace-catalog.test.ts`、`store/agentbox-service.test.ts`、`app/composition/wiring/agentbox-main-chat.test.tsx`、`features/chat/agentbox-chat-view.test.ts` | `PRODUCTION_REACHABLE`（EXT） | core §4：open = register-or-select，幂等于 (environment, normalizedPath)，不建 Session、不启 Harness；本地/ WSL 同 path 字符串不互认，shell row id 不作 wire id（只经显式 `serviceWorkspaceId` 命中）；同 target 单飞、迟到只入缓存不切回；草稿由 provisional shell scope 迁移到服务 scope。见 §3-G1 |
| `workspaces.list` | ✓ schema+client | `refreshAgentBoxWorkspaces` `application/workspace/wire-workspace-catalog.ts:17` | `ensureAgentBoxDesktopCatalog`←`useAgentBoxMainChat`（`app/composition/wiring/agentbox-main-chat.ts:50`） | `application/workspace/wire-workspace-catalog.test.ts` | `PRODUCTION_REACHABLE`（EXT） | 服务清单整体替换 `$agentBoxWorkspaces`；`resolveAgentBoxWorkspace` 按环境+规范化路径解析，本地与 WSL 同字符串不合并 |
| `workspaces.browse` | ✓ schema+client | `wireAgentBoxWorkspaceBrowserPort` `application/workspace/wire-workspace-browser.ts`（exact `{requestId, environment, path}`，每次意图新 requestId，返回结果原样） | WSL 向导的目录浏览步骤（`features/workspace/wsl-workspace-wizard.tsx` → `AgentBoxWorkspaceBrowser`），仅在 service ready + hello 声明时提供 | `application/workspace/wire-workspace-browser.test.ts`、`features/workspace/agentbox-workspace-browser.test.tsx`、`features/workspace/wsl-workspace-wizard.test.tsx`、`application/workspace/latest-wins.test.ts` | `PRODUCTION_REACHABLE`（EXT） | core §4：远端目录由 Worker 列举、Desktop 呈现；`canOpen`/`canWrite`/`reason` 只作服务事实呈现（不可打开禁用并显示 reason，只读可进入且可选），服务返回的 path 为权威路径；latest-wins 丢弃旧响应、失败保留上次清单；宿主只做 discover/connect/验证与保存，**无 listWslDirectories 兜底**。见 §3-G2 |
| `workspaces.archive` | ✓ schema+client | `archiveAgentBoxWorkspace` `application/workspace/wire-workspace-catalog.ts`（exact `{workspaceId, expectedVersion, requestId}`，只返回服务记录、不写 store） | 侧栏工作区行菜单（`features/chat/sidebar/workspace-list/workspace-list.tsx` 持有唯一 ConfirmDialog 与 target；本地 `ProjectMenu`/右键菜单与 WSL kebab 只拿到注入回调） | `application/workspace/wire-workspace-catalog.test.ts`、`features/chat/sidebar/unified-workspace-list.test.tsx`、`features/chat/sidebar/workspace-list/workspace-row.test.tsx`、`features/chat/sidebar/projects/project-menu.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | core §3/§4：归档的是服务 WorkspaceRecord（记录保留、不级联、不停止运行），匹配用完整 `{kind,user,host}` + normalized path 且 hello 必须声明该能力；成功时**先清 neutral selection 再移除服务投影**，避免主聊天观察到「仍选中但服务记录消失」而立即 `workspaces.open` 反向恢复；CONFLICT_VERSION 保持对话框打开、投影与选择不变。见 §3-G3 |
| `profiles.list` | ✓ schema+client | `refreshAgentBoxProfileCatalog` `application/profile/wire-composer-profile.ts:39` | `ensureAgentBoxDesktopCatalog`（主聊天挂载）+ `ProfilesView` | `application/profile/wire-composer-profile.test.ts` | `PRODUCTION_REACHABLE`（EXT） | 先读 hello 的 `profiles.list` capability，未声明即抛出该 reason；失败保留上一投影并置 `$agentBoxService=unavailable` |
| `profiles.create` | ✓ schema+client | `wireProfileMaintenancePort.create` `application/profile/profile-maintenance-port.ts:66` | `ProfilesView` 新建对话框（`features/profiles/index.tsx`），4 方法门（`features/profiles/index.tsx:86`） | `application/profile/profile-maintenance-port.test.ts`、`features/profiles/index.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | requestId 每次新生成；只采纳服务返回 `ProfileRecord`；`profiles.create` 未声明则整页无维护控件 |
| `profiles.update` | ✓ schema+client | `wireProfileMaintenancePort.update` `:71` | `ProfilesView` 改名/串行 CAS 首步 `features/profiles/index.tsx:309` | 同上 + `features/profiles/index.test.tsx`（CAS 顺序、改名成功/配置失败重试） | `PRODUCTION_REACHABLE`（EXT） | `expectedVersion` 用当前服务 version；成功后名称/version 采纳服务返回值（`af0c08e3` 返修） |
| `profiles.archive` | ✓ schema+client | `wireProfileMaintenancePort.archive` `:87` | `ProfilesView` 归档确认框（`ConfirmDialog`） | 同上 | `PRODUCTION_REACHABLE`（EXT） | 归档后从投影移除；历史保留由服务负责，客户端不级联删除 |
| `profiles.updateConfig` | ✓ schema+client | `wireProfileMaintenancePort.updateConfig` `:80` | `ProfilesView` 默认配置保存（`ProfileConfigEditor` + 整份 values） | `application/profile/profile-maintenance-port.test.ts`、`features/profiles/index.test.tsx`、`features/profiles/profile-config-editor.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | 整份替换语义、锁定值原值带回、恢复默认即省略；`expectedVersion` 必须用上一步 `profiles.update` 返回的新 version；成功后重读 `config.describe` |
| `providerModels.list` | ✓ schema+client | `refreshAgentBoxProviderModelCatalog` `application/provider-model/wire-provider-model-catalog.ts:15`；端口 `provider-model-maintenance-port.ts:60` | `useComposerProfile`（有 model_slot 时）、`ProfilesView`、Settings→Models | `wire-provider-model-catalog.test.ts`、`provider-model-maintenance-port.test.ts` | `PRODUCTION_REACHABLE`（EXT） | hello `providerModels.list` 门；single-flight、失败保留缓存；Harness 仅作 opaque 过滤数据 |
| `providerModels.create` | ✓ schema+client | 端口 `:63` | Settings→Models（`features/settings/agentbox-model-settings.tsx:31-34` 4 方法门） | `provider-model-maintenance-port.test.ts`、`features/settings/agentbox-model-settings.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | requestId + 服务返回记录采纳；pending 锁定输入防双发 |
| `providerModels.update` | ✓ schema+client | 端口 `:72` | 同上 | 同上 | `PRODUCTION_REACHABLE`（EXT） | version CAS；失败保留上一权威行 |
| `providerModels.archive` | ✓ schema+client | 端口 `:82` | 同上 | 同上 | `PRODUCTION_REACHABLE`（EXT） | `CONFLICT_REFERENCE` 不删除/替换 Profile 引用 |
| `config.describe` | ✓ schema+client | `describeDraftConfig` `application/profile/wire-composer-profile.ts:85`；`loadProfileRuntimeDescriptor` `profile-maintenance-port.ts:109` | Composer 临时配置弹层（`useComposerProfile`）、Profiles 页配置区 | `wire-composer-profile.test.ts`、`features/profiles/index.test.tsx`、`profile-config-editor.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | 描述控件/当前值/securityLockedIds/effectTiming；迟到描述按 scope 的 `profileId` 校验后丢弃。与 `config.resolve` 职责未互相代替：客户端不自行计算生效值 |
| `config.resolve` | ✓ schema+client | `resolveComposerConfig` `application/profile/wire-composer-profile.ts:183`（exact `{profileId, workspaceId, overrides}`，只读、无 requestId）；提交侧 `submitAgentBoxComposer` `application/session/agentbox-composer.ts:116` 在构造 send intent 前强制调用 | Composer 提交路径（`agentbox-main-chat.ts:onSubmit`→`submitAgentBoxComposer`）+ 临时配置弹层预览（`useComposerProfile`→`ComposerProfileControls`） | `application/profile/wire-composer-profile.test.ts`、`application/session/agentbox-composer.test.ts`、`features/chat/composer/hooks/use-composer-profile.test.tsx`、`features/chat/composer/profile-controls.test.tsx`、`app/composition/wiring/agentbox-main-chat.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | core §5/§8：生效值由服务按「接入默认→Profile 默认→临时覆盖→安全限制」计算，客户端不推算。发送前 resolved 才发（rejected→`invalidControls`+`CONFIG_REJECTED`，零 send；typed/transport 失败零 send）；**顺序**：scope 有旧 pending 时先以原 requestId 查询并只返回该结果，`config.resolve` 与新发送都不执行；scope 清空后才 resolve→send。预览按 scope/overrides latest-wins，hello 未声明即不发请求；运行实际版本仍只在服务接受发送时按回执 `configVersion` 固定。见 §3-G4 |
| `sessions.list` | ✓ schema+client | `refreshAgentBoxSessions` `application/session/wire-session-catalog.ts:20` | `ensureAgentBoxDesktopCatalog`←主聊天挂载；统一侧栏工作区展开后的服务 Session 投影读同一缓存 | `wire-session-catalog.test.ts`、`app/composition/wiring/agentbox-main-chat.test.tsx`、`features/chat/sidebar/unified-workspace-list.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | 服务分页按 version 单调合并进 `$agentBoxSessions`（迟到旧页不覆盖新记录），部分页不擦除已学记录。侧栏在服务 Workspace 匹配后显示该投影（见 §3-G5a） |
| `sessions.update` | ✓ schema+client | `updateAgentBoxSession` `wire-session-catalog.ts:40`（requestId+expectedVersion，采纳服务返回）；当前会话命令经 `toggleAgentBoxSessionPin` 走同一 seam | 侧栏 `AgentBoxSessionList`（改名对话框 + 行菜单置顶/取消置顶，`features/chat/sidebar/agentbox-sessions/agentbox-session-list.tsx`）+ 当前会话置顶命令（`app/composition/wiring/agentbox-session-commands.ts` ← `features.tsx` 快捷键/标题栏/命令入口） | `wire-session-catalog.test.ts`、`agentbox-session-list.test.tsx`、`agentbox-session-row.test.tsx`、`agentbox-session-commands.test.ts`、`unified-workspace-list.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | 打开改名时捕获当时的 `id/version/displayName`，保存发送 exact CAS；每次意图新 requestId；不乐观改名/置顶，只采纳服务返回记录；`CONFLICT_VERSION` 保留草稿、对话框与服务投影，不自动重试；pending 锁定同 Session 维护动作且连点单发；能力未声明时行仍可看可打开但零 wire 调用。见 §3-G5a |
| `sessions.archive` | ✓ schema+client | `archiveAgentBoxSession` `wire-session-catalog.ts:71`（exact `{sessionId, expectedVersion, requestId}`，只采纳服务返回记录）；当前会话命令经 `archiveAgentBoxSessionRecord` 走同一 seam | 侧栏 `AgentBoxSessionList` 归档确认框（`features/chat/sidebar/agentbox-sessions/agentbox-session-list.tsx`，唯一 target/对话框）+ 当前会话归档命令（`app/composition/wiring/agentbox-session-commands.ts` ← `features.tsx` 快捷键/标题栏/命令入口） | `wire-session-catalog.test.ts`、`agentbox-session-commands.test.ts`、`agentbox-session-list.test.tsx`、`agentbox-session-row.test.tsx`、`unified-workspace-list.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | 归档的是服务 SessionRecord：记录保留在 `$agentBoxSessions`、由侧栏纯投影因 `archivedAt !== null` 移除行，不删历史/消息、不停止运行、不归档 Workspace/Profile、不触碰文件；`sessions.update` 与 `sessions.archive` 能力门独立；打开确认框时捕获 id/version/displayName，确认时复检服务与能力（否则零 wire 调用并如实呈现失败）；`CONFLICT_VERSION` 保留对话框、记录与投影；服务返回未归档记录仍按服务权威显示。见 §3-G5b |
| `sessions.switchProfile` | ✓ schema+client | `selectComposerProfile` `application/profile/wire-composer-profile.ts:114` | Composer 角色选择器（`useComposerProfile`←`AgentBoxChatView`） | `wire-composer-profile.test.ts`、`features/chat/composer/profile-controls.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | `expectedVersion=当前 session.version`、requestId；`confirmed/rejected` 都采纳服务返回 Session（rejected 保留旧实际值），迟到确认不覆盖更新意图 |
| `sessions.createAndSend` | ✓ schema+client | `sendAgentBoxMessage` `application/session/wire-send.ts:60`（经 `submitAgentBoxComposer` `agentbox-composer.ts`） | Composer 提交 `agentbox-main-chat.ts:201`→`ChatBar.onSubmit` | `wire-send.test.ts`、`agentbox-composer.test.ts`、`types/wire/fixtures/core-v1.test.ts` | `PRODUCTION_REACHABLE`（EXT） | requestId 贯穿；`rejected_before_accept` 不造空 Session、草稿保留；transport 未知时用**同一** requestId 查询而非重发 |
| `sessions.send` | ✓ schema+client | 同上 `:103` | 同上（既有 Session 续发） | 同上 + `api/wire-v1-client.test.ts` | `PRODUCTION_REACHABLE`（EXT） | 稳定 Session 关联；`queueItemId` 来自服务回执；未 stage 附件在传输前拒绝 |
| `sendOutcome.query` | ✓ schema+client | `queryAgentBoxSendOutcome` `wire-send.ts:135`（同 requestId 复用 pending 记录） | Composer 提交路径的 pending/未知分支 `sendAgentBoxMessage:65-69,131` | `wire-send.test.ts`、`agentbox-composer.test.ts`、`types/wire/fixtures/core-v1.test.ts` | `PRODUCTION_REACHABLE`（EXT） | `unknown` 不作安全重发信号；`WireUnavailableError` 时回落 `unknown` 并保留 pending identity |
| `queue.get` | ✓ schema+client | `refreshAgentBoxQueue` `application/session/wire-session-control.ts:29` | `useAgentBoxMainChat` 挂载/路由（`:100`）+ 发送后刷新（`agentbox-composer.ts`） | `wire-session-control.test.ts`、`agentbox-main-chat.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | 服务队列权威投影；UI 上队列操作还需 hello `queue` + `state.queue.authority==='server'`（`chat-bar.tsx:159`）。注：侧栏/流处理中的 `Map.get('queue.get')` 是无关假命中，未计入 |
| `queue.withdraw` | ✓ schema+client | `withdrawAgentBoxQueueItem` `:36` | `AgentBoxQueuePanel`←`AgentBoxChatView:203` | `wire-session-control.test.ts`、`features/chat/composer/agentbox-queue-panel.test.tsx` | `PRODUCTION_REACHABLE`（EXT） | requestId+expectedVersion；`too_late` 用服务返回项覆盖本地，不假装撤回 |
| `runs.stop` | ✓ schema+client | `requestAgentBoxStop` `:63` | `useAgentBoxMainChat` onCancel（`:237`）←`ChatBar`/`Thread` onCancel | `wire-session-control.test.ts`、`agentbox-main-chat.test.tsx`、`api/wire-v1-client.test.ts` | `PRODUCTION_REACHABLE`（EXT） | `stop_requested≠stopped`：本地进 `stopping` 等终态事件；`unconfirmed` 进 `unconfirmed` 状态，不谎报已停止；失败保留原因 |
| `approvals.decide` | ✓ schema+client | `decideAgentBoxApproval` `:101` | `AgentBoxApprovalPanel`←`AgentBoxChatView:202` | `agentbox-approval-panel.test.tsx`、`wire-session-control.test.ts` | `PRODUCTION_REACHABLE`（EXT） | `approvalId+expectedVersion+scope(once/bounded)`；决定只经服务权威，界面不自行标记已批准 |
| `history.snapshot` | ✓ schema+client | `hydrateAgentBoxHistory` `:150` | `useAgentBoxMainChat` 挂载（`:100`）与 seq gap 补水（`:162`） | `wire-session-control.test.ts`、`agentbox-main-chat.test.tsx`、`types/wire/fixtures/core-v1.test.ts` | `PRODUCTION_REACHABLE`（EXT） | 与事件流是**同一恢复机制**：`snapshot.resumeCursor` 即订阅续点；`resync_required` 时清空重建并二次请求，仍失败则标 `needsResync`；`olderCursor` 只作向旧翻页 |

### 状态计数

| 状态 | 数量 | 方法 |
| --- | --- | --- |
| `PRODUCTION_REACHABLE` | **28** | server.hello、workspaces.open、workspaces.list、workspaces.browse、workspaces.archive、profiles.list/create/update/archive/updateConfig、providerModels.list/create/update/archive、config.describe、config.resolve、sessions.list、sessions.update、sessions.archive、sessions.switchProfile、sessions.createAndSend、sessions.send、sendOutcome.query、queue.get、queue.withdraw、runs.stop、approvals.decide、history.snapshot |
| `CLIENT_READY_NO_SURFACE` | 0 | — |
| `FIXTURE_ONLY_FRONTEND_GAP` | **0** | — |
| `EXTERNAL_LIFECYCLE_BLOCKED` | **28 行同一外部缺口**（不等于前端缺口，见 §4） | 上表 28 个 `PRODUCTION_REACHABLE` 行的运行终态 |
| `NOT_APPLICABLE` | 0 | — |
| 合计 | 28 | 与 `WireMethods` 逐项一致（§6 核验） |

## 2. 非 `PRODUCTION_REACHABLE` 逐项原因

此前列于此表的 `workspaces.open`、`workspaces.browse`、`workspaces.archive`、`config.resolve`、
`sessions.update`、`sessions.archive` 已全部接线为 `PRODUCTION_REACHABLE`（EXT），接线过程见文件前言各增量与
§3-G1–G5b。**当前方法矩阵中没有非 `PRODUCTION_REACHABLE` 行**：`FIXTURE_ONLY_FRONTEND_GAP` 为 0，
`CLIENT_READY_NO_SURFACE` 与 `NOT_APPLICABLE` 均为 0，唯一剩余的运行终态缺口是 §4 的同一个外部 lifecycle
connection（不计作前端缺口）。

## 3. 确证的前端缺口（目标文件 / 接口 / 不变量 / 建议验收）

以下为审计时确认的缺口清单。G1–G4 与 G5a/G5b 已在后续代码检查点分别落地并改写为接线记录（G4
`config.resolve` `940c9df4`、G1 `workspaces.open` `3e207376`、G2 `workspaces.browse` `a8142125`、G3
`workspaces.archive` `f6b457b5`、G5a `sessions.update` `8cdd1381`、G5b `sessions.archive` `cbdccf7c`；
各条目保留原目标文件与不变量以便对照）。**本清单已无未接线项**：本端可独立补齐的机械实现批次已全部完成，
剩余未决只在 §4 的外部 lifecycle connection 与 §5 的 legacy 数据面迁移账本。

**G1 `workspaces.open` — 已接线（代码检查点 `3e207376`）**

原缺口（只登记未修）已按原目标文件与不变量实现：

- 目标文件（实际改动）：`application/workspace/wire-workspace-catalog.ts`（`openAgentBoxWorkspace` +
  按完整 environment identity + normalized path 的 `resolveAgentBoxWorkspace`）、`store/agentbox-service.ts`
  （`upsertAgentBoxWorkspace`）、`app/composition/wiring/agentbox-main-chat.ts`（shell target 构造、
  单飞自动登记、迟到归属判定、草稿迁移、`workspaceOpen` 状态）、
  `features/chat/agentbox-chat-view.tsx`（opening/unavailable 呈现）。
- 接口（实现）：`openAgentBoxWorkspace(client, {environment, path, expectedVersion?}, {createRequestId?})`
  → `{workspace, created}` 原样返回；本地 `environment = {kind:'local', user:null, host:null}` 且
  `path = project.path`（**严格取项目自身文件夹**；`path` 为 null 或空串即"无路径项目/Home bucket"，不产生
  open——项目内的 repo 路径不作替代），WSL `environment = {kind:'wsl', user:actualUser, host:distribution}` 且
  `path = rootPath`；path 不做任何 Windows/POSIX/UNC 改写；不建 Session、不启 Harness、不调 config、
  不回落 legacy gateway；transport/typed error 原样抛出，不乐观伪造记录。
- 不变量（已由测试钉住）：身份匹配要求**完整 `{kind,user,host}` 三元组 + normalized path 全等**（WSL 含
  actualUser，local 必须 host/user 双 null；身份字符串不透明精确比较，不转小写不猜用户名）；本地 target 的
  path 严格取 `project.path`，为 null/空串（含 Home bucket、纯 repo 项目）即不产生 open，也不为其分配 shell
  草稿作用域；唯一身份是服务返回的 `WorkspaceRecord.id`（shell row id 即使字符串相等也不得
  命中，只经显式 `serviceWorkspaceId` 直查）；本地与 WSL 即使 path 字符串相同也必须是两个位置；
  同一 target 未决期间最多一次调用（重渲染不发第二个 requestId），不同 target 可各自发起；迟到响应只
  进入服务缓存，不得把界面/草稿/选择切回旧 target（await 后重新读取当前选择判定归属）；能力未声明时
  不调用并呈现 hello reason；失败保留 shell 选择与草稿、呈现真实错误、不无限重试；服务 Workspace 未
  到达前 `sendAvailable=false`，草稿按 provisional shell scope 保存，成功时经既有 `migrateSessionDraft`
  迁移到服务 scope（目标已有内容则拒绝覆盖、两边都不删除）。
- 验收（已执行）：`npx vitest run --project ui src/application/workspace/wire-workspace-catalog.test.ts
  src/store/agentbox-service.test.ts src/app/composition/wiring/agentbox-main-chat.test.tsx
  src/features/chat/agentbox-chat-view.test.ts` → 4 files / **55 tests passed**（exit 0）；相关回归
  （agentbox-composer、wire-send、sidebar workspace assembly、composer store）4 files / 59 tests passed；
  `src/features/chat` 全目录 94 files / 627 tests passed。
- 仍属外部缺口（不变）：真实 open 结果、真实环境访问性与连接事实只能在 Server lifecycle connection 之后
  联调验证；服务 WorkspaceRecord 的 connection/accessibility 事实不由本端推断，本端也不显示"已连接/已
  验证"。`workspaces.browse`/`workspaces.archive` 仍不在本阶段范围。

**G2 `workspaces.browse` — 已接线（代码检查点 `a8142125`）**

原缺口（只登记未修）已按原目标文件与不变量实现：

- 目标文件（实际改动/新增）：`application/workspace/wire-workspace-browser.ts`（端口）、
  `features/workspace/agentbox-workspace-browser.tsx`（浏览组件）、
  `features/workspace/wsl-workspace-wizard.tsx`（接入与能力门）。
- 接口（实现）：`wireAgentBoxWorkspaceBrowserPort(client, {createRequestId?})` →
  `browse({environment, path})` → `workspaces.browse({requestId, environment, path})`；每次意图一个新
  requestId；结果（含 `canOpen`/`canWrite`/`reason`）原样返回；typed/transport 错误原样抛出；不写 store、
  不调用 open、不创建 Workspace/Session、不自行计算权限。测试替身只经显式 port 注入，不是生产默认。
- 职责边界（已由测试钉住）：宿主保留 `discoverWsl`/`connectWsl`/`cancelWslOperation`/
  `releaseWslConnection`/`saveWslWorkspaceFromWizard`，并继续验证 `{distribution, user, home}`；**目录枚举
  完全由服务承担**，`listWslDirectories` 在产品路径调用次数为 0，失败时不回落宿主枚举；service 未 ready 或
  hello 未声明 `workspaces.browse` 时显示真实原因且不发请求、不伪装空目录。
- 迟到保护（`4a057609` 返修）：向导在 Back、关闭、以及每次重新打开（新一代）时使当前 save turn 失效，
  迟到成功不再选择/释放/关闭，迟到失败也不影响新向导；浏览器在保存期间锁定 Back/Up/路径输入/Go/隐藏项/目录
  导航（保存目标与屏幕目录不分叉），choose 在卸载后不写 state 且捕获 throw——不新增全局状态或并发状态机。
- 不变量（已由测试钉住）：采用服务返回的 `result.path` 为权威路径；手输/父目录/子目录都发新请求；A→B
  latest-wins（迟到的成功与失败都不覆盖 B），卸载后不写 state；`kind==='directory' && canOpen` 才可进入，
  `canOpen=false` 禁用并显示 reason（点击零请求），`canOpen && !canWrite` 可进入且仍可选择（显示只读），
  file/other 只显示不导航；隐藏项只做本地过滤、不产生额外 wire 字段或请求；浏览失败保留上次成功清单与
  输入；成功浏览即证明可读，选择当前目录不要求 canWrite；浏览/选择本身不创建 Session、不启动 Harness。
- 接入顺序（已由测试钉住）：host connect 成功后用 `{kind:'wsl', host:distribution, user:result.user}` 与
  `result.home` 起浏览；确认目录 → `saveWslWorkspaceFromWizard` → 采纳宿主记录 → `selectWorkspaceView(
  record.id)` → 释放临时 connection → 关闭；**不直接调用 workspaces.open**（由既有 useAgentBoxMainChat
  观察 shell selection 后执行）；保存失败保持浏览器与目录并显示既有 typed failure、可重试；Back 保留已验证
  connection，Close 释放。
- 验收（已执行）：`npx vitest run --project ui src/application/workspace/wire-workspace-browser.test.ts
  src/application/workspace/latest-wins.test.ts src/features/workspace/agentbox-workspace-browser.test.tsx
  src/features/workspace/wsl-workspace-wizard.test.tsx` → 4 files / **31 tests passed**（exit 0）；相关回归
  5 files / 90 tests passed；`src/features/chat` + `src/features/workspace` 96 files / 664 tests passed。
- 仍属外部缺口（不变）：真实目录列表、访问性与连接进度只能在 Server lifecycle connection 之后联调验证。
  `workspace.connection` 事件进度不由本端假造，保持既有事件边界，留待联调证据。

**G3 `workspaces.archive` — 已接线（代码检查点 `f6b457b5`）**

原缺口（只登记未修）已按原目标文件与不变量实现：

- 目标文件（实际改动）：`application/workspace/wire-workspace-catalog.ts`（`archiveAgentBoxWorkspace`）、
  `features/chat/sidebar/workspace-list/workspace-list.tsx`（匹配、唯一对话框与 target、成功顺序）、
  `features/chat/sidebar/workspace-list/workspace-row.tsx` 与
  `features/chat/sidebar/projects/project-menu.tsx`（注入窄回调）。
- 接口（实现）：`archiveAgentBoxWorkspace(client, {workspaceId, expectedVersion}, {createRequestId?})` →
  `workspaces.archive` → 服务 `WorkspaceRecord` 原样返回；`workspaceId` 经 `asWireId`，每次新意图一个新
  requestId；application 不写 store、不乐观归档、不自行构造 `archivedAt`、不重试 CAS，typed/transport/
  CONFLICT_VERSION 原样抛出。
- 可用条件（全部满足才渲染动作）：service ready + hello 声明 `workspaces.archive` + 该行通过完整
  `{kind,user,host}` + normalized path 匹配到活动服务记录；Home、无自身文件夹的本地项目、无匹配、能力缺失
  或服务未就绪一律无动作且零 wire 调用。
- 不变量（已由测试钉住）：动作与本地 `Hide from sidebar`、WSL 宿主 `Remove from sidebar` 是两个不同条目
  （点击 AgentBox 归档不触碰本地隐藏与宿主记录）；确认使用打开对话框时捕获的 `workspace.id`/`version`；
  成功只采纳服务返回记录；返回 `archivedAt !== null` 且归档的是当前行时**先 `clearWorkspaceViewSelection()`
  再 `upsertAgentBoxWorkspace`**（测试用 store 监听器断言事件顺序 `['selection', 'workspaces']`）；非当前行
  归档不改选择；服务返回未归档记录仍按服务权威 upsert；失败时对话框保持打开并显示服务原因，投影与选择
  不变，不调用本地隐藏、WSL 归档、Session 方法或 `runs.stop`；确认按钮的 pending 状态阻止连点双发
  （一次确认恰一个请求）；归档后 shell 行仍存在。
- 验收（已执行）：`npx vitest run --project ui src/application/workspace/wire-workspace-catalog.test.ts
  src/features/chat/sidebar/unified-workspace-list.test.tsx
  src/features/chat/sidebar/workspace-list/workspace-row.test.tsx
  src/features/chat/sidebar/projects/project-menu.test.tsx` → 4 files / **45 tests passed**（exit 0）；相关回归
  5 files / 67 tests passed；`src/features/chat` 全目录 94 files / 640 tests passed。
- 仍属外部缺口（不变）：真实归档行为只能在 Server lifecycle connection 之后联调验证；本端只保证请求语义、
  可用条件、成功顺序与失败面。`workspaces.browse` 与 Session 侧栏迁移仍不在范围。

**G4 `config.resolve` — 已接线（代码检查点 `940c9df4`）**

原缺口（只登记未修）已按原目标文件与不变量实现，记录如下：

- 目标文件（实际改动）：`src/application/profile/wire-composer-profile.ts`（`resolveComposerConfig`
  + `ComposerConfigResolutionInput`）、`src/application/session/agentbox-composer.ts`（发送前强制
  校验与 `invalidControls`）、`src/features/chat/composer/hooks/use-composer-profile.ts`（scope
  预览/迟到保护/能力门）、`src/features/chat/composer/profile-controls.tsx`（预览呈现）、
  `src/app/composition/wiring/agentbox-main-chat.ts`（sendAvailable 能力门）、
  `src/lib/composer/types.ts`（`ComposerConfigResolutionState`）。
- 接口（实现）：`resolveComposerConfig(client, {profileId, workspaceId, overrides})` →
  `{outcome:'resolved', effective}` 或 `{outcome:'rejected', invalidControls}`；只做 WireId 转换与
  `client.call('config.resolve', …)`，只读、不带 requestId、不写 draft/store、overrides 原序原值。
- 不变量（已由测试钉住）：生效配置由服务计算，客户端不推算也不补造缺项；每次
  `sessions.createAndSend`/`sessions.send` 之前必须用该次发送的 exact profile/workspace/overrides
  快照解析一次，只有 resolved 才继续；rejected 返回 `invalidControls` 且 `sessions.*` 与
  `sendOutcome.query` 调用为 0；transport/typed error 直接抛出且 send 调用为 0（不转成 rejected 或
  resolved）；预览按 Profile/Workspace/overrides 变化重解析，旧请求迟到不得覆盖新 scope 或新
  overrides，卸载后不写状态；hello 未声明 `config.resolve` 时不发请求并以该 reason 呈现；
  安全锁定项仍不可编辑，服务 rejected 不清除用户值。
- 顺序补充（代码检查点 `b6d0bc6f`）：`config.resolve` 只在「当前 scope 没有旧 pending、准备建立新
  发送意图」时执行。旧 pending 由 `resolvePendingAgentBoxSend(client, scopeKey)` 以**原 requestId** 查询
  （`sendOutcome.query`），当前草稿的配置 rejected/unavailable、Profile/Workspace 缺失、附件未 stage、
  文本不同都不得阻断该查询；查询只被调用一次状态机，`sendAgentBoxMessage` 内部仍会再查 pending 以
  防止并发绕过。旧请求 accepted 而 draftVersion 已更新 → `acceptedForDraft=false`（不清新草稿）；
  `rejected_before_accept` 清旧 pending 但保留草稿；`unknown` 保留同一 requestId，不新建发送。
  **这不是跳过新发送的配置校验**：scope 清空后仍严格 `config.resolve` → `createAndSend`/`send`，
  rejected 与 typed error 仍不发送（回归用例保留）。
- 验收（已执行）：`npx vitest run --project ui src/application/session/wire-send.test.ts
  src/application/session/agentbox-composer.test.ts src/app/composition/wiring/agentbox-main-chat.test.tsx
  src/application/profile/wire-composer-profile.test.ts
  src/features/chat/composer/hooks/use-composer-profile.test.tsx
  src/features/chat/composer/profile-controls.test.tsx` → 6 files / **62 tests passed**（exit 0）。
- 仍属外部缺口（不变）：真实配置解析结果与真实 pending 结果只能在 Server lifecycle connection 之后
  联调验证；本端只保证请求语义、顺序、失败面与迟到保护。运行实际版本仍由接受回执的 `configVersion`
  固定，预览不冒充最终配置。

**G5a `sessions.update` — 已接线（代码检查点 `8cdd1381`；服务状态边界返修 `86911029`）**

原缺口（只登记未修）已按目标文件与不变量实现，G5 由此拆为 G5a（已接）与 G5b（待接）：

- 目标文件（实际改动/新增）：`application/session/agentbox-session-projection.ts`（纯投影）、
  `store/agentbox-service.ts`（`adoptAgentBoxSession` 版本单调采纳）、
  `features/chat/sidebar/agentbox-sessions/agentbox-session-list.tsx`（服务列表、改名状态、更新协调）、
  `features/chat/sidebar/agentbox-sessions/agentbox-session-row.tsx`（只呈现 SessionRecord）、
  `features/chat/sidebar/workspace-list/{workspace-list,workspace-row,workspace-content}.tsx`（服务
  Workspace 匹配后的展开内容接管）、`app/composition/wiring/agentbox-session-commands.ts`（当前路由置顶
  决策 + 共享 CAS seam）、`app/composition/wiring/features.tsx`（调用该 seam）、i18n 六语言新键。
- 接口（实现）：`updateAgentBoxSession(client, {sessionId, expectedVersion, displayName?/pinned?}, {createRequestId?})`
  → `sessions.update` → 只采纳服务返回 `SessionRecord`；侧栏行与当前会话命令都经
  `toggleAgentBoxSessionPin` 这一条 seam，payload 形状不漂移。
- 投影不变量（已由测试钉住）：只返回 exact `workspaceId` 且 `archivedAt===null` 的记录，pinned 在前、
  组内 `updatedAt` 降序、`id` 稳定 tie-break；不读取 cwd/profile 名/tokens/cost/message count/PR/lineage
  等 Hermes 字段，也不把 `SessionRecord` cast/填充成 `SessionInfo`。
- 缓存不变量（已由测试钉住）：同 id 只采纳 version ≥ 当前的服务记录（v7 之后到达的 v6 不覆盖），
  部分页不擦除其他 id；本阶段未改变 archived 记录在底层 cache 的保留策略（由投影过滤）。
- 侧栏不变量（已由测试钉住）：本地与 WSL 都用**完整 `{kind,user,host}` + normalized path** 匹配服务
  Workspace，**匹配只读缓存 `$agentBoxWorkspaces`，不看 service 相位**（服务可调用性与归属分离）；匹配后其
  展开内容由服务投影接管——有缓存记录即显示服务行（loading/unavailable 附紧凑状态，绝不替换记录）、catalog
  未 ready 显示诚实 loading、ready 且空显示中立 empty，**绝不回落 legacy SessionInfo 预览**；WSL 不再对已匹配
  Workspace 显示 “sessions unavailable”；未匹配的 shell 行行为不变；打开一条记录 =
  `selectWorkspaceView(shellId)` → `navigate(sessionRoute(id))`，零 `workspaces.open`/send/harness/legacy 调用。
- 服务状态边界不变量（`86911029` 返修后，已由测试钉住）：服务 Workspace 归属只看缓存，loading/unavailable
  不改变任何行的归属；有缓存时 unavailable 显示状态 + `service.detail`（纯文本、空则本地化 fallback），无缓存
  时 unavailable 显示 unavailable（不是 spinner），loading/idle 或 catalog 未 ready 显示 loading，仅
  ready + catalog ready 显示 empty；改名/置顶只在 `ready` 且 hello 声明 `sessions.update` 时可执行，其余状态
  行仍可打开但零 wire 调用（跨服务下线的已打开改名对话框也不发送）；归档入口额外要求 `ready` +
  `workspaces.archive`，旧 hello 不能让其越过服务不可用。
- 验收（已执行）：`npx vitest run --project ui` 定向门 8 files / **76 tests passed**（exit 0，含
  `agentbox-session-projection`、`wire-session-catalog`、`agentbox-service`、
  `agentbox-session-list`、`agentbox-session-row`、`unified-workspace-list`、`workspace-row`、
  `agentbox-session-commands`）；相关回归 5 files / 70 tests passed；`npm run typecheck` 三项目通过；
  实际改动文件 ESLint 0 error / 0 warning；`git diff --check` 干净。
- 服务状态边界返修验收（`86911029`）：定向门 2 files / **46 tests passed**（exit 0，
  `agentbox-session-list`、`unified-workspace-list`，新增 12 例）；要求的相关回归 6 files / 40 tests passed；
  扩大扫 `src/features/chat/sidebar` + `src/i18n` 34 files / 252 tests passed；`npm run typecheck` 三项目
  通过；改动文件 ESLint 0 error / 0 warning；`git diff --check` 干净；新增断言在修复前 10 failed / 36 passed
  （临时以 `git show HEAD:` 还原组件复跑，未改仓库）。
- 改名/置顶不变量（已由测试钉住）：打开改名时捕获当时的 `id/version/displayName`，保存发送
  `{sessionId, expectedVersion, displayName}`（trim 后），每次意图新 requestId；不乐观改名、不写
  `$pinnedSessionIds`；服务规范化名称立即回显；`CONFLICT_VERSION`/typed failure 保留对话框、草稿与
  服务投影并显示错误，不自动重试、不换版本静默覆盖；pending 时输入/保存/取消与同 Session 维护动作
  锁定，连点只发一次；`sessions.update` 未声明时行仍可看可打开但无可执行入口、零 wire 调用。
- 当前会话命令不变量（已由测试钉住）：Session route 以 route id 为权威，命中 `$agentBoxSessions` 时走
  同一 `sessions.update` CAS；记录未到达/服务未 ready/能力未声明一律 fail closed（不回落同 id 的 legacy
  Session、不产生 wire 调用）；非 Session route 的既有 legacy 行为逐字保留。
- 验收（已执行）：`npx vitest run --project ui` 定向门 8 files / **76 tests passed**（exit 0，含
  `agentbox-session-projection`、`wire-session-catalog`、`agentbox-service`、
  `agentbox-session-list`、`agentbox-session-row`、`unified-workspace-list`、`workspace-row`、
  `agentbox-session-commands`）；相关回归 5 files / 70 tests passed；`npm run typecheck` 三项目通过；
  实际改动文件 ESLint 0 error / 0 warning；`git diff --check` 干净。
- 仍属外部缺口（不变）：真实改名/置顶结果、跨客户端一致性只能在 Server lifecycle connection 之后
  联调验证；本端只保证请求语义、CAS 形状、失败面与投影归属。

**G5b `sessions.archive` — 已接线（代码检查点 `cbdccf7c`）**

原缺口（只登记未修）已按原目标文件与不变量实现：

- 目标文件（实际改动）：`application/session/wire-session-catalog.ts`（`archiveAgentBoxSession` 的 payload 收窄为
  显式三字段）、`app/composition/wiring/agentbox-session-commands.ts`（`decideAgentBoxSessionArchive` +
  `readAgentBoxSessionArchiveInput` + `archiveAgentBoxSessionRecord` + `archiveRoutedAgentBoxSession`）、
  `features/chat/sidebar/agentbox-sessions/agentbox-session-row.tsx`（独立 archive 菜单项）、
  `features/chat/sidebar/agentbox-sessions/agentbox-session-list.tsx`（唯一 target 与 `ConfirmDialog`）、
  `app/composition/wiring/features.tsx`（当前会话归档命令）、i18n 四键 × 六语言。
- 接口（实现）：`archiveAgentBoxSession(client, {sessionId, expectedVersion}, {createRequestId?})` →
  `sessions.archive` → 服务返回的 `SessionRecord` 原样采纳；每次意图一个新 `requestId`；不乐观归档、不自行构造
  `archivedAt`、不重试 CAS；typed/transport/`CONFLICT_VERSION` 原样抛出。
- 可用条件（全部满足才允许 wire）：service `ready` + hello 声明 `sessions.archive` + 目标记录的
  `archivedAt === null`；当前会话命令额外要求 route id 的 `SessionRecord` 已到达。任一缺失即 fail closed
  （`SERVICE_NOT_READY` / `CAPABILITY_NOT_DECLARED` / `SESSION_RECORD_NOT_ARRIVED` / `ALREADY_ARCHIVED`），
  零 wire 调用，且**绝不**回落同 id 的 legacy Session 或 renderer 本地归档。
- 侧栏不变量（已由测试钉住）：`sessions.update`（改名/置顶）与 `sessions.archive`（归档）能力门**独立**——只有
  update 时菜单只有改名/置顶，只有 archive 时只有归档，两者都有时三条齐全，两者都无时行仍可看、可打开且无维护入口；
  打开确认框时捕获 `{displayName, sessionId, version}`，点击菜单与确认前都不隐藏行、不发请求；确认时复检**实时**
  服务与能力，服务下线或能力消失后确认 → 零 wire 调用、对话框保持并显示本地化失败文案（不伪装成功）；pending
  连点单发（一次确认恰一个请求）；`CONFLICT_VERSION` 保留对话框、服务记录与投影且不自动重试；服务返回
  `archivedAt !== null` 时记录**保留在 `$agentBoxSessions`**、由投影移除行（历史仍在，路由不清）；服务返回未归档
  记录时行继续显示并采用服务返回的 version/displayName；unavailable 状态下缓存行与真实状态继续显示但无归档入口。
- 当前会话命令不变量（已由测试钉住）：Session route 以 route id 为权威，命中 `$agentBoxSessions` 且未归档时经
  `archiveAgentBoxSessionRecord` 发同一 CAS；记录未到达/服务未 ready/能力未声明/已归档一律 fail closed（零调用、
  不回落 legacy）；非 Session route 的既有 legacy 行为保留；成功后不导航、不清 route、不停止运行、不删除历史。
- 无级联（已由测试钉住）：归档路径不调用 `runs.stop`、不调用 `sessions.createAndSend`/`sessions.send`、不调用
  `sessions.update`/`workspaces.archive`、不删除消息或历史、不触碰本地文件或 WSL 宿主记录（测试对
  `wireClient.call.mock.calls` 全量断言）。
- 迟到保护（已由测试钉住）：archive v3 成功后，迟到的 `sessions.list` v2 页与 `sessions.update` v1 答复都不得把记录
  回滚为 active；相同/更高服务版本仍按既有单调规则权威采纳（v3 采纳服务规范化值、v5 采纳服务新值）。
- 验收（已执行）：`npx vitest run --project ui src/application/session/wire-session-catalog.test.ts
  src/application/session/agentbox-session-projection.test.ts src/store/agentbox-service.test.ts
  src/features/chat/sidebar/agentbox-sessions/agentbox-session-row.test.tsx
  src/features/chat/sidebar/agentbox-sessions/agentbox-session-list.test.tsx
  src/app/composition/wiring/agentbox-session-commands.test.ts` → 6 files / **77 tests passed**（exit 0）；
  相关回归 6 files / 93 tests passed（`unified-workspace-list`、`workspace-row`、`agentbox-main-chat`、
  `agentbox-chat-view`、`agentbox-composer`、`wire-send`）；扩大扫 `src/features/chat/sidebar` + `src/i18n` +
  `src/app` 114 files / 1042 tests passed；`npm run typecheck` 三项目通过；实际改动 16 个 TS/TSX 文件
  ESLint 0 error / 0 warning；`git diff --check` 干净。
- 仍属外部缺口（不变）：真实归档结果与跨客户端一致性只能在 Server lifecycle connection 之后联调验证；本端只保证
  请求语义、CAS 形状、可用条件、失败面与迟到保护。`features.tsx` 的三分支装配（wire / fail-closed / legacy）与
  `sessions.update` 的 pin 命令同一形状，行为由 `agentbox-session-commands.test.ts` 的纯决策与生产入口用例钉住，
  新增测试中不存在对 `features.tsx` 的源码文本断言。

**次级观察（非产品阻断，建议下一机械实现一并处理）**
- 现状：hello 能力门只覆盖 profiles 维护 4 方法、providerModels 维护 4 方法、`profiles.list`、
  `providerModels.list`、`workspaces.*`（含 `workspaces.open/browse/archive`）、`config.resolve`、
  发送三件套（`sessions.createAndSend`/`sessions.send`/`sendOutcome.query`，见
  `app/composition/wiring/agentbox-main-chat.ts:256-274`）与 `sessions.update/archive`。
- **2026-09-14 最终审计更正两处**：
  1. 原称发送三件套"只依赖 `phase==='ready'`、不逐方法查 hello"**错误**——发送面确实查
     `sendOutcome.query`/`config.resolve`/发送动词声明；该缺口描述只适用于其余方法。
  2. 原称队列 UI 操作需 hello `queue` + `state.queue.authority==='server'`**对 AgentBox 面不成立**：
     `features/chat/composer/chat-bar.tsx:159` 的 `serverQueueSupported` 只用于 `!agentBoxAuthority`
     分支（`:346-362`），AgentBox 面的 `busyAction` 恒为 `stop`，队列面板（`agentbox-queue-panel.tsx`）
     渲染时不查该能力门。
- 仍**无**逐方法 hello 门的方法：`config.describe`、`sessions.switchProfile`、`queue.get`、
  `queue.withdraw`、`runs.stop`、`approvals.decide`、`history.snapshot`。未声明时以服务 typed 错误
  （`CAPABILITY_UNSUPPORTED`/`UNAVAILABLE`）呈现，而非 UI 提前禁用。建议为停止/审批/队列这些
  "会假装成功"的入口补 hello 门（不猜测支持）。
  建议验收：hello 缺少 `runs.stop` 时停止入口禁用并给出该 reason，且不产生任何调用。

## 4. `EXTERNAL_LIFECYCLE_BLOCKED` 的精确边界（单一外部缺口）

上表 28 个 `PRODUCTION_REACHABLE` 方法的前端路径（UI/application → client → preload IPC →
main-only transport）**已完整**，其中断点只有一处：**main 进程的 AgentBox connection slot 目前为
null**。因此这些方法的运行终态都属于同一个 `EXTERNAL_LIFECYCLE_BLOCKED`，不是各自的缺口。

缺口内容（后端合同侧）：Desktop 可锁定的 **Server artifact 解析、发现/动态端口公告、readiness
判据、token 文件 ACL、进程 owner 与退出期限**。当前状态：

- `electron/composition/agentbox-service-composition.ts:31,58`：`activeConnection` 初始 `null`，
  `requestWire` 与 `subscribeWireEvents` 每次操作读取 `connectionSlot.current`。
- `electron/security/agentbox-wire-transport.ts:98`：无连接时返回 `UNAVAILABLE` typed 错误
  （无固定 8732、无测试替身、无 Hermes 回落）。
- `electron/workcore/slot.ts`：生产未安装任何 lifecycle（只有测试安装）。
- 事件流同样终止于此。**2026-09-14 最终审计更正**：WS 在连接为 null 时并非"诚实 unavailable"——
  `agentbox-wire-event-transport.ts:103-105` 返回**静默 no-op unsubscribe**，且生产组合未传 `onError`
  （`agentbox-service-composition.ts:50-53`），连接缺失在 renderer 侧不可观测。HTTP 侧才是诚实的
  （抛 typed `UNAVAILABLE`，`agentbox-wire-transport.ts:57-59,98-100`）。另：loopback 限制只存在于 WS
  （`agentbox-wire-event-transport.ts:26-65`），HTTP `requestUrl`（`agentbox-wire-transport.ts:29-43`）
  不校验 host。两项均登记为接线同批要收紧的加固项（最终审计 §6 W5）。

一旦 lifecycle 在 readiness 后安装 `{endpoint, sessionToken}`，这 28 个方法与事件流即可在**不改
客户端**的前提下进入真实联调；在此之前 REAL_FLOW 未验证，也不得声称。

## 5. 遗留 Hermes 可达性结论

> **2026-09-14 最终审计更正**：本节原结论"AgentBox 产品主路径不含 Hermes 专属控制流"**不成立，已作废**。
> 原核对只覆盖 `$gatewayState === 'open'` 门控的批量会话树/项目树/浮层，漏掉**不查该状态**的四条路径：
> 状态栏 `getStatus()` 轮询（挂载/聚焦即发）、命令面板打开时的 `listAllProfileSessions`、侧栏搜索
> `searchSessions`、Archived 视图 `loadArchivedSessions`。它们经 `api/client.ts:96-98` → `hermes:api` →
> `electron/ipc/api-proxy-ipc.ts:36-64` → `handleHermesApiRequest` → `ensureBackend`
> （`bootstrap-env-composition.ts:5570-5589`）→ `startHermes()`：**不只读 legacy 数据，还会拉起 legacy 运行时**，
> 而 `startHermes()` 不读取产品 runtime 策略（全仓仅 `:7194` 一处消费）。另有 1 条条件路径
> （持久化 "All profiles" 后 Open folder）与 1 条已上膛但当前无数据源的未匹配本地行预览。

**取代码的结论**：主 route 的聊天面确实只有 AgentBox 面；但**共享外壳**（状态栏、命令面板、侧栏搜索/归档）
存在 `ACTIVE_AGENTBOX_BLOCKER`。下表逐面记录事实；其中"侧栏会话列表"一行**只对** `$gatewayState === 'open'`
门控的部分成立，不得推广到状态栏/命令面板/搜索/归档。逐链记录、分类与最小写集见
[`P05-final-audit.md`](P05-final-audit.md) §4/§6。

| 面 | 结论 | 依据 |
| --- | --- | --- |
| 主 route / 聊天面 | 仅 `AgentBoxChatView`（`app/composition/registrations/surfaces.tsx:113`）；legacy `ChatView`（`features/chat/index.tsx`）只被 `wiring/types.ts` 作**类型**引用，未挂载 | 非测试导入链 |
| 状态栏（**新增行**） | `StatusbarSurface`（`surfaces.tsx:62-78`）经 `use-status-snapshot.ts:44-60` **无条件**调 `getStatus()`（仅 visibility/focus 门），经 `hermes:api` 触达 legacy REST 并拉起 legacy 运行时 → `ACTIVE_AGENTBOX_BLOCKER` | 最终审计 §4.3 B1 |
| 命令面板（**新增行**） | `features.tsx:1192` 常挂；打开时 `command-palette/body.tsx:203-206` 发 `listAllProfileSessions(200,1,'exclude')`，无 `enabled` 门 → `ACTIVE_AGENTBOX_BLOCKER` | 最终审计 §4.3 B2 |
| 侧栏搜索 / Archived（**新增行**） | `chat-sidebar.tsx:438-469`（搜索）与 `:1153-1157`（归档）在 `showSessionSections` 可见时**不查** `$gatewayState` 即发 legacy REST → `ACTIVE_AGENTBOX_BLOCKER` | 最终审计 §4.3 B3/B4 |
| Composer | `ChatBar` 以 `runtimeAuthority="agentbox"`、`gateway={null}`、`model.hidden=true` 挂载（`features/chat/agentbox-chat-view.tsx:133-197`） | 同文件 + `features/profiles` 模型控件中立化证据 |
| Profiles / Models | `ProfilesView`（四方法 hello 门）、`AgentBoxModelSettings`（四方法 hello 门） | `features/profiles/index.tsx:86`、`features/settings/agentbox-model-settings.tsx:46` |
| 冷启动 | renderer 与 Electron 两道 legacy 自动启动门均已关闭（P04 切片 4/5） | `evidence/P04.md` + `electron/app/product-runtime-policy.ts` |
| 侧栏会话列表 | **部分迁移（`8cdd1381` + `cbdccf7c`）**：统一工作区列表里**已匹配服务 Workspace 的展开内容**改由 AgentBox 服务投影接管（`agentbox-sessions/` + `workspace-list`，零 legacy 调用），其上的改名/置顶（`sessions.update`）与归档（`sessions.archive`）都只走服务 seam，不再使用 legacy 归档入口；**未匹配的 shell 行、扁平/进入视图与遗留会话树**仍是 legacy Hermes 数据面——`ChatSidebar` 由产品外壳挂载（`surfaces.tsx:48`），其会话节点走 `application/session-lists.ts` → `api/sessions.ts` → `api/client.ts`（`window.hermesDesktop.api`）。**门控范围更正**：`$gatewayState==='open'`（`chat-sidebar.tsx:540`）只约束**批量会话树/项目树**这一批；侧栏**搜索**（`:438-469`）与 **Archived**（`:1153-1157`）不查该状态，属 §4.3 的 blocker | 非测试导入链 + `api/client.ts:82-103` + 最终审计 §4.3 B3/B4 |
| 工作区根列表 | 已是中立的 36R 行：本地行来自本机项目存储、WSL 行来自宿主能力；选择经中立 store 驱动 AgentBox 侧解析；**未匹配本地行**的 legacy 预览分支（`workspace-list.tsx:150-166`）当前无数据源故不触发，但已上膛 | `features/chat/sidebar/workspace-list/workspace-list.tsx`、`agentbox-main-chat.ts`、最终审计 §4.3 B6 |
| 旧 Profile 对话框 | `create/delete/rename-profile-dialog` 只被 `features/chat/sidebar/profile-switcher.tsx` 引用，而该组件**无任何挂载点** → 不可达（保留文件与其测试） | 非测试导入链 |
| 旧模型浮层 | `ModelPickerOverlay`/`ModelVisibilityOverlay` 在 `features.tsx` 全应用挂载，但其开合来自 legacy 模型控件 store（`$modelPickerOpen`、`use-model-controls`），AgentBox 聊天面既隐藏模型 pill 也不驱动它们 → 挂载但无 AgentBox 触发点 | `features/profiles/model-picker-overlay.tsx:55`、`agentbox-chat-view.tsx:135` |
| `plugins/hermes-bots` | 随包注册且默认开启（`src/extension/contrib/plugins.ts`），其数据面是 legacy gateway（`host.request('profiles.list'/'profiles.configure'/'profiles.get_asset'/'profiles.create')`）。这些**不是** wire-v1 方法，也不得计作 AgentBox 生产接线；其产品入口已在 P02A 退役，pane 注册被注释（`plugin.tsx:375-387`） | `src/plugins/hermes-bots/**`、`evidence/P02.md`、最终审计 §4.3 |

允许保留（不视为缺陷）：显式 legacy 分支与宿主能力共用代码（`EXPLICIT_LEGACY_COMPAT_ALLOWED` 当前生产条目为 0，
凡可达者一律按 blocker 记账）、历史迁移键、品牌/版权数据、只读旧历史兼容、以及上表中"挂载但无 AgentBox
触发点"的待退役项——退役按 P04 消费者审计账本逐项进行。**但"共享外壳"不构成保留理由**：
状态栏、命令面板、侧栏搜索/归档四条路径必须按最终审计 §6 的 W1–W4 关闭。

## 6. 事件流（`wire.eventStream/1`，不计入 28 RPC）

| 面 | 实现 | 证据 |
| --- | --- | --- |
| main-only token | Bearer 只进入 WS upgrade header（`electron/security/agentbox-wire-event-transport.ts:119`）；renderer 只见 `{sessionId, cursor}` | `src/global.d.ts`、`electron/preload.ts` |
| Session/cursor 隔离 | main 以 `webContents.id + subscriptionId` 持有源；每帧校验 `frame.sessionId === sessionId` 后入 reducer | `agentbox-main-chat.ts:152`、`electron/ipc/workcore-wire-ipc.ts` |
| schema 校验 | renderer 先 `EventFrameSchema.safeParse`，非法帧静默丢弃，不入 reducer | `agentbox-main-chat.ts:146` |
| gap / history resync | seq 缺口 → 先退订再 `history.snapshot` 补水，从新 `resumeCursor` 重订阅 | `agentbox-main-chat.ts:158-166`、`wire-session-control.ts:150-192` |
| cleanup | route 卸载/切换退订、Electron 侧返回源 cleanup、`will-quit` 释放 | `agentbox-main-chat.ts` subscription cleanup、`main.ts` will-quit |
| 生产挂载 | `AgentBoxChatView` → `useAgentBoxMainChat`（hydration 取得非空 `resumeCursor` 后才订阅） | `agentbox-main-chat.ts:94-155` |
| 状态 | 前端路径已完成；事件源与连接同属 §4 的同一外部 lifecycle 缺口 | `evidence/P04.md` 切片 6/7/8 |

## 7. 生产调用链（架构附录）

```text
Renderer surface
  ├── AgentBoxChatView            features/chat/agentbox-chat-view.tsx（唯一聊天面）
  ├── ProfilesView                features/profiles/index.tsx（overlay，四方法 hello 门）
  └── AgentBoxModelSettings       features/settings/product-settings.tsx → agentbox-model-settings.tsx
        │
        ▼
application use case / port
  ├── agentbox-main-chat.ts       主聊天编排（catalog、history、queue、stop、event ingest）
  ├── agentbox-composer.ts        提交用例 → wire-send.ts
  ├── wire-session-control.ts     queue/runs/approvals/history
  ├── wire-session-catalog.ts     sessions.list/update/archive
  ├── wire-workspace-catalog.ts   workspaces.list + 选择解析
  ├── wire-composer-profile.ts    hello/profiles.list/config.describe/switchProfile
  ├── profile-maintenance-port.ts        profiles.* + config.describe
  ├── provider-model-maintenance-port.ts providerModels.*
  └── wire-provider-model-catalog.ts     providerModels.list
        │
        ▼
WireV1Client                      api/wire-v1-client.ts（信封/校验/typed 错误；无 fetch 默认）
        │
        ▼
preload IPC                       electron/preload.ts → window.agentBoxDesktop.wire.{request,subscribeEvents}
        │                          src/global.d.ts：renderer 不见 endpoint/token/subscription owner
        ▼
Electron request / event transport
  ├── ipc/workcore-wire-ipc.ts        校验 method/信封一致；sender-owned 事件订阅
  ├── security/agentbox-wire-transport.ts     HTTP dispatcher（Bearer 只在此处出现）
  └── security/agentbox-wire-event-transport.ts WS（Bearer 只进 upgrade header）
        │
        ▼
dynamic connection slot            electron/composition/agentbox-service-composition.ts
  ├── connectionSlot.current       每次操作动态读取（HTTP 与 WS 共用同一 slot）
  ├── slot = null                  诚实 UNAVAILABLE（无固定端口/无测试替身/无 Hermes 回落）
  └── 生产 lifecycle                 未安装：electron/workcore/slot.ts 无安装者
```

四条不变量（与 `docs/architecture/electron-host-boundary.md` 一致，未重新设计目录）：

1. renderer 不持有 endpoint/token，也没有默认 fetch/mock transport；
2. HTTP 与 WS 共用同一个 main-only 动态 connection slot；
3. slot 为 null 时如实返回 typed `UNAVAILABLE`，不伪造 ready、不猜端口/argv/data root；
4. transport 与 client 均无 Hermes 回落；lifecycle connection 的正式来源仍是外部合同缺口。

## 8. 核验命令与结果

| 命令 | 结果 |
| --- | --- |
| `node -e "import('./src/types/wire/wire-v1.ts').then(m=>console.log(Object.keys(m.WireMethods).length))"`（apps/desktop） | `28` |
| `WireMethods` 键与矩阵首列逐项比较（一次性只读 node + python 管道，排序后全等比较） | 28 ↔ 28 全等：无遗漏、无重复、无多余 |
| `sha256sum apps/desktop/src/types/wire/wire-v1.ts docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json`（**路径更正**：`apps/desktop/` 下无 `generated/`，工件在 `docs/.../contracts/wire-v1/generated/`） | `11e3b3e7…c10035` / `5d4fa3bf…5e4ed`，与后端登记一致 |
| 生成工件复现（`node --experimental-strip-types … wireJsonSchemas()` 流式输出 + `sha256sum`，不落盘） | 与入库工件逐字节相同（证明其确由 TS 权威生成、非手改） |
| 最终审计定向门（`6ca5d17a`，见 `P05-final-audit.md` §8） | UI 4 files / 63 tests、Electron 4 files / 22 tests，均 exit 0 |
| `grep -rn "\.call('" src --include=*.ts --include=*.tsx \| grep -v test` | 28 方法调用点全部落在上表 application 入口 |
| `git diff --check` | 通过（exit 0） |
| config.resolve 接线定向门（`940c9df4`，5 files / 47 tests） | 通过（exit 0） |
| pending 恢复顺序定向门（`b6d0bc6f`，6 files / 62 tests） | 通过（exit 0） |
| workspaces.open 接线定向门（`3e207376` + 收口 + 身份匹配返修，4 files / 55 tests） | 通过（exit 0） |
| workspaces.archive 接线定向门（`f6b457b5`，4 files / 45 tests） | 通过（exit 0） |
| workspaces.browse 接线定向门（`a8142125`，4 files / 31 tests） | 通过（exit 0） |
| workspaces.browse 迟到保存返修门（`4a057609`，4 files / 40 tests） | 通过（exit 0） |
| sessions.update 接线定向门（`8cdd1381`，8 files / 76 tests） | 通过（exit 0） |
| sessions.update 相关回归门（`8cdd1381`，5 files / 70 tests） | 通过（exit 0） |
| sessions.update 服务状态边界返修定向门（`86911029`，2 files / 46 tests） | 通过（exit 0） |
| sessions.update 服务状态边界返修回归门（`86911029`，6 files / 40 tests） | 通过（exit 0） |
| sessions.archive 接线定向门（`cbdccf7c`，6 files / 77 tests） | 通过（exit 0） |
| sessions.archive 接线相关回归门（`cbdccf7c`，6 files / 93 tests） | 通过（exit 0） |
| sessions.archive 接线扩大扫（`cbdccf7c`，`sidebar`+`i18n`+`app`，114 files / 1042 tests） | 通过（exit 0） |
| `npm run typecheck`（renderer+electron+e2e 三项目，`cbdccf7c`） | 通过 |
| ESLint（16 个实际改动 TS/TSX，`cbdccf7c`） | 0 error / 0 warning（exit 0） |
| `git status --short` | 只含本阶段写集（见 §9） |

矩阵完整性核验（一次性只读命令，不新增仓库脚本）：从 `WireMethods` 导出键、从本文件表格抽取
首列方法名，排序后逐项比较，要求 28 ↔ 28 全等。

## 9. 写集与未决

审计阶段写集：本文件（新增）、`evidence/P05.md`、`docs/desktop-product-delivery/status.md`；
后续接线检查点（`940c9df4`、`3e207376`、`f6b457b5`、`a8142125`、`4a057609`、`8cdd1381`、`86911029`）的写集见各提交
与 evidence/P05.md。`8cdd1381` 只改 `sessions.update` 相关写集（见 §3-G5a 目标文件），未触碰
`sessions.archive`、legacy 侧栏数据面、wire schema 或后端。`86911029`（服务状态边界返修）只改
`workspace-list/workspace-list.tsx`、`agentbox-sessions/agentbox-session-list.tsx`、两者测试与 i18n
（`types.ts` 与六语言），同样未触碰 `sessions.archive`、store/application seam、命令接线、wire schema、
Electron/preload 或后端；`SESSIONS_UPDATE_CLIENT_READY` 以该提交为最终依据。

`sessions.archive` 接线检查点（`cbdccf7c`）写集为 16 个文件：`application/session/wire-session-catalog{.ts,.test.ts}`、
`app/composition/wiring/agentbox-session-commands{.ts,.test.ts}`、`app/composition/wiring/features.tsx`、
`features/chat/sidebar/agentbox-sessions/agentbox-session-{row,list}{.tsx,.test.tsx}`、
`i18n/types.ts` 与六语言目录（`en`/`zh`/`zh-hant`/`ja`/`ar`/`ru`）。该提交未修改 `types/wire/**` 合同、
`store/agentbox-service.ts` 的 archived 保留策略、store/application 的其他 seam、preload、Electron main、
package/lock、后端与 Windows 构建树；未重跑完整测试、未跑 Windows、未安装依赖、未读后端密钥、未执行模型调用。
`SESSIONS_ARCHIVE_CLIENT_READY` 以该提交为最终依据；P05 仍 IN_PROGRESS，待下一阶段最终矩阵/fixture/legacy 审计。

未决（不因本审计消失）：
- **`ACTIVE_AGENTBOX_BLOCKER` B1–B5（最终审计 §4.3，最小写集与不变量见 §6）**——共享外壳的四条
  legacy 触达路径（状态栏轮询、命令面板、侧栏搜索、Archived）+ 1 条条件路径；它们经 `hermes:api`
  直达 `ensureBackend`/`startHermes()`，不受两道 autostart 门约束。这是 P05 不能声明 CLIENT_GREEN 的
  唯一原因，阶段标记 `CLIENT_MATRIX_COMPLETE_LEGACY_CLOSEOUT_REQUIRED`。
- legacy 资源层加固：WS 空连接静默 no-op、HTTP 无 loopback 判据（最终审计 §2.2、§6 W5）。
- P07 检查点 3 fixture 的三处深度缺口（§9.5 队列续派、§9.6 审批失效族、§9.8 重启核对）：
  见最终审计 §3，属"仍可声明 fixture 完整"的反例。
- 真实 Server lifecycle connection（本文件 §4）→ 阻断 28 个方法与事件流的 REAL_FLOW 验证。
- 侧栏批量 legacy 会话树的迁移账本（`$gatewayState` 门控的部分）→ 开门前不会触发，开门后必须先迁移。
- `wire-v1` 未纳入范围的增量（steer 语义、Worker 通道合同、快照分页参数）仍为外围合同。

## 附录 A：外围能力（`WAITING_PERIPHERAL_CONTRACT`，不属 28 方法）

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| Skills / MCP 设置 | `WAITING_PERIPHERAL_CONTRACT` | 无已锁定 wire 方法；页面明确不可用，无假开关 |
| Identities | `WAITING_PERIPHERAL_CONTRACT` | 同上 |
| 本机 Harness 安装/更新 | `WAITING_PERIPHERAL_CONTRACT` | 同上；不复用 legacy 安装面 |
| Data（备份/恢复/清理） | `WAITING_PERIPHERAL_CONTRACT` | 同上 |
| Worker 通道建连方向/传输 | 外围合同 | core §1 允许非 TCP/复用 WSL/SSH；客户端只消费"已连接"事实 |
| `sessions.send` steer 语义 | 未进入本核心 wire | 队列默认 follow-up 已编码；steering 并发语义无已批准细则 |
| 快照分页粒度/事件批量上限 | 机械参数 | 倾向由服务端定，客户端按返回游标消费 |
