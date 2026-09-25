# LNX-002 — ruling acknowledgement and the two limited repairs

I's `control/LNX-002-runtime-ruling.md` (2026-09-21) decided the open question from
`repairs.md` §4 and refused the "the reason is lost today" characterisation from §5. Both
limited repairs are implemented, on the same two candidate trees, with the merges kept. The
ACK itself is recorded in `status.md`; this file is the implementation and test evidence.

New checkpoint: backend **`9ba5d1f617193715c18227931758b854f9db3448`** (desktop unchanged at
`80872f556c001b42217d43bf5f73ab08029bfcb9` — both repairs are backend-side).

---

## Decision 1 — the error is mapped by execution stage, not by code string

### What was wrong

`DispatchAmbiguous` means one thing: *we cannot assert whether the start and its side effects
happened*. Order 135 (`work_core/services.py:_dispatch_error_code`) re-attached a typed
`.code` to that wrapper so it would survive the stringify, and `_safe_code`'s blanket
`getattr(exc, "code")` fallback then published it. So a **post-open** `SidecarError` that
merely reused the pre-start string `CAPABILITY_REQUIREMENT_UNSATISFIED` was published as if it
were a pre-start refusal — a claim about a stage that the ambiguous stage explicitly cannot
make. I's decision: keep the uncertainty, keep 135's diagnostics, decide by **stage /
trusted error type**.

### The fix

Three small changes, all at the execution boundary; **Work Core is untouched**:

1. `PRE_START_REFUSAL_CODES` — the codes a *pre-start refusal owns*
   (`CAPABILITY_REQUIREMENT_UNSATISFIED`), documented as the vocabulary of
   `CapabilityGateRefusal`, the only type that may make a pre-start claim.
2. `_safe_code` — for a `DispatchAmbiguous` carrying one of those codes, publish the
   generic `EXECUTION_FAILED` and keep the original cause on the chain and on the log. The
   walk for `ExecutionStartRejected` still runs first, so a genuine pre-start refusal is
   still published with its own code and never reaches this branch. **Every other
   post-open code is still published** — order 150's `HARNESS_LAUNCH_FAILED` /
   `HARNESS_SESSION_UNAVAILABLE` are exactly the diagnoses a client needs, and they are
   not stage claims.
3. `SidecarRunRecoveryFailure(SidecarError)` — the run-recovery path
   (`_prompt_with_rebuild`) now raises this typed failure instead of a bare `SidecarError`,
   so `SIDECAR_REBUILD_FAILED` is diagnosable **by type** rather than by a global
   allowance of a same-named string.

`DispatchAmbiguous` keeps its ledger classification and its idempotent-replay semantics, is
never promoted to a pre-start refusal, and no similar-looking code licenses an automatic safe
retry. No new error model, no public wire change.

⚠️ **A first attempt at this was too broad and is recorded here because the correction is
the point.** Suppressing *any* code inherited from a post-open `SidecarError` also killed
order 150's `HARNESS_LAUNCH_FAILED` (adapter cannot start) — caught by
`test_sidecar_upstream_cause_150.py` in the full suite, not by the targeted set. The rule was
narrowed to the pre-start refusal's own vocabulary, and that case passes again. The narrower
rule is the one that matches the ruling's wording: decide by stage and by the type that owns
the claim, not by a global string list.

### The controls, all green

| Control | What it pins | Result |
| --- | --- | --- |
| `test_public_post_open_error_with_the_same_code_keeps_ambiguous_semantics` | post-open same-name code → `EXECUTION_FAILED`; **the strict `xfail` is removed and it passes on its own terms**, expectation never changed | pass |
| `test_public_dispatch_records_capability_refusal_as_a_failed_start` | pre-start refusal keeps its typed code (the same string, the other stage) | pass |
| `test_sidecar_upstream_cause_150.py` (all) | a post-open failure still reports its *own* diagnosis: adapter cannot start → `HARNESS_LAUNCH_FAILED`, unknown session → `HARNESS_SESSION_UNAVAILABLE`, two faults never read alike, no OS error text leaks | pass |
| `test_an_unresolvable_placement_is_a_typed_refusal_not_an_ambiguous_dispatch` | the order-090 pre-start conversion still holds | pass |
| `test_rebuild_is_bounded_and_typed_when_sidecar_stays_closed` | `SIDECAR_REBUILD_FAILED` still diagnosable through the typed recovery failure | pass |
| `test_typed_code_live_leg_135.py` (all) | 135's diagnostics: `SecretLocatorUnavailable` and `RuntimeError("CREDENTIAL_NOT_AVAILABLE")` still reach the leg; stringify-only wrap and truly-unknown still generic; no credential content on the leg | pass |
| `test_concurrent_same_request_id_accepts_exactly_one_execution`, `test_create_and_send_accepts_once_and_replays_the_same_execution` | first dispatch **and** same-`requestId` replay do not double-start | pass |

