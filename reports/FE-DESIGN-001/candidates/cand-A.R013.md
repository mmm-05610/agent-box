# Best Candidate — FE-DESIGN-001 / R013 integrated (A)

## R11.1 Core bet

The host core is a namespaced directory of `(ns_id, local_id)` resources, each carrying an
append-only cursor-stream log; an adapter-owned open CapMap; ns-scoped typed actions; a typed
`pump` on the adapter handle; and namespace-scoped subscriber handles whose only permission rule is
`resource.ns_id == handle.ns_id`. Delivery is one host rule — `subscribe(id, from_cursor=c)`
replays the log's envelopes with `seq >= c` in increasing `seq`, then continues live — and the
*value* of `c` is computed by the subscriber from its own state: `0` for a just-spawned resource's
head, `cursor_resolve(id)` for the live edge of a pre-existing resource, `saved_last_seen + 1` to
catch up while the persisted position's `recorded_ns_id` still equals the current `ns_id`, else
`0`. **A `Result` returned by `invoke` that names a spawned resource implies the adapter announced
that resource inside the invoke handler before returning** (the spawn-announce rule), and
`invoke` against a retired or never-announced resource returns `ExplicitAbsent`. The host holds no
content authority: it never reads a payload, never branches on a CapMap string, and names no
capability of its own. What it does hold is the log — stated plainly.

## R11.2 Types

```typescript
type ResourceId = { readonly ns_id: string; readonly local_id: string }
type Seq = number // int64; host-assigned per-resource log index; NOT a dedup key

interface NamespaceHandle {
  readonly ns_id: string;
  announce(desc: { local_id: string; kind: string; capabilities: CapMap }): void;
  retire(local_id: string, reason: string): void;   // disposes log + burns id + onEnd to live subscribers
  teardown(reason: string): void;                    // disposes every log + onEnd + force-closes
  pump(local_id: string, payload_schema_id: string, payload: unknown): void;
}

interface SubscriberScope {
  readonly ns_id: string;
  directory_list(filter?: { kind?: string }): readonly ResourceDescriptor[];
  directory_lookup(local_id: string): ResourceDescriptor | ExplicitAbsent;
  cursor_resolve(resource_id: ResourceId): Seq | ExplicitAbsent; // next Seq, or absent if not announced
  subscribe(resource_id: ResourceId, from_cursor: Seq): Subscription | ExplicitAbsent;
  invoke<A extends ActionSchema>(resource_id: ResourceId, action_type: A,
         params: A["params"]): InvokeOutcome<A>;
}

type InvokeOutcome<A> = Result<A> | CapabilityAbsent | ScopeDenied | OutcomeUnknown | ExplicitAbsent
interface Subscription {
  onNext(h: (env: Envelope) => void): void;
  onEnd(h: (reason: string) => void): void;  // the declared termination signal (FE-CE-037)
  close(): void;
}
type Envelope = { resource_id: ResourceId; seq: Seq; ts: number; kind: string;
                  payload_schema_id: string; payload: unknown }
type RenderRow = { readonly path: string; readonly label: string; readonly value: string;
                   readonly status: "value" | "absent" | "unreadable" | "opaque" }
type CapMap = Readonly<Record<string, "supported" | "not_supported" | "unknown">>
type ClaimOutcome = "claimed" | "ScopeDenied"

// The declaration grammar the recursive walk is decidable against (FE-CE-033).
type SchemaDecl =
  | { kind: "scalar" }
  | { kind: "opaque" }
  | { kind: "record"; fields: Readonly<Record<string, SchemaDecl>> }
  | { kind: "list"; item: SchemaDecl }

interface ViewHost {
  open_scope(ns_id: string): SubscriberScope | ExplicitAbsent;
  // A view claims a schema within one of its scopes' namespaces. Claims are keyed by
  // (ns_id, payload_schema_id), recorded in the host claim table; a claim outside the
  // view's scopes returns ScopeDenied and is not recorded (FE-CE-034, FE-CE-035).
  claim_schema(ns_id: string, payload_schema_id: string): ClaimOutcome;
  // Fired non-silently whenever the winning claimant of (ns_id, schema_id) changes;
  // owner === null means the fallback now serves it. The swap is declared, never silent.
  on_claim_changed(h: (ns_id: string, schema_id: string, owner: string | null) => void): void;
}
```

## R11.3 The cursor stream is the log (FE-CE-022, FE-CE-024)

Every resource has one cursor-stream log. `pump(local_id, payload_schema_id, payload)` appends an
envelope and returns `void`; the host assigns the next `Seq` in pump-arrival order and routes the
envelope to every live subscriber whose `from_cursor <= seq`. `subscribe(id, from_cursor=c)`
replays the log's retained envelopes with `seq >= c` in increasing `seq`, then continues live; it
returns `ExplicitAbsent` if `id` is not currently announced.

- **Retention.** An envelope is retained from the moment `pump` appends it until the resource is
  retired or its namespace torn down. There is no truncation, expiry or window while the resource
  exists. `cursor_resolve(id)` always names a position the log can still serve, so
  `from_cursor = saved_last_seen + 1` is serviceable for any live resource (guarded, as before, by
  `recorded_ns_id == current ns_id`; a full reconnect mints a new namespace and restarts at `1`,
  in which case the subscriber uses `0`).
- **Disposal and observability (FE-CE-037).** `retire(local_id, reason)` disposes that resource's
  log, `burn`s the `local_id`, delivers `onEnd(reason)` to every live subscriber of that resource,
  then closes those subscriptions. `teardown(reason)` disposes every log in the namespace, delivers
  `onEnd("namespace torn down: " + reason)` to every live subscriber scoped to it, then force-closes
  them. A closed subscription releases its *routing reference*, never a log entry.
- **Spawn-announce (FE-CE-031).** When `invoke` returns a `Result` naming a resource (e.g.
  `SubmitResult.job_resource`), that resource is **announced by the producing adapter inside the
  invoke handler, before the `Result` is returned**. The head envelope the handler pumps is
  therefore retained by the time the caller applies the just-created rule with `from_cursor=0`.
  `invoke` against a retired or never-announced resource returns `ExplicitAbsent`.
- **One incarnation per `local_id` (FE-CE-027).** `retire` burns the `local_id` for that
  namespace's lifetime: a later `announce` with the same `local_id` in the same namespace raises
  `LocalIdBurned`, and `cursor_resolve` / `subscribe` / `invoke` on a `local_id` that is not
  currently announced returns `ExplicitAbsent`. `teardown` restarts the id space with the
  namespace.
