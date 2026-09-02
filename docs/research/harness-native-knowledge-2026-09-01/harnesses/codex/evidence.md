# Evidence — OpenAI Codex CLI (`codex`) — observed 2026-09-01

- CLI: codex-cli 0.152.0, npm global install (`command -v codex` → `<binary>`).
- Source: `openai/codex` tag `rust-v0.152.0` (commit 316795b3cf2a45e90d121d9f46499d4658b2645c, 2026-08-31), shallow clone into a temp dir (path sanitized). All repo citations are repo-relative to that tag.
- Docs: learn.chatgpt.com (official; `developers.openai.com/codex/*` 308-redirects there).
- No model/API calls were made. One unauthenticated 401 handshake occurred once (probe 4) — no tokens, no prompt reached a model, no cost; not repeated. No credential file contents read; real `~/.codex` accessed by name/mtime listing only.

---

## 1. CLI transcripts (CLI_OBSERVED)

### 1.1 version + discovery
```
$ command -v codex
<binary>
$ codex --version
codex-cli 0.152.0        # exit 0
```

### 1.2 `codex --help` (abridged; full text retained in experiments note)
```
Codex CLI
If no subcommand is specified, options will be forwarded to the interactive CLI.
Usage: codex [OPTIONS] [PROMPT]
       codex [OPTIONS] <COMMAND> [ARGS]

Commands:
  agents            Browse all agent sessions on the shared local app-server daemon
  exec              Run Codex non-interactively [aliases: e]
  review            Run a code review non-interactively
  login / logout    Manage login / Remove stored authentication credentials
  mcp               Manage external MCP servers for Codex
  plugin            Manage Codex plugins
  mcp-server        Start Codex as an MCP server (stdio)
  app-server        [experimental] Run the app server or related tooling
  remote-control    [experimental] Manage the app-server daemon with remote control enabled
  completion / update / doctor / sandbox / debug
  apply [aliases: a] / resume / queue / archive / delete / migrate-rollouts / unarchive
  fork / cloud [EXPERIMENTAL] / exec-server [EXPERIMENTAL] / features

Options (selection):
  -c, --config <key=value>   dotted path; value parsed as TOML, else raw string
  --enable/--disable <FEATURE>   == -c features.<name>=true|false
  --remote <ADDR>            ws://host:port | wss:// | unix:// | unix://PATH (TUI to remote app-server)
  --remote-auth-token-env <ENV_VAR>
  --strict-config            error on unrecognized config.toml fields
  -i, --image <FILE>...      -m, --model <MODEL>    --oss   --local-provider <lmstudio|ollama>
  -p, --profile <CONFIG_PROFILE_V2>   Layer $CODEX_HOME/<name>.config.toml on top of the base user config
  -s, --sandbox <read-only|workspace-write|danger-full-access>
  --approve-for-me           route approvals through automatic review (workspace-write sandbox)
  --dangerously-bypass-approvals-and-sandbox
  --dangerously-bypass-hook-trust
  -C, --cd <DIR>             --add-dir <DIR>
  -a, --ask-for-approval <on-request|never>
  --search                   native Responses web_search tool
  --no-alt-screen            inline TUI, keeps scrollback
```

### 1.3 `codex exec --help` (abridged to exec-specific flags)
```
Run Codex non-interactively
Usage: codex exec [OPTIONS] [PROMPT]
Commands: resume | fork | review | help
Arguments: [PROMPT] — if not provided (or `-`), read from stdin; piped stdin appended as `<stdin>` block
Options (beyond shared set above):
  --thread-source <SOURCE>
  --skip-git-repo-check
  --ephemeral                run without persisting session files to disk
  --ignore-user-config       do not load $CODEX_HOME/config.toml; auth still uses CODEX_HOME
  --ignore-rules             do not load user or project execpolicy .rules files
  --output-schema <FILE>     JSON Schema for the model's final response shape
  --color <always|never|auto>
  --json                     Print events to stdout as JSONL
  -o, --output-last-message <FILE>
```

### 1.4 resume / fork family (observed)
```
codex resume [OPTIONS] [SESSION_ID] [PROMPT]   # UUID or session name; --last; --all; --include-non-interactive
codex fork  [OPTIONS] [SESSION_ID] [PROMPT]    # picker by default; --last; --all
codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]   # --last; --all; full exec output flag set
codex exec fork <SESSION_ID> [PROMPT]
```

