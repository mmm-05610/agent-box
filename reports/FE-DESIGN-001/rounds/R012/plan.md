CANDIDATES: A
DIMENSION: D01-order-dedup

Single candidate. The last clean dimension was D09-splits-truth (R011, and R011 is not a clean round
— it closed three majors — so D09 is not barred either), and D01 has not been used since R007. More
to the point, this round's subject is *ordering*: when a subscription is established relative to the
events it is supposed to deliver, and whether the artifact's own step tables respect its own cursor
rules. That is D01's axis, not D09's ownership axis. A fork into a second core is still not
mandatory: both findings are repairs inside A (a scenario's step order and one missing operation in
the interface), and neither questions A's structure.

THE QUESTION THIS ROUND MUST SETTLE
Take each scenario table in the artifact and replay its steps strictly in the order the table writes
them, using only the cursor rules the same artifact states (§R11.1's choice of `c` and §R11.3's
`seq >= c` replay filter). Does every step still deliver what its own delete-consequence column
claims it delivers? If a table subscribes with the live edge *after* the events it is meant to
render, or calls an operation the interface block never declares, the artifact is broken by its own
rules and no amount of prose in the surrounding sections repairs it — a step table is the artifact's
own executable evidence.

Core bet (A, one sentence): a namespaced directory of cursor-streamed resources with same-ns scoped
subscriber handles, a subscriber-chosen single `from_cursor`, a resource-lifetime log, adapter-owned
open CapMap and typed actions, and a typed `pump`, holding no content authority.

Strongest objection against A: its scenario tables are its only executable evidence, and they were
carried forward as prose summaries and then expanded without being replayed against the cursor rules
they depend on. One table already violates the artifact's own §R11.1/§R11.3 (typed input is pumped
before the subscription selects the live edge, so the replay filter starts above it), and one calls
an operation the interface block does not declare. An artifact whose evidence does not run is a
claim, not a design.

Centre-of-gravity scenarios: S01 (ordering of pump versus subscribe), S04 and S08 (the
just-spawned-head rule), S03 (catch-up and its delete line). S05, S11 and the six scenarios whose
trajectories are compressed rather than tabulated must not be weakened: completeness of their step
evidence is this round's second subject.

Boundary discipline: the necessity of any mechanism is argued by deletion, not by "it prevents an
over-reach". No scenario may be altered and no requirement raised without a named
`SCENARIO_CHANGE_PROPOSAL:` line. `FE-CE-007` stays OPEN on B's ledger and is never converted by a
verdict. `FE-CE-018` was re-checked last round because `RenderRow` changed; if the interface surface
moves again this round, it must be re-checked again rather than inherited.
