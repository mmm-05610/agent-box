# Evidence — Pi Coding Agent (`pi`) — observed 2026-09-02

- CLI: **pi 0.84.4**, installed via `npm install --prefix <temp-home>/pi-probe --ignore-scripts @earendil-works/pi-coding-agent` (128 packages). NOT globally installed; real `<user-home>/.pi` untouched (name-level checks only).
- Source: monorepo cloned to `<temp-home>/pi-mono` from https://github.com/badlogic/pi-mono (GitHub rename-redirect → `earendil-works/pi`), HEAD `b8b873b9872db04a938fb4357b5e8e824ddc051c` (2026-09-01) == npm latest 0.84.4. All repo citations are repo-relative.
- Registry metadata from `registry.npmjs.org` (unauthenticated GET, no install scripts).
- NO model/API requests, NO paid calls, NO login. All probes are `--version` / `--help` / `--list-models` (offline) / RPC `get_state`-class non-model commands under an isolated `HOME=<temp-home>/pi-home`. No credential contents read (only top-level key counts of freshly scaffolded empty files in the temp HOME).

---

## 1. Identity & registry (OFFICIAL_SOURCE, npm registry GET 2026-09-02)

### 1.1 `@earendil-works/pi-coding-agent` (the coding agent)
```
name: @earendil-works/pi-coding-agent
dist-tags: { latest: '0.84.4', 'legacy-node20': '0.74.2' }
description: Coding agent CLI with read, bash, edit, write tools and session management
license: MIT ; engines: { node: '>=22.19.0' } ; bin: { pi: 'dist/bundle/cli.js' }
repo: git+https://github.com/earendil-works/pi.git, directory packages/coding-agent
created: 2026-05-07 ; latest publish 0.84.4 @ 2026-08-28T22:07:57Z
recent: 0.82.0 2026-07-24, 0.83.0 2026-07-29, 0.84.0 2026-08-06, 0.84.2 2026-08-14,
        0.84.3 2026-08-24, 0.84.4 2026-08-28   (≈weekly cadence)
maintainers: badlogic (mario@badlogicgames.com), mitsuhiko, rwachtler
```

### 1.2 `@mariozechner/pi` (IDENTITY TRAP — not the coding agent)
```
dist-tags.latest: 0.70.6 (2026-04-28) ; description: "CLI tool for managing vLLM
deployments on GPU pods" ; bin: { pi-pods: 'dist/cli.js' } ; repo directory: packages/pods
```
→ The lead's npm package name is stale/repurposed. The monorepo git URL still resolves (rename redirect), which is what kept the lead partially on track.

## 2. Monorepo layout (OFFICIAL_SOURCE, commit b8b873b)

`packages/`: agent, ai, client, coding-agent, evals, protocol, server, session-backends, telemetry, tui — all `@earendil-works/*` at 0.84.4. Coding agent package: `packages/coding-agent/` with rich in-repo `docs/` (README 718 lines; extensions.md 3,020; rpc.md 1,618; sdk.md 1,219; session-format.md 438; settings.md 369; CHANGELOG.md 5,625). `package.json` bin: `{ pi: dist/bundle/cli.js }`.

