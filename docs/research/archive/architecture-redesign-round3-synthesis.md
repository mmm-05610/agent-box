# Agent-Box Architecture Redesign — Round 3 Synthesis
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-28

Status: final candidate for Round-4 review

## Executive decision

The target architecture is implementable without reopening Agent-Box's durable
ontology and without beginning with a Web rewrite. The migration has three
ordered seams:

1. repair the Dispatch invocation protocol;
2. establish the Host/application and plugin composition boundary while
   WorkBoard remains the sole mutation owner;
3. migrate Harness/profile/cc-switch behavior into official plugins, then hand
   mutation ownership to a local daemon and enable Web controls.

No production Sandbox contract is frozen in this sequence. Host-process launch
is reported as unsandboxed; bwrap remains experimental; a real agent-oriented
Sandbox vertical slice will define the later contract.

## 1. Final candidate component model

```text
Clients
  WorkBoard (first owner/client)
  CLI       (eventual daemon client)
  Web       (read-only first, mutating after daemon cutover)
  Desktop   (future WSL launcher + WebView only)
          |
          v
Host application
  mutation ownership lease
  commands / queries
  Binding draft and input proposals
  DispatchCoordinator
  Host-owned SnapshotStore
  plugin Host extensions
          |
          +--------------------+
          v                    v
Work Core                 Extension registry
  durable facts               contracts/providers/adapters
  atomic transitions          conformance/dependency loading
          ^                    |
          |                    v
          +------------ official and third-party plugins
```

The dependency direction is one-way. Core never imports Host, UI, Harness,
Profile, cc-switch, tmux, Git, or Sandbox implementations. Plugins depend on a
public provider/Host SDK, never Core repository/service internals.

## 2. Work Core remains stable in meaning

Core continues to own:

- Work and explicit Work completion;
- Execution identity and terminal sealing;
- frozen `(contract_id, Ref)` input associations;
- one Dispatch identity and its durable requested/accepted/failed/ambiguous
  facts;
- native/output Ref associations;
- append-only ResourceObservations and Evidence relations.

It does not gain Profile, Harness, Sandbox, Console, Credential, MCP, Plugin,
Workflow node, retry, scheduler, or Host ownership entities.

The Dispatch repair changes invocation semantics, not the ontology.

## 3. Minimal Dispatch protocol

### 3.1 Canonical provider input

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

The ordered tuple is canonical. Any grouped-by-contract mapping is a derived
compatibility view only. The envelope is non-persistent and belongs to the
public Provider SDK/API shape.

### 3.2 Ordering

```text
canonicalize Refs
-> static input-limit validation
-> atomically freeze inputs + request Dispatch
-> resolve declared non-materializing preflight inputs
-> side-effect-free provider preflight
-> resolve/materialize remaining inputs idempotently
-> provider.start
-> validate typed start receipt
-> atomically persist accepted receipt
```

Known invalid driver/Profile/continuation/Console combinations must fail in
preflight before Git/tmux/future Sandbox materialization. Critical identity and
drift checks repeat at start where TOCTOU remains possible.

### 3.3 Replay

Accepted idempotency replay reads the durable Dispatch receipt only. It calls no
ResourceProvider and no ExecutionProvider. Requested/ambiguous replay calls
nothing and reports ambiguity. Failed replay returns the recorded failure.

### 3.4 Receipt and recovery honesty

`ExecutionProvider.start()` returns a typed receipt bound to execution,
dispatch, and input digest. Recovery support is one of:

```text
NONE       historic facts only after Host restart
OBSERVE    native identity can be reacquired and observed
CONTROL    observe/finish/cleanup are restart-idempotent
```

Support is recorded with the accepted fact rather than inferred from a later
plugin version. A malformed receipt or an exception whose side effects cannot
be disproved leaves Dispatch requested/ambiguous, not falsely failed.

Round 3 demonstrates a zero-SQL-migration path by storing typed receipt metadata
in the accepted event and a canonical correlation representation in the
existing field. Round 4 must verify that this encoding is not hidden schema debt.

