# Renderer layer boundary — the rule, the debt, the migration order

`apps/desktop/src/dev/contracts/renderer-layers.test.ts` enforces the renderer's
layer order. This document is the **work order** around it: what is still wrong,
which parts are a design decision and which are a chore, and what is safe to
execute mechanically today.

The ladder itself is not duplicated here — it is data in
`apps/desktop/src/dev/contracts/renderer-layers.ts`, and the guard reads it. If
this document and that file disagree, the file is right.

## 1. Where the tree stands

`api/`, `i18n/` and `themes/` are clean, each guarded by its own
`import-boundary.test.ts`. The rest of the ladder is not:

| importer → target | edges |
| --- | --- |
| `components` → `app` | 28 |
| `extension` → `app` | 16 |
| `lib` → `store` | 16 |
| `store` → `app` | 11 |
| `store` → `components` | 9 |
| `lib` → `app` | 3 |
| `lib` → `components` | 2 |
| **total** | **85** |

That table and the two below are a **snapshot of the day this analysis was
written**. The ledger is the source: `npm run ledger:layers` regenerates it, the
guard fails on a stale line, and the master plan §1 derives its target from the
batch manifest. An earlier version of this table said 97 with a different split —
it had drifted, which is exactly why nothing here is allowed to be the authority.

The 16 `store → application` imports are **not** in that list: `src/AGENTS.md`
sanctions them ("`application/` … is imported by `app/`/`store/` call sites"), so
they live in `SANCTIONED`, not in the debt ledger. Sanctioned and unfixed must
never look alike.

The debt is far more concentrated than the count suggests. Two files own 31 edges
and eight files own 48:

```
17  components/assistant-ui/thread/user-edit-composer.tsx
14  extension/sdk/index.ts
 4  store/pane-focus.ts
 3  store/session-states/tile-operations.ts
 3  store/session-focus.ts
 3  lib/sound/completion-sound.ts
 3  lib/keybinds/composer-focus-keys.ts
 3  components/pet/floating-pet.tsx
```

So this is not eighty-five chores. It is a handful of knots plus a long tail that
hangs off them.

## 2. The knots — these need a decision, not a move

### K1 · Where does the pane/layout domain live? (17 edges)

`components/pane-shell/` is 28 files and 9,116 lines. `tree/store.ts` alone is
2,029 lines of nanostores, and **13 files under `store/` import it**. That is
state living in the component layer, and `store` reaching up for it.

The split, by responsibility, is legible: `tree/model.ts` (650 lines, **zero
imports**) is a pure model; `tree/store.ts` is state; `tree/renderer/*` is
components.

This used to be knotted to K2: `tree/store.ts` imported
`extension/contrib/{registry,plugins-store}`, so moving it down would have
traded a `store → components` edge for a `store → extension` one. With the
registry now at `@/lib/contributions` (rank 0, see K2) that is no longer true,
and the pane domain can move on its own. The remaining question is only how far
the split goes.

### K2 · The contribution registry — DECIDED, done

It was `extension/contrib/registry.ts` (162 lines) plus its type module, living
in the top layer while `lib` (2), `store` (3) and `application` (2) imported it.
Its dependencies — `nanostores` and a 51-line type file — said it was a leaf; its
directory said it belonged to the plugin feature. It is a generic keyed-slot
primitive that the app's own core UI writes to as much as plugins do, so the
directory was a grouping accident rather than a design intent.

Moved to **`lib/contributions.ts`** with the shapes at
**`types/contributions.ts`**. All 7 edges paid, and K1 unblocked with them.
`extension/contrib/{plugin,plugins,plugins-store,runtime-loader,events,react/*}`
stayed where they are — those are the parts that genuinely know about plugins.

### K3 · The plugin ABI points the wrong way (16 edges) — decided, 14 paid by batch 09

`extension/sdk/index.ts` is one 418-line module re-exporting **216 names from 90
modules**, and 14 of its statements pull from `@/app/…` —
`@/app/shell/statusbar-controls`, `@/app/chat/composer/contrib`, `@/app/routes`,
`@/app/skills`, and so on. The host exposes its own internal module layout as the
plugin ABI. `plugins/` never names `src/` by alias (that is guarded, and true
today), so the ABI works — but every app refactor is now an ABI change.

Reading the list import by import split it into three kinds, which is why this
knot did not need one big design:

- **dead surface** — 25 of the names taken from `app/` are referenced by no
  plugin and no test. Three of them are a module's whole ABI, so deleting them
  deletes the import line;
