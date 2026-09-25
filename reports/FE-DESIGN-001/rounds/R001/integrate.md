# R001 Integrator Report — D12-authority-boundary

## 1. Attack dimension used

D12-authority-boundary. The round attacked whether either candidate smuggles a service, model, harness, plugin-host, conversation, session, or run assumption into its core and presents it as neutral plumbing. No other dimension was taken up. The round is **not clean**: one holds row (FE-CE-002, minor) and one does_not_hold (FE-CE-001) against A; B held on D12 but carries structural coverage gaps S09 (open), S03/S06/S10 (partial) that are out-of-dimension notes for later rounds.

## 2. Per-counterexample resolution

### FE-CE-001 — REJECTED (does_not_hold; stays REJECTED, never deleted)

Verifier ruled it does not hold. The spine — "the core forces passive data into a conversation-shaped log because a value primitive is absent" — fails because `action.invoke → Result{registered type}` (§A.2) is a typed current-value return; a `git.diff` adapter can register a `read` action whose Result is the snapshot. The stale-superseded-on-return consequence is a rendering choice (replay-from-origin), not a core mandate. The experiment (verifier §6) confirms both legal strategies exist. Against the revised candidate the rejection holds unchanged: opening CapSet does not remove `action.invoke`, and the value path remains available. Row status: **REJECTED**. No further action.

### FE-CE-002 — CLOSED (was OPEN, verifier ruled holds)

**Invariant violated:** §A.1 claims the host has no content authority and ships no interpretation of a resource, yet §A.2 fixes `CapSet` as a **closed tagged union** whose members are `cancel`, `history`, `resume` — literally an interactive agent session's recovery features — and §A.4's core-builtin generic fallback view surfaces them as a "last-envelope summary" with an invokable-run affordance, presenting an unviewed read-only resource (e.g. `config.tree`) as a live invokable agent. This is a run/agent reading baked into core code while the core is billed as neutral.

**Exact change that makes the sequence impossible:**

1. **Open CapSet.** Replace the closed tagged union with an adapter-named open map: `CapSet = {capability_name: string → {supported | not_supported | unknown}}`. The host never defines what a capability is *for*; it only guarantees the three-state absence sentinel. This removes the `cancel/history/resume` session-recovery vocabulary from the host type. An adapter announcing `config.tree` declares `CapSet{"read": supported, "write": not_supported}`; there is no `resume` because the adapter never named one.

2. **Revise the generic fallback view.** The host-builtin fallback now renders: resource kind, the open capability map entries (as plain labelled name→state pairs, no icon affordance or invocation button), declared action names with typed parameter schemas, the last envelope's `payload_schema_id` (not its content), and a line: *"No dedicated view installed; data is available via subscribe."* This removes the run-shaped "invokable agent" presentation. The fallback no longer interprets "last envelope" as a "result" or "output"; it names it by schema.

With both changes, replaying the original attack sequence — (1) adapter announces `config.tree`; (2) generic view renders it; (3) core CapSet names `cancel/resume`; (4) config item gets agent strip — breaks at step (3): the core has no `cancel`/`resume` names, and at step (4): the fallback surfaces only the adapter-declared names. The run/agent reading cannot be produced by core code because the core has no vocabulary for it. S07 still passes: unknown content is not blank; it renders the declared schema and capability names truthfully.

**Where in the revised candidate this lives:** §R2 (Resource + Capability declaration ops), §R4 (Extension mechanism / fallback view). See best candidate below.

## 3. Regression replay

All existing ledger rows replayed against the revised candidate:

- **FE-CE-001** (REJECTED): The attack sequence relied on stream-as-sole-content. The revised candidate preserves `action.invoke → Result{registered type}` unchanged; the rejection still holds. **Pass (still REJECTED).**
- **FE-CE-002** (CLOSED): The attack sequence is step (1) announce `config.tree` → (2) generic view renders → (3) closed CapSet forces session-recovery vocabulary → (4) agent-strip on passive resource. Step (3) is blocked by open CapSet; step (4) is blocked by the revised fallback rendering. **Pass.**

