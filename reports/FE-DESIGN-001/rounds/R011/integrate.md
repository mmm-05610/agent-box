# R011 integrate report

## What the round established

Three of the four unverified blockers from R009 were ruled on their own bytes (R010, artifact
`rounds/R009/cand-A.md` = `cf554e67…`): **FE-CE-019 holds, FE-CE-020 holds, FE-CE-021 holds.**
The two new blockers raised this round (R011, artifact `candidates/best.md` = `49df1e9345ab…`)
were both ruled **holds**: FE-CE-022 and FE-CE-023. The verifier's `MISSED_CHECK` then added a
sharper third: **FE-CE-024**, on the same axis as FE-CE-022 but with the polarity reversed — the
candidate does not merely omit a retention rule, it *states one that contradicts its own catch-up
guarantee*: §R8.2 Envelope line 58 says "Disposal: after the subscription is closed, envelope is
dropped." Under that clause the backlog a re-subscribing view needs is exactly the set of
envelopes already discarded, so S03 step 4 / T-Boring replays nothing. FE-CE-024 is accepted as
raised; the attacker's "no rule exists anywhere" was an overstatement and is corrected in the
record, but the defect stands and is worse in this form.

## The repair: six corrections inside A, one new concept zero

1. **FE-CE-022 — the store is named, and it is the cursor stream.** The per-resource cursor stream
   is stated to be an append-only log of envelopes: `pump` appends and assigns `seq`; retention
   runs from `pump` until the resource is retired or its namespace torn down; there is no
   truncation while the resource exists. The phrase "no extra host store, no host event store" is
   deleted because it was false, and the mechanism-ledger row `host-event-store|removed` is
   replaced by `cursor-stream-log|core`. No *second* store is introduced — the log is the stream
   that was already core since R001; what was wrong was the claim that nothing retained anything.
2. **FE-CE-024 — one disposal point.** The envelope-lifetime clause is replaced: a closed
   subscription releases its *reference*, not the log entry; the only disposal of a resource's log
   is `retire(local_id)` or namespace `teardown`.
3. **FE-CE-023 — presence is not reachability.** The directory's existence claim is narrowed from
   "the resource is live" to "the resource has been announced and not retired". A new adapter
   boundary rule (item 8) makes the adapter responsible for `teardown` when it observes its
   connection to the service lost; the host never infers namespace death. The residual — a hard
   killed adapter that never observes the loss — is declared as a stated limitation, not hidden.
4. **FE-CE-019 — all four `InvokeOutcome` variants have a rendering rule**, on the value channel
   and the state channel alike, with one invariant: an unconfirmed outcome may never be rendered
   as a current value or a current state. Prior rows survive only as explicitly labelled
   last-confirmed evidence with a banner and a Retry control.
5. **FE-CE-020 — GenericWalk is total over its declared schema**: exactly one row per declared
   field, including explicit `(absent at runtime)` and `(unreadable: declared <shape>)` rows; it
   never throws and never replaces the pane. The crash-or-fake-complete fork cannot reopen.
6. **FE-CE-021 — the walk is recursive to any depth, and the depth clause is deleted.** This is
   the round's reduction: §3/§7's obligation on adapter authors ("result schema uses declared,
   legibly-named scalar/list-of-record fields, because the fallback can only render that shape")
   is *removed*. It had written the host renderer's recursion depth into the adapter's schema
   contract — a core internal leaking into the adapter's business. With a recursive,
   path-labelled walk the obligation is unnecessary; deleting it costs nothing.

## CHANGES_VS_PREVIOUS: (a) `cursor-stream-log` added to the mechanism table as CORE, replacing the false `host-event-store|removed` row; retention stated as resource-lifetime with `retire`/`teardown` as the sole disposal point, correcting FE-CE-022/024. (b) Envelope disposal clause rewritten: a closed subscription releases a reference, not the log entry. (c) Directory existence narrowed to "announced and not retired"; new adapter boundary item 8 requires `teardown` on an observed connection loss, answering FE-CE-023. (d) §R11.5 adds the four-variant `InvokeOutcome` rendering rule and its invariant (FE-CE-019), the GenericWalk totality rule (FE-CE-020), and a recursive path-labelled walk (FE-CE-021). (e) `RenderRow` gains `path` and `status` fields; `NamespaceHandle.pump` and `InvokeOutcome` are byte-unchanged, so FE-CE-018 is re-checked rather than inherited. (f) Deleted: the adapter "flat schema" obligation (FE-CE-021, a reduction). (g) No core concept added; `pump`, `cursor_resolve`, same-ns scoping, per-(ns,kind,action) registry, open CapMap and never-auto-resubmit are unchanged.

## Boundary discipline

`FE-CE-007` is untouched: it stays OPEN on the discarded alternative B's ledger, this round
neither repairs nor rejects it, and no pass row for it appears in the replay block — an A-side
"not applicable" is not a repair. No scenario text was altered and no requirement was raised; the
S05/S11 deletion tables carried from R009 are unchanged and simply re-evidenced. Necessity is
argued by deletion, not by "it prevents an over-reach". The three experiments below are labelled
model-only and prove only the models they encode.
