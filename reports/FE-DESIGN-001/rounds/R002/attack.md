# Attack report — R002, dimension **D10-cross-module**

Replay first: the ledger carries no OPEN or DISPUTED rows, so there is nothing to replay verbatim. FE-CE-002 was CLOSED by making the capability map open with "no host-defined meaning"; FE-CE-003 below is the **same fix broken by a different mechanism** — the closure text itself is quoted against the new candidate — so it is raised as a fresh id, not a re-run of the closed angle.

## FE-CE-003 — the "idempotent-apply" string is a covert adapter→core channel (Candidate A)

**Exact sequence.** 1. Service S announces resource `(ns_S, pay)` with `CapMap{"idempotent-apply": supported}`. Per §A.2, capability names are "adapter-chosen strings with **no** host-defined vocabulary" — so S's author believes any name is inert metadata. In fact S used the string to label "our UI buttons are debounced". 2. User submits an action over `pay` via `action.invoke`; the host assigns stable `invoke_id` (§A.5-S09 step 1). Link drops before ack; host returns `OutcomeUnknown(invoke_id)`. 3. Reconnect. Per §A.5-S09 step 3: "If `supported`, the host re-sends the SAME `invoke_id` and the adapter guarantees no second execution; if `not_supported`, the host **refuses to auto-replay**". The host has read the string and switched its replay behaviour. 4. S's adapter has never heard of `invoke_id` semantics; it receives the re-sent call as an ordinary second request and executes the payment again.

**Invariant broken.** §A.2: "names are adapter-chosen strings with **no** host-defined vocabulary" and R.2/§R.2 (the FE-CE-002 fix): "The host defines no set of valid capability names". §A.5-S09 grants one specific string host behavioural authority. This is also the D10 hidden channel in its purest form: a shared key whose two endpoints (adapter writer, core reader) are governed by contradictory statements in the same document. Under the rolespec it is additionally an adapter-burden finding: an adapter author **must know a core internal** (which literal string toggles auto-replay) to write S09 correctly — exactly the case the roles require flagging.

