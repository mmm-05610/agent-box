Dimension D01-order-dedup. Artifact under attack: `candidates/best.md` = `fece1121311d…` (the R011
integrated candidate). Both findings below are the artifact's own step tables contradicting the
artifact's own cursor rules, so they need no external standard to be wrong.

**FE-CE-025 — S01's subscription selects the live edge after the events it must render, so the
user's own typed input is never delivered.**

Exact sequence, in the order S01's own table writes it. (1) step 2: the adapter announces
`{local_id:"main", kind:"text.stream", capabilities:{cancel:"not_supported"}}`. (2) step 3: the
extension calls `h.invoke({ns_id, local_id:"main"}, "send", {text:"hello"})` and the host routes it
to the adapter handler. (3) step 4, as written: the adapter calls
`ns_handle.pump("main", "text.delta", "h")` and then `pump("main", "text.delta", "e")` — two
envelopes, so by §R11.3 ("the host assigns the next `Seq` in pump-arrival order") they take `seq=1`
and `seq=2`. (4) step 5, as written: the extension calls
`h.subscribe({ns_id, local_id:"main"}, from_cursor=h.cursor_resolve(…))` and "renders deltas".

Now apply the artifact's own cursor rules. §R11.2 defines `cursor_resolve(resource_id): Seq` as the
**"next `Seq` the resource will assign"** — after step 4 that is `3`. §R11.3's delivery rule is
"replays the log's retained envelopes with `seq >= c` in increasing `seq`, then continues live", so
with `c = 3` the replay filter admits `seq=3` and above and excludes `seq=1` and `seq=2`. §R11.1
picks the value of `c` per situation and assigns `cursor_resolve` to "the live edge of a
**pre-existing** resource"; the resource here is not pre-existing to this extension — the extension
announced it in step 2 and invoked it in step 3, so the creator's rule, "`0` for a just-spawned
resource's head", is the one that applies. The table therefore uses the pre-existing-resource rule
on a resource it just created, and the consequence is that the two deltas the user's own typing
produced are pumped, logged, and never rendered.

That this is the table's own intent, not a misreading, follows from its delete column: step 5's row
says "Delete cursor-stream: step 5 no ordered delivery", and step 4's row says "Delete pump: no data
enters stream, step 5 never receives" — i.e. the table asserts that step 4's data reaches step 5.
Under the artifact's own rules it does not.

Minimal form: one resource, announce, one invoke, two `pump` calls, then
`subscribe(from_cursor=cursor_resolve(id))`. The two pumped envelopes are never replayed. No second
resource, no reconnect, no cross-namespace access is needed, and the ordering is the artifact's own.

Invariant broken: §R11.3's replay guarantee combined with §R11.1's rule for choosing `c`. A
subscriber that attaches after the events exist and selects the live edge observes a log position
strictly above those events, so "the artifact's evidence renders what the user typed" is false while
the table's own delete column asserts the opposite.

Consequence: S01 (the text-only scenario, the artifact's headline case) fails at step 5; the
delete-consequence column becomes unverifiable because it presumes a delivery that cannot happen.
S02 does not fail the same way only because its subscription precedes its pump (step 3 subscribes,
step 4 pumps), which is the order S01 needed — the two tables disagree with each other.

**FE-CE-026 — S01 step 3 calls `handle_for`, an operation the interface block does not declare.**

Exact sequence. (1) S01 step 3 reads `h = handle_for(ns_handle.ns_id);` — a module-level function
that takes a namespace id and returns a `SubscriberScope`. (2) The artifact's only interface
declarations are §R11.2's `ResourceId`, `Seq`, `NamespaceHandle`, `SubscriberScope`, `InvokeOutcome`,
`Subscription`, `Envelope`, `RenderRow` and `CapMap`. `handle_for` appears in the artifact exactly
once: at that call site. No interface, method, or boundary rule introduces it; §R11.6's eight adapter
boundary rules do not mention it; `NamespaceHandle` exposes `announce`, `retire`, `teardown` and
`pump` only, and `SubscriberScope` exposes `directory_list`, `directory_lookup`, `cursor_resolve`,
`subscribe` and `invoke` only. (3) Nothing in the artifact states how an extension obtains a
`SubscriberScope` for a namespace it did not itself open, nor whether the handle is minted per view
or per namespace, nor whether obtaining it is scoped, authorized, or ref-counted. The other
scenarios hide this by writing `h.subscribe(...)` and `h.invoke(...)` on an `h` whose provenance is
never stated — S02, S03, S04, S05, S07, S11, S12 all do it.

Minimal form: read the artifact's interface block and count the declarations of `handle_for`. Zero.

Invariant broken: the artifact's claim that its evidence uses only its own typed surface. Every
scenario's extension-side step depends on a `SubscriberScope` instance, and the artifact never says
where one comes from; the only place the acquisition is even named is the one call to an undeclared
function. This is the same class as `FE-CE-018` (the operation that ends S04 was referenced but not
typed) and, unlike `FE-CE-018`, the missing operation is on the path of *every* scenario rather than
one.

Consequence per scenario: S01 step 3, S02 step 2, S03 step 1, S04 step 2, S05 step 3, S07 step 2,
S11 step 3, S12 step 3 all obtain the extension-side handle without a declared source. The
absence of a stated rule also leaves open the question the isolation guards care about — whether a
handle obtained for one namespace can be used against another — and R011's own `ScopeDenied` rule
(§R11.1: "`resource.ns_id == handle.ns_id`") presumes a handle whose mint step exists.

Regression replay on these bytes, as prose. `FE-CE-022`/`FE-CE-024`: unchanged by this attack — the
resource-lifetime log and the reference-release disposal are what make step 4's envelopes exist at
all, and this attack is precisely the case where they exist but are not selected. `FE-CE-023`:
untouched. `FE-CE-016`/`FE-CE-017`: the from-cursor selection rules are the ones S01 misapplies; the
rules themselves still close those two sequences, and S04/S08 still apply them correctly, which is
why the defect is an inconsistency between tables rather than a hole in the rule. `FE-CE-018`:
`pump` is unchanged in this round's attack and remains typed; if the integrator adds an operation to
`SubscriberScope` or `NamespaceHandle` to answer `FE-CE-026`, the interface surface moves and
`FE-CE-018` must be re-checked rather than inherited. `FE-CE-019`/`FE-CE-020`/`FE-CE-021`: untouched;
a different axis (rendering of `Result`). `FE-CE-002`: unchanged. `FE-CE-007`: stays OPEN on the
discarded alternative B's ledger; A has no `edges` mechanism and I neither repair nor reject it.

Disqualifier scan: no `execute(any)`, no omnipotent context, no arbitrary event bus; `payload:
unknown` remains opacity-by-design on a non-branching route. The first finding is an ordering defect
inside the artifact's own evidence; the second is an untyped path that every scenario walks.

What genuinely held: the sizing and identity of `Seq` as a per-resource log index (it is what makes
the S01 defect visible at all); the resource-lifetime retention rule and its single disposal point;
the four-variant rendering rule and its recursive walk; the same-namespace scoping rule once a
handle exists.
