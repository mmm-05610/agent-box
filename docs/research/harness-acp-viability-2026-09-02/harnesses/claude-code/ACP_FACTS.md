# Claude Code — ACP 可行性 Facts（PRIMARY 对象 dossier）

- 观察日期：2026-09-02（WSL2 x64 Linux）。
- 来源政策：`<workspace>/docs/research/harness-acp-viability-2026-09-02/SOURCE_POLICY.md`（六类事实分离、UNKNOWN 语义、脱敏全程遵守；本轮零模型请求、零 credential 读取、零 Git 写、零全局安装）。
- 证据编号 `E#` 解析于同目录 `EVIDENCE.md`。状态词：SUPPORTED / PARTIAL / NOT_SUPPORTED / UNKNOWN / VERSION_SENSITIVE（协议覆盖）与 PROVEN / PARTIAL / UNKNOWN / CONTRADICTED（事实）。
- 上一轮 native 基线：`<workspace>/docs/research/harness-native-knowledge-2026-09-01/harnesses/claude-code/FACTS.md`（引用不重复取证；本文引用其 C4/H/I 条目）。
- **核心更正（相对任务线索）**：任务给定的 "Zed 维护 claude-code-acp" 已发生**仓库转移**——GitHub `zed-industries/claude-code-acp` 现解析为 `agentclientprotocol/claude-agent-acp`（E-7），npm 旧包 deprecated（E-4）。当前权威对象是 **`@agentclientprotocol/claude-agent-acp` 0.73.0**（2026-09-01 发布，E-5/E-6）。本 dossier 以新对象为准，旧包仅作时间线证据。

## 1. Identity

| 字段 | 值 | 依据 |
| --- | --- | --- |
| 被包装的 Harness | Claude Code 2.1.247（Anthropic；npm `@anthropic-ai/claude-code`；原生 ELF 分发，native FACTS A1-A3） | E-1 + native FACTS A1-A3 |
| ACP adapter 实现名 | `@agentclientprotocol/claude-agent-acp`（bin `claude-agent-acp`），版本 **0.73.0**，发布 2026-09-01 | E-5, E-6 |
| adapter 仓库 | `agentclientprotocol/claude-agent-acp`（GitHub；旧名 zed-industries/claude-code-acp 自动重定向）；2446 stars / 152 open issues / pushed 2026-09-01；Apache-2.0；**非 archived，高度活跃**（release 节奏 0.68→0.73 全部在 2026-08-14 之后） | E-7, E-8 |
| adapter 维护方 | package.json `author: "Zed Industries"`；仓库在**协议组织** agentclientprotocol 名下；registry manifest authors 写 "Anthropic, Zed Industries, JetBrains"（与 repo LICENSE=Apache-2.0、package.json author 矛盾，未见 Anthropic 维护证据——按"协议方组织托管、Zed Industries 实际维护"记录） | E-6, E-22 |
| adapter 运行时 | Node ≥22；deps `@agentclientprotocol/sdk 1.4.0`（=npm latest，同步最新）+ `@anthropic-ai/claude-agent-sdk 0.3.257`（npm latest 0.3.258，滞后一个 patch）+ zod ^4 | E-6, E-30 |
| 前身包 | `@zed-industries/claude-code-acp` 终版 0.16.2（2026-02-17），npm deprecation 文案指向新包；新 scope 首版 0.24.0（2026-03-26）→ 转移窗口 2026-02-17~2026-03-26 | E-4, E-5 |
| 本机残留 | `<npm-global>/lib/node_modules/@agentclientprotocol/claude-agent-acp/` 已安装（与 native FACTS A9 记录一致；A9 当时标记"非官方"应更新为"协议组织官方 adapter，仍非 Anthropic 官方"） | E-28 |

### 六类事实逐项判定（SOURCE_POLICY §2）

