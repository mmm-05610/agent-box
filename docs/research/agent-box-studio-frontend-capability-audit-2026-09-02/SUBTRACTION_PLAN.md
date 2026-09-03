# 减法计划 SUBTRACTION_PLAN（v0.1 瘦身）

> 依据：三路代码侦察（前端功能族 / tab 尸体 / Rust 命令家族），全部结论带 file:line。
> 原则：每批独立提交、四关验证（eslint/tsc/vitest/build）；先前端后后端；
> 每批删除前先解耦侦察报告标出的生命线。
> 生成：2026-09-03。批准状态：待用户批准执行。

## 保留生命线（侦察确认，动刀时不得误伤）

- git 只读核心 + clone + 凭据（get_git_head/git_status/git_log/git_diff*/branch 系/
  worktree 系/git_credential）——侧栏、顶栏分支芯片、aux 面板依赖
- aux 面板直接调用的 git 写命令：gitAddFiles/gitCommit/gitCommitFiles/gitNewBranch/
  gitReset/gitMerge/gitRebase/gitAbortOperation/gitContinueOperation
- merge-diff.ts 的 computeLineDiff——被 unified-diff-generator → 会话文件渲染管线引用
- conflict-dialog 的 openMergeWindow 调用——合并冲突解决是核心流程
- closed-tab-stack 全链（重开上次关闭）+ pushClosedTab
- KeptMountedSurface（workbench 路由覆盖时保持会话不断流）+ OverlayHostHiddenProvider
- previewReplacedTabIds 链（侧栏预览替换，非分屏）；use-mobile；ui/drawer（各有 11/8 个消费者）
- import-sessions 整族（api.ts 2091-2118/3024 段 + 窗口注册）
- work_task 引擎（tasks 页保留）+ src-tauri/src/forge/ 核心（work_task/engine.rs:48-52 依赖
  ForgeDelivery——删 forge 时此目录保留）
- delegation（子代理，Claude Code 式在会话内，保留）；background agents（DEFER 不删）

## 批次（按风险从低到高重排）

### R1 · 纯隔离热身（前端）
| 目标 | 文件 | 解耦点 |
|---|---|---|
| 宠物前端 | src/app/pet*、src/lib/pet/、settings/pet-*（5 组件）、PetFocusBridge（deep-link-bootstrap.tsx:105-186 导出+挂载）、quick-actions Show pet 菜单项、lib/pet/api.ts | deep-link-bootstrap 保留文件只删一个导出 |
| 备份 | settings/backup-settings.tsx（713 行）、api.ts 4871-5135 段、system-network-settings.tsx:17,783 挂载 | 无 |
| Token 报表页 | components/token-usage/（约 3500 行）、lib/token-usage.ts、route union "tokenUsage"、workbench-content 注册、status-bar-stats.tsx:49 按钮 | 状态栏计数器独立保留（lib/token-speed 等不动） |
| project_boot 后端死路由 | router.rs:1100-1116 + commands/project_boot.rs + handlers/project_boot.rs + windows.rs:1182 | 死命令 5/5，无调用方 |

### R2 · tab 尸体（约 2000+ 行，8 步安全序）
1. detail panel 摘 `<TabDragGhost/>`（2853）+ isSplit 分支（2700-2705）
2. detail panel 改单会话直通：删 SplitStripCornerReserve（2231-2255）、分屏订阅（2269-2280）、
   computeRects 族（2529-2578）、renderTabWrapper/renderGroupShell（2594-2751）；保留 2767-2777
   单头 + ContextMenu + ConversationTabView；isTransientUnmount 改恒 false
3. tab-store 摘编组机器：groupLayout/groupOf/groupSelection/tileByGroup/tabDrag 字段、
   splitTab/moveTabToGroup/dissolveGroup/unsplitAll/reorderGroupTabs/closeOtherTabs/
   toggleGroupTile/resizeGroupSplit/updateTabDrag/endTabDrag 动作、TAB_GROUPS_STORAGE_KEY blob、
   applyGroupInvariants、groupOfTab/isReparentUnmount 导出、死旗 remoteActivationPending
   （+layout.tsx:1134 guard）
4. 删 src/components/tabs/ 整目录（tab-bar 429/tab-item/tab-drag-ghost+测试）
5. 删 lib/tab-group-layout.ts(+test)、lib/tab-drag-drop.ts(+test)、group-split-handle.tsx、
   tile-scroll-container.tsx、group-shell-reconciliation.test.tsx
6. draft 恢复路径去 groupOf 合并（保 mergeRestoredDrafts 本体）
7. closed-tab-stack 回归（reopen 快捷键 + tab-store-reopen-record.test）
8. 全量 grep：groupOf|groupLayout|tileByGroup|splitTab|TAB_GROUPS_STORAGE_KEY

### R3 · 长尾页前端
| 族 | 关键解耦 |
|---|---|
| 聊天频道 | notification-sound-settings.tsx 复用 ChatChannelSettings.events i18n key → 先迁移 key |
| 快捷消息 | composer：use-composer-shortcuts.ts:106-118、message-input:2074-2105、composer-add-menu:181-200 摘除 |
| 画布 | 侧栏三件套（NAV_ITEM_ICONS/SIDEBAR_NAV_ITEM_IDS/可见性 prefs）+ route union + 注册表 |
| forge 前端 | version-control-settings.tsx:610-625 的 AddForgeAccountDialog 迁移；tasks 的 forge chip 仅语义残留可留；workTaskCreateFromForge 随删 |
| feedback 入口 | conversation-detail-panel:53-56,1933,1943,2195 摘除；**check_user_feedback 渲染卡片保留**（消息管线，agent 工具结果） |

