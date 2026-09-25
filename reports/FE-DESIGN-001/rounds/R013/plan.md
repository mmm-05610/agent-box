CANDIDATES: A
DIMENSION: D11-long-run

Single candidate. A fork into a second core is still not mandatory: every finding below is a
repair inside A (rows the tables omitted, a rule the artifact never stated, one rendering rule, one
notation), and none of them questions A's structure — namespaced directory, per-resource cursor
stream with a resource-lifetime log, subscriber-chosen `from_cursor`, adapter-owned open CapMap and
typed actions, no content authority. D11-long-run is the right dimension because the round's own
subject is what happens to a long-lived resource and to the log behind it: retention, release, the
capacity lever, and what a view is told when the log stops being there.

THE QUESTION THIS ROUND MUST SETTLE
Execute the artifact's twelve step tables through one model of the artifact's own rules, and settle
four things: (a) does every step's claimed outcome actually happen in the order written — including
whether the prerequisites the step needs (a registered action, an announced resource, a minted
scope) exist in the table at all; (b) after an adapter observes a service loss, which catch-up
branch is reachable, given that the same artifact makes `teardown` mandatory on that observation and
makes `teardown` dispose the logs; (c) when the log is released — the only way the artifact offers to
bound memory — what does a live subscriber learn, and what does `invoke` return against a resource
that no longer exists; (d) can a view honestly render every state the API can return, including
`ExplicitAbsent` and a CapMap value of `unknown`.

Core bet (A, one sentence): a namespaced directory of cursor-streamed resources with same-ns scoped
subscriber handles, a subscriber-chosen single `from_cursor`, a resource-lifetime log, adapter-owned
open CapMap and typed actions, and a typed `pump`, holding no content authority.

Strongest objection against A: its step tables are its only executable evidence and they were never
executed. Run them and three of the twelve fail against the artifact's own rules, six omit
prerequisites they depend on, the `unknown` capability and both `ExplicitAbsent` return paths have no
rendering, and the memory lever is the one operation with no subscriber-visible effect. An artifact
whose evidence does not run, and whose release path is silent, is a claim rather than a design.

Centre-of-gravity scenarios: S04 (retire after the view is watching), S08 (pair delivery), S09
(observed loss versus catch-up), S11 (unknown capability), S03/S10 (long-run catch-up and
re-handoff). S05 and S11's deletion-complete tables must not be weakened.

Boundary discipline: necessity is argued by deletion, not by "it prevents an over-reach". No scenario
may be altered and no requirement raised without a named `SCENARIO_CHANGE_PROPOSAL:` line.
`FE-CE-007` stays OPEN on B's ledger, is not repaired and not rejected, and does not block A.
Per the round's correction, "the core cannot by itself judge an agent's run state" is **not** a
defect: the core consumes authoritative declarations only, and missing or uncertain declarations must
be shown truthfully. No repair may move business semantics into the core to make a default view look
better; the fixes for absent/unknown states belong in the fallback view's rendering rules.
