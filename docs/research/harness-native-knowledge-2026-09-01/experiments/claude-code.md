# Claude Code — sanitized experiment transcripts (2026-09-02)

- Subject: Anthropic Claude Code, npm distribution, CLI version **2.1.247**.
- Binary path: `<binary>` (npm-global shim `claude` → platform ELF binary under `<user-home>/.npm-global/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`).
- Sanitization: `/home/<user>` → `<user-home>`; temp probe root → `<temp-home>`; binary path → `<binary>`; `<workspace>` = this repo. No credential file contents were read. No model/API calls were made (`claude -p` was deliberately **not** executed). Real `<user-home>/.claude` was only listed by file/dir *name*, never read.
- Isolation method for probes E5–E10: `mktemp -d` root `<temp-home>` with `HOME=<temp-home>/home` and `CLAUDE_CONFIG_DIR=<temp-home>/config`, cwd `<temp-home>/work`.

## E1. `claude --version`

```
$ claude --version
2.1.247 (Claude Code)
```

## E2. `claude --help` (2.1.247, abridged — every option name verbatim)

```
Usage: claude [options] [command] [prompt]

Claude Code - starts an interactive session by default, use -p/--print for
non-interactive output

Arguments:
  prompt                                Your prompt

Options:
  --add-dir <directories...>
  --agent <agent>                       Agent for the current session. Overrides the 'agent' setting.
  --agents <json>                       JSON object defining custom agents (e.g. '{"reviewer": {...}}')
  --allow-dangerously-skip-permissions  Enable bypassing all permission checks as an option, without it being enabled by default.
  --allowedTools, --allowed-tools <tools...>   Comma or space-separated list of tool names to allow (e.g. "Bash(git *) Edit")
  --append-system-prompt <prompt>
  --autocompact <auto|tokens>           Auto-compact window size (auto, or 100k–1M tokens)
  --ax-screen-reader
  --bg, --background                    Start the session as a background agent and return immediately (manage with `claude agents`)
  --bare                                Minimal mode: skip hooks, LSP, plugin sync, attribution, auto-memory,
                                        background prefetches, keychain reads, and CLAUDE.md auto-discovery. Sets
                                        CLAUDE_CODE_SIMPLE=1. Anthropic auth is strictly ANTHROPIC_API_KEY or
                                        apiKeyHelper via --settings (OAuth and keychain are never read). 3P providers
                                        (Bedrock/Vertex/Foundry) use their own credentials. Skills still resolve via
                                        /skill-name. Explicitly provide context via: --system-prompt[-file],
                                        --append-system-prompt[-file], --add-dir (CLAUDE.md dirs), --mcp-config,
                                        --settings, --agents, --plugin-dir.
  --betas <betas...>                    (API key users only)
  --brief                               Enable SendUserMessage tool
  --chrome / --no-chrome
  --cloud [description|session_id|url]  Create a cloud session, or attach by session ID or claude.ai/code URL
  -c, --continue                        Continue the most recent conversation in the current directory
  --dangerously-skip-permissions        Bypass all permission checks.
  -d, --debug [filter]                  (e.g., "api,hooks" or "!1p,!file")
  --debug-file <path>
  --disable-slash-commands              Disable all skills
  --disallowedTools, --disallowed-tools <tools...>
  --effort <level>                      (low, medium, high, xhigh, max)
  --environment <environment_id>        Self-hosted cloud environment (ccpool_...)
  --exclude-dynamic-system-prompt-sections  (default: false)
  --fallback-model <model>              (only works with --print)
  --file <specs...>                     file_id:relative_path
  --fork-session                        When resuming, create a new session ID instead of reusing the original (use with --resume or --continue)
  --forward-subagent-text               (only --print + --output-format=stream-json)
  --from-pr [value]
  --ide
  --include-hook-events                 Include all hook lifecycle events in the output stream (only --output-format=stream-json)
  --include-partial-messages            (only --print and --output-format=stream-json)
  --input-format <format>               (only with --print): "text" (default) or "stream-json" (realtime streaming input)
  --json-schema <schema>                JSON Schema for structured output validation
  --max-budget-usd <amount>             (only works with --print)
  --mcp-config <configs...>             JSON files or strings (space-separated)
  --model <model>                       alias (e.g. 'fable', 'opus', or 'sonnet') or full name (e.g. 'claude-fable-5')
  -n, --name <name>                     Set a display name for this session
  --no-session-persistence              (only works with --print)
  --output-format <format>              (only with --print): "text" (default), "json" (single result), "stream-json"
  --permission-mode <mode>              (choices: "acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan")
  --plugin-dir <path>                   Load a plugin from a directory or .zip for this session only (repeatable) (default: [])
  --plugin-url <url>                    Fetch a plugin .zip from a URL for this session only (repeatable) (default: [])
  -p, --print                           Print response and exit. Note: The workspace trust dialog is skipped when Claude is
                                        run in non-interactive mode (via -p, or when stdout is not a TTY). Settings files
                                        that fail validation are silently ignored in this mode.
  --prompt-suggestions [value]          In print/SDK mode, emits a prompt_suggestion message after each turn
  --remote-control [name]
  --remote-control-session-name-prefix <prefix>
  --replay-user-messages                Re-emit user messages from stdin back on stdout (only --input-format=stream-json and --output-format=stream-json)
  -r, --resume [value]                  Resume a conversation by session ID, or open interactive picker
  --safe-mode                           Start with all customizations (CLAUDE.md, skills, plugins, hooks, MCP servers, custom
                                        commands and agents, output styles, workflows, custom themes, keybindings, and more)
                                        disabled. Admin-managed (policy) settings still apply. Sets CLAUDE_CODE_SAFE_MODE=1.
  --session-id <uuid>                   Use a specific session ID (must be a valid UUID)
  --setting-sources <sources>           Comma-separated list of setting sources to load (user, project, local).
  --settings <file-or-json>             Path to a settings JSON file or a JSON string
  --strict-mcp-config                   Only use MCP servers from --mcp-config, ignoring all other MCP configurations
  --system-prompt <prompt>
  --teleport [session]
  --tmux                                (requires --worktree); --tmux=classic for traditional tmux
  --tools <tools...>                    Built-in tool list; "" disables all tools, "default" uses all tools
  --verbose
  -v, --version
  -w, --worktree [name]

Commands:
  agents [options]                      Manage background agents
  auth                                  Manage authentication
  auto-mode                             Inspect or reset auto mode classifier configuration
  doctor                                Check the health of your Claude Code installation.
  gateway [options]                     Run the enterprise auth/telemetry gateway
  import [options] [source]             Import config from another AI coding agent into Claude Code
  install [options] [target]            Install Claude Code native build (stable, latest, or specific version)
  mcp                                   Configure and manage MCP servers
  plugin|plugins                        Manage Claude Code plugins
  project                               Manage Claude Code project state
  setup-token                           Set up a long-lived authentication token (requires Claude subscription)
  ultrareview [options] [target]        Cloud-hosted multi-agent code review
  update|upgrade                        Check for updates and install if available
```

