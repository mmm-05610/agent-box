# ACP_FACTS — OpenCode (harness id: opencode)

Date of research: 2026-09-02 (WSL2 x64 Linux). Verified local binary: **opencode 1.18.21**
(npm global install `<npm-global>/bin/opencode`). Upstream HEAD audited: **69c172e**
(2026-09-01, `dev` branch). Registry-listed version: 1.18.26.

Legend (source_class per SOURCE_POLICY.md §1):
- `[VENDOR_SRC]` = official repo source (github.com/anomalyco/opencode, dev @ 69c172e, 2026-09-02; paths relative to repo root; reached via sst/opencode 301-redirect)
- `[VENDOR_DOC]` = opencode.ai/docs (ACP page), observed 2026-09-02
- `[ACP_SPEC]` = agentclientprotocol.com docs, observed 2026-09-02
- `[ACP_SDK]` = @agentclientprotocol/sdk / agentclientprotocol org repos, observed 2026-09-02
- `[REGISTRY]` = ACP Registry (cdn.agentclientprotocol.com/registry/v1/latest/registry.json), observed 2026-09-02
- `[ZED_DOC]` = zed.dev/docs/ai/external-agents, observed 2026-09-02
- `[CLI]` = CLI_OBSERVED on local 1.18.21, 2026-09-02
- `[ISSUE]` = issue/discussion (limitation evidence only)
- `[INFER]` = inference (always marked)

Every fact line carries: source, source_class, observed, version, confidence, status, and (where
applicable) stability. The six fact classes of SOURCE_POLICY §2 are separated in section A.

## A. Six-fact separation (SOURCE_POLICY §2, one verdict per class)

| # | Fact class | Verdict | Key evidence |
|---|---|---|---|
| 1 | ACP official SDK exists | PROVEN (independent of any harness) | agentclientprotocol org maintains typescript-sdk (latest v1.4.0), python-sdk, rust-sdk, kotlin-sdk, java-sdk. [ACP_SPEC llms.txt] + [ACP_SDK GitHub org repo list], 2026-09-02. HIGH. |
| 2 | OpenCode has an ACP Registry manifest | PROVEN | `registry.json` entry id=`opencode`, name=OpenCode, version=1.18.26, repository=github.com/anomalyco/opencode, authors=["Anomaly"], per-platform binary distribution with `cmd: ./opencode`, `args: ["acp"]` + sha256. [REGISTRY], 2026-09-02. HIGH. |
| 3 | Third-party ACP wrapper for OpenCode | NOT NEEDED / none of significance | Native support exists (class 5). Historical community attempt PR #2422 "feat(opencode): add ACP stdio server for Zed + CLI switch" (2025-09-04) was closed UNMERGED. GitHub search for `opencode acp` returns only ACP *clients* (vscode-acp, acp-ui, agentic.nvim, obsidian-agent-client) that list OpenCode as one connectable agent — no maintained dedicated wrapper project. [VENDOR_SRC GitHub search], 2026-09-02. MEDIUM. |
| 4 | agentclientprotocol org maintains an opencode adapter | NO | Org repos (2026-09-02): agent-client-protocol, claude-agent-acp, codex-acp, python-sdk, kotlin-sdk, java-sdk, rust-sdk, typescript-sdk, symposium-acp, registry, meetings, .github. No opencode adapter exists (consistent with native support). [ACP_SDK], HIGH. |
| 5 | Vendor-official NATIVE ACP support | **YES — PROVEN** | `opencode acp` subcommand in shipped 1.18.21 CLI [CLI]; full implementation in official repo `packages/opencode/src/acp/*` (12 modules, 3537 LOC) importing official `@agentclientprotocol/sdk@0.21.0` [VENDOR_SRC package.json:57]; live `initialize` handshake answered on the wire [CLI experiment]; official docs page opencode.ai/docs/acp/ [VENDOR_DOC]; PR #2947 "Add ACP (Agent Client Protocol) support" merged 2025-10-20T21:55Z [VENDOR_SRC GitHub API]. HIGH. |
| 6 | Zed / other ACP clients can install and run OpenCode | PROVEN (listing + instructions; run quality not independently verified this round) | Zed docs: "Install OpenCode from the ACP Registry, then start an OpenCode thread from the Agent Panel"; opencode docs give `zed: acp registry` flow and custom `agent_servers` config `{"command":"opencode","args":["acp"]}`; also JetBrains `acp.json`, Avante.nvim, CodeCompanion.nvim recipes [VENDOR_DOC + ZED_DOC], 2026-09-02. HIGH for installability. |

