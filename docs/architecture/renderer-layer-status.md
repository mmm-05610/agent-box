# Renderer layer — construction status

The live state of the migration. **A row may only say `merged` when it names a
commit and a reviewer's numbers** — there is no "mostly done", and no row moves
before a reviewer has passed it. A status file that lags is worse than none,
because it is trusted; see `renderer-layer-master-plan.md` §8.

| | |
| --- | --- |
| last updated | 2026-09-12 |
| last commit to change renderer source | `c6889f1` |
| ledger | **85** |
| target when the run completes | **49** |
| tests | **775 files / 7466 tests** |
| reviewed | nothing yet |
| in scope | **every work order in `renderer-layer-batches/`** — Phase 1 and Phase 2 both; no phase is a permission gate |

---

## Phase 1 — the layer work orders

36 edges across seven work orders. Batches 06-08 are written as
independently executable items, so the table is finer than the work orders. Wave
numbers come from the collision check
(`renderer-layer-master-plan.md` §4) — items in the same wave share no file.

| item | scope | edges | wave | status | commit | reviewer |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | four stateful `lib/` services → `store/` | 6 | 2 | not started | — | — |
| 02 | `lib/tour/` → `app/tour/` | 2 | 1 | not started | — | — |
| 03 | a misplaced shape and a sidebar label | 3 | 2 | not started | — | — |
| 04 | split `workspace-groups.ts`, membership core → `store/` | 4 | 1 | not started | — | — |
| 06a1 | `lib/statusbar.tsx` — the React half leaves | 1 | 1 | not started | — | — |
| 06a2 | `lib/session-link-title.ts` → its only consumer | 1 | 3 | not started | — | — |
| 06b1 | `lib/haptics.ts` — inject the mute preference | 1 | 1 | not started | — | — |
| 06c1 | `lib/sound/completion-sound.ts` → `store/sound/player.ts` | 3 | 2 | not started | — | — |
| 06c2 | `lib/hooks/use-image-download.ts` → `components/hooks/` | 1 | 1 | not started | — | — |
| 07a | `lib/keybinds/` — split two of its five files | 4 | 2 | not started | — | — |
| 07b | `lib/external-link.tsx` — split 7 exports out of 18 | 1 | 2 | not started | — | — |
| 08 | the pane/layout domain sinks to `lib/` + `store/` | 9 | 2 | not started | — | — |

Work orders: [01](renderer-layer-batches/01-lib-services-to-store.md) ·
[02](renderer-layer-batches/02-tour-to-app.md) ·
[03](renderer-layer-batches/03-project-session-moves.md) ·
[04](renderer-layer-batches/04-workspace-groups-split.md) ·
[06](renderer-layer-batches/06-lib-sink-and-move.md) ·
[07](renderer-layer-batches/07-split-by-consumer.md) ·
[08](renderer-layer-batches/08-pane-shell-sink.md)

Expected on completion: the ledger drops to 58, and **`lib/` holds only the nine
edges belonging to `01`–`03`**. `lib/keybinds/` and `lib/external-link` must be
gone from the ledger entirely. If they are not, a split boundary was drawn wrong.

## Phase 2 — the barrel

Runs in its own phase, **never interleaved with Phase 1**. It pays no layer debt,
so it can never be how the migration is progressing.

| item | scope | files | status | commit | reviewer |
| --- | --- | --- | --- | --- | --- |
| 05 | remove the `@/hermes` compatibility barrel | ~240 | not started | — | — |

Work order: [05](renderer-layer-batches/05-hermes-barrel-removal.md). Ledger
impact: **none** — `@/hermes` and `@/api/*` are both rank 0.

## Not yet work orders — need a decision

Each needs a decision before it can become a work order. An executor that
attempts one unprompted will produce a plausible wrong answer. The fourth knot —
layout state in the component layer — was decided on 2026-09-12 and became
work order 08; it is in Phase 1 above.

| knot | edges | the decision | status |
| --- | --- | --- | --- |
| the second composer (`user-edit-composer.tsx`, 928 lines) | 17 | collapse into the app's composer, or extract a shared one | awaiting decision |
| the plugin ABI (`extension/sdk/index.ts`, 96 re-exports) | 16 | invert it: SDK declares, `app/` registers | awaiting decision |
| components driving app behaviour (`app/chat/composer/focus.ts`) | 16 | a downward command channel, or an intent the composer subscribes to | awaiting decision |

## Open items

- Nothing is blocked. Every work order has a verified destination, a self-contained
  brief and a place in Phase 1 or 2. The rows under "not yet work orders" are the only
  thing that can stop the run short, and stopping there is the correct outcome.

## How to update this file

One edit per work order, in the same commit as the work or immediately after:

1. Set `status` to `merged`, and fill `commit` and `reviewer` — the reviewer's
   name **and** the numbers it measured (ledger before → after, tests, lint).
2. Add a `notes` cell only for something a reader would otherwise have to
   re-derive: a prediction that was wrong, a boundary that had to move, a
   pre-existing failure that is not yours.
3. Update the header block's ledger and test numbers, and `last updated`. The
   source-commit anchor moves only when a commit touches `apps/desktop/src`, so a
   status-only or docs-only commit never moves it.
4. If the item is the last of a wave, the next wave's items may start — but only
   those whose collision partners are all merged, not the whole wave.

A row that claims `merged` without a commit and reviewer numbers will be treated
as not merged when the plan is next reconciled.
