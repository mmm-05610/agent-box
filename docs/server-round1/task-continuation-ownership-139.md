# Order 139 — `task_id` continuation must check session ownership (`AUD-B-021` high)

## Verdict

`SUBAGENT_TASK_OWNERSHIP_DONE`. Continuation now requires the resolved session to belong to
the child profile this run actually selected (the same roster the grant is read from), and a
handle that resolves to more than one session fails deterministically. No new error code, no
contract change, no schema index.

## The defect (first-hand, matching AUD-B-021)

The continuation branch resolved a `task_id` by querying **all** sessions
`WHERE checkpoint_native_id=?` with no profile/parent scope, then made a single check:
`owner.harness_type != child.harness_type` ⇒ `SUBAGENT_TASK_FAMILY_MISMATCH`. So:
* a parent authorized only for child C could resume child **D's** native handle, provided D
  is the same family (even a session in a different workspace) — the gate became "any session
  of the same family", not "the authorized child's session";
* `checkpoint_native_id` has no unique index, so a handle shared by several sessions made
  `fetchone()` resolve to whichever row the ledger returned first — an unreproducible landing.

`task_id` is a handle the tool hands back to the model, so one delegation's return value is
enough to reach this on the next turn — no external leak required.

## ops ruling applied (not re-decided)

* Reuse the existing `SUBAGENT_NOT_AUTHORIZED` — **zero contract change** (the reviewer also
  preferred this). **No** new `SUBAGENT_TASK_NOT_CALLABLE` (a new code is a contract addition
  requiring the relock parity table — left to the user).
* The unique partial index (`WHERE checkpoint_native_id IS NOT NULL`) is a **schema change**,
  explicitly out of scope; this order adds only **code-level determinism** (ambiguity ⇒ typed
  reject). Not silently escalating to a schema change.

## The fix (continuation branch of `_resolve_child_session`)

1. `fetchall()` instead of `fetchone()`:
   * 0 rows ⇒ `SUBAGENT_TASK_UNKNOWN` (unchanged);
   * **>1 rows ⇒ deterministic `SUBAGENT_NOT_AUTHORIZED`** (ambiguous handle; never pick a row);
2. the cross-family check runs **first** (unchanged) so the existing
   `SUBAGENT_TASK_FAMILY_MISMATCH` counterexample still fires;
3. **new ownership predicate**: `session.profile_id == chosen["profileId"]` — the session must
   belong to the child this run selected from the (138-scoped) roster; otherwise
   `SUBAGENT_NOT_AUTHORIZED`. This makes the authorization list and the continuation decision
   the same fact.

## Gate (`tests/server/test_task_continuation_ownership_139.py`) — drives real `run`

* `test_resuming_an_unauthorized_same_family_handle_is_refused` — G1/G2: same-family but
  unauthorized profile D's handle ⇒ `SUBAGENT_NOT_AUTHORIZED` (was: silently resumed D).
* `test_ambiguous_handle_fails_deterministically_not_by_row_order` — G3: a handle on two
  sessions ⇒ deterministic `SUBAGENT_NOT_AUTHORIZED`.
* `test_cross_family_handle_still_gives_the_family_code` — G5: cross-family handle still
  `SUBAGENT_TASK_FAMILY_MISMATCH`.
* `test_resuming_the_authorized_child_own_handle_still_works` — positive unchanged: resuming
  the authorized child's own handle still continues that session.

**Load-bearing proof** (ran in-tree, then reverted): neutralizing the ambiguity guard **and**
the ownership predicate reddens exactly the unauthorized and ambiguity gates while the
cross-family and positive gates stay green.

## Boundaries respected

`65` contract text unchanged; `wire/**` / `protocols/**` / `workers/**` untouched; no new error
code; no schema index; the same-family-authorized positive path and the cross-family rejection
are byte-unchanged.

## `132` subtype note

This is the "same fact, recorded in one place" family: **the authorization list (roster) and
the continuation ownership check were two different facts**; they are now one. (Siblings: 136
constraint-in-two-places, 141 declared-boundary-vs-actually-stops.)
