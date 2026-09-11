# Batch 07 — split by consumer, not by moving

**Edges paid off: 5** (ledger 78 → 73, assuming 06 has run; if it has not, the
counts are 85 → 80). Shared rules and the verification recipe: [README](README.md).

These are the last two `lib/` items, and neither is a relocation. Both modules
are **toolkits whose consumers span layers**, so "which layer does this file
belong to?" is the wrong question — it is not one module. The right question is
"what does each layer take from it?", and the answer is the split boundary.

This is the third and fourth time that shape has appeared here:

```
components/pane-shell/pane-visibility.ts   the DOM half sinks, the React context half stays
lib/media.ts                               13 pure functions stay, 7 that need a connection move
lib/external-link.tsx                      the primitives stay, the React half and openLink move
lib/keybinds/composer-focus-keys.ts        the layout-reading half goes to components, the rest to app
```

**The size of the mechanical change is not part of the boundary decision.** Five
hundred lines of repointing is fine; a boundary drawn to save repointing is not,
because the next module that needs the same thing pays for it again. Draw the
line where the consumers say it goes.

Run 甲 then 乙. They touch no file in common, but both regenerate the same ledger.

| | what | edges |
| --- | --- | --- |
| 甲 | `lib/keybinds/` — split two of its five files | 4 |
| 乙 | `lib/external-link.tsx` — split 7 exports out of 18 | 1 |

---

## 甲 · `lib/keybinds/` — three of its five files do not move

Start by noticing that most of this directory is already correct. Do **not**
touch these:

| file | why it stays |
| --- | --- |
| `combo.ts` (284 lines) | **Zero imports.** Pure keyboard combinators. Consumed by `app` 11, `components` 2, `extension` 1, `lib` 1, `store` 1 — the store and the components both need it, so `lib/` is the only layer that satisfies both. Moving it anywhere breaks one of them. |
| `chords.ts` (13 lines) | Pure, one dependency (`lib/platform`). No upward edge. |
| `actions.ts` (272 lines) | **Already a clean leaf.** Its one historical edge was to the contribution registry, and that was fixed when the registry moved to `lib/contributions.ts`. An earlier note in `renderer-layer-boundary.md` said the action registry should sink to `store/`; that was written before the registry move and is **wrong now** — sinking a clean leaf would make it unusable below the store for no gain. |

The two that move:

### 甲-1 · `lib/keybinds/use-keybind-hint.ts` → `components/keybinds/`

36 lines, one hook. It reads `$bindings` / `bindingsFor` from `@/store/keybinds`
— that is its one edge — plus `@/lib/contributions`, `./actions`, `./combo`.

Its four production consumers, and why the destination is `components/`:

```
app/shell/statusbar-controls.tsx                  app
components/tips/tip-bubble.tsx                    components   ← three of the four
components/ui/tooltip.tsx                         components      are components,
components/pane-shell/tree/renderer/tree-group.tsx components     so app/ is out
```

Moving it to `app/` would turn those three into `components → app` edges. In
`components/` its store read is downward, which is what removes the edge.

- Destination: **`components/keybinds/use-keybind-hint.ts`** — a new directory,
  named to mirror the half it left behind, so the split is legible from the tree.
- Repoint the four consumers, and its own `./actions` / `./combo` imports become
  `@/lib/keybinds/actions` / `@/lib/keybinds/combo`.
- `lib/keybinds/` keeps `combo.ts`, `chords.ts`, `actions.ts` and their tests.

### 甲-2 · `lib/keybinds/composer-focus-keys.ts` — split by export

193 lines. It reaches **up** for `$workspaceIsPage` (`@/app/routes`, rank 5) and
is needed **down** by a component, which is why no single destination works:

```
imports  @/app/routes                        (rank 5)  → cannot live below app
needed by components/assistant-ui/clarify-tool.tsx     → cannot live above components
```

The consumers separate cleanly, and the whole file's exports are covered:

```
components/assistant-ui/clarify-tool.tsx            visibleClarifyCard
app/chat/composer/focus-chord.ts                    composerFocusBlockedBySurface
app/chat/composer/hooks/use-composer-esc-cancel.ts  composerFocusBlockedBySurface
app/chat/composer/paste-to-focus.ts                 composerFocusBlockedBySurface
app/hooks/use-keybinds.ts                           composerFocusKeysAllowed, isComposerFocusSoftCombo, typeToFocusChar
app/settings/index.tsx                              typeToFocusChar
```

`clarifyCardOwnsKey` has **no consumer outside the file** (the two mentions in
`clarify-tool.tsx` are comments), so it travels with the app half.

| export | goes to | why |
| --- | --- | --- |
| `visibleClarifyCard` | `components/` | Its only consumer is a component, and it reads `$hoveredTreeGroup` / `$activeTreeGroup` from `@/components/pane-shell/tree/store` — so it cannot sink to `lib/`. |
| `isComposerFocusSoftCombo` | `app/` | Consumed by `app/hooks/use-keybinds.ts` only. |
| `isActivateOnEnterTarget` | `app/` | Internal to the app half. |
| `clarifyCardOwnsKey` | `app/` | Internal; calls `visibleClarifyCard`, so app → components (downward). |
| `composerFocusBlockedBySurface` | `app/` | Reads `$workspaceIsPage`. |
| `typeToFocusChar` | `app/` | Consumed by app only. |
| `composerFocusKeysAllowed` | `app/` | Consumed by app only. |

