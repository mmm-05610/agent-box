# Batch 09 — the plugin ABI stops reaching into the app

**Edges paid off: 14.** Shared rules and the verification recipe:
[README](README.md). This is knot 2 from
[`../renderer-layer-boundary.md`](../renderer-layer-boundary.md) §2, decided: **delete
the dead surface, sink the data and the components, invert the one verb.**

Sixteen `extension → app` edges are in the ledger, plus a seventeenth that no
specifier grep finds (09d, last row of the table below). Fourteen are mechanical
once the ABI's shape is read correctly, which is what this document does. **Three
are deliberately left behind** — the three optional host pages — and the last
section says exactly why and what has to be decided first. If you find yourself
editing `app/skills/index.tsx` to satisfy this batch, you have walked into that
section: stop and report.

## The sixteen lines, and what happens to each

All sixteen are in the ledger already. Fifteen come from the SDK's re-export list
— the plugin ABI is the only `extension/` code that names `app/` — and the
seventeenth is a component that reaches for the same behaviour by dynamic
`import()`.

| # | the ledger line | step |
| --- | --- | --- |
| 1 | `host-session-options.ts -> @/app/open-session` | 09d — verb through a host-supplied seam |
| 2 | `host-session.ts -> @/app/open-session` | 09d |
| 3 | `sdk/index.ts -> @/app/chat/composer/contrib` | 09b — the area id sinks to `lib/` |
| 4 | `sdk/index.ts -> @/app/chat/session-status-dot` | 09c — the component sinks |
| 5 | `sdk/index.ts -> @/app/chat/sidebar/chrome` | 09c |
| 6 | `sdk/index.ts -> @/app/chat/sidebar/connection-glyph` | 09c |
| 7 | `sdk/index.ts -> @/app/chat/sidebar/row-geometry` | 09a — nothing uses it |
| 8 | `sdk/index.ts -> @/app/command-palette/contrib` | 09b |
| 9 | `sdk/index.ts -> @/app/overlays/panel` | 09c |
| 10 | `sdk/index.ts -> @/app/routes` | 09b |
| 11 | `sdk/index.ts -> @/app/settings/toolset-config-panel` | **left behind** — host page |
| 12 | `sdk/index.ts -> @/app/shell/model-catalog-menu` | 09c |
| 13 | `sdk/index.ts -> @/app/shell/statusbar-controls` | 09a |
| 14 | `sdk/index.ts -> @/app/shell/titlebar-controls` | 09a |
| 15 | `sdk/index.ts -> @/app/skills` | **left behind** — host page |
| 16 | `sdk/index.ts -> @/app/skills/mcp-tab` | **left behind** — host page |
| 17 | `components/assistant-ui/directive-text.tsx -> @/app/open-session` | 09d — the same seam, used by a component |

Run 09a, 09b, 09c, 09d as one work order, in that order. Only 09a is
observable on its own; the rest is one ledger drop at the end.

## 09a · Delete the ABI surface nothing can reach — 3 edges

`extension/sdk/index.ts` re-exports 216 names. **25 of the names it pulls out of
`app/` are referenced by nothing** — not by a plugin, not by the SDK's own
tests, not by the plugin test suites that mock it. Keep them and you cannot even
finish the sinks below: 15 of `overlays/panel`'s 16 names are dead, so "move the
panel file" would have to move a master-detail toolkit into `components/` to
serve one empty state.

Three of the 25 are the *whole* of their module's ABI, so deleting them deletes
the import line:

```
extension/sdk/index.ts:95   export { SIDEBAR_ROW_LEAD, SIDEBAR_TRUNCATED_LEADING } from '@/app/chat/sidebar/row-geometry'
extension/sdk/index.ts:142  export type { StatusbarItem } from '@/app/shell/statusbar-controls'
extension/sdk/index.ts:143  export type { TitlebarTool } from '@/app/shell/titlebar-controls'
```

Delete those three lines. The modules themselves stay — `row-geometry.ts` is
imported by `chrome.tsx` and `connection-glyph.tsx`, and `statusbar-controls` by
`app/skills/index.tsx`. Only the plugin-facing re-export is dead.

The other 22 dead names are spread across four modules that 09b and 09c touch
anyway, and they must go for those steps to be small:

