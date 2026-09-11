# ACP 解耦第一阶段设计（Desktop 侧）

本文只做调查与设计，不含任何生产代码改动。所有结论都尽量给出可核对的出处；凡是我没能确认的，一律标注为"未确认"，不写成事实。

**阅读前提。** 本文是 `docs/architecture/` 系列的第 9 篇（前 8 篇见 `README.md`）。与前面几篇的关系：`01`/`03` 给出 Desktop 的当前耦合事实，本文把它转化成 ACP 时代的边界、切法与验收。**本文不设计 AgentBox 接入，也不为 AgentBox 预留任何接口**——这是第二阶段的事，见 §10 的非目标。

---

## 0. 事实基线与范围

### 0.1 两个 CLI 都存在，且是两种不同的东西

| 事实 | 证据 |
|---|---|
| `hermes serve` 存在 | `hermes_cli/main.py:345` 从 `subcommands/dashboard.py` 引入 `build_serve_parser`，`:2930` 构造它；`:2599` 的保活子命令集合含 `"serve"`。Desktop 侧也有实测：E2E 日志 `[backend] \`serve\` supported for existing Hermes CLI` |
| `hermes acp` 存在 | `hermes_cli/subcommands/acp.py:10-34`（`build_acp_parser`），`hermes_cli/main.py:3248` 接入；入口另见 `pyproject.toml:394` `hermes-acp = "acp_adapter.entry:main"` |

> 一条上游审计给我的结论是"v2026.9.7 没有 `serve` 子命令"，我核对了源码后确认那是**错的**（`serve` 与 `dashboard` 共用 parser）。这类错误如果写进设计会直接毁掉方案，所以把核对过程留在这里。

两者的形态完全不同，这是本文最重要的一条事实：

- `hermes serve`：常驻 HTTP + WebSocket 服务，一个进程对多会话（Desktop 现在的 `Gateway` 走的这条）。
- `hermes acp`：**stdio 上的 ACP agent**，一个进程对一个客户端连接（`acp_adapter/entry.py:201` 的 `acp.run_agent(agent, use_unstable_protocol=True)`），stdout 被 JSON-RPC 独占（`entry.py:58-71` 把日志全部改道 stderr）。

### 0.2 协议版本错位（必须先知道，否则会设计出假接口）

| 侧 | 版本 | 模型选择 |
|---|---|---|
| Python `agent-client-protocol`（Hermes 用） | `pyproject.toml:283` 钉 `agent-client-protocol==0.9.0`，走 `[acp]` extra，`PROTOCOL_VERSION = 1` | **有** `session/set_model`（unstable）+ 会话响应里的 `models` 字段；Hermes 已实现（`server.py:929-939`） |
| TypeScript `@agentclientprotocol/sdk` | `1.4.0`，schema `schema-v1.21.0`，`PROTOCOL_VERSION = 1` | **没有** `set_model`，`NewSessionResponse` 里也没有 `models`；改由 `providers/*`（unstable）+ `configOptions`/`session/set_config_option` 表达 |

也就是说：**"模型选择"在 ACP 里不是稳定能力，而且两个 SDK 世代的方向相反。** 任何"用 ACP 统一模型选择"的设计都必须接受：它要么走 capability negotiation，要么走 `_meta`，要么在 Phase 1 里继续由 Hermes 专有通道承担。参见 §3 与 §10 的 D-A。

---

## 1. 上游源码审计

五个项目全部 `--depth 1` 浅克隆到 `/tmp/acp-audit/` 只读审计。**浅克隆下 `git rev-list --count` 恒为 1，不是提交数**，因此下面的"成熟度"只看代码与发布物，不引用提交数。

### 1.1 汇总

| 项目 | commit | 许可证 | 栈 | 它对我们最有用的一点 |
|---|---|---|---|---|
| `formulahendry/acp-ui` | `cd9c3cb464a4b321bff652101953a64c07473e31` | **MIT** (`LICENSE`, Jun Han 2026) | Tauri 2 + Vue 3 + Pinia，`src/` 约 8.5k LOC | 数据驱动的 `agents.json`（含 transport 字段）；反面教材很多 |
| `iOfficeAI/AionUi` | `6744099b279b991c17e31c243f0920477bd31cb6` (v2.2.2) | **Apache-2.0** (`LICENSE`) | Electron 37 + React 19 + electron-vite，`packages/desktop/src` 约 153k LOC | ACP 协议核心**不在 Electron 里**；agent 目录是后端 DB 表 + `try-connect` 探测 |
| `agentclientprotocol/typescript-sdk` | `c88bb0da97fe1059d4e3032df2724bf39c96f3d2` (v1.4.0) | **Apache-2.0** (`LICENSE`；注意 `package.json:19` 声明的 `LICENSE-APACHE` 在仓库里不存在) | TS，schema 由 `schema/schema.json` 生成 | 权威线格式：15 种 `session/update`、`ToolCall`、`StopReason`、`_meta` 保留位 |
| `AcpKit/acp-kit` | `c29c49a375f10a09b703039f161229a83204f45a` | **MIT** | 纯 TS ESM，`packages/core` 约 27.7k LOC（含测试） | `AgentProfile` 形状 + 类型化 `normalize` 层 + fail-closed 权限 + 会话恢复策略 |
| `zed-industries/zed`（稀疏：`agent_ui`/`acp_thread`/`agent_servers`/`project`） | `595d62863e8a6f2d8353835abe94502ee2a08139` | **GPL-3.0-or-later**（+ Apache-2.0 双许可） | Rust，四 crate 约 224k LOC | 最成熟的 ACP 客户端：能力→trait 方法默认"不支持"的双重门 |

### 1.2 许可证约束（这会直接限制我们怎么用）

本仓库是 **MIT**（`LICENSE`，Nous Research）。因此：

- **MIT（acp-ui、acp-kit）与 Apache-2.0（typescript-sdk、AionUi）：可以借鉴甚至移植**，Apache-2.0 需保留 NOTICE/版权头。依赖引入遵守根 `AGENTS.md` 的 Dependency Pinning Policy（带上界、必要时 CI 钉 SHA）。
- **Zed 是 GPL-3.0-or-later：不能复制任何代码进本仓库。** 只允许学习其**设计模式**（能力门、会话注册时机、内容合并），不得搬表达式。这一点必须写进实施约束，否则第一阶段很容易踩雷。

### 1.3 逐项：核心目录与可复用机制

**Zed —— 唯一值得当"参考实现"读的客户端。**
`crates/acp_thread`（约 15.5k LOC）持有 harness 无关的 `AgentConnection` trait（`connection.rs:94-400+`）与线程/工具调用模型；`crates/agent_servers`（约 6.1k）里的 `acp.rs`（5,069）是全部 ACP 客户端逻辑。关键机制：

1. **能力 → trait 方法 → 默认"不支持"**，且调用点再拦一次。`connection.rs:108` `fn supports_load_session(&self) -> bool { false }`，`acp.rs:1746` 用 `self.agent_capabilities.load_session` 覆写，`acp.rs:1772` 在 `load_session` 内部再判一次并返回 `LoadError::Other("Loading sessions is not supported by this agent.")`。**能力缺失是把入口拿掉，不是调用时才失败。**
2. **精确钉版本 + 版本下限检查**：`Cargo.toml:521` `agent-client-protocol = { version = "=2.0.0", features = ["unstable"] }`；`acp.rs:1020` 做 `UnsupportedVersion` 判定。
3. **只声明自己真的实现了的**：Zed 实现了 `fs/*` 与全部 `terminal/*`（`acp.rs:766-790`、`:4683`、`:4718`、`:4903`）。
4. **先注册会话再等 RPC 返回**，否则 `session/load` 的重放通知无处可去（`acp.rs:1233`、`:1284` 的注释与 `:1268-1290`）。历史由 agent 重放，Zed 只存元数据（`thread_metadata_store.rs:309` 的 `ThreadMetadata`）。
5. **`tool_call_update` 用 zip+truncate 合并而非整体替换**（`acp_thread.rs:1020-1046`）。
6. **乐观用户消息 + 回声抑制**（`acp_thread.rs:2599-2628`）。
7. **崩溃即错误，不是挂起**：子进程退出状态与连接 future 赛跑（`acp.rs:968`），退出后向所有线程发 `LoadError::Exited`（`:1542`、`:1547`）。
8. **每 agent 的特例只有两处**，用 agent-id 字符串比较，且带 TODO：`custom.rs:230-256`（Claude 强制密钥提示、Codex 转发密钥、Gemini 注入 `SURFACE=zed`）与 `acp.rs:772`（Cursor 的 `parameterizedModelPicker`）。**没有 per-agent 插件机制**——包容方式是"集中 + 表驱动 + 注释"。

**acp-kit —— 最值得抄形状的库（MIT，可移植）。**

