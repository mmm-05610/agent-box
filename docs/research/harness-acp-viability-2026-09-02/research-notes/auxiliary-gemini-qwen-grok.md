# 原始研究笔记 — 辅助三家（Gemini CLI / Qwen Code / Grok Build）ACP 缩减版

观察日期：2026-09-02。环境：WSL2 x64。只读政策全程遵守：无全局安装、无登录、无 credential 内容读取、无真实模型请求、无 Git 写。clone 与 npm pack 均位于 `<temp-home>/acp-aux-2026-09-02/`。

## 探测记录（时序）

1. `which gemini qwen grok` — 本机均未安装（不可做 CLI_OBSERVED 二进制探测；grok-build 二进制本来就走 install script/cargo，非 npm）。
2. `npm view @google/gemini-cli version dist-tags` — latest 0.58.0；nightly 0.59.0-nightly.20260902.g4963a4456（与上一轮一致）。dist-tag `false: 0.42.0-nightly...` 是上游的奇特标签（照录）。
3. `npm view @qwen-code/qwen-code version` — 0.22.3。
4. `npm view grok-build` — 404（grok-build 本体不在 npm）；`npm view @vibe-kit/grok-cli version` — 0.0.34（社区 grok-cli，另一项目）。
5. Shallow clone（/tmp，本轮后可清理）：google-gemini/gemini-cli @ 4963a4456（2026-09-01）；QwenLM/qwen-code @ 7df5ac689（2026-09-02）；xai-org/grok-build @ 72a61251（SOURCE_REV a549186d）。
6. 仓库 grep：三家均有专属 ACP 代码面（gemini-cli packages/cli/src/acp/ + docs/cli/acp-mode.md；qwen-code packages/cli/src/acp-integration/ + packages/acp-bridge/；grok-build xai-acp-lib + xai-grok-shell agent）。
7. ACP Registry CDN（2026-09-02 拉取）：https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json — 39 agents；三家全部在列：gemini（0.58.0, `--acp`）、qwen-code（0.22.3, `--acp --experimental-skills`）、grok-build（1.0.17, `agent stdio` via npx @xai-official/grok@1.0.17）。Registry 注册方式：fork agentclientprotocol/registry、按 agent id 建目录、加 agent.json、PR。
8. WebFetch https://agentclientprotocol.com/get-started/registry — 与 CDN JSON 一致；协议版本仅见 v1 字样。
9. npm pack（只下载解包，未安装）：
   - @agentclientprotocol/sdk@0.16.1（gemini-cli pin）→ dist/schema/index.js:28 `PROTOCOL_VERSION = 1`。
   - @agentclientprotocol/sdk@0.14.1（qwen ^0.14.1）→ dist/schema/index.js:27 `PROTOCOL_VERSION = 1`。
   - `npm view @agentclientprotocol/sdk version` — latest 1.4.0（两家 pin/semver 均落后）。
10. GitHub API（未认证 curl）：
    - commits?path=packages/cli/src/zed-integration/zedIntegration.ts → 67 commits，oldest d3fda9dafb 2025-08-13 "Zed integration schema upgrade (#5536)"。
    - search/commits q=experimental-acp → 唯一命中 0135b03c8a 2026-03-05 "fix(acp): rename --experimental-acp to --acp & remove Zed-specific references (#21171)"。
    - search/commits q=acp asc → 47 hits，最早 2025-12-01；关键里程碑：#13856（2025-12-16 use official ACP SDK + HTTP/SSE MCP）、#18043（2026-02-01 session resume）、#18025（2026-02-03 env/auth 修复）。
    - commits?path=docs/cli/acp-mode.md → oldest 6f92642524 2026-03-27 "ACP integration documents (#22254)"。
    - releases 翻页 → 2026-03-05 首发 v0.33.0-preview.2；stable v0.33.0 2026-03-11 → `--acp` 改名进入 stable 的版本。
