
# Candidate A — Namespaced resource/event space

## A.1 Core bet

The host core is a **namespaced directory of resources**, each an addressable service-scoped identity plus a seq-ordered replayable event stream plus a declared capability set. The host's only authority is identity, namespace isolation, subscription routing, and per-resource event ordering; "agent", "session" and "chat" are resource **kinds declared by adapters**, never host types — nothing smaller keeps a remote task observable while its page and its view resolver are both gone (S03/S10) or keeps two services' colliding ids from crossing (S06).

## A.2 Core concepts and operations

**Namespace.** `namespaces.open(service_descriptor) → NamespaceHandle{id}`; `namespace.teardown(reason)`. Authoritative in host. Holds the id partition: every `resource_id` is `(namespace_id, local_id)`, so a raw id collision across services is structurally impossible. Lifecycle: opened on adapter connect, torn down on adapter disconnect; teardown disposes all its resources and force-closes every subscription to them.

**Resource.** `namespace.announce(resource_descriptor{id, kind:string, capabilities:CapSet})` (adapter-origin only, host verifies uniqueness within namespace); `namespace.retire(resource_id, reason)`; `directory.list(namespace_id, filter{kind?}) → [descriptor]`; `directory.lookup(namespace_id, resource_id) → descriptor | ExplicitAbsent`. Content authority is the **producing adapter**; identity/lifecycle authority is the host. Created on announce; disposed on retire or namespace teardown.

**Event stream.** `stream.subscribe(resource_id, from_cursor?) → Subscription{ close(), onNext(Envelope) }`. `Envelope = {resource_id, seq:int, ts, kind:string, payload:T}`, where `T` is the concrete type registered for `kind` — the host refuses to deliver any `kind` whose payload type was not registered (this is what keeps it from being an `execute(any)` bus). `cursor.resolve(resource_id) → seq` supports resume. `seq` is monotonic per resource, assigned by the host on ingest; dedup/reorder is the host's guarantee within a resource. Authority: ordering in host, payload content in adapter. Unsubscribe = `Subscription.close()`; host also closes it on view-resolver unmount or page destroy (handle owned by the subscriber's scope).

**Capability set.** `capabilities.get(resource_id) → CapSet`. `CapSet` is a declared tagged union per feature, e.g. `cancel ∈ {supported, not_supported}`, `history ∈ {supported{depth}, not_supported}`, `resume ∈ {supported, not_supported}`. Declared by the adapter, never probed or inferred.

**Action.** `action.invoke(resource_id, action_type:string, params:RegisteredType) → Result{registered type} | CapabilityAbsent(action_type)`. `action_type`s are registered per `kind` with concrete param/result types; no free-form params or results.

## A.3 Boundary rules

A service adapter must translate its protocol into four things: (1) `announce`/`retire` of resources with `kind` + `CapSet`; (2) a seq-numbered typed event stream per resource; (3) a registry of the `kind` payload types it emits; (4) typed `action` handlers. To express "this service does not support this," the adapter **omits the feature from `CapSet` and the action from the kind's registry**; any attempt to `invoke` it returns the explicit sentinel `CapabilityAbsent(action_type)`, and `capabilities.get` returns `not_supported`. `ExplicitAbsent` and `CapabilityAbsent` are distinct non-null terminal states; absence is never inferred from a missing message, a timeout, or a null.

## A.4 Extension mechanism

An extension registers a **view resolver**: `{match: kind + payload_schema_id, component, optional typed action bindings}`. Selection: host resolves by exact kind/schema match, most-specific-first; **default fallback is a host-builtin generic descriptor view** that renders kind, capability set, declared actions and a last-envelope summary — so unknown content is never blank or silently dropped (S07). An extension may render, subscribe (via the subscription handle), and invoke registered actions; it may **not** mint ids, bypass its namespace, subscribe across namespaces, register free-form event names, or touch a global context — it receives only a resource-scoped `SubscriberScope{descriptor, subscriptionHandle, typedInvoker}`, not a capability grab-bag. Guarantees: resolver **absent** → generic view; resolver **throws** → host error-boundary keeps delivering the stream to a re-mounted resolver (resolvers are consumers, not transport owners); resolver **unmounted mid-operation** → host closes its handles, the remote resource stays authoritative and observable, and a new page re-subscribes via `from_cursor`.

## A.5 Scenario trajectories (owner per step)

