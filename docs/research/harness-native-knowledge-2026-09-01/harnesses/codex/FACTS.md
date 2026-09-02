# Harness Native Knowledge — OpenAI Codex CLI (`codex`)

- Research date: 2026-09-01
- Verified local version: **codex-cli 0.152.0** (npm global install)
- Source pinned: `openai/codex` tag `rust-v0.152.0` (commit 316795b, 2026-08-31), shallow-cloned into a temp dir for inspection
- Evidence file: `evidence.md` (same folder). Experiment transcripts: `../../experiments/codex.md`
- Sanitization: `<user-home>` = real home, `<temp-home>` = isolated temp probe dir, `<workspace>` = this repo, `<binary>` = the codex executable on PATH.

## Legend

- Source kinds: `OFFICIAL_DOC` (learn.chatgpt.com docs, redirects from developers.openai.com/codex) | `OFFICIAL_SOURCE` (openai/codex repo at rust-v0.152.0, repo-relative file:line) | `CLI_OBSERVED` (probes run locally on 2026-09-01 against 0.152.0) | `RELEASE_NOTE` | `PEER_PROJECT` | `INFERENCE`
- Every fact tag: `[kind; source; confidence H/M/L; stability STABLE/VERSION_SENSITIVE/UNKNOWN]`
- Tri-state rule: `supported` / `unsupported` / `unknown`. Unknown is never encoded as false.

---

## A. Identity & Distribution

- **A1.** Canonical harness id: `codex`. Display name: "Codex CLI". Version string format: `codex-cli 0.152.0`. [CLI_OBSERVED; `codex --version`; H; STABLE]
- **A2.** Vendor: OpenAI. Primary repo: https://github.com/openai/codex (Rust workspace under `codex-rs/`). Docs canonical host is `learn.chatgpt.com` (`developers.openai.com/codex` 308-redirects there, e.g. → `learn.chatgpt.com/docs/config-file/config-basic`). [CLI_OBSERVED + OFFICIAL_DOC; H; STABLE]
- **A3.** npm package: `@openai/codex`, `bin.codex = bin/codex.js` (Node wrapper launching a native binary), `engines.node >= 16`, license `Apache-2.0`. Repo package dir `codex-cli/package.json`. [OFFICIAL_SOURCE; H; STABLE]
- **A4.** License: Apache-2.0 (npm package.json `license` field; repo `LICENSE`). [OFFICIAL_SOURCE; H; STABLE]
- **A5.** Maintenance: very active. Tag `rust-v0.152.0` dated 2026-08-31; repo HEAD one day later (2026-09-01). Rapid-release cadence; many flags/features are explicitly `[experimental]`. [OFFICIAL_SOURCE; H; VERSION_SENSITIVE]
- **A6.** Aliases: `codex e` = `codex exec`; `codex a` = `codex apply`. Subcommand `codex` with no subcommand forwards options to the interactive TUI. [CLI_OBSERVED; H; VERSION_SENSITIVE]
- **A7.** Distribution channels: npm global (`@openai/codex`), Homebrew (docs/install.md mentions brew in README ecosystem historically — NOT re-verified this round), DotSlash file named `codex` on GitHub releases, build from source (cargo), plus "standalone" managed install layout under CODEX_HOME (`~/.codex` package dirs, see install-context crate). [OFFICIAL_SOURCE codex-rs/install-context/src/lib.rs:44-57, docs/install.md; H; STABLE]
- **A8.** In-repo `docs/*.md` are mostly 3-line pointer stubs to the external docs site; the source tree is the reliable ground truth for behavior. [OFFICIAL_SOURCE docs/config.md etc.; H; STABLE]

## B. Executable Discovery

- **B1.** Linux/macOS binary name: `codex` on PATH. Local install here: npm global bin dir (`<binary>` resolved via `command -v codex`). [CLI_OBSERVED; H; STABLE]
- **B2.** arg0 multi-dispatch: a single native binary serves several CLIs by argv[0] name — notably `codex-linux-sandbox` (direct-dispatches the Linux landlock+seccomp sandbox runner). Companions are NOT separate installed binaries; they are hard-links/aliases created under CODEX_HOME. At startup the CLI tries to create "PATH aliases" (helper binaries such as `codex-code-mode-host`, zsh helpers) and only warns if it fails ("WARNING: proceeding, even though we could not create PATH aliases"). It refuses to create helper binaries under a temp dir. [OFFICIAL_SOURCE codex-rs/arg0/src/lib.rs:185-215, 350; CLI_OBSERVED warnings; H; VERSION_SENSITIVE]
- **B3.** Version probe: `codex --version` (exit 0) → `codex-cli 0.152.0`. Note: even `--version` emits the PATH-aliases warning on stderr when CODEX_HOME is missing/temp; harmless. `codex app-server daemon version` prints CLI + running app-server versions as JSON. [CLI_OBSERVED; H; STABLE]
- **B4.** Windows story: official system requirements say "Windows 11 **via WSL2**" (docs/install.md). Native-Windows code exists in-tree (`windows-sandbox-rs` crate with ACL/ConPTY, `windowsSandbox/readiness` app-server method, `[windows]` profile config section, `powershell_shell_version` feature "under development"), i.e. native Windows sandbox is present but not the documented support target. Treat "native Windows" as experimental/unknown-stability. [OFFICIAL_SOURCE docs/install.md, codex-rs/windows-sandbox-rs/, app-server-protocol; H; VERSION_SENSITIVE]
- **B5.** macOS sandbox is Seatbelt (`CODEX_SEATBELT`... env var `CODEX_SANDBOX=seatbelt` observed in source); Linux uses Landlock+seccomp via `codex-linux-sandbox` helper (bwrap variant removed per feature flag `use_linux_sandbox_bwrap` removed). [OFFICIAL_SOURCE codex-rs/cli/src/debug_sandbox.rs:20-21, features list; M; VERSION_SENSITIVE]
- **B6.** `codex doctor` (and `--json`, redacted) diagnoses install/config/auth/runtime health — useful for harness probes. [CLI_OBSERVED help + OFFICIAL_SOURCE; H; VERSION_SENSITIVE]

