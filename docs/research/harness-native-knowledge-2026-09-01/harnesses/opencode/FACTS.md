# FACTS — OpenCode (harness id: opencode)

Date of research: 2026-09-02. Verified binary: **opencode 1.18.21** (npm global
install at `<user-home>/.npm-global/bin/opencode`, symlinked into
`node_modules/opencode-ai/bin/`). Official repo verified at HEAD 5341a5e
(2026-09-01) where `packages/opencode` reports **1.18.25** — cadence is very
fast; treat every behavioral fact as VERSION_SENSITIVE unless noted STABLE.

Evidence legend: [DOC] = OFFICIAL_DOC (opencode.ai/docs or README), [SRC] =
OFFICIAL_SOURCE (clone of github.com/sst/opencode @ 5341a5e, 2026-09-01; paths
relative to repo root), [CLI] = CLI_OBSERVED on 1.18.21 this machine, [REL] =
RELEASE_NOTE, [INFER] = INFERENCE. Full per-fact citations in evidence.md.
Documented / observed / inferred are kept separate per section.

## A. Identity & distribution

- A1 [CLI] Version string: `opencode --version` → `1.18.21`. 2026-09-02. HIGH, VERSION_SENSITIVE.
- A2 [SRC] Official repo is **github.com/sst/opencode** — TypeScript/Bun monorepo (`packages/opencode` CLI, `packages/core`, `packages/tui`, `packages/server`, `packages/sdk`). HEAD 5341a5e 2026-09-01, package version 1.18.25. HIGH, STABLE (org identity as of 2026-09).
- A3 [DOC+CLI] The org/repo lead "opencode-ai" is a **trap**: github.com/opencode-ai/opencode is ARCHIVED (README banner "Archived: Project has Moved … continued under the name Crush, by the original author and the Charm team" — the old Go codebase). The lead "Go core + TS TUI" is STALE: current opencode core and TUI are both TypeScript (TUI = `packages/tui`, `@opencode-ai/tui`, opentui-based). HIGH, STABLE.
- A4 [DOC] Distribution channels (README of sst/opencode): npm `opencode-ai`; curl install script; Homebrew (`brew install opencode` / tap); Scoop/Chocolatey (Windows); pacman/AUR (Arch); `.deb`/`.rpm`/AppImage (Linux); desktop apps (`opencode-desktop-{mac-arm64,mac-x64}.dmg`, `opencode-desktop-windows-x64.exe`). HIGH, STABLE-ish.
- A5 [CLI] The npm package ships a **standalone ELF binary** (`bin/opencode.exe` — Bun-compiled TS), not a JS shim. HIGH, STABLE.
- A6 [DOC] Docs site: opencode.ai/docs; JSON config schema published at https://opencode.ai/config.json (referenced by `$schema` and by the built-in skill text). HIGH, STABLE.
- A7 [SRC] License MIT (LICENSE, package.json). HIGH, STABLE.
- A8 [INFER] Release cadence: installed 1.18.21 vs repo 1.18.25 one day apart ⇒ near-daily releases. HIGH (arithmetic), VERSION_SENSITIVE consequences everywhere.

## B. Executable discovery

- B1 [CLI] Binary path pattern (this machine, npm method): `<user-home>/.npm-global/bin/opencode` → `../lib/node_modules/opencode-ai/bin/opencode.exe`. HIGH, STABLE per-install.
- B2 [SRC] Other methods land the binary elsewhere (brew: `$(brew --prefix)/bin/opencode`; curl/upgrader: `$XDG_CACHE_HOME/opencode/bin`; scoop/choco: Windows shims). `opencode upgrade` manages its own copy under `Global.Path.bin = cache/opencode/bin` (packages/core/src/global.ts:22, 41). HIGH, VERSION_SENSITIVE.
- B3 [CLI] `opencode --help` works offline with no provider credentials; help output is fully static. HIGH, STABLE.
- B4 [SRC] Global override env: `OPENCODE_TEST_HOME` replaces `os.homedir()` for `Global.Path.home` (packages/core/src/global.ts:19). Useful for sandboxing. MEDIUM, VERSION_SENSITIVE.

## C. Launch modes

Argv templates (all [CLI], HIGH, VERSION_SENSITIVE):

