#!/usr/bin/env python3
"""R012 candidate patch: apply the FE-CE-025/026/027 repairs and the reviewer's two demands.
Exact-anchor replacements only; anything not listed here stays byte-identical."""
import io, sys, re

SRC = "candidates/best.md"
OUT = ".tmp/R012.best-candidate.md"

s = io.open(SRC, encoding="utf-8").read()
orig = s
applied = []

def rep(old, new, label, count=1):
    global s
    n = s.count(old)
    if n != count:
        print("ANCHOR FAIL (%s): expected %d, found %d" % (label, count, n)); sys.exit(1)
    s = s.replace(old, new, count)
    applied.append(label)

# ---------------------------------------------------------------- R4: §R11.2 types
rep('''  cursor_resolve(resource_id: ResourceId): Seq;      // next Seq the resource will assign
  subscribe(resource_id: ResourceId, from_cursor: Seq): Subscription;''',
'''  cursor_resolve(resource_id: ResourceId): Seq | ExplicitAbsent; // next Seq, or absent if not announced
  subscribe(resource_id: ResourceId, from_cursor: Seq): Subscription | ExplicitAbsent;''', "R4.sig")

rep('''type CapMap = Readonly<Record<string, "supported" | "not_supported" | "unknown">>''',
'''type CapMap = Readonly<Record<string, "supported" | "not_supported" | "unknown">>

interface ViewHost {
  // The extension-facing seam. The host mints one SubscriberScope per (view, ns_id) and
  // hands it over only here; the only precondition is that ns_id is open in this host
  // process, and the scope confers no permission beyond resource.ns_id == ns_id.
  open_scope(ns_id: string): SubscriberScope | ExplicitAbsent;
}''', "R4.viewhost")

# ------------------------------------------------- R3: §R11.3 delivery + ExplicitAbsent
rep('''`subscribe(id, from_cursor=c)`
replays the log's retained envelopes with `seq >= c` in increasing `seq`, then continues live.''',
'''`subscribe(id, from_cursor=c)`
replays the log's retained envelopes with `seq >= c` in increasing `seq`, then continues live; it
returns `ExplicitAbsent` if `id` is not currently announced.''', "R3.delivery")

# ------------------------------------------------- R1: §R11.3 incarnation rule (FE-CE-027)
rep('''  (this replaces the previous "after the subscription is closed, envelope is dropped", which
  discarded exactly the envelopes catch-up is defined to deliver).''',
'''  (this replaces the previous "after the subscription is closed, envelope is dropped", which
  discarded exactly the envelopes catch-up is defined to deliver).
- **One incarnation per `local_id` (FE-CE-027).** `retire(local_id, reason)` disposes the log **and
  burns the `local_id` for that namespace's lifetime**: a later `announce` with the same `local_id`
  in the same namespace raises `LocalIdBurned`, and `cursor_resolve` / `subscribe` on a `local_id`
  that is not currently announced returns `ExplicitAbsent`. A resource's identity is therefore
  immutable and one incarnation long, so a persisted cursor can never be silently re-pointed at a
  different incarnation's stream: either the same `local_id` still resolves and its `seq` space is
  continuous, or it does not resolve at all and the view renders "this resource is gone — re-pair or
  open its successor" instead of a catch-up that renders as complete. `teardown` restarts the id
  space with the namespace, so a re-opened service may reuse its `local_id`s.''', "R1.incarnation")

# ------------------------------------------------- R2: §R11.3 honest cost lever
rep('''  adapter controls: it can `retire` and re-announce, or expose a `read` snapshot instead of a long
  stream.''',
'''  adapter controls: it can `retire` the resource and announce its successor under a **new**
  `local_id` (the view then sees a genuine disappearance and appearance rather than a silent skip),
  or expose a `read` snapshot instead of a long stream.''', "R2.lever")

# ------------------------------------------------- R5: §R11.6 item 9 (host duty)
rep('''## R11.6 Adapter boundary rules (8 items)''',
'''## R11.6 Boundary rules (adapter items 1–8, host item 9)''', "R5.heading")

