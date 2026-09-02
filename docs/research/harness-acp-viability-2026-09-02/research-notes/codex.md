# research-notes/codex.md — 原始笔记（观察日期 2026-09-02）

只读研究。未执行真实模型请求；未读取任何 credential 内容；adapter/codex 仅以隔离 env（temp CODEX_HOME、NO_BROWSER=1、无凭据）做 initialize/session/new 级探测。

## 1. Web / GitHub 来源

| # | URL / 来源 | 日期 | 要点 |
| --- | --- | --- | --- |
| W1 | https://agentclientprotocol.com （intro 页） | 2026-09-02 | ACP 定义；local agents = JSON-RPC over stdio 子进程；remote 支持仍是 WIP；复用 MCP JSON 表示 |
| W2 | https://github.com/zed-industries/agent-client-protocol （302 → agentclientprotocol org） | 2026-09-02 | stable protocolVersion=1；SDK 清单：`@agentclientprotocol/sdk`、`python-sdk`、`agent-client-protocol`(rust) + `agent-client-protocol-schema`、`acp-kotlin`、`java-sdk`；schema/v1+v2 release artifacts；4.1k stars |
| W3 | gh api orgs/agentclientprotocol/repos | 2026-09-02 | org 仓库：agent-client-protocol、claude-agent-acp、python-sdk、kotlin-sdk、typescript-sdk、rust-sdk、symposium-acp、meetings、java-sdk、**codex-acp**、registry、docs、acpr |
| W4 | gh api repos/agentclientprotocol/registry/contents/codex-acp/agent.json | 2026-09-02 | Registry 条目：id=codex-acp，name="Codex"，version 1.8.0，authors=["OpenAI","JetBrains s.r.o","Zed Industries"]，license Apache-2.0，distribution npx `@agentclientprotocol/codex-acp@1.8.0` |
| W5 | gh api repos/agentclientprotocol/registry/contents/.protocol-matrix/latest.md | 2026-09-02 | 生成于 2026-09-01T10:09:51Z；32 agents；initialize 成功 31；session/new auth_required 18；codex-acp 1.7.0 行：`npx / ok / agent / loadSession, session/list, session/resume` |
| W6 | https://zed.dev/docs/ai/external-agents | 2026-09-02 | Common External Agents 含 Codex；"Install Codex from the ACP Registry"；Codex 自管 auth/billing；Zed 的 OpenAI key 不自动配置 Codex |
| W7 | https://github.com/openai/codex/issues/30052 | 2026-09-02 | "Built-in ACP protocol support, similar to Gemini CLI ACP mode?"（2026-06-25，fanlv）；open；label CLI/app-server/enhancement；无维护者回应、无分支/PR |
| W8 | gh search issues --repo openai/codex acp | 2026-09-02 | 相关 issue：#32765（ACP process exited unexpectedly，JetBrains 场景）、#41293（Codex ACP fails to start under :root deny）、#29428（PhpStorm + Codex ACP integration）、#17635（IntelliJ ACP parse error）、#21200（macOS code signature，via ACP adapter）、#16398（期望 app 内显示 ACP/exec sessions）—— 全部为 **adapter 消费侧**问题，非 Codex 内建 ACP |
| W9 | gh api search/code `repo:openai/codex acp language:rust` 与 `repo:openai/codex agent-client-protocol` | 2026-09-02 | 两项 total_count=0 |
| W10 | gh search repos "codex acp" | 2026-09-02 | agentclientprotocol/codex-acp 334★（2026-09-01）；zed-industries/codex-acp 880★（2026-08-26）；cola-io/codex-acp 142★（Apache-2.0，2026-06-28）；Qweasd123tg/zed-codex-ACP-CAS 9★；cellfusion/codex-acp 5★；mmonad/codex-acp-gateway 4★；normahq/codex-acp-bridge 3★；khongtrunght/codex-acp 2★ |
| W11 | npm view @agentclientprotocol/codex-acp | 2026-09-02 | 32 versions（0.0.38→1.8.0）；dist-tags latest=1.8.0, beta=0.0.40；time.modified 2026-09-01T17:38Z；dep `@openai/codex ^0.152.0` |
| W12 | npm view @agentclientprotocol/sdk | 2026-09-02 | latest 1.4.0，time.modified 2026-08-20 |
| W13 | gh api commit authors of agentclientprotocol/codex-acp | 2026-09-02 | 近期作者：acp-release-bot、Briliantov Vadim（jetbrains.com）、Andrey Bragin（jetbrains.com）、nikita-ashihmin（jetbrains.com）；commit "fix: update codex to 0.152.0 (#455)" |

## 2. adapter 源码审计（<temp-home>/acp-org-codex-acp @ 87997e2，浅克隆）

