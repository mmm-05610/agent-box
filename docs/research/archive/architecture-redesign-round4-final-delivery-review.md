# Agent-Box Architecture Redesign — Round 4 Final Delivery Review
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-28

Status: delivery decision for Preview implementation

Perspective: delivery owner under a tight Preview schedule; adversarial review
of the Round 3 synthesis and the Round 1–3 Web/Host/plugin decisions.

## Executive decision

The architecture is safe to implement, but the Preview cut is smaller than the
target architecture. The Preview must prove one governed, repeatable
Execution—not a Web migration, daemon migration, plugin ecosystem, or desktop
product.

```text
Preview mutation owner: WorkBoard, exactly one process per home
Preview interaction: native tmux + the selected Harness
Preview provider: official interactive Harness provider, Codex first
Preview Web: optional read-only facts/evidence inspector
Preview daemon/Web mutations/legacy deletion: after the recording gate
```

There is no Preview go if a second process can open a writable Core repository,
resolve effectful resources, or call provider controls on the same home. The
database's one-Dispatch constraint is not an ownership mechanism. The proposed
`flock` is useful only when every supported entry point honors it and refuses a
direct fallback.

The Round 3 design is therefore approved with these delivery changes:

1. Make the Dispatch protocol and WorkBoard owner boundary the only Preview
   infrastructure critical path.
2. Build one Codex vertical slice through the new application seam; keep the
   driver protocol private and run host-process + tmux.
3. Treat a second driver, cc-switch, read-only Web, daemon cutover, and richer
   Host SDK as separately gated work. None may be a prerequisite for the
   recording.
4. Do not delete legacy capabilities because a replacement directory exists.
   Use a capability ledger and remove only after a tested successor or an
   explicit product decision.

## Decision by priority

### P0 — required before the Preview recording

| Area | Delivery requirement | Failure disposition |
| --- | --- | --- |
| Dispatch | Canonical ordered `(contract_id, Ref, value)` inputs; freeze/requested before resolution; pure preflight before any materialization; typed accepted receipt; accepted replay calls no provider or resolver. | Stop. A late driver rejection or replayed materialization invalidates the slice. |
| Ambiguity | Provider start, effectful resolution, and persistence failures distinguish failed from ambiguous. A crash after native start never becomes an automatic retry. | Stop and show ambiguous/blocked recovery; do not compensate by guessing. |
| Owner | WorkBoard acquires the per-home lock before migrations, writable repository, operational registry, or provider construction. A second owner exits before provider effects and does not fall back to direct library calls. | Stop. “Supported clients only” is acceptable only if the runbook and every supported entry point enforce it. |
| Application seam | The recorded WorkBoard path invokes the transport-neutral application facade. It must preserve existing Core facts and draft behavior; this is not a directory-wide refactor. | Keep current WorkBoard path as rollback, but do not claim the new architecture until the vertical slice exercises the seam. |
| Official Harness | Codex profile snapshot + exact Workspace, Prompt/context, and required `TmuxPaneV1`; execution-private writable state; no shared Profile home; native SessionRef; explicit Finish; observations/evidence. | No legacy direct launcher in the supported path. Host-process launch is explicit and unsandboxed. |
| Preflight | Selected driver, continuation, capability, credential-source, and profile compatibility are rejected side-effect-free before Git/tmux/runtime creation. UI filtering is not validation. | Dispatch fails before external resources are created. |
| Plugin loading | For the official set, build/discover has no effects, all Contract owners are staged before provider validation, unknown input Contracts fail deterministically, and registry commit is atomic. | Fail closed before readiness; never depend on entry-point order. |
| Legacy isolation | Legacy GUI, direct launch, ACS apply, and preview scripts do not operate on the new Preview home or become an alternate owner. Their continued existence must be explicit and isolated. | Keep them as frozen compatibility tools only on an isolated legacy home. |

P0 does not require a daemon or a browser. It does require enough owner-lock
and application-boundary behavior to make the WorkBoard process the sole
supported mutator.

### P1 — architecture-ready work after the Preview gate

These are necessary to make the long-term architecture real, or to make a
public multi-plugin claim honest, but they are not prerequisites for a Codex
recording:

* a second real driver (OpenCode or Pi), with per-driver health, continuation
  rules, private state isolation, and the same preflight/start/finish evidence;
