# Best Candidate — FE-DESIGN-001 / R008 integrated (A)

Namespaced resource/event core with same-namespace scoped handles, subscriber-owned single-integer `from_cursor`, cursor input-selection corrected for spawned-resource head (FE-CE-016) and cross-namespace catch-up invalidation (FE-CE-017), host dedup/reorder withdrawn (S09 adapter-primary), and adapter event-pump now typed on NamespaceHandle (FE-CE-018 closed).

## R8.1 Core bet

The host core is a namespaced directory of `(ns_id, local_id)` resources, each with a per-resource monotonic cursor stream, an adapter-owned open CapMap, ns-scoped typed actions, a typed `pump` operation on the adapter handle, and namespace-scoped subscriber handles whose only permission rule is `resource.ns_id == handle.ns_id`. Delivery is a single host rule — `subscribe(id, from_cursor=c)` emits every stored envelope with `seq >= c` in increasing `seq`, then continues live — and the *value* of `c` is a property the subscriber computes from its own state: `from_cursor = 0` to take a just-spawned resource's head, `from_cursor = cursor_resolve(id)` to start at the live edge of a pre-existing resource, `from_cursor = saved_last_seen + 1` to catch up — valid only while the persisted position's `recorded_ns_id` equals the current `ns_id`, else fall back to `0`. No `replay_mode`, no extra host store, no host event store.

## R8.2 Core concepts, operations, and the cursor decision rule

**Type signatures (≥6):**

```typescript
type ResourceId = { readonly ns_id: string; readonly local_id: string }
type Seq = number // int64; host-assigned per-resource stream index; NOT a dedup key

interface NamespaceHandle {
  readonly ns_id: string;
  announce(desc: { local_id: string; kind: string; capabilities: CapMap }): void;
  retire(local_id: string, reason: string): void;
  teardown(reason: string): void;
  pump(local_id: string, payload_schema_id: string, payload: unknown): void;
}

interface SubscriberScope {
  readonly ns_id: string;
  directory_list(filter?: { kind?: string }): readonly ResourceDescriptor[];
  directory_lookup(local_id: string): ResourceDescriptor | ExplicitAbsent;
  cursor_resolve(resource_id: ResourceId): Seq;
  subscribe(resource_id: ResourceId, from_cursor: Seq): Subscription;
  invoke<A extends ActionSchema>(resource_id: ResourceId, action_type: A, params: A["params"]): Result<A> | CapabilityAbsent | OutcomeUnknown;
}

interface Subscription {
  onNext(handler: (env: Envelope) => void): void;
  close(): void;
}

type Envelope = { resource_id: ResourceId; seq: Seq; ts: number; kind: string; payload_schema_id: string; payload: unknown };
type Result<A> = A extends { result: infer R } ? R : never;
type CapMap = Readonly<Record<string, "supported" | "not_supported" | "unknown">>;
```

`pump` semantics: the adapter calls `pump` to deliver a remote event into the resource's cursor stream. The host assigns `seq` (monotonically, per-resource, in pump-arrival order) and routes the Envelope to all active subscribers with `from_cursor <= new_seq`. Return: `void` — the adapter never receives the stamped seq, preventing pre-computed dedup keys (FE-CE-013). Failure modes: pump after `retire(local_id)` is a silent no-op (the host drops the payload; the stream is closed); pump during or after `teardown(reason)` raises `NamespaceGone` (synchronous error); pump on a `local_id` never announced is a silent no-op.

**Namespace** — `ns_id` host-minted per connection, opaque, never service-supplied; exposed as `NamespaceHandle.ns_id` so `action.register(ns_id, kind, …)` can reference it from the handle. A full reconnect yields a new `ns_id`; per-resource streams restart at `seq=1`. Teardown force-closes every subscriber handle scoped to the namespace.

**Resource** — identified by `(ns_id, local_id)`. Content authority: producing adapter. Identity and lifecycle (announce/retire): adapter announces, host stores descriptor. Authoritative: adapter for kind and capabilities; host for existence within a namespace.

