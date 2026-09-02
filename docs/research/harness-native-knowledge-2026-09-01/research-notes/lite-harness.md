# Research notes — LiteLLM-Labs/lite-harness

Cloned read-only to `<temp-home>/lite-harness` (depth 1). All `file:line` refs against that checkout. Real local paths sanitized.

## Identity

- Org/repo: LiteLLM-Labs/lite-harness — https://github.com/LiteLLM-Labs/lite-harness (verified via origin remote).
- Language: TypeScript + Python SDK clients (`src/sdk/typescript/`, `src/sdk/python/`) around a Node "backend server" (`src/sdk/server/`, `.mjs`).
- License: MIT (README "License" section).
- Last commit seen: `dd99cdf` "Update README.md", 2026-06-02 (shallow clone, single commit).
- Size: 118 tracked files; ~3.5k LOC of non-test source. Server core is deliberately small: `protocol.mjs` 207, `session.mjs` 107, three providers ~70-90 lines each.
- Status: active but pre-release — README:9-11 states "the SDK is not published to npm or PyPI yet. Clone this repo to try it."
- Docs: `README.md`, `src/sdk/README.md`, `docs/architecture.md`, `docs/configuration.md`, `docs/contributing-harness.md`, per-dir `AGENTS.md`/`CODING_STANDARDS.md`. Positioning: "Call all agent harnesses using the Claude Agent SDK format" (README:3) — i.e. Claude Agent SDK drop-in + LiteLLM gateway routing.

## Architecture summary

Three-layer model: thin SDK clients → NDJSON stdio server → in-process provider runtimes.

- **SDK clients** (`typescript/query.ts`, `python/query.py`) speak the Claude Agent SDK surface (`query()`, `AgentOptions`, `ClaudeSDKClient` with `interrupt`/`set_permission_mode`/`set_model`) and spawn the server over stdio. `typescript/transport.ts` is "the single place that owns process spawn, NDJSON framing over stdio, the multiplexed Claude Agent SDK stream-json control protocol" (`transport.ts:1-15`), with control_request/response correlation and a spawn-command resolution order including a test-injected fake server (`transport.ts:41-76`).
- **Server** (`server.mjs:1-30`): parses launch args (`--agent`, `--model`, `--permission-mode`, `--cwd`), resolves a provider, constructs `Session`, starts `StreamJsonServer`. Wire: reads NDJSON from stdin, demuxes on `type` (`user` starts a turn; `control_request` handled out-of-band), writes frames to stdout as they arrive (`protocol.mjs:116-207`).
- **Session** (`session.mjs:23-102`): owns turn state (sessionId `sess_<24hex>`, turns, history, mcpServers, hooks); `handleControl()` implements `initialize`, `interrupt` → `this.runtime.interrupt?.()` (`session.mjs:51-52`), `set_permission_mode` → `runtime.setPermissionMode?.()` (`session.mjs:53-55`), `set_model`, `list_harnesses` (`session.mjs:46-63`). `runTurn()` yields `system/init`, forwards provider frames, appends history, and synthesizes a `result` frame when the runtime ends without one or throws (`session.mjs:66-102`; error path `session.mjs:87-93`).
- **Provider runtimes** — each folder under `src/sdk/server/providers/` exports `id`, `aliases`, optional `harnessId`/`displayName`, and `createRuntime(...)` returning `{ model getter, setModel, setPermissionMode, interrupt, runTurn }` (contract documented at `providers/index.mjs:1-12`).
- **Registry mechanism**: filesystem auto-discovery, not hand-wiring. `discover()` `readdirSync`s the providers dir (plus optional `LITE_HARNESS_PROVIDERS_DIR` extra dir), `await import(index.mjs)` per subfolder, and accepts any module where `typeof mod.id === "string"` and `typeof mod.createRuntime === "function"`; `id` + `aliases` all map to the same module, lowercased (`providers/index.mjs:16-49`). Registry is memoized (`loadProviders()`, `providers/index.mjs:46-48`). Adding a provider = drop a folder; "Nothing here changes" (`providers/index.mjs:4-6`).

Lifecycle: SDK `query()` → spawn server → stdin `user` message → `Session.runTurn` → provider `runtime.runTurn()` (async generator) → native events transformed per-provider to canonical frames → NDJSON stdout → SDK decodes to Claude Agent SDK message objects.

## Required focus points

(1) **Provider folder discovery** — `providers/index.mjs:16-49`. Duck-typing contract (needs `id` + `createRuntime`), alias map, memoized registry, extra-dir override via env `LITE_HARNESS_PROVIDERS_DIR` (`providers/index.mjs:20-22`) for external/test providers. `resolveProvider(agent)` throws `unsupported agent: X (known: ...)` (`providers/index.mjs:51-58`); `listProviderMetadata()` feeds the `list_harnesses` control response (`providers/index.mjs:60-83`, `session.mjs:59-61`).