- **Honest cost.** A resource's log grows with every envelope it has ever emitted, for the life of
  the resource. The bound is the resource's lifetime, which the producing adapter controls: it can
  `retire` the resource (the watching view is now told via `onEnd`) and announce its successor
  under a **new** `local_id`, or expose a `read` snapshot instead of a long stream. A service with
  a very long-lived high-volume resource pays that memory cost; the design does not hide it behind
  an unnamed buffer.
- **Corrected claim.** No second store is introduced: the log *is* the stream.

## R11.4 Presence is not reachability (FE-CE-023)

`directory_list` / `directory_lookup` report that a resource is **announced and not retired**. They
do not report that the service behind it is reachable, and no part of the core may present
reachability as a fact. Consequences:

- **Adapter boundary rule (item 8, transient loss).** When an adapter observes that its connection
  is **transiently** lost but intends to resume the same logical stream, it does **not** teardown.
  It stops pumping while the link is down; in-flight invokes return `OutcomeUnknown` (host-owned);
  on reconnect it dedups by its own stable id and resumes pumping into the **same** namespace. The
  log, the subscriptions and the `recorded_ns_id` cursor all remain valid — this is what makes the
  same-namespace catch-up branch of S09 reachable after a drop.
- **Adapter boundary rule (item 8b, permanent loss).** When the adapter declares the service gone
  or will not resume the same stream, it calls `teardown(reason)`. Logs are disposed, subscribers
  receive `onEnd` and are force-closed. The view must re-pair: `open_scope` on a fresh `ns_id`,
  replay from `0`.
- **Interface failure, not death.** While a namespace is neither retired nor torn down, `invoke`
  on an unreachable resource returns `OutcomeUnknown` — the host-owned variant — and never
  `CapabilityAbsent`. The fallback must therefore render an action whose last attempt returned
  `OutcomeUnknown` as unconfirmed, never as available-and-working.
- **Stated limitation.** If an adapter is killed so that it never observes the loss, its
  namespace's registrations and logs remain until the host process ends, and nothing in the core
  retracts them. Fixing that requires a liveness/heartbeat mechanism the core declines to impose.
  The directory's meaning is narrowed so that this limitation is truthful.

## R11.5 Fallback rendering contract (FE-CE-019, FE-CE-020, FE-CE-021, FE-CE-032, FE-CE-033)

**Invariant (one rule, all channels).** An outcome the host has not confirmed may never be
rendered as a current value or a current state, and a resource the host declares ended may never
stay labelled current.

**`InvokeOutcome` rendering — all five variants:**

| Variant | Rendering | Clickable consequence |
|---|---|---|
| `Result` | GenericWalk rows, labelled `current (fresh invoke at <ts>)` | **Reload** re-invokes; rows replaced |
| `CapabilityAbsent(x)` | `no <x> action registered for this kind; value not obtainable` + last-event metadata | none |
| `ScopeDenied` | `this resource is outside this view's namespace scope` | none |
| `OutcomeUnknown` | prior rows, if any, relabelled `last confirmed at <ts> — NOT current`, plus a banner `read did not return; value not confirmed`; with no prior rows, `value not confirmed; read did not return` | **Retry** re-invokes |
| `ExplicitAbsent` | `this resource no longer exists (retired or never announced)` | none |

**Total API-state rendering (FE-CE-032).** Every state the API can return has an explicit row so
a view never receives a state it cannot display. These live in the fallback's rendering rules, not
in core semantics:

- `open_scope(ns_id) → ExplicitAbsent` → `that namespace is not open in this host process — open
  the service first`.
- `directory_lookup(local_id) → ExplicitAbsent` → `no resource with this id is announced`.
- CapMap value `"unknown"` → `support for <cap> is unknown — the service has not declared it`. The
  fallback does not claim supported nor unsupported; it displays the third declared truth.
- `onEnd(reason)` → all rows for the ended resource are relabelled `ended at <ts>: <reason>`,
  current labels are withdrawn, and the action list is marked unconfirmed.

**GenericWalk, decidable over SchemaDecl.** The walk renders the *declared* schema recursively to
any depth, with each row labelled by the declared field path (`files[0].hunks[1].lines`). For
every declared field it emits exactly one row, with an explicit status:

- present and conforming → `status="value"`, `value=str(primitive)`;
- declared but absent at runtime → `status="absent"`, `value="(absent at runtime)"`;
- present with the wrong shape (e.g. `null` or a scalar where a `list` was declared) →
  `status="unreadable"`, `value="(unreadable: declared <shape>)"`;
- declared opaque → `status="opaque"`, `value="opaque: <declared_schema_id>, no view installed"`.

The walk never throws and never causes the pane to be replaced. The host still attaches no meaning
to any name — `status`, `state`, `additions` are labels it echoes. The **adapter** declares each
field's name and its `SchemaDecl` shape (`scalar` | `opaque` | `record` | `list`); the previous
"field name only" clause is deleted because it could not express opacity or shape and made totality
undecidable (FE-CE-033). The walk uses no host depth constant; a display cap (`… N more rows`) is a
display concern, not a schema-authoring rule.

**Extension selection — recorded, namespaced, non-silent (FE-CE-034, FE-CE-035).** A view claims a
`(ns_id, payload_schema_id)` through `claim_schema` when it mounts, and only for a namespace it
holds a scope to; otherwise `ScopeDenied`. The host records the current claimant of each
`(ns_id, schema_id)` in a claim table. When the winning claimant changes — on mount or on unmount —
the host emits `on_claim_changed(ns_id, schema_id, owner|null)`; `owner === null` means the
fallback resumes. The swap is declared and announced, never an implicit mount-order channel and
never silent. The generic fallback serves a resource whose schema no view currently claims.

- **absent → fallback.** `CapabilityAbsent(x)` and a missing action are rendered by the fallback;
  absence is never an error state and never a blank pane.
- **throws → error boundary.** A view that throws is contained to that view's region; the fallback
  is not substituted for the pane.
- **uninstall → host closes scope.** When a view unmounts or is uninstalled, the host closes every
  subscription made through that view's scopes, releases its claims (emitting `on_claim_changed`
  where a renderer changes) and releases routing references. Resource logs are untouched.
