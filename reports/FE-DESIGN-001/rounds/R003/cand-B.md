# Candidate B — DEMOTED this round under D08-reduction (planner-authorized resolution of FE-CE-007)

## R003.B.1 Core bet as B claimed

B's core was a typed reference graph with persistent, host-stored cross-namespace edges and a host-mediated relay path, so cooperation survives view lifecycle without a re-pair gesture.

## R003.B.2 The D08 reduction that ends B

B's **signature** mechanism is the persistent cross-namespace edge + relay. Test: delete it — which required scenario fails? S08 is the only scenario B's edge serves, and A's R003.5-S08 trajectory (two ns-local handles + user pair + spawned grant + live-default) already satisfies every S08 step, including step 6 job observation and step 7 replaceability. The mechanism ledger's `cross-namespace-edge|removed|none — S08 passes with two ns-local handles + spawned grant` row records exactly this. Therefore B's core primitive has **no failing scenario**, and per the role contract ("a mechanism with no failing scenario must be removed") B's core, when minimized, collapses into A. B is not a structurally distinct viable core; it is A plus a defect.

## R003.B.3 The two second-order reasons demotion is correct

(1) **FE-CE-007 is a live isolation break, not a cost.** `edges.list` returns core-stored target ids to a scoped handle, enabling adapter-authorized, user-less relay edges into a foreign namespace. Removing the leak while keeping standing cross-ns relay requires the host to resolve a foreign id for a scoped handle — precisely the data-authorized (not user-authorized) mint that spawned-grant was chosen to avoid in A. There is no revision that keeps B's benefit and closes FE-CE-007.

(2) **B's claimed advantage (edge persistence survives view lifecycle for auto-reconnect) does not hold.** Host-minted per-connect `ns_id` makes any stored `target_namespace_id` stale on runner replacement, so the persistent edge cannot auto-reconnect to the right resource; the user must re-pair either way — identical to A. B therefore buys nothing that A lacks, at higher total cost (a standing edge store + relay path the rubric charges to core) and a security defect.

## R003.B.4 Onboarding / boundary delta vs A

B's adapter burden is not lower than A's (an author must additionally maintain edge invariants and the relay contract), and B's extension burden is not lower (an author must reason about standing edges). On the rubric's total-cost axis (core + adapter + extension-author burden), B strictly loses to A on every scenario B claims to win, and B fails the isolation invariant via FE-CE-007.

## R003.B.5 Position and resolution

B is demoted from the candidate set this round (planner instruction: "fix FE-CE-007 or explicitly demote B"). This is not a softening of FE-CE-007 — the counterexample is accepted as fatal and is the reason B is withdrawn. B returns only if a future required scenario demands standing automatic relay without user initiation; no current S01–S12 does.