- `AgentProfile`（`packages/core/src/agents.ts:7-28`）：`id / displayName / command / args / fallbackCommands / env / startupTimeoutMs / filterStdoutLine`。`filterStdoutLine`（丢掉吵闹的 banner 行）与 `fallbackCommands` 对我们直接有用。
- **类型化 normalize 层**（`normalize.ts:140-322`）把 `session/update` 收敛成 `RuntimeEvent` 判别联合，并容忍 agent 实际发出的别名（`agent_reasoning_chunk`/`thinking_chunk`）；`default` 分支静默 `return []`（`normalize.ts:320-321`）——**这是它的缺点，我们要改成记录 unknown**。
- **fail-closed 权限**：无处理器时默认 Deny（`runtime.ts:189`、`:946`）；`selectPermissionOptionId(decision, options)` 把三态决策映射到 agent 给的任意 option id。
- **出站能力按实现存在性计算**：五件 terminal 处理器齐全才声明 `terminal`（`runtime.ts:552-560`）。
- **会话恢复策略**：`session-recovery.ts:48-59` 只在错误可证是"会话不存在/过期"时才回落 `newSession`，传输/超时/鉴权错误一律抛出——**避免静默丢掉现场**。
- 有 wire 录制/重放与真实 agent 的 gated e2e。

**acp-ui —— 反面教材密度最高（MIT）。**

- 好的：数据驱动 `AgentConfig`（`src-tauri/src/config.rs:33-50`，含 `transport`/`command`/`args`/`env`/`url`/`headers`），`agents.json` 可被用户编辑；`terminal/*` 完全没实现时对 `fs/*` 返回 `-32601`（`src/lib/acp-bridge.ts:206-219`）；有流量监视器。
- 坏的（逐条别学）：**用 SDK 只当类型、JSON-RPC 手搓**（`acp-bridge.ts:139-262`），`implements Client` 只是装饰；**忽略 `plan`**（`stores/session.ts:253-254` 落到 `Unhandled session update`）；`tool_call_update` 只拷 `status`/`title`（`:220-221`）导致工具输出不可见；**权限解析器只有一个槽位且无超时**（`acp-bridge.ts:357-403`），并发请求互相覆盖、agent 永久挂起；**没有本地 transcript**，agent 不重放就没历史；不发 `promptCapabilities`（`stores/session.ts:401-416`）；硬编码第三方遥测凭据（`src/lib/telemetry.ts:8`）。

**AionUi —— 想清楚了"协议核心在进程外"（Apache-2.0）。**

- ACP 客户端**不在 Electron 里**：根 `package.json:53` 声明了 `@agentclientprotocol/sdk` 却全仓无 import（误导！），真正的实现在独立 Rust 二进制 `aioncore`（`package.json:264` 钉 `aioncoreVersion`），Electron 只 `spawn` 它（`packages/web-host/src/backend-launcher.ts:690`）并立即关掉 stdin（`:702`），两边走 HTTP + WS。
- **agent 目录是后端 DB 表**，经 `GET /api/agents/management` 暴露，类型见 `renderer/utils/model/agentTypes.ts:85`（`AgentMetadata` 含 `command`/`args`/`env[]`/`agent_type`/`available`/`handshake`）；自定义 agent 有 CRUD（`ipcBridge.ts:1126-1197`），并有 `try-connect` 探测能区分 `fail_cli` 与 `fail_acp`。
- **保守的能力探测**：`getSupportedMcpTransports()`（`agentTypes.ts:263-282`）读 `handshake.agent_capabilities...`，`undefined` 视为"未知"而非"没有"；fork 能力缺失就直接隐藏入口（`forkConversation.ts:10-29`）。
- **会话态一律按 conversation 作用域**（`extra.acp_session_id` 等，`common/config/storage.ts:237-292`），这是它多 agent（teams）能成立的原因。
- 隔离是**结构性**的：`TChatConversation` 联合 + 每 runtime 一个目录 + 每功能一个 HTTP 命名空间；但**没有强制的接口边界**。

**typescript-sdk —— 线格式的权威来源。**

- `schema/schema.json`（8,879 行）是唯一真源，由 `scripts/generate.js:13` 钉 `CURRENT_V1_SCHEMA_RELEASE = "schema-v1.21.0"` 从上游 release 下载后经 `@hey-api/openapi-ts` 生成；`src/acp.ts` 导出 `ClientSideConnection`/`AgentSideConnection`，传输用 `ndJsonStream`。
- `PROTOCOL_VERSION = 1`（`src/schema/index.ts:323`），文档原话是"只有破坏性变更才升版本，非破坏性变更走 capability"。
- **15 种 `session/update`**：`user_message_chunk`、`agent_message_chunk`、`agent_thought_chunk`、`tool_call`、`tool_call_update`、`plan`、`plan_update`\*、`plan_removed`\*、`available_commands_update`、`current_mode_update`、`config_option_update`、`session_info_update`、`usage_update`\*、`compaction_update`\*、`compaction_summary_chunk`\*（\* = UNSTABLE，`schema.json` 里 `UNSTABLE` 出现 75 次）。
- `ToolCall`：`toolCallId`/`title` 必填，可选 `name`/`kind`/`status`/`content[]`/`locations[]`/`rawInput`/`rawOutput`/`_meta`；`ToolCallStatus` = pending/in_progress/completed/failed；`ToolKind` = read/edit/delete/move/search/execute/think/fetch/switch_mode/other。
- `PermissionOptionKind` = allow_once/allow_always/reject_once/reject_always；响应是 `{outcome:'selected',optionId}` 或 `{outcome:'cancelled'}`。
- `StopReason` = end_turn/max_tokens/max_turn_requests/refusal/cancelled。
- `session/load` 的机制是**用通知重放历史**（`schema.json:6075` 原话："Stream the entire conversation history back to the client via notifications"），而 `session/resume` 明确**不重放**（`schema.json:6111`）。
- 扩展位：每个结构都有 `_meta`（"Implementations MUST NOT make assumptions about values at these keys"），`ExtRequest`/`ExtNotification` 允许任意非规范方法，`_` 开头的枚举值保留给实现。

### 1.4 Hermes 自己的 `acp_adapter`（这才是"Hermes 语义能下沉多少"的答案）

`acp_adapter/` 共 14 个文件约 208KB，核心是 `server.py`（51.7KB）、`tools.py`（45.3KB）、`session.py`（21.0KB）、`commands.py`、`model_catalog.py`。**它已经是一份可用的 ACP agent，不是骨架。**

**它声明的能力**（`server.py:507-518` 原样）：

```python
InitializeResponse(
    protocol_version=acp.PROTOCOL_VERSION,
    agent_info=Implementation(name="hermes-agent", version=HERMES_VERSION),
    agent_capabilities=AgentCapabilities(
        load_session=True,
        prompt_capabilities=PromptCapabilities(image=True),
        session_capabilities=SessionCapabilities(
            fork=SessionForkCapabilities(), list=SessionListCapabilities(), resume=SessionResumeCapabilities(),
        ),
    ),
    auth_methods=auth_methods,
)
```

要点与**不能过度声称**的地方：

- `loadSession=True`（历史真的会重放，且是**等待重放完成后**才回响应，`server.py:550-563`）。
- `promptCapabilities` 只有 `image=True`；`audio`/`embeddedContext` 为假。
- `sessionCapabilities` 有 `fork`/`list`/`resume`。
- **`mcpCapabilities` 被省略** → pydantic 落到默认 `{http:false, sse:false}`，尽管 `server.py:169-172` 实际实现了 Http 与 Sse。**声明为假、功能是真的**——客户端不能凭这个字段下结论。
- 0.9.0 的 `AgentCapabilities` **没有 `auth` 字段**，鉴权只有顶层 `authMethods`。
- **没有 `session/close` 处理器**：SDK 路由到 `None` → `-32601`。0.9.0 也没有 `session/delete`。
- `sessionId` 是 `uuid4`（`session.py:167`），**同时**充当 Hermes 运行时 id 与 SessionDB 行 id（`session.py:299`，`source="acp"`）；压缩会把内部 head 换掉而 ACP 句柄保持稳定（`server.py:819-821`）。
- `cwd` 与 `mcpServers` 被接收，`additionalDirectories` **被 `**kwargs` 吞掉**（全文件零命中）。
- 返回 `models` + `modes` + `_meta`，**从不返回 `configOptions`**（`server.py:572-576`）；`set_config_option` 返回空列表（`:974`）。

**Hermes → ACP 投影表**（`events.py`/`content.py`/`server.py`）：

| Hermes 侧 | ACP `session/update` | 出处 |
|---|---|---|
| `tool_progress` 的 `tool.started` | `tool_call` | `events.py:86-119` → `tools.py:871-874` |
| `step_callback` 的 prev_tools | `tool_call_update`（completed/failed） | `events.py:167-170` |
| `todo` 工具结果 | `plan` | `events.py:171-172`、`26-48` |
| `reasoning_callback` | `agent_thought_chunk` | `events.py:132-134` |
| `stream_delta_callback` | `agent_message_chunk` | `events.py:137-139` |
| 最终回复 | `agent_message_chunk` | `server.py:901-902` |
| 会话标题 | `session_info_update` | `server.py:761-766` |
| 回合结束 | `usage_update`（size/used） | `server.py:344-361` |
| 会话创建/加载/恢复/fork | `available_commands_update` | `server.py:570` → `commands.py:76-86` |
| 排队 prompt 结算 | `user_message_chunk` | `server.py:914` |
| 历史重放 | user/agent/thought chunk + tool_call(+update) + plan | `server.py:124-166` |

