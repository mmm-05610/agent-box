# research-notes/pi.md — raw research notes (Pi ACP viability)

Date of research: 2026-09-02. Operator: read-only product research agent.
Policy: harness-acp-viability-2026-09-02/SOURCE_POLICY.md. No credential contents read; no real model requests; no global installs; all clones/installs in /tmp.

## Inputs re-read

- docs/research/harness-acp-viability-2026-09-02/SOURCE_POLICY.md — source classes, six-fact separation, verdict vocab.
- docs/research/harness-native-knowledge-2026-09-01/harnesses/pi/FACTS.md — prior native dossier (pi 0.84.4; identity trap @mariozechner/pi -> @earendil-works/pi-coding-agent; ~/.pi/agent layout; --mode json/rpc; env-only relocation PI_CODING_AGENT_DIR; PI_OFFLINE=1; no MCP/subagents/permissions by design).
- plugins/agent-box-harnesses/src/agent_box_harnesses/adapters/pi.py — PiJsonDecoder (--mode json events), env PI_CODING_AGENT_DIR + PI_OFFLINE=1, continuation --session <locator>.
- plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml pi block — launch mode exec argv ["pi","--mode","json"] (stdio). Note: argv updated since native round (no more --agent-dir/--print).

## npm registry (observed 2026-09-02)

- npm view @earendil-works/pi-coding-agent → 0.84.4; dist-tags latest 0.84.4 / legacy-node20 0.74.2; time.modified 2026-08-28; engines node>=22.19.0.
- npm search "pi acp":
  - `pi-acp` 0.0.33 — "ACP adapter for pi coding agent", author Sergii Kozak (svkozak@gmail.com / npm deepstereo), keywords [acp, agent-client-protocol, pi-coding-agent, adapter], created 2025-12-20, latest publish 2026-07-30.
  - `billion-context-pi` 0.1.55 — pi package for context management (keyword acp present but it is NOT an ACP adapter; ignore).

## ACP protocol side (observed 2026-09-02)

- https://agentclientprotocol.com/ — intro: JSON-RPC over stdio for local agents; HTTP/WS remote WIP. /llms.txt index lists v1+v2 schema pages, TS/Python/Rust/Kotlin/Java SDK pages, registry pages, per-version method sections.
- https://agentclientprotocol.com/protocol/v1/schema.md (fetched, 203 KB): methods seen — initialize, authenticate, session/new, session/list, session/load, session/resume, session/prompt, session/update, session/cancel, session/request_permission, session/set_mode, session/set_config_option, session/delete, session/close, fs/read_text_file, fs/write_text_file, terminal/{create,output,release,wait_for_exit,kill}, elicitation/{create,complete}.
- https://github.com/agentclientprotocol/typescript-sdk README: npm `@agentclientprotocol/sdk`; current 1.4.0; "stable package entry point remains ACP v1"; v2 via `@agentclientprotocol/sdk/experimental/v2` — explicit draft warning.
- https://api.github.com/orgs/agentclientprotocol/repos (2026-09-02): agent-client-protocol (4127 stars), claude-agent-acp (2446), python-sdk, kotlin-sdk, typescript-sdk (242), rust-sdk, symposium-acp, meetings, java-sdk, codex-acp (334), registry (373), docs, acpr. → NO pi adapter under the org.
- https://agentclientprotocol.com/get-started/agents.md (fetched 2026-09-02, 3180 bytes): 44 agents listed; Pi line: `* [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) (via [pi-acp adapter](https://github.com/svkozak/pi-acp))` — the only harness in the list attributed to badlogic/pi-mono.
- https://raw.githubusercontent.com/agentclientprotocol/registry/main/pi-acp/agent.json:
  ```json
  { "id": "pi-acp", "name": "pi ACP", "version": "0.0.33",
    "description": "ACP adapter for pi coding agent",
    "repository": "https://github.com/svkozak/pi-acp",
    "authors": ["Sergii Kozak <svkozak@gmail.com>"], "license": "MIT",
    "distribution": { "npx": { "package": "pi-acp@0.0.33" } } }
  ```
