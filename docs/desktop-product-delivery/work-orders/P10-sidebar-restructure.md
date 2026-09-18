# P10 — 侧栏重构：动作区 / 分组切换 / 项目→会话两级 / 行内时间与状态

基线：P07 之后（`default_execution: serial`，实际会排在 P08/P09 之后）。
本单只改**侧栏**；输入条（P08）与会话区（P09）不动。

```text
之前
├── sidebar/chrome.tsx            ⚠ 有 section 与 + 按钮，但没有"动作区"
├── sidebar/{gateway-groups, cron-jobs-section, projects, agentbox-sessions}  ⚠ 并列 section，无统一分组视图
└── agentbox-sessions/*-row.tsx   ⚠ 行内有 pinned/排序，但没有行内"相对时间 + 状态"
之后
├── 动作区                        ◀ 新建任务 / 搜索（沿用现有命令面板与 keybindings）
├── 分组切换                      ◀ 按项目 / 按最近（**只做有数据来源的维度**）
└── 项目 → 会话 两级列表           ◀ 行内：标题 + 相对时间 + 状态点（运行中 / 未读 / 已归档）
```

## 目标

按参考形态把侧栏做成"动作区 + 分组切换 + 项目→会话两级 + 行内元信息"；
**尽量用现有组件**（shadcn/radix 与本仓既有 sidebar 件），**不引新库**
（侧栏不是对话组件，AI Elements 那类帮不上）。

## 现状（第一手，动手前复核）

- 已有：`sidebar/{chat-sidebar, chrome, filter-menu, reorderable-list, load-more-row,
  connection-switcher, profile-switcher, cron-jobs-section, gateway-groups}.tsx`；
  `sidebar/agentbox-sessions/{agentbox-session-list, agentbox-session-row, agentbox-global-sessions}.tsx`
  （排序 = pinned 优先、再按 `updatedAt`，有测试）；`sidebar/projects/{workspace-group, workspace-header,
  overview-row, project-menu}.tsx`；命令面板与 keybindings 在
  `app/composition/registrations/command-palette/**` 与 `keybindings.ts`。
- 数据：`sessions.list` 带 `displayName`/`pinned`/`archivedAt`/`createdAt`/`updatedAt` 与 `workspaceId`
  → **两级分组与相对时间零后端改动**；运行中状态来自 turn 事件（`cron-jobs-section` 已在用
  `state === 'running'` 的脉冲点）。
- **没有的数据**：**未读**（wire 无已读游标）→ 用**客户端本地游标**实现并在 UI 上不夸大；
  **"插件市场"** 没有后端面 → **不做**；参考图里"自动化"我们已有 cron 段，**合并进来**即可。

## 阶段

**A 盘点与决定（不改代码）**：列出侧栏现有全部 section 与它们的去留（保留/合并/折叠/移除），
产出"参考元素 → 我们用什么实现 → 数据来源"三栏表（进 evidence）。**没有数据来源的元素不实现**。

**B 结构**：动作区（新建任务 = 现有新建会话路径；搜索 = 打开现有命令面板；快捷键沿用
`keybindings.ts`，**不新造绑定**）；分组切换（按项目 / 按最近；**不发明第三个维度**）。

**C 两级列表**：项目组头（沿用 `workspace-group`/`workspace-header`）+ 会话行（沿用 `agentbox-session-row`），
行内补：**相对时间**（由 `updatedAt` 客户端格式化，不新增字段）、**状态点**（运行中 / 未读 / 归档）。

**D 保留既有行为**：重排、拖拽、加载更多、过滤菜单、上下文菜单、profile / connection 切换
**行为与测试全部保留**（这些是既有资产，不是负担）。

**E 回归与收口**：既有侧栏用例（chrome / gateway-groups / filter-menu / load-more / order /
reorderable / project-menu / workspace-header / agentbox-session-*）不得退化；补两级列表与相对时间的
定向用例；更新 status/evidence；释放写权。

## 门

| 门 | 断言 |
| --- | --- |
| **G1 三栏表** | 参考的每个元素都有"实现方式 + 数据来源"或明确标注"不实现（无数据）" |
| **G2 无新库** | 不新增依赖；组件来自现有 shadcn/radix 与本仓件 |
| **G3 数据不发明** | 未读 = 本地游标（标注为本地可见性，不代表服务端事实）；不显示任何无来源的状态 |
| **G4 行为保留** | 重排/拖拽/加载更多/过滤/右键/profile 与 connection 切换的既有用例全绿 |
| **G5 不退化** | 既有 JS/e2e 用例计数不降；保护路径零改动；**后端仓零写入**；不碰 main、不 merge、不 push |

## 范围与调度

写集：`docs/desktop-product-delivery/**`、`apps/desktop/src/features/chat/sidebar/**`、
`apps/desktop/src/features/chat/index.tsx`、`apps/desktop/src/store/**`、`apps/desktop/src/i18n/**`、
`apps/desktop/e2e/**`、`tests-js/**`。保护路径与保护规则见 manifest；单 Windows 构建槽；
按 `handoff-policy.md` 取放写权。

## 边界

- **不做**：插件市场（无后端面）、参考图里我们没有数据来源的分组维度、侧栏之外任何区域。
- **不改后端**（本单零合同变更）。
