# 当前 Command / Event 映射（Round 1：启动 → Conversation 列表）

> 格式：user action → frontend API → command → response type → event channel → reducer/store → recovery path。
> 证据：OBSERVED file:line。

## Bootstrap 并发请求组（AppWorkspaceProvider 挂载时，app-workspace-context.tsx:47-52）

```
void fetchFolders()            ┐
                              ├─ 并行、无显式等待关系（React effect 内 fire-and-forget）
void refreshConversations()    ┘
```

### fetchFolders（app-workspace-store.ts:342-397）

| 项 | 值 |
|---|---|
| 前端 API | `listOpenFolderDetails()` + `listAllFolderDetails()` + `listFolderGroups()`（api.ts:2009-2029，Promise.all） |
| command | `list_open_folder_details` / `list_all_folder_details` / `list_folder_groups`（router.rs:176-208） |
| 后端处理 | `handlers::folders::{list_open_folder_details, list_all_folder_details, list_folder_groups}` → DB |
| response 类型 | `FolderDetail[]` / `FolderDetail[]` / `FolderGroupDetail[]`（types.ts:336-395, 386-395） |
| event channel | 消费 `folder://changed`（upsert/deleted）、`folder-group://changed`（upsert/deleted/layout）、reconnect → 再 fetchFolders |
| store | `useAppWorkspaceStore`：`folders`（用户可见，排除 chat kind）、`allFolders`、`folderGroups`、`foldersHydrated`、`foldersLoading` |
| 隐含不变量 | ①三命令同一批，否则渲染出“有组无成员”半成品（store:352-357）②fetchId 单调防旧快照覆盖新快照（store:280-285）③removedFolderSeq/groupDeletedSeq 墓碑过滤比快照新的删除（store:224-278）④组长 id 可复用 → 墓碑用序号而非永久（store:216-223） |
| recovery path | catch 仅 console.error（store:392-394）；reconnect 订阅重取；`foldersLoading` 始终收敛为 false |

### refreshConversations（app-workspace-store.ts:399-409）

| 项 | 值 |
|---|---|
| 前端 API | `listAllConversations()`（api.ts:1967-1983） |
| command | `list_all_conversations`（router.rs:53-54） |
| response 类型 | `DbConversationSummary[]`（types.ts:461+） |
| event channel | 消费 `conversation://changed`（upsert/deleted/status）、`conversations://bulk-changed`、`conversation_status_changed`（经 `acp://event`，ConversationStatusEventBridge）、reconnect → refreshConversations |
| store | `useAppWorkspaceStore.conversations` + 派生 `stats`（computeStats，按 agent_type 分组） |
| 隐含不变量 | ①删除墓碑（deletedIds，FIFO 512）防“删除后到达的 rename/upsert”复活行（store:193-210）②`parent_id != null` 的子会话不进列表（store:453）③status patch 会 bump `updated_at` 使排序浮起，pinned_at patch 不 bump（store:421-429）④stats 引用复用防止每回合并发事件重渲染（store:430-447） |
| recovery path | 错误 → `conversationsError`（sidebar 错误态）；重连 refetch。 |

## Tabs hydrate / CAS 保存协议（tab-store.ts / tab-context.tsx）

### 启动恢复（hydrate）

| 项 | 值 |
|---|---|
| 前端 API | `listOpenedTabs()`（api.ts:1993-1995） |
| command | `list_opened_tabs`（router.rs:113-114） |
| response 类型 | `OpenedTabsSnapshot {items: OpenedTab[], version}`（types.ts:552-555） |
| 本地记忆 | localStorage `workspace:tab-groups:v1`（布局/分组/selection/tile/drafts/activeDraft，tab-store.ts:313, 629-669） |
| store | `useTabStore`：`rawTabs` → `tabs`（recomputeTabs 装饰标题/状态）、`activeTabId`、`groupOf`、`tabsHydrated` |
| 隐含不变量 | ①每个 OpenedTab 带 `folder_id/agent_type/conversation_id` → 稳定 id `conv-{folderId}-{agentType}-{conversationId}`（tab-store.ts:405-411）②焦点：`is_active` → `pendingRestoreActiveDraft`（本地 blob 的 activeDraft）→ 首个 tab → null（tab-store.ts:2012-2035）③hydrate 成功才允许不变量修剪与 blob 写回（`tabsHydrated && tabsSnapshotLoaded` 双重门，tab-store.ts:682, 817）④恢复结束 seed `lastSavedPayload` 基线，恢复本身不触发一次 CAS 保存（tab-store.ts:2048-2050） |
| recovery path | 失败（401/离线）：只恢复本地 drafts，`tabsSnapshotLoaded=false`；订阅就绪后 `refetchTabs()` 补偿（tab-context.tsx:169）；transport reconnect → refetchTabs（tab-context.tsx:171-173）；`snap.version > version \|\| !tabsSnapshotLoaded` 才应用（tab-store.ts:2357） |

### 保存（任何 rawTabs/activeTabId 变化后）