### 1.5 app-server (observed)
```
codex app-server [OPTIONS] [COMMAND]
Commands: daemon (bootstrap|start|restart|enable-remote-control|disable-remote-control|stop|version)
          proxy (proxy stdio bytes to the running app-server control socket)
          generate-ts | generate-json-schema
Options: --listen <stdio://|unix://|unix://PATH|ws://IP:PORT|off> (default stdio://)
         --stdio; --code-mode-host <URL>
         --ws-auth <capability-token|signed-bearer-token>; --ws-token-file; --ws-token-sha256;
         --ws-shared-secret-file; --ws-issuer; --ws-audience; --ws-max-clock-skew-seconds
         --analytics-default-enabled
```

### 1.6 mcp / login / plugin / features (observed)
```
codex mcp list|get|add|remove|login|logout
  codex mcp add <NAME> (--url <URL> | -- <COMMAND>...)
      [--env KEY=VALUE] [--bearer-token-env-var <ENV_VAR>]
      [--oauth-client-id <ID>] [--oauth-client-registration <auto|cimd|dcr>] [--oauth-resource <R>]
  codex mcp login <NAME> [--scopes ...]
codex login [--with-api-key | --with-access-token | --device-auth] ; codex login status
codex plugin add|list|remove ; codex plugin marketplace add|list|upgrade|remove
codex features list|enable|disable
codex doctor [--json (redacted) | --summary | --all]
codex sandbox [COMMAND]... [--sandbox-state-json <JSON>] [-P --permission-profile <NAME>]
codex review [PROMPT] [--uncommitted | --base <BRANCH> | --commit <SHA>]
codex queue --thread <THREAD> --message <TEXT>
codex migrate-rollouts [--apply] [--json] [--thread <ID>]...
```

### 1.7 `codex features list` (0.152.0, selected rows — full list captured in experiment log)
```
apps                       stable            true
auth_elicitation           stable            true
browser_use                stable            true
code_mode_host             stable            true
hooks                      stable            true
memories                   stable            false
multi_agent                stable            true
multi_agent_v2             stable            false
personality                stable            true
plugins                    stable            true
plugin_sharing             stable            true
skill_search               stable            true
skill_mcp_dependency_install stable          true
unified_exec               stable            true
web_search_request         deprecated        false
use_legacy_landlock        deprecated        false
elevated_windows_sandbox   removed           false
experimental_windows_sandbox removed         false
```

## 2. Isolated temp-HOME probes (CLI_OBSERVED)

Probe setup: `mktemp -d` → `<temp-home>`; `CODEX_HOME=<temp-home>/codex-home HOME=<temp-home>`. Full transcripts in `../experiments/codex.md`.

1. `CODEX_HOME=<nonexistent>` + `codex --version` → version prints; stderr WARNING "could not create PATH aliases: CODEX_HOME points to ... but that path does not exist". Exit 0. Nothing created.
2. `CODEX_HOME=<nonexistent>` + `codex login status` / `codex mcp list` → hard error `Error loading configuration: CODEX_HOME points to "...", but that path does not exist`, exit 1. CODEX_HOME is NOT auto-created.
3. With pre-created empty CODEX_HOME: `login status` → "Not logged in", exit 1 (plus "Refusing to create helper binaries under temporary dir" alias warning). `mcp list` → "No MCP servers configured yet. Try `codex mcp add my-tool -- my-command`.", exit 0. `features list` → full flag table. Tree diff before/after: **no files created in CODEX_HOME** by any of these read-only commands.
4. Unauthenticated exec path (empty CODEX_HOME, no env keys, temp git repo, `codex exec "say hi"`): stderr banner (`workdir/model: gpt-5.6-sol/provider: openai/approval: never/sandbox: read-only/session id: <uuid>`), then `ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://api.openai.com/v1/responses` repeated with `Reconnecting... n/5`, final **exit code 101**. (Single unauthenticated handshake; no model call; not repeated.)

## 3. Real `~/.codex` inventory (names/mtime ONLY — contents never read)

