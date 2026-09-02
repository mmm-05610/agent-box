# research-notes — hermes (ACP viability round)

日期：2026-09-02 · 研究者：agent-box 只读研究 subagent · 环境 WSL2 x64
对象：Hermes Agent v0.19.0（upstream f15a38ee, local 7df3aa34 +1 carried commit, Python 3.12.3, git 安装）
性质：原始笔记（URL + 观察日期）。结论性整理见 `../harnesses/hermes/ACP_FACTS.md`（证据 ID E-* 见 `../harnesses/hermes/EVIDENCE.md`）。
合规：无真实模型请求；未读 credential 内容；未改产品代码；未 Git 写；/tmp clone 已删除。

---

## 1. 本机 CLI 探测（<binary>，2026-09-02）

### 实验1：`hermes --help`（全文关键摘录）
```
usage: hermes [-h] [--version] [-z PROMPT] [--usage-file PATH] [-m MODEL] [--provider PROVIDER]
              [-t TOOLSETS] [--resume SESSION] ... [--yolo] [--pass-session-id]
              [--ignore-user-config] [--ignore-rules] [--safe-mode] [--tui] [--cli] [--dev]
              {chat,model,moa,fallback,secrets,migrate,gateway,proxy,lsp,setup,postinstall,whatsapp,
               whatsapp-cloud,slack,send,login,logout,auth,status,cron,webhook,portal,kanban,project,
               hooks,doctor,security,dump,debug,backup,checkpoints,import,config,console,pairing,skills,
               bundles,plugins,curator,pets,journey,learning,memory-graph,memory,tools,computer-use,mcp,
               sessions,insights,claw,version,update,uninstall,acp,profile,completion,dashboard,serve,
               desktop,gui,logs,prompt-size} ...
    acp                 Run Hermes Agent as an ACP (Agent Client Protocol) server
    serve               Start the Hermes backend server (headless; powers the desktop app...)
    mcp                 Manage MCP servers and run Hermes as an MCP server
-z PROMPT, --oneshot     One-shot mode ... approvals are auto-bypassed. Intended for scripts / pipes.
--usage-file PATH        One-shot mode only: ... JSON usage report (estimated cost, token counts,
                         model, api_calls) ... written even when the run fails
```
- 判读：顶层无 acp flag，`acp` 是子命令；无 `--print`/`--json` 输出模式（与上一轮 native FACTS 一致）。
- `hermes --version`：`Hermes Agent v0.19.0 (2026.7.20) · upstream f15a38ee · local 7df3aa34 (+1 carried commit) · Install directory: <user-home>/.local/lib/python3.12/site-packages · Install method: git · Python: 3.12.3 · OpenAI SDK: 2.24.0`

### 实验2：`hermes acp --help` / `--version` / `--check`
```
usage: hermes acp [-h] [--accept-hooks] [--version] [--check] [--setup] [--setup-browser] [--yes]
Start Hermes Agent in ACP mode for editor integration (VS Code, Zed, JetBrains)
  --version   Print Hermes ACP version and exit
  --check     Verify ACP dependencies and adapter imports, then exit
  --setup     Run interactive Hermes provider/model setup for ACP terminal auth
```
- `hermes acp --version` → `0.19.0`；`hermes acp --check` → `Hermes ACP check OK`，exit 0（未起 server，无网络请求迹象）。

## 2. site-packages 源码审计（VENDOR_SOURCE，2026-09-02）

