# Desktop × Hermes coupling matrix

Evidence base: read-only survey of `/home/maoqh/projects/agent-box-desktop-next` @ `1751e49`. Paths are
repo-relative. Line counts are from the working tree.

The purpose of this document is to answer one question per coupling point: **would this survive a
harness swap, or does it encode Hermes?** The classification drives the whole design, so the buckets
are deliberate — especially the last two, which are where a migration goes wrong.

## 0. The mass, before the matrix

| Layer | Where | Non-test lines | Test lines |
|---|---|---:|---:|
| Electron main | `apps/desktop/electron/` | 50,080 across ~150 modules | 34,087 in 148 files |
| Preload bridge | `apps/desktop/electron/preload.ts` | 540 (186 channels) | — |
| Renderer | `apps/desktop/src/` | 293,968 | 154,520 in 771 files |
| Shared transport | `apps/shared/src/` | 2,723 (16 files) | 3 of those files |
| JS test workspace | `tests-js/` | 1,174 (mock server) | 1,077 in 8 files |
| e2e | `apps/desktop/e2e/` | 32 specs, 42 files | — |

Two numbers decide the migration strategy:

- `apps/desktop/electron/main.ts` is **18,291 lines** — ~37% of the main process, and it holds backend
  resolution, spawn, readiness, token handling, window management, updates, **and** the fs/git/terminal
  IPC registrations plus Hermes product hooks. It is the single highest-risk file.
- The renderer's Hermes-*product* pages (skills, cron, kanban, bots, messaging, memory, starmap,
  artifacts) are on the order of **40k+ lines** (`src/plugins/hermes-bots/*` alone is 24,059). These are
  not "adapter" work; they are product surface whose fate is a product decision, not a refactor.

## 1. Bucket A — generic desktop capability (keep unchanged under any harness)

Nothing here knows about agents at all. A harness swap must not touch it.

| Area | Files |
|---|---|
| Window/OS lifecycle | `electron/main-window-lifecycle.ts`, `session-windows.ts`, `window-state.ts`, `window-below.ts`, `window-reveal.ts`, `window-renderer-lifecycle.ts`, `titlebar-overlay-width.ts`, `window-open-policy.ts`, `zoom.ts`, `favicon.ts`, `media-protocol.ts` |
| Notifications / HUD / overlay | `electron/notification-*.ts`, `hud-*.ts`, `pet-overlay-ipc.ts`, `quick-entry.ts`, `wake-indicator.ts` |
| Appearance | `electron/translucency.ts`, `src/themes/*`, `src/i18n/*` |
| Diagnostics | `electron/crash-forensics.ts`, `renderer-log.ts`, `desktop-log-line.ts`, `dev-cdp.ts` |
| Update plumbing | `electron/updater-process.ts`, `update-marker.ts`, `update-gate.ts`, `update-count.ts`, `update-remote.ts`, `handoff-result.ts` |
| Presentation stores | `src/store/layout*`, `panes.ts`, `preview.ts`, `preview-status.ts`, and the rest of `src/store/*` that is not session/gateway |
| Pane shell | `src/components/pane-shell/*` (9,105) |
| Retry policy | `electron/api-transport.ts` (protocol-agnostic) |

Branded but structurally generic (a rename, not a redesign): deep-link scheme `hermes://`
(`electron/main.ts:17834`), localStorage namespace `hermes.desktop.*` (`src/lib/persisted.ts:9`),
drag MIME `application/x-hermes-paths` (`src/app/chat/hooks/use-composer-actions.ts:96`).

## 2. Bucket B — generic harness capability (the shape any runtime would need)

These are the parts a Port boundary should formalise. They already exist; what is missing is a
*neutral interface* in front of them.

