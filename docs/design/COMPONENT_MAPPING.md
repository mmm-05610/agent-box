# COMPONENT_MAPPING — 组件级处置映射表

> 权威等级见 [README.md](./README.md)：本文的处置决策（保留/改视觉/重组/新增）与"不得改变的行为"红线服务于已冻结原则（A 层）；其中涉及的布局与视觉细节均为 B/C 层候选，不构成产品实施规格。
> 图例：**保留** = 不动或仅换 token；**改视觉** = className/token 替换，结构与行为不动；**重组** = 合并/调整结构但不改变行为；**新增** = 纯展示新组件（不引入依赖）。

---

## 1. App Shell（窗口骨架 + Chrome）

| 项 | 内容 |
|---|---|
| 当前组件 | `app/workspace/layout.tsx`（FolderLayoutShell/FolderWorkspaceShell）、`layout/top-bar.tsx`、`layout/app-title-bar.tsx`、`layout/window-controls.tsx`、`layout/status-bar*.tsx`、`layout/workspace-chrome-controller.tsx`、`features/shell/store.ts` |
| 处置 | **保留**骨架与 store；TopBar **改视觉**（激活态统一为低对比表面差、icon-only 补 aria）；StatusBar 内容待信息价值审计（见下）；`app-title-bar` 冻结标记，迁移期与 top-bar 二选一时再单独评审 |
| 候选视觉责任（B 层） | 顶栏保持最小上下文：面包屑 + 分支（mono 纯文本，非 chip）；右侧三个面板 toggle + 设置；激活态 `--surface-active` 灰底 + `aria-pressed`。StatusBar 当前候选为分支/测试/连接三项 muted 单行——**内容集合开放**（分支可能长期有价值；连接状态异常时才有价值；测试统计可能属 Level 1；语言/缩放待验证） |
| 不得改变的行为 | 拖拽区 `data-tauri-drag-region` 全覆盖；WindowControls 平台分支与 rAF 节流；`usePanelSlideOnToggle` 门控；`KeptMountedSurface`（inert+invisible）；shell store 订阅粒度；ResizeGrips |
| 测试要求 | layout 相关现有测试全绿；新增：TopBar icon-only 按钮具备 aria-label，可切换按钮带 aria-pressed |

## 2. Sidebar

| 项 | 内容 |
|---|---|
| 当前组件 | `layout/sidebar.tsx`、`conversations/sidebar-conversation-card.tsx`、`sidebar-conversation-grouping.ts`、`sidebar-folder-group-header.tsx`、`sidebar-section-header.tsx`、`conversations/conversation-status-dot.tsx` |
| 处置 | **改视觉**（分组/排序逻辑保留） |
| 候选视觉责任 | 与画布同底色，仅 1px 分隔；导航/会话行统一 6px 圆角（收敛现有 rounded-full/md 混用）；当前会话 = 低对比灰底 + `aria-current`；运行中会话 = 小圆点 + 相对时间；会话状态色收敛 `STATUS_COLORS`（types.ts:752）到语义 token 且文字/图标双编码；计数徽标抽 `CountChip` 复用；disabled 去掉双重淡化 |
| 不得改变的行为 | `@container/sidebar` 容器查询断点；分组/折叠/排序；拖拽；像素级 rail 对齐 |
| 测试要求 | `sidebar-conversation-grouping.test.ts` 全绿；新增：会话行键盘焦点可见、当前行 aria-current |

## 3. Conversation（会话流容器）

| 项 | 内容 |
|---|---|
| 当前组件 | `chat/conversation-shell.tsx`、`message/message-list-view.tsx`、`message/virtualized-message-thread.tsx`、`ai-elements/message.tsx`、`message/turn-stats.tsx` |
| 处置 | **保留**虚拟化主链路；横条**重组**；turn-stats **改视觉** |
| 候选视觉责任 | 用户消息轻微抬升（表面差 + 12px 圆角），Agent 内容直接排在画布上；消息流占最大面积，46rem 居中列；Level 1 状态按宪法 §0 嵌入工作流；turn-stats 转 muted mono 行（数字 tabular-nums），后续入口移入会话详情 |
| 不得改变的行为 | virtua 虚拟化、prependEpoch 防跳屏、use-stick-to-bottom、反向分页阈值、viewport 键盘焦点管理、单次消费注入契约 |
| 测试要求 | `virtualized-message-thread.test.tsx`、`message-list-view.test.tsx` 全绿 |

## 4. Message（消息形态）

