# Best Candidate — FE-DESIGN-001 / R007 integrated (A)
Namespaced resource/event core with same-namespace scoped handles; subscriber-owned single-integer `from_cursor`; cursor *input selection* corrected for spawned-resource head (FE-CE-016) and cross-namespace catch-up invalidation (FE-CE-017); `replay_mode` rejected by deletion; host dedup/reorder withdrawn (S09 adapter-primary).

## R7.1 Core bet
The host core is a namespaced directory of `(ns_id, local_id)` resources, each with a per-resource monotonic cursor stream, an adapter-owned open CapMap, ns-scoped typed actions, and namespace-scoped handles whose only permission rule is `resource.ns_id == handle.ns_id`. Delivery is a single host rule — `subscribe(id, from_cursor=c)` emits every stored envelope with `seq >= c` in increasing `seq`, then continues live — and the *value* of `c` is a property the subscriber computes from its own state. This round closes the residual R007 defects by making that value depend on the resource's origin and the cursor's namespace domain: `from_cursor = 0` to take a just-spawned resource's head (and full history), `from_cursor = cursor.resolve(id)` to start at the live edge of a pre-existing resource, `from_cursor = saved_last_seen + 1` to catch up — **valid only while the persisted position's `recorded_ns_id` equals the current `ns_id`**, else fall back to `0`. No `replay_mode` and no extra host store exist to make these choices; they are three values of the one mandatory input.

## R7.2 Core concepts, operations, and the cursor decision rule
```
ns_id: string (host-minted, opaque)   local_id: string
resource_id = { ns_id, local_id }       seq: int64
CapMap = { [name] : supported | not_supported | unknown }
ActionSchema = named typed record

namespaces.open({service:string}) -> NamespaceHandle
NamespaceHandle.announce({local_id, kind:string, capabilities:CapMap}) -> void
NamespaceHandle.retire(local_id, reason:string) -> void
NamespaceHandle.teardown(reason:string) -> void        # force-closes its handles
handle_for(ns_id) -> SubscriberScope
action.register(ns_id, kind, action_type, params_type:ActionSchema, result_type:ActionSchema) -> void
SubscriberScope.directory_list({kind?}) -> [ResourceDescriptor]
SubscriberScope.directory_lookup(local_id) -> ResourceDescriptor | ExplicitAbsent
SubscriberScope.cursor.resolve(resource_id) -> seq      # NEXT seq the resource will assign
SubscriberScope.subscribe(resource_id, from_cursor:seq) -> Subscription
SubscriberScope.invoke(resource_id, action_type, params)
        -> Result | CapabilityAbsent(action_type) | OutcomeUnknown
Subscription.close() -> void ; onNext(Envelope)
Envelope = { resource_id, seq, ts, kind, payload_schema_id, payload:opaque }
Result = typed record; may carry informational spawned_resource_id
```
**Namespace** — `ns_id` host-minted per connection, never service-supplied; a *full* reconnect yields a new `ns_id` and its per-resource streams restart at `seq=1`. Teardown force-closes every handle scoped to the namespace. **Resource** — content authority = producing adapter; identity/lifecycle = host. **Cursor stream** — `seq` is a host-assigned monotonic stream index meaning pump-arrival order; NOT a dedup key, NOT a reorder mechanism (FE-CE-012/014). `cursor.resolve(id) -> next_seq`. **SubscriberScope** — permission `resource.ns_id == handle.ns_id`; no spawned/accessible set (FE-CE-009 stays removed); exposes no `enumerateForeignNs`.

