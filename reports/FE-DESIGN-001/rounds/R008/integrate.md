# R008 Integration Report — FE-DESIGN-001 / integrator

## 1. Per established (holds) counterexample

**FE-CE-018 (major, holds).** The exact change: add a typed `pump` method to `NamespaceHandle` in §2:

```
pump(local_id: string, payload_schema_id: string, payload: unknown): void
```

Failure semantics stated in §2 prose immediately after the code block: (i) pumping after `retire(local_id)` is a silent no-op (the resource's stream is closed; the host drops the payload without assigning seq); (ii) pumping during or after `teardown(reason)` throws `NamespaceGone`; (iii) the adapter never receives the assigned `Seq` as a return value (host stamps it internally; this keeps the Envelope's `seq` unforgeable and prevents the adapter from pre-computing a dedup key from it, consistent with FE-CE-013's closure). The sequence open→announce→register→pump now terminates the adapter's obligation. The change lives in §2's type block and §3 item 3's reference to it.

## 2. Per insufficient_evidence row

S01–S04 from the R007 independent review (rulings VOID against old bytes per the unresolved-findings note): the single check is whether each step names an actor, an action, a state change, an authoritative module, and a per-mechanism deletion consequence. The R008 candidate's §5 tables supply all five columns for every step. With `pump` now typed, every operation referenced in the trajectories resolves to a named interface method. No further check needed; these rows are covered on the revised bytes.

## 3. Regressions (replay of every ledger row against the revised candidate)

| id | replay | result |
|---|---|---|
| FE-CE-001 | A has `invoke→Result` snapshot path | does_not_hold (unchanged) |
| FE-CE-002 | Open CapMap + actionable fallback | closed (unchanged) |
| FE-CE-003 | `from_cursor` mandatory; no CapMap behavioral authority | closed (unchanged) |
| FE-CE-004 | Same-ns rule permits subscribe of spawned resource | closed (unchanged) |
| FE-CE-005 | Runner subscription uses `cursor_resolve`; no history replay | closed (unchanged) |
| FE-CE-006 | Per-`(ns,kind,action_type)` registry | closed (unchanged) |
| FE-CE-007 | A has no edges mechanism | N/A against A; OPEN against demoted B |
| FE-CE-008 | Opaque `payload_schema_id`; no descriptor store | closed (unchanged) |
| FE-CE-009 | Same-ns rule passes S08 without spawned set (Model2) | closed (unchanged) |
| FE-CE-010 | OutcomeUnknown carries no token; no auto-resubmit | closed (unchanged) |
| FE-CE-011 | `from_cursor` mandatory; no implicit default | closed (unchanged) |
| FE-CE-012 | `seq` is stream index not dedup key; adapter dedups own id | closed (unchanged) |
| FE-CE-013 | Adapter dedups own stable id, never host seq | closed (unchanged) |
| FE-CE-014 | Adapter pumps logical order; host does not reorder | closed (unchanged) |
| FE-CE-015 | Distinct integers for catch-up vs live; no double-duty | does_not_hold (unchanged) |
| FE-CE-016 | `pump` addition does not alter cursor decision; `from_cursor=0` for spawned | closed (unchanged) |
| FE-CE-017 | `pump` addition does not alter ns-regeneration guard | closed (unchanged) |
| FE-CE-018 | `pump` now typed on NamespaceHandle | CLOSED on revised bytes |

## 4. Reduction

| mechanism | disposition | deletion-fails |
|---|---|---|
| namespaces | core | S01 step1 no scope; S06 collision |
| resource-directory | core | S05 step2 cannot list |
| monotonic-cursor-stream | core | S03 step4 no catch-up |
| cursor_resolve | core | S08 step4 stale replay (FE-CE-005) |
| typed-action | core | S01 step3 execute(any) |
| open-capability-map | core | S11 fake support |
| same-namespace-scoped-handle | core | S06 step3-4 leak |
| per-namespace-action-typing | core | S06 step5 shared key |
| generic-actionable-fallback-view | core | S07/S12 blank |
| never-auto-resubmit | core | S09 step2 double execution |
| envelope-seq-stream-index | core | S03 step2 no position to persist |
| **pump (NamespaceHandle.pump)** | **core** | **S01 step4 adapter cannot deliver; S04 progress undelivered** |
| host-session-object | removed | none |
| host-turn-role-envelope-field | removed | none |
| host-event-store | removed | none |
| replay_mode | removed | none |
| host-dedup-ns-resource-seq | removed | none |
| host-reorder-by-seq | removed | none |
| spawned-resource-grant | removed | none |
| invoke-id-on-OutcomeUnknown | removed | none |
| implicit-live-default-subscribe | removed | none |
| cross-namespace-edge | removed | none |
| persistent-pair-record | removed | none |
| subscription-last-seq-accessor | removed | none |
| ns-scoped-payload-descriptor-store | removed | none |

## 5. Unassigned work

None new this round. The minor observation (NamespaceHandle exposes no `ns_id` field for `action.register`) is fixed in the revised candidate by adding `readonly ns_id: string` to the interface. No scenario is left for a later round.

## 6. Substantive change

CHANGES_VS_PREVIOUS: added `NamespaceHandle.pump(local_id, payload_schema_id, payload): void` as a typed core method closing FE-CE-018 (S01/S02/S03/S04 adapter-delivery step implementable); added `readonly ns_id: string` to NamespaceHandle so `action.register(ns_id,…)` is typed-accessible (minor, not a new FE-CE); no other mechanism added, removed, or delegated. All existing core and removed rows unchanged.

## 7. Best candidate follows after the tables.

