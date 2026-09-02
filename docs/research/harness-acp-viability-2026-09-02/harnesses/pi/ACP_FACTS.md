# Pi Coding Agent — ACP Viability Facts

- Round: harness-acp-viability-2026-09-02 (read-only product research)
- Observed: 2026-09-02 (WSL2 x64 Linux)
- Policy: `../SOURCE_POLICY.md` (source classes, six-fact separation, sanitization, verdict vocabularies)
- Version pins: **pi 0.84.4** (`@earendil-works/pi-coding-agent`, npm latest, published 2026-08-28);
  **pi-acp 0.0.33** (third-party adapter, npm, published 2026-07-30); **ACP protocol v1** (v2 = draft);
  `@agentclientprotocol/sdk` 1.4.0 (v1 stable entry point); pi-mono HEAD `b8b873b9872db04a938fb4357b5e8e824ddc051c` (2026-09-01)
- Cross-reference: `<workspace>/docs/research/harness-native-knowledge-2026-09-01/harnesses/pi/FACTS.md` (native research, id FACTS-x)
- Sanitization: `<user-home>` real home, `<temp-home>` isolated probe root (`/tmp/pi-acp-probe`, `/tmp/pi-probe-home2`),
  `<workspace>` this repo, `<agent-box-studio>` Codeg repo, `<binary>` the `pi` cli.js entry in the isolated prefix, `<npm-global>` npm global prefix

## IDENTITY