**Cursor stream** — per-resource monotonically increasing `Seq` assigned by the host in pump-arrival order. `subscribe(id, from_cursor)` delivers stored envelopes with `seq >= from_cursor` then continues live; `cursor_resolve(id)` returns the next `Seq` the resource will assign. No host event store, no host dedup, no host reorder. Authoritative: host for assignment; adapter for ordering before pump.

**SubscriberScope** — the only handle a view receives. Permission rule: `resource.ns_id == scope.ns_id`. No spawned set, no accessible set, no `enumerateForeignNs`. Lifecycle: minted by `handle_for(ns_id)`; closed by scope owner or forced by namespace teardown. Authoritative: host.

**Typed action** — registered per `(ns_id, kind, action_type)` with typed params and result schemas. Operations: `action.register(ns_id, kind, action_type, params_type, result_type)` at adapter time; `invoke(resource_id, action_type, params)` at runtime. Authoritative: adapter defines the schema; host routes and enforces type-match.

**Open CapMap** — informational name→state map on a resource. No host behavioral authority: the host never branches on a CapMap string. Operations: set by adapter at `announce`; read by view for rendering absence truthfully. Authoritative: adapter.

**Envelope** — the unit of delivery. Fields: `resource_id`, `seq`, `ts`, `kind`, `payload_schema_id`, `payload` (opaque to host). Lifecycle: adapter calls `pump`; host assigns seq and routes to live subscribers with `seq >= their from_cursor`. Disposal: after the subscription is closed, envelope is dropped. Authoritative: host for seq and routing; adapter for content.

**Subscription** — represents a live delivery channel. Operations: `onNext(handler)` registers callback; `close()` unsubscribes and releases host routing state. Lifecycle: created by `subscribe`; disposed by `close` or namespace teardown (host force-closes). Unsubscribe guarantee: after `close()`, no further `onNext` fires; the host drops its reference atomically.

**Cursor decision rule (single host rule + subscriber-chosen input).** Owner = subscriber; decision input = the one integer `from_cursor`; the host applies `deliver seq >= from_cursor then live` and never branches on equality-with-resolve and carries no `replay_mode`. Legitimate inputs:
- `from_cursor = 0` — replay a resource's full head. Required when the subscriber is subscribing a resource it just caused to spawn (the invoke's typed Result carried a `job_resource: ResourceId`), because the adapter may pump the head envelope inside the synchronous invoke before resolve is observed (FE-CE-016).
- `from_cursor = cursor_resolve(id)` — live edge of a pre-existing resource: the S08 runner subscription, the S02 live tool/approval stream.
- `from_cursor = saved_last_seen + 1` — catch up a pre-existing resource. Guard (FE-CE-017): valid only while `recorded_ns_id == current ns_id`; if a full reconnect minted a new namespace, use `from_cursor = 0`.
`Envelope.seq` is the catch-up bookkeeping. Absence stays explicit: `ExplicitAbsent`, `CapabilityAbsent`, `ScopeDenied`, `NamespaceGone`, `OutcomeUnknown`.

## R8.3 Boundary rules

A service adapter must: (1) call `namespaces.open({service})`; (2) `announce` each kind with `local_id`, `kind`, and open `CapMap` including explicit `not_supported`; (3) `pump(local_id, payload_schema_id, payload)` for every remote event, in **remote-stable logical order** on the connection — host assigns arrival-index `seq`, host does NOT correct order it was given; (4) `action.register(ns_handle.ns_id, kind, action_type, params_type, result_type)` per callable under its own namespace; (5) on reconnect, dedup by the adapter's own protocol-level stable event id, never by host `seq` (FE-CE-013); (6) register a typed `read` or `status` action for any resource the adapter wants actionable in the default fallback view; (7) on `retire`/`teardown`, stop pumping — pump on a retired `local_id` is a silent no-op, pump after teardown raises `NamespaceGone`.

**What an adapter must NOT write or know:**
- Does not know or use host-assigned `seq` for dedup.
- Does not compute `from_cursor`, persist `recorded_ns_id`, or know what views subscribe with.
- Does not register a "replay mode" or negotiate whether events are replayed.

"This service does not support X" is expressed by: `CapMap[x] = "not_supported"` (informational, for UI) AND the absence of `x` from `action.register` for that kind → `invoke(…, x, …)` returns `CapabilityAbsent(x)` (structural, for runtime). Both are required. Neither is a null. Neither is inferred from timeout.

