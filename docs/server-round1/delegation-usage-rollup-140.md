# Order 140 — a delegated child's usage rolls up to the parent turn (`AUD-B-022` medium)

## Verdict

`DELEGATION_USAGE_PARENT_ROLLUP_DONE`. `UsageAggregator` now attributes each completed
turn to the session of its **topmost `parent_turn_id` ancestor**, so a conversation that
delegated bills the child's (and grandchild's) tokens once, on the parent root; a session
that never delegates is unchanged. Read-side only; no ledger write, no `wire/**`, no schema.

## The defect (first-hand, matching AUD-B-022)

`aggregate_by_session` summed `WHERE session_id=? AND state='completed'`. A delegated child
turn runs inside its parent's tool call but is recorded in a **different** session (its own
session/child profile), so the parent's number omitted it. The reviewer measured parent 110
against a child burning 9500 at the same moment. `65:78` requires the child's usage to land
on the turn that started it; the `parent_turn_id` link exists (`live_child_turn_ids`, built in
`086` for cancellation) but was used **only** by `cancel_descendants` — the attribution
dimension was never wired. (OF-14 family again: capability present, this leg not connected.)

## ops ruling applied

**Read-side rollup** (not a write-side "accumulate onto the parent" record, which would put
one fact in two places and is the `132` shape / a semantic change to stored data → left to the
user). The aggregate **root is the parent turn**, declared explicitly in the method docstring.
The display-only `_usage_of` return value (the tool result back to the model) is untouched
(Notes: that is a separate concern).

## The fix (`usage_aggregate.py`)

`aggregate_by_session(S)`:
1. find S's **root** turns — completed or not — i.e. turns in S with `parent_turn_id IS NULL`;
2. for each root, walk its delegated subtree transitively via `parent_turn_id`
   (`_subtree_usage`), collecting completed turns' usage and counting completed-but-unreported
   ones as unknown;
3. sum those into S's aggregate.

Why this is exactly the old behavior when nothing delegates: if no turn has a parent, every
turn is its own root and its subtree is itself → the sums equal the old session-scoped query.
Why it cannot double-count: every turn has exactly one root, so it is added to exactly one
session's number — querying the parent and the child in the same call puts the child's tokens
only under the parent (the child session's own root set excludes its parented turns).

## Gate (`tests/server/test_delegation_usage_rollup_140.py`) — real ledger rows

A parent→child→grandchild completed-turn chain (each in its own session) + a non-delegating
session, aggregated through `UsageAggregator` (real `server_turns`/`server_sessions` rows, not
a hand-fed total):
* `test_parent_aggregate_includes_the_whole_delegation_chain` — G1 + G2: parent = 110 + 9500 +
  100 = 9710, `turnsReported` = 3.
* `test_querying_root_and_leaves_never_double_counts` — G3: querying parent + child + grand
  gives parent = 9710 and the grand total across all three = 9710 (leaf sessions report 0 for
  their parented turns); a double-counting implementation would surface as > 9710.
* `test_a_session_that_never_delegates_is_unchanged` — G4: the non-delegating session = 50.

**Load-bearing proof** (ran in-tree, then reverted): disabling the descendant merge (the
session-only shape) reddens exactly the two roll-up gates (parent reverts to 110) while the
non-delegating gate stays green. The existing `test_usage_aggregate` (no delegation) passes
unchanged under the new attribution.

## Boundaries respected

`65` contract text unchanged; `wire/**` / `protocols/**` / `workers/**` untouched; no schema
change; no write-side ledger mutation; the delegation display return (`_usage_of`) unchanged;
the same-family/non-delegating aggregation numbers byte-stable.
