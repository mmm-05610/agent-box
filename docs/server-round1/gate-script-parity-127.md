# Order 127 — gate-script parity (`scripts/server-round1/**`, owner = A tree per QA-004)

## Verdict

`GATE_SCRIPT_PARITY_DONE` via the **justified-divergence** branch (Scope ②), handed back
to ops. The two scripts are **not** normalized to A because the runtime-side changes are
deliberate landed work (Order 43/47/108 + the HOME_MARKER debt fix) that A's copies do not
carry — adopting A would discard them (Notes line 115: "owner 的版本反而更差 ⇒ 交回").
A reproducible fingerprint record is kept here; a drift-detector gate keeps it honest.

## First-hand observation (OF-02: this supersedes QA-015's count)

QA-015 said "common 15, 2 diverged (`dsh`, `pi`), runtime side changed". Re-checking
against A's **current** HEAD `b1f6e07` (branch `feature/server-harness-extension-v1`,
read through the shared git object store — cross-tree FS reads are classifier-blocked):

| Script | runtime (this tree) | A `b1f6e07` | status |
| - | - | - | - |
| `dsh-production-chain-gate.py` | `bf0efde9ef1f982f9f2870f7c324a894` | **absent** (`git cat-file -e …` → "exists on disk, but not in b1f6e07") | **runtime-only**, not a divergence — QA-015's "common 15" overcounts |
| `pi-production-chain-gate.py` | `dfdae54be337c45de58e44161b18880f` | `2768daa7a61e26f262b5cbbfff3ba087` | **diverged**: runtime 1178 L vs A 1137 L |

## Why `pi` diverges, and why it must (the justification)

Every added hunk is a runtime-line product fact, not a drift or a weakened assertion:

* **`_gate_sandbox_port()`** (Order 47) — a launcher without an injected port refuses to
  run; the gate drives the same reviewed launcher the product uses.
* **per-run `--home-root` isolation** + `AGENTBOX_SIDECAR_ISOLATED` + stable `home_locator`
  (the HOME_MARKER_CONFLICT debt fix, `e394f09`) — a leftover marker from an earlier run
  must not read as this run's identity.
* **`--worker` default → required** with `GATE_WORKER_REQUIRED` bundle discovery, replacing
  a hardcoded `.acceptance-bundle-c4` path.
* **`production.gate_models_document(...)`** instead of `loopback_models_document(...)`.

These are strictly more correct for the runtime product assembly; none removes a check.
Normalization to A would be a **semantic downgrade**, which the order forbids
("不许改判定语义来让两侧看起来一样"). Reconciling ownership (should A adopt these?) is an
ops/I decision, not a unilateral overwrite of either tree.

## A-only script (owner boundary)

`ui_gates_89_leak_check.py` is A-tree owned and referenced here only — this tree neither
copies nor "catches up" to it (Scope: A-only ⇒ report-only).

## Reproducible comparison (this is the QA-每轮 command; G1)

```bash
md5sum scripts/server-round1/dsh-production-chain-gate.py scripts/server-round1/pi-production-chain-gate.py
# A side, read through the shared object store (no cross-tree FS read):
git show b1f6e07:scripts/server-round1/pi-production-chain-gate.py | md5sum   # 2768daa7a61e26f262b5cbbfff3ba087
git cat-file -e b1f6e07:scripts/server-round1/dsh-production-chain-gate.py    # → ABSENT
```

## Machine fingerprint record (consumed by `tests/server/test_gate_script_parity_127.py`)

The gate asserts the current on-disk md5 of each listed script equals its recorded
`runtime_md5`; editing a script without updating this record (the "第三种形态" counterexample)
turns the gate red. `conclusion` ∈ {`normalized`, `justified-divergence`, `runtime-only`}.

```fingerprint
dsh-production-chain-gate.py | runtime_md5=bf0efde9ef1f982f9f2870f7c324a894 | a_ref=b1f6e07 | a_md5=ABSENT | conclusion=runtime-only
pi-production-chain-gate.py | runtime_md5=dfdae54be337c45de58e44161b18880f | a_ref=b1f6e07 | a_md5=2768daa7a61e26f262b5cbbfff3ba087 | conclusion=justified-divergence
```

## Hand-back to ops

- Decision requested: does the **A owner** adopt the runtime `pi` improvements (and take
  on `dsh`)? Until then the divergence stays **registered and justified** — not silent.
- No assertion in either script was weakened; this order changed **no** script content.
