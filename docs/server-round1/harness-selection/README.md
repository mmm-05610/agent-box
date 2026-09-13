# Work Order 38 — Harness extension selection

Work Order 38 is **ready for user decision**. The conditional recommendation is
to approve a minimal extraction spike based on `giuliastro/harness-remote` at
tag `v3.0.2`, commit
`21ce6db49af708c4c7c3f96ef6a50f62dced8dab`.

There is no fully qualified backup. `agent-controller` has useful isolated
runtime packages, but its Codex implementation uses `codex exec`; replacing it
with app-server would require a new lifecycle translator. `twaldin/harness` has
no Codex or Hermes live backend. `codex-acp` is a verified Codex-only lower
component inside the recommendation and is not itself the multi-Harness answer.

The recommendation is conditional on a fixed Apache-2.0 source snapshot,
offline adapter locks, Worker-owned isolation/process cleanup, Windows-owned
product state, and one narrow asynchronous permission-resolver patch. If these
conditions are rejected or the implementation requires rewriting candidate
lifecycle, translation, or registration, the result becomes `NO_FIT` rather
than a self-written replacement.

No provider request, model invocation, login, or credential read was used.
Candidate-owned tests and the committed experiments use fake peers to prove
adapter seams; they do not claim real Harness conformance.

Evidence:

- [Recommendation and reuse boundary](boundary.md)
- [Candidate comparison](candidates.md)
- [Behavior verification](verification.md)
