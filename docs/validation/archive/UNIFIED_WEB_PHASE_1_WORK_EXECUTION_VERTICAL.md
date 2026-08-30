# Unified Web Phase 1 — Work / Execution vertical slice
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Status: implemented in the formal Web entry point; prototype remains isolated at `prototype.html`.

## Architecture

The formal client uses a small hash route boundary suitable for the Local Web Host's static-file fallback. API calls are centralized in `gui-web/src/api/client.ts`; `useQuery` is the minimal query/mutation boundary. React components do not construct `/api/v1` fetch boilerplate.

## Real API mapping

Works, executions, binding drafts, selectors, choices, prepare, review, freeze-dispatch, observe, finish, operations, outputs, evidence, attach, continuation, providers, plugins, and Work completion all map to the corresponding Local Web Host routes. Mutation requests carry `command_id` or `operation_id`; terminal and operation states are re-read from Host.

## Deliberate gaps

Harness/Profile CRUD, Resource Library CRUD, cc-switch, provider-specific settings, and richer input-limit descriptors remain unavailable and are not represented with mock data. Existing browser tests that assert retired GUI copy must be updated as a separate test-contract change; this implementation does not add compatibility branches for provider or selector IDs.

## Retirement status

Phase 1 does not pass the GUI retirement gate. Real provider rehearsal, accessibility review, and the updated formal browser E2E must pass before production retirement is considered.
