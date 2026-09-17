# Order 52 handoff — the process facts (thoughts, plan, mode) for the UI

Backend order 52 landed three neutral event kinds so the harness's own
reasoning, plan and mode become renderable facts instead of being dropped at
the Server's forward. Backend HEAD at handoff: env-provider
`feature/env-provider-v1` (the mapping and ledger commit b0c124f); the wire
relock is recorded in env-provider `docs/server-round1/wire-review.md`
(order 52 B/D). Frontend contract commit in this repository: b1f44a23
(`wire-v1.ts`).

## New wire events (strict, WireEvent union members)

- `thought.delta { sessionId, text }` — the harness's own reasoning, streamed
  as the model produces it. Renders like a message delta under a
  "thinking" treatment; the text is the fact, nothing else arrives.
- `plan.updated { sessionId, entries: [{ id, content, status,
  priority? }] }` — a full plan snapshot (not a delta): replace the rendered
  plan. Status vocabulary comes from the harness (e.g. pending/completed).
- `mode.updated { sessionId, currentModeId }` — the harness's selected
  interaction mode changed.

## What does NOT arrive

- A family that emits none of these renders nothing new — no synthesized
  placeholders. Plan/mode facts for families without them stay absent.
- Tool lifecycle continues to arrive on the existing `tool.update` kind
  (the mapping reuses it; no new kind was added for tools).

## Follow-up

Consuming these in the UI (a thinking view, a plan panel, a mode indicator)
is frontend work and belongs to a frontend order — this handoff documents the
contract and does not modify any UI container.