The string-based rule is deliberately **not** used: the same string published from a genuine
pre-start refusal is correct, and that path is decided by `ExecutionStartRejected`, not by the
text.

## Decision 2 — the ACP `stopReason` is carried for real

### The loss point (I's finding, confirmed and located)

- `worker-entry.mjs`'s two branches both `return result ?? {done:true}`, so it *would* forward
  a result — it was being handed `undefined`.
- `promptAndWait` resolved with **no value** on its success path.
- and the value never existed: `#startTurn` fired the ACP request as
  `void this.#acp.request("session/prompt", …)` and **dropped the response**, which is the
  JSON-RPC result carrying `{stopReason}`.

So the loss was one layer below `worker-entry`, exactly as I said: no field added above could
recover it.

### The patch (minimal, vendored bridge, registered)

`third_party/harness_remote/bridge/src/acp-service.js`, marked in-file with
`PATCH (AgentBox LNX-002)` and registered as **`PATCHES.md` §4**, with `SOURCE.json`'s
`patched_sha256` updated to
`51f3b4e6998a2ce9505ce6833c8e38cfa7d3e12444f61388e9f2672b9e202448` — the repo's existing
third-party patch convention.

- `#turnResponses` stores the response under `${sessionID}:${generation}`, using **the same
  generation guard the failure and `finally` paths already use** (`#turnGenerations`). A turn
  whose generation has moved on — cancelled, superseded — stores nothing.
- `promptAndWait` resolves with the **finished** generation's response, taken once
  (`#takeTurnResponse`). Bound by generation on purpose, so cancel, same-session queueing and
  two Sessions at once cannot cross-contaminate a reason.
- `#startTurn` drops responses left by an earlier generation, so nothing accumulates.

**The upstream value is preserved verbatim**: no `stopReason` is synthesised, no absent field
is filled in, a missing field stays missing, and the special paths keep their own reasons.

### Coverage — fixture ACP → bridge → `worker-entry` → Python completion → DB/wire

| Case | Assertion | Result |
| --- | --- | --- |
| `max_tokens` | the port's prompt result is `{"stopReason": "max_tokens"}`; `_terminal_reason_from_result` reads it; the real `complete_turn` persists it; the projection's `reason` is `max_tokens` | pass |
| `end_turn` control | result is `{"stopReason": "end_turn"}`; nothing persisted; **no `reason` key at all** on the projection | pass |
| two consecutive turns, different terminal states | knob `"max_tokens,end_turn"`: turn 1 → `max_tokens`, turn 2 → clean. If a reason were cached or taken from the wrong generation, turn 2 would inherit turn 1's truncation | pass |
| knob blast radius | the cancel, abort, silent-success and permission paths keep their own reasons (asserted against the peer source), so selecting `max_tokens` cannot retell a user's stop as a truncation | pass |
| cancelled turn | a cancelled/superseded generation stores nothing, so the leg keeps its absent semantics rather than borrowing a reason | covered by the generation guard + the source-level control; **not** driven as an in-flight cancel — recorded as such rather than implied |

The previous characterisation case (`assert returned == {"done": True}`) is **gone**; it was
replaced by these target-behaviour regressions, and the failure cause is kept as the docstring
of the repaired case.

**Scope, unchanged and not overstated:** the fake peer is what this seam is exercised with.
How the *real* harnesses report truncation is still a later verification question.

## Evidence

```
pytest -q tests/server/test_harness_sidecar.py \
          tests/server/test_terminal_reason_consumer_134.py \
          tests/server/test_typed_code_live_leg_135.py
  109 passed, 6 skipped   (VERDICT=PARTIAL_HOST_TOOLS_ABSENT — the 6 skips are the
                          worker-artifact gates, accounted separately)
```

Full offline suite and the desktop projects are in `source-checkpoint.md` §4, revised for this
checkpoint. Tool/artifact preparation gaps stay accounted separately, and
`PREPARATION_GAPS` still does **not** promote a platform with missing artifacts to ready.

## Still open after this ruling

- real-harness truncation reporting (needs a real harness round, explicitly out of scope here);
- the desktop media and Linux SecretStore scopes, untouched by instruction.