| Capability | Evidence |
|---|---|
| JSON-RPC + WS transport, request correlation, replay, epoch invalidation | `apps/shared/src/json-rpc-gateway.ts:116`, `:530` (`fetchReplay`), `:568-578` (epoch), `apps/shared/src/websocket-url.ts` |
| Submit turn | `session.create` + `prompt.submit` — `src/app/session/hooks/use-session-actions/index.ts:584,784`, `src/app/session/hooks/use-prompt-actions/submit.ts:791` |
| Cancel | `session.interrupt` — `src/app/session/hooks/use-prompt-actions/index.ts:716`, `slash.ts:520`, `rewind.ts:329` |
| Approvals / blocking input | `src/store/prompts.ts`, `src/store/clarify.ts`, `src/app/session/hooks/use-message-stream/gateway-event/input-requests.ts:23-90` |
| Event stream projection | `src/app/session/hooks/use-message-stream/gateway-event/` (2,622 lines) + `message-stream.ts` |
| Session list / resume | `src/api/sessions.ts`, `session.resume` call sites |
| Transcript hydration | `src/lib/chat-messages/hydration.ts`, `use-message-stream/index.ts:790` |
| Session identity translation (runtime id ↔ stored id ↔ lineage root) | `src/lib/session-ids.ts`, `src/store/session.ts:356-462` |
| Connection scope `(connection, profile)` | `src/store/gateway.ts:913,946`, `src/app/gateway/hooks/use-gateway-request.ts:123`, `capabilityScoped()` `src/api/client.ts:125` |

## 3. Bucket C — Hermes adapter (Hermes-only translation: the actual seam to replace)

Everything here is "how to drive Hermes specifically". This is the surface a first slice must fence off
behind a Port.

### C.1 Process launch

| Thing | Where |
|---|---|
| `serve --host 127.0.0.1 --port 0` argv | `electron/backend-command.ts:18-22` |
| legacy `dashboard --no-open` rewrite | `electron/backend-command.ts:30-38`, applied `main.ts:2613,12652,13082` |
| `--profile <p>` prefix | `main.ts:12649,13043` |
| python-kind backends `-m hermes_cli.main` | `main.ts:5130` |
| Windows remote `-m hermes_cli.windows_ssh_runtime spawn` | `electron/windows-remote-lifecycle.ts:250` |
| `serve` support detection by reading `<root>/hermes_cli/subcommands/dashboard.py` | `backend-command.ts:46-48`, `main.ts:2566-2573` |
| `serve --help` probe fallback | `main.ts:2584` |

### C.2 Executable resolution (the ladder — already a clean seam)

`resolveHermesBackend()` `electron/main.ts:4991-5165`; rungs and their gates:

1. `HERMES_DESKTOP_HERMES_ROOT` + `isHermesSourceRoot()` (`main.ts:2660-2662`, tests `<root>/hermes_cli/main.py`)
2. *(removed — the source-checkout rung is deleted, recorded at `main.ts:5004`)*
3. `ACTIVE_HERMES_ROOT` via `activeRuntimeState()` (`electron/active-runtime-state.ts`)
4. `HERMES_DESKTOP_HERMES` or `hermes` on PATH (`findOnPath` `main.ts:2477`), smoked by `verifyHermesCli()` (`backend-probes.ts:193`)
5. system Python able to import the runtime (`canImportHermesCli()` `backend-probes.ts:144`, probe string `backend-probes.ts:123`)
6. sentinel `kind: 'bootstrap-needed'` + `errorCode: HERMES_EXECUTABLE_NOT_FOUND` (`backend-probes.ts:222` → `main.ts:5150-5164`)

Supporting Hermes-only helpers: `findSystemPython` `main.ts:2686`, `looksLikeDesktopAppBinary`
`main.ts:2633`, `unwrapWindowsVenvHermesCommand` `main.ts:2523`, `electron/windows-hermes-path.ts`,
`electron/venv-holder-select.ts`, `electron/venv-blocker-scan.ts`, `HERMES_DESKTOP_PYTHON`
`main.ts:2665`, `HERMES_PROBE_TIMEOUT_MS` `backend-probes.ts:46`.

### C.3 Environment injection

`main.ts:13095-13127` (primary) and `12672-12699` (pool) inject:

```
HERMES_HOME                      (also resolved by resolveHermesHome() main.ts:776-815)
HERMES_DASHBOARD_SESSION_TOKEN   (crypto.randomBytes(32).toString('base64url'))
HERMES_DESKTOP=1                 (makes the backend run the cron tick loop)
TERMINAL_CWD, HERMES_WEB_DIST
HERMES_PARENT_PID / _START_MARKER / _NONCE   (parent-process-identity.ts:70-88)
HERMES_DESKTOP_READY_FILE        (optional)
```
`PATH`/`PYTHONPATH`/`PYTHONUTF8` assembled by `buildDesktopBackendEnv()` `electron/backend-env.ts:121-150`,
which hardcodes the `$HERMES_HOME/node` layout (mirroring `hermes_constants.py::iter_hermes_node_dirs`,
comment at `backend-env.ts:76`) and the `PROFILES` convention (`backend-env.ts:106-119`).

### C.4 Readiness, auth, dial

| Step | Where |
|---|---|
| Port from stdout `HERMES_BACKEND_READY port=` / legacy `HERMES_DASHBOARD_READY` | `electron/backend-ready.ts:6,12`, waiter `:222` (90 s default, `:22`) |
| Alternative ready-file JSON | `backend-ready.ts:145-158` |
| `GET /api/health` **with the token**, `GET /api/status` fallback | `electron/backend-health.ts:267,269` |
| Hermes gate shape `no_cookie` | `backend-health.ts:188-191` |
| Token adoption by scraping `window.__HERMES_SESSION_TOKEN__` off `GET /` | `electron/dashboard-token.ts:38-50,79-101` |
| WS dial `ws://127.0.0.1:<port>/api/ws?token=` | `main.ts:12793,13262`; remote forms `connection-config.ts:102-116` |
| Nous Cloud host classification `*.agents.nousresearch.com` | `backend-health.ts:154-157` |

### C.5 Remote / SSH / cloud

`electron/remote-lifecycle.ts` (1,700), `windows-remote-lifecycle.ts` (789),
`connection-registry.ts` (1,676), `connection-config.ts` (1,056), `ssh-connection.ts` (1,148),
`managed-ssh-update.ts` (1,084). Hermes-specific inside them: `--isolated --port 0`,
`--ssh-owner-nonce`, `--ssh-session-token-file` (`remote-lifecycle.ts:617-621`), and the
`HERMES_DESKTOP_REMOTE_URL` / `_TOKEN` overrides.

### C.6 Install / update of the *external* runtime

`electron/bootstrap-runner.ts` (1,037), `scripts/install.{sh,ps1,cmd}`, `scripts/lib/node-bootstrap.sh`,
`update-marker.ts`. `docs/installer-ownership.md` already records that the Windows orchestrator
(`hermes-setup.exe`) is external and its compatibility unverified.

### C.7 Hermes-shaped error and event vocabulary

| Thing | Where |
|---|---|
| `4001` / `session not found` | `src/store/session-gone-latch.ts:18,52` |
| `Hermes gateway is not connected` | `src/store/gateway.ts`, `src/lib/yolo-session.ts:72` |
| `Hermes backend did not become ready: …` | `backend-health.ts:316` |
| `HTTP 401 {"detail":"Unauthorized"}` classification | `isGatedMissingHealthError` path |
| Closed event-type list (46+ strings) | `src/lib/gateway-events.ts:25-45` + the `gateway-event/` handlers |
| Version read for the About panel by parsing `<updateRoot>/hermes_cli/__init__.py` | `main.ts:17520` |

## 4. Bucket D — Hermes *product* features (not adapter work; a product decision)

These exist because Hermes has them. They consume generic harness flows but are not themselves
harness-agnostic, and they are the majority of the renderer's mass.