- Registry repo dir listing includes per-agent dirs (claude-acp, codex-acp, gemini, opencode, qwen-code, grok-build, …) and `quarantine.json` (not inspected for pi; pi-acp not quarantined).

## pi-mono repo audit (clone /tmp/pi-mono-acp @ b8b873b, 2026-09-01; re-cloned 2026-09-02 — same HEAD)

- packages/: agent, ai, client, coding-agent, evals, protocol, server, session-backends, telemetry, tui.
  Wait — earlier census (package.json loop) listed 9 packages incl. pi-protocol/pi-client/pi-server; the dir listing shows an extra `session-backends` dir (no package.json match in my loop output — likely workspace-only or renamed; treat package census from package.json files as authoritative: pi-ai, pi-agent-core, pi-coding-agent, pi-client, pi-protocol, pi-server, pi-tui, pi-evals, pi-telemetry, all 0.84.4).
- grep -ril acp (ts/md/json/tsx) → 6 files, ALL false positives: `llamaCpp*` ("aCp" substring), `gacPath` / `GOOGLE_APPLICATION_CREDENTIALS` (env-api-keys.ts).
- grep -rn "ACP" case-sensitive (minus CREDENTIALS/APPLICATION noise) → 0. grep -riw acp → 0. grep agent-client-protocol|agentclientprotocol|zed-industries → 0.
- packages/coding-agent/src/cli/args.ts:11 → `export type Mode = "text" | "json" | "rpc";` — no acp mode.
- packages/coding-agent/docs/ — 33 md files, none acp-related; grep "agent client protocol" → 0. CHANGELOG.md grep acp → 0.

## Local probe of published package (observed 2026-09-02)

- `npm install --no-save --ignore-scripts --prefix /tmp/pi-acp-probe @earendil-works/pi-coding-agent@0.84.4` — OK (~19 MB dist; bundle: cli.js, client.js, index.js, rpc-entry.js, chunks/).
- HOME=/tmp/pi-probe-home2; `node …/dist/bundle/cli.js --version` → `0.84.4`, exit 0.
- `--help` → usage; Commands: install/remove/uninstall/update/list/config/auth; Options include `--mode <mode>  Output mode: text (default), json, or rpc` and `--thinking <level>  off, minimal, low, medium, high, xhigh, max`. NO acp anywhere.
- After --help: `<temp-home>/.pi/agent/auth.json` (2 bytes) + `models-store.json` (2 bytes) scaffolded — consistent with native FACTS B4. Contents `{}` — not read further (policy).
- `grep -riow acp dist docs README.md CHANGELOG.md` → 0 hits. `grep -ril agent-client-protocol|agentclientprotocol|zed-industries` → 0.
- Local tooling: node v22.23.2, npm 10.9.8; `which pi` → exit 1 (pi not installed on host, as expected).

## pi-acp adapter audit (clone /tmp/pi-acp @ d1cffc0, 2026-07-30; observed 2026-09-02)