## 4. Resource resolution and operations

The architecture rejects both extremes: neither “all resolve is pure” nor
“resolve may do anything.” Resource providers declare the resolution effect
needed for Dispatch ordering. The minimum categories are:

```text
PURE
IDEMPOTENT_MATERIALIZATION
```

Rules:

- frozen Ref deterministically identifies the requested result;
- materialization replay returns the same identity or rejects drift;
- resolution may not create a hidden accountable task/run;
- accepted Dispatch replay never invokes it;
- cleanup/recovery claims must be explicit and tested;
- an in-memory operational object is not sufficient evidence of restart
  recovery.

The first real agent-oriented Sandbox may justify a richer operational SPI. It
is not designed from bwrap alone.

## 5. Official Harness plugin

`agent-box-harnesses` contains one accountable provider for the common
interactive responsibility model and private drivers for Codex, OpenCode, and
Pi. Codex App Server structured review remains a separate provider.

```text
official-harness-interactive
  static input superset
  side-effect-free preflight
  driver registry and health
  execution-private materialization
  native session correlation
  observe / finish / continuation validation
```

If the second real driver cannot share this responsibility/start/finish model
without provider-specific hidden lifecycle, the single-provider design is
cancelled and providers remain separate while still shipping in one package.

The provider's static limits declare the superset; the selected Profile drives
conditional validation in preflight. UI filtering improves usability but is
never the authority.

## 6. Profile, proposal, and snapshot protocol

Profile is an immutable declaration snapshot plus a stable identity/revision.
It is not a writable native home.

```text
Profile source snapshot
+ explicit capability source Refs
+ opaque credential-source Ref
-> execution-private config/session/cache/temp materialization
```

The existing one-input `prepare()` remains compatible. A new optional
`proposals()` method allows a Profile adapter to propose dependencies. The Host
does not accept foreign exact Refs minted by the Profile adapter. It delegates
each proposal to the owning input adapter, displays every prepared input, and
freezes each `(contract_id, Ref)` independently.

A Host-owned `SnapshotStore` retains immutable non-secret Profile/capability/
context snapshots needed after plugin uninstall. Serializers are allowlist-based;
secret values and reversible secret derivatives are excluded. Credential source
identity may be frozen even when secret value/revision remains unverifiable.

## 7. Plugin loading and compatibility

`PluginRegistration` remains structurally compatible. Loading becomes staged:

1. discover and build descriptors/registrations without runtime side effects;
2. validate unique Contract ownership;
3. stage Contract types;
4. validate provider input/support declarations against staged Contracts;
5. register valid plugin components atomically;
6. remove/disable consumers whose required owner failed, until stable.

This is a fixed-point validation process, not a package installer or semver
solver. Python distribution dependencies still install code. Missing or
incompatible Contracts produce explicit plugin diagnostics.

Round 4 must determine whether fixed-point removal is necessary for Preview or
whether a smaller all-contracts-first failure model is sufficient.

## 8. cc-switch bridge

`agent-box-cc-switch` is read-only and optional. It owns schema probing and
normalization, not Profile or Harness lifecycle. Non-secret definitions become
Host-retained snapshots; credentials remain opaque source references and are
resolved only during authorized materialization.

The bridge never silently refreshes a frozen definition, writes the cc-switch
database, or performs bidirectional sync. Unknown schema, deleted row, or
non-secret digest drift rejects preparation/resolution. Credential exactness is
reported unknown/unverifiable when cc-switch has no trustworthy revision.

## 9. Single-owner Host and Web migration

The long-term target is one local Host daemon. The migration uses explicit
ownership transfers rather than concurrent control planes.

