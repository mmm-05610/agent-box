# ACP Protocol Capability Matrix（协议本体审计 · 2026-09-02）

配套原始证据：`research-notes/acp-protocol-core.md`（下称 NOTES §n）。来源分级/脱敏遵循 `SOURCE_POLICY.md`。

- 观察日期：2026-09-02。本矩阵只评估 **ACP 协议本体**，不构成任何 Harness 的兼容性结论。
- 状态词（SOURCE_POLICY §6）：SUPPORTED / PARTIAL / NOT_SUPPORTED / UNKNOWN / VERSION_SENSITIVE。
- 出处缩写：SCH=schema 精读（spec 仓库 HEAD `7a5f3a7`，tag v1.7.0 / schema-v1.21.0 / schema-v2.0.0-alpha.3）；DOC=agentclientprotocol.com 对应页（.md 抓取）；CH=仓库 CHANGELOG；EXP=本地 synthetic 实验。全部访问/观察日期 2026-09-02。

## 矩阵

| # | 能力项 | 状态（v1 stable） | 出处 | 版本 | confidence | status | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1a | stable protocol version = 1（单整数 MAJOR） | SUPPORTED | SCH README + DOC v1/initialization | v1（schema-v1.21.0） | HIGH | PROVEN | wire 版本与 artifact 版本三轨独立（见 26） |
| 1b | v2（prompt 响应=受理、upsert 更新、删 fs/terminal/set_mode） | VERSION_SENSITIVE | DOC v2/migration（"as a whole still labeled draft"） | schema-v2.0.0-alpha.3 | HIGH | PROVEN | 协商 `protocolVersion:2` 才启用；生产应钉 v1 |
| 1c | experimental 机制：schema.unstable + SDK flag 门控 + RFD 流程 + `_` 扩展 | SUPPORTED | SCH schema.unstable + DOC rfds/about + CH 0.7.0 | 0.7.0 起定型 | HIGH | PROVEN | 无 "experimental" wire 字面；规范用 "unstable" |
| 1d | `_meta` 约定（所有类型；禁根部自定义字段；traceparent/tracestate/baggage 保留） | SUPPORTED | DOC v1/extensibility + CH 0.9.0 | 0.9.0+ | HIGH | PROVEN | 也用于广告自定义 capability |
| 2a | initialize + 版本协商（支持→同版；不支持→回最新；客户端不合→断开并告知） | SUPPORTED | DOC v1/initialization + v2/initialization | v1/v2 同文 | HIGH | PROVEN | 协商失败行为有定义，非静默 |
| 2b | capabilities 协商（省略=UNSUPPORTED，MUST；双侧声明集见 NOTES §1） | SUPPORTED | SCH AgentCapabilities/ClientCapabilities | v1.21.0 | HIGH | PROVEN | baseline：session/new、prompt、cancel、update 必备 |
| 2c | 防 silent no-op（conformance/参数校验强制） | PARTIAL | INFERENCE（规范无 conformance suite） | — | MEDIUM | PARTIAL | 只约束"能力缺省不得调用"；agent 忽略参数无检测手段 |
| 3a | 角色（Agent=子进程服务端；Client=宿主编辑器） | SUPPORTED | DOC v1/overview | v1 | HIGH | PROVEN | — |
| 3b | auth（authMethods；agent/terminal 两型；-32000 auth_required；logout 门控） | SUPPORTED | DOC v1/authentication + SCH ErrorCode | terminal auth 1.7.0 stabilize | HIGH | PROVEN | logout 后活跃会话行为不保证 |
| 4 | session/new（cwd+mcpServers 必填；sessionId 由 Agent 生成归属；modes/configOptions 可选） | SUPPORTED | SCH NewSessionRequest/Response + DOC v1/session-setup | v1 | HIGH | PROVEN | v2：mcpServers 改 optional、去 modes |
| 5a | session/load（=全量事件 replay 后才响应） | SUPPORTED | DOC v1/session-setup（"MUST replay the entire conversation"） | v1 | HIGH | PROVEN | loadSession capability 门控 |
| 5b | load 失败行为（专用错误码/状态恢复） | PARTIAL | INFERENCE（规范未定义） | — | MEDIUM | UNKNOWN→按 PARTIAL 记 | 仅通用 JSON-RPC error 可用；OPEN_QUESTION |
| 5c | session/resume（不 replay；resume capability 门控） | SUPPORTED | SCH ResumeSessionRequest + DOC v1/session-setup | stabilized 0.12.2（2026-04-23） | HIGH | PROVEN | v1 文档原文对比见 NOTES §4 |
| 6 | fork（session/fork） | NOT_SUPPORTED（stable）/ VERSION_SENSITIVE（unstable 存在） | SCH schema.unstable ForkSession* + DOC rfds/session-fork + CH 0.10.0 | unstable 0.10.0（2025-12-06） | HIGH | PROVEN | v1/v2 stable 均无；仅 unstable schema + RFD |
| 7 | prompt（ContentBlock[]；stopReason=end_turn/max_tokens/max_turn_requests/refusal/cancelled） | SUPPORTED | SCH PromptRequest/StopReason | v1 | HIGH | PROVEN | v2 响应语义重构（受理 ack + state_update） |
| 8 | session/update 11 个 stable 变体（user/agent/thought chunk、tool_call、tool_call_update、plan、available_commands_update、current_mode_update、config_option_update、session_info_update、usage_update）+ 可选 messageId | SUPPORTED | SCH SessionUpdate（discriminator sessionUpdate） | 1.7.0 面 | HIGH | PROVEN | unstable 追加：compaction/notice/plan 操作/mcp_message |
| 9 | tool call 生命周期（kind 10 枚举；status pending→in_progress→completed/failed；content[content/diff/terminal]；locations；rawInput/rawOutput；patch 式更新） | SUPPORTED | SCH ToolCall/ToolCallUpdate/ToolCallContent + DOC v1/tool-calls | v1 | HIGH | PROVEN | unstable `name` 字段（tool call name RFD） |
| 10a | permission（options[allow/reject once/always]；outcome=cancelled\|selected+optionId） | SUPPORTED | SCH RequestPermissionRequest/Outcome + DOC v1/tool-calls | v1 | HIGH | PROVEN | v1 必填 toolCall（实验 EXP 证实 -32602）；v2 RFD 改 title+subject |
| 10b | **permission 超时（responder 可无限等待？）** | NOT_SUPPORTED（无超时定义） | 全文检索 DOC tool-calls/prompt-turn/cancellation + SCH（无 timeout 字段/条文） | v1 与 v2 均无 | HIGH | PROVEN（规范缺席） | 解除仅靠 client 回应/cancel/-32800；client MAY 自动 allow/reject |
| 11 | elicitation（form+url；elicitation/create+complete；session/toolCall/request 三作用域） | SUPPORTED | DOC v1/elicitation + CH 1.7.0 "stabilize elicitation" | 1.7.0（2026-08-20） | HIGH | PROVEN | 0.11.5（2026-04-09）起 unstable；mode 显式广告≠MCP 语义 |
| 12a | plan（entries{content,priority,status}；整表替换） | SUPPORTED | SCH Plan/PlanEntry + DOC v1/agent-plan | v1 | HIGH | PROVEN | 状态机 3 态 |
| 12b | plan approval（client 批准/拒绝 plan） | NOT_SUPPORTED | INFERENCE（schema/docs 无 approve 方法） | — | MEDIUM | UNKNOWN→按 NOT_SUPPORTED 记 | plan 仅展示；unstable plan-operations/plan-variants RFD 演进中 |
| 13 | cancel（session/cancel 通知；MUST 回 cancelled stopReason；pending permission MUST 回 cancelled outcome；$/cancel_request 可选） | SUPPORTED | DOC v1/prompt-turn#cancellation + v1/cancellation | $/cancel_request 1.2.0 stabilize | HIGH | PROVEN | cancel 后 agent 仍可发 update（须在响应前）；race 无仲裁条文（INFERENCE） |
| 14a | set_mode / current_mode_update / modes | VERSION_SENSITIVE（deprecated 方向） | DOC v1/session-modes Note（"will be removed in a future version"） | v1 | HIGH | PROVEN | v2 删除 |
| 14b | set_config_option + config_option_update（boolean/model 类别） | SUPPORTED | CH 0.10.8/1.1.0/1.3.0 stabilize + SCH | v1 | HIGH | PROVEN | v2 保留；v2 必填 typed value |
| 15 | terminal（create/output/wait_for_exit/kill/release；outputByteLimit；ToolCallContent 嵌入） | SUPPORTED | DOC v1/terminals + SCH | v1 | HIGH | PROVEN | clientCapabilities.terminal 单 bool 门控；**v2 整套删除** |
| 16 | filesystem（fs/read_text_file 含 line/limit；fs/write_text_file） | SUPPORTED | DOC v1/file-system + SCH | v1 | HIGH | PROVEN | fs 能力二位独立门控；**v2 整套删除** |
| 17a | MCP attachment（client→agent：mcpServers；stdio 全员必支持；http/sse 能力门控，sse 已被 MCP 弃用） | SUPPORTED | DOC v1/session-setup#mcp-servers | v1 | HIGH | PROVEN | client 可借自备 MCP server 向 agent 直供工具 |
| 17b | Agent 向 Client 要 MCP（MCP-over-ACP：mcpCapabilities.acp、mcp/connect、mcp/message、mcp/disconnect） | NOT_SUPPORTED（stable）/ VERSION_SENSITIVE（unstable） | SCH meta.unstable + DOC rfds/mcp-over-acp + CH 0.13.0 | unstable 0.13.0（2026-05-12） | HIGH | PROVEN | Rust SDK 有 polyfill 实现（unstable feature） |
| 18a | session 级 usage（usage_update：used/size 必填 + cost[amount,currency]） | SUPPORTED | SCH UsageUpdate/Cost + CH 0.13.6 stabilize | 0.13.6（2026-06-05） | HIGH | PROVEN | — |
| 18b | turn 级 token 明细（input/output/thought/cache） | NOT_SUPPORTED | DOC rfds/end-turn-token-usage（Draft） | Draft | HIGH | PROVEN | strawman: PromptResponse/v2 state_update 附 usage |
| 19 | content blocks（text/resource_link baseline MUST；image/audio/resource 能力门控；MCP 兼容） | SUPPORTED | SCH ContentBlock + DOC v1/content | v1 | HIGH | PROVEN | ToolCallContent 另有 diff/terminal 展示块 |
| 20 | sub-agent / delegation 原生概念 | NOT_SUPPORTED | SCH 全量枚举无相关类型 + DOC rfds/session-fork（仅列为 fork 未来用途） | — | HIGH | PROVEN | 只能用 tool_call 模拟（或 unstable fork） |
| 21 | error model（JSON-RPC 2.0 标准码 + -32800 cancelled、-32000 auth、-32002 resource not found + 任意 Other；通知无响应；未知 ext 请求 -32601/通知忽略） | SUPPORTED | SCH ErrorCode + DOC v1/overview+cancellation | v1（-32002 自 0.4.3） | HIGH | PROVEN | EXP 实测 -32601/-32002/-32700/-32602 |
| 22 | reconnect / durable replay | NOT_SUPPORTED（无协议级 reconnect/cursor/ack） | DOC v1/transports + rfds/streamable-http-websocket-transport（"durability ... implementer's responsibility"）+ rfds/v2/session-resume-replay | v1；v2 draft replayFrom | HIGH | PROVEN | 恢复=重启 agent + load(全量 replay)/resume(不 replay)；v2 游标 replayFrom:{start} 仍 draft |
| 23 | ordering / backpressure / sequence guarantees | PARTIAL | DOC v1/prompt-turn（局部锚定：响应前发完 pending updates）+ SCH（terminal outputByteLimit 唯一缓冲上限） | v1 | MEDIUM | PARTIAL | 无序列号、无流控、慢消费者行为未定义；FIFO 为 stdio 实现属性（INFERENCE） |
| 24a | transport：stdio newline-delimited JSON-RPC（UTF-8；禁嵌入换行；stdout 仅 ACP 消息；stderr 日志） | SUPPORTED | DOC v1/transports | v1 | HIGH | PROVEN | EXP 实测双向 framing |
| 24b | 官方 HTTP/SSE/WebSocket transport | NOT_SUPPORTED（规范层）/ VERSION_SENSITIVE（RFD+SDK 实验） | DOC v1/transports（"draft proposal in progress"）+ rfds/streamable-http-websocket-transport | Draft | HIGH | PROVEN | POST+GET SSE+WS 升级、HTTP/2、cookie；SDK 已先行（Rust http crate 2.0.0、TS experimental/http-client、Py Transport+examples） |
| 24c | JSON-RPC batch（v2） | VERSION_SENSITIVE | DOC v2/transports | v2 | HIGH | PROVEN | v1 未定义 batch |
| 25 | extension methods（`_` 前缀请求/通知 + `_meta` capability 广告；未知请求 -32601、未知通知忽略） | SUPPORTED | DOC v1/extensibility + SCH ExtRequest/ExtNotification | v1 | HIGH | PROVEN | SDK：Rust Ext* 类型、Py ext_method/ext_notification |
| 26a | TS SDK：npm `@agentclientprotocol/sdk` 1.4.0（agentclientprotocol/typescript-sdk；2026-08-20） | SUPPORTED | npm view + repo clone | 1.4.0；PROTOCOL_V1=1/V2=2 | HIGH | PROVEN | v2 API 在 `./experimental/v2`；changelog 引 schema v1.20.0/v2.0.0-alpha.2 |
| 26b | Python SDK：PyPI `agent-client-protocol` 0.12.1（agentclientprotocol/python-sdk；2026-08-16） | SUPPORTED | PyPI API + repo clone + EXP 运行 | 0.12.1；PROTOCOL_VERSION=1（meta.py:49） | HIGH | PROVEN | `use_unstable_protocol` flag；schema 同步 1.21.0；Pydantic+asyncio |
| 26c | Rust：crates.io `agent-client-protocol` 2.0.0 runtime（rust-sdk）+ `agent-client-protocol-schema` 1.7.0 类型面 | SUPPORTED | crates.io API + repo clone | 2.0.0（2026-07-23）/1.7.0（2026-08-20） | HIGH | PROVEN | unstable cargo features；自带 http/ws transport crate；Zed 用其做外部 agent 集成 |
| 26d | SDK 版本与 wire 版本独立 | SUPPORTED（显式文档化） | SCH README（"Consumers should not infer wire compatibility from the crate or schema release version alone"） | v1.7.0 面 | HIGH | PROVEN | 三轨：SDK 包版本 / schema artifact 版本（schema-v1.21.0、v2.0.0-alpha.3）/ wire 版本（initialize 协商） |
| 27 | Registry（agentclientprotocol/registry；CDN latest/registry.json；curated+CI 验 authMethods；manifest=agent.json+icon；npx/uvx 版本 pin，binary sha256 可选；每小时 cron 自动升版；43 条目） | SUPPORTED | registry repo（FORMAT.md/agent.schema.json/CONTRIBUTING.md/README）+ DOC get-started/registry | 2026-09-02 观察 | HIGH | PROVEN | 列出≠官方原生支持（多为 wrapper/adapter） |

