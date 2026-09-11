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
| target when the run completes | **0** |
| tests | **775 files / 7466 tests** |
| reviewed | nothing yet |
| in scope | **every work order in `renderer-layer-batches/`** — Phase 1 and Phase 2 both; no phase is a permission gate |

---

## Phase 1 — the layer work orders

85 edges across fourteen work orders. Batches 06-15 are written as
independently executable items, so the table is finer than the work orders. Wave
numbers come from the collision check
(`renderer-layer-master-plan.md` §4) — items in the same wave share no file.

| item | scope | edges | wave | status | commit | reviewer |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | four stateful `lib/` services → `store/` | 6 | 6 | not started | — | — |
| 02 | `lib/tour/` → `app/tour/` | 2 | 1 | not started | — | — |
| 03 | a misplaced shape and a sidebar label | 3 | 4 | not started | — | — |
| 04 | split `workspace-groups.ts`, membership core → `store/` | 4 | 2 | not started | — | — |
| 06a1 | `lib/statusbar.tsx` — the React half leaves | 1 | 2 | not started | — | — |
| 06a2 | `lib/session-link-title.ts` → its only consumer | 1 | 3 | not started | — | — |
| 06b1 | `lib/haptics.ts` — inject the mute preference | 1 | 2 | not started | — | — |
| 06c1 | `lib/sound/completion-sound.ts` → `store/sound/player.ts` | 3 | 1 | not started | — | — |
| 06c2 | `lib/hooks/use-image-download.ts` → `components/hooks/` | 1 | 1 | not started | — | — |
| 07a | `lib/keybinds/` — split two of its five files | 4 | 6 | not started | — | — |
| 07b | `lib/external-link.tsx` — split 7 exports out of 18 | 1 | 5 | not started | — | — |
| 08 | the pane/layout domain sinks to `lib/` + `store/` | 9 | 4 | not started | — | — |
| 09 | the plugin ABI stops reaching into the app | 14 | 1 | not started | — | — |
| 10 | the composer engine leaves `app/` for `lib/` + `components/` | 22 | 5 | not started | — | — |
| 11 | the route vocabulary sinks to `lib/` | 3 | 3 | not started | — | — |
| 12 | the host views ride the plugin context (ABI change) | 3 | 7 | not started | — | — |
| 13 | the last composer edge: the attachment upload moves out | 1 | 7 | not started | — | — |
| 14 | three hooks sink, and the pet stops reaching up | 3 | 6 | not started | — | — |
| 15 | the last three singletons | 3 | 7 | not started | — | — |

Work orders: [01](renderer-layer-batches/01-lib-services-to-store.md) ·
[02](renderer-layer-batches/02-tour-to-app.md) ·
[03](renderer-layer-batches/03-project-session-moves.md) ·
[04](renderer-layer-batches/04-workspace-groups-split.md) ·
[06](renderer-layer-batches/06-lib-sink-and-move.md) ·
[07](renderer-layer-batches/07-split-by-consumer.md) ·
[08](renderer-layer-batches/08-pane-shell-sink.md) ·
[09](renderer-layer-batches/09-plugin-abi.md) ·
[10](renderer-layer-batches/10-composer-engine.md) ·
[11](renderer-layer-batches/11-route-vocabulary.md) ·
[12](renderer-layer-batches/12-host-views-through-context.md) ·
[13](renderer-layer-batches/13-composer-last-edge.md) ·
[14](renderer-layer-batches/14-hooks-sink.md) ·
[15](renderer-layer-batches/15-singletons.md)

Expected on completion: **the ledger is 0.** Every one of `lib/`'s 21 lines is paid
by 01–03 and 06–07; 09 pays 14 of `extension/`'s 16 plus one of `components/`'s (the
same seam, used by a component) and 12 pays the last three `extension/` lines; 10 and
11 pay the composer and the route vocabulary; 13–15 pay what those left. When the
last work order merges, `renderer-layers.debt.ts` should be an empty list and the
guard's "records no debt that has already been paid" test is what will tell you it is
over. `lib/keybinds/` and
`lib/external-link` must be gone from the ledger entirely; if a `lib/` line
survives, a split boundary was drawn wrong.

## Phase 2 — the barrel

Runs in its own phase, **never interleaved with Phase 1**. It pays no layer debt,
so it can never be how the migration is progressing.

| item | scope | files | status | commit | reviewer |
| --- | --- | --- | --- | --- | --- |
| 05 | remove the `@/hermes` compatibility barrel | ~240 | not started | — | — |

Work order: [05](renderer-layer-batches/05-hermes-barrel-removal.md). Ledger
impact: **none** — `@/hermes` and `@/api/*` are both rank 0.

## Nothing is left unassigned

Every line in the ledger is a work order now, and the target is **0**. The list below
is kept only so a reader can see what the last three batches were, and why each of
them was mechanical rather than a decision.

| the last edges | edges | how it is paid |
| --- | --- | --- |
| the composer's last edge (`user-edit-composer -> use-prompt-actions`) | 1 | [13](renderer-layer-batches/13-composer-last-edge.md): what the edit composer wants is one *function* (`uploadComposerAttachment`), not the hook — so the use-case sinks to `application/session/`, and the 4,000-line hook cluster stays put |
| `components/pet/floating-pet.tsx` → three `app/hooks` | 3 | [14](renderer-layer-batches/14-hooks-sink.md): none of the three hooks reads anything above `store/`, so all three sink to `components/hooks/` |
| three singletons (`boot-failure-overlay`, `store/gateway-switch`, `store/pane-focus`) | 3 | [15](renderer-layer-batches/15-singletons.md): inject the settings view the overlay embeds; move the live-runtime bookkeeping into `store/`; move a 30-line terminal store out of `app/right-sidebar/` |

The host-view row that used to head this table was decided on 2026-09-12: the three
capabilities move onto the plugin context,
[batch 12](renderer-layer-batches/12-host-views-through-context.md). The decision page
records why — including that 09's original obstacle (a module-scope read of the SDK)
disappears entirely once the value arrives as context data instead of a module export.

The composer row is what 10 left behind, and it is a chain rather than a wall:
`use-prompt-actions/index.ts` reaches `app/session/hooks/session-context-drift.ts`,
which imports `isNewChatRoute` and `routeSessionId` from `@/app/routes`. Work order
[11](renderer-layer-batches/11-route-vocabulary.md) sinks that vocabulary, which
shortens the chain by one link — the next link is the
`use-session-actions/utils.ts` barrel, whose four re-exported helpers are app-free.

## Open items

- Nothing is blocked. Every work order has a verified destination, a self-contained
  brief and a place in Phase 1 or 2. Nothing is undecided and nothing is unassigned:
  the run's stopping point is the ledger reaching **0**, which is the first time in
  this migration that "done" and "zero" are the same number.

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
