# Renderer layer — master construction plan

This is the governing document for the layer migration. It aggregates every work
order, fixes the order, says what may run at the same time, and says what is not
delegated.

**It is maintained, not frozen.** New module reviews produce new work orders, and
every one of them lands here — see §9 for the exact steps, so updating it is not
a judgement call.

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
| ledger today | **85** |
| after every work order in §3 | **58** |
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
rank 4   extension/                        ⚠ 16   ← the SDK barrel
rank 4   dev/  plugins/                    ✓ 0
rank 5   app/                              ✓ 0
```

Directions: `components → app` 28, `lib → store` 16, `extension → app` 16,
`store → app` 11, `store → components` 9, `lib → app` 3, `lib → components` 2.

The read-first analysis is
[`renderer-layer-boundary.md`](renderer-layer-boundary.md); the executable work
orders are in
[`renderer-layer-batches/`](renderer-layer-batches/README.md).

## 3 · Order

**Stage A — the layer work orders. 27 edges.** All six are written, all
destinations verified, all collisions mapped (§4).

| work order | scope | edges |
| --- | --- | --- |
| 01 | four small stateful `lib/` services → `store/` | 6 |
| 02 | `lib/tour/` → `app/tour/` | 2 |
| 03 | a misplaced shape and a sidebar label | 3 |
| 04 | split `workspace-groups.ts`, membership core → `store/` | 4 |
| 06 | the rest of station 1: two splits, one injection, two moves | 7 |
| 07 | `lib/keybinds/` and `lib/external-link.tsx`, split by consumer | 5 |

**Stage B — work order 05, the `@/hermes` barrel.** 0 edges, ~240 files, four
phases. It runs as its own stage, **never interleaved with Stage A** — it is the
largest single change and it overlaps most of Stage A's files.

Stage A first, deliberately: it banks verified progress, it is the stage that
moves the ledger, and 05 is order-independent from it (its own document says
entirely before or entirely after). 05 also pays no layer debt at all, so it can
never be "how the migration is progressing" — it gets its own stage and its own
review so its result is attributable.

**Stage C — the four knots. Not delegated.** They need decisions, not moves. §7.

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

Current output — **3 waves is the minimum sequential depth**:

```
wave 1: 02 tour · 04 workspace · 06a1 statusbar · 06b1 haptics · 06c2 image-dl
wave 2: 01 lib-services · 03 shape+label · 06c1 sound · 07a keybinds · 07b external-link
wave 3: 06a2 link-title
```

The collisions that force this:

| pair | shared file |
| --- | --- |
| 01 ∩ 04 | `app/session/hooks/use-session-actions/session-create.ts` |
| 03 ∩ 04 | `store/projects/crud.ts`, `app/chat/sidebar/projects/workspace-group.tsx`, +3 |
| 06a2 ∩ 07b | `components/assistant-ui/directive-text.tsx` |
| 06b1 ∩ 07a | `components/assistant-ui/clarify-tool.tsx`, `app/settings/index.tsx`, +1 |
| 06b1 ∩ 06c1 | `app/session/hooks/use-message-stream/gateway-event/message-stream.ts`, +1 |
| 06b1 ∩ 07b | `components/assistant-ui/directive-text.tsx`, `app/settings/env-var-actions-menu.tsx` |
| 06b1 ∩ 03 | `app/chat/sidebar/session-row.tsx` |
| 06b1 ∩ 01 | `extension/sdk/index.ts`, `app/chat/sidebar/session-actions-menu.tsx` |
| 06c2 ∩ 07b | `components/assistant-ui/embeds/listing-embed.tsx` |

`06b1 haptics` collides with six others because it has 55 importers. Treat it as
its own slot.

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

## 5 · Review: every stage, by someone who did not do the work

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

## 7 · Not delegated

**The four design knots.** Each needs a decision; an executor that "helpfully"
attempts one produces a plausible wrong answer. They are described in
[`renderer-layer-boundary.md`](renderer-layer-boundary.md) §2.

| knot | edges | the decision needed |
| --- | --- | --- |
| the second composer (`components/assistant-ui/thread/user-edit-composer.tsx`, 928 lines) | 17 | collapse it into the app's composer, or extract a shared one |
| the plugin ABI (`extension/sdk/index.ts`, 96 re-exports) | 16 | invert it: SDK declares the contract, `app/` registers implementations |
| components driving app behaviour by import (`app/chat/composer/focus.ts`, 420 lines) | 16 | a downward command channel, or an intent the composer subscribes to |
| layout state in the component layer (`components/pane-shell/tree/store.ts`, 2029 lines) | 9 | how far the pane/layout split goes — the registry move already untied it from its blocker |

A knot becomes a work order the moment its decision is made, and then it enters
Stage A's machinery (§9).

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
3. Add its modules to `renderer-layer-batches/batch-manifest.json`.
4. **Re-run the collision check** (§4) and replace the waves table. Do not reason
   about it — the graph changed.
5. Add it to Stage A's table in §3, or open a new stage if it is a different kind
   of work (as 05 is).
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
