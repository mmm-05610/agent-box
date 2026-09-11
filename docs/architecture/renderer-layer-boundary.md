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
| `store` → `extension` | 3 |
| `lib` → `app` | 3 |
| `lib` → `extension` | 2 |
| `lib` → `components` | 2 |
| `application` → `extension` | 2 |
| **total** | **104** |

The 16 `store → application` imports are **not** in that list: `src/AGENTS.md`
sanctions them ("`application/` … is imported by `app/`/`store/` call sites"), so
they live in `SANCTIONED`, not in the debt ledger. Sanctioned and unfixed must
never look alike.

The debt is far more concentrated than 104 suggests. Two files own 31 edges and
eight files own 51:

```
17  components/assistant-ui/thread/user-edit-composer.tsx
14  extension/sdk/index.ts
 5  store/pane-focus.ts
 3  store/session-states/tile-operations.ts
 3  store/session-focus.ts
 3  lib/sound/completion-sound.ts
 3  lib/keybinds/composer-focus-keys.ts
 3  components/pet/floating-pet.tsx
```

So this is not 104 chores. It is a handful of knots plus a long tail that hangs
off them.

## 2. The knots — these need a decision, not a move

### K1 · Where does the pane/layout domain live? (17 edges)

`components/pane-shell/` is 28 files and 9,116 lines. `tree/store.ts` alone is
2,029 lines of nanostores, and **13 files under `store/` import it**. That is
state living in the component layer, and `store` reaching up for it.

The split, by responsibility, is legible: `tree/model.ts` (650 lines, **zero
imports**) is a pure model; `tree/store.ts` is state; `tree/renderer/*` is
components. What makes it a decision rather than a move is that `tree/store.ts`
imports `extension/contrib/{registry,plugins-store}` — the layout store has to
know which pane plugins are enabled. So K1 and K2 are the same knot.

### K2 · Is the contribution registry infrastructure? (7 edges)

`extension/contrib/registry.ts` (162 lines) depends on `nanostores` and
`extension/contrib/types.ts` (51 lines, react types only). Nothing else. It is
imported by `lib` (2), `store` (3) and `application` (2).

Its dependencies say it belongs **below `store/`**; its directory says it belongs
to the extension layer. Either move `registry.ts` + `types.ts` + `plugins-store.ts`
+ `events.ts` down, or record `extension/contrib` as rank-0 infrastructure in the
ladder. Moving them is the honest option — a rank that says "this module is
infrastructure but lives in the top layer" is debt wearing a policy's clothes.
This does touch the earlier non-goal about not splitting `sdk/` + `contrib/`, so
it needs a call.

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

## 3. Batch C — mechanical, verified safe, ready to hand off

Every item below was checked for the trap that kills a naive "move it up": **does
anything in a lower layer import it?** If yes, moving it turns one direction of
violation into the other. Two candidates failed that check and are in Batch B
instead; `lib/keybinds/` failed it badly (see §4).

Each item is a pure relocation with a determinate destination and no behaviour
change. Expected total: **16 edges off the ledger.**

| # | move | importers to repoint | edges |
| --- | --- | --- | --- |
| C1 | `lib/oneshot.ts` → `store/oneshot.ts` | 1 (all `store/`) | 2 |
| C2 | `lib/yolo-session.ts` → `store/yolo-session.ts` | 3 (all `app/`) | 2 |
| C3 | `lib/guarded-model-switch.ts` → `store/guarded-model-switch.ts` | 2 (`app/`, `extension/`) | 1 |
| C4 | `lib/session-export.ts` → `store/session-export.ts` | 2 (all `app/`) | 1 |
| C5 | `lib/session-project-label.ts` → `app/chat/sidebar/projects/session-project-label.ts` | 1 (`app/`) | 1 |
| C6 | `lib/tour/` (7 files, incl. `app-tour.css`) → `app/tour/` | 7 (`app/`, `dev/`) | 2 |
| C7 | `NewSessionPlacement` (a lone interface at `app/chat/new-session-drag.ts:63`) → `types/` | 5 (`store/` ×2, `app/` ×3) | 2 |
| C8 | Split `app/chat/sidebar/projects/workspace-groups.ts` (849 lines) | 5 in `store/` | 5 |

Notes that matter for C6–C8:

- **C6**: `lib/tour/index.ts:10` matches a search for `lib/tour` but is a doc
  comment, not an import. `dev/` sits at rank 4, below `app/`, so it is fine.
- **C7**: extract the interface only; `app/chat/new-session-drag.ts` keeps its
  behaviour.
- **C8** is the one item here that is a *split*, not a move. `store/` needs
  exactly four symbols: `SidebarProjectTree` (line 48), `NO_PROJECT_ID`
  (line 122), `liveSessionProjectId` (line 386) and `sessionProjectColor`
  (line 469), together with whatever private helpers those four need. Everything
  about building and overlaying the tree (`mergeRepoWorktreeGroups`,
  `overlayRepoLanes`, `excludeProjectSessions`, `overlayLiveLanes`,
  `reconcileEnteredProjectSessions`, `overlayLivePreviews`,
  `sortWorktreeGroups`) stays in `app/`. The store-side symbols go to
  `store/projects/`, and the existing `workspace-groups.test.ts` moves with the
  symbols it covers. `tsc` plus that test file is the check.

Do not widen the ledger to make an item land. If a move in this batch turns out
to need an unlisted edge, stop and report: the batch is wrong, not the guard.

## 4. Batch B — mechanical, but not safe yet

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
  goes down (or follows K2), and the composer/hint bindings go up to `app/`.

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

`test:ui` is the renderer project (771 files / 7,446 tests as of `e583391`).
Plain `npm test` runs **both** vitest projects (933 files) and will never match a
renderer-only number; two electron loopback tests fail environmentally there and
are unrelated.

Every line a round pays off must be deleted from
`renderer-layers.debt.ts`. The guard fails both ways: on an unlisted edge and on
a stale line.
