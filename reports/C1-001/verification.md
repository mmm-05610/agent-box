# C1-001 — verification

Three tracks, recorded separately and never substituted for one another, as the task requires.

## 1. Simulated validation

**None performed, and none claimed.** The task allows simulation *for debugging*; there was
nothing to debug yet, because the real instance never started. No simulated response exists in
this report, and none was used to stand in for a real Pi reply.

## 2. Real Pi validation

**Not performed yet — but no longer blocked on the artifact.** (Corrected 2026-09-21T20:40;
the first version of this table was wrong — see `implementation.md` §3.)

| Requirement | State |
| --- | --- |
| Pi runtime artifact `pi-runtime` | ✅ **built on this host**: `npm ci --ignore-scripts` in a copy of `plugins/agent-box-harnesses/runtime` → 336 packages, `node_modules/@automatalabs/pi-acp/dist/index.js` present |
| Deployment document naming the Pi harness | ✅ generatable from the in-tree `deploy/pi/{models.json,settings.json}` |
| Credential: an authorised DeepSeek account/key for this trial + its registration route | ❌ **the one genuine remaining input** — and I never handle the secret; the Server injects `$DEEPSEEK_API_KEY` into the child from a registered locator |
| Two GUI turns with context continuity | not attempted — needs the credential above and a controllable desktop |
| One read-only tool call visible in the UI | not attempted |
| Thinking shown only as Pi provides it | **determined in advance**: `deploy/pi/models.json` pins `reasoning:false` + `thinking.type=disabled`, so this loop's Pi provides none → will be recorded as **"not supported"**, never invented |

**Nothing here is a claim that the loop works, and nothing was faked to make it look as if it
did.** The artifact build is a real, measured step forward; the model round-trip has not
happened.

## 3. User acceptance

**Not requested and not granted.** The task's acceptance points 1–5 (real GUI reply, context
continuity, visible read-only tool call, honest thinking display, reproducible start) have no
evidence yet, so there is nothing for a user to accept.

## 4. What *is* verified at this checkpoint

| Item | Evidence |
| --- | --- |
| Both task trees exist, on `work/pi-loop-0`, at the exact dev-0 SHAs, clean | `git rev-parse` / `status --porcelain` on both |
| Nothing of anyone else's was overwritten; the mis-placed first attempt was fully cleaned up | both real repos list no `pi-loop` worktree; no leftover paths |
| The product bootstrap imports from the backend task tree with the plugin `src` dirs on `PYTHONPATH` | `build_runtime_from_sidecar_deployment` imported successfully |
| The Pi adapter, its artifact contract (`ARTIFACT_NAME`/`ARTIFACT_TARGET`/`treeDigest`) and its runtime entry are present in source | `plugins/agent-box-harnesses/src/agent_box_harnesses/pi/production.py` |
| The agentbox product chain is distinguishable from `legacy-hermes`, and the variable they share was identified | `capability-map.md` §1 |
| The JS closure is reproducible from a shipped offline lock | `runtime/artifacts/SBOM.json` (`agentbox-offline-lock/1`) |
| No secret was read, printed, reported or committed | no credential file was opened; the locator path does not exist here |

## 5. Honest summary

Phase A (capability map + plan) and phase B (isolated task trees) are complete. Phase C could
not start: the runtime inputs it needs are absent from this host. This is `BLOCKED` on named
inputs, **not** a `PARTIAL` implementation and **not** a defect — and it is deliberately not
reported as anything more optimistic than that.