- C1 TUI: `opencode [project]` (default command; positional = project path). Extra options: `-m/--model`, `-c/--continue`, `-s/--session <id>`, `--fork`, `--prompt <text>`, `--agent <name>`, `--auto`, `--mini`, `--no-replay`, `--replay-limit N`, plus server options `--port/--hostname/--mdns/--mdns-domain/--cors` (TUI boots/attaches a local server).
- C2 Headless: `opencode run [message..]` — see full flag list in experiments E3. Prompt transport: positional message words AND/OR `--command <slash-command>` (message becomes args); `-f/--file` attachments (local files ≤10 MiB; directories rejected unless shared filesystem). Output formats: `--format default` (human, streamed to stdout) or `--format json` ("raw JSON events"). Model pinning `-m provider/model` (+ `--variant` reasoning effort, `--thinking` to surface reasoning blocks). Session: `-c` continue-last, `-s <sessionID>`, `--fork`. Title `--title`. Remote: `--attach http://host:port` + `--dir <remote path>` + basic auth `-u/-p` (defaults env `OPENCODE_SERVER_USERNAME`/`OPENCODE_SERVER_PASSWORD`, username default "opencode"). Permission policy: `--auto` (auto-approve non-denied; aliases `--yolo` and `--dangerously-skip-permissions` [SRC run.ts:247-274]); WITHOUT `--auto`, headless run **auto-rejects every permission.asked with a printed warning** [SRC run.ts:800-830 + CLI banner behavior]. Local server port `--port` (random if unset). Interactive split-footer: `-i/--interactive` (conflicts with `--format json` [SRC run.ts:304-305]).
- C3 Serve: `opencode serve` — headless HTTP server; `--port` (default 0 = random), `--hostname` (default 127.0.0.1), `--mdns`, `--mdns-domain`, `--cors`, `--print-logs`, `--log-level`. Endpoints: `GET /doc` (OpenAPI) [SRC httpapi/server.ts:190], SSE `GET /event` + `GET /global/event` [SRC compression.ts:11, public.ts:155], session/permission/question/file/config/provider/mcp/tui route groups under `packages/opencode/src/server/routes/instance/httpapi/groups/`. Basic auth via `OPENCODE_SERVER_PASSWORD` [SRC auth.ts presence + run.ts:962-967 ServerAuth.header()] — live-server auth behavior NOT_LOCALLY_OBSERVED.
- C4 Attach: `opencode attach <url>` — TUI client to a running server; `--dir`, `-c/-s/--fork`, `-u/-p` basic auth, `--mini`, `--no-replay`, `--replay-limit`. [CLI]
- C5 ACP: `opencode acp` — Agent Client Protocol server (for editors like Zed); same server options + `--cwd` (default = process cwd). [CLI] ACP wire protocol details: UNKNOWN (not probed).
- C6 Web: `opencode web` — start server and open web interface. [CLI]
- C7 Auth: `opencode providers list|login|logout` (alias `auth`). `login [url]` with `-p/--provider`, `-m/--method` selectors. [CLI] Login flow (browser OAuth / API key entry) NOT exercised (forbidden).
- C8 Models: `opencode models [provider]` — list from the **models.dev registry** cache [SRC cli/cmd/models.ts:3,23]; `--refresh` refetches models.dev, `--verbose` adds cost metadata. [CLI+SRC] HIGH.
- C9 Exit semantics of `run`: documented-by-source "sends a single prompt, streams events to stdout, and **exits when the session goes idle**" [SRC run.ts:5-13]; loop breaks on `session.status` event with `status.type === "idle"` [SRC run.ts:796-800]. Errors set `process.exitCode = 1` (prompt error, command error, session.error, loop crash) [SRC run.ts:837-873, 860-875]; usage/config errors `process.exit(1)` [SRC run.ts:277-427]. Exit code on **abort** (interrupt): UNKNOWN. Observed E5: with NO credentials, run does NOT exit fast — printed banner `> build · big-pickle` and blocked ≥25s (default model = opencode-hosted `big-pickle`). HIGH for hang observation, single trial.
- C10 Network surface: local HTTP server (loopback by default; mDNS optional), models.dev registry fetch, share upload to opencode's share service when `share: auto` or `--share`/`/share`, remote MCP HTTP, provider APIs, `instructions` http(s) fetch (5s timeout) [SRC instruction.ts:95-103]. Sandbox firewall must cover models.dev + provider + share + arbitrary instruction URLs.
- C11 [SRC] `opencode run` can target a remote server for `--attach`; `--dir` then names the remote directory. MEDIUM, VERSION_SENSITIVE.

## D. Profile & configuration

