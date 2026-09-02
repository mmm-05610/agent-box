# FACTS — Qwen Code (0.22.3)

Verified 2026-09-02. D = official docs; O = isolated CLI probes (0.22.3, fresh temp HOME); S = repo source (main @ 165a03596, 2026-09-02 == published 0.22.3). Citations in `evidence.md`.

## A. Identity & Distribution

- A1 `@qwen-code/qwen-code` bin `qwen`; QwenLM org; Apache-2.0 (repo headers; npm metadata lacks license field); node >=22; brew formula exists. (D/O/S)
- A2 Latest 0.22.3 (npm latest == clone == `--version`). Origin: based on Gemini CLI v0.8.2, upstream sync stopped from v0.1. (O/S/D)

## B. Executable Discovery

- B1 npm global bin `qwen` → `cli-entry.js`; optional platform pty deps (interactive TUI) — headless does not need them. (S)
- B2 `--version` exit 0 unauthenticated; `--approval-mode bogus` → "Choices: plan, default, auto-edit, auto, yolo" + exit 1 (validation precedes auth/network). (O)

## C. Launch Modes

- C1 Headless: `qwen -p <PROMPT>`; `-o text|json|stream-json`; `--input-format stream-json` bidirectional (requires stream-json out; incompatible with --json-schema). (S/O-help/D)
- C2 Approval modes: default|auto-edit|auto|yolo|plan (observed choices); source normalizes auto_edit/autoedit aliases (config.ts:130-158); hidden `-y/--yolo` + mutual exclusion with --approval-mode (config.ts:631-632, 762-763). (S/O)
- C3 Structured output: `--json-schema <inline|@file>`; contract "first structured_output call ends the session" (config.ts:821). (S)
- C4 Budgets: `--max-session-turns`, `--max-wall-time`, `--max-tool-calls` (headless.md). (D)
- C5 Prompt shaping: `--system-prompt`, `--append-system-prompt`, `--output-style`; `--fallback-model` max 3. (S/O-help)
- C6 Safe modes: `--safe-mode` disables context files, hooks, extensions, skills, MCP servers; `--bare`. (S/O-help)
- C7 Sessions: `-c/--continue` latest; `-r/--resume <id|empty→picker>`; `qwen sessions` subcommand. (S/O-help)
- C8 `qwen serve` local HTTP daemon (Stage 1 experimental `--http-bridge`); `qwen review run` non-interactive review; `qwen channel` IM bots; `qwen update`; `auth` REMOVED. (O-help/D)
- C9 ACP: `--acp`. (S)

## D. Profile & Configuration

- D1 Home: `<user-home>/.qwen` (QWEN_DIR='.qwen', paths.ts:14); `QWEN_HOME` env override (storage.ts:194; settings.ts:816 warning text). (S)
- D2 Settings scopes: User `~/.qwen/settings.json`, Workspace `.qwen/settings.json`, System; merge order System Defaults → User → Workspace → System (settings.ts:827); untrusted folders ignore workspace settings (docs trusted-folders.md). (S/D)
- D3 Legacy settings migration exists (legacyUserSettings path handling, settings.ts:811). (S)

## E. Credentials

- E1 OAuth: device-code flow vs https://chat.qwen.ai/api/v1/oauth2/device/code, grant urn:ietf:params:oauth:grant-type:device_code (qwenOAuth2.ts:28-37); token files under .qwen (oauth_creds.json OAUTH_FILE storage.ts:16). Contents never read. (S)
- E2 Env keys per authType (modelConfigErrors.ts:7-31): openai→OPENAI_API_KEY(+OPENAI_MODEL), anthropic→ANTHROPIC_API_KEY(+ANTHROPIC_MODEL), gemini→GEMINI_API_KEY(+GEMINI_MODEL), vertex-ai→GOOGLE_API_KEY; default fallback 'API_KEY'. (S)
- E3 DASHSCOPE_API_KEY for Qwen openai-compatible provider; auth via /auth, env vars, or settings.json envKey/env blocks; `qwen auth coding-plan` removed (auth.md:61-128). (D)
- E4 QWEN_API_KEY referenced in qwenOAuth2.ts/qwenContentGenerator.ts — role unresolved. (S)

## F. State Isolation

