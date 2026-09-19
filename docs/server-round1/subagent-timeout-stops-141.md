# Order 141 — a subagent time-out must STOP the child and carry a locatable handle (`AUD-B-023` medium)

## Verdict

`SUBAGENT_TIMEOUT_STOPS_DONE`. Time-out is now a stop path: it cancels the child before
reporting, keeps the typed `SUBAGENT_TIMEOUT` code, and puts the locatable handle plus the
usage actually incurred into the refusal body. The two existing parent-cancel doors are
unchanged, and the success path is byte-for-byte the same.

## The defect (first-hand, matching AUD-B-023 / OF-14 family)

`_await_terminal` polled to its deadline and then did exactly:

```python
raise DelegationError("SUBAGENT_TIMEOUT", f"the subagent did not finish within {timeout}s")
```

No cancel action, and the exception path produced no body — so after the "10 minute resource
boundary" (`65:81`) the child turn stayed `running` and kept spending, while the parent got
back only a bare message with no `turnId`/`task_id` (`65:90` "no silent degrade"). This is the
OF-14 shape again (case #6): the cancel capability (`sessions.cancel_turn` / `cancel_descendants`
/ `live_child_turn_ids`, built in `086`) sits right there, but the timeout leg never called it.

## ops ruling applied (not re-decided)

`R-0070 ①` — take the **literal** reading, do ① + the minimal part of ② together, because they
are the direct consequence of existing contract text, not new product semantics:
* `:81` "resource boundary" ⇒ the boundary must actually stop;
* `:90` "no silent degrade" ⇒ keep the typed code but don't drop facts — put the handle + usage
  in the refusal.
The reviewer's *other* case ("let the timed-out child run to completion") reads "默认" as
overridable ⇒ product semantics ⇒ left to the user per `R-0070 ②`. Because this order already
makes the body locatable, the eventual ruling needs no further change here.

## The fix (`_await_terminal`)

On deadline expiry, before raising:

1. `usage_so_far = self._usage_of(turn_id)` (read the usage the child actually accumulated);
2. `self.sessions.cancel_turn(turn_id, f"subagent-timeout:{turn_id}")` — the *same* stop
   mechanism the two parent-cancel doors use (records a cancel request, calls the execution
   port, cascades to any grandchildren);
3. read the child's native handle (`_child_native_handle`) if one was assigned;
4. raise `DelegationError("SUBAGENT_TIMEOUT", <message including turnId / task_id / usage>)`.

The typed code is preserved (not a generic collapse), and the refusal is now locatable. The
`/internal/delegation/{token}` endpoint returns `getattr(refusal,"message")`, so the handle +
usage reach the caller's body without touching `wire/**` or the endpoint (both out of scope).

## Gate (`tests/server/test_subagent_timeout_stops_141.py`) — drives real `run`

* `test_timeout_cancels_the_child_and_keeps_the_typed_code` — G2 (still `SUBAGENT_TIMEOUT`) +
  G3 (message carries `turnId=` and a `usage so far` section).
* `test_timeout_leaves_the_child_not_active_on_the_ledger` — G1: after the timeout the child
  turn is no longer in the active set.
* `test_success_path_is_unchanged` — G5: a child that finishes in time returns the normal body
  (`completed`, summary, `task_id`) unchanged.

**Load-bearing proofs** (ran in-tree, then reverted):
* removing the `cancel_turn` call → the "not active" gate goes red (the child stays `running`);
* stripping `turnId=`/usage from the refusal message → the locatable-body gate goes red.

## G5 — the two real stop doors do not regress

`test_cancelling_the_parent_reaches_the_child_turn_that_is_still_running` and
`test_the_wire_stop_applies_the_same_rule` in `test_subagent_rule_liveness_086.py` previously
obtained their "still-running child" *by* driving `run(timeout=1)`. Since 141 makes that very
time-out stop the child, the tests can no longer use it as setup - so they now place a live
child turn in the ledger directly (`_start_a_running_child`) and still assert the same subject:
both stop doors (`sessions.cancel_turn` and `WireService.runs_stop`) reach and cancel a live
child through the execution port. The cascade coverage is intact; only the way the running
child is created changed, off the path this order governs.

## Boundaries respected

`65` contract text/values unchanged (10 min, ≤4/turn); `wire/**`, `protocols/**`, `workers/**`
untouched; the two existing stop entry points unchanged; no new refusal code; success path and
`task_id` semantics unchanged.
