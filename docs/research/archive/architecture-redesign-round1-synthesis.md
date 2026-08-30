# Agent-Box Architecture Redesign — Round 1 Synthesis
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-28

Status: attackable candidate, not a final architecture

## 1. Converged product boundary

The three independent reviews converge on the same center:

> Agent-Box governs one accountable Execution by freezing exact external
> resources, dispatching once, correlating native responsibility, and
> reconciling observed facts. Workflow progression, Harness behavior,
> configuration catalogs, terminals, sandboxes, and CI remain external
> authorities integrated through plugins.

The existing Core ontology is sufficient. Profile, Harness, Sandbox, Console,
MCP, Skill, Credential, Workflow node, and Participant must not become Core
entities.

## 2. Candidate dependency structure

```text
Web Workbench / CLI / transitional WorkBoard
                    |
             Host application API
                    |
        +-----------+------------+
        |                        |
   Work Core                 Extension Host
        |                        |
        |          +-------------+------------------+
        |          |             |                  |
        |   harnesses plugin   tmux/git       cc-switch bridge
        |          |
        |     Harness drivers
        |   Codex/OpenCode/Pi
        |
        +-- durable Work/Execution/Binding/Dispatch/Observation facts

Future agent-oriented sandbox plugin is deliberately not fixed in Round 1.
```

Dependency rules:

1. Core imports no concrete plugin, Harness, UI, workflow, sandbox, or catalog.
2. UI calls one Host application API and never SQLite, tmux, cc-switch, or a
   Harness implementation directly.
3. Plugins import a public SDK, not repository or service internals.
4. Plugin-owned operational protocols do not become Core ontology merely
   because more than one plugin uses them.
5. Only one accountable ExecutionProvider accepts a Dispatch.

## 3. Target package shape

```text
src/agent_box/
  work_core/          stable kernel and durable facts
  application/        commands, queries, DispatchCoordinator
  extensions/         plugin discovery, conformance, Host extensions
  server/             local HTTP/WebSocket boundary
  cli/                client of the same application boundary

web/                   local-first Web Workbench

plugins/
  agent-box-harnesses/ official interactive Harness integration
  agent-box-cc-switch/ optional read-only external catalog bridge
  agent-box-tmux/      console identity and control
  agent-box-git/       source/workspace authority and projection
  experimental/
    agent-box-bwrap/   degraded local fallback, not the target Sandbox SPI
```

The current WorkBoard remains a transitional client and behavior reference.
It must not become a second application layer. The future desktop application,
if built, is only a WSL selector, Host launcher, connection manager, and WebView.

## 4. Accountable start boundary

`ExecutionProvider.start()` remains the sole accountable start entry point.
For the official plugin, one interactive provider composes:

```text
exact Profile input
+ exact Workspace input
+ exact context/capability/credential inputs
+ optional exact Console input
+ future optional exact Sandbox input
    -> driver-specific native launch plan
    -> native session/run correlation
    -> observe/recover/finish
```

Codex, OpenCode, and Pi are drivers only while they share the same interactive
responsibility model. A structured, non-interactive reviewer or a platform that
accepts and owns a complete task may remain a separate ExecutionProvider.

Sandbox and Console implementations own substrate-specific operations. They do
not own the aggregate Execution outcome. A product that merely creates an
environment is a Resource/operational provider; a product that accepts the task
and owns the agent run is an ExecutionProvider.

## 5. Profile and capability model

Profile means a stable declaration and materialization source, not a shared
writable Harness home. The default model is:

```text
stable Profile declaration/revision
+ immutable base configuration
+ explicit shared capability Refs
+ opaque credential-source Ref
    -> execution-private writable config/session/cache/temp
```

Session, transcript, approval/trust state, writable cache, locks, sockets, and
temporary state are Execution-scoped. MCP/plugin/skill definitions may be
shared only as explicit versioned sources. Credential values are never copied,
hashed into Binding, or persisted as evidence.

Selecting a Profile may propose dependent resources, but expansion occurs in
the Host draft before freeze:

```text
select Profile
  -> Host adapter prepares candidate input bundle
  -> UI shows every exact Ref
  -> user reviews
  -> Core freezes individual inputs
```

No ResourceProvider may add hidden inputs during `resolve()`.

## 6. cc-switch relationship

cc-switch remains an optional external catalog authority. The bridge plugin is
read-only and contains all schema compatibility code. Agent-Box does not vendor,
launch, mutate, or mirror cc-switch as a required subsystem.

```text
cc-switch selector
  -> bridge reads supported schema
  -> redacted non-secret snapshot / opaque credential source
  -> exact candidate Ref before freeze
  -> resolve validates drift at Dispatch
```

No bidirectional synchronization is proposed. The harness plugin works without
cc-switch and consumes the same plugin-owned capability Contracts from local or
third-party providers.

## 7. Web Host boundary

The architectural move is not “rewrite the GUI in React”; it is “establish one
application boundary.” The first Web version is local-first and loopback-only.
It covers:

- Work and Execution history;
- provider selection and Binding draft/review;
- freeze and Dispatch;
- attach/finish/recovery actions;
- evidence reconciliation;
- plugin/profile/integration discovery and diagnostics.

Plugins contribute bounded descriptors, selectors, choices, candidate input
bundles, typed actions, and diagnostics. They do not inject arbitrary frontend
code in Preview. Browser terminal is not P0; native tmux/Windows Terminal attach
keeps the first vertical slice smaller and safer.