| # | 事实类 | 判定 | 依据与边界 |
| --- | --- | --- | --- |
| a | ACP 官方 SDK 存在 | **PROVEN** | `@agentclientprotocol/sdk` 1.4.0（npm latest）；协议规范 agentclientprotocol.com（JSON-RPC 2.0、v1、方法清单）。与任何 Harness 无关。E-29, E-30 |
| b | Claude Code 有 ACP Registry manifest | **PARTIAL（精确表述）** | Registry 有条目 id=`claude-acp`（name "Claude Agent"，v0.73.0，npx 分发）——列的是 **adapter**，不是 Claude Code CLI 本身；不存在 `claude-code` 条目。manifest authors "Anthropic, Zed Industries, JetBrains" 且 license=proprietary，与 repo 事实矛盾（REGISTRY_ENTRY 只证明"可被列出/安装"）。E-22 |
| c | 第三方 wrapper 存在 | **PROVEN** | claude-agent-acp 是包装层：Zed Industries 起源、现协议组织托管维护，非 Anthropic 官方实现。"协议发起方维护的 adapter"这一表述已**部分过时**：仓库已移交协议组织（Zed 仍是实际维护者）。E-4~E-8 |
| d | agentclientprotocol 组织名下有 claude adapter | **PROVEN** | `agentclientprotocol/claude-agent-acp`（GitHub API full_name 即此；npm scope 同名；registry 条目 repo 指向同仓）。与 Zed 名下旧仓的区分=转移已完成、旧名仅重定向。E-7, E-5 |
| e | Anthropic 官方原生支持 ACP | **NOT_SUPPORTED（三重独立证据）** | ① `claude --help` 2.1.247 全文零 ACP 字样、无 acp 子命令/flag（E-2）；② 原生二进制 `agentclientprotocol` 字符串计数=0（E-3）；③ 官方 repo markdown 搜索 0 命中 + issue #24411（2026-02-09 起 open，引用 #6686）请求原生 ACP 未实现（E-24, E-25）。结论：**截至 2026-09-02 Anthropic 未在产品内实现/内建 ACP**。 |
| f | Zed / Codeg 可安装可运行 | **PROVEN（双宿主）** | Zed：External Agents 文档将 Claude Agent 列为 Registry 可装（自带认证计费、直读 CLAUDE.md）（E-23）。Codeg：内置 `AgentType::ClaudeCode` 条目，npx 分发 `@agentclientprotocol/claude-agent-acp@0.69.0`，cmd `claude-agent-acp`，并显式注释 "neither `claude` nor `codex` speaks ACP"（E-26, E-27）。宿主能力≠协议兼容质量，但 Codeg 对 0.63→0.69 的逐版本 tarball 审计说明其在生产中跟踪该 adapter。E-26, E-27 |

## 2. Launch

- **官方启动面**（当前）：`npx @agentclientprotocol/claude-agent-acp@<ver>`（Registry manifest 形态，E-22）或全局 bin `claude-agent-acp`。`--version` 打印包版本；`--cli <args>` 为透传模式——spawn 内嵌原生 claude 二进制并继承 stdio（给宿主一个"还能用 CLI 语义"的逃生门，Zed 文档的 `/login` 即走它，E-9, E-23）。
- **不要求宿主预装 claude**：wrapper 经 `createRequire(import.meta.resolve("@anthropic-ai/claude-agent-sdk"))` 解析 SDK 平台可选依赖里的**内嵌原生 claude 二进制**（`@anthropic-ai/claude-agent-sdk-linux-x64/claude` 等；Linux 上 glibc/musl 运行时探测）；`CLAUDE_CODE_EXECUTABLE` env 可强制指向宿主 claude（E-10, E-21）。**这意味着 ACP 路径实际运行的 CLI 版本由 wrapper 的 SDK 依赖钉死，与宿主 claude（2.1.247）可能不同版本**（U-4）。
- **SDK/CLI 关系**：wrapper 不直接说 stream-json；它调用 SDK `query()`，SDK 再 spawn 内嵌 CLI 子进程（stream-json + 内部 control 协议，native FACTS C4/C6 的 SDK 形态）。wrapper 是三层中的中间层（E-35）。
- **入口卫生**：stdout 专属 ACP 协议帧，console.* 全部重定向 stderr；可选 `CLAUDE_AGENT_LOGS` 文件日志（E-9）。