| module | delete from the re-export | keep |
| --- | --- | --- |
| `@/app/chat/composer/contrib` | `ComposerAtCompletionItem`, `ComposerAtCompletionSource`, `ComposerAttachmentProvider`, `ComposerMiddleware` | `COMPOSER_AREAS` |
| `@/app/chat/session-status-dot` | `SessionStatusDotProps` | `SessionStatusDot` |
| `@/app/overlays/panel` | `PanelAction`, `PanelAddButton`, `PanelBlock`, `PanelBody`, `PanelDetail`, `PanelHeader`, `PanelList`, `PanelListRow`, `PanelMenuItem`, `PanelMeta`, `PanelMetaRow`, `PanelPill`, `PanelPillTone`, `PanelRowMenu`, `PanelSectionLabel` | `PanelEmpty` |
| `@/app/shell/model-catalog-menu` | `ModelChoice` | `ModelCatalogMenu`, `ModelMenuCloseContext`, `ModelMenuController` |

**Do not delete anything else, and do not delete the modules' own exports** —
several of the names above have plenty of in-app consumers (`PanelList` is on
every master-detail page). Only the ABI line goes.

### Re-derive the list; do not trust the table

Names drift. The check is a name-presence scan, and it must cover
`src/plugins/**` (including the in-flight `agentbox-lab` sandbox — **report only,
never edit anything there**), `src/extension/**`, and every `*.test.*` under both:

```
for each name exported from src/extension/sdk/index.ts:
  does the name appear, as a whole word, anywhere under src/plugins or src/extension
  (excluding src/extension/sdk/index.ts itself)?
```

A name with zero hits is dead ABI surface. `node /tmp/sdk-reach.mjs`-style ad-hoc
scripts are how this list was produced; writing the ten lines yourself is fine.
If the scan's answer disagrees with the table above for a name inside an
`@/app/…` module, **stop and report** — the drift means the table is stale.

If the scan disagrees for a name in some other module, ignore it: this batch
prunes dead surface only where a sink forces the question. Roughly fifty more
dead names sit in `@/lib/**`, `@/components/**`, `@/themes/**` and `@/i18n`
(`requestTheme`, `THEMES_AREA`, `StatusDot`, `Kbd`, `EmptyState`,
`TRANSCRIPT_DIRECTIVE_AREA`, `DesktopTheme`, `triggerHaptic`/`haptic…`) and
pruning those is a separate, deliberate decision about how wide the ABI should
be. Not here.

## 09b · The area vocabulary moves down to `lib/` — 3 edges

The three remaining data edges are all the same mistake: an **area id plus its
payload type** — pure data, no React, no state — filed inside the feature that
happens to own the area. The SDK reaches up for them; nothing about them needs
`app/`.

The repo already agrees: `KEYBINDS_AREA` lives in `lib/keybinds/actions.ts`,
`CHAT_EMPTY_AREA` in `lib/chat-empty.ts`, `TRANSCRIPT_DIRECTIVE_AREA` in
`lib/transcript-directives.ts`. Follow that.

**New file `lib/contribution-areas.ts`**, holding exactly these seven names,
moved verbatim with their doc comments:

```
from app/routes.ts                  ROUTES_AREA, RouteContribution, SIDEBAR_NAV_AREA, SidebarNavContribution
from app/command-palette/contrib.ts PALETTE_AREA, PaletteContribution
from app/chat/composer/contrib.ts   COMPOSER_AREAS
```

All seven depend on `@/types/**` and `@/lib/**` only — `PaletteContribution`
names `IconComponent` from `@/lib/icons` and nothing else. Verify that before
you move them; if any of the seven needs something from `store/` or above, the
destination is wrong, so stop and report.

Each of the three originals **re-exports what it gave up**, so their in-app
consumers do not move:

```ts
// app/routes.ts
export { ROUTES_AREA, type RouteContribution, SIDEBAR_NAV_AREA, type SidebarNavContribution } from '@/lib/contribution-areas'
```

`app/routes.ts` is a router; it is not the home of an area id, and the re-export
is one line. Same in `app/command-palette/contrib.ts` and
`app/chat/composer/contrib.ts`.

Then repoint the SDK:

```
extension/sdk/index.ts:74   '@/app/chat/composer/contrib'   → '@/lib/contribution-areas'
extension/sdk/index.ts:96   '@/app/command-palette/contrib' → '@/lib/contribution-areas'
extension/sdk/index.ts:123  '@/app/routes'                  → '@/lib/contribution-areas'
```

