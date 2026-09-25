
D06-adapter-burden.

## Counterexample: FE-CE-018 — The adapter's primary event-delivery operation has no typed interface

### Exact event sequence

1. A new service "WeatherPush" (WebSocket protocol, pushes forecast updates) connects. Its adapter calls `namespaces.open({service:"weather"})` → receives a `NamespaceHandle`. Interface exists (§2).
2. The adapter calls `handle.announce({local_id:"fc-1", kind:"weather.forecast", capabilities:CapMap})`. Interface exists.
3. The adapter calls `action.register(ns_id, "weather.forecast", "get_current", ParamsSchema, ResultSchema)`. Interface exists (though `action.register` is a free function taking `ns_id` that `NamespaceHandle` does not expose as a typed field; secondary issue noted below).
4. The remote WeatherPush server sends an updated forecast payload. The adapter must push a new envelope into `(ns_W, fc-1)`'s cursor stream so that subscribers receive it. **The adapter calls… what?** §2's typed interfaces contain no `pump`, `emit`, `push_event`, or equivalent on `NamespaceHandle` or any other adapter-side interface. §3 item 3 says "pump events in remote-stable logical order" but never names the method, its parameters (does it receive `payload_schema_id`? `kind`? just `payload`?), its return (void? the assigned `Seq`? an error union?), or its failure semantics (can you pump after `retire`? during `teardown`? what if `ns_id` is stale?).
5. A subscriber on `h.subscribe((ns_W,"fc-1"), from_cursor=1)` is live and waiting. Without the pump call in step 4, no data ever reaches the subscriber.

The candidate's own scenario tables make this explicit: §5 S01 step 4 "Adapter pumps {seq:1, …}", §5 S04 step 4 "Adapter pumps progress: {seq:1, …}, {seq:2, …}." These describe an operation. That operation does not appear in §2's type signatures. The candidate claims "6 real type signatures" in §2; `pump` is not among them.

### Invariant broken

§2 introduces its code block as: "Type signatures (≥6)." §3 states the adapter "must write exactly 7 items," item 3 being "Pump events." The implicit invariant is: every operation the adapter must perform is expressed in the typed interface. The pump operation is referenced in §2 prose, §3 items 3 and 5, §5 S01/S02/S03/S04 step 4, §6 experiment table, §7 adapter cost — and typed nowhere.

The text claiming pump exists: §2 "Envelope — the unit of delivery. Fields: resource_id, seq, ts, kind, payload_schema_id, payload. Lifecycle: adapter pumps; host assigns seq and routes." The host "assigns seq" implies the adapter calls a method that returns void (host stamps seq internally) or returns the stamped envelope. Neither is typed.

### Minimal version

Remove any step after 3. After step 3 (the last operation the adapter can actually perform), the adapter needs to deliver a remote event. There is no typed call to make. The sequence stops at step 4 — pump — because the interface does not exist. This is the shortest sequence: open → announce → register → **dead end**.

### Consequence in user-visible terms

S01: the user types "hello" and never sees a response (step 4 "adapter pumps deltas" is unimplementable). S02: tool events and approval notifications never arrive; the Pi interface freezes. S03: the long task's progress events never enter the stream; the user sees a static "last event" and no updates. S04: the job's progress sequence never appears; the user sees "submit" return and then silence. The adapter's central responsibility — delivering remote events — cannot be written against the typed contract.

### Why this is D06 specifically

A "new service author" reading §3 and §7 finds item 3 tells them to "pump events in remote-stable logical order" and item 5 tells them to "dedup by own stable id on reconnect" (a concern that presupposes pump exists). Both instructions reference an operation they must implement but whose signature, parameter shape, return type, and failure modes are absent from the only typed contract in the document. The core's event-delivery mechanism leaks into the adapter as a named obligation without a callable interface. This is not a style observation; it is a missing type that makes the adapter unimplementable.

## Secondary observation (minor): `action.register` takes `ns_id` but `NamespaceHandle` does not expose it