- F1 Live sessions: `<projectDir>/chats/<sessionId>.runtime.json` for external live-session discovery (storage.ts:717-724). (S)
- F2 Global runtime base dir + tmp/ + debug/ per session id (storage.ts:229-240). (S)
- F3 Writable overlay needs: project chats/, qwen-home tmp/debug/, token caches. Copyable: settings, QWEN.md, agents/, fork-profiles/. (S/O)

## G. Native Resource Surfaces

- G1 Instructions: QWEN.md project + parent dirs; @ refs; global memory.md; features/memory.md. (D/S)
- G2 Subagents: `.qwen/agents/` (project, highest) + `~/.qwen/agents/` (user) markdown frontmatter agents; extension agents/; fork subagent (subagent_type:"fork", fork_turns, fork_tools, fork_profile in `.qwen/fork-profiles/<name>.md` ≤64KiB frontmatter-only); background execution + completion notifications; recursive delegation prevention; DashScope prompt-cache prefix sharing. (D sub-agents.md:180-190, 15-100)
- G3 Agent teams/teammates + arena (features/arena.md, multi-agent-coordination.md). (D)
- G4 Goals: persistent goal workers; `goal_state` stream_event canonical on stream-json. (D headless.md:86-88)
- G5 Hooks (`qwen hooks`, /hooks, --safe-mode disables); Skills (auto-skills); Extensions (`qwen extensions`); MCP (`qwen mcp`, settings mcpServers, --allowed-mcp-server-names); LSP (--experimental-lsp, features/lsp.md); Channels (Telegram/Discord/DingTalk/WeChat/Feishu); Sandbox (-s/--sandbox-image); Worktrees (features/worktree.md). (O-help/D/S)
- G6 Scheduled tasks (features/scheduled-tasks.md; runtime scheduled-task-run.ts). (D/S)

## H. Events & Observation

- H1 `-o json`: entire messages array as ONE JSON frame (JSON.stringify(this.messages) + \n), including main agent + subagent messages; result message fields is_error/result/error/usage/stats/summary (JsonOutputAdapter.ts:62-79). (S)
- H2 `-o stream-json`: NDJSON Anthropic-CLI-style messages — assistant{content blocks: text/thinking/tool_use}, user{tool_result}, system{subtype}, result; control_request/control_response subtype can_use_tool (BaseJsonOutputAdapter.ts:267-1160). (S)
- H3 Headless approval gating: teammate tool calls auto-cancelled in non-stream-json mode unless --yolo (nonInteractiveCli.ts:991-992). (S)
- H4 Text mode: result printed to stdout or error message to stderr (JsonOutputAdapter.ts:70-76). (S)
- H5 Session persistence with reusable stream-json sessions (protocol interrupt keeps session alive, nonInteractiveCli.ts:439). (S)

## I. Runtime Control

- I1 Resume: -c/-r/sessions; background agent resume (background-agent-resume.ts). (S/D)
- I2 Interrupt: stream-json protocol interrupt (endActiveInteraction('cancelled'), reusable sessions). (S)
- I3 Auth switch at runtime: multi-protocol providers switchable (README). (D)

## J. Agent-Box Owner Mapping

| Fact cluster | Owner |
|---|---|
| Identity/version/origin (A) | harness-registry-declaration |
| npm discovery + probes (B) | harness-native-adapter |
| Headless/budget/json-schema/safe-mode argv (C1-C7) | harness-native-adapter |
| serve daemon + channel bots + ACP (C8/C9) | runtime-host-protocol — AUTHORITY_CONFLICT with host-control (daemon lifecycle) |
| Settings scopes/QWEN_HOME/trust (D) | profile-store — AUTHORITY_CONFLICT with harness-native-adapter (legacy settings migration) |
| Credentials E | credential-materializer |
| Sessions/chats/runtime dirs (F) | profile-store — AUTHORITY_CONFLICT with observation-envelope-candidate |
| QWEN.md/agents/fork-profiles/hooks/skills/MCP/LSP/channels (G) | resource-projector |
| json/stream-json/control_request envelope (H) | observation-envelope-candidate |
| Text stdout/stderr split (H4) | terminal-session-protocol |
| Sandbox/worktree (G5) | sandbox-protocol |
| Resume/interrupt/background agents (I) | host-control — AUTHORITY_CONFLICT with runtime-host-protocol |
| npm/brew install layout | not-agent-box (environment concern) |

## UNRESOLVED

- QWEN_API_KEY role; serve protocol; full exit table; arena internals; json frame stability across versions; Windows.
