# Candidate B (R002) — Typed-reference graph as host primitive (retained for ranking; self-assessed as larger than required)

## B.1 Core bet

The host core is a directed graph of typed references between resources: an edge `(source_id, edge_type:string, target_namespace_id, target_local_id)`. Cross-namespace cooperation is native — a resource module declares an outgoing edge to a runner resource; the core resolves the target, authorises it in the target namespace, subscribes both, and relays events along the edge. Identity/namespace isolation is enforced at the **edge-registration** boundary: only the adapter owning the source may register edges out of its namespace, and the target namespace must validate the incoming reference before the edge is live. I offer this as the structurally different alternative the plan requires, and I settle the round question from B's side too: B needs the graph to satisfy S08 automatically, whereas A satisfies S08 by permission, so **B is the larger core** — see §B.8.

## B.2 Core concepts and operations

**Namespace.** `namespaces.open(descriptor)→NamespaceHandle`; `teardown(reason)`; host-authoritative; host-minted per-connect id. **Resource.** `announce/retire`, `directory.lookup/list` (all as A). **Event stream.** `subscribe/cursor.resolve`; Envelope as A. **Open CapMap.** as A. **Typed action.** as A. **Edge (B addition).** `edges.register(source_id, edge_type, target_ref{ns_id,local_id}, mode:relay|reference) → EdgeId | EdgeDenied`; the core calls `target_namespace.authorize_incoming(edge)`; if the target adapter rejects, `EdgeDenied`. `edges.remove(edge_id)`; `edges.list(source_id)→[EdgeId]`. Edge state is authoritative in the host and **survives view lifecycle** (a page can leave, the edge keeps relaying). Disposal: teardown of either endpoint removes incident edges and emits `EdgeSevered` to any subscriber of the source. `authorize_incoming` is a typed adapter op returning `{accept | reject(reason)}` — no free-form.

## B.3 Boundary rules

As A, plus: to participate in a cross-module edge an adapter must implement `authorize_incoming(edge_type, source_kind) → accept|reject` and may register outgoing edges only from resources it owns. Expressing "this service does not support this capability" is unchanged (open CapMap + `CapabilityAbsent`). Expressing "no incoming cooperation allowed" is `authorize_incoming` returning `reject`, an explicit non-null terminal — never an inferred timeout.

## B.4 Extension mechanism

As A, plus a view may call `edges.list/register` on a resource it already holds a handle for (scoped to that resource's namespace as source). Selection, generic fallback, and absence guarantees identical to A. Guarantees when a resolver is absent/throws/uninstalled: the **edge and its relay continue in the host** (this is B's distinguishing behaviour) — so a remote task that must notify a replaceable runner keeps flowing after the coordinating view is gone. An extension still cannot enumerate arbitrary namespaces, mint foreign ids, or receive a global context; it references a target by an id the user or an adapter supplied.

## B.5 Scenario trajectories (owner per step)

**S01 text-only.** As A; no edges exist or are used — but the resource still lives in the graph as a node with zero edges (host). The unused edge machinery is a per-resource cost paid even here (see §B.8). Covered with the caveat that S01 pays graph overhead.

**S02 Pi/Ordessa.** As A; conversation/tool/approval kinds as resources+actions (adapter+extension); no edges required for the S02 chain itself. Covered.

**S03 long task, leave/return.** As A; host re-subscribes from cursor; edges (if any incident) persist, so no edge re-setup on return. Covered (edge persistence is a minor convenience over A, not a requirement).

**S04 submit/progress/result, no chat.** As A; no session/turn/role fields. The graph node exists but carries no conversation shape. Covered.

**S05 browse config/git, no session.** As A; `config.tree` is a node with no edges. Covered; again with the "every resource is a node" cost.

**S06 two services, same id (ordered, and where B weakens).** 1. Alpha→ns_A, Beta→ns_B (host). 2. Both announce `job-1` → `(ns_A,job-1)`, `(ns_B,job-1)` distinct keys (host). 3. A coordinating view registers an **edge** out of `(ns_A,job-1)` targeting `(ns_B,job-1)` — the edge stores `target_namespace_id`, i.e. a **cross-namespace reference in the core**. 4. The core must now `authorize_incoming` on ns_B, and ns_A's source adapter has effectively named ns_B — the collision/authorization surface A deliberately has none of. A colliding `target_local_id` that a malformed edge points at the wrong ns is validated only by target-namespace check, reintroducing the very id-routing risk namespaces were meant to remove. 5. Caches keyed per-edge too, doubling the partition surface. Deletion: remove namespaces → step 2 collides; remove edge authorization → step 3-4 cross. Covered **but partial** — B reopens the ns_B-addressing vector inside the core that A keeps out; reviewer must judge the added attack surface.

