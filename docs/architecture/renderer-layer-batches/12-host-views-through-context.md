# Batch 12 — the host views ride the plugin context

**Edges paid off: 3.** Shared rules and the verification recipe:
[README](README.md). Take the ledger's number when you start and subtract 3.

This is **option C** from
[`../renderer-layer-host-views-decision.md`](../renderer-layer-host-views-decision.md),
the one that changes the plugin API rather than working around it. Read that page
first — it has the measurement behind every claim here.

**This batch changes a published surface.** Everything else in this migration is a
relocation. Read "What changes for a plugin author" below before you touch anything:
if a change you are about to make would surprise someone who builds a plugin
against these types, it belongs in the stop conditions, not in the diff.

## What changes for a plugin author

```
today                                    after
import { SkillsView } from               const { SkillsView } = ctx.hostViews ?? {}
  '@hermes/plugin-sdk'
<SkillsView embedded …/>                  <SkillsView embedded …/>
```

`SkillsView`, `McpTab` and `ToolsetConfigPanel` stop being module exports of
`@hermes/plugin-sdk` and become an optional field on the plugin context. The names,
the props, the component identity and the failure mode all stay the same; what
changes is **how the plugin is handed them**.

Why this is the better shape, in one line: the SDK already has a door for "the host
gives you a capability" — `ctx.rest`, `ctx.socket`, `ctx.os`, `ctx.storage`,
`ctx.i18n`, and the `host.*` object. These three were the only capabilities that
arrived through the *module export list* instead, which is why they were the only
ones that could point at an app file. After this batch, `extension/sdk/index.ts`
names no `app/` module at all.

## 12a · the contract, in `extension/contrib/plugin.ts`

`PluginContext` lives there (line 74) and `extension/sdk/index.ts` re-exports it, so
a plugin author gets the new field through the type they already import — no new SDK
export is needed for it.

Add:

```ts
export interface PluginSkillsViewProps extends ComponentProps<'section'> {
  embedded?: boolean
  fixedProfile?: string
  fixedConnection?: string
}
export interface PluginMcpTabProps { gateway: HermesGateway | null; profile?: ProfileScope }
export interface PluginToolsetConfigPanelProps {
  toolset: string
  onConfiguredChange?: () => void
  profile?: ProfileScope
}
export interface PluginHostViews {
  McpTab?: ComponentType<PluginMcpTabProps>
  SkillsView?: ComponentType<PluginSkillsViewProps>
  ToolsetConfigPanel?: ComponentType<PluginToolsetConfigPanelProps>
}
```

and on `PluginContext`, beside `rest` / `socket` / `os` / `storage` / `i18n`:

```ts
/** Views this host can hand to a plugin. Absent on a build that predates
 *  them — probe before rendering, exactly as `os`'s capabilities are probed. */
readonly hostViews?: PluginHostViews
```

plus the host-side registration, next to `createPluginContext`:

```ts
export function setPluginHostViews(views: PluginHostViews): void
```

which stores the value in a module-level binding that `createPluginContext` copies
onto every context it builds (both call sites — `extension/contrib/plugins.ts:61`
for bundled and `extension/contrib/runtime-loader.ts:179` for disk — need no change
if the factory reads it).

Every type in the four interfaces is already at rank 0: `ComponentProps` from React,
`HermesGateway` and `ProfileScope` from `@/hermes` (`hermes.ts:11,18`), which this
module already imports from. If you need anything else, the contract is wrong — stop.

**Move the doc comments, do not drop them.** The three export blocks in
`extension/sdk/index.ts` carry the product knowledge that makes these components
usable, and a plugin author reading `ctx.hostViews` has *less* context than one
reading a named export. In particular these must survive, word for word where they
still apply:

- `SkillsView`: `embedded` keeps tab state out of the URL; `fixedProfile` pins the
  whole surface to one bot; `fixedConnection` pins it to a registered gateway's
  backend and is ignored without `fixedProfile`; **probe
  `SkillsView.supportsFixedConnection` first — a build without it would route the
  pin to the ACTIVE gateway**; Bot Mode's Advanced section is the reference
  consumer.
- `McpTab`: not a checkbox list — per-server enable, OAuth sign-in, API-key setup,
  live probes; route-decoupled; takes a live `gateway` from `host.getGateway()` and
  an optional `profile`.