**Cursor decision rule (single host rule + subscriber-chosen input).** Owner = subscriber; decision input = the one integer `from_cursor`; the host applies `deliver seq >= from_cursor then live` and never branches on equality-with-resolve and carries no `replay_mode`. Legitimate inputs:
- `from_cursor = 0` — replay a resource's full head. Required when the subscriber is subscribing a resource it just *caused to spawn* (its `spawned_resource_id`), because the adapter may pump the head envelope (`seq=1`) inside the synchronous `invoke` before `resolve` is observed; taking `resolve` there would silently drop the head (FE-CE-016). Also used for full-history views.
- `from_cursor = cursor.resolve(id)` — live edge of a *pre-existing* resource (empty backlog, future only): the S08 runner subscription, the S02 live tool/approval stream.
- `from_cursor = saved_last_seen + 1` — catch up a *pre-existing* resource the subscriber previously read. `saved_last_seen` is the highest `Envelope.seq` processed, persisted together with the `(recorded_ns_id, local_id)` it was captured under. **Guard (FE-CE-017):** the value `saved_last_seen+1` is a valid threshold only while `recorded_ns_id == current ns_id`; if a full reconnect minted a new namespace, the new stream restarts at `seq=1` and the persisted integer is from a different numbering domain — so the subscriber must use `from_cursor = 0`. Without the guard, `saved+1` skips the entire post-reconnect window the user returned to see.
`Envelope.seq` is the catch-up bookkeeping; no `Subscription.last_seq` accessor is added (§R7.6). Absence stays explicit: `ExplicitAbsent`, `CapabilityAbsent`, `ScopeDenied`, `NamespaceGone`, `OutcomeUnknown`.

## R7.3 Boundary rules
A service adapter must: (1) `namespaces.open`; (2) `announce/retire` kind + open CapMap; (3) pump events in remote-stable logical order (host does not correct order it was given); (4) `action.register(...)` per callable under its own namespace; (5) explicit `not_supported` CapMap entries for absent features; (6) on reconnect dedup by its **own protocol-level stable event id**, never host `seq` (FE-CE-013); (7) register a typed `read`/`status` action for any resource it wants actionable in the default view (§R7.4). "No cancel" = `CapMap{"cancel":not_supported}` AND omission of `cancel` from the kind's registry → `invoke(...,"cancel")→CapabilityAbsent`. The adapter sees only its own namespace and holds no cross-ns resolver.

## R7.4 Extension mechanism and default-view actionability
An extension registers `{match: kind + payload_schema_id, component, optional typed action bindings}`; selection exact/most-specific-first; a view receives only a host-minted `SubscriberScope`. Fallback (view uninstalled / unknown `payload_schema_id`) renders concrete, actionable inputs: (a) last envelope's `payload_schema_id` + `seq` + `ts`; (b) registered action names with typed param schemas as pressable controls; (c) CapMap name→state pairs; (d) for any kind registering a typed `read` action, the returned typed snapshot as raw field rows. Config browse (S05/T-Static) → `read` snapshot value rows plus a **Read** control that re-invokes `read`; Git change → `git.diff` registering `read→[{path,additions,deletions}]` renders those rows; long task "still running?" → shown only from an adapter `status`/`read` value or last-event `ts`; the host never infers run-state. Truthful absence: no such action registered → "no status action; last event at <ts>", never a fabricated reading. Guarantees: resolver absent → fallback; throws → error boundary keeps still-mounted handles delivering; unmounted mid-op → host force-closes that view's handles; re-subscription uses subscriber-chosen `from_cursor` with the §R7.2 rules. **Pair gesture:** user points at two on-screen resources; host mints `h_A`,`h_B`; initial runner subscription uses `from_cursor = cursor.resolve(id)` (live, not replayed); core records nothing about the pairing. A view may not enumerate other namespaces, derive a foreign ns_id, register free-form event names, or hold a global context.

