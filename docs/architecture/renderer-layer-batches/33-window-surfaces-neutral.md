# Batch 33 — Window surfaces become Harness-neutral clients

**Baseline:** 2026-09-13 semantic audit: `app/windows/` contains 21 TS/TSX files and
2,912 lines across HUD, Pet and Quick Entry. Quick Entry is a generic prompt surface;
Pet is an activity projection; HUD is a compact Session surface. The current code mixes
those surfaces with direct `window.hermesDesktop` access, Hermes/Gateway vocabulary and
HUD stream-ownership handoff.

> **Order:** Batch 32 must be merged and independently reviewed first because both
> batches use composition registrations/bridges. Batch 33 then runs alone. The final
> compatibility-aware Renderer/preload vocabulary pass is Batch 34 and remains last.

## Objective

Keep all three existing window products and all user-visible behavior, while making
their UI boundary independent of Hermes and of any particular Harness. `app/windows/`
receives ViewModels, emits user Intents and calls narrow neutral window-host ports. It
does not own backend streams, know Gateway resume semantics or expose backend Refs.

This batch records but does not implement the future AgentBox replay/live protocol. The
governing ownership decision is
[`session-multi-surface-ownership.md`](../session-multi-surface-ownership.md).

## Before / after

```text
before
app/windows/
├── quick-entry/quick-entry-app.tsx       ⚠ prompt UI + Hermes bridge/copy
├── pet/pet-overlay-app.tsx               ⚠ view + gestures + global Session mutation + bridge
└── hud/
    ├── hud-shell.tsx                     ⚠ window mechanics + full WiredPane assembly
    ├── handoff.ts                        ⚠ UI coordination + Hermes stream ownership
    └── click/drag/glass/resize/...       ⚠ correct mechanics, direct Hermes host calls

after
app/windows/
├── quick-entry/
│   ├── quick-entry-root.tsx              ✓ independent mount/composition entry
│   ├── quick-entry-app.tsx               ◀ ViewModel + Intent only
│   └── port.ts                           ◀ narrow neutral window-host contract
├── pet/
│   ├── overlay-root.tsx                  ✓ independent mount/composition entry
│   ├── pet-overlay-app.tsx               ◀ small surface composition
│   ├── pet-overlay-view.tsx              ◀ presentation
│   ├── pet-overlay-composer.tsx          ◀ neutral prompt intent
│   ├── use-pet-overlay-state.ts          ◀ local projection, no Session authority
│   ├── use-pet-window-behavior.ts        ◀ drag/focus/bounds/click-through mechanics
│   └── port.ts                           ◀ narrow neutral window-host contract
└── hud/
    ├── hud-shell.tsx                     ◀ compact injected Session surface
    ├── port.ts                           ◀ narrow neutral window-host contract
    └── click/drag/game/glass/resize/...  ✓ presentation/window mechanics only

application/session/
└── window-handoff.ts                     ◀ focus/visibility/selection/draft coordination only

app/composition/
└── registrations or bridges              ◀ assemble existing legacy implementation behind ports
```

Exact filenames inside `pet/` may be made more precise, but the five responsibilities
must be separate and no new generic framework is authorized.

## Exact scope

| Current area | To / action | Reason |
| --- | --- | --- |
| `windows/quick-entry/quick-entry-app.tsx` and root | Inject a typed `QuickEntryWindowPort`; neutralize visible Hermes/Gateway copy through existing i18n | Quick Entry is generic prompt capture, not a Runtime client. |
| `windows/pet/pet-overlay-app.tsx` | Split view, composer, state projection and window mechanics inside `windows/pet/` | The current 481-line component mixes five responsibilities. |
| Pet state mirroring | Replace writes that pretend Pet owns shared Session state with a local activity ViewModel | Pet is a passive projection of application truth. |
| `windows/hud/hud-shell.tsx` | Receive a compact Session surface/ViewModel and actions; stop importing composition's full `WiredPane` internals | A window surface consumes a contribution; it does not reach into assembly internals. |
| `windows/hud/handoff.ts` | Move generic focus/visibility/selected-Session/draft coordination to `application/session/window-handoff.ts` | These are application use cases, not window mechanics. |
| Hermes resume/socket ownership in handoff | Hide behind the existing legacy adapter/port assembly; no corresponding UI concept remains | It is a direct-Hermes transport limitation, not product semantics. |
| HUD click-through/drag/game/glass/resize host calls | Inject a single narrow `HudWindowPort`; retain pure calculations and behavior | Window mechanics remain here; preload brand does not. |
| Window tests, mocks and entry wiring | Follow the ownership split and test behavior through injected ports | No source-text change detectors or compatibility barrels. |

