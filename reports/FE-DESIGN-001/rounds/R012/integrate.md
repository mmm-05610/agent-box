# R012 integrate report

## What the round established

Artifact attacked: `candidates/best.md` = `fece1121311d…`. Two new majors, both ruled **holds**
independently, and a third added by the verifier's own `MISSED_CHECK`:

- **FE-CE-025 (major, holds).** S01's step table pumps the two typed deltas (seq 1 and 2) in step 4
  and only then subscribes in step 5 with `from_cursor = h.cursor_resolve(...)`. §R11.2 defines
  `cursor_resolve` as "next `Seq` the resource will assign" (= 3) and §R11.3 replays only
  `seq >= c`, so the user's own typed input is pumped, retained and never rendered — while the same
  table's delete column asserts "step 5 never receives". §R11.1 assigns `cursor_resolve` to *pre-
  existing* resources and `0` to a just-created head, and S01's resource is created by that very
  extension one step earlier. The defect is the artifact's own evidence contradicting the artifact's
  own cursor rules; S02/S04 subscribe *before* they pump, which is why only S01 breaks.
- **FE-CE-026 (major, holds).** `handle_for` occurs once, at S01 step 3, and is declared nowhere —
  not in §R11.2, not in §R11.6, not in any boundary rule. Every scenario's extension side needs a
  `SubscriberScope`, and no rule said where one comes from, so §R11.7's claim that the trajectories
  are "reproduced in full so that nothing has to be taken from another document" was false.
- **FE-CE-027 (major, holds — added by the verifier).** This one is a *consequence of the previous
  round's own repair*: §R11.3's honest cost licensed the adapter to bound memory by retiring a
  resource and re-announcing it. If it re-announces the **same** `local_id` in the same namespace,
  the `seq` space restarts at 1 under an unchanged `ResourceId`, while the only catch-up guard is
  `recorded_ns_id == current ns_id`. A view that persisted `saved_last_seen = 20` then replays
  nothing, resumes live above the new incarnation's first five events, and renders a catch-up that
  looks complete. The namespace check cannot see the incarnation change.

The verifier also filed a `FABRICATION_CHECK` against this round's attacker: its list of scenarios
hiding the handle was inflated (S02's `h` first appears at step 3, not step 2; S07 and S12 had no
numbered steps and no handle at all). The conclusion survived; the stated count did not, and the
record keeps the correction rather than the claim. Its `CONTRADICTION_CHECK` is the same defect as
FE-CE-026 seen from the self-containment angle, and its A-side ruling on `FE-CE-007` was once again
recorded as `not_applicable` by the guard while B's row stays OPEN.

## The three repairs

1. **FE-CE-026 — the scope seam is declared.** §R11.2 gains
   `ViewHost.open_scope(ns_id): SubscriberScope | ExplicitAbsent`, and §R11.6 gains host item 9: the
   host mints one scope per (view, ns_id); `ExplicitAbsent` when the namespace is not open; a scope
   is never discoverable from another scope, never shares another namespace's contents, and confers
   no permission beyond `resource.ns_id == scope.ns_id`. S01 step 3 now calls it. §R11.5's deferral
   to the absent §R8.4 is replaced by the four rules it deferred (extension selection,
   absent→fallback, throws→error-boundary, uninstall→host-closes-scope) and the pair gesture.
2. **FE-CE-025 — S01 subscribes correctly.** Step 5 becomes
   `s.subscribe({ns_id,local_id:"main"}, from_cursor=0)` — this extension announced the resource one
   step earlier, so the just-created-head rule applies and `0` admits seq 1 and 2 — and its delete
   column now names the wrong choice explicitly (subscribe with `cursor_resolve`: c=3 and the two
   typed deltas are never replayed).