Note: there is **no `config` subcommand** in 2.1.247 — `claude config --help` falls through to the top-level help (exit 0).

## E3. Subcommand helps (verbatim key parts)

### `claude mcp --help`
Commands: `add`, `add-from-claude-desktop` (Mac and WSL only), `add-json`, `get`, `list`, `login`, `logout`, `remove`, `reset-project-choices`, `serve`.
`claude mcp list` / `get`: "Unapproved .mcp.json servers are shown as ⏸ Pending approval and not connected to; approved servers are health-checked unless disabled for this project."

### `claude mcp add --help`
```
Usage: claude mcp add [options] <name> <commandOrUrl> [args...]
Options:
  --callback-port <port>       Fixed port for OAuth callback
  --client-id <clientId>
  --client-secret              (or set MCP_CLIENT_SECRET env var)
  -e, --env <env...>
  -H, --header <header...>
  -s, --scope <scope>          Configuration scope (local, user, or project) (default: "local")
  -t, --transport <transport>  (stdio, sse, http). Defaults to stdio
```

### `claude mcp serve --help`
"Start the Claude Code MCP server" (options: `-d --debug`, `--verbose`).

### `claude plugin --help`
Commands: `details`, `disable`, `enable`, `eval`, `init|new`, `install|i`, `list`, `marketplace`, `prune|autoremove`, `tag`, `uninstall|remove`, `update`, `validate`.
- `init|new <name>`: "Scaffold a new plugin at ~/.claude/skills/<name>/ (auto-loads next session as <name>@skills-dir)"
- `details`: "Show a plugin's component inventory and projected token cost"
- `validate`: "Validate a plugin or marketplace manifest, or the skills, agents, and commands in a directory"

