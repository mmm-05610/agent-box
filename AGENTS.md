# Hermes Desktop — Development Guide

This repository is the **desktop client** for Hermes Agent and nothing else. It
contains an Electron app, the shared JSON-RPC transport it speaks, and the JS
test workspace that guards both. The Hermes agent runtime — `agent/`, `tools/`,
`hermes_cli/`, `tui_gateway/`, the messaging gateway, cron, skills, the CLI, the
terminal UI and the browser dashboard — lives in Hermes Agent itself, **not
here**. See `docs/desktop-pruning-phase1.md` and
`docs/desktop-pruning-phase2.md` for what was removed, why, and what was kept.

If you are about to add a Python file to this repository, stop and check whether
the work belongs upstream instead.

## The invariant that shapes everything

**The app is a client of an external `hermes`. It never launches, bundles, or
imports a runtime from this checkout.**

That is not a packaging detail; it is the reason this repository can be small and
the reason a user's runtime version is decoupled from their app version. It has
three consequences worth knowing before you touch backend resolution:

1. **Resolution is a ladder over EXTERNAL sources only** —
   `HERMES_DESKTOP_HERMES_ROOT` (explicit checkout) → a completed
   Desktop-managed install at `$HERMES_HOME/hermes-agent` →
   `HERMES_DESKTOP_HERMES` / `hermes` on `PATH` → a system Python that can
   import an installed runtime → the first-launch bootstrap installer. There is
   deliberately no rung that spawns Hermes from the tree the app is running in;
   adding one back re-couples the two products.
2. **"No runtime found" is a normal, typed outcome**, not an internal error.
   Resolution returns `HERMES_EXECUTABLE_NOT_FOUND` (see
   `electron/backend-probes.ts`); the window still opens and the UI says Hermes
   is not installed rather than pretending to connect. Never panic, never fake
   success, never silently retry forever.
3. **Probe what you are about to rely on.** A resolved binary is not a working
   backend: `--version` is smoked before a candidate is trusted, and readiness
   is confirmed with the SAME session token the app injects into the child
   (`HERMES_DASHBOARD_SESSION_TOKEN`). A runtime that gates `GET /api/health`
   behind its token must not be mistaken for a dead one — an anonymous probe
   would 401 forever and the boot would time out against a healthy backend.

## Layout

```
apps/desktop/    Electron app — electron/ (main process, pure policy modules),
                 src/ (React renderer), e2e/ (Playwright), scripts/ (build + dev)
apps/shared/     @hermes/shared — JsonRpcGatewayClient, WS URL helpers, billing types
tests-js/        root vitest workspace: cross-workspace contracts + the Playwright
                 mock server that 20 e2e specs import
scripts/         dev-sandbox.sh, desktop-update/ (updater hand-off), install.sh/.ps1
                 (the installers the first-run bootstrap drives), ci/ helpers
docs/            desktop-pruning-phase{1,2}.md — the pruning record
```

## Backend lifecycle, briefly

`electron/main.ts` is the orchestration entry point; resolution, probing,
readiness, and platform policy live in focused modules beside it
(`backend-probes.ts`, `backend-health.ts`, `backend-command.ts`,
`backend-env.ts`, `backend-start-failure.ts`, `active-runtime-state.ts`,
`bootstrap-runner.ts`, `first-run-setup-gate.ts`). Keep it that way — new
policy belongs in a module with a test, not inline in `main.ts`.

Boot order: resolve → probe/validate → (bootstrap if nothing exists) → spawn
`hermes serve --host 127.0.0.1 --port 0` → read the announced port → confirm
`/api/health` with the session token → confirm the `/api/ws` upgrade → ready.
Failures latch so a retry does not re-run a failed install; only a successful
boot clears the latch and the typed error code.

**Runtime errors are classified, not string-matched.** `errorCode` on
`DesktopBootProgress` is sticky for the failure (a later generic error update
must not erase the cause) and is cleared only by success. Add a code when you add
a failure mode the UI must distinguish.

## Renderer

The renderer owns navigation, presentation, and ephemeral interaction state. The
backend is authoritative for anything another Hermes surface can also change;
treat the renderer's copy as a cache of that truth. Server truth is merged, never
clobbered; a stale async response must never overwrite newer intent.

Routes stay thin, state lives with its authority at the narrowest scope, and
`src/app` owns routes/pages while `src/store` owns shared atoms and `src/lib`
holds pure helpers. Small nanostores over component state; `useStore` in
components, `$atom.get()` in non-rendering actions.

Copy is localized: every user-facing string goes in `src/i18n/` — add it to
`types.ts` and to each locale (untranslated locales fall back to `en`). Never
leave a key in only one catalog.

## TypeScript style

Interfaces for public props and shared object shapes (not `type X = {...}`);
extend React primitives (`React.ComponentProps<'button'>`, `Omit`, `Pick`).
Table-driven beats condition ladders for ids/routes/views. No monolithic hooks —
one narrow job each. Pure side-effect callbacks use the terse void form
`onState={st => void setGatewayState(st)}`; async handlers make intent explicit
`onClick={() => void save()}`.

## Testing

```bash
npm run --workspace apps/desktop typecheck   # renderer + electron + e2e tsc projects
npm run --workspace apps/desktop test        # vitest, all projects
npm run --workspace apps/shared typecheck
npm test --prefix tests-js
```

- **Test the behavior that would break a user, not a snapshot of today's data.**
  Favor invariants and relationships between two pieces of data over frozen
  values. A test that reads like a snapshot is a change-detector — delete it.
- **Never read source code in a test.** Asserting on a `.ts` file's text tests
  the shape of the source, not behavior: it passes when the wiring is subtly
  wrong and fails on a correct refactor. Extract the logic into a pure function
  and call it — `hiddenWindowsChildOptions(opts, isWindows)` instead of a regex
  over `main.ts`.
- **Exercise the real path at a seam.** Resolver precedence and its failure
  rungs, readiness against a gated backend, optimistic rollback and
  stale-response ordering, and local/remote adapter routing all have real
  integration risk that mocks hide.
- **Don't fake the host OS.** Behavior that genuinely differs per host is tested
  on that host (`@pytest.mark.windows_only`-style markers have their JS analogue
  in the vitest projects); a pure function that takes the platform as data is
  tested anywhere.

## Running an isolated instance

`scripts/dev-sandbox.sh` gives you a separate `HERMES_HOME` and Electron
userData, plus a distinct app name so it will not fight your real instance's
single-instance lock:

```bash
cd apps/desktop && ../../scripts/dev-sandbox.sh -- npm run dev
```

Use it for anything that boots the app: it keeps a broken experiment away from
real config, sessions and credentials. Prefer `--persistent` when you need the
sandbox to survive a restart.

## Pull requests

Keep changes traceable to the request. Two focused tests that pin a behavior
contract beat a broad sweep of change-detectors. When a change touches backend
resolution or the boot state machine, say in the PR which of the three
consequences above it preserves and how you checked.
