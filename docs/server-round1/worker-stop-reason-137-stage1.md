# Order 137 — stage 1 observation: `stopReason` producer side (Worker contract → Server)

Purpose of this page: the order's **stage 1 deliverable** ("一手确认今天'完成事件无 stop
reason' + 列两道守卫的现状"), plus the feasibility read that decides whether stages 2–5
can be landed here or hand back. This is observation only; **no source changed yet**.

## Where the completion result lives (first-hand)

The Worker's turn completion is a `ProcessRecord` (`workers/agent-box-worker/src/main.rs`):

* `ProcessOutcome { record: ProcessRecord, stdout, stderr }` — struct field `record` at
  `main.rs:98`, constructed at `main.rs:1160`, produced by `run_process(...)` (`:403`).
* Emitted to the Server as the terminal frame payload `"result": outcome.record`
  (`main.rs:509` `process.terminal`) and as `{"status":"terminal","result":record}`
  on `result.get` (`main.rs:423`); persisted via `serde_json::to_vec(&outcome.record)`
  (`main.rs:1264`).
* This is exactly the object `sidecar_backend._complete` reads as `run.result`; order 134
  already routes it through `_terminal_reason_from_result(run.result)` into
  `complete_turn(..., terminal_reason=...)`, and `wire/projection.py:173` projects
  `reason = terminal_reason or error_code`. **Downstream (Server/wire) needs no new field.**

## "No stop reason today" — confirmed, not inferred

`grep` of `workers/**/src/*.rs` for `stopReason|stop_reason|finish_reason|end_turn|max_tokens|
PromptResponse` ⇒ **0 hits**. The ACP launcher does emit a machine-readable stop reason in its
`PromptResponse`/`message_delta` frames, but the Worker never parses or projects it into
`ProcessRecord`. This matches `122` §1 (A's T6 key scan: `trunc|stop|finish|max|cap` → 0) and
`122`'s `PARTIAL`.

**Feasibility condition for stage 2 (must-not-guess):** the Worker must *observe* the stop
reason on the ACP stdout stream it already reads; it must not default or infer it. Stage 2
therefore has to (a) parse the ACP `stopReason` in `run_process`'s output handling, and (b)
add it as an optional `ProcessRecord` field populated **only** when actually seen. If the ACP
frames do not carry a usable value on the observed path, the honest outcome is hand-back
(Notes: "拿不到 ⇒ 交回，别填默认值"). This must be verified against the real ACP transcript in
stage 2, not assumed from this page.

## The two named guards — status (both SAFE for this change)

`R-0055` declined the schema change because it collided with two guards. `R-0064` approves
facing them head-on. First-hand status for an **additive, outbound, version-neutral** field:

| Guard | What it actually checks | Impact of adding an outbound `stopReason` |
| - | - | - |
| `test_the_control_protocol_is_named_in_both_sources` (`test_state_capture_error_boundary.py:252`) | Rust `protocol.rs` `PROTOCOL_VERSION: u32` == Python client `PROTOCOL_VERSION`. It inspects **only the version constant**, never result fields. | **None** — 137 is 只增不改 and does **not** bump `PROTOCOL_VERSION`; both sides stay equal. |
| `Bootstrap(deny_unknown_fields)` (`protocols/worker/v1.schema.json`) | `additionalProperties: false` on the **inbound** request root (`:6`) and the `bootstrap`/`executables`/`runtimeArtifacts` defs (`:75/128/152`). | **None** — `stopReason` is on the **outbound** completion result, a payload this request/bootstrap schema does not describe. There is no result-side `additionalProperties:false` to trip. |

Conclusion: the guards are **not** structurally threatened by an additive outbound field that
leaves the protocol version and all inbound shapes untouched. No guard-based hand-back needed;
stages 2–5 are open, gated on whether stage 2 can observe a real ACP value.

## Contract surface (what stage 2 touches, 只增不改)

* `protocols/worker/**`: the result object has **no JSON-schema here** (this file is
  request/bootstrap only). If a result-side contract exists (golden/`README`), it gains one
  optional `stopReason` with `enum: ["end_turn","max_tokens","max_turn_requests","refusal"]`
  (ACP's existing four values — **not invented**, no default). Otherwise the contract is the
  `ProcessRecord` serde shape itself.
* `workers/**`: add optional `stop_reason` to `ProcessRecord`; populate from the observed ACP
  stop reason only.
* `sidecar.py` / `sidecar_backend._complete`: 134's `_terminal_reason_from_result` already
  consumes a stop reason on `run.result`; stage 3 confirms the key it reads matches what the
  Worker now emits (the two sides must agree on `stopReason`), with the 134 absent-safe
  semantics unchanged.

## Remaining stages (not started)

2. schema + Worker真填值 (verify ACP observability first) · 3. sidecar parse alignment ·
4. real-chain gate (worker→sidecar→`_complete`, both `max_tokens`/`end_turn`) + counterexample ·
5. **102 ternary meta-gate recompute** + guard confirmation + accounts. The real-binary leg
needs the built Worker (source + `cargo` are present here; prebuilt `target/{release,debug}`
are not, per the standing env reds) — stage 4 must be validated against an actual built Worker
or the real-chain leg is reported as env-blocked, not skipped silently.
