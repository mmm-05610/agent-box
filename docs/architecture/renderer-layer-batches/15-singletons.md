# Batch 15 — the last three singletons

**Edges paid off: 3.** Shared rules and the verification recipe:
[README](README.md). Take the ledger's number when you start and subtract 3.

Three edges that have nothing to do with each other. They are one document because
each is small, and because they are the last three: after them the ledger is **0**.
Each sub-step is independent — if one turns out to be wrong, do the other two and
report it.

```
components/boot-failure-overlay.tsx -> @/app/settings/gateway-settings
store/gateway-switch.ts             -> @/app/contrib/hooks/use-background-sync
store/pane-focus.ts                 -> @/app/right-sidebar/store
```

## 15a · the boot-failure overlay is handed the view it embeds

`components/boot-failure-overlay.tsx:28` lazily imports the settings surface:

```ts
const GatewaySettings = lazy(() =>
  import('@/app/settings/gateway-settings').then(module => ({ default: module.GatewaySettings }))
)
```

`GatewaySettings` is implemented in `app/settings/gateway-settings-view.tsx` — 1,558
lines standing on six app-local siblings (`./connections-registry`,
`./gateway-settings-parts`, `./managed-updates-section`, `./primitives`,
`./ssh-host-selection`, `./constants`). It cannot sink, and it should not: the
overlay is a shell-level surface that *shows* an app screen, which is a host
decision, not the overlay's.

**The host makes it.** `BootFailureOverlay` is rendered in exactly one place,
`app/contrib/wiring.tsx:1162`, which is rank 5 and may import anything. So:

- the overlay takes the view as a prop — `GatewaySettingsView?: ComponentType<{ embedded?: boolean }>`
  — and renders nothing in that slot when it is absent (which is also its state
  before the lazy chunk resolves, so the existing loading behaviour is the default);
- `wiring.tsx` owns the `lazy(() => import('@/app/settings/gateway-settings')…)`, so
  the code-splitting stays exactly where it is.

Two production files and the overlay's test. If the test constructs the overlay
directly, it passes a stub view; that is the point of the prop.

## 15b · the live-runtime bookkeeping is state, filed under a hook

`store/gateway-switch.ts:3` imports `resetLiveRuntimeTracking` from
`app/contrib/hooks/use-background-sync.ts` — a 926-line hook module — and calls it
once, after a gateway wipe (line 213).

What it resets is a module-level `Map` in that same file
(`liveRuntimeIdsByProfile`, line 337), which the background-sync loop fills. That is
**state**, and it is the only thing the store wants:

```
app/contrib/hooks/use-background-sync.ts:337   const liveRuntimeIdsByProfile = new Map<string, Set<string>>()
app/contrib/hooks/use-background-sync.ts:482   export function resetLiveRuntimeTracking(): void { liveRuntimeIdsByProfile.clear() }
```

New file **`store/live-runtime-tracking.ts`** holding the map and its two
operations — read/merge per profile key, and reset — with the hook module importing
it instead of declaring it. Then `store/gateway-switch.ts` reads the reset from
`@/store/live-runtime-tracking` and the edge is a same-rank import.

Keep the map private to the new module and hand out accessors rather than the map
itself: the background-sync loop does a read-modify-write per profile, so the shape
is `liveRuntimeIds(profileKey)`, `setLiveRuntimeIds(profileKey, ids)`,
`resetLiveRuntimeTracking()`. Do not move the polling, the fetching or
`rehydrateLiveSessionStatuses` — only the bookkeeping, which is what the store needs.

`app/contrib/hooks/live-status-spinner.test.ts` imports `resetLiveRuntimeTracking`
and `rehydrateLiveSessionStatuses` from `./use-background-sync`; re-export the reset
from there so the test keeps resolving, or repoint the one import. Either is fine —
say which you did.

## 15c · a 30-line "right sidebar" store that has nothing to do with the right sidebar

`app/right-sidebar/store.ts` is thirty lines and holds terminal-takeover state:
`$terminalTakeover`, `setTerminalTakeover`, `$terminalInjection`, `runInTerminal`,
plus the `hermes.desktop.terminalTakeover` persistence. It reads only `nanostores`
and `@/lib/storage`. It lives under `app/right-sidebar/` because the embedded
terminal pane is rendered there — but the *state* is the terminal's, and
`store/pane-focus.ts` imports `setTerminalTakeover` from it, which is what makes the
edge.

```
app/right-sidebar/store.ts → store/terminal-takeover.ts
```

Repoint its five production importers:

```
store/pane-focus.ts:1                 the edge
app/contrib/controller.tsx
app/settings/providers-settings.tsx
app/chat/perf-probe.tsx
app/hooks/use-keybinds.ts
```

The right-sidebar *panes* stay where they are; only the atoms move. If a file under
`app/right-sidebar/` imported its own `./store`, it now reads from
`@/store/terminal-takeover` — a downward import, no edge.

## Verification

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # again: the ledger must not move
```

Baseline: tests **775 files / 7466**. The ledger drops by **3**, to **0**. That is
the target the whole migration was measured against — if it lands on 0 with a
different three lines gone, a step was done by a route other than the one written
here, and the guard's "records no debt that has already been paid" failure is how you
will find out.

## Stop conditions

- **15a: `BootFailureOverlay` turns out to be rendered from more than one place.**
  Then the injection point is not unique and the prop is the wrong shape — report the
  second caller.
- **15b: something other than the reset needs the map's identity across a reload.**
  Module-level state that survives HMR is load-bearing in ways a test will not show.
  Report what depends on it rather than moving it with an accessor.
- **15c: a `store/` file imports the terminal atoms.** Then they are store state being
  read by store state and the destination is right; but if a *`lib/`* file does, the
  destination is wrong — `lib → store` is upward. Report it.
- Do not read, edit or stage `src/agentbox/`, `src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md` or `docs/desktop-src-tree.md`.
