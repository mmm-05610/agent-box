# Best Candidate (R001 revised) — Namespaced resource/event space with open capability vocabulary

## R.1 Core bet

The host core is a **namespaced directory of resources**, each an addressable service-scoped identity plus a seq-ordered replayable event stream plus a declared **open** capability map. The host's only authority is identity, namespace isolation, subscription routing, and per-resource event ordering; "agent", "session", "chat" are resource kinds declared by adapters, never host types, and **capability names are adapter-chosen strings with no predefined meaning in the host**. Nothing smaller keeps a remote task observable while its page and its view resolver are both gone (S03/S10) or keeps two services' colliding ids from crossing (S06).

## R.2 Core concepts and operations

**Namespace.** `namespaces.open(service_descriptor) → NamespaceHandle{id}`; `namespace.teardown(reason)`. Authoritative in host. Every `resource_id` is `(namespace_id, local_id)`; raw id collision across services is structurally impossible. Lifecycle: opened on adapter connect, torn down on adapter disconnect; teardown disposes all its resources and force-closes every subscription to them.

**Resource.** `namespace.announce(resource_descriptor{id, kind:string, capabilities:CapMap})` (adapter-origin only, host verifies uniqueness within namespace); `namespace.retire(resource_id, reason)`; `directory.list(namespace_id, filter{kind?}) → [descriptor]`; `directory.lookup(namespace_id, resource_id) → descriptor | ExplicitAbsent`. Content authority is the **producing adapter**; identity/lifecycle authority is the host.

