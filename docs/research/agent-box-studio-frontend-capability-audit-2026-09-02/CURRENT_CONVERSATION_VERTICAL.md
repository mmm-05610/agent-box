# Conversation Vertical（Phase 1 审计）

> 完整 vertical 目标：启动 → workspace → harness/agent 选择 → conversation 创建 →
> live connection → prompt → event stream → permission → turn complete → persistence
> → reopen → reconnect → continuation。
>
> Round 1 只覆盖「启动 → Conversation 列表可见」段。后续 Phase 逐段补完。
> 每段标注完成度。

## R1 段：启动 → Conversation 列表可见（已审，Round 1）

### 步骤链

```text
1. 环境选型        detectEnvironment() → "tauri" | "web"（__TAURI_INTERNALS__ 探测）
                   remote window: ?remoteConnectionId → RemoteDesktopTransport
2. 认证门(web)     localStorage codeg_token → POST /api/health → 401 清 token /login
3. Provider 层     RemoteConnectionGate → UpdateProvider → AppWorkspaceProvider
4. 数据 bootstrap  fetchFolders（3 命令同批）∥ refreshConversations
5. Tab 恢复        hydrate → list_opened_tabs → merge 本地 drafts → activeTabId
6. 事件订阅        conversation://changed、conversations://bulk-changed、folder://changed、
                   folder-group://changed、tabs://changed、acp://event（全局）
7. 首屏渲染        Sidebar（folders+conversations）｜ ConversationDetailPanel（空态或活动 tab）
8. Git HEAD 轮询   active folder 就绪后 get_git_head（10s/60s）
9. 断线自愈        WebConnectionGuard 4s 宽限弹框；reconnect → refetch folders/conversations/tabs
```

### 关键不变量（启动段）

- OBSERVED：broadcaster 在 `receiver_count == 0` 时丢弃事件（event_bridge.rs:44-56）→ 断线窗口丢的事件由“重连后全量 refetch”收敛（app-workspace-context.tsx:89-94, 173-178）。
- OBSERVED：Web 模式 HTTP command 受 WS `__ready__` 门控（web-transport.ts:117-139），避免与 `receiver_count==0` 竞态。
- OBSERVED：`list_opened_tabs` 失败 ≠ tabs 空：禁止修剪/写 blob/推空集；`tabsSnapshotLoaded` 是解锁门（tab-store.ts:2051-2081, 682）。
- OBSERVED：schema 层面 `folder.git_branch` 恒 null → 分支只能靠轮询（app-workspace-store.ts:872-877）。
- INFERRED：启动期 activeFolderId 从 activeTabId 派生；无任何独立持久化（tab-context.tsx:100-102）。首帧 activeFolder 可能为 null（无 tab 恢复时），此时 git 轮询不启动（app-workspace-context.tsx:226-228）。

### 启动段挂起的语义问题（导入 Phase 2+）

- conversation 的 `agent_type` 是 rows 与 tabs 身份的一部分（`conv-{folderId}-{agentType}-{conversationId}`）——Phase 2 的「Harness/Profile 自由选择」会直接动摇 tab 身份字段。
- `status` 三通道收敛（acp 事件 / conversation://changed / 全量 refetch）——Phase 4 事件审计统一处理。
- folder 三合一（cwd authority + sidebar 组织 + git 上下文）——Q2 决定 AB 侧归属。

## R2 段：新建会话 → 第一轮响应（UI 走查观察，2026-09-02，代码级验证待 Phase 2/3）

用户实机操作（Codeg Windows v0.29，Desktop/AppData 文件夹）确认的链路：

```text
草稿标签(新建会话) → 选 agent（Claude Code / Codex）→ 输入首条消息 → 回车
  → create_conversation：DB 会话行建立；侧栏文件夹分组 + 最近 同时出现该行
  → 草稿标签转正：标题自动取自首条消息（title 自动派生，手动改名后锁定）
  → 后端拉起该 agent 的连接（cwd=文件夹路径）
  → 消息送入 → 事件流回流 → 转写按轮次分段渲染（思考块/文本/工具卡片/耗时）
```