## 规范空白与风险（对"Agent-Box 能否用 ACP 做唯一 session 协议"的直接输入）

### R1. durable replay 缺失 — 风险：HIGH
- 事实：v1 无 replay cursor/ack/断点续传；`session/load` 是"从头全量重放"且由 agent 自由实现（无事件边界、无校验和、无部分重放）；`session/resume` 明确不 replay。reconnect 无协议级握手（stdio 子进程死了就死了）。Streamable HTTP RFD 原文承认 v1 "durability and reliability are the implementer's responsibility"。
- 影响：Agent-Box 若要求"断线后精确恢复 UI 状态"，要么依赖各 agent 的 load 实现（质量参差），要么自建事件日志层。v2 的 `replayFrom` 游标是唯一在路线图上的机制，但仍是 alpha draft。
- 出处：NOTES §21；DOC v1/session-setup、rfds/streamable-http-websocket-transport、rfds/v2/session-resume-replay。

### R2. permission 无限等待 — 风险：HIGH（对无人值守/harness 场景）
- 事实：`session/request_permission` 是普通 JSON-RPC 请求，规范未定义任何 timeout/deadline；agent 被允许无限期等待 client 响应。规范认可的解除路径：client `session/cancel`（client MUST 回 `cancelled` outcome）、client 回 `-32800` 错误、或 client 设置自动 allow/reject（"Clients MAY automatically allow or reject permission requests according to the user settings"）。
- 影响：harness 必须自建 permission 策略层（默认自动决策 + 超时 + 取消联动），否则一个 agent 侧权限请求即可挂死整个 turn。这是 Agent-Box 侧的义务，不是协议义务。
- 出处：NOTES §9；DOC v1/tool-calls、v1/prompt-turn。

