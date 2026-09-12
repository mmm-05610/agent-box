# Renderer layer — construction status

The live state of the migration. **A row may only say `merged` when it names a
commit and a reviewer's numbers** — there is no "mostly done", and no row moves
before a reviewer has passed it. A status file that lags is worse than none,
because it is trusted; see `renderer-layer-master-plan.md` §8.

| | |
| --- | --- |
| last updated | 2026-09-12 |
| last commit to change renderer source | `d5964ed` |
| ledger | **0** |
| target when the run completes | **0 — met** (Phase 3 must leave it at 0) |
| tests | **776 files / 7466 tests** |
| reviewed, per-batch numbers | 01 · 02 · 03 · 04 · 05 · 06a1 · 06b1 · 06c2 · 06c1 · 06a2 · 07a · 07b · 08 · 09 · 10 · 11 · 12 · 13 · 14 · 15 · 16 — every merged row names its reviewer's measured numbers |
| phase 3 | six sink work orders **dispatched, none merged** — 44 files / 4,892 lines, all `edges: 0`; see the Phase 3 table |
| in scope | **every work order in `renderer-layer-batches/`** — Phase 1, Phase 2 and Phase 3; no phase is a permission gate |

---

## Phase 1 — the layer work orders

85 edges across fourteen work orders. Batches 06-15 are written as
independently executable items, so the table is finer than the work orders. Wave
numbers come from the collision check
(`renderer-layer-master-plan.md` §4) — items in the same wave share no file.