## B. Identity

- B1 [CLI] `opencode --version` → `1.18.21`. observed 2026-09-02. confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.
- B2 [VENDOR_SRC] Official repo is **github.com/anomalyco/opencode** (GitHub id 975734319, org "anomalyco", description "The open source coding agent.", not a fork). **`sst/opencode` now returns HTTP 301 → this repo** (observed via API 2026-09-02); the 2026-09-01 native dossier's `sst/opencode` attribution is already stale. Registry author string: "Anomaly". confidence HIGH. status PROVEN. stability STABLE (as of 2026-09-02).
- B3 [VENDOR_SRC] License MIT. `packages/opencode/package.json` declares dependency `"@agentclientprotocol/sdk": "0.21.0"` (bun.lock pins sha512-ONj+…). npm latest @agentclientprotocol/sdk is 1.4.0 (typescript-sdk tags v1.0.0…v1.4.0) — opencode pins a pre-1.0 SDK line. confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.
- B4 [CLI] Distribution: standalone Bun-compiled ELF (`<npm-global>/lib/node_modules/opencode-ai/bin/opencode.exe`, 184 MB), platform packages `opencode-linux-x64` etc. as optionalDependencies. No runtime npx. confidence HIGH. status PROVEN. stability STABLE.
- B5 [REGISTRY] Registry distribution metadata pins GitHub release archives with sha256 per platform (linux-x86_64: opencode-linux-x64.tar.gz, sha256 7c20c1ff…), cmd `./opencode`, args `["acp"]`. confidence HIGH. status PROVEN. stability VERSION_SENSITIVE (per release).
- B6 [VENDOR_SRC] ACP git history: PR #2947 merged 2025-10-20T21:55:22Z ("Add ACP (Agent Client Protocol) support"); follow-ups #3317 (2025-10-21, switched to the non-deprecated `@agentclientprotocol` package) and #3336 (2025-10-24, ACP permission handling) merged. First npm stable published after the merge: 0.15.10 (2025-10-20T22:19Z) — presence of ACP in that exact build UNVERIFIED; presence in ≥1.18.21 locally PROVEN. confidence HIGH (merge), MEDIUM (first release). status PROVEN. stability STABLE.
- B7 [VENDOR_SRC] Open ACP PRs exist but are NOT merged as of 2026-09-02: #44524 "feat(acp): add ACP v2 draft support/features" (open, 2026-08-23), #45500 "fix(acp): advertise the compact command", #40654 "fix(acp): surface subagent activity", #41634 "fix(acp): respect default agent variant", #46682 (plugin activation before ACP catalog). "Discussion/PR exists" ≠ shipped. confidence HIGH. status PROVEN.

## C. Launch (ACP mode)

- C1 [CLI] `opencode acp` — "start ACP (Agent Client Protocol) server". Options: `--port` (default 0 = random; internal HTTP server only), `--hostname` (default 127.0.0.1), `--mdns` (default false), `--mdns-domain`, `--cors`, `--cwd` (default = process cwd), plus global `--print-logs`, `--log-level DEBUG|INFO|WARN|ERROR`, `--pure`. confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.
- C2 [VENDOR_SRC cli/cmd/acp.ts] Launch semantics: boots the same internal HTTP `Server.listen(opts)` used by `opencode serve`, creates an `@opencode-ai/sdk/v2` client pointed at `http://<hostname>:<port>` with `ServerAuth.headers()`, then bridges ACP JSON-RPC over **stdin/stdout ndjson** (`AgentSideConnection` + `ndJsonStream`). Sets env `OPENCODE_CLIENT=acp`. Process stays alive until stdin EOF, then exits 0. confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.
- C3 [CLI experiment 2026-09-02] Synthetic ACP client test against installed 1.18.21 with temp XDG home: sent `initialize` frame on stdin; got one ndjson reply within ~2 s; process exited 0 on stdin close. The agent answers ACP on the shipped binary, no credentials, no network to providers. confidence HIGH. status PROVEN. stability STABLE for this version.
- C4 [CLI experiment] Wire reply (verbatim, 1.18.21):
  `{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true,"mcpCapabilities":{"http":true,"sse":true},"promptCapabilities":{"embeddedContext":true,"image":true},"sessionCapabilities":{"close":{},"fork":{},"list":{},"resume":{}}},"authMethods":[{"description":"Run \`opencode auth login\` in the terminal","name":"Login with opencode","id":"opencode-login"}],"agentInfo":{"name":"OpenCode","version":"1.18.21"}}}`
  confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.
