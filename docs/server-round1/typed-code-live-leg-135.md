# Order 135 — the typed code must reach the *live* leg (`CREDENTIAL_NOT_AVAILABLE` no longer collapses to `EXECUTION_FAILED`)

## Verdict

`TYPED_CODE_ON_LIVE_LEG_DONE`. The credential failure's typed code now travels
**structurally** (as a `code` attribute on the raised Dispatch) to the user-visible
`execution.state.reason`, and the gate drives the whole real leg rather than only the
low seam.

## A's read (confirmed first-hand, then reproduced in-tree)

A (轮 4, `d8fba5a` / `a-e2e-runtime-probe.json`) observed on a **later tree than 120's**
that the transcript still read the generic code even though the log contained
`RuntimeError: CREDENTIAL_NOT_AVAILABLE`. A explicitly framed this as a **read of the
layering**, not "120 was wrong": 120 is correct *at its two seams*; what was missing was
the one leg the user actually sees.

## Layer map — where the code is produced and where it was swallowed

| # | Layer (file:line) | Role for the credential code | Before 135 | After 135 |
| - | - | - | - | - |
| 1 | `storage/secrets.py` `SecretLocatorUnavailable.code` | **produces** the typed code (`120`) | `CREDENTIAL_NOT_AVAILABLE` on `.code` | unchanged |
| 2 | `bootstrap/runtime.py:855` `port_factory` | re-raises `RuntimeError("CREDENTIAL_NOT_AVAILABLE") from exc` (`120`) | code survives only as **whole-message text** | unchanged (bootstrap not in this order's write-path) |
| 3 | **`work_core/services.py` `dispatch_execution` wraps `provider.start`** | stringify into `DispatchAmbiguous` | **the code identity is LOST** — `f"{type(exc).__name__}: {exc}"` puts it in a sentence; `_safe_code` reads `.code` only off `ExecutionStartRejected` | **NEW**: `_dispatch_error_code(exc)` re-attaches the code as `error.code` before raising, at all three wraps (input-resolve `DispatchFailed`, `ExecutionStartRejected` `DispatchFailed`, `Exception` `DispatchAmbiguous`) |
| 4 | `server/execution/sidecar_backend.py:287` `fail_turn(turn_id, _safe_code(exc))` | **consumes** the raised Dispatch into a turn `error_code` | sees `DispatchAmbiguous` with no `.code`, sentence `...: RuntimeError: CREDENTIAL_NOT_AVAILABLE` fails the pure-code regex → `EXECUTION_FAILED` | `_safe_code` reads the top-level `.code` → `CREDENTIAL_NOT_AVAILABLE` |
| 5 | `server/wire/projection.py:217` `execution.state` `reason = error_code` | **projects** the turn row to the wire event the client reads | `reason = EXECUTION_FAILED` (A's 3/3) | `reason = CREDENTIAL_NOT_AVAILABLE` |

The fix is at layer 3 only: the wrap stops being a *stringifier* and becomes a
*conduit* for the code that layers 1–2 already carry. Layers 4 and 5 were already
correct and needed no change — this is layering, not a new producer.

## Why 120's gate did not catch it (the "门只走一条腿" root cause)

`tests/server/test_credential_missing_typed_120.py` fed a **hand-built** typed error
straight into `_safe_code`, so it verified layers 1+4 in isolation but never crossed
layer 3 — the very place the code was being dropped. Order 135's gate closes that gap.

## Gate (`tests/server/test_typed_code_live_leg_135.py`)

Every case is fed the exception produced by a **real** `ExecutionService.dispatch_execution`
(provider `start()` raising), then mapped by the same `_safe_code` `sidecar_backend:287`
calls and projected by the same wire `_event_body`:

* `test_missing_credential_code_reaches_execution_state` — G1+G2: `SecretLocatorUnavailable`
  → `DispatchAmbiguous.code` == `CREDENTIAL_NOT_AVAILABLE` → `_safe_code` → projection
  `reason` == `CREDENTIAL_NOT_AVAILABLE`.
* `test_port_factory_converted_runtime_error_reaches_execution_state` — the exact
  `RuntimeError("CREDENTIAL_NOT_AVAILABLE")` shape A's log shows, same result.
* `test_counterexample_stringify_only_wrap_still_gives_generic_reason` — a Dispatch that
  carries the code **only as message text** (the pre-fix shape) → `EXECUTION_FAILED`.
* `test_truly_unknown_failure_stays_generic` — `RuntimeError("worker vanished at 03:14 …")`
  (a sentence) → no `.code` attached → `EXECUTION_FAILED` (G3, generic preserved).
* `test_leg_carries_zero_credential_content` — id present, no secret bytes anywhere (G4).

**Load-bearing proof** (ran in-tree, then reverted): deleting the three
`error.code = code` attaches reddens exactly the 3 real-leg cases while the two
generic/counterexample cases stay green.

## Unknowns / boundaries respected

* No `wire/**`, `protocols/**`, `bootstrap/**`, or Worker contract touched — the fix is
  entirely in `work_core/services.py` (this order's write-path) plus the test.
* `DispatchFailed`/`DispatchAmbiguous` constructors and callers unchanged: only an
  optional `code` attribute is set on the raised instance — the attribute `_safe_code`
  already reads.
* Truly unknown failures keep the generic `EXECUTION_FAILED`; nothing was renamed.
