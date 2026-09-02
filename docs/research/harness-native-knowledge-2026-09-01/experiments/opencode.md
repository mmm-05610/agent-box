# Experiments — OpenCode (harness id: opencode)

Date: 2026-09-02. Subject binary: opencode 1.18.21 (npm global install).
All commands below were run locally. NO model/API calls were made; NO credential
contents were read. Real `~/.config/opencode` and `~/.local/share/opencode` were
only `ls`-ed (names/existence). Path sanitization: `/home/<user>` → `<user-home>`,
probe temp dir `/tmp/oc-probe-R6J9` → `<temp-home>`, workspace repo → `<workspace>`,
binary → `<binary>`.

## E1. Binary identity

```
$ which opencode
<user-home>/.npm-global/bin/opencode
$ ls -la <user-home>/.npm-global/bin/opencode
-> ../lib/node_modules/opencode-ai/bin/opencode.exe
$ opencode --version
1.18.21
$ file <resolved-target>
ELF 64-bit LSB executable, x86-64, ... dynamically linked ... not stripped
```

Observation: npm package `opencode-ai` ships a platform-specific standalone
executable (Bun-compiled TS), not a JS entry script. CLI_OBSERVED, HIGH.

## E2. Top-level help (`opencode --help`)

Commands observed (verbatim list, banner ASCII art omitted):

```
Commands:
  opencode completion          generate shell completion script
  opencode acp                 start ACP (Agent Client Protocol) server
  opencode mcp                 manage MCP (Model Context Protocol) servers
  opencode [project]           start opencode tui                    [default]
  opencode attach <url>        attach to a running opencode server
  opencode run [message..]     run opencode with a message
  opencode debug               debugging and troubleshooting tools
  opencode providers           manage AI providers and credentials  [aliases: auth]
  opencode agent               manage agents
  opencode upgrade [target]    upgrade opencode to the latest or a specific version
  opencode uninstall           uninstall opencode and remove all related files
  opencode serve               starts a headless opencode server
  opencode web                 start opencode server and open web interface
  opencode models [provider]   list all available models
  opencode stats               show token usage and cost statistics
  opencode export [sessionID]  export session data as JSON
  opencode import <file>       import session data from JSON file or URL
  opencode github              manage GitHub agent
  opencode pr <number>         fetch and checkout a GitHub PR branch, then run opencode
  opencode session             manage sessions
  opencode plugin <module>     install plugin and update config    [aliases: plug]
  opencode db                  database tools
```

