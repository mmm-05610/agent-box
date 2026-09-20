# Order 150 — stage 1: where the upstream cause is lost, measured (not assumed)

Verdict for this order: **`SIDECAR_CAUSE_TRANSPORT_PARTIAL`** - not because the mechanism is
missing (two first-hand fault classes now reach the client as two different codes, and the
errno-as-code leak is closed), but because **only `HARNESS_LAUNCH_FAILED` and
`HARNESS_SESSION_UNAVAILABLE` were reproduced end-to-end**. `HARNESS_CHANNEL_DEAD`,
`HARNESS_OP_UNSUPPORTED` and `HARNESS_CREDENTIAL_UNAVAILABLE` are classification branches
written against the shapes named in the order, and no run of mine has yet produced each one
from a real fault - so claiming them green would be the decorative-gate shape this round is
supposed to remove. Exact remainder is in §6.  The `recovery_pending`-style "is the branch
reachable?" question is left open on purpose.

0 real model calls, 0 credential content; every fault is produced by the existing
controlled fake peer (`tests/harness_remote/fake_acp_peer.mjs`) or by a deliberately
unlaunchable command. Re-runnable: `node docs/server-round1/probes/sim150_upstream_cause_collapse.mjs`.

## 1 ops's citations, re-read first-hand (`OF-02`)

| Cited | Holds? | What is actually there |
| --- | --- | --- |
| `worker-entry.mjs:341-347`, `:345` the fallback | ✓ | `code: error?.code ?? "SIDECAR_OP_FAILED"`, `message: safeText(error?.message ?? error, 500)` |
| `sidecar.py:1046-1056` | ✓ | `request()` raises `SidecarError(str(error.get("code",…)), str(error.get("message","")))` — and the **same shape again at `:1062`** for a answered-but-`ok:false` reply, which is the leg the user hit |
| `sidecar_backend.py:584-590` | ✓ | `code = _safe_code(exc)` … `self.records.fail_turn(run.turn_id, code, …)` |
| `sessions/repository.py:983-1023` | ✓ | `error_code=code[:128]`; the `turn.state` / `turn.capture` event bodies carry `{state, error_code}` and **no** message slot |
| `sidecar_backend.py:952-970` | ✓ (ends `:973`) | `_safe_code` keeps `exc.code` when it matches `[A-Z][A-Z0-9_]{2,127}`, else logs and returns `EXECUTION_FAILED`; comment: *"The typed event can only carry a code"* |

One correction to the order's framing: `safeText` (`worker-entry.mjs:100-104`)
already **redacts the credential value** and bounds to 500 — so "message 有界且已清洗"
is true at the source. The reason it must still not become the code is different and
stronger than "unbounded": the measured message for the launch fault is
`spawn /nonexistent/harness-binary-that-is-not-installed ENOENT` — **a filesystem
path**. Freeing text into a product field would put paths on the wire. Codes, not text.

## 2 Measured: three different upstream faults, three different (bad) results

| Upstream fault (all distinct, all real) | Worker's `code` on the wire | Worker's bounded `message` | What the product state ends up showing |
| --- | --- | --- | --- |
| `adapter` 起不来 — `launch.command` does not exist (spawn `ENOENT`) | **`ENOENT`** | `spawn /nonexistent/… ENOENT` | `error_code = ENOENT` — an internal errno passing `_safe_code`'s shape whitelist as though it were a product code |
| `adapter` 起来了但不是 ACP 服务（`/bin/true`，握手无应答） | *(no answer within 8 s)* | — | only `SIDECAR_TIMEOUT` from the server side; the Worker never reports a cause at all |
| harness 侧拒绝这一轮 — `prompt` on an unknown native session | **`SIDECAR_OP_FAILED`** | `Harness session not found` | one indistinguishable fallback code; the only discriminating fact (`Harness session not found`) is dropped at `sidecar_backend.py:584` |
| 受控对照：已经类型化的拒绝（未知 op） | `NOT_REGISTERED` | `NOT_REGISTERED` | passes through unchanged — proving the transport itself works when a code exists |