### R4 · composer/欢迎页重构（office/science/experts 摘除）
- 重写 quick-actions.tsx（653 行，欢迎页三 chips 直接引用三族）
- use-composer-shortcuts.ts:17-21,97-176、composer-commands.ts（expert badge）、
  composer/suggestion/adapters.ts、reference-badge、use-reference-search 摘除
- skill-packs-settings.tsx 三 tab 收缩、custom-skills-settings.tsx、use-enabled-skill-ids、
  skill-agent-matrix 清理
- 文件面板：office-preview.tsx 删除后 .docx/.xlsx 无预览，file-workspace-panel:2152-2154 与
  workspace-context:1144-1325 改降级分支
- science-settings/experts-settings 引用的 pickLocalized 工具函数迁至通用位置

### R5 · Git 工作台（修正版：删 3 留 1）
- 删：/commit /push /stash 三路由 + commit-dialog(1319)/push-workspace(858)/stash-dialog(121)/
  unstash-dialog(539) + use-git-quick-actions 的 stash 分支 + api 的 gitStash*/gitPush*/三个
  openXxxWindow + tauri.ts:802-1040 镜像
- **保留 merge 路由**：conflict-dialog:139 调 openMergeWindow，三窗冲突编辑器是 gitMerge/gitRebase
  （branch-dropdown 在用）的冲突出路；merge-workspace 的 petCelebrate 引用随 R1 宠物删除一并清理
- merge-diff.ts 不删（被 diff 管线引用）

### R6 · 移动端壳 + i18n 收缩
- layout.tsx:1091 移动分支、MobileFolderWorkspaceShell（515-605）、MobileWorkspaceContent
  （465-513）、folder-title-bar.tsx；use-mobile/drawer 保留
- i18n：删 8 语言 json；next.config.ts:12-25 locales→en/zh-CN；lib/i18n.ts 三表、
  messages.ts switch、system-network-settings 语言选择器、date-fns-locale.ts、types AppLocale 同步

### R7 · 后端 Rust 大扫除
每个死命令动 3 处：router.rs 路由行 + lib.rs invoke_handler 行 + commands 函数体。
| 族 | 处置 | 特殊注意 |
|---|---|---|
| project_boot | 删（R1 已做） | — |
| pet 后端 | 删 commands/pet.rs、handlers/pet.rs、pets/、pet_state_mapper(1685)、pet_sessions、models/pet | **AppState.pet_state 字段 + backgrounds 引用 + lib.rs 生命周期**需同改 |
| chat_channel 后端 | 删 chat_channel/ 目录(18 文件)、commands/chat_channel.rs(892)、handlers、models | **AppState 的 ChatChannelManager**（app_state.rs:8,29,96 + lib.rs:63,247,516,522）；sender_context 疑似被 import_session 复用，删前 grep |
| quick_messages 后端 | 删 5 文件 + 路由 1270-1286 | 低风险 |
| canvas 后端 | 删 commands/canvas.rs(1680)、handlers、models + 路由 267-295 | canvas_node 表有外键；v0.1 不做 drop migration，表留存 |
| office 后端 | 删 commands/office_tools.rs(1773)、office_watch/、office_watch_proxy + 路由 1043-1095,1635-1643 | lib.rs:1511 的 watch 生命周期 |
| science/experts 后端 | 删 commands/science.rs(1001)/experts.rs(1181)、handlers、science//experts/ 资源包 | 勿伤 custom_skills 共享模式 |
| feedback 后端 | 删 commands/feedback.rs、handlers + 路由 68-79 | 低 |
| backup 后端 | 删 commands/backup/、handlers/backup.rs + 路由 538-556,1626 | tests/backup_api.rs 同删 |
| forge 后端 | 删 commands/forge.rs(1677)、handlers/forge.rs + 路由 1400-1441 | **src-tauri/src/forge/ 核心保留**（work_task 引擎依赖）；work_task_create_from_forge/lookup_by_source 两路由保留（tasks 在用） |
| token_usage 后端 | **暂缓**：token_usage_sync 由 ACP turn 写入（lib.rs 有引用），表留；仅报表面待 R3 前端删后观察 | — |
| git 工作台后端 | 摘 commands/folders.rs 内 stash/push 族函数 + 路由 + 窗口（windows.rs:599,865,909,975,988,1034,1093） | **实现内嵌 folders.rs，摘函数不删文件**；git_credential 是 clone 生命线 |
| 已查死路由 | 顺手清：workspace 文件传输 5 条(523,528,556,560,1622)、add_folder_to_history(299)、list_open_folders(171) | /ws/events(1670) 是核心通道，**勿删** |

## DB 处置
v0.1 不写 drop migration：chat_channel*/quick_message/canvas_node/token_usage* 表留存（无害）。
后端实体/服务代码随 R7 删除后表成为孤儿，v0.2 统一清理。

## 预计净删除量
前端 ≈ 25,000+ 行（含 forge 7300+测试 4000、canvas 5600、office/science/experts ≈2500、
git 工作台 ≈3200、宠物 ≈2900、token 报表 3500、tab 尸体 2000+、移动壳+i18n 若干）
后端 ≈ 10,000+ 行（commands + handlers + pets/ + office_watch/ + chat_channel/ 等）

## 验证
每批四关（eslint/tsc/vitest/webpack build）+ R2/R7 后各加一轮全量 grep 验收。
