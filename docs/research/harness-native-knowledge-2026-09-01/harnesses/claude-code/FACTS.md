# FACTS — Anthropic Claude Code (harness id: `claude-code`)

- Research date: 2026-09-02. CLI observed version: **2.1.247** (npm distribution).
- Legend: every non-trivial fact carries an evidence id `E#` resolving in `evidence.md`.
  Status column uses tri-state **supported / unsupported / unknown** (unknown is never downgraded to false).
  "documented" = official docs; "observed" = local CLI probe; "inferred" = reasoned but not directly proven.
- Sanitization: `<user-home>` = real user home; `<temp-home>` = isolated probe root; `<binary>` = claude executable path; `<workspace>` = Agent-Box repo.

---

## A. Identity & distribution

| ID | Fact | Status | Basis |
|---|---|---|---|
| A1 | Product is "Claude Code" by Anthropic; `claude --version` prints `2.1.247 (Claude Code)`. | supported (observed) | E1 |
| A2 | npm package `@anthropic-ai/claude-code@2.1.247`, `engines: node>=22` (npm requires Node ≥22 since v2.1.198). | supported (documented+observed) | E-PKG, docs-setup |
| A3 | The npm package is a **native binary distribution**: `bin/` is a ~250 MB ELF x86-64 executable (not a JS bundle); platform-specific optionalDependencies `@anthropic-ai/claude-code-{darwin-arm64,darwin-x64,linux-x64,linux-arm64,linux-x64-musl,linux-arm64-musl,win32-x64,win32-arm64}` pinned to the same version; `postinstall: node install.cjs` copies the platform binary over `bin/claude.exe`; `cli-wrapper.cjs` is a Node fallback launcher for `--ignore-scripts` installs. | supported (observed) | E-PKG, E-BIN |
| A4 | `sdk-tools.d.ts` ships in the package and declares the internal tool input schemas (Agent, Bash, TaskOutput, ExitPlanMode, FileEdit, FileRead, FileWrite, Glob, Grep, TaskStop, ListMcpResources, RefreshMcpTools, Mcp, NotebookEdit, ReadMcpResourceDir, ReadMcpResource, ReportFindings, TodoWrite, WebFetch, WebSearch, AskUserQuestion, SendFeedback, ClaudeDesign, Projects, EnterPlanMode, TaskCreate/Get/Update/List, REPL, Workflow, Cron*, ScheduleWakeup, RemoteTrigger, ShowOnboardingRolePicker, ReadNotifications, Monitor, ProposeSkills, ProposeGoal, Artifact, PushNotification, EnterWorktree, ExitWorktree). | supported (observed) | E-DTS |
| A5 | Non-npm **native install**: launcher at `~/.local/bin/claude` symlinking into `~/.local/share/claude/versions/`; managed by `claude install [stable|latest|<version>]` and `claude update|upgrade`. | supported (documented+observed: install cmd) | docs-setup, E3 |
| A6 | `claude doctor` reports: install method `npm-global (2.1.247)`, build commit `89c726188daf`, platform `linux-x64`, binary path, `Search: OK (bundled)` (ripgrep bundled in the native binary), auto-update channel `latest`. Runs without model calls. | supported (observed) | E8 |
| A7 | Official docs live at `code.claude.com/docs` (formerly `docs.anthropic.com/en/docs/claude-code`); source repo `github.com/anthropics/claude-code` (public; CHANGELOG-driven). Agent SDKs `@anthropic-ai/claude-agent-sdk` (TS) / `claude-agent-sdk` (Py) drive the same CLI binary in headless stream-json mode. | supported (documented) | docs index, SDK repos |
| A8 | `claude config` subcommand **no longer exists** in 2.1.247 (falls through to top-level help). Legacy `claude config get/set` is gone. | supported (observed) | E2/E3 note |
| A9 | A third-party ACP adapter (`claude-agent-acp`, package `@agentclientprotocol/claude-agent-acp`) may sit next to `claude` in the same npm-global bin dir. It is **not** Anthropic-official; Agent-Box discovery must not confuse it with the harness. | supported (observed; PEER_PROJECT) | E-BIN-ls |

## B. Executable discovery

| ID | Fact | Status | Basis |
|---|---|---|---|
| B1 | npm-global layout: `<npm-global>/bin/claude` → `../lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`; that file IS the native ELF (postinstall-copied). | supported (observed) | E-PKG |
| B2 | Version probe format: `claude --version` → single line `<semver> (Claude Code)`; exit 0; writes nothing to HOME/CLAUDE_CONFIG_DIR (verified: no file delta). | supported (observed) | E1, E4 |
| B3 | Platforms (per optionalDependencies + docs): darwin-arm64/x64, linux-x64/arm64 (+musl variants), win32-x64/arm64. musl/Alpine needs manual `bash curl libgcc libstdc++ ripgrep` and `USE_BUILTIN_RIPGREP=0`. | supported (documented+observed) | E-PKG, docs-setup |
| B4 | Windows: native Windows supported (PowerShell/CMD, sandboxing NOT supported); WSL2 recommended (sandboxing supported via bubblewrap); WSL1 not supported for sandbox. `CLAUDE_CODE_GIT_BASH_PATH` setting when Git Bash is not found; without Git for Windows a PowerShell tool is used (`CLAUDE_CODE_USE_POWERSHELL_TOOL`). | supported (documented) | docs-setup, docs-sandboxing |
| B5 | `claude doctor` is a safe discovery/diagnostic entry point (no model, no trust prompt; prints install method, commit, platform, path, update channel). | supported (observed) | E8, E3 |
| B6 | Requirements: 4 GB+ RAM, x64/ARM64, macOS 13+, Windows 10 1809+/Server 2019+, Ubuntu 20.04+/Debian 10+/Alpine 3.19+, network access required; supported countries only. | supported (documented) | docs-setup |
| B7 | Exit code on any startup validation failure observed = 1 (bad `--resume` id, invalid `--session-id`, unknown `--effort`, non-TTY without input, bad `--output-format`). | supported (observed) | E10 |