## R7.5 Scenario trajectories (owner + per-core-step deletion consequence)
**S01 text-only.** 1 `namespaces.open`(host) → 2 `announce kind:"text.stream", CapMap{cancel:not_supported}`(adapter) → 3 `h.invoke((ns,"main"),"send",{text})`(ext→host) → 4 adapter pumps TextDeltas, host delivers in stream order(adapter/host) → 5 resolver renders(ext). Delete typed-action → 3 `execute(any)` disqualifier; delete ordered stream → 4 never arrives. **covered (core).**
**S02 Pi/Ordessa (T-Pi).** 1 `namespaces.open`(host) → 2 `announce pi.conversation/pi.tool-event/pi.approval`(adapter) → 3 `h.subscribe(tool-event, from_cursor=cursor.resolve())` live, host routing → 4 `h.invoke(approval,"approve",…)`, `h.invoke(conversation,"send",…)` → 5 resolver renders. Delete announce → 2; ordered stream → 3; typed-action → 4. **covered (adaptation).**
**S03 long task, leave/return (T-Boring).** 1 `subscribe(id, from_cursor=0)` history(ext→host) → 2 navigate away `Subscription.close()`; persist `saved_last_seen = max processed Envelope.seq` **with `recorded_ns_id`**(ext) → 3 remote keeps emitting, adapter pumps(adapter) → 4 return: if `recorded_ns_id == current ns_id` use `from_cursor = saved_last_seen+1` (host replays missed window then live); if a full reconnect regenerated the namespace, use `from_cursor=0` (host replays the new stream from its head) → 5 passive `invoke("read")→snapshot`. Delete cursor-stream → 4; directory → 4 lookup; typed-action → 5. **covered (core + adaptation for persisted-cursor discipline).**
**S04 submit/progress/result, no chat.** 1 `announce kind:"acme.job"` + register `submit`(result carries informational `spawned_resource_id`) + `result`(adapter) → 2 `h=handle_for(ns)`; `invoke submit → Result (ns,job-progress)`; **subscribe `(ns,job-progress)` `from_cursor=0`** — a just-spawned resource whose head is its own progress, so replaying includes seq=1 (FE-CE-016) — permitted by same-ns rule(ext+host) → 3 no session/turn/role in any envelope. Delete resource lifecycle → 1; typed-action → 1/2; ordered stream → 2 progress undelivered. **covered (core).**
**S05 config/git, no session (T-Static).** 1 `announce kind:"config.tree", CapMap{read:supported}` + register typed `read`(adapter) → 2 `h.directory_list({kind:"config.tree"})`(host) → 3 `h.invoke(item,"read")→snapshot`, fallback renders current value + Read control(§R7.4). No subscribe for the read. Delete directory → 2; typed-action → 3. **covered (core).**
**S06 two services, same id.** 1 `namespaces.open→ns_A,ns_B`(host) → 2 both announce `job-1`; keys distinct → 3 `h_A.subscribe((ns_B,job-1))→ScopeDenied` → 4 `h_A.invoke((ns_B,job-1))→ScopeDenied` → 5 per-`(ns,kind,action_type)` registry → 6 `h_A.directory_list` sees only ns_A. Delete namespaces → 2 collides; same-ns rule → 3-4 leak; per-ns action typing → 5 shared key (FE-CE-006). **covered (core).**
**S07 special artefact, view uninstalled.** `announce kind:"acme.plot"`; no resolver matches → fallback renders kind+actions+CapMap+`payload_schema_id`+`read` snapshot + "no dedicated view installed". Delete generic-fallback → blank/no action. **covered (core).**
**S08 resource + replaceable runner.** 1 ns_R `announce kind:"runner"` + register `execute`(result informational `(ns_R,job)`)(adapter) → 2 ns_D `announce kind:"data.ref"`(adapter) → 3 `h_D=handle_for(ns_D)`(host) → 4 user pair → `h_R=handle_for(ns_R)`, **initial runner subscription `from_cursor=cursor.resolve((ns_R,runner))` → live, NOT replayed**(host) → 5 `h_D` receives new live ArtifactReady; view `h_R.invoke((ns_R,runner),"execute",{ref})→Result{…,(ns_R,job)}`(ext→adapter) → 6 view `h_R.subscribe((ns_R,job), from_cursor=0)` — job is the just-spawned resource, its head is captured (FE-CE-016), permitted by same-ns rule(host) → 7 replace runner: `ns_R.teardown`→`h_R` ops→`NamespaceGone`; `h_D` unaffected; re-pair. Delete same-ns rule → 6 ScopeDenied (FE-CE-004); typed-action → 5; namespaces/teardown → 7 silent mis-bind. **covered (core+extension).** Note step4's runner subscription (`resolve`, live) and step6's job subscription (`0`, head) are different resources with different inputs — no auto-execute hazard (FE-CE-005), no head loss (FE-CE-016).
**S09 drop / unknown outcome / dup / out-of-order.** 1 invoke sent, link drops pre-ack → `OutcomeUnknown`, no token(host) → 2 fixed **never-auto-resubmit** → user re-invokes fresh; adapter, if original already applied, returns same Result using its **own** stable id(adapter) → 3 reconnect: adapter dedups by own stable id, pumps remote-stable logical order(adapter); host assigns stream index, never dedups/reorders(host) → 4 view catches up: `from_cursor=saved_last_seen+1` if the namespace persisted (same `recorded_ns_id`), else `from_cursor=0` after a full reconnect (FE-CE-017). Delete never-auto-resubmit → 2 double-executes; ordered stream/cursor → 4 incoherent; adapter dedup → duplicates reach view. **covered (core+adaptation, joint, both named).**
**S10 extension crash while remote runs.** 1 coordinating view throws/unmounts → host force-closes its handles(host) → 2 ns_D/ns_R remain authoritative(adapters) → 3 new view: `handle_for(ns_R)`; `subscribe((ns_R,job), from_cursor=0)` to take the just-repaired resource's head, or on a surviving same-ns resource `subscribe(from_cursor=saved_last_seen+1)`→catches up / `cursor.resolve()`→live(ext+host) → 4 no core pair record. Delete force-close → leak to dead view → fails at 1; delete cursor/replayable stream → 3. **covered (core).**
**S11 no cancel/history/resume.** `announce CapMap{cancel:not_supported,history:not_supported,resume:not_supported}`(adapter, informational); `invoke(...,"cancel")→CapabilityAbsent` since "cancel" absent from kind registry(host). Delete open CapMap → absence inferred from null/timeout → fake-support disqualifier; a fixed enum reopens FE-CE-002. **covered (core).**
**S12 remove "optional" core domain module.** 1 remove adapter → `namespace.teardown`, other namespaces unaffected(host) → 2 remove resolver → actionable fallback(host) → 3 remove paired view → other single-resource modules untouched (core recorded no pair). Delete namespaces/teardown → 1 shared key-space touched; delete fallback → 2 blanks. **covered (adaptation+core).**