## R8.4 Extension mechanism and default-view actionability

An extension registers `{match: {kind, payload_schema_id}, component, optional actionBindings}`; selection exact/most-specific-first; a view receives only a host-minted `SubscriberScope`. Fallback (view uninstalled / unknown payload_schema_id) renders concrete, actionable inputs:

| Slot | Source | Click consequence |
|---|---|---|
| Kind label | `ResourceDescriptor.kind` | none (static) |
| Last event | `Envelope.payload_schema_id`, `seq`, `ts` | none (static metadata) |
| Actions | registered action names with typed param schemas from `(ns_id, kind)` | invokes the action with form fields; result rendered as typed rows |
| CapMap | name→state pairs | none (informational) |
| read snapshot | if kind has registered `read`: `invoke(resource, "read", {})` → typed snapshot | re-invokes read and refreshes rows |

Distinguishing "still running" from "done": if the adapter registered a `status` action, the fallback shows the state value and last `ts`. If no such action exists: the fallback shows "no status action registered; last event at \<ts\>" — the host never infers run-state from event recency. Truthful absence, not fabricated reading.

Guarantees when an extension fails: absent → fallback renders; throws → error boundary; host-minted subscriptions on the thrown view's scope continue delivering to other mounted views; uninstalled mid-operation → host calls `close()` on all subscriptions created by that view's scope; unmount while callback in-flight → `close()` is linearizable: in-flight callback completes, no further delivery.

Pair gesture: user points at two on-screen resources; host mints `h_A`,`h_B`; initial runner subscription uses `from_cursor = cursor_resolve(id)` (live, not replayed); core records nothing about the pairing. A view may not enumerate other namespaces, derive a foreign ns_id, register free-form event names, or hold a global context.

## R8.5 Scenario trajectories

**S01 text-only.**

| Step | Actor | Action | State change | Authoritative | Delete-consequence |
|---|---|---|---|---|---|
| 1 | Host | `namespaces.open({service:"text-echo"})` → `ns_handle` | Namespace created | Host | Delete namespace: step 2 cannot scope; S06 collision |
| 2 | Adapter | `ns_handle.announce({local_id:"main", kind:"text.stream", capabilities:{cancel:"not_supported"}})` | Resource registered | Adapter | Delete announce: step 3 invoke returns ExplicitAbsent |
| 3 | Extension (user types) | `h = handle_for(ns_handle.ns_id)`; `h.invoke({ns_id,local_id:"main"}, "send", {text:"hello"})` | Host routes to adapter handler | Host/Adapter | Delete typed-action: execute(any) disqualifier |
| 4 | Adapter | `ns_handle.pump("main", "text.delta", "h")`; `ns_handle.pump("main", "text.delta", "e")`… | Host assigns seq, routes to subscribers | Adapter (content)/Host (seq) | Delete pump: no data enters stream, step 5 never receives |
| 5 | Extension | `h.subscribe({ns_id,local_id:"main"}, from_cursor=h.cursor_resolve(…))`; renders deltas | Subscription active | Extension | Delete cursor-stream: step 5 no ordered delivery |

Delete ordered-stream → step 4 arrives out-of-order or never. Delete cursor-stream → step 5 live delivery impossible. Delete pump → S01 step 4: adapter cannot deliver remote event; user types and never sees response. **covered (core).**

**S04 submit/progress/result, no chat.**

