# Experiments — Pi Coding Agent (`pi`) — 2026-09-02

Environment: WSL2 x64 Linux, node v22.23.2, npm 10.9.8. All runs under isolated
`HOME=<temp-home>/pi-home`. The probe prefix `<temp-home>/pi-probe` and the clone
`<temp-home>/pi-mono` are disposable. Real `<user-home>/.pi` was never written;
no model/API calls, no paid calls, no login; offline flags set for every run.

## 1. Install layout (isolated prefix)

```
$ npm install --prefix <temp-home>/pi-probe --ignore-scripts @earendil-works/pi-coding-agent
added 128 packages in 5s

<temp-home>/pi-probe/
└── node_modules/
    ├── .bin/pi -> ../@earendil-works/pi-coding-agent/dist/bundle/cli.js
    └── @earendil-works/
        ├── pi-coding-agent/        # dist/bundle/cli.js, docs/, README, CHANGELOG
        ├── pi-agent-core/  pi-ai/  pi-tui/  ...   (transitive @earendil-works deps)
```

Wrong package that would have been installed from the stale lead:
`@mariozechner/pi@0.70.6` → bin `pi-pods` (vLLM pods CLI) — verified against the
npm registry only, NOT installed.

## 2. Temp-HOME diff timeline

| Step | Command | New paths under `<temp-home>/pi-home` |
|---|---|---|
| baseline | — | (empty) |
| `--version` | `pi --version` | none (no output) |
| `--help` | `pi --help` | `.pi/agent/auth.json` ({}), `.pi/agent/models-store.json` ({}) |
| `--list-models` offline | `PI_OFFLINE=1 pi --list-models` | none new |
| unknown flag | `PI_OFFLINE=1 pi --agent-dir <tmp>/x --version` | none new |
| RPC get_state | `PI_OFFLINE=1 pi --mode rpc --no-session ...` | none new (`.pi/agent` dir mtime only) |

`auth.json`/`models-store.json` are created EMPTY (`{}`) — scaffold only; no
credential contents read at any point.

## 3. Probe transcripts (sanitized)

### 3.1 version + no-side-effect check
```
$ HOME=<temp-home>/pi-home <temp-home>/pi-probe/node_modules/.bin/pi --version
0.84.4
$ echo $?
0
$ find <temp-home>/pi-home -maxdepth 3
<temp-home>/pi-home
```

### 3.2 help (abridged; full text == repo args.ts printHelp)
```
$ pi --help
pi - AI coding assistant with read, bash, edit, write tools
Usage:
  pi [options] [--] [@files...] [messages...]
Commands:
  pi install <source> [-l] ... pi auth <command> ...
Options:
  --provider <name>  (default: google)     --model <pattern>
  --api-key <key>                          --system-prompt <text>
  --append-system-prompt <text>            --mode <text|json|rpc>
  --print, -p                              --continue, -c   --resume, -r
  --session <path|id>  --session-id <id>  --fork <path|id>
  --session-dir <dir>  --no-session  --name, -n <name>
  --tools/-t  --exclude-tools/-xt  --no-tools/-nt  --no-builtin-tools/-nbt
  --thinking <off|minimal|low|medium|high|xhigh|max>
  --extension, -e  --no-extensions  --skill  --no-skills
  --prompt-template  --no-prompt-templates  --theme  --use-theme  --no-themes
  --no-context-files, -nc  --export <file>  --list-models [search]
  --tui-mode <regular|fullscreen>  --verbose  --approve, -a  --no-approve, -na
  --offline  --  --help, -h  --version, -v
Extensions can register additional flags (e.g., --plan from plan-mode extension).
```
NOTE: no `--agent-dir`, no `--skill-dir`, no `--mcp-config` in the flag set.