- **pair gesture.** A user gesture that opens scopes in two namespaces (S08). It records nothing in
  the core; the view holds both scopes, and the only permission each confers is
  `resource.ns_id == scope.ns_id`. **A scope is not a subscription:** delivery to the view through
  either scope requires a `subscribe` on a resource of that scope's namespace.

## R11.6 Boundary rules (adapter items 1–8, host items 9–10)

1. `namespaces.open({service})`; 2. `announce` each kind with `local_id`, `kind` and an open CapMap
including explicit `not_supported`; 3. `pump(local_id, payload_schema_id, payload)` for every remote
event, in remote-stable logical order — the host assigns arrival-index `seq` and does not reorder;
4. `action.register(ns_handle.ns_id, kind, action_type, params_type, result_type)`; 5. on reconnect,
dedup by the adapter's own protocol-level stable event id, never by host `seq`; 6. register a typed
`read` (value) or `status` (state) action for any resource that should be inspectable in the
default view; 7. on `retire`/`teardown`, stop pumping — `pump` on a retired `local_id` is a silent
no-op and `pump` after `teardown` raises `NamespaceGone`; **8. (transient loss) do not teardown on
a transient link loss — stop pumping, return `OutcomeUnknown` for in-flight invokes, resume the same
namespace after reconnect; 8b. (permanent loss) call `teardown(reason)` when the service is gone or
the same stream will not resume.**
**9. (host duty, FE-CE-026/035) the host mints a view's `SubscriberScope` only through
`ViewHost.open_scope(ns_id)` — one scope per (view, ns_id), returning `ExplicitAbsent` if that
namespace is not open in this host process. A scope is never discoverable from another scope, never
shares another namespace's contents, and confers no permission beyond
`resource.ns_id == scope.ns_id`. There is no other way to obtain a scope. `claim_schema` is granted
only for a namespace the view holds a scope to.**
**10. (adapter duty, FE-CE-031) a resource named by an `invoke` result is announced by the adapter
inside the invoke handler, before the result is returned.**

An adapter does not know or use host `seq`, does not compute `from_cursor`, does not persist
`recorded_ns_id`, does not know what views subscribe with, does not know whether a log entry is
retained, and does not shape its schema around a renderer algorithm. Absence is expressed twice and
never as null: `CapMap[x]="not_supported"` (informational) **and** `x` absent from
`action.register` → `invoke(…, x, …)` returns structural `CapabilityAbsent(x)`.

## R11.7 Scenario trajectories (self-contained)

All twelve scenarios are step tables: each step carries an actor, the operation, what is
authoritative for it, and the user-visible failure if the mechanism that step uses is deleted.

**S01 text-only.**

| Step | Actor | Action | State change | Authoritative | Delete-consequence |
|---|---|---|---|---|---|
| 1 | Host | `namespaces.open({service:"text-echo"})` → `ns_handle` | Namespace created | Host | Delete namespace: step 2 cannot scope; S06 collision |
| 2 | Adapter | `ns_handle.announce({local_id:"main", kind:"text.stream", capabilities:{cancel:"not_supported"}})`; `action.register(ns, "text.stream", "send", SendParams, SendResult)` | Resource + action registered | Adapter | Delete register: step 3 invoke returns CapabilityAbsent (FE-CE-030) |
| 3 | Extension | `s = host.open_scope(ns_handle.ns_id)`; `s.invoke((ns,"main"), "send", {text:"hello"})` | Scope minted then routed | Host/Adapter | Delete `open_scope`: no scope at all (FE-CE-026). Delete typed-action: execute(any) |
| 4 | Adapter | `ns_handle.pump("main", "text.delta", "h")`; `ns_handle.pump("main", "text.delta", "e")` | Host assigns seq, routes to subscribers | Adapter (content)/Host (seq) | Delete pump: no data enters stream |
| 5 | Extension | `sub = s.subscribe((ns,"main"), from_cursor=0)` — just-created rule; step 4's deltas are seq 1..2 and c=0 admits both, then live | Replays seq 1..2, then live | Extension | Delete cursor-stream: no ordered delivery. Subscribe with `cursor_resolve` instead: c=3, deltas never replayed (FE-CE-025) |

**covered (core).**

**S04 submit/progress/result, no chat.**

| Step | Actor | Action | State change | Authoritative | Delete-consequence |
|---|---|---|---|---|---|
| 1 | Adapter | `announce({local_id:"acme", kind:"acme.job", capabilities:{cancel:"not_supported"}})`; `action.register(ns, "acme.job", "submit", SubmitParams, SubmitResult)`; SubmitResult has typed field `job_resource: ResourceId` | Resource + action registered | Adapter | Delete register: step 3 unreachable (FE-CE-030) |
| 2 | Extension | `s = host.open_scope(ns)`; `r = s.invoke((ns,"acme"), "submit", {input:"..."})` | Scope minted; host routes, adapter creates job | Adapter/Host | Delete `open_scope`: no handle (FE-CE-026). Delete namespace: no target |
| 3 | Adapter | inside the submit handler: `announce({local_id:"job-7", kind:"acme.job", …})`; `ns_handle.pump("job-7", "progress", {pct:0})`; then return `SubmitResult{job_resource:{ns,"job-7"}}` | Spawned resource announced + head pumped before return | Adapter (FE-CE-031) | Delete the spawn-announce step: step 4 subscribe returns ExplicitAbsent, head lost |
| 4 | Extension | `sub = s.subscribe(r.job_resource, from_cursor=0)` — just-spawned; captures head seq=1 + live | Subscription delivers stored then live | Host | Delete cursor-stream: no delivery position |
| 5 | Adapter | `ns_handle.pump("job-7", "progress", {pct:50})`, `pump("job-7","result",{…})`, then `retire("job-7","done")` → subscriber receives `onEnd("done")` | Envelopes routed in order; termination signalled | Adapter/Host | Delete onEnd: the resource ends while the view still labels the last state current (FE-CE-037) |
| 6 | Extension | Renders progress from seq 1..N; on `onEnd` relabels `ended at <ts>: done`; no role/turn/session in Envelope | User sees submit→progress→result→ended | Extension | Delete resource-directory: step 2 target not found |

**No-chat proof:** `Envelope` contains no `role`, `turn`, `sender`, `assistant`, or `message_type`
field. A "progress" envelope and a "result" envelope are distinct payloads in a stream, not
messages in a conversation. **covered (core).**

**S03 long task, leave/return (T-Boring).**

