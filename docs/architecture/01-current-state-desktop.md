# Desktop — current state

Evidence base: read-only survey of `/home/maoqh/projects/agent-box-desktop-next` @ `1751e49`. Read with
`AGENTS.md` (root), `apps/desktop/AGENTS.md`, `apps/desktop/src/AGENTS.md`,
`docs/desktop-pruning-phase2.md` and `docs/installer-ownership.md`, which state the invariants this
document only summarises.

## 1. What this repository is now

A **pure client** of an external `hermes`. It ships no runtime, no CLI and no dashboard; it resolves a
`hermes` executable, spawns `hermes serve --host 127.0.0.1 --port 0`, and drives it over HTTP +
JSON-RPC/WebSocket. That boundary is the repository's stated invariant (`AGENTS.md`), it was established
by deleting 8,879 files across two pruning rounds, and it is verified: the app boots to
"Hermes backend is ready" against an external runtime, and shows a typed `HERMES_EXECUTABLE_NOT_FOUND`
state when there is none.

Two consequences for any cross-repo design:

1. The runtime is **not** in this repository, so the protocol boundary is already explicit — but it is
   `hermes`-shaped, not harness-neutral (§5).
2. Everything that used to be "shared with the runtime" is now either gone or mediated by the protocol.

## 2. Layers

| Layer | Root | Owns | Entry | Size (non-test) |
|---|---|---|---|---|
| Electron main | `apps/desktop/electron/` | process lifecycle, backend resolution/spawn/readiness, windows, native fs/git/PTY, install/update, capability bridge | `electron/main.ts` (18,291) | 50,080 across ~150 modules; 34,087 test lines in 148 files |
| Preload | `apps/desktop/electron/preload.ts` | one `contextBridge` object, 186 channels | `preload.ts:15` | 540 |
| Renderer | `apps/desktop/src/` | navigation, presentation, ephemeral state; caches backend truth | `src/main.tsx` (99) → `src/app/index.tsx` (6) → `src/app/contrib/wiring.tsx` (1,333) | 293,968; 154,520 test lines in 771 files |
| Shared transport | `apps/shared/src/` | `JsonRpcGatewayClient`, WS URL helpers, billing/skin/translucency pure modules | `index.ts` (115), `json-rpc-gateway.ts` (756) | 2,723 in 16 files |
| JS test workspace | `tests-js/` | cross-workspace contracts + the Playwright mock inference server | `scripts/mock-server.ts` (1,174) | 1,077 in 8 files |
| E2E | `apps/desktop/e2e/` | 32 specs / 42 files; resolves an **external** runtime | `hermes-runtime.ts`, `real-session-builder.ts` | — |

Where the mass is: `electron/main.ts` (18,291), the i18n catalogs (≈4,000 each × 7),
`use-session-actions/index.ts` (2,635), `session-states.ts` (2,029), `store/gateway.ts` (1,917),
`mcp-tab.tsx` (1,856), `sdk/index.ts` (1,780), `types/hermes.ts` (1,678), `remote-lifecycle.ts` (1,700),
`connection-registry.ts` (1,676).

## 3. The backend contract it speaks, end to end

1. **Spawn.** argv from `electron/backend-command.ts` (`serve --host 127.0.0.1 --port 0`, or the legacy
   `dashboard --no-open` for runtimes predating `serve`). Env injected at `main.ts:13095-13127`:
   `HERMES_HOME`, `HERMES_DASHBOARD_SESSION_TOKEN`, `HERMES_DESKTOP=1`, `TERMINAL_CWD`,
   `HERMES_WEB_DIST`, parent-identity markers.
2. **Resolve.** The ladder in `resolveHermesBackend()` (`main.ts:4991-5165`): explicit checkout →
   *(removed dev-checkout rung)* → Desktop-managed install → explicit executable / `hermes` on `PATH` →
   system Python that can import the runtime → typed sentinel.
3. **Ready.** Port from the child's stdout (`HERMES_BACKEND_READY port=`, `electron/backend-ready.ts`),
   then `GET /api/health` **with the session token** (`electron/backend-health.ts:267-269`), then the
   WS upgrade probe.
4. **Drive.** JSON-RPC over the socket via `apps/shared`, plus a REST proxy: the renderer calls
   `hermesApi()` (`src/api/client.ts:98`) → IPC `hermes:api` (`main.ts:16715`).
5. **Project.** WS frames → `$gateway` fan-out (per `(connectionId, profile)` scope) →
   `handleGatewayEvent` → ordered family handlers → `ClientSessionState` → `$sessionStates` / `$messages`
   → assistant-ui. Replay uses `session.events.since` with a per-session watermark, parks live frames
   during replay, and invalidates on a changed `replay_epoch` (`json-rpc-gateway.ts:530-593`).
6. **Identify.** Four identities coexist and are translated at boundaries: runtime session id, stored
   session id, lineage root, and `(connection, profile)` scope (`src/lib/session-ids.ts`,
   `src/store/session.ts:356-462`).

## 4. What is already a seam (build on it)

