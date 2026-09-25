# Best Candidate — FE-DESIGN-001 / R011 integrated (A)

## R11.1 Core bet

The host core is a namespaced directory of `(ns_id, local_id)` resources, each carrying an
append-only cursor-stream log; an adapter-owned open CapMap; ns-scoped typed actions; a typed
`pump` on the adapter handle; and namespace-scoped subscriber handles whose only permission rule is
`resource.ns_id == handle.ns_id`. Delivery is one host rule — `subscribe(id, from_cursor=c)`
replays the log's envelopes with `seq >= c` in increasing `seq`, then continues live — and the
*value* of `c` is computed by the subscriber from its own state: `0` for a just-spawned resource's
head, `cursor_resolve(id)` for the live edge of a pre-existing resource, `saved_last_seen + 1` to
catch up while the persisted position's `recorded_ns_id` still equals the current `ns_id`, else
`0`. The host holds no content authority: it never reads a payload, never branches on a CapMap
string, and names no capability of its own. What it does hold is the log — and this round states
that plainly instead of denying it.

## R11.2 Types

```typescript
type ResourceId = { readonly ns_id: string; readonly local_id: string }
type Seq = number // int64; host-assigned per-resource log index; NOT a dedup key

interface NamespaceHandle {
  readonly ns_id: string;
  announce(desc: { local_id: string; kind: string; capabilities: CapMap }): void;
  retire(local_id: string, reason: string): void;   // the only per-resource disposal point
  teardown(reason: string): void;                    // the only namespace disposal point
  pump(local_id: string, payload_schema_id: string, payload: unknown): void;
}

interface SubscriberScope {
  readonly ns_id: string;
  directory_list(filter?: { kind?: string }): readonly ResourceDescriptor[];
  directory_lookup(local_id: string): ResourceDescriptor | ExplicitAbsent;
  cursor_resolve(resource_id: ResourceId): Seq;      // next Seq the resource will assign
  subscribe(resource_id: ResourceId, from_cursor: Seq): Subscription;
  invoke<A extends ActionSchema>(resource_id: ResourceId, action_type: A,
         params: A["params"]): InvokeOutcome<A>;
}

type InvokeOutcome<A> = Result<A> | CapabilityAbsent | ScopeDenied | OutcomeUnknown
interface Subscription { onNext(h: (env: Envelope) => void): void; close(): void }
type Envelope = { resource_id: ResourceId; seq: Seq; ts: number; kind: string;
                  payload_schema_id: string; payload: unknown }
type RenderRow = { readonly path: string; readonly label: string; readonly value: string;
                   readonly status: "value" | "absent" | "unreadable" | "opaque" }
type CapMap = Readonly<Record<string, "supported" | "not_supported" | "unknown">>
```

## R11.3 The cursor stream is the log (FE-CE-022, FE-CE-024)

Every resource has one cursor-stream log. `pump(local_id, payload_schema_id, payload)` appends an
envelope and returns `void`; the host assigns the next `Seq` in pump-arrival order and routes the
envelope to every live subscriber whose `from_cursor <= seq`. `subscribe(id, from_cursor=c)`
replays the log's retained envelopes with `seq >= c` in increasing `seq`, then continues live.

- **Retention.** An envelope is retained from the moment `pump` appends it until the resource is
  retired or its namespace torn down. There is no truncation, expiry or window while the resource
  exists. `cursor_resolve(id)` always names a position the log can still serve, so
  `from_cursor = saved_last_seen + 1` is serviceable for any live resource (guarded, as before, by
  `recorded_ns_id == current ns_id`; a full reconnect mints a new namespace and restarts at `1`,
  in which case the subscriber uses `0`).
- **Disposal.** `retire(local_id, reason)` disposes that resource's log; `teardown(reason)` disposes
  every log in the namespace and force-closes every subscriber handle scoped to it. These are the
  only disposal points. A closed subscription releases its *routing reference*, never a log entry
  (this replaces the previous "after the subscription is closed, envelope is dropped", which
  discarded exactly the envelopes catch-up is defined to deliver).