## C. Launch modes

| ID | Fact | Status | Basis |
|---|---|---|---|
| C0 | Top-level invocation: `claude [options] [command] [prompt]`; default = interactive TUI; `-p/--print` = non-interactive. | supported (observed) | E2 |
| C1 | **Interactive TUI**: requires a TTY. In a non-TTY with no prompt arg/stdin it errors `Input must be provided either through stdin or as a prompt argument when using --print` (exit 1). Workspace trust dialog on first use per project (state `hasTrustDialogAccepted` in `.claude.json`); trust dialog is skipped under `-p` or non-TTY stdout; settings files that fail validation are silently ignored in `-p` mode. | supported (observed+documented) | E10, E2 help text |
| C2 | **Headless text** `claude -p "prompt"`: prompt as argv arg or stdin; prints final text; trust dialog skipped. | supported (documented; NOT executed per policy) | E2 |
| C3 | **Headless JSON**: `--output-format json` = single result object; fields per SDK/CLI: `subtype`, `duration_ms`, `duration_api_ms`, `is_error`, `num_turns`, `session_id`, `stop_reason`, `total_cost_usd`, `usage`, `result`, `structured_output` (with `--json-schema`), `model_usage`, `permission_denials`, `deferred_tool_use`, `errors`, `api_error_status` (CLI ≥2.1.110), `uuid`, `terminal_reason`, `origin`. | supported (documented, SDK source) | SDK types.py L1319+, docs-headless (fetch timed out; field set from SDK source = official) |
| C4 | **Headless stream-json**: `--output-format stream-json` (SDK always launches with `--output-format stream-json --verbose`). Event lines: `system` (subtype `init` with session_id/model/cwd/tools/slash_commands/mcp_servers/permissionMode/…), `assistant` (message + content blocks), `user` (tool_result), `stream_event` (only with `--include-partial-messages`; fields uuid, session_id, event, parent_tool_use_id), `result` (terminal per turn), plus `system` subtypes `hook_started`/`hook_response` (only with `--include-hook-events`), `task_started`/`task_progress`/`task_notification`/`task_updated`, `rate_limit_event`, and `prompt_suggestion` (with `--prompt-suggestions`). | supported (documented, SDK source) | SDK types.py/message_parser.py, E2 flags |
| C5 | **stream-json input mode**: `--input-format stream-json` — user turns streamed as JSON on stdin; supports multi-turn long-lived session; `--replay-user-messages` re-emits input on stdout for ack. Client-injected assistant tool calls supported (fixed for message-id merging in 2.1.251). | supported (documented+observed flag) | E2, CHANGELOG 2.1.251 |
| C6 | **SDK mode** = headless + control protocol. SDK builds argv: `claude --output-format stream-json --verbose [--system-prompt("")|--system-prompt-file F|--append-system-prompt S] [--tools ""] [--allowedTools ...] [--max-turns N] [--max-budget-usd X] [--disallowedTools ...] [--task-budget total] [--model M] [--fallback-model F] [--betas ...] [--permission-prompt-tool NAME] [--permission-mode MODE] [--continue | --resume=<id> | --session-id=<id>] [--settings <file-or-json>] [--add-dir D ...] [--mcp-config <json-or-file>] [--include-partial-messages] [--include-hook-events] [--strict-mcp-config] [--fork-session] [--setting-sources=...]`. SDK default `setting_sources = ["user","project"]`. | supported (observed, SDK source) | subprocess_cli.py L560-700 |
| C7 | cwd semantics: any directory; trust dialog (interactive only); project state keyed by enclosing git repo root when present (observed); `--add-dir` extends tool access. | supported (observed+documented) | E7, E2 |
| C8 | Approval flags: `--permission-mode` choices in 2.1.247 = `acceptEdits, auto, bypassPermissions, manual, dontAsk, plan` (`manual` = alias of `default` per docs; hook payload reports `default`); `--dangerously-skip-permissions`; `--allow-dangerously-skip-permissions` (makes bypass *available* without defaulting); `--allowedTools`/`--disallowedTools` with `Tool(specifier)` syntax. | supported (observed+documented) | E2, docs-hooks(permission_mode values) |
| C9 | Print-only flags: `--fallback-model`, `--max-budget-usd`, `--no-session-persistence`, `--max-turns` (SDK), `--json-schema`, `--include-partial-messages`, `--include-hook-events`, `--forward-subagent-text`, `--replay-user-messages`. | supported (observed help + SDK) | E2, E6-C6 |
| C10 | Resume/attach: `--resume [id|name]` (picker when bare; cross-directory lookup by id since 2.1.223 — current project + worktrees first, then all other projects, requiring uniqueness), `--continue` (most recent session in current directory), `--fork-session` (new session id on resume), `--session-id <uuid>` (pin id at creation). `-p`/SDK sessions are excluded from the picker and `--continue` but resumable by id. | supported (documented+observed flags) | docs-sessions, E2, E10 |
| C11 | Exit semantics: 0 = success; 1 = startup/validation/usage errors (observed set in E10); hook `exit 2` = blocking (documented); `-p` end-of-turn reasons surface in result `subtype`/`terminal_reason`. | supported (observed+documented) | E10, docs-hooks |
| C12 | Network: internet required; standard proxy env respected (observed `Proxy: http://127.0.0.1:7897` in `claude auth status` output picked up from the environment). | supported (observed+documented) | E5, docs-setup |
| C13 | Extra session topologies in 2.1.247 CLI: `--bg/--background` (returns immediately; manage with `claude agents`; `claude agents --json` lists sessions machine-readably without TTY), `--cloud`, `--environment`, `--teleport`, `--from-pr`, `--remote-control`, `--worktree`, `--tmux`, `--name`. | supported (observed help) | E2, E3 |

