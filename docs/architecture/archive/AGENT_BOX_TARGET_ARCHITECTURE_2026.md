# Agent-Box Target Architecture 2026
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Status: approved target after four-round adversarial review

Date: 2026-08-28

## 1. Product center

Agent-Box is an Execution governance kernel and integration Host.

It governs:

- what one Execution responsibility attempt is;
- which exact external resources its Binding froze;
- which accountable ExecutionProvider accepted its Dispatch;
- which native identity the attempt produced;
- what facts and evidence were actually observed;
- how terminal outputs become possible inputs to a later Execution.

It does not govern workflow progression, DAG routing, scheduler, retry policy,
agent supervision, message ontology, sandbox implementation, secrets storage,
or what happens next in a Work.

```text
Workflow / Human / Host decides the next action.
Agent-Box governs the responsibility boundary and evidence of this action.
```

## 2. System shape

```text
Clients
  WorkBoard       current mutating client
  Web Workbench   long-term primary client
  CLI             automation/client surface
  Desktop shell   future WSL launcher + WebView
          |
          v
Host application
  commands and queries
  Binding drafts and resource selectors
  DispatchCoordinator
  mutation ownership
  immutable non-secret snapshots
          |
          +------------------------+
          v                        v
Work Core                    Extension Host
  durable facts                 plugin discovery
  invariants                    Contracts
  atomic transitions            ResourceProviders
                                ExecutionProviders
                                bounded Host adapters
          ^                        |
          |                        v
          +--------------- installed plugins
```

Dependency direction is strict:

```text
UI -> Host application -> Core public operations
                       -> Extension public protocols

Plugins -> public Provider/Host SDK

Core -X-> UI, Host policy, plugins, Harnesses, workflow, tmux, Git, cc-switch,
          Sandbox products
```

## 3. Stable Core

Core owns only durable governance facts and invariants:

- `Work` and explicit Work completion;
- `Execution` as one responsibility attempt;
- frozen `(contract_id, Ref)` input associations;
- one Dispatch per Execution;
- Dispatch requested/accepted/failed/ambiguous facts;
- native and output Ref associations;
- terminal projection sealing;
- append-only ResourceObservations and Evidence relations;
- continuation as a new Execution with an old SessionRef input.

Core does not gain the following entities:

- Harness, Agent, Profile, Participant;
- Sandbox, Console, MCPServer, Plugin, Skill, Credential;
- WorkflowStep, Node, Edge, scheduler, retry engine;
- Host operation, draft, proposal, lease, or UI state.

## 4. Dispatch invocation protocol

`ExecutionProvider.start()` is the one accountable start entry point. Core
persists the handoff and outcome facts; the Host DispatchCoordinator invokes
external code.

### 4.1 Canonical resolved input

Providers receive the exact Ref together with its resolved typed value:

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

This is a non-persistent invocation DTO, not a Core entity. A grouped `inputs`
mapping may exist for one compatibility release only as a derived property.

### 4.2 Governed sequence

```text
canonicalize exact Refs
-> validate static input limits
-> atomically freeze inputs and request Dispatch
-> resolve explicitly requested PURE preflight inputs
-> side-effect-free provider preflight
-> resolve at most the permitted materializing inputs
-> provider.start
-> validate typed receipt
-> atomically record accepted receipt
```

Dynamic Profile/driver/continuation compatibility must fail before Git, tmux,
or another materializing resource is created.

### 4.3 Resolution effects

Preview supports two declarations:

```text
PURE
IDEMPOTENT_MATERIALIZATION
```

They govern ordering only. They do not claim trust, cleanup, recovery, or
security. A materializing resolver must be deterministic from the frozen Ref,
idempotently return the same materialization or reject drift, and must not
create a hidden accountable native task.

The first official vertical slice permits at most one new materialization and
uses a pre-existing exact tmux pane. A generic provisioning/compensation system
is not introduced.

### 4.4 Receipt, replay, and ambiguity

`start()` returns a typed receipt bound to execution, dispatch, and input
digest. Recovery support is historical and receipt-specific:

```text
NONE       no post-restart control promise
OBSERVE    existing native responsibility can be observed after restart
CONTROL    OBSERVE plus tested idempotent Finish
```

`CONTROL` does not imply retry, cleanup, attach, or arbitrary control.

Accepted command replay returns a durable `DispatchReceipt` and invokes no
registry, ResourceProvider, or ExecutionProvider. Failed and requested replay
also invoke nothing. Requested after an indeterminate start remains ambiguous;
it is never permission for blind redispatch.

