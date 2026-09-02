# ACP Protocol Core — 原始证据笔记（ACP_SPEC 审计）

观察日期：2026-09-02（环境：WSL2 x64 Linux）。
遵守同目录 `SOURCE_POLICY.md`：本轮为只读产品研究，无 credential 读取、无模型请求、无 Git 写操作。
脱敏：`<temp-home>` = /tmp；`<workspace>` = 本仓库根。

## 权威来源清单（本轮实际使用）

| id | 来源 | class | 观察方式 |
| --- | --- | --- | --- |
| S1 | https://agentclientprotocol.com （各页 .md 抓取，全部列出） | ACP_SPEC | curl 抓取 2026-09-02 |
| S2 | spec 仓库 clone：https://github.com/agentclientprotocol/agent-client-protocol （HEAD `7a5f3a7`，2026-09-02；tag `v1.7.0`、`schema-v1.21.0`、`schema-v2.0.0-alpha.3`） | ACP_SPEC | `<temp-home>`/acp-audit 本地精读 schema/v1、schema/v2、CHANGELOG.md、README.md |
| S3 | TS SDK 仓库 https://github.com/agentclientprotocol/typescript-sdk （npm `@agentclientprotocol/sdk` 1.4.0） | ACP_SDK | clone HEAD + npm view |
| S4 | Python SDK 仓库 https://github.com/agentclientprotocol/python-sdk （PyPI `agent-client-protocol` 0.12.1） | ACP_SDK | clone + PyPI JSON API + 本地安装运行 |
| S5 | Rust SDK 仓库 https://github.com/agentclientprotocol/rust-sdk （crates.io `agent-client-protocol` 2.0.0） | ACP_SDK | clone + crates.io API |
| S6 | Registry 仓库 https://github.com/agentclientprotocol/registry + https://agentclientprotocol.com/get-started/registry | ACP_SPEC/REGISTRY_ENTRY | clone + 页面抓取 |
| S7 | 实验：synthetic fake agent / SDK client / SDK agent（脚本见 `<workspace>`/docs/research/harness-acp-viability-2026-09-02/experiments/） | CLI_OBSERVED | 2026-09-02 全部通过 |

注意（SOURCE_POLICY 第 1 节）：本笔记只断言"协议本体"事实，不构成任何 Harness 兼容性证据。

---

## 0. 版本本体（问题 1）

- **稳定 wire 协议版本 = 1**（单整数，仅 MAJOR 递增）。
  - source: S2 README.md（"The current stable ACP protocol version is `1`"）+ S1 protocol/v1/initialization（"single integer ... only incremented when breaking changes are introduced"）。
  - observed 2026-09-02; version v1.7.0; confidence HIGH; status PROVEN; stability STABLE。
- **v2 存在但整体 draft**："The v2 protocol surface as a whole is still labeled draft ... gate v2 support behind explicit version negotiation and feature flags until it stabilizes"（S1 protocol/v2/migration）。v2 schema tag `schema-v2.0.0-alpha.3`。
  - confidence HIGH; status PROVEN; stability VERSION_SENSITIVE。
- **两条 artifact 版本轨独立于 wire 版本**：
  - crate 轨：`agent-client-protocol-schema` crate v1.7.0（2026-08-20）；spec repo release tag v1.7.0。
  - schema JSON 轨：`schema-v1.21.0`（2026-08-20，最新）+ `schema-v2.0.0-alpha.3`；schema.json 内 meta `version: 1`。
  - README 原文："Crate and schema release versions describe only the artifacts themselves, not wire compatibility... Consumers should not infer wire compatibility from the crate or schema release version alone."
  - confidence HIGH; status PROVEN。
- **experimental 机制**（无 "experimental" wire 字面；规范用 "unstable"）：
  1. schema 拆分：stable `schema.json` vs `schema.unstable.json`（自 0.7.0/2025-11-25 起，unstable 特性必须由 SDK 用 flag 门控——CHANGELOG 0.7.0 原文）。
  2. 特性级：unstable 特性经 RFD（Draft→Active→Preview→Completed，S1 rfds/about）实现，先落 unstable schema，稳定后才进 stable（例：elicitation 0.11.5 unstable → 1.7.0/2026-08-20 stabilize）。
  3. wire 协商：所有可选能力走 initialize capability 协商（省略 = UNSUPPORTED，MUST）。
  4. 扩展保留：`_` 前缀方法名/通知名（`_zed.dev/...`）+ `_meta` 自定义 capability 广告。
  - confidence HIGH; status PROVEN; stability STABLE（机制本身）。