Homes (all [SRC global.ts:10-29] + [CLI E4], HIGH; note: xdg-basedir falls back
to `~/.local/share`, `~/.cache`, `~/.config`, `~/.local/state` when XDG vars
unset):

| key | path | purpose |
|---|---|---|
| data | `$XDG_DATA_HOME/opencode` | opencode.db (+WAL/SHM), auth.json, log/, repos/, (legacy storage/) |
| cache | `$XDG_CACHE_HOME/opencode` | bin/ (self-upgrade binaries), models.dev cache |
| config | `$XDG_CONFIG_HOME/opencode` | opencode.json(c), config.json, AGENTS.md, agent/, command/, skill/, plugin/ (+ npm package root for installed plugins) |
| state | `$XDG_STATE_HOME/opencode` | locks/<hash>.lock/{heartbeat,meta.json} |
| tmp | `os.tmpdir()/opencode` | shared scratch (NOT XDG-overridable; hardcoded `/tmp/opencode` on Linux) |
| bin | `cache/opencode/bin` | upgrade targets |
| log | `data/opencode/log` | opencode.log |

- D1 [SRC+CLI] All six roots are auto-`mkdir -p`-ed at startup (global.ts:35-43; observed E4a). HIGH.
- D2 [SRC config.ts:262-274] Global config load order (later wins): `config.json` → `opencode.json` → `opencode.jsonc`; legacy TOML `config` file is auto-migrated to `config.json` and deleted. HIGH, VERSION_SENSITIVE.
- D3 [SRC config.ts:262-267 + CLI E4a] Auto-seed: if no `OPENCODE_CONFIG*` override and global config file missing, opencode WRITES `{"$schema": "https://opencode.ai/config.json"}` into the global config dir (probe also produced `opencode.jsonc` + `.gitignore`). HIGH. ⇒ any sandbox HOME will get files written; read-only config roots are NOT viable without OPENCODE_CONFIG_DIR/CONTENT overrides.
- D4 [SRC config/paths.ts:10-42 + DOC /docs/config/] Project config: `opencode.json(c)` found by walking UP from cwd to worktree root, applied deepest-first (paths are reversed so the most-local file merges last = wins); `.opencode/opencode.json(c)` in every `.opencode` dir up the tree; `~/.opencode` (home) also scanned. HIGH.
- D5 [DOC /docs/config/ + SRC config.ts:400-545] Full merge order (earliest→latest): remote `.well-known/opencode` (org), global, `OPENCODE_CONFIG` file, project `opencode.json`, `.opencode` dirs, inline `OPENCODE_CONFIG_CONTENT` (final local scope), managed files (`/etc/opencode/` Linux, `/Library/Application Support/opencode/` macOS, `%ProgramData%\opencode` Windows), MDM `.mobileconfig` (`ai.opencode.managed`) highest, not user-overridable. MEDIUM-HIGH (docs current; managed/MDM paths NOT_LOCALLY_OBSERVED on Linux beyond /etc).
- D6 [SRC instruction.ts / skill text] `OPENCODE_DISABLE_PROJECT_CONFIG=1` skips project config AND project AGENTS.md walk-up. `OPENCODE_CONFIG=<file>` adds one file; `OPENCODE_CONFIG_DIR=<dir>` reroutes the global config dir; `OPENCODE_CONFIG_CONTENT=<json>` inline-merges last. HIGH, VERSION_SENSITIVE.
- D7 [skill text + SRC v1/config/*] Config is strict: unknown top-level keys REJECTED (`ConfigInvalidError`); loaded once at startup, NOT hot-reloaded (restart required). HIGH.
- D8 Key config fields (skill text, verbatim-supported): `$schema, username, model ("provider/model"), small_model, default_agent, shell, logLevel, share ("manual"|"auto"|"disabled"), autoupdate (true|false|"notify"), snapshot, instructions[], skills{paths[],urls[]}, references{alias:{path|repository,branch,description,hidden}}, agent{name:{...}}, command{name:{...}}, provider{...}, disabled_providers[], enabled_providers[], mcp{name:{type local|remote, command[], url, headers{}, environment{}, enabled}}, plugin[...], permission{...}, formatter (false|config), lsp (false|config), experimental{...}, tool_output{max_lines,max_bytes}, compaction{auto,tail_turns}. [SRC] HIGH, VERSION_SENSITIVE.
- D9 [DOC /docs/config/] `share` default "manual"; `autoupdate` "notify" only alerts; no effect under package-manager installs (brew etc.). MEDIUM.
- D10 [CLI E4b] `username` defaults to the OS user. HIGH.
- D11 Safe-to-persist vs opaque: opencode.json(c)/agent/command/skill/plugin files are declarative and safe; opencode.db + WAL, locks/, log/, auth.json are runtime-opaque. [INFER from structure; HIGH]
- D12 Concurrent writers: multiple processes may write the same global config seed concurrently; flock-based locks exist under state/locks [SRC Flock.setGlobal(global.ts:33)]. Two TUI instances are supported via lock dir + per-instance DB access; no lock-failure observed. MEDIUM.

## E. Credentials

- E1 [SRC auth/index.ts:10] `auth.json` lives at `$XDG_DATA_HOME/opencode/auth.json` (i.e. `~/.local/share/opencode/auth.json` by default), written 0o600. HIGH, STABLE.
- E2 [SRC auth/index.ts:14-30] auth.json shape (documented from source, NOT read locally): map of providerID → union of `{type:"oauth", refresh, access, expires, accountId?, enterpriseUrl?}` | `{type:"api", key, metadata?}` | `{type:"wellknown", key, token}`. Contents of the real file were NEVER read (policy). HIGH.
- E3 [SRC auth/index.ts:60-65] `OPENCODE_AUTH_CONTENT` env var can replace the file entirely (JSON parsed from env). ⇒ credential injection without touching disk. HIGH, VERSION_SENSITIVE.
- E4 [CLI E6] Real install HAS auth.json (existence only). HIGH.
- E5 [CLI] `opencode providers login [url]` (interactive; OAuth or API key entry per docs), `providers logout [provider]`, `providers list`. Logout deletes entries from auth.json [SRC auth.remove]. HIGH.
- E6 [SRC skill text + config] Provider keys may also come from plain env (`ANTHROPIC_API_KEY` etc. per provider docs) and `provider.<id>.options.apiKey` in config; config string values support `{env:VAR}` (and `{file:path}`) interpolation. MEDIUM-HIGH, VERSION_SENSITIVE.
- E7 [CLI+SRC] MCP OAuth creds managed by `opencode mcp auth|logout` (OAuth tokens stored by the MCP auth module; exact store path UNKNOWN). MEDIUM.
- E8 [INFER, HIGH] Isolation: per-sandbox HOME + `XDG_DATA_HOME` redirect moves auth.json wholesale; OR write a minimal auth.json with `{"<provider>":{"type":"api","key":"..."}}`; OR set `OPENCODE_AUTH_CONTENT`. Login flow itself must be avoided in sandboxes (browser/OAuth).
- E9 FORBIDDEN fields (never read/print): auth.json contents (`access`, `refresh`, `key`, `token`), MCP OAuth stores, provider `options.apiKey` values in user configs.

## F. State isolation

- F1 [SRC+CLI] Account state: `data/opencode/auth.json` (E1). Category: account — copy per sandbox or inject via env.
- F2 [SRC database/database.ts:44-60 + CLI E4a] Normal state: SQLite `data/opencode/opencode.db` (+`-wal`, `-shm`); channel-suffixed DB name for non-latest/beta/prod channels; `OPENCODE_DB` env overrides path (absolute, or relative to data dir, or `:memory:`). HIGH, VERSION_SENSITIVE.
- F3 [SRC storage/storage.ts:64-224] LEGACY JSON layout still migrated-from: `storage/session/info/*.json`, `storage/session/message/<sessionID>/*.json`, `storage/session/part/<sessionID>/<messageID>/*.json`, `storage/project/<projectID>.json`, `session_diff/` — under `data/opencode/storage/`. The lead's "per-project salted dirs of JSONs" describes the legacy pre-SQLite layout; in 1.18.x sessions live in SQLite (real dir has no `storage/` subdir). HIGH.
- F4 [CLI] Session state also reachable via `opencode session list [--format json] [--max-count N]`, `opencode export [sessionID] [--sanitize]`, `opencode import <file|share-url>`, `opencode db [sql|--format json|tsv]`, `opencode db path`. HIGH.
- F5 [SRC session.ts:327-332] Plans: `.opencode/plans/<timestamp>-<slug>.md` inside the worktree when VCS present, else under data dir. MEDIUM.
- F6 [CLI+SRC] Cache: models.dev registry cache + `bin/` under `cache/opencode`; upgradeable copies. Copy-on-write friendly.
- F7 [CLI+SRC] Unsafe/shared: `/tmp/opencode` fixed shared scratch (collisions across sandboxes possible); SQLite WAL files are NOT safe to share between concurrent hosts. Locks under state/locks with heartbeats (stale-lock GC inferred). MEDIUM.
- F8 Concurrency model: N TUI instances and/or headless runs can coexist (locks + per-project DB rows); one server can serve multiple clients via HTTP/SSE; `run --attach` connects a client to an existing server instead of booting one. [SRC run.ts:5-13, 858-866 + CLI help] HIGH.
- F9 Isolation recipe (INFER, HIGH): redirect all four XDG roots to sandbox-local dirs; share NOTHING under data/ (SQLite+auth); read-only-share of config/ is fine only if `OPENCODE_CONFIG_DIR`/`OPENCODE_CONFIG_CONTENT` used, else opencode will try to seed files; always give each sandbox its own `/tmp` or accept `/tmp/opencode` contention.
- F10 [SRC flag.ts:21-64] Full env-flag list observed: `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CONFIG_DIR`, `OPENCODE_DB`, `OPENCODE_TEST_HOME`, plus (skill text) `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_DISABLE_DEFAULT_PLUGINS`, `OPENCODE_PURE`, `OPENCODE_DISABLE_EXTERNAL_SKILLS`, `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS`, `OPENCODE_AUTH_CONTENT`, `OPENCODE_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME`, `OPENCODE_DISABLE_CHANNEL_DB`. HIGH, VERSION_SENSITIVE.

## G. Resource surfaces

Legend: ✅ supported / ❌ unsupported / ❓ unknown. Discovery, format, scope,
precedence per surface; env overrides noted. Recursion/naming per surface.

- G1 ✅ **Instructions (AGENTS.md et al.)** [SRC instruction.ts:60-152, HIGH]:
  - Project walk-up cwd→worktree for the FIRST matching file-type among `AGENTS.md`, then `CLAUDE.md` (unless disabled), then deprecated `CONTEXT.md` — first type with any match wins (does not stack every ancestor's AGENTS.md).
  - Global: `$XDG_CONFIG_HOME/opencode/AGENTS.md` first, else `~/.claude/CLAUDE.md`.
  - `config.instructions[]`: file paths/globs (project-relative, `~/`-expanded, absolute), plus http(s) URLs fetched at session start (5s timeout).
  - Nested instructions: when the agent READs a file, parent-dir AGENTS.md-style files up the tree are attached once per message (instruction.ts:179-221).
  - Env: `OPENCODE_DISABLE_PROJECT_CONFIG` disables the project walk-up.
  - Read-only OK (no writes).
- G2 ✅ **Skills** — CONFIRMED new in 1.x (lead asked to verify; yes) [CLI E4c + SRC skill/index.ts:17-44, HIGH, VERSION_SENSITIVE (recent feature)]:
  - Locations: `.opencode/skill/<name>/SKILL.md` or `.../skills/<name>/` (project), `~/.config/opencode/skill(s)/` (global), EXTERNAL auto-load `~/.claude/skills/**/SKILL.md` and `~/.agents/skills/**/SKILL.md` (`OPENCODE_DISABLE_EXTERNAL_SKILLS=1` / `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1` to skip), `config.skills.paths[]` (recursive `**/SKILL.md`) and `config.skills.urls[]` (remote index serving a skills list; staged locally).
  - Format: folder named after skill, `SKILL.md` exactly, frontmatter `name` (required, lowercase-hyphen, ≤64 chars, must match folder) + `description` (effectively required — skills without it are filtered from the model) + optional `license`, `compatibility`, `metadata` (string map).
  - Built-in skill `customize-opencode` ships in-binary. `opencode debug skill` lists all. Recursive scan `**/SKILL.md` ⇒ nested dirs allowed. Read-only OK.
- G3 ✅ **MCP** [SRC skill text + cli/cmd/mcp.ts + config mcp schema, HIGH]:
  - Config: `mcp.<name>` = `{type:"local", command:[...], environment{}, enabled}` | `{type:"remote", url, headers{}, enabled}`; `{env:VAR}`/`{file:path}` interpolation in strings; `enabled:false` disables inherited servers.
  - CLI: `opencode mcp add [name] [--url|--env|--header]`, `mcp list`, `mcp auth|logout|debug` (OAuth). Local servers = stdio child processes; remote = HTTP. Read-only OK (config-driven).
- G4 ✅ **Prompts/Commands** [SRC skill text + config/command.ts, HIGH]:
  - `.opencode/command/<name>.md` (or `commands/`), frontmatter `description, agent, model, variant, subtask`, body = template (the prompt); `$ARGUMENTS` and `$1..$n` substitution; also inline `config.command{name:{description,template}}`.
  - Invoked as slash commands in TUI; headless via `opencode run --command <name> [args..]`. Read-only OK.
- G5 ✅ **Rules (permissions)** [SRC v1/config/permission.ts + skill text, HIGH]:
  - `permission` in config: per-tool `"allow"|"ask"|"deny"` or `{pattern: action}` objects; KNOWN keys: read, edit, glob, grep, list, bash, task, external_directory, todowrite, question, webfetch, websearch, lsp, doom_loop, skill. Pattern objects: LAST matching rule wins (insertion order matters). `external_directory` patterns are path globs. Per-agent `permission:` overrides top-level. Plan mode = `plan` agent with edit deny.
  - No separate "rules" directory concept — rules are config/agent frontmatter. Read-only OK.
- G6 ✅ **Agents (subagents)** [SRC skill text + cli/cmd/agent.ts, HIGH]:
  - Files `.opencode/agent/<name>.md` or `agents/` (project), `~/.config/opencode/agent(s)/` (global); frontmatter allowed: `name, model, variant, description, mode (primary|subagent|all), hidden, color, steps, options, permission, disable, temperature, top_p` — unknown keys silently routed to `options`; body = prompt.
  - Inline: `config.agent{name:{description, mode, model, permission, prompt, disable}}`.
  - Built-ins: `build`, `plan`, `general`, `explore`; hidden internal: `compaction`, `title`, `summary`. `default_agent` must be non-hidden primary. `opencode agent create` scaffolds a file; `opencode agent list` / `opencode debug agent <name>`. Read-only OK.
- G7 ✅ **Hooks/Plugins** [SRC skill text + cli/cmd/plug.ts, HIGH]:
  - Auto-discovered `*.ts|*.js` in `.opencode/plugin(s)/`; `config.plugin[]` = npm spec, `file://` URL, relative path, or `[name, options]` tuple; `opencode plugin <npm-module> [-g global] [-f force]` installs into the global config npm root (real dir observed to contain package.json+node_modules).
  - Plugin = function returning hooks: `event`, `config`, `chat.message`, `chat.params`, `chat.headers`, `tool.execute.before/after`, `tool.definition`, `command.execute.before`, `shell.env`, `permission.ask`, plus `experimental.*` and object hooks `tool{}`, `auth{}`, `provider{}`.
  - Disable switches: `--pure` CLI flag, `OPENCODE_PURE=1`, `OPENCODE_DISABLE_DEFAULT_PLUGINS=1`. Writable needed only when installing plugins; read-only OK for discovery.
- G8 ❓ **Memory** — no dedicated memory/knowledge directory in config schema or resource list. Compaction (`compaction` config + hidden agent) + instructions serve the role. UNKNOWN (no evidence either way for a memory file convention).
- G9 ✅ **References (context dirs/repos)** — new in 1.x [SRC skill text, MEDIUM-HIGH, VERSION_SENSITIVE]: `config.references.<alias>` = local `path` or git `repository`(+`branch`), optional `description`/`hidden`; surfaced via `@` autocomplete; external-directory boundary auto-allowed for reference dirs.
- G10 ✅ **Formatters & LSP** — `config.formatter` (false to disable / per-language config), `config.lsp` (false / per-server); `opencode debug lsp`, `debug rg`, `debug file`, `debug snapshot`. MEDIUM.
- G11 ✅ **Modes** — `config.mode{}` object present (E4b resolved config); docs mention `modes/` subdir alongside agents/commands/plugins/skills/tools/themes. MEDIUM, VERSION_SENSITIVE (mode/agent convergence unclear).
- G12 ✅ **Themes/keybinds** — `config.theme`; TUI settings in global `tui.json` [DOC /docs/config/]. Details (keybind list) UNKNOWN (TUI internals not probed).
- G13 ❌/❓ **Rules dir / prompt dir as separate first-class dirs** — unsupported as distinct concepts (folded into commands + instructions). ❓ exact per-version status.

## H. Events & observation

- H1 [SRC run.ts:5-13 + CLI help] `opencode run --format json` streams RAW JSON events to stdout. Event object shape = SDK v2 event bus payloads (see packages/sdk/js/src/v2/gen/types.gen.ts). Exact schema stability: VERSION_SENSITIVE. (Not executed end-to-end here — requires provider.)
- H2 [SRC + CLI banner] Terminal events used by headless run loop: `session.status` (`status.type: "idle"|"busy"` → idle ends run), `session.error` (name+data.message surfaced; exit 1), `permission.asked` (id, sessionID, permission, patterns[]). [SRC run.ts:780-830] HIGH.
- H3 [SRC session modules] Event names in bus (SessionV1.Event): session `Created|Updated|Deleted|Diff|Error`; message `MessageUpdated|MessageRemoved|PartUpdated|PartDelta|PartRemoved`; plus `compaction`, `todo`, `status`, plus `agent-switched`, `model-switched`, `question.*`, `permission.*` (SDK type list). HIGH, VERSION_SENSITIVE.
- H4 [SRC sdk types.gen.ts:378-617] Part types (v2): `text`, `reasoning`, `file`, `tool` (state pending/running/completed + metadata + time), `step-start`, `step-finish`, `snapshot`, `patch`, `agent`, `subtask`, retry, compaction. Tool parts carry status/metadata (e.g. read tool metadata.loaded paths). HIGH, VERSION_SENSITIVE.
- H5 [SRC session.ts:334-360 getUsage + cli/cmd/stats.ts] Token usage & cost tracked per message/model; `opencode stats [--days N --models --tools N --project x]` aggregates. Message parts/metadata carry usage. MEDIUM-HIGH.
- H6 [CLI E4a + SRC global.ts:23] Log file: `data/opencode/log/opencode.log` (created even for --help/debug runs); `--print-logs` mirrors to stderr; `--log-level DEBUG|INFO|WARN|ERROR`. HIGH.
- H7 [SRC server.ts:190, compression.ts:11] Live observation channel: SSE on `GET /event` (per-instance) and `GET /global/event` (cross-instance global bus). WebSocket tracker also exists (websocket-tracker.ts). NOT_LOCALLY_OBSERVED live; source-verified. HIGH.
- H8 [SRC groups/permission.ts, question.ts] `GET /permission` lists pending permission requests across sessions; `GET /question` likewise for user questions — both are the observation feeds a host needs for interactive gating. HIGH.
- H9 [CLI db] `opencode db path` prints DB path; `opencode db <sql>` runs SQL (`--format json|tsv`) — direct observation of sessions/messages possible without SSE. HIGH.

## I. Runtime control

- I1 [SRC groups/session.ts:91, 253-278] Interrupt: `POST /session/:sessionID/abort`. TUI keybind abort exists (TUI internals not enumerated — UNKNOWN detail). Headless: no direct CLI flag; abort via server API or by killing process. HIGH.
- I2 [SRC groups/session.ts:95-96] Steer: `POST /session/:sessionID/message` (prompt on live session) and `POST /session/:sessionID/prompt_async` (async queued prompt) ⇒ queued follow-up messages while busy. MEDIUM-HIGH (endpoint verified; queue semantics inferred from name; NOT_LOCALLY_OBSERVED).
- I3 [SRC groups/permission.ts:20-30 + permission/index.ts:121-163] Permission respond: `POST /permission/:requestID/reply` with `{reply: "once"|"always"|"reject", message?}`. Headless default: reject + warning unless `--auto` (reply "once"). HIGH.
- I4 [SRC groups/question.ts] Question respond: `POST /question/:requestID/reply` with answers array (answers are arrays of selected labels). HIGH.
- I5 [CLI+SRC] Resume: `-c/--continue` (last session), `-s <sessionID>`, `--fork` (fork before continuing). Works in TUI, run, attach. HIGH.
- I6 [SRC SDK event list + session prompt args] Mid-session model/agent switch supported (events `model-switched`, `agent-switched`; prompt API takes model+agent+variant per call). MEDIUM.
- I7 [SRC groups/session.ts:99-104, 279-311, 369+] Session surgery over HTTP: revert/unrevert, summarize (compaction trigger), share/unshare, delete message/part, update part. HIGH.
- I8 [CLI] TUI keybinds: not enumerated (packages/tui internals not probed) — UNKNOWN list; `--mini` offers a minimal interactive mode reachable also from `run -i`. MEDIUM.
- I9 [CLI+SRC] `--port` on run lets the caller pin the ephemeral server port for post-hoc API pokes; default random. HIGH.

## J. Agent-Box owner mapping (ONE owner per major fact)

| # | Fact cluster | Owner | Rationale / conflict notes |
|---|---|---|---|
| J1 | Harness identity, version, org/repo (A1-A8) | harness-registry-declaration | registry owns name/version/repo identity. |
| J2 | Binary discovery + upgrade cache (B1-B3) | harness-native-adapter | adapter resolves executable; no AUTHORITY_CONFLICT. |
| J3 | Launch modes argv/run/serve/attach/acp (C1-C11) | runtime-host-protocol | host launches and supervises processes. |
| J4 | `run` exit semantics + hang-without-creds (C9, E5) | host-control | host needs exit codes/timeouts to bound headless runs. |
| J5 | Home/XDG path table, auto-mkdir, auto-seed (D1-D3) | sandbox-protocol | sandbox controls HOME/XDG redirection; AUTHORITY_CONFLICT candidate with profile-store for the seeded config file contents (D3): profile-store owns config content, sandbox-protocol owns the filesystem. Declared: sandbox-protocol for path placement; profile-store for file CONTENT. |
| J6 | Config merge order + strict schema + not-hot-reload (D4-D8) | profile-store / native-payload | profile-store owns merged config payload. |
| J7 | Env flag list (D10/F10) | runtime-host-protocol | env is injected at process spawn by host. |
| J8 | auth.json path+shape+env injection (E1-E3, E8) | credential-materializer | materializer writes auth.json / OPENCODE_AUTH_CONTENT per sandbox. |
| J9 | providers login/logout (E5) | not-agent-box (interactive; sandbox must avoid) | browser/OAuth flow, forbidden in sandboxes. |
| J10 | SQLite/legacy-JSON session storage, db CLI (F2-F4) | observation-envelope-candidate | sessions/messages/usage are the observation payload source. |
| J11 | tmp /tmp/opencode shared scratch (F7) | sandbox-protocol | must be per-sandbox or accepted-shared; AUTHORITY_CONFLICT with runtime-host-protocol (process tmp). Declared: sandbox-protocol. |
| J12 | locks/ concurrency (F7-F8) | runtime-host-protocol | instance lifecycle supervision. |
| J13 | instructions surface (G1) | resource-projector | AGENTS.md projection + instructions[] globs. |
| J14 | skills surface (G2) | resource-projector | SKILL.md dirs incl. cross-harness ~/.claude,~/.agents imports. |
| J15 | MCP surface (G3) | resource-projector | mcp config merge projection. |
| J16 | commands surface (G4) | resource-projector | command/*.md projection. |
| J17 | permissions surface (G5) | sandbox-protocol | permission policy maps to sandbox gating; AUTHORITY_CONFLICT with resource-projector (who writes permission blocks into agent files). Declared: sandbox-protocol owns deny enforcement semantics. |
| J18 | agents surface (G6) | resource-projector | agent md files + config agent objects. |
| J19 | plugins/hooks (G7) | harness-native-adapter | plugin loading is harness-internal; adapter toggles --pure. |
| J20 | memory (G8) | not-agent-box | no native memory surface; unknown → nothing to project. |
| J21 | events SSE + run json stream (H1-H3) | observation-envelope-candidate | SSE/JSON events = candidate envelope. |
| J22 | part types + usage/cost (H4-H5) | observation-envelope-candidate | part stream schema. |
| J23 | log file + --print-logs (H6) | terminal-session-protocol | stderr/log capture routing. |
| J24 | abort/steer/reply/resume API (I1-I7) | host-control | host drives runtime control plane. |
| J25 | TUI keybind internals (I8) | not-agent-box | TUI-internal; host uses headless path instead. |

## UNRESOLVED

- U1 Exit code of `opencode run` on user abort / SIGINT mid-run (only error-exit 1 verified in source).
- U2 Exact JSON event schema of `--format json` on the wire (schema exists in SDK gen types; not captured live).
- U3 MCP OAuth credential store location (path not pinned).
- U4 Live SSE `/event` frame format (SSE `data:` envelope) — source implies standard SSE; not observed live.
- U5 TUI keybind table (packages/tui) not enumerated.
- U6 Whether a second TUI/run against the SAME sandbox DB while a server holds it causes lock contention (locks exist; behavior untested).
- U7 `big-pickle` default-model behavior: which provider/gateway backs the default when no credentials exist, and what request (if any) it attempted before the observed hang.
- U8 ACP (`opencode acp`) wire protocol details.
- U9 Managed-config paths (`/etc/opencode`, macOS MDM) presence/precedence on this Linux install — docs-only.
- U10 Whether `share: auto` upload endpoint is reachable/blocked in sandbox (policy decision needed, not tested).
