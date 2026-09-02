# ASSESSMENT — Qwen Code (harness id: qwen-code)

Verified 2026-09-02. Evidence: `FACTS.md`, `evidence.md`, `../experiments/candidates-2.md`. Paths sanitized per SOURCE_POLICY.

## Identity

- Canonical name: **Qwen Code**, npm package `@qwen-code/qwen-code`, binary `qwen` (bin entry `cli-entry.js`).
- Maintainer: **QwenLM** (Alibaba Qwen team; GitHub org QwenLM, 8 npm maintainers incl. ranpox/tanzhenxin; published via GitHub Actions trusted publisher with SLSA provenance).
- Repository: https://github.com/QwenLM/qwen-code — license **Apache-2.0** (source headers "Copyright 2025 Google LLC, Copyright 2026 Qwen Team"; npm metadata does not carry a license field — license read from repo/headers).
- Origin: originally based on **Google Gemini CLI v0.8.2**; per README acknowledgments the team stopped syncing upstream from v0.1 and develops independently. NOT a live fork (lead correction).
- Latest: **0.22.3** (npm latest == clone main == `qwen --version` observed), commit 165a03596 (2026-09-02). Extremely active (9.2k commits).
- Engines: node >= 22. Also `brew install qwen-code`.

## Admission criteria (8 answers)

1. **Official stable CLI?** YES. QwenLM-org maintained, Apache-2.0, npm+brew channels, 0.x semver, rapid cadence. Version source: npm registry + repo + local `--version`. HIGH.
2. **Non-interactive launch?** YES. `qwen -p|--prompt "..."` (stdin appended); one-shot exits after reply. `-i/--prompt-interactive` hybrid. Budget flags for automation: `--max-session-turns`, `--max-wall-time`, `--max-tool-calls` (docs). HIGH.
3. **Parseable structured output?** YES, two protocols. `-o json` → ONE JSON array frame of messages (assistant/user/system/result, incl. subagent messages) ending with a `result` object (is_error/result/error/usage/stats/summary). `-o stream-json` → NDJSON of Anthropic-CLI-style messages: `assistant` (content blocks text/thinking/tool_use), `user` (tool_result), `system` (subtype), `result`, plus `control_request`/`control_response` (subtype `can_use_tool`) when `--input-format stream-json` enables bidirectional control. Also `--json-schema` for structured final output ("first structured_output call ends the session" contract). Verified in source (nonInteractive/io/*) + docs/users/features/headless.md. HIGH; VERSION_SENSITIVE (fast-moving).
4. **Explicit config/credential/session boundaries?** YES. Config: `~/.qwen/settings.json` (user; `QWEN_HOME` overrides the .qwen root), workspace `.qwen/settings.json` (ignored for untrusted folders), system scope. Credentials: `~/.qwen/oauth_creds.json` (device-code OAuth via chat.qwen.ai) + provider env keys (OPENAI_API_KEY/ANTHROPIC_API_KEY/GEMINI_API_KEY/GOOGLE_API_KEY/DASHSCOPE_API_KEY; QWEN_API_KEY also referenced in source). Sessions: project `chats/<sessionId>.runtime.json` + global tmp under the qwen dir. HIGH.
5. **Verifiable without reading credentials?** YES. Probes: `qwen --version/--help` and flag-validation error probes with fresh temp HOME; credential names from source constants only.
6. **Clear maintainer + version source?** YES (QwenLM org, npm maintainers, registry latest).
7. **Maps to generic runtime composition?** YES. spawn+argv+cwd+env+structured stdout; `-p` headless works without TTY (docs: "Scripts, CI/CD, batch processing — no UI"); observed parse-level validation errors exit 1 with no TTY. No pty requirement, not closed source. Caveat: condensed top-level `--help` hides several real options (verified via source + probe).
8. **Full coding harness vs model chat CLI?** FULL coding harness, richer than gemini-cli in agent orchestration: named subagents (`.qwen/agents/`, `~/.qwen/agents/`), fork subagents + fork-profiles, agent teams/teammates, goals, scheduled tasks, hooks, skills, MCP, LSP integration, sandbox, worktrees, channels (IM bots), `qwen serve` HTTP daemon (experimental), multi-protocol model providers.

## Tier decision: **A**

All eight criteria pass. Source (main @ 165a03596, 2026-09-02 == published 0.22.3) + official docs + isolated CLI probes agree on headless flags, both JSON protocols, approval modes, settings/credential/session boundaries, and resource surfaces. Full Adapter candidate; recommended for formal support consideration — with a strong VERSION_SENSITIVE warning: 0.x, extremely fast-moving, and several flags hidden from help.

## Key native facts (condensed; full detail in FACTS.md)

- Launch: TUI default; `-p` headless; `-o text|json|stream-json`; `--input-format stream-json` (requires stream-json output; long-lived bidirectional protocol); `--approval-mode default|auto-edit|auto|yolo|plan` (observed validation choices; `auto_edit`/`autoedit` aliases normalized in source) + hidden `-y/--yolo`; `--safe-mode` (disables context files/hooks/extensions/skills/MCP); `--bare`; `--system-prompt`/`--append-system-prompt`/`--output-style`; `--json-schema`; `--fallback-model` (max 3); `-c/--continue`, `-r/--resume`; `--acp`; sandbox `-s`.
- Subcommands: `serve` (local HTTP daemon, Stage 1 experimental `--http-bridge`), `review`, `sessions`, `channel` (Telegram/Discord/DingTalk/WeChat/Feishu), `extensions`, `hooks`, `mcp`, `update`; `auth` REMOVED (help says "(removed)").
- Output envelope difference vs gemini-cli: `json` = single messages-array frame (not {response,stats}); stream-json = Anthropic-CLI-style message objects, NOT gemini's init/message/tool_use naming.
- Auth types: `openai` (OPENAI_API_KEY + OPENAI_MODEL), `qwen-oauth` (device flow, chat.qwen.ai), `gemini`, `vertex-ai`, `anthropic`; DASHSCOPE_API_KEY for the openai-compatible Qwen provider (auth doc); settings.json can carry envKey/env blocks.
- Sessions: runtime `<projectDir>/chats/<sessionId>.runtime.json`; global runtime base under qwen dir (tmp/); `-c` continue-latest, `-r <id>` resume, `qwen sessions` subcommand.
- Settings precedence (source comment): System Defaults → User (~/.qwen/settings.json) → Workspace → System.

## Unresolved

- QWEN_API_KEY exact role (referenced in qwenOAuth2.ts/qwenContentGenerator.ts; not fully traced).
- `qwen serve` protocol detail (Stage 1 experimental; docs/users/qwen-serve.md not fully mapped).
- Full exit-code table for headless (only parse-error exit 1 observed; docs mention budget-specific exit errors).
- Arena / multi-agent-coordination internals (docs exist, not verified in depth).
- Whether `-o json` messages-array frame is version-stable (single-version verification).