- **`_meta` 约定**：所有类型含 `_meta: {[k:string]:unknown}`；禁止在规范类型根部加自定义字段（"All possible names are reserved for future protocol versions"）；`traceparent/tracestate/baggage` SHOULD 保留给 W3C trace context（S1 protocol/v1/extensibility）。0.9.0 曾 breaking 修正 `_meta` 形状（string keys / 任意值对象，S2 CHANGELOG）。

## 1. initialize / 版本与能力协商（问题 2）

- 客户端 MUST 发 `initialize`，带其支持的最新 `protocolVersion` + `clientCapabilities`；SHOULD 带 `clientInfo{name,title,version}`。
  - source: S1 protocol/v1/initialization；schema `InitializeRequest{x-side:"agent", x-method:"initialize"}`。
- 协商规则（原文）："If the Agent supports the requested version, it MUST respond with the same version. Otherwise, the Agent MUST respond with the latest version it supports. If the Client does not support the version specified by the Agent in the initialize response, the Client SHOULD close the connection and inform the user about it."（v1 与 v2 页面同文）
  - confidence HIGH; status PROVEN; stability STABLE。
- **失败行为有定义**：版本不合 → 客户端应断开并告知用户。不是静默继续。
- Agent 侧 `agentCapabilities`（schema 精读，S2 schema/v1/schema.json）：
  - `loadSession: bool`（=false）、`promptCapabilities{image,audio,embeddedContext:bool}`、`mcpCapabilities{http,sse:bool}`、`sessionCapabilities{list,delete,additionalDirectories,resume,close}`（对象标记，省略/null=不支持，`{}`=支持）、`auth{logout}`。
  - baseline：所有 Agent MUST 支持 `session/new`、`session/prompt`、`session/cancel`、`session/update`，且 prompt 必须支持 `Text` 与 `ResourceLink` 块。
  - 原文注释："`session/load` is still handled by the top-level `load_session` capability. This will be unified in future versions."（v2 已统一）
- Client 侧声明（`clientCapabilities`）：`fs{readTextFile,writeTextFile}`、`terminal:bool`、`auth{terminal:bool}`、`elicitation{form,url}`（显式 mode 广告，"ACP does not treat `{}` as form support"）、`session.configOptions.boolean`。
- 防 silent no-op 评估：**部分**。negotiation 只约束"能力缺省即不得调用（MUST NOT call）+ 版本不合即断开"；未定义 conformance suite、未定义 agent 忽略参数/伪造 stopReason 的检测（INFERENCE，LOW）。capability 省略语义（=UNSUPPORTED）把"静默忽略调用"约束成协议违规，但没有强制验证机制（INFERENCE）。

## 2. 角色与 auth（问题 3）

- **Agent**：生成式编码程序，通常为 client 子进程；暴露 initialize、authenticate、session/new、session/prompt（+可选 session/load、logout、session/set_mode、session/cancel 等）。**Client**：编辑器/宿主；暴露 `session/update`、`session/request_permission`、fs/terminal/elicitation 方法。
  - source: S1 protocol/v1/overview; confidence HIGH; PROVEN。
- **auth 流**：initialize 响应带 `authMethods[]`；方法类型 `agent`（默认；client 调 `authenticate{methodId}`）或 `terminal`（client 用同一 agent 程序+附加 args/env 起交互进程登录；退出码 0=成功；**client MUST NOT 对 terminal 方法调 authenticate**；成功后 reconnect+reinitialize）。未认证时调用被 auth 门控的方法 → 错误码 `-32000 Authentication required`。
  - source: S1 protocol/v1/authentication + schema ErrorCode；PROVEN；terminal auth 于 1.7.0 stabilize。
- `logout`（agentCapabilities.auth.logout 门控；stabilized 0.13.3）。logout 后活跃 session 行为 **协议不保证**（原文 "The protocol does not guarantee what happens to already-running sessions after logout"）。

## 3. session/new（问题 4）

- 请求：`cwd`（绝对路径，MUST）+ `mcpServers[]`（v1 required；v2 改 optional）；可选 `additionalDirectories[]`（需 `sessionCapabilities.additionalDirectories`）。
- 响应：`sessionId`（**Agent 生成/归属**）、可选 `modes`、`configOptions`。
- session 语义：每个 session 有独立 context/history/state；effective root set = `[cwd, ...additionalDirectories]`，SHOULD 作为工具文件操作边界。
  - source: S1 protocol/v1/session-setup + schema NewSessionRequest/Response；PROVEN; STABLE。