## D. Profile & configuration

| ID | Fact | Status | Basis |
|---|---|---|---|
| D1 | `CLAUDE_CONFIG_DIR` relocates the whole config/state dir: under a temp `CLAUDE_CONFIG_DIR`, `settings.json`, `.claude.json`, `.claude.json.lock`, `backups/`, `plugins/` (installed_plugins.json, known_marketplaces.json, cache/…), `skills/` (plugin init scaffold) all appeared inside it; `.credentials.json` also relocates there per docs. Exception observed: machine-level cache stays under `$HOME/.cache/claude-cli-nodejs/...` (see F/G conflicts). | supported (observed+documented) | E5-E9, docs-authentication |
| D2 | Settings files & precedence (highest→lowest): managed (`managed-settings.json` in a system dir; Linux path `/etc/claude-code/managed-settings.json`; macOS `/Library/Application Support/ClaudeCode/`; Windows `C:\ProgramData\ClaudeCode\`) > CLI `--settings <file-or-json>` > project `.claude/settings.local.json` > project `.claude/settings.json` > user `<config>/settings.json`. Higher level overrides same key except mergeable list keys (e.g. `permissions.allow`). Managed sources do not merge with each other. | supported (documented; Linux path corroborated by memory doc's `/etc/claude-code` convention) | docs-settings, docs-memory |
| D3 | Settings keys verified written/read verbatim in probes: `model`, `env`, `permissions{allow,deny}`, `hooks`, `statusLine`; plus documented keys: `effortLevel`, `modelSettings`, `fallbackModel` (array, ≤3), `availableModels`, `enforceAvailableModels`, `outputStyle`, `apiKeyHelper`, `forceLoginMethod`, `forceLoginOrgUUID`, `extraKnownMarketplaces`, `enabledPlugins`, `autoMemoryEnabled`, `autoMemoryDirectory`, `claudeMdExcludes`, `alwaysThinkingEnabled`, `autoCompactWindow`, `ultracode`, `cleanupPeriodDays`, `enableAllProjectMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`, `disableBypassPermissionsMode`, `defaultMode`, `includeCoAuthoredBy`, `autoUpdates`, `respectsGitignore`, `requiredMinimumVersion`, `allowManagedPermissionRulesOnly`, `disableAllHooks`, `sandbox.*` (top-level namespace, see G-hooks/sandbox). | supported (documented+observed) | E9, docs-settings/skills/model-config/sandboxing |
| D4 | Settings are strict JSON — `//` comments or trailing commas are syntax errors; invalid files silently ignored in `-p`. `/status` verifies; `claude doctor` diagnoses. | supported (documented+observed help text) | docs-settings, E2 |
| D5 | `~/.claude.json` (inside `CLAUDE_CONFIG_DIR` when set) = mutable account+project state store. Observed top-level keys: `firstStartTime`, `firstStartVersion`, `machineID`, `userID`, `migrationVersion`, `mcpServers` (user scope), `projects` (per-project state incl. `mcpServers` local scope, `allowedTools`, `enabledMcpjsonServers`/`disabledMcpjsonServers`, `hasTrustDialogAccepted`, `hasClaudeMdExternalIncludesApproved`, `mcpContextUris`), `seenNotifications`, migration flags. Written by many subcommands (`claude mcp add` prints "File modified: …"); `.claude.json.lock` exists alongside; automatic backups written to `<config>/backups/.claude.json.backup.<epoch-ms>`. **Single-writer risk is real** — concurrent processes mutating this file are guarded only by the lock file; Agent-Box should treat it as copy-on-write or serialize access. | supported (observed) | E5, E6, E9 |
| D6 | `--settings <file-or-json>` and `--setting-sources user,project,local` (comma list; excluding `local` also skips `CLAUDE.local.md`; excluding `project` skips project rules per memory doc) provide per-session profile injection. | supported (observed help + documented) | E2, docs-memory |
| D7 | Model config precedence (first match wins): in-session `/model` > `--model` > `ANTHROPIC_MODEL` env > `model` settings key > `ANTHROPIC_DEFAULT_MODEL` env. Aliases: `default`, `best`, `fable`, `opus`, `sonnet`, `haiku`, `sonnet[1m]`, `opus[1m]`, `opusplan`; full ids like `claude-fable-5`. `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU,FABLE}_MODEL` pin alias targets; `ANTHROPIC_SMALL_FAST_MODEL` deprecated in favor of `ANTHROPIC_DEFAULT_HAIKU_MODEL`. Settings extras: `fallbackModel` array, `availableModels`, `effortLevel`, `modelSettings`, `advisorModel`, `ultracode`. | supported (documented) | docs-model-config |
| D8 | Effort: `--effort low|medium|high|xhigh|max` (invalid value warns and falls back, exit continues); `CLAUDE_CODE_EFFORT_LEVEL`; `/effort` saves default per model (behavior changed in 2.1.248+); `max` session-only unless via env. | supported (observed+documented) | E10, docs-model-config |
| D9 | Thinking budget: `MAX_THINKING_TOKENS` env (0 disables thinking on Anthropic API except Fable 5); `CLAUDE_CODE_MAX_OUTPUT_TOKENS`; `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING`; `alwaysThinkingEnabled` setting; thinking cannot be disabled on Fable 5. All strings present in the shipped binary. | supported (documented+observed strings) | docs-model-config, E12 |
| D10 | Env-var override layer: `env` block in settings.json injects env into the session (observed key preserved in temp settings; binary contains all lead env names: `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK/VERTEX`, `CLAUDE_CODE_SUBAGENT_MODEL`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`, …). | supported (observed+documented) | E9, E12 |

## E. Credentials

| ID | Fact | Status | Basis |
|---|---|---|---|
| E-1 | Auth methods (documented precedence, highest→lowest): (1) cloud-provider creds when `CLAUDE_CODE_USE_BEDROCK`/`CLAUDE_CODE_USE_VERTEX`/`CLAUDE_CODE_USE_FOUNDRY` set; (2) `ANTHROPIC_AUTH_TOKEN` (Bearer header); (3) `ANTHROPIC_API_KEY` (X-Api-Key; interactive prompts once to approve, `-p` uses silently); (4) `apiKeyHelper` script (settings key; re-run every 5 min, override `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`; >10s warns); (5) `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`, 1-year token printed not saved); (6) Anthropic profile/federation credentials; (7) subscription OAuth from login. | supported (documented) | docs-authentication |
| E-2 | Credential files: Linux `<config>/.credentials.json` mode 0600; macOS Keychain primary (fallback 0600 file); Windows `%USERPROFILE%\.claude\.credentials.json`. `CLAUDE_CONFIG_DIR` relocates the file **and re-keys the macOS Keychain entry**, so different config dirs read different keychain entries. | supported (documented; file name+existence observed name-only in real home) | docs-authentication, E13 |
| E-3 | Login/logout: `claude auth login|logout|status` subcommands and in-session `/login` `/logout`. `/logout` also "resets your first-launch setup state". Login/logout were NOT executed (policy). | supported (observed help + documented) | E3, docs-authentication |
| E-4 | Enterprise: managed `forceLoginMethod` (`claudeai`/`console`/`gateway`) and `forceLoginOrgUUID`; with org UUID set, keyless Console sign-in disabled and API-key env/auth-token/apiKeyHelper blocked at startup. | supported (documented) | docs-authentication |
| E-5 | `--bare` mode: auth is strictly `ANTHROPIC_API_KEY` or `apiKeyHelper` via `--settings`; OAuth and keychain are **never read**; 3P providers use their own credentials. | supported (observed help text) | E2 |
| E-6 | Isolation feasibility: a temp `CLAUDE_CONFIG_DIR` + temp `HOME` yields a fully isolated credential surface (probes show no reads of the real home; temp `.claude.json` created fresh; `auth status` reports "Not logged in"). For headless automation, env-var materialization (`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`) or `apiKeyHelper` avoids persisted credential files entirely. | supported (observed+inferred) | E5, E2 |
| E-7 | FORBIDDEN for Agent-Box tooling: reading `.credentials.json` contents, keychain, or printing tokens/cookies; real `~/.claude.json` contents (account state) must not be read — name/mtime only. | policy (this research) | — |

## F. State isolation

Classification of state under `<config>` (= `~/.claude` or `$CLAUDE_CONFIG_DIR`):

| ID | State | Class (Agent-Box) | Basis |
|---|---|---|---|
| F1 | Account state: `.credentials.json` (0600), macOS keychain entries keyed by config dir, `.claude.json` account fields (`machineID`, `userID`, firstStart…), onboarding/trust flags in `projects.*`. | **never-project** (credentials) / copy-on-write for `.claude.json` | E13, E5, docs-authentication |
| F2 | Normal mutable config: `settings.json`, (user) `settings.local.json` observed in real home, `CLAUDE.md`, `skills/`, `commands/`, `agents/`, `plugins/` (installed_plugins.json, known_marketplaces.json, cache/), `.mcp.json` (user-scope MCP at config root). | read-only-share OK for templates; copy-on-write when harness must write (e.g. `claude mcp add`, plugin install) | E13, E9 |
| F3 | Session state: `projects/<sanitized-cwd>/<uuid>.jsonl` (+ same-named `<uuid>/` dir), `sessions/`, `file-history/`, `todos` (not observed at user root in 2.1.247 — location unknown), `shell-snapshots/`, `paste-cache/`, `history.jsonl` (prompt history; suppress with `CLAUDE_CODE_SKIP_PROMPT_HISTORY`), `session-env/`. Transcripts: `<project>` = cwd with non-alphanumeric chars → `-`, truncated at 200 chars + hash; entry format internal and changes between versions (do not parse). | per-session copy-on-write; never share across concurrent sessions | E13, docs-sessions |
| F4 | Machine cache: `$HOME/.cache/claude-cli-nodejs/<sanitized-cwd>/mcp-logs-<server>/<ts>.jsonl` (MCP connection logs; follows **HOME**, not CLAUDE_CONFIG_DIR — AUTHORITY_CONFLICT with D1). Also `stats-cache.json`, `.last-cleanup`, `daemon.lock`/`daemon.status.json` (machine-global daemon). | local-overlay / never-project for daemon+lock | E6, E13 |
| F5 | Unsafe state: `.claude.json` (multi-project registry + account ids + trust grants; concurrent-writer risk via `.claude.json.lock`; plugin marketplace refresh races noted in changelog 2.1.251). | copy-on-write + single-writer discipline | E5-E9, CHANGELOG |
| F6 | Cleanup: `cleanupPeriodDays` (default 30 days) prunes old transcripts; `claude project purge [path]` deletes all state for a project (transcripts, tasks, file history, config entry); `.last-cleanup` marker observed. | supported (observed+documented) | E3, docs-sessions, E13 |
| F7 | Isolation recipes verified: (a) fresh `HOME`+`CLAUDE_CONFIG_DIR` ⇒ brand-new profile (no reads of real home); (b) `--no-session-persistence` (print mode) suppresses transcript writes; (c) `--bare` disables hooks/plugins/memory/keychain reads (sets `CLAUDE_CODE_SIMPLE=1`); (d) `--safe-mode` disables all customizations but keeps auth+policy (sets `CLAUDE_CODE_SAFE_MODE=1`). | supported (observed+documented help) | E4, E2 |

## G. Native resource surfaces

Legend per surface: status (supported/unsupported/unknown), discovery targets, format, recursion, naming, scope, precedence, env var, read-only OK?, writable needed?, nesting, collisions, version sensitivity.

### G1. Instructions (CLAUDE.md family) — supported
- Targets: managed `<managed-dir>/CLAUDE.md` (Linux `/etc/claude-code/CLAUDE.md`, macOS `/Library/Application Support/ClaudeCode/CLAUDE.md`, Windows `C:\Program Files\ClaudeCode\CLAUDE.md`); user `<config>/CLAUDE.md`; project `./CLAUDE.md` or `./.claude/CLAUDE.md`; local `./CLAUDE.local.md` (still presented as current in docs, contrary to older "deprecated" note). [E13, docs-memory]
- Recursion: current dir + every ancestor, ordered root→cwd (nearest launch dir read last); subdirectory CLAUDE.md loads lazily on first file access there. All files concatenated (no override). `@path` imports expanded at launch (relative to importer; max depth 4 hops; backtick spans skipped; external imports need one-time approval → `hasClaudeMdExternalIncludesApproved`). [docs-memory]
- Env/settings: `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `autoMemoryEnabled`, `autoMemoryDirectory`, `claudeMdExcludes`, managed inline `claudeMd` key, `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`, `CLAUDE_CODE_PROJECT_DIR_NAME` (with CLAUDE_CONFIG_DIR, ≥2.1.234). `--bare` skips CLAUDE.md auto-discovery; `--safe-mode` disables it; `--exclude-dynamic-system-prompt-sections` moves memory paths out of system prompt. [docs-memory, E2]
- Read-only OK: yes (consumed). Writable: only if auto memory enabled (writes `~/.claude/projects/<project>/memory/`).
- Auto memory: `<config>/projects/<project>/memory/MEMORY.md` (first 200 lines / 25KB loaded) + topic files; types `user|feedback|project|reference`; worktrees of one repo share one dir. [docs-memory]

### G2. Skills — supported
- Targets: personal `<config>/skills/<name>/SKILL.md`; project `.claude/skills/<name>/SKILL.md`; enterprise (managed settings dir); plugin `<plugin>/skills/<name>/SKILL.md`. Nested `.claude/skills/` below cwd load lazily. Symlinked dirs followed. [docs-skills, E9]
- Format: markdown + frontmatter; fields: `name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context: fork`, `agent`, `background`, `hooks`, `paths`, `shell`, `metadata/license/compatibility` (accepted, not acted on). [docs-skills]
- Naming: dir name = skill name (frontmatter `name` sets display/plugin last segment); plugin skills namespaced `/plugin:skill`; nested clashes qualified (`/apps/web:deploy`); folder `synced` reserved; skill beats command on same name. Description+when_to_use truncated at 1536 chars. [docs-skills]
- Env: `${CLAUDE_SKILL_DIR}`; `` !`cmd` `` dynamic context; permission rules `Skill(name)`/`Skill(name *)`; `--disable-slash-commands` disables all skills. [docs-skills, E2]
- Collision/precedence: enterprise > personal > project; any custom level beats bundled. "skills-dir" pseudo-marketplace: `<config>/skills/*` auto-loads as `<name>@skills-dir` (observed via `claude plugin init`, which scaffolds into `$CLAUDE_CONFIG_DIR/skills/<name>` despite help text saying `~/.claude/skills/`). [E9]
- Version sensitivity: high (skill frontmatter surface grew through 2.1.x; boolean parsing variants ≥2.1.218).

### G3. MCP — supported
- Scopes: local (default; `<config>/.claude.json` under `projects.<path>.mcpServers`) / project (`.mcp.json` at project root, committed; approval gate — observed "⏸ Pending approval (run `claude` to approve)") / user (top-level `mcpServers` in `<config>/.claude.json`; also user-scope `.mcp.json` observed at config root in real home). All follow CLAUDE_CONFIG_DIR. [E6, E13, docs-mcp]
- Precedence on same name (whole entry, no merge): local > project > user > plugin-provided > claude.ai connectors. [docs-mcp]
- Format: `{"mcpServers": {name: {type: stdio|sse|http, command|url, args, env, headers}}}`; `${VAR}`/`${VAR:-default}` expansion in command/args/env/url/headers; `url` without `type` = error. [E6, docs-mcp]
- CLI: `claude mcp add [-s scope] [-t transport] [-e KEY=V] [-H header] [--callback-port] [--client-id] [--client-secret|env MCP_CLIENT_SECRET]`, `add-json`, `add-from-claude-desktop`, `get`, `list` (health-checks), `login`/`logout` (MCP OAuth), `remove`, `reset-project-choices`, `serve` (Claude Code itself as MCP server; observed handshake `serverInfo {"name":"claude/tengu","version":"2.1.247"}`). [E3, E11]
- Flags: `--mcp-config <files-or-json>` (repeatable-ish: space-separated), `--strict-mcp-config`. Approval controls: `enableAllProjectMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers` (settings), per-project toggles in `.claude.json` (`enabledMcpServers`/`disabledMcpServers` via `/mcp`); no approval prompt in `-p`/SDK/cloud. [E3, docs-mcp]
- Limits: warning >10k tokens output; default cap 25k tokens; `MAX_MCP_OUTPUT_TOKENS` to raise; `_meta["anthropic/maxResultSizeChars"]` (ceiling 500,000 chars). Permission naming `mcp__<server>__<tool>`; plugin servers `mcp__plugin_<plugin>_<server>__<tool>`. [docs-mcp]

### G4. Prompts / slash commands — supported
- Targets: project `.claude/commands/*.md`; user `<config>/commands/`; plugin `commands/`; managed dir. Personal/project command name = file name without extension; subdirectory namespacing; plugin commands namespaced. Merged with skills; on name clash **skill takes precedence** (observed-docs). Frontmatter: `description`, `argument-hint`, `allowed-tools`, `model`, `context`, `agent`, `hooks`; body placeholders `$ARGUMENTS`, `$1..`, `@file`, `` !`cmd` `` dynamic context. [docs-skills (merge+precedence), docs-slash-commands NOT fetched this run → frontmatter detail = documented historically, mark MEDIUM/unknown-ish: see UNRESOLVED U4]
- Read-only OK yes. No env var. Version sensitivity medium (frontmatter fields expand frequently).

### G5. Rules — unsupported as a standalone surface
- No dedicated rules directory exists. Rule-like behavior lives in: settings `permissions` (allow/deny/ask rules with `Tool(specifier)`), `outputStyle` (custom output styles), hooks, CLAUDE.md instructions. Tri-state: unsupported (no native "rules" surface); anything labeled "rules" in Agent-Box must project onto permissions/instructions/hooks. [docs-settings, E2]

### G6. Agents (subagents) — supported
- Targets: managed > `--agents <json>` (session-only, not saved) > project `.claude/agents/*.md` > user `<config>/agents/` > plugin `agents/`. Recursive scan; identity = frontmatter `name` only (path irrelevant); nested project dirs: closest-to-cwd wins (≥2.1.178). Hot reload within seconds (brand-new `agents/` dir needs restart). [docs-sub-agents, E13]
- Format: markdown; frontmatter `name`, `description` (required), plus `tools`, `disallowedTools`, `model` (aliases | `inherit`), `permissionMode` (`default|acceptEdits|auto|dontAsk|bypassPermissions|plan`; `manual` alias of default), `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory` (`user|project|local`), `background`, `effort`, `isolation`, `color`, `initialPrompt`, `experimental`. Body = system prompt (no base CC system prompt). [docs-sub-agents]
- Runtime: Agent tool (`subagent_type`); delegation depth ≤3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`); ≤20 concurrent (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`); `claude --agent <name>` session-wide. Silently skipped on malformed frontmatter. [docs-sub-agents]

### G7. Hooks — supported
- Placement: user/project/local/managed settings `hooks` key; plugin `hooks/hooks.json`; skill frontmatter; subagent frontmatter. `disableAllHooks` setting kills all but managed. [docs-hooks, E9(temp settings preserved hooks key)]
- Events (2.x surface, far beyond the old 8): SessionStart, Setup, UserPromptSubmit, UserPromptExpansion, PreToolUse, PermissionRequest, PermissionDenied, PostToolUse, PostToolUseFailure, PostToolBatch, Notification, MessageDisplay, SubagentStart, SubagentStop, TaskCreated, TaskCompleted, Stop, StopFailure, TeammateIdle, InstructionsLoaded, ConfigChange, CwdChanged, DirectoryAdded, FileChanged, WorktreeCreate, WorktreeRemove, PreCompact, PostCompact, PreModelSwitch, PostModelSwitch, Elicitation, ElicitationResult, SessionEnd. [docs-hooks]
- Handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent`; common fields `type`, `if` (permission-rule syntax), `timeout` (default 600 command/http/mcp_tool; 30 prompt; 60 agent), `statusMessage`, `once`. [docs-hooks]
- Input (stdin JSON): `session_id`, `prompt_id`, `transcript_path`, `cwd`, `permission_mode`, `effort{level}`, `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id`, agent fields `agent_id`/`agent_type`. Path vars `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` (also exported as env). [docs-hooks]
- Output control: exit 0 (stdout parsed as JSON if it starts `{` and ends `}`); exit 2 = blocking (stderr fed to Claude per event semantics; PreToolUse blocks tool; UserPromptSubmit erases prompt; Stop prevents stopping; ConfigChange blocks changes). JSON control fields: `continue`, `stopReason`, `suppressOutput`, `decision`, `systemMessage`, `additionalContext`, `updatedInput`, `hookSpecificOutput{hookEventName, permissionDecision: allow|deny|ask, permissionDecisionReason}`, `terminalSequence`. [docs-hooks]
- Binary string counts confirm the classic event names present in 2.1.247 (PreToolUse=188, PostToolUse=184, UserPromptSubmit=87, SessionStart=99, SessionEnd=44, PreCompact=39, PermissionRequest=133). [E12]

### G8. Plugins — supported
- Manifests: plugin root `.claude-plugin/plugin.json`; marketplace `.claude-plugin/marketplace.json` (`name`, `owner`, `plugins:[{name, source, …}]`). Components: skills/, commands/, agents/, hooks/hooks.json, MCP servers. [E9 fixture, docs]
- CLI: `claude plugin marketplace add|list|update|remove`; `plugin install|i <name|name@mkt>` (scope user observed), `uninstall|remove`, `enable|disable`, `update` (restart to apply), `list`, `details` (component inventory + projected token cost), `validate`, `init|new` (scaffold; lands in `$CLAUDE_CONFIG_DIR/skills/<name>` under CLAUDE_CONFIG_DIR; auto-loads as `<name>@skills-dir`), `prune|autoremove`, `tag`, `eval`. [E3, E9]
- State: `<config>/plugins/installed_plugins.json` (schema `version:2`, per-plugin entries with `scope`, `installPath` `plugins/cache/<mkt>/<plugin>/<version>`, `version`, `installedAt`, `lastUpdated`); `<config>/plugins/known_marketplaces.json`; marketplace declared in settings `extraKnownMarketplaces`; enable state in settings `enabledPlugins` map. [E9]
- Flags: `--plugin-dir <path|.zip>` (repeatable), `--plugin-url <url>` (repeatable) — session-scoped plugin loading without installation. [E2]
- Hardening/version sensitivity: path-traversal rejection for marketplace-declared command paths (2.1.252); control-char marketplace names rejected; BOM in plugin.json tolerated since 2.1.247 fix; `/reload-plugins` hot reload. [CHANGELOG 2.1.247–2.1.252]

### G9. Memory — supported (two distinct mechanisms)
- Static memory = CLAUDE.md family (G1) including `@imports`; user-editable via `/memory` (lists all locations incl. auto memory; toggles auto memory; opens editor).
- Auto memory = `<config>/projects/<project>/memory/` with `MEMORY.md` index + topic files; frontmatter `type: user|feedback|project|reference`; 200-line/25KB preload; ISO `modified` timestamps (≥2.1.214); disabled via `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` or `autoMemoryEnabled:false`; relocate via `autoMemoryDirectory`. Subagent-scoped memory via agents frontmatter `memory: user|project|local`. [docs-memory, docs-sub-agents]

## H. Events & observation (stream-json envelope)

| ID | Fact | Status | Basis |
|---|---|---|---|
| H1 | Envelope: newline-delimited JSON, each object with `type` (`system|assistant|user|stream_event|result|control_request|control_response`) and optional `subtype`, `session_id`, `uuid`, `parent_tool_use_id`. | supported (documented/SDK) | SDK types + parser |
| H2 | First event: `{"type":"system","subtype":"init",...}` with fields including `session_id`, `model`, `cwd`, `tools`, `slash_commands`, `mcp_servers`, `permissionMode`, `apiKeySource` (full key set documented historically; exact 2.1.247 key list = docs-headless fetch timed out → treat extra keys as UNKNOWN beyond {session_id, model, tools, slash_commands, mcp_servers, permissionMode}). | partially verified | SDK/docs; see UNRESOLVED U1 |
| H3 | `assistant` events: `message` with Anthropic content blocks (text/thinking/tool_use); SDK model fields: content, model, parent_tool_use_id, error, usage, message_id, stop_reason, session_id, uuid. `user` events carry `tool_result` blocks + `tool_use_result`. | supported (SDK source) | types.py L1104-1133 |
| H4 | `stream_event` (partial deltas, needs `--include-partial-messages`): `{uuid, session_id, event:<raw Anthropic stream event>, parent_tool_use_id}`. | supported (SDK source) | types.py L1360 |
| H5 | Terminal marker per turn = `result` event (fields in C3). Single `result` for `-p`; stream-json input mode emits one per turn; `terminal_reason` ∈ {completed, max_turns, aborted_streaming, aborted_tools, …} (aborted_* = cancelled via interrupt). | supported (SDK source) | types.py L1319-1358 |
| H6 | Permission flow: CLI → host `control_request` `{request_id, request:{subtype:"can_use_tool", tool_name, input, permission_suggestions?}}`; host replies `control_response` `{request_id, response:{subtype:"success"|"error", …}}`; allow path may include `updatedInput`/`updatedPermissions` (PermissionUpdate: behavior/destination/rules; destinations session/project/local/settings). Also `PermissionRequest` hook event can decide via `permissionDecision`. | supported (SDK source + docs-hooks) | types.py L2364-2420, docs-hooks |
| H7 | Other control subtypes (stream-json input mode): `interrupt`, `initialize`, `set_permission_mode`, `hook_callback`, `mcp_message`, `rewind_files`, `mcp_reconnect`, `mcp_toggle`, `stop_task`. | supported (SDK source) | types.py L2364+ |
| H8 | Hook lifecycle in stream: with `--include-hook-events`, `system` messages subtype `hook_started`/`hook_response` (parser reads `hook_event`/`hook_name`/`hook_event_name`). | supported (SDK source) | message_parser.py L70-84 |
| H9 | Usage & cost: result `usage` (input/output/cache tokens), `total_cost_usd`, per-model `model_usage` entries `{inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, webSearchRequests, costUSD, contextWindow, maxOutputTokens, canonicalModel?, provider?}` (provider ∈ firstParty/bedrock/vertex/foundry/…). SDK warns: never accumulate `total_cost_usd` across long-lived connections (double counting). | supported (SDK source) | types.py |
| H10 | Errors: `result.is_error` + `errors[]` + `api_error_status` (HTTP code since 2.1.110); `assistant.error` field; malformed/unrecognized `system` subtypes pass through as generic SystemMessage (lenient parser — no hard failure). Exact malformed-event behavior otherwise UNKNOWN. | mostly supported; malformed behavior unknown | message_parser.py, types.py |
| H11 | Session transcript mirror: `projects/<proj>/<uuid>.jsonl`; internal format version-unstable (docs explicitly warn against parsing). Hooks receive `transcript_path` — the sanctioned way to read a live transcript. | supported (documented) | docs-sessions, docs-hooks |
| H12 | Background-task & lifecycle system events in stream: `task_started`, `task_progress` (usage{total_tokens, tool_uses, duration_ms}), `task_notification` (status completed|failed|stopped; output_file; summary), `task_updated` patch; `rate_limit_event` (status allowed|allowed_warning|rejected; resets_at; rate_limit_type five_hour|seven_day|…); `prompt_suggestion` (with `--prompt-suggestions`). | supported (SDK source) | types.py, message_parser.py |

## I. Runtime control

| ID | Fact | Status | Basis |
|---|---|---|---|
| I1 | Interrupt: `control_request interrupt` → current turn cancels; result `terminal_reason` `aborted_streaming`/`aborted_tools`. | supported (SDK source) | types.py |
| I2 | Steer/follow-up: keep stdin open with `--input-format stream-json`; send further `user` messages; `--replay-user-messages` acks. Multi-turn long-lived sessions supported. | supported (documented+SDK) | E2, SDK |
| I3 | Permission response: host answers `can_use_tool` with allow/deny (+`updatedInput`, `updatedPermissions` PermissionUpdate list). Alternative: `--permission-prompt-tool <mcp-tool>` routes prompts to an MCP tool. | supported (SDK source+docs) | types.py, docs-mcp/sdk |
| I4 | Mid-session mode switch: `control_request set_permission_mode` (SDK set_permission_mode). | supported (SDK source) | types.py |
| I5 | Model switch: interactive `/model` (Enter = save default, `s` = session-only); no stream-json control subtype for model switch observed in SDK — model changes across sessions use `--model`/settings/`ANTHROPIC_MODEL`; resumed sessions keep transcript's saved model unless excluded by `availableModels`. | supported (documented; control absence = SDK-source inference) | docs-model-config, types.py |
| I6 | Effort switch: `/effort` (per-model default since 2.1.248); `--effort` at launch; `CLAUDE_CODE_EFFORT_LEVEL`; `max` session-only unless env-set. | supported (documented) | docs-model-config, CHANGELOG |
| I7 | Attach/resume: `--resume <id>` cross-directory (≥2.1.223), `--continue`, `--fork-session` (session-scoped permission grants do NOT carry into fork), `--session-id` pin. | supported (documented+observed) | docs-sessions, E2 |
| I8 | MCP runtime control: `mcp_reconnect`, `mcp_toggle`, `mcp_message` control subtypes; `claude mcp reset-project-choices`. | supported (SDK source+observed) | types.py, E3 |
| I9 | File checkpointing: `rewind_files` control (user_message_id); `/rewind` in TUI. | supported (SDK source; TUI cmd documented) | types.py |
| I10 | Background agents: `--bg` returns immediately; `claude agents` (view), `claude agents --json` (machine-readable list, no TTY needed); task stop via `stop_task`. | supported (observed help) | E3 |

## J. Agent-Box owner mapping

| Fact cluster | Owner | Notes |
|---|---|---|
| A1–A6, B1–B7 (identity, native binary distribution, version probe, doctor) | **harness-registry-declaration** (+ harness-native-adapter for probe mechanics) | version string + npm layout = registry metadata |
| C1–C13 launch modes (argv templates, stdio contract, stream-json, SDK argv) | **runtime-host-protocol** | spawn contract; TUI needs PTY |
| D1–D10 profile/config (CLAUDE_CONFIG_DIR, settings hierarchy/precedence, .claude.json) | **profile-store / native-payload** | AUTHORITY_CONFLICT #1 below |
| E-1–E-6 credentials (env vars, precedence, .credentials.json, keychain re-keying, --bare) | **credential-materializer** | env materialization over file persistence |
| F1–F7 state classification & isolation recipes (temp config dir, --bare/--safe-mode, --no-session-persistence, project purge) | **harness-native-adapter** (+ sandbox-protocol for sandbox limits) | |
| G1–G9 resource surfaces (CLAUDE.md, skills, MCP, commands, agents, hooks, plugins, memory) | **resource-projector** | projection targets verified per surface |
| H1–H12 stream-json envelope + result fields | **observation-envelope-candidate** (+ runtime-host-protocol for the wire) | |
| I1–I10 control protocol (interrupt/steer/permission/mode/mcp/task) | **host-control** | control_request/response is the native control plane |
| TUI-only interactions (trust dialog, /model picker, /cost /usage, /doctor in-session) | **terminal-session-protocol** | only when TUI is hosted |
| Sandbox (`sandbox.*`, bubblewrap/seatbelt, unsupported on native Windows/WSL1) | **sandbox-protocol** | |
| IDE/Chrome/cloud/teleport/remote-control/worktree/tmux/gateway/import/ultrareview | **not-agent-box** | out of scope for resource routing v1 |
| MCP `serve` mode (Claude Code as MCP server) | **runtime-host-protocol** | alternative integration plane |

### AUTHORITY_CONFLICTS

1. **CLAUDE_CONFIG_DIR vs HOME projection (D1 vs F4):** relocating `CLAUDE_CONFIG_DIR` moves settings/state/plugins/credentials, but MCP logs and machine cache go to `$HOME/.cache/claude-cli-nodejs/`. A host that only redirects config must also redirect or accept leakage into real `$HOME/.cache`. Owner: harness-native-adapter must set BOTH `HOME` and `CLAUDE_CONFIG_DIR` for full isolation.
2. **plugin init help text vs actual path (G8):** help says `~/.claude/skills/<name>/` but with `CLAUDE_CONFIG_DIR` set it scaffolds into `$CLAUDE_CONFIG_DIR/skills/<name>` — docs/help literalism must not be trusted for path projection. Owner: resource-projector.
3. **`manual` vs `default` permission mode (C8):** CLI accepts `manual` (alias of `default`) but hook payloads report `default`; profiles should normalize to `default`. Owner: profile-store.
4. **Projects keying (D5/E7):** `.claude.json` `projects` keys use the enclosing git repo root, not the launch cwd (non-git rule unresolved) — a host resuming/annotating per-cwd state must key by git root. Owner: harness-native-adapter.

## UNRESOLVED (could not verify in this run)

- U1: Exact 2.1.247 `system/init` key list (`apiKeySource`, `version`, `workspace`… presence not locally observed; `-p` forbidden). Docs fetch of the headless page timed out.
- U2: `--permission-mode` value `default` accepted at CLI? Help lists only `acceptEdits, auto, bypassPermissions, manual, dontAsk, plan`; `default`/`manual` equivalence documented; passing `default` untested (needs a session).
- U3: Non-git project-key derivation rule in `.claude.json` (observed collapse to an ancestor root; exact algorithm unknown).
- U4: Full slash-command frontmatter field list from the official page (page fetch timed out; fields listed in G4 are from prior documented knowledge, marked MEDIUM confidence, VERSION_SENSITIVE).
- U5: `/cost`, `/usage` presence/behavior in 2.1.247 TUI (not probed; docs fetch for costs page failed). Unknown — not claimed either way.
- U6: `todos/` and `statsig/` storage locations in 2.1.247 (not present at user config root in the observed real home listing; likely under projects/ or session dirs — location unknown).
- U7: `NO_PROXY`/required-domains list for network allowlisting (network-config page not fetched).
- U8: Exit-code table beyond observed 0/1 and documented hook `2` (e.g. SIGINT semantics, `error_max_turns` exit code) — unknown.
- U9: `--include-hook-events` exact emitted payload shape beyond `hook_started`/`hook_response` subtypes (SDK parser read; full field list unverified).
