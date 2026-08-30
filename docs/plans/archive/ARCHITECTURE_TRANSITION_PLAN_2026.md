# Agent-Box Architecture Transition Plan 2026
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Status: Phase 0, Atomic Finalization, and Git detached-worktree capture implemented and verified locally on 2026-08-28; later phases not started

Depends on: [Target Architecture](../architecture/AGENT_BOX_TARGET_ARCHITECTURE_2026.md)

## Principle

Do not refactor by directory. Each phase must first prove a behavioral gate,
then move ownership, and only then delete the predecessor.

## Phase 0 — Dispatch protocol repair

Status: complete (implementation and focused verification report:
[`DISPATCH_PROTOCOL_REPAIR_PHASE_0_2026-08-28.md`](../validation/DISPATCH_PROTOCOL_REPAIR_PHASE_0_2026-08-28.md)).

Scope:

- `ResolvedExecutionInput` canonical handoff;
- derived compatibility `inputs` view;
- accepted replay with zero registry/provider calls;
- optional provider preflight and two resolution-effect categories;
- typed start/Dispatch receipts;
- versioned bounded correlation encoding;
- honest ambiguous start handling.

Not in scope:

- daemon, Web, Profile proposals, cc-switch, second driver, Sandbox;
- new Dispatch lifecycle state or generic retry/recovery engine;
- SQL migration unless implementation proves the event/correlation encoding
  cannot satisfy the accepted receipt query.

Exit tests:

- all replay states invoke zero external code;
- same-Contract inputs retain exact Ref/value pairing;
- dynamic incompatibility fails before the one permitted materializer;
- malformed/indeterminate start is not recorded failed or accepted;
- receipt round-trips after process restart and plugin removal.

## Phase 0.5 — Atomic Finalization

Status: complete (implementation and focused verification report:
[`ATOMIC_EXECUTION_FINALIZATION_2026-08-28.md`](../validation/ATOMIC_EXECUTION_FINALIZATION_2026-08-28.md)).

Scope:

- first terminal transition exclusively through `apply_finalization()`;
- one SQLite transaction for native/output Refs, typed observations, terminal
  projection, events, and operation receipt;
- canonical bundle digest and restart-safe idempotent replay;
- late ResourceObservation remains append-only and cannot rewrite terminal facts.

Not in scope: Git detached worktrees, output/tree capture, WorkspaceRef output
capture, Artifact Store, WorkBoard Finish UX, workflow progression, or a
Finalization domain entity.

Exit tests: ordinary terminal observation is rejected; empty-output finalization,
rollback injection, digest conflicts, replay, continuation, Work independence,
and late evidence behavior are verified.

## Phase 0.6 — External Git detached-worktree output capture

Status: complete for the minimal E1 → E2 material handoff. The external
`agent-box-git` plugin owns exact Git materialization, execution-scoped detached
worktrees, snapshot commits, internal output refs, and Host finalization
contributions. Core remains Git-free and uses the existing atomic finalization
boundary. Artifact CAS, Sandbox, Web, LangGraph, Actions, and multi-Harness
features remain out of scope.

## Local Web Host + Minimal Web Workbench

Status: implementation started. The local Host owns mutations, exposes the
versioned bounded JSON API, persists Host drafts, and serves the built
Workbench. The E1→E2 browser vertical gate remains open until the controlled
Git/fake-provider browser test is green.

## Phase 1 — Thin application seam and WorkBoard owner

Scope:

- introduce a narrow application facade around existing use cases;
- move invocation sequencing toward `DispatchCoordinator` without changing
  durable Core semantics;
- WorkBoard acquires `$AGENT_BOX_HOME/host/mutation.lock` before migrations,
  writable repository, operational registry, or provider construction;
- supported alternate mutating entry points either use the same owner or refuse;
- isolate legacy GUI/direct-launch tools on a separate legacy home.

Exit tests:

- a second WorkBoard/mutator fails before effects;
- WorkBoard's recorded path uses the facade;
- existing Core facts and terminal invariants are unchanged;
- no read-only process creates/migrates a database.

## Phase 2 — Official Codex Harness vertical slice

Scope:

- create `agent-box-harnesses` distribution;
- one private Codex driver behind `official-harness-interactive`;
- minimal Profile declaration and allowlisted immutable snapshot;
- execution-private writable config/session/temp;
- exact Workspace, context, and pre-existing `TmuxPaneV1` inputs;
- side-effect-free Codex preflight;
- native SessionRef, explicit Finish, continuation as a new Execution;
- ResourceObservations and redacted runtime manifest;
- explicit `sandbox=none`, `filesystem/network isolation=none` facts.

Registry scope:

- all official Contracts staged before provider validation;
- atomic official registry generation;
- no fixed-point partial readiness yet.