CLI, Web, and transitional WorkBoard must call the same application services.
Only one Host process may own mutations for a given database. Read models and
event streaming must not become new sources of truth.

## 8. Verified architectural gaps

Round 1 found four gaps that the previous directory-level design did not expose.

### 8.1 Start request loses exact Ref

Current `ExecutionStartRequest.inputs` groups resolved values by Contract and
discards the exact Ref/value pairing. This is insufficient when several inputs
share a Contract, when an ExecutionProvider must emit per-input observations,
or when future operational adapters are selected by `Ref.provider`.

Candidate non-persistent envelope:

```python
ResolvedExecutionInput(
    contract_id: str,
    ref: Ref,
    value: object,
)
```

This is an invocation-shape correction, not new durable ontology or schema.
Round 2 must attack whether it belongs in Core's public DTO or in the Host SDK,
and whether grouped `inputs` should be retained for one compatibility version.

### 8.2 `resolve()` is carrying hidden effects

Current Git/tmux implementations already blur identity resolution and
materialization. A real Sandbox cannot safely hide create/lease/cleanup/recover
inside `ResourceProvider.resolve()` because the method lacks Dispatch context,
durable operation identity, and compensation semantics.

Candidate rule:

- `resolve()` validates exact identity and returns a typed resolved value;
- the accountable ExecutionProvider orchestrates effects;
- substrate-specific operations live behind a plugin-level operational adapter;
- Host `DispatchCoordinator` owns the invocation sequence around Core facts;
- no generic Sandbox SPI is frozen until a real vertical slice proves it.

Round 2 must attack whether an operational object returned by `resolve()` is an
acceptable Preview shortcut or a repeat of Phase-1 coupling.

### 8.3 Host input adapters cannot prepare bundles

The current WorkBoard `ResourceInputAdapter.prepare()` returns one input. A
Profile must be able to propose multiple visible inputs before freeze. The Host
extension surface needs a candidate bundle while preserving individual Core
`(contract_id, Ref)` inputs.

This is Host/UI draft behavior, not a Binding bundle entity.

### 8.4 Cross-plugin dependency topology is implicit

Python package dependencies ensure imports exist but do not declare plugin
load order, Contract ownership, version compatibility, or optional provider
availability. Current diagnostics understand an already-installed environment,
but loading and runtime compatibility remain underspecified.

Round 2 must choose the smallest truthful Preview solution without creating a
plugin marketplace or dependency solver.

## 9. Sandbox decision held open

No production SandboxProvider is selected in Round 1. Existing bwrap code is
retained as an experimental/degraded local fallback and contract test source.
Host-process launch remains explicitly unsandboxed when no Sandbox input is
bound.

A Sandbox Contract will be extracted only after at least one agent-oriented
sandbox vertical slice establishes:

- what exact identity can be frozen before Dispatch;
- whether the instance is pre-existing or created after Dispatch;
- workspace/config/credential materialization;
- interactive stream and optional tmux bridging;
- observe/recover/cleanup semantics;
- actual evidence and security limitations.

The term `SandboxRef` is acceptable. Assurance belongs in observations; using
the term does not allow bwrap or another provider to overstate isolation.

## 10. Migration candidate

1. Freeze current Core semantics and keep the existing Preview runnable.
2. Decide the exact-Ref start envelope and side-effect boundary.
3. Introduce one application/Host boundary and make WorkBoard call it.
4. Add bounded Host extension descriptors and candidate input bundles.
5. Build `agent-box-harnesses` with Codex first, then OpenCode and Pi.
6. Build the read-only cc-switch bridge without changing the Harness plugin.
7. Add a read-only Web skeleton, then governed Binding/Dispatch controls.
8. Cut CLI and Web mutations over to the same application service.
9. Remove legacy direct launch/profile/ACS control paths only after parity.
10. Spike a real agent-oriented sandbox and then decide its plugin contract.
11. Add an optional WSL desktop shell only after Host lifecycle is stable.

## 11. Round-2 attack targets

The next round must try to disprove the candidate architecture along these
axes:

1. **Kernel purity:** Does moving effect orchestration to a Host coordinator
   weaken Dispatch ownership or create split-brain state transitions?
2. **Invocation exactness:** Is `ResolvedExecutionInput` necessary and minimal,
   or can existing data preserve Ref/value association without changing Core?
3. **Plugin feasibility:** Can one static ExecutionProvider truthfully represent
   Codex/OpenCode/Pi input requirements and driver health?
4. **Operational composition:** Can Console/Sandbox/Git lifecycle work without a
   premature generic resource lifecycle framework?
5. **Host convergence:** Can Web, CLI, and WorkBoard truly share one mutation
   boundary during migration?
6. **Security:** Does the cc-switch bridge or plugin selector surface create a
   secret leak/RCE path that invalidates the design?
7. **Delivery:** Is this architecture a Preview-killing rewrite rather than a
   controlled strangler migration?

## 12. Provisional verdict

The product center and package decomposition are credible, but implementation
must not start from the directory tree alone. Four boundary issues require
adversarial resolution first: exact Ref/value invocation, side-effectful
resource lifecycle, multi-input Host preparation, and cross-plugin dependency
topology.

No evidence currently requires reopening Work/Execution/Binding/Dispatch/Ref/
Provider/Observation ontology. The likely changes are a small invocation DTO and
an application/Plugin SDK outer ring.
