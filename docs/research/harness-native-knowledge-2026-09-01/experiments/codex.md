# Experiments — OpenAI Codex CLI (`codex`) — 2026-09-01

Environment: Linux (WSL2), codex-cli 0.152.0 npm global install.
Constraints honored: no real model/API requests (a single unauthenticated 401 handshake occurred once in experiment 4 — no credentials existed, no prompt reached a model, no cost; not repeated), no login/logout, no credential file contents read (real `~/.codex` accessed by name/mtime only), no global installs, repo untouched.
Sanitization: `<user-home>` = real home, `<temp-home>` = the mktemp probe dir, `<binary>` = codex on PATH.

## Experiment 1 — Binary discovery and version

```
$ command -v codex
<binary>
$ codex --version
codex-cli 0.152.0      (exit 0)
```

## Experiment 2 — Help surfaces (all exit 0)

Captured (full text in evidence.md): `codex --help`, `codex exec --help`, `codex exec resume --help`, `codex exec fork --help`, `codex resume --help`, `codex fork --help`, `codex app-server --help`, `codex app-server daemon --help`, `codex mcp --help`, `codex mcp add --help`, `codex mcp login --help`, `codex mcp-server --help`, `codex login --help`, `codex logout --help`, `codex plugin --help`, `codex features --help`, `codex doctor --help`, `codex sandbox --help`, `codex apply --help`, `codex queue --help`, `codex debug --help`, `codex debug app-server --help`, `codex agents --help`, `codex review --help`, `codex migrate-rollouts --help`, `codex remote-control --help`, `codex cloud --help`, `codex exec-server --help`.

Notable help strings (verbatim):
- `-p, --profile <CONFIG_PROFILE_V2>`: "Layer $CODEX_HOME/<name>.config.toml on top of the base user config"
- `codex exec` prompt arg: "If not provided as an argument (or if `-` is used), instructions are read from stdin. If stdin is piped and a prompt is also provided, stdin is appended as a `<stdin>` block"
- `codex app-server --listen`: "Supported values: `stdio://` (default), `unix://`, `unix://PATH`, `ws://IP:PORT`, `off`"
- `codex login --with-api-key`: "Read the API key from stdin (e.g. `printenv OPENAI_API_KEY | codex login --with-api-key`)"
- `codex login --with-access-token`: "Read the access token from stdin (e.g. `printenv CODEX_ACCESS_TOKEN | codex login --with-access-token`)"

## Experiment 3 — Feature flag inventory (safe, read-only)

```
$ codex features list        (0.152.0; ~120 rows; selected)
hooks                      stable            true
plugins                    stable            true
plugin_sharing             stable            true
skill_search               stable            true
skill_mcp_dependency_install stable          true
memories                   stable            false
multi_agent                stable            true
multi_agent_v2             stable            false
personality                stable            true
unified_exec               stable            true
apps                       stable            true
auth_elicitation           stable            true
browser_use                stable            true
code_mode_host             stable            true
fast_mode                  stable            true
web_search_request         deprecated        false
use_legacy_landlock        deprecated        false
steer                      removed           true
elevated_windows_sandbox   removed           false
experimental_windows_sandbox removed         false
```

## Experiment 4 — Isolated temp HOME probes

Setup:
```
T=$(mktemp -d <temp-home>)            # CODEX_HOME=$T/codex-home initially NOT created
export HOME=$T CODEX_HOME=$T/codex-home
```

4.1 `CODEX_HOME` missing + `codex --version`:
```
WARNING: proceeding, even though we could not create PATH aliases: CODEX_HOME points to
"<temp-home>/codex-home", but that path does not exist
codex-cli 0.152.0      (exit 0)
```
Before/after tree diff: no files created (only the diff snapshot file itself).

4.2 `CODEX_HOME` missing + `codex login status` / `codex mcp list`:
```
Error loading configuration: CODEX_HOME points to "<temp-home>/codex-home", but that path does not exist   (exit 1)
Error: failed to resolve CODEX_HOME
Caused by: CODEX_HOME points to "...", but that path does not exist                                        (exit 1)
```
Conclusion: CODEX_HOME is resolved but never auto-created — isolation must `mkdir -p` it first.

4.3 Empty CODEX_HOME (pre-created), read-only commands:
```
$ codex login status
WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries
under temporary dir "<temp-home>/codex-home"
Not logged in                              (exit 1)
$ codex mcp list
WARNING: ... Refusing to create helper binaries under temporary dir ...
No MCP servers configured yet. Try `codex mcp add my-tool -- my-command`.   (exit 0)
$ codex features list                      (full table, exit 0)
```
Before/after tree diff of CODEX_HOME: **NO-DIFF** — none of these commands write anything into an empty CODEX_HOME.

