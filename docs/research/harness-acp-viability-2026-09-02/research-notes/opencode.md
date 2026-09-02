# research-notes — OpenCode ACP（原始笔记，2026-09-02）

原始访问记录，按时间序。URL 均为当日实际抓取/查询的地址。所有本机探测在 WSL2 x64 Linux，本地版本 opencode 1.18.21（`<npm-global>/bin/opencode`）。

## 1. 本机 CLI 探测

- `opencode --version` → `1.18.21`。
- `opencode --help` → 命令表中含 `opencode acp  start ACP (Agent Client Protocol) server`。
- `opencode acp --help` → 选项：`--port` (default 0)、`--hostname` (default 127.0.0.1)、`--mdns`、`--mdns-domain`、`--cors`、`--cwd` (default 进程 cwd)、`--print-logs`、`--log-level`、`--pure`。无 `--model`/`--agent` 等（模型/模式经 ACP configOptions 协商）。
- 包结构：`<npm-global>/lib/node_modules/opencode-ai/`：package.json (name opencode-ai, version 1.18.21, MIT, bin → ./bin/opencode.exe，platform optionalDeps opencode-linux-x64 等 + postinstall.mjs)；bin/opencode.exe = 184 MB Bun ELF。
- 二进制 strings：`session/new|load|prompt|cancel|resume|request_permission|set_mode|set_model|update`、`fs/read_text_file|write_text_file`、`terminal/create|output|wait_for_exit|kill|release` 各恰一次（SDK schema 残留 + 实现）；`agentclientprotocol`/`@zed-industries` 无明文（minified）。

## 2. 实验（temp XDG home，无 credential，无模型请求；脚本用后即删）

- 实验 1（initialize）：`opencode acp --cwd <temp-home>` + XDG_DATA/CACHE/CONFIG/STATE_HOME 重定向。stdin 发 `initialize {protocolVersion:1, clientCapabilities{fs{readTextFile,writeTextFile},terminal:false}}`。
  - ~2s 内 stdout 收到 1 帧 ndjson：`{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true,"mcpCapabilities":{"http":true,"sse":true},"promptCapabilities":{"embeddedContext":true,"image":true},"sessionCapabilities":{"close":{},"fork":{},"list":{},"resume":{}}},"authMethods":[{"description":"Run \`opencode auth login\` in the terminal","name":"Login with opencode","id":"opencode-login"}],"agentInfo":{"name":"OpenCode","version":"1.18.21"}}}`
  - stdin EOF → exit 0。stderr 空。
  - temp home 副作用：data/opencode/{opencode.db,-wal,-shm, log/opencode.log, repos/}、cache/opencode/{models.json, bin/}、state/opencode/locks/、config/opencode/{opencode.jsonc, .gitignore, package.json, node_modules/}。无 auth.json。
- 实验 2（端口/进程树）：运行中 `ss -tlnp` → LISTEN 127.0.0.1:4096（随机端口，pid=acp 进程）；`/proc/*/stat` 扫描 → 0 个子进程（内部 HTTP server 为进程内）。
- 结论：stdio ACP、单进程、干净退出、无端口协调需求、写档与 native run 一致。

## 3. 官方源码审计（/tmp 稀疏克隆；sst/opencode → 301 → anomalyco/opencode，dev @ 69c172e 2026-09-01 23:28 -0500）