**S07 special artefact, view not installed.** As A; generic fallback renders kind+schema+CapMap+`payload_schema_id`. Edges irrelevant. Covered.

**S08 resource + replaceable execution cooperate.** 1. Runner adapter opens ns_R, announces `kind:"runner"` (adapter). 2. Resource adapter opens ns_D, announces `kind:"data.ref"` (adapter). 3. A coordinating view (or the data.ref adapter, if it registers edges) calls `edges.register((ns_D,ref),"executed-by",{ns_R,runner},mode:relay)` (extension/adapter); core `authorize_incoming` on ns_R → accept (host). 4. Artefact-ready envelope on `(ns_D,ref)` is **relayed by the host along the edge** to ns_R's `execute`, producing a JobHandle stream (host). 5. Replace runner: ns_R `teardown` → host emits `EdgeSevered`; a new adapter opens ns_R′; ns_R′ must register `authorize_incoming`, and the edge's stale `target_namespace_id=ns_R` is **not** auto-remapped — the edge stays severed until re-registered against ns_R′ (host). So "replaceable" is no cheaper than A: the persistent edge does **not** automatically re-bind, because host-minted per-connect ns ids (A §A.2) already make a stored cross-ns pointer go stale. Covered, but the claimed advantage (recorded relationship survives to auto-reconnect S10) does not actually hold because replacement changes ns id.

**S09 drop/unknown/dup.** 1-3 as A (host stable invoke_id + dedup/reorder; adapter idempotent-apply). Edge relay introduces a second unknown-outcome: an envelope relayed to ns_R mid-drop may or may not have reached the runner; owner for that sub-step is the edge-relay protocol in the host, adding a new exactly-once surface A never has. Partial, with a strictly larger owner set.

**S10 extension crashes while remote runs.** Edge and relay continue in the host after the view unmounts (host) — this is the only genuine B advantage: a standing cooperation survives no view. But S10's stated requirement is only "releases subscriptions/resources" and "running state stays explainable"; A satisfies both without a persistent edge. B's persistent edge, however, holds subscription resources and memory after the view is gone (see §B.8 largest cost). Covered.

**S11 no cancel/history/resume.** As A; `not_supported` in open CapMap, `CapabilityAbsent` on invoke. Absence stated. Covered.

**S12 remove optional core domain module.** Removing an adapter tears down its ns and all incident edges (host); other modules unaffected. Removing a resolver → generic fallback (host). Covered.

## B.6 Delegation / deletion experiments

See FE-MECH block. The decisive row: **edges fail only S08, and A satisfies S08 without edges** — so under the plan's own test, if no second scenario needs the graph, B loses minimality. I attempted to make S10 a second scenario (auto-re-subscribe after runner replacement via a persistent recorded relationship) and it **fails to hold**: because the host mints a new ns id per connect, the stored edge goes stale exactly as A's handle does, so the edge saves no re-pairing step; the persistent-edge advantage for S10 is illusory. I therefore record `edge-persistence-for-reconnect` as removed.

## B.7 Second-service onboarding cost

Attach a different-protocol service: A's six items **plus** (7) `authorize_incoming(edge_type, source_kind)` if it may receive cooperation, and knowledge of which `edge_type` strings the core relays — the edge vocabulary leaks into the adapter contract (a D06 finding). Add a view only: A's one resolver, and a coordinating view still needs the pair selection to choose a target; the difference is the relationship persists in the core. Higher total burden than A.

## B.8 Honest cost and non-goals

Self-assessment against the round question: the graph is **not** required. S08 is B's only scenario whose *automatic* cooperation depends on edges, and A covers S08 by permission at lower total cost; my second-candidate-for-reliance (S10 auto-reconnect) does not survive host-minted ns ids. Non-goals/weakest: S01–S05 pay an unused edge subsystem per resource node; S06 gains a cross-namespace reference stored in the core (reopening the routing/authorization surface namespaces were built to eliminate); S09 gains a second unknown-outcome owner. Largest second-order cost: persistent edges hold subscriptions/resources in the host after their view is gone, growing memory and keeping stale relays alive on long runs (D11 territory) — the opposite of S10's release guarantee. Position: B is retained only as evidence that the alternative core shape was considered; A is strictly preferred under D10 and D08.