| Step | Actor | Action | State change | Authoritative | Delete-consequence |
|---|---|---|---|---|---|
| 1 | Extension | `s = host.open_scope(ns)`; `sub = s.subscribe(job_id, from_cursor=0)` — full history, first session | Delivers all stored then live | Host | Delete `open_scope`: no handle (FE-CE-026) |
| 2 | Extension | `sub.close()`; persist `{local_id:"job-7", recorded_ns_id:"ns_A", saved_last_seen:20}` | Subscription closed; persisted in extension store | Extension | Delete Envelope.seq: step 2 persist has no position |
| 3 | Adapter | Remote continues; `ns_handle.pump("job-7", "progress", {…})` for seq=21..35 | Host assigns seq, stores for next subscriber | Adapter/Host | Delete pump: seq 21-35 never enter |
| 4 | Extension | Return: `recorded_ns_id=="ns_A" == current_ns_id` → `s.subscribe(job_id, 21)`. Host delivers stored seq=21..35 then live | Catch-up rendered | Host/Extension | Delete resource-lifetime retention: no entries to replay |
| 4-alt | Extension | If ns regenerated: `recorded_ns_id != current_ns_id` → `from_cursor=0` | Full new-stream replay | Extension | Delete cursor-stream: no replay |
| 5 | Extension | `action.register(ns,"acme.job","read", ReadParams, ReadResult)`; passive: `s.invoke(job_id, "read", {})` → snapshot | Display | Adapter/Extension | Delete register: read returns CapabilityAbsent (FE-CE-030) |

**covered (core+adaptation for persisted-cursor discipline).**

**S02 Pi/Ordessa (T-Pi).**

| Step | Actor | Action | State change | Authoritative | Delete-consequence |
|---|---|---|---|---|---|
| 1 | Adapter | `namespaces.open({service:"ordessa"})` → `ns_P` | Namespace created | Host | Delete namespace: no scope |
| 2 | Adapter | `announce` pi.conversation/pi.tool-event/pi.approval with CapMap; `action.register` send/approve/cancel | Kinds + actions available | Adapter | Delete register: step 4/5 CapabilityAbsent (FE-CE-030) |
| 3 | Extension | `s = host.open_scope(ns_P)`; `sub = s.subscribe(tool_event_id, from_cursor=s.cursor_resolve(tool_event_id))` → live | Scope minted; subscription at live edge | Extension/Host | Delete `open_scope`: no scope (FE-CE-026). Delete cursor_resolve: replay → FE-CE-005 |
| 4 | Extension | `s.invoke(conversation_id, "send", {text:"..."})` → adapter sends to Pi, pumps response | Round-trip works | Adapter/Host | Delete typed-action: execute(any) |
| 5 | Extension | On approval event: `s.invoke(approval_id, "approve", {decision:"accept"})` | Approval honored | Adapter/Extension | Delete ordered-stream: events undelivered |
| — | Adapter | `ns_P.pump("tool-event-42", "tool.call", {…})` to live subscriber | Envelope routed | Adapter/Host | Delete pump: user sees no tool activity |

**covered (adaptation).**

**S06 two services, same id (T-Isolation).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Adapter A | `namespaces.open({service:"runner"})` → `ns_R` | Host | Delete **namespaces**: both services share one key space |
| 2 | Adapter B | `namespaces.open({service:"data"})` → `ns_D` | Host | Delete **namespaces**: as step 1 |
| 3 | Adapters A and B | both `announce({local_id:"job-1", kind:"acme.job", …})` and `action.register(ns, "acme.job", "cancel", Params, Result)` | Adapter | Delete **per-(ns,kind,action) registry**: the second registration overwrites the first's types (FE-CE-006) |
| 4 | Extension | `s_D = host.open_scope(ns_D)`; `s_D.subscribe((ns_R,"job-1"), 0)` → `ScopeDenied` | Host | Delete the **open_scope** seam / **same-ns rule**: the cross-namespace subscription succeeds |
| 5 | Extension | `s_D.invoke((ns_R,"job-1"), "cancel", {})` → `ScopeDenied` | Host | Delete the **same-ns rule**: a foreign action is invoked |
| 6 | Extension | `s_D.directory_list({kind:"acme.job"})` → only `ns_D`'s `job-1` | Host | Delete **directory scoping by namespace**: foreign ids leak (FE-CE-007 class) |

**covered (core).**

**S07 special artefact, no view installed (T-Unknown-Schema).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Adapter | `announce({local_id:"plot-1", kind:"acme.plot", payload_schema_id:"acme.plot.v1", capabilities:{export:"supported", share:"not_supported"}})` | Adapter | Delete **open CapMap**: `share` must be inferred from a failure (fake-support) |
| 2 | Extension | `s = host.open_scope(ns_id)`; `s.directory_list({kind:"acme.plot"})` renders `plot-1` | Host | Delete **open_scope**: no scope (FE-CE-026) |
| 3 | Host (selection) | no view claims `(ns_id, "acme.plot.v1")` in the claim table → the generic fallback serves the resource | Host | Delete **extension selection**: unclaimed schema has no renderer |
| 4 | Fallback | renders kind, registered action names with CapMap values (`export: supported`, `share: not_supported`, anything else `unknown`) and `payload_schema_id` | Host | Delete **generic-fallback-view**: user cannot see which action exists |
| 5 | Extension | `s.invoke((ns_id,"plot-1"), "read", {})` → `Result`, recursive walk rows; if no `read` registered → `CapabilityAbsent(read)` row | Adapter (content) / Host (route) | Delete **typed-action**: absence cannot be expressed structurally |
| 6 | Fallback | opaque payload renders `opaque: acme.plot.v1, no view installed` | Host | Delete **recursive walk**: unrenderable payload blanks the pane |
| 7 | Extension | a view mounts and `claim_schema(ns_id, "acme.plot.v1")` → `"claimed"`; the host records the owner, emits `on_claim_changed`, and the fallback stops serving | Extension | Delete **recorded selection**: two claimants have no defined winner and unmount is silent (FE-CE-034) |

**covered (core).**