**被丢弃的**：`thinking_callback` 被显式置空（`server.py:868`），Hermes 本地状态文本永不外传；除 `tool.started` 外的全部 `tool_progress`；`INTERRUPT_WAITING_FOR_MODEL_PREFIX` 状态文本；MCP 发现进度；插件钩子输出；cron 触发。
**从不发出的**：`current_mode_update`、`config_option_update`、`in_progress` 状态的 `tool_call_update`；**实时 prompt 本身不会 echo 成 `user_message_chunk`**（只有重放与队列结算会）——这对"乐观回显"的设计是硬约束。

**模型/mode/profile**：模型走**unstable 的 `session/set_model`** + 会话响应 `models`（`model_catalog.py:238-287`，`model_id` 形如 `"provider:model"`）；mode 有 3 个 `default`/`accept_edits`/`dont_ask`（`server.py:233-245`，映射到编辑审批策略）；**profile 完全没有暴露**（`acp_adapter/` 全目录零 `profile` 命中）。推理强度也没暴露。

**权限**（`permissions.py:33-51`）：选项 `allow_once`(allow_once) / `allow_session`(**kind 写成 allow_always**，因为 ACP 没有 session 级 kind，`:44` 有注释说明) / `allow_always` / `deny`(reject_once) / `deny_always`(reject_always)；超时 60s 后按 `"timeout"` 处理，与 deny 区分开。编辑审批只给 allow_once/deny（`edit_approval.py:221-222`），且除敏感文件名（`.env`、`id_rsa`、`id_ed25519`）外按策略自动通过。

**它从不调用客户端的 `fs/*` 与 `terminal/*`**（14 个文件零命中），`client_capabilities` 只在 `server.py:498` 接收一次、之后再没读过——**没有任何 gate**。

**`_meta`**：Hermes 只读不写客户端的 `_meta`；自己发出的 key 全量只有三个：`hermes.sessionProvenance`、`hermes.compactionSummary`、`hermes.containsCompactionSummary`（`provenance.py:86`、`server.py:93,95`）。`provenance` 用 `sessions` 表的压缩谱系（`parent_session_id` + `end_reason=="compression"`）生成 `acpSessionId`/`currentHermesSessionId`/`rootHermesSessionId`/`sessionKind`/`compressionDepth` 等。

**工具映射**：`tools.py` 不是第二个工具面，而是把 Hermes 工具调用投影成 `tool_call`/`tool_call_update`，带显式表 `TOOL_KIND_MAP`（`tools.py:16-30`）：`read_file`/`skill_view`/`browser_snapshot`→`read`；`write_file`/`patch`/`skill_manage`→`edit`；`search_files`→`search`；`terminal`/`process`/`execute_code`/`delegate_task`→`execute`；`web_search`/`web_extract`/`browser_navigate`→`fetch`；未命中→`other`。Hermes 专有细节走 `rawInput`（仅未知工具）而不走 `_meta`。

**明确未被投影的 Hermes 产品能力**（在 14 个文件里 grep 该词零命中，因此"未暴露"这个判定是有证据的，但仍是**该目录内**的证据）：relay/agent 间消息、bot/roster、`tool_search` 桥、成本/计费（只有 token 数的 `usage`）、profile、推理强度、skills/cron/kanban 的**管理面**（只有工具调用形态）、audio、subagent（子会话对客户端不可见）、后台进程、memory 读写面。

### 1.5 审计结论一句话

**`hermes acp` 已经足以承载"会话主链"**（new/load/list/resume/fork/cancel/prompt/update/permission/models/modes/image/usage/provenance），而**完全不足以承载"产品面"**（profile/bot/relay/cron/kanban/skills 管理/成本/tool_search/子代理）。这就是本文后面所有分类与取舍的根源。

---

## 2. 当前 Hermes 耦合清单

沿用 `03-coupling-matrix.md` 的 A–F 分桶（那里有逐条的 `file:line`）。此处按"ACP 视角"重排，只列与本次改造直接相关的项。

### 2.1 启动与发现（Bucket C.1/C.2）

| 耦合点 | 出处 | ACP 视角 |
|---|---|---|
| `serve --host 127.0.0.1 --port 0` argv | `electron/backend-command.ts:18-22` | 换成 `acp`（stdio，无 host/port） |
| 旧版回落 `dashboard --no-open` | `backend-command.ts:30-38`，用于 `main.ts:2613,12652,13082` | ACP 路径不需要 |
| `--profile <p>` 前缀 | `main.ts:12649,13043` | **ACP 无 profile 概念**，只能靠子进程 env（见 §6） |
| `-m hermes_cli.main` 的 python 形态 | `main.ts:5130` | 同上，`hermes acp` 无此形态 |
| 用读 `hermes_cli/subcommands/dashboard.py` 判断 `serve` 支持 | `backend-command.ts:46-48`、`main.ts:2566-2573` | 改为 ACP `initialize` 能力协商（真正的握手） |
| 可执行解析阶梯 | `main.ts:4991-5165`（`resolveHermesBackend`） | **已是干净接缝**：换成通用的 `AgentDefinition` registry 即可复用同一套阶梯形状 |

### 2.2 环境与就绪（Bucket C.3/C.4）

| 耦合点 | 出处 |
|---|---|
| 注入 `HERMES_HOME` / `HERMES_DASHBOARD_SESSION_TOKEN` / `HERMES_DESKTOP=1` / `TERMINAL_CWD` / `HERMES_WEB_DIST` | `main.ts:13095-13127` |
| 从 stdout 抓 `HERMES_BACKEND_READY port=` | `electron/backend-ready.ts:6,12`，等待器 `:222`（默认 90s） |
| 备用的 ready-file JSON | `backend-ready.ts:145-158` |
| **带 token** 的 `GET /api/health`，回落 `/api/status` | `electron/backend-health.ts:267,269` |
| Hermes 特有的 gate 形状 `no_cookie` | `backend-health.ts:188-191` |
| 从 `GET /` 抓 `window.__HERMES_SESSION_TOKEN__` | `electron/dashboard-token.ts:38-50,79-101` |
| WS `ws://127.0.0.1:<port>/api/ws?token=` | `main.ts:12793,13262` |
| Nous Cloud 主机名分类 `*.agents.nousresearch.com` | `backend-health.ts:154-157` |

**这一整块在 ACP 路径下几乎全部消失**：没有端口、没有 token、没有 health 端点、没有 gate 形状。取而代之的是"进程活着的 + `initialize` 成功"这一个就绪判据。这是本方案最大的**减量**，也是最大的**行为变化**（见 §10 D-E）。

### 2.3 会话主链（Bucket B/C 混合）

| 能力 | 现状出处 | ACP 对应 |
|---|---|---|
| 建会话 | `session.create` — `src/app/session/hooks/use-session-actions/index.ts:584,784` | `session/new` |
| 提交回合 | `prompt.submit` — `.../use-prompt-actions/submit.ts:791` | `session/prompt` |
| 取消 | `session.interrupt` — `.../use-prompt-actions/index.ts:716`、`slash.ts:520`、`rewind.ts:329` | `session/cancel`（**通知，无回执**） |
| 审批/阻塞输入 | `src/store/prompts.ts`、`src/store/clarify.ts`、`.../gateway-event/input-requests.ts:23-90` | `session/request_permission` |
| 事件流投影 | `src/app/session/hooks/use-message-stream/gateway-event/`（2,622 行）+ `message-stream.ts` | `session/update`（15 种变体） |
| 会话列表/恢复 | `src/api/sessions.ts`、`session.resume` | `session/list`、`session/load`/`session/resume` |
| 转录水合 | `src/lib/chat-messages/hydration.ts`、`use-message-stream/index.ts:790` | `session/load` 的**通知重放** |
| 会话身份换算（运行时 id ↔ 存储 id ↔ 谱系根） | `src/lib/session-ids.ts`、`src/store/session.ts:356-462` | ACP 只有一个 `sessionId`（Hermes 让它身兼两职，但协议不保证） |
| 连接作用域 `(connection, profile)` | `src/store/gateway.ts:913,946`、`use-gateway-request.ts:123`、`capabilityScoped()` `src/api/client.ts:125` | 通用作用域照旧，只是"一条连接"变成"一个 ACP 进程" |
| 重放/水位/纪元 | `apps/shared/src/json-rpc-gateway.ts:116`、`:530`、`:568-578` | ACP 无 replay/epoch；`session/load` 全量重放 |

### 2.4 Hermes 形状的错误与事件词汇（Bucket C.7）

`4001`/`session not found`（`src/store/session-gone-latch.ts:18,52`）、`Hermes gateway is not connected`（`src/store/gateway.ts`、`src/lib/yolo-session.ts:72`）、`Hermes backend did not become ready: …`（`backend-health.ts:316`）、`HTTP 401 {"detail":"Unauthorized"}` 的分类（`isGatedMissingHealthError`）、**46+ 个字符串的封闭事件表**（`src/lib/gateway-events.ts:25-45`）、以及从 `<updateRoot>/hermes_cli/__init__.py` 解析版本给 About 面板（`main.ts:17520`）。

ACP 侧的错误词汇是 JSON-RPC 码：`-32700/-32600/-32601/-32602/-32603/-32800(Request cancelled)/-32000(Authentication required)/-32002(Resource not found)`。

### 2.5 产品能力（Bucket D，非适配器工作）