## UI contract

The UI may use `SessionViewModel`, `ActivityViewModel`, `PromptInput` and user Intents.
It may use an opaque `id` for React identity or selection. It may not expose a type or
prop named Ref, nor know cursor, replay, continuation, native thread, provider, runtime
or socket ownership.

The three surfaces keep these meanings:

- Quick Entry: select a visible Session target, enter a prompt, submit or dismiss.
- Pet: display generic idle/running/waiting/completed/failed activity and existing
  lightweight interactions.
- HUD: display and control a compact projection of the same Session that the main
  window may concurrently display.

## Invariants and non-goals

- Preserve the three window forms, layout, keyboard/pointer behavior, focus, drag,
  resize, click-through, unread/viewed timing, prompt submission and open-main behavior.
- Preserve current legacy Hermes behavior behind the injected implementation until the
  Work Core protocol replaces it; do not expose that compatibility behavior to UI.
- No `Hermes`, `Gateway`, backend `Ref`, resume or socket-ownership vocabulary may remain
  under `app/windows/`, including user copy and comments.
- No file under `app/windows/` may access `window.hermesDesktop` directly.
- Use existing i18n catalogs for every changed user-facing string; update all locale
  contracts according to repository rules.
- Do not invent AgentBox/ACP wire payloads, cursor semantics, fan-out implementation or
  new product behavior.
- Do not move Harness/Execution process control into Electron or Renderer.
- Do not modify public preload globals, IPC channel values, storage keys or persisted
  fields in this batch. Batch 34 owns the coordinated compatibility vocabulary change.
- Do not read, modify or stage the protected untracked paths:
  `apps/desktop/src/agentbox/`, `apps/desktop/src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md`, `docs/desktop-src-tree.md`.

## Stages and commit boundaries

1. Confirm Batch 32 is merged/reviewed; record the live window tests and port callers.
2. Neutralize Quick Entry through its typed port and localized copy; validate and commit.
3. Split Pet in place, make its pushed state a local projection and inject its host port;
   validate and commit.
4. Move generic HUD handoff coordination to application/session, isolate legacy stream
   behavior behind the existing adapter seam, and inject the compact HUD surface/host
   port; validate and commit.
5. Run the whole window/UI validation, prove the semantic boundary, update status and
   commit the record.

## Validation

```bash
cd apps/desktop
npm run typecheck
npm run test -- --run --project ui \
  src/app/windows \
  src/application/session
npm run test:ui
cd ../..
! rg -n "Hermes|hermes|Gateway|gateway|window\.hermesDesktop|SessionRef|ExecutionRef|ContinuationRef|resume|socket ownership" \
  apps/desktop/src/app/windows
git diff --check
```

The text scan is an architecture/manual guard, not a Vitest test and not permission for
blind replacement. Any hit must be classified; compatibility identifiers outside
`app/windows/` remain protected for Batch 34.

## Stop and report when

- Batch 32 is not merged and independently reviewed.
- Preserving behavior requires defining a new replay/live/cursor protocol.
- A current window truly requires backend Ref semantics rather than an opaque UI id.
- Removing the HUD stream handoff cannot be achieved without changing current legacy
  behavior behind the port.
- Pet state has a producer/authority not represented by the audited pushed window state.
- A public preload/IPC/storage/persistence identifier must change before Batch 34.
- A protected path would need to be touched, or an existing test needs unrelated
  semantic assertion changes.

## Acceptance state

- Green: `WINDOW_SURFACES_HARNESS_NEUTRAL_GREEN`
- Otherwise: `WINDOW_SURFACES_HARNESS_NEUTRAL_PARTIAL` with the exact remaining semantic
  leak and evidence.