- `packages/opencode/package.json:57` → `"@agentclientprotocol/sdk": "0.21.0"`（官方 ACP TS SDK；bun.lock:1170 有 integrity）。
- `src/index.ts:23` 注册 AcpCommand。
- `src/cli/cmd/acp.ts`（73 行）：`Server.listen(opts)`（内部 HTTP）→ `createOpencodeClient({baseUrl: http://host:port, headers: ServerAuth.headers()})` → `AgentSideConnection` + `ndJsonStream` 包 stdin/stdout；设 `OPENCODE_CLIENT=acp`；stdin end 退出。
- `src/acp/`（12 文件 3537 行）：
  - agent.ts：实现 initialize/authenticate/newSession/loadSession/listSessions/resumeSession/closeSession/unstable_forkSession/setSessionConfigOption/setSessionMode/unstable_setSessionModel/prompt/cancel。
  - service.ts（1105 行）：initialize 响应（protocolVersion:1、terminal-auth _meta、authMethod `opencode-login`，authenticate 为 no-op）；newSession 注册 client mcpServers（sdk.mcp.add，stable key 去重）、发 available_commands_update（commands+skills）、返回 configOptions(model/effort/mode)；loadSession 全量 replay；resume 恢复最近 20 条元数据；closeSession → abort；fork → sdk.session.fork；prompt → content 映射 + slash 命令检测（已知命令 → session.command；`compact` → session.summarize）+ runUntilIdle；stopReason 映射 end_turn/cancelled/max_tokens/refusal；ProviderAuthError → auth_required；usage_update（used=input+cache.read+cache.write，size=limit.context，cost USD）。
  - event.ts：唯一消费 session.status(idle→waiter)、permission.asked、message.part.updated、message.part.delta；delta→agent_message_chunk/agent_thought_chunk；tool part→tool_call/tool_call_update（pending/running[bash output 快照去重]/completed[rawOutput+diff+图片]/error）；SSE global.event + 1s 重连；stream 断开 reject idle waiter。**无 question/todo/plan/step/agent/subtask 映射**。
  - permission.ts：allow_once/allow_always/reject_once；edit → diff content（applyPatch oldText/newText）；批准后可调用 client `fs/write_text_file` 落盘；client 无 requestPermission → 自动 reject。**未引用 fs/read_text_file**。
  - content.ts：text/image/resource_link/resource → native text/file parts；file://、zed://?path=、data:、http(s) uri；audience synthetic/ignored 注解。
  - tool.ts：kind 映射（bash/shell→execute、webfetch→fetch、edit/apply_patch/patch/write→edit、grep/glob/context→search、read→read、task→think）；locations；shell workdir 进 rawInput；completed content（read display metadata、edit diff、image attachments）。
  - usage.ts：buildUsage（含 thoughtTokens/cachedRead/cachedWrite）；usage_update；findContextLimit=provider.models[id].limit.context。
  - error.ts：ACP 错误 → RequestError invalid_params/auth_required/method_not_found/internal_error（_meta 带 service/errorName）。
  - directory.ts：cwd 快照（providers、modes=非 subagent 非 hidden agents、defaultModeID=首个 primary agent 或 "build"、commands+skills）。
  - config-option.ts：model/effort/mode 三个 select 选项。
  - profile.ts：`OPENCODE_ACP_PROFILE=1` → stderr `[acp-profile]` 计时。
- `src/server/auth.ts`：`OPENCODE_SERVER_PASSWORD` 未设 → 内部 HTTP API **无鉴权**（默认 localhost only）；`ServerAuth.headers()` 自动带 basic auth。

## 4. Web 来源（抓取日期 2026-09-02）

