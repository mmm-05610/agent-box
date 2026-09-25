# F2 Phase 0 提案：项目/会话层级、空态、恢复（FE-SESSIONS）

依据：实读 extensions/agent-sessions（model.ts/entry.ts）、agent-conversation/view.tsx（SessionBrowser）、packages/agent-ui-contracts/contract.ts、workbench model.ts、BE 基线 92a2d2b 的 wire/handlers.py + projection.py + service/sessions/repository.py。证据路径见 reuse.md。

## A. 接缝事实
1. 现契约 AgentSessionInfo={id,title,updatedAt,detail}，平铺；sessionList 已有 unknown/loading/ready/partial/error 五态（保留，勿改语义）。
2. BE 权威（pacthold wire）：session record={id,version,workspaceId,profileId,displayName,pinned,archivedAt,latestUsage,createdAt,updatedAt}；workspaceId 可空（repository L132/L155 支持 NULL 插入）→ 独立会话与项目会话并存是后端既有事实。
3. BE wire `sessions.list(includeArchived, workspaceId?, page)` 支持按项目过滤+分页；`workspaces.open(environment,path)` 是项目（执行目录）唯一权威入口；`sessions.update` 可改 displayName/pinned/workspaceId。
4. SessionBrowser 现居 agent-conversation，同时渲染连接段（F1 域）与会话段（F2 域）。
5. FE 契约现无 workspaceId/pinned/archivedAt 投影字段，也无分页句柄。

## B. 项目/会话层级提案
- 列表=两级分组投影：项目组（标题=workspace 权威 displayName/path 摘要）+「独立会话」组（workspaceId 空）。不做项目树/项目管理，分组只是 sessions.list 投影。
- 选中状态（selectedConnectionId/selectedSessionId）继续由 AgentSessions 服务持有，视图纯投影，重挂载不丢。
- 会话切换≠取消：openSession 不触碰 runs；运行/待审批时不禁切会话（CHARTER 只禁切 Harness）；非选中会话的 run 状态照常保存在客户端快照，切回时如实显示。
- 新建会话语义：连接内 New session 保持；项目会话创建须先有后端 workspace（用户选择目录→workspaces.open）。

## C. 契约扩展请求（报 C 裁决，最小投影）
- AgentSessionInfo 增加 `workspaceId?: string`、`pinned?: boolean`；不引入归档/重命名管理 UI（BE 有能力，今晚不做，避免滑向管理平台）。
- 分页：本期若 BE 会话量小可不做（sessionList='partial' 已能表达截断）；翻页句柄留待 CP2 前再议。

## D. 空态（与 FC 统一前的基线，文案沿用现实现）
1. 无任何连接：会话区不渲染 New/Refresh，显示"先启用连接"（连接选择 UI 归 F1）。
2. 已连接列表加载：`Loading sessions…`（loading 态）。
3. ready 且空：项目组显示"该项目还没有会话"，独立组显示"No sessions yet. Start one above."
4. partial：保留"Only part of the history is available."提示行。
5. error：保留 alert 行+Refresh 重试。
6. 未选中会话（main 区占位，F3 渲染）：Choose a session。

## E. 恢复方案
- 断连：reconnect(id) 已有；重连成功后自动 refreshSessions。断连期间列表保留最后快照，顶部错误行如实显示（不伪造在线）。
- run unknown：断连后 run 状态保留 unknown，不推断（与最近提交 85cc3cd 语义一致）；列表项对运行中/待审批会话加状态点（仅显示）。
- 服务重建：AgentSessions 随 scope 释放即清理全部客户端（现有测试 agent-sessions.test.ts 已覆盖，随包迁移）。

## F. 跨包请求
- → S/F1（接缝事实表需回答）：Pi/Codex 路径下创建独立会话（workspaceId=NULL）的 wire 入口是哪个？wire `sessions.createAndSend` 必填 workspaceId 与 repository 支持 NULL 之间的差异由谁补？
- → F1：SessionBrowser 连接段（连接列表/Reconnect）迁回连接包；会话包只消费 available+selectedConnectionId 快照。状态条注册（运行中会话数）由 F1 statusbar 承担还是会话包注册，请 FC 统一。
- → F3：`agent.open` 命令与 navigation 入口（现开两视图）迁移后归属；SessionBrowser 移出后 conversation 包不再依赖 sessions 视图。
- → F0：`extensions/agent-sessions`（entry.ts/model.ts）+ `apps/desktop/src/agent-sessions.test.ts` 按所有者迁入 `plugins/agent/sessions`；包名/manifest 命名请与 F0 的打包契约一致。

## G. 验证方式（实施批后）
- 包测试：迁移 agent-sessions.test.ts；新增分组投影与空态渲染测试（vitest，离线假客户端）。
- typecheck + 既有 test:agent-ui / test:extensions 门保留。
- CP2（独立/项目会话创建与打开）时以真实链路复核 B/D/E 语义。

---

## 增补 2026-09-23（接收 S-0004/E-0005 接缝事实，仅记录不改原结论）

1. **方案 A 服务端边界（S-0004 §5）**：`workspaces.open` 幂等、normalizedPath 后端权威；**wire 只有 `workspaces.archive`（archivedAt 留痕），无任何物理删除**；目录根路径是调用方入参，后端不给默认。→ F2 侧结论：独立会话专用目录的"清理"在 FE 只能实现为 archive 留痕，不能宣称物理清理；根路径取值待 C/S 裁决（沿 F2-0004 开放点）。
2. **待审批态非 execution.state（E-0005）**：服务端 active 闸四态含 running（审批等待期间 Turn 仍 running，无漏判），但 wire 投影 7 外部态**不区分"运行中/待审批"**——审批只以 `approval.requested`/`approval.settled` 事件对呈现。→ sessions 包「运行/待审批徽标」（FC-0010 归属裁决：sessions 注册）实现口径：**扫描全部 runs＋未 settled approval 交互（不只末 run）**推导待审批计数，与 C-0016 Q2 FE 本地预测层同口径；不得从 execution.state 单字段推断。批文实施时以此为准并登记入复用账复核。
