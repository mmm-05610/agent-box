# Codeg 架构审计摘要

> 依据当前源码整理。重点是 Codeg 的真实调用关系和状态所有权，不把 README 的产品描述当作实现。

## 结论

Codeg 本质上是三个东西的组合：

1. 多 Agent ACP 编排器：启动 Agent、维护连接、转发 prompt 和事件。
2. 本地会话索引器：读取各 Agent 的原生 transcript，并映射为 Conversation。
3. 桌面/网页工作台：提供聊天、文件、Git、终端、权限和任务 UI。

Codeg 当前已经拥有一套自己的 session、process、worktree、terminal、permission 和 task 状态。因此接入 Agent-Box 时，最大的风险不是 ACP 协议不兼容，而是两边同时拥有同一类运行时状态。

## 1. 仓库和运行形态

这是一个“单 Rust crate + 单 Next.js 前端”项目，不是多 Rust crate workspace。

```text
src/                         Next.js/React 前端
src-tauri/src/lib.rs         共享 Rust Core
src-tauri/src/main.rs        Desktop binary: codeg
src-tauri/src/bin/
  codeg_server.rs            Standalone server
  codeg_mcp.rs               每个 Agent session 的 MCP companion
src-tauri/src/acp/           ACP Agent runtime
src-tauri/src/db/            SQLite/SeaORM
src-tauri/src/parsers/       Agent 原生历史解析器
src-tauri/src/terminal/      Desktop PTY terminal
```

技术栈：

- 前端：Next.js 16、React 19、TypeScript、Tailwind、Zustand、pnpm。
- Desktop：Tauri 2，Rust 与 WebView 同进程。
- Server：Axum HTTP + WebSocket + Bearer token。
- 存储：SQLite + SeaORM migration。
- 前端是静态导出：`next.config.ts` 设置了 `output: "export"`。

### Desktop

```text
codeg
├── Tauri WebView（前端）
├── AppState / SQLite
├── ConnectionManager
│   └── ACP Agent 子进程
├── TerminalManager / PTY
├── 可选 Axum Web Service
└── 每个 session 的 codeg-mcp 子进程
```

Desktop 主进程是 `codeg`。Web Service 如果开启，也是在同一个 Desktop 进程中启动，不是另一个 Codeg Core。

入口：`src-tauri/src/main.rs`、`src-tauri/src/lib.rs::tauri_app::run`。

### Standalone server

```text
codeg-server
├── AppState / SQLite
├── Axum HTTP + WebSocket
├── ConnectionManager
│   └── ACP Agent 子进程
├── TerminalManager
└── codeg-mcp 子进程
```

入口：`src-tauri/src/bin/codeg_server.rs`。监听端口由 `CODEG_PORT` 控制，默认 Docker 端口为 `3080`。

### Docker

Docker 运行 `codeg-server --supervise`。容器中包含：

- `/app/web`：静态前端；
- `/usr/local/bin/codeg-server`；
- `/usr/local/bin/codeg-mcp`；
- `/data`：持久化数据。

定义：`Dockerfile`、`docker-compose.yml`。

### Mobile

Mobile client 不在本仓库中。它通过 HTTP/WebSocket 连接 Desktop Web Service 或 `codeg-server`。

手机不拥有文件、数据库、Agent process 或 session；这些都留在 Codeg 所在机器。

## 2. Rust Core

共享状态集中在 `src-tauri/src/app_state.rs::AppState`：

- `AppDatabase`
- `ConnectionManager`
- `TerminalManager`
- `WebEventBroadcaster`
- `InternalEventBus`
- `EventEmitter`
- `DelegationBroker`
- `WebServerState`
- workspace、chat channel、update 等状态

Desktop command 和 Server handler 最终都调用相同的 core 逻辑：

```text
Tauri command ─┐
               ├── commands/* core 函数
Web handler ───┘
                     ├── DB service
                     ├── ConnectionManager
                     ├── 文件/Git
                     └── EventEmitter
```

核心模块：

| 能力 | 主要位置 |
|---|---|
| Agent 连接/进程 | `acp/manager.rs`、`acp/connection.rs` |
| ACP 生命周期 | `acp/connection.rs`、`acp/lifecycle.rs` |
| 数据库 | `db/entities`、`db/service`、`db/migration` |
| 文件系统 | `acp/file_system_runtime.rs`、`commands/file_io.rs` |
| Git/worktree | `git_repo.rs`、`commands/folders.rs`、`commands/version_control.rs` |
| Desktop terminal | `terminal/manager.rs` |
| ACP terminal | `acp/terminal_runtime.rs` |
| delegation/MCP | `acp/delegation/`、`bin/codeg_mcp.rs` |
| Web API | `web/router.rs`、`web/handlers/` |

## 3. Agent 和 ACP

Codeg 主要通过 ACP 驱动 Agent，而不是直接解析每个 vendor CLI 的交互协议。

Agent registry：