Exit tests:

- fresh start, multi-turn interaction, explicit Finish;
- accepted replay produces no resolve/start;
- new Execution continues old SessionRef without reopening the old Execution;
- Profile state is private to the Execution;
- plugin uninstall leaves durable Core facts and Host-retained snapshots readable;
- legacy launch path is absent from the supported vertical slice.

## Phase 3 — Second driver and compositional Profile inputs

Scope:

- add OpenCode or Pi;
- per-driver lazy health;
- static input superset plus selected-driver preflight;
- one-level Profile input proposals;
- authority-delegated exact Ref preparation;
- Host-owned SnapshotStore retention and proposal audit display;
- concurrency and incompatible-continuation checks.

Decision gate:

- if both drivers share start/observe/finish/continuation/private-state semantics,
  keep one ExecutionProvider;
- otherwise register separate ExecutionProviders in the same distribution.

Exit tests:

- failure of one driver does not disable another;
- foreign continuation fails before materialization;
- two Executions never share writable Profile state accidentally;
- every proposed dependency is prepared by its actual authority and displayed
  as an independent frozen input.

## Phase 4 — cc-switch bridge

Scope:

- `agent-box-cc-switch` optional distribution;
- read-only supported-schema adapter;
- non-secret provider/MCP/skill/prompt snapshot;
- opaque credential-source identity;
- no write-back or bidirectional sync;
- explicit drift, deletion, and unknown-schema errors.

Exit tests:

- Harness plugin has no import/runtime dependency on cc-switch;
- selected definitions survive bridge uninstall as Host-owned snapshots;
- credential values/headers/env secrets do not enter Binding/events/evidence;
- immutable definition drift rejects rather than silently refreshing.

## Phase 5 — Read-only Web Inspector

Optional before recording; not a prior-phase blocker.

Scope:

- Work, Execution, Binding, Dispatch, Ref, Observation, Evidence queries;
- plugin/profile/driver health display;
- loopback-only read server;
- no repository migration, draft mutation, provider controls, or terminal API.

Exit tests:

- database/files/events remain byte-for-byte unchanged under reads;
- missing/outdated home is reported, never initialized;
- browser cannot invoke launch/finish/attach or arbitrary argv.

## Phase 6 — Host daemon and Web mutations

Scope:

- daemon acquires mutation lock before readiness;
- WorkBoard and CLI convert to Host clients;
- explicit lock handoff and rollback procedure;
- authenticated local mutation API;
- operation idempotency for Dispatch/Finish/recover;
- enable Binding Composer and Execution controls in Web.

Exit tests:

- exactly one daemon owns mutations;
- concurrent clients produce one governed effect;
- active/ambiguous Dispatch is never replayed during cutover/rollback;
- Web cannot bypass application services;
- local origin/session/CSRF rules are enforced.

## Phase 7 — Legacy retirement

Use a capability ledger, not a directory checklist.

Candidates:

- `agent_types.json` and legacy Harness registry;
- Profile CRUD/apply stack;
- `launch.py` direct launch;
- ACS adapter and cc-switch submodule dependency;
- legacy session supervisor;
- old TUI Profile/library screens;
- `gui-web` PyWebView/data bridge;
- preview scripts used as normal operations.

Delete one capability only after:

- successor behavior exists and is tested, or deletion is an explicit product
  decision;
- existing user data has an import/read story;
- no supported control path depends on it;
- rollback window has passed.

## Phase 8 — Agent-oriented Sandbox validation

Independent of Web delivery.

Scope:

- select a real agent-oriented sandbox product;
- verify exact pre-Dispatch identity versus post-Dispatch instance identity;
- workspace/config/capability/credential projection;
- PTY/stream and optional tmux bridge;
- observe/recovery/cleanup and post-run artifacts;
- authority and evidence limitations.

Only after real validation:

- decide `SandboxRef` Contract ownership;
- define the smallest plugin-level operational interface;
- keep products that accept and own the whole task as ExecutionProviders;
- decide whether experimental bwrap remains a fallback.

## Web closure — 2026-08-28

The Local Web Host is the sole Preview management owner. The controlled
browser E1→E2 product loop is verified, including persisted Host Finish
operations and exact WorkspaceRef continuation. WorkBoard/TUI and the legacy
PyWebView bridge are retired; native Harness terminals remain external.

- browser terminal and arbitrary shell API;
- WSL desktop distribution selector/updater;
- plugin marketplace, hot reload, permission sandbox;
- public HarnessDriver SDK;
- generic Console/Sandbox/provisioning/compensation framework;
- workflow builder, scheduler, retry engine, agent supervisor;
- new Core entities for Profile/Harness/Sandbox/Console/Plugin/Credential.

## Explicitly deferred
