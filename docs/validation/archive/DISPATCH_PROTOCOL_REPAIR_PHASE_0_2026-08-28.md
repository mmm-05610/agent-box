# Dispatch Protocol Repair — Phase 0 validation
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

## Changed files

- `src/agent_box/work_core/registry.py`, `services.py`, `repository.py`,
  `events.py`, `errors.py`, and package exports;
- the Codex and Pi execution providers and their request fixtures;
- Work Core, extension, and provider dispatch tests.

## Final API

`ExecutionStartRequest` has canonical
`resolved_inputs: tuple[ResolvedExecutionInput, ...]`.  Each item holds the
contract id, exact frozen `Ref`, and resolved value.  `request.inputs` remains
a read-only grouped compatibility view derived from that tuple.

`ExecutionProvider.start(request)` returns `ExecutionStartReceipt`, containing
the matching execution id, dispatch id, inputs digest, recovery support, and
an optional provider-owned correlation `Ref`.  A provider may retain an
ephemeral in-process control handle; Core neither persists nor replays it.
`dispatch_execution()` returns durable `DispatchReceipt`.

## Replay behavior

| Persisted state | Result | Registry/provider calls |
| --- | --- | --- |
| accepted | stored `DispatchReceipt` | zero |
| failed | stored `DispatchFailed` | zero |
| requested / indeterminate | `DispatchAmbiguous` | zero |
| key with execution or digest mismatch | `DispatchRejected` | zero |

The replay digest is calculated from canonical frozen input shape only.

## Start failures

| Condition | Durable result |
| --- | --- |
| resolve/preflight failure before `start()` | failed |
| explicit `ExecutionStartRejected` | failed |
| malformed or mismatched receipt | requested plus ambiguity event |
| unknown `start()` exception | requested plus ambiguity event |

## Persistence

No SQL migration was necessary.  The existing dispatch correlation column now
stores bounded `ref:v1:` canonical JSON, and accepted events store recovery
support plus a bounded correlation identity digest.  Legacy string locators
remain readable.  Accepted receipts round-trip through a fresh repository
instance and do not require the original plugin registry.

## Verification

Focused Work Core, extension, CLI, and affected-plugin suites: **186 passed**.
They cover exact same-contract Ref/value pairing, canonical order/digest,
read-only compatibility grouping, typed receipt validation, explicit
rejection, unknown-start ambiguity, replay with bomb registries, restart
receipt round-trip, and idempotency mismatch.  Installed-plugin inspection for
Codex and Pi and installed-plugin doctor all exited 0.  Full `pytest -q`:
**286 passed, 1 skipped, 2 environment failures**; the failures are the known
host read-only legacy GUI database/history parity tests, not this Work Core
path.

## Remaining risk

Legacy providers must migrate their `start()` return to
`ExecutionStartReceipt`.  The optional pure preflight hooks are deliberately
small: providers without them retain the conservative materialization path.

## Phase 0 exit gate

Satisfied: Phase 0 changes only the invocation protocol and dispatch evidence;
it adds no Core lifecycle, finalization, output capture, scheduler, or product
ontology.