**Minimal version.** Steps 2–4: drop the name-collision backstory (step 1's motive) and the sequence still double-executes for any adapter that sets the string; conversely, remove the host's branch on the string (make auto-replay unconditional or a separate typed protocol field) and the trap disappears.

**Consequence (S09, S06).** The user's explicit S09 outcome is "prevents double execution". Here the design's own safety mechanism is triggered by an inert-looking metadata label, so a service that used the word innocently silently opts into host re-dispatch of unacknowledged mutations: a second payment/second deploy. A truthful fix exists (a dedicated, typed, non-string negotiation of replay policy outside CapMap); pointing it out is the designer's job, not mine.

## FE-CE-004 — S08's created job resource has no subscription path in A's handle model

**Exact sequence.** 1. Per §A.5-S08 steps 1–5, the coordinating view holds `h_R = handle_for(ns_R, runner)`; `h_R` "carries **exactly one** `(ns_id, local_id)`" and "exposes no parent, no sibling, no enumerateNamespace" (§A.2). 2. The view invokes `execute{ref}`; the result/stream now involves a **newly announced resource** `(ns_R, job)` — step 6 says "progress rendered from `(ns_R, job)` envelopes". 3. The view cannot subscribe to `(ns_R, job)`: `subscribe` is reached only through a handle bound to that id; §A.4 gates handle minting on a user select/pair gesture, and no user gesture exists for a machine-created job. 4. The only alternatives are (a) an escape hatch letting `h_R` subscribe to siblings — contradicting §A.2's "exactly one", or (b) the runner multiplexes all job events onto `(ns_R, runner)`'s stream — which makes the `JobHandle` id in the result inert and contradicts step 6's `(ns_R, job)` wording, and (c) the job resource never exists, contradicting the adapter's natural `announce` behaviour.

**Invariant broken.** §A.2's handle is the sole cooperation primitive with exactly one id, user-gated mint; §A.5-S08 claims S08 "Covered". Both cannot hold for the standard submit→spawned-child pattern.

**Minimal version.** Steps 2–3: a runner that spawns any per-execution resource leaves the coordinating view unable to observe it; if the runner instead never spawns resources, step 6 is false as written. Remove the invoke's resource-creating behaviour and the trajectory passes — proving the hole is exactly there.

**Consequence (S08, and S03-by-composition).** The user either sees no progress, or must perform another pair gesture per execution for a resource they cannot see before creating it; and a returning page has no defined cursor route to `(ns_R, job)` because it cannot obtain a handle for it. A's headline answer to the round question ("two ns-local handles are enough") fails for dynamically created resources.

## FE-CE-005 — replay into a freshly paired handle fires yesterday's action (Candidate A)

**Exact sequence.** 1. `ArtifactReady` envelope, `(ns_D, ref, seq=5)`, was emitted hours ago. 2. User opens the pair gesture today (§A.4); host mints `h_D` and `h_R`; the new subscription's default is `from_cursor` at stream start (§A.2: `subscribe(resource_id, from_cursor?)`), so the host replays history — this is the mechanism S03 step 4 relies on. 3. The coordinating view's §A.5-S08 step 5 rule "h_D's stream shows the artefact ready → invoke execute" cannot distinguish replayed from live envelopes; `Envelope` carries no `is_replay` field (§A.2). 4. The view invokes `execute` on `h_R` for a stale event. No dedup applies: §A.5-S09 dedups envelopes by `(ns,resource,seq)` within one stream; it says nothing about action side-effects triggered by replay.

**Invariant broken.** §A.8: "S08 cooperation requires a user gesture rather than a standing automatic link (deliberate, to keep isolation structural)". The gesture triggers an *automatic, unrequested* execution derived from historical state.

**Minimal version.** Steps 2–4: delete step 1's staleness motive and the sequence still executes-on-replay for any view whose logic is "on envelope type E, invoke action". The only fix the design currently offers is per-view discipline it never states.

**Consequence (S08, S09).** Double execution with no link failure — the user gets a runner job they never asked for. This is the cross-module generalization of S09's "prevents double execution": replay state and live state are indistinguishable to the one component (the coordinating view) that both namespaces depend on.

## FE-CE-006 — the payload-type registry is a cross-namespace shared mutable key (Candidate A, scope undefined)

**Exact sequence.** 1. §A.2: "the host refuses to deliver any `payload_schema_id` whose type was **not registered**"; §A.7: "payload-type registration per kind". The registry's scoping is stated nowhere; it is keyed by a bare string. 2. Alpha adapter registers type `Image` = `{raw:bytes}` for kind `pi.image`. 3. Beta adapter registers type `Image` = `{url:string}` for kind `acme.thumbnail`. 4. Beta emits an envelope `payload_schema_id:"Image"`. Under the natural read of §A.2 (one global gate: "whose type was not registered"), the check passes; the coordinating view's typed deserializer binds Beta's `{url}` payload to Alpha's `{raw:bytes}` shape, or the host's "refuse" path silently starves Beta's stream because Alpha registered first with a different shape. Either branch: one service's registration decision constrains or corrupts another service's delivery.

**Invariant broken.** §A.1: "The host's only authority is identity, namespace isolation, subscription routing, and per-resource event ordering"; an adapter-visible global registry keyed by an uncoordinated string is a fifth authority and exactly the "shared arbitrary global state" S08's question forbids.

**Minimal version.** Steps 2–4: with either registration deleted, both services deliver correctly. So the defect is the shared key, not either adapter.

**Consequence (S06, S07, S08).** S06's stated question — "do identity, authorization scope, **caches** and events cross over?" — is answered yes by the type registry: Beta's legitimate payloads are mis-typed or refused because of Alpha. The design must either scope registration by `(ns, kind)` or declare `payload_schema_id` namespace-local; the current text lets a global registry be read as the contract.

## FE-CE-007 — edges.list on a scoped handle hands the extension foreign namespace ids (Candidate B)

**Exact sequence.** 1. A legitimate user pair registers edge `(ns_D, ref) —executed-by→ (ns_R, runner)`. 2. The *ordinary* single-resource view V for `(ns_D, ref)` — not the user, not a coordinating view — calls `edges.list((ns_D, ref))`, which §B.4 explicitly permits ("a view may call `edges.list/register` on a resource it already holds a handle for"). The result contains `target_namespace_id = ns_R` and the runner's local id: V has derived a foreign ns id **from its own handle**, which §B.4's own guarantee forbids ("An extension still cannot… derive foreign ids from a handle" is A §A.4 language B incorporates via "as A, plus"). 3. V now calls `edges.register((ns_D, ref), "watch", {ns_R, job-99}, relay)` for a runner-namespace resource the user never paired. 4. The gate is `authorize_incoming` (§B.2/B.3) — an **adapter**-side check, blind to which user or which pairing opened it; a runner adapter that accepts its own namespace's incoming references says accept. 5. Per §B.1 the core now "subscribes both and relays events along the edge": `job-99`'s envelopes (another concurrent job, possibly another party's within the same connected service) stream into V.

**Invariant broken.** §B.1: "Identity and namespace isolation are enforced at the edge-registration boundary". The boundary check exists, but the core's own edge store is an enumerable foreign-id source reachable from a scoped handle, and the authorizer is the target adapter, not the user — so isolation is a permission the two adapters can grant each other behind the user's back.

**Minimal version.** Steps 2–3: without `edges.list` (or if it redacted `target_namespace_id`), V could not form a foreign target and step 5 was unreachable; with it, no user gesture is needed. Remove one and it passes.

**Consequence (S06, S08, S10).** Un-paired cross-namespace event flow inside a connected service: the user's S06 result ("events do not cross over") fails through the very mechanism B built for S08, and S10's "running state stays explainable" degrades because relays the user never initiated keep running in the host (B's §B.8 already concedes post-view relay persistence, but not user-invisible relay *creation*).

## Disqualifier scan

No `execute(any)`, no omnipotent context, no free-form event bus in either candidate. However FE-CE-003 is the disqualifier-class pattern in substance: an untyped string key ("idempotent-apply") used as an escape hatch to convey core-changing semantics, smuggled in after the FE-CE-002 fix outlawed exactly that shape.

## What held under attack

A's two-independent-handles answer survives the plan's named objection (dual handles with no core pair record *are* structurally like two side-by-side windows; I could not manufacture a core-side channel from the mint alone) — it fails instead at the gaps above: spawned resources (004) and replayed triggers (005). B's self-assessed loss stands; 007 shows its edge store adds a live leak rather than merely more cost. S12, S11, S05 under D10: no cross-module channel found — single-resource views never touch a second namespace.