11. WebFetch https://docs.x.ai/build/overview — Grok Build 官方 getting started；提到可 "through the Agent Client Protocol (ACP) in other apps"；无 ACP 专页链接；https://docs.x.ai/build/acp → 404。
12. 本机 npm 走 npmmirror 镜像：`@xai-official/grok` latest 0.1.4（description "Grok CLI"，bin grok->bin/grok）→ 与 registry pin 1.0.17、上一轮 changelog 0.2.97 矛盾，版本 UNKNOWN（已记录 CONTRADICTED）。

## 关键源码引文（file:line，本轮逐条读过）

### gemini-cli @ 4963a4456
- packages/cli/package.json:33 — `"@agentclientprotocol/sdk": "0.16.1"`。
- packages/cli/src/config/config.ts:363-372 — `--acp`（"Starts the agent in ACP mode"）+ `--experimental-acp`（deprecated, use --acp）。
- packages/cli/src/config/config.ts:787-793 — isAcpMode = argv.acp || argv.experimentalAcp；ask_user 强制排除。
- packages/cli/src/acp/acpStdioTransport.ts:12-33 — runAcpClient：ndJsonStream(stdin/stdout) + AgentSideConnection，进程内。
- packages/cli/src/acp/acpRpcDispatcher.ts:84 — protocolVersion: acp.PROTOCOL_VERSION；:91-101 agentCapabilities{loadSession:true, promptCapabilities{image,audio,embeddedContext}, mcpCapabilities{http,sse}}；:104-130 authenticate（api-key in _meta、gateway baseUrl、clearCachedCredentialFile on switch）。
- packages/cli/src/acp/acpSessionManager.ts:27-31 — AuthDetails{apiKey?, baseUrl?, customHeaders?}；:53-63 newSession(cwd, mcpServers) → loadSettings(cwd)。
- packages/cli/src/acp/README.md — 模块化分工说明（Phase 1 refactor）。
- docs/cli/acp-mode.md — 官方页：`gemini --acp`；方法清单；fs 代理安全模型；MCP-over-ACP；telemetry（integration-tests/acp-telemetry.test.ts 为例）。
- docs/cli/cli-reference.md:59 — 滞后行：`--experimental-acp ... "Start in ACP (Agent Code Pilot) mode. Experimental feature."`；:60 仍列 `--experimental-zed-integration`（config.ts 已无此 flag）。
- integration-tests/acp-env-auth.test.ts:29-60 — describe.skip；spawn `node bundle/gemini.js --acp`，project .env 提供 GEMINI_API_KEY。

### qwen-code @ 7df5ac689
- packages/cli/package.json:43 — `"@agentclientprotocol/sdk": "^0.14.1"`。
- packages/cli/src/config/config.ts:633-641,935-941 — --acp + --experimental-acp（warning + 映射）。
- packages/cli/src/cli.ts:138-139 — --experimental-acp ∈ KNOWN_FAST_PATH_FLAGS；:546-554 ACP startup profiler（打点命名 geminiImportStart/End — 血统残留）。
- packages/cli/src/llm.tsx:417/437/621 — isAcpMode；:786-788 --worktree 与 --acp 互斥；:1115-1118 动态 import runAcpAgent。
- packages/cli/src/acp-integration/acpAgent.ts — :4648 initialize、:4688 protocolVersion=PROTOCOL_VERSION、:4805 authenticate、:4902 newSession、:5026 loadSession、:5499 unstable_resumeSession、:5751 unstable_listSessions、:5792 setSessionMode、:5808 unstable_setSessionModel、:5980 prompt、:6103 cancel；:2688 runAcpAgent、:2776-2781 console 重定向 stderr + ndJsonStream(stdout, stdin)；:10266-10271 restrictive sandbox → RequestError(-32003, 'restrictive_sandbox')。
- packages/cli/src/acp-integration/authMethods.ts:10-24 — buildAuthMethods 仅 USE_OPENAI（OPENAI_API_KEY env）。
- docs/developers/daemon/03-acp-bridge.md — packages/acp-bridge：每 WorkspaceRuntime 一个 HttpAcpBridge；defaultSpawnChannelFactory=subprocess `qwen --acp`；多路复用 N session（DEFAULT_MAX_SESSIONS=32）；MultiClientPermissionMediator；BridgeFileSystem readTextFile:false 捷径；KILL_HARD_DEADLINE_MS=10s。
- packages/cli/src/serve/acp-http/index.ts — ACP over express+ws（实验 Stage 1，loopback 校验，singleTokenCredentials）。

