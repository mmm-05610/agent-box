# Work Order <N> — <one concrete outcome>

**Baseline:** <measured files / lines / debt / tests>

> **Order:** <what must be merged/reviewed first; whether this runs alone>

## Objective

<What becomes true, why it matters, and what is deliberately not being redesigned.>

## Before / after

```text
before/
├── misplaced/                    ⚠ <measured problem>
└── stable/                       ✓ unchanged

after/
├── destination/                  ◀ moved by work order <N>
└── stable/                       ✓ unchanged
```

## Exact scope

| From | To / action | Reason |
| --- | --- | --- |
| `<path>` | `<path>` | <decided ownership> |

## Invariants and non-goals

- Preserve <public behavior / identifiers / signatures / persistence semantics>.
- Do not redesign <adjacent undecided area>.
- Do not create compatibility shims unless explicitly authorized.
- Do not read, modify, or stage <protected paths>.

## Stages and commit boundaries

1. Record the live baseline and prerequisites.
2. Apply the first mechanically independent move/change; validate its narrow seam.
3. Finish path/caller migration; remove old path without a shim.
4. Run full validation and update status with measured numbers.

## Validation

```bash
<typecheck>
<targeted tests>
<full relevant tests>
<architecture/collision guard>
git diff --check
```

## Stop and report when

- A prerequisite is not merged/reviewed.
- The move requires a new protocol, product behavior, or ownership decision.
- A protected user path would need to be touched.
- Tests require semantic assertion changes outside the authorized scope.
- The measured result contradicts the work order baseline or target.

## Acceptance state

- Green: `<WORK_ORDER_STATE_GREEN>`
- Otherwise: `<WORK_ORDER_STATE_PARTIAL>` with exact remaining items and evidence.