Bot Mode/relay/群聊 `src/plugins/hermes-bots/*`（24,059 行）、Kanban（5,521）、Skills+MCP 页（3,790）、Starmap（3,644）、Cron（1,744）、Artifacts（1,162）、Messaging/Webhooks（1,672）、模型目录/本地模型/计费（2,500+）、Subagents/roster（450+）、Memory/curator（`src/app/learning/*`）、**硬编码 Hermes 斜杠词汇**（`src/lib/desktop-slash-commands.ts:174-281` 的 `DESKTOP_COMMAND_SPECS`、`:285-337` 的 `NO_DESKTOP_SURFACE`）、**按 Hermes 表面命名的会话来源分类**（`src/lib/session-source.ts:3-74`：`codex`/`tui`/`kanban`/`bluebubbles`/`photon`/`yuanbao`…）。

### 2.6 已经存在的接缝（要复用，不要重造）

1. **传输接缝**：`JsonRpcGatewayClient`（`apps/shared/src/json-rpc-gateway.ts:116`）+ `HermesGateway` 子类（`src/api/client.ts:28`）+ `hermesApi()`（`:98`）/`capabilityScoped()`（`:125`）/`profileScopeKey()`（`:145`）。
2. **解析阶梯接缝**：`resolveHermesBackend()` 是单一有序函数 + typed sentinel，且策略已被抽成纯模块并单测（`backend-probes.ts`/`backend-command.ts`/`backend-health.ts`/`backend-ready.ts`）。
3. **类型化错误词汇**：`HERMES_EXECUTABLE_NOT_FOUND` + sticky `DesktopBootProgress.errorCode`、`GatewayReauthRequiredError`、`isGatedMissingHealthError`/`isAuthRejectionError`/`isServerSideHttpError`。
4. **作用域接缝**：渲染层只经 `HermesConnection`（`src/global.d.ts:744-774`）看到 `baseUrl`/`wsUrl`/`token`。
5. **POC 作为模板**（**本轮不得触碰，仅作形状参考**）：`src/agentbox/types.ts:31-53` 的 `execution.providers[].{provider_id, harness_type, capabilities}`；`event-adapter.ts` 是纯的 durable-event → `ChatMessage[]` 投影带 seq 水位。

### 2.7 风险最高的混合文件（Bucket F）

`electron/main.ts`（18,291）、`src/store/gateway.ts`（1,917）、`src/app/session/hooks/use-session-actions/index.ts`（2,635）、`src/lib/desktop-slash-commands.ts`（713）、`electron/backend-health.ts`（317）、`electron/backend-env.ts`（161）、连接四件套（5,221）、`src/plugins/hermes-bots/*`（24,059）、`src/app/settings/gateway-settings.tsx`（1,667）。

---

## 3. ACP 覆盖与缺口矩阵

分类口径：
- **R = Replace**：标准 ACP 直接替换，无需投影、无需协商。
- **P = Project**：ACP 语义够用，但需要 Desktop 内部 View Model 投影（纯函数，可单测）。
- **N = Negotiate**：必须 capability negotiation，缺失时**移除入口**而不是调用失败。
- **X = eXpress-impossible**：ACP 当前表达不了，只能走扩展或保留。
- **H = Hermes-only（暂留）**：必须暂时保留为 Hermes 专有扩展。

| # | 当前耦合项 | 分类 | 依据与做法 |
|---|---|---|---|
| 1 | 可执行发现/解析阶梯 | **R** | ACP 不管发现（传输在带外），阶梯照旧，只是产物从 "hermes 可执行" 变成 `AgentDefinition` |
| 2 | `serve` argv / host / port | **R** | 换成 `hermes acp`，stdio 无端口 |
| 3 | 端口发现 / ready 文件 / `HERMES_BACKEND_READY` | **R** | ACP 无此概念：就绪 = 进程活着 + `initialize` 成功 |
| 4 | `/api/health` + token + `no_cookie` gate | **R** | 全部删除；鉴权改用 `authMethods` |
| 5 | 从 `GET /` 抓会话 token | **R** | 删除（`authMethods` + `authenticate`） |
| 6 | `HERMES_*` 环境注入 | **R**（部分 **H**） | `HERMES_HOME` 变成"每 profile 一个 ACP 进程"的必要 env（**这是 Harness 中立性之外的一条 Hermes 特例，必须关进 Extension/Definition 里**）；`HERMES_DASHBOARD_SESSION_TOKEN`/`HERMES_WEB_DIST` 删除 |
| 7 | 建会话 | **R** | `session/new`（`cwd` 必须绝对路径；`mcpServers` 必填数组） |
| 8 | 提交回合 | **R** | `session/prompt` → `stopReason` |
| 9 | 取消 | **R**（语义有差） | `session/cancel` 是**通知**，无回执；回合以 `stopReason:"cancelled"` 结束。现在 `session.interrupt` 有回执，UI 需接受"取消是最终态而非命令确认" |
| 10 | 流式文本/思考 | **P** | `agent_message_chunk`/`agent_thought_chunk` → 现有 assistant-ui 消息段。**实时 prompt 没有 echo**（Hermes 实证），所以乐观回显必须自己造并由 `user_message_chunk` 抑制 |
| 11 | 工具调用 | **P** | `tool_call`/`tool_call_update` → 现有工具卡；`kind`→图标用表（10 种 kind），`content` 必须**合并**（zip+truncate）而非替换；`diff`/`terminal` 两类 content 要分别渲染 |
| 12 | todo/计划 | **P** | Hermes 把 `todo` 投影成 `plan`；`PlanEntry{content,priority,status}` → 现有任务面板 |
| 13 | 审批/阻塞输入 | **P + N** | `session/request_permission` → 现有审批 UI。**必须排队**（并发请求不许互相覆盖）、**必须有超时与默认值**（Hermes 侧 60s 会按 timeout 结束）；`allow_always` 的记忆在 agent 侧，客户端不得自建 allow-list |
| 14 | 会话列表 | **N** | `sessionCapabilities.list`；缺失则隐藏列表入口，**不得回落到 Hermes 专有列表** |
| 15 | 历史/恢复 | **N + P** | `loadSession`；`session/load` **靠通知重放**，且必须**先注册会话再等响应**（Zed 实证），否则重放通知找不到线程 |
| 16 | 会话身份换算 | **P** | ACP 只有一个 id；Desktop 现在的"运行时 id ↔ 存储 id ↔ 谱系根"必须由 Desktop 自己持久化元数据（Zed 正是只存元数据） |
| 17 | 谱系/压缩来源 | **H** | Hermes 用 `_meta.hermes.sessionProvenance` 携带；中立层要么透传 `_meta`，要么丢失（见 §6） |
| 18 | 模型选择 | **N**（版本错位） | Hermes：unstable `session/set_model` + `models`；TS SDK 1.4.0/schema v1.21：无 `set_model`，只有 `providers/*` + `configOptions`。**必须做版本适配层**，并且在两者都不可用时**不显示模型选择器** |
| 19 | Mode（3 个） | **N** | `session/set_mode` + `NewSessionResponse.modes` |
| 20 | 斜杠命令 | **N** | `available_commands_update`（Hermes 只给 9 个：help/model/tools/context/reset/compress/steer/queue/version）。**现有 713 行硬编码调色板必须退化为"agent 声明的命令 + Desktop 本地命令"两部分** |
| 21 | 会话标题 | **P** | `session_info_update` |
| 22 | 用量/上下文 | **P** | `usage_update{used,size}` → 现有 usage 面板；**没有 $ 成本**（Hermes 也不发） |
| 23 | 图片附件 | **N** | `promptCapabilities.image`；audio/embeddedContext 目前为假，UI 必须按能力禁用 |
| 24 | 文件系统读写 | **N** | 客户端能力 `fs.readTextFile/writeTextFile`。**Hermes 从不调用**，所以 Phase 1 中这些通道是"装备但不使用"——正好用来给第二个 harness |
| 25 | 终端委托 | **N** | `clientCapabilities.terminal` + 5 个 `terminal/*`。Desktop 已有 PTY（`electron/terminal-ipc.ts` 397 行），这是**复用现有实现**的机会，但 Phase 1 建议先只声明不实现，避免扩大范围 |
| 26 | 中文/权限超时语义 | **P** | Hermes 把 60s 超时映射成 `"timeout"`（既非 allow 也非 deny）；客户端 UI 必须能表达"超时"这个第三态 |
| 27 | 推理强度 / max_tokens / 预算 | **X** | ACP 无参数可传；`stopReason:max_tokens` 只能被报告不能被请求 → 保留为扩展或放弃 |
| 28 | Profile | **H** | Hermes 完全未暴露；Phase 1 的唯一诚实映射是"**每 profile 一个 ACP 进程**（env 区分）"，profile 元数据（含 bots 的 `ui_meta`）继续走 Extension |
| 29 | Bot/roster/relay/群聊 | **H** | `acp_adapter` 零命中 |
| 30 | Cron/Kanban/Skills 管理面 | **H** | 只有工具调用形态被投影，管理面无协议 |
| 31 | `tool_search` 桥 | **H** | 零命中；且这是 5 个 E2E 失败的历史根因（见 `07-risks-gaps-decisions.md` §2.2） |
| 32 | 成本/计费 | **H** | 零命中 |
| 33 | 子代理可见性 | **H** | `delegate_task` 只是一个 `execute` 工具调用，子会话不可见 |
| 34 | 后台进程 | **H** | 同上 |
| 35 | Memory/curator/Learning 面 | **H** | 只有工具调用 |
| 36 | Starmap（谱系可视化） | **H + P** | 谱系数据来自 Hermes `_meta`/表；可视化是纯投影 |
| 37 | 连接四形态 local/remote/ssh/cloud | **X（部分）** | ACP 传输在带外；远端 ACP 需要"在远端起 stdio 进程"的自研，`hermes serve` 的 cloud/ssh 形态在 Phase 1 无法 1:1 平移 |
| 38 | installer/update | **X** | ACP 无关；Hermes 专有（`docs/installer-ownership.md` 记录其生产者已是外部的且兼容性 UNVERIFIED） |
| 39 | `_meta` 透传 | **R** | 中立层必须**原样保留** `_meta`（ACP 明确保留该键），否则 17/36 无解 |