```
.personality_migration  .sandbox_migration  .tmp/  auth.json  cache/  config.toml
goals_1.sqlite{,-shm,-wal}  history.jsonl  installation_id  log/  logs_2.sqlite{,-shm,-wal}
memories/  memories_1.sqlite{,-shm,-wal}  models_cache.json  plugins/  queue_1.sqlite{,-shm,-wal}
rules/  session_index.jsonl  sessions/  shell_snapshots/  skills/  state_5.sqlite{,-shm,-wal}
thread-writer-locks/  thread_history_1.sqlite{,-shm,-wal}  tmp/  version.json
sessions/YYYY/MM/DD/rollout-<timestamp>-<thread_id>.jsonl   (e.g. sessions/2026/05/29/rollout-2026-05-29T15-24-59-019e729f-….jsonl)
skills/.system/   plugins/cache/   plugins/.remote-plugin-install-staging/   cache/remote_plugin_catalog/
```

## 4. Source excerpts (OFFICIAL_SOURCE, tag rust-v0.152.0)

### 4.1 CODEX_HOME resolution — codex-rs/utils/home-dir/src/lib.rs:5-63
> "Returns the path to the Codex configuration directory, which can be specified by the `CODEX_HOME` environment variable. If not set, defaults to `~/.codex`." … "If `CODEX_HOME` is set, the value must exist and be a directory. The value will be canonicalized and this function will Err otherwise."

### 4.2 Config layer precedence — codex-rs/config/src/config_layer_source.rs:11-56
`PackagedDefaults=-10, Mdm=0, System=10, EnterpriseManaged=15, User=20, User+profile=21, Project(.codex dir)=25, SessionFlags=30, LegacyManagedConfigToml file=40, MDM=50` — "A setting from a layer with a higher precedence overrides a setting from a layer with a lower precedence."

### 4.3 exec ThreadEvent enum — codex-rs/exec/src/exec_events.rs:11-42
`#[serde(tag = "type")] ThreadEvent::{ThreadStarted="thread.started", TurnStarted="turn.started", TurnCompleted="turn.completed", TurnFailed="turn.failed", ItemStarted="item.started", ItemUpdated="item.updated", ItemCompleted="item.completed", Error="error"}`; `Usage { input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_output_tokens }`; item kinds `agent_message | reasoning | command_execution | file_change | mcp_tool_call | collab_tool_call | web_search | todo_list | error` (snake_case, tagged).

### 4.4 Skills roots — codex-rs/ext/skills/src/host_roots.rs:80-180
User layer contributes: `$CODEX_HOME/skills` ("Deprecated user skills location … kept for backward compatibility"), `$HOME/.agents/skills` (`AGENTS_DIR_NAME = ".agents"`), `$CODEX_HOME/skills/.system` (system cache; `skills/src/lib.rs:58-107` installs embedded assets with a fingerprint marker). Project layer contributes `<project-config-folder>/skills` (Repo scope). Repo roots: `directory.join(".agents").join("skills")` for every directory from project root to cwd. System (admin) layer: `<system-config-folder>/skills`.

### 4.5 Global instructions — codex-rs/codex-home/src/instructions/mod.rs:9-60
Candidates in order: `AGENTS.override.md`, then `AGENTS.md` under CODEX_HOME; "Codex uses only the first non-empty file" (docs wording matches).

### 4.6 Project AGENTS.md chain — codex-rs/core/src/agents_md.rs:40-44, 185-270
`DEFAULT_AGENTS_MD_FILENAME = "AGENTS.md"`, `LOCAL_AGENTS_MD_FILENAME = "AGENTS.override.md"`; "Discovers AGENTS.md files from the project root to the current working directory, inclusive." One candidate filename per directory; fallback names from `project_doc_fallback_filenames`; project root from `project_root_markers` (config-overridable).

### 4.7 Auth storage — codex-rs/login/src/auth/storage.rs:28-45, 155, 265-455
`use codex_keyring_store::{DefaultKeyringStore, KeyringStore}`; "Expected structure for $CODEX_HOME/auth.json" (struct AuthDotJson with `#[serde(rename = "OPENAI_API_KEY")]` field); `codex_home.join("auth.json")`; keyring-first with fallback-to-file on load/save failure. Env constants: codex-rs/login/src/auth/manager.rs:910-911 `OPENAI_API_KEY_ENV_VAR = "OPENAI_API_KEY"`, `CODEX_API_KEY_ENV_VAR = "CODEX_API_KEY"`. Access-token classification (codex-rs/login/src/auth/access_token.rs:1-14): personal access tokens prefixed `at-` vs agent-identity JWT.

### 4.8 Hook events — codex-rs/hooks/src/lib.rs:22-50
12 event names (PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop, Stop, Interrupt); 9 with meaningful matchers; config via `hooks` key; trust persisted per handler (`config_rules.rs:33,80`).