**S08 resource + replaceable runner (T-Pair).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Adapter | `namespaces.open({service:"runner"})` → `ns_R`; `announce({local_id:"runner-1", kind:"acme.runner", capabilities:{execute:"supported"}})`; `action.register(ns_R, "acme.runner", "execute", ExecuteParams, SubmitResult)` | Adapter | Delete **register**: step 5 CapabilityAbsent (FE-CE-030) |
| 2 | Adapter | `namespaces.open({service:"data"})` → `ns_D`; `announce({local_id:"data-1", kind:"acme.data", …})` | Adapter | Delete **namespaces**: step 8's handoff becomes cross-namespace access |
| 3 | Extension | pair gesture → `s_R = host.open_scope(ns_R)`, `s_D = host.open_scope(ns_D)` | Host | Delete **pair gesture**: no second scope exists |
| 4 | Extension | `s_R.subscribe((ns_R,"runner-1"), from_cursor=s_R.cursor_resolve((ns_R,"runner-1")))` | Extension | Delete **cursor_resolve**: replay re-fires execute (FE-CE-005) |
| 5 | Extension | `s_R.invoke((ns_R,"runner-1"), "execute", {job:"…"})`; inside the handler the adapter `announce`s `job-7` and pumps its head, then returns `SubmitResult{job_resource:{ns_R,"job-7"}}` | Adapter (content) / Host (route) | Delete **spawn-announce**: step 6's subscribe returns ExplicitAbsent (FE-CE-031) |
| 6 | Extension | `s_R.subscribe(r.job_resource, from_cursor=0)` — invoke-spawned head | Host | Delete **just-spawned rule**: head lost (FE-CE-016) |
| 7 | Extension | `s_D.subscribe((ns_D,"data-1"), from_cursor=s_D.cursor_resolve((ns_D,"data-1")))` | Host | Delete **this subscription**: step 8's delivery has no mechanism — a scope is not a subscription (FE-CE-028) |
| 8 | Adapter | `ns_D` pumps `ArtifactReady`; it is delivered to the view through the `s_D` subscription on `data-1` | Adapter | Delete the **pair gesture** or **subscription**: the data service has no route to this view |
| 9 | Adapter | runner replaced → `ns_R.teardown("superseded")` → `s_R` subscribers receive `onEnd`; further scope operations report `NamespaceGone` | Host | Delete **teardown**: stale runner handles keep routing |
| 10 | Extension | re-pairs: `host.open_scope(ns_R')`, then steps 4–6 against the new namespace | Extension | Delete the **recorded_ns_id rule**: cursor resumes against the dead namespace (FE-CE-017) |

**covered (core).**

**S09 drop, unknown outcome, duplicate, out-of-order (T-Unknown).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Extension | `s = host.open_scope(ns)`; `action.register(ns, kind, "execute", …)`; `s.invoke(id, "execute", {…})` | Host | Delete **register**/**open_scope**: the command has no route or no scope (FE-CE-030) |
| 2 | Host | the link drops mid-command → the host returns `OutcomeUnknown`; no token, no retry policy | Host | Delete **four-variant rendering**: uncertainty hidden (FE-CE-003/019) |
| 3 | Extension | renders "outcome unknown — not confirmed" with Retry | Extension | Delete **not-current invariant**: stale success stays while fate is unknown |
| 4 | Extension | re-invoke is a fresh user gesture; the host issues no automatic resubmit | Host | Delete **never-auto-resubmit**: a reconnecting host replays the command and it executes twice |
| 5 | Adapter | **transient drop** (the same stream will resume): no teardown; on reconnect the adapter dedups by its own stable id and pumps in remote-stable logical order into the **same** namespace | Adapter | Delete the **transient/permanent split**: item 8 forces teardown on the observed loss, disposing the log, so step 6's same-namespace catch-up becomes unreachable (FE-CE-029) |
| 6 | Extension | if `recorded_ns_id` still matches (transient reconnect): catches up from `saved_last_seen+1`; if **permanent** (adapter called `teardown` → new `ns_id`): `open_scope(new_ns)`, replay from `0` | Extension | Delete the **recorded_ns_id rule**: the post-reconnect window is skipped (FE-CE-017) |
| 7 | Host | if the persisted `local_id` no longer resolves (retired while away) → `ExplicitAbsent`, rendered "this resource is gone" | Host | Delete **one-incarnation-per-local_id**: a re-announced `local_id` silently re-points the cursor (FE-CE-027) |

**covered (adaptation).**

**S10 extension crash while remote runs (T-Handoff).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Extension | view mounts and subscribes through `host.open_scope(ns_R)` | Host | Delete **open_scope**: no subscription (FE-CE-026) |
| 2 | Host | a throwing view is contained to its region | Host | Delete **error boundary**: the exception replaces the host surface |
| 3 | Extension | view unmounts/closes → host closes its subscriptions and releases routing references | Host | Delete **uninstall→host-closes-scope**: dead view keeps receiving |
| 4 | Adapters | resources keep running; `ns_D`/`ns_R` remain authoritative for their kinds and logs | Adapter | Delete **resource-lifetime retention**: later view has nothing to replay |
| 5 | Extension | new view mounts, `host.open_scope(ns_R)`, subscribes `from_cursor=0` (or `saved_last_seen+1` if it persisted a matching `recorded_ns_id`) | Host / Extension | Delete **cursor-stream-log**: step 5 replays nothing (FE-CE-022/024) |
| 6 | Extension | renders replayed history; if the adapter retires the resource meanwhile, the view receives `onEnd(reason)` and relabels rows ended, never current | Extension | Delete **subscription termination signal**: a retired resource stays labelled current (FE-CE-037) |

**covered (core).**

**S12 remove an "optional" core domain module (T-Compose).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Adapter | `ns_R.teardown("service removed")` | Host | Delete **teardown**: the removed service's resources and logs linger |
| 2 | Host | `ns_D` is unaffected: its directory entries and logs are untouched | Host | Delete **namespace scoping**: one teardown would dispose the other's logs |
| 3 | Extension | a mounted `plot.v1` view is uninstalled → host releases its claims, emits `on_claim_changed`, closes its scopes, and the fallback resumes serving | Host / Extension | Delete **recorded selection**: an uninstalled view keeps claiming silently (FE-CE-034) |
| 4 | Extension | the user's paired view is removed → other single-resource modules are untouched | Host | Delete the **no-pair-record** rule: removal would require reconciling paired state never recorded |
| 5 | Adapter | the runner returns and is re-opened → `namespaces.open` mints a new `ns_id`; views re-pair and replay from `0` | Adapter / Host | Delete the **new-ns_id-on-reopen** rule: a stale cursor resumes against the dead namespace |

**covered (adaptation).**

**S05 — config/Git browse, no session (deletion-complete).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this scenario |
|---|---|---|---|---|
| 1 | Host | `namespaces.open({service:"cfg"})` → `ns_C` | Host | Delete **namespaces**: nothing to browse |
| 2 | Adapter | `announce({local_id:"app.conf", kind:"config.tree", capabilities:{read:"supported"}})`; `action.register(ns_C, "config.tree", "read", ReadParams, ReadResult)` | Adapter | Delete **register**: step 4 read returns CapabilityAbsent (FE-CE-030) |
| 3 | Extension | `s = host.open_scope(ns_C)`; `s.directory_list({kind:"config.tree"})`; `s.directory_lookup(id)` | Host | Delete **open_scope**/**resource-directory**: cannot list without an active session |
| 4 | Extension | `r = s.invoke(id, "read", {})` → `ReadResult` | Adapter(content)/Host(route) | Delete **typed-action**: no `read`; execute(any) |
| 5 | Host | GenericWalk `ReadResult` → rows `port=8080` … | Host | Delete **generic-fallback-view**: the returned ReadResult has no renderer |
| 6 | Extension | User clicks **Read** → re-invoke `read` | View | Delete **generic-fallback-view**'s re-invoke action: stale row forever |
| 7 | Host | opaque body field → `RenderRow(…, "opaque: …, no view installed")` | Host | Delete **opaque handling**: crash or silently drop |

