# Renderer layer — master construction plan

This is the governing document for the layer migration. It aggregates every work
order, fixes the order, says what may run at the same time, and says what is not
delegated.

**It is maintained, not frozen.** New module reviews produce new work orders, and
every one of them lands here — see §9 for the exact steps, so updating it is not
a judgement call.

---

## 0 · Precedence — read this before trusting any number in this file

This document is **the plan, not the state**. It is maintained, so parts of it are
summaries, and summaries go stale — including while a batch is running. When two
things disagree, this is the order:

| source of truth | what it owns |
| --- | --- |
| `renderer-layers.debt.ts` | how much work is left. Generated, and the guard fails on a stale line |
| `renderer-layer-batches/NN-*.md` | what each batch does, and how many edges it claims |
| `renderer-layer-batches/batch-manifest.json` | each batch's claimed edges and the modules it touches |
| `renderer-layer-status.md` | which items are merged |
| **this file** | the order, the parallel groups, the rules, and what is not delegated |

So the work list is **not** a list written into this file or into a prompt. It is
the rows in the status file that are not `merged` — every work order, with no
  phase acting as a permission gate. And the target is **not** a number written in §1:

```
expected ledger = ledger now − Σ(edges of the items you are about to do)
```

Re-derive everything with one command:

```bash
cd apps/desktop/src
node ../../../.agents/skills/architecture-tree-report/scripts/batch-collisions.mjs \
  ../../../docs/architecture/renderer-layer-batches/batch-manifest.json
```

It prints each batch's claimed edges, its touched-file count, the current ledger,
the ledger after every batch, and the waves. **If §1 or §3 below states a
different number, this file is stale and the manifest wins.**

Two consequences worth stating, because both have already happened:

- **A prompt handed to an executor must not restate the batch list or the target
  number.** It says where to read them. A prompt that froze "01–07, 27 edges,
  85 → 58" was written from §3's state at that moment and was wrong within the
  hour, when a knot was decided and became batch 08. The executor noticed and
  stopped, which is correct behaviour — but the prompt was the defect. The brief
  is therefore kept as
  [`renderer-layer-batches/EXECUTOR-PROMPT.md`](renderer-layer-batches/EXECUTOR-PROMPT.md),
  versioned with this plan, instead of being pasted from a chat.
- **Re-read §3 and this section at the start of each item, not once at the
  start of the run.** That is what §9 is for.

---

## 1 · The objective, and the one honest measure of it

Every import in the renderer points **down** the layer order:

```
rank 0   api/   types/   i18n/   themes/   lib/
rank 1   store/
rank 2   application/
rank 4   components/   extension/   dev/
rank 5   app/
```

The measure is
`apps/desktop/src/dev/contracts/renderer-layers.debt.ts` — a frozen ledger of
every import that still points up. It is a **ratchet**: the guard
(`renderer-layers.test.ts`) fails on an edge that is not listed *and* on a listed
line that no longer exists. So the ledger cannot be widened to make something
land, and a round that fixes an edge without touching the ledger leaves the suite
red on purpose.

| | |
| --- | --- |
| ledger today | **85** *(derived — see §0)* |
| after every work order in §3 | **13** *(derived — see §0)* |
| test baseline | **775 files / 7466 tests** |

**An item is done when the ledger shrank by exactly the number its work order
predicted.** Not when the tests pass — they can pass while the change did nothing.
If the drop is smaller than predicted, a recorded edge was left behind or a
`vi.mock` target was missed. If it is larger, something else was fixed and the
work order under-counted; say so.

Regenerate with `npm run ledger:layers` from `apps/desktop`. It is generated, so
never hand-edit it.

## 2 · Where the tree stands

```
rank 0   api/ types/ i18n/ themes/         ✓ 0
rank 0   lib/                              ⚠ 21   ← station 1, being cleared now
rank 0   hermes.ts                         ⚠ pending deletion (work order 05)
rank 1   store/                            ⚠ 20   ← station 2
rank 2   application/                      ✓ 0
rank 4   components/                       ⚠ 28   ← station 4, the hardest
rank 4   extension/                        ⚠ 16   ← the plugin ABI (work order 09)
rank 4   dev/  plugins/                    ✓ 0
rank 5   app/                              ✓ 0
```

Directions: `components → app` 28, `lib → store` 16, `extension → app` 16,
`store → app` 11, `store → components` 9, `lib → app` 3, `lib → components` 2.

Where the 85 lines go, so the batches can be read against the tree:

```
lib/          21   all of it      01 · 02 · 03 · 06 · 07        → 0 left
store/        20   18 of it       03 · 04 · 08 · 10            → 2 left
components/   28   20 of it       09 (1) · 10 (19)             → 8 left
extension/    16   13 of it       09                            → 3 left
```