## 3. Configuration and isolation

| 面 | 事实 | 状态 | 依据 |
| --- | --- | --- | --- |
| CLAUDE_CONFIG_DIR | wrapper 自身也解析它（默认 `~/.claude`）；SDK/CLI 子进程经 `env={...process.env,...}` 全量继承，因此 **CLAUDE_CONFIG_DIR / ANTHROPIC_* 等全部透传生效** | SUPPORTED | E-19, E-11 |
| settings.json 投影 | SettingsManager 用 SDK `resolveSettings` 合并 user/project/local/managed 并 fs.watch 热重载（100ms）；repo 提交源的升级性 defaultMode 被 `filterEscalatingDefaultMode` 过滤（对齐 CLI 信任策略）→ 原生 settings 体系在 ACP 路径**完整生效** | SUPPORTED | E-19, E-11 |
| skills / commands / agents / plugins / CLAUDE.md / memory | 由 CLI 子进程按原生规则从 CLAUDE_CONFIG_DIR+project 读取（native FACTS G1-G9 不变）；slash commands 经 init 的 `slash_commands` 映射为 `available_commands_update`；Codeg 证实 skill tool_call 带 `_meta.claudeCode.skill/skillPath` | SUPPORTED（native 投影仍适用） | E-13, E-27, E-23 |
| temp CLAUDE_CONFIG_DIR + temp HOME 隔离 | wrapper 只在 env 未设时读 `os.homedir()`；设了 env 即完全跟随 → **可隔离**（native FACTS F7 隔离配方沿用；machine-cache-follows-HOME 冲突在 ACP 路径同样存在） | SUPPORTED（静态审计） | E-19 + native FACTS D1/F4 |
| credential 边界 | wrapper 自身不读 credential 文件；认证由 CLI 子进程承担（OAuth 终端登录法 `--cli auth login`、gateway auth 方法、keychain/.credentials.json 在共享 config 目录内）。宿主注入的 env 物化 token 走全量 env 透传。**共享 `~/.claude` = 与原生 CLI 共用登录态，无需二次登录**（Codeg 就是这么做的，`shared_config_dir: "~/.claude"`，且不分发额外 env） | SUPPORTED（边界=共享 config 目录） | E-11, E-26, E-23 |
| wrapper 专属配置面 | `_meta.claudeCode.options`（会话级 SDK options 透传：env/mcpServers/hooks/extraArgs/additionalDirectories）；providers/set 客户端自管 LLM 路由（anthropic/bedrock/vertex）；goal extension；AIR sessionFailure/agentFileChangeReport（客户端声明才启用） | SUPPORTED（扩展面） | E-11, E-38, E-12, E-27 |

## 4. ACP coverage 表（基于 adapter 0.73.0 源码 + ACP SDK 1.4.0 + spec v1；运行时未实测，政策禁止 prompt 实测）