* full contract dependency diagnostics, including fixed-point removal of
  consumers whose owner plugin failed. Preview may use an explicit official
  plugin set with all-contracts-first staging and fail-all on missing required
  Contracts; it may not use alphabetical or discovery-order behavior;
* the Host-owned SnapshotStore, Profile proposals delegated to each owning
  adapter, and uninstall-stable non-secret snapshots;
* the read-only cc-switch bridge, including one SQLite read transaction,
  public-definition digest versus opaque credential-source identity, drift
  diagnostics, and no bidirectional writes;
* Host-owned immutable evidence/material artifacts that remain available after
  the producing plugin is removed;
* a real restart test for each advertised recovery level (`none`, `observe`,
  `control`), with no claim stronger than the evidence;
* a remote agent-oriented sandbox spike before publishing any Driver or
  Sandbox operational API;
* daemon shadow mode, WorkBoard/CLI HostClient conversion, and the explicit
  owner handoff described below;
* Web mutation, local session/origin/CSRF security, operation idempotency, and
  browser attach/terminal decisions;
* a complete capability-by-capability legacy migration ledger.

### Defer — explicitly outside this delivery

* browser terminal/xterm, WebSocket terminal transport, and arbitrary shell or
  argv execution from a browser;
* WSL desktop shell, Windows-native folder picker, multi-distro discovery, and
  updater/install flows;
* generic production Sandbox or Console SPI, bwrap as a claimed security
  boundary, and remote execution support;
* public third-party HarnessDriver SDK, arbitrary plugin frontends,
  background plugin jobs, marketplace, hot reload, or plugin security claims;
* generic settings CRUD, nested Harness configuration editors, raw filesystem
  editors, system/binary installers, and full legacy GUI parity;
* workflow progression, retry orchestration, team/participant entities, or new
  Core ontology.

## Attack on phase ordering

The synthesis has the right direction but contains two delivery hazards if
read as one continuous implementation plan.

First, “application seam -> official plugin -> optional Web -> daemon” is safe
only if the seam and lock are deliberately small. A broad `application/`,
`server/`, or Web rewrite before the Dispatch protocol is tested merely moves
the current hidden effects under cleaner names. Second, the Host migration
document's Phase 2 acceptance mentions Codex plus a second driver, while the
plugin protocol correctly makes the second driver a later proof. The Preview
must use the latter ordering: Codex first; second driver is a P1 gate.

The smallest safe order is:

```text
0. Freeze the Preview home, runbook, and supported mutation entry points.
1. Repair Dispatch envelope, ordering, replay, receipt, and ambiguity tests.
2. Add the thin application facade and per-home WorkBoard ownership lease.
3. Build and record the Codex + Profile + Workspace + tmux + Finish slice.
4. Optionally add a read-only Web inspector, independently removable.
5. Prove a second driver, snapshots/cc-switch, and restart behavior.
6. Build daemon shadow and HostClient; perform one explicit owner handoff.
7. Enable Web mutations only with the daemon as sole owner.
8. Delete legacy paths only after capability parity and import/reference gates.
9. Consider desktop, browser terminal, and a real Sandbox last.
```

Step 0 is not bureaucracy: it prevents a legacy GUI, root CLI, or preview
script from quietly becoming the second implementation while the new slice is
being built. Step 4 can be omitted without changing the recorded path.

## Single mutation owner, lock, and daemon handoff

### Preview owner contract

`$AGENT_BOX_HOME/host/mutation.lock` held by a live file descriptor is a good
local lease for the supported WSL/Linux filesystem. It is not a universal
enforcement boundary. The implementation must therefore:

* reject homes on unvalidated `/mnt/<drive>` filesystems for mutation;
* acquire the lock before migrations, writable DB access, registry/provider
  construction, or any effectful adapter setup;
* make `owner.json` diagnostic only—never use a stale PID or JSON record to
  override the kernel lock;
* make all documented mutation commands either contact the owner or fail with
  owner information; never silently open Core directly;
* keep read-only clients on an explicit non-creating, non-migrating read path;
* run a SIGKILL test proving lock release and a second-owner test proving the
  loser performs no provider work.

The lock cannot stop arbitrary old Python imports or direct SQLite writes. For
Preview, that limitation must be addressed by scope: the supported runbook
uses one new Preview home, legacy paths are forbidden from that home, and the
release must not advertise unsupported direct-library control as a valid path.

