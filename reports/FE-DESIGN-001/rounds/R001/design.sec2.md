
# Candidate B — Typed connection broker, no default event plane

## B.1 Core bet

The host core is a **typed connection broker**: it authenticates module-declared ports, enforces service-namespace scoping, and wires declared port pairs — and holds **no** event store, cursor, replay, or resource directory. Absence of a capability is then structurally true (no port, no feature), which answers S11/S04 head-on; every "observable" is whatever some module offers as a typed stream port.

## B.2 Core concepts and operations

**Port.** `ports.declare(module_id, PortDescriptor{id, service_namespace, direction, kind ∈ {request,stream}, req_type?, resp_type?, msg_type})`. All `*_type` are registered concrete types; a port with no registered type is refused (blocks `execute(any)`). Authority: descriptor registry in host; message semantics in the offering module.

**Binding.** `ports.bind(requestor_module, service_namespace, port_id)` after host auth + namespace check; `ports.unbind`. Authority: host. Only declared pairs are live; there is no implicit broadcast.

**Request port.** `port.call(port_id, typed_req) → typed_resp`. **Stream port.** `stream.open(port_id) → StreamHandle{ onMsg(T), close() }`. The host does **not** assign seq, dedup, reorder, or retain history — those belong to whatever module offers the port.

**Namespace / scope.** A `service_namespace` tag on every port id; broker refuses cross-namespace binds unless explicitly granted. There is **no** host resource directory and **no** host cursor.

**Lifecycle.** A port dies with its offering module; a `StreamHandle` closes on `close()` or when either endpoint unmounts. The broker holds bindings, not data.

## B.3 Boundary rules

A service adapter must translate its protocol into concrete typed request/stream ports and must register every message type. "Does not support this" is expressed by **not declaring the port**: there is no cancel request port ⇒ no `port.call` target exists. But a UI that must *show* a disabled control needs to know whether something is "absent because unsupported" vs "absent because not loaded"; B cannot read that from binding state alone, so truthful absence at the legibility layer forces a **capability-descriptor port** the adapter must offer and maintain — i.e. B reintroduces, per adapter, the very `CapSet` A centralises. This is relocation, not elimination (see B.8).

## B.4 Extension mechanism

A view module declares `artefact-view.request` ports answering `describe(artefact_type) → ViewDescriptor`; the host keeps a **builtin default provider** answering unknown types with a generic descriptor view, so S07 never renders blank (without it, B would fail the "faking/blank for unknown" disqualifier — so this provider is admitted to the core, a mild materialisation B would rather not carry). Selection: query declared `artefact-view.request` ports in scope, first responder wins. Guarantees: provider **absent** → default provider renders descriptor; provider **throws** → error descriptor; provider **unmounted mid-operation** → its stream ports unbind and close, and because the broker retains no data, re-subscription recovers only if the *offering* module (typically the long-lived adapter) kept state. B cannot claim more than that.

## B.5 Scenario trajectories (owner per step)

**S01 — text-only agent.** 1. `namespaces`-tagged service adapter declares `text.request` (send) + `text.stream` (reply) ports (adapter). 2. View binds both; `port.call(text.request,"hi")`, `onMsg(TxtChunk)` (extension). No profile/workspace/tool exists anywhere. Covered.

**S04 — submit/progress/result, no chat.** 1. Adapter declares `job.submit.request`, `job.progress.stream`, `job.result.request` — three concrete typed ports, **no** message type resembling a chat turn. 2. View calls and renders each. D12 answer for B: **strongly yes** — the core has no event plane and no chat shape at all. This is B's clearest advantage over A.

**S11 — no cancel/history/resume.** 1. Adapter declares no `*.cancel.request`, no history port, no resume port. 2. Absence at transport is automatic (nothing to call); but the UI needs the adapter's `capability-descriptor.request` port (B.3) to *say why*. Covered with the caveat that the explanatory port is per-adapter burden.

**S05 — browse without session.** 1. Config module declares `config.read.request`; git module declares `git.diff.stream`; no execution/agent port exists or is bound (adaptation). 2. View binds read ports only. Covered — trivially, since B has no session concept to begin with.

**S02 — Pi via Ordessa.** 1. Ordessa adapter declares typed ports for conversation/tool-event/approval; 2. a conversation view binds them; 3. approvals call `approval.request`. Mapping mirrors A but every stream's ordering/replay is the **adapter's** own job. Covered via adaptation.

**S03 — return later for progress+artefacts.** 1. Page binds `job.progress.stream`; 2. page destroyed → `StreamHandle.close()`, broker holds nothing (host). 3. If the **offering adapter** (long-lived) retained a progress buffer and exposes `job.progress.replay.request`, a returning page re-binds and pulls the buffer (adapter). This *works only because the adapter reimplemented cursor/replay* — the host provided zero. 4. If the offering module was itself a UI extension that unmounted, there is **no** retained state and the trajectory breaks. Status: **partial**, owner = adapter, not core.

**S06 — two services, same id.** 1. Port ids carry `service_namespace`; broker refuses cross-namespace binds (host). 2. But caches are per-module with no core directory, so **cache bleed is prevented only by adapter discipline**, not by a host invariant. Status: **partial**.

