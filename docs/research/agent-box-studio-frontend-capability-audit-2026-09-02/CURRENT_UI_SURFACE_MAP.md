# 当前 UI 表面地图（Round 1：启动 → Conversation 列表）

> 只覆盖 Round 1 主题。后续 Phase 追加行。标注证据 file:line。

## Route / Page 层

| route/page | 组件 | 作用 |
|---|---|---|
| `/` | `src/app/page.tsx:7-53` | 环境门：桌面→`/workspace`；Web→token 校验（`/api/health`）→`/workspace` 或 `/login`；5xx/离线仍进 workspace |
| `/login` | `src/app/login/*` | Web 模式登录（Round 1 未展开） |
| `/workspace` | `src/app/workspace/layout.tsx:1322-1336`（Suspense → RemoteConnectionGate → UpdateProvider → WorkspaceLayoutInner）；`/workspace/page.tsx:5-7` → `ConversationDetailPanel` | 主工作台 |
| `/settings` `/pet` `/tasks` 等 | 各独立 route | 非 Round 1 范围 |

## RootLayout 全局挂载（layout.tsx:35-83）

`ThemeProvider` → `AppearanceProvider` → `OverlayScrollbarsInit`、`ClipboardFallbackInit`、
**`WebConnectionGuard`**（layout.tsx:74，断线对话框）、`WindowResizeGrips`。

## Workspace provider 嵌套（workspace/layout.tsx:1268-1336）

```
RemoteConnectionGate                      # URL remoteConnectionId/windowId → remote transport 或本地
└ UpdateProvider                          # 更新检查（非本轮）
  └ AppWorkspaceProvider                  # ①bootstrap fetch ②全局侧信道订阅 ③active-folder git 轮询
    └ AlertProvider > GitCredentialProvider > TaskProvider
      └ AcpConnectionsProvider            # 每 conversation 一个 ACP connection 管理器；全局 acp://event 订阅
        └ ConversationStatusEventBridge   # conversation_status_changed → 列表状态 patch
        └ ConversationRuntimeProvider     # 打开会话的运行时 store（live message 投影）
          └ WorkspaceProvider             # 文件 tab（非本轮）
            └ TabProvider                 # ②tabs hydrate/save/跨客户端合并
              ├ WorkspaceDocumentTitle    # document.title = activeFolder.name
              ├ TabKeysSync               # open tab keys → ACP 连接保活（registerOpenTabKeys）
              ├ HeavyPluginsWarmup
              ├ DeepLinkBootstrap         # ?folderId&conversationId&agent 直达
              ├ PetFocusBridge
              ├ ExternalConflictDialog
              └ SidebarProvider > AuxPanelProvider > TerminalProvider > SearchDialogProvider
                > AutomationsViewProvider > TasksViewProvider > WorkbenchRouteProvider
                ├ WorkbenchRouteConversationSync  # activeTabId 变化 → 切回 conversations route
                ├ WorkspaceOpenFolderListener      # folder://open-in-workspace → 打开 folder+conversation tab
                └ FolderLayoutShell               # Sidebar | main(WorkspaceContent | TerminalPanel) | AuxPanel + StatusBar + 窗口控件
```

## 首屏可见组件 → 数据依赖

| 组件 | 依赖 context/store | 读取的 store 切片 | 可见状态 |
|---|---|---|---|
| `Sidebar`（layout/sidebar.tsx:608） | `useSidebarContext`、`useActiveFolder`、`useTabActions`、`useWorkbenchRoute`、`useAutomationsView`、`useTasksView` | — | 打开/收起/宽度（localStorage `workspace:left-sidebar`） |
| `SidebarConversationList`（conversations/sidebar-conversation-list.tsx:3425） | `useAppWorkspaceStore`（selectors :879-901） | `folders`、`allFolders`、`conversations`、`conversationsLoading`、`conversationsError`、`folderGroups` | 文件夹分组带、每文件夹会话行（title/status/分支徽标/pinned）、空态、错误态、加载态 |
| `ConversationDetailPanel`（conversations/conversation-detail-panel.tsx:2865） | `useTabStore`、`useAcpActions`、`useConversationRuntimeStore` 等 | `tabs`、`activeTabId` | 无 tab → 空态/新对话入口；有 tab → 会话视图（Round 2+ 展开） |
| `TabBar`（tabs/tab-bar.tsx） | `useTabStore` | `tabs`、`activeTabId` | 恢复的 tab 条 |
| `FolderTitleBar`（移动端）/ 各 chrome | `useActiveFolder`、`useWorkspaceView` | `activeFolderId` | 当前 folder 名/分支 |
| `StatusBar` | 多 store | `stats` 等 | 会话统计 |