rep('''no-op and `pump` after `teardown` raises `NamespaceGone`; **8. on observing that its connection to
the service is lost, call `teardown(reason)` for that namespace.**''',
'''no-op and `pump` after `teardown` raises `NamespaceGone`; **8. on observing that its connection to
the service is lost, call `teardown(reason)` for that namespace.**
**9. (host duty, FE-CE-026) the host mints a view's `SubscriberScope` only through
`ViewHost.open_scope(ns_id)` — one scope per (view, ns_id), returning `ExplicitAbsent` if that
namespace is not open in this host process. A scope is never discoverable from another scope, never
shares another namespace's contents, and confers no permission beyond
`resource.ns_id == scope.ns_id`. There is no other way to obtain a scope.**''', "R5.item9")

# ------------------------------------------------- R6: §R11.5 self-containment
rep('''Extension selection, the absent→fallback / throws→error-boundary / uninstall→host-closes-scope
guarantees, and the pair gesture are unchanged from §R8.4; the pair gesture still records nothing.''',
'''**The four rules that sentence deferred (now stated here, because the artifact must not depend on a
section it does not contain):**
- **Extension selection.** A view claims a `payload_schema_id` when it mounts. The generic fallback
  serves a resource whose schema no view currently claims. If two mounted views claim the same
  schema, the most recently mounted one renders it; the host records nothing about the choice, so
  unmounting the winner silently returns the resource to the fallback or to the other claimant.
- **absent → fallback.** `CapabilityAbsent(x)` and a missing action are rendered by the fallback as
  described in the four-variant table above; absence is never an error state and never a blank pane.
- **throws → error boundary.** A view that throws out of its render path is contained to that view's
  region: the resource's other rows and controls survive, and the fallback is not substituted for the
  pane.
- **uninstall → host closes scope.** When a view unmounts or is uninstalled, the host closes every
  subscription made through that view's scopes and releases the routing references. Resource logs
  are untouched (§R11.3 retention); nothing about the view is recorded in the core.
- **pair gesture.** A user gesture that opens scopes in two namespaces (S08). It records nothing in
  the core; the view holds both scopes, and the only permission each confers is
  `resource.ns_id == scope.ns_id`.''', "R6.selfcontained")

# ------------------------------------------------- R7: §R11.7 preamble claim
rep('''**S05** and **S11** carry the deletion-complete tables; every other scenario carries its ordered
step sequence, per-step owner, and the deletion consequence for each core step it uses.''',
'''All twelve scenarios are step tables: each step carries an actor, the operation, what is
authoritative for it, and the user-visible failure if the mechanism that step uses is deleted. None
of them is a compressed chain, and none of them refers to a section outside this artifact.''', "R7.preamble")

# ------------------------------------------------- R8: S01 rows
rep('''| 3 | Extension (user types) | `h = handle_for(ns_handle.ns_id)`; `h.invoke({ns_id,local_id:"main"}, "send", {text:"hello"})` | Host routes to adapter handler | Host/Adapter | Delete typed-action: execute(any) disqualifier |''',
'''| 3 | Extension (user types) | `s = host.open_scope(ns_handle.ns_id)`; `s.invoke({ns_id,local_id:"main"}, "send", {text:"hello"})` | Host mints the scope, then routes to adapter handler | Host/Adapter | Delete typed-action: execute(any) disqualifier. Delete the `open_scope` seam: the extension has no way to obtain a scope at all (FE-CE-026) |''', "R8.s01step3")

rep('''| 5 | Extension | `h.subscribe({ns_id,local_id:"main"}, from_cursor=h.cursor_resolve(…))`; renders deltas | Subscription active | Extension | Delete cursor-stream: step 5 no ordered delivery |''',
'''| 5 | Extension | `sub = s.subscribe({ns_id,local_id:"main"}, from_cursor=0)` — the resource was announced by this extension one step ago, so the just-created rule applies; step 4's two deltas are seq 1 and 2 and `from_cursor=0` admits both, then the subscription continues live; renders deltas | Subscription replays seq 1..2, then live | Extension | Delete cursor-stream: step 5 no ordered delivery. Delete the just-created rule (subscribe with `cursor_resolve` instead): c=3, so the two typed deltas are pumped, retained and never replayed (FE-CE-025) |''', "R8.s01step5")

# ------------------------------------------------- R9: S03 step 4 delete line
rep('''| 4 | Extension | Return: `recorded_ns_id=="ns_A" == current_ns_id` → `h.subscribe(job_id, 21)`. Host delivers stored seq=21..35 then live. | Catch-up rendered | Host/Extension | Delete same-ns rule: step 4 would need cross-ns access |''',
'''| 4 | Extension | Return: `recorded_ns_id=="ns_A" == current_ns_id` → `h.subscribe(job_id, 21)`. Host delivers stored seq=21..35 then live. | Catch-up rendered | Host/Extension | Delete §R11.3's resource-lifetime retention: step 4 has no entries left to replay. Delete the same-ns rule: step 4 would need cross-ns access |''', "R9.s03step4")