Note what does **not** move: `paletteToggle`, `usePaletteContributions`,
`runComposerMiddleware`, `useComposerAttachmentProviders`,
`useComposerMicroActionProviders`, `contributedRoutes`, `sessionRoute`,
`appViewForPath`, `$workspaceIsPage`. Those are behaviour; they stay in `app/`,
and the SDK never wanted them.

## 09c · Five components sink to `components/` — 5 edges

Each one is a presentation primitive that the ABI shares with core. All five
were checked import by import: after the move every one of them stands on
`@/types`, `@/lib`, `@/store`, `@/i18n`, `@/components`, React and third-party
packages, and nothing above `components/`. **Re-verify that per file as you
move it** — the check is "does this file name `@/app/…`?", and a single hit
means the destination is wrong, so stop and report rather than adding an edge.

| from | to | why it can live there |
| --- | --- | --- |
| `app/chat/session-status-dot.tsx` (165) | `components/chat/session-status-dot.tsx` | reads `store/session-color`, `store/session-dot-state`, `lib/use-session-slice`, `i18n` — zero `app/` imports |
| `app/chat/sidebar/row-geometry.ts` (56) | `components/chat/sidebar/row-geometry.ts` | only `@/lib/utils` |
| `app/chat/sidebar/connection-glyph.tsx` (39) | `components/chat/sidebar/connection-glyph.tsx` | only `./row-geometry` + `@/lib/icons` |
| `app/shell/model-catalog-menu.tsx` (781) | `components/model-catalog-menu.tsx` | 25 imports, none above `components/` |
| `app/shell/model-edit-submenu.tsx` (186) | `components/model-edit-submenu.tsx` | `model-catalog-menu`'s only `app/`-sibling import |

`components/` already keeps `model-picker.tsx` and `model-visibility-dialog.tsx`
at its top level, so the menu pair goes beside them; `components/chat/` already
holds chat primitives; `components/chat/sidebar/` is new and mirrors the
directory the geometry came from.

**`SidebarRowLead` splits out of `chrome.tsx`.** `chrome.tsx` is 385 lines and
cannot sink: it reads `@/app/chat/new-session-drag`. The ABI only wants the row's
leading box, so move that component — and nothing else — into a new
`components/chat/sidebar/row-lead.tsx`:

```ts
export function SidebarRowLead({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn(SIDEBAR_ROW_LEAD, className)} {...props} />
}
```

Move its doc comment with it. `chrome.tsx` then re-exports it
(`export { SidebarRowLead } from '@/components/chat/sidebar/row-lead'`) so the
five sidebar files importing it from `./chrome` do not move, and the six
`SidebarRowLeadGlyph` consumers stay exactly as they are. `SidebarRowLeadGlyph`
is **not** in the ABI — leave it in `chrome.tsx`.

**`PanelEmpty` splits out of `panel.tsx`.** Same shape: `panel.tsx` is 431 lines
and reads `./overlay-view`. `PanelEmpty` is twenty lines — a `Codicon`, an
optional title, description and action — and it is the only panel export the ABI
uses. Move it with its private `PanelEmptyProps` into
`components/ui/panel-empty.tsx`, beside `empty-state.tsx`. `panel.tsx`
re-exports it so its twenty app consumers stay put, and
`components/ui/empty-state.tsx`'s comment ("want an icon + action, use
`PanelEmpty` (overlays/panel)") is updated to the new path.

**Repoint the SDK** — six lines:

```
extension/sdk/index.ts:85   '@/app/chat/session-status-dot'      → '@/components/chat/session-status-dot'
extension/sdk/index.ts:90   '@/app/chat/sidebar/chrome'          → '@/components/chat/sidebar/row-lead'
extension/sdk/index.ts:94   '@/app/chat/sidebar/connection-glyph'→ '@/components/chat/sidebar/connection-glyph'
extension/sdk/index.ts:105–122  '@/app/overlays/panel'           → keep the line, but only PanelEmpty survives 09a;
                                                                   import it from '@/components/ui/panel-empty'
extension/sdk/index.ts:136–141  '@/app/shell/model-catalog-menu' → '@/components/model-catalog-menu'
```