Key source citations (repo-relative, commit b8b873b):
- `packages/coding-agent/src/cli/args.ts` — full flag parser (L13-58 Args type; L60 thinking levels `off|minimal|low|medium|high|xhigh|max`; L100-131 session flags; L157-163 `--print/-p`; L227-240 unknown-flag capture into `unknownFlags`; L262-446 help text incl. env-var table L387-435).
- `packages/coding-agent/src/config.ts` — `CONFIG_DIR_NAME ".pi"` (L500), `ENV_AGENT_DIR = PI_CODING_AGENT_DIR`, `ENV_SESSION_DIR = PI_CODING_AGENT_SESSION_DIR` (L504-505), `getAgentDir()` = env or `~/.pi/agent` (L524-530), `getAuthPath/getModelsPath/getSettingsPath/getPromptsDir/getSessionsDir/getBinDir` (L533-575), `PI_PACKAGE_DIR` (L385-397), self-update per install method (L116-188).
- `packages/coding-agent/src/modes/print-mode.ts` — print/JSON mode: exit 0/1 semantics (L139-158, 1 on stopReason error|aborted), SIGTERM→143 / SIGHUP→129 (L50-66), JSON header-first emit (L122-127), stdin-merge documented in README CLI Reference.
- `packages/coding-agent/docs/json.md` — event union + header line + delta-only `message_update` (L22-52, 69-93).
- `packages/coding-agent/docs/session-format.md` — path pattern (L7-11), v1/v2/v3 migration (L19-27), header shape (L192-201), entry types (L203-304), `Usage`/cost (L104-117).
- `packages/coding-agent/docs/settings.md` — global vs project settings (L5-9), project trust headless behavior (L12-22), sessionDir precedence (L256), `defaultProjectTrust`, telemetry/update-check env (L82-98), `npmCommand`, `defaultTools`.
- `packages/coding-agent/docs/rpc.md` — framing LF-only warning (L28-37), command catalog (L39-855), event catalog incl. `agent_settled`, `bash_execution_update` (L855-1069).
- `packages/coding-agent/docs/models.md` — custom providers via `~/.pi/agent/models.json`, `apiKey` resolution `$VAR`/`${VAR}`/`!command` (L149-159).
- `packages/coding-agent/docs/skills.md` — Agent Skills standard, discovery roots incl. `~/.agents/skills/` (L1-40).
- `packages/coding-agent/README.md` — "No MCP." (L499), "No sub-agents." (L501), "No permission popups." (L503), context files/SYSTEM.md, pi packages, provider list, `PI_OFFLINE`/`PI_SKIP_VERSION_CHECK`/`PI_TELEMETRY`, bash-tool child env `PI_SESSION_ID`/`PI_SESSION_FILE`/`PI_PROVIDER`/`PI_MODEL`/`PI_REASONING_LEVEL`.
- `packages/coding-agent/CHANGELOG.md` — 0.84.4 (2026-08-28) top entry; grep across file: `--agent-dir` never existed as CLI flag (only `PI_CODING_AGENT_DIR` + SDK `agentDir` params).

## 3. CLI transcripts (CLI_OBSERVED, 2026-09-02, HOME=<temp-home>/pi-home)

### 3.1 install + discovery
```
$ npm install --prefix <temp-home>/pi-probe --ignore-scripts @earendil-works/pi-coding-agent
added 128 packages in 5s
$ ls -l <temp-home>/pi-probe/node_modules/.bin/pi
pi -> ../@earendil-works/pi-coding-agent/dist/bundle/cli.js
```

### 3.2 version
```
$ pi --version
0.84.4            # exit 0
$ find <temp-home>/pi-home -maxdepth 3
<temp-home>/pi-home            # NOTHING created by --version
```

### 3.3 help bootstraps the config dir (temp HOME diff)
```
$ pi --help | head -45        # exit 0; text matches args.ts printHelp
$ find <temp-home>/pi-home -maxdepth 4
<temp-home>/pi-home/.pi
<temp-home>/pi-home/.pi/agent
<temp-home>/pi-home/.pi/agent/auth.json          # top-level keys: []
<temp-home>/pi-home/.pi/agent/models-store.json  # top-level keys: []
```

### 3.4 offline model listing without credentials
```
$ PI_OFFLINE=1 pi --list-models
No models available. Use /login to log into a provider via OAuth or API key. See:
  <temp-home>/pi-probe/node_modules/@earendil-works/pi-coding-agent/docs/providers.md
  <temp-home>/pi-probe/node_modules/@earendil-works/pi-coding-agent/docs/models.md
# exit 0 — no network request needed to reach this state
```

### 3.5 unknown-flag tolerance (Agent-Box argv probe)
```
$ PI_OFFLINE=1 pi --agent-dir <temp-home>/nonexistent --version
0.84.4            # exit 0 — flag silently swallowed (args.ts unknownFlags)
```