**矩阵读数**：主链（1–13、16–25）可被 ACP 承载；产品面（28–36）不可；远端与安装（37–38）在 Phase 1 明确不动。

---

## 4. 候选设计方案

三个方案，都满足"核心只认识一个支持 ACP 的 Harness"这一目标，差别在**主链怎么切**与**产品面怎么安置**。

### 方案 A：传输桥（双侧适配器，Hermes 语义留在桥里）

核心新增 `HarnessPort`；桥的一侧是 ACP，另一侧仍是现有 `hermes serve` WS。UI 完全不动，主链**仍走 serve**，ACP 只是并存的第二条通道。
- 优点：改动最小，零产品风险。
- 缺点：**这是"永久双实现"的教科书形态**——两条主链都要维护，Hermes 语义没有被下沉，只是被复制了一份。而且它不满足"第二 harness 只换 AgentDefinition"，因为第二 harness 走的是另一条路。
- 判定：**不采用**。唯一价值是作为过渡期的临时开关（§7 的 S1 用到一点点）。

### 方案 B：主链换 ACP，产品面留在 Hermes Extension（推荐）

- 会话主链（new/prompt/update/permission/cancel/load/list）**只走 ACP**，核心只认识 §5 的中立词汇。
- 产品面（profile/roster/relay/cron/kanban/skills 管理/成本/tool_search）**下沉到一个显式声明的 Hermes Extension**：它是一个按通用扩展点注册的插件，核心只知道"有一个扩展声明的能力集合"，不知道 Hermes。Extension 自己拿一条 `hermes serve` 连接（或未来换协议），并对每条能力做 capability-gate。
- 会话主链不再依赖 `hermes serve`；`serve` 的存在被收敛到 Extension 内部，**将来 Extension 一删，`serve` 就一起消失**。
- 优点：满足全部验收条款；每步可运行；Hermes 用户路径**默认仍走原样**（见 §7 的开关设计），不静默降级。
- 代价：过渡期每个 profile 可能有**两个进程**（ACP + serve），内存与生命周期要管。
- 判定：**推荐**。

### 方案 C：一次性替换（主链 + 产品面一起重写）

- 优点：终态最干净。
- 缺点：违反"不能先大规模重写 `electron/main.ts`、不能一次替换全部 Store/Event/UI"；且在 Hermes 产品面没有 ACP 对应物时，产品面会**被静默删除**——正好踩中"原则上不得直接删除"的红线。
- 判定：**不采用**。

### 4.1 对比

| 维度 | A 传输桥 | **B 主链+Extension（推荐）** | C 一次性 |
|---|---|---|---|
| 主链归宿 | 仍是 serve | ACP | ACP |
| Hermes 语义下沉 | 未下沉，复制 | 下沉到 `hermes acp` + Extension | 下沉 |
| 第二 harness | 需要第二条路（不满足验收） | 只加 `AgentDefinition` | 只加 Definition |
| 永久双实现风险 | **高** | 低（过渡期双栈，有明确坟场日期） | 无 |
| 每切片可运行 | 是 | 是 | 否 |
| 产品面风险 | 无 | 中（需诚实 gate） | **高（会删功能）** |
| 工作量 | 小 | 中 | 大 |

---

## 5. 推荐结构

### 5.1 目标分层

```
Desktop UI（现有 293,968 行基本不动）
   ↓  只消费 View Model
Desktop View Model（现有 ChatMessage / SessionState，语义中立）
   ↓  只由中立 SessionUpdate 投影而来
Harness 核心（新增，零 Harness 名字）
   ├── AgentDefinition / AgentCapabilities / AgentConnection
   ├── Session / Prompt / Cancel / Permission / StopReason
   └── SessionUpdate 归一化
   ↓
ACP 客户端（新增，唯一实现；传输在 Electron main）
   ↓  ACP / stdio NDJSON JSON-RPC
harness 进程：hermes acp │ codex-acp │ opencode acp │ …

        ┌──────── 平行的扩展通道（默认关闭、按能力 gate）────────┐
        │  Hermes Extension（唯一知道 hermes 的地方，可整块删除）  │
        └────────────────────────────────────────────────────────┘
```

**硬约束**：两个箭头的左侧（Harness 核心 + View Model + UI）**不得出现** `hermes`、`HERMES_`、`profiles.configure`、`prompt.submit`、`session.interrupt`、Hermes 事件名或 Hermes 专有 argv/env。

### 5.2 中立词汇（建议形状，非最终代码）

```ts
// harness/core/types.ts —— 不含任何 Harness 名字
export interface AgentDefinition {
  id: string                 // 'hermes' | 'codex' | 'opencode' | …
  label: string
  command: string
  args: readonly string[]
  env?: Readonly<Record<string, string>>        // 每 profile 的一个实例由 selection 层派生
  fallbacks?: readonly { command: string; args: readonly string[] }[]
  startupTimeoutMs?: number
  filterStdoutLine?: (line: string) => null | string   // 丢掉非 JSON 的吵闹输出（acp-kit 的做法）
}

export interface AgentCapabilities {
  loadSession: boolean
  resumeSession: boolean
  listSessions: boolean
  forkSession: boolean
  closeSession: boolean
  prompt: { image: boolean; audio: boolean; embeddedContext: boolean }
  authMethods: readonly { id: string; name: string; kind: 'agent' | 'terminal' }[]
  // 模型选择的三种世代，由适配层探测得出，绝不假设：
  modelSelection: 'none' | 'session_models' | 'config_options'
  modes: readonly { id: string; name: string }[]
  agentInfo?: { name: string; version: string }
}

export type SessionUpdate =
  | { kind: 'user_message'; sessionId: string; text: string; messageId?: string }
  | { kind: 'agent_message'; sessionId: string; text: string; messageId?: string }
  | { kind: 'agent_thought'; sessionId: string; text: string; messageId?: string }
  | { kind: 'tool_call'; sessionId: string; call: ToolCallSummary }
  | { kind: 'tool_call_update'; sessionId: string; call: ToolCallSummary }
  | { kind: 'plan'; sessionId: string; entries: readonly { content: string; priority: string; status: string }[] }
  | { kind: 'commands'; sessionId: string; commands: readonly { name: string; description?: string }[] }
  | { kind: 'mode'; sessionId: string; modeId: string }
  | { kind: 'title'; sessionId: string; title: null | string }
  | { kind: 'usage'; sessionId: string; used: number; size: number }
  | { kind: 'config_options'; sessionId: string; options: readonly ConfigOption[] }
  | { kind: 'unknown'; sessionId: string; raw: unknown }   // 永不静默丢弃

export type StopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled'

export interface PermissionRequest {
  id: string
  sessionId: string
  toolCall: ToolCallSummary
  options: readonly { optionId: string; label: string; kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' }[]
}
export type PermissionDecision = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' | 'cancel'
```

**两个刻意的设计选择**：

1. **`unknown` 变体是必须的。** acp-kit 与 Zed 都在 `default` 分支静默丢弃（`normalize.ts:320-321`、`acp_thread.rs:2706`），acp-ui 只打一行日志。ACP 每版都在加变体（v1.21 已有 15 种，其中 6 种 UNSTABLE），静默丢弃会让"UI 少了一块"永远查不出来。归一化层必须产出 `unknown` 并计数上报。
2. **能力缺失用"方法不存在"表达，而不是布尔判断。** 让 `loadSession?`/`listSessions?`/`setModel?` 成为**可选成员**（Zed 的 trait 默认不支持 + 调用点二次拦截）：

```ts
export interface AgentConnection {
  readonly id: string
  readonly definition: AgentDefinition
  capabilities(): AgentCapabilities
  newSession(opts: { cwd: string; mcpServers: McpServer[]; additionalDirectories?: string[] }): Promise<SessionHandle>
  prompt(sessionId: string, blocks: readonly PromptBlock[]): Promise<{ stopReason: StopReason }>
  cancel(sessionId: string): void
  onUpdate(listener: (u: SessionUpdate) => void): () => void
  onPermission(listener: (r: PermissionRequest) => void): () => void
  // 以下仅在能力存在时才被赋值；UI 用 `'loadSession' in conn` 决定是否渲染入口
  loadSession?(opts: { sessionId: string; cwd: string; mcpServers: McpServer[] }): Promise<SessionHandle>
  listSessions?(opts: { cwd?: string }): Promise<SessionInfo[]>
  setModel?(sessionId: string, modelId: string): Promise<void>
  setMode?(sessionId: string, modeId: string): Promise<void>
  dispose(): Promise<void>
}
```

这样"诚实显示"是**结构性**的：能力不存在 = 入口不存在，而不是"点了之后报错"。