| ACP 能力 | 状态 | 出处 |
| --- | --- | --- |
| initialize / 协议版本 | SUPPORTED（protocolVersion=1；capabilities/authMethods 协商完整） | E-12, E-29 |
| authenticate | PARTIAL（无标准 password/token 法；terminal 型 `--cli auth login`（远/近两态）+ gateway/bedrock（仅客户端声明时）+ providers/set 路由） | E-12, E-38 |
| session/new | SUPPORTED（sessionId=randomUUID 且传入 SDK `options.sessionId` → **ACP sessionId 即原生会话 id**） | E-18, E-11 |
| session/load（resume） | SUPPORTED（SDK resume；`agentCapabilities.loadSession=true`；list/load/resume 三方法齐备） | E-18, E-12 |
| session/list | SUPPORTED（SDK `listSessions` → id/cwd/title/updatedAt） | E-18 |
| session/resume（专用法） | SUPPORTED（sessionCapabilities.resume） | E-12 |
| session/fork | SUPPORTED（SDK `forkSession`；消息级 fork 点经 `_meta.jetbrains.air.fork`；无 fork 点则整会话 fork） | E-18 |
| session/close / delete | SUPPORTED（teardown + SDK deleteSession） | E-18, E-31 |
| prompt / 多轮 | SUPPORTED（promptQueueing；队列 FIFO；steer 并行） | E-11, E-37 |
| streaming text | SUPPORTED（agent_message_chunk；includePartialMessages=true → 增量流） | E-11, E-13 |
| thinking | SUPPORTED（agent_thought_chunk；forwardSubagentText 控制子代理思考外泄） | E-13, E-11 |
| tool call | SUPPORTED（kind 映射全：read/edit/delete?-via-edit/search/execute/fetch/think/switch_mode/other） | E-14 |
| tool update / file edit diff | SUPPORTED（Edit/Write 的 PostToolUse structuredPatch → diff content；过大内容降级文案） | E-14 |
| usage / cost | SUPPORTED（usage_update{used,size,cost USD}；分模型 `_meta.quota.model_usage`；rate limit 经 `_meta._claude/rateLimit`） | E-15 |
| permission（request_permission） | SUPPORTED（canUseTool → request_permission；可编辑选项 + `_meta.permission{version,changes[]}` 效果契约；子代理权限也汇入） | E-20, E-27 |
| question（elicitation） | SUPPORTED（AskUserQuestion → elicitation/create；custom answer 契约；MCP elicitation form/url；MCP OAuth URL elicitation；refusal-fallback 同意框） | E-20, E-27 |
| plan approval | PARTIAL（TodoWrite/Task hooks → `plan` 更新；ExitPlanMode → switch_mode + current_mode_update；0.64.2 曾实验 ExitPlanMode plan_update 后回滚 → plan 批准语义依赖 permission 流，未做独立 ACP plan 方法） | E-13, E-27 |
| cancel | SUPPORTED（session/cancel → abortController.abort） | E-31 |
| steer | SUPPORTED（`steer` 方法 + `_meta.steering`；idle pending 时 defer；promptRequired idleBehavior 可选） | E-37 |
| session mode / config options | SUPPORTED（setSessionMode + setSessionConfigOption；config_option_update/current_mode_update；模式集 default/acceptEdits/plan/dontAsk/bypass(条件)/auto(带回落)） | E-17 |
| terminal（ACP 客户端终端） | **NOT_SUPPORTED**（agentCapabilities 无 terminal；Bash 在 CLI 内执行，输出经 tool_call 卡 + `_meta["terminal_output"]` 回显） | E-36 |
| filesystem（fs read/write text file） | PARTIAL（agent→client 方向：客户端声明 fs 才用（E-11 的 `this.ctx.request(methods.client.fs...)`）；agent 侧也实现 readTextFile/writeTextFile；无 ACP 级 workspace 边界声明，边界由 cwd/additionalDirectories 决定） | E-12, E-11 |
| MCP servers | SUPPORTED（客户端 mcpServers 合并传入；mcpCapabilities http/sse；mcpServerStatus/mcpAuthenticate 桥；MCP OAuth elicitation） | E-11, E-12, E-20 |
| images | SUPPORTED（promptCapabilities.image；入站 base64→SDK image block；出站 assistant 图像→ACP image content） | E-12, E-13 |
| embeddedContext（@-mention） | SUPPORTED（promptCapabilities.embeddedContext；resource_link 处理） | E-12 |
| subagents | SUPPORTED（sessionCapabilities.subagents；subagent_spawned/state_update；旧客户端回落扁平 tool_call/forwardSubagentText） | E-12, E-13 |
| async/background tasks | SUPPORTED（async_task_spawned/progress/state_update + stopAsyncTask） | E-13 |
| native errors 结构化 | PARTIAL（AIR sessionFailure 扩展（六类目，需客户端声明）；其余路径=通用错误 + "process exited unexpectedly" 文案；无原生 result.is_error/errors 等价物） | E-27, E-16 |
| 会话定位符（session locator） | SUPPORTED（ACP sessionId=原生会话 id；list/fork/load 全链路可定位；但原生 `--resume` picker 看不到 SDK 会话（#84421）——反向限制） | E-18, E-34 |