**Therefore the loss is two-headed, and the order named only one head.**
1. **At the Worker** (`:345`): `error?.code` is taken **blindly**. Anything that
   happens to have a `.code` — Node errnos (`ENOENT`, `EACCES`, `EPIPE`) above all —
   becomes a "product code"; anything with **no** `.code` (the harness's own refusals,
   which do carry a real message) collapses to `SIDECAR_OP_FAILED`. So the fallback
   is not merely a last resort, it is also **mis-sorted**: the faults that *do* have a
   code get a non-product one, and the faults that *do* have a cause get the fallback.
2. **At the ledger** (`:584` → `fail_turn`): by design only the code survives, so once
   (1) mislabels a fault there is nothing left to recover.

`HARNESS_NATIVE_HOME_UNDECLARED` (seen in `tests/server/test_delegation.py`, pre-existing
at this branch's HEAD) is the *good* shape: `envelopeError(code, detail)`
(`:37-41`) stamps `error.code`, so `:345` keeps it. That is the mechanism to extend, not
replace: **only** envelope-stamped codes may pass through as codes.

## 3 What this implies for stages 2-3 (so the design is on measured ground)

* **Stage 2 (Worker)**: distinguish "a code the glue deliberately assigned" from "a
  field that happens to be named `code`". Envelope errors get marked at their single
  constructor (`:37`); everything else is **classified** by its measured shape into its
  own typed code (`ENOENT`/`EACCES`/`ENOEXEC` → launch failed; closed/destroyed stream
  or `EPIPE` → channel dead; harness refusal with a session/continuation cause → session
  unavailable; credential missing/unusable → credential unavailable), with
  `SIDECAR_OP_FAILED` demoted to the true last resort. Names must satisfy the *existing*
  server whitelist `[A-Z][A-Z0-9_]{2,127}` — no new shape, no new key.
* **Stage 3 (server)**: measured above — `_safe_code` already passes a Worker code
  straight to `fail_turn` → `server_turns.error_code`, and `turn.state`/`turn.capture`
  already carry `error_code`. **So the "原因回传到产品状态" half needs no protocol
  change and no new event key: it is delivered by stage 2 giving a discriminable code.**
  If the product additionally wants *text*, that is a new event field and belongs to the
  ops field order (same family as `151`) — recorded here as the boundary, not built here.

## 4 What stages 2-4 changed, and how each gate was proved load-bearing

**Stage 2 - `plugins/agent-box-harnesses/runtime/worker-entry.mjs`.** The exit no longer
trusts `error?.code`; it calls `upstreamCauseCode(error)`, which keeps a code only when it
is a *product* code (shape `[A-Z][A-Z0-9_]{2,127}` **and** not an OS errno name),
translates the measured errno classes (`LAUNCH`: `ENOENT/EACCES/EPERM/ENOEXEC/EISDIR/ENOTDIR`
→ `HARNESS_LAUNCH_FAILED`; `CHANNEL`: `EPIPE/ECONN*/ECANCELED/ERR_STREAM_*` →
`HARNESS_CHANNEL_DEAD`), recognises the message-shaped causes it can name from measured text
(op-unsupported, credential-unavailable, `HARNESS_SESSION_UNAVAILABLE`), and only then falls
back to `SIDECAR_OP_FAILED`. `envelopeError`-issued codes are untouched, so
`NOT_REGISTERED`/`ALREADY_REGISTERED`/`UNKNOWN_OP`/`PROVENANCE_MISMATCH` and the native-driver
codes travel exactly as before.

**Stage 3 - no server change was needed, and that is a result, not an omission.** The
measured path `SidecarError.code → _safe_code → fail_turn → server_turns.error_code +
turn.state.error_code` was already faithful; the cause was being destroyed upstream. So this
order's server half is *zero diff*, zero protocol change, no new event key.

**Stage 4 - `tests/server/test_sidecar_upstream_cause_150.py`, 8 passed.** Drives the real
Worker over the real `SidecarEnvelope.request`, and the real `build_runtime` + `TestClient`
for the client-visible leg. Load-bearing was proved **without** reintroducing the defect in
this tree: the module was copied into a clean `git clone` at the pre-fix HEAD `3e68608` and
run there - **5 of the 8 gates go red**, including the user's own scenario read over HTTP:

| client-visible read of the failed turn | pre-150 (baseline clone) | with stage 2 |
| --- | --- | --- |
| `GET /api/v1/sessions/{id}` → `turns[0]["error_code"]` | **`ENOENT`** | `HARNESS_LAUNCH_FAILED` |

and the two-fault gate, the ledger/event gate and the no-leak gate each redden at baseline
for the same reason. The 3 gates that pass on both sides are the ones that do not depend on
classification (code shape, typed fallback, `WORKER_DISCONNECTED` ⇒ `unknown` routing) — kept
because G4 demands that routing stay byte-for-byte identical.

**One probe/gate detail worth keeping for the next reader**: `GET /api/v1/sessions/{id}/events`
is an SSE long-poll (`transport/http/app.py:302-323` loops on `notifier.wait_after`), so it
must not be pulled with `.json()`; it blocks. The terminal event is asserted off the ledger
instead, which is the row that stream serialises from.

## 5 Regression counts (this session, first-hand)

`PYTHONPATH=src:plugins/{agent-box-harnesses,agent-box-runtime-wsl,agent-box-runtime-local,
agent-box-sandbox-bwrap,agent-box-skills,agent-box-terminal-session}/src` —
`tests/server -k "sidecar or harness or capability or delegat or approval"`:
**278 passed, 3 failed, 13 skipped** (560 s). All three are accounted for, not waved away:
`test_sidecar_lease_keepalive::…five_seconds` = the known **Worker artifact absent** baseline;
`test_harness_sidecar::test_public_post_open_error_…` fails **identically in the baseline
clone** (`EXECUTION_FAILED` vs `CAPABILITY_REQUIREMENT_UNSATISFIED`) ⇒ pre-existing, reported
separately; `test_harness_sidecar::test_process_facts_land_in_the_ledger_and_wire` **passes in
isolation** ⇒ an ordering artifact of that `-k` selection, not a regression.
Node-side component gates: `sidecar_envelope` 4/4, `four_harness_component` 9/9,
`snapshot_seams` 12/12 pass. (`node --test <dir>` reports one synthetic failure **at baseline
too** — a directory-mode quirk, so run per file.)
**Worker 工件：不在。** `待 QA 复算`.

## 6 Exact remainder for `PARTIAL` (each with its unblock entry)

| Item | Why it is not green yet | Entry |
| --- | --- | --- |
| `HARNESS_CHANNEL_DEAD` | classified from the errno/stream names, but no run of mine has killed the read end **and** observed that code end-to-end | own a fault injector at the channel seam (the peer fixture is happy-path only: `fake_acp_peer.mjs` answers every method with `result:{}`, so it cannot produce this) |
| `HARNESS_OP_UNSUPPORTED` | the controlled peer never answers "method not found", so this branch is unmeasured | needs a peer that rejects one method — belongs with the probe/fixture face (A tree owns `probe.py` semantics) |
| `HARNESS_CREDENTIAL_UNAVAILABLE` | not reproduced; and the credential *identity* half is explicitly `149`/`151` (A line) | after `149` lands the identity, one injected missing-credential run closes it |
| Probe case ②: a non-ACP adapter leaves the op **unanswered** (only the server's `SIDECAR_TIMEOUT` ends it) | real, measured, and **not** this order's DoD — the Worker has no per-op deadline at the envelope layer | same family as `109`/`148` (a swallowed/absent failure must surface); hand to ops to route |
| Product-visible *text* for the cause | deliberately not built: it is a new event field ⇒ contract change, and `wire/**` is A-tree-owned | ops field order (`151` family), next re-lock window |
