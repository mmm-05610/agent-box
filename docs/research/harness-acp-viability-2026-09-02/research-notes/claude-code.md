# research-notes — Claude Code ACP（原始笔记，2026-09-02）

只读研究轮。所有 URL 访问日期均为 2026-09-02。探针脚本/clone 全部位于 `<temp-home>/acp-research/`。

## 1. 本机探测（CLI_OBSERVED）

- `which claude` → `<npm-global>/bin/claude`；`claude --version` → `2.1.247 (Claude Code)`，exit 0。
- `claude --help`（242 行，全文留存 `<temp-home>/acp-research/claude-help-acp-check.txt`）：
  - `grep -i "acp|agent client|agentclient"` → **零命中**。
  - 子命令清单：agents, auth, auto-mode, doctor, gateway, import, install, mcp, plugin|plugins, project, setup-token, ultrareview, update|upgrade —— 无 acp。
- 原生二进制 `grep -c -a "agentclientprotocol"` → **0**（timeout 110s 内完成）。
- `<npm-global>/bin/` 同目录存在 `claude-agent-acp`、`codex-acp`（readlink → `<npm-global>/lib/node_modules/@agentclientprotocol/…/dist/index.js`）。未执行（避免 spawn），仅记录存在性。
- 相关：宿主侧 `python3` tomllib 校验 candidate-acp.toml（见 §6）。

## 2. npm metadata（未安装到全局）

- `npm view @zed-industries/claude-code-acp version time.modified dist-tags` →
  version 0.16.2；time.modified 2026-04-22T03:10:23Z；latest 0.16.2。
  `time --json`：0.16.2 发布 **2026-02-17**；首版 0.1.0 于 2025-08-28；共 73 版。
  `deprecated` → "This package has been renamed to @agentclientprotocol/claude-agent-acp. Please migrate to continue receiving updates."
- `npm view @agentclientprotocol/claude-agent-acp` → latest **0.73.0**；time.modified 2026-09-01T20:28:03Z；repository=agentclientprotocol/claude-agent-acp.git。
  `time --json`：首版 **0.24.0 发布 2026-03-26**；末版 0.73.0 发布 2026-09-01T20:27:53Z；共 67 版。
  → 转移窗口推断：2026-02-17 ~ 2026-03-26。
- `npm view @anthropic-ai/claude-agent-sdk version dist-tags time.modified` → 0.3.258；latest/next=0.3.258；modified 2026-09-01T22:32:20Z（非常活跃）。
- `npm view @agentclientprotocol/sdk version`（经 gemini-cli dossier 交叉 + adapter 依赖）→ 1.4.0 latest。
- 依赖面：adapter 0.73.0 deps = @agentclientprotocol/sdk 1.4.0, @anthropic-ai/claude-agent-sdk 0.3.257, zod ^4（0.16.x 旧包时代还依赖 @modelcontextprotocol/sdk 1.26.0 + diff + minimatch）。

## 3. 仓库审计（VENDOR_SOURCE；clone 到 `<temp-home>/acp-research/zed-claude-code-acp`，shallow 50）

- clone URL 用的旧名 zed-industries/claude-code-acp.git —— GitHub 自动重定向；`git ls-remote --get-url` 回显旧名但内容为新仓；GitHub API `repos/zed-industries/claude-code-acp` 返回 full_name=**agentclientprotocol/claude-agent-acp**（2446 stars / 379 forks / 152 open issues / pushed 2026-09-01T20:25:53Z / Apache-2.0 / archived=false / description "Use Claude Agent SDK from any ACP client"）。
- HEAD：ea7076c 2026-09-01 "chore(main): release 0.73.0 (#1067)"。CHANGELOG 节奏：0.68.0(08-14) 0.69.0(08-16) 0.70.0(08-17) 0.71.0(08-31) 0.72.0(09-01) 0.73.0(09-01)；0.71 特性：expose native subagents and async tasks、per-model token usage、message-specific forks、defer steering while user input pending、permission mode kinds。
- 源码规模：src/acp-agent.ts 9929 行（单文件巨石）、tools.ts 1576、async-tasks.ts 757、native-subagents.ts 534、elicitation.ts 418、session-mode.ts 333、settings.ts 212、fork-session.ts 80、permissions/ 6 文件；tests/ 26 文件（含 settings、elicitation、model-resolution、permission-options、session-load 等）。
- 关键代码位点（file:line 以 0.73.0 为准）：
  - `src/index.ts:12-44` `--cli` 透传（spawn claudeCliPath，SIGINT/SIGTERM/SIGHUP 转发，128+N 语义）；`--version`；console.* → stderr；`CLAUDE_AGENT_LOGS`；managed-policy env 预应用（resolveSettings({settingSources:[]})）。
  - `src/acp-agent.ts:214` `CLAUDE_CONFIG_DIR = env ?? ~/.claude`；`:1293-1338` claudeCliPath（CLAUDE_CODE_EXECUTABLE → SDK 平台可选依赖 → musl/glibc 探测）；`:1791-1965` initialize（protocolVersion 1、sessionCapabilities{additionalDirectories,close,delete,fork,list,resume,subagents}、authMethods、steering/goal meta）；`:1967-2016` new/resume/load/listSessions；`:2016-2030` listSessions ← SDK listSessions；`:2040-2140` providers 扩展；`:7100-7300` query() options 全貌；`:7285` query()；`:3489/4259/4711/5142` usage_update；`:5137` rate_limit_event；`:9159` agent_thought_chunk；`:5275` cancel；`:5622` dispose；`:6084/6089` agent 侧 readTextFile/writeTextFile。
  - `src/tools.ts:141-500` kind 映射；`:1386-1455` PostToolUse structuredPatch → diff content + 过大降级。
  - `src/session-mode.ts` 模式→config option + current_mode_update；auto→acceptEdits 回落。
  - `src/fork-session.ts` SDK forkSession + upToMessageId + `_meta.jetbrains.air.fork`。
  - `src/settings.ts` SettingsManager（resolveSettings、watcher、filterEscalatingDefaultMode）。
  - `src/elicitation.ts` AskUserQuestion 抽取；MCP OAuth elicitation `src/acp-agent.ts:1587-1690`。
  - README.md：特性清单（@-mentions/images/permission/following/edit review/TODO/nested subagent transcripts/interactive+background terminals/slash commands/client MCP servers/goal extension/session failure extension/permission extension）+ Subagent sessions 双边能力协商说明。