**S01 — text-only agent, no profile/workspace/tool/recovery.** 1. User connects simple service → host: `namespaces.open` (host). 2. Adapter `announce` one resource, kind `text.stream`, `CapSet{cancel:not_supported, history:not_supported, resume:not_supported}` (adapter). 3. User types; extension bound to kind `text.stream` calls `action.invoke(id,"send",{text})` (extension → adapter). 4. Adapter emits envelopes `seq 1..n` of a registered `TextDelta` payload (adapter). 5. Resolver renders deltas as it chooses; **no assistant-message object is materialised in the core** — "message" is purely the view's interpretation (extension). Covered; works with zero profile/workspace/tool/recovery.

**S04 — submit/progress/result, no chat protocol.** 1. `namespaces.open`; adapter `announce` kind `acme.job`, `CapSet{cancel:supported, history:supported{depth:∞}, resume:supported}`, actions registered `submit`,`result` (adapter). 2. View resolver for `acme.job` renders three sections from envelopes of payload types `JobProgress`/`JobResult` (extension). 3. No session, no turn, no role field exists in any envelope — the envelope is `{resource_id,seq,ts,kind,payload}` only. Answer to the D12 question for A: **yes** — the trajectory is written against core ops with no core concept named or shaped like conversation/assistant/session/run.

**S05 — browse config/git without a session.** 1. Adapter `announce` kind `config.tree` `CapSet{read}` and `git.diff` `CapSet{read}` (adapter). 2. `directory.list(ns, filter{kind:config.tree})` (host). 3. Resolver for `config.tree` renders; **no `namespaces.open` for an agent and no run** — only the read-connection namespace exists (host/extension). Covered: a domain module lives with no active session/run.

**S02 — Pi via Ordessa, tools + approvals, keep conversing.** 1. Ordessa adapter `namespaces.open`; `announce` a resource per stream with kinds like `pi.conversation`, `pi.tool-event`, `pi.approval`, each a distinct kind the adapter declares (adapter). 2. The "conversation" view is an **extension resolver** on `pi.conversation`, not a core type (extension). 3. Approvals are `action.invoke(pi.approval,"approve",…)` (extension → adapter). Mapping: the real chain's session/tools/approval become resources+actions carried by the adapter and a conversation-shaped **extension**; the core stays neutral. Covered via adaptation+extension.

**S03 — long task, leave page, return later for progress+artefacts.** 1. User opens `acme.job` resolver → subscribes (extension). 2. User navigates away → host closes that `Subscription` (handle owned by page scope) (host). 3. Remote keeps emitting; adapter keeps `announce`+envelopes (adapter). 4. User returns → new resolver `directory.lookup(ns,job_id)` then `stream.subscribe(id, from_cursor=resolved)`; host replays missed envelopes in seq order (host). Page lifecycle ≠ execution lifecycle: resource lives with the namespace/adapter, subscription lives with the page. Covered.

**S06 — two services, same session/task id.** 1. Two adapters open **separate** namespaces → `resource_id = (ns_A,"job-1")` and `(ns_B,"job-1")` cannot collide in directory or routing (host). 2. Capability/auth checks are namespace-scoped, so an action can't cross (host). Covered by namespacing.

**S07 — special artefact, view not installed.** 1. Adapter `announce` kind `acme.plot`, registered payload `PlotData` (adapter). 2. No resolver matches → **host generic descriptor view** shows kind, `PlotData` fields summary, declared actions (host). Unknown content is explained, not blank. Covered.

**S08 — resource + execution modules cooperate; execution replaceable.** 1. Resource module exposes a resource of kind `data.ref`; execution module exposes kind `runner`. 2. A coordinating view resolves both kinds and calls `action.invoke(runner,"execute",{ref})` — passing an **id + typed params**, not shared mutable state (extension). 3. Replacing the runner adapter only changes who answers `kind:runner`; the resource side is untouched (adaptation). Covered without a global-state channel.

**S09 — drop, unknown outcome, reconnect dup/out-of-order.** 1. Link drops mid `send` → `invoke` returns `Unknown`; UI does not guess (adapter). 2. Reconnect: adapter **replays** its envelope history; host dedups by `(resource_id,seq)` and reorders to seq; `cursor.resolve` tells the resume point (host). 3. Idempotent action re-delivery: the `invoke` request carries a host-assigned `(namespace_id,action_seq)` so a double-send is visible; the adapter declares whether it dedups. Authority for "what is true": the adapter's replayed seq-ordered stream; the host only guarantees order/dedup, never invents outcomes. Covered (host+adapter).

**S10 — extension crashes/closes/uninstalls while remote task runs.** 1. Resolver throws/unmounts → host closes its subscription handles, resource stays (host). 2. Remote still authoritative; a re-mounted or the generic resolver re-subscribes from `cursor` (host). 3. Running state stays explainable because the resource+stream never depended on the extension. Covered.

