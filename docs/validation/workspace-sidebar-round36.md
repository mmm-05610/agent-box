# Round 36 — 统一 Workspace 左侧栏：实施记录

工单：`docs/architecture/renderer-layer-batches/36-workspace-sidebar-product.md`
分支：`feature/desktop-wsl-round1`（工作树 `../agent-box-desktop-next-wsl-round1`）
基线：`419e0e5`（= c8d59f3 + 工单文档提交）
状态：**进行中**（每阶段提交后更新本记录）

## 阶段 1 — 接缝确认（2026-09-13）

只做定向确认，未重跑全仓盘点。保护路径（`src/agentbox/`、`src/plugins/agentbox-lab/`、
两份文档）全程未读、未改、未暂存。

### 已确认的四个接缝

1. **导航**：侧栏固定导航是 `features/chat/sidebar/sidebar-constants.tsx` 的
   `SIDEBAR_NAV`（new-session / skills="Capabilities" / artifacts / cron 四行），由
   `sidebar-nav-menu.tsx` 渲染；插件页经 `SIDEBAR_NAV_AREA` 贡献（在库内仅 kanban 使用）。
   "Sessions / Bots 页签"来自 `plugins/hermes-bots/plugin.tsx` 的 `id:'pane'` 注册
   （`dock:{pane:'sessions',pos:'center',enforce:true}` 把 Bots 面板钉进左侧栏页签条）。
   底部图标排是 `features/chat/sidebar/profile-switcher.tsx` 的 `ProfileRail`
   （fleet 模式的方块排：layers/网关标记/home/资料方块/＋/导入/…管理）。
   地址（连接切换器）、Gateway、inference 状态、cwd 常驻在**状态栏左簇**
   （`app/composition/registrations/statusbar-items.tsx`），不在侧栏内——工单 before 树
   把它们与侧栏底部排并称，实际载体是窗口底栏；本轮不动状态栏，侧栏内确认无此类常驻项。
2. **角色配置**：核心已有中立的角色页 `/profiles`（`features/profiles/index.tsx`
   `ProfilesView`：列表、新建/重命名/删除对话框、model/skills 摘要、SOUL.md 说明编辑），
   只依赖 `api/profiles` + `store/profile`，**不依赖任何群聊服务**；命令面板与
   `nav.profiles` 快捷键已可达，侧栏无入口。旧插件 hermes-bots 的 `EditProfileDialog`
   （头像+标题+说明+高级配置）同样不 import group-chat 文件，但依赖 `@hermes/plugin-sdk`
   的 host 上下文与插件数据存储（`$botMeta`/`saveBotMeta`）——核心层（features/ 以下）
   现无任何 plugin-sdk 依赖边。**工单"配置部件离不开群聊服务"的停止条件不触发**：
   角色入口复用核心 ProfilesView（名称、说明、已有配置齐全）。
3. **置顶**：`$pinnedSessionIds` + `resolvePinnedSessions`
   （`application/session-lists/session-index.ts`，持久身份为 lineage root id）+
   `session-pin-sync` 未确认写保护；置顶行已可取消、可拖序，点击即原会话——
   全部保留，不复制会话。空态现为占位提示行（`SidebarPinnedEmptyState`），
   按工单改为整节隐藏。
4. **本地目录存储**：本地项目权威是 Hermes 后端 `projects.*` RPC
   （`store/projects/*`，树快照 + 显式项目），"打开文件夹"已有直接完成路径
   `openFolderAsProject()`（pick 目录 → 已有则进入、否则以目录名建项目 → 开始工作会话，
   目录去重靠先刷新树 + `projectIdForCwd`）。现侧栏 ＋ 菜单接的是带命名页的
   `openProjectCreate()`——改为直接路径即可，无命名/确认页，属复刻既有能力而非新模型。
   WSL 侧权威是 Electron 宿主 `userData/wsl-workspaces.json`
   （`wsl-workspace-store.ts`，version=1，原子写、幂等 requestId、损坏 sidecar、
   新版文件保护、并发保存串行化）。**本地打开只创建 Hermes project 记录，不创建
   agent**——阶段 1 停止条件不触发。两存储本轮不做迁移，以中立投影汇合。

### 统一投影方案

- 工作区节 = 同一列表内两级行：本地行（来自 `$projectTree` 后端树，含 Home/自动发现/
  显式项目，行交互=点击进入、行菜单改名/移除/外观、+新建会话、展开预览会话）
  + WSL 行（来自 `$wslWorkspaces` 宿主投影，同级行、同种行 chrome：名称优先 +
  小 WSL 徽标 + 发行版副行，展开=诚实提示"会话尚未接入"，行菜单=重命名/移除/
  连接信息/重连，无新建会话）。两行型别由 `application/sidebar/` 的纯投影函数
  汇合（排序、去重、空态判定），renderer 投影不充当宿主持久化权威。