| 项 | 内容 |
|---|---|
| 当前组件 | `message/collapsible-user-message.tsx`、`collapsible-system-message.tsx`、`message-bubble.tsx`（死代码）、`user-image-attachments.tsx`、`plain-text-with-badges.tsx`、`content-parts-renderer.tsx` |
| 处置 | 行为**保留**；`message-bubble.tsx` 标记为待删除（删除动作在后续 Phase 单独确认）；`content-parts-renderer` 本轮不动 |
| 候选视觉责任 | 系统消息 → 中性细条 + 图标（状态色只上图标位）；折叠渐隐保留；附件缩略图统一 6px 圆角 |
| 不得改变的行为 | 折叠展开的 aria-controls/aria-expanded、图片预览 dialog |
| 测试要求 | `collapsible-*.test.tsx`、`user-message-segments.test.ts` 全绿 |

## 5. Tool Call（工具调用）

| 项 | 内容 |
|---|---|
| 当前组件 | `message/agent-capsule.tsx`（主线）、`agent-tool-call.tsx`、`tool-call-block.tsx`（遗留）、`ai-elements/tool.tsx`、`registered-tool-cards.tsx`、codex-*/codeg-mcp/shell-session 等专用卡 |
| 处置 | **重组**为统一的轻量事件行原型：agent-capsule 为基底，`tool-call-block.tsx` 与 `ai-elements/tool.tsx` 容器样式对齐（内部专有交互各自保留）。**已确认原则：工具调用是轻量过程事件，不是卡片展览**——默认一行（状态字形 + mono 摘要 + 元数据），点击展开完整输入输出 |
| 候选视觉责任 | 事件行 = 图标位（✓/✕/spinner，色只上字形）+ mono 摘要 + 右侧 tabular-nums 元数据；展开体 = 左缘 1px 缩进块；错误态左缘用语义色 + 文本双编码 |
| 不得改变的行为 | 运行→完成自动折叠、非错误→错误自动展开、Shimmer 流式标题、ScrollArea 上限、各专用卡交互 |
| 测试要求 | `agent-tool-call.test.tsx`、`agent-capsule.test.tsx` 全绿；新增：事件行 data-state（running/ok/error）断言 |

## 6. Composer

| 项 | 内容 |
|---|---|
| 当前组件 | `chat/chat-input.tsx`、`message-input.tsx`、`composer/`（add-menu、image-thumbnails）、`mode-selector.tsx`、`model-option-picker.tsx` + `model-option-list.tsx`、`session-config-selector.tsx`、`message-queue-display.tsx`、`composer-context-usage.tsx` |
| 处置 | 行为全部**保留**；视觉**改**；队列展示**重组**为一行文字 + 内联动作（行为不变） |
| 候选视觉责任 | composer = 抬升表面 + 聚焦中性 ring；发送按钮中性填充、空输入禁用，是画布上唯一主动作；底部控件行统一行高；composer 元信息一行（profile + 上下文%）为 B 层候选布局 |
| 不得改变的行为 | 队列（排序/编辑/删除）、steer/fork 分体按钮、allowOfflineCompose、断点恢复、拖拽附件遮罩、高度上限、selectors_ready 填充 |
| 测试要求 | `chat-input.test.tsx`、`message-input.test.tsx`、`message-input-attachments.test.ts`、`session-config-selector.test.tsx` 全绿；新增：queue 手柄 aria-label 与键盘路径断言 |

## 7. Binding 入口

| 项 | 内容 |
|---|---|
| 当前组件 | `features/agentbox/components/binding-bar.tsx`（五段 pill 形态，已实现、无消费方）、`session-view-agentbox.tsx`、`chat/agent-selector.tsx` |
| 处置 | **重组**（不改变行为）：常驻 pill 形态废弃；改为 composer 左下**单行紧凑入口**（Harness 方槽 + 名称 + chevron）→ popover 编辑 Harness/Profile/Model/Sandbox（原生 `<select>`）。popover 的最终字段、分组、布局 **开放**（B 层候选） |
| 冻结语义（A 层） | popover 内 continuation 行**只读**，展示系统判定结果（原生继续 / 从公共历史转换 / 最近兼容 checkpoint + 增量历史 / 新会话）；UI 不实现判定、不提供 continue 手选 |
| 不得改变的行为 | `mergedOptions` 保证当前值可表达；选项注入→select、否则 input 双路径；`binding-*` aria-label 稳定性 |
| 测试要求 | 现有 binding 测试全绿；新增：popover aria-expanded/controls、Esc 关闭、continuation 行无输入语义 |

## 8. Aux Panel（候选结构，B 层）