Coverage gaps / UNKNOWN：ACP terminal（不支持）；structured_output 输出体（U-2）；hook_started/hook_response 观测帧（无映射，见 §5）；`system/init` 的 tools[]/mcp_servers[]/apiKeySource/model 清单不透传（仅 slash_commands 转化为 available_commands_update）。

## 5. Fidelity：Claude stream-json（native 路径）vs ACP 路径丢了什么

native 基线 = 本仓库 adapter 的 `claude-stream-json@1` 解码契约（`plugins/agent-box-harnesses/.../adapters/claude.py` + harnesses.toml claude 段）+ native FACTS H1-H12 / C3-C10。

| native stream-json 面 | ACP 路径 | 结论 |
| --- | --- | --- |
| `result` 终局聚合（subtype/is_error/num_turns/duration_ms/duration_api_ms/stop_reason/total_cost_usd/usage/model_usage/structured_output/permission_denials/api_error_status/terminal_reason） | 只有 usage_update（used/size/cost）+ 分模型 quota meta + AIR sessionFailure（可选）；**num_turns、duration、stop_reason、terminal_reason、permission_denials、structured_output、api_error_status 全部无出口**（E-16） | **净损失**（观察/计费/排障面收窄；turn 结算语义由 ACP prompt-response 隐含） |
| `system/init`（session_id/model/cwd/tools/mcp_servers/permissionMode/apiKeySource…） | 无等价帧；model/模式经 config options 慢慢浮现；tools/mcp 清单不透传 | **净损失**（首帧自描述弱化） |
| `stream_event` 原始 Anthropic 增量（--include-partial-messages） | 重编码为 ACP chunk（agent_message_chunk/agent_thought_chunk/tool_call progress），原始事件不透传 | 等价但**不可逆**（原始事件细节丢失） |
| tool_use / tool_result 块 + `tool_use_result` 结构体 | tool_call/tool_call_update（含 diff）；`tool_use_result` 原始结构仅部分进 rawInput/_meta | 大体等价；原始结构体部分损失 |
| control_request/can_use_tool 权限往返（updatedInput/updatedPermissions） | request_permission（选项可编辑 + `_meta.permission` 效果契约 + durable effects）——语义更丰富 | **不损失**（双向映射成熟） |
| control_request/set_permission_mode / interrupt / rewind_files / mcp_reconnect / mcp_toggle / stop_task | setSessionMode/setSessionConfigOption；session/cancel；steer；stopAsyncTask；MCP 认证/状态桥接 | 大体等价；**rewind_files（文件回滚）无 ACP 映射**（UNKNOWN/疑似缺失） |
| `--resume`/`--continue`/`--fork-session`/`--session-id` | session/list+load+resume+fork（fork 还支持消息级 fork 点） | **不损失**（ACP 更强）；反向限制：SDK 会话不在原生 picker（E-34） |
| 权限模式 acceptEdits/plan/bypassPermissions/dontAsk/auto | 全部映射；bypass 受 ALLOW_BYPASS 且非 root 门槛；auto 带模型回落 | **不损失**（语义对齐含 CLI 信任过滤） |
| SDK hooks（settings hooks 仍执行）+ `--include-hook-events` 观测帧（hook_started/hook_response） | hooks 照常执行（adapter 还注入自己的 PostToolUse/PostModelSwitch/TaskCreated/TaskCompleted/Stop/PreToolUse 钩子做 diff/plan/model 同步）；但**hook 事件流不透传** | 执行不损失、**观测损失** |
| @-mention、images、todo 工具、background tasks、slash commands | embeddedContext、image、plan 更新、async_task_*、available_commands_update + 本地命令输出经 agent_message_chunk | **不损失** |
| cost/usage（total_cost_usd、model_usage、rate_limit_event） | usage_update + `_meta.quota.model_usage` + `_meta._claude/rateLimit` | **不损失**（口径变了：按 turn 推送而非 result 聚合） |
| MCP 工具结果结构（_meta/maxResultSizeChars 等） | 折叠进 tool_call content/kind=other | 部分损失（内容截断策略内部化） |
| `--bare`/`--safe-mode`/`--no-session-persistence`/`--setting-sources`/`--effort` 等打印模式 flag | wrapper 无对应开关面（setting_sources 固定 user/project/local；effort/model 走 config options；extraArgs 仅 replay-user-messages） | **净损失**（会话级强隔离 flag 无法从 ACP 传入；只能靠 env/managed settings 间接达成） |

