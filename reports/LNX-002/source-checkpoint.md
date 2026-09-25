# LNX-002 — source checkpoint

**Status: REVIEWABLE SOURCE CHECKPOINT.** Not an acceptance, and not a runnable
end-to-end demonstration. What is proven below is: the two candidate trees exist, both
source lines are their ancestors, the cross-repo protocol converges on one artifact, and
the gates that can run in this environment were run.

## 1. The checkpoint

| Tree | Branch | HEAD (full SHA) | Layer 1 (merge) | Layer 2 (LNX-002 work) |
| --- | --- | --- | --- | --- |
| backend | `integration/linux-native-0` | `b067c5718556c8efa93b054e6573ad3d186b3cf6` | `e393812` | `3faed14`, `95b363f`, `4f4587a`, `05dca5d`, `68390f9`, `e2fc58f`, `9ba5d1f`, `b067c57` |
| desktop | `integration/linux-native-0` | `80872f556c001b42217d43bf5f73ab08029bfcb9` | `0aa7a945` | `99a9d09f`, `80872f5` |

These are the checkpoint SHAs. `status.md` is a narrative that can move; this table is the
pinned record. Revisions are in `repairs.md` (I's initial review, seven items) and
`ruling-ack.md` (I's `LNX-002-runtime-ruling.md`, the two limited repairs: the stage-typed
error mapping and the ACP `stopReason` carried through the vendored bridge).

Worktrees (real directories at the path the task authorized):
`ordessa/worktrees/integration-linux/backend` and `…/desktop`.

**Ancestry verified, not asserted:**

```
backend  a7b7b6ff15ab127a168ec3715bb5eb4414aa8aaa  ancestor=YES   (runtime line)
backend  003b52b2b18a86547d2819ea8875095442d2011b  ancestor=YES   (service line)
         e393812  parents = a7b7b6f 003b52b
desktop  08b4eac7fe10aacc3220cca94c52659aaf043cc5  ancestor=YES   (chat line)
desktop  01083212aaade2ead3a1be9323943ea3eae3284e  ancestor=YES   (settings line)
         0aa7a945 parents = 08b4eac7 01083212
```

Both merges are real merge commits, so every file the resolution *did not* carry is still
reachable through the second parent. Nothing was rebased, squashed or force-pushed, and
both candidate worktrees report a clean status.

The merge bases (`ordessa/repos/*`, the checked-out real trees) were **not touched**; their
uncommitted work is intact.

## 2. What the reviewer should read as done

| Item | State | Evidence |
| --- | --- | --- |
| Two isolated worktrees, branch `integration/linux-native-0` | done | §1 |
| Backend: runtime ⊗ service integrated, schema 20 kept, service wire behaviour kept, `WIRE_VISIBLE_EVENT_KINDS` union restored | done | `conflicts.md` §1 |
| Desktop: chat ⊗ settings integrated; transcript/tool cards, send state, i18n increments kept | done | `conflicts.md` §2 |
| A merge-created defect found and fixed across the seam | done | `conflicts.md` §2.3 (`thoughtLabelFor` vs the 2-arg `formatElapsed`) |
| Cross-repo protocol unified **at the generation source**, artifact regenerated, digest verified | done | `protocol.md` |
| Declared backend cross-repo gate run against the converged artifact | done — **37 passed** | `protocol.md` §4 |
| Relock bookkeeping (the documented procedure) executed | done — **65 passed** | `protocol.md` §5 |
| Source ancestry + clean candidate trees + full SHAs | done | §1 |
| LNX-003 item 1 — PNG seam measured | done, **and the path does not pass** | §3 |
| LNX-003 item 2 — truncation reason driven through the wire projection | done — **7 passed** | `tests/server/test_terminal_reason_consumer_134.py` |
| LNX-003 item 3 — default Linux composition + reopen read | done — **3 passed** | `tests/server/test_linux_default_secret_store_lnx002.py` |

## 3. What is explicitly NOT done, and must not be implied

1. **`backend main` is not absorbed.** `main` (`6c14ea8db8130f1e219328835840b4159fe8c9e7`,
   "#66/#67 Studio backend core … five real harnesses") is **not** merged, not partially
   cherry-picked, and not reflected in this checkpoint. Its unique plugins and same-path
   variants are registered in `input.md`; the two-source baseline here does **not** import
   that batch (D-0020, I's item 4). 171/122 are LNX-001's measurements, not 171 mergeable
   features.
2. **The remote-media PNG path does not pass.** I's item 1 required the seam to be
   *measured* rather than asserted, and it is: `mediaExternalUrl('<remote .png>')` produces
   `hermes-media://remote/…png` and the handler answers **415**, because PNG is outside
   `isStreamableMediaPath`'s allow-list. See `conflicts.md` §2.1 and the new
   `media-protocol-png-seam.test.ts`. No allow-list, CSP or scheme privilege was widened to
   change that. Affected mode and repro are in that test's header.
3. **No Linux SecretStore exists.** A composition that injects nothing has
   `secret_store is None` on Linux (`bootstrap/runtime.py` installs a store for
   `os.name == "nt"` only). The refusal is measured to be *typed*
   (`503 CREDENTIAL_STORE_UNAVAILABLE`, retryable, no record left behind) — so the gap is
   the missing store, not the failure shape. A persistent implementation remains a later
   runtime task.
4. **Real-harness truncation is not solved.** What is verified is the local consumer leg
   (persisted reason → wire `reason`). The Worker still has to *emit* `stopReason`.
5. **Not everything ran.** §4 lists exactly what failed and why, separating environment and
   pre-existing causes from merge causes.
6. **Evidence-strength limits (I's item 5).** "Survives a reopen" here means the
   non-secret credential *record* read back by a second composition — not a secret.
   Statements about the media handler's redirect behaviour, cross-origin `Authorization`
   handling, or unregistered scheme privileges were **not** established by this run and are
   not claimed.

## 4. Test results, classified

The suite that matters here is the backend's offline set (`.github/workflows/ci.yml:22-28`:
`pytest -q tests --ignore=tests/integration`) plus the desktop's `vitest` projects.

**Headline, measured at this checkpoint (revised after I's runtime ruling):**

```
backend:  pytest -q tests --ignore=tests/integration
          1259 passed, 21 failed, 33 skipped, 0 xfailed
          VERDICT=FAILED (the count line agrees with the run)
          — was 1224 passed / 37 failed before LNX-002's own fixes.
desktop:  vitest run --project ui        8230 passed, 0 failed (849 files)
          vitest run --project electron  2327 passed, 6 skipped (170/175 files; 3
                                          could not load — environment, §4.3)
          tsc -p . --noEmit              clean
```

**Every one of the 21 remaining failures is accounted for, and the arithmetic is exact:**
**19 environment/tool absence + 2 proven pre-existing on the runtime source line = 21.**
There is **no** `xfail` left: the sidecar case I had registered is now a real pass
(`ruling-ack.md`), and the two `test_artifact_absence_is_not_green_118.py` reds are fixed by
the preparation register. The earlier version of this table read 18 + 2 + 4; the recount is in
`repairs.md` §6, and the before/after reduction is **not** evidence that all were
merge-introduced — each is attributed individually there.

### 4.1 Green

| Suite | Result |
| --- | --- |
| `AGENT_BOX_WIRE_SCHEMA=<converged artifact> pytest tests/server/test_wire_v1.py` | **37 passed** |
| `pytest test_wire_artifact_113 test_hello_harnesses_105 test_provider_update_keeps_omitted_112 test_wire_drive_coverage_103` | **65 passed** |
| `pytest tests/server/test_linux_default_secret_store_lnx002.py` (new) | **3 passed** |
| `pytest tests/server/test_terminal_reason_consumer_134.py` | **7 passed** |
| desktop `tsc -p . --noEmit` (renderer) | clean |
| desktop `vitest run --project ui` | **8230 passed, 0 failed** (849 files) |
| desktop `vitest run --project electron` | **2327 passed, 6 skipped**; 3 files could not load — see §4.3 |

### 4.2 Fixed by this task (they were red when the merge was raw)

- the 5 profile-read-face schema violations (`recoveryPending` / `sendability`) — now green
  at 37/37; **control experiment**: the same 5 were red with the pre-change artifact, so
  they were pre-existing cross-repo drift, not caused by the convergence (`protocol.md` §3.2);
- the 4 `test_wire_artifact_113` + 4 `test_hello_harnesses_105` + 3
  `test_provider_update_keeps_omitted_112` + 1 `test_wire_drive_coverage_103` failures, all
  of which were either stale relock constants or the merged comment the arm-112 proxy scan
  fired on (`protocol.md` §5).

### 4.3 Not run, or red for reasons outside this task

| Suite | Count | Cause | Class |
| --- | --- | --- | --- |
| `test_opencode_gate_cleanup.py` | 11 | the `opencode` binary is absent on this host | environment (tool) |
| `test_pi_gate_cleanup.py` | 5 | the `pi` binary is absent | environment (tool) |
| `test_gate_worker_defaults`, `test_sidecar_lease_keepalive` | 2 | the worker artifact is absent (`VERDICT=DEGRADED_ARTIFACT_ABSENT`) | environment (artifact) |
| `test_hermes_production_chain::test_the_wire_model_is_the_product_id_and_is_asserted` | 1 | `ModuleNotFoundError: yaml` — the harness plugin's optional dep is not installed here | environment (dep) |
| `electron/host-capabilities/contract.test.ts`, `electron/windows/app-icon.test.ts`, `electron/host-capabilities/platform/window-below.test.ts` | 3 files | `Error: Electron failed to install correctly` — the electron binary download was interrupted by the network resets this session hit | environment (network) |
| `test_child_limits_production_path_136.py` | 2 | `TypeError: argument of type '_FakeRegistry' is not iterable` at `delegation.py:361` (`… not in registry`, while the test's fake defines only `.get()`) | **proven pre-existing on the runtime source line** — the merge commit's files are byte-identical to `feature/env-provider-runtime`, *and* both files were extracted from that line and run standalone: the same 2 fail there, while the service line has no such file. Attribution measured, not inferred from file identity alone |
| `test_harness_sidecar.py::test_public_post_open_error_with_the_same_code_keeps_ambiguous_semantics` | 1 (xfail) | **registered divergence, needs I's product decision** — see `repairs.md` §4 | not a failure and not a pass: `xfail(strict=True)` with the evidence in the reason |
| ~~`test_artifact_absence_is_not_green_118.py`~~ | 0 | fixed by repair 3: the absences are now a named preparation register (`PREPARATION_GAPS`) asserted in both directions | — |
| ~~`test_harness_sidecar.py::test_public_post_open_error…` (as a failure)~~ | 0 | replaced by the registered divergence above | — |

**Not covered at all** (no run attempted, and not claimed): `tests/integration/native`
(real bwrap/tmux vertical slices), the desktop's Playwright/e2e suites, real-harness rounds
(the `claude` CLI is absent), and anything requiring a live Worker or a second machine.

## 5. Where the evidence lives

- `input.md` — the four source HEADs (all matched the task exactly, zero drift), the two
  mains, and the pre-existing-path check.
- `conflicts.md` — every conflict, the side taken, the reason, and the three trade-offs a
  reviewer should weigh.
- `protocol.md` — the generation chain, the generation command (and the toolchain
  substitution with its byte-identical equivalence proof), the two drift families closed,
  the relock bookkeeping, and the final digests.
- `status.md` — the live state, the ACK of I's LNX-003 supplement, and the run log.
- This task did not modify `control/decisions.md`, `control/README.md`,
  `control/tasks/**`, `archive/**` or `releases/**`.

## 6. Recommended next steps (for I / the next task)

1. **Decide `docs/implementation/**`'s disposition** in the candidate trees — LNX-001 left
   keep / drop / move-to-`archive/` open, and this task integrates without deciding it.
2. **The two unresolved reds** of §4.3 (`test_artifact_absence_is_not_green_118`,
   `test_harness_sidecar`) need a first-hand look; neither was caused by the merge, and
   neither was repaired, because repairing them means changing an order's claim rather than
   resolving an integration seam.
3. **Sol's review** should cover what I's LNX-003 §通知 names: the PNG seam, the terminal
   state pass-through, the protocol's actual responses, and the default-Linux credential
   refusal — keeping the source checkpoint distinct from a runnable acceptance.
4. **`backend main` absorption** stays a separate, architecture-level decision; this
   checkpoint deliberately does not move toward it.