**S07 — special artefact, view not installed.** 1. Unknown `artefact_type` query → **core default provider** returns generic descriptor (core). Covered.

**S08 — resource + execution cooperate; replaceable.** 1. Coordination is by binding to two modules' ports by id; replacing the execution module changes which `port_id` answers. No shared global state. Covered.

**S09 — reconnect dup/out-of-order.** 1. Broker provides no seq/dedup. 2. The **adapter** must number messages and the view must dedup, per service, with no host guarantee. Two producers for one slot and out-of-order arrival have no core arbiter. Status: **open** at core level (would require the adapter to rebuild A's event plane).

**S10 — extension crashes/uninstalls while remote runs.** 1. Its stream port unbinds/closes (host). 2. Remote continues in the adapter; a new page recovers **only if** the adapter kept state (adapter). 3. If the offering module was the crashed extension, running state has no owner. Status: **partial**, owner = adapter, and fails if the offering module is non-resident.

**S12 — remove an "optional" module.** 1. Its ports unbind; independent modules' bindings unaffected (host). 2. A coordinator binding to the removed port simply gets no responder → must handle missing binding. Covered (core+adaptation).

## B.6 Delegation / deletion experiments

See B.9. The deletion test that hurts B is the *reverse*: remove the hypothetical **host event store** (which B does not have) → S03/S09/S10 stay "working" only if some module already reimplemented it, proving the capability was relocated, not removed. B's genuinely core-removable item is its per-module cache discipline (no failing scenario ⇒ pushed to adapter, recorded as the source of B's partial status on S06).

## B.7 Second-service onboarding cost

To attach a **service with a different protocol**, an implementer must write: (1) typed request/stream ports for every operation *and* every observable; (2) register each message type; (3) a capability-descriptor port so absence is legible (B.3); (4) **its own** seq/dedup/replay/cursor for `job.progress.stream`-style ports (S03/S09); (5) a **retained-state buffer** for post-unmount recovery (S03/S10). Five items, of which (3)(4)(5) are the machinery A centralises, re-implemented **per adapter**. To add **only a view**, an implementer must write a `artefact-view.request` provider — more ceremony than A's single `{match, component}` resolver because the view must declare ports and the host must bind them.

## B.8 Honest cost and non-goals

B wins the D12 question most cleanly for S04/S11 (no core concept is shaped like chat). It loses the structural cluster: **S03 partial, S06 partial, S09 open, S10 partial**, all because the event plane has no core owner and lands on adapters. That is the plan's predicted failure: B is either **smuggling A into every adapter** (relocating, per B.7 items 3–5, so total complexity is not lower — it is A duplicated N times plus worse) or **lacking an owner** for return-later and reconnect. Largest second-order cost: because "the offering module must stay resident" is an implicit correctness requirement, B quietly assumes an always-on subscription ledger in the adapter layer — the thing it claimed to refuse. Non-goals: B deliberately carries no ordering, replay, or resource identity, so it cannot make guarantees that depend on them.

## B.9 Mechanism disposition

<<<FE-MECH-START>>>
port-declaration-registry|core|S01 step 1 — without registered typed ports there is no wireable, typed connection|R001/B §B.6
namespace-scope-check|core|S06 step 1 — same-id ports from two services would cross-bind|R001/B §B.6
bind/authorize|core|S08 step 1 — replacement module could not be re-bound by id|R001/B §B.6
builtin-default-view-provider|core|S07 step 1 — unknown artefact renders blank (disqualifier if removed)|R001/B §B.4
host-event-store|removed|none at core — S03/S09/S10 consequence relocated to adapters|R001/B §B.5/B.8
host-resource-directory|removed|none at core — S05/S06 handled by port ids + adapter cache discipline|R001/B §B.8
<<<FE-MECH-END>>>

## B.10 Proposed scenario status (pending verifier)

<<<FE-SCENARIO-START>>>
S01|covered|adaptation|B §B.5 text.request + text.stream ports|R001/B §B.5-S01
S02|covered|adaptation|B §B.5 typed ports per chain element|R001/B §B.5-S02
S03|partial|adaptation|B §B.5 needs adapter-retained replay buffer|R001/B §B.5-S03
S04|covered|core|B §B.5 submit/progress/result ports, no chat|R001/B §B.5-S04
S05|covered|adaptation|B §B.5 read ports only, no session concept|R001/B §B.5-S05
S06|partial|core|B §B.5 namespace-scope on binds; caches uncared|R001/B §B.5-S06
S07|covered|core|B §B.4 builtin default view provider|R001/B §B.5-S07
S08|covered|extension|B §B.5 bind to two ports by id|R001/B §B.5-S08
S09|open|unassigned|B §B.5 no core owner for dedup/reorder|R001/B §B.5-S09
S10|partial|adaptation|B §B.5 recovery needs resident offering module|R001/B §B.5-S10
S11|covered|adaptation|B §B.5 no port + capability-descriptor port|R001/B §B.5-S11
S12|covered|core|B §B.5 unbind removed ports|R001/B §B.5-S12
<<<FE-SCENARIO-END>>>

