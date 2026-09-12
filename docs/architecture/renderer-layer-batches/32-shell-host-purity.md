# Batch 32 — Shell becomes a product-neutral host

**Baseline:** Batch 30 executor snapshot plus 2026-09-13 semantic review. The focused
seam is 2,270 lines. Confirmed knots: the 462-line `use-keybinds.ts` owns every product
action; Context Menu host/sections call the Hermes preload and know Gateway/Preview/
update behavior; `run-tour.ts` coordinates app/preview/panes rather than only the engine.

> **Order:** Batch 30 and 31 must be merged and independently reviewed first. Batch 32
> then runs alone. Electron E6 stays untouched; terminal Batch 33 coordinates the public
> preload/compatibility vocabulary after the full UI semantic review.

## Objective

Make `app/shell` a reusable host. It may capture keys, render menus, normalize DOM
targets and run a generic Tour engine. It may not choose product actions, import product
features, understand Gateway topology, coordinate app/preview Tour surfaces, or call
`window.hermesDesktop`. This is ownership/injection only: no new feature or protocol.

## Before / after

```text
before
app/shell/
├── hooks/use-keybinds.ts                         ⚠ mechanism + all product actions
└── layers/
    ├── context-menu/{host,dom,guest,shell}-*     ⚠ host/product/Hermes mixed
    └── tour/run-tour.ts                          ⚠ product surface coordinator

after
app/shell/
├── hooks/use-keybinding-host.ts                  ◀ generic listener/capture/dispatch
└── layers/
    ├── context-menu/{host,item,store,target,...} ◀ generic host and injected verbs
    └── tour/{engine,collect-targets,spotlight...} ✓ generic Tour machinery

app/composition/registrations/
├── keybindings.ts                                ◀ product action map and policies
├── context-menu.tsx                              ◀ product sections and injected verbs
├── context-menu-shell-sections.tsx               ◀ fallback product menu
└── tour.ts                                       ◀ app/preview/pane coordination
```

Names may be made more precise inside these owners; no new registry/framework or
compatibility barrel is authorized.

## Exact scope

| From | To / action | Reason |
| --- | --- | --- |
| `app/shell/hooks/use-keybinds.ts` | Generic host in Shell + product registration in `app/composition/registrations/keybindings.ts` | Shell owns event/capture mechanics; composition owns Session/Profile/Composer/Workspace/navigation actions. |
| Context Menu `host.tsx` | Inject spellcheck subscription | Host must not call a Hermes preload global. |
| `dom-sections.tsx`, `guest-sections.tsx` | Inject edit/spellcheck/image/link/preview/guest verbs and capability facts | Generic sections must not inspect Gateway topology, mutate Preview state or call host APIs. |
| `shell-sections.tsx` | Move to composition registration | New Session/window, settings, layout and updates are product content. |
| composition `context-menu.tsx` | Construct the existing verbs from existing bridges/actions | Composition knows product content and Shell slots. |
| Shell `tour/run-tour.ts` | Move to composition `registrations/tour.ts` | App/Preview selection and pane reveal are assembly; engine/targets/spotlight stay Shell. |
| Callers, lazy imports, mocks and tests | Repoint without shims | Preserve the real production path. |

## Boundaries

### Keybindings

Shell retains listener lifecycle, binding capture, combo normalization, editable gating
and dispatch of injected handlers. Everything naming Session switcher, Profile slots,
Composer focus/paste/model picker, Workspace/worktree, Terminal, Preview, HUD, panes,
theme, routes or product stores moves to composition. Use a narrow typed callback bag,
not `services: any`.

### Context Menu

`item.tsx`, `store.ts`, `target.ts` remain Shell. DOM/guest sections may create generic
rows but receive operations. The fallback product menu moves to composition.
`requestActiveUpdate` is preserved: it already coordinates existing Desktop client and
backend update targets. Its Hermes copy/API/storage vocabulary is handled by Batch 33.

### Tour

Engine, target collection, spotlight/style and their tests remain Shell. App routing,
pane reveal, Preview Tour selection and externally callable Tour verbs move to
composition. Preserve dynamic loading of `driver.js` and Preview payloads.

## Invariants and non-goals

- Preserve every keybinding id/custom binding, capture, IME guard, input priority,
  switcher behavior, type-to-focus, paste and listener cleanup.
- Preserve menu ids/order/visibility/enabled rules, spellcheck timing, focus restoration,
  guest behavior and portal placement.
- Preserve Tour actions/results/styles/lifetime/app-preview behavior/lazy loading.
- No file remaining under `app/shell/` may reference Hermes preload names, product
  features/application/composition, Gateway topology or product update actions.
- Do not rename public preload globals, IPC channels or storage keys here; Batch 33
  removes UI-wide compatibility vocabulary in coordination with preload.
- Do not add ACP/AgentBox/Harness integration, product functionality or a plugin system.
- Do not modify Electron E6 files or `electron/preload.ts`.
- Do not read, modify or stage protected untracked paths:
  `apps/desktop/src/agentbox/`, `apps/desktop/src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md`, `docs/desktop-src-tree.md`.

## Stages and commit boundaries

1. Confirm Batch 30/31 prerequisites and live focused callers.
2. Split keybinding host/registration; run keybinding, capture and switcher tests; commit.
3. Inject Context Menu verbs and move product sections; run menu tests; commit.
4. Move Tour coordinator, preserve lazy loading, run Tour/Preview tests; commit.
5. Run Shell semantic guards, typecheck/full UI suite, update status; commit.

## Validation

```bash
cd apps/desktop
npm run typecheck
npm run test -- --run --project ui
! rg -n "@/features/|@/application/|@/app/composition/|window\.hermesDesktop|isRemoteGateway|requestActiveUpdate" src/app/shell
! rg -n "run-tour|shell-sections|use-keybinds" src/app/shell
cd ../..
git diff --check
```

Source-text checks are manual/architecture guards, not substitutes for behavior tests;
do not add Vitest tests that read `.ts` source text.

## Stop and report when

- Batch 30/31 or E6 has unresolved overlap.
- The split requires changing user behavior or inventing a protocol/product semantic.
- A protected path or `electron/preload.ts` would need modification.
- Tests need semantic changes outside the authorized ownership split.

## Acceptance state

- Green: `SHELL_PRODUCT_NEUTRAL_HOST_GREEN`
- Otherwise: `SHELL_PRODUCT_NEUTRAL_HOST_PARTIAL` with exact evidence.