| 项 | 内容 |
|---|---|
| 当前组件 | `layout/aux-panel.tsx`、`aux-panel-registry.ts`、各 `aux-panel-*-tab.tsx`、`git-log-*`、`branch-*` |
| 处置 | 现有 tab（文件树/Git/会话详情）**保留**；「执行历史」「委派任务」两个新 tab 由 Phase 4 候选新增（见 MIGRATION_PLAN，PROVISIONAL）。tab 集合、顺序、入口位置**开放** |
| 候选视觉责任 | 标签行低对比、1px 分隔；面板与画布 1px 分界；宽度候选 21rem（C 层） |
| 不得改变的行为 | `shouldCollapseAuxTabs` 测量与 ResizeObserver 优先、单 tab 陷阱的 hidden 处理、git-log 数据结构 |
| 测试要求 | `aux-panel.test.tsx` 及各 tab 测试全绿 |

## 9. Settings

| 项 | 内容 |
|---|---|
| 当前组件 | `app/settings/` 页面 + `components/settings/`（含 `agentbox/profiles-settings-section.tsx`） |
| 处置 | **改视觉**（轻量），行为不动 |
| 候选视觉责任 | 表格数字列 tabular-nums、digest/revision mono；错误文案收敛到语义 token；主题列表追加中性预设（是否设为默认开放，见 MIGRATION_PLAN 开放问题） |
| 不得改变的行为 | 两步内联确认、JSON Textarea 校验、外观滑块对 `--radius`/html font-size 的写入契约 |
| 测试要求 | settings 相关测试全绿 |

## 10. Execution Lineage 与 Delegation（Phase 4 候选，未实施）

| 项 | 内容 |
|---|---|
| 当前组件 | `features/agentbox/execution-tree/`（空目录）；近似物：`message/delegated-sub-thread.tsx`、`delegation-status-group-card.tsx`、`delegation-status-row.tsx`、`chat/sub-agent-overlay.tsx`、`tasks/task-card.tsx` |
| 处置 | **新增两个独立组件，禁止共享业务模型**（A 层原则）：① `ExecutionLineagePanel`（Aux「执行历史」tab）：不可变 Execution 存档点树 + 原生 radio 选父存档点 + 信息状态条；② `DelegationPanel`（「委派任务」tab）：当前 Execution 内任务行，页首注明"属于当前 Execution，不是会话历史"。均为 PROVISIONAL，实施前需 Phase 级人工确认 |
| 已冻结的交互语义 | 选择历史节点后**发送是唯一主动作**：信息状态条只读展示"下一条消息将从 E{n} 创建新分支，原分支保留不变"（或"将从当前 head 原生继续"）+ 系统判定的 continuation 与 Loss Report 提示；信息区仅允许弱化"取消/恢复当前 head"；**不提供独立启动按钮**（是否需要独立确认步骤开放）；失败节点无已冻结输出存档，不可作父存档点 |
| 候选视觉责任 | 节点行 = 方槽 Harness 缩写 + mono `E{n}` + 摘要 + 状态字形 + tabular-nums 时间 + facts 行；1px 轨道缩进；head 用 1px 边框小标签；密度/样式/操作路径开放 |
| 不得改变的行为 | delegation-card.ts 状态优先级链；轮询合并；「查看会话」导航；第一版单写 Execution；continuation 判定属 preflight/Session Store |
| 测试要求 | `delegation-*` 全绿；两个面板各自的渲染纯函数单测；模型隔离的类型级断言 |

---

## 全局清理项

| 清理 | 位置 |
|---|---|
| Tailwind 原色（green/emerald/yellow/amber/red-400 等）→ 语义 token，状态文字/图标双编码 | CURRENT_UI_AUDIT §2.1 所列约 15 处 |
| 任意值字号 → 六档 rem 刻度 | 全仓 `text-[Npx]`/`text-[Nrem]` |
| 激活态统一为低对比表面差 | top-bar.tsx:175,188、sidebar.tsx:184、command-dropdown.tsx:283 |
| `subagent-session-dialog.tsx` / `sub-agent-session-dialog.tsx` 二选一 | message/ |
| `useIsMac` 双判定合一 | top-bar.tsx:66-67 |
| 设置入口二选一 | top-bar.tsx:207 vs sidebar.tsx:668 |
| `message-bubble.tsx` 死代码删除（单独确认后执行） | message/ |

## Changelog

- v1（已废弃）：暖黑+琥珀品牌化方向及配套组件参数（琥珀激活态/发送按钮/focus ring、五色身份点、tool/queue/ctx chip pill 化、warmcharcoal 默认主题切换）不再作为实施依据，正文不保留其条目；细节存档见 CURRENT_UI_AUDIT §8.1。
- v2：按显隐层级与语义分离重写。
- v2.1（本轮）：清除附录覆盖式写法与全部 v1 残留；处置表与宪法/迁移计划一致，视觉参数统一标注为候选；fork 流程改为"发送是唯一主动作"。