- **Honest cost.** A resource's log grows with every envelope it has ever emitted, for the life of
  the resource. For S03/T-Boring — "submit, leave the page, come back hours later" — that retention
  is the requirement, not an accident. The bound is the resource's lifetime, which the producing
  adapter controls: it can `retire` and re-announce, or expose a `read` snapshot instead of a long
  stream. A service with a very long-lived high-volume resource pays that memory cost; the design
  does not hide it behind an unnamed buffer.
- **Corrected claim.** The previous bytes asserted "no extra host store, no host event store".
  That was false and is deleted. No second store is introduced: the log *is* the stream. The
  mechanism-ledger row `host-event-store|removed` was wrong from R006 to R010 and is replaced by
  `cursor-stream-log|core`, whose deletion makes S03 step 4, S04 step 4 and S10 fail.

## R11.4 Presence is not reachability (FE-CE-023)

`directory_list` / `directory_lookup` report that a resource is **announced and not retired**. They
do not report that the service behind it is reachable, and no part of the core may present
reachability as a fact: the host cannot see the network, and inventing liveness would be content
authority. Consequences, stated rather than patched over:

- **New adapter boundary rule (item 8).** When an adapter observes that its connection to a
  service is lost, it must `teardown(reason)` that namespace as soon as it observes the loss. The
  host never infers namespace death from a failed invoke, a timeout, or silence.
