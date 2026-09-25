
# Candidate A — R009 (revision of the saved `49df1e9345ab…` bytes; D05-fallback-unknown)

This round adds no core mechanism, changes no interface surface on `pump`/`invoke`, and adds no scenario. It completes the S05/S11 deletion tables (R008 `insufficient_evidence`), and specifies the **generic rendering contract** of `generic-fallback-view` precisely enough to answer the three D05 questions with named inputs and owners. The one sharpening is a definition of "renders the read/status result as typed rows" = a schema-walk that reads only declared field names + primitive values and assigns no semantics. That is a clarification of an existing core mechanism's behaviour, not a new primitive.

## 1. Core bet (carried, unchanged)

The host core is a namespaced directory of cursor-streamed resources with same-ns scoped subscriber handles, a subscriber-chosen single `from_cursor`, adapter-owned open CapMap and ns-scoped typed actions, and a typed `pump`; it holds no content authority. Its default view therefore renders only what the adapter registered — kind label, last-event metadata, typed action names+schemas, CapMap, and a re-invokable `read`/`status` snapshot rendered by generic schema-walk — and truthfully says "cannot determine" when no such action exists. Nothing smaller satisfies S01–S12; each retained core mechanism has a deletion row in §6.

## 2. Core concepts, operations, state authority, lifecycle (type signatures ≥6)

```typescript
type ResourceId = { readonly ns_id: string; readonly local_id: string }
type Seq = number // int64; host-assigned per-resource stream index; NOT a dedup key

interface NamespaceHandle {
  readonly ns_id: string;
  announce(desc: { local_id: string; kind: string; capabilities: CapMap }): void;
  retire(local_id: string, reason: string): void;
  teardown(reason: string): void;
  pump(local_id: string, payload_schema_id: string, payload: unknown): void; // FE-CE-018; signature unchanged
}

interface SubscriberScope {
  readonly ns_id: string;
  directory_list(filter?: { kind?: string }): readonly ResourceDescriptor[];
  directory_lookup(local_id: string): ResourceDescriptor | ExplicitAbsent;
  cursor_resolve(resource_id: ResourceId): Seq;
  subscribe(resource_id: ResourceId, from_cursor: Seq): Subscription;
  invoke<A extends ActionSchema>(resource_id: ResourceId, action_type: A,
         params: A["params"]): InvokeOutcome<A>;
}

type InvokeOutcome<A> =
    Result<A>          // adapter produced a typed result (business content, opaque to host)
  | CapabilityAbsent   // host structural: action_type not registered for (ns,kind)
  | ScopeDenied        // host structural: resource.ns_id != scope.ns_id
  | OutcomeUnknown     // host structural: the invoke's link dropped before a result — host-owned fact

interface Subscription { onNext(h: (env: Envelope)=>void): void; close(): void; }

type Envelope = { resource_id: ResourceId; seq: Seq; ts: number; kind: string;
                  payload_schema_id: string; payload: unknown };
type CapMap = Readonly<Record<string, "supported" | "not_supported" | "unknown">>;

// The generic renderer's unit. Not a host object — the shape the fallback emits per field.
type RenderRow = { label: string; value: string };  // label = DECLARED field name only
```

Concept ownership and lifecycle are as in the saved §R8.2 (Namespace host-minted per connection, new ns_id on full reconnect, teardown force-closes subscribers; Resource content-authority = adapter, existence = host; Cursor stream index assigned by host in pump-arrival order; SubscriberScope minted by `handle_for`, closed by owner or forced; Typed action registered per (ns,kind,action_type); Open CapMap informational, no host behavioural authority; Subscription close is linearizable). No concept is added or removed. The cursor decision rule (`0` / `cursor_resolve` / `saved+1` guarded by `recorded_ns_id`) is unchanged.

The new clarification is the **GenericWalk contract** the `generic-fallback-view` uses to render a `read`/`status` `Result`:
- scalar / enum field → one `RenderRow(label=declared_field_name, value=str(primitive))`;
- `list<record>` → one row per record joining its scalar fields, capped, then `"<N more>"`;
- `record` → recurse;
- field whose declared schema is opaque (binary/text blob) → `RenderRow(label, "opaque: <declared_schema_id>, no view installed")`.
The host reads **only** declared field names and primitive values; it attaches no meaning to any name (`state`, `additions`, etc. are opaque labels it echoes). It never branches on a rendered value. This is the exact shape of "renders typed rows" that §R8.4 asserted but left undefined.