- v2 变化：`mcpServers` optional；响应不再含 `modes`（S1 protocol/v2/migration 表）。

## 4. session/load（问题 5）

- 存在（v1 stable；`loadSession` capability 门控）。请求：`sessionId`+`cwd`+`mcpServers`（+可选 additionalDirectories）。
- **语义 = 事件 replay**：原文 "The Agent **MUST** replay the entire conversation to the Client in the form of `session/update` notifications (like `session/prompt`)... When **all** the conversation entries have been streamed to the Client, the Agent MUST respond to the original session/load request."（响应 result: null）
  - source: S1 protocol/v1/session-setup；PROVEN; STABLE。
- **load 失败行为规范未定义**（未定义专用错误码/重试语义；仅通用 JSON-RPC error 适用）。status: PARTIAL。
- 对照：`session/resume`（`sessionCapabilities.resume` 门控，stabilized 0.12.2/2026-04-23）原文 "the Agent **MUST NOT** replay the conversation history via `session/update` notifications before responding"。即 v1 中 **load=replay、resume=no-replay 二者并存**。

## 5. fork（问题 6）

- v1 **stable 无 fork**。`session/fork` 仅在 `schema.unstable.json`（`ForkSessionRequest/Response`、`SessionForkCapabilities`；meta.unstable `session_fork`）+ RFD `rfds/session-fork`（作者 josevalim，champion benbrandt；2025-12-10 对齐 session/load 参数）。unstable 实现始于 0.10.0（2025-12-06，CHANGELOG "Draft implementation of session/fork"），至今未 stabilize。v2 也只在 v2-unstable schema。
- RFD 动机：以现有会话为上下文派生新会话（总结、**潜在 subagents**），响应返回新 `sessionId`。
  - source: S2 schema.unstable + S1 rfds/session-fork；confidence HIGH; status PROVEN（"存在但 unstable"）；stability VERSION_SENSITIVE。

## 6. session/prompt（问题 7）

- 请求：`sessionId` + `prompt: ContentBlock[]`；响应：`stopReason`（enum：`end_turn` / `max_tokens` / `max_turn_requests` / `refusal` / `cancelled`）。MUST 在 cancel 时返回 `cancelled` 即使底层抛异常（原文见问题 13）。
  - source: S2 schema PromptRequest/StopReason + S1 prompt-turn；PROVEN; STABLE。
- v2 语义重构：prompt 响应=受理 ack；turn 结束/stopReason 移到 `state_update`（idle）通知（S1 v2/overview+migration）。

## 7. session/update 全变体（问题 8，v1 stable 11 个）

Schema `$defs/SessionUpdate`（discriminator `sessionUpdate`），S2 精读，全部字段：

1. `user_message_chunk` / 2. `agent_message_chunk` / 3. `agent_thought_chunk` — ContentChunk{content: ContentBlock, _meta}；可带 `messageId`（opaque，同 id=同一消息；MAY，stable 自 0.13.6 "optional message IDs"）。
4. `tool_call` — ToolCall 全量：`toolCallId, title, kind(10 枚举), status, content[], locations[], rawInput, rawOutput, _meta`。
5. `tool_call_update` — ToolCallUpdate：除 `toolCallId` 外全 optional 的 patch（原文 "only changed fields need to be included"；content/locations 为整组替换）。
6. `plan` — Plan{entries[]}，整表替换。
7. `available_commands_update` — 可用 slash 命令集（AvailableCommand{name,description,input: UnstructuredCommandInput|AvailableCommandInput}）。
8. `current_mode_update` — {currentModeId}。
9. `config_option_update` — {configOptions[]} 全量（stable 0.10.8）。
10. `session_info_update` — 标题/时间戳/自定义元数据（stable 0.11.1）。
11. `usage_update` — {used,size 必填, cost?{amount,currency}}（stable 0.13.6）。

Unstable 追加（schema.unstable）：`compaction`（CompactionUpdate/SummaryChunk，1.7.0 加）、`session_notice`（Notice）、plan 操作类（PlanUpdate/PlanFile…）、`mcp_message`。
- status: PROVEN; stability: 1–11 STABLE；unstable 项 VERSION_SENSITIVE。

## 8. tool call 生命周期（问题 9）

