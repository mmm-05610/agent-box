# Order 138 — delegation must carry the workspace axis (`AUD-B-020` high; ops `R-0070 ①` literal reading)

## Verdict

`DELEGATION_WORKSPACE_DIMENSION_DONE`. A fresh child now lands in the **parent turn's**
workspace, the roster carries the contract's `workspace` field, and only children that
operate in the parent's workspace are candidates for the act. The cross-project drift is
closed on the real `DelegationService.run` path.

## The defect (first-hand, matching AUD-B-020)

`_resolve_child_session`'s fresh path placed the child in `self._shared_workspace_id(child)`
= **the child profile's last-touched session's workspace**, which can be a completely
different project. `resolve_roster` emitted no `workspace` field and neither authorization
nor candidate selection consulted a workspace dimension, so `65:83`'s "default scope:
same-workspace profiles only" had neither a visible nor an enforced face. ⇒ a conversation
about project A could write into project B, with a drifting landing point.

## What ops decided (so the executor does not re-decide product semantics)

`R-0070 ①`: take the **literal** `65:83` implementation — placement = the parent turn's
workspace, roster emits `workspace`, candidates filtered by the parent's workspace. The
alternative (a typed `SUBAGENT_WORKSPACE_MISMATCH` reject when crossing) would read
"默认" as overridable ⇒ a product decision ⇒ left to the user per `R-0070 ②`. **This order
implements only the literal reading and adds no new refusal code.**

## The fix

| Surface | Before | After |
| - | - | - |
| Placement (`_resolve_child_session` fresh) | `workspace_id = _shared_workspace_id(child)` (child's last session) | `workspace_id = parent_workspace_id` (the parent turn's session workspace) |
| Parent workspace | never consulted | `get_turn_context(parent_turn_id)["workspace_id"]` in `run` |
| Roster (`resolve_roster`) | no `workspace` field | emits `workspace` from an injected `workspace_of` map (child's current workspace); `None` when a caller has no session access |
| Candidate set (act) | all granted children | filtered to `entry["workspace"] == parent_workspace_id` before `validate_run_arguments` |

Consequence: a child whose workspace differs from the parent's is **not a candidate**, so
requesting it hits the existing `SUBAGENT_NOT_AUTHORIZED` (its name is not in the filtered
roster) — an explicit, assertable refusal, never a silent landing in another project. No new
code, no `wire/**`, no protocol change.

Same-workspace behavior is byte-unchanged: when the child's workspace equals the parent's,
the filter keeps it and placement picks the same workspace the old code would have.

## Gate (`tests/server/test_delegation_workspace_dimension_138.py`) — drives real `run`

* G1 `test_same_workspace_child_lands_in_the_parent_workspace` — child home == parent ws ⇒
  the created child session is in the parent's workspace.
* G2 `test_cross_workspace_child_is_not_offered` — child home is another project ⇒ run
  refuses `SUBAGENT_NOT_AUTHORIZED` (no silent cross-project placement).
* G3 `test_roster_carries_the_workspace_field` — `list_for` entries carry `workspace` equal to
  each child's current workspace.
* G4 + counterexample `test_counterexample_inference_based_placement_would_reach_another_project`
  — on the real path, a refused cross-workspace delegation creates **no** child session in
  the other project (the refused `gamma` keeps only its one seed session).

**Load-bearing proof** (ran in-tree, then reverted): removing the workspace filter **and**
restoring `_shared_workspace_id(child)` placement (today's shape) reddens exactly the two
cross-workspace tests (the child becomes offered again and would land in project B) while the
same-workspace and roster-field gates stay green.

## `65` e2e test corrected to match production

`test_the_real_bridge_process_runs_a_child_turn_end_to_end` pointed its delegation token at a
phantom `parent-turn-e2e` with no `server_turns` row. Production always invokes the bridge from
a live parent turn, and workspace placement legitimately requires that turn to resolve, so the
test now creates a real parent session + turn in the shared workspace. This is not a test hack:
the old phantom turn was masking the fact that placement never consulted the parent.

## Boundaries respected

`wire/**` untouched; `protocols/**`/`workers/**` untouched; `65` contract text unchanged (this
order executes it); no new refusal code; same-workspace delegation preserved.
