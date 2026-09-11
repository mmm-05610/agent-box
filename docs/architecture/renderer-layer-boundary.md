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
| `lib` → `store` | 20 |
| `store` → `components` | 17 |
| `extension` → `app` | 16 |
| `store` → `app` | 11 |
| `lib` → `app` | 3 |
| `lib` → `components` | 2 |
| **total** | **97** |

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

So this is not 97 chores. It is a handful of knots plus a long tail that hangs off
them.

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

### K3 · The plugin ABI points the wrong way (16 edges)

`extension/sdk/index.ts` has **96 re-exports**, and 14 of them are
`export … from '@/app/shell/statusbar-controls'`, `@/app/chat/composer/contrib`,
`@/app/routes`, `@/app/skills`, and so on. The host exposes its own internal
module layout as the plugin ABI. `plugins/` never names `src/` by alias (that is
guarded, and true today), so the ABI works — but every app refactor is now an ABI
change.

The fix inverts it: the SDK declares the contract, and `app/` registers
implementations at boot. That is a real design task, not a relocation.

### K4 · There is a second composer (17 edges)

`components/assistant-ui/thread/user-edit-composer.tsx` is 928 lines and imports
15 modules from `app/chat/composer/*` (62 files, 12,432 lines), plus
`app/session/hooks/use-prompt-actions`. A component layer is not supposed to own
a chat composer; this one does. Either it collapses into the app's composer, or
the shared part is extracted so both sides use one implementation. All 17 of its
edges disappear with that decision.

### K5 · Components drive app behaviour by import (16 edges)

Everything left in `components → app` outside K4, plus `store → app` outside the
mechanical batch: `components/pet/floating-pet.tsx` importing three `app/hooks`,
`components/find-bar.tsx` and `components/tips/use-tip-rotation.ts` importing
`app/routes`, `components/assistant-ui/clarify-tool.tsx` importing
`app/chat/composer/focus`, and `store/suggestion-providers/*` doing the same.

One target explains five of them: `app/chat/composer/focus.ts` (420 lines, 20
importers) is a command bus (`requestComposerFocus/Insert/Submit`) that `store/`
calls to make the UI do something. It should be a downward command channel, or
the store should publish an intent the composer subscribes to.

## 3. The mechanical batches

The verified-safe mechanical work is written up as **one implementation document
per batch** in
[`renderer-layer-batches/`](renderer-layer-batches/README.md) — 15 edges across
four batches, each independently executable, each ending with a green suite and a
regenerated ledger.

They are listed here only so this document stays the whole picture:

| batch | scope | edges |
| --- | --- | --- |
| [01](renderer-layer-batches/01-lib-services-to-store.md) | four small stateful `lib/` services → `store/` | 6 |
| [02](renderer-layer-batches/02-tour-to-app.md) | `lib/tour/` → `app/tour/` | 2 |
| [03](renderer-layer-batches/03-project-session-moves.md) | a misplaced shape and a sidebar label | 3 |
| [04](renderer-layer-batches/04-workspace-groups-split.md) | split `workspace-groups.ts`, membership core → `store/` | 4 |

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

Do not widen the ledger to make an item land. If a move needs an unlisted edge,
stop and report: the batch is wrong, not the guard.

## 4. Mechanical-looking, but not safe yet

**Blocked by a lower-layer importer** (moving it would create a *new* violation
in the opposite direction):

- `lib/desktop-fs.ts` — imported by `lib/media.ts` and `lib/local-preview.ts`, so
  it can only move once those two do.
- `lib/slash-completion-cache.ts` — imported by `lib/desktop-slash-commands.ts`
  (a clean leaf). Either that moves too, or the cache reads are parameterized.
- `lib/keybinds/` (9 files, 1,386 lines, 27 production importers) — **the trap in
  full**. `store/keybinds.ts` imports its `actions` and `combo`, and
  `lib/external-link.tsx` imports `combo`; moving the directory to `app/keybinds/`
  would add two `store → app` edges and one `lib → app`. The right shape is a
  three-way split: pure combo/chord math stays in `lib/`, the action registry
  goes down to `store/`, and the composer/hint bindings go up to `app/`.

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