- `ToolsetConfigPanel`: provider picker, env vars / API keys, model catalog, post-
  setup runners; the "manage keys" deep link is a no-op outside the router;
  optional `onConfiguredChange` and `profile`.

## 12b · the three exports leave the SDK

Delete the `SkillsView`, `ToolsetConfigPanel` and `McpTab` re-export blocks from
`extension/sdk/index.ts` (the ones pointing at `@/app/skills`,
`@/app/settings/toolset-config-panel` and `@/app/skills/mcp-tab`) — the doc comments
have moved in 12a. That is what removes the three edges.

Two neighbouring lines stay: `HermesGateway`'s re-export from `@/hermes` and
`useValue`/`host` and the rest of the surface are untouched. Batch 09 already
deleted three *dead* names from this file and moved two area-vocabulary lines, so
**12 must run after 09** — if `COMPOSER_AREAS` still resolves into `@/app/…`, 09 has
not landed; stop rather than editing around it.

Update the file header's capability-tier list to name the new door:

```
 *  - `host.*` actions — curated, safe verbs (toast, haptic).
 *  - `ctx.hostViews` — whole host surfaces a plugin may render (Capabilities,
 *    toolset config, MCP). Optional: an older build provides none.
```

## 12c · the host provides them

New `app/host-views.ts` — eight lines, mirroring 09d's `app/open-session.ts`:

```ts
import { setPluginHostViews } from '@/extension/contrib/plugin'
import { SkillsView } from '@/app/skills'
import { McpTab } from '@/app/skills/mcp-tab'
import { ToolsetConfigPanel } from '@/app/settings/toolset-config-panel'

setPluginHostViews({ McpTab, SkillsView, ToolsetConfigPanel })
```

and one import in `app/contrib/controller.tsx`, whose module body already calls
`discoverBundledPlugins()` (line ~450):

```ts
import '@/app/host-views'
```

**The ordering problem that option A had to solve does not exist here, and that is
worth understanding rather than copying.** `setPluginHostViews` stores a value that
`createPluginContext` reads while a plugin is *activated* — not a module-scope read
by a plugin at import time. Imports are evaluated before the importing module's body
runs, so a module-scope `import '@/app/host-views'` anywhere in `controller.tsx` is
enough; no particular line, no linter ordering rule to remember. The only fact that
remains is "the host registers before discovery", which is a boot-order fact the app
owns.

That also covers the other doors for free: `discoverRuntimePlugins()` from the
command palette (`controller.tsx:293`), the install modal
(`app/settings/plugin-install-modal.tsx:238`) and Settings ▸ Plugins
(`app/settings/plugins-settings.tsx:249`) all run long after boot, so a runtime
plugin activated from any of them sees the same value.

No bundle change: `@/app/skills` is already evaluated at startup today, because the
SDK imports it and every plugin imports the SDK eagerly. 12c moves *who* imports it,
not *when*.

## 12d · the plugin reads from the context

`plugins/hermes-bots/shared.ts` already exposes `getPluginCtx()`, set during
`register(ctx)`. So `plugins/hermes-bots/profile-config.tsx` stops feature-detecting
the SDK namespace and starts reading the host's contract.

Replace lines 33–43:

```ts
// today — module-scope reads of the SDK namespace
const { McpTab, ToolsetConfigPanel } = sdk
export const SkillsView = typeof sdk === 'undefined' ? undefined : sdk.SkillsView
export const skillsViewRoutesConnections = Boolean(SkillsView && SkillsView.supportsFixedConnection)

// after — read when it is needed, from the context the host handed us
export function hostViews(): PluginHostViews {
  return getPluginCtx()?.hostViews ?? {}
}
export function skillsViewRoutesConnections(): boolean {
  return Boolean(hostViews().SkillsView?.supportsFixedConnection)
}
```

`skillsViewRoutesConnections` becomes a **function** because the context does not
exist at module scope — `register(ctx)` runs after the plugin's modules are
evaluated. That is the whole reason the const cannot stay, and it is also the fix:
the value is now read at render time, when it is definitely there.

Use sites to update — all of them are inside component bodies, so a call is all it
takes:

```
plugins/hermes-bots/profile-config.tsx:258, 278, 307, 423, 442
plugins/hermes-bots/create-agent-dialog.tsx:674, 765
```

Read `hostViews()` **once per render** into a local (`const { SkillsView } =
hostViews()`) rather than calling it at each use — same object every time, but one
read is easier to read and to keep consistent.

`create-agent-dialog.tsx` keeps importing `SkillsView` and
`skillsViewRoutesConnections` from `./profile-config`; only the shape of the latter
changes.

## 12e · the four tests

The plugin's tests currently simulate an older build by stripping keys from the
mocked SDK namespace. That simulation moves to the context. **Every behavioural
assertion stays** — this step is plumbing, and if an assertion has to change, that is
a signal the batch changed behaviour.

| file | what moves |
| --- | --- |
| `legacy-sdk-compat.test.ts` | Its premise becomes *more* accurate: not "an older SDK does not export the name" but "a host that provides no views". Register the plugin against a ctx without `hostViews` (or leave `getPluginCtx()` null) and assert the same two outcomes — the plugin still links and registers, and the connection-routing capability reads false. Rewrite the file's doc comment to say host, not SDK. |
| `profile-config-capabilities.test.tsx` | The three spied components (`sdk.spy(name)`, lines 36–90ish) move from SDK-namespace keys to `hostViews` on the context the test installs. The prop assertions that follow (lines 181–250) do not change. |
| `create-agent-lazy-profile.test.tsx` | The `Object.defineProperty` getter on the mocked namespace (line 71) becomes a ctx whose `hostViews` is present or absent per `hasSkillsView.value`. The two-parameter `renderDialog(hasSkillsView)` shape survives. |
| `profile-config.test.ts` | Simplest: drop the three `undefined` keys from the SDK mock (they no longer exist), and keep `vi.mock('./shared', () => ({ getPluginCtx: () => null, … }))` — a null context is exactly "no host views". |

## What the app does *not* have to do

`SkillsViewProps` in `app/skills/index.tsx` carries a dead
`setStatusbarItemGroup?: SetStatusbarItemGroup` (accepted and ignored — the
destructure is `_setStatusbarItemGroup`), and the same ignored prop sits on
`MessagingView`, `ArtifactsView` and `CronView`. **Leave all of it alone.** The
contract declares only what a plugin may pass, and the app's component may accept
more than the contract requires — a component whose props are
`PluginSkillsViewProps & { setStatusbarItemGroup?: … }` is assignable to
`ComponentType<PluginSkillsViewProps>`. Under option A this prop was the reason the
published interface would have needed a rank-5 type; under C it is simply not the
contract's business. Removing dead app-internal plumbing is a separate, smaller
decision and it is not this batch's.

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
reads when you start, and `extension → app` reaches **0**.

Do not stop at "typecheck passes": the whole risk in this batch is that a plugin
silently loses a capability. Run the Bot Mode surface by hand or through the
existing tests and confirm three things — a local bot's Advanced section renders the
real `SkillsView`, a remote bot's does too (that is the `fixedConnection` +
`supportsFixedConnection` path), and `legacy-sdk-compat`'s no-views case still reads
false.

## Stop conditions

- **A plugin file other than `hermes-bots` reads `sdk.SkillsView` / `McpTab` /
  `ToolsetConfigPanel`.** They are gone from the SDK; the four renamed call sites are
  the complete list as measured. A fifth means the measurement was wrong — report it.
- **`sdk.SkillsView` is still read anywhere at module scope.** That cannot work with
  a context — the context does not exist yet. Report the file rather than adding a
  module-scope fallback.
- **The three names turn out to be used by `plugins/agentbox-lab/`.** Checked on the
  day this was written: it imports the SDK but names none of them. If that changed,
  stop — that directory is in-flight work and is not yours to edit.
- **`hostViews` needs a type that is not rank 0.** The contract would start
  depending on the app, which is the whole thing being removed. Report the type.
- **A behavioural assertion in `profile-config-capabilities.test.tsx` or
  `create-agent-lazy-profile.test.tsx` has to change.** The plumbing moved; the
  behaviour did not. Report which assertion and why.
- Do not read, edit or stage `src/agentbox/`, `src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md` or `docs/desktop-src-tree.md`.