Global options include: `--print-logs`, `--log-level DEBUG|INFO|WARN|ERROR`,
`--pure` (run without external plugins), `--port` (default 0), `--hostname`
(default 127.0.0.1), `--mdns`, `--mdns-domain` (default opencode.local),
`--cors`, `-m/--model provider/model`, `-c/--continue`, `-s/--session`,
`--fork`, `--prompt`, `--agent`, `--auto` ("auto-approve permissions that are
not explicitly denied (dangerous!)"), `--mini`, `--no-replay`, `--replay-limit`.

Notable drift vs. older docs/leads: `auth` is now `providers`; `attach`, `web`,
`acp`, `session`, `plugin`, `db`, `github`, `pr` exist as first-class commands.
CLI_OBSERVED, HIGH, VERSION_SENSITIVE.

## E3. `opencode run --help` (key options)

```
  --command       the command to run, use message for args
  -c, --continue  continue the last session
  -s, --session   session id to continue
  --fork          fork the session before continuing (requires --continue or --session)
  --share         share the session
  -m, --model     model to use in the format of provider/model
  --agent         agent to use
  --format        format: default (formatted) or json (raw JSON events)  [default: "default"]
  -f, --file      file(s) to attach to message
  --title         title for the session (uses truncated prompt if no value provided)
  --attach        attach to a running opencode server (e.g., http://localhost:4096)
  -p, --password  basic auth password (defaults to OPENCODE_SERVER_PASSWORD)
  -u, --username  basic auth username (defaults to OPENCODE_SERVER_USERNAME or 'opencode')
  --dir           directory to run in, path on remote server if attaching
  --port          port for the local server (defaults to random port if no value provided)
  --variant       model variant (provider-specific reasoning effort, e.g., high, max, minimal)
  --thinking      show thinking blocks
  -i, --interactive  run in direct interactive split-footer mode
  --auto          auto-approve permissions that are not explicitly denied (dangerous!)
```

CLI_OBSERVED, HIGH.

## E4. Isolated temp-HOME / XDG probe

Setup:

```
TMPH=<temp-home>; mkdir -p $TMPH/{home,cfg,data,cache,state}
HOME=$TMPH/home XDG_CONFIG_HOME=$TMPH/cfg XDG_DATA_HOME=$TMPH/data \
XDG_CACHE_HOME=$TMPH/cache XDG_STATE_HOME=$TMPH/state opencode debug paths
```

Output (verbatim):

```
home       <temp-home>/home
data       <temp-home>/data/opencode
bin        <temp-home>/cache/opencode/bin
log        <temp-home>/data/opencode/log
repos      <temp-home>/data/opencode/repos
cache      <temp-home>/cache/opencode
config     <temp-home>/cfg/opencode
state      <temp-home>/state/opencode
tmp        /tmp/opencode
```

All XDG overrides honored; `tmp` is a FIXED shared path `/tmp/opencode`
(cross-instance shared scratch). CLI_OBSERVED, HIGH.
Cross-check with source `packages/core/src/global.ts:10-29` (clone of
github.com/sst/opencode @ 5341a5e, 2026-09-01): xdg-basedir, app dir `opencode`,
`bin = cache/bin`, `tmp = os.tmpdir()/opencode`. OFFICIAL_SOURCE, HIGH.

### E4a. Files auto-created after probe commands

```
<temp-home>/cfg/opencode/.gitignore
<temp-home>/cfg/opencode/opencode.jsonc        # contents: {"$schema": "https://opencode.ai/config.json"}
<temp-home>/data/opencode/log/opencode.log
<temp-home>/data/opencode/opencode.db          # SQLite
<temp-home>/data/opencode/opencode.db-shm
<temp-home>/data/opencode/opencode.db-wal
<temp-home>/state/opencode/locks/<sha1>.lock/heartbeat
<temp-home>/state/opencode/locks/<sha1>.lock/meta.json
```

opencode AUTO-INITIALIZES: global config seed (opencode.json with `$schema`
only; a jsonc twin + .gitignore were also observed), SQLite database, log, and
instance locks. CLI_OBSERVED, HIGH.
Source cross-check: `packages/opencode/src/config/config.ts:262-273` seeds the
global config file when missing; `packages/core/src/database/database.ts:53`
puts DB at `Global.Path.data/opencode.db`. OFFICIAL_SOURCE, HIGH.

### E4b. `opencode debug config` (fresh probe, empty config)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {},
  "mode": {},
  "plugin": [],
  "command": {},
  "username": "<user>"
}
```

`username` defaults to the OS user name. CLI_OBSERVED, HIGH.

### E4c. `opencode debug skill` (fresh probe)

Lists exactly one built-in skill: `customize-opencode` (`"location":
"<built-in>"`), whose body is opencode's own configuration reference (config
file locations, agent/command/skill/plugin/MCP/permission shapes, env
escape hatches). So: SKILLS ARE SUPPORTED as of 1.18.x, and opencode reads
`~/.claude/skills/` and `~/.agents/skills/` SKILL.md files as external skills.
CLI_OBSERVED + OFFICIAL_SOURCE (packages/opencode/src/skill/index.ts:17-44),
HIGH.

### E4d. `opencode debug agent build` (fresh probe)

Built-in agent `build` resolves to permission rules:
`{permission:"*", action:"allow"}` plus `doom_loop: ask`,
`external_directory: ask` with explicit allows for
`<data>/opencode/tool-output/*` and `/tmp/opencode/*`. CLI_OBSERVED, HIGH.
`opencode agent list` → `build (primary)`, plus plan/general/explore per
built-in skill text. OFFICIAL_SOURCE, MEDIUM.

## E5. Headless run without credentials (temp HOME, no auth.json, no provider env)

```
$ timeout 25 opencode run "hello" </dev/null
> build · big-pickle        (banner only; agent `build`, model `big-pickle`)
exit=124 (timed out; no stdout body, no stderr error)
```

Observation: `opencode run` does NOT fail fast when no provider credentials are
configured — it printed the agent/model banner (default model resolved to
`big-pickle`, an opencode-gateway-hosted id) and blocked until the timeout.
No model output was produced and nothing crashed. For Agent-Box: a sandboxed
run MUST have provider credentials (auth.json materialized or env key) or an
explicit `--model` pointing at a reachable provider, otherwise headless runs
hang silently. CLI_OBSERVED, HIGH (single trial), VERSION_SENSITIVE.

## E6. Real install inventory (names only, no contents)

```
$ ls <user-home>/.local/share/opencode
auth.json  log  opencode.db  opencode.db-shm  opencode.db-wal  repos
$ ls <user-home>/.config/opencode
node_modules  opencode.json  opencode.jsonc  package-lock.json  package.json
```

`auth.json` EXISTS (contents never read; 0600 per source). The global config
dir doubles as an npm package root for plugins (`package.json` + `node_modules`
+ `plugin` npm installs). The real user dir had NO per-project JSON session
files (legacy `storage/` layout absent) — consistent with SQLite-only storage
in 1.18.x. CLI_OBSERVED (names only), HIGH.

## E7. Official repo verification (clone @ /tmp, read-only)

- `git clone --depth 1 https://github.com/sst/opencode.git` → HEAD 5341a5e,
  2026-09-01, `packages/opencode/package.json` version 1.18.25 (4 ahead of
  installed 1.18.21). TS/Bun monorepo: core `packages/core`, CLI
  `packages/opencode`, TUI `packages/tui` (`@opencode-ai/tui`, opentui),
  server/protocol/sdk packages. OFFICIAL_SOURCE, HIGH.
- `git clone https://github.com/opencode-ai/opencode.git` → ARCHIVED; README
  says "The project has continued under the name Crush, developed by the
  original author and the Charm team." (the old Go codebase). OFFICIAL_DOC,
  HIGH. => The "Go core + TS TUI" lead is STALE; current opencode is TS core +
  TS TUI.

## E8. Server API facts (source-read only, not executed against a live server)

- `GET /doc` returns OpenAPI document (httpapi/server.ts:190).
- SSE: `GET /event` (instance-scoped), `GET /global/event` (global) —
  both are compression-exempt streaming paths
  (httpapi/middleware/compression.ts:11, public.ts:155).
- `POST /session/:sessionID/abort`, `POST /session/:sessionID/prompt_async`
  (queued/async prompt), `POST /session/:sessionID/revert|/unrevert|/summarize`,
  `POST /session/:sessionID/share` + DELETE unshare (groups/session.ts:85-104).
- `GET /permission` (pending list), `POST /permission/:requestID/reply`
  (groups/permission.ts). Reply values `once|always|reject`
  (packages/opencode/src/permission/index.ts:121-163).
- `GET /question`, `POST /question/:requestID/reply` (groups/question.ts).
OFFICIAL_SOURCE, HIGH; live-server behavior NOT_LOCALLY_OBSERVED.