The read-first analysis is
[`renderer-layer-boundary.md`](renderer-layer-boundary.md); the executable work
orders are in
[`renderer-layer-batches/`](renderer-layer-batches/README.md).

## 3 · The run

**Everything in `renderer-layer-batches/` is in scope. There is no permission gate,
and nothing waits for a later instruction.** The ordering below is about *when
things may run relative to each other* — file collisions and review boundaries —
not about what is allowed. A run that finishes Phase 1 and stops has not done the
job; it has done a third of it.

The per-batch edge counts are the ones in the manifest, which is what sums to the
target — see §0.

### Phase 1 — the layer work orders

| work order | scope | edges |
| --- | --- | --- |
| 01 | four small stateful `lib/` services → `store/` | 6 |
| 02 | `lib/tour/` → `app/tour/` | 2 |
| 03 | a misplaced shape and a sidebar label | 3 |
| 04 | split `workspace-groups.ts`, membership core → `store/` | 4 |
| 06 | the rest of station 1: two splits, one injection, two moves | 7 |
| 07 | `lib/keybinds/` and `lib/external-link.tsx`, split by consumer | 5 |
| 08 | the pane/layout domain sinks to `lib/` + `store/` | 9 |
| 09 | the plugin ABI stops reaching into the app | 14 |
| 10 | the composer engine leaves `app/` for `lib/` + `components/` | 22 |

72 edges. Parallel per §4. **Review gate** when the phase's last item merges (§5).

### Phase 2 — work order 05, the `@/hermes` barrel

0 edges, ~240 files, four internal phases. It is its own phase for one reason:
**it must not run concurrently with Phase 1**, because it overlaps most of Phase 1's
files. Before or after are both fine; after is better, because Phase 1's progress is
already banked and reviewed by then.

05 pays no layer debt, so it never moves the ledger. Do not read its completion as
progress on the migration — read the ledger for that. **Review gate** after it, with
its own reviewer, so its result is attributable rather than mixed into a layer
round.

### Phase 3 — whatever the open decisions produce

Empty today, and that is the honest state: every work order that exists is in
Phase 1 or 2. Orders appear here as the knots in §7 are decided — the three
host-view capability exports, the composer's last edge, and the nine edges nobody
has examined yet. Each becomes a normal work order: same collision check, same
review gate. §9 says how one enters this plan.

### Done

**Every work order in `renderer-layer-batches/` is merged and reviewed, and the
ledger equals the target §0 derives from the manifest.** Not "Phase 1 is green".

If the run reaches that state and the ledger is still above zero, the remainder is
in §7 — undecided knots, which a decision has to unblock. Report what is left and
stop there; that is the one legitimate stopping point. Do not improvise a fix for an
undecided knot to reach zero.

## 4 · What may run at the same time

The constraint is **files**, not batches. Two work orders collide when a file
appears in both of their touched sets — where a batch's touched set is every
production file importing a module it moves or changes.

The collision graph is computed, not reasoned about:

```bash
cd apps/desktop/src
node ../../../.agents/skills/architecture-tree-report/scripts/batch-collisions.mjs \
  ../../../docs/architecture/renderer-layer-batches/batch-manifest.json
```

Current output — **5 waves is the minimum sequential depth**:

```
wave 1: 02 tour · 06c1 sound · 06c2 image-dl · 09 plugin-abi
wave 2: 04 workspace · 06a1 statusbar · 06b1 haptics
wave 3: 03 shape+label · 06a2 link-title · 08 pane-shell
wave 4: 01 lib-services · 07a keybinds · 07b external-link
wave 5: 10 composer-engine
```

The collisions that force this:

