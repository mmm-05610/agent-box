# ADR-0009: Atomic Execution Finalization

Status: Current — retained as an active architectural decision.

Status: accepted and implemented 2026-08-28.

An Execution may enter `TERMINAL` only through `ExecutionService.apply_finalization()`.
The request is a frozen, provider-neutral invocation DTO containing the terminal
projection, native/output Refs, and typed ResourceObservations. Core validates the
bundle, computes a canonical digest, and commits all facts, the terminal projection,
events, and an operation receipt in one SQLite transaction. There is no Finalization
domain entity.

The Provider remains responsible for deciding that native execution has ended.
`FINALIZING` is a Host/UI display state, not a Core phase. Required outputs are
chosen by Provider/Host/Contract policy and are not part of Core ontology. Core does
not call providers, Git, CI, Codex, artifact authorities, or workflows.

The receipt is idempotent: the same key and digest replay the stored result without
new writes; a key/digest conflict and a different finalization for an already
terminal Execution are rejected. Late evidence may use the existing append-only
ResourceObservation API and never changes terminal projection or outcome.

Same-session continuation remains a new Execution with a new Dispatch. Work remains
independently open until explicitly completed.