## 6. Reliability

- **清理路径（静态证据充分）**：`connection.closed`/SIGTERM/SIGINT → `agent.dispose()` → 全会话 `abortController.abort()`；SDK 对 CLI 子进程 SIGTERM→5s→SIGKILL；index.ts 显式修复 oneshot 模式 stdin-EOF 孤儿积累（E-31, E-21）。
- **硬杀残留**：wrapper `kill -9` 时无外部 watchdog；CLI 子进程非 detached（detached 仅 Bash 会话孙进程）→ 理论上孤儿/需 init 收养，**UNKNOWN（U-1，未实测）**。与原生路径同级的残留风险类别，但多了一层进程。
- **上游故障证据**：#87577（SDK 内嵌 CLI 偶发不发 result 帧——恰好打在 wrapper 依赖的终局帧上，E-32）；#82850（AskUserQuestion 经 adapter 在 Zed 关闭面板，E-33）；#84421（SDK 会话对原生 resume 隐形，E-34）。ISSUE_DISCUSSION 级，仅作限制证据。
- **版本漂移**：wrapper 内嵌 CLI 版本随 `@anthropic-ai/claude-agent-sdk` 依赖走（0.3.257），与宿主 claude 2.1.247 独立演化；同一台机器上原生路径与 ACP 路径可能跑不同 CLI 构建（U-4；E-32 正是内嵌构建特有 bug）。
- **会话持久性**：会话状态在 CLI 子进程的磁盘 transcript（native FACTS F3）；wrapper 重启不丢会话，可 list/load 恢复（E-18）。活跃 turn 的 in-flight 状态不可跨 wrapper 重启恢复（UNKNOWN，U-6）。

## 7. Security

- **npx 动态下载供应链**：Registry/README 形态 = `npx @agentclientprotocol/claude-agent-acp@0.73.0`（pin 版本）；Codeg pin 0.69.0；但首次运行仍从 npm 拉包 + **SDK 平台可选依赖内嵌 ~百 MB 级原生 claude 二进制**。任何一次 pin 升级=引入新二进制。缓解：版本 pin + 可选 `CLAUDE_CODE_EXECUTABLE` 指向宿主已审计 CLI（E-22, E-26, E-10）。
- **credential 边界**：wrapper 不读 credential 内容；认证面完全在 CLI 子进程（OAuth/API key/keychain，native FACTS E-1~E-7 全部适用）；wrapper 把 `process.env` 全量透传给子进程 → **宿主注入的 ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN/CLAUDE_CODE_OAUTH_TOKEN 物化路径可用**，但也意味着误注入面更宽。共享 `~/.claude` 登录态 = 无二次登录、也无隔离（Codeg 即共享方案，E-26）。Zed 文档明示 "Claude Agent owns its own authentication and billing"（E-23）。
- **隔离能力**：temp HOME + temp CLAUDE_CONFIG_DIR 双重定向在 wrapper 层成立（E-19 + native FACTS F7）；`--bare`/`--safe-mode` 等强隔离 flag 无 ACP 入口（§5）。
- **权限面**：bypassPermissions 双重门槛（客户端 ALLOW_BYPASS 协商 + 非 root）；repo 提交源的升级 defaultMode 过滤（E-17）。权限决定权在宿主（request_permission），比原生 `-p` 静默模式更严。