### Handoff contract

Daemon cutover is not a restart convenience; it is an ownership transfer. The
only safe sequence is:

```text
quiesce new commands
-> finish or explicitly block active/ambiguous operations
-> close WorkBoard mutation owner and release fd
-> daemon acquires the same lock
-> daemon validates home/protocol/registry and migrates before readiness
-> WorkBoard and CLI reconnect as HostClients
-> Web remains read-only during burn-in
```

There must never be a supported interval with WorkBoard and daemon both able to
invoke providers. If lock acquisition fails, daemon exits; it must not run a
partially mutating fallback. If an operation is active, ambiguous, or in
finalization, cutover is blocked—not forced by stale metadata. A daemon crash
after provider side effect leaves the durable operation/Dispatch ambiguous and
does not cause a second `resolve()` or `start()` on restart.

The `flock` design is P0 for the WorkBoard owner transition, but daemon
handoff itself is P1. Building it before the Codex slice is a Preview-killing
scope expansion.

## Read-only Web value and cut line

Read-only Web has real but narrow value: it can make Work, Execution, frozen
Binding inputs, native/output Refs, observations, and evidence reconciliation
legible in a browser. That is an audit/history inspector, not yet the promised
Workbench. It does not exercise candidate preparation, Binding review, Launch,
Finish, or recovery, because those paths call plugin code or own effects.

If included, call it an “Inspector” and constrain it to:

```text
GET health/works/executions/binding-facts/evidence/plugin-summary
bounded polling; no SSE/WebSocket required
no resolve, choices, prepare, doctor, settings, attach, launch, Finish,
filesystem, terminal, or credential endpoints
```

The read server must open an existing database read-only, refuse missing or
pending-migration homes, and prove unchanged DB mtime/schema/event count while
polling. Plugin summaries must be startup descriptors or persisted diagnostics;
opening a browser must not invoke plugin `doctor()` or resource resolution.
Sensitive objectives, paths, native IDs, and evidence still need the local
session/origin policy appropriate to the deployment. Read-only reduces blast
radius; it does not make local data public.

The Inspector is optional P1 delivery polish, not a Preview gate. Build it only
after the Codex slice has a stable DTO/read model and keep it removable without
touching mutation code. If schedule pressure exists, omit it and ship
WorkBoard + native tmux; that is a coherent Preview.

## Official Harness vertical slice

The official package is justified for Preview only as one accountable
`official-harness-interactive` provider with a private Codex driver. It must
demonstrate:

```text
select immutable Profile snapshot
-> prepare exact Workspace/context/tmux inputs
-> review and freeze individual Refs
-> requested Dispatch
-> side-effect-free driver preflight
-> execution-private config/state/session/cache/tmp
-> native Codex responsibility window
-> SessionRef and per-input observations
-> explicit Finish and output/evidence reconciliation
```

Use an existing local/host-process path and the exact `TmuxPaneV1` integration
for this gate. Do not add bwrap, a remote Sandbox, cc-switch, a rich profile
editor, or a generic Console protocol to the recording just to make the
architecture look complete. A pure extracted mapping helper is acceptable;
the legacy `build_launch_plan()` and direct legacy launcher are not.

The provider's static input limits are a superset, never conditional truth.
Profile/driver/continuation compatibility must be checked in preflight before
Git worktree, managed tmux, or runtime materialization. `start()` repeats
critical identity/drift checks. A malformed receipt or an exception whose
side effects cannot be disproved is ambiguous, not failed.

The first driver is enough for the Preview. Do not advertise Codex/OpenCode/Pi
as a proven unified provider until at least one second driver passes the same
responsibility, private-state, continuation, health, and recovery tests. If the
second driver cannot share those semantics, split providers rather than adding
conditional behavior to the Preview provider.

## Plugin loading and implementation scope

The full fixed-point loader is a sound ecosystem design but is not the first
thing to implement. For Preview, the minimum safe loader is:

```text
discover/build all official components without side effects
-> stage unique Contract owners first
-> validate ResourceProvider and ExecutionProvider declarations
-> validate every input-limit Contract against the staged catalog
-> atomically commit, or fail the official set before readiness
```

This is still contract-first and order-independent. It is safe to defer the
general fixed-point removal algorithm only while the supported Preview plugin
set is an explicit, closed group: a missing required owner fails the group and
does not leave ghost Contracts. Once optional third-party dependencies are
supported, fixed-point dependency diagnostics become P1. Never use entry-point
alphabetical order, “load and hope,” or provider-time unknown Contract errors.

