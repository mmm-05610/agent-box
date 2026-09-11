# Batch 11 — the route vocabulary sinks to `lib/`

**Edges paid off: 3.** Shared rules and the verification recipe:
[README](README.md). Take the ledger's number when you start and subtract 3.

**Prerequisite: batch 09 must have landed.** 11's destination reads
`ROUTES_AREA` from `@/lib/contribution-areas`, which 09b creates. If that const is
still declared in `app/routes.ts`, stop and say so — do not duplicate it.

This is the route half of what K5 in
[`../renderer-layer-boundary.md`](../renderer-layer-boundary.md) leaves behind. It is
also the first link of the chain that keeps the composer's last edge (K4) in the
ledger, which is why it goes first: `app/session/hooks/session-context-drift.ts`
cannot leave `app/` while it imports `isNewChatRoute` and `routeSessionId` from the
route module.

## `app/routes.ts` is two things

268 lines, and its whole import list is four modules — `nanostores`, `react` (types
only), `@/components/pane-shell/tree/store`, `@/lib/contributions`. That last one is
the tell: everything here stands on rank 0 except the pane reveal.

```
the vocabulary                                    the workspace-page state machine
  SESSION_ROUTE_PREFIX · NEW_CHAT_ROUTE              $workspaceIsPage            (atom)
  SETTINGS_ROUTE · COMMAND_CENTER_ROUTE              revealWorkspacePane         (private)
  SESSION_IMPORT_ROUTE · SKILLS_ROUTE                syncWorkspaceRoute
  MESSAGING_ROUTE · WEBHOOKS_ROUTE                   navigateToWorkspacePage
  ARTIFACTS_ROUTE · CRON_ROUTE
  PROFILES_ROUTE · AGENTS_ROUTE · STARMAP_ROUTE
  AppView · AppRouteId · AppRoute · APP_ROUTES
  APP_VIEW_BY_PATH · RESERVED_PATHS   (private)
  OVERLAY_VIEWS · isOverlayView
  routePathname → isNewChatRoute → routeSessionId
  primaryRouteSelectedSessionId · sessionRoute
  appViewForPath · isWorkspacePageRoute (private)
  contributedRoutes · isContributedPath (private)
```

The right column reads `noteActiveTreeGroup` / `revealTreePane` from
`components/pane-shell/tree/store`, so it can live at rank 4 and no lower. The left
column is a route table and four pure classifiers, and **three of the four** things
below `app/` that import the module want pieces of it.

## 11a · the vocabulary → `lib/routes.ts`

Move the whole left column, comments included, into a new `lib/routes.ts`. It stands
on `react` (types), `@/lib/contributions` (the registry) and
`@/lib/contribution-areas` (the two area ids, from 09b) — check that before you
write it; one `@/app/…` import means the split line is wrong.

Two names are private today and must become exported, because the state machine that
stays behind uses them: `isWorkspacePageRoute` and `isContributedPath` is fine to
keep private (only `routeSessionId` and `appViewForPath` call it). Export
`isWorkspacePageRoute`, since `syncWorkspaceRoute` and `navigateToWorkspacePage` are
its only callers and they stay.

**`app/routes.ts` keeps the state machine and re-exports the vocabulary**, so the
~20 app files that import `@/app/routes` do not move:

```ts
export * from '@/lib/routes'

import { $workspaceIsPage, isWorkspacePageRoute } from '@/lib/routes'
import { noteActiveTreeGroup, revealTreePane } from '@/components/pane-shell/tree/store'
```

`export *` is the right call here rather than twenty explicit lines: the module is
*the app's route door* and the vocabulary moved underneath it, not out of its
audience. Its own five consumers — `app/contrib/wiring.tsx`, `app/hooks/use-keybinds.ts`,
`app/command-palette/body.tsx`, `app/context-menu/app-context-menu.tsx`,
`app/session/hooks/use-session-actions/session-navigation-actions.ts` — keep their
specifier and keep working.

`app/routes.test.ts` tests the classifiers and now resolves them through the
re-export. Leave it where it is: it is still testing the module the app imports, and
moving it would be churn for the sake of tidiness. If a case in it is really about
the vocabulary alone, moving that case to a `lib/routes.test.ts` is fine, but do not
split the file just to make the tree look even.

## What stays — and one thing this batch must NOT take

`$workspaceIsPage` stays in `app/routes.ts`, even though it is a bare `nanostores`
atom that could sit at rank 0. It is written by `syncWorkspaceRoute`, which stays;
keeping the atom beside its only writer is the honest read of the file.

It is also deliberate boundary-keeping: **`lib/keybinds/composer-focus-keys.ts` is
the one other below-app consumer of `$workspaceIsPage`, and its edge to
`@/app/routes` belongs to batch 07a** (which pays it by splitting that file — the
resolver goes to `components/`, the rest to `app/`). Sinking the atom here would
delete 07a's edge out from under it and make two dispatched work orders' counts
disagree. 11 pays three edges and leaves that one alone. If you find yourself
touching `lib/keybinds/`, you have crossed the line — stop.

## The three lines

All three are one specifier edit each:

```
components/assistant-ui/thread/assistant-message.tsx:13  SETTINGS_ROUTE            → '@/lib/routes'
components/find-bar.tsx:5                                appViewForPath, isOverlayView → '@/lib/routes'
components/tips/use-tip-rotation.ts:25                   SETTINGS_ROUTE            → '@/lib/routes'
```

Nothing else below `app/` imports the module. Confirm with the resolver before and
after — the expected set is exactly those three plus
`lib/keybinds/composer-focus-keys.ts`, which must stay:

```bash
cd apps/desktop
node ../../.agents/skills/architecture-tree-report/scripts/arch-tree.mjs --move app/routes.ts --to lib/
```

Note what that command reports: it prints *importers*, so `lib/keybinds/` will be
listed. That is expected and is the one you leave.

## Verification

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # again: the ledger must not move
```

Baseline: tests **775 files / 7466**. The ledger drops by **3** from whatever it
reads when you start.

`app/routes.workspace-reveal.test.ts` is the test that matters here: it exercises
`syncWorkspaceRoute` and `navigateToWorkspacePage`, which stay — so it must pass
untouched. If it fails, the re-export or the private-name export is wrong, not the
test.

## Stop conditions

- **`ROUTES_AREA` is still declared in `app/routes.ts`.** 09b has not landed. Stop —
  `lib/routes.ts` cannot import from `app/`, and duplicating the const would give the
  registry two spellings of one area id.
- **`lib/routes.ts` needs something at rank 1 or above.** The split line is wrong:
  that name belongs to the state machine, which stays. Report which name.
- **`lib/keybinds/composer-focus-keys.ts` disappears from the ledger.** You sank
  `$workspaceIsPage`. Put it back — that edge is 07a's.
- **The three component files are not the only below-app importers.** Something new
  appeared, or a relative spelling hid one; report the file rather than repointing it
  blind.
- Do not read, edit or stage `src/agentbox/`, `src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md` or `docs/desktop-src-tree.md`.