- 内置 Agent：`acp/registry.rs::builtin_acp_agents`
- 所有 Agent：`acp/registry.rs::all_acp_agents`
- Custom Agent：`acp/custom_registry.rs`
- Custom Agent 持久化：`db/entities/custom_agent.rs`

当前内置 Agent 包括 Claude、Codex、Gemini、OpenClaw、OpenCode、Cline、Hermes、CodeBuddy、Kimi、Pi、Grok、Cursor、DeepSeek、Qoder、Antigravity。

安装/发现支持：

- PATH 中已有 executable；
- npx；
- uvx；
- 下载并校验 binary archive；
- per-version cache；
- version probe。

特别之处：Claude Code 和 Codex 本身不直接提供 ACP，Codeg 使用单独的 ACP adapter；其他内置 Agent 大多是 vendor CLI 自身或 vendor ACP server。

连接流程通常是：

```text
spawn executable
  → initialize
  → 读取 capability
  → 注入/过滤 MCP
  → session/resume
  → 失败则 session/load
  → 再失败则 session/new
  → session/prompt
```

关键符号：`ConnectionManager::spawn_agent`、`spawn_agent_connection`、`run_conversation_loop`。

ACP 可处理：

- streaming text/tool/plan/usage；
- permission request；
- question/elicitation；
- terminal request；
- filesystem request；
- mode/config option；
- cancel、fork、resume/load。

## 4. 一条消息怎样到达 Agent

```text
RichComposer.onSubmit
  → ConversationDetailPanel.handleSend
  → 前端 optimistic runtime state
  → api.acpPrompt(...)
  → Desktop: invoke("acp_prompt")
     或 Web: POST /api/acp_prompt
  → commands::acp::acp_prompt
     或 web::handlers::acp::acp_prompt
  → ConnectionManager::send_prompt_linked_with_message_id
  → ACP session.prompt
  → Agent 进程
```

回复方向相反：

```text
Agent ACP notification
  → connection.rs
  → SessionState
  → AcpEvent
  → InternalEventBus / WebEventBroadcaster
  → Tauri event 或 WebSocket
  → useAcpEvent
  → conversation-runtime-store
  → timeline/tool card/live message
```

前端相关文件：

- `src/lib/api.ts`
- `src/lib/tauri.ts`
- `src/lib/transport/`
- `src/contexts/acp-connections-context.tsx`
- `src/stores/conversation-runtime-store.ts`
- `src/components/conversations/conversation-detail-panel.tsx`

## 5. Conversation、Session、Task

三者不是同一概念：

| 对象 | 所有者 | 身份 |
|---|---|---|
| Conversation | Codeg DB/UI | `conversation.id` |
| ACP session | Agent/ACP server | `conversation.external_id` |
| Codeg connection | Codeg 内存 | `connection_id` |
| Work task | Codeg task engine | `work_task.id` |
| Tab | 前端 | tab id |

`conversation` 的核心字段在 `db/entities/conversation.rs`：

- `agent_type`
- `external_id`
- `folder_id`
- `git_branch`
- `status`
- `parent_id`
- `parent_tool_use_id`
- `delegation_call_id`

数据库没有标准的 `message` entity。消息正文主要来自：

- Agent 原生 transcript；
- Codeg 自己的 ACP transcript；
- live runtime state。

Codeg 自己的 ACP transcript 由 `acp_transcript.rs` 写入，由 `parsers/acp_native.rs` 读取。

重启时：

1. DB conversation 仍在；
2. 内存 connection/process 消失；
3. Codeg 重新启动 Agent；
4. 通过 resume/load/new 尝试恢复；
5. parser 重新读取历史。

Agent 切换不是同一个 ACP session 的 provider 切换。ACP session 与 `agent_type` 绑定，切换 Agent 实际上会进入新的 connection/session 路径。

## 6. Delegation 和 MCP companion

父 Agent 的 MCP 列表中可以注入 `codeg-mcp`：

```text
Agent
  ──stdio MCP──> codeg-mcp
  ──UDS────────> 父 Codeg process
                    → DelegationBroker
                    → ConnectionManager
                    → 子 Agent ACP session
```

子 conversation 使用：

- `parent_id`
- `parent_tool_use_id`
- `delegation_call_id`
- `ConversationKind::Delegate`

子 Agent 有独立 ACP connection、ACP session 和 conversation。父 UI 通过 delegation card 聚合显示，不是把所有 transcript 合并成一个 session。

## 7. Profile、配置和权限

Codeg 有配置能力，但没有统一的 Agent-Box 式 Profile 类型。

配置分散在：

- `agent_setting`：Agent 开关、env、provider、安装版本；
- `model_provider`：provider 信息；
- `custom_agent`：ACP Agent descriptor；
- ACP session mode/config；
- 各 Agent 的 native config 文件；
- keyring/native auth 文件。

主要实体：`db/entities/agent_setting.rs`、`db/entities/model_provider.rs`。

MCP 和认证大量使用 Agent-specific 路径与格式，逻辑集中在：

- `commands/acp.rs`
- `commands/mcp.rs`
- `commands/custom_skills.rs`
- `acp/connection.rs`