## 4. Claude Agent SDK 0.3.258（npm pack 到 `<temp-home>/acp-research/agent-sdk/`）

- 零 runtime deps；optionalDependencies 8 个平台包（linux/darwin/win32 × x64/arm64 ± musl）内嵌 claude 原生二进制；文件：sdk.mjs（主 bundle）、bridge、browser-sdk、manifest.json、sdk-tools.d.ts。
- sdk.mjs 审计（minified）：`pathToClaudeCodeExecutable` 多处引用（含 "not found / failed to launch" 错误文案）；子进程清理 = SIGTERM → setTimeout 5s 后 exitCode 为 null 则 SIGKILL（两处）；`detached:!0` 仅 1 处 = Bash 会话 `/bin/bash --noprofile --norc` spawn；`process.off("exit",…)` 型退出清理钩子存在。

## 5. Web 来源

- ACP Registry：https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json
  - 条目 `claude-acp`：name "Claude Agent"、version 0.73.0、npx `@agentclientprotocol/claude-agent-acp@0.73.0`、authors ["Anthropic","Zed Industries","JetBrains"]、license "proprietary"（矛盾：repo LICENSE Apache-2.0）、description "ACP wrapper for Anthropic's Claude"。无 `claude-code` 条目。registry version 1.0.0；组织仓库 github.com/agentclientprotocol/registry（CI 验证 authMethods、每小时 cron 同步）。
  - 其他条目参照系：gemini、codex-acp、opencode、pi-acp 等 40+。
- Zed 文档：https://zed.dev/docs/ai/external-agents —— Claude Agent 从 ACP Registry 安装（`zed: acp registry`）；自有认证计费；`/login` 在线程内；CLAUDE.md 直读。注：首次抓取超时一次，第二次成功。
- ACP 规范：https://agentclientprotocol.com/protocol/overview —— JSON-RPC 2.0；v1（/protocol/v1/ 路径）；方法面与 `_meta`/`_` 前缀扩展约定。
- GitHub（gh CLI）：
  - anthropics/claude-code issue 搜索 "acp"：#24411（2026-02-09, open, ACP 支持请求, 引用 #6686）；#82850（AskUserQuestion via claude-agent-acp 关闭面板）；#84421（SDK 会话对 --resume picker 隐形）；#87577（SDK bundled CLI stalls after final message, result 不发）；#45180（terminal_info pid/pgid ACP metadata 请求）。
  - repo markdown code search "acp" → total_count 0。
  - issue #24411 全文（gh issue view）：引用 #6686，请求原生实现，无官方实现迹象。

## 6. Codeg 侧（CODEG_LOCAL，`<agent-box-studio>/src-tauri/src/acp/`）

- `registry.rs:256/278`：AgentType::ClaudeCode ↔ registry id **"claude-acp"**。
- `registry.rs:305-360`：`AcpAdapterRelation` 注释原话 "Codex are the exceptions: neither `claude` nor `codex` speaks ACP, so codeg installs a separate adapter package (`claude-agent-acp` / `codex-acp`, maintained by the Agent Client Protocol org)"；claude 字段：native_cmd "claude"、shared_config_dir "~/.claude"、extra_dirs [".local/bin", ".claude/local"]。
- `registry.rs:476-600`：claude 内置条目 `AgentDistribution::Npx{version:"0.69.0", package:"@agentclientprotocol/claude-agent-acp@0.69.0", cmd:"claude-agent-acp", args:[], env:[], node_required:"22.0.0"}`；随后 ~90 行逐版本注释（0.63 subagent-transcript / 0.64 steering promptRequired + `_askUserQuestionCustomAnswer` / 0.64.1 `_meta.permission{version,changes[]}` / 0.66 goal ext / 0.67-0.68 AIR sessionFailure / 0.69 agentFileChangeReport 默认关）。
- 未发现 Codeg 为 claude adapter 设置 CLAUDE_CONFIG_DIR（依赖共享 ~/.claude）；file_system_runtime.rs 的 per-agent HOME 重定向只涉及 gemini/grok/dsh/hermes 等。

## 7. 关键推理链（INFERENCE，均已在正文标注）

- "官方性"结论不取 registry authors 字段（"Anthropic, Zed Industries, JetBrains"）为 Anthropic 官方背书——它与 package.json author、repo LICENSE、GitHub org 归属、issue #24411 四项证据矛盾；按 REGISTRY_ENTRY 矛盾共存记录。
- fidelity 损失清单基于 `num_turns|duration_ms|…` 键名在 adapter 源码零命中（E-16）——键名级 grep 对 minified dist 也成立（dist 与 src 同构发布）。
- bwrap 可行性判断 = 无 TTY/无特权/纯 stdio + node>=22 运行时需求；未在沙箱实测（U-5）。

## 8. 本轮未做（政策边界）

未运行 `claude-agent-acp`（任何形式 spawn 都可能拉起模型请求面）；未对 Registry npx 做冷启动；未读 `<npm-global>` 下已安装 adapter 的版本文件以外的内容；未读任何 credential 文件；未修改产品代码与 Git。