§2's `NamespaceHandle` interface has three methods: `announce`, `retire`, `teardown`. None return an `ns_id`. The `action.register(ns_id, kind, action_type, params_type, result_type)` call (§3 item 4, §5 S04 step 1, §7 table row 4) requires `ns_id` as its first parameter. The adapter presumably receives it from `namespaces.open`, but that operation returns `NamespaceHandle` — a type with no `ns_id` field in §2's listing. A new adapter author reading only the types cannot determine how to obtain `ns_id` to pass to `action.register`. This is a minor type-omission; the prose clearly implies the handle carries it, but §2's purpose is to be the checkable contract.

## Minor observation: S01 trajectory step ordering implies a timing knowledge the view must derive

§5 S01 presents the sequence: invoke (step 3) → adapter pumps (step 4) → extension subscribes at `cursor_resolve` (step 5). A view author implementing this literally subscribes AFTER the response is already pumped; `cursor_resolve` returns the next-to-be-assigned seq, so the response backlog (seq 1..N) is skipped. The 4 cursor rules (§3) do not mention subscribe-vs-invoke ordering for response-pattern resources. The view author must independently understand the host's stream-timing model (pumps land synchronously within invoke or before resolve is callable) to know that subscription must precede the action whose response is desired. This is host stream-assignment timing leaking into the view author's required knowledge without being captured in the deterministic decision function. Severity: minor — the design's mechanism supports the correct ordering (subscribe first, then invoke); the documentation's step numbering misleads.

## Extension/adapter burden check

The candidate claims §7: "Zero items are (b) core-derived correctness" for the adapter. This claim holds only if every adapter obligation is implementable from the typed interfaces. Since the pump interface is absent, item 3 is neither (a) nor (b) — it is undefined. The D06 separation table is incomplete. The subscriber/view cost of 4 cursor rules is genuinely pure-function-of-observable-state and does not consult host internals; that claim survives scrutiny. The 4 rules themselves do not break the design; the missing pump does.

## Regression replay

**FE-CE-007 (OPEN):** Candidate A has no `edges.list`, no cross-namespace edge mechanism. The defect exists only in the demoted B. Replay against A's bytes: no counterexample sequence can be constructed because the named mechanism is absent. Status against A: N/A. Status on ledger: remains OPEN against B; deferring B is not repairing B, as the directive mandates. No change.

All other ledger rows are CLOSED or REJECTED against the current bytes. No previously-established counterexample is reintroduced by §2's typed interfaces or §3's seven-item list, with the exception of the pump gap (new, not a regression).

## Disqualifier scan

- `execute(any)` or untyped escape hatch: `invoke<A extends ActionSchema>(...)` is typed. Not present.
- Omnipotent context: views receive `SubscriberScope`, not a global context. Not present.
- Arbitrary event bus: extensions register resolvers matched by `(kind, payload_schema_id)`, not free-form event names. Not present.
- Complexity smuggled into plugin: the fallback view renders host-side logic (§4), not delegated to a plugin. Not present.
- Faking capability: `CapabilityAbsent` and explicit `not_supported` CapMap; EXPERIMENT 2 confirms no inference. Not present.
- Scenario reinterpreted: all 12 remain stated as originally defined. Not present.

## What I could not break

- The 4-rule cursor decision function applied mechanically: EXPERIMENT 3's implementation is deterministic and complete for the four cases it enumerates. No counterexample where a subscriber following the rules still loses head or skips window. FE-CE-016/017 stay CLOSED.
- Same-ns scoped handle isolation: no view or adapter can reach a foreign namespace's resources without explicitly constructing a foreign `resource_id`, which `ScopeDenied` blocks at both `subscribe` and `invoke`. S06 holds.
- Adapter cost items 1–7 minus pump: the remaining 6 operations have clear typed targets. Only pump is missing.

## What observation would settle this

The designer must add a typed `pump` (or equivalently-named) operation to `NamespaceHandle` with its full signature — parameter types (payload, schema_id, possibly kind), return type (void or assigned Seq), and failure behavior during retire/teardown. Once that operation appears in §2's type block with ≥6 operations total, the D06 objection is resolved and the 7-item list is implementable.