- `package.json`：name `@agentclientprotocol/codex-acp`，version 1.8.0，Apache-2.0，type module，bin codex-acp→dist/index.js，**无 engines**。deps：@agentclientprotocol/sdk ^1.4.0、@openai/codex ^0.152.0、diff ^9、open ^11、vscode-jsonrpc ^9、zod ^4。
- `src/index.ts:47-70`：`--version`、`login` 子命令、`cli` 子命令（透传 runCodexCli）、默认 startAcpServer。
- `src/index.ts:91-108`：`startCodexConnection(codexPath)` 在连接前启动；stdin close → `connection.process.stdin.end()`，2s 后仍存活则 `process.kill()`。
- `src/index.ts:133-165`：acp.agent onRequest 方法全集（见 EVIDENCE E-7）+ 扩展方法 `authentication/status|logout`、`session/set_model`(legacy)、`_session/steering`、`_session/goal`。
- `src/CodexJsonRpcConnection.ts:15-43`：spawn codex：CODEX_PATH 有 → `spawn(codexPath,['app-server'])`（win32 shell:true）；无 → `spawn(process.execPath,[resolve('@openai/codex/bin/codex.js'),'app-server'])`；env 原样透传；codex exit → connection.dispose。
- `src/CodexCli.ts:20-31`：同 spawn 逻辑（cli 子命令）。
- `src/StdUtils.ts`：ACP 侧与 app-server 侧均 NDJSON；发给 app-server 时删除 `jsonrpc` 字段；malformed 行静默忽略。
- `src/Logger.ts`：`APP_SERVER_LOGS` → mkdir + app-server.log，记录 [IN]/[OUT]/[ERR] 全流量与 Startup JSON（含 CODEX_CONFIG / DEFAULT_AUTH_REQUEST）。
- `src/TokenCount.ts`：usage 映射（无 cache_write；无 cost）；注释确认 Codex 的 inputTokens 含 cached，故相减。
- `src/AgentMode.ts`：modes read-only/plan/auto_review/standard/full_access → approvalPolicy+sandboxPolicy。
- `src/SessionFork.ts`：fork → thread/fork(lastTurnId) → threadUnsubscribe；返回 sessionId=response.thread.id。
- `src/AcpExtensions.ts:22-23`：`session/set_model`（legacy）、`_session/steering`。
- `src/CodexEventHandler.ts`：`usageLimitExceeded → quota_exhausted`；plan delta 节流；terminalCommandIds 追踪；`fs/changed` case。
- grep：`CODEX_HOME` 全源码 0 处（仅 InitializeResponse.ts 注释）；`fs/read_text_file|write_text_file|terminal/create|terminal/wait` 0 处（ACP client fs/terminal 能力未被 agent 调用）。
- docs/：permission-extension.md、subagent-sessions.md（draft RFD PR #1992/#419，child cancel/close 不支持，orphan→failed）、goal-extension.md、agent-file-change-report.md、RELEASES.md。
- CHANGELOG：1.8.0（2026-09-01）、1.7.0（2026-08-27）、1.6.x（2026-08-19）……高频发布。

## 3. zed-industries/codex-acp 审计（<temp-home>/codex-acp @ 296069e，浅克隆）

- Rust，Cargo `codex-acp` 0.16.0，edition 2024；最后 commit 2026-07-22。
- README 顶部 IMPORTANT：**Development has moved to agentclientprotocol/codex-acp**；"pooling implementation and maintenance work across teams there"；新装用 `@agentclientprotocol/codex-acp`。
- 旧功能面：@-mentions、images、tool calls+permission、following、edit review、TODO lists、slash commands（/review、/review-branch、/review-commit、/init、/compact、/logout）、client MCP servers、auth ChatGPT/CODEX_API_KEY/OPENAI_API_KEY。
- 发行：GitHub releases 二进制 + npm（npm/ 目录）；vendor/codex-utils-pty。

## 4. Codeg 本机审计（<agent-box-studio>，只读）

