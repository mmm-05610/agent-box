# evidence — Qwen Code

All observations 2026-09-02. Probes on @qwen-code/qwen-code 0.22.3 installed into an isolated `<temp-home>` npm prefix, executed with fresh `mktemp` HOME. Source citations: shallow clone of QwenLM/qwen-code @ main 165a03596 (2026-09-02), repo-relative paths. No model/API calls, no logins, no credential contents read.

| # | Fact | Source | Kind | Version | Confidence | Stability |
|---|---|---|---|---|---|---|
| E1 | npm latest 0.22.3, bin `qwen`→cli-entry.js, node>=22, 8 maintainers, SLSA provenance, no license field in metadata | https://registry.npmjs.org/@qwen-code/qwen-code/latest | OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E2 | `qwen --version` → `0.22.3` exit 0 | CLI probe | CLI_OBSERVED | 0.22.3 | HIGH | STABLE |
| E3 | Top-level help: subcommands auth(removed)/channel/extensions/hooks/mcp/review/serve/sessions/update; flags -m/-p/-i/--safe-mode/-s/-o/-c/-r/--fallback-model | CLI probe `--help` | CLI_OBSERVED | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E4 | `--approval-mode bogus` → choices "plan, default, auto-edit, auto, yolo", exit 1 (parse precedes auth/network) | CLI probe | CLI_OBSERVED | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E5 | Approval normalization incl. auto_edit/autoedit aliases; yolo option + mutual exclusion | packages/cli/src/config/config.ts:130-158, 631-632, 762-763 | OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E6 | QWEN_DIR='.qwen' | packages/core/src/utils/paths.ts:14 | OFFICIAL_SOURCE | 0.22.3 | HIGH | STABLE |
| E7 | QWEN_HOME override; legacy settings migration; scope merge comment System Defaults→User→Workspace→System | packages/cli/src/config/settings.ts:811-827; packages/core/src/config/storage.ts:194 | OFFICIAL_SOURCE | 0.22.3 | HIGH | STABLE |
| E8 | OAUTH_FILE oauth_creds.json; device-code endpoints chat.qwen.ai | packages/core/src/config/storage.ts:16; packages/core/src/qwen/qwenOAuth2.ts:28-37 | OFFICIAL_SOURCE | 0.22.3 | HIGH | STABLE |
| E9 | AuthType enum openai/qwen-oauth/gemini/vertex-ai/anthropic; default env keys OPENAI_API_KEY/ANTHROPIC_API_KEY/GEMINI_API_KEY/GOOGLE_API_KEY + model env vars | packages/core/src/utils/auth-type.ts; packages/core/src/models/modelConfigErrors.ts:7-31 | OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E10 | DASHSCOPE_API_KEY + settings.json envKey/env auth config; `qwen auth coding-plan` removed | docs/users/configuration/auth.md:61-128, 237-274 | OFFICIAL_DOC | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E11 | QWEN_API_KEY referenced in qwenOAuth2.ts, qwenContentGenerator.ts, ArenaManager.ts | repo grep | OFFICIAL_SOURCE | 0.22.3 | MEDIUM | UNKNOWN |
| E12 | Live sessions at `<projectDir>/chats/<sessionId>.runtime.json`; global runtime base tmp/ + debug/ | packages/core/src/config/storage.ts:717-740, 229-240 | OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E13 | `-o json` = single JSON array frame of CLIMessage objects (assistant/user/system/result incl. subagent messages); result: is_error/result/error/usage/stats/summary | packages/cli/src/nonInteractive/io/JsonOutputAdapter.ts:62-79 + emitNonInteractiveFinalMessage nonInteractiveCli.ts:378-417 | OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E14 | stream-json events: assistant(content blocks text/thinking/tool_use), user(tool_result), system(subtype), control_request/control_response(can_use_tool) | packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts:267-1160 | OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E15 | `--input-format stream-json` requires stream-json output; incompatible with --json-schema ("first structured_output call ends the session") | packages/cli/src/config/config.ts:775, 821 | OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E16 | Headless teammate tool calls auto-cancelled without --yolo or stream-json control channel | packages/cli/src/nonInteractiveCli.ts:991-992 | OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E17 | Budgets --max-session-turns/--max-wall-time/--max-tool-calls; goal_state stream_event canonical; --include-partial-messages active_goal legacy | docs/users/features/headless.md:61-88 | OFFICIAL_DOC | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E18 | Subagents: .qwen/agents/ (project) > ~/.qwen/agents/ (user); extension agents/; fork subagent + fork-profiles .qwen/fork-profiles/ ≤64KiB | docs/users/features/sub-agents.md:15-190 | OFFICIAL_DOC | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E19 | QWEN.md context (project + parent chain via @ refs); memory.md global | docs/users/common-workflow.md:326-579; packages/core/src/config/storage.ts getGlobalMemoryFilePath | OFFICIAL_DOC + OFFICIAL_SOURCE | 0.22.3 | HIGH | STABLE |
| E20 | `--safe-mode` disables context files, hooks, extensions, skills, MCP servers | CLI probe `--help` + config.safe-mode.test.ts | CLI_OBSERVED + OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E21 | README identity: QwenLM, Apache-2.0, based on Gemini CLI v0.8.2, upstream sync stopped from v0.1, SubAgents/Agent Teams/Workflows, multi-protocol providers, brew install | https://github.com/QwenLM/qwen-code (WebFetch) | OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |
| E22 | Repo main == 0.22.3 == npm latest; commit 165a03596 dated 2026-09-02 (same-day activity) | clone package.json + git log | OFFICIAL_SOURCE | 0.22.3 | HIGH | VERSION_SENSITIVE |

## Negative observations

- Top-level `--help` omits -y/--approval-mode/--system-prompt/--json-schema/--input-format (hidden options) — surface must be validated against source, not help.
- No gemini-cli-style {response,stats} envelope; naming collision (`-o json`) with very different frame — adapters must not share envelopes between gemini-cli and qwen-code.