- 目录：`<user-home>/.local/lib/python3.12/site-packages/`
- `hermes_agent-0.19.0.dist-info/RECORD`：22 条 `acp_adapter/*`；`entry_points.txt`：`hermes-acp = acp_adapter.entry:main`；METADATA：`Provides-Extra: acp` + `Requires-Dist: agent-client-protocol==0.9.0; extra == "acp"`（termux/all extra 亦依赖）。
- `acp_adapter/`（11 文件）：`__init__.py`（"ACP (Agent Communication Protocol) adapter for hermes-agent"）、`entry.py`（stderr-only logging；`.env` 加载；`acp.run_agent(agent, use_unstable_protocol=True)`；ping/health -32601 噪声过滤——注释提到 "Clients like acp-bridge already treat the -32601 response as 'agent alive'"；崩溃 exit 1）、`server.py`（88KB HermesACPAgent：initialize/authenticate/new/load/resume/fork/list/cancel/prompt/set_model/set_mode/set_config_option、usage_update、provenance meta、slash 命令、排队、编辑审批策略映射）、`session.py`（SessionManager；SessionDB(state.db) 持久化 source="acp"；压缩链防丢）、`events.py`（tool/thinking/step/message 回调→session_update；todo→AgentPlanUpdate）、`permissions.py`（allow_once/allow_always/reject→once/always/deny；超时 deny）、`edit_approval.py`（write_file/patch→EditProposal→tool_diff_content；workspace/tmp 会话级自动批准；.git/.ssh 永不自动批；GHSA-qg5c-hvr5-hjgr / GHSA-96vc-wcxf-jjff 注释）、`tools.py`（TOOL_KIND_MAP、tool_diff_content 渲染、_POLISHED_TOOLS 50+）、`auth.py`（hermes-setup TerminalAuthMethod + provider AuthMethodAgent）、`provenance.py`（_meta.hermes.sessionProvenance：压缩链/根会话/深度）。
- `acp/`（SDK）：dist `agent_client_protocol-0.9.0`，Home github.com/agentclientprotocol/python-sdk；`meta.py`："Schema ref: refs/tags/v0.11.2"、`PROTOCOL_VERSION = 1`；`stdio.py:125-139` 用 `loop.connect_write_pipe(..., sys.stdout)`。
- 关键 grep：`acp_adapter/` 内**零**调用 `fs/read_text_file|fs/write_text_file|terminal_create` 等客户端方法（客户端 fs/terminal 代理未使用）。
- `toolsets.py`（upstream 同版）：`"hermes-acp"` curated toolset = web_search/web_extract、terminal/process_manage、read/write/patch/search_file、vision、skills、browser_*、todo/memory/session_search、execute_code/delegate_task；不含 messaging/audio/clarify/cron。
- 交叉引用：`<workspace>/plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml:134-168`（hermes 段 launch argv=["hermes","-z"]，无 ACP mode）；`<workspace>/docs/research/harness-native-knowledge-2026-09-01/harnesses/hermes/FACTS.md`（native 基线；其 C.3 已把 ACP 列为 launch mode 但未深查）。

## 3. temp-HOME 隔离实验（CLI_OBSERVED，2026-09-02）

### 实验2a：HOME 耦合
- `HOME=<temp-home> hermes acp --check` → **ModuleNotFoundError: No module named 'hermes_cli'**（launcher `#!/usr/bin/python3` 依赖 HOME 推导的 user site-packages）。
- `HOME=<temp-home> PYTHONPATH=<user-home>/.local/lib/python3.12/site-packages hermes acp --check` → OK，exit 0。
- `HERMES_HOME=<temp-home>/.hermes`（HOME 不变）→ OK，exit 0；且 `<temp-home>/.hermes/` 立即出现 home 骨架：audio_cache/ pairing/ memories/ logs/{agent.log,errors.log,curator/} cron/ skills/ sessions/ hooks/ image_cache/ SOUL.md。

### 实验3：隔离 initialize 握手（无凭据实例；initialize 为协议握手，非模型请求）
```
{ printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":false,"writeTextFile":false},"terminal":false}}}\n'; sleep 30; } \
| timeout 75 env -i PATH=... HOME=<temp-home> PYTHONPATH=<user-site> HERMES_HOME=<temp-home>/.hermes <binary> acp 2>stderr.log | cat > resp.json
```
- 响应（stdout，逐字段）：
```
id: 1
protocolVersion: 1
agentInfo: {'name': 'hermes-agent', 'version': '0.19.0'}
loadSession: True
promptCaps: {'image': True}
sessionCaps: {'fork': {}, 'list': {}, 'resume': {}}
authMethods: [('hermes-setup', 'terminal', 'Configure Hermes provider')]
```
- stderr（节选）：
```
INFO acp_adapter.entry: No .env found at <temp-home>/.hermes/.env, using system env
INFO acp_adapter.entry: Starting hermes-agent ACP adapter
INFO acp_adapter.server: ACP client connected
INFO tools.lazy_deps: Lazy-installing boto3==1.42.89 for feature 'provider.bedrock'
INFO acp_adapter.server: Initialize from unknown (protocol v1)
```
- 观察点：
  1. 握手成功，字段与源码 initialize 完全一致；无凭据时 authMethods 仅 terminal setup（不承诺 provider auth）。
  2. **启动副作用**：`tools.lazy_deps` 在构建期对 provider 可选依赖打日志（boto3/bedrock）。实测未见落盘（real site-packages boto3 1.43.71 为 2026-08-14 既有；temp home 无 .local）→ 是否真实安装 UNKNOWN，按"启动可能触网"保守处理。
  3. stdout 重定向到普通文件时进程崩：`ValueError: Pipe transport is only for pipes, sockets and character devices`（acp/stdio.py:125-139）→ 宿主必须以管道承载 stdout。
- 结论：temp-HOME + PYTHONPATH 组合即可全隔离 spawn；HERMES_HOME 承担状态隔离。

## 4. Web 证据（观察日期均为 2026-09-02）