3. **FE-CE-027 — one incarnation per `local_id`.** `retire(local_id)` now disposes the log **and
   burns the `local_id` for that namespace's lifetime**; a re-`announce` of the same `local_id`
   raises `LocalIdBurned`; `cursor_resolve` and `subscribe` return `ExplicitAbsent` for a `local_id`
   that is not currently announced. A persisted cursor can therefore never be silently re-pointed at
   a different incarnation: either the `local_id` still resolves and its `seq` space is continuous,
   or it does not resolve and the view is told "this resource is gone — re-pair or open its
   successor". The memory-bound lever is restated accordingly (retire, then announce a successor
   under a **new** `local_id`), and S09 gains step 7 for the `ExplicitAbsent` path.

## The reviewer's two demands, both paid

4. **All twelve scenarios are now step tables.** S06, S07, S08, S09, S10 and S12 — the six the
   reviewer ruled `insufficient_evidence` as compressed chains — are rewritten with an actor, an
   operation, what is authoritative, and the user-visible failure on deletion for every step. The
   §R11.7 preamble no longer claims this without the text to back it, and no scenario refers to a
   section outside the artifact.
5. **The extension author's cost is classified** in a new §R11.7b: persist the cursor triple; choose
   `from_cursor` correctly; handle `ExplicitAbsent`; close on unmount; render all four variants;
   register `read`/`status` for anything inspectable; declare schemas by field name only. Item 6 is
   named there as the largest single cost the design imposes on adapters.

## Reduction

No core concept was added. `ViewHost.open_scope` is one declared operation answering a path every
scenario already walked (FE-CE-026), and the `ExplicitAbsent` returns on `cursor_resolve` /
`subscribe` are two widened signatures that make an existing fact (a retired resource is gone)
expressible. One behaviour was *removed* rather than added: re-announcing a retired `local_id` in
the same namespace is now refused. The R011 deletion of the adapter flat-schema obligation stands
unchanged, and the dead list is unchanged.

## Deletion experiments

Three new model experiments, each with a counter-example so none is vacuous:
`R12-A` shows the re-announce lever silently skipping five events without the burn rule and
`ExplicitAbsent` with it; `R12-B` shows S01's order losing both typed deltas while the same code
delivers them when the subscription precedes the events; `R12-C` is a static check over the twelve
tables which **fails on the pre-patch bytes, flagging `handle_for`**, and passes on these. R11-A/B/C
are carried unchanged.

## CHANGES_VS_PREVIOUS: (a) §R11.2 adds `interface ViewHost` with `open_scope(ns_id)`, and widens `cursor_resolve` to `Seq | ExplicitAbsent` and `subscribe` to `Subscription | ExplicitAbsent`. (b) §R11.3 states delivery returns `ExplicitAbsent` for a non-announced resource, adds the bullet "One incarnation per `local_id`" (retire burns the id; re-announce raises `LocalIdBurned`), and restates the memory lever as retire + announce a successor under a **new** id. (c) §R11.4 and the presence rule are unchanged. (d) §R11.5 replaces the "unchanged from §R8.4" deferral with the four deferred rules stated in full. (e) §R11.6 becomes "adapter items 1–8, host item 9" with the scope-minting duty. (f) §R11.7's preamble no longer over-claims, and S06/S07/S08/S09/S10/S12 are rewritten as step tables; S09 gains step 7 for `ExplicitAbsent`; S01 steps 3 and 5 are repaired; S03 step 4's delete line names the retention clause that actually enables it. (g) New §R11.7b classifies the extension author's cost. (h) §R11.9's honest-cost text reflects the new memory lever. (i) `FE-CE-018` is re-checked, not inherited, because the interface surface moved. (j) `FE-CE-007` untouched and still OPEN on B.

## Boundary discipline

`FE-CE-007` stays OPEN on the discarded alternative B's ledger; no pass row for it appears in the
replay block, and this round neither repairs nor rejects B. No scenario requirement was raised and
no scenario was altered to make a finding disappear; S01 and S03 were repaired *to* their stated
intent, and the fixes are visible in the tables rather than in prose. Every new guard here has a
counter-example: the incarnation rule is shown failing without the burn, the ordering rule is shown
failing under `cursor_resolve`, and the static call check is shown failing on the pre-patch bytes.
Nothing in this round claims product or protocol verification; the experiments are labelled
MODEL ONLY and prove only the models they encode.