- `ToolCall`：`toolCallId`(必)、`title`(必)、`kind`：read/edit/delete/move/search/execute/think/fetch/switch_mode/other（默认 other）、`status`：`pending`（"input is either streaming or we're awaiting approval"）→ `in_progress` → `completed` | `failed`、`content: ToolCallContent[]`（`content`|`diff`{path,oldText?,newText}|`terminal`{terminalId}）、`locations[{path,line?}]`、`rawInput`/`rawOutput`（任意 JSON）、`_meta`。
- 更新为 patch 语义；完成后 content 携带结果；diff 用于 UI 展示编辑。
- source: S2 schema + S1 protocol/v1/tool-calls；PROVEN; STABLE。（unstable: `name` 字段/tool call name，1.6.0+）

## 9. permission（问题 10）——重点风险

- `session/request_permission`（agent→client 请求）：`sessionId, toolCall: ToolCallUpdate（必，v1）, options: PermissionOption[]（必）`；`PermissionOption{optionId, name, kind: allow_once|allow_always|reject_once|reject_always}`。
- 响应 `outcome`：`{outcome:"cancelled"}` 或 `{outcome:"selected", optionId}`。
- **超时：规范任何地方都没有定义 permission 请求的超时或 deadline**（全文检索 initialization/prompt-turn/tool-calls/cancellation 页与 schema 均无 timeout 字样；schema 无任何 timeout 字段）。Agent 侧只能等 client 的 JSON-RPC 响应；规范的解除路径只有两条：client 主动 `session/cancel`（此时 client **MUST** 以 `cancelled` outcome 回应所有 pending permission 请求），或 client 直接以 `-32800` 错误响应（cancellation 页级联示例）。**若 client 不回应且不 cancel，agent 侧理论可无限等待**（INFERENCE from "无 timeout 定义"+JSON-RPC 语义，LOW-MEDIUM；协议未禁止 client 实现自动 allow/reject，原文 "Clients MAY automatically allow or reject permission requests according to the user settings"）。
- v2 RFD（rfds/v2/permission-requests，2026-07-02/07-14）：`toolCall` → 可选 `subject` tagged union（tool_call|command）+ 必填 `title`/可选 `description`；仍无超时。
  - source: S1 tool-calls/prompt-turn/cancellation + S2 schema；PROVEN（无 timeout=规范缺席）；stability STABLE（该缺席在 v1/v2 均存在）。

## 10. elicitation（问题 11）

- **存在且已 stable**：`elicitation/create`（agent→client 请求）+ `elicitation/complete`（agent→client 通知，URL 模式完成回执）；unstable 起 0.11.5（2026-04-09），**1.7.0（2026-08-20）stabilize**（S2 CHANGELOG）。
- 两种模式：`form`（受限 JSON Schema，**MUST NOT** 用于索取 secrets/credentials）与 `url`（敏感/外部托管流程如 OAuth；client MUST 显示 host 并征得同意）。作用域：session（可含 toolCallId）或 requestId（会话外请求）。
- 能力：`clientCapabilities.elicitation{form,url}`，每 mode 显式广告，刻意不同于 MCP 2026-07-28 rc（"ACP requires each supported mode to be explicit"）。
- source: S1 protocol/v1/elicitation + S2 schema；PROVEN; STABLE（1.7.0+；SDK/Agent 支持度仍 VERSION_SENSITIVE）。

## 11. plan（问题 12）

- `plan` update：`entries[]{content, priority(high|medium|low), status(pending|in_progress|completed)}`；每次更新 Agent MUST 发送完整 entries，Client MUST 整表替换（原文）。动态增删允许。
- **plan approval 不在协议内**：无 approve/reject 方法或 outcome；client 仅展示（INFERENCE from schema+docs 缺席，MEDIUM）。unstable `plan-operations`/`plan-variants` RFD 在演进文件级 plan。
- source: S1 protocol/v1/agent-plan + S2 schema Plan；PROVEN; STABLE。

## 12. cancel（问题 13）

- `session/cancel` 通知（无响应）。语义链（prompt-turn 页原文）：
  - client 发 cancel 时 SHOULD 预标记所有未完成 tool_call 为 `cancelled`；**MUST** 以 `cancelled` outcome 回应所有 pending `session/request_permission`；
  - agent SHOULD 尽快停掉 LLM 请求与工具调用；**MUST** 在响应原始 `session/prompt` 请求时返回 `stopReason:"cancelled"`，即使底层操作抛异常（"Agents MUST catch these errors and return the semantically meaningful cancelled stop reason"）；
  - agent MAY 在收到 cancel 后继续发 `session/update`，但 MUST 在 prompt 响应之前；client SHOULD 仍接受 cancel 后到达的 tool call 更新。