- 添加入口只有两个：＋「打开文件夹」（本地直接完成）与＋「打开远程文件夹」
  （WSL 简化向导：发行版默认项+可选用户 → 连接为页内加载态 → 浏览 → 选目录即保存，
  保留取消/错误/重试；删除"选择方式"页）。
- WSL 重命名/移除新增宿主持久操作（同名 IPC/preload 受限通道），走同一串行提交链与
  新版保护；移除仅删侧栏记录，不动文件/历史/发行版。
- 角色入口置顶 → `/profiles`；Scheduled jobs 从侧栏（导航行+侧栏 cron 节）退役，
  设置页新增"Scheduled jobs"入口保留原功能与名称（不借改名偷渡为通用功能）；
  底部 ProfileRail 移除（资料创建热键请求改由角色入口接管）；Bots 页签经插件
  停注册页签退役（群聊服务本体不动）；Capabilities/Artifacts/全局 New session
  导航行删除。

### 阶段 2 触碰文件（精确清单）

| 动作 | 文件 |
| --- | --- |
| 改 | `electron/host-capabilities/platform/wsl-workspace.ts`（+renameWorkspace/removeWorkspace，走 enqueueCommit+readStore） |
| 改 | `electron/host-capabilities/platform/wsl-workspace.test.ts`（重命名/移除行为测试，含并发与新版保护不回归） |
| 改 | `electron/ipc/workspace-ipc.ts`（两个新 handle） |
| 改 | `electron/ipc/workspace-ipc.test.ts`（如有） |
| 改 | preload 桥（`wslWorkspace` 面）+ `global.d.ts` |
| 改 | `src/types/workspace.ts`（请求/结果 DTO） |
| 改 | `src/api/workspace.ts`（两个透传） |
| 改 | `src/application/workspace/wsl-workspace-usecases.ts`（投影用例 + 测试） |
| 改 | `src/store/wsl-workspace.ts`（如需投影移除助手） |
| 改 | `src/features/workspace/wsl-workspace-wizard.tsx`（去方式页；连接=页内加载态） |
| 改 | `src/features/chat/sidebar/projects/wsl-workspace-section.tsx`（行菜单：重命名/移除） |
| 改 | `src/features/chat/sidebar/chat-sidebar.tsx`（＋菜单本地项改 `openFolderAsProject` 直接路径） |
| 改 | `src/i18n/{en,zh,zh-hant}.ts` + `types.ts`（新文案三语种） |
| 测 | `src/features/workspace/*` 相关 vitest、`src/application/workspace/*.test.ts` |

### 阶段 3 触碰文件（精确清单，实施时若有出入在此记录）

| 动作 | 文件 |
| --- | --- |
| 改 | `features/chat/sidebar/sidebar-constants.tsx`（SIDEBAR_NAV 内建行退役） |
| 改 | `features/chat/sidebar/sidebar-nav-menu.tsx`（顶部角色入口；贡献行保留） |
| 改 | `features/chat/sidebar/chat-sidebar.tsx`（工作区节统一、REMOTE 节并入、置顶空态隐藏、cron 节退役、ProfileRail 移除、空白态两入口） |
| 改 | `features/chat/sidebar/projects/`（新增 WSL 行组件复用 row chrome；工作区节标签） |
| 改 | `features/chat/sidebar/section-states.tsx`（空态） |
| 改 | `features/settings/index.tsx`（+Scheduled jobs 入口） |
| 改 | `plugins/hermes-bots/plugin.tsx`（停注册 Bots 页签 pane；其余服务不动） |
| 改 | `src/i18n/*`（同上） |
| 测 | `features/chat/sidebar/*.test.tsx` 受影响文件定向跑 |

## 检查点

| 阶段 | 提交 | 内容 |
| --- | --- | --- |
| 1 | （本次提交） | 本接缝记录，无产品代码改动 |

## 已知限制 / 偏差（随阶段更新）

- 角色入口本轮复用核心 ProfilesView：名称/说明/已有配置可编辑；**头像编辑不在本轮
  入口内**——头像部件只在 hermes-bots 插件内，持久化权威是插件数据存储
  （`$botMeta`/`saveBotMeta`，经 plugin-sdk host 上下文）。核心层抽走它需要先有
  中立的 profile 外观持久权威（Work Core 范畴），工单禁止新建第二存储权威。
  精确接缝：`plugins/hermes-bots/data.ts` 的 meta 存储 + `avatar-picker.tsx` 对
  plugin-sdk 的依赖。群聊服务未触碰。
- 地址/Gateway/inference 状态确认常驻于状态栏而非侧栏；侧栏无此内容可移，
  本轮保持状态栏不动（不影响操作错误的呈现，无吞错）。
- 侧栏视图开关（扁平/日期/状态分组等既有 view knobs）不在工单删除清单内，保留。

## 测试与验收（阶段 4 回填）

- typecheck / 定向 vitest / eslint / 层序守卫 / `git diff --check`：待阶段 4。
- Windows 真机用户路径与截图：待阶段 4。
- 行为测试覆盖清单：见工单 §阶段与验证，逐项在阶段 2/3 提交说明中勾对。