| Seam | Evidence | Why it matters |
|---|---|---|
| Transport | `JsonRpcGatewayClient` + `HermesGateway` subclass + `capabilityScoped()` / `profileScopeKey()` | the adapter boundary already exists in shape |
| Resolver ladder | one ordered function with a typed sentinel; policy extracted into pure, unit-tested modules | the pattern to copy for any new backend |
| Typed errors | `HERMES_EXECUTABLE_NOT_FOUND` + sticky `errorCode`, `GatewayReauthRequiredError`, `isGatedMissingHealthError`, … | a neutral vocabulary replaces, not extends, this |
| Connection scope | `local | remote | cloud | ssh` → one `HermesConnection` descriptor; the renderer only sees `baseUrl`/`wsUrl`/`token` | closest thing to an existing harness-agnostic boundary |
| Capability *scoping* (not negotiation) | `ProfileScope`, per-profile gateway clients | per-connection capability differences are already first-class |
| POC as a template | `src/agentbox/types.ts:31-53`, `event-adapter.ts`, `client.ts:105-150` | models readiness with `execution.providers[].capabilities`, `after=<seq>` replay, `resync_required` |

## 5. What does not exist (the gap list)

1. **No harness registry or provider abstraction** in the shipping app — `harness_type`, `provider_id`,
   `capabilities` exist only in the untracked POC.
2. **No capability negotiation** — only per-runtime probes (`backendSupportsServe()`,
   `src/lib/runtime-readiness.ts`); `commands.catalog` is trusted as-is and the slash palette is a static
   hardcoded list (`src/lib/desktop-slash-commands.ts:174-337`).
3. **No launch-preview abstraction** — `/launch-preview` appears only in the POC.
4. **No turn/execution model** — no `turn_id`/`execution_id`/watermark/terminal-outcome outside the POC;
   cancel is a bare method call.
5. **Hermes-shaped vocabulary** — error codes (`4001`, `session not found`), gate shapes (`no_cookie`),
   a closed 46+-event list (`src/lib/gateway-events.ts:25-45`), and a session-source taxonomy keyed on
   Hermes surfaces (`src/lib/session-source.ts:3-74`).
6. **A fused startup contract** — binary resolution, argv, env, port discovery, readiness probe, token
   acquisition and RPC/replay method names are one path.
7. **No installer/update abstraction** — the ladder assumes "install/update Hermes"; the Windows
   orchestrator is external and its compatibility is unverified (`docs/installer-ownership.md`).
8. **No capability grant model for plugins** — `src/sdk/index.ts:21-27` names it as future work;
   `host.request` today is an unmediated gateway door.
9. **No version negotiation against the runtime** — `resolveHermesVersion()` reads a Python file for an
   About string; the relay budget fixture pinned to `0.21.1`
   (`src/plugins/hermes-bots/relay-protocol-budget.ts`) is a hand-maintained file, i.e. "protocol
   version" is currently a comment.

## 6. Trust surface

`electron/preload.ts:15-540` exposes 186 channels as one flat object. Narrow typed verbs are fine;
these are effectively a general escape hatch and are reachable from any renderer code (and from any
plugin holding the SDK):

| Channel | Grants |
|---|---|
| `request` → `hermes:api` (`preload.ts:229`) | an authenticated HTTP proxy to any `/api/*` path |
| `writeTextFile` / `renamePath` / `trashPath` (`:327,326,328`) | arbitrary file write/rename/delete |
| `terminal.start` / `terminal.write` (`:363-364`) | arbitrary process execution via node-pty |
| `git.*` 25 methods (`:329-357`) | `git`/`gh` with renderer-supplied refs, incl. commit/push/createPr |
| `readFileText` / `readFileDataUrl` (`:233-239`) | arbitrary-path file read |
| `plugin.installDesktop` (`:412`) | clone + install code from a Git URL |
| `saveImageFromUrl`, `fetchLinkTitle`, `resolveFavicon` (`:246`) | outbound network fetch |
| `mcpOauth.listen/wait/cancel` (`:283-285`) | a loopback listener |

Main enforces profile/connection **routing** for `hermes:api` and a path/`purpose` guard for reads, but
there is no per-caller capability grant. A second backend multiplies this surface, which is why the Port
boundary and a grant model are coupled decisions, not independent ones.

## 7. E2E as it stands

An **on-demand** GitHub Actions lane (`.github/workflows/e2e-desktop-external-runtime.yml`,
`workflow_dispatch` only) installs a named external Hermes ref, pins `HERMES_DESKTOP_HERMES` and
`HERMES_E2E_PYTHON` at it, prints the runtime's advertised tool surface, then runs the suite under
`xvfb-run`. The PR lane (`e2e-desktop.yml`) stays disabled by upstream decision.

Last measured runs against Hermes `v2026.9.7`. Best: **66 passed / 2 flaky / 11 skipped / 0 failed** —
all 79 specs accounted for, every skip pre-existing (packaged-app, host secure storage, deliberate RED),
both flakes green on retry. That run is not yet reproducible: the next full run failed those same two
specs on both attempts, and they had already failed before any of this work. Treat the lane as
**green-on-demand, not stably green**.

Getting this far closed two real defects, both described in `07-risks-gaps-decisions.md` §2: the
runtime's `tool_search` collapse removed scripted tools from the advertised surface (five specs), and a
bot-addressed profile write silently vanished when the bot's backend was queued behind the pool limit
(one spec). §2.3 records the third, unexplained instability rather than papering over it.

The lane is also its own instrument now: `HERMES_E2E_KEEP_SANDBOX` keeps each spec's `os.tmpdir()`
sandbox alive so the desktop and runtime logs reach the artifacts — without it the fixture deleted the
only copy of the evidence in `afterAll`, and every failure was diagnosed from a bare Playwright
screenshot.

This lane is the only automated check that exercises the real seam (Electron → spawn → ready → WS → UI),
which is why it is the acceptance test for any adapter work — once it is stable enough to be one.