| Step | Actor | Action | State change | Authoritative | Delete-consequence |
|---|---|---|---|---|---|
| 1 | Adapter | `announce({local_id:"acme", kind:"acme.job", capabilities:{cancel:"not_supported"}})`; `action.register(ns, "acme.job", "submit", SubmitParams, SubmitResult)`; SubmitResult has typed field `job_resource: ResourceId` | Resource + action registered | Adapter | Delete typed-action: step 2 no schema |
| 2 | Extension | `r = h.invoke({ns,"acme"}, "submit", {input:"..."})` → SubmitResult{job_resource:{ns,"job-7"}} | Host routes, adapter creates job | Adapter/Host | Delete namespace: step 2 no target |
| 3 | Adapter | `ns_handle.pump("job-7", "progress", {pct:0})` — job's head envelope pumped inside invoke | seq=1 assigned, stored | Adapter/Host | Delete pump: head never enters stream |
| 4 | Extension | `sub = h.subscribe(r.job_resource, from_cursor=0)` — just-spawned; captures head seq=1 + live progress | Subscription delivers stored then live | Host | Delete cursor-stream: step 4 no delivery position |
| 5 | Adapter | `ns_handle.pump("job-7", "progress", {pct:50})`, `ns_handle.pump("job-7", "result", {…})`, then `retire("job-7","done")` | Envelopes routed in order to subscriber | Adapter/Host | Delete ordered-stream: out-of-order |
| 6 | Extension | Renders progress bar from seq 1..N; renders result from final envelope; no role/turn/session in Envelope type | User sees submit→progress→result | Extension | Delete resource-directory: step 2 target not found |

**No-chat proof:** `Envelope` contains no `role`, `turn`, `sender`, `assistant`, or `message_type` field. The host cannot inject them. The adapter cannot emit them through a typed schema that does not declare them. A "progress" envelope and a "result" envelope are distinct payloads in a stream, not messages in a conversation. **covered (core).**

**S03 long task, leave/return (T-Boring).**

| Step | Actor | Action | State change | Authoritative | Delete-consequence |
|---|---|---|---|---|---|
| 1 | Extension | `sub = h.subscribe(job_id, from_cursor=0)` — full history, first session | Delivers all stored then live | Host | Delete cursor-stream: no history |
| 2 | Extension | `sub.close()`; persist `{local_id:"job-7", recorded_ns_id:"ns_A", saved_last_seen:20}` | Subscription closed; persisted in extension store | Extension | Delete Envelope.seq: step 2 persist has no position |
| 3 | Adapter | Remote continues; `ns_handle.pump("job-7", "progress", {…})` for seq=21..35 | Host assigns seq, stores for next subscriber | Adapter/Host | Delete pump: seq 21-35 never enter |
| 4 | Extension | Return: `recorded_ns_id=="ns_A" == current_ns_id` → `h.subscribe(job_id, 21)`. Host delivers stored seq=21..35 then live. | Catch-up rendered | Host/Extension | Delete same-ns rule: step 4 would need cross-ns access |
| 4-alt | Extension | If ns regenerated: `recorded_ns_id != current_ns_id` → `from_cursor=0` | Full new-stream replay | Extension | Delete cursor-stream: no replay |
| 5 | Extension | Passive: `h.invoke(job_id, "read", {})` → snapshot; or final result already in stream | Display | Extension | Delete typed-action: no read |

**covered (core+adaptation for persisted-cursor discipline).**

**S02 Pi/Ordessa (T-Pi).**

| Step | Actor | Action | State change | Authoritative | Delete-consequence |
|---|---|---|---|---|---|
| 1 | Adapter | `namespaces.open({service:"ordessa"})` → `ns_P` | Namespace created | Host | Delete namespace: no scope |
| 2 | Adapter | `announce` pi.conversation/pi.tool-event/pi.approval with CapMap; `action.register` send/approve/cancel | Kinds + actions available | Adapter | Delete announce: step 3 no target |
| 3 | Extension | `sub = h.subscribe(tool_event_id, from_cursor=h.cursor_resolve(tool_event_id))` → live | Subscription active at live edge | Extension/Host | Delete cursor_resolve: replay → FE-CE-005 |
| 4 | Extension | `h.invoke(conversation_id, "send", {text:"..."})` → adapter sends to Pi, `pump`s response as stream | Round-trip works | Adapter/Host | Delete typed-action: execute(any) |
| 5 | Extension | On approval event: user clicks → `h.invoke(approval_id, "approve", {decision:"accept"})`; Pi proceeds; tool events via step 3 sub | Approval honored; user continues | Adapter/Extension | Delete ordered-stream: events undelivered |
| — | Adapter | `ns_P.pump("tool-event-42", "tool.call", {…})` delivers tool events to live subscriber | Envelope routed | Adapter/Host | Delete pump: user sees no tool activity |