- **data** — the area ids and payload types (`ROUTES_AREA`, `PALETTE_AREA`,
  `COMPOSER_AREAS`, …). Pure data filed by feature; they belong in `lib/` beside
  `KEYBINDS_AREA` / `CHAT_EMPTY_AREA`, and the components they describe belong in
  `components/`;
- **the one verb** — `host.openSession`, which is app behaviour and becomes a
  host-supplied seam (`lib/plugin-open-session.ts`), the same shape as
  `setDesktopFsConnectionSource`.

Those fourteen (thirteen from the ABI list, plus `directive-text`'s dynamic
`import('@/app/open-session')`, which uses the same seam) are
[batch 09](renderer-layer-batches/09-plugin-abi.md). **The remaining three — `SkillsView`, `McpTab`, `ToolsetConfigPanel` — are not
relocatable and not yet invertible**, and the reason is worth keeping: Bot Mode
reads `sdk.SkillsView` at module scope (`plugins/hermes-bots/profile-config.tsx:37`),
and the eager bundled-plugin glob means that runs before any `app/` module body,
so an app-side registration seam is always too late — silently, as a lost
connection route rather than a crash. Batch 09's last section has the chain; the
open knot is the master plan's §7.

### K4 · The composer engine is filed under `app/` (23 edges) — decided, 22 paid by batch 10

The first reading of this knot was wrong, and the correction is the useful part.
It said *"there is a second composer — either it collapses into the app's composer,
or the shared part is extracted"*. There is no second composer.
`components/assistant-ui/thread/user-edit-composer.tsx` (929 lines) has exactly one
consumer, its own sibling `thread/index.tsx`; it is the transcript's edit-in-place
box and it is fine where it is.

What it cannot do is reach the engine. It imports **15 modules from
`app/chat/composer/`** — focus, rich-editor, the completion hooks, the ref
resolvers, undo — and two app actions on top. `app/chat/composer/` is 62 files and
12,446 lines, and it is not one thing: a pure tier, a React/state tier, and the
app's own composer chrome.

So the fix is a **sink, not a merge**: the engine has a consumer below `app/`, so
the engine moves. Batch 10 traces the transitive closure (nine files to `lib/`,
fourteen to `components/`, plus the five suggestion providers moving up out of
`store/`) and pays 22 of the 23 edges; nobody unifies two implementations and
`user-edit-composer.tsx` does not change a line.

The 23rd is `user-edit-composer -> @/app/session/hooks/use-prompt-actions`, and it
is blocked by a chain rather than by a design: that hook cluster reaches
`app/session/hooks/session-context-drift.ts`, which imports `isNewChatRoute` and
`routeSessionId` from `@/app/routes`. Batch
[11](renderer-layer-batches/11-route-vocabulary.md) sinks that vocabulary, which
shortens the chain by one link; the next link is the `use-session-actions/utils.ts`
barrel, whose helpers import nothing above rank 1.

### K5 · What is left after 09, 10 and 11 (6 edges)

Everything still pointing up out of `components/` and `store/` once the four big
items are paid off. Six lines, and none of them is a design decision:

- **pet** — `components/pet/floating-pet.tsx` imports three `app/hooks`
  (`use-gateway-request`, `use-on-profile-switch`, `use-overlay-route-active`);
- **three singletons** — `components/boot-failure-overlay.tsx -> app/settings/gateway-settings`,
  `store/gateway-switch.ts -> app/contrib/hooks/use-background-sync`, and
  `store/pane-focus.ts -> app/right-sidebar/store`.

The route classifiers that used to head this list are
[batch 11](renderer-layer-batches/11-route-vocabulary.md).

## 3. The mechanical batches

The verified-safe mechanical work is written up as **one implementation document
per batch** in [`renderer-layer-batches/`](renderer-layer-batches/README.md), each
independently executable, each ending with a green suite and a regenerated ledger.

The inventory, the per-batch edge counts, the order and the parallel groups are
**not restated here**. They are derived from
[`renderer-layer-batches/batch-manifest.json`](renderer-layer-batches/batch-manifest.json)
by the collision check, and printed in the master plan §1/§3/§4 and the batches
[README](renderer-layer-batches/README.md). A copy in this document would drift the
moment a knot was decided — which is what happened to the four-batch table that used
to sit here.

They must run **in order, one at a time**. `01` and `03` both repoint
`app/session/hooks/use-session-actions/session-create.ts`, `03` and `04` both edit
`store/projects/crud.ts`, and every batch regenerates the same ledger file.
Sequential execution is what makes them independent; two at once produce
conflicts that read like bugs.

