FE-CE-007 is attached to the discarded B alternative; the saved candidate A has no edges mechanism, and this phase does not move it. Verdicts on FE-CE-028..037 follow.

FE-CE-028 — holds. Candidate R11.3 says `subscribe(id, from_cursor=c)` delivers a resource's retained envelopes and `pump` "routes the envelope to every live subscriber", while R11.5's pair gesture says "the view holds both scopes, and the only permission each confers is `resource.ns_id == scope.ns_id`". S08 step 7 asserts "it is delivered to the view through `s_D`", but no step calls `s_D.subscribe((ns_D, "data-1"), ...)`. A scope is not a subscription, so the view receives zero envelopes.

FE-CE-029 — holds. R11.4 item 8 mandates teardown as soon as an adapter observes connection loss, and R11.3 says `teardown(reason)` "disposes every log in the namespace and force-closes every subscriber handle scoped to it". S09 step 6 still offers the branch "if it persisted a position whose `recorded_ns_id` still matches, catches up from `saved_last_seen+1`". After the forced close no such handle or log exists, so that branch is unreachable.

FE-CE-030 — holds. R11.6 item 4 requires `action.register(ns_handle.ns_id, kind, action_type, params_type, result_type)`, and its closing paragraph says "x absent from `action.register` → `invoke(…, x, …)` returns structural `CapabilityAbsent(x)`". S01 step 3 invokes `"send"`, but no S01 row registers it. S04 step 2 uses the bare handle `h` with no preceding `open_scope` row to mint it.

FE-CE-031 — holds. R11.3 says `subscribe` "returns `ExplicitAbsent` if `id` is not currently announced". S04 step 4 calls `subscribe(r.job_resource, from_cursor=0)` for a job resource from the step 2 `SubmitResult`, but no row announces `job-7` before or after the spawn. The just-spawned head rule and the not-announced rule contradict.

FE-CE-032 — holds. R11.2 declares `CapMap = Readonly<Record<string, "supported" | "not_supported" | "unknown">>` and `open_scope`/`directory_lookup` return `ExplicitAbsent`, but R11.5's four-variant table renders only `Result`, `CapabilityAbsent`, `ScopeDenied`, and `OutcomeUnknown`. Neither `ExplicitAbsent` nor the `unknown` CapMap value has a rendering rule.

FE-CE-033 — holds. R11.5's GenericWalk uses "list<record>", `opaque`, and recursion, while R11.7b item 7 says "Declare result schemas by field name only". No declaration grammar defining these kinds and shapes is ever stated, so the totality and recursion claims are not decidable from the artifact.

FE-CE-034 — holds. R11.5 extension selection says "the most recently mounted one renders it; the host records nothing about the choice, so unmounting the winner silently returns the resource to the fallback or to the other claimant". That is exactly the silent swap the invariant forbids.

FE-CE-035 — holds. R11.5 says "A view claims a `payload_schema_id` when it mounts" with no namespace key, while R11.6 item 4 registers actions by `ns_id` and item 9 scopes a view's handle by namespace. The claim is unnamespaced and is one namespace's schema can therefore be claimed by another namespace's view.

FE-CE-036 — holds. R11.7b prices seven extension-author duties, but the adapter's ordering, dedup, and teardown duties of R11.6 items 3, 5, and 8, and the retire-then-announce memory lever, are costed nowhere. The burden answer is one-sided.

FE-CE-037 — holds. R11.2's `Subscription` declares only `onNext(h)` and `close()`. R11.3 says `retire(local_id, reason)` disposes the resource's log, but no termination signal is sent to live subscribers, R11.5 has no ended-state rendering row, and `InvokeOutcome` has no `ExplicitAbsent` variant for a retired resource. A frozen last state stays labelled current.

FABRICATION_CHECK: none — every quoted passage matches candidates/best.md as inlined, and the carried reproduction pointer `_pt/model/run.repro.txt` is present in the ledger.
CONTRADICTION_CHECK: none new beyond the rows themselves; each row already names its own gap or self-contradiction.
MISSED_CHECK: none — no new obvious break in the attacked dimension was found beyond the ten OPEN rows; FE-CE-007 is not against the saved candidate A.