# ------------------------------------------------- R10: six compressed chains -> step tables
start = s.index('**S06 two services, same id.**')
end = s.index('**S05 — config/Git browse, no session (deletion-complete).**')
TABLES = '''**S06 two services, same id (T-Isolation).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Adapter A | `namespaces.open({service:"runner"})` → `ns_R` | Host | Delete **namespaces**: step 2 has no scope, and both services share one key space |
| 2 | Adapter B | `namespaces.open({service:"data"})` → `ns_D` | Host | Delete **namespaces**: as step 1 |
| 3 | Adapters A and B | both `announce({local_id:"job-1", kind:"acme.job", …})` and `action.register(ns, "acme.job", "cancel", Params, Result)` | Adapter | Delete **per-(ns,kind,action) registry**: the second registration overwrites the first's types, so a later `invoke` is typed by the wrong schema (FE-CE-006 reopens) |
| 4 | Extension | `s_D = host.open_scope(ns_D)`; `s_D.subscribe((ns_R,"job-1"), 0)` → `ScopeDenied` | Host | Delete the **open_scope** seam: no scope, no step. Delete the **same-ns rule**: the cross-namespace subscription succeeds |
| 5 | Extension | `s_D.invoke((ns_R,"job-1"), "cancel", {})` → `ScopeDenied` | Host | Delete the **same-ns rule**: a foreign namespace's action is invoked and the resource is not in this view's scope |
| 6 | Extension | `s_D.directory_list({kind:"acme.job"})` → only `ns_D`'s `job-1` | Host | Delete **directory scoping by namespace**: foreign ids leak into the listing and step 4's denial becomes avoidable |

**covered (core).**

**S07 special artefact, no view installed (T-Unknown-Schema).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Adapter | `announce({local_id:"plot-1", kind:"acme.plot", payload_schema_id:"acme.plot.v1", capabilities:{export:"supported", share:"not_supported"}})` | Adapter | Delete the **open capability map**: `share` must be inferred from a failure, i.e. fake-support |
| 2 | Extension | `s = host.open_scope(ns_id)`; `s.directory_list({kind:"acme.plot"})` renders `plot-1` | Host | Delete the **open_scope** seam: the view holds no scope (FE-CE-026) |
| 3 | Host (selection) | no mounted view claims `acme.plot.v1` → the generic fallback serves the resource | Host | Delete the **extension selection** rule: an unclaimed schema has no defined renderer, so the pane is blank |
| 4 | Fallback | renders the kind, the registered action names with their CapMap values (`export: supported`, `share: not_supported`), and `payload_schema_id` | Host | Delete **generic-fallback-view**: the user cannot see which action exists or which was declared unsupported |
| 5 | Extension | `s.invoke((ns_id,"plot-1"), "read", {})` → `Result`, rendered as recursive walk rows; if no `read` was registered → `CapabilityAbsent(read)`, rendered as an explicit row | Adapter (content) / Host (route) | Delete **typed-action**: step 5 has no way to obtain a value, and absence cannot be expressed structurally |
| 6 | Fallback | the opaque payload renders as `opaque: acme.plot.v1, no view installed` | Host | Delete the **recursive walk**: an unrenderable payload blanks the pane instead of naming itself |
| 7 | Extension | a `plot.v1` view mounts later → it now claims the schema, and the fallback stops serving that resource | Extension | Delete the **extension selection** rule: two claimants have no defined winner, and unmounting the winner has no defined effect |

**covered (core).**

**S08 resource + replaceable runner (T-Pair).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Adapter | `namespaces.open({service:"runner"})` → `ns_R`; `announce({local_id:"runner-1", kind:"acme.runner", capabilities:{execute:"supported"}})`; `action.register(ns_R, "acme.runner", "execute", ExecuteParams, SubmitResult)` | Adapter | Delete **typed-action**: step 5 has no route and no result type |
| 2 | Adapter | `namespaces.open({service:"data"})` → `ns_D`; `announce({local_id:"data-1", kind:"acme.data", …})` | Adapter | Delete **namespaces**: step 7's handoff becomes cross-namespace access |
| 3 | Extension | user gesture "pair" → `s_R = host.open_scope(ns_R)`, `s_D = host.open_scope(ns_D)` | Host | Delete the **pair gesture** rule: no second scope exists and every later step is unreachable |
| 4 | Extension | `s_R.subscribe((ns_R,"runner-1"), from_cursor=s_R.cursor_resolve((ns_R,"runner-1")))` | Extension | Delete **cursor_resolve**: subscribing from `0` replays the runner's history and re-fires `execute` on stale envelopes (FE-CE-005 reopens) |
| 5 | Extension | `s_R.invoke((ns_R,"runner-1"), "execute", {job:"…"})` → `SubmitResult{job_resource:{ns_R,"job-7"}}` | Adapter (content) / Host (route) | Delete **typed-action**: step 6 has no spawned id to subscribe to |
| 6 | Extension | `s_R.subscribe(r.job_resource, from_cursor=0)` — invoke-spawned head | Host | Delete the **just-spawned rule**: the head envelope pumped inside the invoke is lost (FE-CE-016 reopens) |
| 7 | Adapter | `ns_D` pumps `ArtifactReady`; it is delivered to the view through `s_D` | Adapter | Delete the **pair gesture** rule: the data service has no route to this view, and a core edge would be needed instead |
| 8 | Adapter | runner replaced → `ns_R.teardown("superseded")` | Host | Delete **namespace teardown**: stale runner handles keep routing, and `s_R` operations never report `NamespaceGone` |
| 9 | Extension | re-pairs: `host.open_scope(ns_R')`, then steps 4–6 against the new namespace | Extension | Delete the **recorded_ns_id rule**: step 9 would resume a cursor against the dead namespace (FE-CE-017 reopens) |

**covered (core).**

**S09 drop, unknown outcome, duplicate, out-of-order (T-Unknown).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Extension | `s.invoke(id, "execute", {…})` | Host | Delete **typed-action**: there is no route for the command |
| 2 | Host | the link drops mid-command → the host returns `OutcomeUnknown`; it stores no token and no retry policy | Host | Delete the **four-variant outcome rendering**: `OutcomeUnknown` becomes a data row or vanishes, i.e. uncertainty is hidden (FE-CE-003/FE-CE-019 reopen) |
| 3 | Extension | renders "outcome unknown — not confirmed" with Retry; the user decides whether to invoke again | Extension | Delete the **not-current invariant**: a stale success stays on screen while the command's fate is unknown |
| 4 | Extension | the re-invoke is a fresh user gesture; the host issues no automatic resubmit | Host | Delete **never-auto-resubmit**: a reconnecting host replays the command and it executes twice |
| 5 | Adapter | on reconnect, dedups by its own protocol-level stable event id and pumps in remote-stable logical order | Adapter | Delete **adapter-side dedup**: the same remote event reaches the subscriber twice (FE-CE-013 reopens) |
| 6 | Extension | if it persisted a position whose `recorded_ns_id` still matches, catches up from `saved_last_seen+1`; on a full reconnect (new `ns_id`) from `0` | Extension | Delete the **recorded_ns_id rule**: the post-reconnect window is skipped and the catch-up renders as complete (FE-CE-017 reopens) |
| 7 | Host | if the persisted `local_id` no longer resolves (retired while the view was away) → `ExplicitAbsent`, rendered as "this resource is gone" | Host | Delete the **one-incarnation-per-local_id** rule: a re-announced `local_id` silently re-points the cursor at a new stream and the gap is invisible (FE-CE-027 reopens) |

**covered (adaptation).**

**S10 extension crash while remote runs (T-Handoff).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Extension | the view mounts and subscribes through `host.open_scope(ns_R)` | Host | Delete the **open_scope** seam: no subscription exists (FE-CE-026) |
| 2 | Host (boundary) | the view throws out of its render path → contained to that view's region | Host | Delete the **error boundary**: the exception replaces the host surface and the user loses the whole pane |
| 3 | Extension | the view unmounts or is closed → the host closes every subscription made through its scopes and releases the routing references | Host | Delete **uninstall→host-closes-scope**: subscriptions leak and the dead view keeps receiving |
| 4 | Adapters | resources keep running; `ns_D`/`ns_R` remain authoritative for their kinds and logs | Adapter | Delete **§R11.3 resource-lifetime retention**: a later view has nothing to replay, so the remote state is unobservable even though it is still running |
| 5 | Extension | a new view mounts, calls `host.open_scope(ns_R)`, subscribes `from_cursor=0` (or `saved_last_seen+1` if it persisted a matching `recorded_ns_id`) | Host / Extension | Delete **cursor-stream-log**: step 5 replays nothing although the job ran the whole time (FE-CE-022/024 reopen) |
| 6 | Extension | renders the replayed history; there is no core pair record to reconcile | Extension | Delete the **no-pair-record** rule: the core would have to reconcile two views' competing claims about the same run |

**covered (core).**

**S12 remove an "optional" core domain module (T-Compose).**

| Step | Actor | Operation | Authoritative | Delete-mechanism → user-visible failure at this step |
|---|---|---|---|---|
| 1 | Adapter | `ns_R.teardown("service removed")` | Host | Delete **namespaces/teardown**: the removed service's resources and logs linger in the directory |
| 2 | Host | `ns_D` is unaffected: its directory entries and logs are untouched | Host | Delete **namespace scoping**: one teardown would dispose the other service's logs |
| 3 | Extension | a mounted `plot.v1` view is uninstalled → the host closes its scopes and the fallback resumes serving `acme.plot.v1` | Host / Extension | Delete the **extension selection** rule: an uninstalled view keeps claiming the schema and the pane stays blank |
| 4 | Extension | the user's paired view is removed → other single-resource modules are untouched | Host | Delete the **no-pair-record** rule: removal would require the core to reconcile paired state it deliberately never recorded |
| 5 | Adapter | the runner returns and is re-opened → `namespaces.open` mints a new `ns_id`; views re-pair with a fresh gesture and replay from `0` | Adapter / Host | Delete the **new-ns_id-on-reopen** rule: a stale `recorded_ns_id` would resume a cursor against the dead namespace |

**covered (adaptation).**

'''
s = s[:start] + TABLES + s[end:]
applied.append("R10.sixtables")