**S11 — no cancel/history/resume.** 1. Adapter `announce` with `CapSet{cancel:not_supported, history:not_supported, resume:not_supported}` (adapter). 2. UI reads `capabilities.get` → renders disabled controls labelled "not offered by this service" (extension, driven by declared absence). 3. `invoke(...,"cancel")` → `CapabilityAbsent`. Absence is stated, never pretended. Covered.

**S12 — remove an "optional" core domain module.** 1. Removing an optional **adapter** (e.g. git) tears down its namespace; other namespaces and host unaffected (host). 2. Removing an optional **resolver** falls back to the generic view (host). Covered.

## A.6 Delegation / deletion experiments

Each claimed-core mechanism is named with the scenario-step that fails if it is deleted; two mechanisms were considered and **removed** because no required scenario fails.

## A.7 Second-service onboarding cost

To attach a **service with a different protocol**, an implementer must write: (1) a `namespaces.open` connect; (2) for each observable thing, an `announce(descriptor{id,kind,CapSet})`/`retire`; (3) a payload-type registration per `kind`; (4) a seq-ordered event pump (or rely on host seq-assignment on ingest); (5) typed `action` handlers per registered `action_type`; (6) an explicit `CapSet` for every feature the service lacks, as `not_supported` sentinels. Six items; the core event-ordering/dedup/namespace/cursor machinery is **reused, not rewritten**. To add **only a view**, an implementer must write: one `{match:kind+schema, component}` resolver with no protocol code and no knowledge of other modules.

## A.8 Honest cost and non-goals

Weakest points: modelling transient text as an addressable **resource** is heavier than B for pure stateless round-trips; the generic fallback view (S07) is shallow and every rich view is an extension; the host assigns `seq` but relies on the adapter to make `action` re-delivery idempotent (S09's double-execution guarantee is **partial**, host+adapter joint). Non-goals: no cross-namespace joins, no content search, no host-level turn/role model. Largest second-order cost: every "thing" being a resource pushes adapters to give identity + capability declarations to otherwise ephemeral streams. I removed, and did not add, a host `session` object and a host `turn/message-role` envelope field: no required scenario fails without them (S04 explicitly passes without them), so including them would be relabelled conversation smuggling.

## A.9 Mechanism disposition

<<<FE-MECH-START>>>
namespaces|core|S06 step 1 — colliding resource ids from two services would cross in directory and routing|R001/A §A.6-namespaces
resource-directory|core|S05 step 2 — domain module could not be listed/looked-up without a session|R001/A §A.6-directory
ordered-replayable-stream|core|S03 step 4 and S09 step 2 — no return-later catch-up, no host dedup/reorder|R001/A §A.6-stream
capability-declaration|core|S11 step 2 — absence would be inferred from null, faking support|R001/A §A.6-cap
typed-action|core|S08 step 2 — no idempotent typed request without execute(any)|R001/A §A.6-action
generic-fallback-view|core|S07 step 2 — unknown artefact renders blank|R001/A §A.6-fallback
host-session-object|removed|none — no scenario requires it; S04 passes without it|R001/A §A.8
host-turn/role-envelope-field|removed|none — its presence is the D12 disqualifier; S04 passes without it|R001/A §A.8
<<<FE-MECH-END>>>

## A.10 Proposed scenario status (pending verifier)

<<<FE-SCENARIO-START>>>
S01|covered|core|A §A.5 text.stream resource, no profile/tool|R001/A §A.5-S01
S02|covered|adaptation|A §A.5 kinds + conversation resolver + approve action|R001/A §A.5-S02
S03|covered|core|A §A.5 namespace outlives page; re-subscribe from cursor|R001/A §A.5-S03
S04|covered|core|A §A.5 submit/progress/result, no chat object|R001/A §A.5-S04
S05|covered|core|A §A.5 config/git resources, no session|R001/A §A.5-S05
S06|covered|core|A §A.5 namespaced resource ids|R001/A §A.5-S06
S07|covered|core|A §A.5 generic fallback descriptor view|R001/A §A.5-S07
S08|covered|extension|A §A.5 cross-kind view passing ids, replaceable runner|R001/A §A.5-S08
S09|partial|core|A §A.5 host seq/dedup; double-exec needs adapter idempotency|R001/A §A.5-S09
S10|covered|core|A §A.5 handles closed, resource stays authoritative|R001/A §A.5-S10
S11|covered|core|A §A.5 not_supported CapSet + CapabilityAbsent|R001/A §A.5-S11
S12|covered|adaptation|A §A.5 adapter teardown / resolver fallback|R001/A §A.5-S12
<<<FE-SCENARIO-END>>>