| pair | shared file |
| --- | --- |
| 01 lib-services ∩ 04 workspace | `app/session/hooks/use-session-actions/session-create.ts` |
| 01 lib-services ∩ 06b1 haptics | `app/chat/sidebar/session-actions-menu.tsx``, ``extension/sdk/index.ts` |
| 01 lib-services ∩ 08 pane-shell | `app/chat/sidebar/session-actions-menu.tsx``, ``app/contrib/controller.tsx`, +3 |
| 01 lib-services ∩ 09 plugin-abi | `app/chat/sidebar/session-actions-menu.tsx``, ``app/contrib/controller.tsx`, +2 |
| 01 lib-services ∩ 10 composer-engine | `app/contrib/controller.tsx``, ``extension/sdk/index.ts` |
| 03 shape+label ∩ 04 workspace | `app/chat/sidebar/gateway-groups.tsx``, ``app/chat/sidebar/projects/entered-content.tsx`, +3 |
| 03 shape+label ∩ 06b1 haptics | `app/chat/sidebar/session-row.tsx` |
| 03 shape+label ∩ 09 plugin-abi | `app/chat/sidebar/chrome.tsx``, ``app/chat/sidebar/gateway-groups.tsx`, +7 |
| 04 workspace ∩ 08 pane-shell | `app/session/hooks/use-session-actions/session-create.ts` |
| 04 workspace ∩ 09 plugin-abi | `app/chat/sidebar/gateway-groups.tsx``, ``app/chat/sidebar/projects/entered-content.tsx`, +3 |
| 06a1 statusbar ∩ 08 pane-shell | `app/shell/hooks/use-statusbar-items.tsx` |
| 06a1 statusbar ∩ 09 plugin-abi | `app/shell/hooks/use-statusbar-items.tsx` |
| 06a2 link-title ∩ 06b1 haptics | `components/assistant-ui/directive-text.tsx` |
| 06a2 link-title ∩ 07b external-link | `components/assistant-ui/directive-text.tsx` |
| 06a2 link-title ∩ 09 plugin-abi | `components/assistant-ui/directive-text.tsx` |
| 06b1 haptics ∩ 06c1 sound | `app/session/hooks/use-message-stream/gateway-event/message-stream.ts``, ``app/settings/notifications-settings.tsx` |
| 06b1 haptics ∩ 07a keybinds | `app/chat/composer/hooks/use-composer-esc-cancel.ts``, ``app/settings/index.tsx`, +1 |
| 06b1 haptics ∩ 07b external-link | `app/settings/env-var-actions-menu.tsx``, ``components/assistant-ui/directive-text.tsx` |
| 06b1 haptics ∩ 08 pane-shell | `app/chat/sidebar/session-actions-menu.tsx``, ``app/settings/plugins-settings.tsx`, +2 |
| 06b1 haptics ∩ 09 plugin-abi | `app/chat/sidebar/connection-switcher.tsx``, ``app/chat/sidebar/profile-switcher.tsx`, +9 |
| 06b1 haptics ∩ 10 composer-engine | `app/chat/composer/chat-bar.tsx``, ``app/chat/composer/hooks/use-composer-drop.ts`, +7 |
| 06c2 image-dl ∩ 07b external-link | `components/assistant-ui/embeds/listing-embed.tsx` |
| 07a keybinds ∩ 08 pane-shell | `app/hooks/use-keybinds.ts``, ``components/pane-shell/tree/renderer/tree-group.tsx` |
| 07a keybinds ∩ 09 plugin-abi | `app/hooks/use-keybinds.ts``, ``app/settings/index.tsx` |
| 07a keybinds ∩ 10 composer-engine | `app/chat/composer/focus-chord.ts``, ``app/chat/composer/hooks/use-composer-esc-cancel.ts`, +3 |
| 07b external-link ∩ 08 pane-shell | `app/chat/preview-tile.tsx``, ``app/context-menu/app-context-menu.tsx` |
| 07b external-link ∩ 09 plugin-abi | `app/artifacts/index.tsx``, ``app/context-menu/app-context-menu.tsx`, +2 |
| 08 pane-shell ∩ 09 plugin-abi | `app/chat/close-tab.ts``, ``app/chat/index.tsx`, +15 |
| 08 pane-shell ∩ 10 composer-engine | `app/chat/composer/focus.ts``, ``app/chat/index.tsx`, +5 |
| 09 plugin-abi ∩ 10 composer-engine | `app/chat/composer/status-stack/index.tsx``, ``app/chat/index.tsx`, +8 |


