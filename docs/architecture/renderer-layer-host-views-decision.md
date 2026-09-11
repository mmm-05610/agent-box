# The host-view decision — the last thing in the renderer migration that needs a call

**Status: decided — option C.** The host views ride the plugin context, written up
as [batch 12](renderer-layer-batches/12-host-views-through-context.md). This page is
kept as the record of the decision: the constraint, the five options and why the
chosen one won. The two paragraphs below are how the question was posed, not an
open question.

Edges at stake: **3** (`extension → app`, the last three). Context:
[`renderer-layer-boundary.md`](renderer-layer-boundary.md) §K3 and
[`renderer-layer-master-plan.md`](renderer-layer-master-plan.md) §7.

## Why these three are the hard ones

They cannot move. Measured, not assumed:

| component | file | lines | `app/` imports |
| --- | --- | --- | --- |
| `SkillsView` | `app/skills/index.tsx` | 1,382 | 18 |
| `McpTab` | `app/skills/mcp-tab-view.tsx` | 917 | 7 |
| `ToolsetConfigPanel` | `app/settings/toolset-config-panel.tsx` | 904 | 3 |

They are not primitives that happen to sit in `app/` — they are the Capabilities and
Settings surfaces, wired into the router, the profile scope, the MCP OAuth
application layer and the master-detail toolkit. Every other `extension → app` line
was payable by moving a leaf, a piece of data or a verb down
([09](../renderer-layer-batches/09-plugin-abi.md) did thirteen of the sixteen,
[10](../renderer-layer-batches/10-composer-engine.md) and
[11](../renderer-layer-batches/11-route-vocabulary.md) took the rest of the tree's).
These three need the contract inverted, or left alone.

## The constraint that shapes every option

`plugins/hermes-bots/profile-config.tsx` reads the SDK **at module scope**:

```ts
// lines 36–43
const { McpTab, ToolsetConfigPanel }: Partial<Pick<typeof sdk, …>> = sdk
export const SkillsView = typeof sdk === 'undefined' ? undefined : sdk.SkillsView
export const skillsViewRoutesConnections = Boolean(SkillsView && SkillsView.supportsFixedConnection)
```

and that module is evaluated during the eager bundled-plugin glob, which is itself a
static dependency of one file:

```
app/contrib/controller.tsx:38        import { discoverBundledPlugins } from '@/extension/contrib/plugins'
extension/contrib/plugins.ts:19      import.meta.glob('../../plugins/*/plugin.{js,ts,tsx}', { eager: true })
  → plugins/hermes-bots/plugin.tsx → roster-pane.tsx:44 → roster-pane-dialogs.tsx:4
  → create-dialog.tsx:12 → create-agent-dialog.tsx:43 → profile-config.tsx:11
```

Two facts make this tractable rather than fatal:

1. **`extension/contrib/plugins.ts` has exactly one production importer** —
   `app/contrib/controller.tsx:38`. Nothing imported earlier in that file reaches it.
   So an `app/` module imported *before* line 38 has already run by the time any
   plugin module evaluates. The ordering is enforceable at a single site, and
   `@/app/…` sorts before `@/extension/…` under the repo's import ordering rules, so
   the linter will not fight it.
2. **`app/skills/index.tsx:1095`'s `SkillsView.supportsFixedConnection = true as const`
   is a property on the component value.** Handing the real component through a
   registration seam carries it automatically — no wrapper, no proxy, no copy of the
   flag. The seam must pass the component itself, never a component that *renders* it.

## The options

### A · register the components from `app/` (recommended)

`extension/sdk/host-views.ts` declares the contract and three module-level bindings;
`app/host-views.ts` imports the three real components and fills them at module
scope; `app/contrib/controller.tsx` gains one import above line 38.

```ts
// extension/sdk/host-views.ts — the ABI side
export interface PluginSkillsViewProps extends ComponentProps<'section'> {
  embedded?: boolean; fixedProfile?: string; fixedConnection?: string
}
export interface PluginMcpTabProps { gateway: HermesGateway | null; profile?: ProfileScope }
export interface PluginToolsetConfigPanelProps {
  toolset: string; onConfiguredChange?: () => void; profile?: ProfileScope
}
export let SkillsView: ComponentType<PluginSkillsViewProps> | undefined
export let McpTab: ComponentType<PluginMcpTabProps> | undefined
export let ToolsetConfigPanel: ComponentType<PluginToolsetConfigPanelProps> | undefined
export function registerPluginHostViews(views: { … }): void
```

```ts
// app/host-views.ts — the host side, evaluated before the plugin glob
registerPluginHostViews({ McpTab, SkillsView, ToolsetConfigPanel })
```

`extension/sdk/index.ts` re-exports the same three names from `./host-views`, so
**every plugin keeps `import { SkillsView } from '@hermes/plugin-sdk'` unchanged**,
including the `undefined`-on-an-older-SDK behaviour that
`legacy-sdk-compat.test.ts` pins — the test passes untouched.

Every type in those three interfaces is already at rank 0: `HermesGateway` and
`ProfileScope` are re-exported by the SDK from `@/hermes`, and `ComponentProps` is
React's. The app's three components are then typed *by* these interfaces
(`app/ → extension/` is downward, and type-only), so the contract cannot drift: if
someone adds a prop to `SkillsView` without declaring it in the SDK, the
implementation site is the thing that fails to compile.

**One piece of dead plumbing has to go with it.** `SkillsViewProps` carries
`setStatusbarItemGroup?: SetStatusbarItemGroup`, and `SkillsView` deliberately
ignores it (`setStatusbarItemGroup: _setStatusbarItemGroup`). It is passed in exactly
one place — `app/contrib/surfaces.tsx:170` — and the same ignored prop is on
`MessagingView`, `ArtifactsView` and `CronView`. It is the only reason the SDK's
`SkillsView` interface would need a rank-5 type. Delete it: four prop interfaces,
one call site, three destructures, one now-unused import. Nothing reads it, so
nothing changes; a plugin that passed it today is passing a prop that does nothing.

Cost: two new small modules, one import line, four small edits, one §6
silent-failure entry (below), one test. **3 edges gone, ABI names and semantics
unchanged, prop checking preserved.**

### B · the same seam, loosely typed

Identical, except the bindings are `ComponentType<Record<string, unknown>> | undefined`
and the SDK declares no prop interfaces. Saves the dead-prop cleanup, costs plugin
authors their prop checking on the three biggest components — the ABI would accept
`<SkillsView fixedProfle="typo" />` silently. Cheapest, and the only option that
makes the published surface worse.

### C · hand the views to the plugin through `ctx`

`PluginContext.hostViews?: { SkillsView?, McpTab?, ToolsetConfigPanel? }`, supplied
by the host when it calls `plugin.register(ctx)`. Conceptually the cleanest of the
five — a host *capability* riding the host's context, with no module-evaluation
ordering problem at all, because the value arrives as data at registration time.

It is also the only option that **changes the plugin API**: call sites become
`ctx.hostViews?.SkillsView`, `plugins/hermes-bots/profile-config.tsx` and
`create-agent-dialog.tsx` change, `skillsViewRoutesConnections` stops being a
module-scope const, and `legacy-sdk-compat.test.ts` — whose entire premise is "an
older SDK does not export this name" — has to be rewritten around "an older host
does not provide this field". External plugins built against the published types
break.

That is a deliberate ABI-versioned change, not a layering fix. It belongs in its own
round with the vocabulary table that has been deferred, not inside a relocation
batch. (It is also the better *long-term* shape, and worth writing down as such.)

### D · make the plugin glob lazy

`import.meta.glob(…, { eager: false })` and load plugin modules at `activate()`
time. Removes the ordering problem at the root instead of working around it. But
`discoverBundledPlugins()` currently publishes each plugin's record synchronously
during discovery, and the live enable/disable lifecycle builds on that; deferring
module evaluation moves it into the lifecycle. That is a behaviour change in the
plugin host, and this round is relocations only.

### E · leave the three edges

Do nothing. The ABI keeps exposing three component modules of the app, which is the
original sin (every `app/` refactor of those files is an ABI change), and the ledger
never goes below 3. It was a legitimate answer while the ledger still had undecided
work behind it; now that every line has a work order and the target is 0, a non-zero
ledger is a defect rather than an endpoint. Not taken.

## Recommendation

*Written before the decision. The answer taken was **C**, for the reason named at the
end of this page: the API was worth fixing while the only consumers are in-tree.*

**A.** It is the only option that pays the three edges, keeps the published ABI's
names, types and failure semantics exactly as they are, needs no plugin change, and
takes a known, small amount of work. It also fits the pattern the rest of this
migration already established: `lib/desktop-fs.ts`'s `setDesktopFsConnectionSource`
(host supplies a capability downward) and 09d's `lib/open-session.ts` (host
publishes a verb downward). This is the same move with three component values.

Its one real cost is the ordering invariant, and that is a known, testable hazard
rather than a hidden one: registration must be evaluated before
`extension/contrib/plugins.ts`. It gets a §6 entry in the master plan and a test that
imports the app's own graph and asserts `skillsViewRoutesConnections === true`.

If the answer is **C** instead, say so and it becomes a different, larger work order
that also touches the plugin's call sites, its tests and the ABI docs — and the
three edges are paid there rather than here.

## What the chosen option's work order contains

For **A**, one batch, four steps: the SDK contract module, the app registration
module plus the import line, the dead `setStatusbarItemGroup` removal, and the three
components typed against the published interfaces. Plus the §6 entry and the test.
That is the last three edges: the ledger would reach **0** for `extension/` and
**10 → 7** overall.
