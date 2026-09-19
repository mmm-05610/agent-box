# Order 136 — the child's "narrow-only" limits must reach the production call (`AUD-B-018`, OF-14 family #5)

## Verdict

`CHILD_LIMITS_ON_PRODUCTION_CALL_DONE`. `DelegationService.run` now sources the
requested child's own limits and passes them to `validate_run_arguments`, so both
`SUBAGENT_PERMISSION_WIDENED` and `SUBAGENT_MODEL_WIDENED` are live on the real
delegating path. The judgment logic and both codes in `subagents.py` are **unchanged**.

## The defect (confirmed in-tree, matching AUD-B-018)

`validate_run_arguments(arguments, *, roster, child_limits=None)` implements the
narrowing checks, but the whole check is gated on `child_limits` being supplied:

```python
limits = dict(child_limits or {})
...
allowed = limits.get("permissions")           # None when child_limits omitted
if allowed is not None and permission not in allowed:   # dead
allowed_models = limits.get("models")         # None when omitted
if ... (allowed_models is not None and model not in allowed_models):   # dead
```

The only production caller — `delegation.py` `run` (the single call site; `grep`
confirms no other) — invoked it as `validate_run_arguments(arguments, roster=roster)`,
i.e. `child_limits=None` ⇒ **both branches never fired in production**. The existing
`test_subagents.py` proved them only by *hand-stuffing* `child_limits`, so the seam
was green while the path was dead (the OF-14 "门只走一条腿" shape: prior cases
101/098/117/120, and 135 which just closed this session).

## The fix (production call site, in write-path `execution/**`)

`run` now computes `child_limits` from the requested child before validation:

| Dimension | Derived from | Rule (narrow-only) |
| - | - | - |
| `permissions` | the child Profile row's `permission_preset` | a caller may still name a preset at-or-narrower-than the child's own: `plan` is narrowest, `default` wider. `plan` child ⇒ ceiling `["plan"]`; any other (incl. unset) ⇒ `["default","plan"]`. |
| `models` | the child's frozen config object at its family `model_control_id` (via `self.registry` + `self.objects`) | the child's own pinned `modelId`s are the allowed set. **If the family declares no model slot, or the child pins none, `models` is omitted (unchecked)** — a child that declares no models is never over-rejected. |

The requested name is looked up in the *authorized* roster only to source limits; an
unknown/unauthorized name yields `None` and is refused by `validate_run_arguments` for
that reason (never mis-labelled as a widening). Sourcing can therefore never leak a
child the caller may not call. The model lookup is fully defensive (`try/except → None`).

## Gate (`tests/server/test_child_limits_production_path_136.py`)

All cases drive the real `DelegationService.run` (never a hand-built `child_limits`):

* G1/G2 `test_permission_widening_is_rejected_on_the_production_path` — child on `plan`,
  run with `permission="default"` ⇒ `SUBAGENT_PERMISSION_WIDENED`.
* G1/G2 `test_model_widening_is_rejected_on_the_production_path` — model-pinned child,
  run with a different `model` ⇒ `SUBAGENT_MODEL_WIDENED`.
* G3 `test_permission_tightening_is_still_accepted_on_the_production_path` — child on
  `default`, run at `plan` ⇒ completes.
* G3 `test_pinned_model_is_accepted_and_unpinned_child_is_not_over_rejected` — the child's
  own model passes; a child with no pinned model is never rejected for a model request.
* `test_counterexample_the_dead_low_seam_this_order_resurrects` — records *why* the
  manual-seam tests were green: `validate_run_arguments` with no `child_limits` ACCEPTS
  the same widening the production path now refuses.

**Load-bearing proof** (ran in-tree, then reverted): making the production call source
`None` (today's shape) reddens exactly the two production-widening tests while the
tightening / no-over-reject / low-seam witnesses stay green.

## G4 — zero weakening

`validate_run_arguments`, both `DelegationError` codes, and the "only narrow" rule are
byte-for-byte unchanged; the change is purely that the caller now supplies the data the
existing checks already expect.

## OF-14 self-check (is there a remaining neighbor?)

`validate_run_arguments` has exactly one production caller and it is now wired. No other
narrowing seam sources limits from an omitted default in this path. Recorded so a 6th
same-shape regression has a named place to look.