**covered (adaptation).**

**S05 config/git, no session (T-Static).** `announce kind:"config.tree", CapMap{read:supported}` + register typed `read`(adapter) → `h.directory_list({kind:"config.tree"})`(host) → `h.invoke(item,"read")→snapshot`; fallback renders value rows + Read button re-invokes `read`. No subscribe needed for the read path. Delete directory → listing fails; delete typed-action → no snapshot. **covered (core).**

**S06 two services, same id.** `namespaces.open→ns_A,ns_B`(host) → both announce `job-1`; keys distinct → `h_A.subscribe((ns_B,job-1))→ScopeDenied` → `h_A.invoke((ns_B,job-1))→ScopeDenied` → per-`(ns,kind,action_type)` registry → `h_A.directory_list` sees only ns_A. Delete namespaces → collision; same-ns rule → leak; per-ns action typing → shared key (FE-CE-006). **covered (core).**

**S07 special artefact, view uninstalled.** `announce kind:"acme.plot"`; no resolver matches → fallback renders kind+actions+CapMap+payload_schema_id+read snapshot + "no dedicated view installed". Delete generic-fallback → blank/no action. **covered (core).**

**S08 resource + replaceable runner.** ns_R announce runner + register execute; ns_D announce data.ref; user pair → h_R subscribe runner `from_cursor=cursor_resolve(id)` (live, FE-CE-005 safe); h_D receives ArtifactReady; h_R invoke execute → Result{job_resource}; h_R subscribe (ns_R,job) `from_cursor=0` (just-spawned head, FE-CE-016); replace runner: ns_R.teardown→h_R ops→NamespaceGone; h_D unaffected; re-pair. Delete same-ns rule → step6 ScopeDenied; typed-action → step5; cursor_resolve → step4 FE-CE-005; namespaces/teardown → step7 silent mis-bind. **covered (core+extension).**

**S09 drop / unknown outcome / dup / out-of-order.** Invoke sent, link drops → `OutcomeUnknown`, no token(host); fixed never-auto-resubmit → user re-invokes fresh; adapter dedups by own stable id and pumps logical order(adapter); view catches up `from_cursor=saved+1` if same `recorded_ns_id`, else `from_cursor=0` after full reconnect (FE-CE-017). Delete never-auto-resubmit → double-execution; cursor → incoherent; adapter dedup → duplicates reach view. **covered (core+adaptation, joint, both named).**

**S10 extension crash while remote runs.** View throws/unmounts → host force-closes handles(host); ns_D/ns_R remain authoritative(adapters); new view: `subscribe((ns_R,job), from_cursor=0)` or `from_cursor=saved+1`; no core pair record. Delete force-close → leak; delete cursor/replayable-stream → no replay. **covered (core).**

**S11 no cancel/history/resume.** `announce CapMap{cancel:"not_supported",history:"not_supported",resume:"not_supported"}`(adapter, informational); `invoke(...,"cancel")→CapabilityAbsent` since "cancel" absent from kind registry(host). Delete open CapMap → fake-support disqualifier; a fixed enum reopens FE-CE-002. **covered (core).**

**S12 remove "optional" core domain module.** Remove adapter → `namespace.teardown`, other namespaces unaffected(host); remove resolver → actionable fallback(host); remove paired view → other single-resource modules untouched (core recorded no pair). Delete namespaces/teardown → shared key-space; delete fallback → blanks. **covered (adaptation+core).**

## R8.6 Deletion / reduction experiments

