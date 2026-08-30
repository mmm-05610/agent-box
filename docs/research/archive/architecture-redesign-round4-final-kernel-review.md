# Architecture Redesign — Round 4 Final Kernel Review
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-28

Status: protocol decision for the first implementation gate

## Verdict

Approve a small Dispatch protocol repair.  Do **not** approve a new durable
ontology, a generic provisioning framework, a recovery engine, a Host daemon,
or a plugin-loader redesign as part of that repair.

The kernel boundary remains:

```text
Core owns durable Dispatch facts, frozen inputs, canonical identity/digest,
and the only transitions that authorize a Dispatch outcome.

DispatchCoordinator owns one non-durable attempt: provider lookup, permitted
resolution, preflight, start, receipt validation, and calls back into Core.
```

The coordinator must not have a durable start state, durable retry authority,
or a journal that can reinterpret `requested`.  A Host operation journal is
allowed for UX/idempotent command delivery, but is never Dispatch truth.

## Decisions on the remaining questions

| Question | Decision | Kernel ruling |
| --- | --- | --- |
| Typed accepted receipt with no SQL migration | **Modify and accept** | No relational migration is needed for P0, but this is not literally “zero schema”: `ref:v1:` correlation serialization and accepted-event keys are versioned storage schemas. Specify, bound, parse, and test them as such. |
| `ResolvedExecutionInput` placement | **Modify and accept** | It is a public, non-persistent invocation-protocol DTO. Put it in a dependency-neutral kernel/extension protocol module (and re-export from the Provider SDK), not in Host/application and not in durable domain models. |
| Preflight API and resolution categories | **Modify and accept** | Use Track B's explicit `preflight_contract_ids()` plus `ResolutionEffect`; do not use Track A's implicit “resolve every non-effectful input” rule. |
| `PURE` / materialization categories | **Accept with a P0 limit** | Keep only `PURE` and `IDEMPOTENT_MATERIALIZATION`. They govern ordering, not trust or recovery. P0 supports at most one materializing input in the official vertical slice; multiple materializers need a later provider-private operational design. |
| Staged fixed-point plugin loading | **Reject for P0** | It is useful once independently degraded plugin readiness is a product requirement, but it is not Dispatch correctness. P0 may use an all-or-nothing staged registry generation; defer fixed-point pruning. |
| Profile proposals and SnapshotStore | **Accept, defer from Dispatch P0** | The authority-delegated, depth-one proposal design is sound, but it belongs to the official Harness/Host gate, not the initial kernel repair. |
| `flock`/daemon ownership | **Accept, defer** | It is an operational admission guard, not a correctness or recovery proof. It is required before daemon/Web mutation, not before the in-process Dispatch repair. |
| One official multi-driver Harness provider | **Accept conditionally, defer** | It must first pass Codex plus a second-driver lifecycle proof. Otherwise split providers. This is not a Core protocol addition. |

## The P0 Dispatch contract

### 1. Canonical input handoff

Adopt one source of truth:

```python
@dataclass(frozen=True)
class ResolvedExecutionInput:
    contract_id: str
    ref: Ref
    value: object

@dataclass(frozen=True)
class ExecutionStartRequest:
    execution_id: str
    dispatch_id: str
    inputs_digest: str
    resolved_inputs: tuple[ResolvedExecutionInput, ...]
```

`ExecutionStartRequest.inputs` may remain for one compatibility release only as
a read-only property derived from `resolved_inputs`.  It must not be another
constructor argument or independently persisted representation.

The tuple order is the canonical frozen-input order.  Canonicalization and the
digest definition are kernel protocol rules, not Host policy.  The value side
is deliberately ephemeral; only the existing exact `(contract_id, Ref)` input
associations and digest are durable.

This resolves the current loss of Ref/value association without turning an
input envelope into a Core entity, a Binding slot, or a plugin-owned object.
The current implementation still returns grouped values from
`_resolve_inputs()` and reconstructs an accepted request by resolving again;
both behaviours must disappear.

### 2. Durable receipt, honestly described

Require new providers to return a validated receipt:

```python
class RecoverySupport(str, Enum):
    NONE = "none"
    OBSERVE = "observe"
    CONTROL = "control"

@dataclass(frozen=True)
class ExecutionStartReceipt:
    execution_id: str
    dispatch_id: str
    inputs_digest: str
    recovery_support: RecoverySupport
    correlation_ref: Ref | None
```

Validation is mandatory before acceptance:

- execution, dispatch, and digest equal the request;
- `OBSERVE` and `CONTROL` have a non-secret correlation `Ref` owned by the
  accountable ExecutionProvider;
- the encoded Ref and event payload have explicit size/type/metadata bounds;
- the support level does not exceed the provider's declared maximum.

For P0, the meanings are intentionally narrow:

| Support | Proven promise after a Host restart |
| --- | --- |
| `NONE` | Historical facts only. No reacquisition promise. |
| `OBSERVE` | `observe(correlation_ref)` can reacquire/read native state without creating a new responsibility. |
| `CONTROL` | `OBSERVE`, plus tested idempotent `finish` for this receipt. |

`CONTROL` does **not** implicitly promise attach, cleanup, retry, arbitrary
provider actions, or a generic resource lease.  Those need separate,
operation-specific evidence later.  A descriptor's current capability is only
an upper bound; the receipt's recorded level is the historical claim.

Store the canonical correlation Ref in the existing
`provider_correlation_ref TEXT` field as bounded `ref:v1:<canonical-json>` and
store `recovery_support` plus a correlation-identity digest in the same
accepted event transaction.  Legacy raw strings read as legacy correlations
with `NONE`; malformed `ref:v1:` data remains displayable as historical raw
data but cannot enable recovery.  This is a no-migration decision, **not** a
license for unversioned JSON or unbounded event data.

The public command/query response is a `DispatchReceipt`, not the internal
start request.  It is constructed only from durable row/event facts so an
accepted replay works with the provider uninstalled.

### 3. Replay and ambiguity

Every replay first does shape-only canonicalization and digest calculation,
then reads the Dispatch by idempotency key **before registry lookup, contract
lookup, resolution, or provider calls**.

| Durable state | Replay result | Provider/resource calls |
| --- | --- | --- |
| `accepted` | Return durable `DispatchReceipt`. | zero |
| `failed` | Return/raise recorded governed-sequence failure. | zero |
| `requested` | Return/raise `DispatchAmbiguous`; reconcile only through a separately authorized provider-specific operation. | zero |

`requested` means a frozen handoff exists and `start` may or may not have
happened.  It must never be read as permission to start again.  Add an
`EXECUTION_DISPATCH_AMBIGUOUS` event for an actual indeterminate start outcome;
the row stays `requested`.  Replaying an already-requested command does not
append repeated ambiguity events.

Classification rules are equally important:

- static validation, allowed pure resolution, preflight rejection, and
  resolution failure before `start` may record `failed`;
- `failed` means the governed sequence failed.  It does not prove that an
  earlier materialization had no side effect;
- only an explicit `ExecutionStartRejected`, whose provider contract means no
  accountable native responsibility was created, may record `failed` after
  entering `start`;
- timeout, process loss, unknown exception, malformed receipt, or a provider
  `ExecutionStartIndeterminate` leave the Dispatch requested and ambiguous.

No automatic redispatch, “starting” state, or generic operator retry is P0.

### 4. Preflight and effects

Reconcile Track A and Track B as follows:

```text
static registered-contract/input-limit validation
-> atomically freeze exact inputs + create requested Dispatch
-> resolve only explicitly requested PURE preflight inputs
-> side-effect-free provider preflight
-> materialize the remaining allowed input(s)
-> provider.start
-> validate and atomically persist receipt
```

The public optional extension is:

```python
class PreflightExecutionProvider(Protocol):
    def preflight_contract_ids(self) -> frozenset[str]: ...
    def preflight(self, request: ExecutionPreflightRequest) -> None: ...

class ResolutionSemanticsProvider(Protocol):
    def resolution_effect(self, contract_id: str) -> ResolutionEffect: ...

class ResolutionEffect(str, Enum):
    PURE = "pure"
    IDEMPOTENT_MATERIALIZATION = "idempotent_materialization"
```

An official provider implementing dynamic driver rules must implement both
preflight methods.  Legacy providers may omit them only under conservative
compatibility: all their inputs are materializing and they cannot claim
preflight-safe conformance.  A preflight-declared contract that is not `PURE`
is an incompatibility error before any resolution; it is not an excuse to
resolve it late.

`PURE` is strict: resolving it cannot create a process, session, worktree,
remote object, credential session, or other external effect.  Reading an
opaque credential **descriptor** can be pure; reading/injecting its secret is
not a ResourceProvider preflight operation.  Existing or managed tmux creation
therefore remains materializing for P0; it is not relabelled pure merely
because a read-only inspection is possible.

`IDEMPOTENT_MATERIALIZATION` promises that the frozen Ref addresses the same
resource on a repeated *new-attempt internal operation* or rejects drift.  It
does not make accepted replay legal, prove cleanup, or provide remote billing
recovery.  The coordinator must not turn canonical tuple sorting into an
unstated provisioning plan.  The official P0 slice may have one such input
(for example, a worktree) and require a pre-existing exact tmux pane.  Two or
more materializers are deferred until their accountable provider has an
explicit, private, dispatch-keyed journal/order and recovery story.  No generic
ResourceLease, provisioning plan, or compensation SPI is added to Core.

## Ownership split

The following split prevents the Track A/Core attack and makes Track C's Host
model compatible with the kernel:

| Core | DispatchCoordinator / Host application |
| --- | --- |
| canonical frozen input association and digest rule | registry lookup for a new attempt only |
| one Dispatch per Execution and idempotency-key identity | effect-category partition and permitted resolution |
| atomic requested / accepted / failed facts | provider preflight and `start` call |
| receipt persistence/parsing and terminal transition checks | receipt type validation, then call Core accept |
| ambiguity is durable evidence, never redelivery authorization | transient progress/operation UI; no durable Dispatch state |

The coordinator may be physically located in `work_core.services` during a
mechanical transition, but its API and tests must obey the outer-ring ownership
above.  A later `application.dispatch.DispatchCoordinator` is a relocation,
not a semantic transfer.  Core must expose explicit operations such as
`freeze_and_request`, `record_dispatch_accepted`, `record_dispatch_failed`,
`record_dispatch_ambiguous`, and a durable receipt reader; it must not expose a
"start requested Dispatch" operation.

The Host lock in Track C is complementary only.  It prevents supported process
concurrency; it cannot turn an ambiguous requested row into a safe retry, nor
does lock acquisition demonstrate recovery.  Daemon cutover is blocked for an
active or ambiguous operation unless the receipt-specific recovery proof covers
the requested control.

## Track contradictions resolved

1. **Which inputs preflight resolves.** Track A resolves all non-effectful
   inputs; Track B names `preflight_contract_ids()`.  Choose Track B.  Resolving
   every pure input unnecessarily expands authority and can expose unrelated
   data before driver selection.
2. **Effect vocabulary.** Track A's `effectful_contract_ids` is only a
   complement set and loses the semantic reason.  Choose Track B's two-value
   enum, with legacy default materializing.
3. **Preflight compatibility.** Track A presents `preflight` as a base
   `ExecutionProvider` method while Track B preserves the base protocol and
   uses an optional extension.  Choose the optional extension for P0; require
   it for official dynamic providers and remove the compatibility path only in
   a future SDK major version.
4. **Materialization order.** Track A's coordinator pseudocode can make
   canonical input order the external provisioning order.  That contradicts
   the Round-2 attack and Track B's provider-accountability premise.  P0
   limits the official slice to one materializer and rejects a generic order.
5. **Receipt storage wording.** Track A correctly avoids a SQL migration but
   calls the result zero-schema.  Track C needs stable cross-process API facts.
   The ruling is versioned protocol storage with no relational migration.
6. **Recovery control breadth.** Track A/C variously include observe, finish,
   cleanup, and attach under `CONTROL`.  Narrow P0 `CONTROL` to tested observe
   plus finish; no other operation inherits the claim.
7. **Loader readiness.** Track B proposes fixed-point removal; Track C needs a
   stable registry generation.  An all-or-nothing staged generation is enough
   for P0 and avoids ghost contracts without inventing partial-readiness
   policy.  Fixed-point degradation is deferred.

## Explicitly rejected additions

The first protocol PR must not add any of the following:

- a Dispatch `starting`/`recovered` state, retry queue, or rearm command;
- a new Core Profile, Harness, Sandbox, Console, Credential, Proposal,
  Snapshot, operation, lease, or workflow entity;
- a normalized receipt table/columns solely to avoid reading the accepted
  event;
- a generic resource lifecycle, cleanup, compensation, or provisioning-plan
  API;
- fixed-point plugin dependency resolution, hot reload, marketplace, or a
  public Harness driver SDK;
- daemon cutover, mutating Web routes, browser terminal, or desktop shell;
- a production Sandbox contract or a claim that bwrap proves one;
- a promise that `failed` means no external side effect, or that `accepted`
  means restart control.

## Minimal P0 implementation and proof

Only these changes are required before the official Harness vertical slice:

1. Add the canonical resolved-input DTO and derived legacy grouped view.
2. Return/read `DispatchReceipt`; accepted replay performs no registry,
   resource, or execution-provider call.
3. Add typed start receipts, bounded versioned correlation encoding, support
   recorded in the accepted event, and durable receipt parsing.
4. Add ambiguous-event recording; classify unknown start outcomes as requested
   plus ambiguous, not failed.
5. Add optional preflight/effect declarations and enforce the sequence above.
6. Prove with spies and restart fixtures:

   - all three replay states cause zero resolution/start calls;
   - multiple same-contract inputs retain their exact Ref/value pairing;
   - a driver mismatch fails before the one allowed materializer;
   - malformed/unknown start outcomes do not become accepted or failed;
   - receipt support and correlation round-trip across process restart;
   - no provider may advertise `OBSERVE` or `CONTROL` without the relevant
     restart test.

After that, the next gate is the isolated Codex Harness vertical slice with a
pre-existing tmux pane and execution-private state.  Snapshot/proposal work,
the second driver, loader sophistication, cc-switch, daemon ownership, and Web
mutation remain separate gates.