| Feature | Where | Lines |
|---|---|---|
| Bot Mode / bots / relay / group chat | `src/plugins/hermes-bots/*` | 24,059 |
| Kanban | `src/plugins/kanban/*` + `/api/plugins/kanban*` | 5,521 |
| Skills + MCP pages | `src/app/skills/*` (`mcp-tab.tsx` 1,856) | 3,790 |
| Starmap (lineage viz) | `src/app/starmap/*` | 3,644 |
| Cron | `src/app/cron/*` + `src/store/cron*` + `src/api/cron.ts` | 1,744 |
| Artifacts | `src/app/artifacts/*` | 1,162 |
| Messaging + webhooks | `src/app/messaging/*`, `src/app/webhooks/index.tsx` | 1,672 |
| Model catalog / local models / billing | `src/app/settings/model-settings.tsx` (1,378), `local-models-settings.tsx` (1,106), `src/api/models.ts`, `src/api/local-models.ts`, `apps/shared/src/billing-*` | 2,500+ |
| Subagents / agent roster | `src/app/agents/index.tsx`, `src/store/subagents.ts`, `electron/roster-source-fetch.ts` | 450+ |
| Memory / curator / learning | `src/app/learning/*`, `/api/memory*`, `/api/learning/*` | — |
| Hardcoded Hermes slash vocabulary | `src/lib/desktop-slash-commands.ts:174-281` (`DESKTOP_COMMAND_SPECS`), `:285-337` (`NO_DESKTOP_SURFACE`: `/cron`, `/kanban`, `/platforms`, `/toolsets`, `/gateway`, …) | 713 |
| Session-source taxonomy keyed on Hermes surfaces (`codex`, `tui`, `kanban`, `bluebubbles`, `photon`, `yuanbao`, …) | `src/lib/session-source.ts:3-74` | 74 |

## 5. Bucket E — workspace / Git / terminal / artifact (harness-independent, Desktop-owned today)

These touch the machine, not the agent. They are the capabilities the user's requirement #6 asks to
detach — and note they are **already independent of Hermes**; the problem is that they are *only* in
the Desktop, while AgentBox also has workspace/runtime/terminal contracts. Authoritative ownership is
therefore a design decision, not a fact (see `06-decision-and-migration.md` §Authority).

| Capability | Desktop evidence |
|---|---|
| Filesystem | `electron/fs-ipc.ts` (`hermes:fs:readDir|gitRoot|reveal|openDir|rename|writeText|trash|desktopPluginsRoot|logsRoot|agentPluginsRoot`), `fs-read-dir.ts`, `workspace-cwd.ts`, `src/lib/desktop-fs.ts` |
| Git | `electron/git-ipc.ts` (25 channels), `git-review-ops.ts` (903), `git-worktree-ops.ts` (537), `git-repo-scan.ts`, `git-root.ts`, `gitlock.ts`, `find-git-bash.ts`, `shell-path.ts`; renderer `src/lib/desktop-git.ts`, `src/store/review.ts`, `pull-requests.ts`, `projects.ts` (1,419) |
| Terminals (PTY) | `electron/terminal-ipc.ts` (397), `terminal-output-gate.ts`, `spawn-helper-perms.ts`; renderer `src/app/right-sidebar/terminal/*` |
| Previews / artifacts / media | `electron/preview-capture.ts`, `preview-reach.ts`, `media-protocol.ts`, `gateway-file-download.ts`, `browser-windows.ts`; renderer `src/app/chat/right-rail/preview-pane.tsx` (1,391), `preview-file.tsx` (1,156), `src/store/preview*.ts`, `src/lib/artifact-detect.ts` |

## 6. Bucket F — mixed / legacy coupling (the risky files, ranked)

Ranked by how much they mix, because these are where a migration either succeeds or produces double
authority.