- https://opencode.ai/docs/acp/ — `opencode acp` "JSON-RPC via stdio"；编辑器配方：Zed（`zed: acp registry` 或 settings agent_servers `{command:"opencode",args:["acp"]}`）、JetBrains acp.json、Avante.nvim（acp_providers，env 可传 OPENCODE_API_KEY）、CodeCompanion.nvim；"behaves identically over ACP as in the terminal"；"Some built-in slash commands like /undo and /redo are currently unsupported"。
- https://agentclientprotocol.com/ （+ /protocol/initialization）— ACP 定位（类 LSP）、本地=stdio 子进程 JSON-RPC、protocolVersion=整数 MAJOR（示例均 1）、baseline MUST：session/new、session/prompt、session/cancel、session/update、capability 缺省=UNSUPPORTED、mcpCapabilities sse 已被 MCP 规范弃用（opencode 仍报 true）。
- https://agentclientprotocol.com/llms.txt — v1 与 v2 两套协议文档（v2 migration 存在）；RFDs：session-fork、end-turn token usage、diff-delete、MCP-over-ACP、proxy-chains。
- https://agentclientprotocol.com/registry + https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json — opencode 条目：id=opencode、version=1.18.26、repository=github.com/anomalyco/opencode、authors=["Anomaly"]、license MIT、6 平台 binary distribution（cmd ./opencode、args ["acp"]、sha256；linux-x86_64 7c20c1ff…）；共 39 个 agent（Claude Agent、Gemini CLI、Codex 等同页）。
- https://agentclientprotocol.com/get-started/registry.md — registry.json CDN 端点；提交走 github.com/agentclientprotocol/registry agent.schema.json；curated、仅收录支持 auth 的 agent。
- https://zed.dev/docs/ai/external-agents — OpenCode 在 "Common External Agents" 列表；"Install OpenCode from the ACP Registry…"；"OpenCode owns its own auth, model selection, and subscription behavior"；external agents = 独立进程经 ACP 与 Zed 通信。
- GitHub API：
  - repos/anomalyco/opencode → id 975734319、org anomalyco、"The open source coding agent."、fork:false；repos/sst/opencode → 301 Moved Permanently → repositories/975734319（**repo 已从 sst 迁至 anomalyco**，2026-09-01 的 native dossier 里 sst 归属已过时）。
  - orgs/agentclientprotocol/repos → agent-client-protocol、claude-agent-acp、codex-acp、python-sdk、kotlin-sdk、java-sdk、rust-sdk、typescript-sdk、symposium-acp、registry、meetings、.github。**无 opencode adapter**。
  - search/issues acp in:title type:pr：merged：#2947（2025-10-20T21:55Z，"Add ACP support"）、#3317（2025-10-21，换非 deprecated 包）、#3336（2025-10-24，permission）；closed-unmerged 社区早期尝试 #2422（2025-09-04）；open：#44524（ACP v2 draft）、#45500、#40654、#41634、#46682。
  - registry.npmjs.org/opencode-ai：merge 后首个 stable 0.15.10（2025-10-20T22:19Z）；latest 1.18.26。
  - @agentclientprotocol/sdk latest 1.4.0；typescript-sdk tags v1.0.0…v1.4.0。
  - search/issues open（限制性证据）：#46311 per-agent model 配置经 ACP 无效；#34743 Xcode 27 ACP 忽略 opencode.json 模型 → big-pickle 默认；#41628 fresh session 忽略默认 agent variant；#26416 macOS 空闲高 CPU（非 ACP 专属）。
  - search/repositories "opencode acp"：只有 ACP **客户端**（formulahendry/vscode-acp 369★、acp-ui 453★、wechat-acp 819★、agentic.nvim 609★、RAIT-09/obsidian-agent-client 2383★、AionUi 32.5k★、ominiverdi/opencode-chat-bridge 99★）+ ranxianglei/opencode-acp（229★，实为 context pruning，非 wrapper）。**无专职第三方 opencode→ACP wrapper**（也不需要）。

## 5. 交叉引用

- 上一轮 native dossier：`<workspace>/docs/research/harness-native-knowledge-2026-09-01/harnesses/opencode/FACTS.md`（C5 已列 `opencode acp` 存在但 U8 标记 wire 协议 UNKNOWN —— 本轮已解）。复用其 D（配置/XDG）、E（auth.json/OPENCODE_AUTH_CONTENT）、F（隔离）、H/I（native 事件面）做 fidelity 对比。
- Agent-Box native adapter：`<workspace>/plugins/agent-box-harnesses/src/agent_box_harnesses/adapters/opencode.py`、`<workspace>/plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml:100-132`（launch argv `opencode run --format json`、continuation `-s`）→ native_primary 基线的依据。

## 6. 政策合规

只读：未改产品代码、未 Git 写、未发真实模型请求（仅 initialize 能力协商）、未读任何 credential 内容（auth.json 仅存在性检查）；实验在 `<temp-home>`/tmp，脚本与克隆目录用后已删（/tmp/opencode-acp-clone 稀疏克隆保留至成文，只读）。