## C. Launch Modes

### C.1 Interactive TUI (`codex [OPTIONS] [PROMPT]`)
- argv template: `codex [-m model] [-p profile] [-s sandbox] [-a on-request|never] [-C dir] [--add-dir DIR] [-i image]... [--search] [--no-alt-screen] [PROMPT]`. [CLI_OBSERVED; H; STABLE]
- Prompt transport: argv ([PROMPT]); stdin is not the TUI's prompt channel (exec reads stdin). cwd = process cwd; `-C/--cd` sets agent working root; `--add-dir` adds writable dirs. [CLI_OBSERVED; H; STABLE]
- Stdio: needs a TTY/pty (alt-screen by default; `--no-alt-screen` runs inline preserving scrollback). `--remote ws://|wss://|unix://` connects the TUI to a *remote* app-server endpoint, with `--remote-auth-token-env <ENV>` bearer token. [CLI_OBSERVED help; H; VERSION_SENSITIVE]
- Exit: user-quit; process exit does not equal "task complete" semantics. Network required (model API) unless `--oss`/`--local-provider lmstudio|ollama`. [CLI_OBSERVED + INFERENCE; H; STABLE]

### C.2 Headless exec (`codex exec`, alias `e`)
- argv: `codex exec [OPTIONS] [PROMPT]` with `-` meaning read prompt from stdin; if stdin is piped AND a prompt arg is given, stdin content is appended as a `<stdin>` block. [CLI_OBSERVED help; H; STABLE]
- Human output (default) and the banner (`OpenAI Codex v0.152.0`, workdir/model/provider/approval/sandbox/session id) go to **stderr** (`eprintln!` in `codex-rs/exec/src/event_processor_with_human_output.rs:218`); with `--json`, stdout becomes a pure JSONL event stream. Observed banner fields: `workdir`, `model: gpt-5.6-sol`, `provider: openai`, `approval: never`, `sandbox: read-only`, `session id: <uuid>`. [OFFICIAL_SOURCE + CLI_OBSERVED; H; STABLE]
- Native sandbox flags: `-s read-only|workspace-write|danger-full-access` (exec default read-only per docs); approvals: exec runs with `approval: never` by default (observed banner); `--approve-for-me` routes approvals through automatic workspace-write review; `--dangerously-bypass-approvals-and-sandbox`; `--full-auto` is a deprecated compatibility alias (docs). [CLI_OBSERVED + OFFICIAL_DOC; H; STABLE]
- Structured output: `--output-schema <FILE>` (JSON Schema for final response) + `-o/--output-last-message <FILE>` (writes final agent message; also still prints). [OFFICIAL_DOC learn.chatgpt.com/codex/non-interactive-mode; H; STABLE]
- Other exec flags: `--ephemeral` (no session files persisted), `--ignore-user-config` (skip CODEX_HOME/config.toml; auth still uses CODEX_HOME), `--ignore-rules` (skip user/project execpolicy .rules), `--skip-git-repo-check`, `--color always|never|auto`, `--thread-source <SOURCE>`. [CLI_OBSERVED; H; STABLE]
- Git requirement: outside a git repo exec errors "Not inside a trusted directory and --skip-git-repo-check was not specified." [OFFICIAL_SOURCE codex-rs/exec/src/lib.rs:807; H; STABLE]
- Exit semantics: process exit == task finished. Exit 0 on success. Observed: with no credentials, exec attempts the model WebSocket (`wss://api.openai.com/v1/responses`), retries 5x on 401, then exits **101** (Rust panic-style). [CLI_OBSERVED; M; VERSION_SENSITIVE]
- Network: required by default; transport to OpenAI is a **WebSocket** endpoint `wss://api.openai.com/v1/responses` (observed 401 handshake) — not plain HTTPS chat completions. [CLI_OBSERVED; H; VERSION_SENSITIVE]
- Default model in 0.152.0 banner: `gpt-5.6-sol`, provider `openai`. [CLI_OBSERVED; H; VERSION_SENSITIVE]