## R7.6 Deletion / reduction experiments
- **`replay_mode`: REMOVED — not added.** Deletion test: with the single rule `seq >= from_cursor` + subscriber-chosen input (`0` / `resolve` / `saved+1`), S03, S04, S08, S10 all pass without a host enum. `replay_mode` has no failing scenario if deleted → non-load-bearing → not introduced (FE-CE-009 standard).
- **`Subscription.last_seq` accessor: REMOVED.** `Envelope.seq` carries the position to persist; an accessor adds no rule that S03/S10 fail without → deleted.
- **`cursor.resolve`: RETAINED.** Pre-existing-resource liveness (S08 runner step4, S02 step3) cannot express "start at live edge" without it; deleting it forces `from_cursor=0` replay into the runner subscription → contradicts S08 and reopens FE-CE-005.
- **`from_cursor` mandatory single value: RETAINED.** Sole decision input; removing it collapses back into the R006 double-duty (FE-CE-015). The two R007 fixes are refinements to the *value* the subscriber picks, not new primitives.
- Carried-and-still-dead (unchanged): spawned set (Model2), host dedup/reorder, envelope payload descriptor store (FE-CE-008), invoke_id (FE-CE-010), implicit live-default (FE-CE-011), persistent pair record, typed replay_policy, cross-ns edge. Retained core (failing scenario named in R7.5): namespaces, resource-directory, monotonic-cursor-stream, cursor.resolve, typed-action, open CapMap, same-ns handle, per-ns action typing, generic-fallback-view, never-auto-resubmit.

