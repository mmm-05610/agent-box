# Order 150 — stage 1: where the upstream cause is lost, measured (not assumed)

Verdict for this stage: `SIDECAR_CAUSE_TRANSPORT` **in progress**. ops's three line
citations hold verbatim (re-read first-hand, below), and driving the real Worker
corrects one premise the order carried: the Worker does **not only** collapse into
`SIDECAR_OP_FAILED` — it also puts a raw Node **errno** on the wire as if it were a
product code, and a non-ACP adapter leaves the op **unanswered** until the server's
own timeout ends it. Three different faults, three different (bad) outcomes.

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