**Repoint the moves' own importers** — resolve, never grep. The counts below are
what `arch-tree --move` reports today (production importers, excluding the moved
files' own references to each other); if your resolved list is longer or shorter,
the tree moved under you:

| moved module | production importers to repoint |
| --- | --- |
| `session-status-dot.tsx` | 5 (`app/contrib/controller.tsx` and four sidebar/composer files) |
| `row-geometry.ts` | 2 (`chrome.tsx`, `connection-glyph.tsx`) |
| `connection-glyph.tsx` | 2 |
| `model-catalog-menu.tsx` | 1 |
| `model-edit-submenu.tsx` | 1 |

Use `node .agents/skills/architecture-tree-report/scripts/arch-tree.mjs --move
<file> --to components/` from `apps/desktop` for each one — it prints the
importer list *and* refuses a destination whose layer would make any of them
inward. Relative spellings (`'./row-geometry'`, `'../chrome'`) are invisible to a
specifier grep, which is how this repo has already missed importers five times.

## 09d · `host.openSession` becomes a host-supplied verb — 3 edges

These are the only places anything below `app/` reaches up for **behaviour**
rather than data. Two are the ABI itself; the third is a component nobody's
specifier grep finds, because it is spelled as a dynamic import:

```
extension/sdk/host-session-options.ts:1  import type { OpenSessionIntent } from '@/app/open-session'
extension/sdk/host-session.ts:4          import { openSession } from '@/app/open-session'

components/assistant-ui/directive-text.tsx:442
  void import('@/app/open-session').then(({ openSession }) => openSession(sessionId, () => undefined, 'tab'))
```

`directive-text` wants exactly half of the verb — the `'tab'` open, with a
`navigate` that does nothing, so an already-open tile is fronted and the router
is left alone. That is `openSession`'s own `'tab'` branch, so it uses the same
seam rather than a second contract. **This is why the seam is named for the host,
not for plugins**: `lib/open-session.ts` is the host publishing one of its verbs
downward, and `host.openSession` is one caller, not the definition.

`app/open-session.ts` is 177 lines of "the user asked to open this session":
mark it viewed, then pick between window / tab / main / in-place. That is a
**host decision**, and `host.openSession()` is the plugin verb that asks for it —
so the verb is what gets inverted, exactly as the desktop-fs connection source
did (`lib/desktop-fs.ts:51 setDesktopFsConnectionSource`, filled from
`app/contrib/hooks/use-desktop-fs-connection.ts`). The module stays in `app/`
where the routing vocabulary lives; the SDK stops naming it.

**New file `lib/open-session.ts`** — the contract, and nothing else:

```ts
import type { SessionOwnerRoute } from '@/types/session'
import type { WorkspaceMode } from '@/types/contributions'

export type OpenSessionIntent = 'in-place' | 'main' | 'stack' | 'tab' | 'window'

export interface OpenSessionScope {
  ownerRoute?: SessionOwnerRoute
  workspaceMode: WorkspaceMode
  workspaceOwnerKey?: string
  workspaceTabTitle?: string
}

export type OpenSessionHandler = (
  storedSessionId: string,
  navigate: (to: string, options?: { replace?: boolean }) => void,
  intent: OpenSessionIntent,
  scope?: OpenSessionScope
) => void

export function setOpenSessionHandler(handler: OpenSessionHandler): void
export function requestOpenSession(...): void   // throws when unset
```

`SessionOwnerRoute` is already on the `@/types/session` leaf (see the header of
`store/session/types.ts`), so this file stands on rank-0 modules only — check
that, it is the whole reason the seam can live here. `app/open-session.ts`'s
`OpenSessionIntent` / `OpenSessionWorkspaceScope` become re-exports of these
types, so its existing importers do not move.

**Register at the bottom of `app/open-session.ts`**, at module scope:

```ts
setOpenSessionHandler(openSession)
```

Module scope, not a hook or a mount effect: the verb has to be answerable the
first time a plugin calls it, and a registration that waits for React to mount
is a silent "not registered yet" window. `app/open-session.ts` is already in the
app's eager graph (13 importers), so importing it is what installs the verb.

**Unset means a clear failure, not a no-op.** `requestOpenSession` throwing is
the honest outcome for a host that never registered; a silent no-op would look
like "the click did nothing". Do not add a fallback that navigates on its own —
that is the app's decision, which is the reason for the seam. `directive-text`
registers nothing and only calls: it replaces its dynamic import with
`requestOpenSession(sessionId, () => undefined, 'tab')`, which is the same call
its `.then()` makes today. It cannot be reached unregistered — the app registers
at module scope, and a directive renders long after that — so the throw is a
programming-error tripwire, not a user-facing state.

Then repoint the two SDK files and the component, and delete the now-unused
`app/` imports.

## What is left behind — three edges, and why

`@/app/skills` (`SkillsView`, 1,382 lines), `@/app/skills/mcp-tab`
(`McpTab`, 917 lines) and `@/app/settings/toolset-config-panel` (904 lines) stay.
They are not relocatable — `skills/index.tsx` names eighteen `app/` modules — so
the earlier plan was to invert them too: declare a host-view contract and let
`app/` register the components.

**That does not work as a mechanical step, and the reason is worth writing down
before someone else tries it.** `plugins/hermes-bots/profile-config.tsx:37–43`
reads the capability **at module scope**:

```ts
export const SkillsView = typeof sdk === 'undefined' ? undefined : sdk.SkillsView
export const skillsViewRoutesConnections = Boolean(SkillsView && SkillsView.supportsFixedConnection)
```

and that module is evaluated during the eager bundled-plugin glob:

```
extension/contrib/plugins.ts   import.meta.glob('../../plugins/*/plugin.{js,ts,tsx}', { eager: true })
  → plugins/hermes-bots/plugin.tsx
  → roster-pane.tsx:44 → roster-pane-dialogs.tsx:4 → create-dialog.tsx:12
  → create-agent-dialog.tsx:43 → profile-config.tsx:11
```

`plugins.ts` is a static dependency of `app/contrib/controller.tsx`, so **every
plugin module is evaluated before any `app/` module body runs**. An
`app/`-side registration seam is therefore always too late for that read, and
the failure is silent: `skillsViewRoutesConnections` sticks at `false` and a
source-scoped bot loses connection routing in its Capabilities tab — a
behaviour regression that no existing test covers, because
`legacy-sdk-compat.test.ts` only exercises the mocked-SDK path.

It is solvable — read the capability lazily; hand it to the plugin through
`ctx`; make the glob lazy; or sink the prop types into a shared contract — but
each of those is a design choice about the plugin ABI, and the executor must not
pick one. It is recorded as an open knot in
[`../renderer-layer-master-plan.md`](../renderer-layer-master-plan.md) §7. The
three ledger lines stay until it is decided.

## No consumer changes — except the wiring below

Deleting 25 names and moving five modules **changes no plugin**, because the
plugin side imports all of it from `@hermes/plugin-sdk` and that specifier does
not move. `plugins/hermes-bots/bot-row.tsx`, `roster-pane-content.tsx` and
`cron.tsx` keep working untouched. The one plugin-visible thing to confirm is
that `PanelEmpty` and `SidebarRowLead` still arrive through the SDK, which the
existing plugin tests cover.

## Verification

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # again: the ledger must not move
```

Baseline: tests **775 files / 7466**. The ledger drops by **14** from whatever it
reads when you start — 09 shares wave 1 with 02, 06c1 and 06c2, so it is not
necessarily the first batch to land.

The fourteen lines that must be gone are the ones marked 09 in the table at the
top. If the count falls by 14 but a different set of lines disappeared, a step was
done by a route other than the one written here — say so.

## Stop conditions

- **A moved file names `@/app/…`.** The move would keep an edge or create one.
  The destination is wrong, not the layer rule: report it.
- **A name in 09a's table turns out to have a consumer.** Keep the name, keep its
  import line, and report — the sink that name was blocking may then need a
  different shape.
- **The reachability scan reports a hit inside `plugins/agentbox-lab/`.** Keep
  that name and report. Do not read, edit or stage anything in that directory,
  `src/agentbox/`, `docs/architecture/acp-desktop-phase1-design.md` or
  `docs/desktop-src-tree.md`.
- **`host.openSession` throws "not registered" in a real flow.** The handler is
  registered at `app/open-session.ts` module scope; if that is not reached, the
  app graph lost the import — report rather than moving the registration into a
  hook or a try/catch.
- **You need to touch `app/skills/index.tsx`, `app/skills/mcp-tab-view.tsx` or
  `app/settings/toolset-config-panel.tsx`.** Those are the three host pages this
  batch deliberately leaves alone. Stop and report.
