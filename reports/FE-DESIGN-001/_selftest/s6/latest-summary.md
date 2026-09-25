# FE-DESIGN-001 — latest summary

As of: 2026-09-21T16:28:25Z  round: R005  state: retry_pending  phase: plan

Stop reason is one of: running / converged (design-candidate only) /
converged_pending_independent_review / stalled / blocked / stopped.
Convergence means a design candidate settled, NOT user approval and NOT
implementation.

## Current best candidate

id: none   artifact: candidates/best.md

## Substantive change vs the previous version

_not written yet_

## Unresolved counterexamples (full text in counterexamples.tsv)

```
```

open major: 0   any open: 0   closed awaiting replay: 0

## Scenario coverage (S01-S12)

`claimed` is the integrator asserting coverage; `covered` requires an
independent review ruling against these exact candidate bytes. Format
valid output never counts as a semantic pass.

```
sid|status|owner|mechanism|evidence|round
```

claimed: 0   independently ruled: 0   required: 12
   broken by review: 0   replay still failing: 0

## Mechanism dispositions

```
mechanism|disposition|failure_scenario|experiment_ref|round
```

## Sol review budget (call count, not tokens)

```
cap=10 reserved=0 ok=0 bad=0 remaining=10 final_reserve=2; auto-dispatch=off; pending=0
```

submissions:

```
```

## Convergence

check: `NO: scenarios_independently_ruled_covered=0<12; no independent review rulings exist for the current candidate bytes; clean_streak=0<3; no_candidate;`
clean streak: 0 (need 3)  rounds: 0
last dimension: unassigned

## Per round

```
round|holds_major|new_major|closed_major|clean|note|digest
```

## Where things are

* ledgers: `counterexamples.tsv` `scenarios.tsv` `mechanisms.tsv` `rounds.tsv`
* rounds: `rounds/R*/` (prompt, content, meta, committed sections, ledger snapshots)
* sol: `sol-budget.env` `sol-budget.log` `sol/`
* controller log: `logs/loop.log`  children: `logs/children.pids`
