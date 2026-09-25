# LNX-002 — status

**State: RUNNING**

- Task: `control/tasks/LNX-002-integration.md`
- Executor: user-launched DeepSeek session (mcode), session id `mvs_703b173a0a3b432c8746c6d3c0a6f31c`
- Authority: D-0018, D-0020; review constraints in `control/LNX-001-review.md`
- Started: 2026-09-21T17:58+08:00
- Scope: create worktrees `integration-linux/backend` and `integration-linux/desktop`,
  each on new branch `integration/linux-native-0`; integrate service (backend) and
  settings (desktop) into runtime / chat bases; unify cross-repo protocol from its
  generation source; run targeted tests; produce source checkpoint with full SHAs.
- Writer: sole writer for the two candidate trees. Writes to
  `control/reports/LNX-002/` only.

Progress notes are appended below as the run advances.

## ACK — `control/LNX-003-review.md` (I's execution supplement)

**ACK 2026-09-21T18:40+08:00.** I read `control/LNX-003-review.md` in this session before
continuing, and it supersedes the corresponding LNX-001-review judgements. Working
consequences I am adopting, and what each changes in what follows:

1. **Media** — do not block Linux local-session integration on it and do not refactor the
   remote media system. Since I took the managed URL, I **must add a PNG regression case
   that runs URL generation through the handler and measures whether it is 415**. If it is
   pre-existing debt I name the affected mode and the repro and **do not claim the path
   passes**. I am **not** authorized to widen the streamable-type allow-list, CSP or scheme
   privileges to make a test green. The two contradictory URL-literal assertions do **not**
   both have to be kept: keep the behaviour/safety invariants, record why the superseded
   assertion was retired, and cover the real handling chain.
2. **stop reason** — verify the existing ACP `result` → JS pass-through → Python dual-spelling
   read channel with an **independent fixture mode** sending `max_tokens`: terminal state
   persisted and the wire reason. Keep the `end_turn` control and the existing cancel
   behaviour. Do **not** change a shared fixture default in a way that moves other cases'
   meaning. I will not claim real-harness truncation is solved, nor infer from an undeclared
   remote-Worker schema that the local channel cannot carry it.
3. **Config** — a "no entry point across 64 wire methods" finding does **not** mean the
   product has no credential-entry chain. Offline verification must include (a) the
   **default Linux composition refusal path with no explicit store injected** and (b) a
   **synthetic non-secret record re-open read**; a `MemorySecretStore`-injected test cannot
   substitute for a persistent implementation. A new SecretStore implementation stays a
   later runtime task.
4. **backend main** — keep it un-absorbed. Its unique plugins / same-path differences get
   registered, and the checkpoint must state plainly that main's batch of work is **not**
   absorbed. 171/122 are the report's measurements, not 171 mergeable features.
5. **Evidence strength** — "holds across restart", "never tested" and similar phrasing stays
   bounded to the code/tests I actually inspected. Missing redirect options do not prove a
   cross-origin `Authorization` leak; that needs a local fixture. An unregistered scheme
   privilege does not by itself imply a privilege must be added.

## ACK — `control/LNX-002-review.md` (I's initial review, seven repairs)

**ACK 2026-09-21T19:0x+08:00.** I read `control/LNX-002-review.md` in this session and
executed all seven limited repairs on the same two candidate trees, keeping the existing
merges. The review file was not rewritten and the earlier reports are kept for
traceability; the revisions, evidence and corrections are in **`repairs.md`**. In brief:

1. **False green — fixed.** The terminal summary computed the failure count and dropped it
   before `render()`, so a run with three failures still printed `GREEN_NO_SKIPS`. Counted
   now, collection errors included; new regression drives the real hook and two subprocess
   probes (failing test, uncollectable module) asserting verdict and exit code agree.
2. **Skip-scan false positive — fixed at the identifier**, not at the value: the guard is a
   negative lookbehind so `terminal_reason="max_tokens"` no longer matches while every real
   `pytest.skip/skipif/importorskip` guard is preserved.
3. **Artifact absence — named.** `PREPARATION_GAPS` registers each missing artifact with the
   preparation step it waits on; 118 asserts the register equals the measured absence in both
   directions. No artifact was copied in to manufacture a pass.