Four items are wide, for different reasons and with the same consequence —
treat each as its own slot: `09 plugin-abi` (ten collisions, 78 touched files: it
edits the ABI module that every batch shipping a `lib/` helper re-exports
through), `06b1 haptics` (nine, 55 importers), `08 pane-shell` (eight, 45), and
`10 composer-engine` (five collisions but the widest real footprint in the
migration: 40 production importers plus most of the 49 files inside
`app/chat/composer/`, which the manifest's string patterns can only approximate).
`10` lands alone in wave 5 for that reason, and it is also why it should be written
last: by then 09 has already moved `COMPOSER_AREAS` out of the file the two batches
share.

### How to actually run it

- **Rolling queue, not barriers.** A work order may start as soon as every work
  order it collides with has been merged. Waiting for a whole wave wastes time
  when only one partner is slow.
- **Cap at 3 concurrent.** The suite is CPU-heavy (775 files, ~160 s alone) and
  this repo already documents flakes caused by runner contention — see the
  comment in `apps/desktop/vitest.setup.ts` about `waitFor` deadlines tripping on
  saturated runners. If a worker reports a *timeout-shaped* failure, re-run that
  file **alone** before believing it.
- **Concurrent workers must not share a working tree.** Two workers in one tree
  fight over the ledger, and — worse — a test run reads files while the other
  worker is editing them, which produces failures that belong to neither. That
  has already happened once in this project and cost a full suite run. If the
  tool cannot give each worker its own worktree, run them serially in the order
  above instead of pretending.
- **The ledger is generated, so it is not a merge point.** Workers do not
  hand-edit `renderer-layers.debt.ts`. Each may regenerate it locally to verify,
  but the **integration step regenerates it once on the merged tree** and that
  copy is authoritative. This is what makes parallel work safe at all: only the
  source moves can conflict, and those are exactly what the collision check
  mapped.

## 5 · Review: every phase, by someone who did not do the work

Each merged slot gets an **independent reviewer + test subagent**, briefed to
distrust the worker's report. It must:

1. **Run the checks itself** — `npm run typecheck`, `npm run test:ui`, the layer
   guard, `npx eslint` on the changed files, `git diff --check`. Paste the real
   numbers; never quote the worker's.
2. **Confirm the ledger arithmetic** — regenerate it and check the drop equals the
   work order's claimed edge count, no more and no less.
3. **Audit the diff for stray changes.** List every changed line that is not an
   import statement or a relocated block, and account for each one. This is how a
   cosmetic `--fix` rewrite or an accidental edit gets caught.
4. **Hunt §6**, entry by entry, in the files that changed.
5. **Check the test counts.** 775 files / 7466 tests is the baseline. A drop needs
   a per-file explanation; the suites' own diffs are not evidence.
6. **Report disagreement.** A reviewer that returns "looks good" without naming
   anything it verified has not reviewed. It should also say what it could *not*
   verify.

The reviewer's verdict goes into the status file (§8). A slot is not complete
until a reviewer says so.

## 6 · The silent-failure catalogue

Every entry is a failure this project has already produced at least once. They
share one property: **the suite stays green.** That is why a passing run is not
evidence, and why this list is worked through explicitly rather than trusted to
attention.

1. **A `vi.mock` whose module moved.** `vi.mock('@/lib/media')` stops intercepting
   the moment that module's path changes; the test then reaches the real
   implementation and **still passes**. Every moved module that was mocked needs
   its target moved in the same commit. Seen: `store/file-actions.test.ts`.
2. **Partial mocks break when the mocked module gains a caller.**
   `vi.mock('@/lib/query-client', () => ({ oneFn: vi.fn() }))` provides only what
   was needed at the time. Add one import of that module to the code under test
   and the new symbol is `undefined` at call time — and because it throws, it
   silently skips everything after it in the same callback. Seen: seven tests
   failed this way when a profile-switch path gained one call, and the failure
   was pointing at a design smell, not just a narrow mock.
3. **Boundary tests that hard-code paths.** Expected module lists, "allowed
   import" strings, synthetic graphs. A move must update the *model*; never the
   assertion. Seen: `store/profile-store-purity.test.ts` enumerates its leaves;
   `store/store-boundaries.test.ts` lists allowed specifiers.
4. **Reverse controls whose fixture names a deleted path prove nothing.** They are
   the tests that prove a scanner can fail; retarget them at something still
   forbidden, never delete them.
5. **`import type` versus runtime.** A type-only import still counts in the
   ledger but is erased at runtime, so it can never form a cycle. Do not "fix" a
   type edge by making the import runtime.
6. **Glob strings are invisible to the type system.**
   `import.meta.glob('../plugins/…')` is a string; `tsc` and the transform do not
   resolve it, and a directory move changes its meaning silently. Seen when
   `extension/contrib` moved.
7. **`eslint --fix` mutates files.** Any suite run in flight is invalidated by it,
   and it can rewrite statements that are not imports. Re-run the suite after, and
   check the resulting diff is import lines only.
8. **A grep for importers is not a resolution.** `from '../..'` resolves to a
   directory index; a bare `from './model'` matches a *different* module in every
   sibling directory. Use a path resolver — `arch:tree --move`, or the ledger
   scanner — never a string match. Seen four times, most recently
   `narrow-overlays.tsx`'s `from '../..'`.
9. **The same basename in several directories.** `./model`, `./identity`,
   `./registry` each exist in two or three places. A blanket rewrite across a
   search result will corrupt the unrelated ones.

## 7 · Still needs a decision

These are **not yet work orders**, which is the only reason they are not being
executed: nobody has decided what they should become — or, for the last group,
nobody has traced them yet. An executor that "helpfully" attempts one produces a
plausible wrong answer.

Three are settled and written up: layout state became work order
[08](renderer-layer-batches/08-pane-shell-sink.md); the plugin ABI became
[09](renderer-layer-batches/09-plugin-abi.md) — fourteen of its seventeen edges;
the composer engine became [10](renderer-layer-batches/10-composer-engine.md) —
twenty-two of its twenty-three. Each of those two documents ends with the finding
that stopped it, and both are worth reading before anyone retries the remainder:
09's is a module-scope capability read that runs before any `app/` code, and 10's
is a hook cluster that reaches into the session-actions domain.

| the remainder | edges | what has to happen |
| --- | --- | --- |
| the three host-view capability exports (`SkillsView`, `McpTab`, `ToolsetConfigPanel`) | 3 | **a decision.** How a plugin learns about a host-provided view: a lazy capability read, a `ctx`-supplied component, a lazy plugin glob, or a shared prop contract |
| the composer's last edge (`user-edit-composer -> @/app/session/hooks/use-prompt-actions`) | 1 | **a decision.** Either unblock the chain (below), or give the edit composer a host-supplied "send" verb, the same shape as 09d |
| the route classifiers (`assistant-message`, `find-bar`, `tips/use-tip-rotation` → `@/app/routes`) | 3 | not a decision — the same closure pass as 10. `appViewForPath`, `SETTINGS_ROUTE`, `isNewChatRoute` and `routeSessionId` are pure, and the first two have a below-app consumer |
| `components/pet/floating-pet.tsx` → three `app/hooks` | 3 | not a decision — pet is a floating widget whose three hooks are app-domain. Sink what is pure, seam what is not |
| three singletons: `boot-failure-overlay -> app/settings/gateway-settings`, `store/gateway-switch -> app/contrib/hooks/use-background-sync`, `store/pane-focus -> app/right-sidebar/store` | 3 | not a decision — three unrelated edges; each needs its own read |

The route classifiers come first whatever else happens: the composer's last edge is
blocked on `app/session/hooks/session-context-drift.ts`, which imports
`isNewChatRoute` and `routeSessionId` from `@/app/routes`. Sink the route
vocabulary and that chain shortens by one link.

The last three rows are an **unexamined remainder**, not a set of knots: every one
is a single module reached from a single consumer, so the next pass is the same
closure exercise as 10, not a design question. Expect two or three small batches.

**Also not delegated:**
- `apps/desktop/src/agentbox/`, `apps/desktop/src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md`, `docs/desktop-src-tree.md` —
  untracked work in progress. Never read, modify or stage them.
- Anything that would change behaviour. Stages A and B are relocations.

## 8 · The status file

**`docs/architecture/renderer-layer-status.md`** — the run's live state, one row
per work order, updated **after** a reviewer passes it and not before.

It exists so that a human can see where the run is without reading a transcript,
and so the next session can pick up without re-deriving anything. The rule that
keeps it honest: **a row may only claim "merged" when it names a commit and the
reviewer's numbers.** No "in progress, mostly done".

Update it in the same commit as the work, or immediately after — a status file
that lags is worse than none, because it is trusted.

## 9 · Keeping this document current

When a new work order appears — from a module review, or from a knot's decision
being made:

1. Write `renderer-layer-batches/NN-<name>.md`, self-contained, with verified
   destinations and stop conditions.
2. Add its row to `renderer-layer-batches/README.md`.
3. Add it to `renderer-layer-batches/batch-manifest.json` with **both** its
   claimed edge count and the modules it touches. The count is what §1's target is
   derived from, and the collision check now fails if the two disagree.
4. **Re-run the collision check** (§4) and replace both the waves table and §1's
   target. Do not reason about either — the graph and the arithmetic changed, and
   the check will tell you if you got the target wrong.
5. Add it to the right phase table in §3 — which phase is a question about file
   collisions and review boundaries, not about permission.
6. Add its row to the status file.

If it is not in the manifest, its collisions are unknown and it must run alone.

## Appendix · the collision check

`.agents/skills/architecture-tree-report/scripts/batch-collisions.mjs` — no
dependencies, reads the manifest, prints the touched-file counts, every colliding
pair with the shared files, and a greedy grouping into the minimum number of
sequential waves.

The manifest is the one input a human maintains: a batch name mapped to the
ripgrep patterns that find the modules it moves or changes. A batch's touched set
is then every production file importing one of those modules. The ledger file is
excluded on purpose — it collides with everything and would say nothing; it is
the integration step's job instead.
