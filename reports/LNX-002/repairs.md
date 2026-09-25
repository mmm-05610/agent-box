# LNX-002 — revisions after I's initial review

I's `control/LNX-002-review.md` (SOURCE_SNAPSHOT_VERIFIED / CHANGES_REQUESTED) listed seven
limited repairs. All seven were executed by the same writer, on the same two candidate
trees, with the existing merges kept. Nothing in `control/` was rewritten; the review file
is untouched and the earlier reports above are kept for traceability.

Revisions in commit order:

| Tree | Commit | Subject |
| --- | --- | --- |
| backend | `05dca5d` | repair items 1-4 (verdict plumbing, skip scan, artifact register, sidecar registration) |
| backend | `68390f9` | repair item 5 (ACP prompt leg, and what it does not carry) |
| backend | `e2fc58f` | repair item 7 (historical scheduling boundary in `AGENTS.md`) |
| desktop | `80872f5` | repair items 6-7 (reproducible generation entry, historical boundary) |

---

## 1. False green in the terminal summary — fixed

**Measured first.** Reproduced live: `1 failed` printed beside `VERDICT=GREEN_NO_SKIPS`, and
I saw `3 failed / 24 passed, exit 1` with the same green line.

**Cause.** `tests/conftest.py:pytest_terminal_summary` computed
`failures = len(terminalreporter.stats["failed"])` and then called `_presence_lines(presence)`,
which called `presence.render(classes)` — **the count was never passed on**. `verdict()`
itself was always correct (`failures` wins); the plumbing dropped the fact on the floor.

**Fix.** `_presence_lines(presence, failures)`; the count is threaded through, and
collection/teardown errors count too (`stats["error"]`), because a session that could not
even collect must not report the green verdict.

**Regression.** `tests/server/test_presence_verdict_lnx002.py` (new, 8 cases): the unit
axis, the hook driven with a fake reporter (the exact bug), and two **subprocess** runs
over a deliberately failing test and an uncollectable module, asserting the printed
verdict is `FAILED` *and* the exit code is non-zero. The subprocess loads the real conftest
as a plugin (`-p conftest` with `tests/` on `PYTHONPATH`) so it is the real hook, not a copy.

**No absence was converted to a skip**, and the summary was not hidden. Confirmed on a real
session: the full suite now ends `VERDICT=FAILED` with 21 failures.

## 2. Skip-scan false positive — fixed at the identifier

**Cause.** `artifact_presence.REASON_LITERAL` was `reason=\s*"([^"]+)"|pytest\.skip\(…)`,
so `terminal_reason="max_tokens"` — a `complete_turn` argument — matched the first
alternative at its tail and was read as a skip reason. That landed in `UNKNOWN`, turning
118's drift gate red on two ordinary tests (the old one at `:75` and the LNX-002 one at
`:105` — exactly the two sites I named).

**Fix.** A negative lookbehind on the identifier: `(?<![A-Za-z0-9_])reason=`. The guard is
on the *identifier*, not the value: no value is special-cased, so a genuine
`pytest.skip(reason="max_tokens")` still counts, and every real
`pytest.skip`/`skipif`/`importorskip` guard is preserved. Measured: 28 legitimate `reason=`
sites still match, the 2 `terminal_reason=` sites no longer do, and 118's
`test_the_declared_skip_reasons_are_all_classified_in_this_tree` is green.

## 3. Artifact absence — named as a preparation gap

**What it was.** `test_every_claimed_artifact_path_is_named_here_rather_than_inferred`
asserted *every* declared artifact is present. This tree is missing four:
`worker-debug`, `worker-release`, `worker-musl-dir`, `acp-npm-closure`.

**Fix.** `artifact_presence.PREPARATION_GAPS` registers each absent artifact with the
preparation step it is waiting on, and the test now asserts the register **equals** the
measured absence in both directions:

- an absence with no entry fails, so a new gap cannot slip in unregistered;
- an entry that is actually present fails, so the register cannot rot into a standing excuse.

**No artifact was copied in from another tree to manufacture a pass**, and the test still
asserts the report's declared list matches `ARTIFACT_PATHS`.

## 4. Sidecar case — real cause found, registered, handed to I

I's correction was right and is adopted: the test is **not** asserting `status=ready`. It
expects `EXECUTION_FAILED` and observes `CAPABILITY_REQUIREMENT_UNSATISFIED`
(`test_harness_sidecar.py:1057`).

**Did it reach `open_execution`?** Measured, by marking the impostor: **yes**, it is
reached. The capability gate does not refuse first.

**Real cause.** The exception reaching `_safe_code` is a `DispatchAmbiguous`:

| Tree | `DispatchAmbiguous.code` | leg answers |
| --- | --- | --- |
| service line `003b52b2` | `None` | `EXECUTION_FAILED` — the test passes |
| runtime line `a7b7b6ff` / merged | `'CAPABILITY_REQUIREMENT_UNSATISFIED'` | the raw code leaks — the test fails |

The difference is the runtime line's **order 135**
(`work_core/services.py:_dispatch_error_code`), which re-attaches a typed `.code` to the
wrapper so it survives the stringify. `_safe_code`'s blanket `getattr(exc, "code")`
fallback then honours it.

