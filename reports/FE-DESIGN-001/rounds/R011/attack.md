Dimension D09-splits-truth. Artifact under attack: `candidates/best.md` = `49df1e9345ab…`, the
saved bytes. R009's design bytes (`cf554e67…`) are not integrated; I note where they are silent,
but both findings below are present in both byte sets, so I anchor on the saved artifact.

**FE-CE-022 — the replay promise has no owner: the host either holds an unnamed, unbounded
per-resource envelope buffer, or `from_cursor` catch-up cannot deliver anything.**

Exact sequence. (1) Adapter opens `ns_A`, announces `job-7` (`kind:"acme.job"`), registers a typed
`status`; no view is attached yet. (2) The adapter calls `ns_handle.pump("job-7","progress",{pct})`
twenty times in remote-stable logical order. `pump` returns `void`; zero subscribers exist.
(3) A view later calls `h.subscribe((ns_A,"job-7"), from_cursor=0)` and, per the delivery rule,
expects "every stored envelope with `seq >= c`": §R8.5-S03 step 1 says "Delivers all stored then
live"; step 3 says the host "assigns seq, **stores** for next subscriber"; step 4 says the host
"**delivers stored** seq=21..35 then live". (4) For step 3 to deliver seq=1..20 after step 2,
some party must have retained twenty payloads across an interval in which **no** subscriber
existed.

Who can that be? Not the adapter: `pump` returns `void` (FE-CE-013 established the adapter never
receives the stamped seq), and §R8.3/§R8.8 tell the adapter it "does not compute `from_cursor`,
does not persist `recorded_ns_id`, or know what views subscribe with" — retaining and replaying a
backlog is a host role in every scenario table. Not the subscriber: `Envelope.seq` is described as
"the catch-up bookkeeping", a *position*, not payloads, and §R8.5-S03 step 2 shows the view
persists only `{local_id, recorded_ns_id, saved_last_seen}`. So the retained payloads can only sit
in the host.

But the candidate denies exactly that: §R8.1 "no extra host store, no host event store"; §R8.2
"No host event store, no host dedup, no host reorder"; the §R8.6 carried-and-still-dead list; and
the mechanism ledger row `host-event-store|removed|none — S03/S09/S10 are subscriber/adapter
burden`. The two statements cannot both hold, and both resolutions are defects:

(a) **The host does store.** Then a core mechanism is load-bearing and unnamed. Worse, no
retention rule exists anywhere in the candidate: nothing says when a per-resource backlog is
truncated, and a namespace ends only at `teardown`, so the buffer grows without bound in events
and bytes for the life of the connection. R003.8 admitted precisely this growth weakness for the
spawned set and FE-CE-009 retired that mechanism by arguing the same-namespace rule sufficed; the
same argument is unavailable here, because S03's "return hours later" catch-up *requires* retained
history.

(b) **The host stores nothing.** Then `subscribe(id, from_cursor=c)` cannot emit "every stored
envelope with `seq >= c`": S03 step 1 (full history), S03 step 4 (catch-up 21..35), S04 step 4
(the just-spawned head `seq=1` delivered to a subscriber attaching after the synchronous invoke
returned), S10 (a new view replays), and S09's `from_cursor = saved+1` catch-up all fail. The
user's own anchor T-Boring — submit, leave the page, come back hours later for progress and
artefacts — silently renders nothing.

Minimal form: one resource, one `pump` with no subscriber, then one `subscribe(..., from_cursor=0)`.
Delete every other feature and the contradiction survives.

Invariant broken: the candidate claims a delivery guarantee over *stored* envelopes and
simultaneously claims no store exists. "Which events exist for this resource" is a fact with two
contradicting owners — the delivery rule (host retains and replays) and the mechanism ledger
(nobody retains). This is the same class as FE-CE-012/014 (a mechanism described in the trajectory
but declared removed in the table), with one decisive difference: those were *vacuous* under an
arrival-index `seq`, whereas this store is **load-bearing** under `from_cursor` catch-up, so
"remove it" is not available as a repair.

