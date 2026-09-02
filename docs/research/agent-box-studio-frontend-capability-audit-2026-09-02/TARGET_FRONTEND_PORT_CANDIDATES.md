# Frontend Port 候选（Phase 1 审计）

> ⚠ 依审计规则：Port 候选必须在事实审计达到足够程度后再逐步形成，**不得第一轮冻结**。
> 本文件当前只有“候选名单 + 首轮证据输入”，无最终形态。
> 每个 Port 只描述上层真正需要的能力，不照抄旧 command。

## 候选名单（初始）

| Port | 首轮证据输入（什么驱动了这个候选） | 状态 |
|---|---|---|
| WorkspacePort（目录/工作区注册与查询） | `workspace:folder-list` 行：`list_open_folder_details`/`list_all_folder_details`/`list_folder_groups` 三命令组；folder 注册表归属未裁决（Q2） | 候选，依赖 Q2 |
| ConversationPort（会话列表与状态） | `workspace:conversation-list`/`workspace:status-live` 行；`list_all_conversations` + 事件通道 | 候选，依赖 Q1（tab 归属影响能力范围） |
| TabsStore（UI 标签集） | `tabs:restore`/`tabs:cross-client-sync` 行；`list_opened_tabs`/`save_opened_tabs`/`tabs://changed` CAS 协议 | 候选，形态完全取决于 Q1 |
| ConnectionPort / 传输健康 | `boot:auth-gate`/`boot:ws-health`/`boot:runtime-transport` 行 | 候选，方向明确：环境选型 + 健康状态 + 认证失效 |
| GitPort（HEAD/分支查询） | `workspace:git-head` 行；`get_git_head` 轮询 vs AB Git plugin | 候选，Phase 9 展开 |
| LaunchPort（深链/启动器直达） | `boot:deep-link` 行；`?folderId&conversationId` + `folder://open-in-workspace` | 候选，依赖 Q1/Q2 |
| 事件通道（EventPort） | L2/L5/L6/L9：firehose vs attach replay、receiver_count 丢帧、WS-ready 门控 | 候选，Phase 4 展开 |

## 排除/暂缓

- `acp_*` 命令族不直接进 Port（acp_update_* 等属 Phase 7/4 范畴，先审语义再定）。
- Folder 的 `update_folder_color`/`update_folder_alias` 等仅当 Q2=A 才需要（sidebar 组织能力）。

## 首轮结论（PROPOSED）

若干小概念倾向（非决策）：
- tab 若保服务器权威（Q1=A），建议 Port 形态是“版本化 tab 快照 + CAS 写 + 变更订阅”，
  即现有协议语义、去掉 `agent_type` 身份（若 Phase 2 解除绑定）。
- workspace 列表若保留（Q2=A），建议查询与事件分离：list + 变更事件，删除墓碑/序号
  过滤属于实现细节，不应进入 Port 契约。