| item | scope | edges | wave | status | commit | reviewer | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | four stateful `lib/` services → `store/` | 6 | 6 | merged | `0d3f10c` + regen `ccb7ccf` | group reviewer ({01,07a,14,12,15}): 4 renames md5-identical, 10 files import/mock-line-only, `sdk/index.ts` block move = specifier + eslint-sorted position only, 23→10 across the round, 776/7466, guard 16/16 | commit subject records ledger 23→17 — this batch's 6 plus 07a's 4 and 14's 3, regenerated together |
| 02 | `lib/tour/` → `app/tour/` | 2 | 1 | merged | `ca2b693` | wave-1 reviewer: ledger 85→76 exact, regen idempotent · 776 files/7466 tests · guard 16/16 · eslint 0 err | only 2 of the 5 named files had real imports; the other 3 held prose comments only. Stale prose left at `vite.config.ts:181` and `app/tour/index.ts:10` (cosmetic) |
| 03 | a misplaced shape and a sidebar label | 3 | 4 | merged | `9bcb15c` (A.0) `f136e79` (A+B) + regen `9df3d0c` (4→1) | group reviewer: A.0 byte-identical type sink with the re-export in the required form, session-placement.ts = the interface + doc comment verbatim after the authorised `SessionOwnerRoute` re-spelling, no re-export left behind, all importer diffs import-lines-only, 12 files every hunk read, 4→1 exact, 776/7466, guard 16/16 | executed under the amendment: A.0 sinks `SplitDir`/`TileDock` to `types/pane-dock.ts` (registry re-exports, nine readers unmoved) and the interface names `SessionOwnerRoute` directly; batch 04's `liveSessionProjectId` re-export is now load-bearing for the moved label (its `:26` comment's path mention is stale — cosmetic) |
| 04 | split `workspace-groups.ts`, membership core → `store/` | 4 | 2 | merged | `7037d03` | wave-1 reviewer: 4 lines verified gone, no duplication, test split byte-identical | closure pulled `isWindowsPath`/`comparisonSegments` down with `isPathUnder` (app half imports them back); temporary re-export of `liveSessionProjectId` left in the app module — batch 03 consumes it |
| 06a1 | `lib/statusbar.tsx` — the React half leaves | 1 | 2 | merged | `e6f67b0` | wave-1 reviewer: edge gone, moves verbatim | `formatDuration` turned out to be exported already; it traveled with `LiveDuration` |
| 06a2 | `lib/session-link-title.ts` → its only consumer | 1 | 3 | merged | `eb0b0c6` | group reviewer: byte-identical move (hash-compared), 4 specifier-only repoints, ledger 59→55 exact, 776/7466, guard 16/16 | |
| 06b1 | `lib/haptics.ts` — inject the mute preference | 1 | 2 | merged | `cd9746a` | wave-1 reviewer: injection matches the desktop-fs pattern exactly, no teardown, mute check live in the dispatch path | |
| 06c1 | `lib/sound/completion-sound.ts` → `store/sound/player.ts` | 3 | 1 | merged | `164205a` | group reviewer ({09,06c1}): 3 lines verified gone, R100 rename, arch:tree importer list matches, ledger 76→59 exact, 776/7466, guard 16/16 | `store/sound/completion-sound.ts` (the variant preference) untouched, not merged; its `:12` stale comment is pre-existing |
| 06c2 | `lib/hooks/use-image-download.ts` → `components/hooks/` | 1 | 1 | merged | `55d40e9` | wave-1 reviewer: edge gone, 5 importers repointed, pure renames | |
| 07a | `lib/keybinds/` — split two of its five files | 4 | 6 | merged | `fd1fcb2` + regen `ccb7ccf` | group reviewer: test moved whole with zero expect/it changes, clarify-card extraction byte-identical, `lib/keybinds/` has zero ledger lines, `actions.ts` md5 unchanged, 776/7466, guard 16/16 | commit subject records ledger 23→19 (this batch's 4); the same regen covers 01 and 14 |
| 07b | `lib/external-link.tsx` — split 7 exports out of 18 | 1 | 5 | merged | `121a219` | group reviewer: 46→45 exact, concatenated halves byte-identical to the pre-move file, only deltas are parseUrl's export keyword + openLink's comment sentence, 776/7466, guard 16/16 | work order's four-name list missed `parseUrl` (openLink calls it) — exported, body unchanged; reviewer census: 10 lib-only keepers + 10 whole switches + 4 splits |
| 08 | the pane/layout domain sinks to `lib/` + `store/` | 9 | 4 | merged | `9de6614…9dbac86` (08a–08d) | group reviewer: 55→46 exact + idempotent regen, 14 R100 renames byte-identical by blob hash, every non-import hunk accounted (3 sanctioned comment updates), 776/7466, guard 16/16 | `components/pane-shell/tree/` production files hold only `zone-editor.tsx` + `renderer/`; ~15 cross-module integration test files remain there (scanner skips tests) |
| 09 | the plugin ABI stops reaching into the app | 14 | 1 | merged | `ae1551f…463f05b` (09a–09d) | group reviewer ({09,06c1}): 14 lines verified gone, 3 host-page lines survive (batch 12's), ABI delta exactly 25 names (212→187), 9 renames byte-identical, only behaviour change is the specified openSession seam, 776/7466, guard 16/16 | dead-name scan: 81 dead names total, only the 25 `@/app` ones pruned per the work order |
| 10 | the composer engine leaves `app/` for `lib/` + `components/` | 22 | 5 | merged | `01f4c93` (10a) `e5256a5` (10b) `5ccfeba` (10c) `da99f9d` (10d) `766e407` (lint sweep) + merge `833ec98` + regen `8546364` (45→23) | group reviewer: 45→23 exact + idempotent regen, 52 renames all import-only (blob-diffed), zero stale importers of any old path, survivor line present, 776/7466, guard 16/16 | **the work-order defect the executor found and worked around:** four of 10a's nine files (`path-refs`, `url-refs`, `inline-refs`, `use-composer-undo`) import `rich-editor`/`text-utils`, so the work order's `lib/` tier would have *added* six upward edges; the amended placement puts those four in `components/composer/` and the other five rank-0-clean files in `lib/composer/`, which lands the full −22. The reviewer independently proved the amendment is the only closure that does not widen the ledger. The amendment is authorised in the commit body rather than improvised. |
| 11 | the route vocabulary sinks to `lib/` | 3 | 3 | merged | `be459aa` | group reviewer: verbatim sink with a single declared export-keyword delta, 27/27 routes tests untouched, ledger 59→55 exact, 776/7466, guard 16/16 | work order's import sketch contradicted its own `$workspaceIsPage` prohibition — worker kept the atom local, reviewer confirmed correct |
| 12 | the host views ride the plugin context (ABI change) | 3 | 7 | merged | `15be23b` + regen `9061cdf` | group reviewer: assertions byte-identical in two test files, `legacy-sdk-compat`'s two changed expects are the mandated plumbing with identical outcomes, 22/22 behavioural tests, both type deviations ruled sound and rank-0, 10→4 across the round, 776/7466, guard 16/16 | landed as written: the three names leave the SDK, `ctx.hostViews` carries them, and the plugin tests moved their older-build simulation from a stripped SDK namespace to a context without `hostViews` |
| 16 | the session-recovery core sinks (enabler for 13, pays 0) | 0 | 1 | merged | `5028abd` (16a) `02f18ce` (16b.0) `0ddc516` (16b) `b92dc1e` (16c) + merge into main | group reviewer: three moved files byte-verified (single-flight-resume zero-import; session-registry-lookup 100% rename, import list exactly the eight rank-≤2 specifiers; recovery.ts = the seven declarations + doc comments verbatim with the single sanctioned `GatewayRequest`→`GatewayRequester` re-spell); utils.ts after-state = re-export block + `GatewayRequest` alias + stay-behind set, nothing else; ledger constant at 1 through the batch with thrice-idempotent regen; 776/7466, guard 16/16, eslint 0 | executed under the 16b.0 ruling (see the work order for the rejected alternatives). 16a found a fourth export the order missed (`clearSingleFlightSessionResumeState`); 16b.0's lazy import stays dynamic and points directly at `@/application/session/session-registry-lookup`; 16b/16c are separate commits because a move-and-remove intermediate cannot typecheck (protected tests import moved names from `./utils`) |
| 13 | the last composer edge: the attachment upload moves out | 1 | 7 | merged | `03750b3` + merge `54bd7b0` | group reviewer: ledger 1→0 — `DEBT_LEDGER` is an empty list, regen byte-identical; moved bodies byte-verbatim except the sanctioned `GatewayRequest`→`GatewayRequester` re-spell; prompt-actions suite 5 files / 233 tests pass with `utils.test.ts`/`index.test.tsx` in no diff; every changed line accounted (5 files); 776/7466, guard 16/16, eslint 0 | executed in the post-16 tree: the moved upload imports `withSessionNotFoundResume` from `@/application/session/recovery` (application→application). It also travels `base64FromDataUrl`/`imageFilenameFromPath` (leaving them would create the utils↔upload cycle the work order itself names as a stop condition) and the three module-level constants `attachmentPathNeedsUpload` reads; `requestGateway` names `GatewayRequester` (`@/types/gateway`) per the batch-16 precedent. The worker committed the regenerated empty ledger in its own commit — correct for the last batch: restoring would ship the paid line back and leave main permanently red |
| 14 | three hooks sink, and the pet stops reaching up | 3 | 6 | merged | `b487aa6` + regen `ccb7ccf` | group reviewer: single content line is `@/app/routes`→`@/lib/routes`, 18 production + 7 test repoints (compiler-proven complete), `floating-pet.tsx` is 3+3 import lines only, 776/7466, guard 16/16 | commit subject records ledger 23→20 (this batch's 3) |
| 15 | the last three singletons | 3 | 7 | merged | `72a3204` + regen `9061cdf` | group reviewer: lazy import moved into `wiring.tsx` (chunk boundary preserved), accessors as prescribed with no re-export left, 15c R100 and md5-identical, 10→4 across the round, 776/7466, guard 16/16 | commit subject records ledger 10→7 (this batch's 3) |

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
| 05 | remove the `@/hermes` compatibility barrel | ~240 | merged | `e9a61ec` + `40c6d08` `736b590` `ac265d9` `98a23cd` `c20e1da` + merge `00ae1d0` | group reviewer: 469 symbol mappings derived from the barrel and script-checked, 0 wrong; 80 mocks with 0 dropped coverage and 0 fake exports; 6 guard files 46/46 with every reverse control retargeted live; all 8 barrel contract tests retargeted, 73/73; ledger constant at 4; `rg "@/hermes"` = 0; 776/7466, guard 16/16 | pays no ledger line by design (a rank-0 barrel), so its proof is the suite: imports come from the owning `api/` domains now, and the test mocks follow |

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

## Review debt

None. Every merged row names its reviewer and that reviewer's measured numbers.
(The seven rows the 09:27 reconciliation marked "review in flight" — 01, 05, 07a,
10, 12, 14, 15 — were reviewed by independent subagents whose verdicts and numbers
landed here; 10's reviewer additionally re-derived the authorised amendment and
proved it the only closure that does not widen the ledger.)

## Open items

- **The ledger work is finished.** An empty `DEBT_LEDGER`, regen idempotent on it,
  every ledger-bearing work order in this directory merged with a reviewer's
  numbers: 85 edges paid across 16 work orders plus the Phase 2 barrel removal,
  85 − 85 = 0 against the merged set.
- **Phase 3 is open: six sink work orders, 44 files, 4,892 lines, all `edges: 0`.**
  The ledger is *already* 0, so these pay nothing and must leave it at 0 — they
  move logic that is merely **living in the wrong layer** (rank 4/5 modules that
  render nothing and reach only rank ≤ 2). See the table below. Baseline for every
  one of them: 776 files / 7466 tests, guard 16/16, ledger 0 before and after.

---

## Phase 3 — the sink work orders

The layer ratchet rejected **upward edges**. It could not see the other defect: a
module that is *downward-clean* but **lives at the top of the ladder anyway**,
so the UI layer keeps custody of logic that has nothing to do with presentation.

Measured over `app/` + `components/`: **~80 production files (~6.0k lines)** qualify
today, and another **50 (~7.6k lines) look like logic but drag `components/`**, so
they need a decision rather than a move. Phase 3 dispatches the coherent clusters
among the first 80; the second group is deliberately not dispatched.

**That second group is not one group, and its 50 is not 50.** Measured file by file
it says 50 — but **nine of them are already dissolved by the group moves above**
(starmap's four, `terminals.ts`, and preview's four), because file-by-file
measurement counts a travelling sibling as a blocker. What is genuinely left is
**about 41 files in five decisions**, recorded in `renderer-layer-batches/README.md`
under "Phase 3 — not dispatched". Do not dispatch them from this table.

**Method note, learned the hard way in this phase:** measure the closure of the
**whole group moving together**, never file by file. Per-file, `app/starmap/color.ts`
reports "drags rank 5" — that rank 5 is its own sibling, which necessarily travels
with it. A sibling in the same batch is not a blocker. Every group below was
verified this way, and the group's destination rank is the *minimum* that keeps the
out-of-group closure clean.

| item | scope | files | lines | destination | wave | status |
| --- | --- | --- | --- | --- | --- | --- |
| 17 | session remainder: the event projection and the state cache | 2 | 394 | `application/session/` | 10 | open |
| 18 | starmap's pure maths (canvas render, simulation, geometry, colour, time axis, share code) | 9 | 1983 | `lib/starmap/` | 1 | open |
| 19 | terminal internals (buffer, selection, clipboard, resize, font, lifecycle table, event stream) | 8 | 1057 | `application/terminal/` | 4 | open |
| 20 | preview/browser logic (drive state machine, navigation, script runner, console state, nudge, reader) | 10 | 736 | `application/preview/` | 3 | open |
| 21 | the transcript projection (split today across `app/chat/` and `components/assistant-ui/thread/`) | 8 | 750 | `application/transcript/` | 3 | open |
| 22 | session-list derivations out of the `sessions` pane | 7 | 366 | `application/session-lists/` | 1 | open |

**Not dispatched, on purpose:** `app/chat/sidebar/projects/workspace-groups.ts` (673
lines, the heaviest single file) and the 50 files that reach `components/`. Each needs
a decision about *what the module is*, not a destination.

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