No existing rows worsen.

## 4. Reduction — core mechanism dispositions

| mechanism | disposition | failure scenario if deleted | note |
|---|---|---|---|
| namespaces | **core** | S06 — colliding resource ids from two services cross in directory and routing | retained |
| resource-directory | **core** | S05 — domain module cannot be listed/looked-up without a session | retained |
| ordered-replayable-stream | **core** | S03 step 4 / S09 step 2 — no return-later catch-up, no host dedup/reorder | retained |
| capability-declaration (open map) | **core** | S11 step 2 — absence would be inferred from null, faking support; also FE-CE-002 fixed here | **modified from closed union to open map** |
| typed-action | **core** | S08 step 2 — no idempotent typed request without `execute(any)` | retained |
| generic-fallback-view | **core** | S07 step 2 — unknown artefact renders blank | **modified rendering: schema + names, no run-strip** |
| host-session-object | **removed** | none — no scenario requires it; S04 passes without it | removed in A.8, remains removed |
| host-turn/role-envelope-field | **removed** | none — its presence is the D12 disqualifier | removed in A.8, remains removed |

No further deletions possible: removing any remaining core mechanism breaks a named required scenario.

## 5. Unassigned work — explicitly deferred

- **S09 double-execution idempotency.** The host assigns `(namespace_id, action_seq)` to an `invoke` request, but whether the adapter deduplicates depends on adapter discipline. This is a partial coverage gap. The out-of-dimension note (D06/D01: adapter must know about a core-assigned field) is deferred to those rounds; I leave it as a stated partial, not silently closed.
- **B's structural gaps (S03/S06/S09/S10).** B wins D12 but has no core owner for S09. This is recorded as an open alternative, not a current design failure. If a future round proves adapter-side per-service event machinery is lower total cost than the centralized event plane, B's shape should be re-weighed. The observation that would rank them: D06 onboarding count of (seq/dedup/replay/cursor/retained-buffer) across N services vs. A's one centralized implementation + N thin adapters.
- **Generic fallback view rendering quality (D05).** What the fallback *shows* beyond a schema name is a D05 concern. I have made it truthful and non-blank (S07 invariant); rendering richness is not in scope here.
- **Extension burden (D07) for A's view resolver.** A's resolver is `{match, component}` + subscription handle. B's is `artefact-view.request` port + bind + msg_type registration. Which is lighter is a D07 question. Deferred.

## 6. Candidate A vs. B — ranking judgment

The rubric: winner is the candidate satisfying S01–S12 under smallest total cost (core + adapter + extension burden).

- **A (revised with FE-CE-002 fix):** 11/12 scenarios have core-level ownership; S09 is partial (host+adapter joint for double-execution). Adapter onboarding: six items, with the event/dedup machinery centralized and reused. D12: one minor hit, now fixed.
- **B:** 8/12 covered; S03/S06/S10 partial (adapter-only owner), **S09 open (no owner)** — a coverage gap that is a disqualifier-level failure under the rubric ("No 'later' slots"). D12: clean. But adapter onboarding: five items, of which three (capability-descriptor port, seq/dedup/replay, retained-state buffer) are the machinery A centralizes, re-implemented per adapter. Total complexity is A duplicated N times plus the per-adapter view ceremony.

**Conclusion:** A-with-fix is the stronger core. B's D12 cleanliness is a genuine insight (absence is structurally true without any core vocabulary) but its S09 open gap and relocated machinery make it a higher total-cost shape. B is kept as an open alternative; if D06/D01 rounds prove the event plane is not needed centrally for the actual service mix, B's minimalism may win on total cost. I do not blend them.

## 7. Honest outcome

I could not produce a revised candidate that fully closes S09's double-execution guarantee at core level without adding a host-assigned idempotency key that the adapter must respect — which is the D06/D01 finding deferred. S09 remains partial honestly. FE-CE-002 is genuinely fixed with the open-CapSet + revised-fallback change. FE-CE-001 remains REJECTED on sound grounds. The round is not clean and the controller should not read convergence.