```text
Phase 0: current WorkBoard is sole supported mutation owner

Phase 1: WorkBoard calls application facade and holds
         $AGENT_BOX_HOME/host/mutation.lock via flock

Phase 2: official Harness plugin vertical slice;
         optional Web is read-only

Phase 3: daemon starts in shadow/read-only mode;
         cutover releases WorkBoard lock, daemon acquires it;
         WorkBoard and CLI become daemon clients

Phase 4: Web mutations enabled through daemon

Phase 5: legacy GUI/TUI/launch/ACS direct paths removed after parity ledger

Phase 6: optional WSL desktop shell and browser terminal
```

Only the mutation owner opens writable repositories or runs migrations. Read
servers never create a home, migrate a database, or invoke provider effects.
Concurrent Finish/recover/Dispatch commands require Host operation identity and
idempotent read-back; the database lock alone is insufficient.

Preview does not require browser terminal. Native tmux/Windows Terminal remains
the interactive surface while Web eventually manages Work, Binding, Profile,
plugins, and Evidence.

## 10. Target repository after migration

```text
src/agent_box/
  work_core/           durable kernel
  application/         application facade, coordinator, ownership
  extensions/          Provider SDK, Host extensions, staged loader
  server/              local read/mutation HTTP and event APIs
  cli/                 in-process client first, daemon client after cutover

web/                    local-first Workbench

plugins/
  agent-box-harnesses/
  agent-box-cc-switch/
  agent-box-tmux/
  agent-box-git/
  experimental/agent-box-bwrap/
```

The current `agent_types.json`, profile repository/apply flows, `launch.py`, ACS
adapter, legacy session supervisor, old TUI pages, and `gui-web` bridge are
removed only after each capability has a tested replacement. Existing concrete
providers under `work_core` must migrate behind public plugin packages.

## 11. Implementation gates

### Gate A — Dispatch protocol

- accepted replay invokes zero providers;
- exact Ref/value envelope drives per-input observations;
- preflight precedes materializing resolution;
- typed receipt and ambiguity rules are tested;
- no SQL migration unless Round 4 disproves event-based receipt durability.

### Gate B — Official Harness vertical slice

- Codex Profile snapshot and private writable runtime;
- exact Workspace and tmux inputs;
- explicit Finish and continuation as a new Execution;
- no legacy direct launch path used;
- recovery claim matches restart evidence.

### Gate C — Second driver

- OpenCode or Pi uses the same provider responsibility model;
- driver health failure is isolated;
- static superset/preflight rejects foreign continuation before effects;
- concurrent state does not share a writable Profile home.

### Gate D — External catalog

- cc-switch schema is probed read-only;
- non-secret snapshot survives plugin uninstall;
- credential value never enters Binding/event/evidence;
- drift and missing authority fail visibly.

### Gate E — Host ownership

- second mutation owner cannot start;
- WorkBoard uses application facade;
- read-only Web changes no database/file/provider state;
- daemon cutover is reversible for inactive/terminal work;
- active/ambiguous work is never blindly replayed.

## 12. Remaining Round-4 questions

1. Does zero-schema typed receipt storage remain queryable and compatible, or
   should a minimal Dispatch receipt column/table be introduced explicitly?
2. Is `preflight_contract_ids()` plus effect categories the smallest sufficient
   API, or an emerging generic provisioning framework?
3. Can the staged fixed-point loader be simplified without ghost Contracts or
   load-order dependence?
4. Does a Profile `proposals()` bundle plus authority delegation remain usable
   without becoming a hidden workflow/config language?
5. Is `flock` plus a daemon cutover adequate on supported WSL filesystems, and
   what exact homes must be rejected?
6. Is the official multi-driver provider still transparent enough for Binding,
   evidence, health, and independent reviewer responsibility?
7. Which pieces are Preview P0 versus architecture-ready but deferred?

## Provisional go/no-go

The architecture is ready for final review, not yet broad implementation. The
model should remain frozen. The likely first implementation is the small
Dispatch protocol repair, followed by the application seam and Codex official
Harness vertical slice. Web mutation, cc-switch bridge, second driver, and a
production SandboxProvider follow behind explicit gates.