- package.json: name pi-acp, 0.0.33, bin pi-acp → dist/index.js, engines node>=20, deps @agentclientprotocol/sdk ^0.26.0 + zod ^3.25.0, publishConfig provenance true, scripts include `smoke: node scripts/smoke-acp.mjs`, test via node --test + tsx.
- src layout: acp/{agent,session,pi-sessions,paths,pi-commands,session-store,auth-required,auth,slash-commands}.ts, acp/translate/{pi-messages,pi-tools,prompt,bash}.ts, pi-rpc/{command,process}.ts.
- initialize (agent.ts:237-271): `const supportedVersion = 1`; returns agentInfo {name pi-acp, title 'pi ACP adapter'}; authMethods gated on Zed ClientCapabilities._meta['terminal-auth']; agentCapabilities: loadSession true, mcpCapabilities {http:false, sse:false}, promptCapabilities {image:true, audio:false, embeddedContext: env PI_ACP_ENABLE_EMBEDDED_CONTEXT==='true'}.
- Implemented Agent methods: initialize, newSession(272), authenticate(432), prompt(438), cancel(895), listSessions(901), loadSession(930), deleteSession(1111), unstable_setSessionModel(1137), setSessionMode(1143), setSessionConfigOption(1167). NO fork / plan / elicitation / fs / terminal methods.
- newSession: validates absolute cwd; loadSlashCommands(cwd); sessions.create({cwd, mcpServers (accepted+stored, "Pi doesn't support mcpServers"), conn, fileCommands, piCommand: env PI_ACP_PI_COMMAND}); then parallel getState + getAvailableModels; auth-required error detection.
- Spawn (pi-rpc/process.ts:141-150): `const args = ['--mode', 'rpc', '--no-themes']; if (params.sessionPath) args.push('--session', params.sessionPath);` spawn(cmd, args, {cwd, stdio:'pipe', env: process.env, shell (win32 .cmd)}). Comment: themes irrelevant in rpc mode; extensions + prompt templates kept enabled.
- command.ts: defaultPiCommand = win32 'pi.cmd' : 'pi'; override via getPiCommand(PI_ACP_PI_COMMAND).
- stdout parse: Node `readline.createInterface` (process.ts:88) — NOTE pi rpc.md documents LF-only framing and warns Node readline splits U+2028/U+2029 (native FACTS C.4) → latent fidelity risk in adapter. Non-JSON lines captured as "prelude" (startup info) and surfaced later.
- child.on('exit') → rejects all pending RPC (process.ts:117-124); dispose() → SIGTERM (215-219). No reaper for adapter crash.
- Streaming (acp/session.ts handlePiEvent): message_update.assistantMessageEvent: text_delta → `agent_message_chunk`; thinking_delta → `agent_thought_chunk` (534); toolcall_start/delta/end → tool_call (surfaced ASAP); tool_execution_* → tool_call/tool_call_update. Zero usage/cost handling (grep "usage" only hits a comment about synthetic historic tool calls).
- Permission: only pi extension-UI events → `requestPermission` with synthetic extensionUiToolCall (session.ts:940-975); outcome mapped to sendExtensionUiResponse yes/no/cancel. Pi has no built-in permission popups (native FACTS I4).
- Diff: pi-tools.ts:6-9 — pi edit tool returns terse content + full unified diff in details.diff → surfaced into ACP tool call.
- Modes mapping: setSessionMode modeId must be isThinkingLevel ∈ {off, minimal, low, medium, high, xhigh} → RPC set_thinking_level + current_mode_update. NOTE: pi 0.84.4 CLI --thinking also accepts `max` — adapter rejects `max` (gap).
- Config options: exactly two ids — MODEL_CONFIG_ID, THOUGHT_LEVEL_CONFIG_ID.
- Slash commands handled: `compact` (agent.ts:452-454 → RPC compact with customInstructions), `autocompact` toggle (855-876), model/thinking switching via config options; available_commands_update emitted.
- README (lines 9, 29, 41, 195-205): "MVP-style adapter… Development is centered around Zed, other clients may have varying levels of compatibility"; startup-info block (pi version/context/skills/prompts/extensions) unless quietStartup:true; requires `pi` v0.80.4+ on PATH; npx usage; Limitations: no fs/* delegation, no terminal/* delegation, MCP servers accepted-not-wired (mentions nicobailon/pi-mcp-adapter), "Assistant streaming is currently sent as agent_message_chunk (no separate thought stream)" ← STALE vs code (agent_thought_chunk exists), queue client-side one-at-a-time.
- Contributors API: svkozak 126, raphaelluethy 6, ryanmazzolini 3, ChristianLuciani 2, t0dorakis 2, fgladisch 1, ob-kelvin 1, ricardoraposo 1, turisanapo 1 — no pi maintainers.

## Vendor stance (observed 2026-09-02)

- earendil-works/pi issue #175 "ACP Support" (opened 2025-12, labeled enhancement/pkg:coding-agent): closed 2025-12-13 by **badlogic**: "I currently have no need for ACP support, so that's a no for me I'm afraid. It should however be trivial to build an ACP adapter on top of RPC mode. See packages/coding-agent/docs/rpc.md. If you can figure out a not super invasive way to support this, e.g. as a new mode, I'll be happy to merge a nice PR."
- manmal (2025-12-18): had ~400-line separate-package ACP support; xenodium asked where published (no link in thread excerpt).
- PR #241 "coding-agent: ACP mode for editor integrations" (`pi --mode acp` over stdio JSON-RPC; slash commands via available_commands_update) — closed 2025-12-19, NOT merged.
- PR #836 "feat(coding-agent): add ACP mode for editor integration" (`--mode acp`, @agentclientprotocol/sdk dependency, PiAgent/AcpSession classes) — closed 2026-01-19, NOT merged.
- PR #6660 "docs(coding-agent): add ACP fork banner and upstream plan" — auto-closed 2026-07-15 by bot ("Only contributors approved with lgtm can open PRs"), body empty; implies an external ACP fork exists with a banner pointing upstream; no evidence of vendor adoption.
- Issue #7320 "Support ACP agents as stateful extension backends" — closed (not inspected further).
- GitHub search `q=acp user:badlogic` → total_count 0 (Mario Zechner authored no ACP repos).

## Zed (observed 2026-09-02)

- https://zed.dev/docs/ai/external-agents — "Common External Agents include: Claude, Codex, OpenCode, Copilot, Cursor, Pi Coding Agent… This list is curated"; install via `acp registry` → Agent Settings → External Agents → Add Agent → Install from Registry; dedicated section: "Pi Coding Agent — Use Pi Coding Agent when you want Pi running as an ACP-integrated External Agent in Zed. Pi is an agent harness, not a Zed LLM subscription. Configure any provider auth, subscriptions, tools, or model choices in Pi." Also referenced in "AI by Company" setup paths list.

## Codeg / Agent-Box Studio (local audit, observed 2026-09-02)

- <agent-box-studio>/src/lib/api.ts:980-1031: `acp_pi_set_project_trust` (writes pi trust.json), `PiTrustEntry`, `acp_pi_acknowledge_project_trust`, `acp_pi_list_trust_entries`, `acpInstallPiBinary` (global npm install of @earendil-works/pi-coding-agent; doc comment: "This is the prerequisite pi-acp spawns as `pi --mode rpc` — distinct from the `pi-acp` adapter that `acpPrepareNpxAgent` installs"), `acpUninstallPiBinary`; then generic "Custom ACP agents — agents the user registers from ACP registry information".
- <agent-box-studio>/src/lib/types.ts:2530: "pi shares this channel (#525): pi-acp announces `auto_retry_start` as …" — Codeg tracks pi-acp upstream compatibility issue.
- Conclusion: Codeg ships first-class pi-over-ACP support (install pi globally + install pi-acp via npx + trust management), all through the third-party adapter.

## Judgment notes

- Six-fact separation holds: SDK exists (ACP org) ≠ registry listing (community adapter) ≠ org adapter (none) ≠ vendor native (none, explicitly declined) ≠ host installability (Zed + Codeg proven, via adapter).
- The ACP path's value is desktop-client parity (Zed/Codeg), not fidelity; native --mode json/rpc remains the vendor-sanctioned integration surface (vendor's own words: "trivial to build an ACP adapter on top of RPC mode").
- Decision NATIVE_PRIMARY; ACP double-spawn verdict REQUIRES_RUNTIME_CHANGE (third-party adapter layer + generic ACP client runtime + env/isolation propagation are new runtime responsibilities).
- Unknowns: wire-level pi-acp behavior (no fake-frame exercise this round — allowed by policy but skipped for scope; the smoke scripts in the pi-acp repo cover initialize/session flows), orphan severity, ACP v2 impact, custom-entry round-trip, tool-kind mapping completeness.
