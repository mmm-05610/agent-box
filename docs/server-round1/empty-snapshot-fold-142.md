# Order 142 — a declared-empty workspace snapshot must not fold into "no snapshot" (`B3`, routed to this tree)

## Verdict

`EMPTY_SNAPSHOT_FOLD_DONE`. One-line fix at the fold point; the two states (declared-empty
`{}` vs undeclared `None`) are now distinct facts on the ledger, and the three-state probe
re-runs clean.

## The defect (first-hand, matching A-line 069 `B3`)

`_WorkerChannels.__init__` stored the before-snapshot with a **truthiness** test:

```python
self.workspace_before_snapshot = (
    dict(workspace_before_snapshot) if workspace_before_snapshot else None   # {} is falsy -> None
)
```

So a *declared empty* workspace (`{}`) collapsed into `None` (`no snapshot`). The change-set
branch keys on `is None` (`sidecar.py:893`), so it treated the legitimate empty snapshot as
"undeclared" and returned `None` — the WSL channel's change set was **unknown on every first
turn** even when the round had clearly added a file. A 132-dual: **one ledger cell must not
swallow two facts.**

## The fix (`sidecar.py:631-632`)

`if workspace_before_snapshot is not None` — keep `{}` as `{}`; only `None` stays "no
snapshot". `:893` (`if self.workspace_before_snapshot is None: return None`) was **re-checked**:
it is the *correct* distinction (real undeclared ⇒ unknown) and does **not** need changing —
the only swallow was at the fold point, not downstream. No second same-family bug; nothing to
hand back.

## Gate (`tests/server/test_empty_snapshot_fold_142.py`) — drives real `workspace_change_set`

Three-state probe on the real method (not the private store), via a fake `workspace.list`
client:
* **empty snapshot + new file → "all added"**, not `None` (G1; was `unknown` pre-fix);
* **`None` snapshot → `None`** unchanged (G2; undeclared still honest-unknown);
* **non-empty snapshot, file unchanged → empty change set**, not `None` (sanity that the
  declared path is exercised, distinct from the fold).

**Load-bearing proof** (ran in-tree, then reverted): restoring the truthiness test makes the
empty-snapshot gate return `None` (red) while the `None` and non-empty gates stay green.

## Re-run of the 069 observation (G4)

The order's "复跑 069 的三态探针" is the same three states the gate computes deterministically
at the exact fold point (empty→all-added, none→unknown, unchanged→empty-set). The literal
**WSL real-channel** run of A's probe needs a built Worker binary on a WSL host, which is
absent in this tree (the standing ~18-19 environmental reds) — recorded honestly as
env-blocked for the *real-machine* leg; the fold-point three-state result is reproduced and
green in-tree.

## Boundaries respected

`54`'s declared snapshot shape unchanged; `wire/**` / `protocols/**` untouched; the real
"no snapshot" (`None`) behavior is byte-unchanged; the change-set method itself unchanged.

## `132` dual note

This is the opposite face of "same fact, one place": here **one place was made to swallow two
different facts** (`{}` vs `None`). Absorbed into the `132` general predicate.