The official driver registry stays private. `agent-box-harnesses` must not
import cc-switch implementation details; Profile proposals, when introduced,
are Host draft instructions and each authority adapter prepares its own exact
Ref. The neutral capability/credential Contract package is deferred unless
the Preview actually has two independent producers/consumers that require it.

## Legacy deletion gates

“Delete after Web parity” is not a sufficient gate. Web parity for Work and
Evidence says nothing about profile editing, endpoint configuration, installers,
session cleanup, or environment onboarding. Before removing a legacy capability,
record one of four dispositions:

| Disposition | Required proof |
| --- | --- |
| Migrated | Successor performs the capability through the governed Host path, with an automated test and a user runbook. |
| Externalized | Named external authority/product owns it, with import/export and failure guidance. |
| Explicitly dropped | Product decision, release notes, and a supported alternative or limitation. |
| Retained temporarily | Frozen compatibility path, isolated home/storage, owner behavior documented, and a removal issue. |

Minimum deletion gates are:

1. the capability ledger has no unknown rows and names an owner;
2. existing profiles/data can be imported or exported without secret leakage;
3. historical Work/Execution/Ref/Observation and Host-owned material evidence
   remain readable after plugin/GUI removal;
4. supported Host/Web paths contain no imports or calls to `launch.py`,
   `agent_types.json`, the PyWebView/WSL bridge, or direct ACS schema code;
5. reference and integration tests prove the old path cannot mutate the new
   home; and
6. rollback means isolated data export or a prior isolated home, never two
   owners sharing writable profile state.

For Preview, retain the old setup/configuration and onboarding tools only as
frozen, clearly labeled compatibility surfaces where needed. Disable direct
launch against the new home once the official Codex path is green. Do not
remove profile import/list/validate, driver health, endpoint guidance, or
environment setup until each has a successor or an explicit drop decision.

## Preview-killing designs rejected

The following are not acceptable as “temporary” shortcuts:

* Web mutations while WorkBoard, CLI, legacy GUI, or scripts still invoke
  providers directly;
* daemon shadow/cutover work on the critical path before the Codex slice;
* a lock plus a silent direct-library fallback when the lock is held;
* static UI filtering used instead of provider preflight;
* accepted replay that resolves/materializes again;
* a shared writable Profile home or continuation directory;
* broad fixed-point/dependency/Host SDK/frontend implementation before one
  real vertical slice;
* a public Driver/Sandbox API designed from local argv/bwrap alone;
* deleting legacy code without a capability disposition and isolated rollback;
* requiring cc-switch, a browser, desktop shell, or a production Sandbox to
  demonstrate the product center.

## Final go/no-go

### Preview go

Go when the P0 tests are green and the following single run is recorded from a
fresh supported Linux/WSL home:

```text
Profile -> exact Binding review -> freeze
-> Dispatch requested -> preflight -> native Codex start
-> SessionRef/observations -> human interaction
-> explicit Finish -> output/evidence reconciliation
```

The run must use the WorkBoard application facade, one owner lock, execution-
private writable state, and no legacy direct launch. An optional read-only
Inspector may be absent without changing this decision.

### Web mutation go

No go until daemon ownership is proven, WorkBoard and CLI are HostClients,
operation identities are idempotent, restart/recovery claims are tested, and
local Web session/Origin/CSRF/output/secret controls pass. Web mutation must
not be the mechanism used to discover whether the daemon is correct.

### Legacy deletion go

No go until the capability ledger and all deletion gates above pass. “New
directory exists,” “Web has a page,” and “tests import the new class” are not
parity evidence.

## Final delivery recommendation

Freeze the architecture at the outer-ring/Core boundary already established in
Round 3. Implement only:

```text
Dispatch protocol repair
-> thin WorkBoard application facade + flock owner
-> official Codex Harness vertical slice
-> optional read-only Inspector
```

Then stop and record the Preview. Continue with second-driver and external
catalog evidence only as a separate P1 tranche, followed by daemon handoff and
Web mutation. This preserves the architecture's core invariants while making
the delivery scope honest: WorkBoard is the owner, Web is not yet the control
plane, and legacy is retained or isolated until every capability has a tested
disposition.
