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
| phase 3 | work orders 17–29：UI 下沉与消息平台删除；逐项实时状态见 Phase 3 表，全部 `edges: 0` |
| phase 4 | work order 30：`app/` 收口为组合根；必须等 17–29 全部 merged + reviewed 后独占执行 |
| in scope | **every work order in `renderer-layer-batches/`** — Phase 1–4；phase 是顺序约束，不是权限门 |

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
| 17 | session remainder: the event projection and the state cache | 2 | 394 | `application/session/` | 10 | merged — `e6dd58c` · group reviewer ({17,19,21,23,26,27}): 2 moves R100 + renamed test (1 specifier), importer set re-derived and exact, ledger 0 constant, 776/7466, guard 16/16, eslint 0 |
| 18 | starmap's pure maths (canvas render, simulation, geometry, colour, time axis, share code) | 9 | 1983 | `lib/starmap/` | 1 | merged — `f27544e` · group reviewer ({18,20,22}+d5964ed): 47 moved files 47 SAME / 0 DIFF by blob hash (incl. d5964ed's nine), ledger 0 constant, 776/7466, guard 16/16, eslint 0 on batch files. The resumed worker caught an importer the work order's src-scoped sweep missed: `scripts/gen-share-codes.ts` (repo-wide sweep), repointed import-lines-only |
| 19 | terminal internals (buffer, selection, clipboard, resize, font, lifecycle table, event stream) | 8 | 1057 | `application/terminal/` | 3 | merged — `e5bf5c6` + merge `d1cce37` · group reviewer ({19,21,26}): 12 renames R100 blob-verified; the desktop-bridge.ts conflict union exact (19's terminal repoints ∪ batch 20's preview repoint); zero components/ importer of terminals.ts; 776/7466, guard 16/16. styles.css:611 comment still cites the old selection.ts path (cosmetic) |
| 20 | preview/browser logic (drive state machine, navigation, script runner, console state, nudge, reader) | 10 | 736 | `application/preview/` | 4 | merged — `42806a0` + `d80c5aa` · group reviewer (same group): 10 modules + 3 tests blob-identical, stay-behind list verified present, preview-console.tsx repointed per the work order's own named case, 776/7466, guard 16/16 |
| 21 | the transcript projection (split today across `app/chat/` and `components/assistant-ui/thread/`) | 8 | 750 | `application/transcript/` | 4 | merged — `4cd3cb4` + merge `496a4a4` · group reviewer ({21,19,26}): 14 renames R100 blob-verified; `thread/types.ts` stay correct (props-only, 2 consumers); 17 importer deltas import-line-only; 776/7466, guard 16/16. The dodged same-directory cross-layer references are now explicit `components → application` downward imports |
| 22 | session derivations out of the `sessions` pane | 7 | 366 | `application/sidebar/` | 1 | merged — `177a359` + merge `b490ce9` · group reviewer (same group): 13 renames R100 (7 modules + 6 tests), 9 import lines, 0 stale specifiers; the `application/session-lists.ts` FILE vs `/` DIRECTORY coexistence judged acceptable. **Planner flag:** the work order as amended by a82e824 renames the destination to `application/sidebar/` — shipped as `session-lists/` (worker pre-dated the amendment). Reconcile before batch 28 populates `application/sidebar/` |
| 23 | the six clean `gateway-event` handlers | 6 | 1017 | `application/session/gateway-event/` | 1 | merged (rescoped) — `96fc3fe` + merge `01f68f7` · group reviewer ({17,19,21,23,26,27}): 5 files + session-control.test.ts moved R100; router stays with a 2-hunk import/export diff, handler order provably undisturbed; zero `@/app` imports in the moved five; ledger 0 constant; 776/7466, guard 16/16, eslint 0. **The work-order defect and the authorized re-scope:** the original six-file move included the router `index.ts`, whose four siblings are deliberately kept in `app/` (message-stream/tools → 24, session-info → 25, desktop-bridge → 未派单) — a prior executor simulated the ledger going 0→4 and stopped. The re-scope moves the five clean family files; the router joins the stayers and imports the moved five downward. Batch 24 runs on this shape |
| 24 | the two handlers that reach `components/` — three calls join the deps bag, then they move | 2 | 550 | `application/session/gateway-event/` | 5 | in flight (worker resumed on the post-23 base) |
| 25 | the interrupted-turn seal is extracted, and `session-info.ts` follows it | 1 (+1 fn) | 459 | `application/session/` | 2 | in flight (worker resumed on the post-17 base); its precondition (17 landed) verified satisfied by the worker before execution |
| 26 | the tool card's view model — renamed from the misleading `fallback-model` | 4 | 1817 | `lib/tool-view/` | 1 | merged — `c5bd645` + merge `152febb` · group reviewer ({19,21,26}) — which also caught that the coordinator had claimed a batch-26 merge that never ran, and re-verified after the real merge: 4 R100, `index.ts` unsplit at 1502 lines, remap table file-for-file, travelling test 1 specifier + 1 blank line, `app/settings/fallback-models-field*` untouched, 776/7466, guard 16/16 |
| 27 | three zero-hermes form widgets out of the settings page | 3 | 495 | `components/settings/` | 4 | merged — `d29be00` · group reviewer: 3 R100 + 36 importer files import-lines-only (the worker's exhaustive sweep found 6 subdirectory `'../primitives'` importers the work order's rg pattern cannot match); `searchable-select.test.tsx` stayed in `app/settings/` (co-tests the staying config-field; moving it would force an upward `@/app/` import) ruled correct; 776/7466, guard 16/16 |
| 28 | the `sessions` pane's derivations, including the 672-line `workspace-groups.ts` | 3 | 955 | `application/sidebar/` | 6 | open — ready (29 merged) |
| 29 | **removal** — the messaging platform surface, config **and** adaptation | 3 del + ~15 edit, 30 files touched | ~1,500 | — | 5 | merged — `6a35050` + `84f09cc` + merge `46d9c47` · reviewer: deletion completeness 0 stale hits across every deleted symbol; drop accounting line-for-line (−2 files / −35 tests, every removed test a messaging assertion); must-keeps byte-identical (api/messaging.ts 131 lines); the ruled behaviour change implemented exactly by the exclusion-list removal; ledger 0 constant; 774 files / 7431 tests, guard 16/16, eslint 0. The under-deleted atom tail ($messagingSessions 等 no-producer readers) is letter-compliant and recorded as follow-up material |