### 4.9 Legacy notify — codex-rs/hooks/src/legacy_notify.rs:16-45, core/src/config/mod.rs:724-734
`notify = ["notify-send", "Codex"]` → runs command with JSON appended as final argv: `{"type":"agent-turn-complete","thread_id":...,"turn_id":...,"cwd":...,"client":...,"input_messages":[...],"last_assistant_message":...}`.

### 4.10 Rollouts/history — codex-rs/rollout/src/lib.rs:68-69, rollout_file_name.rs:51-69, message-history/src/lib.rs:3,52
`SESSIONS_SUBDIR = "sessions"`, `ARCHIVED_SESSIONS_SUBDIR = "archived_sessions"`; filename `rollout-<YYYY-MM-DDTHH-MM-SS>-<thread_id>.jsonl`; "The history is stored at `~/.codex/history.jsonl` with one JSON object per line" (`HISTORY_FILENAME = "history.jsonl"`).

### 4.11 arg0 dispatch + .env — codex-rs/arg0/src/lib.rs:185-215
Single binary, arg0-dispatched helpers (`codex-linux-sandbox` direct-dispatch); loads `.env` from `~/.codex/.env` before threads; PATH-alias creation warns on failure (observed) and refuses temp dirs (line ~350).

### 4.12 MCP server config — codex-rs/config/src/mcp_types.rs:197-260
Flattened transport (stdio `command/args/env` or `url`), plus `auth`, `environment_id`, `enabled`, `required`, `supports_parallel_tool_calls`, `omit_tools_from`, `startup_timeout_sec`, `tool_timeout_sec`, `default_tools_approval_mode`, `enabled_tools`, `disabled_tools`, `scopes`, `oauth`.

### 4.13 app-server method catalog — codex-rs/app-server-protocol/src/protocol/*.rs (extracted string literals)
Client→server (selection): initialize; `thread/start|resume|fork|read|list|archive|delete|unarchive|rollback|search|shellCommand|unsubscribe`; `turn/start|steer|interrupt`; `item/started|completed`; `item/agentMessage/delta`; `item/commandExecution/requestApproval`; `item/fileChange/requestApproval`; `item/permissions/requestApproval`; `account/read|logout|usage/read`; `model/list`; `config/read|batchWrite`; `configRequirements/read`; `skills/list|changed`; `hooks/list`; `mcpServerStatus/list`; `mcpServer/elicitation/request`; `plugin/install|installed|list|read|search|uninstall`; `marketplace/add|remove|upgrade`; `fs/readFile|writeFile|readDirectory|getMetadata|copy|remove|createDirectory|watch|unwatch`; `process/spawn|writeStdin|kill|resizePty|outputDelta|exited` (experimentalApi-gated); `review/start`; `remoteControl/enable|disable`; `windowsSandbox/readiness`; `memory/reset`; `environment/add|info|status`; `externalAgentConfig/detect|import`; `permissionProfile/list`; `project/*`.
Server→client notifications include `thread/started|archived|closed|deleted|unarchived|compacted|reverted`, `turn/started|completed`, `turn/diff/updated`, `turn/plan/updated`, `item/started|completed`, `rawResponse/completed`, `hook/started|completed`, `serverRequest/resolved`, `fs/changed`, `skills/changed`, `project/changed`, `account/updated`, `model/rerouted`.

### 4.14 exec exit paths — codex-rs/exec/src/lib.rs:307-2061
`std::process::exit(1)` on config/override errors; stderr diagnostics via `eprintln!`; banner via `eprintln!("OpenAI Codex v{VERSION}\n--------")` (event_processor_with_human_output.rs:218); "Reading additional input from stdin..." (lib.rs:2061); "Not inside a trusted directory and --skip-git-repo-check was not specified." (lib.rs:807).

### 4.15 Plugin command migration — codex-rs/core-plugins/src/command_migration/plugin.rs:14-38, utils/plugins/src/lib.rs:43-51
`PLUGIN_COMMANDS_DIR = "commands"` → migrated into `.codex-plugin/migrated-command-skills/` (max 4000 bytes per skill, frontmatter required). `AGENT_PLUGIN_MANIFEST_RELATIVE_PATH = "plugin.json"` (utils/plugins/src/plugin_namespace.rs:11).

## 5. Official docs excerpts (OFFICIAL_DOC, learn.chatgpt.com, fetched 2026-09-01)

