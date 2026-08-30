# Agent-Box Architecture Redesign — Round 2 Adversarial Synthesis
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-28

Status: red-team findings accepted; requires focused validation

## 1. What survived attack

The following Round-1 decisions remain credible:

- Work/Execution/Binding/Dispatch/Ref/Provider/Observation remains the product
  center; no new workflow, Harness, Profile, Sandbox, Console, or credential
  Core entity is justified.
- `ExecutionProvider.start()` is the sole accountable start entry point.
- One official interactive Harness plugin with Codex/OpenCode/Pi drivers is
  viable only for their shared interactive responsibility model.
- Profile is an immutable/versioned materialization source; writable runtime
  state is Execution-scoped.
- Capability and credential-source dependencies must be visible as separate
  frozen inputs prepared before freeze.
- cc-switch is an optional read-only external authority behind a bridge plugin.
- Web is the desired long-term Workbench; desktop remains a thin optional shell.
- No generic production Sandbox SPI should be frozen before a real
  agent-oriented Sandbox vertical slice.

## 2. What did not survive attack

### 2.1 Directory-first migration

Rejected. Moving files into `application/`, `server/`, and plugins before
repairing the invocation protocol would preserve the same hidden side effects
under cleaner names.

### 2.2 “All ResourceProvider.resolve calls must be pure”

Rejected as an absolute rule. A Workspace contract may require materializing a
worktree path; a managed tmux console may require creating a session/pane. The
minimal truthful rule is:

1. exact frozen Ref determines the operation;
2. replay is idempotent and returns the same materialization identity;
3. no hidden accountable task/run is created;
4. effect and cleanup semantics are declared;
5. accepted Dispatch replay must not repeat effectful resolution accidentally.

### 2.3 Mutating Web as the first replacement UI

Rejected for the immediate Preview path. A long-term Web mutation boundary is
still valid, but Web + CLI + WorkBoard cannot all independently own controls.
Until a single Host daemon/owner protocol exists, WorkBoard remains the sole
mutating client and an early Web surface is read-only.

### 2.4 A directly shared Profile writable overlay

Rejected. A profile overlay is a versioned input source. Every new Execution
receives a private writable materialization. Continuation restores only the
native session state explicitly addressed by a frozen SessionRef and must reject
unsafe concurrent reuse.

### 2.5 Arbitrary resolved operational Python objects as the final SPI

Rejected as a durable/recovery design. An in-memory object with `launch()` may
be a local spike technique, but it cannot by itself survive Host restart, cross
process execution, plugin unload, or remote workers. Operational calls require
stable provider identity, operation/lease identity, and re-acquisition rules.

## 3. Confirmed current defect: accepted replay resolves again

Current accepted idempotency replay reconstructs the start request by calling
`_resolve_inputs()` again. It correctly avoids a second `provider.start()`, but
it may repeat every ResourceProvider effect. For a future paid/remote Sandbox,
that can create a second instance or charge twice while returning an already
accepted Dispatch receipt.

Required distinction:

```text
new Dispatch attempt
  -> validate/freeze
  -> resolve/materialize
  -> provider.start
  -> accepted receipt

accepted idempotency replay
  -> read durable Dispatch receipt
  -> do not resolve
  -> do not start
  -> return prior receipt/status
```

If an API caller needs the old request view, it must be reconstructed from
durable exact inputs without invoking providers, or the replay API must return a
receipt rather than an `ExecutionStartRequest`.

## 4. Required exact input envelope

The attack confirmed that the provider invocation needs a canonical ordered
mapping of exact Ref to resolved value:

```python
@dataclass(frozen=True)
class ResolvedExecutionInput:
    contract_id: str
    ref: Ref
    value: object
```

`ExecutionStartRequest.resolved_inputs` should be the canonical representation.
A grouped mapping may be exposed as a derived compatibility view, but there
must not be two independently constructed input representations.

This supports:

- multiple values under one Contract;
- per-input projection/consumption observations;
- routing by exact `Ref.provider`;
- clear error attribution;
- driver-level conditional validation before effects.

## 5. Required Dispatch ordering