### 5.3 调用链：改造前 vs 改造后

**① Harness 发现与启动**

| | 步骤 |
|---|---|
| 前 | `resolveHermesBackend()`（`main.ts:4991`）走阶梯 → 找到 `hermes` 可执行 → `backendSupportsServe()` 读 `dashboard.py` 探测 → `buildBackendCommand()`（`backend-command.ts:18-22`）拼 `serve --host 127.0.0.1 --port 0` → `main.ts:13095-13127` 注入 5 个 `HERMES_*` |
| 后 | `AgentRegistry`（数据文件）选出 `AgentDefinition` → `resolveAgentExecutable(def)`（复用现有阶梯形状与 typed sentinel）→ `spawn(def.command, [...def.args], {env, stdio:['pipe','pipe','pipe']})` → 传输用 `ndJsonStream` |

**② initialize / capabilities**

| | 步骤 |
|---|---|
| 前 | 无握手。靠"进程能起来 + `/api/health` 200"推断能力，斜杠命令表是硬编码 |
| 后 | 连上即发 `initialize{protocolVersion:1, clientCapabilities, clientInfo}` → 收 `agentCapabilities` → 存成不可变快照 → **所有可选功能据此定型**（Zed 的 `acp.rs:1101` + `:1746`）；同时做**版本下限检查**，不匹配则报 `UnsupportedVersion` 而不是继续跑 |

**③ session/new**

| | 步骤 |
|---|---|
| 前 | `session.create{cols,cwd,source:'desktop',profile,…}` → 返回 `{session_id, stored_session_id}` → Desktop 维护四重身份（`src/lib/session-ids.ts`） |
| 后 | `session/new{cwd(绝对路径), mcpServers[]}` → `{sessionId, modes?, configOptions?}` → Desktop **自己**落一条元数据（sessionId + cwd + connection id + profile 作用域），因为 ACP 不提供第二身份 |

**④ prompt / update**

| | 步骤 |
|---|---|
| 前 | `prompt.submit{session_id,text}` → WS 推 `message.delta`/`message.complete`/工具事件 → `gateway-event/` 2,622 行处理器 → `ClientSessionState`/`$messages` → assistant-ui |
| 后 | 乐观插入用户消息 → `session/prompt{sessionId,prompt:[blocks]}` → `session/update` 通知流 → **归一化**成 `SessionUpdate` → 投影成与现在**同样形状**的 View Model → 同一套 UI；`user_message_chunk` 到达时抑制乐观项；回合结束看 `stopReason` |

**⑤ permission**

| | 步骤 |
|---|---|
| 前 | Hermes 经 WS 推审批请求（`src/store/prompts.ts`、`gateway-event/input-requests.ts:23-90`）→ UI → 回 `approval.respond` |
| 后 | agent 发 `session/request_permission{sessionId, toolCall, options[]}`（**agent→client 请求**）→ 进**队列**（不是单槽）→ UI 渲染 options（原样传 id）→ 回 `{outcome:'selected',optionId}`；用户取消/超时 → `{outcome:'cancelled'}`；**核心绝不缓存 allow-always**（那是 agent 的状态） |

**⑥ cancel**

| | 步骤 |
|---|---|
| 前 | `session.interrupt{session_id}` 请求-响应，有回执 |
| 后 | 发 `session/cancel` **通知**（无回执）→ UI 进入"正在取消"直到收到 `stopReason:"cancelled"`；**必须处理"取消后 agent 仍在收尾"**（Hermes 的 `4009 session busy` 就是同一现象的历史证据，见 `real-session-builder.ts` 的注释） |

**⑦ history / resume**

| | 步骤 |
|---|---|
| 前 | `session.resume` + 帧重放（`session.events.since` + 水位 + epoch 失效，`json-rpc-gateway.ts:530-593`） |
| 后 | **先注册会话再发 `session/load`**（Zed 的教训）→ agent 用 `session/update` **重放整段历史** → 同一套投影直接渲染；`resumeSession` 可用时优先（不重放，更快，但 Desktop 必须自己已有历史）；两者都没有 → **不显示恢复入口** |

**⑧ shutdown / 进程回收**

| | 步骤 |
|---|---|
| 前 | `main.ts` 管子进程生命周期，`SIGTERM` + 端口释放；profile 池有 LRU 与 slot 上限（`electron/pool-limits.ts`，默认 `maxBackends: 3`） |
| 后 | 每个 `AgentConnection` 拥有一个子进程：`dispose()` → 关 stdin（ACP 的规范退出方式）→ 超时后 `SIGTERM` → 再 `SIGKILL`；**子进程退出必须与每个在途请求赛跑**（Zed 的 `acp.rs:968`），把退出变成一个 typed 的会话错误而不是挂起；profile 池语义保留，只是池里装的是 ACP 进程 |

**⑨ 就绪**

| | 步骤 |
|---|---|
| 前 | stdout 抓 `HERMES_BACKEND_READY port=` → `GET /api/health`（带 token）→ WS upgrade 探测（`backend-ready.ts` + `backend-health.ts`） |
| 后 | `initialize` 的响应就是就绪信号（附超时）；**没有端口、没有 token、没有 gate** |

---

## 6. Hermes Extension 边界

目标：Bot/Cron/Kanban/Skills/Relay 等**不删**，但核心不认识 Hermes；每条能力可 gate、可诚实降级、将来可移除。

### 6.1 通用扩展点（核心提供的唯一形状）

```ts
export interface HarnessExtension {
  readonly id: string                       // 'hermes.product'
  readonly label: string
  readonly provider: (ctx: ExtensionContext) => Promise<ExtensionSession>
}
export interface ExtensionSession {
  readonly available: boolean               // false → UI 显示"不可用 + 原因"，绝不假成功
  readonly unavailableReason?: string       // 已本地化文案的 key，不是原始异常串
  invoke<T>(capability: string, params: Record<string, unknown>): Promise<T>
  subscribe(capability: string, listener: (payload: unknown) => void): () => void
  dispose(): Promise<void>
}
```

核心只做三件事：注册表 + 能力名到 UI 入口的**表驱动**映射 + 可用性渲染。核心**不 import** Extension 实现，也**不含**任何 Hermes 能力名常量。

### 6.2 三条保留路线（逐能力可选，且可混用）

| 路线 | 形态 | capability-gate | 核心如何不认识 Hermes | 将来如何移除 |
|---|---|---|---|---|
| **H1 Sidecar**（Phase 1 默认） | Extension 自己持有一条 `hermes serve` 连接（沿用现有 `JsonRpcGatewayClient`），主链不用它 | Extension 声明 `capabilities: string[]`；每条能力缺失即隐藏入口 | 能力名是 Extension 自己的私有字符串，核心只当 key 用；连接由 Extension 建立、持有、销毁 | Extension 整块删除 → `serve` 依赖随之消失；或把实现改指 ACP 扩展方法/第二阶段的 AgentBox |
| **H2 In-band ACP 扩展** | 同一条 ACP 连接上走 `_meta` + 非规范方法（`ExtRequest`/`ExtNotification`） | 同上，外加"agent 是否回 `-32601`"的运行时探测 | 中立层只做 `_meta` 的**透传**，不解释内容 | ACP 标准化（如 `providers/*`）或 Extension 删除 |
| **H3 吸收进中立面** | 能力被 ACP 本体覆盖，Extension 不再需要 | 由 §3 的 N 类协商承担 | 天然不存在 Hermes | 已经不需要移除——它本来就不是 Hermes |

**分配建议**（Phase 1）：

- **H3（优先做掉）**：模型选择（`session/set_model` 或 configOptions，双世代适配）、mode（3 个）、斜杠命令（9 个 `available_commands_update`）、计划/todo、用量/上下文、会话标题、图片附件、审批。
- **H1（隔离掉）**：bot/roster 与其 `profile.yaml` 的 `ui_meta` 读写、relay/群聊、cron、kanban、skills 管理面、成本、`tool_search`、子代理与后台进程视图、Starmap 数据源、`profiles.list/configure`。
- **H2（只留声明，不实现）**：把 `session/list` 之外的 profile 枚举、子代理可见性等登记为"未来走 ACP 扩展"，Phase 1 不动。

### 6.3 反污染规则（对应用户要求的第 4 条）

1. **Hermes Extension 不得写入通用 Session/Transcript/Composer。** 它的输出只能走两条路：自己的面板（独立 View Model），或**经中立层认可的数据字段**（例如"这条会话属于 profile X"这种已经是通用概念的字段）。
2. **中立 SessionUpdate 里不得出现 Hermes 概念**。要携带 Hermes 专有信息时，只有两个合法去处：透传的 `_meta`（核心原样搬运、不解释；对应 `hermes.sessionProvenance`），或 Extension 自己的通道。
3. **`HERMES_HOME` 是唯一被允许出现在中立层的 Hermes 字符串**，而且只能作为 `AgentDefinition.env` 里的**数据**（由 selection 层按 profile 派生），不得出现在任何 `if`/`switch` 里。这一条要写成 lint 规则的例外并注明理由，否则它会变成下一个 `main.ts`。

### 6.4 能力缺失时的诚实显示（禁止假成功）

