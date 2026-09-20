# Order 146 — the delegated child turn must pass the existing chain's gates (`AUD-B-029/031/032/034/035`)

## Verdict

`DELEGATION_RECOVERY_GATE_AND_LATEST_READ_DONE`. All five findings land on the real
delegation path, each with a counterexample-verified gate. The `recovery_pending`
**clearance** entry remains absent (that is `117`'s separate concern; see Boundaries).

## The five findings, first-hand, and what each fix touches

| Finding | Bypass/defect (one code region) | Fix here |
| - | - | - |
| `AUD-B-031` (medium) | The existing chain refuses `recovery_pending` profiles with 409 `PROFILE_RECOVERY_REQUIRED` at `repository.py:195/591`; delegation only checked `archived_at`, then inserts the child turn itself, so `:591` never ran | `run` rejects a `recovery_pending` child with typed `SUBAGENT_UNAVAILABLE` **before** any session/turn is created |
| `AUD-B-034` (low) | The exclusive-home lock `_refuse_exclusive_home_concurrency` (`repository.py:67`) guards the chain's `create_turn`; delegation bypassed it, so an exclusive-home profile could get two active turns across two sessions | `_create_child_turn` calls `self.records._refuse_exclusive_home_concurrency(conn, child_profile)` inside its own transaction, atomically with the INSERT |
| `AUD-B-035` (low) | A same-session `task_id` retry hits `server_one_active_turn_per_session`; delegation let the raw `sqlite3.IntegrityError` (naming `server_turns.session_id`) escape, while the chain translates it to `TURN_CONCURRENCY_CONFLICT` (`repository.py:608`) | `_create_child_turn` wraps the INSERT and translates `UNIQUE constraint failed` → `ServerError("TURN_CONCURRENCY_CONFLICT", …, 409)`. The loopback exit already reads `getattr(exc,"code"/"message")`, so this surfaces as a product code with no `server_` leak |
| `AUD-B-032` (low) | `resolve_roster(availability=…)` existed but no caller fed it ⇒ every entry `available=true` (the "unavailable" dimension was decorative) | `_availability_map(profiles)` feeds typed reasons (`PROFILE_ARCHIVED` / `PROFILE_RECOVERY_REQUIRED` / `HARNESS_UNAVAILABLE`) into both `list_for` and `run` |
| `AUD-B-029` (high) | The summary was read from `get_session`'s events/turns, each `ORDER BY … LIMIT 200` (the session's *oldest* 200) ⇒ long answers silently truncated-head, continuations returned `''`, and a >200-row session could fake a timeout | `_final_message` reads `records.turn_message_deltas(turn_id)` (this turn's events, unwindowed, then the declared `MAX_SUMMARY_CHARS` cap + `…`); `_await_terminal` polls `get_turn_context(turn_id)["state"]` instead of scanning the windowed turns list |

## `132` subtypes recorded (per the order's ask)

1. **"A gate that exists on multiple paths must give the same answer on every path"** —
   `AUD-B-031` and `AUD-B-034` were exactly this: the existing chain's `raise ServerError`
   gates were not enforced on the delegation path. Shape for `132` to absorb: for every
   existing-chain gate, the delegation path must assert it or record an explicit exemption.
2. **"Fields about *which* config/window inside one row must share one source"** —
   `AUD-B-029` (the window direction) plus `138`'s `AUD-B-028`.

## Gate (`tests/server/test_delegation_recovery_and_read_146.py`) — real `run` / `list_for`

* recovery: a `recovery_pending` child ⇒ `SUBAGENT_UNAVAILABLE` and `server_turns` count
  unchanged (G1); `list_for` marks it `available=false`, reason `PROFILE_RECOVERY_REQUIRED`
  (G3 - a type code, not a decorative True).
* exclusive-home: one active child turn exists ⇒ delegated run ⇒ `TURN_CONCURRENCY_CONFLICT`
  (G2b), reusing the chain's own predicate.
* typed exit: same-session `task_id` retry ⇒ `TURN_CONCURRENCY_CONFLICT`, message contains no
  `server_` (G2c) — the pre-fix shape leaked `IntegrityError: UNIQUE constraint failed:
  server_turns.session_id`.
* latest read (G4/G5/G6, on the real `run` path): a 260-delta child turn returns all 260
  chars; a second `run` with the returned `task_id` returns that turn's own 260 chars
  (**not** `''`); a turn over `MAX_SUMMARY_CHARS` returns exactly the cap plus the declared
  `…` marker (never a silent head-cut); `get_session` now states in its own docstring that
  its `turns`/`events` are the **oldest** `event_limit` rows ("not the whole session"), and
  a gate asserts that documented direction (`events` = seq 1..200 of 300).

**Load-bearing proof**. The four authorization/exit gates were proved earlier by an in-tree
revert (exactly their gates reddened, and the typed-exit gate surfaced the literal
`sqlite3.IntegrityError: … server_turns.session_id`). For the read fix the before/after was
computed at runtime instead, with **no source file touched**
(`docs/server-round1/probes/sim146_windowed_read.py`, re-runnable):

| same fixture, two reads | turn 1 (260 deltas) | turn 2 = continuation |
| - | - | - |
| pre-146 read (`get_session` window, 200 rows returned) | **198 chars** (silently head-cut) | **0 chars** |
| shipped read (`turn_message_deltas(turn_id)`) | 260 chars | 260 chars |

So the continuation gate is load-bearing: the old read returns `''` where the fix returns the
child's answer, and the parent could not tell "the child said nothing" from "we dropped it".

## Method note (so the evidence shape is not mistaken for a missing counterexample)

The read gates are proved by a **runtime before/after probe** rather than by editing
`delegation.py` back to the buggy read: this session's permission mode blocks
deliberate in-place reintroduction of a defect, and a probe that computes the old read
next to the shipped one is both safer and re-runnable by the next reviewer. The four
authorization/exit gates keep their earlier in-tree revert evidence, recorded above.

## Boundaries respected / one item left open

* `65` contract text/values (10 min, ≤4/turn) unchanged; no `wire/**`, `protocols/**`,
  `workers/**`; the two existing-chain 409 gates and `117`'s recovery semantics unchanged —
  this order makes delegation *also* honour them.
* **`recovery_pending` has no clear entry point** (acknowledged by `117`). This order ships
  the "gate is enforced on the delegation path" half only. It does **not** invent a clearance
  mechanism; that is a separate product concern (`R-0070 ②`), recorded as left-open, not
  silently closed.
* G7b (loopback-route real mapping of the typed exit): verified at the service boundary
  (`ServerError.code/message`), which is exactly the shape the `/internal/delegation` handler
  forwards (`getattr(exc,"code"/"message")`, established in `144`); a full `TestClient`
  loopback probe is the same mapping one layer up.