## 3. Boundary rules (unchanged; restated for the fallback contract)

Adapter must do the 7 items in §R8.3 (open/announce/pump-in-logical-order/register/dedup-by-own-id/register-readable-typed-action/stop-pumping). **Addition for D05:** for any resource the adapter wants its *current value or run-state* shown in the default view, it must register a `read` (value) or `status` (state) typed action whose **result schema uses declared, legibly-named scalar/list-of-record fields** — because the fallback can only render that shape and cannot summarise an opaque blob. Unavailability is still expressed twice and never as null: `CapMap[x]="not_supported"` (informational) **and** `x` absent from `action.register` → `invoke(...,x,...)` returns structural `CapabilityAbsent(x)`.

## 4. Extension mechanism and default-view actionability — answering the three D05 questions

Each answer gives the **named rendering input (interface method + type)** and the **user-clickable consequence (action + responsible owner)**.

**Q1 — current value (config browse).**
- Input: `SubscriberScope.invoke(resource_id, "read", {})` → `InvokeOutcome<ReadResult>`; on `Result`, the fallback runs GenericWalk over the declared `ReadResult` schema → `RenderRow[]`. This is *current value*, not "the stream said it changed": it is produced by a fresh invoke, and the last-event row is suppressed as authority. Owner: adapter supplies `read` + legible result schema; host routes and GenericWalks; view mounts.
- Consequence: a clickable **Read** control re-invokes `read` and refreshes the rows (owner: extension view; host re-attaches no state).
- If `Result` is `CapabilityAbsent(read)`: the fallback shows "no read action; value not obtainable; last event schema=X ts=Y" (owner: host, truthful absence — not the `read` disqualifier of fake support).

**Q2 — what changed (git).**
- Input: same `invoke(...,"read")` where the adapter's declared `ReadResult` is `{branch:str, files:list<{path:str, additions:int, deletions:int}>, diff_body:<opaque>}`. GenericWalk emits `branch=main`, then per-file rows `path=src/a.rs additions=42 deletions=7`, then `diff_body=opaque: acme.diff.binary, no view installed`. The host learned nothing about git; `path/additions/deletions` are just labels it echoed. Owner: adapter names the fields; host walks.
- Consequence: clicking **Read** re-invokes and refreshes (owner: view). A user who needs the *body* needs a dedicated view (S07) — the fallback states the body is opaque rather than fabricating a summary. This is the honest boundary: the default view renders value to the depth the declared schema is flat-with-primitives, and no deeper.

**Q3 — running / done / failed / outcome-unknown.** The four are distinguishable because they arrive on **two different channels** the host is entitled to tell apart:
- running / done / failed: adapter-declared `status` action `Result` rows, e.g. `state=running pct=40`, `state=done`, `state=failed reason=exit-1`. These are data rows the GenericWalk renders; the host does not know what the strings mean (proven in EXPERIMENT A). Owner: adapter supplies distinct legible values; host echoes.
- **outcome-unknown: NOT a data row.** It is the host structural return `OutcomeUnknown` produced by `invoke(...,"status")` when the link drops before a result — the host owns this fact (it is the host that saw the IO fail), so reporting it is not content interpretation. The fallback renders a *separate* panel "status check did not complete; last confirmed state = <prior row> — [Retry]" and there is **no** `state=…` row. So `failed` (a present `state=failed` row) and `outcome-unknown` (an absent row + a structural variant) are structurally different renderings; they cannot be conflated (EXPERIMENT A asserts `rendered[failed] != rendered[outcome_unknown]`). Owner: host for the variant; view for the Retry button which re-invokes `status`.
- The fallback **never** infers run-state from last-envelope recency or from a `payload_schema_id="error"` mid-stream label; last-event metadata is *evidence*, `status` is *authority*. If no `status` action is registered → `CapabilityAbsent(status)` → truthful "cannot determine running-vs-done" (S11 posture; EXPERIMENT A `no_status_action` case).