- `src-tauri/src/acp/registry.rs:308-360`：AcpAdapterRelation —— "neither `claude` nor `codex` speaks ACP"；codex：native_cmd="codex"、shared_config_dir="~/.codex"、extra_dirs=[".local/bin"]、docs_url=docs.codeg.app/guide/supported-agents#acp-adapters。
- `registry.rs:770-800`：AgentType::Codex pin `@agentclientprotocol/codex-acp@1.7.0`（Npx，cmd codex-acp，args []，node_required "20.0.0"）；注释：adapter 无 engines.node → Codeg 保留 20.0.0 floor；agentFileChangeReport 自 1.4.0 未变；compaction_update/compaction_summary_chunk 仅存在于 vendored sdk 1.4.0 schema（adapter 仍用 contextCompaction synthetic tool call）；steering 无 promptRequired opt-in（tarball grep 0 hits）。
- `registry.rs:589-613`：Codexelicitation —— "bridges the WHOLE form surface"（elicitation.form）。
- `src-tauri/src/acp/codex_catalog_source.rs:1-84`：模型目录来自 **pin 包内嵌套 codex**（`require.resolve('@openai/codex/bin/codex.js',{paths:[<codex-acp dir>]})` + `codex debug models --bundled`），明确"NOT the codex on PATH"；子进程超时上限常量。
- `src-tauri/src/acp/binary_cache.rs`：npx 分发包经下载-解包-安装（install_extracted_tree / installed_binary_path），spawn 用已安装二进制（非 npx 现解析）。
- `src-tauri/src/paths.rs:129-160`：codeg 自身 acp-transcripts 目录（custom ACP agents 的原始 session/update 流录制）。

## 5. 本机 CLI / 二进制探测（codex-cli 0.152.0，CLI_OBSERVED）

- `codex --version` → `codex-cli 0.152.0`。
- `codex --help` / `codex app-server --help` / `codex exec --help`：grep -i 'acp|adapter|agent.client|protocol' → **0 命中**（app-server 有 ws auth/capability-token 等 flag，均非 ACP）。
- `<npm-global>/lib/node_modules/@openai/codex`：bin/codex.js（node shim，PLATFORM_PACKAGE_BY_TARGET → @openai/codex-linux-x64）；文本文件 acp 命中 0。
- 原生二进制 `<binary>`（vendor/x86_64-unknown-linux-musl/bin/codex）strings：'acp' 命中仅为 `magma-ctr-acpkm`、`kuznyechik-ctr-acpkm(-omac)`（GOST 密码模式）与随机字节 `=aCP`/`acP`；word-boundary `\bacp\b|agent.?client.?protocol|acp[_-]|[_-]acp` 过滤 acpkm 后 0 协议命中；codex-code-mode-host 同样 0。
- 同包还有：codex-path/rg、codex-resources/bwrap、codex-resources/zsh（与 ACP 无关）。

## 6. 隔离实验记录（<temp-home>，2026-09-02 13:5x）

环境：node v22.23.2；`npm install --prefix <temp-home>/adapter-test @agentclientprotocol/codex-acp@1.8.0`（20 packages，9s，含内嵌 @openai/codex 平台包）。

探针：`<temp-home>/synthetic-client.mjs`（NDJSON 客户端，仅 initialize + session/new；env：CODEX_HOME=<temp-home>/temp-codex-home、CODEX_PATH=<npm-global>/bin/codex、NO_BROWSER=1、cwd=<temp-home>/workdir）。首版用 Content-Length 帧失败（adapter 无响应即退出）→ 复查 StdUtils.ts 确认 **NDJSON 帧格式**后改写成功。

结果（probe-out.txt）：
1. initialize → protocolVersion 1；agentInfo name=`@agentclientprotocol/codex-acp` title=Codex version=1.8.0；agentCapabilities（E-8/E-26 全文）；authMethods=[api-key]（NO_BROWSER=1 隐藏 ChatGPT 项）。
2. pstree -p adapter：`node(adapter) ─ node(codex.js) ─ codex(app-server) ─ git ─ git ─ git-remote-http`（codex app-server 启动期即 spawn git 外呼；未发任何 prompt）。
3. session/new → `{"error":{"code":-32000,"message":"Authentication required"}}`（无模型请求）。
4. client stdin end → adapter ≤2s 结束 codex stdin + kill 兜底 → adapter exit 0；无 codex 残留（按 PPID 扫描；宿主预存的其它 codex 会话与本探针无关，首次按进程名匹配时曾污染结果，改用 PID 谱系后澄清）。
5. 隔离：temp-codex-home 出现 goals_1.sqlite(+shm/wal)、logs_2.sqlite*、memories_1.sqlite、installation_id、.tmp/；宿主 `<user-home>/.codex` 各条目 mtime 2026-05-28/05-30/08-02/08-30，均早于窗口；auth.json 未读。教训：宿主 home 快照不可用 `ls | head -20` 截断（产生伪 diff）。

## 7. 备注

- 环境观察：本机在探测期间存在多个 agent-box native 运行中的 codex 会话（bwrap 包裹，`--bind <profile>/dot-codex <user-home>/.codex`）——说明 Agent-Box native 路径已用 bwrap+profile 挂载；ACP wrapper 若接入可复用同一包裹方式。
- SOURCE_POLICY §4 合规：无真实模型请求；无登录；credential 仅 ls 文件名/mtime；实验脚本与产物全部位于 <temp-home> 与本知识目录；无 Git 写、无产品代码修改、无全局安装。
