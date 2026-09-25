
## Verification

### FE-CE-018 — adapter event-pump has no typed interface: **holds**

The candidate's §2 code block declares `NamespaceHandle` with exactly three methods: `announce`, `retire`, `teardown`. §6 footer confirms "6 real type signatures provided in §2" — establishing this as the complete typed adapter contract. §3 item 3 names the adapter's third obligation "Pump events in remote-stable logical order" and §5 scenario tables S01 step4, S04 step4, S02 step3, S03 step3 all say "Adapter pumps" — but no `pump`, `emit`, `push_event`, or equivalent method exists on any type in §2. The Envelope description ("Lifecycle: adapter pumps; host assigns seq and routes") names the operation without typing it.

The attacker's sequence is valid under the candidate as written: `namespaces.open` → `announce` → `action.register` → **dead end**. The adapter's central event-delivery obligation has no callable interface. This breaks §2's own claim to be the checkable type contract and renders every scenario's pump step unimplementable against the typed interface.

Missing: a typed method on `NamespaceHandle` — signature shape (params: local_id? payload_schema_id? payload opaque?), return type (void vs assigned Seq vs error union), and failure semantics (post-`retire`, mid-`teardown`, stale `ns_id`).

### FE-CE-007 — edges.list leaks foreign ns ids: **holds (against B only)**

Replay: Candidate A has no `edges` mechanism. The defect exists exclusively in demoted B's §B.4 edges.list. Status: OPEN against B, N/A against A. No change from prior rounds.

### Secondary observation: `action.register` ns_id access

`NamespaceHandle` exposes no `ns_id` field yet `action.register(ns_id, ...)` requires it as first parameter. §3 item 1's prose "gets ns_id" makes the design intent clear but the typed contract omits the accessor. Minor; not elevated to a new FE-CE.

---

FABRICATION_CHECK: none. The attacker quotes §2 code block, §3 items 3/5, §5 S01/S02/S03/S04 step ordering, and §7 accurately. All referenced text exists in the candidate as quoted. The Envelope lifecycle description "adapter pumps; host assigns seq and routes" is in §2 verbatim.
CONTRADICTION_CHECK: §2's closing claim "6 real type signatures provided in §2" asserts the type block is the complete adapter-facing contract, yet §3 item 3 and four scenario trajectory steps name "pump" as a mandatory adapter operation with no corresponding signature in that same §2 block. The candidate simultaneously claims the contract is complete and references an operation outside it.
MISSED_CHECK: none. The pump gap is the primary D06 finding. Items 1-7 minus item 3 (pump) have typed targets; item 5 (reconnect dedup) is internal adapter behavior requiring no host interface. The S01 step-ordering concern (subscribe after invoke with cursor_resolve skips response) is correctly noted as minor by the attacker — the cursor mechanism is sound but the trajectory table numbering misleads; not a new mechanism gap.