- ACP 规范站：https://agentclientprotocol.com/registry — 39 agents 卡片无 Hermes；页面注明"curated set of agents, including only the ones that support authentication"；机器可读：https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json → 39 agents，`'herm'` 过滤为空。
- agentclientprotocol org：https://api.github.com/orgs/agentclientprotocol/repos — 14 repos（python-sdk/typescript-sdk/rust-sdk/kotlin-sdk/java-sdk/codex-acp/claude-agent-acp/registry/docs/...），无 hermes。
- registry PR 线索：https://api.github.com/search/issues?q=repo:agentclientprotocol/registry+hermes → open PR #255(04-26)/#436(07-12)/#529(08-17)/#546(08-23)、closed #188(03-22)。PR #529 评论（1xxalexx1, 08-17）："Local npm-pack smoke test now passes... ACP initialize reports Hermes 0.20.3, terminal auth, 350 available models, and 3 session modes. The only remaining CI blocker is publication of @nousresearch/hermes..."；并指出 Zed 1.15 需 `session/new.configOptions` + `session/set_config_option`（修复见 NousResearch/hermes-agent#88630 与 PR #81067 "advertise model as SessionConfigOptionSelect on ACP 0.11+"）。
- npm：https://registry.npmjs.org/@nousresearch%2Fhermes-agent → HTTP 404（launcher 未发布）。
- PyPI：https://pypi.org/pypi/hermes-agent/json → 200，version 0.19.0，含 `agent-client-protocol==0.9.0; extra == "acp"`（解决上一轮 UNRESOLVED #1：PyPI 已发布）。
- NousResearch/hermes-agent：
  - PR #88578 "feat(acp): add Zed ACP Registry launcher package"（open, 2026-08-17）：thin npm launcher `@nousresearch/hermes-agent`；fallback PATH launcher 或 `uvx --from hermes-agent[acp] hermes-acp`；"registry requires package executable and package name to line up"。
  - `commits?path=acp_adapter` 近 10 条：b6bd681e(08-29 todo nested)、165d1849(08-23 fix approval scope CLI+ACP)、4daaf1e6(08-09 fix(acp) colon-bearing provider prefixes)、17405de9(08-09 feat(acp) native provider catalogs)、19952074(08-07 port from PrimeIntellect-ai/prime-agent#628 ACP cwd symlinks)。
  - issue/PR 搜索 `acp in:title` total_count=872（宽松匹配）：含 #81067、#14606（acp_adapter→hermes_agent/acp/ 迁移）、#100422（corrupt config.yaml fail-closed）、#87443（skill slash commands from ACP hosts）、#97735（ACP subprocess provider——hermes 反向把 ACP agent 当模型）、#68222（generalize ACP client to any ACP-compatible agent）。
  - shallow clone（/tmp，HEAD c5c9aa8，审计后已删除）：README/CHANGELOG（无根级 CHANGELOG）零 ACP 字样；website/docs 两专页全文摘读（398 行用户指南 + 181 行 internals，要点见 EVIDENCE E-16~E-18）；tests/acp/ 15 文件。
- Zed：https://zed.dev/docs/ai/external-agents — 不列 Hermes（Claude/Codex/Gemini CLI/OpenCode/Copilot/Cursor/Pi/Poolside）；"curated and not exhaustive"，安装走 ACP Registry。
- 第三方 wrapper（GitHub repo search）：xnzone/hermes-agent-acp-bridge(4★, Rust→OpenAI HTTP)、kwikiel/hermes-sdk(2★, Python client over ACP)、gad0n3/hermes-acp-launcher(0★)、1060392338/hermes-webui(2★)、0xNyk/hermes-buzz(20★)、agentic-control-plane/hermes-acp-plugin(2★)、jovylle/hermes-opencode-acp(2★)、raffr85/hermes-devin-acp(3★, 反向)；AionUi(32k★) 与 intellectronica/opencode-acpx 把 Hermes 列为可挂 ACP agent。均小体量；官方原生实现使其冗余。

## 5. Codeg 侧（CODEG_LOCAL，本机 studio 源码）

- `<agent-box-studio>/src-tauri/src/acp/custom_registry.rs`：`CustomAgentDef{registry_id,name,description,version,distribution_kind∈{Npx,Uvx,Binary},spec(=ACP registry distribution 对象),icon_url,skills_shared_store,skills_dir,source∈{Registry,Manual},version_probe,supports_mcp(default true)}`；`lib.rs:1307-1308` 注册 Tauri 命令 `acp_list_custom_agents/acp_save_custom_agent`。
- 判读：Codeg 可以 Manual/binary 形态注册 `hermes`（args `acp`），或 uvx `hermes-agent[acp]`；supports_mcp=true 与 hermes 接受 session/new.mcpServers 匹配。GUI 端到端实跑未执行。

## 6. 当日未决

1. lazy_deps 启动安装是否真实落盘（二次启动是否跳过）——留待可写沙箱环境复现。
2. stop_reason 除 end_turn/cancelled/refusal 外是否还有其他值。
3. 0.19.0 上 audio/resource prompt 块端到端行为（官方自述 non-text 抽取忽略）。
4. registry PR 合入时间线（4 open PR；阻塞 npm launcher 发布）。
5. Codeg GUI 实跑 Hermes custom agent。