## 8. Process topology verdict（双 spawn 判决）

```
agent-box host
  └─ node claude-agent-acp          ← ACP server（stdio JSON-RPC，三层第 1 层新增）
       └─ claude（原生 ELF，SDK 内嵌拷贝）  ← stream-json + control 协议（SDK 私有面）
            └─ /bin/bash 等工具孙进程
```

- 判决：**REQUIRES_RUNTIME_CHANGE**（对 Agent-Box 主路由而言）。理由：
  1. **协议换轨**：观察面从 stdout stream-json envelope（现有 `claude-stream-json@1` 解码器）换成 JSON-RPC stdio 帧；`result` 终局聚合帧消失（E-16），`system/init` 自描述消失 → 现有 observation decoder 不能复用。
  2. **运行时新增**：沙箱内需 Node ≥22 + wrapper 包 + SDK 平台二进制（或 npx 网络）；原生路径只需一个 claude ELF（native FACTS A3）。bwrap 内**可行**（无特权要求、无 TTY 要求、无 root），但非"既有 runtime 免改"。
  3. **进程树加深**：三层（host → wrapper → claude）+ Bash 孙进程；清理链多一跳（E-31），硬杀孤儿面 U-1。
  4. **版本分叉**：内嵌 CLI ≠ 宿主 CLI（U-4），harness-registry 声明的版本语义（`claude --version`）对 ACP 路径失真。
- 非 UNSAFE 的理由：清理路径在源码与上游生产宿主（Zed/Codeg）中充分行使；权限默认收敛；无守护进程、无长期 daemon。
- **replay/重复 spawn 风险**：wrapper 无状态化重放是安全的（会话在磁盘 transcript，session/list+load 可恢复，E-18）；但逐 turn 重启 wrapper 会失去 in-flight turn 与 config_options 缓存语义，replay 必须以 `session/load` 重挂为前提（U-6）。
- 若仅为"外部客户端兼容性"（让 Zed/Codeg 用户的既有 ACP 线程接入 Agent-Box 工件投影），拓扑不变、成本可接受——这不是主路由判决的一部分。

## 9. Admission decision

**NATIVE_PRIMARY**（SOURCE_POLICY §7 口径）。

理由：① 厂商零原生支持（E-2/E-3/E-24/E-25）；② 依赖单一第三方起源 adapter（虽由协议组织托管、活跃且覆盖近乎全面，E-8/E-12/E-13）；③ 主路由价值 = fidelity，而 ACP 路径在观察/计费/排障/强隔离 flag 面存在结构性净损失（§5）；④ 拓扑与版本分叉成本（§8）。ACP 作为 Claude Code 的**外部客户端兼容面**（Zed/Codeg 已成事实标准）与**未来监控对象**（若 Anthropic 实现 #24411 或 adapter 出 ACP_PRIMARY 级 fidelity，重评）。

OPEN_QUESTIONS：见 EVIDENCE.md U-1~U-6（wrapper 硬杀孤儿、structured_output 出口、内嵌 CLI 版本对应、bwrap 内 npx 冷启动、load 重放语义）。