权限不是一个持久化 permission entity，而是 live ACP request：

```text
Agent request_permission
  → ConnectionManager pending request
  → 前端权限卡片
  → acp_respond_permission
  → ACP responder
```

## 8. Git、worktree、terminal

### Git/worktree

Codeg 自己执行 Git 命令，并把 worktree 表现为 Folder 关系：

```text
folder.parent_id != NULL  ≈  worktree folder
```

WorkTask 还保存：

- `worktree_folder_id`
- `base_branch`
- `base_sha`
- `work_branch`
- `merge_state`
- `conversation_id`

相关：`commands/folders.rs`、`commands/work_task.rs`、`work_task/`、`forge/`。

但 Agent 也可能在 working directory 内执行 Git，所以 Git authority 并非完全集中在 Codeg。

### Terminal

Codeg 有两套 terminal：

1. `terminal/manager.rs`：Desktop 用户交互 PTY，由 `TerminalManager` 持有。
2. `acp/terminal_runtime.rs`：Agent 通过 ACP 请求的命令执行 runtime，按 ACP session 管理。

Agent process 本身通过 ACP stdio 运行，不依赖 Desktop terminal。

## 9. 持久化模型

SQLite 的 canonical 状态主要是：

- folder/project 索引；
- conversation 摘要、状态、external session id；
- work task 生命周期；
- custom agent；
- agent setting/provider；
- opened tabs。

Agent transcript 是消息正文和部分 usage 的原始来源。`token_usage_turn` 是 parser 同步出的 materialized 数据，不是原始 authority。

Codeg 没有独立的 Evidence 模型。tool card、diff、transcript、usage 都是观察/展示数据，分散在 ACP event、parser、Git 查询和前端 runtime 中。

## 10. 与 Agent-Box 的重叠

| 能力 | Codeg 当前 authority | 耦合 |
|---|---|---:|
| Agent/Harness launch | `acp/registry.rs`、`acp/connection.rs` | 高 |
| Session lifecycle | `ConnectionManager` + `conversation` | 高 |
| Process | `ConnectionManager` + `sacp-tokio` | 高 |
| Worktree | Folder/WorkTask/Git | 高 |
| Terminal | `TerminalManager`、`TerminalRuntime` | 中-高 |
| Permission | ACP connection + 前端 UI | 中 |
| Profile/config | agent_setting + native config | 高 |
| Continuation | resume/load/new + task retry | 中-高 |
| Output | parser + event + runtime store | 高 |
| Evidence | transcript/tool/diff/usage | 中 |
| explicit Finish | conversation/task status | 高 |

## 11. 最小接入缝隙

最小方案是把 Agent-Box 暴露为一个 Codeg custom ACP Agent：

```text
Codeg custom_agent descriptor
        ↓
Agent-Box ACP server/adapter
        ↓
Agent-Box Work / Execution / RuntimeHost
```

至少需要支持：

- `initialize`
- `session/new`
- `session/prompt`
- streaming updates
- `session/cancel`
- permission request
- 最好支持 `session/resume` 或 `session/load`

发现机制上，Codeg 可以不修改就发现 custom ACP Agent。Profile 也可以暂时映射成多个 custom Agent descriptor，或由 ACP config option 承载。

但这样仍会产生双重 authority：

- Codeg 和 Agent-Box 都管理 process；
- Codeg conversation 与 Agent-Box Execution 并存；
- Codeg worktree 与 Agent-Box ResourceRef/Binding 并存；
- Codeg terminal 与 Agent-Box RuntimeHost/Sandbox 并存；
- Codeg permission UI 与 Agent-Box policy 并存；
- Codeg status 与 Agent-Box explicit Finish 并存。

## 12. 下一步验证

下一步应做最小 ACP 黑盒兼容性验证，不先改 Codeg：

1. 用 Agent-Box 实现最小 ACP server。
2. 注册为 Codeg custom agent。
3. 验证 new、prompt streaming、permission、cancel、resume/load、terminal、MCP。
4. 记录 Codeg 实际发送的 ACP JSON-RPC 序列。
5. 再决定哪些状态由 Codeg 保留，哪些必须交给 Agent-Box。

## 源码索引

- Bootstrap：`src-tauri/src/lib.rs`、`src-tauri/src/main.rs`
- Server：`src-tauri/src/bin/codeg_server.rs`
- MCP：`src-tauri/src/bin/codeg_mcp.rs`
- AppState：`src-tauri/src/app_state.rs`
- ACP：`src-tauri/src/acp/manager.rs`、`src-tauri/src/acp/connection.rs`
- ACP 生命周期：`src-tauri/src/acp/lifecycle.rs`
- API：`src-tauri/src/web/router.rs`、`src-tauri/src/web/handlers/acp.rs`
- 前端发送：`src/lib/api.ts`、`src/lib/tauri.ts`、`src/components/conversations/conversation-detail-panel.tsx`
- 数据库：`src-tauri/src/db/entities/`、`src-tauri/src/db/migration/`
- Parser：`src-tauri/src/parsers/`