The red team exposed a late-validation failure: a multi-driver Harness provider
may discover that a Profile/continuation combination is invalid only after Git
or tmux has already materialized resources.

The candidate sequence to validate is:

```text
1. canonicalize exact input Refs
2. validate static provider limits
3. freeze inputs + requested Dispatch atomically
4. resolve identity/config-only inputs required for provider preflight
5. provider preflight validates selected driver and conditional requirements
6. materialize/provision effectful resources idempotently
7. provider.start owns native Harness responsibility
8. persist accepted receipt or failed/ambiguous state
```

The architecture must not invent a generic workflow around these phases. They
are one Dispatch protocol. Round 3 must determine whether preflight is a public
ExecutionProvider method, a Host adapter, or a start-plan compilation step.

## 6. Recovery honesty

Current accepted correlation is a string, and finish/recovery behavior in some
plugins depends on in-memory flags. This is not enough for universal restart
recovery.

Preview must declare one of three support levels per provider:

```text
none       restart loses operational control; historic facts remain
observe    provider can reacquire and observe native identity
control    provider can reacquire, finish, and cleanup idempotently
```

The architecture must not claim `control` until a restart test proves it.
Whether a typed durable start receipt is a P0 Core field, an Evidence/Artifact
Ref, or provider-owned state is a Round-3 decision. No generic retry engine is
authorized.

## 7. Plugin ecosystem blockers

### 7.1 Dynamic driver requirements

Static `input_limits()` cannot express all Profile-selected driver constraints.
Static limits should describe the superset and a side-effect-free preflight must
validate the exact selected driver before provisioning.

### 7.2 Candidate bundle authority

A Profile adapter may propose defaults but may not mint exact Refs for resources
owned by other authorities. Bundle preparation must delegate each selector to
the owning adapter/provider before freeze and display every result independently.

### 7.3 Contract ownership and plugin load topology

The current loader has no explicit dependency graph. A minimal Preview design
must define one Contract owner, deterministic contract-first registration, and
clear failure for missing/incompatible dependencies without building a package
manager.

### 7.4 Artifact retention after uninstall

Historical Core rows survive plugin removal, but a snapshot stored only in a
plugin directory may not. Immutable, non-secret context/profile/capability
snapshots required for audit must be copied to a Host-owned artifact store and
referenced by ArtifactRef before the Execution relies on them.

## 8. Web delivery decision gate

Long-term target:

```text
one local Host daemon
  <- Web client
  <- CLI client
  <- optional desktop shell
```

Immediate Preview target:

```text
WorkBoard = sole mutation owner
tmux/native terminal = interaction
optional Web = read-only Binding/Evidence view
```

Web mutation starts only after proving:

1. one Host process owns all mutations for a database;
2. finish/recover/attach commands have idempotent operation identity;
3. CLI becomes a client rather than a second in-process owner;
4. loopback authentication and WebSocket authorization exist;
5. the application service is exercised by WorkBoard first.

## 9. Round-3 validation tasks

### Track A — Dispatch protocol

Produce an exact API/state-machine delta for:

- accepted replay without resolve/start;
- canonical exact Ref/value envelope;
- preflight before effectful resource operations;
- accepted receipt and recovery support levels;
- compatibility with current repository and tests.

### Track B — Plugin composition

Prove the smallest workable design for:

- one Harness provider with per-driver validation/health;
- profile proposal expanded by owning authorities;
- execution-private writable materialization;
- contract-first plugin loading and dependency errors;
- Host-owned immutable snapshots.

### Track C — Host/Web migration

Prove a single-owner deployment and transition:

- WorkBoard as first client of application services;
- read-only Web boundary before mutation;
- later daemon, CLI client, and desktop shell;
- explicit deletion gates for legacy GUI/TUI/launch/ACS paths.

## 10. Round-2 verdict

The target architecture is not rejected, but it is not ready for directory or
UI implementation. The next work is a small protocol/design verification round,
not further product-market research and not a broad refactor.

No finding justifies reopening the Core ontology. The strongest likely Core
change remains a non-persistent exact input envelope plus corrected replay/
receipt semantics; the rest belongs in Host and Plugin SDK outer rings.
