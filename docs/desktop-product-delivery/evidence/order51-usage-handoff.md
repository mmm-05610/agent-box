# Order 51 handoff — the usage fact (contract, samples, what renders)

Backend order 51 delivered the usage fact end to end for the first family (pi)
and this document is the frontend handoff (stage E). Backend HEAD at handoff:
env-provider `feature/env-provider-v1`, the wire relock recorded in
`agent-box-env-provider/docs/server-round1/wire-review.md` (order 51 D).

## Contract delta (TS contract commit bd5336bb in this repository)

1. New wire event kind `usage.updated` (WireEvent union member):
   `{ kind: 'usage.updated', sessionId: WireId, turnId: WireId,
      usage: { inputTokens?: int>=0, outputTokens?: int>=0,
               totalTokens?: int>=0 } }` — strict; fields the family did not
   report are absent, never zero, never estimated.
2. `SessionRecord.latestUsage` (nullable optional): `{ turnId: WireId,
   usageSource: string, inputTokens?/outputTokens?/totalTokens?: int>=0 }`.
   The session-level latest value lets a client joining late render without
   replaying history.

## Artifact

`docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json`
needs regeneration from `wireJsonSchemas()` (this repository owns that file;
its post-change content is archived by the backend as evidence at
env-provider `docs/server-round1/fullstack/generated/wire-v1.schema.json`,
sha256 9e7f2838…). The wire/1 protocol version is unchanged; the 28 methods
are untouched — additive face only.

## Sample values (real run: pi gate on c10, fake DeepSeek endpoint)

- turn row: `state=completed, usage_input_tokens=11, usage_output_tokens=7,
  usage_total_tokens=18, usage_source='pi-acp-journal'`
- session: `latest_usage = {"cacheReadTokens":0,"cacheWriteTokens":0,
  "inputTokens":11,"outputTokens":7,"reasoningTokens":0,"totalTokens":18,
  "turnId":"execution_…","usageSource":"pi-acp-journal"}`

## Rendering rules (order 51 §0/§3)

- A family that reports nothing renders **unknown** (the P08 container already
  does this). No estimation, no character-count stand-ins, no cross-family
  fallback. The context-window denominator is a separate source; until a
  family supplies it, the percentage stays unknown.
- Per-family status at handoff: pi = live (end-to-end evidence); hermes /
  codex / claude-code = their native stores carry the numbers and parsers are
  follow-up work per family; opencode / kilo = needs a data-blob parser;
  dsh / qwen = no local samples (to verify).

## Follow-up

If the P08 container needs a shape change (e.g. a percentage field once a
context-window source lands), that is a new frontend order — this handoff
does not modify the P08 container.