| Rank | File | Why |
|---|---|---|
| 1 | `electron/main.ts` (18,291) | Buckets A+C+E+D in one file: resolution, spawn, readiness, token, windows, updates, fs/git/terminal IPC registration, product hooks (`/api/hermes/update`, cloud, bot relay), update hand-off. Any Port work starts by *not* adding to this file. |
| 2 | `src/store/gateway.ts` (1,917) | Generic transport lifecycle/reconnect fused with Hermes profile/registry semantics and bot-relay retention (`registryBackendScopeKey`, `retainGatewayForRelay`). |
| 3 | `src/app/session/hooks/use-session-actions/index.ts` (2,635) | Generic flow (`session.create/resume/interrupt`) fused with Hermes-only params (`source: 'desktop'`), profile routing, canonical Bot Chat identity rules. |
| 4 | `src/lib/desktop-slash-commands.ts` (713) | Palette curation (generic) fused with a hardcoded Hermes built-in list and Hermes-only unavailability reasons. |
| 5 | `electron/backend-health.ts` (317) | Generic readiness loop fused with Hermes gate shapes, Hermes route names, Nous Cloud host classification. |
| 6 | `electron/backend-env.ts` (161) | PATH assembly is generic; the `$HERMES_HOME/node` layout and `PROFILES` convention are Hermes-internal. |
| 7 | `electron/connection-registry.ts` / `connection-config.ts` / `remote-lifecycle.ts` / `windows-remote-lifecycle.ts` (5,221) | Generic local/remote/ssh/cloud model fused with Hermes SSH spawn argv and token-file protocol. |
| 8 | `src/plugins/hermes-bots/*` (24,059) | A whole product surface that is simultaneously a Hermes feature and a heavy consumer of generic harness flows, reaching the SDK/gateway directly. |
| 9 | `src/app/settings/gateway-settings.tsx` (1,667) | Connection UX + Hermes gateway sign-in + runtime update, mixed. |
| 10 | `src/agentbox/*` + `src/plugins/agentbox-lab/*` (untracked POC, 1,589) | The only code that already models a harness boundary — and it is untracked, lint-dirty, and wired to a synthetic dev token. Legacy-shaped risk if promoted carelessly, template value if promoted deliberately. |

## 7. What is already a seam (build on this, do not replace it)

1. **Transport seam.** `JsonRpcGatewayClient` (`apps/shared/src/json-rpc-gateway.ts:116`) + the
   `HermesGateway` subclass (`src/api/client.ts:28`) + the request-scope wrapper `hermesApi()`
   (`src/api/client.ts:98`) with `capabilityScoped()` (`:125`) and `profileScopeKey()` (`:145`).
2. **Resolver-ladder seam.** `resolveHermesBackend()` is one ordered function with a typed sentinel
   outcome (`main.ts:4991`), with policy already extracted into pure, unit-tested modules
   (`backend-probes.ts`, `backend-command.ts`, `backend-health.ts`, `backend-ready.ts`) — the pattern
   `AGENTS.md:59-62` tells future work to follow.
3. **Typed error vocabulary.** `HERMES_EXECUTABLE_NOT_FOUND` + sticky `DesktopBootProgress.errorCode`,
   `GatewayReauthRequiredError`, `AgentBoxError`, `isGatedMissingHealthError` /
   `isAuthRejectionError` / `isServerSideHttpError`.
4. **Scope seam.** `ProfileScope` / `capabilityScoped()` / `profileScopeKey()` — `(connection, profile)`
   routing already exists as a first-class concept; the renderer only ever sees `baseUrl` + `wsUrl` +
   `token` through `HermesConnection` (`src/global.d.ts:744-774`). This is the closest thing to a
   harness-agnostic boundary already in production.
5. **The POC as a template.** `src/agentbox/types.ts:31-53` models readiness as
   `execution.providers[].{provider_id, harness_type, capabilities}`; `event-adapter.ts` is a pure
   durable-event → `ChatMessage[]` projection with a seq watermark; `client.ts:105-150` does
   single-use ws-ticket + `after=<seq>` replay + `resync_required`.

## 8. What does not exist (the gap list the design must close)

1. **No harness registry or provider abstraction** in the shipping app. `harness_type`,
   `provider_id`, `capabilities`, `execution.providers[]` exist only in the untracked POC
   (`src/agentbox/types.ts:31-53`). Everything else refers to "the backend" singularly.
