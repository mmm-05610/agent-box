
# Verifier report — R002, D10-cross-module

## Verdicts

### FE-CE-003 — idempotent-apply string toggles host auto-replay: **HOLDS**

The candidate text directly contradicts itself. §A.2: "names are adapter-chosen strings with **no** host-defined vocabulary." §A.5-S09 step 3: "If `supported`, the host re-sends the SAME `invoke_id` … if `not_supported`, the host **refuses to auto-replay**." The host branches on one specific literal string. The sequence is possible under the candidate as written: an adapter that sets `"idempotent-apply": supported` (because the host said it's inert metadata) receives an unexpected re-dispatch it has no dedup logic for. The claim that broke is §A.2's "no host-defined vocabulary," and the FE-CE-002 closure text (§R.2) that was supposed to prevent exactly this shape.

### FE-CE-004 — spawned job resource has no subscription path: **HOLDS**

§A.5-S08 step 6: "progress rendered from `(ns_R, job)` envelopes." §A.2: handle "carries **exactly one** `(ns_id, local_id)`; it exposes no parent, no sibling, no enumerateNamespace." §A.4: handle mint requires a user select/pair gesture. No gesture exists for a machine-created job. The trajectory claims rendering from a resource the coordinating view cannot subscribe to. §A.5-S08's "Covered" label contradicts its own step 6 under the candidate's handle model.

### FE-CE-005 — replay into a freshly paired handle fires execute: **HOLDS**

§A.2 Envelope: `{resource_id, seq, ts, kind, payload_schema_id, payload}` — no `is_replay` or equivalent. §A.5-S08 step 5: "h_D's stream shows the artefact ready; the coordinating view calls h_R.typedInvoker('execute',…)." §A.2 subscribe default is `from_cursor`, which replays history (this is S03 step 4's mechanism). The §A.8 claim "S08 cooperation requires a user gesture rather than a standing automatic link" is broken: the gesture triggers replay, replay triggers execute, the user never asked for *that* execution. No text in the candidate distinguishes replayed from live at the view logic layer.

### FE-CE-006 — payload-type registry scoping undefined: **HOLDS**

§A.2: "host refuses delivery of an unregistered payload_schema_id." §A.3: "(3) payload-type registration per kind." Neither §A.2 nor §A.3 nor §A.7 qualifies the gate by namespace. The natural reading of "an unregistered payload_schema_id" is a global existence check on a bare string. Two adapters registering the same string with different shapes collide. §A.1 claims the host's only authority is "identity, namespace isolation, subscription routing, and per-resource event ordering" — a global shared mutable registry keyed by an adapter-chosen string is an additional authority the candidate does not acknowledge. The candidate does not explicitly scope it by `(ns, kind)` nor declare it global; the gap is that either reading changes S06's isolation guarantee.

### FE-CE-007 — edges.list exposes foreign namespace ids to a scoped handle (Candidate B): **HOLDS**

§B.4: "a view may call `edges.list/register` on a resource it already holds a handle for." §B.1: edge is `(source_id, edge_type, target_namespace_id, target_local_id)`. §B.4's inherited restriction ("As A, plus" + "cannot… mint foreign ids") incorporates A §A.4's prohibition on deriving a foreign id. If `edges.list` returns edge metadata containing `target_namespace_id`, a single-resource scoped view derives a foreign ns id — a derivation channel A's model has none of. §B.4 does not specify whether EdgeId is opaque or exposes the full tuple; either the text must declare it opaque (in which case the view cannot use the edge for anything useful) or it exposes the target (leaking isolation). §B.4's own "cannot enumerate… derive foreign ids" guarantee is not maintained against its own `edges.list` surface.

---

## Fabrication check

No scenario was altered or invented. All five counterexamples quote candidate text verbatim or near-verbatim. FE-CE-007's paraphrase "derive foreign ids from a handle" attributes A §A.4 language to B via B's "as A, plus" phrasing; B.4's own summary uses "mint foreign ids" rather than "derive" — but the attack explicitly notes it is inherited from A.4, which is a valid interpretive reading, not a fabrication. The `edges.list → [EdgeId]` return type in §B.2 is not the same as "returns target_namespace_id"; the attack infers visibility from §B.1's edge structure. This inference is reasonable given B.4 says the view "may call edges.list" but never specifies what's returned per EdgeId. No fabrication found.

## Missed-check

No additional D10 counterexample with the same burden of proof was identified. One near-miss worth noting: in §A.5-S08 step 5, `execute{ref:h_D.descriptor.id}` passes a foreign `(ns_D, ref)` id as a typed action parameter to the runner adapter. §A.3 says "an adapter sees only its own namespace; there is no adapter-side API to name, target, or resolve a resource in another namespace." So the runner cannot act on `(ns_D, ref)` — it can only forward it or reject it. This makes `ref` opaque to the runner, forcing the coordinating view to pass data by-value in params, which contradicts "id + typed params" in the same step. This is a refinement of FE-CE-004's coverage problem (the cooperation channel is underspecified for the runner) rather than a new independent break; I do not raise a separate CE id.

## Self-contradiction check

FE-CE-003 and FE-CE-005 both identify contradictions *internal* to cand-A's own text (stated invariant violated by its own trajectory section). FE-CE-007 identifies a contradiction internal to cand-B's own extension section. No additional self-contradictions found in the candidates beyond those already captured by the five raised.

## Experiment

FE-CE-005 is the cleanest case for a model: it is purely structural — the absence of a replay marker in Envelope combined with S08's reactive invocation rule.

EXPERIMENT:
```python3
"""
Model: Does S08's step-5 invocation rule fire on a replayed envelope
under A's Envelope structure and subscribe semantics?
This models only the structural properties A states in §A.2 and §A.5-S08.
"""

Envelope = lambda rid, seq, ts, kind, schema, payload: {
    "resource_id": rid, "seq": seq, "ts": ts,
    "kind": kind, "payload_schema_id": schema, "payload": payload,
}

# Stream history for (ns_D, ref): an ArtifactReady emitted hours ago
history = [
    Envelope("ns_D:ref", 1, 100, "artifact", "ArtifactReady", {"path": "/a"}),
    Envelope("ns_D:ref", 2, 200, "status",   "ArtifactClosed", {}),
]

# §A.5-S08 step 5 rule, written as the trajectory describes:
# "h_D's stream shows the artefact ready → invoke execute"
def coordinating_view_rule(envelope):
    if envelope["kind"] == "artifact" and envelope["payload_schema_id"] == "ArtifactReady":
        return "EXECUTE"
    return None

# §A.2 subscribe(resource_id, from_cursor?) — default replays from start
def subscribe(from_cursor=None):
    events = list(history)  # replay
    live = []
    for e in events:
        action = coordinating_view_rule(e)
        if action:
            yield (e, action)

# Simulate: user pairs, host subscribes h_D, replays history
executions_fired = []
for envelope, action in subscribe():
    if action == "EXECUTE":
        executions_fired.append(envelope["seq"])

print(f"Seq numbers that triggered execute on replay: {executions_fired}")
print(f"Total executions fired by a single pair gesture: {len(executions_fired)}")
assert len(executions_fired) == 1, "Model: one replay event triggers execute"
# If the artifact were still the latest state, the same rule fires
# even though the user's intent was "view," not "re-execute."
print("CONFIRMED: Envelope has no is_replay field; the reactive rule cannot distinguish.")
```

This model proves only: given A's stated Envelope struct and subscribe semantics, a reactive view rule as described in §A.5-S08 step 5 fires on replayed events. It does not verify the product.

## Summary

All five counterexamples hold against the candidate text as written. The FE-CE-002 fix (open CapMap) is breached by S09's use of a specific literal string (FE-CE-003). S08's claimed coverage is structurally incomplete for spawned resources (FE-CE-004) and for replay-triggered side effects (FE-CE-005). The payload-type registry's scope is undeclared (FE-CE-006). Candidate B's edge surface leaks foreign namespace ids through a handle-scoped API (FE-CE-007). Designer must address all five before S08, S09, and S06 can be re-claimed as covered.