## 用户动作 → 可见状态（Round 1 范围）

| 动作 | 触发链 | 可见结果 |
|---|---|---|
| 启动应用（桌面） | page.tsx:10-13 → `/workspace` | 直接进工作台 |
| 启动应用（Web） | page.tsx:14-50 → token 校验 | 进工作台 / 跳 login / 进工作台并弹断线框 |
| 打开 remote 窗口 | `?remoteConnectionId=X&remoteWindowId=Y` → RemoteConnectionGate:92-136 | 加载框 → remote transport 就绪 → 工作台 |
| （自动）bootstrap | AppWorkspaceProvider:47-52 → fetchFolders+refreshConversations | sidebar 填充 |
| （自动）tab 恢复 | TabProvider hydrate → list_opened_tabs | tab 条恢复 |
| 断线 | WebConnectionGuard（4s 宽限） | 全屏重连框 → 恢复后自动 refetch |

## 启动时订阅的全局事件（app-workspace-context.tsx:57-215 + tab-context.tsx:153-179）

| 事件 | 订阅者 | 消费动作 |
|---|---|---|
| `conversation://changed` | AppWorkspaceProvider:62-87 | upsert/deleted/status patch + viewer 详情同步 |
| `conversations://bulk-changed` | AppWorkspaceProvider:112-120 | 全量 refreshConversations |
| `folder://changed` | AppWorkspaceProvider:141-167 | upsert/deleted folder、树种子、删除时关 tab |
| `folder-group://changed` | AppWorkspaceProvider:201-208 | group CRUD/layout nudge |
| `tabs://changed` | TabProvider（tab-context.tsx:153-179） | 三向合并远端 tab 快照 |
| `acp://event`（legacy firehose） | AcpConnectionsProvider 主监听；`useAcpEvent` 扇出（含 ConversationStatusEventBridge） | 会话实时事件 + `conversation_status_changed` |
| (attach 协议 snapshot/replay/event) | WebEventStream（web-event-stream.ts:75-193） | 每 connection 快照+增量（Phase 4 展开） |
| `folder://open-in-workspace`（挂载于 transport 的注入事件） | DeepLinkBootstrap:165-180 | 打开 folder/conversation |

## Reconnect 恢复动作（onTransportReconnect 注册点）

| 注册点 | 动作 |
|---|---|
| AppWorkspaceProvider:92-94 | `refreshConversations()` |
| AppWorkspaceProvider:176-178 | `fetchFolders()` |
| TabProvider（tab-context.tsx:171-173） | `refetchTabs()`（version > 本地 或未加载时应用） |
| WebEventStream（web-event-stream.ts:84-85） | 全部 attach 用 lastAppliedSeq 重发 |
| acp-connections-context（Phase 4 展开） | 会话侧恢复 |

## Folder / Conversation / Tab 当前关系（OBSERVED）

```
FolderDetail（DB 行：path/kind/git_branch/default_agent_type/sort_order/color/parent_id/group_id）
   └── 容纳多条 DbConversationSummary（DB 行：folder_id/agent_type/status/title/external_id/…）
          └── Tab = {folder_id, conversation_id, agent_type, position, is_active, is_pinned}
                稳定 id: conv-{folderId}-{agentType}-{conversationId}（tab-store.ts:405-411）
activeTabId ──派生──▶ activeFolderId（tab-context.tsx:100-102）
```

- Folder 是 cwd authority + 侧栏分组 + git 上下文的三合一（HARNESS_LEAK 候选）。
- Conversation 与 agent_type 固定绑定（TypeScript `DbConversationSummary.agent_type`；`makeConversationTabId` 第三元），本轮仅记录，Phase 2/6 展开裁决。
- Tab 是 UI 状态（设备记忆在 localStorage），但**权威副本在服务器 DB**（opened_tabs 表，CAS 版本化）——多窗口同步的来源，也是 Q1 的由来。