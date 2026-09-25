# F2 复用账（FE-SESSIONS，Phase 0）

任务要求 ≥2 候选、≥1 实读源码。以下三行覆盖"会话列表/导航"可见组件重做；服务层（createAgentSessions）为既有实现迁移而非新组件，结论见表末。

| 能力/组件 | 候选项目+版本/commit | 源码路径/官方链接 | 许可证 | 检查/实验结果 | 直接/适配/参考/不用 | 修改边界/拒绝原因 | 本地落点/升级方式 | owner |
|---|---|---|---|---|---|---|---|---|
| 会话列表 primitive（active 标记/键盘导航/归档菜单） | @assistant-ui/react 0.15.21（已在 devDependencies） | 实读 npm 缓存 tarball src：`primitives/threadList/ThreadListRoot.tsx`、`threadListItem/ThreadListItemRoot.tsx`（useAuiState 绑定 `s.threads.mainThreadId`、ArrowUp/Down roving、data-active+aria-current）；https://github.com/assistant-ui/assistant-ui | MIT (c) 2025 AgentbaseAI Inc. | ThreadListItem 直接绑定 assistant-ui 自身 runtime 的 in-memory thread 注册表；本包会话权威是后端（AgentClient.refreshSessions + workspaceId 过滤分页），直用需把会话状态迁进 assistant-ui store，与后端权威冲突 | 参考 | 采纳其交互语义（aria-current、活动项标记、每项 more 菜单：重命名/置顶/归档），不引入其 thread-list store | plugins/agent/sessions 列表组件按此语义实现；对话区仍由 F3 用 assistant-ui runtime | F2 |
| 分组列表/树 primitive（项目→会话两级） | react-aria-components 1.21.1（最新 2025-09 查证） | 实读 GitHub main：`packages/react-aria-components/src/ListBox.tsx`（ListBoxSection 分组+heading、useOption a11y、data-selected、ListBoxLoadMoreItem 分页加载）、`src/Tree.tsx`（useTree 展开/折叠）；https://github.com/adobe/react-spectrum | Apache-2.0 (Adobe) | ListBox+Section 恰好覆盖"项目分组+独立会话分组"；Tree 带展开机制对今晚两级层级过重；headless 不带样式；新增依赖含 react-aria/react-stately/@internationalized/* 一串 | 不用（本期）/升级候选 | 本期零新依赖：现有手写列表 ~30 行已具备 aria-current/状态语义且过现有测试；若 FC 统一风格要求虚拟化/复杂键盘导航，下一检查点以本库为批准升级路径 | plugins/agent/sessions 保持自有列表；升级走中央批准加依赖 | F2 |
| 现有会话面板（SessionBrowser 会话段） | 当前已采用（本仓库 85cc3cd） | 实读 `extensions/agent-conversation/src/view.tsx` SessionBrowser（sessionList unknown/loading/ready/partial/error 状态机、空态文案、New session/Refresh/Reconnect 动作） | 仓库自有 (BSD-3-Clause，见 LICENSE) | 直接可用；问题：① 与连接段（F1 域）同文件同面板；② 平铺无项目分组；③ 无每项操作 | 适配（迁移+拆分） | 迁入 plugins/agent/sessions；连接段交还 F1；会话段加项目分组投影；不改 sessionList 状态语义 | plugins/agent/sessions 列表视图 + 包测试；旧 `apps/desktop/src/agent-sessions.test.ts`（服务多客户端生命周期）随迁为本包测试 | F2 |

## 服务层结论
`extensions/agent-sessions/src/model.ts`（实读）即目标服务雏形：ResourceScope 绑定、客户端按连接存活、selectedConnectionId 持久于服务而非视图。迁移=改名落位+契约小扩展，不重写。