4. **Sidecar case — real cause found and handed over.** It *does* reach `open_execution`; the
   cause is the runtime line's order 135 re-attaching a typed `.code` to the
   `DispatchAmbiguous` wrapper (service line leaves it `None` and passes). The lift is
   load-bearing (order 106's `SIDECAR_REBUILD_FAILED` at `:1503` needs it), so two tested
   intents collide. The expectation is **unchanged**; the case is registered as a strict
   `xfail` with the evidence, plus a companion pin, and the decision is handed to I.
5. **Truncation chain — driven, and the measurement is the finding.** The fixture peer emits
   `stopReason`; the **JS boundary drops it** (`port.prompt()` returns `{"done": True}`), so
   `worker-entry.mjs` still has to emit it — the approval-gated change order 134 names. The
   Python leg is verified end to end; the JS half is pinned as a gap and not claimed.
6. **Report/reproduction — corrected.** SHAs pinned directly in `source-checkpoint.md`; the
   failure arithmetic recomputed (19 environment + 2 proven pre-existing = 21, plus 1
   registered divergence), and the reduction is *not* offered as proof that all 13 were
   merge-introduced. Added `apps/desktop/scripts/generate-wire-contract.mjs`; `--check`
   reports the artifact current and regeneration is a byte-identical no-op.
7. **Candidate instructions — converged.** Both trees' `AGENTS.md` now open with a
   historical-vs-current banner naming `ordessa/control/` as the authority and marking the
   old scheduling entrances as history; the source text is kept verbatim and the
   still-applicable engineering constraints are restated.

## ACK — `control/LNX-002-runtime-ruling.md` (I's ruling, two limited repairs)

**ACK 2026-09-21T19:2x+08:00.** I read the ruling in this session and am executing both
limited repairs on the same two candidate trees. Recorded understanding:

**Decision 1 — keep the uncertainty; an error code must not stand in for an execution
stage.** Not "publish any typed code", and not "delete order 135's diagnostics".
`DispatchAmbiguous` still means *cannot assert whether start/side effects happened*, so it
keeps its ledger classification and idempotent-replay semantics, is never upgraded to a
pre-start refusal, and a similar-looking code never licenses an automatic safe retry.

- pre-start refusals that are genuinely `ExecutionStartRejected` keep the existing typed
  rejection;
- a **post-open** ordinary exception carrying `CAPABILITY_REQUIREMENT_UNSATISFIED` still
  publishes `EXECUTION_FAILED`; the original cause stays in the exception chain / controlled
  diagnostics, and no secret is printed;
- `SIDECAR_REBUILD_FAILED` and its family, produced by a concrete run-recovery path, must
  stay diagnosable. Public semantics are decided by **stage / trusted error type**, never by
  globally allowing a same-named string;
- **Work Core gains no provider/harness-specific judgement** — the mapping happens at an
  appropriate execution boundary;
- must prove first dispatch *and* same-`requestId` replay do not double-start, keep the
  pre-start / post-open same-code control and the rebuild-failure control, then **remove the
  strict `xfail` and deliver with actual passes**. Limited fix to the current error mapping;
  no new error model, no public wire change.

**Decision 2 — fix the ACP result loss; do not settle for a "it is lost today"
characterisation test.** I's finding is adopted: both `worker-entry.mjs` branches
`return result ?? {done:true}`, and the ACP branch's `acp-service.js:1246` `promptAndWait`
resolves with **no value** on the success path, so a field added in `worker-entry` alone
cannot recover the real reason. The loss point between the ACP `session/prompt` response and
the current turn's completion notification must be located and fixed.

- authorized: a **minimal patch in the existing vendored bridge/adapter layer**, registered
  the way this repo already records third-party patches;
- must **preserve the upstream original `stopReason`**, never guess an absent value, and the
  result must be **bound to the actual turn/generation** so cancel, same-session queueing and
  multi-session concurrency cannot cross-contaminate reasons;
- no new harness, no re-writing the integration, no real model calls;
- coverage: real ACP fixture → bridge → `worker-entry` → Python completion → DB/wire, for
  `max_tokens`, `end_turn`, `cancel`, and **two consecutive turns with different terminal
  states**, plus the necessary exception/concurrency controls. A missing field keeps the
  existing unknown/absent semantics — nothing may fabricate `complete`;
- the "the result is `done:true`" characterisation case becomes a target-behaviour
  regression, with the failure cause kept as an explanation;
- real-harness truncation reporting still awaits later verification.

**Also noted:** the xfail/attribution is not a fix and will not be reported as one; tool and
artifact preparation gaps stay accounted separately and `PREPARATION_GAPS` must not promote a
platform with missing artifacts to ready; no repo-wide archaeology, and no expansion of the
desktop media or Linux SecretStore scope.

## Progress

1. 2026-09-21T17:58 — task read, RUNNING landed.
2. 2026-09-21T18:05 — inputs registered (`input.md`). All four source HEADs matched the
   task exactly (zero drift). No pre-existing `integration/*` branch or
   `worktrees/integration-linux/` path.
3. 2026-09-21T18:06 — both worktrees created on `integration/linux-native-0`.
4. 2026-09-21T18:12 — backend merge committed `e393812` (parents `a7b7b6ff` + `003b52b2`).
5. 2026-09-21T18:20 — desktop merge committed `0aa7a945` (parents `08b4eac7` + `01083212`).
6. 2026-09-21T18:31 — cross-repo protocol converged at the generation source; artifact
   regenerated; declared backend gate 37/37; relock bookkeeping executed (65/65).
7. 2026-09-21T18:52 — desktop gate green after the contract's fixture follow-through
   (`vitest --project ui`: 8230 passed, 0 failed; `tsc` clean).
8. 2026-09-21T18:56 — LNX-003 items 1–3 executed (PNG seam measured; truncation reason
   driven through the projection; default-Linux composition + reopen read).
9. Full offline suite at the final state: **1237 passed, 24 failed, 33 skipped**
   (was 1224/37/33 before this task's fixes). All 24 are classified in
   `source-checkpoint.md` §4.3.

## State

**REVIEWABLE SOURCE CHECKPOINT** — see `source-checkpoint.md`. It is a source
checkpoint, **not** an acceptance and not a runnable end-to-end demonstration.

| Tree | Branch | HEAD (full SHA) |
| --- | --- | --- |
| backend | `integration/linux-native-0` | `4f4587afb5a74b7e9e22435335809b7772f0d3ea` |
| desktop | `integration/linux-native-0` | `99a9d09f539aef9ace5cc5eca60458d3980d7778` |

Both worktrees report a clean status; both source lines are ancestors of the heads
(verified with `git merge-base --is-ancestor`). Nothing outside the two candidate trees and
`control/reports/LNX-002/` was written; `control/` itself was **not** committed, because it
carries I's own uncommitted work.