**S11 — service lacks cancel/history/resume (deletion-complete).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this scenario |
|---|---|---|---|---|
| 1 | Adapter | `announce kind:"acme.job", CapMap{cancel:"not_supported",history:"not_supported",resume:"not_supported"}` | Adapter | Delete **open CapMap**: UI infers absence from null → fake-support |
| 2 | Adapter | does **not** `action.register(ns,"acme.job","cancel")`; registers `status` (state) | Adapter | Delete **per-ns action registry**: no structural `CapabilityAbsent` |
| 3 | Extension | `s = host.open_scope(ns)` | Host | Delete **open_scope**: the invoke attempt has no handle (FE-CE-026/030) |
| 4 | Extension | user clicks Cancel → `s.invoke(job,"cancel",{})` → `CapabilityAbsent("cancel")` | Host | Delete **typed-action routing**: absence cannot be answered |
| 5 | Host/View | fallback renders `cancel: not_supported` (CapMap) + `invoke returned CapabilityAbsent`; any CapMap value `unknown` renders `support for X is unknown` | Host | Delete **generic-fallback-view**/**unknown row**: the user cannot tell unsupported from still-processing, and an `unknown` state is unrenderable (FE-CE-032) |
| 6 | Extension | Cancel control greyed with reason, never a spinner that resolves to success | View | Delete **open CapMap** (rendering side): a dead button looks enabled |

## R11.7b What an extension author must implement (the classified cost)

1. **Persist a cursor triple** per resumable subscription: `{local_id, recorded_ns_id, saved_last_seen}`.
2. **Choose `from_cursor` correctly**: `0` for a just-created / invoke-spawned head, `cursor_resolve`
   for a pre-existing resource's live edge, `saved_last_seen + 1` while `recorded_ns_id` matches.
3. **Handle `ExplicitAbsent`**: a persisted `local_id` that no longer resolves means the resource was
   retired; render "gone", never a complete-looking catch-up.
4. **Close subscriptions on unmount**, so the host can release routing references.
5. **Render all five `InvokeOutcome` variants**, including the not-confirmed state and the
   "resource no longer exists" state with Retry where the user may re-invoke.
6. **Register a typed `read` (value) or `status` (state) action** for anything the extension wants
   inspectable in the default view.
7. **Declare each result field's name and its `SchemaDecl` shape** (`scalar` | `opaque` | `record`
   | `list`), never a shape chosen to suit a renderer (§R11.5, FE-CE-033).
8. **Handle the termination signal**: on `onEnd(reason)` relabel all rows of the ended resource
   `ended at <ts>: <reason>`, withdraw current labels, and mark actions unconfirmed (§R11.5,
   FE-CE-037).

## R11.7c What an adapter author must implement (the other side of the cost, FE-CE-036)

The core declines content authority, so these duties are the adapter's; each is priced here because
the previous artifact priced only the extension side:

1. **Pump in remote-stable logical order** (R11.6 item 3). Cost: the adapter must buffer or
   sequence remote events by its own protocol's order before calling `pump`; the host does not
   reorder. Buys: S01 step 4 / S04 step 5 / S02 step 5 ordered delivery without a host reorder
   mechanism (deleted as vacuous).
2. **Dedup by the adapter's own protocol-level stable event id** (R11.6 item 5). Cost: the adapter
   must persist or receive a stable remote event id to key on. Buys: S09's duplicate-after-reconnect
   event reaches the subscriber once; the host dedup key is deleted.
3. **Teardown on permanent loss, not on transient loss** (R11.6 item 8/8b). Cost: the adapter must
   distinguish "I will resume this stream" from "the service is gone", and call `teardown` only for
   the latter. Buys: S09's same-namespace catch-up stays reachable after a drop (FE-CE-029), while a
   dead producer's presence is truthfully retracted (FE-CE-023).
4. **Retire-then-announce-successor memory lever** (R11.3 honest cost). Cost: the adapter bounds a
   long-lived resource's memory by retiring it and announcing a successor under a new `local_id`,
   accepting that the watching view sees an explicit end and a new beginning. Buys: S03/S10 resource-
   lifetime catch-up without an unbounded unnamed buffer; retirement is now observable via `onEnd`
   (FE-CE-037).

## R11.8 Reduction and the standing dead list

Retained core: namespaces, resource-directory, cursor-stream-log, typed-action, generic fallback
view (recursive total walk over `SchemaDecl`), `pump`, `cursor_resolve`, `from_cursor` selection
with the namespace guard, same-namespace scoped handles, per-namespace action typing, open CapMap,
never-auto-resubmit, the five-variant outcome rendering, presence-vs-reachability narrowing,
resource-incarnation burn, view-scope minting, namespaced recorded extension selection with the
`on_claim_changed` notice, the subscription termination signal (`onEnd`), the spawn-announce rule,
the transient/permanent loss split, the total API-state rendering rows, and the `SchemaDecl`
declaration grammar. Deleted or still-dead: adapter flat-schema obligation, spawned set, host
dedup/reorder, payload descriptor store, `invoke_id` on `OutcomeUnknown`, implicit live default,
persistent pair record, typed `replay_policy`, cross-namespace edge, `replay_mode`,
`Subscription.last_seq`, "envelope dropped when the subscription closes".

## R11.9 Honest cost and non-goals

The default view's ability to answer "current value / what changed / running-or-done" is carried by
the adapter's registered `read`/`status` action; with none registered the view truthfully says the
value cannot be obtained. The log's memory is proportional to a resource's total emitted events,
bounded only by the producing adapter via retire-then-announce — now observable through `onEnd`.
`"unknown"` CapMap values and `ExplicitAbsent` states are rendered as explicit rows, never guessed.
A hard-killed adapter leaves a stale registration until the host process ends; the core declines a
liveness protocol. Non-goals unchanged: no cross-namespace joins or edges, no content search, no host
turn/role/session model, no host capability vocabulary, no automatic re-pairing, no host
apply-idempotency or event dedup, no heartbeat. `FE-CE-007` stays OPEN on demoted B's ledger; A has
no edges mechanism, and this round neither repairs nor rejects B — deferring is not repairing.

## R11.10 Experiments (MODEL ONLY — each proves the model it encodes, never the product or a protocol)

**EXPERIMENT R11-A — storage ownership and the disposal point (FE-CE-022, FE-CE-024).**
```python
# MODEL ONLY: proves the storage-ownership/disposal model, not the product or any protocol.
class Stream:                       # the cursor stream IS the log
    def __init__(self):
        self.log = []               # retained (seq, payload)
    def pump(self, payload):
        seq = len(self.log) + 1
        self.log.append((seq, payload))
        return seq
    def subscribe(self, from_cursor, live):
        return [(s, p) for (s, p) in self.log if s >= from_cursor] + live
    def retire(self, reason):
        self.log = []               # the sole disposal point

def t_boring(dispose_on_close):
    job = Stream()
    for pct in range(1, 21):
        job.pump({"pct": pct})
    sub = job.subscribe(0, [])                      # first session: full head
    assert len(sub) == 20, len(sub)
    if dispose_on_close:
        job.log = []                                # the deleted clause: "envelope is dropped"
    for pct in range(21, 36):
        job.pump({"pct": pct})                      # no subscriber alive
    return job.subscribe(21, [])                    # the T-Boring return

old, new = t_boring(True), t_boring(False)
print("dispose-on-close   -> caught up %d envelopes" % len(old))
print("retain-to-retire   -> caught up %d envelopes" % len(new))
assert len(old) == 0 and len(new) == 15
print("FE-CE-024 confirmed: retire/teardown is the only disposal point")
```

**EXPERIMENT R11-B — outcome variants, and unconfirmed is never rendered as current (FE-CE-019, FE-CE-023).**
```python
# MODEL ONLY: proves the variant-rendering model, not the product or any protocol.
U, CAP, SCOPE, ABS = "OutcomeUnknown", "CapabilityAbsent", "ScopeDenied", "ExplicitAbsent"

def render(outcome, prior, ts):
    if outcome not in (U, CAP, SCOPE, ABS):         # Result -> GenericWalk rows
        return ("current@%s" % ts, outcome)
    if outcome == U:
        if prior:
            return ("last-confirmed@%s NOT current" % prior[1], prior[0])
        return ("value not confirmed; read did not return", [])
    if outcome == ABS:
        return ("this resource no longer exists", [])
    return ("not obtainable: %s" % outcome, [])

prior = (["port=8080"], "t0")
assert render(U, prior, "t1")[0].startswith("last-confirmed")
assert render(ABS, prior, "t1")[0] == "this resource no longer exists"
assert render(ABS, prior, "t1") != render(["port=8080"], prior, "t1")
print("five variants distinct; unconfirmed/absent never rendered as current")
```

**EXPERIMENT R11-C — GenericWalk totality and recursion, decidable over SchemaDecl (FE-CE-020, FE-CE-021, FE-CE-033).**
```python
# MODEL ONLY: proves the walk is total and recursive against SchemaDecl.
DECL = {  # the SchemaDecl grammar: scalar | opaque | record | list
  "branch": {"kind": "scalar"}, "diff_body": {"kind": "opaque"},
  "files": {"kind": "list", "item": {"kind": "record", "fields": {
      "path": {"kind": "scalar"}, "additions": {"kind": "scalar"},
      "deletions": {"kind": "scalar"},
      "hunks": {"kind": "list", "item": {"kind": "record", "fields": {
          "lines": {"kind": "scalar"}}}}}}}}

def walk(decl, actual, path=""):
    rows = []
    if decl["kind"] == "scalar":
        v = actual if isinstance(actual, (str, int, float, bool)) else None
        rows.append((path or "value", str(v) if v is not None
                     else "(unreadable: declared scalar)"))
    elif decl["kind"] == "opaque":
        rows.append((path or "value", "(opaque: no view installed)"))
    elif decl["kind"] == "record":
        for name, item in decl["fields"].items():
            p = "%s.%s" % (path, name) if path else name
            if not isinstance(actual, dict) or name not in actual:
                rows.append((p, "(absent at runtime)"))
            else:
                rows += walk(item, actual[name], p)
    elif decl["kind"] == "list":
        if not isinstance(actual, list):
            rows.append((path or "value", "(unreadable: declared list)"))
        else:
            for i, item in enumerate(actual):
                rows += walk(decl["item"], item, "%s[%d]" % (path, i))
    return rows

nested = {"branch": "main", "diff_body": None,
          "files": [{"path": "a.rs", "additions": 1, "deletions": 0,
                     "hunks": [{"lines": 9}, {"lines": 4}]}]}
rows = walk(DECL, nested)
assert any(p == "files[0].hunks[1].lines" for p, v in rows)
assert any(p.endswith("deletions") and v == "(absent at runtime)" for p, v in walk(DECL, {
    "branch": "main", "files": [{"path": "a.rs", "additions": 1, "hunks": [{"lines": 3}]}]}))
print("recursive walk over SchemaDecl, total, no depth constant, no exception")
```

**EXPERIMENT R12-A — the resource-incarnation fix (FE-CE-027).**
```python
# MODEL ONLY: proves the incarnation rule, not the product or any protocol.
class Namespace:
    def __init__(self, burn_local_ids):
        self.resources, self.burned, self.burn = {}, set(), burn_local_ids
    def announce(self, lid):
        if self.burn and lid in self.burned:
            raise RuntimeError("LocalIdBurned")
        self.resources[lid] = []
    def pump(self, lid, ev):
        self.resources[lid].append(ev)
        return len(self.resources[lid])
    def subscribe(self, lid, c):
        if lid not in self.resources:
            return ("ExplicitAbsent", [])
        return ("ok", [e for i, e in enumerate(self.resources[lid], 1) if i >= c])
    def retire(self, lid):
        del self.resources[lid]
        if self.burn:
            self.burned.add(lid)

for burn in (False, True):
    ns = Namespace(burn)
    ns.announce("job-7")
    for i in range(1, 21):
        ns.pump("job-7", {"pct": i})
    ns.retire("job-7")
    if burn:
        try:
            ns.announce("job-7")
        except RuntimeError as e:
            print("burn=True re-announce ->", e)
        ns.announce("job-7#2")
        print("burn=True old id ->", ns.subscribe("job-7", 21))
    else:
        ns.announce("job-7")
        for i in range(1, 6):
            ns.pump("job-7", {"pct": i})
        print("burn=False stale cursor ->", ns.subscribe("job-7", 21))
print("FE-CE-027: burn makes a stale cursor return ExplicitAbsent instead of skipping")
```

**EXPERIMENT R12-B — S01's subscription order (FE-CE-025).**
```python
# MODEL ONLY: proves the ordering/cursor rule, not the product or any protocol.
class Stream:
    def __init__(self):
        self.log, self.subs = [], []
    def pump(self, ev):
        self.log.append(ev)
        for s in self.subs:
            if s.c <= len(self.log):
                s.got.append(ev)
    def subscribe(self, c):
        return (c, [e for i, e in enumerate(self.log, 1) if i >= c])
    def cursor_resolve(self):
        return len(self.log) + 1

s = Stream(); s.pump("h"); s.pump("e")
assert s.subscribe(s.cursor_resolve())[1] == []
assert len(s.subscribe(0)[1]) == 2
print("FE-CE-025: live edge wrong for a just-created resource; from_cursor=0 admits inputs")
```

**EXPERIMENT R12-C — every call in the scenario tables is declared (FE-CE-026, FE-CE-030).**
```python
# MODEL ONLY: a static check of the artifact's own tables, not a product test.
import io, re, sys
DECLARED = {"open_scope", "directory_list", "directory_lookup", "cursor_resolve",
            "subscribe", "invoke", "announce", "retire", "teardown", "pump",
            "register", "close", "claim_schema", "on_claim_changed", "open"}
NOT_A_CALL = {"execute"}
SPAN = re.compile(r"`([^`]+)`")
CALL = re.compile(r"(?<![A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)\s*\(")
path = sys.argv[1]
lines = io.open(path, encoding="utf-8").read().split("\n")
tables, cur = 0, None
for l in lines:
    if l.startswith("| Step |"):
        tables += 1
for l in lines:
    if l.startswith("| "):
        for span in SPAN.findall(l):
            for name in CALL.findall(span):
                assert name in DECLARED or name in NOT_A_CALL, (name, span)
print("tables:", tables, "— every call token resolves to a declared member")
assert tables == 12
```

**EXPERIMENT R13-A — S08's data delivery has a subscription (FE-CE-028).**
```python
# MODEL ONLY: a scope is not a subscription; delivery requires subscribe on the resource.
class Scope:
    def __init__(self, ns):
        self.ns, self.subs = ns, {}
    def subscribe(self, rid, c):
        self.subs[rid] = c
        return self.subs[rid]
class NS:
    def __init__(self): self.log = {}
    def pump(self, rid, ev):
        self.log.setdefault(rid, []).append(ev)
observed = {}
ns_D, s_D = NS(), Scope("ns_D")
s_D.subscribe("data-1", 0)          # S08 step 7: the subscription row
ns_D.pump("data-1", "ArtifactReady")
observed["s_D"] = [e for rid, evs in ns_D.log.items() if rid in s_D.subs for e in evs]
print("delivered:", observed)
assert observed["s_D"] == ["ArtifactReady"]
```

**EXPERIMENT R13-B — transient loss does not teardown; permanent loss does (FE-CE-029).**
```python
# MODEL ONLY: proves the branches are separate, not the product.
class NS:
    def __init__(self): self.log, self.torn = [1, 2], False
    def teardown(self): self.torn, self.log = True, []
def catchup_after(loss_is_permanent):
    ns = NS()
    if loss_is_permanent:
        ns.teardown()                       # item 8b: permanent
        return None                         # view must re-pair, replay from 0
    return [e for e in ns.log if e > 1]     # item 8: transient, saved_last_seen+1
print("transient:", catchup_after(False), "permanent:", catchup_after(True))
assert catchup_after(False) == [2] and catchup_after(True) is None
print("FE-CE-029: same-ns catch-up reachable only when teardown did not run")
```

**EXPERIMENT R13-C — retire is observable to live subscribers; invoke-on-retired is defined (FE-CE-037).**
```python
# MODEL ONLY: proves the termination-signal model, not the product.
class Subscription:
    def __init__(self): self.ended = None
class Resource:
    def __init__(self): self.log, self.subs, self.retired = [], [], False
    def subscribe(self, s): self.subs.append(s)
    def pump(self, ev): self.log.append(ev)
    def retire(self, reason):
        self.retired = True
        for s in self.subs:
            s.ended = reason            # onEnd
    def invoke(self):
        return ("ExplicitAbsent",) if self.retired else ("Result", self.log)
r, s = Resource(), Subscription()
r.subscribe(s); r.pump("ev1"); r.retire("bound memory")
print("subscriber ended:", s.ended, "invoke:", r.invoke())
assert s.ended == "bound memory" and r.invoke() == ("ExplicitAbsent",)
```

**EXPERIMENT R13-D — a Result's spawned resource is announced before it is returned (FE-CE-031).**
```python
# MODEL ONLY: proves the spawn-announce rule, not the product.
class NS:
    def __init__(self): self.r = {}
    def announce(self, lid): self.r[lid] = []
    def invoke_submit(self):
        self.announce("job-7")              # announce inside the handler
        self.r["job-7"].append("head")      # head pumped inside the handler
        return {"job_resource": "job-7"}    # Result names an already-announced resource
    def subscribe(self, lid, c):
        return self.r.get(lid, "ExplicitAbsent")[c:]
ns = NS(); out = ns.invoke_submit()
print("spawned head delivered:", ns.subscribe(out["job_resource"], 0))
assert ns.subscribe(out["job_resource"], 0) == ["head"]
print("FE-CE-031: from_cursor=0 works because the resource was announced before the Result returned")
```
