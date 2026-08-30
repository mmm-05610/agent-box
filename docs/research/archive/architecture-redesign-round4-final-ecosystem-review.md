# Architecture Redesign — Round 4 Final Ecosystem Review
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-28

Scope: independent review from the position of an official-plugin and third-party
integration maintainer. This reviews the Round-3 synthesis, the plugin/dispatch
tracks, and the Round-4 provider and SDK reviews. It makes no implementation
changes.

## Final verdict

Approve the architectural direction, with a narrower Preview cut.

One official interactive Harness provider, Profile `proposals()` with authority
delegation, a Host-owned immutable snapshot store, and a later cc-switch bridge
are all implementable without extending Core's durable ontology. They are not
one indivisible feature. The first implementation must prove only the following
chain:

```text
Codex profile snapshot -> delegated existing inputs -> preflight ->
private runtime -> one native session -> explicit Finish -> historical readback
```

The second driver is the acceptance test for retaining one provider. cc-switch
is not. A production Sandbox SPI is correctly deferred.

The two required corrections are:

1. Do not make the staged fixed-point loader a Preview prerequisite. It is
   correct if arbitrary cross-plugin Contract ownership is admitted, but is not
   the minimum way to deliver the official slice.
2. Do not call a snapshot "non-secret" merely because a generic scanner did
   not find a token. Snapshot admission must be contract-specific allowlist
   serialization, bounded Host storage, and explicit retention semantics.

The design remains a plugin ecosystem only if the public boundary stays small:
Contracts, ResourceProviders, ExecutionProviders, and Host-private adapters.
Drivers, launch plans, credential injection, and Sandbox operations remain
private implementation details for now.

## Decision table

| Area | Decision | Classification | Exact boundary |
| --- | --- | --- | --- |
| Dispatch envelope, accepted replay, preflight ordering | Required before Harness | P0 | Retain the canonical exact `(contract_id, Ref, value)` envelope; accepted/requested/failed replay must not resolve or start. |
| One official interactive provider | Conditional approval | P0 | Start with Codex; retain it only after one second driver passes the same lifecycle/concurrency tests. |
| Static input superset | Accepted with a guard | P0 | It is a count ceiling, not a compatibility declaration; selected-driver validation must run before materialization and again at start. |
| Profile `proposals()` and authority delegation | Approved, one level only | P0 | A Profile adapter proposes selectors; only the target authority adapter can mint the exact Ref. |
| SnapshotStore | Required for profile/capability history | P0 | Host-owned, immutable, content-addressed, allowlist-serialized non-secret bytes only. |
| Contract ownership and loader | Simplify Preview | P0/P1 split | P0 uses explicit contract-only ABI ownership for official cross-plugin Contracts; arbitrary dependency closure/fixed point is P1. |
| Per-driver health | Required | P0 | Driver-scoped, lazy, bounded, no credential/network/process side effects. |
| cc-switch read-only bridge | After two-driver proof | P1 | Optional catalog/credential authority only; never a Harness dependency or mutable profile owner. |
| General third-party Driver SDK | Defer | Defer | Third parties register their own ExecutionProvider until two external driver authors need a shared ABI. |
| Production Sandbox Contract/SPI | Defer | Defer | Require two materially different agent-oriented sandbox implementations and recovery/PTY/secret evidence. |
| Generic Console SPI, arbitrary Host UI bundles, marketplace, secret scanner as guarantee | Reject for this sequence | Defer | These are separate platforms, not prerequisites for interactive Harness dispatch. |

## P0: the minimum implementable plugin slice

### 1. Keep one accountable provider, but make its cancellation rule real

`official-harness-interactive` may encompass Codex, Pi, and OpenCode only when
they share all of these semantics:

- one visible, user-held responsibility window;
- one explicit Finish path;
- one native correlation model sufficient for the receipt's declared recovery
  level;
- execution-private writable state; and
- no driver-specific retry, task ownership, or hidden supervisor.