- race：cancel 与 prompt 响应的竞争由"agent 的 prompt 响应必须是 cancelled stopReason + client 接受迟到的 update"收敛；未定义 client cancel 抵达前 agent 已 end_turn 的情况（INFERENCE，LOW）。
- 通用 `$/cancel_request`（protocol method；stabilized 1.2.0）：per-request 取消；接收方可忽略（"Cancellation remains optional"），但 MUST 以正常响应或 `-32800` 错误收尾；级联示例中 agent 用 `$/cancel_request` 取消自己发出的 terminal/permission 请求。
- source: S1 prompt-turn + cancellation + S2 schema；PROVEN; STABLE。

## 13. mode / config options（问题 14）

- v1 同时存在两套：`session/set_mode`+`current_mode_update`+`modes`（**deprecated 方向**：session-modes 页 Note "Dedicated session mode methods will be removed in a future version"）；`session/set_config_option`（stable 0.10.8 起；boolean 类别 1.3.0 stabilize；model 类别 1.1.0）+`config_option_update` 全量推送。
- v2：`session/set_mode` **删除**，仅 `session/set_config_option`（S1 v2/migration 表）。
- source: S1 session-modes/session-config-options + S2 schema；PROVEN; set_config_option STABLE、set_mode VERSION_SENSITIVE。

## 14. terminal（问题 15）

