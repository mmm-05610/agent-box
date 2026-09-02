# evidence — Gemini CLI

All observations 2026-09-02. Probes run on @google/gemini-cli 0.58.0 installed into an isolated `<temp-home>` npm prefix (no global install), executed with a fresh `mktemp` HOME (`<temp-home>`). Source citations refer to the shallow clone of google-gemini/gemini-cli @ main 4963a4456 (2026-09-01) in `<temp-home>`; repo-relative paths. No model/API calls, no logins, no credential contents read. Sanitization per SOURCE_POLICY.

| # | Fact | Source | Kind | Version | Confidence | Stability |
|---|---|---|---|---|---|---|
| E1 | npm latest 0.58.0, Apache-2.0, bin `gemini`→`bundle/gemini.js`, engines node>=20, maintainers google-wombot/ofrobots/mrdoob | https://registry.npmjs.org/@google/gemini-cli/latest | OFFICIAL_SOURCE | 0.58.0 | HIGH | VERSION_SENSITIVE |
| E2 | `gemini --version` → `0.58.0`, exit 0, unauthenticated, temp HOME | CLI probe | CLI_OBSERVED | 0.58.0 | HIGH | STABLE |
| E3 | Full option surface (-p/-i/-m/-o/-y/--approval-mode/--resume/--session-*/--include-directories/--policy/--acp/-s/-w/...) | CLI probe `--help` + packages/cli/src/config/config.ts:281-506 | OFFICIAL_SOURCE + CLI_OBSERVED | 0.58.0 | HIGH | VERSION_SENSITIVE |
| E4 | `--approval-mode` choices default/auto_edit/yolo/plan; `-y` mutual exclusion; `-p`+positional mutual exclusion; resume/session-id/session-file mutual exclusion | config.ts:242-273, 340-346, 333-339, 401-444 | OFFICIAL_SOURCE | main 2026-09-01 | HIGH | VERSION_SENSITIVE |
| E5 | `--output-format` choices text/json/stream-json; invalid value → yargs error, exit 1 | config.ts:467-473 + CLI probe `--output-format bogus` (exit 1) | OFFICIAL_SOURCE + CLI_OBSERVED | 0.58.0 | HIGH | VERSION_SENSITIVE |
| E6 | JsonOutput {session_id?, response?, stats?, error?, warnings?}; OutputFormat enum | packages/core/src/output/types.ts:14-37 | OFFICIAL_SOURCE | main | HIGH | VERSION_SENSITIVE |
| E7 | Stream events init/message/tool_use/tool_result/error/result; base fields type+timestamp; result.stats per-model breakdown | packages/core/src/output/types.ts:39-120 | OFFICIAL_SOURCE | main | HIGH | VERSION_SENSITIVE |
| E8 | Headless docs: -p trigger (incl. non-TTY), JSON schema {response,stats,error}, NDJSON event list, exit codes 0/1/42/53 | docs/cli/headless.md | OFFICIAL_DOC | 0.58.0 | HIGH | VERSION_SENSITIVE |
| E9 | Settings paths: user ~/.gemini/settings.json, workspace .gemini/settings.json, system /etc/gemini-cli/settings.json (+ system-defaults.json), env overrides | docs/cli/settings.md:9-16 + packages/cli/src/config/settings.ts:80-130 + packages/core/src/utils/paths.ts:13 | OFFICIAL_DOC + OFFICIAL_SOURCE | 0.58.0 | HIGH | STABLE |
| E10 | JSONC tolerated + comment-preserving writer (strip-json-comments / commentJson utils) | settings.ts imports:23,60; utils/commentJson.ts | OFFICIAL_SOURCE | main | HIGH | STABLE |
| E11 | Merge order SystemDefaults→System→User→Workspace | settings.ts:393-395; qwen-parity comment n/a | OFFICIAL_SOURCE | main | HIGH | STABLE |
| E12 | GEMINI_CLI_HOME home override; GEMINI_DIR='.gemini'; trustedFolders.json + GEMINI_CLI_TRUSTED_FOLDERS_PATH | packages/core/src/utils/paths.ts:14-31; packages/core/src/config/storage.ts:91-98 | OFFICIAL_SOURCE | main | HIGH | STABLE |
| E13 | Credential file names: oauth_creds.json (OAUTH_FILE storage.ts:20), google_accounts.json, mcp-oauth-tokens.json, a2a-oauth-tokens.json, installation_id (contents never read) | packages/core/src/config/storage.ts:20-90 | OFFICIAL_SOURCE | main | HIGH | STABLE |
| E14 | AUTH_ENV_VAR_WHITELIST GEMINI_API_KEY/GOOGLE_API_KEY/GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION | settings.ts:61-67 | OFFICIAL_SOURCE | main | HIGH | STABLE |
| E15 | Auth env resolution order GCA > GOOGLE_GENAI_USE_VERTEXAI > GATEWAY > GEMINI_API_KEY; AuthType enum | packages/core/src/core/contentGenerator.ts:63-91 | OFFICIAL_SOURCE | main | HIGH | VERSION_SENSITIVE |
| E16 | Unauthenticated startup prints "Please set an Auth method in .../settings.json or specify ... GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA"; `--list-sessions` exit 41 (single observation); NO network observed | CLI probe (temp HOME, temp project) | CLI_OBSERVED | 0.58.0 | MEDIUM | VERSION_SENSITIVE |
| E17 | Fresh temp HOME startup writes: .gemini/{projects.json(+.tmp), history/, tmp/}; no writes in probed workspace | CLI probe before/after dir diff (names only) | CLI_OBSERVED | 0.58.0 | HIGH | VERSION_SENSITIVE |
| E18 | Sessions at ~/.gemini/tmp/<project_hash>/chats/; resume by latest/index/uuid | docs/cli/session-management.md | OFFICIAL_DOC | 0.58.0 | HIGH | STABLE |
| E19 | Checkpoints at ~/.gemini/tmp/<project_hash>/checkpoints/; --checkpointing flag REMOVED; settings key + /rewind | docs/cli/checkpointing.md | OFFICIAL_DOC | 0.58.0 | HIGH | STABLE |
| E20 | Custom commands: .toml v1 files; user < project precedence; subdir namespacing | docs/cli/custom-commands.md:8-39 + ui/commands/commandsCommand.ts:32-68 | OFFICIAL_DOC + OFFICIAL_SOURCE | 0.58.0 | HIGH | STABLE |
| E21 | Skills dirs: ~/.gemini/skills (getUserSkillsDir), ~/.agents/skills (getGlobalAgentsDir), user agents ~/.gemini/agents | storage.ts:107-125 | OFFICIAL_SOURCE | main | HIGH | VERSION_SENSITIVE |
| E22 | GEMINI.md hierarchy (global/project/ancestors/subdirs) + .geminiignore + settings.context.fileName | docs/cli/gemini-md.md + docs/cli/gemini-ignore.md | OFFICIAL_DOC | 0.58.0 | HIGH | STABLE |
| E23 | Extensions user/workspace scopes, --scope enable/disable, registry URI env | docs/extensions/reference.md:47-65 + config.ts:682-689 | OFFICIAL_DOC + OFFICIAL_SOURCE | 0.58.0 | HIGH | VERSION_SENSITIVE |
| E24 | GEMINI_SYSTEM_MD system prompt override (=1 → ~/.gemini/system.md, or absolute path) | docs/cli/system-prompt.md | OFFICIAL_DOC | 0.58.0 | HIGH | STABLE |
| E25 | Slash commands /mcp (/mcp reload), /memory reload, /stats (statsCommand.ts:84) | docs/cli/cli-reference.md:38-39 + packages/cli/src/ui/commands/statsCommand.ts | OFFICIAL_DOC + OFFICIAL_SOURCE | 0.58.0 | HIGH | VERSION_SENSITIVE |
| E26 | Repo main version 0.59.0-nightly.20260825.g812f7a2bc, commit 4963a4456 dated 2026-09-01 | <temp-home> clone package.json + git log | OFFICIAL_SOURCE | main | HIGH | VERSION_SENSITIVE |
| E27 | Policy engine flags --policy/--admin-policy; --allowed-tools deprecated → geminicli.com/docs/core/policy-engine | config.ts:347-386 | OFFICIAL_SOURCE | main | HIGH | VERSION_SENSITIVE |

## Negative observations

- No `doctor` subcommand; no arg0 helper binaries; no `codex`-style daemon (a2a-server exists as a package but no top-level CLI mode observed in help).
- `--list-sessions` on an unauthenticated fresh HOME still performed local registry setup (no model traffic).