The provider must expose only common capabilities. A capability that depends on
the selected driver is informational for the Host and authoritative only in
preflight; it must not be returned as Core's `supported` capability. The
internal driver registry is not an extension point.

The acceptance rule should be mechanical: ship Codex first, then add exactly
one of Pi or OpenCode. Run fresh start, Finish, continuation-as-new-Execution,
restart recovery, incompatible-continuation rejection, and concurrent-runtime
tests for both. If either driver needs a materially different Finish,
correlation, recovery, or writable-home model, it becomes a separate
ExecutionProvider in the same distribution. Do not wait for all three drivers
before deciding; the third has no architectural value until the first two prove
the common lifecycle.

This prevents the package becoming a hidden monolith:

- `agent-box-harnesses` owns only profile declaration/materialization and the
  interactive provider; it must not import cc-switch implementation, own Git,
  own tmux, own Sandbox, or ship a Web application.
- A driver imports only after Profile selection. A missing binary, optional
  native library, or configuration error is recorded against that driver, not
  against plugin discovery or unrelated profiles.
- `health(profile)` is a bounded readiness diagnostic. It must neither prompt
  for login nor read a secret value, contact a network endpoint, create a
  runtime directory, pane, worktree, or native session.
- Health needs stable states such as `READY`, `UNAVAILABLE`, and
  `MISCONFIGURED` plus a non-secret reason and remediation. Plugin `READY`
  cannot mean every driver is ready.

### 2. Static limits are safe only with pure early compatibility inputs

The static union of inputs is an acceptable Core-facing compatibility shim, not
a truthful description of each driver. A profile selecting Pi plus a Codex
continuation is therefore permitted by the count check and must be rejected by
preflight before any worktree, tmux console, sandbox, credential injection, or
runtime directory is materialized.

The preflight set must be explicit and limited to immutable/pure data: Profile
declaration, continuation identity, capability declaration, and credential
source descriptor. Legacy providers without a declared pure resolution effect
are effectful by default and are ineligible for preflight resolution. `start()`
rechecks the driver identity and continuation/session lease for TOCTOU.

The required P0 simulations are:

- Codex profile + Pi continuation produces a failed Dispatch with zero Git,
  tmux, runtime, and `start()` calls.
- two continuations for one selected driver and all foreign continuation types
  are rejected the same way;
- concurrent imports of one native continuation either use a proven safe model
  or reject one claimant before writing state; and
- Host UI filtering is bypassed in tests, proving it is not an authority.

Changing the invocation DTO must not silently break V1 provider consumers.
`request.inputs` remains a read-only compatibility view derived from the
canonical exact-input tuple. Any previously public constructor usage must be
either supported for one release with validation or deliberately versioned as a
Provider SDK major change; adding a second mutable input truth is not an
acceptable compatibility shim.

### 3. `proposals()` is a Host draft mechanism, not a config language

The proposed direction is minimal and correct if it remains exactly this:

```text
Profile adapter prepares its own exact ProfileRef
-> returns non-secret InputProposal selectors
-> Host selects the named target adapter
-> target authority prepares its own exact Ref
-> Host displays each individual prepared input and freezes them normally
```

The Profile adapter must never return a Ref for a cc-switch, Git, tmux, or
credential resource. It must not call the other adapter's implementation or
receive its provider object. The Host validates exact adapter id and contract
id, rejects secret form parameters, records `proposed_by` and `resolved_by` in
the non-durable draft, and applies the ordinary prepare/review/freeze flow.

To avoid a hidden workflow/configuration language, P0 fixes the following
limits: depth one; a small fixed proposal count; scalar non-secret selectors;
no conditionals, loops, expressions, arbitrary files, or proposal-side
network/credential access. A `required` proposal is a Host launch guard only;
the provider remains responsible for final compatibility validation. Missing
optional adapters yield an editable unavailable draft; missing required inputs
block Launch visibly. The Profile itself remains readable after an optional
authority plugin is gone.