- 五方法全部为 **client 侧**方法（agent 调用 client）：`terminal/create{command,args,env,cwd?,outputByteLimit?}`→`terminalId`；`terminal/output`（当前输出+truncated 标志+exit status）；`terminal/wait_for_exit`→`TerminalExitStatus{exitCode?,signal?}`；`terminal/kill`（kill 不释放）；`terminal/release`（释放；嵌入 ToolCallContent 前不得 release）。
- 门控：`clientCapabilities.terminal`（单一 bool 覆盖全部 terminal/* 方法）。`outputByteLimit`：client 超限从头部截断且 MUST 保持字符边界。
- v2：**整套删除**（"The Client file system, terminal execution, and session modes APIs are gone"；Agent 自有终端输出为 display-only v2 面）。
- source: S1 protocol/v1/terminals + S2 schema；PROVEN; v1 STABLE / v2 REMOVED。

## 15. filesystem（问题 16）

- `fs/read_text_file{sessionId,path,line?(1-based),limit?}`→`{content}`；`fs/write_text_file{sessionId,path,content}`。门控 `clientCapabilities.fs.readTextFile/writeTextFile`（分别独立）。用途含读编辑器未保存状态。
- v2：**删除**（迁移指南：改用 client 提供的 MCP servers）。
- source: S1 protocol/v1/file-system + S2 schema；PROVEN; v1 STABLE / v2 REMOVED。

## 16. MCP attachment / passthrough（问题 17）

- 方向：**client → agent 单向**。`session/new`/`session/load`/`session/resume` 的 `mcpServers[]`：`stdio`（所有 Agent MUST 支持：name/command(绝对路径)/args/env）、`http`（`mcpCapabilities.http` 门控；name/url/headers）、`sse`（门控；**MCP 规范已 deprecated 该 transport**）。Agent "SHOULD connect to all MCP servers specified by the Client"；v1 文档明示 client 可借此把自家工具直供模型（"Clients MAY use this ability to provide tools directly to the underlying language model by including their own MCP server"）。
- **Agent 无法向 client 要 MCP**（v1 stable 无此方法）；MCP-over-ACP 为 **unstable**（0.13.0/2026-05-12 experimental message types）：`mcpCapabilities.acp` + `McpServerAcp{id}` + `mcp/connect`/`mcp/message`/`mcp/disconnect`（meta.unstable clientMethods），RFD rfds/mcp-over-acp（作者 nikomatsakis；目的含 WASM 沙箱/proxy-chains 场景）。v1 unstable 曾移除 MCP SSE 并将 stdio 改 opt-in（0.13.6，v2 侧）。
- source: S1 session-setup#mcp-servers + rfds/mcp-over-acp + S2 meta.unstable；PROVEN; v1 STABLE（三 transport）/ MCP-over-ACP UNSTABLE。

## 17. usage/token/cost（问题 18）

- `usage_update`（stable 0.13.6）：`used`/`size`（uint64 token，必填）+ `cost{amount:double, currency:ISO4217}`（可选）——session 级 context 与累计成本。
- **turn 级 token 明细不在协议内**：RFD `rfds/end-turn-token-usage`（作者 ahmedhesham6）仍处 Draft（原文 "intentionally kept in Draft while token accounting semantics are still being refined"）；strawman 为 PromptResponse/v2 state_update 加 `usage{totalTokens,inputTokens,outputTokens,thoughtTokens,cachedReadTokens,cachedWriteTokens}`。
- source: S1 prompt-turn + rfds/end-turn-token-usage + S2 schema；PROVEN; session 级 STABLE / turn 级 NOT_SUPPORTED(仅 Draft RFD)。

## 18. images/content blocks（问题 19）

- ContentBlock（与 MCP 内容类型兼容，原文 "This structure is compatible with the Model Context Protocol (MCP), enabling agents to seamlessly forward content from MCP tool outputs without transformation"）：
  - `text`（baseline MUST；Markdown 渲染 SHOULD）、`resource_link`（baseline MUST）、`image`（`promptCapabilities.image`）、`audio`（`promptCapabilities.audio`）、`resource`（内嵌资源；`promptCapabilities.embeddedContext`）。
- ToolCallContent 额外有 `diff` 与 `terminal` 两种展示块。
- source: S1 protocol/v1/content + S2 schema；PROVEN; STABLE。

## 19. sub-agent / delegation（问题 20）

- **无原生概念**：schema 无 subagent/delegation 类型；仅有 tool kinds `think`/`switch_mode`、`tool_call` 流展示。session/fork RFD 把 subagents 列为 fork 的潜在未来用途（"ranging from summaries to potentially subagents"）；proxy-chains RFD 讨论 agent extension/proxy 组合（unstable/ draft）。实践上只能用 tool_call（或 unstable fork）模拟。
  - source: S2 schema 全量枚举 + S1 rfds/session-fork + rfds/proxy-chains；status: NOT_SUPPORTED（原生）/ PARTIAL（模拟）；confidence HIGH。

## 20. error model（问题 21）

- JSON-RPC 2.0 标准码：-32700/-32600/-32601/-32603；ACP 保留区：`-32800 Request cancelled`、`-32000 Authentication required`、`-32002 Resource not found`（"same as MCP"，0.4.3 起定义）；另允许任意 int32 `Other`。
- 通知永不接收响应（"Notifications never receive responses (success or error)"）；未知扩展请求 → `-32601`；未知扩展通知 SHOULD 忽略。
- Agent 内部错误 → 对 `session/prompt` 等请求回 JSON-RPC error（message 自由文本；SDK 会附 data.details/errors，实验 S7 见 -32602/-32603 实例）。cancel 场景例外：MUST 折叠为 `cancelled` stopReason。
- source: S2 schema ErrorCode + S1 overview/extensibility/cancellation + S7 实验；PROVEN; STABLE。

## 21. connection loss / recovery / durable replay（问题 22）——验证任务书预期

- **规范不定义 reconnect**：stdio transport 生命周期 = 子进程 spawn→消息→close stdin/terminate；无握手重连、无 sequence/resume 协议级机制、无 durable 事件日志要求。
- 恢复路径 = client 重新拉起 agent 后调 `session/load`（整段 replay，若 `loadSession`）或 `session/resume`（不 replay）。会话持久化本身是 **agent 侧实现自由**（"persistence across restarts and sharing sessions between different Client instances"，属于 capability 而非义务）。
- Streamable HTTP RFD 原文（关键）："In v1, durability and reliability are the implementer's responsibility — the protocol provides the building blocks, not the guarantees... a client can reconnect and resume it via `session/load`"；"more robust durability and reliability primitives coming in **v2**"。
- v2 replay 游标：RFD rfds/v2/session-resume-replay（2026-07-02，作者 benbrandt）把 load/resume 统一为 `session/resume` + 可选 `replayFrom:{type:"start"}`（inclusive 游标；留未来 checkpoint/message 游标）。仍是 draft。
- **结论：任务书预期"定义事件顺序但不定义 durable replay"成立**（v1 replay=load 全量重放，无 cursor/ack/断点续传）。
  - source: S1 transports/session-setup + rfds/streamable-http-websocket-transport + rfds/v2/session-resume-replay；PROVEN; confidence HIGH。

## 22. backpressure / ordering / sequence（问题 23）

- **规范无顺序保证条文、无序列号、无背书流控**。stdio 字节流天然 FIFO（INFERENCE，MEDIUM）；`session/update` 顺序即到达顺序，协议用"MUST 在 prompt 响应前发完 pending updates"局部锚定（prompt-turn 页）。
- 唯一的缓冲上限机制：terminal `outputByteLimit`（client 侧截断）。慢消费者（如 HTTP stream 断开）行为完全未定义。
- 实验 S7（newline-delimited FIFO）观察到流式 update 先于 prompt 响应到达、顺序保真，属实现行为非规范保证。
  - status: PARTIAL（部分存在：局部锚定+outputByteLimit）；confidence MEDIUM。

## 23. transport（问题 24）

- **stdio（唯一 stable transport）**：newline-delimited JSON-RPC（"Messages are delimited by newlines (`\n`), and MUST NOT contain embedded newlines"）；UTF-8；agent MUST NOT 向 stdout 写非 ACP 消息；stderr 随意日志。client 启 agent 为子进程。
- **Streamable HTTP / WebSocket：仅 draft RFD**（"In discussion, draft proposal in progress"）：POST(202 Accepted；initialize 200)+长连 GET SSE 流（connection 级+session 级）+WS 升级同端点；HTTP/2 强制；cookie 强制。**官方尚未定义任何 HTTP/SSE/WS transport 规范**。
- v2 追加 JSON-RPC batch 数组支持（v2/transports）。
- 自定义 transport 允许（transport-agnostic），但 MUST 保留 JSON-RPC 消息格式与 lifecycle。
- source: S1 protocol/v1/transports + v2/transports + rfds/streamable-http-websocket-transport；PROVEN; stdio STABLE / HTTP-WS DRAFT。

## 24. extension methods（问题 25）

- 机制 = `_` 前缀方法名（请求带 id 必须应答，未知回 `-32601`；通知无 id，未知 SHOULD 忽略）+ capability 对象 `_meta` 广告自定义能力 + 所有类型的 `_meta` 附带数据。Rust SDK 有 `ExtRequest/ExtResponse/ExtNotification` 类型；Python SDK handler 面 `ext_method/ext_notification`（S4 interfaces.py:158-160）。
- source: S1 extensibility + S2 schema；PROVEN; STABLE。

## 25. SDK 清单（问题 26）

| SDK | 包名/版本 | 仓库/维护方 | 最新发布 | wire 版本声明 | 与 schema 版本关系 |
| --- | --- | --- | --- | --- | --- |
| TypeScript | npm `@agentclientprotocol/sdk` 1.4.0 | agentclientprotocol/typescript-sdk（官方 org） | 2026-08-20 | `PROTOCOL_V1=1`/`PROTOCOL_V2=2`（src/protocol-router.ts）、v2 导出 `PROTOCOL_VERSION=2`（src/v2/schema/index.ts）；v2 API 在 `./experimental/v2` export（1.3.0 起 experimental） | changelog 1.3.0 引 "schema v1.20.0 and v2.0.0-alpha.2"；1.4.0 "Stabilize elicitation APIs" |
| Python | PyPI `agent-client-protocol` 0.12.1 | agentclientprotocol/python-sdk | 2026-08-16（wheel 2026-08-16） | `PROTOCOL_VERSION = 1`（src/acp/meta.py:49）；`use_unstable_protocol` flag（connect_to_agent/run_agent 参数） | 源码同步 schema 1.21.0（git log "feat(schema): update to 1.21.0"）；Pydantic 模型 + asyncio 双侧基类 |
| Rust | crates.io `agent-client-protocol` 2.0.0（runtime）+ `agent-client-protocol-schema` 1.7.0（类型面） | agentclientprotocol/rust-sdk（runtime，2026-07-23）；spec 仓库内 schema crate | 2.0.0/1.7.0 | `ProtocolVersion::V1/V2`；unstable 用 cargo feature（`unstable_plan_operations`、`unstable_mcp_over_acp`、`unstable_tool_call_name`）；另有 http/ws transport crate 2.0.0 | README 版本语义原文（见 §0） |
| （官方另有）Kotlin `acp-kotlin`（JVM）、Java `java-sdk` | agentclientprotocol org | 见 S2 README Integrations | 未逐项审计 | — |

- **SDK 版本与 wire 版本独立：PROVEN**（spec README 显式声明 + 三家 SDK changelog 用 schema 版本号跟踪同步）。SDK changelog 不直接写 "wire protocol version"，而是引 schema artifact 版本（v1.x / v2.0.0-alpha.x）。
- 社区 SDK（Go/C#/Swift/Dart/Elixir 等）列表见 S1 libraries/community。

## 26. Registry（问题 27）

- repo：https://github.com/agentclientprotocol/registry；分发索引 `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`（FORMAT.md）。
- 收录标准：**curated，仅收支持 authentication 的 agent**（README 原文 "curated list of agents that support user authentication"）；"All agents are verified via CI to ensure they return valid `authMethods` in the ACP handshake"；流程 = PR + 目录 `<id>/agent.json` + 16x16 currentColor icon.svg + CI schema 校验（CONTRIBUTING.md）；另有 quarantine.json。
- manifest 字段（agent.schema.json）：`id`（小写连字符）、`name`、`version`（semver，必填）、`description`、`repository`、`website`、`authors`、`license`(SPDX/proprietary)、`license_url`、`distribution`（至少一种：`binary`（每平台 archive URL + **可选** sha256 + cmd/args/env；支持 zip/tar.gz 等，禁 dmg/pkg/deb/rpm）、`npx{package,args}`、`uvx{package,args}`）。
- **version pinning**：package 引用含精确版本（例 codex-acp/agent.json：`"@agentclientprotocol/codex-acp@1.8.0"`）；binary 的 sha256 为 optional（非强制 digest pin）。**每小时 cron 自动跨 npm/PyPI/GitHub releases 升版本并直提 main**（README "Automatic Version Updates"）。
- 活跃度：40+ 条目（clone 时 43 目录：claude-acp、codex-acp、gemini、goose、github-copilot、kimi、qwen-code、cursor、devin 等）；页面与 repo 均活跃。
- source: S6；PROVEN; confidence HIGH。注意 SOURCE_POLICY：registry 列出 ≠ 官方原生支持（条目多为 wrapper/adapter，如 "ACP adapter for OpenAI's coding assistant"）。

## 27. 实验记录（S7，全部无 credential / 无模型请求）

脚本位于 `<workspace>`/docs/research/harness-acp-viability-2026-09-02/experiments/，SDK 源码以 `PYTHONPATH=<temp-home>`/acp-sdk-python-sdk/src 引用（未全局安装）：

1. `acp_fake_agent.py` + `acp_raw_client_test.py`（raw JSON-RPC 双向）：PASS——
   - newline-delimited framing 成立；嵌入换行禁止（发送断言）；
   - initialize 版本 echo（agent 支持 v2 → 原样回 2）；
   - session/new 返回 agent 生成的 sessionId；
   - `session/update`（agent_message_chunk→tool_call→tool_call_update）先于 prompt 响应到达（FIFO 保序）；
   - 错误模型：未知方法 `-32601`；未知 session `-32002`；坏 JSON → `id:null` + `-32700`；
   - `session/cancel` 通知无响应（符合"通知永不响应"）。
2. `acp_sdk_client_test.py`（官方 Py SDK 0.12.1 Client ↔ fake agent）：PASS——initialize 协商至 v1；Pydantic 宽松反序列化（clientCapabilities=null 走 default-on-error）；流式更新类型映射 AgentMessageChunk/ToolCallStart/ToolCallProgress；prompt 返回 end_turn。
3. `acp_sdk_agent_perm_test.py`（官方 Py SDK Agent ↔ raw driver）：PASS——
   - agent→client 的 `session/request_permission` 往返：options=[{optionId,name,kind}]，client 以 `{outcome:{outcome:"selected",optionId}}` 应答后被接受；
   - 负例：`tool_call:null` 被 SDK Pydantic 校验拒绝 → `-32602 Invalid params`（证实 v1 permission 的 toolCall 为必填；v2 RFD 才把 subject 改为可选）；
   - 顺带证实 SDK 新式 handler 以 kwargs 分发（session_update(session_id, update)）。

## 遗留开放问题（OPEN_QUESTIONS）

- session/load 失败的错误码约定（仅通用 JSON-RPC error 可用）；agent 拒绝 load 时是否应保留会话状态未定义。
- v2 `state_update`/idle 语义仍在快速演进（0.13.x unstable→1.3.0 调整多次），v2 实现前需持续跟踪 `schema-v2.0.0-alpha.*`。
- HTTP/WS transport RFD 落 v1 的进度（RFD 声明 targeted for inclusion in v1 as additive），SDK 已先行实验实现（Rust 2.0.0 http crate、TS experimental/http-client、Py Transport）——规范与 SDK 存在时间差。