Every item was checked for the trap that kills a naive "move it up": **does
anything in a lower layer import it?** If yes, moving it turns one direction of
violation into the other. Three candidates failed that check and are in §4
instead — `lib/keybinds/` failed it badly.

`04` is the exception in kind: it is a split with a traced boundary, not a
relocation. Its own document says so, and its stop conditions are the ones worth
respecting.

A fifth document in that directory,
[`05-hermes-barrel-removal.md`](renderer-layer-batches/05-hermes-barrel-removal.md),
removes the `@/hermes` compatibility barrel. It is **not** layer debt and pays off
none of the ledger's edges — `@/hermes` is a rank-0 root module, so every import of it is
already downward. It is recorded alongside these because it is mechanical work of
the same character, and because it touches 240 files and therefore has to be
sequenced against these four rather than interleaved.

Do not widen the ledger to make an item land. If a move needs an unlisted edge,
stop and report: the batch is wrong, not the guard.

## 4. Mechanical-looking, but not safe yet

*Historical: every item below has since been decided and written up — the
"needs a merge" group became batch 06, `lib/keybinds/` and `lib/external-link.tsx`
became batch 07, and the pane model became batch 08. The counts in this section
were written mid-migration and are kept only because the reasoning (especially the
keybinds lesson about counting importers by resolution) still applies to the
remainder in §7 of the master plan.*

**Blocked by a lower-layer importer** (moving it would create a *new* violation
in the opposite direction):

- `lib/desktop-fs.ts` — imported by `lib/media.ts` and `lib/local-preview.ts`, so
  it can only move once those two do.
- `lib/slash-completion-cache.ts` — imported by `lib/desktop-slash-commands.ts`
  (a clean leaf). Either that moves too, or the cache reads are parameterized.
- `lib/keybinds/` (9 files, 1,386 lines, 27 production importers) — **the trap in
  full**, and the case that shows why "move it up" is not a decision you can make
  from the offending file alone. Moving the directory to `app/keybinds/` would
  turn **9** of its importers into upward edges — `components` 6,
  `extension` 1, `lib` 1, `store` 1 — while clearing only the 4 edges it owns
  today. (An earlier note here said 3; it had counted only the `lib/` and `store/`
  importers and missed the components ones.)
  Check any candidate with `npm run arch:tree -- --move lib/keybinds --to app/`.
  Two notes here were written before later rounds and are now **wrong**:
  `actions.ts` was said to belong in `store/`, but it is a clean leaf whose one
  edge was fixed when the contribution registry moved to `lib/contributions.ts`;
  and `composer-focus-keys.ts`'s dependency on `app/routes` was said to have to be
  broken, but the file simply splits — the resolver goes to `components/` and the
  rest to `app/`, where that import becomes same-layer.
  The real shape is **written up as batch [07](renderer-layer-batches/07-split-by-consumer.md)**:
  three of the five production files do not move at all.

**Blocked by a decision**:

- `store/command-palette.ts` → `components/ui/keyboard-first` (`releaseTypingFocus`
  is a pure DOM helper inside a 75-line hook file) — needs an extraction, so it
  follows K5.
- `components/pane-shell/tree/model.ts` and the rest of the pane model — follows
  K1. Sinking the 650-line zero-import model would buy 5–6 edges today, but it is
  the same domain, so it moves once, with K1.

**Needs a merge, not a move** (destination module already exists):

- `lib/haptics.ts` → `store/haptics.ts` already owns `$hapticsMuted`.
- `lib/sound/completion-sound.ts` (500 lines) → `store/sound/completion-sound.ts`
  already exists.
- `lib/hooks/use-image-download.ts` → `app/hooks/` already exists.
- `lib/statusbar.tsx` → two destinations: the seven pure formatters stay in `lib/`
  (and the file becomes `.ts`), the one React component (`LiveDuration`) moves to
  `app/shell/`.

**Needs a destination decision**: `lib/external-link.tsx` (449 lines, JSX, reads
`$previewTabs`) and `lib/media.ts` (pure helpers tangled with a `$connection`
read — parameterize the read and leave the helpers, or move the file).

## 5. Checking a round

```bash
cd apps/desktop
npm run typecheck                          # 3 tsc projects
npm run test:ui                            # renderer project — the baseline that matters
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
```

`test:ui` is the renderer project (772 files / 7,462 tests). Plain `npm test` runs
**both** vitest projects (933 files) and will never match a renderer-only number;
two electron loopback tests fail environmentally there and are unrelated.

Every line a round pays off must be deleted from
`renderer-layers.debt.ts`. The guard fails both ways: on an unlisted edge and on
a stale line.