### 3.3 offline model listing
```
$ PI_OFFLINE=1 pi --list-models
No models available. Use /login to log into a provider via OAuth or API key. See:
  <temp-home>/pi-probe/node_modules/@earendil-works/pi-coding-agent/docs/providers.md
  <temp-home>/pi-probe/node_modules/@earendil-works/pi-coding-agent/docs/models.md
$ echo $?
0
```

### 3.4 unknown-flag tolerance (argv contract probe for Agent-Box)
```
$ PI_OFFLINE=1 pi --agent-dir <temp-home>/nonexistent --version
0.84.4
$ echo $?
0
```
`--agent-dir` matches no known flag; parser stores it in `unknownFlags`
(potential extension flag) and continues. Adapter argv built on it will run
BUT silently keep the default `~/.pi/agent` config root.

### 3.5 RPC mode, non-model commands only
```
$ printf '{"id":"r1","type":"get_state"}\n{"id":"r2","type":"get_available_thinking_levels"}\n' \
  | HOME=<temp-home>/pi-home PI_OFFLINE=1 timeout 45 pi --mode rpc --no-session \
      --provider deepseek --model deepseek/deepseek-v4-flash
{"id":"r1","type":"response","command":"get_state","success":true,"data":{...}}
{"id":"r2","type":"response","command":"get_available_thinking_levels","success":true,
 "data":{"levels":["off","low","high","max"]}}
$ echo $?
0     # stderr empty
```
get_state payload (abridged, values as printed):
- model: id `deepseek-v4-flash`, provider `deepseek`, api `openai-completions`,
  baseUrl `https://api.deepseek.com`, reasoning true, contextWindow 1000000,
  maxTokens 384000, cost in/out 0.14/0.28 USD-per-Mtok
- thinkingLevel: `high` (pi default for this model — matches Agent-Box default)
- steeringMode/followUpMode `one-at-a-time`; autoCompactionEnabled true
- sessionId `01a05fb5-...` (uuid, in-memory because `--no-session`)

## 4. Fake-executable / argv capture checks

Not needed beyond 3.4: the real binary's own parser is the ground truth for
unknown-flag handling, and it was exercised directly. No shim required.

## 5. Source inspection notes (clone `<temp-home>/pi-mono`, commit b8b873b)

- `git log -1`: `2026-09-01 14:42 +0200 fix(ai): add supportsMaxOutputTokens compat flag for openai-responses (#8941)`
- `packages/coding-agent/package.json`: name/version 0.84.4, bin pi → dist/bundle/cli.js, engines node >=22.19.0
- `src/cli/args.ts`: parser + full help + env-var table (PI_CODING_AGENT_DIR, PI_CODING_AGENT_SESSION_DIR, PI_PACKAGE_DIR, PI_OFFLINE, PI_TELEMETRY, PI_SHARE_VIEWER_URL, >35 provider key env vars)
- `src/config.ts`: `.pi` config dir name; `~/.pi/agent` root; auth/models/settings/trust/keybindings paths; sessions dir; themes/tools/bin/prompts dirs; `PI_PACKAGE_DIR`
- `src/modes/print-mode.ts`: exit codes (0 ok / 1 error|aborted / 143 SIGTERM / 129 SIGHUP); JSON mode header-first streaming
- `docs/session-format.md`, `docs/json.md`, `docs/rpc.md`, `docs/settings.md`, `docs/models.md`, `docs/skills.md`, `docs/windows.md`: cited per-FACTS.md
- CHANGELOG grep: `--agent-dir` absent across all 5,625 lines; 0.84.4 dated 2026-08-28; 0.84.3 (2026-08-24) added PowerShell tool + safer managed updates

## 6. Safety ledger

- Network: only npm registry metadata GETs + `git clone` of the official repo; all CLI probes run with `PI_OFFLINE=1` (3.1/3.2 without it only touched temp HOME before any network op — no pi.dev calls observed, and `--version`/`--help` perform none per source).
- No credential reads: only `json.load(...).keys()` on two freshly scaffolded empty files inside the temp HOME.
- Real home: untouched. No global installs. No git write ops in `<workspace>`.
