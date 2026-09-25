ROUND PLAN — FE-DESIGN-001 / R006 / planner

CANDIDATES: A

Single candidate is authorized, not a shortcut: A has survived structural attacks (FE-CE-002..011 closed against A-lineage), so the "no candidate has yet survived an attack → two cores" trigger does not fire. Reviving B is barred by the R006 directive (B is demoted, carried as history only) and by the rubric (B's S08 is matched by A's ns-local handles + spawned grant; no required scenario forces standing cross-ns relay). The only OPEN structural break, FE-CE-007, is B's, and I am not moving it: it stays OPEN against demoted B.

DIMENSION: D01-order-dedup

Rotation justification: the immediately previous recorded round, R004, ran D08-reduction and was clean (holds_major=0, new_major=0, four closures) — D08 is barred. D01 has never been used (R001=D12, R002=D10, R004=D08) and it is the sole dimension that directly attacks the ONLY uncovered scenario. S09 is `partial` (the convergence gate needs every row covered); the attacker must construct duplicate, reordered, interleaved and late events on reconnect, plus two-producers-for-one-slot, against the A claim "host dedups/reorders by (ns,resource,seq); fixed never-auto-resubmit; adapter-owned idempotency". Directive surface 2 (who holds the cursor, who owns dedup, page-destroyed-while-remote-runs) is tested here; D02 (S10 force-close) and D09 (host-vs-adapter truth split) remain in reserve if D01 is clean.

THE QUESTION THIS ROUND MUST SETTLE: Does an executable model experiment prove that A's per-handle spawned/accessible set is load-bearing — i.e. that a same-namespace subscription-scope rule with no accumulated set passes S08's observed trajectory (yes/no)?

PER-CANDIDATE — A
Core bet (2 sentences): The host core is a namespaced directory of `(ns_id, local_id)` resources, each with a seq-ordered replayable event stream, an adapter-owned open capability map, per-namespace typed actions, and resource-scoped handles whose accessible set is exactly `{primary} ∪ spawned`. This round's bet is narrower and falsifiable: that the `spawned` set is the minimal scope mechanism — no same-namespace subscription rule both keeps S06 isolation and lets S08 reach the host-observed Result job id.

Strongest objection (established, DISPUTED, not softened): FE-CE-009 — the per-handle accessible-set accumulates per-handle state that A's own §R4.8 admits is an unbounded-growth weakness, yet the R003 attack's same-ns subscription-scope rule passes S08's steps 4–6 without accumulating any set; A's "it bounds subscription to host-observed Result ids (provenance)" answers safety, not necessity, which the directive debt #1 calls out as 答非所问.

Evidence that settles it this round: the designer must emit one `EXPERIMENT:` fenced python3 block encoding two models — Model1 = per-handle `spawned` set; Model2 = same-ns subscription-scope rule, no set — and run S08's exact steps 4–6 plus a same-ns sibling probe through both. Model2 passing S08 turns FE-CE-009 into an established minimality break → reduce the set (or escalate to I via a SCENARIO_CHANGE_PROPOSAL drafted by the designer, not silently); Model2 failing keeps it and closes the row. Prose restating "provenance bound" is not evidence.

SCENARIO COVERAGE — CENTRE OF GRAVITY
- S09 is the sole `partial`; it MUST become covered or be shown genuinely joint. This is the D01 attack's target and the only real gap to the "S01–S12 all covered" gate. Owner must be named core+adapter explicitly, never "later".
- Owner-less row: the directive reports `without_an_owner=1` — one scenario independently judged feasible but lacking a named owner in the ledger. The designer must assign a concrete owning module per step or honestly downgrade that row to `open`; leaving a claimed row ownerless is a contract failure.
- S05 static read: T-Static must obtain a current config/git value WITHOUT inventing cursor/subscribe/replay just to read a passive value (directive surface 1); if the stream model is the only read path, that is a real burden finding, and FE-CE-001's rejected conclusion must be re-played against the current bytes, not assumed settled.

REQUIRED ARTIFACTS (non-negotiable): three concrete onboarding trajectories with ordered event sequences and per-step owner — T-Pi (S02: announce + subscribe-live + approve/send typed actions), T-Boring (S03/S04: submit, from_cursor=0 history, leave page, return via cursor.resolve), T-Static (S05: no session, directory.list + a current-value path) — each with a minimal real type/signature sketch and one executable `EXPERIMENT:` model. Each experiment proves only the model it encodes, never the product. Adapter-burden counts (new service must-write operations and core internals it must know) are reported per trajectory, not as prose.

I am not opening a new competitor and not re-scoring; the shape above is the round.

Notes: the planner does not move counterexamples, so no FE-LEDGER / FE-SCENARIO / FE-MECH blocks are required of this phase. I intentionally did not select D08 (its clean rotation ban) even though FE-CE-009 is minimality-shaped; per the directive that debt is repaid by the designer's mandated deletion experiment (a concrete artifact), so D08 stays barred while the debt is still forced open.