### 3.6 RPC smoke probe (no model call)
```
$ printf '{"id":"r1","type":"get_state"}\n{"id":"r2","type":"get_available_thinking_levels"}\n' \
  | PI_OFFLINE=1 pi --mode rpc --no-session --provider deepseek --model deepseek/deepseek-v4-flash
{"id":"r1","type":"response","command":"get_state","success":true,"data":{
  "model":{"id":"deepseek-v4-flash","name":"DeepSeek V4 Flash","api":"openai-completions",
   "baseUrl":"https://api.deepseek.com","provider":"deepseek","reasoning":true,"input":["text"],
   "cost":{"input":0.14,"output":0.28,"cacheRead":0.0028,"cacheWrite":0},
   "contextWindow":1000000,"maxTokens":384000,
   "compat":{"supportsStore":false,"supportsDeveloperRole":false,"maxTokensField":"max_tokens",...},
   "thinkingLevelMap":{"minimal":null,"low":"low","medium":null,"high":"high","max":"max"}},
  "thinkingLevel":"high","isStreaming":false,"isCompacting":false,
  "steeringMode":"one-at-a-time","followUpMode":"one-at-a-time",
  "sessionId":"01a05fb5-cebd-7e95-86ca-cf2c801fab33","autoCompactionEnabled":true,
  "messageCount":0,"pendingMessageCount":0}}
{"id":"r2","type":"response","command":"get_available_thinking_levels","success":true,
 "data":{"levels":["off","low","high","max"]}}
# exit 0, stderr empty, no session file written (--no-session)
```
Confirms: `--provider/--model` accepted; built-in deepseek catalog contains `deepseek-v4-flash` (Agent-Box's default model is real); default thinkingLevel `high`; UUID sessionId generated in memory.

## 4. Agent-Box internal hypothesis ledger (read-only: `<workspace>/plugins/agent-box-harnesses/src/agent_box_harnesses/pi/*.py`, `harnesses.toml` pi block)

| # | Agent-Box assumption | Verdict | Evidence |
|---|---|---|---|
| 1 | `native_home = ".pi"` | CONFIRMED (name) with nuance | config root is `~/.pi/agent` (config.ts:524-530) — point the env var at the dir CONTAINING settings.json/skills/etc. |
| 2 | argv `["pi","--agent-dir","<guest>","--print"]` | REFUTED (flag) | no `--agent-dir` flag (args.ts, CHANGELOG); silently swallowed (probe 3.5). Correct: env `PI_CODING_AGENT_DIR` |
| 3 | `--print` headless | CONFIRMED | args.ts:157-163, print-mode.ts |
| 4 | `--provider` / `--model` / `--thinking high` | CONFIRMED | args.ts:104-107,147-156; probe 3.6 |
| 5 | `--session-dir <guest>/sessions` | CONFIRMED | args.ts:129-131; settings.md:256 |
| 6 | `--session <id or file>` continuation | CONFIRMED | args.ts:122-127 (`--session <path|partial-uuid>`) |
| 7 | `--session-id <execution-id>` create-if-missing | CONFIRMED (documented) | args.ts help L288; timing on disk unresolved |
| 8 | `--system-prompt <file path>` | PARTIALLY REFUTED | flag takes TEXT; `--append-system-prompt` accepts text or file contents; or project `<agent-dir>/SYSTEM.md` |
| 9 | `--skill-dir` | REFUTED | real flag is `--skill <path>` (repeatable); native discovery of `<agent-dir>/skills/` makes it unnecessary |
| 10 | `--mcp-config <guest>/mcp.json` + `mcp` slot | REFUTED | pi has NO MCP support (README:499); flag would be swallowed |
| 11 | Session JSONL: header `{type:"session",id,cwd}`; message entries `{type:"message",message:{role,provider,model}}` | CONFIRMED (v3) | docs/session-format.md:192-211 |
| 12 | Filename glob `*_<session_id>.jsonl` | CONFIRMED (shape) | `<timestamp>_<uuid>.jsonl` (session-format.md:8) |
| 13 | Continuation contract `agent-box-pi.continuation@1` mechanism | FEASIBLE/CONFIRMED | `--session`/`--continue`/`--fork` natively support it |
| 14 | `deepseek` provider + `deepseek/deepseek-v4-flash` model | CONFIRMED | probe 3.6 catalog entry |
| 15 | `version_probe ["--version"]`, PATH resolver | CONFIRMED | probes 3.1-3.2 |
| 16 | `payload_schema pi-profile-v1` JSON codec | FEASIBLE | settings.json/models.json are JSON; no conflict found |
| 17 | `guest_home = "/runtime/home"` + `skill_target /runtime/home/skills/{id}` | FEASIBLE with fix | works only if `PI_CODING_AGENT_DIR=/runtime/home/agent` (or settings rewritten) because discovery root is `<agent-dir>/skills`, NOT `<home>/.pi/skills` |

## 5. NOT_LOCALLY_OBSERVED (policy: no model calls)

Session file creation on a real run, `--continue` selection, `--mode json` live event stream over an actual prompt, OAuth `/login` flows, `pi auth print-*` output (needs stored creds), update/telemetry network payloads (offline flag used everywhere), Bun binary layout, Windows/macOS behavior. These rest on OFFICIAL_DOC/OFFICIAL_SOURCE at commit b8b873b and are tagged accordingly in FACTS.md.