Why earlier rounds missed it. The R007 directive did raise "one cursor declaration, two promises",
and the resulting fix changed only **how `c` is computed** (`0` / `cursor_resolve` / `saved+1`
plus the namespace guard). It never asked where the replayed envelopes come from. R006's D01 pass
removed host dedup and host reorder by arguing `seq` is host-assigned (hence an identity) and in
the same edit marked `host-event-store` removed; but the `from_cursor` rule that makes catch-up
work was introduced only in R007, which silently re-created that store's consumer.

Consequence per scenario: S03 (T-Boring) steps 1/3/4, S04 step 4, S09's catch-up line, S10's
replay line, S02's post-reconnect continuity. R009's additions (S05/S11 deletion tables, the
GenericWalk contract) never mention storage, so they carry the defect unchanged.

**FE-CE-023 — "this namespace is dead" has no owner: a link drop without `teardown` leaves the
directory advertising a live, cancelable resource indefinitely.**

Exact sequence. (1) Adapter opens `ns_A`, announces `job-7` with `CapMap{cancel:"supported"}`,
registers `cancel`; a view holds a live subscription and a rendered Cancel control. (2) The
service connection drops. (3) The adapter does not call `teardown`: §R8.3 item 7 only says "on
`retire`/`teardown`, stop pumping", and nothing requires teardown on a link loss — `teardown` is
an explicit adapter action carrying a reason string. (4) The remote job keeps running server-side.
(5) The view invokes `status` → `OutcomeUnknown` (host-owned); retry → `OutcomeUnknown` forever.
(6) `directory_list({kind:"acme.job"})` still returns `job-7` with `CapMap{cancel:"supported"}`,
and §R8.4's fallback renders an enabled Cancel from the registry. (7) `invoke(...,"cancel")`
returns `OutcomeUnknown`, never `CapabilityAbsent`; the CapMap is "informational" and the host
"never branches on a CapMap string", so nothing ever downgrades the advertised capability.

Invariant broken: §R8.2 makes the host authoritative for a resource's *existence* within a
namespace. Existence is only ever created by `announce` and retracted by the adapter's
`retire`/`teardown`. When the producing adapter is gone, no party can retract: honest absence is
expressed for *capabilities* (S11: `not_supported` + structural `CapabilityAbsent`) but has no
dual for *liveness*, so the directory asserts presence it cannot support, for as long as the
process lives. The user-visible effect is D09's own definition: the UI shows something that never
happened remotely — a live, cancelable job with no reachable service.

Minimal form: announce, then drop the connection without `teardown`; the Cancel control stays
enabled and the directory entry stays.

Consequence: S02 (the user is invited to approve/cancel while the link state is unknown), S09/S11
(the honesty posture is one-sided — absence is honest, presence may be a lie), S10 (a replaced
runner's namespace may linger and be re-paired).

Regression replay on these bytes, stated as prose rather than as a verdict block. FE-CE-018: `pump`
is typed and byte-unchanged; still closed. FE-CE-016/FE-CE-017: the cursor decision is unchanged
and still closes those exact sequences, but note that FE-CE-017's guard presupposes a retained
per-namespace backlog, so it *depends* on how FE-CE-022 is resolved. FE-CE-002: CapMap still
carries no behavioural authority; not reopened. FE-CE-019/020/021: a different axis (rendering of
`Result` in the fallback); this attack neither depends on nor reopens them. FE-CE-007: its evidence
names the discarded alternative B; A has no `edges` mechanism; I neither repair nor reject B, and
per guards E6/E7 its row stays OPEN on B's ledger.

Disqualifier scan: no `execute(any)`, no omnipotent context object, no arbitrary event bus; CapMap
carries no behavioural authority; `payload: unknown` is opacity-by-design on a non-branching route.
Both findings concern ownership of a fact, not a missing escape hatch.

What genuinely held: ordering and dedup semantics (`seq` as arrival index; the adapter dedups by
its own stable id), the same-namespace scoping rule, the typed `pump` contract, and §R8.4's
metadata-only rendering of an unknown envelope payload.