UI 确认的运行中状态扇出（同一事实 5 个渲染面）：
侧栏会话行 spinner、文件夹计数徽标、标签圆点（黄=运行中；绿/蓝/红语义待 Phase 4 对码）、
composer 占位文字（"Codex 正在响应…"）+ 红色停止按钮、"生成中｜N 秒"计时片。

UI 确认的工具渲染三层模型：汇总胶囊（一轮聚合统计）→ 单工具卡片（图标+人话标题+
状态徽章，标题为前端翻译层产物）→ 可展开详情体（如终端命令块）。
观察候选 bug：终端命令显示路径含未剥离的转义（`C:\\WINDOWS\\...` 双反斜杠）。

UI 确认的续聊：同会话第二轮保留上下文（native session 承载，前端不存上下文）。
UI 确认的配置：Codex 会话使用自定义模型 DeepSeek V4 Flash（供应商配置归属 → Phase 7）。

## R3 段：权限请求（UI 走查观察，2026-09-02，Phase 5 正式审计待做）

实机观察（Codex，权限档 "Ask for approval"，请求创建 hellomqh.txt）：

- 权限卡内联在转写流中（非模态弹窗）：标题 "Make edits?" + 说明 + **diff 预览内嵌**
  （"修改 hellomqh.txt +1 -0" 绿色 +hi 行）+ 选项按钮组 + 右上角 "edit" 小按钮。
- **选项按钮为 agent 原文直通**：Codex 的英文选项原样渲染（"Yes, proceed" /
  "Yes, and don't ask again for these files" / "No, and tell Codex what to do
  differently"），第三项含 agent 名 "Codex"。工具卡片标题有翻译层（Read→读取），
  权限选项没有 → 中文界面出现英文按钮（用户裁决反馈：“好丑”）。
  → Phase 5 待裁决：权限选项是否归一化为 Agent-Box 自己的词汇表 + i18n。
- 请求即预览原则（diff 先行）值得保留。
- 生成状态片实时统计：生成中｜N 秒｜1F +2/-0（文件变更）｜2.8 tok/s（输出速度）——
  均由事件流前端计算（use-token-output-speed 一类）。
- 权限进行中 composer 同时显示 "Codex 正在响应…" + 停止键（会话仍是 running 态）。
- 批准后（"Yes, proceed"）：权限卡**彻底消失**，转写无批准痕迹（无"已批准"记录行），
  轮次无缝续跑至完成（"工作了 19 秒"）。→ Phase 5 待裁决：决策是否应留痕于转写。
- 轮末产物卡片："新增文件｜N 个文件"汇总卡（每文件 +/- 行数 + 外部打开按钮）。
- 熄灯一致性：轮完成后侧栏 spinner→相对时间、文件夹徽标清零、标签点黄→蓝、
  composer 恢复、停止键→发送键，五处订阅者同步收敛无残留。

## R4 段：重启恢复（UI 走查观察，2026-09-02，Phase 6 正式审计待做）

用户完全退出并重开 Codeg Windows：**四类状态全部原样恢复**。

| 状态 | 存储层 | 恢复方式 | Agent-Box 裁决 |
|---|---|---|---|
| 文件夹/项目列表 | 服务器 DB（folder 表） | 启动 fetch | 保留（D-003 Project 注册表；Q2 定归属） |
| 会话转写 | 磁盘 native session 文件（agent 原生格式） | 重新解析渲染 | 保留——磁盘格式是 source of truth，前端是投影 |
| 标签页集合 | 服务器 DB（opened_tabs + CAS） | list_opened_tabs | REMOVE（D-005 → session:restore-last） |
| 草稿标签 | 本机 localStorage | blob 恢复 | REMOVE（单会话模式下"新建"恒为活页面） |

关键原则（OBSERVED）：转写恢复 = 从 native session 文件重新解析，非前端状态恢复；
前端崩溃/重启零损失。Agent-Box 继承此原则。

## 未审段（占位）

| 段 | 状态 | 所属 Phase |
|---|---|---|
| workspace/harness 选择、conversation 创建 | 未审 | 2 |
| prompt/composer/队列 | 未审 | 3 |
| 实时会话（attach/snapshot/replay/reducer） | 未审 | 4 |
| permission/question/plan approval | 未审 | 5 |
| 持久化/reopen/reconnect/continuation | 未审 | 6 |
| Profile/Harness 设置 | 未审 | 7 |