The Preview implementation may use bounded, versioned correlation encoding in
the existing correlation field and receipt metadata in the accepted event,
without a relational migration. This is still a versioned storage protocol and
must be parsed, bounded, and tested. ADR-0002/0003's stronger production
starting/started recovery protocol remains a later gate rather than an implied
Preview guarantee.

## 5. Host application boundary

The Host application owns use-case orchestration, not durable domain truth:

- Work/Execution commands and queries;
- Binding draft and review;
- plugin selector discovery;
- candidate input preparation;
- DispatchCoordinator external invocation;
- attach/observe/finish commands;
- Host operation idempotency for UI delivery;
- one mutation-owner lease per Agent-Box home;
- immutable non-secret SnapshotStore.

Host drafts, worker progress, `FINALIZING`, proposal provenance, and UI
selection are not Core facts. The Host may record useful artifacts/events only
through existing Core mechanisms.

## 6. Plugin model

Third-party plugins remain trusted Python distributions discovered through
entry points. A plugin may contribute:

- versioned frozen Resource Contracts;
- ResourceProviders;
- ExecutionProviders;
- bounded Host input/control adapters.

Plugins do not receive direct Core database access and must not import Core
repository/service internals.

### 6.1 Preview loading

The official Preview registry is built as one staged generation:

1. discover/build descriptors and registrations without runtime effects;
2. stage unique Contract owners first;
3. validate provider declarations against staged Contracts;
4. atomically commit the complete official registry or fail closed.

Entry-point alphabetical order is never a dependency mechanism. Partial
fixed-point degradation, semver solving, package installation, hot reload, and
marketplace behavior are deferred.

### 6.2 Host adapters

Plugins contribute declarative fields, choices, input preparation, typed
controls, diagnostics, and one-level input proposals. They do not inject
arbitrary frontend code during Preview.

A proposal is only a draft selector. The authority that owns the target
ResourceProvider/adapter must prepare the exact Ref. UI shows and Core freezes
every resulting input independently.

## 7. Official Harness integration

`agent-box-harnesses` is an official plugin distribution, not part of Core.

```text
agent-box-harnesses
  official-harness-interactive ExecutionProvider
  Harness Profile ResourceProvider
  capability/credential-source contracts and providers
  private driver registry
    Codex
    OpenCode
    Pi
```

One interactive provider is retained only if two real drivers prove the same:

- visible user-held responsibility window;
- explicit Finish;
- native correlation and continuation rules;
- execution-private writable state;
- preflight/start/observe/finish lifecycle;
- no hidden driver retry, task ownership, or supervisor.

Codex is implemented first. OpenCode or Pi is the architectural acceptance test.
If the second driver needs a different responsibility lifecycle, it becomes a
separate ExecutionProvider in the same package. Codex App Server structured
review remains separate from the interactive provider.

Driver protocols remain private. Agent-Box does not publish a third-party
HarnessDriver SDK until external authors prove a shared need; third parties can
register their own ExecutionProvider today.

## 8. Profile and execution state

Profile is a stable, immutable/versioned materialization source:

```text
Profile identity/revision
+ immutable base configuration
+ explicit capability source Refs
+ opaque credential-source Ref
-> execution-private writable runtime
```

Profile never means a writable native home shared across Executions. Session,
transcript, trust/approval state, writable cache, temporary files, locks, and
sockets are Execution-scoped. Continuation restores only the explicitly frozen
SessionRef and must reject unsafe concurrent reuse.

Shared MCP/plugin/skill content is an explicit versioned source. Credential
values are never copied into Profile, hashed into Binding, or persisted in
events/evidence.

The Host SnapshotStore keeps allowlist-serialized, content-addressed,
non-secret snapshots required for exact Profile/capability history. Snapshot
retention belongs to the official Harness integration gate, not the Dispatch
kernel repair.

## 9. cc-switch relationship

`agent-box-cc-switch` is an optional read-only bridge plugin:

```text
cc-switch external catalog
-> supported-schema read adapter
-> non-secret definition snapshot or opaque credential-source identity
-> exact Ref prepared before freeze
-> drift validation at resolution
```

It does not own Profiles, Harness lifecycle, or Agent-Box UI. It never writes
cc-switch, performs bidirectional synchronization, or becomes a dependency of
`agent-box-harnesses`. Unknown schema, deletion, or non-secret digest drift
fails visibly. Credential value/revision remains unknown or unverifiable when
the external authority cannot prove it.

The bridge is implemented only after the second-driver proof.

## 10. Console and Sandbox

`TmuxRef` and future `SandboxRef` are orthogonal:

```text
TmuxRef     visible PTY/attach surface
SandboxRef process execution space and isolation policy
```

The accountable Harness ExecutionProvider composes them; neither owns the
aggregate Execution outcome.