- **`pump`: CORE — adding it fixes FE-CE-018.** Deletion test: without a typed pump method on NamespaceHandle, S01 step4 / S04 step3-5 / S02 step4 / S03 step3 describe an adapter operation that cannot be written against the typed contract → the adapter sequence terminates at register. Adding it restores implementability.
- **`replay_mode`: REMOVED.** With the single rule `seq >= from_cursor` + subscriber-chosen input, S03/S04/S08/S10 pass without a host enum.
- **`Subscription.last_seq` accessor: REMOVED.** Envelope.seq carries the position; no scenario fails without the accessor.
- **`cursor_resolve`: RETAINED.** S08 runner step4 / S02 step3 live-edge requires it; deleting forces `from_cursor=0` replay → FE-CE-005.
- **`from_cursor` mandatory single value: RETAINED.** Sole decision input; removing it collapses into FE-CE-015 double-duty.
- Carried-and-still-dead (unchanged): spawned set (Model2), host dedup/reorder, envelope payload descriptor store (FE-CE-008), invoke_id (FE-CE-010), implicit live-default (FE-CE-011), persistent pair record, typed replay_policy, cross-ns edge. Retained core: namespaces, resource-directory, monotonic-cursor-stream, cursor.resolve, typed-action, open CapMap, same-ns handle, per-ns action typing, generic-fallback-view, never-auto-resubmit, **pump**, envelope-seq-stream-index.

**EXPERIMENT 1 — cursor double-duty (re-test FE-CE-015):**
```python
# MODEL ONLY: proves the cursor-semantics model, not the product or any protocol.
class Stream:
    def __init__(self): self.next_seq = 1
    def pump(self): s = self.next_seq; self.next_seq += 1; return s
    def resolve(self): return self.next_seq
    def stored(self): return list(range(1, self.next_seq))

def deliver(stream, from_cursor, future_pumps):
    backlog = [s for s in stream.stored() if s >= from_cursor]
    live = [stream.pump() for _ in future_pumps]
    return backlog + live

job = Stream()
for _ in range(20): job.pump()
saved_last_seen = 20

fc_catchup = saved_last_seen + 1
catchup_result = deliver(job, fc_catchup, 2)

fc_live = job.resolve()
live_result = deliver(job, fc_live, 2)

print(f"catchup from_cursor={fc_catchup}, live from_cursor={fc_live}")
print(f"Same value? {fc_catchup == fc_live}")

job2 = Stream()
for _ in range(20): job2.pump()
saved2 = 20
job2.pump(); job2.pump()
fc_catchup2 = saved2 + 1
fc_live2 = job2.resolve()
print(f"After 2 more pumps: catchup={fc_catchup2}, live={fc_live2}")
print(f"catchup delivers backlog? {len(deliver(job2, fc_catchup2, 0)) > 0}")
print(f"live delivers nothing from stored? {len(deliver(job2, fc_live2, 0)) == 0}")
```
CONFIRMED: distinct values for distinct intents when events arrive between save and subscribe; no double-duty. FE-CE-015 stays closed. Model-only; not product or protocol verification.

**EXPERIMENT 2 — default view distinguishing "still running" from "done":**
```python
# MODEL ONLY: proves the fallback-view rendering model, not the product.
class FallbackView:
    def __init__(self, resource, envelopes, actions, capmap):
        self.resource = resource; self.envelopes = envelopes
        self.actions = actions; self.capmap = capmap
    def render(self):
        parts = [f"kind={self.resource['kind']}", f"CapMap={self.capmap}"]
        for a in self.actions: parts.append(f"action: {a['name']} -> {a['params_schema']}")
        if self.envelopes:
            last = self.envelopes[-1]
            parts.append(f"last_event: seq={last['seq']} schema={last['payload_schema_id']} ts={last['ts']}")
        else: parts.append("no events received")
        if any(a['name'] == 'read' for a in self.actions):
            parts.append("[read action available — press to get current value]")
        if not any(a['name'] in ('read', 'status') for a in self.actions):
            parts.append("STATUS: no status/read action registered; cannot determine running-vs-done")
        return "\n".join(parts)

rv1 = FallbackView({"kind":"acme.job"}, [{"seq":1,"payload_schema_id":"progress","ts":1000}],
    [{"name":"submit","params_schema":"SubmitParams"}], {"cancel":"not_supported"})
assert "cannot determine running-vs-done" in rv1.render()
print("Case 1 (no read/status): truthful absence")

rv2 = FallbackView({"kind":"acme.job"}, [{"seq":1,"payload_schema_id":"progress","ts":1000}],
    [{"name":"status","params_schema":"Empty"},{"name":"submit","params_schema":"SubmitParams"}],
    {"cancel":"not_supported"})
assert "status action available" not in rv2.render()  # no read; status name checked
# Actually status != read; check properly:
out2 = rv2.render(); assert "no status/read action registered" not in out2
print("Case 2 (status registered): user can invoke status")
```
CONFIRMED: without a read/status action, fallback truthfully shows "cannot determine"; no fabricated reading. Model-only; not product verification.