- **Interface failure, not death.** While a namespace is neither retired nor torn down, `invoke`
  on an unreachable resource returns `OutcomeUnknown` — the host-owned variant — and never
  `CapabilityAbsent`. The fallback must therefore render an action whose last attempt returned
  `OutcomeUnknown` as unconfirmed, never as available-and-working (this is the same rule as
  R11.5's invariant, on the action channel).
- **Stated limitation.** If an adapter is killed so that it never observes the loss, its
  namespace's registrations and logs remain until the host process ends, and nothing in the core
  retracts them. Fixing that requires a liveness/heartbeat mechanism, whose cost (a periodic
  protocol every adapter must implement, plus a new failure mode where a slow service is wrongly
  declared dead) the core declines to impose. The directory's meaning is narrowed so that this
  limitation is truthful instead of papered over.

## R11.5 Fallback rendering contract (FE-CE-019, FE-CE-020, FE-CE-021)

**Invariant (one rule, both channels).** An outcome the host has not confirmed may never be
rendered as a current value or a current state. This applies identically to the value channel
(`read`) and the state channel (`status`), removing the asymmetry the attack found.

**`InvokeOutcome` rendering — all four variants, no defaults left to a reader:**

| Variant | Rendering | Clickable consequence |
|---|---|---|
| `Result` | GenericWalk rows, labelled `current (fresh invoke at <ts>)` | **Reload** re-invokes; rows are replaced |
| `CapabilityAbsent(x)` | `no <x> action registered for this kind; value not obtainable` + last-event metadata | none |
| `ScopeDenied` | `this resource is outside this view's namespace scope` | none |
| `OutcomeUnknown` | prior rows, if any, relabelled `last confirmed at <ts> — NOT current`, plus a banner `read did not return; value not confirmed`; with no prior rows, `value not confirmed; read did not return` | **Retry** re-invokes |

**GenericWalk.** It renders the *declared* schema, recursively, to any depth, with each row
labelled by the declared field path (`files[0].hunks[1].lines`). For every declared field it emits
exactly one row, with an explicit status:

- present and conforming → `status="value"`, `value=str(primitive)`;
- declared but absent at runtime → `status="absent"`, `value="(absent at runtime)"`;
- present with the wrong shape (e.g. `null` or a scalar where a `list<record>` was declared) →
  `status="unreadable"`, `value="(unreadable: declared <shape>)"`;
- declared opaque (binary/text blob) → `status="opaque"`,
  `value="opaque: <declared_schema_id>, no view installed"`.

The walk never throws and never causes the pane to be replaced: the error boundary exists for view
*code*, not for data. Non-conforming data therefore cannot produce a fabricated value, a silently
dropped field, or a blank pane. The host still attaches no meaning to any name — `status`, `state`,
`additions` are labels it echoes, never tokens it interprets, and it never branches on a rendered
value.

**Deleted this round (a reduction):** the obligation on adapter authors to keep result schemas
"legibly-named scalar/list-of-record fields, because the fallback can only render that shape". That
clause made an adapter's schema depend on the host renderer's recursion depth — a core internal
leaking into the adapter contract, and the direct cause of nested declared values rendering as
`[object Object]` or being dropped. With a recursive, path-labelled walk the obligation is
unnecessary, so it is removed rather than restated. An adapter's only duty is to declare field
names; a display cap (`… N more rows`) is applied when flattening for display, and is a display
concern, not a schema-authoring rule.

Extension selection, the absent→fallback / throws→error-boundary / uninstall→host-closes-scope
guarantees, and the pair gesture are unchanged from §R8.4; the pair gesture still records nothing.

## R11.6 Adapter boundary rules (8 items)

1. `namespaces.open({service})`; 2. `announce` each kind with `local_id`, `kind` and an open CapMap
including explicit `not_supported`; 3. `pump(local_id, payload_schema_id, payload)` for every remote
event, in remote-stable logical order — the host assigns arrival-index `seq` and does not reorder;
4. `action.register(ns_handle.ns_id, kind, action_type, params_type, result_type)`; 5. on reconnect,
dedup by the adapter's own protocol-level stable event id, never by host `seq`; 6. register a typed
`read` (value) or `status` (state) action for any resource that should be inspectable in the
default view; 7. on `retire`/`teardown`, stop pumping — `pump` on a retired `local_id` is a silent
no-op and `pump` after `teardown` raises `NamespaceGone`; **8. on observing that its connection to
the service is lost, call `teardown(reason)` for that namespace.**

An adapter does not know or use host `seq`, does not compute `from_cursor`, does not persist
`recorded_ns_id`, does not know what views subscribe with, does not know whether a log entry is
retained, and does not shape its schema around a renderer algorithm. Absence is expressed twice and
never as null: `CapMap[x]="not_supported"` (informational) **and** `x` absent from
`action.register` → `invoke(…, x, …)` returns structural `CapabilityAbsent(x)`.

## R11.7 Scenario trajectories (self-contained; each scenario's steps, owners and deletion consequences are in this artifact)

The trajectories below are reproduced in full so that nothing has to be taken from another document.
Two of them changed with this round's corrections, and both changes are visible in the text:
(1) **S03** step 3 "the host stores for next subscriber" is now backed by a *named* mechanism — the
resource's cursor-stream log, retained from `pump` until `retire`/`teardown`, and step 4's replay
reads that log; the clause that discarded an envelope when a subscription closed is gone (§R11.3,
FE-CE-022/024). (2) **S07** and **S09** render `Result`/`OutcomeUnknown` through §R11.5's
four-variant table and its recursive walk, so an unregistered payload schema becomes an explicit
`opaque: … no view installed` row and an unconfirmed read is never shown as a current value.
**S05** and **S11** carry the deletion-complete tables; every other scenario carries its ordered
step sequence, per-step owner, and the deletion consequence for each core step it uses.

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


**S06 two services, same id.** `namespaces.open→ns_A,ns_B`(host) → both announce `job-1`; keys distinct → `h_A.subscribe((ns_B,job-1))→ScopeDenied` → `h_A.invoke((ns_B,job-1))→ScopeDenied` → per-`(ns,kind,action_type)` registry → `h_A.directory_list` sees only ns_A. Delete namespaces → collision; same-ns rule → leak; per-ns action typing → shared key (FE-CE-006). **covered (core).**

**S07 special artefact, view uninstalled.** `announce kind:"acme.plot"`; no resolver matches → fallback renders kind+actions+CapMap+payload_schema_id+read snapshot + "no dedicated view installed". Delete generic-fallback → blank/no action. **covered (core).**

**S08 resource + replaceable runner.** ns_R announce runner + register execute; ns_D announce data.ref; user pair → h_R subscribe runner `from_cursor=cursor_resolve(id)` (live, FE-CE-005 safe); h_D receives ArtifactReady; h_R invoke execute → Result{job_resource}; h_R subscribe (ns_R,job) `from_cursor=0` (just-spawned head, FE-CE-016); replace runner: ns_R.teardown→h_R ops→NamespaceGone; h_D unaffected; re-pair. Delete same-ns rule → step6 ScopeDenied; typed-action → step5; cursor_resolve → step4 FE-CE-005; namespaces/teardown → step7 silent mis-bind. **covered (core+extension).**

**S09 drop / unknown outcome / dup / out-of-order.** Invoke sent, link drops → `OutcomeUnknown`, no token(host); fixed never-auto-resubmit → user re-invokes fresh; adapter dedups by own stable id and pumps logical order(adapter); view catches up `from_cursor=saved+1` if same `recorded_ns_id`, else `from_cursor=0` after full reconnect (FE-CE-017). Delete never-auto-resubmit → double-execution; cursor → incoherent; adapter dedup → duplicates reach view. **covered (core+adaptation, joint, both named).**

**S10 extension crash while remote runs.** View throws/unmounts → host force-closes handles(host); ns_D/ns_R remain authoritative(adapters); new view: `subscribe((ns_R,job), from_cursor=0)` or `from_cursor=saved+1`; no core pair record. Delete force-close → leak; delete cursor/replayable-stream → no replay. **covered (core).**


**S12 remove "optional" core domain module.** Remove adapter → `namespace.teardown`, other namespaces unaffected(host); remove resolver → actionable fallback(host); remove paired view → other single-resource modules untouched (core recorded no pair). Delete namespaces/teardown → shared key-space; delete fallback → blanks. **covered (adaptation+core).**

**S05 — config/Git browse, no session (deletion-complete).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this scenario |
|---|---|---|---|---|
| 1 | Host | `namespaces.open({service:"cfg"})` → `ns_C` | Host | Delete **namespaces**: no scope; step 2 cannot announce/list; S05 fails at 1 — nothing to browse. |
| 2 | Adapter | `announce({local_id:"app.conf", kind:"config.tree", capabilities:{read:"supported"}})` | Adapter | Delete **announce/CapMap**: step 3 lookup returns `ExplicitAbsent`; user sees an empty config pane with no resource. |
| 3 | Extension | `h.directory_list({kind:"config.tree"})`; `h.directory_lookup(id)` | Host | Delete **resource-directory**: cannot list or look up a config item without an active session; user sees no items. |
| 4 | Extension | `r = h.invoke(id, "read", {})` → `ReadResult` | Adapter(content)/Host(route) | Delete **typed-action**: no `read` to invoke; `execute(any)` disqualifier; user cannot fetch current value. |
| 5 | Host | GenericWalk `ReadResult` → rows `port=8080` … | Host | Delete **generic-fallback-view** (the R008 gap): the returned `ReadResult` has no renderer → user sees blank and no Read control → cannot view value or re-invoke. |
| 6 | Extension | User clicks **Read** → re-invoke `read` | View | Delete **generic-fallback-view**'s re-invoke action: value cannot be refreshed; user sees a stale row forever. |
| 7 | Host | opaque body field → `RenderRow(…, "opaque: …, no view installed")` | Host | Delete **generic-fallback-view** opaque handling: either crash on unrenderable value or silently drop it (fake complete). Fails honestly only with the row present. |

**S11 — service lacks cancel/history/resume (deletion-complete).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this scenario |
|---|---|---|---|---|
| 1 | Adapter | `announce kind:"acme.job", CapMap{cancel:"not_supported",history:"not_supported",resume:"not_supported"}` | Adapter | Delete **open CapMap**: UI has no name→state map → infers absence from null → **fake-support disqualifier**; user sees a Cancel button that will fail. |
| 2 | Adapter | does **not** `action.register(ns,"acme.job","cancel")` | Adapter | Delete **per-ns action registry**: host has no record that `cancel` is unregistered → cannot return `CapabilityAbsent`; step 3 has no structural answer. |
| 3 | Host | user clicks Cancel → `h.invoke(job,"cancel",{})` → `CapabilityAbsent("cancel")` | Host | Delete **typed-action routing**: no invoke path → cannot answer absence; either throws or silently pretends. |
| 4 | Host/View | fallback renders "cancel: not_supported" (from CapMap) + "invoke returned CapabilityAbsent" (structural) | Host | Delete **generic-fallback-view**: the `CapabilityAbsent` has no renderer → blank; user cannot tell "unsupported" from "still processing". |
| 5 | Extension | Cancel control greyed with reason, never a fabricated spinner that resolves to success | View | Delete **open CapMap** again (rendering side): control has no reason string → looks enabled → user clicks a dead button. |

## R11.8 Reduction and the standing dead list

Retained core: namespaces, resource-directory, **cursor-stream-log**, typed-action, generic
fallback view (with the recursive total walk), `pump`, `cursor_resolve`, the `from_cursor` input
selection with the namespace guard, same-namespace scoped handles, per-namespace action typing,
open CapMap, never-auto-resubmit, the four-variant outcome rendering, and the presence-vs-
reachability narrowing. Deleted or never-loaded this round: the adapter flat-schema obligation
(new deletion), and carried-and-still-dead — spawned set, host dedup/reorder, payload descriptor
store, `invoke_id` on `OutcomeUnknown`, implicit live default, persistent pair record, typed
`replay_policy`, cross-namespace edge, `replay_mode`, `Subscription.last_seq`, and the now-deleted
"envelope dropped when the subscription closes".

## R11.9 Honest cost and non-goals

The weakest point of this candidate is unchanged and now stated more precisely: the default
view's ability to answer "current value / what changed / running-or-done" is carried by the
adapter's registered `read`/`status` action. With none registered, the view truthfully says the
value cannot be obtained — honest, but empty, and that is the adapter's choice, not a host
defect; making the host synthesise a value would require the content authority the core refuses.
Second: the log's memory is proportional to a resource's total emitted events, and only the
producing adapter can bound it. Third: a hard-killed adapter leaves a stale registration until the
host process ends; the core declines a liveness protocol. Non-goals unchanged: no cross-namespace
joins or edges, no content search, no host turn/role/session model, no host capability vocabulary,
no automatic re-pairing, no host apply-idempotency or event dedup, no heartbeat. `FE-CE-007` stays
OPEN on demoted B's ledger; A has no edges mechanism, and this round neither repairs nor rejects
B — deferring is not repairing.

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
print("FE-CE-024 confirmed: the deleted disposal clause emptied exactly the backlog catch-up replays; retire/teardown is the only disposal point")
```

**EXPERIMENT R11-B — four outcome variants, and unconfirmed is never rendered as current
(FE-CE-019, FE-CE-023).**
```python
# MODEL ONLY: proves the four-variant rendering model, not the product or any protocol.
U, CAP, SCOPE = "OutcomeUnknown", "CapabilityAbsent", "ScopeDenied"

def render(outcome, prior, ts):
    if outcome not in (U, CAP, SCOPE):              # Result -> GenericWalk rows
        return ("current@%s" % ts, outcome)
    if outcome == U:
        if prior:
            return ("last-confirmed@%s NOT current" % prior[1], prior[0])
        return ("value not confirmed; read did not return", [])
    return ("not obtainable: %s" % outcome, [])

prior = (["port=8080"], "t0")
print("Result                    ", render(["port=8081"], prior, "t1"))
print("OutcomeUnknown (prior rows)", render(U, prior, "t1"))
print("OutcomeUnknown (no prior)  ", render(U, None, "t1"))
print("CapabilityAbsent           ", render(CAP, prior, "t1"))
assert render(U, prior, "t1")[0].startswith("last-confirmed"), "stale-as-current reopened"
assert render(U, prior, "t1") != render(["port=8080"], prior, "t1")
failed_row = ("current@t1", ["state=failed reason=exit-1"])
assert failed_row[1] != render(U, None, "t1")[1]   # failed (data) vs unknown (variant)
def action_state(outcome):                          # the action channel of FE-CE-023
    return "unconfirmed" if outcome in (U,) else "available"
assert action_state("Result{ok}") == "available" and action_state(U) == "unconfirmed"
print("four variants distinct; an unconfirmed outcome is never rendered as a current value or an available action")
```

**EXPERIMENT R11-C — GenericWalk totality and recursion, with no host depth constant
(FE-CE-020, FE-CE-021).**
```python
# MODEL ONLY: proves the walk is total and recursive; no host depth constant enters it.
DECL = {"branch": "scalar", "diff_body": "opaque",
        "files": [{"path": "scalar", "additions": "scalar", "deletions": "scalar",
                   "hunks": [{"lines": "scalar"}]}]}

def walk(decl, actual, path=""):
    rows = []
    if not isinstance(actual, dict):
        return [(path or "value", "(unreadable: declared record, got %s)" % type(actual).__name__)]
    for name, kind in decl.items():
        p = "%s.%s" % (path, name) if path else name
        if name not in actual:
            rows.append((p, "(absent at runtime)"))
            continue
        v = actual[name]
        if kind == "scalar":
            rows.append((p, str(v)) if isinstance(v, (str, int, float, bool))
                        else (p, "(unreadable: declared scalar, got %s)" % type(v).__name__))
        elif kind == "opaque":
            rows.append((p, "(opaque: no view installed)"))
        elif isinstance(kind, dict):
            rows += walk(kind, v, p)
        elif isinstance(kind, list):
            if not isinstance(v, list):
                rows.append((p, "(unreadable: declared list, got %s)" % type(v).__name__))
                continue
            if not v:
                rows.append((p, "(empty list)"))
                continue
            for i, item in enumerate(v):
                rows += walk(kind[0], item, "%s[%d]" % (p, i))
    return rows

cases = {
 "conforming": {"branch": "main", "diff_body": "<b>",
                "files": [{"path": "a.rs", "additions": 42, "deletions": 7, "hunks": [{"lines": 3}]}]},
 "partial":    {"branch": "main", "diff_body": "<b>",
                "files": [{"path": "a.rs", "additions": 42, "hunks": [{"lines": 3}]}]},
 "null_list":  {"branch": "main", "diff_body": "<b>", "files": None},
 "nested":     {"branch": "main", "diff_body": "<b>",
                "files": [{"path": "a.rs", "additions": 1, "deletions": 0,
                           "hunks": [{"lines": 9}, {"lines": 4}]}]},
}
for name, v in cases.items():
    rows = walk(DECL, v)
    assert rows, name
    print(name, "->", rows)
assert any(p.endswith("deletions") and val == "(absent at runtime)"
           for p, val in walk(DECL, cases["partial"]))
assert any("unreadable: declared list" in val for p, val in walk(DECL, cases["null_list"]))
assert any(p == "files[0].hunks[1].lines" for p, val in walk(DECL, cases["nested"]))
print("total over declared fields, recursive to depth, no depth constant, no exception raised")
```
