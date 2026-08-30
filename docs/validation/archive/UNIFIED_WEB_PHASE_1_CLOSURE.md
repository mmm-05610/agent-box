# Unified Web Phase 1 Closure

Date: 2026-08-29

## Verdict

**COMPLETE** for the Phase 1 Work → Execution → Binding → Dispatch → Finish → Output → E2 continuation → Evidence closure. Harness/Profile/Resource Studio Phase 2 remains out of scope.

## Architecture after refactor

The production Web entrypoint is `src/app/App.tsx`, with hash routing in `src/app/router.ts`, shell in `src/app/Shell.tsx`, and feature-oriented modules under `src/features/works` and `src/features/executions`. Shared UI is under `src/shared`; API DTOs and client calls are under `src/api`; Workbench styles are in `src/workbench.css`. The historical `src/App.tsx` is only a compatibility re-export. No production module imports `src/prototype`, and no mock data is used.

## Provider selection flow

The user creates a Work, opens New Execution, writes responsibility, and explicitly selects an accountable provider. The Host/Core compatibility constraint is real: Core `Execution` currently requires `provider_id` at creation. Therefore Phase 1 keeps provider selection before the Core create call, exposes the selected provider in the draft, and does not invent a default provider or modify Core ontology. Provider identity cannot be changed after creation.

## Provider requirement / slot model

`GET /providers/execution` now exposes each provider's accepted contract IDs, `min`, `max`, `required`, and capabilities. The binding draft exposes these requirements and per-contract selected counts. Host-owned slots have stable `slot_id` values; `selector_id` remains only the selector used to prepare the value. Repeated contract inputs are separate slots. A selector resolves requested parameters to an exact Ref; Core dispatch still receives only `(contract_id, Ref)`.

## Binding readiness rules

Required minimums and maximums are checked from provider `input_limits`, not selector fields. Optional inputs do not block review. Missing or unresolved required inputs and over-limit counts produce review errors; Freeze & Dispatch is disabled until a successful current review exists. Any preparation or draft change increments revision, clears review, and revalidates. Dispatch freezes the binding; frozen slots cannot be edited.

## Freeze & Dispatch behavior

Freeze validates the expected draft revision and dispatches through the existing governed Core path. The UI refreshes execution and draft facts, keeps the exact frozen contract/Ref visible, and represents requested/accepted/failed/ambiguous dispatch states. Failed or ambiguous dispatch is not presented as launched. Activity is the explicit next route; no binding edit is available after dispatch.

## E1 → E2 continuation result

Outputs list real output Refs. The user chooses one, supplies E2 responsibility, explicitly chooses an E2 provider, and the Host calls `continue-from-output`; ordinary `create_execution` is not used as a continuation shortcut. The source Work ID is read from E1 on the Host, E2 receives a stable `source-output` slot with the exact output Ref, E1 remains terminal, E2 has a new ID, and E2 is not auto-dispatched. The browser vertical additionally verifies independent Git worktrees and E2 HEAD/tree equality with the E1 output.

## Evidence typing and reconciliation

Production API DTOs model Ref, frozen input, observation, observer role, kind, result, coverage, evidence Ref, detail, and timestamp. Host evidence is an input-first read model: every frozen `(contract_id, Ref)` row has zero or more observations. The UI distinguishes self-report/independent roles, shows MATCH/MISMATCH/UNKNOWN/UNVERIFIABLE and coverage, and renders no-observation rows without deriving a global “all resources used” verdict. Core Evidence/observation ontology was not duplicated.

## Activity / Finish / Attach behavior

Observe calls the Host control and refreshes execution facts. Finish is available only for accepted dispatch and non-terminal execution, uses a persisted operation, polls bounded terminal states, refreshes facts after success, and shows failed/interrupted/ambiguous outcomes without claiming terminal success. Duplicate accepted/running finish operations are not submitted again. Attach returns a copy-only native descriptor/target; the browser does not execute arbitrary argv or emulate a terminal.

## Browser E2E result

Passed: `tests/test_web_product_loop.py::test_browser_e1_e2_product_loop` using the production bundle and real loopback Local Web Host. It covers Work creation, explicit fake provider selection, requirement-driven Workspace Ref resolution, review, freeze/dispatch, fake provider worktree mutation, finish polling, output capture, continuation, E2 worktree materialization/equality, Evidence page rendering, and explicit human Work completion.

## Files changed

Production Web: `gui-web/src/app`, `gui-web/src/features`, `gui-web/src/shared`, `gui-web/src/api/client.ts`, `gui-web/src/api/types.ts`, `gui-web/src/api/query.ts`, `gui-web/src/App.tsx`, `gui-web/src/workbench.css`.

Host/API: `src/agent_box/application/facade.py`, `src/agent_box/server/host.py`.

Validation: `tests/test_web_product_loop.py` and this report.

The worktree contained substantial unrelated pre-existing changes; they were preserved. No Git index, commit, reset, or checkout operation was performed.

## Core changes, if any

No Core changes. Existing Work/Execution/Binding/Dispatch/Ref/Provider/Evidence semantics express the closure. The only compatibility constraint is documented above: Core creation requires an explicit provider ID, so the Host keeps the explicit provider step before creation.

## Tests

Passed:

- `npm run test:run`: 6 tests.
- `npm run lint`: exit 0; warnings remain only in pre-existing prototype/i18n/tailwind files.
- `npm run build`: exit 0.
- `pytest -q`: 291 passed.
- Browser E2E: 1 passed.
- Related Host/Core/extension/resource regression selection: 82 passed.
- `git diff --check`: passed.

Skipped:

- 1 existing `tests/test_cli_repl.py` test, intentionally avoiding an actual Claude launch when `bwrap + claude` are available.

Failed: none.

## Remaining limitations

Provider descriptors are a Host read-model projection over the existing provider `input_limits` API; a future richer descriptor can add explanatory contract text without changing this UI model. Attach remains copy-only by design. The existing frontend lint command still reports unrelated warnings in retired prototype and legacy i18n/config files.

## Ready for Phase 2 Harness API?

YES — the formal browser E1→E2 closure passes, binding semantics are enforced, and no Phase 1 blocker remains. This is readiness to begin a separately scoped Phase 2 API, not permission to mix Phase 2 entities into the Phase 1 closure.