**29 was widened on 2026-09-12, and the reason matters.** The first version deleted only
the *config* surface (one page) and kept the *adaptation*: a hardcoded list of **20
platform ids** in `lib/session-source.ts`, **12 brand icons** in
`app/messaging/platform-icon.tsx`, per-platform sidebar sections, and a `messaging`
slice in the sidebar data model. The ruling changed from "not maintaining it for now" to
"**not adapting to hermes's platform model at all**" — that belongs in the backend's
next design, so adapting to it now is wasted work.

So the end state is not "one page fewer": it is **the concept of a platform leaving the
renderer**. Sessions from a platform do not disappear — the client-side exclusion list
that hid them goes away too, so they land in the same list as everything else, ungrouped
and unbadged. That is what "not adapting" looks like, and it is a behaviour change, not
just fewer files.

**29 is the first removal batch here, and its evidence is inverted.** A move is
guarded by `typecheck`: a missed specifier goes red. A removal is not — forgetting to
delete something leaves green, compiling dead code, a command that does nothing, orphan
i18n. So 29 carries a "must NOT delete" section ahead of its "delete" section, and the
executor reports the *drop* in test count as the primary evidence rather than treating
it as a regression.

**Kept on purpose, against the instinct to clean everything:** `api/messaging.ts` whole
(it is the record of the existing protocol shape, and four of its eleven functions are
webhooks, whose page stays), `app/webhooks/`, and
`settings/keys-settings.tsx`'s exclusion of messaging credentials — that last one now
means "nowhere to configure", which is the accepted cost of this ruling.

**It also found something the rearrangement needs:** `app/chat/route-tile.tsx` renders
a page as a layout-tree pane *beside* the main thread (`openRouteTile`). So the
question "can skills/artifacts be pulled out and viewed side by side?" — the mechanism
already exists. Recorded for the `pages/` ruling.

**Two ordering facts the wave table cannot express**, because waves encode *file
collisions*, not dependencies:

- **25 requires 17 to have landed.** Without it `session-info.ts` still imports
  `../utils` from the app layer, and moving it would open an `application → app` edge.
  The wave table puts 25 in wave 2 and 17 in wave 10 — **do 17 first regardless.**
- **24 must run after 23.** They share `gateway-event/index.ts` and
  `gateway-event/types.ts`; the collision check sees this (they are in waves 1 and 5),
  but 23 moving those two files while 24 edits them is the reason, not a coincidence.

**Not dispatched, on purpose:** `desktop-bridge.ts`'s three-way split, the tool-call
model fallback, `app/settings/`, `workspace-groups.ts`, and `app/routes.ts`. Each needs
a decision about *what the module is*, not a destination — the decisions are expanded in
`renderer-layer-batches/README.md` under "Phase 3 — not dispatched".

## Phase 4 — `app/` composition root

| item | scope | planning baseline | destination | order | status |
| --- | --- | --- | --- | --- | --- |
| 30 | `app/` 只留入口、路由、组合、骨架、独立窗口；composition 与 shell 均拆清宿主/功能边界 | 632 TS/TSX · 163,701 lines；composition 候选 36 / 12,420；shell 候选约 58 / 11,822（派单时） | `app/composition/{root,wiring,registrations,routing,bridges,dev}` + `app/shell/{chrome,layers,hooks,platform}` + `windows` + rank-5 `features/` | **terminal：17–29 全 merged/reviewed 后独占；30.4 先拆 Shell host/Context Menu，再下沉产品内容** | open |

终态和精确移动表见
[30-app-composition-root.md](renderer-layer-batches/30-app-composition-root.md)。本批不拆
`chat/session/settings/right-sidebar` 的内部业务结构，但会把原 contrib 中已经确认的
Gateway boot、background sync、session tile delegate、MCP dialog 和具体 panes 迁到其明确 feature。
Shell 只留下 chrome 与公共 layer host；Command Palette 由 composition 聚合，Context Menu 拆成
composition 组装 + Shell host + Terminal feature section。`features/` 仍不是新的业务核心层。

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