I's caution was correct: file identity alone did not settle this. Both lines have the test,
and the files involved (`_safe_code`, `SidecarError`, the call sites) are identical — so the
composed behaviour was measured instead, by extracting `feature/env-provider-runtime` and
`feature/env-provider-v1` into throwaway worktrees and running the case standalone against
each with the same interpreter.

**Why it is registered rather than fixed.** The lift is **load-bearing**: order 106's
`SIDECAR_REBUILD_FAILED` assertion at `test_harness_sidecar.py:1503` depends on it. Two
tested intents collide for the same mechanism — "a typed code should reach the leg" versus
"a post-open error reusing a pre-start code stays ambiguous" — so the resolution is a scope
decision, not an edit.

**What was done instead of changing the expectation** (which I forbade):

- the test's expectation is **untouched**, and it is marked
  `@pytest.mark.xfail(strict=True)` with the full evidence in the reason string, so it is
  neither a pass nor a silent red, and it turns red the moment either intent moves;
- a companion case pins the other side (`_dispatch_error_code` does lift the code), so both
  facts are asserted and the conflict is legible;
- handed to I: the two candidate resolutions are (a) narrow `_dispatch_error_code` to the
  typed pre-start seam and give `SIDECAR_REBUILD_FAILED` its own carrier, or (b) retire the
  ambiguity expectation for reused codes. Both change product scope; neither was taken here.

## 5. Truncation chain — driven, and the measurement is the finding

I asked for the reason to travel through the **real** ACP prompt return and the Python
completion path. It was driven, with a fixture ACP peer under `node` (no real model):

- the peer **does** answer an ordinary prompt with a machine-readable `stopReason`; a
  per-test environment knob now selects it (`AGENTBOX_FIXTURE_STOP_REASON`), default
  unchanged, and the silent-success / permission / abort / cancel paths keep their own
  reasons — the blast radius is asserted against the peer source;
- **the JS boundary drops it.** `port.prompt()` returns `{"done": True}`, not the ACP
  result, so `_terminal_reason_from_result(run.result)` can never see a reason.
  `worker-entry.mjs` still has to EMIT it — the separate, approval-gated change order 134's
  own docstring names. **The JS half is therefore not verified, and this checkpoint does not
  claim it is**; the gap is pinned as a characterisation case that goes red the day the
  emission lands;
- with a result that does carry the reason, the whole Python leg is verified:
  extractor → real `complete_turn` → projection, plus the `end_turn` control, plus the
  cancel state mapping.

## 6. Report and reproduction

- **SHAs pinned directly.** `source-checkpoint.md` §1 now carries the full HEAD of both
  trees (`e2fc58fb8e33774441994ff8cf1c663e2c2778c8`, `80872f556c001b42217d43bf5f73ab08029bfcb9`)
  instead of pointing at `status.md`.
- **Failure arithmetic recomputed** from the final run. It was 18 + 2 + 4; it is now
  **19 environment + 2 proven pre-existing = 21 failures**, plus 1 registered divergence.
  The count is exact against the printed list. The earlier summary is corrected rather than
  restated, and the before/after reduction (37 → 21) is **not** offered as evidence that all
  13 were merge-introduced: `source-checkpoint.md` §4.2 and this file attribute them
  individually, and two of the original 37 turned out to be pre-existing on the source lines.
- **Reproducible generation entry.** `protocol.md`'s `<tmp>/<gen.mjs>` description was not
  an entry point. Added `apps/desktop/scripts/generate-wire-contract.mjs`:
  `node scripts/generate-wire-contract.mjs` writes and prints the digest, `--check` compares
  without writing and exits non-zero on a mismatch. Verified: `--check` reports
  `contract is current (b1eb4762…)` and regeneration is a byte-identical no-op
  (`git status` clean). The contract README documents this entry and keeps the old one-liner
  as history, with the reason it is not reproducible on this host.

## 7. Candidate-tree instructions converged

Both candidate trees' `AGENTS.md` carried source-line scheduling text. Each now opens with a
marked **historical vs current** banner that:

- names `ordessa/control/` (README, `tasks/**`, `decisions.md`, `reports/LNX-002/`) as the
  authority after the merge, and marks `docs/implementation/**` (backend) and
  `docs/desktop-product-delivery/work-orders/**` (desktop) as the **historical** record;
- states that a Linux composition of this baseline has **no** default SecretStore, so the
  source line's "Windows owns persistent Profile/Session data" does not describe this tree;
- restates the engineering constraints that **do** still apply (Work Core provider-neutral;
  plugins own native Harness semantics; no real model call or credential-content access
  without authorization; stage explicit paths only; no reset/stash/clean, no auto-merge of
  main, no push; sibling repositories read-only).

The source-line text is kept **verbatim** below the banner — nothing was deleted, and the
original work trees were not touched.

## 8. Time accounting

The execution log spans 17:58–19:0x; I is right that the trailing 9m39s was not the whole
task. The run was interleaved with long network-bound installs (two `npm ci` attempts hit
`ECONNRESET`; `uv` installs timed out once) and three full-suite runs of ~164s each. The
elapsed wall time is not offered as a measure of the work.