Preview uses an exact pre-existing tmux pane and explicitly reports
host-process launch as unsandboxed. Existing bwrap work remains experimental
and may be used as a degraded local fallback, but it does not define a public
Sandbox SPI or prove strong isolation.

A production Sandbox contract is extracted only after real agent-oriented
Sandbox integrations prove exact pre-Dispatch identity, instance creation,
workspace/config projection, credential injection, PTY/stream, observe,
recovery, cleanup, and evidence semantics. An external product that accepts
the full task and owns the agent run is an ExecutionProvider, not a Sandbox
ResourceProvider.

## 11. Web and process ownership

The long-term primary interface is a local-first Web Workbench backed by one
Host daemon. Web is not the first migration step.

```text
Phase A  WorkBoard is the sole mutating process
Phase B  WorkBoard calls the application facade and holds a per-home flock
Phase C  optional Web exposes read-only Binding/Evidence views
Phase D  daemon takes the lock; WorkBoard and CLI become daemon clients
Phase E  Web mutations are enabled through the daemon
Phase F  optional desktop shell chooses/starts a WSL Host and embeds the Web UI
```

Only the mutation owner opens a writable repository, runs migrations, builds
operational provider controls, or invokes effects. Read-only servers never
create a home or migrate data. The lock is an admission guard, not Dispatch
recovery proof; Finish/recover commands still need operation idempotency.

Browser terminal, arbitrary shell APIs, desktop discovery/update, and Web
plugin frontends are deferred. Native tmux/Windows Terminal remains the first
interactive surface.

## 12. Target repository

```text
src/agent_box/
  work_core/           durable kernel and invariants
  application/         facade, DispatchCoordinator, mutation ownership
  extensions/          Provider SDK, Host adapters, staged registry
  server/              local Host read/mutation API
  cli/                 application/daemon client

web/                    local-first Workbench

plugins/
  agent-box-harnesses/
  agent-box-cc-switch/
  agent-box-tmux/
  agent-box-git/
  experimental/
    agent-box-bwrap/
```

The current `agent_types.json`, Profile CRUD/apply stack, `launch.py`, ACS
adapter, legacy session supervisor, old TUI screens, and `gui-web` bridge are
removed only after a capability-by-capability parity ledger proves a successor
or records an explicit product deletion. A cleaner directory is not parity.

## 13. Architectural gates

### Gate 1 — Dispatch correctness

- canonical exact Ref/value handoff;
- preflight before materialization;
- typed receipt and honest ambiguity;
- accepted/requested/failed replay invokes nothing external;
- no new durable ontology or generic resource lifecycle.

### Gate 2 — Codex official vertical slice

- WorkBoard is the sole mutation owner through an application seam;
- exact Profile snapshot, Workspace, context, and pre-existing tmux pane;
- execution-private writable state;
- native SessionRef, explicit Finish, observations/evidence;
- explicit host-process/no-sandbox fact;
- no legacy direct launcher in the supported path.

### Gate 3 — Multi-driver proof

- OpenCode or Pi passes the same lifecycle and concurrency tests;
- incompatible continuation is rejected before effects;
- per-driver health failure is isolated;
- decide empirically whether one provider survives.

### Gate 4 — External catalog

- read-only cc-switch schema probe;
- exact non-secret snapshots survive plugin removal;
- credentials remain opaque and non-persistent;
- drift/missing authority fails visibly.

### Gate 5 — Web ownership transfer

- one daemon owns mutations;
- WorkBoard/CLI are clients;
- local authentication and operation idempotency are proven;
- Web mutation routes cannot bypass the Host application;
- rollback never blindly replays active/ambiguous Dispatches.

### Gate 6 — Sandbox contract

- at least one real agent-oriented Sandbox vertical slice, preferably two
  materially different providers;
- exact identity, lifecycle, stream, recovery, cleanup, and evidence proven;
- public contract contains only common facts demonstrated by implementations.

## 14. Final boundaries

This architecture deliberately makes Agent-Box smaller at the center and more
capable at the edge:

```text
Core is stable governance.
Host is one controlled application boundary.
Plugins own external products and materialization.
Web is a client, not a second backend.
Workflow owns progression.
ExecutionProvider owns one accepted native responsibility.
Binding makes exact composition visible.
Evidence reconciles expectation with reality.
```
## Preview closure status — 2026-08-28

The supported management boundary is Browser → loopback Local Web Host →
Application services → Work Core and Plugin SDK. The Web layer does not read
SQLite or encode Git, Codex, tmux, or provider-specific finalization. The
legacy WorkBoard/TUI and PyWebView bridge are retired after the verified E1→E2
browser vertical. Native Harness CLIs continue in external terminals.