### R3. disconnect 恢复 — 风险：MEDIUM-HIGH
- 事实：协议不定义 reconnect、重试、幂等（重复 prompt 无去重语义）、或连接断开时 in-flight 请求的裁决。恢复=重启 agent 进程 + load/resume；是否有未 flush 的 update、是否有半提交工具执行，协议不过问。
- 影响：与 R1 叠加：连接管理、进程监管（respawn）、请求幂等策略全部落在 harness。
- 出处：NOTES §21-22。

### R4. resume ≠ replay — 事实确认（非风险本身，是设计取舍）
- 事实：v1 中两者并存且语义相反：load=MUST 全量 replay；resume=MUST NOT replay。resume 的 client 拿不到历史内容——历史只在 agent 手里。
- 影响：Agent-Box 若把 resume 当"恢复会话"用，UI 将没有上下文可渲染；若用 load，需要接受潜在很长的重放流量且无进度信号。必须把"选 load 还是 resume"上升为产品决策。
- 出处：NOTES §4-5；DOC v1/session-setup（两段 MUST 原文）。

### R5. SDK 版本与 wire 版本独立 — 风险：LOW（但需流程化）
- 事实：三个独立版本轨：SDK 包版本（TS 1.4.0 / Py 0.12.1 / Rust 2.0.0）、schema artifact 版本（schema-v1.21.0、v2.0.0-alpha.3；crate 1.7.0）、wire 版本（initialize 协商 1/2）。spec README 明文禁止从 artifact 版本推断 wire 兼容。SDK changelog 以 schema 版本号跟踪同步。
- 影响：兼容性矩阵必须按"wire 版本 + capability 集合"记录，不能按 SDK 版本；升级 SDK ≠ 协议变化，反之亦然。
- 出处：NOTES §0、§25。