- **ID1.** Harness: Pi Coding Agent, npm `@earendil-works/pi-coding-agent`, bin `pi`, vendor Earendil Works (Mario Zechner / badlogic). NOT `@mariozechner/pi` (repurposed unrelated `pi-pods` package). [source: FACTS-A2/A3 + npm registry metadata; source_class: VENDOR_SOURCE + CLI_OBSERVED; observed: 2026-09-02; version: 0.84.4; confidence: HIGH; status: PROVEN; stability: STABLE]
- **ID2.** Six-fact separation — (1) ACP official SDK exists: YES, but is a protocol fact, not a Pi fact. [source: https://github.com/agentclientprotocol/typescript-sdk README (npm `@agentclientprotocol/sdk`); source_class: ACP_SDK; observed: 2026-09-02; version: 1.4.0 (v1 stable; v2 behind `/experimental/v2` import, explicitly draft); confidence: HIGH; status: PROVEN]
- **ID3.** (2) Pi has an ACP Registry manifest: YES — `pi-acp` entry, `"id":"pi-acp"`, `"version":"0.0.33"`, `"distribution":{"npx":{"package":"pi-acp@0.0.33"}}`, authors `Sergii Kozak`. Listed on ACP agents page as "Pi (via pi-acp adapter)". [source: https://raw.githubusercontent.com/agentclientprotocol/registry/main/pi-acp/agent.json + https://agentclientprotocol.com/get-started/agents.md; source_class: REGISTRY_ENTRY; observed: 2026-09-02; version: 0.0.33; confidence: HIGH; status: PROVEN] NOTE: registry listing proves installability, NOT vendor-native support.
- **ID4.** (3) Third-party pi ACP wrapper exists: YES — github.com/svkozak/pi-acp = npm `pi-acp` 0.0.33 (created 2025-12-20, last publish 2026-07-30). MIT, `bin.pi-acp`, deps only `@agentclientprotocol/sdk ^0.26.0` + `zod ^3.25.0`, engines node>=20, npm publish provenance enabled. Contributors: svkozak(126), raphaelluethy(6), ryanmazzolini(3), et al. — NO pi maintainer among them. [source: npm registry + https://api.github.com/repos/svkozak/pi-acp/contributors + clone HEAD d1cffc0 2026-07-30; source_class: PEER_PROJECT; observed: 2026-09-02; version: 0.0.33; confidence: HIGH; status: PROVEN]
- **ID5.** (4) ACP org maintains a pi adapter: NO. github.com/agentclientprotocol repos = agent-client-protocol, claude-agent-acp, codex-acp, symposium-acp, acpr, python/typescript/rust/kotlin/java-sdk, registry, docs, meetings. No pi repo. [source: https://api.github.com/orgs/agentclientprotocol/repos; source_class: ACP_ADAPTER_ORG (absence check); observed: 2026-09-02; confidence: HIGH; status: PROVEN (negative)]
- **ID6.** (5) Pi vendor-native ACP support: **NO.** Monorepo HEAD b8b873b: case-insensitive grep for `acp` over 9 packages hits ONLY false positives (`llamaCpp`, `gacPath`, `GOOGLE_APPLICATION_CREDENTIALS`); word-boundary/case-sensitive `ACP`/`acp` = zero hits; zero hits for `agent-client-protocol`/`agentclientprotocol`/`zed-industries`. CLI mode type is `Mode = "text" | "json" | "rpc"` (packages/coding-agent/src/cli/args.ts:11) — no `--mode acp`, no acp subcommand, no acp package. Installed dist bundle (19 MB) + docs + README + CHANGELOG of the published 0.84.4 tarball: zero ACP references. [source: /tmp/pi-mono-acp clone + `<temp-home>/pi-acp-probe/node_modules/@earendil-works/pi-coding-agent`; source_class: VENDOR_SOURCE + CLI_OBSERVED; observed: 2026-09-02; version: 0.84.4 / b8b873b; confidence: HIGH; status: PROVEN (negative); stability: VERSION_SENSITIVE]
- **ID7.** Vendor stance on ACP (author quote): issue #175 "ACP Support" closed 2025-12-13 by **badlogic**: "I currently have no need for ACP support, so that's a no for me I'm afraid. It should however be trivial to build an ACP adapter on top of RPC mode. See packages/coding-agent/docs/rpc.md. If you can figure out a not super invasive way to support this, e.g. as a new mode, I'll be happy to merge a nice PR." Community PRs proposing `pi --mode acp` (#241 2025-12-19, #836 2026-01-19) closed UNMERGED; PR #6660 ("ACP fork banner and upstream plan") auto-closed 2026-07-15 by contributor-policy bot. No ACP code ever landed. [source: https://github.com/earendil-works/pi/issues/175, /pull/241, /pull/836, /pull/6660; source_class: ISSUE_DISCUSSION; observed: 2026-09-02; confidence: HIGH; status: PROVEN] NOTE: this is limitation/stance evidence, not capability evidence.
- **ID8.** (6) Host applications can install+run Pi: Zed YES — "Pi Coding Agent" is a curated "Common External Agent" in Zed External Agents docs, installable via `acp registry` → "Install from Registry", with a dedicated Pi section ("Configure provider auth in Pi"). Codeg YES — `<agent-box-studio>/src/lib/api.ts:1005-1031` exposes `acpInstallPiBinary` (global npm install of `@earendil-works/pi-coding-agent` as prerequisite for "pi-acp spawns `pi --mode rpc`") and `acpPrepareNpxAgent` installs the pi-acp adapter; pi-specific trust gating APIs `acp_pi_set_project_trust` / `acp_pi_acknowledge_project_trust` / `acp_pi_list_trust_entries` manage pi's `trust.json`. [source: https://zed.dev/docs/ai/external-agents + `<agent-box-studio>/src/lib/api.ts:1005-1031`, src/lib/types.ts:2530; source_class: ZED_DOC + CODEG_LOCAL; observed: 2026-09-02; confidence: HIGH; status: PROVEN] Host capability does NOT imply native protocol support (path is the third-party adapter).
- **ID9.** Author-adjacent ACP code: Mario Zechner has written NO ACP code (zero badlogic repos matching `acp`; zero pi-mono ACP code; not a pi-acp contributor). pi-acp is unrelated-community work, NOT "author personal" code. [source: https://api.github.com/search/repositories?q=acp+user:badlogic (total 0) + ID4/ID6; source_class: INFERENCE from VENDOR_SOURCE/registry data; observed: 2026-09-02; confidence: HIGH; status: PROVEN (negative)]

## Pi's own embeddability (affects "embed vs wrapper")

- **EMB1.** Monorepo packages (HEAD b8b873b): `@earendil-works/pi-ai` (LLM API), `pi-agent-core`, `pi-coding-agent` (bin `pi`), `pi-client`, `pi-protocol`, `pi-server` (remote-session protocol of pi's own), `pi-tui`, `pi-evals`, `pi-telemetry`. All 0.84.4. [source: packages/*/package.json; source_class: VENDOR_SOURCE; observed: 2026-09-02; confidence: HIGH; status: PROVEN; stability: VERSION_SENSITIVE]
- **EMB2.** In-process SDK exists: `createAgentSession()` / `AgentSession` / `SessionManager` (docs/sdk.md). Headless IPC surfaces: `--mode json` (event stream) and `--mode rpc` (JSONL command/event). pi-protocol/pi-client/pi-server is pi's OWN session protocol, not ACP. [source: packages/coding-agent/docs/sdk.md, json.md, rpc.md; source_class: VENDOR_DOC; observed: 2026-09-02; confidence: HIGH; status: PROVEN] Agent-Box already consumes the JSON path natively (see ADM section) — the wrapper layer only exists for ACP clients.

## LAUNCH

- **L1.** ACP path launch (as a Zed/Codeg External Agent): `npx pi-acp@0.0.33` (registry manifest `distribution.npx`; Zed "Install from Registry"; Codeg `acpPrepareNpxAgent`). The adapter then spawns, PER ACP session: `pi --mode rpc --no-themes [--session <path>]` with `cwd = params.cwd`, `env = process.env`. Adapter env knobs: `PI_ACP_PI_COMMAND` (pi executable override), `PI_ACP_ENABLE_EMBEDDED_CONTEXT=true` (embeddedContext capability). Requires pi >= 0.80.4 on PATH (README:41). [source: registry pi-acp/agent.json + svkozak/pi-acp src/pi-rpc/process.ts:141-150, src/acp/agent.ts:272-290, README.md:41,60; source_class: REGISTRY_ENTRY + PEER_PROJECT; observed: 2026-09-02; version: pi-acp 0.0.33; confidence: HIGH; status: PROVEN; stability: VERSION_SENSITIVE]
- **L2.** Pi binary launch facts (unchanged from native round): `pi --version` → `0.84.4` exit 0; `pi --help` lists `--mode text|json|rpc` ONLY; `--help` bootstraps `<home>/.pi/agent/{auth.json,models-store.json}`; Node >= 22.19.0 required (local node v22.23.2 OK). [source: `<binary>` probe with isolated HOME `<temp-home>/pi-probe-home2`; source_class: CLI_OBSERVED; observed: 2026-09-02; version: 0.84.4; confidence: HIGH; status: PROVEN; stability: VERSION_SENSITIVE]
- **L3.** Agent-Box native launch today: launch mode `exec` argv `["pi","--mode","json"]` (harnesses.toml:195-198) + adapter env `PI_CODING_AGENT_DIR` relocation + `PI_OFFLINE=1` (adapters/pi.py:101-110; continuation via `--session <locator>`). No ACP mode anywhere in Agent-Box's pi declaration. [source: `<workspace>/plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml:170-204` + `adapters/pi.py`; source_class: CLI_OBSERVED (repo audit); observed: 2026-09-02; confidence: HIGH; status: PROVEN]
- **L4.** npx is REQUIRED for the ACP path (dynamic download of `pi-acp` unless npm-cached); pi itself is also dynamically fetched in the Codeg flow (`acpInstallPiBinary` = global npm install, i.e. writes into `<npm-global>`). Native Agent-Box path needs no npx (PATH resolver). [source: registry manifest + `<agent-box-studio>/src/lib/api.ts:1005-1017`; source_class: REGISTRY_ENTRY + CODEG_LOCAL; observed: 2026-09-02; confidence: HIGH; status: PROVEN]

## CONFIGURATION AND ISOLATION

- **C1.** Pi config root: `<home>/.pi/agent/` (settings.json, auth.json, models.json, models-store.json, trust.json, keybindings.json, skills/, extensions/, prompts/, themes/, tools/, bin/, npm/, git/, sessions/, AGENTS.md, SYSTEM.md, pi-debug.log). Relocation: `PI_CODING_AGENT_DIR` (whole config) + `PI_CODING_AGENT_SESSION_DIR` (sessions) — env-only, NO CLI flag (unknown argv flags are silently swallowed). [source: FACTS-D1/D2/D3/D6/F4; source_class: VENDOR_SOURCE + CLI_OBSERVED; observed: 2026-09-02; version: 0.84.4; confidence: HIGH; status: PROVEN; stability: STABLE]
- **C2.** Skills: YES, pi has its own skills mechanism (Agent Skills standard `SKILL.md`; discovery roots `<agent-dir>/skills/`, `~/.agents/skills/`, `.pi/skills/`, `.agents/skills/`, settings, `--skill <path>`). [source: FACTS-G skills row + packages/coding-agent/docs/skills.md; source_class: VENDOR_DOC; observed: 2026-09-02; confidence: HIGH; status: PROVEN]
- **C3.** ACP-path isolation: pi-acp passes `env = process.env` to the pi child (process.ts:150) — a host can inject `PI_CODING_AGENT_DIR=<guest>` before spawning the adapter and full guest isolation is inherited transitively (verified by code reading, not executed: no model-call risk). pi's startup network (pi.dev update check + telemetry) is NOT disabled by the adapter — host must set `PI_OFFLINE=1` itself. [source: svkozak/pi-acp process.ts:150 + FACTS-C10/F4; source_class: PEER_PROJECT + VENDOR_DOC; observed: 2026-09-02; confidence: HIGH; status: PROVEN (code-read); stability: VERSION_SENSITIVE]
- **C4.** Project trust on the ACP path: Codeg treats pi trust explicitly (`acp_pi_set_project_trust` writes pi's `trust.json`; acknowledge/list APIs; types.ts:2530 notes pi-acp `auto_retry_start` channel sharing). Native headless rule unchanged: without a saved decision, project `.pi` resources are ignored unless `-a`/`defaultProjectTrust:"always"`. [source: `<agent-box-studio>/src/lib/api.ts:980-1003` + FACTS-C8; source_class: CODEG_LOCAL + VENDOR_DOC; observed: 2026-09-02; confidence: HIGH; status: PROVEN]
- **C5.** bwrap feasibility: pi is a plain Node CLI (no daemon, no helper services); official sandboxing guidance in docs/containerization.md. ACP path adds an npx layer that needs a writable npm cache + node runtime inside the sandbox. Both paths feasible; ACP path strictly larger sandbox surface. [source: packages/coding-agent/docs/containerization.md + L1/L4; source_class: VENDOR_DOC + INFERENCE (inferred); observed: 2026-09-02; confidence: MEDIUM; status: PARTIAL]

## ACP COVERAGE (via pi-acp 0.0.33, protocol v1; native pi has NO ACP path)

| # | ACP item | Status | Evidence |
|---|---|---|---|
| 1 | initialize / capabilities | SUPPORTED | protocolVersion 1 only; `agentCapabilities{loadSession:true, mcpCapabilities{http,sse}:false}, promptCapabilities{image:true,audio:false,embeddedContext:opt-in}`; authMethods incl. Zed `terminal-auth` meta [src/acp/agent.ts:237-271] |
| 2 | session/new | SUPPORTED | spawns `pi --mode rpc --no-themes` in params.cwd, fetches state+models, auth-required error mapping [agent.ts:272-330, process.ts:141-150] |
| 3 | session/load | SUPPORTED | restoreSession; historic tool calls synthesized as ACP tool calls [agent.ts:181-235, 930-1077, 1035] |
| 4 | resume | SUPPORTED | pi session file pinned via `--session <path>` at spawn; `switch_session` RPC used on restore; sessions listable via session/list [process.ts:76-80, agent.ts:901-929, pi-rpc/process.ts command set] |
| 5 | fork | NOT_SUPPORTED | no ACP method maps to pi `fork`/`clone` RPC (method list agent.ts:181-1360 has none) |
| 6 | prompt (session/prompt) | SUPPORTED | RPC `prompt` with images; response stopReason → ACP stopReason [agent.ts:438+; process.ts:233-234] |
| 7 | streaming text | SUPPORTED | pi `message_update` `text_delta` → `agent_message_chunk` [session.ts:520-529] |
| 8 | thinking stream | SUPPORTED | `thinking_delta` → `agent_thought_chunk` [session.ts:531-538]; NOTE README Limitations still claims "no separate thought stream" — README stale vs code (CONTRADICTED internally) |
| 9 | tool call | SUPPORTED | `toolcall_start/delta/end` surfaced ASAP as `tool_call` [session.ts:540-560] |
| 10 | tool update | SUPPORTED | pi `tool_execution_update` → `tool_call_update` [session.ts update kinds] |
| 11 | file edits diff | PARTIAL | pi edit tool `details.diff` (unified diff) surfaced into tool call content [src/acp/translate/pi-tools.ts:6-9]; ACP tool `kind` mapping not verified this round |
| 12 | usage / cost | NOT_SUPPORTED | zero usage/cost translation in adapter (grep: only a comment "synthetic ACP tool call to render historic tool usage") — pi's per-message usage{tokens,cost} is lost |
| 13 | permission (session/request_permission) | PARTIAL | ONLY pi extension-UI events map to requestPermission with a synthetic tool call [session.ts:940-975]; pi has NO built-in tool permission system (by design) so bash/edit run unconfined |
| 14 | question / elicitation | NOT_SUPPORTED | no `elicitation/*` handling in adapter source |
| 15 | plan approval (agent plan) | NOT_SUPPORTED | no `plan` sessionUpdate emitted |
| 16 | cancel (session/cancel) | SUPPORTED | → RPC `abort` [agent.ts:895-900] |
| 17 | steer / follow-up | PARTIAL | queue reimplemented client-side, "like pi's one-at-a-time" [README Limitations]; RPC steer/follow_up/set_steering_mode/set_follow_up_mode exist in adapter's pi client but queue is adapter-managed |
| 18 | terminal/* | NOT_SUPPORTED | README Limitations: "No ACP terminal delegation; pi reads/writes and executes locally" |
| 19 | filesystem (fs/*) | NOT_SUPPORTED | README Limitations: "No ACP filesystem delegation" |
| 20 | session modes (set_mode) | SUPPORTED (semantic shift) | ACP "modes" = pi thinking levels off/minimal/low/medium/high/xhigh [agent.ts:1143-1165, isThinkingLevel] — CLI help shows `max` also exists in pi 0.84.4 but adapter REJECTS `max` (isThinkingLevel lacks it) — coverage gap |
| 21 | config options (set_config_option) | SUPPORTED | exactly two config ids: model + thinking level [agent.ts:1167-1210] |
| 22 | MCP | NOT_SUPPORTED | mcpServers accepted and stored but "not wired through to pi"; pi itself has no MCP by design; adapter README points to nicobailon/pi-mcp-adapter extension |
| 23 | images | SUPPORTED | promptCapabilities.image=true; RPC prompt carries images [agent.ts:260; process.ts:31,233] |
| 24 | subagents | NOT_SUPPORTED | pi has none natively; nothing in adapter |
| 25 | session locator | PARTIAL | ACP sessionId is adapter-level; pi session file path pinned at spawn; sessions remain resumable in pi TUI directly (`/resume`); no cross-client locator handoff protocol |
| 26 | native errors | PARTIAL | spawn ENOENT → typed PiRpcSpawnError with remediation text; pi stdout prelude lines captured/surfaced; pi child exit rejects all pending RPC [process.ts:47-56,117-124,158-172] |
| 27 | process exit | PARTIAL | adapter `dispose()` SIGTERMs pi child [process.ts:215-219]; no supervision/cleanup of pi children on adapter crash observed in source |

Legend per SOURCE_POLICY section 6. Items 11/13/20/25/26/27 statuses are code-read (PEER_PROJECT), not wire-observed; no real model request was made this round, so all streaming rows are source-verified only (status: PROVEN at source level, confidence HIGH for code path existence).

## FIDELITY vs Pi native event stream

Native reference (FACTS-H1/H2/H3: `--mode rpc` is a superset of `--mode json`): usage+cost per assistant message, `agent_settled`, `bash_execution_update`, `session_before_switch` (cancellable), `ui_prompt_start/end`, `queue_update`, `compaction_start/end`, 34-command RPC surface incl. `fork`, `clone`, `get_tree`, `get_entries`, `get_session_stats`, `set_auto_compaction`, `set_auto_retry`/`abort_retry`.

Lost or degraded through the ACP (pi-acp) path:

1. **usage/cost** — gone entirely (no ACP v1 usage event; adapter does not emit one).
2. **fork/clone + session tree** (`get_tree`/`get_entries`) — not exposed; ACP sessions are linear.
3. **compaction events** (`compaction_start/end`) — not mapped; only slash-command `/compact` + `/autocompact` toggle [agent.ts:67-76, 452-454, 855-876].
4. **thinking level `max`** — rejected by adapter's isThinkingLevel (pi CLI allows it).
5. **bash_execution_update fidelity** — collapsed into generic `tool_call_update`.
6. **extension UI prompts** — lossy: synthetic tool call + requestPermission only.
7. **agent_settled / session_before_switch / queue_update** — internalized; not visible to ACP client (queue is client-side reimplementation).
8. **startup info** — pi-acp emits a Zed-oriented "startup info" text block (pi version, context, skills, extensions) unless pi settings `quietStartup:true` [README:29] — non-canonical channel.
9. **framing risk** — adapter reads pi stdout with Node `readline` [process.ts:88], but pi's rpc.md documents LF-only framing and explicitly warns readline splits U+2028/U+2029 [FACTS-C.4] — latent fidelity bug in third-party layer.
10. Preserved: session JSONL v3 persistence, resume across hosts/clients, model/thinking switches (persisted as native session entries), images, slash commands (available_commands_update), skills/extensions/prompts (native discovery still runs inside pi).

## RELIABILITY

- **R1.** Process topology per ACP session: client → `pi-acp` (Node) → `pi --mode rpc` (Node) → bash-tool children. One pi RPC process PER ACP session (PiRpcProcess.spawn per sessions.create). [PEER_PROJECT; HIGH; PROVEN]
- **R2.** pi-acp maintenance: single primary maintainer (svkozak); last release 0.0.33 on 2026-07-30 (34 days old at observation); README states "MVP-style adapter… Development is centered around Zed; other clients may have varying levels of compatibility"; tracks pi upstream behavior (Codeg types.ts:2530 references pi-acp compatibility note "#525"). [PEER_PROJECT + CODEG_LOCAL; HIGH; PROVEN]
- **R3.** Orphan risk: no supervisor/reaper found for pi children if the adapter dies (only child.on('exit') rejecting pending promises); Zed/Codeg kill the adapter process tree as host. UNKNOWN severity — not exercised. [PEER_PROJECT (absence); MEDIUM; UNKNOWN]
- **R4.** npx cold start: registry entry is `npx pi-acp@0.0.33` — first-run download latency and npm availability dependency; pinned version mitigates drift. [REGISTRY_ENTRY; HIGH; PROVEN]
- **R5.** pi itself: very high cadence (weekly minors); pi-acp pins nothing on the pi side (works with >= 0.80.4 per README) → breakage risk on pi RPC changes is absorbed by adapter, VERSION_SENSITIVE. [PEER_PROJECT + VENDOR_SOURCE; MEDIUM; VERSION_SENSITIVE]

## SECURITY

- **S1.** Supply chain: ACP path = dynamic npx download of `pi-acp@0.0.33` (deps: official `@agentclientprotocol/sdk` + zod; npm provenance enabled; MIT) + global npm install of pi binary in Codeg's flow. Two extra npm trust roots vs the native path (pi alone). [REGISTRY_ENTRY + CODEG_LOCAL; HIGH; PROVEN]
- **S2.** Credential boundary: `<user-home>/.pi/agent/auth.json` (existence confirmed via isolated-HOME `--help` scaffold; contents never read this round); per-provider env vars (35+, FACTS-E2); adapter inherits `process.env` → any API key present in the ACP client env reaches the pi child. `authenticate` ACP method + Zed `terminal-auth` meta gate auth-required flows [agent.ts:237-271, auth-required.ts]. [CLI_OBSERVED + PEER_PROJECT; HIGH; PROVEN]
- **S3.** Permission model: pi deliberately has NO permission popups ("Run in a container, or build your own confirmation flow with extensions") — through ACP this means tool calls (bash/edit) execute without client confirmation; only extension-UI events reach requestPermission. Sandboxing is mandatory for untrusted work (docs/containerization.md). [VENDOR_DOC + PEER_PROJECT; HIGH; PROVEN]
- **S4.** Network egress: pi phones pi.dev (update check + install telemetry) on startup unless `PI_OFFLINE=1`/`PI_SKIP_VERSION_CHECK=1`/`PI_TELEMETRY=0`; the ACP adapter sets none of these — host must. Plus npx download egress itself. [VENDOR_DOC (FACTS-C10) + PEER_PROJECT (absence); HIGH; PROVEN]

## PROCESS TOPOLOGY VERDICT (double-spawn judgment)

**REQUIRES_RUNTIME_CHANGE** (for an ACP-first integration).

Reasons:
1. Pi offers NO native ACP server (ID6, vendor declined ID7) — the ACP path necessarily inserts a third-party `pi-acp` process between host and `pi --mode rpc` (3-layer topology, R1), which Agent-Box's current pi runtime (single `pi --mode json` child, L3) does not have: a generic ACP client runtime + adapter lifecycle management (install, pin, upgrade, env injection) must be added.
2. The adapter must be launched with Agent-Box's isolation env (`PI_CODING_AGENT_DIR`, `PI_OFFLINE=1`) and passes it through `process.env` (C3) — workable, but env/policy propagation is a new runtime responsibility, and no runtime code for it exists in agent-box-harnesses today.
3. Not UNSAFE: no credential reading, no inherent policy violation; not UNKNOWN: topology and env behavior are source-verified. The native path remains fully available inside the EXISTING runtime (adapters/pi.py is already shipped and correct).

## ADMISSION DECISION

**NATIVE_PRIMARY** — confidence HIGH.

- ACP route is *possible* and *registry-blessed* (Zed + Codeg install it today) but is a third-party MVP wrapper on protocol v1 with material fidelity losses (usage/cost, fork, tree, compaction events, thinking `max`, fs/terminal delegation) and added supply-chain/network surface.
- Agent-Box already integrates pi's native `--mode json` with correct env-based relocation; `--mode rpc` is the documented, vendor-endorsed substrate for any future richer integration (vendor quote, ID7).
- ACP_OPTIONAL is defensible only if desktop-client parity (Zed/Codeg "same agent everywhere") becomes a product requirement; even then the adapter is a moving third-party dependency, not a protocol contract.

## OPEN_QUESTIONS (UNKNOWN → do not encode as false)

1. Wire-level behavior of pi-acp under a synthetic ACP client was not executed this round (no real model request policy); all streaming rows are source-verified only.
2. pi-acp orphan behavior when the adapter process is SIGKILLed (R3).
3. ACP v2 (draft) migration impact — pi-acp supports protocolVersion 1 only; v2 timeline unknown.
4. Whether pi-acp `loadSession` round-trips `custom`/extension session entries losslessly (pi session-format v3 `custom` entries).
5. Tool-call `kind` mapping completeness (edit/delete/move/search/fetch) in pi-tools.ts beyond the diff path.