Private constants follow their only user: `BLOCKING_IN_SURFACE` and `TREE_GROUP`
go with `visibleClarifyCard`; `ENTER_ACTIVATES` with `isActivateOnEnterTarget`;
`BLOCKING_OVERLAY` with `composerFocusBlockedBySurface`.

- Destination for the resolver: **`components/assistant-ui/clarify-card.ts`**,
  beside its only consumer. Move its doc comment verbatim — it explains the
  hovered → focused zone ladder, which is the whole reason the function is not a
  one-liner, and a reader in the new location has less context, not more.
- Destination for the rest: **`app/chat/composer/focus-keys.ts`**, next to
  `focus.ts` and `focus-chord.ts`, which are two of its consumers.
- Repoint 5 app files to the new app module and 1 component to the new component
  module. `app/chat/composer/focus-chord.ts` and
  `app/chat/composer/paste-to-focus.ts` are in the destination directory already,
  so their specifier becomes `./focus-keys`.
- `lib/keybinds/composer-focus-keys.ts` is deleted.

---

## 乙 · `lib/external-link.tsx` — 18 exports, two audiences

449 lines, 24 production importers (`app` 12, `components` 11, `store` 1). It is
URL normalisation, host labelling, title fetching **and six React components** in
one file.

The constraint that decides everything is the store consumer:

```
store/billing-block.ts  →  openExternalLink
```

`openExternalLink` must stay reachable from rank 1, so it stays in `lib/`. That
rules out moving the file whole — `arch:tree --move lib/external-link.tsx --to
components/` reports exactly this:

```
✗ store/billing-block.ts (rank 1 < 4)
```

And extracting only `openLink` does not work either: `ExternalLink` — the
component in this same file — calls it, so `lib/` would have to import back from
`components/`, which is a new edge in the other direction.

The split follows the exports:

| stays in `lib/external-link.ts` (11) | moves to `components/external-link.tsx` (7) |
| --- | --- |
| `normalizeExternalUrl` | `openLink` |
| `shortHostLabel` | `ExternalLinkIcon` |
| `hostPathLabel` | `LinkBrandIcon` |
| `urlSlugTitleLabel` | `ExternalLink` |
| `isTitleFetchable` | `PrettyLink` |
| `fetchLinkTitle` | `LinkifiedText` |
| `useLinkTitle` | `MarkdownLinkText` |
| `openExternalLink` | |
| `wantsNativeBrowser` | |
| `hudForcesNativeLinks` | |
| `__resetLinkTitleCache` | |

- **Rename `lib/external-link.tsx` → `lib/external-link.ts`**: no JSX is left in
  it, and the extension is the cheapest possible signal of which half you are
  looking at.
- The moving half needs `normalizeExternalUrl`, `hudForcesNativeLinks`,
  `hostPathLabel` and `openExternalLink` from the staying half — `components →
  lib`, downward. Nothing in the staying half needs the moving half.
- **Keep the lazy import in `openLink` exactly as it is.** It is not a workaround
  for the layering; it is a deliberate bundle decision, and its comment says why:
  *"this module is a leaf every surface imports, and the preview store pulls the
  layout/session graph behind it. A static edge would make one link helper drag
  that whole tree into anything that renders a link."* After the split the
  statement is `components → store`, which is legal on its own — so it is now
  belt-and-braces rather than load-bearing, and it still earns its keep. Update
  the comment's first sentence (the module is no longer a leaf) but not the
  behaviour.
- Repoint by symbol: a file that imports **only** staying exports keeps
  `@/lib/external-link`; a file that imports any moving export switches that name
  to `@/components/external-link`, splitting its import if it takes from both.
  Files taking both: `components/assistant-ui/*` and
  `components/artifacts/*` do; check each of the 24 rather than assuming.

---

## Verification

Per item, then once at the end:

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # again: the ledger must not move
```

Expected ledger after both items: **73**. `lib/` should then hold only the 9
edges already assigned to batches 01–03 (`oneshot`, `yolo-session`,
`guarded-model-switch`, `session-export`, `tour/`, `session-project-label`) —
**`lib/keybinds/` and `lib/external-link` must be gone from the ledger entirely**.
If they are not, the split boundary was drawn wrong; stop rather than widening it.

`lib/keybinds/actions.ts` must still have **zero** ledger entries afterwards. If
it gains one, something started importing it from below `lib/`.

## Stop conditions

- An export turns out to have a consumer in a layer the table above does not
  account for — report it before splitting. The boundary is derived from
  consumers, so an unknown consumer changes the boundary.
- `visibleClarifyCard` cannot move without `composerFocusKeysAllowed` — that
  would mean a component needs something that reads `$workspaceIsPage`, and the
  answer is not to move it back. Report it.
- The split needs renaming a function, changing a signature, or merging two
  exports. This is a relocation of symbols between two files; nothing about any
  symbol changes.