- C5 [VENDOR_SRC service.ts:112-136] `initialize` advertises: `protocolVersion: 1`; auth method id `opencode-login` (description tells the human to run `opencode auth login` in a terminal); when `clientCapabilities._meta["terminal-auth"] === true` the auth method carries `_meta.terminal-auth = {command:"opencode", args:["auth","login"], label:"OpenCode Login"}`. `authenticate` accepts only `opencode-login` and returns `{}` (it performs no credential action itself). confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.
- C6 [ACP_SPEC protocol/initialization] protocolVersion is a single integer identifying a MAJOR version; current spec examples show 1; v2 docs exist (draft section, migration guide) — opencode ships **v1** and its v2 support PR (#44524) is unmerged. confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.
- C7 [VENDOR_SRC cli/cmd/acp.ts + CLI experiment] `--cwd` names the default project directory; each `session/new` carries its own `cwd` param which is passed to `sdk.session.create({directory: params.cwd})`, so one ACP process can host sessions in multiple directories chosen by the client. confidence HIGH (source), MEDIUM (multi-cwd not live-tested). status PARTIAL. stability VERSION_SENSITIVE.
- C8 [CLI] `opencode acp` is offline-safe for `--help` and for `initialize` (no provider credentials present, no model request — experiment C3 produced no network error and no auth.json). confidence HIGH. status PROVEN.

## D. Configuration and isolation

- D1 [VENDOR_SRC + CLI experiment] ACP mode boots the same core as serve/run, therefore ALL native config machinery applies: `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_PURE`, XDG_DATA/CACHE/CONFIG/STATE_HOME redirection, `OPENCODE_AUTH_CONTENT`, `OPENCODE_DB`. [INFER grounding: acp.ts calls the same `Server.listen` + core boot; identical auto-seed behavior observed in experiment]. confidence HIGH. status PROVEN (env honoring itself = native dossier D5/D6/F10). stability VERSION_SENSITIVE.
- D2 [CLI experiment 2026-09-02] Temp-home probe (`<temp-home>/oc-acp-probe-*`): after `initialize` only, opencode had created `data/opencode/{opencode.db,opencode.db-wal,opencode.db-shm}`, `data/opencode/log/opencode.log`, `data/opencode/repos/`, `cache/opencode/models.json`, `cache/opencode/bin/`, `state/opencode/locks/`, and seeded `config/opencode/{opencode.jsonc,.gitignore,package.json,package-lock.json,node_modules/}`. NO auth.json (none existed). Same write profile as native run. confidence HIGH. status PROVEN.
- D3 [VENDOR_SRC acp/profile.ts] Hidden profiling switch: `OPENCODE_ACP_PROFILE=1` prints `[acp-profile] <name> <ms>` timings to **stderr** (does not pollute the ACP stdout ndjson channel). confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.
- D4 [VENDOR_SRC permission.ts:99-115] On an approved `edit` permission the agent may call the CLIENT method `fs/write_text_file` to apply the patched file content. Consequence: a full-featured ACP host MUST implement `fs/write_text_file` (and advertise `clientCapabilities.fs.writeTextFile`), otherwise edits still work through the harness's own tools but the ACP-edit fast path auto-rejects (catch → reply "reject"). `fs/read_text_file` is NOT referenced anywhere in `src/acp/` (opencode reads files with its own tools). confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.
- D5 [VENDOR_SRC session.ts, service.ts] ACP session ids ARE native opencode session ids (opencode.db). Per-process in-memory overlay (Ref Map) tracks model/variant/mode/known-part metadata; `loadSession`/`resumeSession` rebuild from the server DB (`session.messages` — load replays full history, resume restores from last 20 messages). Sessions survive acp-process restarts via the DB; listSessions merges live + DB entries (paginated, 100/page). confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.
- D6 [VENDOR_SRC service.ts:728-782] Directory snapshot per cwd: providers, agents (modes = non-subagent non-hidden agents; defaultModeID = first primary non-hidden agent, fallback "build"), commands + skills flattened into `available_commands_update`, default model resolution (config model → "opencode" provider best → globally best sorted). confidence HIGH. status PROVEN. stability VERSION_SENSITIVE.

## E. ACP coverage table

Status words per SOURCE_POLICY §6. "Source" = code path or wire evidence. All rows observed 2026-09-02, version 1.18.21 / dev@69c172e, source_class VENDOR_SRC unless noted, confidence HIGH, stability VERSION_SENSITIVE.

| ACP surface | Status | Evidence / notes |
|---|---|---|
| initialize / capabilities | SUPPORTED | service.ts:94-139; wire reply C4. protocolVersion 1; agentInfo OpenCode+version. |
| authenticate | PARTIAL | service.ts:141-146: accepts methodId `opencode-login`, returns {} — real credentials still come from auth.json/env; no interactive login over ACP. |
| session/new | SUPPORTED | service.ts:163-209. Registers client-supplied mcpServers, emits `available_commands_update`, returns configOptions (model/effort/mode). |
| session/load (resume history) | SUPPORTED | agentCapabilities.loadSession=true; service.ts:211-244; replays prior messages as agent/user/thought chunks + tool calls (event.ts replayMessage). |
| session/list | SUPPORTED | service.ts:246-290 (unstable-but-declared via sessionCapabilities.list; cursor pagination 100/page, merges DB + live). |
| session/resume | SUPPORTED | service.ts:292-328 (no replay, restore last 20 messages metadata). |
| session/close | SUPPORTED | service.ts:341-349: drops state, aborts backing native session. |
| unstable_forkSession | SUPPORTED (unstable namespace) | service.ts:356-398 → sdk.session.fork + replay. NOTE: ACP session-fork is an RFD (ACP_SPEC rfds/session-fork). |
| session/prompt | SUPPORTED | service.ts:494-575; text/image/resource_link/resource content → native parts (content.ts); slash-command detection routes to session.command; `/compact` special-cased to session.summarize; runUntilIdle sync (returns only after native session idle). |
| stopReason mapping | SUPPORTED | end_turn / cancelled (MessageAbortedError) / max_tokens (MessageOutputLengthError) / refusal (ContentFilterError); ProviderAuthError → auth_required error (error.ts:78-79); others → internal error. service.ts:824-873. |
| streaming text (agent_message_chunk) | SUPPORTED | event.ts:231-243 maps `message.part.delta` field=text (non-ignored) → agent_message_chunk. |
| thinking (agent_thought_chunk) | SUPPORTED | event.ts:246-258 maps reasoning-part deltas; replay also emits thought chunks (event.ts:122-142). |
| tool_call / tool_call_update | SUPPORTED | event.ts:295-394 + tool.ts: pending → tool_call (kind read/search/edit/execute/fetch/think/other, locations, rawInput with shell workdir); running → in_progress (bash output snapshotting dedup); completed → content + rawOutput (read display metadata, edit diffs, image attachments); error → failed + rawOutput.error. |
| file edits diff | SUPPORTED | permission.ts:183-217 builds ACP `diff` content (oldText/newText via unified-patch application) for edit permissions; tool.ts:325-338 builds diff content from edit tool oldString/newString; multi-file edits use `files[].patch` metadata. |
| usage in PromptResponse | SUPPORTED | usage.ts buildUsage: input/output/total + thoughtTokens/cachedRead/cachedWrite (usage.ts:90-103). |
| usage_update (context window + cost) | SUPPORTED | sessionUpdate `usage_update` with used (input+cache.read+cache.write), size (model limit.context), cost {amount USD} (service.ts:624-666, usage.ts:183-221). |
| permission / request_permission | SUPPORTED | permission.ts: event `permission.asked` → `session/request_permission` with options allow_once/allow_always/reject_once; client absent/error → auto-reject (native headless parity); queued per session. |
| cancel | SUPPORTED | service.ts:351-354 → sdk.session.abort; stopReason cancelled returned. |
| steer (mid-turn follow-up) | UNKNOWN | No ACP mapping of native prompt_async/message-on-busy found in src/acp. ACP v1 has no steer primitive; client would have to wait for end_turn. |
| session modes (build/plan agents) | SUPPORTED | configOptions include `mode` select (service.ts:440-452); setSessionMode; modes derived from agents (directory.ts:754-760). |
| setSessionModel / effort variants | SUPPORTED | setSessionModel (service.ts:467-480), configId "model" and "effort" via setSessionConfigOption (service.ts:400-455). NOTE: issues #46311/#34743/#41628 report default-model/variant-from-config NOT honored in some ACP paths (limitation evidence). |
| setSessionConfigOption (generic) | PARTIAL | Only ids `model`, `effort`, `mode` implemented (service.ts:409-454); everything else → invalid_params. |
| available_commands_update (slash commands) | SUPPORTED | service.ts:936-956 (commands + skills); prompt routes known commands to session.command (service.ts:531-553). Docs: "Some built-in slash commands like /undo and /redo are currently unsupported" [VENDOR_DOC]. |
| MCP servers (client-declared) | SUPPORTED | initialize mcpCapabilities {http:true, sse:true}; newSession/load/resume register client mcpServers via sdk.mcp.add (local stdio + remote) with de-dup by stable config key (service.ts:958-1026). |
| images in prompt | SUPPORTED | promptCapabilities.image=true; content.ts:41-72 (data:, data-uri, http(s) uri → native file parts). |
| embeddedContext (resource/resource_link) | SUPPORTED | promptCapabilities.embeddedContext=true; content.ts:74-117 (file://, zed:// URI handling, text resources, blobs). |
| client fs/read_text_file | NOT_USED | Agent never calls it (src/acp has no reference). Not required by host. |
| client fs/write_text_file | USED (edit fast path) | permission.ts:110-114 applies approved edit diffs via client writeTextFile. Host should implement or accept auto-reject of that path. |
| client terminal/* | NOT_USED | No terminal/create/output/wait/kill/release calls in src/acp (strings in binary are SDK schema residue). |
| agent_plan (todo updates) | NOT_SUPPORTED | ACP has an agent-plan update type; opencode ACP event.ts maps only session.status, permission.asked, message.part.updated, message.part.delta — native `todo` events are NOT forwarded. |
| elicitation / question (AskUser) | NOT_SUPPORTED | Native `question.asked` events have no ACP mapping (no `question` handling in event.ts); a native question mid-ACP-turn would stall the turn with no host-visible prompt. RISK — see Reliability. |
| subagent activity | PARTIAL | `task` tool surfaces as tool_call kind=think; inner subagent parts not surfaced (open PR #40654 "fix(acp): surface subagent activity"). |
| session locator (native id) | SUPPORTED | sessionId == native opencode session id (opencode.db); exportable via native `opencode export`. |
| native errors propagation | PARTIAL | error.ts maps to RequestError classes (invalid_params/auth_required/method_not_found/internal_error) with safeMessage; native detail (service, errorName) only in `_meta`. |
| process exit | SUPPORTED | stdin EOF → clean exit 0 (CLI experiment C3; acp.ts waits on stdin end). |
| ACP v2 | NOT_SUPPORTED (in 1.18.21/HEAD) | protocolVersion always 1; v2 draft PR #44524 open, unmerged. [VENDOR_SRC B7] |

## F. Fidelity vs native path (native = `opencode run --format json` / serve SSE, per 2026-09-01 dossier)

Preserved by the ACP bridge (near-lossless): text + reasoning deltas; tool call lifecycle incl. bash output snapshots, read display text, edit diffs, image attachments; permission ask/approve/deny (allow_once/always semantics); cancel/abort; model & agent(mode) switching incl. effort variants; slash commands incl. skills-as-commands; MCP servers (both client-declared and opencode-configured); images and embedded context in prompts; token usage + cost + context-window usage_update; session ids, list/load/resume/fork/close; clean process exit.

Lost or degraded on the ACP path (each item: native evidence → ACP gap):

- F1 Native `question.asked` interactive AskUser tool → NO ACP mapping (event.ts). A question mid-turn stalls with no host surface. [VENDOR_SRC; HIGH; risk]
- F2 Native `todo`/plan events → ACP `agent_plan` update NOT emitted (ACP supports it; opencode does not send it). [VENDOR_SRC]
- F3 Native step-start/step-finish parts → no ACP counterpart (step boundaries inferable only from usage/turn end). [VENDOR_SRC]
- F4 Native session revert/unrevert, share/unshare, message/part deletion/update surgery (HTTP groups) → not exposed over ACP; docs confirm `/undo` and `/redo` unsupported over ACP. [VENDOR_SRC + VENDOR_DOC]
- F5 Native per-message retry/compaction events, `agent`/`subtask`/`snapshot`/`patch` part types → no ACP update types emitted for them (compaction reachable only via `/compact` slash special-case). [VENDOR_SRC]
- F6 Native subagent streaming (task tool inner events) → collapsed into a single tool_call (PR #40654 open). [VENDOR_SRC + ISSUE]
- F7 Native `OPENCODE_SERVER_USERNAME/PASSWORD`-protected multi-client server with TUI attach etc. — ACP mode is one-client-per-process stdio; no multi-client fan-out. [INFER from acp.ts; MEDIUM]
- F8 Config-default bugs in ACP path reported: per-agent model config ignored (#46311), Xcode ACP ignores opencode.json model → big-pickle default (#34743), fresh-session default agent variant ignored (#41628, fix open #41634). [ISSUE; limitation evidence]
- F9 Kept native-only (no ACP need): `opencode db` SQL observation channel, `export/import`, `stats`, revert APIs — host can still use these OUT OF BAND against the same data dir because ACP sessions are native sessions in opencode.db. [INFER; HIGH]

## G. Reliability

- G1 [CLI experiment] Lifecycle: single OS process; clean exit 0 on stdin EOF within seconds; no orphan children (in-process HTTP server; /proc scan showed 0 children). HIGH, single trial per probe.
- G2 [CLI experiment + VENDOR_SRC] Internal HTTP server binds 127.0.0.1 on an ephemeral port (observed :4096 with `--port 0`... default). The ACP channel itself does not use HTTP; the port is internal only. Host sandboxes must allow loopback listen/connect inside the sandbox. HIGH.
- G3 [VENDOR_SRC event.ts:144-150] Event fan-in uses `sdk.global.event` SSE against the internal server with a 1000 ms reconnect loop; `runUntilIdle` waiter rejects if the event stream disconnects (prompt would surface an error rather than hang forever). MEDIUM-HIGH, source-verified, not fault-injected.
- G4 [VENDOR_SRC session.ts idle waiters] prompt() resolves only when the native session reports idle via the event stream; a lost event stream rejects the waiter (G3). Turn-boundary is well-defined. MEDIUM-HIGH.
- G5 [ISSUE #26416] "High CPU use in idle on macOS (Desktop & cli)" — not ACP-specific but relevant to long-lived processes. LOW-MEDIUM, limitation evidence.
- G6 [VENDOR_DOC] Known ACP-mode limitation: /undo, /redo unsupported. HIGH (vendor doc).
- G7 [INFER] Process-per-client: concurrent ACP clients each spawn their own `opencode acp`; they share the same global data dir (SQLite DB + locks) exactly like concurrent native runs/serve instances — the 2026-09-01 dossier's concurrency model (F7/F8: locks + per-project DB rows) applies unchanged. MEDIUM-HIGH.

## H. Security

- H1 [CLI experiment] Credential boundary: auth.json at `$XDG_DATA_HOME/opencode/auth.json` (native dossier E1) — never created or read in the probe; ACP adds no new credential store; `OPENCODE_AUTH_CONTENT` injection path is core (native dossier E3) and applies. HIGH.
- H2 [VENDOR_SRC server/auth.ts] Internal HTTP server auth: required() only when `OPENCODE_SERVER_PASSWORD` is set; DEFAULT IS UNAUTHENTICATED on 127.0.0.1. Any local process in the same network namespace that learns the ephemeral port can drive the instance API (create sessions, reply permissions, run SQL-ish routes). Mitigation for hosts: set `OPENCODE_SERVER_PASSWORD` (headers auto-attached by ServerAuth.headers()) or isolate the netns. HIGH (source-verified).
- H3 [CLI] `--mdns` (default FALSE) would advertise the server on the network and default hostname to 0.0.0.0 — must stay off in sandboxed profiles. HIGH.
- H4 [CLI/VENDOR_SRC] Supply chain: runtime is a standalone pinned binary; no npx at ACP runtime. npm install path = `opencode-ai` + platform optionalDependency + postinstall download; ACP Registry path = GitHub release archive + pinned sha256 (B5). prefer-local-binary. HIGH.
- H5 [VENDOR_SRC permission.ts] Permission defaults over ACP: if the client does not implement requestPermission, every ask is REJECTED (fail-closed). Auto-approve only via native config `permission` allow rules or `--auto`-equivalent config, not silently. HIGH.
- H6 [CLI experiment D2] Profile boundary: config seeding happens in whatever config root it sees; hosts must pre-render opencode.json (native adapter pattern) or redirect `OPENCODE_CONFIG_DIR`/`OPENCODE_CONFIG_CONTENT` to keep the seeded default out. Verified writes occurred into temp XDG roots only. HIGH.
- H7 [VENDOR_SRC service.ts] ACP `newSession` writes client-supplied MCP servers into the opencode MCP registry (`sdk.mcp.add`) for the process lifetime — a malicious/compromised ACP client can inject local command-executing MCP servers. Boundary note for hosts that let external clients speak ACP. MEDIUM.

## I. Process topology verdict (double-spawn question)

**SAFE_WITHIN_EXISTING_RUNTIME** (for an ACP-capable host runtime), with the following reasoning:

1. ACP launch is the standard editor→agent pattern: host spawns `<binary> opencode acp [--cwd <dir>]`, communicates JSON-RPC/ndjson over inherited stdio, kills or lets stdin-EOF end it (exit 0 verified).
2. No second host-visible process is spawned: the internal HTTP server is in-process (verified /proc: zero children), listening on 127.0.0.1 ephemeral port that only the process itself uses. No port coordination is needed from the host (unlike `opencode serve`/`run --attach`).
3. State footprint is confined to the four XDG roots + /tmp/opencode scratch (native dossier), fully redirectable per sandbox; verified in temp-home probe.
4. Caveats that do NOT change the verdict but must be encoded in the runtime profile: (a) loopback listen must be permitted inside the sandbox; (b) set `OPENCODE_SERVER_PASSWORD` or isolate netns because the internal API is unauthenticated by default (H2); (c) `--mdns` stays off; (d) client should implement `fs/write_text_file` (D4) and ideally `session/request_permission`, else edits/permissions fail closed.
5. If the host runtime is NOT ACP-capable (only spawns CLI argv and parses stdout), integrating OpenCode ACP means implementing an ACP client — that is a runtime change of the host, not of the harness: `REQUIRES_RUNTIME_CHANGE` at the host layer. The harness itself is not the blocker.

## J. Admission decision

**NATIVE_PRIMARY** (ACP: viable, optional alternative).

- OpenCode is one of the strongest native ACP citizens (vendor-native since 2025-10-20, PR #2947; official docs; registry manifest; v1 protocol + load/list/resume/fork/config-options/usage — above baseline).
- But Agent-Box already ships a native adapter (`opencode run --format json`) with decode/permission/continuation wiring (plugins/agent-box-harnesses/src/agent_box_harnesses/adapters/opencode.py), and the native path preserves surfaces ACP loses (questions, todos/plan, revert/undo, subagent streams, step boundaries — F1-F6).
- Recommended stance: keep native run-json primary; ACP route is available for editor-interop or when a unified ACP client layer lands, with the risk list above encoded. If Agent-Box later standardizes on an ACP client, opencode qualifies with LOW integration risk (no wrapper, official support, registry distribution with sha256).

## OPEN_QUESTIONS (UNKNOWN semantics per policy)

- Q1 Exact behavior of a native `question.asked` during an ACP turn (stall duration, timeout, abort semantics) — requires a live credentialed session; NOT probed (policy: no model requests).
- Q2 Whether npm 0.15.10 (first post-merge stable) actually contained the ACP command (tag-level check not done).
- Q3 Live multi-cwd behavior of one acp process (C7 source-verified only).
- Q4 ACP v2 migration timeline (PR #44524 open; v2 spec in draft).
- Q5 Reconnect/fault-injection behavior of the 1 s event-loop retry under real SSE drops (G3) — source-verified only.