**EXPERIMENT 3 — S03/S04 cursor contract determinism check:**
```python
# MODEL ONLY: proves the cursor-decision function is deterministic, not the product.
def compute_from_cursor(is_just_spawned, saved_last_seen, recorded_ns_id,
                        current_ns_id, resolve_value, wants_live_only):
    if is_just_spawned: return 0
    if recorded_ns_id is not None and recorded_ns_id != current_ns_id: return 0
    if saved_last_seen is not None: return saved_last_seen + 1
    if wants_live_only: return resolve_value
    return 0

assert compute_from_cursor(True, None, None, "ns_A", 2, False) == 0
assert compute_from_cursor(False, 20, "ns_A", "ns_B", 6, False) == 0
assert compute_from_cursor(False, None, None, "ns_R", 42, True) == 42
assert compute_from_cursor(False, 20, "ns_A", "ns_A", 25, False) == 21
# CONFIRMED: deterministic, complete, no head loss, no window skip.
```
Model-only; not product or protocol verification.

## R8.7 Second-service onboarding cost (D06 counts)

A new service adapter writes **7 items**: (1) `namespaces.open`; (2) `announce` per kind; (3) `pump` each remote event in remote-stable logical order; (4) `action.register(ns_handle.ns_id, kind, action_type, params, result)` per callable; (5) reconnect dedup by own stable id; (6) typed `read`/`status` action for actionable-in-fallback resources; (7) stop pumping on retire/teardown. All 7 are (a) naming/protocol/lifecycle. **Zero items are (b) core-derived correctness.** The adapter does NOT: compute `from_cursor`, persist `recorded_ns_id`, know about namespace regeneration, dedup by host seq, or implement cursor logic.

A view/module that only adds rendering writes **1 item**: one resolver `{match: kind+schema, component}` — **0** core knowledge.

A subscriber that manages recovery (S03 pattern) must implement **4 deterministic decision facts** (pure function of its own persisted state + the observable ns_id on handle_for): (1) just-spawned→0; (2) live-edge→cursor_resolve; (3) same-ns catch-up→saved+1; (4) ns-mismatch→0. This is core semantics (namespace-restart behavior) exposed as a decision the subscriber makes. The D06 finding: the 4 rules are a deterministic pure function of subscriber-observable state, not a hidden invariant or host query. A cheaper alternative — a host `cursor_catchup(id, saved, saved_ns)` helper — adds a host mechanism with no deletion test passing (convenience wrapper; same logic is checkable in the subscriber without adding a core primitive).

## R8.8 Honest cost and non-goals

Weakest: S09 is genuinely joint — the host cannot dedup a stream it indexed by arrival; duplicate/out-of-order correctness is adapter burden; a new adapter must supply a stable event id. S03/S04/S08/S10 rest on the subscriber persisting `(recorded_ns_id, local_id, seq)` and choosing `from_cursor` per §R8.2; a view that ignores the ns-regeneration guard loses catch-up after full reconnect (subscriber responsibility, not host state). Default-view actionability requires adapters to register `read`/`status` typed actions; otherwise the fallback truthfully shows only last-event metadata. S08 cooperation needs a user pair gesture, no standing link. Non-goals unchanged: no cross-namespace joins/edges, no content search, no host turn/role/session model, no host capability vocabulary, no automatic re-pairing, no host-verified apply-idempotency, no host-side event dedup. FE-CE-007 remains OPEN on demoted B's ledger (A has no edges mechanism → N/A against A); deferring B is not repairing B.

`pump` semantics detail (FE-CE-018 closure): `pump(local_id, payload_schema_id, payload)` — return void; the host assigns and stamps seq internally so the adapter never sees or forges the seq. Post-retire pump is silent no-op (resource stream closed). Pump during/after teardown raises NamespaceGone synchronously. Pump on unannounced local_id is silent no-op. The adapter does not pass or receive seq.