# ------------------------------------------------- R11: extension author cost section
anchor = '## R11.8 Reduction and the standing dead list'
COST = '''## R11.7b What an extension author must implement (the classified cost)

The core declines content authority, so these duties are the extension's. They are listed here
because §R11.5, §R11.6 and the scenarios depend on them, and because they are the price of the
posture, not an oversight:

1. **Persist a cursor triple** per subscription it wants to resume: `{local_id, recorded_ns_id,
   saved_last_seen}`. The host stores nothing about a view.
2. **Choose `from_cursor` correctly**: `0` for a resource this extension just created or an
   invoke-spawned head, `cursor_resolve` for the live edge of a pre-existing resource,
   `saved_last_seen + 1` while `recorded_ns_id` still matches. FE-CE-025 is exactly this choice made
   wrongly, and FE-CE-027 is what happens when the identity check is under-specified.
3. **Handle `ExplicitAbsent`**: a persisted `local_id` that no longer resolves means the resource was
   retired; render "gone", never a complete-looking catch-up.
4. **Close subscriptions on unmount**, so the host can release routing references.
5. **Render all four `InvokeOutcome` variants**, including the not-confirmed state with its Retry.
6. **Register a typed `read` (value) or `status` (state) action** for anything the extension wants
   inspectable in the default view. Without it the view truthfully says the value cannot be obtained
   (§R11.9) — this is the largest single cost the design imposes on adapters.
7. **Declare result schemas by field name only**; no shape may be chosen to suit a renderer (§R11.5).

'''
s = s.replace(anchor, COST + anchor, 1)
applied.append("R11.extcost")

# ------------------------------------------------- R12: §R11.9 honest-cost refresh
s = s.replace('''Second: the log's memory is proportional to a resource's total emitted events, and only the
producing adapter can bound it.''',
'''Second: the log's memory is proportional to a resource's total emitted events, and only the
producing adapter can bound it — now by retiring the resource and announcing a successor under a new
`local_id`, which is honest (the view sees a disappearance and an appearance) but does mean that
bounding memory is visible to the user.''', 1)
applied.append("R12.honestcost")

io.open(OUT, "w", encoding="utf-8").write(s)
print("applied %d edits: %s" % (len(applied), ", ".join(applied)))
print("bytes: %d -> %d" % (len(orig), len(s)))
