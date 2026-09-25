# Known issues and untested scope

Baseline carries registered issues — establishing the baseline did not wait for
them. Nothing here is hidden; nothing here was "fixed" by deleting assertions
or skipping tests. Inherited = already red/absent in the frozen source
candidates; New = introduced by the migration (each has a disposition).

## Backend

| Issue | Class | Evidence / disposition |
| --- | --- | --- |
| `tests/acp_orchestration` suite reds (worker-entry retirement; 18 failed / 40 passed at closeout) | Inherited | hd004 ruling: do **not** revive compat chains to green them; kept visible |
| `plugins/harness/tests/install/test_acp_schema_drift_target.py` — 2 failures (npm closure: `@agentclientprotocol/sdk` override vs `@automatalabs/pi-acp` declaration) | Inherited (first 2 entries of the baseline red ledger) | dependency drift in the original tree; not touched by migration |
| server-suite red ledger (see `docs/migration/backend-build-test.md`): 782 passed / 44 failed / 25 errors — 62 inherited (same test id red in the frozen baseline, mostly worker-entry retirement / sidecar chain) + 7 scope-missing | Inherited + documented | the frozen bc-native baseline itself was 97 failed + 25 errors / 1755 passed; the 7 scope-missing reds (placement ×5, wire_v1 ×1, sidecar_native_driver ×1) were green in the baseline only because the 9 retired plugins were importable there — they stay red-honestly until those plugins return under `plugins/<name>` (lead ruling: accepted as documented) |
| 10 `EXCLUDED-round1-qa__*.py` files in `apps/server/tests/` | Retained, not collected | their subjects (server-round1 QA gate scripts, docs evidence) did not enter main; kept as discoverable markers of the retired QA line — archive refs hold their subjects (lead ruling) |
| lazy dependency points on retired plugins: `ssh_connector` (typed refusal naming the missing dist), `bootstrap.runtime` → `agent_box_runtime_wsl.WslConnector`, `local_channel` → `agent_box_sandbox_windows.job.Job`, `pacthold.cli` → `agent_box_web` | Documented TODO | behaviour preserved (typed refusal / graceful degradation); pyprojects do not declare the missing dists; re-wiring needed if SSH/WSL legs, terminal sessions or the web workbench return |
| stop does not interrupt an in-flight tool turn (end_turn ≠ cancelled) | Inherited, accepted at Round H closeout | design gap registered at CP-SESSION-001 |
| Round H bridge flaky test `TestE2EACPPlanUpdateMappedFromTurnPlanUpdated` (plan-update 2-of-3 failures observed 2026-09-25) | Inherited, flaky | Go-side; not fixed in this migration |

## Desktop

| Issue | Class | Evidence / disposition |
| --- | --- | --- |
| Approval card has no timeout display | Inherited, accepted at Round H closeout | UI debt |
| Input box scrolls out of view (pending confirmation) | Inherited, pending | UI debt |
| `apps/desktop` package name still `@modular/desktop-app` | New (kept deliberately) | internal npm name; rename is cosmetic, deferred (registered in `docs/naming.md`) |
| `act()` stderr warnings in acp-connector rig | Inherited | tests green; warnings only |

## Cross-component / environment

| Issue | Class | Notes |
| --- | --- | --- |
| **Real-model end-to-end chain NOT exercised in this baseline** | Untested scope | no model API calls authorised for the migration; controlled Round H acceptance (2026-09-25) is the version-matched evidence: 11/11 gates incl. first-send=1, two turns, approval resolve, dual-restart history recovery (10 msgs ×2), release closed |
| Full GUI acceptance (the two UI debts above) | Untested scope | controlled smoke (electron boot, agent-shell, extension discovery) is green |
| `tests/acp-connector` is a standalone rig with its own lockfile (not a root workspace) | By design | pins `@agentclientprotocol/sdk` 1.5.0 |
| Desktop-repo history tags `v2026.9.11/14/21` + upstream refs not locally recoverable (shallow clone) | History gap | see `docs/reference-index.md`; remote unshallow pending user decision |

## Services (environment registry — do not kill/restart)

| Service | Status (2026-09-25) | Touch? |
| --- | --- | --- |
| hd004b server leg, pid 381142 (bc-native tree, port 57411) + access-entry 394938 + bridge 394946 | running, uses frozen bc-native tree paths | **No** — live user evidence; its tree stays in place until the user retires it |
| qoder sessions pids 36036/66577 (bc-native), 66935 (fc-functional), 273506 (desktop-ui-codex) | idle-but-alive executor sessions | **No** — read-only on their trees |
| Old trial servers 18790 / 18810 | stopped (no listener, 2026-09-25) | n/a |
| `.c1-001-runtime/`, `.c1-001-secrets/`, `runtime/native-pi-user` in the workspace root | run data + credentials (one 64-byte token registered, never read) | **No** — environment exceptions, never enter git |