### `claude plugin marketplace --help`
Commands: `add <source>` (URL, path, or GitHub repo), `list`, `remove|rm`, `update`.

### `claude agents --help`
"Manage background agents". Key options: `--json` ("Print active sessions (interactive and background) as a JSON array and exit (for scripting; does not require a TTY)"), `--all`, `--cwd <path>`, `--dangerously-skip-permissions` (alias for `--permission-mode bypassPermissions`), `--permission-mode`, `--model`, `--effort`, `--agent`, `--mcp-config`, `--strict-mcp-config`, `--settings`, `--setting-sources`, `--plugin-dir`, `--add-dir`, `--allow-dangerously-skip-permissions`.

### `claude auth --help` / `claude auth status --help`
Commands: `login`, `logout`, `status`. `status` options: `--json` (default), `--text`. (login/logout were NOT executed.)

### `claude install --help`
"Install Claude Code native build. Use [target] to specify version (stable, latest, or specific version)". Options: `--force`.

### `claude project --help`
Commands: `purge [path]` — "Delete all Claude Code state for a project (transcripts, tasks, file history, config entry)".

### `claude import --help`
"Import config from another AI coding agent into Claude Code"; `source` = `codex`, `gemini`; options `--dry-run`, `--yes`.

### `claude gateway --help`
"Run the enterprise auth/telemetry gateway"; option `--config <path>` (YAML).

### `claude auto-mode --help`
Commands: `config` ("Print the effective auto mode config as JSON"), `critique`, `defaults`, `reset` ("removing the autoMode section from your user settings file").

### `claude doctor --help`
"Check the health of your Claude Code installation. Reads settings files in the current directory without a trust prompt."

## E4. Isolated temp-HOME probe — identity writes

```
$ export HOME=<temp-home>/home CLAUDE_CONFIG_DIR=<temp-home>/config
$ claude --version
2.1.247 (Claude Code)
$ find <temp-home> ...            # before/after identical: --version writes nothing
```

## E5. `claude auth status` under temp HOME (no login performed)

```
$ claude auth status --text
Proxy: http://127.0.0.1:7897
Not logged in. Run claude auth login to authenticate.
```
Filesystem delta after the call:
```
<temp-home>/config/.claude.json
<temp-home>/config/.claude.json.lock
<temp-home>/config/backups/.claude.json.backup.<epoch-ms>
```
Observation: `.claude.json`, its lock, and automatic backups live **inside `CLAUDE_CONFIG_DIR`** when set. The proxy line shows Claude Code reads standard proxy env of the shell session.

## E6. MCP scope probes (`claude mcp add` in three scopes)

```
$ claude mcp add -s user   demo-user -- echo hi
  → "to user config"; "File modified: <temp-home>/config/.claude.json"
$ claude mcp add -s local  demo-local -- echo hi
  → "to local config"; "File modified: <temp-home>/config/.claude.json [project: <temp-home>/work]"
$ claude mcp add -s project demo-proj -- echo hi
  → "to project config"; "File modified: <temp-home>/work/.mcp.json"
$ claude mcp list
Checking MCP server health…
demo-user:  echo hi - ✘ Failed to connect — -32000: MCP error -32000: Connection closed
demo-proj:  echo hi - ⏸ Pending approval (run `claude` to approve)
demo-local: echo hi - ✘ Failed to connect — -32000: MCP error -32000: Connection closed
```
`<temp-home>/work/.mcp.json` created:
```json
{"mcpServers":{"demo-proj":{"type":"stdio","command":"echo","args":["hi"],"env":{}}}}
```
State file shape (temp `.claude.json`, structure only):
```
top-level keys: firstStartTime, firstStartVersion, machineID, userID, migrationVersion,
  mcpServers, projects, seenNotifications, hasResetAutoModeOptInForDefaultOffer,
  opusProMigrationComplete, sonnet1m45MigrationComplete
projects[<project-key>] keys: allowedTools, disabledMcpjsonServers, enabledMcpjsonServers,
  hasClaudeMdExternalIncludesApproved, hasClaudeMdExternalIncludesWarningShown,
  hasTrustDialogAccepted, mcpContextUris, mcpServers
user scope mcpServers sit at top level; local scope sits under projects[<key>].mcpServers
```
MCP health-check logs land under `HOME`, not `CLAUDE_CONFIG_DIR`:
```
<temp-home>/home/.cache/claude-cli-nodejs/<sanitized-cwd-with-dashes>/mcp-logs-<server>/<ISO-timestamp>.jsonl
   {"debug":"Starting connection with timeout of 30000ms", "sessionId":"<uuid>", "cwd":"<temp-home>/work"}
```

