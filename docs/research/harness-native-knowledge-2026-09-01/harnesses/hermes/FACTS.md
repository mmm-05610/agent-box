# Hermes Agent — Native Knowledge Base (harness id: hermes)

Research date: 2026-09-02 · Researcher: agent-box research subagent · Local version observed: v0.19.0 (2026.7.20), upstream f15a38ee, local 7df3aa34 (+1 carried commit) · Upstream latest at research time: v0.21.0 (v2026.8.31).
Evidence IDs E1–E4x resolve in `evidence.md`. Source kinds: OFFICIAL_DOC | OFFICIAL_SOURCE | CLI_OBSERVED | RELEASE_NOTE | PEER_PROJECT | INFERENCE. Tri-state: supported / unsupported / unknown — "unknown" is never rendered as false.

**Tier: 1 (full-featured standalone agent with a rich, documented native home; locally verified)** — one-line: a Python "self-improving" agent by Nous Research with a YAML-configured `~/.hermes` home, SQLite session store, hub-managed skills, MCP client+server, plugins, hooks, profiles, and interactive TUI/REPL plus `-z` one-shot and ACP/JSON-RPC server modes.

---

## A. Identity & distribution

| Fact | Value | Evidence |
|---|---|---|
| Official upstream repo | `github.com/NousResearch/hermes-agent` (canonical lowercase `github.com/nousresearch/hermes-agent`) | E1 (banner.py `_UPSTREAM_REPO_URL`, `_OFFICIAL_REPO_CANONICAL`), E2 (GitHub repo page) |
| Maintainer / author | Nous Research (`Author: Nous Research` in dist METADATA; "Built by Nous Research") | E3 (METADATA) |
| Package name (wheel metadata) | `hermes-agent` | E3 |
| License | MIT (`License-Expression: MIT`, LICENSE file) | E3 |
| Docs site | https://hermes-agent.nousresearch.com/docs/ (unreachable from research sandbox 2026-09-02 — URLs known from METADATA long-description) | E3, E4 |
| Tagline | "The self-improving AI agent — creates skills from experience, improves them during use, and runs anywhere" / repo: "The agent that grows with you" | E3, E2 |
| Distribution channels | Git-based managed install: `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash` (Linux/macOS/WSL2/Termux); Windows `install.ps1`; contributors: `uv pip install -e ".[all,dev]"`. Local machine: installed via git method into `<user-home>/.local/lib/python3.12/site-packages`. PyPI presence: NOT_VERIFIED (wheel METADATA exists but does not prove PyPI publication; install banner says "install method: git") | E2, E5 (--version transcript), E3 |
| Version scheme | `v0.X.Y (YYYY.M.D)` display + release tag `vYYYY.M.D` (e.g. tag `v2026.8.31` = "Hermes Agent v0.21.0 (v2026.8.31)") | E5, E6 (GitHub releases API) |
| Local vs upstream | Local v0.19.0 (2026.7.20); upstream latest v0.21.0 (v2026.8.31) at research time → local is 2 monthly releases behind | E5, E6 |
| Python requirement | `>=3.11,<3.14` (Requires-Python); local runs on 3.12.3 | E3, E5 |
| Key deps (pinned) | openai==2.24.0, fastapi+uvicorn (server), prompt_toolkit (REPL), pydantic 2, pyyaml/ruamel.yaml, websockets, ptyprocess (POSIX) / pywinpty (win32), mcp==1.26.0 (dev extra) | E3 |
| Entry points (console_scripts) | `hermes` = hermes_cli.main:main · `hermes-acp` = acp_adapter.entry:main · `hermes-agent` = run_agent:main | E7 (entry_points.txt) |
| Data files shipped | `locales/*.yaml` (17 languages), `optional-mcps/{linear,n8n}/manifest.yaml`, bundled skills/optional-skills dirs discoverable via `_get_packaged_data_dir` | E8 (RECORD), E9 (hermes_constants.py:197–247) |
| Release channel | GitHub releases; `hermes update` self-update command; update check state file `<home>/.update_check` | E6, E8, E10 |
| Trademark caution | Distinct from Meta's Llama "Hermes" testnets and from other "hermes" packages — identity anchored on METADATA author + banner canonical repo constant, not the name | E3, E1 |

## B. Executable discovery