| 项 | 值 |
|---|---|
| 触发 | TabProvider effect（tab-context.tsx:118-120）→ `runSaveEffect`（tab-store.ts:2121-2181） |
| 前端 API | `saveOpenedTabs(items, expectedVersion, origin)`（api.ts:1997-2007） |
| command | `save_opened_tabs`（router.rs:117-118） |
| 参数语义 | `expectedVersion` = 本客户端最后见过的 version（CAS）；`origin` = 每窗口随机串（TAB_ORIGIN，tab-store.ts:319），后端回显 |
| response 类型 | `SaveTabsOutcome {accepted, version, tabs}`（types.ts:560-564） |
| event channel | 后端保存成功后广播 `tabs://changed`（`TabsChanged {version, origin, tabs}`，types.ts:542-546）；级联变更（如删除会话）用 `origin: "server"` 哨兵 |
| store | `applyRemoteSnapshot`（tab-store.ts:2706-2889） |
| 隐含不变量 | ①500ms 防抖（tab-store.ts:2143-2145）②`accepted=false`（另一客户端先提交）→ 无条件采纳服务器真相（tab-store.ts:2148-2152）③自己的广播（origin 匹配）只吸收为合并祖先（tab-store.ts:2312-2321）④version 严格 `<` 才应用（tab-store.ts:2322）⑤未 hydrate 时广播排队 `pendingRemote`（tab-store.ts:2323-2328）⑥三向合并：服务器/本地/祖先（serverKnownTabKeys），本地未同步项（unsyncedLocal）保留并推回（tab-store.ts:2722-2756）⑦空集合并成合成 draft，工作区不空白（tab-store.ts:2818-2836）⑧远端焦点变化置 `remoteActivationPending`，不抢本地编辑焦点（tab-store.ts:2876-2878） |
| recovery path | 保存失败 catch 忽略（tab-store.ts:2178-2180），reconnect refetch 收敛 |

### tabs://changed 消息流（grep 证据）

- 后端定义：`commands/conversations.rs:23`（import TabsChanged + 事件常量）；保存成功后广播。
- 前端路由（web）：WS 帧带 `channel` 判别 → 全局广播帧按 channel 分发给 handlers（web-transport.ts:383-419）；attach 帧交 `eventStreamInstance.handleServerFrame`（web-transport.ts:390）。
- 桌面：Tauri 事件系统（tauri-transport.ts:26-63）。

## Git HEAD 轮询

| 项 | 值 |
|---|---|
| 用户可见面 | sidebar/tab 分支徽标、detached 状态区分（issue #279） |
| 前端 API | `getGitHead(path)`（api.ts:2171-2173） |
| command | `get_git_head`（router.rs:312） |
| 触发 | active folder 轮询（app-workspace-context.tsx:220-254）：repo 10s / 非 repo 60s / 失败 60s；`ensureGitHead` 按需（store:524-556，token 去重） |
| store | `gitHeads: Map<folderId, GitHeadInfo>` + `branches: Map<folderId, string\|null>` |
| 隐含不变量 | DB 列 `git_branch` 恒为 null（store:872-877），分支显示状态只由轮询供给——`refreshFolder`/`folder://changed` 都带 null-guard 防覆盖轮询结果 |

## 认证与健康检查（Web）

| 项 | 值 |
|---|---|
| 登录 | `/login` 页（Round 1 未展开）；token 存 `localStorage.codeg_token` |
| 启动校验 | `POST /api/health`（fetch，page.tsx:21-28）；401 → 清 token 跳 login；其他错误保留 token 进 workspace |
| command 通道认证 | `getTransport().call()` → fetch `Authorization: Bearer` / WS 子协议 `codeg-token.{base64url}`（ws-auth.ts:10-23） |
| 事件通道认证 | WS 握手子协议（同上），服务端校验（auth.rs） |
| 失效表现 | transport 状态 → `unauthorized` → WebConnectionGuard 立即弹框 → `redirectToCodegLogin()` |

## 启动时序（Round 1 概要）

```text
window load (webview/browser)
  ├─ RootLayout: locale → theme → appearance → guards 挂载（layout.tsx:57-75）
  ├─ page.tsx 路由门（桌面直通 / web 验 token）
  ├─ RemoteConnectionGate（URL 有无 remoteConnectionId）
  ├─ AppWorkspaceProvider effect
  │    ├─ fetchFolders(): [list_open_folder_details ∥ list_all_folder_details ∥ list_folder_groups]
  │    ├─ refreshConversations(): list_all_conversations
  │    └─ 订阅 conversation://changed / conversations://bulk-changed / folder://changed / folder-group://changed
  ├─ TabProvider hydrate: list_opened_tabs → 合并 localStorage drafts → activeTabId
  ├─ TabProvider 订阅 tabs://changed（就绪后立即 refetchTabs 补隙）
  ├─ AcpConnectionsProvider: 全局 acp://event 订阅（此时无会话连接；连接在开 tab 后按需建立，Phase 3/4）
  ├─ active-folder git 轮询启动（首帧后有 activeFolder 才轮询）
  └─ 首屏渲染：Sidebar（文件夹+会话列表）｜ ConversationDetailPanel（空态/恢复的 tab 视图）
```

## 首屏所需数据清单（最小契约，启动后第一波）

1. 环境结论：tauri / web / remote-desktop（含 baseUrl、token、windowInstanceId）
2. 认证结论（web）：token 有效或已清理（401）
3. Folders：`list_open_folder_details` + `list_all_folder_details`（+`list_folder_groups`，同批）
4. Conversations：`list_all_conversations`
5. Tabs：`list_opened_tabs`（version + items）+ 本地 blob drafts
6. Git HEAD（惰性/轮询，非阻塞首屏）：`get_git_head`（active folder 才有）
7. 全局事件流就绪（WS `__ready__` 或 Tauri 事件通道）

第 1-5 项任一失败（除 401 外）不阻塞渲染：sidebar 显示错误/空态，reconnect 或订阅就绪后自愈。