(2) **createRuntime** — factory receiving `{ model, permissionMode, cwd, env, diagnostics }` and returning a mutable runtime object. claude-code/anthropic: `providers/anthropic/index.mjs:26-66` — drives `@anthropic-ai/claude-agent-sdk` `query()` **in-process** with `includePartialMessages: true` and an `AbortController` per turn; codex: `providers/codex/index.mjs:26-57` — drives `@openai/codex-sdk` `startThread().runStreamed(prompt, { signal })`; pi-ai: `providers/pi-ai/index.mjs:35-...` — drives `@earendil-works/pi-agent-core` `agentLoop()` directly over OpenAI-compatible completions.

(3) **runTurn** — two levels: `Session.runTurn` (`session.mjs:66-102`) wraps init/result frames, tracks `sawResult`, accumulates assistant text into history, converts thrown errors into an error `result` frame; provider `runTurn` is an async generator yielding transformed frames (e.g. `anthropic/index.mjs:44-62`). Wire-level guard: a second `user` message while a turn is active immediately yields an error result "A turn is already in progress" (`protocol.mjs:176-190`).

(4) **interrupt** — cooperative AbortController: control_request `interrupt` → `runtime.interrupt()` → `controller.abort()` (`session.mjs:51-52`; `anthropic/index.mjs:40-41`, `codex/index.mjs:39-40`, `pi-ai/index.mjs:...`). On abort the provider runTurn swallows the error and returns so Session emits the cancelled result (`anthropic/index.mjs:56-58` — `if (controller.signal.aborted) return;`). Note interrupts are only checked between SDK events (no mid-event preemption), and codex/pi implement `setPermissionMode` as a no-op (`codex/index.mjs:38`, `pi-ai` likewise) — permission mode is effectively set-at-spawn for those providers.

(5) **Permission mode handling** — launch flag `--permission-mode` defaults to `"default"` (`protocol.mjs:13,43-44`); stored on Session; changeable mid-session via `set_permission_mode` control request (`session.mjs:53-55`); passed into the anthropic SDK options each turn (`anthropic/index.mjs:51`). No allowlist/denylist validation — any string passes through to the underlying SDK.

(6) **Native event transformer (per-provider → canonical frames)**:
- anthropic: `providers/anthropic/transformation.mjs:9-49` — `toFrames(msg, { sessionId })` is a PURE function; `system` dropped (session emits its own init), `assistant`/`user`/`stream_event` forwarded with shape normalization, `result` rebuilt with canonical fields (`subtype`, `duration_ms`, `is_error`, `num_turns`, `total_cost_usd`, `usage`), unknown types dropped "forward-compatible"; `session_id` rewritten to the harness's own id so "every frame in a turn agrees" (`transformation.mjs:7-8`).
- codex: `providers/codex/transformation.mjs:14-47` — a **stateful** `createEventTransformer()` closure: Codex SDK emits accumulated text on each `item.started/updated`, so a `Map` of item id → last-emitted char offset synthesizes `stream_event` text deltas; `item.completed` becomes the final `assistant` frame; all else ignored.
- pi-ai: `providers/pi-ai/transformation.mjs` maps AgentEvents to the same canonical wire (89 lines, same toFrames shape).

(7) **Canonical streaming frame list** (the wire vocabulary):
- `system` / subtype `init` — constructor `protocol.mjs:78-81` (carries sessionId, model, tools, mcp_servers).
- `assistant` — `protocol.mjs:83-86` and `anthropic/transformation.mjs:19-25` (message {model, content[]}, parent_tool_use_id).
- `user` — forwarded tool-result echoes (`anthropic/transformation.mjs:27`).
- `stream_event` — partial deltas envelope `{ type, session_id, event }` (`protocol.mjs:88-90`; delta payloads like `content_block_delta`/`text_delta`, `codex/transformation.mjs:34-40`).
- `result` — `{ type, subtype: success|error_during_execution, session_id, duration_ms, duration_api_ms, is_error, num_turns, total_cost_usd, usage, result }` (`protocol.mjs:92-113`).
- Control channel: `control_request` / `control_response` on the same NDJSON wire (`protocol.mjs:157-175`).

(8) **Import-failure handling** — two generations:
- Current provider discovery: `catch { continue; // not a provider folder }` around the dynamic import (`providers/index.mjs:34-37`) — an adapter whose dependency throws on import is **silently invisible**; the error message just shows the remaining known agents. There is no "provider found but failed to load" surface, no diagnostics, no degraded listing.
- Legacy unified-adapter path (docs/contributing-harness.md:52-99): SDK loaded in a `try/catch` at boot, logs "`<name>` SDK not available: ...", and `POST /session {"harness":"<name>"}` returns **503** with an error JSON at request time (`contributing-harness.md:97-99`) — i.e. the older design kept the harness selectable but failed loudly per-request; the newer folder-discovery design instead hides it.