| Fact | Value | Evidence |
|---|---|---|
| Primary binary | `hermes` on PATH (local: `<user-home>/.local/bin/hermes`, a Python console-script with `#!/usr/bin/python3` shebang calling `hermes_cli.main:main`) | E5, E11 |
| Secondary binaries | `hermes-acp` (ACP server for editors), `hermes-agent` (programmatic runner, fire-based kwargs CLI: query/model/api_key/base_url/max_turns/enabled_toolsets/list_tools/save_trajectories) | E7, E12 (run_agent.py:6434+) |
| Version probe | `hermes --version` → multi-line banner: version line, install dir, install method, Python, OpenAI SDK version | E5 |
| Version probe exit/behavior | exit 0; safe (no model call, no setup required) | E5 |
| Module layout | Top-level modules: `cli.py`, `run_agent.py`, `batch_runner.py`, `toolsets.py`, `model_tools.py`, `hermes_constants.py`, `hermes_state.py`, `hermes_cli/` (100+ files), `agent/` (70+ files), `gateway/`, `acp_adapter/`, `cron/` | E8, E13 |
| Unknown | npm-style package, single-file binary distribution: unknown (none observed; README documents script+git+uv pip only) | E2 |

## C. Launch modes

### C.1 Interactive chat (default)
- argv template: `hermes` (no args) or `hermes chat [flags]`. [E14 help; E15 bare-run probe]
- Prompt transport: interactive TTY (prompt_toolkit REPL by default; `--tui` for the TypeScript TUI, `--cli` forces classic REPL; `display.interface=tui` config). [E14, E16]
- cwd: user's cwd; AGENTS.md etc. resolve from cwd. [E17 oneshot.py docstring; E14]
- env: HERMES_HOME, HERMES_YOLO_MODE, HERMES_ACCEPT_HOOKS, HERMES_IGNORE_RULES, HERMES_INFERENCE_MODEL/PROVIDER, HERMES_EPHEMERAL_SYSTEM_PROMPT honored. [E14, E18 cli.py:3985]
- Non-TTY without config: does NOT run a turn — prints "isn't configured yet" + non-interactive setup instructions and exits (first-run wizard fallback). [E15]
- Flags: `-q QUERY` single-query non-interactive, `--image`, `-m/-t/-s/--provider`, `--resume SESSION_ID`/`--continue [NAME]`, `--no-restore-cwd`, `--worktree`, `--checkpoints`, `--max-turns N` (default 90), `--yolo`, `--accept-hooks`, `--pass-session-id`, `--ignore-user-config`, `--ignore-rules`, `--safe-mode`. [E14]
- Output: streamed terminal UI; `-Q/--quiet` = final response + session info only. [E14]
- Resume: by session ID (`--resume`) or title/most-recent (`--continue`); sessions stored in SQLite `state.db` (`sessions list/export/...`). [E14, E19]
- Exit semantics: interactive loop; `--resume SESSION_ID` ID "shown on exit". [E14]

### C.2 One-shot: `-z PROMPT` / `--oneshot PROMPT` (top-level flag, NOT a subcommand)
- argv template: `hermes -z "<prompt>" [-m MODEL] [--provider P] [-t TOOLSETS] [--usage-file PATH] [--yolo implied] [--ignore-user-config] [--ignore-rules] [--resume ...]`. [E14]
- Prompt transport: argv. Stdin not required. [E14]
- Output: ONLY final response text on stdout — no banner, no spinner, no tool previews, no session_id line. stderr on failure. [E14, E17 oneshot.py:1–10]
- Approvals: auto-bypassed (`HERMES_YOLO_MODE=1` set internally); clarify callback auto-answers; HERMES_INTERACTIVE never set. [E14, E20 oneshot.py:428–441]
- Context: tools, memory, rules, AGENTS.md from cwd loaded as normal. [E14]
- `--usage-file PATH`: JSON usage report written even on failure (schema in §H). [E14, E21 oneshot.py:127–160]
- Exit semantics (observed): no provider configured → stdout empty, stderr `hermes -z: agent failed: No inference provider configured. Run 'hermes model' ...`, exit code 1. [E22]
- Model fallback env: HERMES_INFERENCE_MODEL; provider auto-detect from model; `--provider` without `--model` errors (ambiguous). [E14, E17]

### C.3 ACP server (editor integration)
- argv: `hermes acp` or binary `hermes-acp`. For VS Code, Zed, JetBrains (Agent Client Protocol). Flags: `--version`, `--check` (verify deps + adapter imports, then exit), `--setup`, `--setup-browser` (installs agent-browser + Playwright Chromium into `<home>/node/`), `--yes`, `--accept-hooks`. [E23]
- Protocol: ACP over stdio (JSON-RPC family); io="stdio" per Agent-Box harnesses.toml hypothesis, consistent with `hermes-acp` entry point. [E23, E24]

### C.4 Backend server / dashboard / gateway
- `hermes serve [--port 9119] [--host 127.0.0.1] [--skip-build] [--isolated] [--stop] [--status]` — headless JSON-RPC/WebSocket backend for desktop app and remote clients; public bind always requires auth provider (June 2026 hardening). [E25]
- `hermes dashboard` — web UI dashboard, port 9119, `--stop`/`--status`. [E14]
- `hermes gateway` — messaging gateway (Telegram, Discord, Slack, WhatsApp, Signal, Email, Matrix...), installable as background service; `HERMES_GATEWAY`, `HERMES_GATEWAY_DETACHED` env; systemd template passes HERMES_HOME explicitly. [E14, E26, E9 hermes_constants.py:481]
- `hermes mcp serve` — runs Hermes itself AS an MCP server ("expose conversations to other agents"). [E27]
- Not probed live (server start would bind ports) — command surface CLI_OBSERVED via --help only.

