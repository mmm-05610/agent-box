# Batch 08 — sink the pane/layout domain

**Edges paid off: 9** (ledger 58 → 49). Shared rules and the verification recipe:
[README](README.md). This is knot 4 from
[`../renderer-layer-boundary.md`](../renderer-layer-boundary.md) §2, decided.

`components/pane-shell/` is 28 files and 9,116 lines, and it is not one thing. Its
own imports say so:

```
~1500 lines   zero imports at all      grid-model 624 · zones-engine 367 · grid-to-tree 199
                                       floating-rect 109 · tab-selection 99
~2400 lines   state                    tree/store 2029 · workspace-scope 178
                                       strip-visibility 123 · presets 111
the rest      React                    tree-group 921 · tree-split 802 · zone-editor 502
                                       drag-session 608 · geometry · edit-mode · contexts
```

`store/` reaches into the first two tiers, and that is the whole of the 9 edges —
they point at exactly three files: `tree/store` (7), `workspace-scope` (2),
`tree/presets` (1).

Four steps, **in this order**, each a prerequisite of the next. Run them as one
work order; the ledger drop is only observable at the end.

| step | what | why it must come first |
| --- | --- | --- |
| 08a | `extension/contrib/plugins-store.ts` → `store/plugin-state.ts` | `tree/store.ts` reads it, so it must be below `store/` before `tree/store` moves there |
| 08b | split the pane-chrome contract | `track-model.ts` must stop naming `MenuKit` before it can leave `components/` |
| 08c | the pure model → `lib/pane-shell/` | `tree/store.ts` reads three of these |
| 08d | the state → `store/pane-shell/` | the last move; produces the ledger drop |

## 08a · `plugins-store.ts` is state, filed under the feature

126 lines, and its only import is `nanostores`. It is "which renderer plugins are
enabled / loaded / errored" — the same misplacement as the contribution registry
(now `lib/contributions.ts`) and `store/profile/identity.ts` (now
`lib/profile-identity.ts`): a state module filed by feature instead of by layer.

```
extension/contrib/plugins-store.ts -> store/plugin-state.ts
```