### C.3 Headless resume/fork
- `codex exec resume [SESSION_ID] [--last] [PROMPT]` (PROMPT may be `-` for stdin); `codex exec fork <SESSION_ID> [PROMPT]`. Both support the full exec output flag set (`--json`, `-o`, `--output-schema`, `--ephemeral`, ...). [CLI_OBSERVED; H; STABLE]

### C.4 Interactive resume/fork
- `codex resume [SESSION_ID|--last] [PROMPT]` — picker defaults, `--all` disables cwd filtering, `--include-non-interactive` shows exec sessions too; `codex fork [SESSION_ID|--last]`. Also `archive/delete/unarchive <id|name>`, `migrate-rollouts` (legacy→paginated thread history). [CLI_OBSERVED; H; STABLE]

### C.5 App server (`codex app-server`) — the programmatic harness surface
- JSON-RPC 2.0 (wire omits the `"jsonrpc":"2.0"` header), newline-delimited JSON over **stdio** by default (`--listen stdio://|unix://|unix://PATH|ws://IP:PORT|off`). WebSocket/unix transports are experimental, with capability-token / signed-JWT auth flags (`--ws-token-file`, `--ws-shared-secret-file`, ...). Handshake: `initialize` (clientInfo) then `initialized` notification; earlier requests get "Not initialized". [OFFICIAL_DOC learn.chatgpt.com/docs/app-server + CLI_OBSERVED help; H; STABLE]
- Schemas: `codex app-server generate-ts` / `generate-json-schema` emit version-locked schema artifacts. [CLI_OBSERVED help + OFFICIAL_DOC; H; VERSION_SENSITIVE]
- Daemon: `codex app-server daemon start|stop|restart|version|bootstrap` — a per-user singleton daemon ("shared local app-server daemon"); `codex app-server proxy` proxies stdio bytes to the running daemon's control socket. `codex agents` browses sessions on the shared daemon. [CLI_OBSERVED help; H; VERSION_SENSITIVE]
- Method surface observed in protocol source (selection): `thread/start`, `thread/resume`, `thread/fork`, `thread/read|list|archive|delete|unarchive|rollback|search`, `turn/start`, `turn/steer`, `turn/interrupt`, `turn/completed`, `item/started|completed`, `item/agentMessage/delta`, `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `account/read|logout|usage/read`, `model/list`, `config/read`, `config/batchWrite`, `skills/list`, `hooks/list`, `mcpServerStatus/list`, `plugin/install|list|uninstall`, `fs/readFile|writeFile|watch|...`, `process/spawn|writeStdin|kill` (experimentalApi-gated), `review/start`, `remoteControl/enable|disable`, `windowsSandbox/readiness`. [OFFICIAL_SOURCE app-server-protocol/src/protocol/*.rs; H; VERSION_SENSITIVE]
- Approvals are server-initiated JSON-RPC *requests* the client must answer; every flow ends with a `serverRequest/resolved` notification. Some methods need the `experimentalApi` capability in `initialize`. [OFFICIAL_DOC app-server; H; STABLE]

### C.6 MCP server mode (`codex mcp-server`)
- `codex mcp-server` runs Codex **as an MCP server over stdio** (methods for driving Codex from any MCP client). Docs flag this page as deprecated in favor of app-server. [CLI_OBSERVED help + OFFICIAL_DOC; H; VERSION_SENSITIVE]

### C.7 Review mode
- `codex review [PROMPT] --uncommitted|--base <BRANCH>|--commit <SHA>` — non-interactive code review producing a diff-based report. [CLI_OBSERVED; H; STABLE]

### C.8 Sandbox utility
- `codex sandbox [COMMAND]...` runs an arbitrary command inside the Codex-provided sandbox (landlock/seccomp on Linux; `--sandbox-state-json`, `-P/--permission-profile <NAME>`). `codex debug sandbox`-style probes also exist (`codex debug` models|app-server). [CLI_OBSERVED; H; VERSION_SENSITIVE]

### C.9 Other subcommands (management)
- `login` (browser OAuth / `--with-api-key` / `--with-access-token` / `--device-auth`), `logout`, `login status` (exit 1 + "Not logged in" without credentials), `mcp list|get|add|remove|login|logout`, `plugin add|list|remove|marketplace`, `features list|enable|disable`, `doctor`, `queue --thread <ID> --message <TEXT>` (queue a message into a live session), `cloud exec|status|list|apply|diff` (Codex Cloud), `exec-server` (standalone websocket exec environment), `remote-control start|stop|pair` (pairing codes), `apply <TASK_ID>`, `completion`, `update`. [CLI_OBSERVED; H; VERSION_SENSITIVE]

## D. Profile & Configuration

- **D1.** Home dir: `CODEX_HOME` env var overrides; default `~/.codex` (`$HOME/.codex`). If `CODEX_HOME` is set it **must already exist** and be a directory (canonicalized); missing path is a hard error ("CODEX_HOME points to ... but that path does not exist"; observed exit 1). When unset, the default path is not verified. [OFFICIAL_SOURCE codex-rs/utils/home-dir/src/lib.rs:13-63; CLI_OBSERVED; H; STABLE]
- **D2.** Main file: `CODEX_HOME/config.toml` (TOML). [OFFICIAL_SOURCE codex-rs/config/src/lib.rs:40; H; STABLE]
- **D3.** Config **layers** with precedence (low→high, from `ConfigLayerSource::precedence()`): packaged defaults (-10) → MDM (0) → system file (`/etc/codex/config.toml` on Unix per docs) (10) → enterprise-managed bundle (15) → user `config.toml` (20) → user + selected profile (21) → project `<repo>/.codex/config.toml` (25; loaded only for trusted projects, ordered root→cwd, closest wins) → session flags `-c`/`--enable`/`--disable` (30) → legacy `managed_config.toml` file (40) / MDM (50). [OFFICIAL_SOURCE codex-rs/config/src/config_layer_source.rs:11-56; OFFICIAL_DOC config-basic; H; STABLE]
- **D4.** Profiles (v2): `-p/--profile <NAME>` layers `$CODEX_HOME/<NAME>.config.toml` **on top of** the base user config — separate file per profile, not a `[profiles.*]` table inside config.toml (the old `[profiles]` scheme is gone from help text). Profile TOML fields include model/provider/approval/sandbox-ish keys, `features`, `tui`, `windows`, `oss_provider`, `analytics`. [CLI_OBSERVED help + OFFICIAL_SOURCE codex-rs/config/src/profile_toml.rs + OFFICIAL_DOC config-basic; H; VERSION_SENSITIVE]
- **D5.** `-c key=value` dotted-path overrides; value parsed as TOML, falling back to raw string. `--strict-config` errors on unrecognized config keys. `--enable/--disable <FEATURE>` == `-c features.<name>=true|false`. [CLI_OBSERVED; H; STABLE]
- **D6.** Key config fields (verified in config structs/docs): `model`, `model_provider` (key into `model_providers` map), `model_providers.<id>.{name,base_url,env_key,wire_api="responses",http_headers,env_http_headers,request_max_retries=4,stream_max_retries=5,auth.command|args|timeout_ms}` (built-in ids `openai`,`ollama`,`lmstudio` reserved), `approval_policy`, `sandbox_mode`, `model_reasoning_effort`, `personality`, `web_search`, `shell_environment_policy`, `notify`, `history`, `features`, `mcp_servers`, `project_doc_max_bytes` (default 32 KiB), `project_doc_fallback_filenames`, `project_root_markers`, `cli_auth_credentials_store`, `forced_login_method`, `chatgpt_base_url`, `log_dir`. [OFFICIAL_SOURCE codex-rs/core/src/config/mod.rs:325-1060 + OFFICIAL_DOC config-reference; H; STABLE]
- **D7.** Write behavior: `codex features enable/disable` and `codex plugin add/remove` **rewrite config.toml** (dedicated edit modules). Config-layer diagnostics: `codex doctor` shows per-layer provenance. Project layer trust is required before project `.codex/config.toml` loads. [OFFICIAL_SOURCE codex-rs/config/src/plugin_edit.rs, cli features cmd; OFFICIAL_DOC; H; VERSION_SENSITIVE]
- **D8.** Startup `.env`: the binary loads `.env` values from `~/.codex/.env` before threading (arg0 dispatch). [OFFICIAL_SOURCE codex-rs/arg0/src/lib.rs doc-comment (~line 205); M; STABLE]
- **D9.** Isolation note: `--ignore-user-config` skips config.toml but still authenticates from CODEX_HOME — i.e., config isolation and credential isolation are separately addressable. [CLI_OBSERVED help; H; STABLE]
- **D10.** Concurrent writers: config.toml is rewritten whole-file by CLI edit commands (no lock observed in code read); SQLite state uses WAL (observed -shm/-wal files) with `thread-writer-locks/` directory for per-thread write locks. Treat concurrent external edits to config.toml as last-writer-wins. [OFFICIAL_SOURCE + CLI_OBSERVED ls; M; UNKNOWN]

## E. Credentials

- **E1.** Credential file: `CODEX_HOME/auth.json` (plaintext; docs warn "treat it like a password: it contains access tokens"). **Contents never read in this research** (name/mtime only). [OFFICIAL_SOURCE codex-rs/login/src/auth/storage.rs:39,155 + OFFICIAL_DOC auth; H; STABLE]
- **E2.** Keyring: credentials may live in the OS keychain (`codex-keyring-store` crate; keyring-first with fallback to auth.json on load/save failure). Config: `cli_auth_credentials_store = file|keyring|auto` (auto falls back to file). MCP OAuth tokens have their own `mcp_oauth_credentials_store`. [OFFICIAL_SOURCE storage.rs:265-455 + OFFICIAL_DOC config-reference; H; STABLE]
- **E3.** API-key auth: `codex login --with-api-key` reads the key **from stdin** (`printenv OPENAI_API_KEY | codex login --with-api-key`). Env vars referenced by the CLI: `OPENAI_API_KEY` (const OPENAI_API_KEY_ENV_VAR, manager.rs:910) and `CODEX_API_KEY` (CODEX_API_KEY_ENV_VAR, manager.rs:911; doctor checks either). Note: docs describe `env_key` per model_provider as the general provider API-key mechanism. [OFFICIAL_SOURCE + OFFICIAL_DOC auth; H; STABLE]
- **E4.** ChatGPT OAuth (subscription) auth: `codex login` browser flow, local callback server default `localhost:1455`, tokens auto-refreshed; `auth.json` holds OAuth tokens. Headless options: `codex login --device-auth` (beta device code), `codex login --with-access-token` reading `CODEX_ACCESS_TOKEN` from stdin (enterprise; token classified as personal-access-token `at-` prefix or agent-identity JWT). `codex logout` removes stored credentials (keyring and file). `forced_login_method = chatgpt|api` (enterprise enforcement). [OFFICIAL_SOURCE + OFFICIAL_DOC auth; H; STABLE]
- **E5.** `codex login status` — prints login state without touching tokens (observed exit 1 "Not logged in" against empty CODEX_HOME). Safe probe. [CLI_OBSERVED; H; STABLE]
- **E6.** Isolation feasibility: copying CODEX_HOME copies credentials (auth.json is inside it). For a credential-free isolated home, create an empty CODEX_HOME and supply keys via env/provider `env_key` — no login needed (exec with empty home + no env fails with 401 after retries). Never project keyring state. [CLI_OBSERVED + OFFICIAL_SOURCE; H; STABLE]
- **E7.** Provider creds are NOT in profiles: no credential-material fields exist in ProfileToml; provider keys come from `env_key` env vars or auth.json/keyring. [OFFICIAL_SOURCE profile_toml.rs + config-reference; H; STABLE]
- **E8.** Amazon Bedrock support exists (aws-auth crate; bedrock API key persisted in auth.json; `requires_openai_auth=false` provider flows). [OFFICIAL_SOURCE codex-rs/login/src/auth/bedrock_api_key.rs, cli/tests/login.rs:110-113; M; VERSION_SENSITIVE]

## F. State Isolation

Classify CODEX_HOME contents (observed names only in real home; structure from source):

- **F1. Account/credential state — NEVER share, never project:** `auth.json`, keyring entries, `.env` (may hold secrets), `installation_id`, `version.json` (benign but per-install). [OFFICIAL_SOURCE + CLI_OBSERVED; H; STABLE]
- **F2. Profile-store state (safe to materialize/read-only-share):** `config.toml`, per-profile `<name>.config.toml`, `AGENTS.md`/`AGENTS.override.md` (global instructions), `rules/*.rules` (execpolicy), `skills/` (user skills; deprecated location), `memories/` user content. [CLI_OBSERVED ls + OFFICIAL_SOURCE; H; STABLE]
- **F3. Session state (local writable overlay / copy-on-write):** `sessions/YYYY/MM/DD/rollout-<timestamp>-<thread_id>.jsonl` (observed real layout), `archived_sessions/`, `session_index.jsonl`, `history.jsonl` (message history; one JSON object per line), sqlite stores `state_5.sqlite`, `thread_history_1.sqlite` (paginated thread history), `queue_1.sqlite`, `goals_1.sqlite`, `logs_2.sqlite`, `shell_snapshots/`. [CLI_OBSERVED find + OFFICIAL_SOURCE rollout/src/lib.rs:68-69, message-history/src/lib.rs:3,52; H; STABLE]
- **F4. Cache (self-healing, safe to drop):** `models_cache.json` (model catalog), `skills/.system/` (embedded system skills installed with fingerprint marker; recreated when stale), `plugins/cache/`, `cache/` (remote plugin catalog, apps info), `log/`, `tmp/`, `.tmp/`. [OFFICIAL_SOURCE skills/src/lib.rs:58-107 + CLI_OBSERVED ls; H; STABLE]
- **F5. Concurrency:** multiple sessions run concurrently (JSONL rollouts + WAL sqlite + `thread-writer-locks/`); the app-server daemon is a **per-user singleton** (start-if-not-running; proxy attaches; `codex agents` browses "the shared local app-server daemon"). Do not run two daemons for one user. [OFFICIAL_SOURCE app-server-daemon + CLI_OBSERVED help; H; VERSION_SENSITIVE]
- **F6. Empty-CODEX_HOME behavior:** pre-create the dir; read-only commands (`features list`, `mcp list`, `login status`) create **nothing** inside it (observed no-diff); exec/runtime will populate sessions/ etc. `--ephemeral` skips session persistence entirely. [CLI_OBSERVED; H; STABLE]

## G. Native Resource Surfaces

| Surface | State | Details (discovery/format/precedence) |
|---|---|---|
| **instructions (AGENTS.md)** | supported | Global: `$CODEX_HOME/AGENTS.override.md` else `$CODEX_HOME/AGENTS.md` (first non-empty wins) [OFFICIAL_SOURCE codex-home/src/instructions/mod.rs:9-60]. Project: per-directory `AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames`, from project root (markers via `project_root_markers`, default git-root-like) down to cwd, **one file per directory**, concatenated root→cwd (later = nearer cwd = later in prompt); stops at `project_doc_max_bytes` (default 32 KiB). Read-only OK. [OFFICIAL_SOURCE core/src/agents_md.rs:39-270 + OFFICIAL_DOC agents-md; H; STABLE] |
| **skills** | supported | Roots (order): project config layer `$PROJECT/.codex/skills` (Repo); user `$CODEX_HOME/skills` (**deprecated**, kept for backward compat) and `$HOME/.agents/skills` (User); `$CODEX_HOME/skills/.system` (System — installed from embedded assets, marker-fingerprinted); admin `/etc/codex/skills` (System config layer); plugin skill roots; extra roots; repo roots `$ROOT/.agents/skills` for every dir from project root→cwd. Format: `SKILL.md` with YAML frontmatter (`name`, `description` required). Symlinked skill dirs followed. Discovery mode Recursive (default) / DirectChildren. Name collision: no merge — both appear in selectors. Disable without delete via `[[skills.config]] path=... enabled=false`. Invocation via `$skill-name` mentions (app-server `turn/start` accepts a `skill` input item). Feature flags: `skill_search` stable+on, `skill_mcp_dependency_install` stable+on. Read-only OK. [OFFICIAL_SOURCE codex-rs/ext/skills/src/host_roots.rs:28-180, skills/src/lib.rs:55-107 + OFFICIAL_DOC build-skills; H; VERSION_SENSITIVE] |
| **MCP servers** | supported | Config `[mcp_servers.<id>]` in any config layer: stdio `command`+`args`+`env` or streamable-HTTP `url` (+`bearer_token_env_var`); keys `enabled`, `required` (exec fails if a required server fails init), `startup_timeout_sec` (default 10), `tool_timeout_sec` (default 60), `enabled_tools`/`disabled_tools`, `default_tools_approval_mode`, `scopes`, `oauth{client_id,registration,resource}`, `supports_parallel_tool_calls`. CLI: `codex mcp add <name> (--url URL | -- CMD...) [--env K=V]`, `codex mcp login <name>` (per-server OAuth). MCP OAuth elicitation supported in app-server. Read-only config OK; OAuth needs writable store. [OFFICIAL_SOURCE config/src/mcp_types.rs:197-260 + CLI_OBSERVED mcp add help + OFFICIAL_DOC config-reference; H; STABLE] |
| **prompts (custom slash commands)** | unsupported-as-standalone-dir (0.152.0) | No `~/.codex/prompts` loader exists in 0.152.0 source (no `"prompts"` dir join anywhere; only an internal TUI `CustomPromptView` for review prompts). Plugin `commands/` dirs are **migrated into skills** at plugin install time (`migrated-command-skills/`, ≤4000 bytes each, frontmatter-required). If the harness needs prompt-commands, model them as skills. [OFFICIAL_SOURCE core-plugins/src/command_migration/plugin.rs:14-38, utils/plugins/src/lib.rs:45-51; M; VERSION_SENSITIVE] |
| **rules (execpolicy)** | supported | `*.rules` execpolicy files: user `CODEX_HOME/rules/default.rules` (+ project `.rules` files; `--ignore-rules` skips "user or project execpolicy `.rules` files"). Rule format TOML-ish prefix allow/deny (see docs/execpolicy.md pointer; `codex execpolicy check -r <rules> ...`). Approval interplay: rule-required approval with `AskForApproval=Never` is rejected. Read-only OK. [OFFICIAL_SOURCE core/src/exec_policy.rs:55-70, core/src/config; M; VERSION_SENSITIVE] |
| **hooks** | supported | Feature `hooks` = stable + enabled by default. Config: `hooks` key in config files (and hooks JSON files); 12 event names: PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop, Stop, Interrupt (matchers meaningful for 9). Hook trust is persisted per handler (`--dangerously-bypass-hook-trust` skips). Enterprise `requirements.toml` may set `allow_managed_hooks_only = true`. app-server exposes `hooks/list`, `hook/started`, `hook/completed`. Writable needed for trust persistence. [OFFICIAL_SOURCE codex-rs/hooks/src/lib.rs:22-50, docs/config.md:10-15; H; VERSION_SENSITIVE] |
| **plugins** | supported | Feature `plugins`/`plugin_sharing` = stable+on. Distribution via marketplaces (`codex plugin marketplace add/list/upgrade/remove`; cache under `CODEX_HOME/plugins/`, `.remote-plugin-install-staging/`, `cache/remote_plugin_catalog`). Plugin manifest: `plugin.json` at plugin root (universal ChatGPT+Codex plugin format); metadata dir `.codex-plugin/`. Plugins bundle skills + MCP connectors; app-server methods `plugin/install|list|uninstall|read|search`. "Skills are the authoring format; plugins are the distribution mechanism." [OFFICIAL_SOURCE utils/plugins/src/plugin_namespace.rs:11, CLI_OBSERVED plugin help + OFFICIAL_DOC build-skills; H; VERSION_SENSITIVE] |
| **subagents (collab)** | supported (feature-gated, not a file surface) | Feature `multi_agent` = stable+on (`multi_agent_v2` off). Native "collab tool calls" appear as `collab_tool_call` thread items; hook events SubagentStart/SubagentStop exist. No user-facing subagents directory found. Treat orchestration as protocol/feature, not a resource dir. [OFFICIAL_SOURCE exec_events.rs:96-99, features list; M; VERSION_SENSITIVE] |
| **memory** | supported (flag OFF by default) | Feature `memories` = stable but **default false**. Storage observed: `CODEX_HOME/memories/` dir + `memories_1.sqlite` (+WAL). app-server `memory/reset`. Enable via `--enable memories` / `[features] memories=true`. [CLI_OBSERVED features list + ls; H; VERSION_SENSITIVE] |
| **notify** | supported | `notify = ["cmd", args...]` in config: on turn completion Codex runs the command appending a JSON payload as the last argv arg: `{"type":"agent-turn-complete","thread-id":...,"turn-id":...,"cwd":...,"input-messages":[...],"last-assistant-message":...}` (kebab-case). Now implemented as a legacy hook (hook event AfterAgent). [OFFICIAL_SOURCE hooks/src/legacy_notify.rs:16-45, core/src/config/mod.rs:724-734; H; STABLE] |
| **history** | supported | `CODEX_HOME/history.jsonl`, one JSON object per line; `[history]` config governs persistence (and `--ephemeral`/TUI Ctrl-U semantics per docs). [OFFICIAL_SOURCE message-history/src/lib.rs:3,52; H; STABLE] |
| **web search** | supported (flag) | `--search` enables native Responses `web_search` tool for a run; feature `web_search_request` deprecated, `standalone_web_search` under development. [CLI_OBSERVED help + features; M; VERSION_SENSITIVE] |
| **commands** | migrated | See prompts row: plugin `commands/` → skills migration at install. [OFFICIAL_SOURCE; M; VERSION_SENSITIVE] |
| **projects/workspaces** | supported (app-server) | `project/list|read|create|update|delete|move|import`, `project/changed` — app-server-level project registry, not a config-file surface. [OFFICIAL_SOURCE protocol; M; VERSION_SENSITIVE] |

Precedence summary for overlapping instruction-ish surfaces: system prompt < global AGENTS.md < project AGENTS.md chain (root→cwd) < skills referenced per turn. Skills do not merge on name collision. Config layers: project > profile > user; session `-c` overrides all non-legacy layers.

## H. Events & Observation (`codex exec --json`)

- **H1.** Envelope: JSONL on stdout; every event has `"type"` (serde tag). Event types (codex-rs/exec/src/exec_events.rs:11-42): `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.started`, `item.updated`, `item.completed`, `error`. [OFFICIAL_SOURCE; H; STABLE]
- **H2.** Payloads: `thread.started {thread_id}` (UUID — use for `exec resume`); `turn.completed {usage:{input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_output_tokens}}`; `turn.failed {error:{message}}`; `error {message}` (unrecoverable stream error). [OFFICIAL_SOURCE exec_events.rs:50-93; H; STABLE]
- **H3.** Thread items (snake_case `type` inside `item`, flattened next to `id`): `agent_message {text}` (JSON string text when `--output-schema` used), `reasoning`, `command_execution` (starts at spawn, completes with exit code), `file_change` (emitted only as completed), `mcp_tool_call`, `collab_tool_call`, `web_search`, `todo_list`, `error` (non-fatal). [OFFICIAL_SOURCE exec_events.rs:96-140; H; STABLE]
- **H4.** Human (non-JSON) mode: banner + per-item lines to stderr; final agent message also printed. `-o/--output-last-message FILE` always captures the final message. [OFFICIAL_SOURCE event_processor_with_human_output.rs:218 + OFFICIAL_DOC; H; STABLE]
- **H5.** Completion marker: for a successful exec run the last event is `turn.completed` (per-turn), and process exit 0 means the whole task ended; there is no separate "session ended" event in exec --json. [OFFICIAL_SOURCE + INFERENCE; M; STABLE]
- **H6.** Errors/warnings: fatal errors arrive as `error` events and/or stderr + nonzero exit (observed 101 on connection failure; `turn.failed` for turn-level errors). exec stderr also carries eprintln diagnostics (config errors, "Reading additional input from stdin..."). [OFFICIAL_SOURCE exec/src/lib.rs:307-2061 + CLI_OBSERVED; H; STABLE]
- **H7.** Cancellation: not expressible from outside an exec run (no signal-steer path documented); use app-server `turn/interrupt` for cancellable turns (ends with status "interrupted"). [OFFICIAL_DOC app-server; M; STABLE]
- **H8.** Unknown-event tolerance: unverified. The exec event enum is a closed serde-tagged enum (unknown type likely fails deserialization for strict consumers), but the harness SDKs are the compatibility contract — treat as unknown, not false. [INFERENCE from serde; L; UNKNOWN]
- **H9.** Session log consistency: every exec run writes a rollout JSONL under `CODEX_HOME/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread_id>.jsonl` (unless `--ephemeral`) plus sqlite thread-history entries; the `thread_id` in `thread.started` is the resume handle and the rollout filename suffix. Observed real-home filenames match exactly this pattern. [CLI_OBSERVED + OFFICIAL_SOURCE rollout/src/rollout_file_name.rs:51-69; H; STABLE]

## I. Runtime Control

- **I1.** Interactive steering: `codex queue --thread <UUID|name> --message <TEXT>` queues a message into an existing (running) session; TUI `--remote ws://...` attaches to a remote app-server. [CLI_OBSERVED help; M; VERSION_SENSITIVE]
- **I2.** Protocol steering (app-server): `turn/steer` appends input mid-turn (requires matching `expectedTurnId`); `turn/interrupt` cancels (turn ends `status:"interrupted"`); approvals answered via server-initiated requests with decisions `accept|acceptForSession|decline|cancel` (+`acceptWithExecpolicyAmendment` for commands; permissions grants accept a subset with `scope:"session"|"turn"`). [OFFICIAL_DOC app-server; H; STABLE]
- **I3.** Model switch/effort: `-m/--model` per invocation; thread-level model via `thread/start` params (`cwd`, `approvalPolicy`, `sandbox`, `personality`); `model_reasoning_effort` config; `step_model_switching` feature under development (mid-turn switch not generally available). [CLI_OBSERVED + OFFICIAL_SOURCE features; M; VERSION_SENSITIVE]
- **I4.** Attach/resume: `exec resume`/`resume`/`fork` from rollout files; app-server `thread/resume`, `thread/fork`, `thread/rollback`; daemon proxy (`codex app-server proxy`) attaches to the running singleton. [CLI_OBSERVED + OFFICIAL_DOC; H; STABLE]
- **I5.** No attach for plain `codex exec`: the run is one-shot; a second exec process cannot join it. [INFERENCE from design + docs; M; STABLE]

## J. Agent-Box Owner Mapping

| Fact cluster | Owner |
|---|---|
| Identity/version/distribution (A) | harness-registry-declaration |
| Executable discovery + arg0 companions + doctor (B) | harness-native-adapter |
| Launch modes C.1/C.2/C.3/C.4/C.7 (argv TUI/exec/resume/review) | harness-native-adapter |
| Launch mode C.5 app-server JSON-RPC, daemon singleton, proxy | runtime-host-protocol |
| Launch mode C.6 `codex mcp-server` (Codex AS MCP server) | runtime-host-protocol — AUTHORITY_CONFLICT with sandbox-protocol (it exposes Codex tools to another agent host) |
| Config layers/profiles/config.toml materialization (D) | profile-store/native-payload — AUTHORITY_CONFLICT with harness-native-adapter (Codex-native layering has precedence semantics a projector must not flatten) |
| `-c`/`--enable`/`--strict-config` session overrides | profile-store/native-payload |
| Credentials E (auth.json/keyring/env keys/login flows) | credential-materializer |
| State isolation F (CODEX_HOME copy-on-write, sessions, caches) | profile-store/native-payload — AUTHORITY_CONFLICT with host-control (daemon singleton lifecycle) |
| AGENTS.md / skills / rules / hooks / plugins / memory / notify (G) | resource-projector |
| exec `--json` ThreadEvent envelope (H) | observation-envelope-candidate |
| exec stderr banner/human output split (H4) | terminal-session-protocol |
| Sandbox flags `-s`, approval policies, `codex sandbox` (C.2/C.8) | sandbox-protocol |
| Runtime control I (steer/interrupt/approvals/attach) | host-control — AUTHORITY_CONFLICT with runtime-host-protocol (app-server owns the wire methods) |
| Rollout/session JSONL + thread_history sqlite (F3/H9) | observation-envelope-candidate — AUTHORITY_CONFLICT with profile-store/native-payload (session state ownership) |
| npm/npm-global install layout (A3/B1) | not-agent-box (environment concern), harness-registry-declaration records it |

## UNRESOLVED (goes to candidate.toml [unresolved] too)

1. Exact exit-code table for `codex exec` beyond 0 (success) and observed 101 (connection failure): whether turn-failure → 1, policy denial → distinct code. NOT_LOCALLY_OBSERVED.
2. Whether `exec --json` tolerates unknown event types (closed serde enum vs skip). Source suggests strict; SDK contract unverified.
3. `[profiles]` legacy table compatibility in config.toml (docs describe file-per-profile; old format acceptance unknown).
4. Native-Windows sandbox GA status (WSL2 is the documented requirement; in-tree Windows sandbox exists behind readiness plumbing).
5. Whether `notify` fires in exec mode or only interactive/hook-enabled contexts.
6. Memory feature storage schema (`memories_1.sqlite`) — not inspected (read-only rules; no contents).
7. System config path on macOS (`/etc/codex/config.toml` documented for Unix; macOS-specific managed paths unverified).