### 4. SnapshotStore must own retention, not just content addressing

The Host, not the producing plugin, owns snapshot bytes and their schema
envelope. Its minimum API may be small, but its invariants cannot be vague:

- its root is outside plugin data directories and is never deleted by plugin
  uninstall;
- writes are atomic, content-addressed, immutable, size-bounded, and quota
  accounted by the Host;
- the Host derives the path from the digest and reads through a host URI; a
  plugin never supplies a filesystem path to persist or later execute;
- each supported Contract supplies an allowlist serializer/schema version;
  generic key or entropy scanning is diagnostic defense-in-depth only;
- Snapshot refs contain no secret value, reversible secret derivative, bearer
  credential, runtime session state, or absolute private path; and
- a retention/garbage-collection rule preserves snapshots referenced by a
  frozen input, observation, or retained historical record. Missing retained
  content renders as `unavailable`, never as a re-resolve request to an
  uninstalled plugin.

For Profile and public capability definitions, the snapshot is the frozen
launch input; dispatch should read that snapshot rather than silently fetching
a newer authority row. A credential source is different: its opaque source
identity may be frozen, but the secret is dereferenced only at authorized
materialization time and only in memory/private injection media. If the source
has no trustworthy revision, the record must say `unverifiable`; it must not
hash or persist the secret to fake exactness.

The uninstall acceptance test is strict: remove the provider plugin after a
terminal execution, restart the Host with no plugin registry entry, and still
render raw refs, digest, snapshot metadata/content where authorized, events,
and evidence. Re-resolve, attach, continuation, and secret dereference may be
unavailable; read-only historical inspection may not depend on Python classes
from the removed package.

### 5. Contract ownership and loading: reduce topology before adding an algorithm

The current single entry-point/atomic `PluginRegistration` model is worth
preserving. The current loader is nevertheless order-dependent: it immediately
commits one plugin, ResourceProvider validation knows contracts, and
ExecutionProvider input limits are not validated against registered Contracts.
That is unacceptable for the official Harness/tmux boundary.

The Round-3 fixed-point loader is a correct general solution when a plugin's
contract owner, providers, and consumers can all fail independently. It is not
the smallest P0. It introduces a dependency solver in disguise, and its
failure reports, contract lifetime, and atomicity rules must themselves become
an API before third parties can rely on them.

Use this smaller Preview topology instead:

```text
agent-box public SDK / explicit contract-only ABI distribution
    owns every Contract used across official plugins

feature plugin
    owns implementations and may own Contracts used only inside that plugin
```

The contract-only distribution has no ResourceProvider or ExecutionProvider
whose failure can make its Contracts ghosts. Preview's loader then needs only:

1. build all official registrations without side effects;
2. register the ABI/Contract stage before any providers, independent of entry
   point spelling/order;
3. validate both `supported_contract_ids` and every ExecutionProvider
   `input_limits()` key against that staged catalog;
4. atomically register each feature plugin or mark it failed; and
5. make a consumer with a missing required Contract unavailable at load time,
   not at Dispatch.

This means a Contract class has one owning distribution and `contract_id@N`
has one immutable meaning. No plugin may copy a dataclass merely to share an
id. Contract migration is a new id/version; old raw persisted data remains
displayable without loading its class.

P1 may generalize this to the fixed-point algorithm only after a real
third-party cross-plugin dependency requires it. At that point its semantics
must be explicit: a Contract-only owner can remain; a feature owner failing is
removed atomically; consumers get a deterministic `DEPENDENCY_FAILED` chain;
optional integrations are disabled rather than half-loaded. Do not introduce
semver solving, hot reload, install management, or runtime registration
mutation as part of that work.

## P1: cc-switch, once the core slice has passed

`agent-box-cc-switch` is viable as an optional, read-only authority bridge.
It is not needed to prove the multi-driver architecture, and it should follow
the second-driver gate.