`EXPERIMENT` — model run of the disputed cursor rule (MODEL ONLY: proves the cursor-semantics model, not the product or any protocol):
```python
class Stream:
    def __init__(self): self.next_seq = 1
    def pump(self): s=self.next_seq; self.next_seq+=1; return s
    def resolve(self): return self.next_seq
    def stored(self): return range(1, self.next_seq)
def deliver(stream, from_cursor, future):
    return [s for s in stream.stored() if s >= from_cursor] + list(future)

# FE-CE-016 fixed: just-spawned job pumped seq=1 inside invoke before subscribe
job = Stream(); job.pump()                 # seq=1 "starting" (adapter-internal)
print("CE-016 head-loss if from_cursor=resolve?", 1 not in deliver(job, job.resolve(), []))  # True (old)
print("CE-016 fixed if from_cursor=0?",        1 in deliver(job, 0, []))                      # True (new)

# FE-CE-017 fixed: persisted position bound to recorded ns_id; full reconnect -> new ns
ns_A = Stream(); [ns_A.pump() for _ in range(20)]; saved, rec_ns = 20, "ns_A"
ns_B = Stream(); [ns_B.pump() for _ in range(5)]     # new domain seq 1..5
cur_ns = "ns_B"
fc = (saved+1) if rec_ns == cur_ns else 0            # guard
print("CE-017 fixed catches post-reconnect 1..5?", deliver(ns_B, fc, []) == [1,2,3,4,5])       # True
print("CE-017 old drops them?", deliver(ns_B, saved+1, []) == [])                               # True

# Double-duty (FE-CE-015) still gone: no single integer is both full-catch-up AND live-only
one = [c for c in range(0,60)
       if deliver(ns_A,c,[21,22])==list(range(21,23))+[] and deliver(ns_A,c,[21,22])!=[] ]
print("one decl yields replay AND live-only?", deliver(ns_A,ns_A.resolve(),[21,22]) == deliver(ns_A,21,[21,22]) == list(range(21,23)) and ns_A.resolve()!=21) # False
```
Model-only; not product or protocol verification.

## R7.7 Second-service onboarding cost
A new service adapter writes **7 items**: (1) `namespaces.open`; (2) `announce/retire` per kind; (3) pump in remote-stable logical order; (4) `action.register(kind, action_type, params, result)` per callable under its own ns; (5) explicit `not_supported` CapMap entries; (6) reconnect dedup by its **own** stable event id (never host seq); (7) typed `read`/`status` action for any resource actionable in the fallback. **Core facts the subscriber/view must know (6):** (i) `ns_id` is host-minted/opaque; (ii) `seq` is host-assigned and must NOT be used for dedup; (iii) the handle is ns-scoped; (iv) CapMap carries zero host behavioural authority; (v) the never-auto-resubmit invariant; (vi) **`seq` is per-resource and restarts on namespace regeneration — a persisted catch-up position is valid only within the `ns_id` that produced it, else re-subscribe `from_cursor=0`.** A view that spawns/subscribes a just-created resource must choose `from_cursor=0` to keep its head (FE-CE-016). A view-only module writes **1 item**: one resolver `{match: kind+schema, component}` — 0 core knowledge.

## R7.8 Honest cost and non-goals
Weakest: S09 is genuinely joint — the host cannot dedup a stream it indexed by arrival; duplicate/out-of-order correctness is adapter burden and a new adapter must supply a stable event id. S03/S04/S08/S10 now rest on the subscriber persisting `(recorded_ns_id, local_id, seq)` and choosing `from_cursor` per §R7.2; a view that ignores the ns-regeneration guard loses catch-up after a full reconnect (subscriber responsibility, not host state). Default-view actionability requires adapters to register `read`/`status` typed actions; otherwise the fallback truthfully shows only last-event metadata. S08 cooperation needs a user pair gesture, no standing link. Non-goals unchanged: no cross-namespace joins/edges, no content search, no host turn/role/session model, no host capability vocabulary, no automatic re-pairing, no host-verified apply-idempotency, no host-side event dedup. **FE-CE-007 remains OPEN on demoted B's ledger** (A has no edges mechanism → N/A against A); deferring B is not repairing B; promoting it would require a scenario demanding standing cross-ns relay without user initiation, which none of S01–S12 does. A strictly dominates B on total cost and the isolation invariant, so the two are not genuinely incomparable and B is not blended in.