2. **No capability negotiation.** There is scope routing and a per-runtime *probe* convention
   (`backendSupportsServe()`, `src/lib/runtime-readiness.ts`), but no "what can this runtime do"
   handshake; `commands.catalog` is trusted as-is and `desktop-slash-commands.ts` is a static list.
3. **No launch-preview abstraction.** `/api/v1/sessions/{id}/launch-preview` appears only at
   `src/agentbox/client.ts:322`.
4. **No turn/execution model.** No `turn_id` / `execution_id` / watermark / terminal-outcome concepts
   outside the POC; cancel is a bare method call with no receipt shape.
5. **Hermes-shaped error codes and event vocabulary** (see §C.7) with no neutral replacement.
6. **No runtime-neutral startup contract**: binary resolution, argv, env, port discovery, readiness
   probe, token acquisition and RPC/replay method names are all fused into one path.
7. **No installer/update abstraction**: the ladder assumes "install/update Hermes".
8. **No capability grant model for plugins.** `src/extension/sdk/index.ts:21-27` names it as future work:
   "`host.request` — the gateway JSON-RPC door; the plugin's real power, and the future seam for
   per-plugin capability grants." It does not exist; the preload's broad channels are reachable from
   renderer code without a per-caller grant (§9).
9. **No version negotiation against the runtime.** `resolveHermesVersion()` reads a Python file for an
   About string (`main.ts:17520`); `bundle-skew.ts` is about the app's own bundles. The relay budget
   fixture (`src/plugins/hermes-bots/relay-protocol-budget.ts`, pinned to runtime `0.21.1`) is a
   hand-maintained file — evidence that "protocol version" is currently a comment, not a mechanism.

## 9. The preload's trust surface (why a capability model is not optional)

`electron/preload.ts:15-540` exposes one flat object with 186 channels. Narrow typed verbs are fine
(`hermes:zoom:*`, `hermes:notify`, `hermes:settings:*`, `hermes:hud:*`, …). The broad ones are an
escape hatch, and they matter because the design will add a second backend:

| Channel | Where | What it grants |
|---|---|---|
| `request` → `hermes:api` | `preload.ts:229` → `main.ts:16715` | a general authenticated HTTP proxy to **any** `/api/*` path on the backend |
| `writeTextFile` / `renamePath` / `trashPath` | `preload.ts:327,326,328` → `fs-ipc.ts:166,139,192` | arbitrary file write/rename/delete, path chosen by the renderer |
| `terminal.start` / `terminal.write` | `preload.ts:363-364` → `terminal-ipc.ts:287,314` | arbitrary process execution (node-pty) from the renderer |
| `git.*` (25 methods) | `preload.ts:329-357` → `git-ipc.ts:43-113` | `git`/`gh` with renderer-supplied repos/refs, incl. `commit`, `push`, `createPr` |
| `readFileDataUrl` / `readFileText` | `preload.ts:233-239` | arbitrary-path file read (guarded by `hardening.ts:357,464`) |
| `plugin.installDesktop` | `preload.ts:412` → `desktop-plugin-install.ts` | clone + install code from a Git URL — remote code execution into the plugin door |
| `saveImageFromUrl`, `fetchLinkTitle`, `resolveFavicon` | `preload.ts:246` | outbound network fetch on renderer instruction |
| `mcpOauth.listen/wait/cancel` | `preload.ts:283-285` | opens a loopback listener |
| `connections.*`, `connection-config:*`, `oauthLoginConnectionConfig` | `preload.ts:188-223` | registry mutation and credential-adjacent flows |

Main enforces profile/connection **routing** for `hermes:api` and a path/`purpose` guard for reads.
There is **no capability grant**: any renderer code (and any plugin holding the SDK) gets the whole
bridge. AgentBox's own frozen protocol already names the target state for its (Tauri) client —
"all Ports → restricted proxy, token never returns to renderer"
(`AGENTBOX_INTERFACE_PROTOCOL.md:280-290`) — and records the same class of defect in its web mode
(token in renderer `localStorage` as `codeg_token`, `:12-16`). The Electron app has the same class of
problem today; a second backend would multiply it.