**Event stream.** `stream.subscribe(resource_id, from_cursor?) → Subscription{ close(), onNext(Envelope) }`. `Envelope = {resource_id, seq:int, ts, kind:string, payload_schema_id:string, payload:RegisteredType}`, where the host refuses to deliver any `payload_schema_id` whose type was not registered. `cursor.resolve(resource_id) → seq` supports resume. `seq` is monotonic per resource, assigned by the host on ingest. Unsubscribe = `Subscription.close()`; host also closes it on resolver unmount or page destroy (handle owned by the subscriber's scope).

**Capability map (OPEN, per FE-CE-002 fix).** `capabilities.get(resource_id) → CapMap` where `CapMap = {capability_name: string → {supported | not_supported | unknown}}`. The host defines no set of valid capability names; the adapter populates the map with whatever names describe its features. The host guarantees only the three-state sentinel; absence of a name from the map is not interpretable — it means "unknown", not "unsupported". This prevents the host from encoding a session-recovery vocabulary while retaining truthful absence (S11).

**Action.** `action.invoke(resource_id, action_type:string, params:RegisteredType) → Result{RegisteredType} | CapabilityAbsent(action_type)`. `action_type`s are registered per `kind` with concrete param/result types; no free-form params or results. The host returns `CapabilityAbsent` only when the adapter explicitly registered the action as absent or the `kind` has no such `action_type` in its registry.

## R.3 Boundary rules

A service adapter must translate its protocol into four things: (1) `announce`/`retire` of resources with `kind` + `CapMap`; (2) a seq-numbered typed event stream per resource; (3) a registry of payload types per `kind`; (4) typed `action` handlers. To express "this service does not support this," the adapter sets the relevant capability_name to `not_supported` in `CapMap` and/or omits the action from the kind's registry; any attempt to `invoke` returns `CapabilityAbsent(action_type)`. `ExplicitAbsent` and `CapabilityAbsent` are distinct non-null terminal states; absence is never inferred from a missing message, a timeout, or a null.

## R.4 Extension mechanism (FE-CE-002 fix applied)

An extension registers a **view resolver**: `{match: kind + payload_schema_id, component, optional typed action bindings}`. Selection: host resolves by exact kind/schema match, most-specific-first; **default fallback is a host-builtin generic descriptor view** that renders: resource kind, declared action names with their typed parameter schemas, the open `CapMap` entries as plain labelled name→state pairs (no icon affordance, no invocation button, no "last envelope as output" treatment), the last envelope's `payload_schema_id` (not its content), and the line: *"No dedicated view installed; structured data available via subscription."* Unknown content is never blank or silently dropped (S07) and is never presented with a run/agent reading (FE-CE-002 fix).

An extension may render, subscribe (via the subscription handle), and invoke registered actions; it may **not** mint ids, bypass its namespace, subscribe across namespaces, register free-form event names, or touch a global context — it receives only a resource-scoped `SubscriberScope{descriptor, subscriptionHandle, typedInvoker}`, not a capability grab-bag. Guarantees: resolver **absent** → generic view (rendering as above); resolver **throws** → host error-boundary keeps delivering the stream to a re-mounted resolver; resolver **unmounted mid-operation** → host closes its handles, the remote resource stays authoritative and observable, a new page re-subscribes via `from_cursor`.

## R.5 Scenario trajectories (owner per step, revised)

**S01 — text-only agent.** 1. User connects simple service → `namespaces.open` (host). 2. Adapter `announce{kind:"text.stream", CapMap:{"streaming":supported, "cancel":not_supported, "resume":not_supported}}` (adapter — names are adapter-chosen, not core-defined). 3. User types; extension bound to kind `text.stream` calls `action.invoke(id,"send",{text})` (extension → adapter). 4. Adapter emits envelopes `seq 1..n` of registered `TextDelta` payload (adapter). 5. Resolver renders deltas as it chooses; no assistant-message object materialised in core — "message" is purely the view's interpretation (extension). Covered; zero profile/workspace/tool/recovery.

**S04 — submit/progress/result, no chat protocol.** 1. `namespaces.open`; adapter `announce{kind:"acme.job", CapMap:{"cancel":supported,"history":supported,"resume":supported}}` — adapter-chosen names; actions registered `submit`,`result` (adapter). 2. View resolver for `acme.job` renders sections from envelopes of payload types `JobProgress`/`JobResult` (extension). 3. No session, no turn, no role field in any envelope — envelope is `{resource_id,seq,ts,kind,payload_schema_id,payload}` only. D12 answer: **yes** — trajectory written against core ops with no core concept named or shaped like conversation/assistant/session/run; the CapMap names are adapter-authored strings, not host types.

**S05 — browse config/git without session.** 1. Adapter `announce{kind:"config.tree", CapMap:{"read":supported}}` (adapter). The name `"read"` is not reserved by the host; it is a meaningful adapter label. 2. `directory.list(ns, filter{kind:"config.tree"})` (host). 3. Resolver for `config.tree` renders via `action.invoke("read") → current snapshot` or via stream envelopes (extension). No `namespaces.open` for an agent and no run. Covered.

**S02 — Pi via Ordessa, tools + approvals.** 1. Ordessa adapter `namespaces.open`; `announce` resources with kinds `pi.conversation`, `pi.tool-event`, `pi.approval`, each adapter-declared (adapter). 2. The "conversation" view is an extension resolver on `pi.conversation`, not a core type (extension). 3. Approvals via `action.invoke(pi.approval,"approve",…)`. Mapping: real chain's session/tools/approval become resources+actions carried by adapter and a conversation-shaped extension; core stays neutral. Covered via adaptation+extension.

**S03 — long task, leave page, return later.** 1. User opens resolver → subscribes (extension). 2. Navigates away → host closes Subscription (host). 3. Remote keeps emitting; adapter keeps announce+envelopes (adapter). 4. Returns → new resolver `directory.lookup(ns,job_id)` then `stream.subscribe(id, from_cursor=resolved)`; host replays missed envelopes in seq order (host). Page lifecycle ≠ execution lifecycle. For passive snapshot resources: `action.invoke("read")` returns current value without replay (host+adapter). Covered.

**S06 — two services, same id.** Separate namespaces → `(ns_A,"job-1")` ≠ `(ns_B,"job-1")`. Auth/capability checks namespace-scoped. Covered by namespacing.

**S07 — special artefact, view not installed.** Adapter `announce{kind:"acme.plot"}`. No resolver matches → host generic view renders: kind `acme.plot`, declared actions and parameter schemas, CapMap as name→state labels, last envelope's `payload_schema_id`, "no dedicated view installed." Kind, not agent. Covered.

**S08 — resource + execution cooperate, replaceable.** Resource module kind `data.ref`; execution module kind `runner`. Coordinating view resolves both and calls `action.invoke(runner,"execute",{ref})` — id + typed params, no shared mutable state. Replacing runner adapter changes who answers `kind:runner`; resource untouched. Covered without global-state channel.

**S09 — drop, unknown outcome, reconnect dup/out-of-order.** 1. Link drops mid invoke → `Unknown` returned; UI does not guess (adapter). 2. Reconnect: adapter replays envelope history; host dedups by `(resource_id,seq)` and reorders; `cursor.resolve` gives resume point (host). 3. Action idempotency: host-assigned `(namespace_id, action_seq)` on each invoke; adapter declares whether it dedups. **Partial** — double-execution guarantee is host+adapter joint; no scenario forces pure-host idempotency.

**S10 — extension crashes while remote task runs.** Resolver throws/unmounts → host closes subscription handles; resource stays. Remote authoritative; re-mounted or generic resolver re-subscribes from cursor. Running state explainable because resource+stream never depended on the extension. Covered.

**S11 — no cancel/history/resume.** Adapter `announce{CapMap:{"cancel":not_supported,"history":not_supported,"resume":not_supported}}` — names are adapter-chosen (adapter). UI reads `capabilities.get` → renders each name with its state; `"cancel": not_supported` shown as "cancel: not offered by this service" (extension). `invoke(...,"cancel")` → `CapabilityAbsent`. Absence stated, never pretended. With open CapMap, the UI cannot infer anything about a name the adapter did not write; it can only present what was declared. Covered.

**S12 — remove an "optional" core domain module.** Removing an optional adapter tears down its namespace; other namespaces unaffected (host). Removing an optional resolver falls back to generic view (host). Covered.

## R.6 Delegation / deletion experiments

| mechanism | keep/remove | scenario that fails if removed |
|---|---|---|
| namespaces | keep | S06 — colliding ids from two services cross |
| resource-directory | keep | S05 — cannot list/lookup without session |
| ordered-replayable-stream | keep | S03 step 4, S09 step 2 — no catch-up, no dedup |
| capability-declaration (open map) | keep | S11 step 2 — absence inferred from null |
| typed-action | keep | S08 step 2 — no idempotent typed request without execute(any) |
| generic-fallback-view | keep | S07 step 2 — unknown renders blank |
| host-session-object | removed | none — S04 passes without it |
| host-turn/role-envelope-field | removed | none — D12 disqualifier |

## R.7 Second-service onboarding cost (revised)

To attach a service with a different protocol: (1) `namespaces.open`; (2) `announce/retire` with kind + open CapMap (adapter-chosen names, no host vocabulary to learn); (3) payload-type registration per kind; (4) seq-ordered event pump (or rely on host ingest-seq); (5) typed action handlers per registered action_type; (6) explicit `not_supported` entries in CapMap for absent features. Six items; the core event-ordering/dedup/namespace/cursor machinery is reused, not rewritten. To add a view only: one `{match:kind+schema, component}` resolver, no protocol code, no knowledge of other modules.

## R.8 Honest cost and non-goals

Weakest points: modelling transient text as an addressable resource is heavier than a pure broker for stateless round-trips; the generic fallback is shallow (every rich view is an extension); S09's double-execution guarantee is host+adapter joint (partial). Non-goals: no cross-namespace joins, no content search, no host-level turn/role model, no host-defined capability vocabulary (per FE-CE-002 fix). Largest second-order cost: every "thing" being a resource pushes adapters to give identity + capability declarations to ephemeral streams. The open CapMap removes the agent-session assumption but transfers naming responsibility to adapters — a D06 finding deferred.

## R.9 Open alternative — Candidate B

B (typed connection broker, no default event plane) is the cleanest possible answer to D12: the core has no vocabulary, no event plane, and no capability names at all. Absence is structurally true. B is retained as an open alternative for a future round to weigh if D06 determines that per-adapter event machinery is cheaper than centralized machinery for the expected service count (1–3 Ordessa-adjacent adapters). B's current disqualifier: S09 is open (no owner for dedup/reorder), violating the coverage requirement.