- **Name it `plugin-state.ts`.** `store/agent-plugins.ts` already exists and is a
  different thing entirely (the *agent's* plugin rows from the gateway). Two
  files called "plugins" in one directory would be a worse outcome than the 126
  lines it saves.
- Find its consumers **by resolution, not by alias**:
  `rg -l "plugins-store'" apps/desktop/src`. The alias form
  (`@/extension/contrib/plugins-store`) finds only three of them;
  `extension/contrib/plugins.ts` imports `./plugins-store`, and a search for the
  alias string does not see it. This has now cost this project time four times —
  see the master plan §6 entry 8.
- `store/plugin-state.ts` will be imported by `extension/` — that is `extension →
  store`, downward, and legal.

## 08b · Split the pane-chrome contract

`PaneChrome` is declared in
`components/pane-shell/tree/renderer/track-model.ts` — a file that must sink to
`lib/` in 08c — and it names `MenuKit`, a component-kit type from
`@/components/ui/actions-menu` (seven `typeof DropdownMenuItem`-style fields, used
by 14 files).

The split follows **who reads what**, which the code already answers. The sinking
files read only data:

```
store.ts reads    placement · uncloseable · hideOnly · collapsible
                  (and does it with its own inline structural casts —
                   it never calls paneChrome at all)
strip-visibility  headerVeto · placement · uncloseable
track-model       placement
```

and all six render callbacks are read in **exactly one file**:
`renderer/tree-group.tsx` (`newTab` 290, `tabTitle` 400, `tabMenuPrefix` 415,
`tabDrag` 616, `tabLead` 630, `tabWrap` 639).

```
components/pane-shell/tree/renderer/track-model.ts
  PaneSizing            -> lib/pane-shell/chrome.ts
  PaneChromeData        -> lib/pane-shell/chrome.ts   (new name; the data flags)
  paneChrome()          -> lib/pane-shell/chrome.ts   (returns PaneChromeData)

components/pane-shell/tree/renderer/chrome-render.ts  (new)
  PaneChromeRender extends PaneChromeData
  paneChromeRender()    returns PaneChromeRender
```

- `PaneChromeData` keeps these nine and nothing else: `collapsible`,
  `defaultCollapsed`, `revealAliases`, `placement`, `anchor`,
  `lifecycleKeepAlive`, `uncloseable`, `hideOnly`, `headerVeto`.
- `PaneChromeRender` gains the six callbacks: `tabWrap`, `tabMenuPrefix`,
  `tabDrag`, `tabLead`, `newTab`, `tabTitle`. **`newTab` is `() => void` and
  names no React type — it still belongs here**, because the rule is who *calls*
  it, and only the strip does.
- **`MenuKit` does not move.** That is the point of splitting rather than
  relocating the type: its 14 consumers are untouched.
- `tree-group.tsx` is the only file that switches to `paneChromeRender`; every
  other `paneChrome` caller keeps the name and changes only its import path.
- Move the field doc comments with their fields. They explain behaviour that the
  names do not (`hideOnly`'s "Close was too destructive for these", `tabDrag`'s
  deferred-drag contract), and a reader in the new file has less context.

## 08c · The pure model → `lib/pane-shell/`

Six files, none of which touches app state:

| from | to | note |
| --- | --- | --- |
| `tree/grid-model.ts` (624) | `lib/pane-shell/grid-model.ts` | zero imports |
| `tree/zones-engine.ts` (367) | `lib/pane-shell/zones-engine.ts` | zero imports |
| `tree/grid-to-tree.ts` (199) | `lib/pane-shell/grid-to-tree.ts` | |
| `tree/tab-selection.ts` (99) | `lib/pane-shell/tab-selection.ts` | |
| `renderer/floating-rect.ts` (109) | `lib/pane-shell/floating-rect.ts` | zero imports |
| `renderer/track-model.ts` (366) | `lib/pane-shell/track-model.ts` | only after 08b |
| `pane-lifecycle.ts` (76) | `lib/pane-shell/pane-lifecycle.ts` | zero imports |

New directory. `lib/pane-tree.ts` and `lib/pane-visibility.ts` are **not** moved
into it — renaming what already works is a separate vocabulary pass, and this
batch has no opinion about it.

After 08c, `lib/pane-shell/track-model.ts` imports `./chrome`, `./floating-rect`
and `@/lib/pane-tree` — all same tier. Nothing in it points up.

## 08d · The state → `store/pane-shell/`

| from | to |
| --- | --- |
| `tree/store.ts` (2029) | `store/pane-shell/tree.ts` |
| `tree/presets.ts` (111) | `store/pane-shell/presets.ts` |
| `workspace-scope.ts` (178) | `store/pane-shell/workspace-scope.ts` |
| `renderer/strip-visibility.ts` (123) | `store/pane-shell/strip-visibility.ts` |

`strip-visibility.ts` sits on this side of the line, not with the model, because
it reads `@/store/tabstrip-prefs` — state, not geometry.

After 08d, `tree/store.ts`'s imports all resolve at or below `store/`:
`nanostores`, `@/i18n`, `@/lib/contributions`, `@/lib/layout-constants`,
`@/lib/storage`, `@/store/notifications`, `@/store/panes`, `@/store/windows`,
`@/store/plugin-state` (08a), and `@/lib/pane-shell/{floating-rect,track-model}`
plus `@/store/pane-shell/strip-visibility` (08c/08d). Nothing new points up.

## The repoint surface — read this before you search

`components/pane-shell/` imports its own files **relatively**, so an alias search
sees maybe half of them. Measured: **13 production files and 17 test files inside
`pane-shell/` alone** use `./store`, `../store`, `./track-model`,
`./renderer/...` and friends.

Find importers with a resolver, not a string:

```bash
cd apps/desktop/src
rg -n "pane-shell/tree/store'|workspace-scope'|track-model'|grid-model'|zones-engine'|grid-to-tree'|tab-selection'|floating-rect'|strip-visibility'|plugins-store'"
```

…then confirm each hit resolves to the file you think it does. Three basenames in
this neighbourhood are ambiguous — `renderer/index.tsx` is a *barrel* of renderer
components and is not one of the moving files; `app/chat/sidebar/projects/model.ts`
is unrelated to `tree/model.ts`; `store/panes.ts` is not `store/pane-shell/`.

Total surface, measured: **~100 production files** plus their tests.
`tree/store.ts` alone has 29 alias importers and 30 test files.

After the move, `components/pane-shell/tree/` holds only `zone-editor.tsx` and
`renderer/`. Collapsing that last level is a **follow-up, not part of this
batch** — do not do it here.

## Verification

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # again: the ledger must not move
```

Before: ledger **58**, tests **775 files / 7466**. After: ledger **49**.

The nine lines that must be gone are all `store/` importers of
`@/components/pane-shell/tree/{store,presets}` and
`@/components/pane-shell/workspace-scope`. `lib/keybinds/composer-focus-keys.ts`
was the tenth and belongs to batch 07a; if it is still in the ledger when you
start, 07a has not run — say so rather than fixing it here.

## Stop conditions

- A file inside `pane-shell/` turns out to import app state that 08c or 08d does
  not account for — stop and report. The tiering above came from reading every
  import in the directory, so an unaccounted one means the read was wrong.
- `paneChromeRender` is needed by more than `tree-group.tsx` — stop. That would
  mean the callback half is not renderer-only, and the split boundary is wrong.
- `MenuKit` looks like it has to move — it must not. If it seems to, the field
  that needs it belongs to the render half.