- Extension `available:false` → 面板显示"该功能在此 Agent 上不可用"+ 原因（区分"未安装""未启动""Agent 不支持""Agent 明确拒绝"四类），**入口禁用而非隐藏**（用户要能知道为什么）。
- 中立能力（`loadSession` 等）缺失 → **入口不存在**（§5.2 的可选方法），不出现"点了报错"。
- **借用一条已经证实的产品缺陷作为反面要求**：`07-risks-gaps-decisions.md` §2.1 记录的 `saveBotMeta` 会把"后端拒绝/不可达"归类成"老网关不支持"然后静默本地降级，UI 表现出成功而磁盘上没有写入。新的 Extension 契约里，**"unsupported" 与 "refused" 与 "unreachable" 必须是三个不同的可见状态**，并且任何本地降级都必须在 UI 上带出处（例如"仅本机可见"角标）。

---

## 7. 分阶段迁移切片

约束：每个切片结束时 Desktop **必须可运行**、Hermes 用户路径**默认不变**；不得先大规模重写 `electron/main.ts`；不得一次性替换 Store/Event/UI。

| 切片 | 内容 | 结束时可见的事实 | 回滚 |
|---|---|---|---|
| **S0** 中立词汇 | 只新增 `harness/core/{types,normalize,capabilities}.ts` + 单测。零接线 | 无行为变化（纯增量） | 删文件 |
| **S1** ACP 通道打通 | main 新增 ACP 传输与连接池（**新文件，不进 `main.ts` 主体**）；`tests-js` 新增**假 ACP agent**；设置里出现一个显式开关"启用 ACP 通道（实验）"，默认关 | 打开开关 + 选一个 ACP agent → 能 initialize、建会话、发一条 prompt、看到流式回复（写进现有转录） | 关开关；或删掉注册那一行 |
| **S2** Hermes over ACP（单流程） | 开关打开时，**默认 profile 的普通新会话**（非 bot、非群聊）走 `hermes acp`；其余一切仍走 `serve` | 同一条用户路径在两条传输下都可用；**UI 明确标注当前传输**（不得静默） | 关开关 |
| **S3** 第二 harness | 只加一个 `AgentDefinition`（codex-acp/opencode，或 CI 里的第二个假 agent） | **同一套核心代码**完成主链；验收条款之一达成 | 删那条 Definition |
| **S4** 能力面迁移 | 模型/mode/斜杠命令/plan/usage/标题/图片附件改为"由 agent 声明驱动"，全部 N 类协商 | 硬编码的 `desktop-slash-commands.ts` 与 Hermes 模型表退居为"本地命令 + 兜底"，不再是真相来源 | 恢复旧表（保留为 `_fallback`） |
| **S5** 产品面隔离 | 按 §6 把 bot/cron/kanban/skills/relay/成本/tool_search 收到 Hermes Extension 之后（H1），加 capability-gate 与诚实降级 UI | 这些页面全部可用，但核心目录里查不到 Hermes 词 | Extension 内一行开关回到直连 |
| **S6** 默认切换 | 主链默认走 ACP；`serve` 只由 Extension 需要时启动 | Hermes 用户路径不变（同样的会话、同样的审批、同样的 slash） | 一个配置项切回 |
| **S7** 收尾 | 删除 ACP 已覆盖的旧路径（`serve` 的主链用量、`backendSupportsServe`、token/gate/health 那一整块），只保留 Extension 仍需的部分 | 中立层零 Hermes 词；产品面只在 Extension 内 | 按切片回退（每个切片一个 commit） |

**顺序上的两条硬规矩**：
1. **S5 必须在 S6 之前**。否则一旦默认切到 ACP，产品面还在直连 Hermes，就会出现"核心不知道 Hermes 但产品面绕过核心"的双权威——正是要避免的 Codeg 式失败。
2. **S4 里每迁一项，都要删掉对应的硬编码**，不能"新的走 ACP、旧的留着当兜底"长期共存；兜底只允许存在一个切片周期。

---

## 8. 第一刀（S0 + S1 的最小可验证切口）

原则：**纯增量、默认关闭、零产品路径改动**，但必须已经打通一次真实的 ACP 往返，否则后面全是纸上谈兵。

### 8.1 新增文件（全部是新文件；`electron/main.ts` 只在末尾加一处注册）

| 文件 | 内容 | 为什么在这里 |
|---|---|---|
| `apps/desktop/src/harness/core/types.ts` | §5.2 的中立词汇 | 纯类型，零依赖，可被 main/renderer 共用 |
| `apps/desktop/src/harness/core/normalize.ts` | ACP `session/update` → `SessionUpdate`（15 种变体 + 未知变体 + 别名容忍 + `tool_call_update` 合并） | 唯一需要"知道 ACP"的中立模块；纯函数，最容易测 |
| `apps/desktop/src/harness/core/capabilities.ts` | `agentCapabilities` → 中立能力快照 + `modelSelection` 世代探测 | 把 §0.2 的版本错位关在一个地方 |
| `apps/desktop/src/harness/registry/agents.json` | 数据化 agent 列表（`hermes` 一条：`command`/`args:["acp"]`；可含 `fallbacks`/`filterStdoutLine`） | 启动信息数据化，正是用户要求第 4 条 |
| `apps/desktop/src/harness/registry/index.ts` | 读 `agents.json` + PATH 探测 + `AgentDefinition` 解析 | 复用现有阶梯形状与 typed sentinel |
| `apps/desktop/electron/harness/acp-transport.ts` | `spawn` + `ndJsonStream` + `ClientSideConnection`；stdout 非 JSON 行的容忍与记账 | 传输必须在 main（渲染层无法 spawn） |
| `apps/desktop/electron/harness/acp-connection.ts` | `AgentConnection` 的 ACP 实现：能力门、会话先注册后 load、更新/权限回调、`dispose()` 的三段回收 | 与 Zed 的职责划分对齐 |
| `apps/desktop/electron/harness/ipc.ts` | main ↔ renderer 的中立 IPC（`harness:acp:*`）：启动/停止/发 update/回 permission | 让渲染层不认识 ACP |
| `tests-js/scripts/mock-acp-agent.ts` | **假 ACP agent**：stdio NDJSON，按脚本回 `initialize`/`session/new`/`session/prompt`，发出全部 15 种 update 各一次，可注入权限请求、崩溃、非 JSON 噪声 | 无凭据 CI 的前提；与现有 `mock-server.ts` 同构 |

### 8.2 先写哪些测试（characterization 优先）

1. **归一化 characterization**：把假 agent 发出的**全部 15 种 update**（含 UNSTABLE）与三类噪声（未知变体、缺 `toolCallId` 的 `tool_call`、非 JSON 行）跑过 `normalize.ts`，断言：每种都有确定输出、未知变体进 `unknown` 而不是消失、缺字段的调用被丢弃且计数。
2. **能力 gate characterization**：假 agent 分三种 profile 启动（全能力 / 仅基线 / 只有 `loadSession:false`），断言 `AgentConnection` 上**可选方法的存在性**随之变化——即"能力缺失 = 入口不存在"这条不变量。
3. **权限队列**：并发两个 `session/request_permission`，断言两个都被回答、不互相覆盖，且**没有答案时不会挂起**（默认 `cancel` 并留痕）。
4. **崩溃路径**：prompt 进行中杀掉子进程，断言在途请求收到 typed 错误而非挂起，且连接被判定为已死。
5. **行为未变的证明（关键）**：对同一段脚本化对话，取现有 `hermes serve` 路径产出的 View Model 作为**基线快照**，再取 ACP 路径产出的 View Model，断言**用户可见事实一致**（消息顺序与角色、工具调用的 kind/status、审批出现与消失、最终 `stopReason` 映射到同一个"结束"状态）。差异必须逐条解释，不能整片豁免。
6. **中立性门禁（不是读源码的测试）**：用 **ESLint 边界规则**（`no-restricted-imports` + `no-restricted-syntax`）在 `src/harness/core/**` 与 View Model 目录上禁止：`hermes`/`HERMES_` 标识符与字符串字面量、`profiles.configure`、`prompt.submit`、`session.interrupt`、Hermes 事件名表、以及对 Extension 实现的 import。这条满足根 `AGENTS.md`"测试不得读源码"的要求，因为它由 lint 承担而不是由 vitest 承担；同时保留一个行为测试断言"两个不同 agent 走同一条代码路径"。

### 8.3 如何证明行为未变 / 如何回滚

- **未变**：S1 全程开关默认关闭 → 默认路径与今天**逐字节相同**（可 diff 出"零改动"）。开关打开时，靠 8.2(5) 的快照对比证明 ACP 路径在用户可见事实上等价；不一致处必须在 PR 描述里逐条列出并给出结论（是缺陷还是可接受差异）。
- **回滚**：每个切片一个 commit。S1 的回滚是"关掉开关"（配置项），彻底回滚是删除 `harness/` 与 `electron/harness/` 目录 + 那一处注册，**不触碰任何现有文件的行为**。`agents.json` 里删除对应条目即让功能消失且不留残留。

### 8.4 第一刀明确不做的事

不做：bot/profile 迁移、cron/kanban/skills、远端与 SSH、安装器、终端委托（`terminal/*` 只声明不实现，或干脆不声明）、`fs/*`（同上）、模型选择（留到 S4）、任何 `main.ts` 内部改动、任何 Store/Event 重写、任何 AgentBox 相关。

---

## 9. 测试与验收标准