(9) **process.env / global-state problems** — the code **mutates Node's process.env inside provider factories**:
- `applyLiteLlmEnv()` sets `process.env.ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` (unless pre-set) whenever `LITELLM_API_BASE`+`LITELLM_API_KEY` are present (`anthropic/index.mjs:17-24`).
- Codex path sets `process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || env.LITELLM_API_KEY` ("Codex CLI inherits process.env", `codex/index.mjs:20-23`).
- Consequences visible in the code/docs: gateway credentials leak into every child process spawned later in that server (the claude CLI the SDK drives included); a pre-existing `ANTHROPIC_BASE_URL` wins but the key is still overwritten (`anthropic/index.mjs:19-23` — comment "A pre-set ANTHROPIC_BASE_URL always wins" yet API_KEY/AUTH_TOKEN are unconditionally defaulted); and the mutation happens inside `createRuntime`, so it is keyed to runtime construction but affects the whole process. `docs/architecture.md:134-145` documents the intended wiring (`LITELLM_API_BASE -> ANTHROPIC_BASE_URL`, `LITELLM_API_KEY -> ANTHROPIC_AUTH_TOKEN`) and `REPO_DIR` vs `CC_REPO_DIR` split (architecture.md:122-130) after a real bug where claude-code sessions self-identified as "the opencode harness" from shared workdir context — an earlier global-state lesson.

(10) **Parity strategy** (bonus, relevant to Agent-Box tests):
- Python drop-in parity vs real `claude_agent_sdk`: exports list, `ClaudeAgentOptions` field superset ("lite ⊇ claude"), `query()` signature, `ClaudeSDKClient` methods incl. `interrupt`/`set_permission_mode`; whole module skips via `pytest.importorskip` when upstream can't install (`src/sdk/python/tests/test_parity.py:1-45`).
- TS compile-time superset: `parity.types.ts` constructs one literal exercising every public option field; type-check failure breaks the build; deliberately avoids importing the upstream package so it runs in CI without network (`typescript/test/parity.types.ts:1-15`).

## Patterns worth borrowing for Agent-Box

- Folder-drop provider discovery with a two-attribute duck-typed contract (`id` + `createRuntime`) and alias map → **harness-registry-declaration** (zero-touch registration; mirrors what Agent-Box wants from adapter autodiscovery).
- Canonical frame vocabulary (`system/init`, `assistant`, `user`, `stream_event`, `result` + control_request/response) with per-provider PURE transformers, session_id rewriting, and a synthesized result when the runtime forgets → **observation-envelope** and **terminal-session-protocol**.
- Control channel demuxed on one NDJSON wire (interrupt / set_permission_mode / set_model / list_harnesses out-of-band from the turn stream) → **runtime-host-protocol**.
- Runtime interface as capabilities-with-optional-chaining (`this.runtime.interrupt?.()`, `setPermissionMode?.()`) — providers declare what they can; server degrades gracefully → **harness-native-adapter**.
- Parity test strategy: runtime superset check with `importorskip` + compile-time literal superset → **test-strategy**.
- `list_harnesses` control returning `{id, providerId, name, aliases}` metadata → **harness-registry-declaration** introspection endpoint.
- Extra providers dir via env var (`LITE_HARNESS_PROVIDERS_DIR`) merged over builtins → **harness-registry-declaration** (extension point without forking the repo).

## Anti-patterns / risks observed

- **process.env mutation inside provider factories** (see (9)): cross-provider credential/base-url bleed; two runtimes in one process can fight over `ANTHROPIC_BASE_URL`/`OPENAI_API_KEY`; hidden ordering dependency between `createRuntime` calls.
- **Silent import swallow** in discovery (`providers/index.mjs:34-37`): a typo'd provider or missing npm dep removes the harness with zero diagnostics; worse than the legacy 503 approach which at least failed loudly per request.
- `setPermissionMode` no-ops on codex/pi (`codex/index.mjs:38`): clients that successfully call `set_permission_mode` get no effect and no error — silent capability divergence across harnesses behind one interface.
- Stateful transformer relies on Codex SDK's accumulated-text behavior; any upstream change to event semantics silently breaks delta synthesis (acknowledged in-file, `codex/transformation.mjs:1-13`).
- Global registry memoization (`loadProviders` caches forever, `providers/index.mjs:46-48`) means tests/long-lived processes can't re-scan without a process restart.
- Docs drift: `docs/architecture.md` and `contributing-harness.md` describe an older HTTP unified-adapter architecture (ports 4096/4097, SSE buses) while the shipped code is the stdio provider model — a repo in mid-migration; only `src/sdk/README.md` matches the code.
- Turn serialization is enforced only by the in-flight check (`protocol.mjs:176-190`); no queueing — concurrent turns just error.

## Verification status

- Verified from source read (file:line): everything in Architecture summary and focus points (1)-(8), (10) — `providers/index.mjs`, `providers/{anthropic,codex,pi-ai}/{index,transformation}.mjs`, `session.mjs`, `protocol.mjs`, `server.mjs`, `typescript/transport.ts` (grep-level), parity tests.
- Verified from code grep (file:line): process.env mutation sites (focus point 9).
- README/docs-only: install steps, LiteLLM gateway positioning, "not published to npm/PyPI" status, legacy architecture docs (explicitly flagged as drift).
- Not verified: runtime behavior against real CLIs (no live runs); TypeScript SDK client internals beyond transport.ts grep; `docs/configuration.md` full env-var reference.