- **config-basic**: user config `~/.codex/config.toml`; project `.codex/config.toml` (trusted projects only); system `/etc/codex/config.toml` (Unix); precedence "CLI flags and --config overrides" > project (closest wins) > profile files > user > system > built-in defaults; profiles at `~/.codex/profile-name.config.toml` selected with `--profile`; `[features]` toggles.
- **non-interactive-mode (codex exec)**: `--json` → "stdout becomes a JSON Lines (JSONL) stream"; event types `thread.started, turn.started, turn.completed, turn.failed, item.*, error`; `-o/--output-last-message` "writes the final message to the file and still prints it to stdout"; `--output-schema <path>`; default read-only sandbox; `--full-auto` deprecated; `--ephemeral`; `--ignore-user-config`; `--ignore-rules`; `--skip-git-repo-check`; resume via `codex exec resume --last` / `codex exec resume <SESSION_ID>`; `thread.started.thread_id` is the resume handle; `required = true` MCP server failure makes exec exit with an error; no exit-code table documented.
- **agents-md**: per-directory order `AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames`; global `CODEX_HOME` AGENTS.override.md/AGENTS.md first-non-empty; root→cwd walk, one file per directory, blank-line joined, nearer-cwd later in prompt; `project_doc_max_bytes` default 32 KiB; chain rebuilt every run.
- **auth**: `codex login` browser OAuth; `printenv OPENAI_API_KEY | codex login --with-api-key`; credentials "in a plaintext file at `~/.codex/auth.json` or in your OS-specific credential store"; `cli_auth_credentials_store = file|keyring|auto`; `printenv CODEX_ACCESS_TOKEN | codex login --with-access-token` (enterprise); `codex login --device-auth` (beta); local callback default `localhost:1455`; `forced_login_method`.
- **app-server**: JSON-RPC 2.0, `"jsonrpc"` header omitted; stdio JSONL default; websocket + unix-socket experimental (`/readyz`, `/healthz`, Origin rejection, `-32001` overload); `initialize` → `initialized`; threads `thread/start|resume|fork`; turns `turn/start` (`input` items incl. `skill`), `turn/steer` (needs `expectedTurnId`), `turn/interrupt`; approvals `item/commandExecution/requestApproval` (accept|acceptForSession|decline|cancel|acceptWithExecpolicyAmendment), `item/fileChange/requestApproval`, `item/permissions/requestApproval` (subset + scope session|turn); `mcpServer/elicitation/request`; `experimentalApi` capability gates `process/*` etc.; `codex app-server generate-ts|generate-json-schema`.
- **build-skills**: repo `.agents/skills` per dir cwd→repo root; user `$HOME/.agents/skills`; admin `/etc/codex/skills`; SYSTEM bundled; symlinked dirs followed; `SKILL.md` requires `name` + `description`; `[[skills.config]] path=... enabled=false` in `~/.codex/config.toml`; collisions not merged; "Plugins distribute reusable skills and connectors through the universal plugin directory shared by ChatGPT and Codex."
- **config-reference**: `model_providers.<id>.{name, base_url, env_key, wire_api="responses" (only value), env_key_instructions, experimental_bearer_token, requires_openai_auth, http_headers, env_http_headers, request_max_retries=4, stream_max_retries=5, auth.command|args|timeout_ms}`; `mcp_servers.<id>.{command,args,env,url,cwd,env_vars,enabled,required,startup_timeout_sec=10,tool_timeout_sec=60,enabled_tools,disabled_tools,bearer_token_env_var,http_headers,env_http_headers,auth}`; `cli_auth_credentials_store`; `mcp_oauth_credentials_store`; `forced_login_method`; `chatgpt_base_url`.
- Docs index flags the `mcp-server` page deprecated: "Use the Codex app server or the Codex plugin for Claude Code."

## 6. Negative / absence evidence

- No `~/.codex/prompts` directory loader exists in 0.152.0 source (grep for `"prompts"` dir joins: none; `CustomPrompt` only appears as internal TUI review-prompt view code). Custom prompt-commands are migrated into skills at plugin install time.
- `preferred_auth_method` does not appear in current docs (superseded by `forced_login_method`).
- Real home `~/.codex` contains no `bin/` or `codex-path/` alias dirs (npm install layout keeps helpers internal; alias creation only warns/creates for managed layouts).
- Empty CODEX_HOME + read-only commands: zero filesystem writes (before/after tree diff, experiment 2.3).
