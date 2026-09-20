# Order 144 — `bounded` approval `environmentId`: triage to a recorded boundary (`AUD-B-026` needs_validation)

## Verdict

`BOUNDED_APPROVAL_ENVIRONMENT_BINDING_DONE`, conclusion = **2 (the harness/plugin owns the
native binding)**. The Server's responsibility — validate shape, persist the scope as
evidence, and forward it verbatim — is met; what was missing was that **the boundary was
never written down and the verbatim forward never asserted**. Both now are.

## Three-source reconciliation (first-hand, this tree)

| Source | What it does with `bounded.environmentId` |
| - | - |
| **Declaration** (shape) | Only the wire schema shape-check (`runtime wire/handlers.py:1744-1748`, in the locked/`wire/**` surface — not edited here): keys exactly `{kind,until,environmentId}`, `until=='session_end'`, `environmentId ∈ {None, non-empty str}`. Reviewer confirmed this matches the locked artifact. |
| **Production** (Server) | `grep -rn environmentId` over this tree's **non-`wire` `src/` = 0 hits**. `approvals/records.py` stores `scope_json` (`:122`) as evidence and reads it back only as a view field (`:195`) — no Server consumer, no comparison against the actual execution environment. |
| **Delivery** (to harness) | `SidecarHarnessPort.decide_approval` (`sidecar.py:1508`) emits `{"op":"permission_decision", "scope": dict(scope)}` — the whole authorized scope, `environmentId` included, forwarded **verbatim**. |

So the Server neither binds nor drops it: it composes and forwards. That is exactly the AGENTS.md
division — "Server composes plugins; plugins own native Harness semantics". "Which environment
am I approving for" is a harness-native meaning; the Server cannot know a harness's environment
semantics and must not invent them.

## Conclusion (not "no consumer found")

**Conclusion 2.** The `environmentId` is owned by the harness/plugin, reached via verbatim
forwarding. This is **not** the "authorization-scope-decoupled-from-effect" defect class of
138/139 — there the Server *had* to act and didn't; here acting would require Server-side
knowledge of native harness environments that the Server deliberately does not hold. If the
Server *were* expected to bind `environmentId` to a concrete turn environment, that would be
a product/contract decision (it needs a Server-side notion of "the executing environment id"
to compare against) — **not** invented here; recorded as conclusion 2 with the boundary made
explicit instead.

## What this order added (conclusion-2 branch of Scope)

* This boundary declaration (→ `docs/server-round1/**`, pointed at AGENTS.md's plugin-owns-semantics rule);
* a gate (`tests/server/test_bounded_approval_forward_144.py`) that drives the **real**
  `register_approval` + `decide_approval` methods (not a private helper, not a hand-fed frame)
  and asserts the `bounded` scope — `environmentId` included — reaches the harness channel
  **byte-identical** (`assert frame["scope"] == scope`). Counterexample is built-in: any
  mutation or drop of a scope key on the forward path turns the gate red.

No production source was changed: the Server already forwards faithfully; the gap was an
undeclared boundary and an un-asserted forward, both now closed. The `bounded` **shape** is
untouched (matches the locked artifact); `wire/**` / `protocols/**` untouched.

## `132` note (declared vs effective, same source)

Where a Server action *is* required, "declared authorization scope" and "scope actually in
force" must share one source (138/139/140/141). Here the Server action required is precisely
*forward verbatim*, and the gate pins that the declared scope is what reaches the decision
consumer — the boundary is on the books, not implied.