### R6. negotiation 防 silent no-op — 评估：部分成立
- 成立部分：版本不合 → client SHOULD 断开（有明确失败行为）；能力省略=MUST 视为 UNSUPPORTED，MUST NOT 调用对应方法（把"静默忽略"定义为违规）；baseline 方法集（session/new、prompt、cancel、update）强制。
- 缺口部分：无 conformance 套件、无能力-行为一致性验证；agent 违规（忽略参数、伪造 stopReason、漏发 update）时 client 无协议级检测手段。silent no-op 防护依赖生态自觉与 registry CI（registry 只验 authMethods，不验能力真实性）。
- 出处：NOTES §1、§26；INFERENCE 标注。

### R7. 其他结构性约束（次级风险）
- v2 删除 client 侧 fs/terminal/set_mode：依赖这些面的 harness 未来必须迁到 config options / MCP server 注入路径。
- MCP 单向（client→agent）：agent 侧 MCP 只能等 unstable MCP-over-ACP 落地。
- ordering/背压无保证：`session/update` 洪峰（大 diff、长 replay）需 harness 自行缓冲与限速；terminal outputByteLimit 是唯一内置上限。
- turn 级 token 明细无标准（仅 Draft RFD）；成本核算只能用 session 级 usage_update。
- logout 后活跃会话、load 失败恢复、cancel 抵达前的 end_turn 竞争：规范均留白。

## 一句话结论（本轮）

ACP v1 是一个面窄、谈判清晰、wire 稳定的 stdio-first 协议：核心会话/流式/权限/取消闭环完整且已稳定；但 **durable replay、reconnect、permission 超时、顺序/背压保证、turn 级 usage 全部不在协议内**，这些必须由宿主（如 Agent-Box）自行补齐，或等待 v2（目前整体 draft）落地。