4.4 Unauthenticated exec failure path (single run; empty CODEX_HOME, no env keys, temp git repo):
```
$ cd $T && git init -q probe-repo && cd probe-repo
$ codex exec "say hi"
WARNING: ... Refusing to create helper binaries under temporary dir ...
Reading additional input from stdin...
OpenAI Codex v0.152.0
--------
workdir: <temp-home>/probe-repo
model: gpt-5.6-sol
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: none
session id: 01a05db2-6868-7b23-8b47-6c90176df218
--------
user
say hi
... ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://api.openai.com/v1/responses
... ERROR ... (repeated; "Reconnecting... 2/5")
(exit 101)
```
Observations: default model `gpt-5.6-sol`; exec default `approval: never`, `sandbox: read-only`; banner on stderr; connection failure retries 5x then exit 101. No further network probes were run.

## Experiment 5 — Real `~/.codex` inventory (names + mtimes only; contents NEVER read)

```
$ ls -la ~/.codex
.personality_migration  .sandbox_migration  .tmp/  auth.json (0600)  cache/  config.toml (0600)
goals_1.sqlite{,-shm,-wal}  history.jsonl (0600)  installation_id  log/  logs_2.sqlite{,-shm,-wal} (~195 MB)
memories/  memories_1.sqlite{,-shm,-wal}  models_cache.json  plugins/  queue_1.sqlite{,-shm,-wal}
rules/  session_index.jsonl  sessions/  shell_snapshots/  skills/  state_5.sqlite{,-shm,-wal}
thread-writer-locks/  thread_history_1.sqlite{,-shm,-wal}  tmp/  version.json

$ find ~/.codex -maxdepth 2 -type d
sessions/2026  tmp/arg0  .tmp/plugins  cache/remote_plugin_catalog  cache/codex_apps_tools
cache/codex_apps_server_info  plugins/cache  plugins/.remote-plugin-install-staging
skills/<user-skill>  skills/.system  thread-writer-locks  shell_snapshots  rules  memories  log

$ find ~/.codex/sessions -type d | head
sessions/YYYY/MM/DD  (e.g. sessions/2026/05/29)
$ find ~/.codex/sessions -type f | head
sessions/2026/05/29/rollout-2026-05-29T15-24-59-019e729f-3fbd-77f1-bbc6-420dc40d5862.jsonl
```

## Experiment 6 — Source verification (shallow clone of openai/codex into a temp dir)

```
$ git clone --depth 1 https://github.com/openai/codex <temp-src>   # HEAD 6127478, 2026-09-01
$ git fetch --depth 1 origin refs/tags/rust-v0.152.0:refs/tags/rust-v0.152.0 && git checkout rust-v0.152.0
# tag commit 316795b3cf2a45e90d121d9f46499d4658b2645c (2026-08-31)
```
Key files inspected (repo-relative, tag rust-v0.152.0) — excerpts in evidence.md section 4:
- `codex-rs/utils/home-dir/src/lib.rs` (CODEX_HOME semantics)
- `codex-rs/config/src/config_layer_source.rs` (layer precedence), `config/src/profile_toml.rs`, `config/src/lib.rs:40`
- `codex-rs/exec/src/exec_events.rs` (ThreadEvent schema), `exec/src/lib.rs`, `exec/src/event_processor_with_human_output.rs` (banner→stderr)
- `codex-rs/ext/skills/src/host_roots.rs` + `skills/src/lib.rs` (skill roots incl. `.agents/skills`, deprecated `CODEX_HOME/skills`, system cache)
- `codex-rs/codex-home/src/instructions/mod.rs` + `core/src/agents_md.rs` (AGENTS.md discovery)
- `codex-rs/login/src/auth/{storage.rs,manager.rs,access_token.rs}` (auth.json, keyring, env vars)
- `codex-rs/hooks/src/lib.rs`, `hooks/src/legacy_notify.rs` (hook events, notify payload)
- `codex-rs/rollout/src/{lib.rs,rollout_file_name.rs}`, `message-history/src/lib.rs` (sessions/history paths)
- `codex-rs/app-server-protocol/src/protocol/*.rs` (JSON-RPC method catalog)
- `codex-rs/utils/plugins/`, `core-plugins/src/command_migration/plugin.rs` (plugin.json manifest, commands→skills)
- `codex-rs/arg0/src/lib.rs`, `install-context/src/lib.rs` (helper dispatch, standalone layout)
- `codex-rs/config/src/mcp_types.rs` (McpServerConfig), `core/src/exec_policy.rs` (.rules)

## Experiment 7 — Official docs fetch (WebFetch; developers.openai.com/codex 308-redirects to learn.chatgpt.com)

Pages fetched 2026-09-01: `/docs/config-file/config-basic`, `/codex/non-interactive-mode.md`, `/docs/agent-configuration/agents-md.md`, `/docs/auth.md`, `/docs/app-server.md`, `/docs/build-skills.md`, `/docs/config-file/config-reference.md`, `/llms.txt` (index). Key quotes recorded in evidence.md section 5. Docs index notes the mcp-server page is deprecated ("Use the Codex app server or the Codex plugin for Claude Code").