Its only responsibilities are schema probe, catalog normalization, public
definition snapshot preparation, and opaque credential-source preparation. It
does not own Profile lifecycle, materialization, Harness launch, or a generic
credential store. `agent-box-harnesses` must consume neutral Contract values
and never import the bridge implementation; the Profile proposal holds a
selector, not a cc-switch database access path.

The bridge must enforce these distinctions:

| Data | Frozen at prepare/freeze | Used at launch | Historical claim |
| --- | --- | --- | --- |
| Public MCP/skill definition | Host snapshot + digest | Frozen snapshot | Exact non-secret definition, if the serializer admits it |
| Credential source | Opaque stable identity and public revision if one exists | Current secret through a private channel | Source projected; value/revision unknown unless the authority proves one |
| Live cc-switch catalog | Never silently substituted for a frozen definition | Optional explicit drift diagnostic only | Not part of the frozen input |

A read-only SQLite connection is not a trust boundary. Public definition
normalization must make executable endpoints, command paths, environment names,
and network intent reviewable; it must not treat them as harmless just because
they are not credentials. Deleted or unknown-schema rows fail new preparation.
They do not erase previously retained public snapshots. A bridge uninstall must
leave the historic Profile/capability view intact and make only its live
authority operation unavailable.

## Deferred: Sandbox operational SPI

Deferral is the minimal and honest choice. The existing Resource Contract model
is frozen data and cannot by itself define create, launch, attach, inspect,
cleanup, PTY transport, secret injection, image/template identity, or recovery
for interchangeable sandboxes. Turning bwrap's local process arguments into a
universal contract would lock every Harness driver to a local substrate.

P0 may launch explicitly as `host-process` and keep bwrap experimental. The
Harness package must keep its native launch/materialization representation
private so that a future Sandbox does not inherit a public `argv/env/cwd` ABI.
Before standardizing any Sandbox SPI, demonstrate two materially different
agent-oriented implementations (for example local and remote) against the same
requirements: exact immutable template/image identity, workspace projection,
PTY/streaming, secret channel, instance identity, observation/recovery,
cleanup, network policy, and post-run artifacts. If a sandbox accepts the task
and owns retry/outcome it is an ExecutionProvider, not a resource-shaped
SandboxProvider.

## Cross-cutting non-negotiable tests

The final approval is contingent on tests, not documentation promises:

- accepted, requested, and failed dispatch replay resolve and start nothing;
  accepted replay still returns its durable receipt after provider uninstall;
- contract loading is invariant under entry-point permutation, duplicate owner
  is visible, and unknown ExecutionProvider input Contracts fail during load;
- a failed driver health probe/import does not make the other driver or plugin
  unavailable;
- every P0 driver gets a private writable runtime; shared Profile/capability
  sources are read-only; conflicting continuation imports are serialized or
  refused;
- Profile proposals cannot mint foreign Refs, recurse, pass secret fields, or
  invoke a missing adapter invisibly;
- redaction tests inspect Ref metadata, frozen inputs, events, observations,
  snapshots, manifests, diagnostics, and error messages; a secret scanner is
  only a backstop, not the policy;
- artifact/snapshot/history reading works with registry lookup disabled; and
- official-package dependency tests prove that harnesses does not import
  cc-switch and that profile/capability data needs no mutable plugin directory.

## Implementation order

1. Dispatch P0 and its replay/preflight/receipt tests.
2. Contract-only ABI ownership, contract-first official loading, and
   ExecutionProvider input-contract validation.
3. Host draft context, bounded SnapshotStore, one-level proposals, and
   uninstall/read-only history tests.
4. Codex-only official Harness vertical slice with private runtime and
   per-driver health.
5. One second driver; decide empirically whether one provider survives.
6. cc-switch bridge only after step 5.
7. Sandbox spike, then consider a Sandbox SPI; Web mutation and other platform
   work remain outside these gates.

This sequence preserves the Round-3 model while removing its two highest-risk
sources of accidental platform expansion: a speculative dependency solver and
a premature integration authority.