### C.5 Other run surfaces
- `hermes send` (send message via configured platform), `hermes cron` (scheduled tasks), `hermes console` (safe command console), `hermes kanban` (multi-profile board), `desktop (gui)` (native desktop app), `batch_runner.py` + `hermes-agent` for programmatic/batch runs, `hermes chat -q` single query. [E14, E12]
- Daemon/server mode: supported (serve/gateway/acp/mcp serve/dashboard). Attach: dashboard attaches to machine-level server; `--isolated` runs profile-scoped server. [E25]

## D. Profile & configuration

| Fact | Value | Evidence |
|---|---|---|
| Native home | `~/.hermes` (POSIX default: `Path.home() / ".hermes"`); Windows: `%LOCALAPPDATA%\hermes`; Termux/other = `$HOME/.hermes` | E28 hermes_constants.py:44–51 |
| Home override env | `HERMES_HOME` (env var) — resolution order: context-local in-process override → `HERMES_HOME` env → platform default. `set_hermes_home_override()` exists for in-process per-task scoping (profile switching without mutating os.environ) | E28 hermes_constants.py:13–98, 118–137 |
| Config file | `<HERMES_HOME>/config.yaml` — YAML (`get_config_path()`); Agent-Box writes JSON text to config.yaml which parses only because JSON ⊂ YAML 1.2 | E29 hermes_constants.py:1187–1192, E30 projection.py, E31 mcp_config.py:8 |
| Env file | `<HERMES_HOME>/.env` (`get_env_path()`); loaded via `hermes_cli/env_loader.py` (also project env, hot-reload, external secret sources Bitwarden/1Password inject into it) | E32 hermes_constants.py:1202–1203, E33 env_loader.py |
| Config bootstrap | First run auto-creates home skeleton: `audio_cache/ pairing/ memories/ logs/{agent.log,errors.log,curator/} cron/ skills/ sessions/ hooks/ image_cache/ SOUL.md .update_check` — observed via temp-HOME diff | E34 probe |
| Top-level config keys (DEFAULT_CONFIG excerpt) | `model`, `providers` (map of user-defined providers: base_url + api_key fields), `fallback_providers`, `credential_pool_strategies`, `toolsets` (default `["hermes-cli"]`), `max_concurrent_sessions`, `max_live_sessions`, `agent{max_turns:90, gateway_timeout:1800, api_max_retries:3, coding_context, coding_instructions, environment_hint, ...}`, `approvals{mode: manual|smart|off, cron_mode: deny|approve, deny:[], timeout:60}`, `command_allowlist`, `mcp_servers`, `skills{disabled, platform_disabled, external_dirs}`, `hooks{}`, `hooks_auto_accept`, `write_approval`, `security{...}`, `personalities`, `platform_hints`, `provider_routing`, `openrouter{min_coding_score}`, `checkpoints`, `quick_commands`, sub-LLM blocks `approval/mcp/title_generation/memory_query_rewrite {provider,model,base_url,api_key,timeout,reasoning_effort}` | E35 config.py:998–2770 |
| Model/provider fields | Persistent provider at `model.provider` in config.yaml; `model.base_url` (OpenAI-compatible, takes precedence), `model.api_key` (falls back to OPENAI_API_KEY); `hermes config set model.provider custom`; user-defined `providers:` entries supply base_url/api_key; `hermes model` picker; fallback chain `fallback_providers` | E14, E15, E35 config.py:1632–1703 |
| Built-in providers (auth.py registry, api_key_env_vars) | openai OPENAI_API_KEY; lmstudio LM_API_KEY; google GOOGLE_API_KEY/GEMINI_API_KEY; glm GLM_API_KEY/ZAI_API_KEY/Z_AI_API_KEY; kimi KIMI_API_KEY/KIMI_CODING_API_KEY; kimi-cn; stepfun; arceeai; gmi; minimax MINIMAX_API_KEY; anthropic ANTHROPIC_API_KEY/ANTHROPIC_TOKEN/CLAUDE_CODE_OAUTH_TOKEN; dashscope DASHSCOPE_API_KEY; alibaba-coding-plan; minimax-cn; deepseek; xai; nvidia; opencode-zen; fireworks; upstage; + OpenRouter OPENROUTER_API_KEY (oneshot error message) | E36 auth.py:197–373, E22 |
| Env var overrides (model) | `HERMES_INFERENCE_MODEL`, `HERMES_INFERENCE_PROVIDER` (7 uses), `HERMES_EPHEMERAL_SYSTEM_PROMPT`, `HERMES_IGNORE_RULES=1`, `HERMES_ENVIRONMENT_HINT` (build-time/container hint overriding `agent.environment_hint`) | E14, E18 cli.py:3985–3990, E35 config.py:1100 |
| Profiles (native) | `hermes profile {list,use,create,delete,describe,show,alias,rename,export,import,install,update,info}` — "multiple isolated Hermes instances". Sticky default profile via `<home-root>/active_profile` file. Profile layout: `HERMES_HOME=<root>/profiles/<name>` (e.g. `~/.hermes/profiles/coder`); `get_default_hermes_root()` handles Docker/custom roots. Spawners must pass HERMES_HOME explicitly (issue #18594: unset HERMES_HOME + active profile → loud fallback warning). Profile distributions installable from git URLs / local dirs, export/import archives. Profile-scoped areas: skills, plugins, cron, memories | E37 profile help, E28 hermes_constants.py:74–110, E38 file_safety.py:386, E39 |
| Config scopes | profile home (per-profile config.yaml) > machine (server-level assets via get_process_hermes_home) ; `--ignore-user-config` ignores config.yaml but still loads .env credentials; `--safe-mode` disables config+injections+plugins+MCP | E14, E28 |
| Precedence | argv flag > env var > config.yaml > built-in default (observed for model: `-m` beats HERMES_INFERENCE_MODEL beats config; documented in help text) | E14, E17 |
| Windows/macOS | Same config.yaml/.env under respective homes; win32-specific deps (pywinpty, concurrent-log-handler, tzdata) | E3, E28 |

## E. Credentials

| Fact | Value | Evidence |
|---|---|---|
| Primary store | `<HERMES_HOME>/.env` file (KEY=VALUE); env_loader sanitizes credential-suffixed vars (`_API_KEY`, `_TOKEN`, `_SECRET`, `_KEY`) | E33, E32 |
| OAuth/auth state | `<HERMES_HOME>/auth.json` — per-provider credential state, cross-process file locking (`hermes login`/`logout` per provider; `hermes auth` manages "pooled provider credentials" — a credential pool with strategies, exhaustion status, labels) | E40 auth.py:6–10, E14 |
| Env vars | Provider API keys read from env (see D table); oneshot error names OPENROUTER_API_KEY / OPENAI_API_KEY as canonical examples | E22, E36 |
| Secret managers | `hermes secrets` — external secret sources: Bitwarden, 1Password (`hermes_cli/secrets_cli.py`, `onepassword_secrets_cli.py`); injected at .env load time and labeled by source | E14, E33 |
| Keychain/OS keyring | Unknown — not observed in surveyed modules (keyring lib not in deps) | E3 |
| Nous account | `nous_account.py`, `nous_auth_keepalive.py`, `nous_billing.py`, `nous_subscription.py`, `hermes portal` (Nous Portal login/OAuth), `memory_oauth.py` | E13, E14 |
| Login/logout | `hermes login` / `hermes logout` subcommands (per-inference-provider); MCP OAuth: `hermes mcp login/reauth`; DM pairing codes: `hermes pairing` | E14, E27 |
| Redaction | `security.redact_secrets: true` default; `HERMES_REDACT_SECRETS` env; secrets never printed in transcripts (env_loader refuses to mangle non-ASCII creds) | E35 config.py, E33 |
| Claw migration imports keys | `hermes claw migrate` imports allowlisted API keys (Telegram, OpenRouter, OpenAI, Anthropic, ElevenLabs) from ~/.openclaw | E2 README |
| Research policy note | No credential contents read; names/paths only. NOT touched: real `<user-home>/.hermes` beyond nothing (probes used temp home). | — |

## F. State isolation

| Fact | Value | Evidence |
|---|---|---|
| Session store | SQLite `<HERMES_HOME>/state.db` (WAL mode, FTS5 full-text search, self-healing schema repair; "database is locked" guardrails for NFS/SMB/FUSE). Tables include `sessions` with JSONL-shaped transcripts. Legacy `sessions/sessions.json` retained | E19 hermes_state.py:153, 296–311, 4956 |
| Session layout | `<HERMES_HOME>/sessions/` (session blobs + legacy sessions.json); export to JSONL/Markdown/QMD via `hermes sessions export`; session rename/title/archive/prune/browse | E19, E8 path scan, E41 sessions help |
| Concurrency | Cross-process active-session leases (`active_sessions.py`); config caps `max_concurrent_sessions` (None/0=unbounded) and `max_live_sessions` (16 LRU for TUI/desktop/gateway); `--worktree` runs agent in isolated git worktree "for parallel agents"; multi-instance safe via WAL + file locks, but single state.db per profile (shared → write-lock contention noted in code) | E42 active_sessions.py, E35 config.py:1006–1013, E14 |
| Isolation levers | `--safe-mode` / `--ignore-user-config` / `--ignore-rules` for clean-room runs; `--worktree` for repo isolation; native `profiles` for whole-home isolation; container terminal backends (Docker, Singularity, Modal, Daytona, Vercel Sandbox) and SSH for execution isolation | E14, E2 |
| Checkpoints | `<HERMES_HOME>/checkpoints/` filesystem checkpoints before destructive ops (`--checkpoints`, `/rollback`); limits: max_snapshots 20, max_total_size_mb 500 | E14, E35 config.py:3971–3976 |
| Other state | `cache/`, `logs/{agent.log,errors.log}`, `cron/`, `gateway.pid`, `kanban` db (`projects.db`, kanban.db), `verification_evidence.db`, `pastes/`, `images/`, `backups/`, `.update_check`, `.skills_prompt_snapshot.json`, `chrome-debug/`, `mcp-installs/`, `moa-traces/`, `skill-bundles/`, `skins/`, `whatsapp/` | E8 path scan |
| Backup/restore | `hermes backup` (zip of Hermes home), `hermes import` (restore); `hermes doctor`, `hermes security` (OSV.dev supply-chain audit of venv, plugins, MCP servers) | E14 |
| Multi-instance same home | Supported but contention-prone (WAL + leases); Agent-Box should give each execution its own HERMES_HOME (matches native profile mechanism) | E42, E19 |

## G. Native resource surfaces

Legend per row: status tri-state → discovery target → format → notes. All paths under `HERMES_HOME` unless noted. Read-only OK = Agent-Box can read without writing; writable needed = surface only appears when materialized.

| Surface | Status | Discovery target | Format | Recursion/naming/scope/precedence | Env/flags | Notes |
|---|---|---|---|---|---|---|
| Instructions (project context) | supported | cwd AND HERMES_HOME: `AGENTS.md`, `SOUL.md`, `.hermes.md`, `CLAUDE.md`, `.cursorrules` | Markdown, auto-injected into system prompt | cwd-first per agent_init docstring; home SOUL.md is primary identity (`load_soul_identity`) | `--ignore-rules` / HERMES_IGNORE_RULES=1 to skip | No HERMES.md; AGENTS.md confirmed. README: OpenClaw migration imports "Workspace instructions — AGENTS.md (with --workspace-target)" | E43 agent_init.py:392–397, E14, E2 |
| Persona | supported | `<HERMES_HOME>/SOUL.md` | Markdown | auto-created on first run (observed); editable; personalities config key adds named personas | E34, E35 |  |
| Skills | supported | `<HERMES_HOME>/skills/` (primary, always first) + `skills.external_dirs` (config, `~`/`${VAR}` expanded, relative→HERMES_HOME) + bundled skills dir (wheel data) + `<HERMES_HOME>/optional-skills/` | Agent-skills style dirs with SKILL.md (skills.sh / well-known endpoints / GitHub / ClawHub registries per `hermes skills` help) | name = directory; `skills.disabled` + `skills.platform_disabled.<platform>` config; `-s/--skills` preload; bundles = aliases for multiple skills (`<home>/skill-bundles/`); openclaw imports land in `skills/openclaw-imports/` | `hermes skills {search,install,list,audit,...}`, `skills_hub.py` (agentskills.io), `HERMES_BUNDLED_SKILLS` | Read-only OK; writable needed for install; hub skills tracked for user-modification (update keeps edits) | E44 skill_utils.py:432–522, E45 skills help, E9, E2 |
| MCP client | supported | `mcp_servers` map in `<HERMES_HOME>/config.yaml` | YAML dict per server: command/args or url, env, enabled, tool selection toggles; bearer tokens + OAuth tokens persisted (config/env per server) | `hermes mcp add/remove/list/test/configure/login/reauth`; catalog (`hermes mcp catalog`, Nous-approved; bundled manifests `optional-mcps/{linear,n8n}/manifest.yaml`); `mcp-installs/` dir; `HERMES_OPTIONAL_MCPS` | Read-only OK (list works with none configured) | E27, E31 mcp_config.py:8–146, E46 mcp help, E34 |  |
| MCP server mode | supported | `hermes mcp serve` | MCP protocol | exposes conversations to other agents | E27 |  |
| Prompts/commands (slash) | supported | built-in slash commands in REPL (/resume, /title, /history, /branch, /model, /yolo, /reload-mcp, /rollback, /clear...); `quick_commands` config (type: exec) | built-in + config | destructive slash confirm config | E19, E35 | Custom prompt library: unknown |  |
| Subagents | supported | `delegate_task`/spawn tool: "Spawn subagents with isolated context for complex subtasks"; shared IterationBudget across parent+children; subagent approvals: `agent.subagent_auto_approve: false` default; v0.21.0 adds live steering + JSON-schema output validation + per-delegation cost | built-in tool | `agent.subagent_auto_approve` config | E47 model_tools.py/toolsets.py:247, E35 config.py:2382–2390, E6 |  |  |
| Hooks (shell) | supported | `hooks` map in config.yaml: event → list of `{matcher, command, timeout}`; events incl. `pre_tool_call`, `post_tool_call`, `pre_llm_call`, `subagent_stop`, etc. | YAML + shell scripts | first-use consent prompt; allowlist `<HERMES_HOME>/shell-hooks-allowlist.json`; `hooks_auto_accept` / `--accept-hooks` / HERMES_ACCEPT_HOOKS=1 for non-TTY; `hermes hooks {list,test,revoke,doctor}`; `<HERMES_HOME>/hooks/` dir exists | E35 config.py:2732–2752, E48 hooks help, E34 |  |  |
| Plugins | supported | bundled (package) → user `<HERMES_HOME>/plugins/<name>/` → project `./.hermes/plugins/` (opt-in `HERMES_ENABLE_PROJECT_PLUGINS=1`) → pip entry-points | manifest-based (manifest files per dir) | later sources override earlier on collision: project > user > bundled; `plugins.enabled` gate for user plugins; `hermes plugins {install,update,remove,list}` from git URLs; `HERMES_PLUGINS_DEBUG` | E49 plugins.py:1349–1380, E14 |  |  |
| Memory | supported | `<HERMES_HOME>/memories/` — MEMORY.md + USER.md persistent memory; external memory provider via `hermes memory` config + memory_oauth; memory_query_rewrite sub-LLM; `/memories` profile-scoped | Markdown files | injected unless `--ignore-rules`; memory toolset gating; OpenClaw migration imports MEMORY.md/USER.md | E50 learning_mutations.py:33, E2, E14 |  |  |
| Rules (deny/allowlists) | supported | config.yaml `approvals.deny` (fnmatch globs), `command_allowlist` (permanent "always" approvals), code-shipped hardline blocklist | YAML | deny rules fire BEFORE yolo bypass | E35 config.py:2680–2710 |  |  |
| Cron/scheduled | supported | `<HERMES_HOME>/cron/` + croniter dep; `hermes cron`; cron_mode approve/deny; profile-scoped | E8, E14, E35 |  |  |  |
| Projects/workspaces | supported | `hermes project` — "named, multi-folder workspaces", `projects.db`; kanban board `hermes kanban` (multi-profile collaboration) | E14 |  |  |  |

Surface unknowns: custom prompt/command directories (unknown), native "rules files" beyond context files (none observed), memory scopes beyond memories/ dir (unknown until docs reachable).

## H. Execution events & observation

| Fact | Value | Evidence |
|---|---|---|
| Structured run report | `-z --usage-file PATH` JSON: `estimated_cost_usd`, `cost_status`, `cost_source`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `reasoning_tokens`, `total_tokens`, `api_calls`, `model`, `provider`, `session_id`, `completed`, `failed`, `service_tier`. Written even on failure; never raises | E21 oneshot.py:127–160 |
| Session id | returned in usage report + shown on exit in chat mode; `--pass-session-id` injects it into the system prompt; `HERMES_SESSION_ID` env exists (4 uses) | E21, E14, E52 grep |
| Streaming | interactive surfaces stream deltas (stream_delta_callback); display suppressed in oneshot (`suppress_status_output=True`, no stream callbacks); `HERMES_TOOL_PROGRESS_MODE`/`HERMES_TOOL_PROGRESS` env for tool progress | E20 oneshot.py:445–447, E52 |
| Tool call/result events | native shell-script hooks fire on `pre_tool_call`, `post_tool_call`, `pre_llm_call`, `subagent_stop` etc. (JSON payload to script); ACP mode exposes run as protocol events; `model_tools` prints tool previews in interactive mode only | E35, E48 |
| Trajectories | `save_trajectories` / `save_sample` in run_agent → JSONL trajectory files (`trajectory_samples.jsonl`); moa-traces/ dir | E12, E8 |
| Session persistence | every run (incl. oneshot) writes to state.db sessions (oneshot closes session_db at exit, WAL checkpoint) | E20 oneshot.py:470–480 |
| Cost/usage analytics | `hermes insights` (usage insights/analytics), `aux_accounting.py`, `billing_usage.py`, `credits_tracker.py`, per-delegation cost reporting (v0.21.0) | E14, E13, E6 |
| Exit codes | oneshot failure exit 1 with empty stdout (observed); success exit code 0 assumed (NOT observed without model call) | E22 |

## I. Runtime control

| Fact | Value | Evidence |
|---|---|---|
| Interrupt | gateway drain semantics (`agent.restart_drain_timeout: 0` = interrupt immediately; graceful drain optional); SIGTERM grace `HERMES_SIGTERM_GRACE`; dashboard `--stop`; serve `--stop` | E35 config.py:1016–1035, E25, E52 |
| Steer | interactive REPL mid-session (user messages steer agent); subagent steering ("course-correct or stop children mid-flight") arrives in v0.21.0 delegate_task live orchestration — NOT in local v0.19.0 | E6 |
| Attach | dashboard/TUI/desktop attach to live sessions (gateway sessions persist, reopening re-resumes from disk; `HERMES_TUI_RESUME`); serve `--isolated` vs machine-level attach | E35 config.py:1010–1012, E52 |
| Approval mechanism | dangerous-command approval: `approvals.mode` = manual (always prompt) | smart (auxiliary LLM auto-approves low-risk; provider/model/base_url/api_key/timeout configurable) | off (=--yolo). Plus `--yolo` flag / HERMES_YOLO_MODE / /yolo session toggle; `approvals.deny` globs fire even in yolo; `command_allowlist` for permanent "always"; cron_mode deny/approve; write_approval (staged writes) and skill-write approval configs; subagent_auto_approve=false | E35 config.py:1667, 2382–2475, 2667–2712, E14 |
| Hooks approval | first-use consent per command; shell-hooks-allowlist.json; --accept-hooks for CI | E48, E14 |
| Permission model for tools | toolsets system (`-t`), per-platform tool toggles (`hermes tools`), MCP per-tool enable/disable (`hermes mcp configure`), tirith pre-exec security scanning (security.tirith_enabled), website blocklist, private-URL guard | E14, E35 config.py:2749+ |
| Resume/continue | `--resume SESSION` (ID or title), `--continue [NAME]` (most recent), `--no-restore-cwd`; checkpoints `/rollback`; session branch (/branch), /retry, /undo, /compress transcript rewrites | E14, E19 |
| Concurrency control | max_concurrent_sessions, max_live_sessions, worktrees, credential pool exhaustion tracking (`hermes auth reset`) | E35, E42, E14 |

## J. Agent-Box owner mapping

Agent-Box internal hypotheses read from `plugins/agent-box-harnesses/src/agent_box_harnesses/hermes/*.py` + `harnesses.toml` (INTERNAL HYPOTHESES — not evidence of native behavior). Confirmation status vs this research:

| Agent-Box owner | Native counterpart | Status | Notes |
|---|---|---|---|
| harness-registry-declaration | harnesses.toml `[harness.executable] identity="hermes" resolver_kind="PATH" version_probe=["--version"]` | CONFIRMED | `hermes` on PATH + `--version` probe works exactly as declared (E5) |
| harness-registry-declaration | `native_home=".hermes"` | CONFIRMED (POSIX) | Real default is `~/.hermes` (E28) — but Windows is `%LOCALAPPDATA%\hermes`, and the home is a full state home (sessions/memories/plugins), not a config-only dir; override env is HERMES_HOME |
| harness-registry-declaration | `skill_env="HERMES_HOME"` | CONFIRMED | HERMES_HOME is the single home/config override; skills root is `$HERMES_HOME/skills` (E28, E44). Note additional surface: `skills.external_dirs` config could project skills without home relocation |
| harness-registry-declaration | launch `argv=["hermes","--print"]`, io=stdio | REFUTED for v0.19.0 | `--print` does not exist (argparse rejects; E15). One-shot flag is `-z PROMPT`/`--oneshot PROMPT` (argv-prompted, stdout text-only). Bare `hermes` = interactive REPL; without TTY+config it runs first-run setup fallback, not a turn (E15). AUTHORITY_CONFLICT: registry argv must be `["hermes","-z",prompt]` (or `hermes-acp` for protocol io) |
| harness-registry-declaration | `config_format="json"` | PARTIALLY REFUTED | Native config is YAML (`config.yaml`); Agent-Box's JSON bytes parse only because JSON is valid YAML 1.2 (E29, E30). candidate.toml should declare yaml with json-compatible subset |
| harness-native-adapter | launch.py: stage binary to execution dir, env allowlist {LANG,LC_*,PATH,proxies} + HERMES_HOME=/runtime/home + AGENT_BOX_EXECUTION_ID, PATH=/usr/bin:/bin, cwd=workspace | CONFIRMED-VIABLE with fixes | Env allowlist drops credential env vars — Hermes would then need .env materialization (projection currently refuses secrets) or a credential materializer; PATH=/usr/bin:/bin hides python deps? — the hermes console script needs its python env; staging only the 214-byte launcher without the venv/site-packages will fail unless the full install tree is mounted (the launcher is `#!/usr/bin/python3` + `from hermes_cli.main import main`) — verified launcher content (E11). Adapter must mount/stage `<site-packages>` tree or use the real interpreter context |
| profile-store/native-payload | projection.py: materialize `<exec-root>/<id>/hermes/{config.yaml, skills/, projection-manifest.json}`; native_home="hermes" | CONFIRMED-VIABLE | Matches native home layout (config.yaml at home root; skills/ auto-created natively anyway — E34). `shared_slots` mapping skills/mcp/instructions/resources → native keys are `skills` (dirs), `mcp_servers` (not `mcp` — code does check `config.get("mcp", config.get("mcp_servers"))` fallback, OK), instructions → no native single key (context files are separate: AGENTS.md/SOUL.md/.cursorrules in cwd/home; config `agent.coding_instructions` is coding-posture only) — mapping partially wrong: AUTHORITY_CONFLICT for `instructions` slot |
| credential-materializer | projection.py: "Secrets are intentionally not materialized" | DESIGN CHOICE, native-compatible | Native secret surface is `<HERMES_HOME>/.env` + provider env vars + auth.json; a materializer writing `.env` into the isolated home would be the native mechanism (env_loader sanitizes cred-suffixed keys). Unimplemented in Agent-Box → harness runs unconfigured (observed: no-provider error path, E22) |
| resource-projector | skill_target `/runtime/home/skills/{skill_id}` | CONFIRMED | Native skills discovery reads `$HERMES_HOME/skills/<name>` recursively as agent-skill dirs (SKILL.md) (E44) |
| runtime-host-protocol | harnesses.toml runtime io=stdio network=required | PARTIALLY CONFIRMED | stdio fits `hermes-acp`/`-z`; network required (model APIs, MCP, registries). For `-z` the child inherits stdio directly; for interactive modes a PTY is needed (ptyprocess dep) — host must know mode |
| sandbox-protocol | terminal backends: local, Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox (native) | CONFIRMED (native capability) | Agent-Box sandbox layer (bwrap in launch.py) is independent; both can coexist — Hermes sees `local` backend inside the sandbox |
| terminal-session-protocol | interactive TUI/REPL needs PTY | CONFIRMED | prompt_toolkit REPL + `--tui` (TypeScript) require TTY; for headless hosts prefer `-z` or ACP |
| host-control | interrupt/steer/attach | GAP in v0.19.0 | No external control channel in `-z` mode (runs to completion, os._exit hard-exit); interrupt = signal (SIGTERM/SIGINT); steer/attach natively via gateway/dashboard, not via stdio; AUTHORITY_CONFLICT if host expects mid-run steering in oneshot |
| observation-envelope-candidate | `--usage-file` JSON + state.db sessions + hooks | CONFIRMED as best candidates | `--usage-file` gives cost/tokens/session_id per run without screen scraping (E21); session transcripts queryable from state.db (SQLite, read-only OK); shell hooks give tool-call events |
| continuation | harnesses.toml: transcript_handoff, contract agent-box.hermes-continuation@1 "native state is not resumable P0" | REFUTED as native limitation / CONFIRMED as Agent-Box scoping | Native resume EXISTS: `--resume SESSION`, `--continue`, state.db, session export JSONL (E14, E19). "Not resumable" is a P0 scoping choice; AUTHORITY_CONFLICT with candidate.toml [continuation] claiming native unsupported |
| not-agent-box | messaging gateway, cron, kanban, pets, skills hub publishing, Nous Portal, dashboard auth | OUT OF SCOPE | Native extras irrelevant to Agent-Box P0 but increase home-dir footprint; safe-mode flags can trim |

---

## UNRESOLVED

1. PyPI publication status of `hermes-agent` (wheel METADATA exists locally; install banner says git method; PyPI registry not checked — no network to pypi allowed/probed). UNKNOWN.
2. Official docs pages (configuration, environment-variables reference) unreachable from sandbox (timeouts) — env-var list above is from source, may miss build/container vars. UNKNOWN (docs cross-check incomplete).
3. Success-path exit code of `-z` (0 assumed) — not observable without a model call. UNKNOWN.
4. Whether a native structured/JSON output stream exists beyond `--usage-file` (e.g. a `--json` print mode) — none found in help/source survey; ACP/serve are the structured channels. Unknown-leaning-none.
5. Custom slash-command/prompt library directories (analogous to .claude/commands) — not found in survey; `quick_commands` (exec) exists. UNKNOWN.
6. Exact per-session file layout under `sessions/` (SQLite is authoritative; JSONL-shaped transcripts inside DB; legacy sessions.json) — fine-grained file-per-session layout UNKNOWN.
7. Windows native-home behaviors (LOCALAPPDATA\hermes) untested locally — code-read only. UNKNOWN (high confidence from source).
8. Keyring/OS-keychain credential support — not observed. UNKNOWN.
9. Star counts / community metrics from GitHub fetch (239.5k stars figure looked implausible — LLM-extracted; do not cite without re-verification). LOW confidence, EXCLUDED from facts.
