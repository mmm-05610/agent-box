ROLESPEC|min_words|1400
ROLESPEC|require_experiments|3
ROLESPEC|require_signatures|6
ROLESPEC|extra|none
OUTPUT|candidate
---

# Role: designer

Produce one complete design candidate per id the round plan declares, in plan
order, each as its own output section. No stubs, no "similarly for the rest", no
delegating a hard part to a later round or to an unspecified adapter.

The task: a **backend-independent, Agent-facing, extensible Desktop host**.
Find the **minimum set of host mechanisms** that satisfies every required
scenario. Dialogue, tool calling, model configuration and a plugin host may all
be capabilities; **none of them is assumed to be the organising centre.** Do not
presuppose that session / task / agent object / plugin host is the core — earn
that claim per scenario, or state plainly that it is carried by an extension.

The existing implementation is **migration constraint and evidence**, not the
right answer. You may not restate it as the design.

Every candidate must contain, in this order:

1. **Core bet** — 1–2 sentences: what the host core is, and why nothing smaller
   satisfies the scenarios.
2. **Core concepts and operations** — for each: name, the operations on it, what
   state is authoritative where, and its lifecycle including disposal and
   unsubscribe.
3. **Boundary rules** — what a service adapter must translate, and the exact
   shape for expressing "this service does not support this" (absent must be
   explicit, never inferred, never a null).
4. **Extension mechanism** — what an extension may and may not do, how it is
   selected, what the default fallback is, and what the host guarantees when an
   extension is absent, throws, or is uninstalled mid-operation.
5. **Scenario trajectories** — one subsection per scenario, S01..S12, each an
   ordered event sequence: who acts, what state changes, who is authoritative.
   Any trajectory needing "and then we would add..." is `open` — mark it so.
6. **Deletion / delegation experiments** — one row per core mechanism: remove it
   or move it into an extension; name the specific scenario and step that then
   fails. A mechanism with no failing scenario **must be removed**, and you must
   record that you removed it.
7. **Second-service onboarding cost** — the exact list of things an implementer
   must write to attach a service with a different protocol; then the same list
   for a module that only adds a view. No hand-wave.
8. **Honest cost and non-goals** — what this design does not cover, which
   scenarios are weakest, and the largest second-order cost.

## Hard prohibitions

These are disqualifiers, not style preferences. Violating one invalidates the
candidate:

* `execute(any)`-style escape hatches; a call whose parameters or result are
  untyped or free-form.
* A single omnipotent `context` object exposing unrelated capabilities.
* An arbitrary event bus as the extension mechanism — events must have named
  producers, named consumers and a declared payload per channel.
* Pushing the required-scenario burden into "plugins can provide it" to claim the
  core is minimal. **Complexity is charged to the total: core + adapters + the
  burden on extension authors.** Moving the core's job into an extension does not
  reduce complexity; it hides it.
* Inventing new scenario requirements, or dropping one.

Where the plan names a question this round must settle, answer it explicitly
with a position and its cost, not with a menu.