### 9.1 第一阶段验收（对应用户列出的 7 条，逐条给出验证方式）

| # | 验收条款 | 验证方式 |
|---|---|---|
| 1 | Hermes 通过 `hermes acp` 完成真实 Session 主链 | E2E：新会话 → prompt → 流式回复 → 工具调用 → 审批 → 取消 → 结束，全程走 `hermes acp`；断言 `stopReason` 与转录内容（用现有的外部运行时 E2E 通道，`HERMES_DESKTOP_HERMES` 指向外部安装，**不执行真实模型请求**，用 mock provider） |
| 2 | 第二个 ACP Harness 用同一套核心代码完成主链 | 同一批 E2E，只换 `AgentDefinition`；CI 里用第二个假 agent（无凭据），本地可用 codex-acp/opencode |
| 3 | 两者只更换 AgentDefinition | 断言两条 E2E 共享同一实现文件；且 `agents.json` 的 diff 是唯一差异 |
| 4 | 共用 Session Store、Transcript、Composer、Permission UI | 断言两条路径写进同一个 store 与同一套组件（选中同一 DOM 断言 + 同一 store 断言） |
| 5 | Desktop 核心不存在 Hermes method/event/argv/env 分支 | ESLint 边界规则（§8.2(6)）对核心目录零命中；外加人工核对 `resolveHermesBackend`/`backend-health`/`backend-ready` 三个已移除或已中立化的清单 |
| 6 | Hermes 专有功能被隔离且明确 capability-gated | Extension 单测：每条能力在 `available:false` 时不出现入口；E2E 断言"未安装/未启动/不支持/被拒绝"四种文案各不相同 |
| 7 | 原有 Hermes 用户路径没有静默降级或假成功 | (a) S1–S5 期间默认路径不变；(b) 任何降级路径必须在 UI 上有可见出处（沿用 §6.4 的三态要求）；(c) 复跑现有 E2E：`bot-roster-user-sections` 的磁盘断言、以及 §2.1 记录的写盘缺陷场景必须仍能通过——**这是防止"迁移顺手把静默降级又引入一遍"的回归闸** |

### 9.2 必须新增的测试层级

- 单元：`normalize.ts`、`capabilities.ts`、权限队列、能力门存在性。
- 集成：main 侧 ACP 连接对假 agent 的完整生命周期（启动/initialize/new/prompt/update/permission/cancel/崩溃/回收）。
- E2E：真实 `hermes acp` 一条主链；第二个 agent 一条主链；共用 UI 断言。
- 门禁：ESLint 边界规则；`_meta` 透传断言（Hermes 的 `sessionProvenance` 不得在中立层被改写或丢弃）。

### 9.3 明确不做的验收

不做性能基准（ACP 每会话一进程，与现在不可比）；不做远端/云形态的等价性验收（§3 #37 已判定 Phase 1 不动）；不做安装器兼容性（`docs/installer-ownership.md` 已记录其兼容性 UNVERIFIED）。

---

## 10. 风险与待用户裁决

### 10.1 非目标（本阶段明确不做）

- **不接 AgentBox，不为 AgentBox 发明接口。** `src/agentbox/*` 与 `src/plugins/agentbox-lab/*` 是未跟踪的 POC（`03-coupling-matrix.md` §6 第 10 项已标为"不得误提拔"），本轮不读、不改、不参考其形状做接口预留。第二阶段单独裁决。
- 不恢复仓库内 Hermes Python Runtime（`hermes acp` 来自外部安装）。
- 不改远端/SSH/云与安装器。

### 10.2 风险

| # | 风险 | 说明与缓解 |
|---|---|---|
| R-1 | **协议版本错位**（§0.2） | Hermes 走 Python SDK 0.9.0 的 unstable `session/set_model`；TS SDK 1.4.0/schema v1.21 没有它。缓解：把探测关进 `capabilities.ts`，`modelSelection` 三态；两者都不可用就不显示模型选择器。**不要**用 `_meta` 私自发明模型通道（那是永久私有协议） |
| R-2 | **历史只在 agent 侧** | ACP 无本地历史，`session/load` 靠重放。若某 agent 不重放，历史就没了。缓解：Desktop 自己存元数据（Zed 的做法），并对"agent 声明 loadSession 但实际不重放"做一次真实探测 |
| R-3 | **每 profile 一进程的内存与生命周期** | profile 池语义保留（`pool-limits.ts`），但池里现在是 ACP 进程；过渡期每 profile 可能两个进程。缓解：池上限、LRU、明确的 dispose 三段式（关 stdin → SIGTERM → SIGKILL） |
| R-4 | **stdout 污染** | ACP 用 stdout 承载 JSON-RPC；第三方 harness 可能打印非 JSON。Hermes 自己靠改道 stderr 规避（`entry.py:58-71`），但客户端不能假设。缓解：`filterStdoutLine` + 非 JSON 行记账（不静默丢弃），并把它作为 `AgentDefinition` 的一个数据字段 |
| R-5 | **取消语义变化** | `session/cancel` 是通知且"跑着不等于忙"（Hermes 历史证据：`4009 session busy`）。缓解：UI 从"命令确认"改为"进入取消态直到 `stopReason:cancelled`"；沿用现有 `real-session-builder.ts` 里已经写明的重试预算思路 |
| R-6 | **审批状态归属** | `allow_always` 的记忆在 agent 侧（Zed 的结论：Zed 不自建 allow-list）。缓解：客户端不缓存决策；超时要能表达第三态（Hermes 的 `"timeout"`） |
| R-7 | **`mcpCapabilities` 声明与实现不符**（Hermes 声明 false 但实现了 http/sse） | 客户端不能凭声明下结论，也不能凭实现猜。缓解：按声明 gate，同时在 Extension 里保留"实际可用"的探测与提示 |
| R-8 | **并行双栈期过长** | S1–S5 期间两条传输并存，容易变成永久双实现。缓解：S5 必须早于 S6；每个切片只允许一个周期的兜底；把"兜底存在了几个切片"当成一项可检查的债 |
| R-9 | **文档与实测背离** | 本文的 Hermes 侧结论来自 `acp_adapter/` 的静态审计（grep 为主），**没有跑过 `hermes acp`**（本轮限制：不执行真实模型请求、不安装依赖）。因此 §3 里标 H 的项是"未在协议面暴露"，不等于"永远不能"；落地第一刀时应以一次真实 `initialize` 的实测为准。另外本文修正了一条上游审计的错误结论（`serve` 存在与否），这提醒：**凡是要写进设计的上游结论都要自己核对一次** |
| R-10 | **许可证** | Zed 是 GPL-3.0-or-later，**只能学模式、不能抄代码**；Apache-2.0 的两项（typescript-sdk、AionUi）引入需保留 NOTICE。缓解：写进实施约束并在评审时检查 |

### 10.3 待用户裁决

| # | 问题 | 我的建议 |
|---|---|---|
| **D-A** | 是否接受 Phase 1 就让会话主链依赖 `hermes acp`，而它当前用 `use_unstable_protocol=True`（`set_model`/`fork`/`resume`/`list` 均为 unstable）？ | 接受，但把 unstable 能力全部做成 N 类可选入口；稳定基线只依赖 spec 的 MUST：`new`/`prompt`/`cancel`/`update`。若你要求"零 unstable"，则模型选择与 resume 必须留到运行时稳定之后 |
| **D-B** | 产品面走 H1（Extension 自持 `hermes serve`）还是等 H2（in-band ACP 扩展）？ | Phase 1 用 H1。H2 需要动外部运行时，超出本阶段范围 |
| **D-C** | 每 profile 一个 ACP 进程（profile 不进 ACP）是否可接受？ | 可接受且是唯一诚实映射；需确认 profile 池上限与内存预算 |
| **D-D** | 是否接受过渡期失去（在会话路径上）relay/tool_search/成本/子代理可见性，只能从 Extension 看？ | 接受；这正是 H1 的存在理由。但**必须**在 UI 上明确"此功能来自扩展"，不能让人以为它消失了 |
| **D-E** | 就绪判据从"端口+token+health"变成"initialize 成功"，是否接受其行为变化（例如启动更快但错误信息更少）？ | 接受；但 typed 错误词汇要补齐（`UnsupportedVersion`、`ExecutableNotFound`、`HandshakeFailed`、`AgentExited`），不得退化成裸字符串 |
| **D-F** | 第二个 harness 用哪个？CI 里必须有假 agent（无凭据），本地可选真的 | CI 用假 agent；本地与验收演示用 codex-acp 或 opencode（任一已装即可），**不得在 CI 里跑真实模型请求** |
| **D-G** | 远端/SSH/云与安装器是否确认排除在 Phase 1 之外？ | 建议排除（§3 #37/#38 已判定 ACP 传输在带外、无 1:1 平移），单独排期 |
| **D-H** | 本文的"H 类 = ACP 表达不了"结论是否接受以一次真实握手实测为准来复核？ | 建议接受：第一刀落地时跑一次真实 `hermes acp` 的 `initialize`，用实测刷新 §3 |

---

### 附：本文未做的事

- 未修改任何生产代码；未新增依赖；未运行大规模测试；未执行真实模型请求。
- 按本轮约束，未执行 `git add/commit/reset/clean/stash`，因此本文为**未跟踪文件**。
- 未触碰 AgentBox POC；未为 AgentBox 设计任何接口。