## E7. Project-key derivation test

Same temp config, three cwds: `<temp-home>/work`, `<temp-home>/work2/sub`, `<temp-home>/home/projA/deep` (none in a git repo) → all three local-scope servers stored under the single project key `"/tmp"` (the temp root's device root ancestor). Then a git repo test:

```
$ git init <temp-home>/repo && cd <temp-home>/repo/sub
$ claude mcp add -s local demo4 -- echo hi
  "File modified: <temp-home>/config/.claude.json [project: <temp-home>/repo/sub]"
→ new projects key: "<temp-home>/repo"   (the git repository root, not the cwd)
```
Conclusion: project state keys = enclosing git repository root when one exists; otherwise an ancestor of cwd (exact rule for non-git dirs: UNRESOLVED; observed collapse to the outermost temp root).

## E8. `claude doctor` under temp HOME (no model calls)

```
$ claude doctor
Claude Code doctor

Running: npm-global (2.1.247)
Commit: 89c726188daf
Platform: linux-x64
Path: <binary>
Config install method: unknown
Search: OK (bundled)
Auto-updates: enabled
Auto-update channel: latest
Last update attempt: none recorded

Remote Control
Remote Control requires a claude.ai subscription. Run claude auth login to sign in...
- Not signed in to claude.ai
- claude.ai subscription auth not active
- Sign-in is missing the user:profile scope
- Organization not resolved
- Remote Control availability could not be verified (no server response this session)

No installation issues found.
```

## E9. Plugin surfaces under temp config

Marketplace fixture: `<temp-home>/mkt/.claude-plugin/marketplace.json` (`{"name":"test-marketplace",...}`) + `<temp-home>/mkt/pDemo/` with `.claude-plugin/plugin.json`, `skills/demo-skill/SKILL.md`, `commands/hello.md`, `agents/demo-agent.md`, `hooks/hooks.json`.

```
$ claude plugin marketplace add <temp-home>/mkt
✔ Successfully added marketplace: test-marketplace (declared in user settings)
$ claude plugin install pDemo@test-marketplace
✔ Successfully installed plugin: pDemo@test-marketplace (scope: user)
$ claude plugin list
Installed plugins:
  ❯ pDemo@test-marketplace   Version: 0.1.0   Scope: user   Status: ✔ enabled
Skills-directory plugins (.claude/skills/*):
  ❯ probe-skill@skills-dir
```
Resulting state (all inside `CLAUDE_CONFIG_DIR`):
```
<config>/settings.json          ← user settings; plugin install appended:
   "extraKnownMarketplaces": {"test-marketplace": {"source": {"source": "directory", "path": "..." }}}
   "enabledPlugins": {"pDemo@test-marketplace": true}
   (pre-existing keys preserved verbatim: env, permissions.allow/deny, model, hooks, statusLine)
<config>/plugins/installed_plugins.json  {"version":2,"plugins":{"pDemo@test-marketplace":
   [{"scope":"user","installPath":"<config>/plugins/cache/test-marketplace/pDemo/0.1.0",
     "version":"0.1.0","installedAt":"<iso>","lastUpdated":"<iso>"}]}}
<config>/plugins/known_marketplaces.json {"test-marketplace":{"source":{...},"installLocation":"...","lastUpdated":"<iso>"}}
<config>/plugins/cache/test-marketplace/pDemo/0.1.0/   (versioned copy of plugin contents)
```

`claude plugin init probe-skill` (with `CLAUDE_CONFIG_DIR` set) scaffolded into `<config>/skills/probe-skill` — i.e. the literal-`~/.claude` help text actually resolves through `CLAUDE_CONFIG_DIR`; message: "It will auto-load next session as probe-skill@skills-dir. Run /reload-plugins to load it now."

`claude plugin validate <temp-home>/mkt/pDemo` → "Validation passed with warnings" (non-kebab-case name; missing author).

## E10. Exit codes / input validation (no model calls)

```
$ claude --resume 00000000-0000-0000-0000-000000000000
No conversation found with session ID: 00000000-0000-0000-0000-000000000000   → exit 1
$ claude --session-id not-a-uuid
Error: Invalid session ID. Must be a valid UUID.                              → exit 1
$ claude --effort bogus
Warning: Unknown --effort value 'bogus' — ignoring it and using the default effort.
        Valid values: low, medium, high, xhigh, max.
Error: Input must be provided either through stdin or as a prompt argument when using --print   → exit 1
$ claude </dev/null                      (non-TTY, no -p, no prompt)
Error: Input must be provided either through stdin or as a prompt argument when using --print   → exit 1
$ claude --output-format bogus -p        → exit 1
```

## E11. `claude mcp serve` — Claude Code as MCP server (no model calls)

```
stdin:  initialize (protocolVersion 2024-11-05) → notifications/initialized → tools/list
stdout: {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},
         "serverInfo":{"name":"claude/tengu","version":"2.1.247"},"jsonrpc":"2.0","id":1}
        {"result":{"tools":[... 22 tools ...],"jsonrpc":"2.0","id":2}}
tools:  Agent (alias Task), TaskOutput (alias AgentOutputTool), Bash, Read, Edit, Write,
        NotebookEdit, WebFetch, ReportFindings, WebSearch, TaskStop (alias KillShell), Skill,
        DesignSync, EnterWorktree, ExitWorktree, SendMessage, Workflow (alias RunWorkflow),
        CronCreate, CronDelete, CronList, ScheduleWakeup, ToolSearch
```

## E12. Binary string probes (grep -a over the ELF, count of matches)

```
CLAUDE_CONFIG_DIR=56  MAX_THINKING_TOKENS=11  CLAUDE_CODE_MAX_OUTPUT_TOKENS=8
ANTHROPIC_BASE_URL=80  CLAUDE_CODE_USE_BEDROCK=18  CLAUDE_CODE_USE_VERTEX=18
CLAUDE_CODE_SUBAGENT_MODEL=9  ANTHROPIC_SMALL_FAST_MODEL=24
CLAUDE_CODE_API_KEY_HELPER_TTL_MS=6  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=21
CLAUDE_CODE_SIMPLE=26  CLAUDE_CODE_SAFE_MODE=9
apiKeyHelper=88  forceLoginMethod=32  outputStyle=110  statusLine=54
PreToolUse=188  PostToolUse=184  UserPromptSubmit=87  SessionStart=99  SessionEnd=44
PreCompact=39  PermissionRequest=133  dontAsk=50  bypassPermissions=150
```

## E13. Real `<user-home>/.claude` — name-only inventory (contents NOT read)

Names present: `.credentials.json` (mode 0600), `.last-cleanup`, `.last-update-result.json`, `.mcp.json` (user-scope MCP file at config root), `CLAUDE.md`, `agents/`, `backups/`, `cache/`, `commands/`, `councils/`, `daemon/`, `daemon.lock`, `daemon.status.json`, `file-history/`, `history.jsonl`, `mcp-needs-auth-cache.json`, `paste-cache/`, `plugins/`, `profiles-settings.json`, `projects/`, `session-env/`, `sessions/`, `settings.json`, `settings.local.json`, `shell-snapshots/`, `skills/`, `stats-cache.json`, `teams/`, plus user-created MCP server dirs.
`projects/` entries observed (names only): `-home-<user>`, `-home-<user>-projects-agent-box`, `C--Users-<user>` (Windows-style keys from cross-platform use), etc.; inside a project dir: `<session-uuid>.jsonl` transcript files plus a directory named after the same `<session-uuid>`.

## E14. Explicitly NOT executed

- `claude -p` (would call the model) — forbidden by research policy.
- `claude auth login` / `logout` / `setup-token` / `update` / `install` — account-affecting.
- Any reading of `.credentials.json`, `~/.claude.json` (real one) contents, keychain.