### grok-build @ 72a61251
- Cargo.toml:113 — `agent-client-protocol = { version = "0.10.4", features = ["unstable"] }`；Cargo.lock ~14 内部 crate 依赖。
- crates/codegen/xai-grok-pager/src/app/cli.rs:10/259/334-335 — Command::Agent / AgentArgs / AgentCmd::Stdio "Run the agent over stdio"。
- crates/codegen/xai-grok-pager-bin/src/main.rs:1285/1332/1504 — Stdio → Entrypoint::Embedded / ClientMode::Stdio / run_stdio_agent。
- crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs:81 — impl acp::Agent for MvpAgent：initialize(:90, ProtocolVersion::V1 @:493)、authenticate(:560)、new_session(:962)、load_session(:968)、prompt(:998)、cancel(:2166)、set_session_mode(:2229)、set_session_model(:2251)。
- crates/codegen/xai-grok-shell/src/agent/app.rs:156/441/928 + agent/server.rs:523 + leader/in_process.rs:38 — AgentSideConnection::new。
- crates/codegen/xai-grok-shell/src/agent/auth_method.rs:187-300 — XAI_API_KEY_METHOD_ID / CACHED_TOKEN_AUTH_METHOD_ID + preferred_method 管控。
- crates/codegen/xai-grok-pager/src/headless.rs:1642-1673 — acp::SessionUpdate::* 复用于 streaming-json。
- crates/codegen/xai-acp-lib/src/{lib,gateway}.rs — 自有 ACP 通道/网关原语。
- crates/codegen/xai-grok-version/src/lib.rs:9 — VERSION 由 GROK_VERSION 构建期注入（源码无字面版本）。
- crates/codegen/xai-grok-test-support/src/acp_client.rs:39 — 官方测试以 `.args(["agent","stdio"])` spawn。

## 与上一轮（harness-native-knowledge-2026-09-01）的差异/修正

- gemini-cli：上一轮 candidate.toml 已写 `--acp (experimental-acp deprecated alias)`，本轮补充了改名时间线（2026-03-05, #21171, v0.33.0 stable）与官方 SDK pin 0.16.1 / PROTOCOL_VERSION=1 / agentCapabilities 明细。上一轮任务线索"--experimental-acp 为主 flag"判定为过时。
- qwen-code：上一轮已写 `--acp (experimental-acp hidden deprecated alias)`；本轮确认 warning 显式打印、SDK ^0.14.1、auth 面窄（仅 USE_OPENAI）、daemon acp-bridge 子进程拓扑（上一轮未展开）。
- grok-build：上一轮已记 headless_server=ACP；本轮升级为源码级证明（impl acp::Agent for MvpAgent 全方法 + ProtocolVersion::V1 + `agent stdio` 入口）并解决身份问题（xAI 官方，registry 背书）。版本号反而新增矛盾（registry 1.0.17 vs changelog 0.2.97 vs npm mirror 0.1.4）。

## 政策边界备忘

- 未执行：真实模型请求；任何登录；credential 文件内容读取（仅记录文件名/路径常量）；全局安装；Git 写；向真实网络端点的 agent 会话。
- 执行的探测全部在允许清单内：npm view / npm pack 到 /tmp、/tmp shallow clone、GitHub 未认证 API、官方 docs WebFetch、仓库内只读 grep/sed。
- `<temp-home>` = /tmp/acp-aux-2026-09-02（含 sdk/、sdk2/ 两个 npm pack 解包目录与三个 clone）。