Pair gesture, extension guarantees (absent→fallback, throws→error boundary, uninstalled mid-op→host closes that scope's subscriptions), and the "view cannot enumerate foreign ns / derive foreign ns_id / register free-form events / hold global context" prohibitions are unchanged from §R8.4.

## 5. Scenario trajectories

S01, S02, S03, S04, S06, S08, S09, S10, S12: carried from §R8.5 unchanged, still claimed (owners/deletion rows as in saved bytes; not restated or weakened). S09's OutcomeUnknown *rendering* is now pinned by §4 Q3 (structural variant + Retry, distinct from a `failed` data row) and proven by EXPERIMENT A; the dedup/order mechanics are unchanged. Below are the two scenarios whose deletion tables this round completes.

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

`CapabilityAbsent` at step 3 and the "not_supported" at step 1 are **not inferred from timeout or null**; both are explicit and required, per §3. A fixed capability enum would reopen FE-CE-002, so the map stays open and carries zero host behavioural authority.

## 6. Deletion / reduction experiments

Per-core-mechanism rows (name|core|delete→fails-scenario|experiment) are in the MECH block. Carried-and-still-dead list is unchanged from §R8.6 (spawned set, host dedup/reorder, payload descriptor store, invoke_id, implicit live default, persistent pair record, typed replay_policy, cross-ns edge, replay_mode, Subscription.last_seq). No mechanism is moved into an extension to hide complexity: `read`/`status` actions were **already** adapter-registered typed actions in the saved bytes; this round only specified how the fallback renders their result. **FE-CE-018 re-check:** `pump` signature is byte-for-byte unchanged and remains typed on `NamespaceHandle`; the open→announce→register→pump sequence still closes — pass does not silently inherit, it is re-confirmed here and in EXPERIMENT C's precondition.

Three experiments, all MODEL ONLY (never product/protocol verification).

**EXPERIMENT A (NEW — question 3, four states distinguishable from SubscriberScope fields only).**
```python
# MODEL ONLY: proves the default-view state-distinguishing model. Not product, not protocol.
OUTCOME_UNKNOWN = "OutcomeUnknown"; CAPABILITY_ABSENT = "CapabilityAbsent"
def invoke_status(res, link_ok=True):
    return OUTCOME_UNKNOWN if not link_ok else res.status_result  # host channel: variant OR typed result
def walk(rec): return " | ".join(f"{k}={v}" for k,v in rec.items())   # echoes declared names; no semantics
class Res:
    def __init__(self, s): self.status_result = s
data = {"running":Res({"state":"running","pct":40}), "done":Res({"state":"done","pct":100}),
        "failed":Res({"state":"failed","reason":"exit-1"})}
r = {k:("result",walk(v.status_result)) for k,v in data.items()}
r["outcome_unknown"] = ("structural", invoke_status(Res({"state":"done"}), link_ok=False))  # no row produced
r["no_status_action"] = ("structural", CAPABILITY_ABSENT)
assert r["failed"][1] != r["outcome_unknown"][1]                         # failed = present row; unknown = variant
assert all(r[k][1] != r["outcome_unknown"][1] for k in ("running","done","failed"))
assert r["running"][1] != r["done"][1] != r["failed"][1]                 # three distinct legible rows
assert r["no_status_action"][1] == CAPABILITY_ABSENT                     # truthful absence, never a fake state
print("four states + absent capability: all distinct; failed never conflated with outcome-unknown")
```
CONFIRMED (model only): running/done/failed are distinct adapter-declared rows; outcome-unknown and capability-absent are host structural variants on a different channel and cannot be mistaken for any data row.

**EXPERIMENT B (NEW — question 2, git what-changed from a declared read schema, no content interpretation).**
```python
# MODEL ONLY: proves the fallback renders file/+/− from declared field names; the unreadable body stays opaque.
def walk(rec):
    rows=[]
    for k,v in rec.items():
        if isinstance(v,list) and v and isinstance(v[0],dict):
            rows += [" ".join(f"{kk}={vv}" for kk,vv in it.items()) for it in v[:3]]
            if len(v)>3: rows.append(f"...{len(v)-3} more")
        elif isinstance(v,str) and v.startswith("<opaque"): rows.append(f"{k}={v} [no view installed]")
        else: rows.append(f"{k}={v}")
    return "\n".join(rows)
git = {"branch":"main","files":[{"path":"src/a.rs","additions":42,"deletions":7},
                               {"path":"src/b.rs","additions":1,"deletions":0}],
       "diff_body":"<opaque: acme.diff.binary>"}
out = walk(git)
assert "src/a.rs additions=42 deletions=7" in out
assert "no view installed" in out and "diff_body" in out   # stated as opaque, never summarised away
print(out)
```
CONFIRMED (model only): default view shows what changed to the depth the schema is flat-with-primitives; beyond that it names the opaque part instead of fabricating a diff.

**EXPERIMENT C (carried/adapted — cursor-decision determinism underpinning S05/S03/S04/S08/S10 catch-up; precondition keeps the `pump` contract exercised).**
```python
# MODEL ONLY: proves the from_cursor decision function is deterministic (unchanged posture from R8).
def decide(just_spawned, saved, saved_ns, cur_ns, resolved, live_only):
    if just_spawned: return 0                       # FE-CE-016 head
    if saved_ns is not None and saved_ns!=cur_ns: return 0   # FE-CE-017 ns-regeneration guard
    if saved is not None: return saved+1
    if live_only: return resolved
    return 0
assert decide(True,None,None,"ns_R",2,False)==0
assert decide(False,20,"ns_A","ns_B",6,False)==0
assert decide(False,None,None,"ns_R",42,True)==42
assert decide(False,20,"ns_A","ns_A",25,False)==21
```
CONFIRMED (model only): complete and deterministic; no head loss, no window skip.

## 7. Second-service onboarding cost (unchanged count; one added contract clause)

A new adapter writes the same 7 items (open / announce / pump-in-logical-order / register actions / dedup-by-own-id / register-typed-read-or-status / stop-pumping). **New clause in item 6:** the `read`/`status` result schema must use declared, legibly-named scalar or list-of-record fields, because the default view renders that shape and nothing else — an opaque result means the default view truthfully shows only "opaque, no view installed." A module that only adds a view still writes 1 item (a resolver) with 0 core knowledge. A subscriber that manages recovery implements the same 4 deterministic facts (EXPERIMENT C); zero of these are hidden host queries or core-internal leakage.

## 8. Honest cost and non-goals

Weakest point: the default view's ability to answer Q1–Q3 is **carried by the adapter**, not the host — it requires the adapter to register a legible `read`/`status` action. If it registers none, the view truthfully shows "cannot determine," which satisfies S11/S05's honesty bar but gives the user no value/state (that is the adapter's choice, not a host fix — charging it to the host would require host content authority, the disqualifier). Deep/nested/binary content (git diff bodies, plots) is **not** summarisable by the host fallback by design; a dedicated view is required, which is S07. `running/done/failed` are only as legible as the adapter's chosen state strings; the host adds no vocabulary. Non-goals unchanged: no cross-namespace joins/edges, no content search, no host turn/role/session model, no host capability vocabulary, no auto re-pairing, no host apply-idempotency or event dedup. FE-CE-007 stays **OPEN on demoted B's ledger**; A has no edges mechanism and this round neither repairs nor rejects B — deferring is not repairing. No new counterexample against A's current bytes is raised this round; the D05 attack (four-state collapse / metadata wall) is answered by the two-channel design in §4 and EXPERIMENT A, so no fork to a host value/snapshot primitive is triggered.

<<<FE-SCENARIO-START>>>
S01|covered|core|namespaces+announce+typed-action invoke+pump+cursor-stream live subscribe; delete pump->step4 no data, delete typed-action->step3 execute(any), delete namespace->step1 no scope, delete cursor-stream->step5 no delivery|rounds/R009 cand-A §5 (carried §R8.5)
S02|covered|adaptation|namespaces+announce pi kinds+cursor_resolve live+typed-action send/approve+pump tool/approval/response|rounds/R009 cand-A §5 (carried §R8.5)
S03|covered|core|subscribe from_cursor=0+close+persist(recorded_ns_id,seq)+pump continues+ns-guard catch-up+read snapshot|rounds/R009 cand-A §5 (carried §R8.5)
S04|covered|core|announce job kind+register submit+pump head inside invoke+subscribe spawned from_cursor=0+pump progress/result+retire; no role/turn/session in Envelope|rounds/R009 cand-A §5 (carried §R8.5)
S05|covered|core|announce config kind read-capable+directory_list+invoke read->GenericWalk rows+fallback Read re-invoke+opaque-handling; delete each step has a named user-visible failure in §5 S05 table|rounds/R009 cand-A §5 S05 (closes R008 insufficient_evidence)
S06|covered|core|namespaced ids+same-ns ScopeDenied+per-(ns,kind,action) registry; delete namespaces->collision, same-ns->leak, per-ns->shared key(FE-CE-006)|rounds/R009 cand-A §5 (carried §R8.5)
S07|covered|core|actionable GenericWalk fallback (kind+actions+CapMap+schema+read rows)+opaque-body "no view installed" when resolver uninstalled|rounds/R009 cand-A §4 Q2 (rendering contract of generic-fallback-view)
S08|covered|core|runner cursor_resolve live+job from_cursor=0+same-ns permits subscribe+pump progress+teardown->NamespaceGone+re-pair|rounds/R009 cand-A §5 (carried §R8.5)
S09|covered|adaptation|adapter dedups own id+pumps logical order+never-auto-resubmit+catch-up from_cursor; OutcomeUnknown rendered as structural variant+Retry, distinct from failed data row|rounds/R009 cand-A §4 Q3 + EXPERIMENT A
S10|covered|core|force-close on unmount+new view subscribes saved+1 or 0|rounds/R009 cand-A §5 (carried §R8.5)
S11|covered|core|open CapMap not_supported + absent-from-registry -> CapabilityAbsent structural + fallback renders absence; delete CapMap->fake-support, delete per-ns registry->cannot answer absence, delete fallback->blank|rounds/R009 cand-A §5 S11 (closes R008 insufficient_evidence)
S12|covered|adaptation|namespace teardown isolation + actionable fallback for removed resolver + no standing pair|rounds/R009 cand-A §5 (carried §R8.5)
<<<FE-SCENARIO-END>>>

<<<FE-MECH-START>>>
namespaces|core|S01 step1 no scope / S06 step2 id collision|§R8.6 / EXPERIMENT A precondition
resource-directory|core|S05 step3 cannot list/lookup without active session|§5 S05
pump|core|S01 step4 / S04 step3 head never enters stream; delete -> adapter cannot deliver|EXPERIMENT A/C precondition; FE-CE-018 unchanged
typed-action (read/status)|core|S05 step4 no value; S11 step3 cannot answer absence; delete -> execute(any)|§5 S05,S11; §4 Q1-Q3
generic-fallback-view|core|S05 step5 blank + no Read re-invoke; S07 unknown opaque unrendered; S11 step4 blank; delete -> metadata wall, no clickable consequence|EXPERIMENT A, EXPERIMENT B
cursor-stream / envelope-seq index|core|S03 step4 no catch-up / S10 step3 no replay (stream index, not dedup key)|§R8.6
cursor_resolve|core|S08 step4 runner forced to replay -> FE-CE-005 / S02 live edge unexpressible|EXPERIMENT C
from-cursor input-selection|core|S04 step2 / S08 step6 spawned head loss -> FE-CE-016 / ns-regen skip -> FE-CE-017|EXPERIMENT C
same-namespace-scoped-handle|core|S06 step3-4 out-of-scope subscribe/invoke / S08 step6 job subscribe|§R8.6
per-namespace action typing|core|S06 step5 shared mutable key -> FE-CE-006 reopens|§R8.6
open capability map|core|S11 step1 absence inferred from null -> fake-support disqualifier|EXPERIMENT A no_status_action case
never-auto-resubmit|core|S09 step2 host replays command -> double execution|§R8.6
structural OutcomeUnknown return|core|S09/S07 render: failed-vs-unknown conflated if removed; delete -> hide uncertainty (disqualifier)|EXPERIMENT A r[failed]!=r[outcome_unknown]
host-event-store|removed|none -> S03/S09/S10 are subscriber/adapter burden; nothing fails|§R8.6
host-turn-role-envelope-field|removed|none -> D12 disqualifier; S04 passes; nothing fails|§R8.6
host-dedup / host-reorder-by-seq|removed|none -> vacuous under arrival index; adapter dedups own id; nothing fails|§R8.6
invoke_id on OutcomeUnknown|removed|none -> no auto-resubmit, no consumer; nothing fails|§R8.6
<<<FE-MECH-END>>>

<<<FE-LEDGER-START>>>
FE-CE-002|R001|minor|CLOSED|A core smuggles run/agent reading via fixed CapSet and generic last-envelope view|rounds/R009 §4 Q3 + §5 S11: open CapMap with zero host behavioural authority + GenericWalk echoes declared names only; unchanged since R002|-|R009 replay: A bytes still closed
FE-CE-007|R002|major|OPEN|edges.list returns core-stored target ids enabling adapter-authorized user-less relay edges|rounds/R002/cand-B §B.4 vs §B.1-3; stays on B ledger; A has no edges mechanism and this round neither repairs nor rejects B|-|R009 replay: unchanged; deferring B is not repairing B
FE-CE-018|R008|major|CLOSED|adapter event-pump operation has no typed interface method on NamespaceHandle|rounds/R009 §2: pump(local_id,payload_schema_id,payload) signature byte-unchanged and typed; open->announce->register->pump re-checked (EXPERIMENT A/C precondition); R008 pass re-confirmed not inherited|-|R009 replay: closed, interface surface not moved
<<<FE-LEDGER-END>>>

