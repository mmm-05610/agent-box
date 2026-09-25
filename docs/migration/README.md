# Migration record — how this monorepo was assembled

Executed 2026-09-25 by the lead agent (ZCode, GLM-5.3) with three parallel
subagents, under the plan `ordessa-monorepo-baseline-plan.md` (copied here)
and the shared contract `shared-contract.md`. User authorization: implement
the migration; root switch, old-worktree removal and remote publishing each
require explicit user confirmation with concrete evidence.

## Frozen source points (measured 2026-09-25 ~21:00, re-verified)

| Role | Repo | Branch | Commit |
| --- | --- | --- | --- |
| Backend | agent-box | `work/hd002-bc-native` (= `main-cp-001`) | `a0b343e0c01651d407adbc4a71c2d40b558840fb` |
| Desktop | agent-box-desktop-next | `work/hd002-fc-functional` (= `main-cp-001`) | `450944bd7a3569f8e6733d8bdb333f1efaa981b5` |
| Go ACP bridge | acp-adapter | `work/round-h` (= `main-cp-001`) | `41d9d94ef6b98547df575240c4366b1e5e8ba39b` |
| New-main ancestor | agent-box | `main` (remote `mmm-05610/agent-box`) | `6c14ea8db8130f1e219328835840b4159fe8c9e7` |

## Assembly commits

| # | SHA | Content |
| --- | --- | --- |
| 1 | `cd24ddd87da5` | desktop scaffold graft (fc-functional@450944bd re-rooted; parent `6c14ea8d`) |
| 2 | `974e643a1067` | backend split: packages/pacthold + apps/server + plugins/harness (+ bridge source @41d9d94) |
| 3 | `b6a08cec3f85` | root docs |
| 4 | `db5ac119b0e4` | workspaces: exclude plugins/harness from npm discovery (packaging closures had desynced the root lockfile — found by the clean-checkout gate) |
| 5 | `f70829f84b32` | python3.12 pin + backend red-ledger rulings |
| 6 | `df6327574d03` | restore 2 files missed by migration (server-windows lockfile, native CLI fixture) — found by the independent file-integrity sweep |
| 7 | `c0ff0479e07b` | drop the vendored 7.4 MB bridge binary (kept in archive, byte-reproducible) |
| 8 | `fa461219ceda`…`7e171f667e` | review-closure series: strict gate script, verified-closure lockfile, dev extras, restore loop, per-item rulings, handshake evidence, run6 record |
| 9 | (this commit) | switch plan v3 (rename-landing), evidence-gate split (Q/I), run6 per-ID dump |

## Verification gates — two evidence kinds, cited separately

**Gate Q (quantity gate).** `scripts/verify-clean.sh` asserts each suite's
pass/fail/skip/error **counts** against the expected ledger and fails on
collection interruptions or count deviation. Authoritative run **run6**
(clean clone of `03050f493e`, exit 0, **17/0 gates PASS**): npm ci/typecheck,
desktop 146 + acp-connector 79, assembly + electron build, closure lockfile
(28 pins, starlette 1.7.0) + editable installs + imports, pacthold 238P/0F,
harness 308P/2F/3S, server 783P/43F/10S/25E, acp_orchestration 40P/18F,
bridge sha256 byte-identical, /live smoke. **Scope: proves clean-environment
executability and count agreement — not failure identity.** Log:
`ordessa-migration/verify-clean-run6.log`.

**Gate I (per-ID ledger).** Failure-**ID** sets of the migrated suites vs the
frozen bc-native baseline (itself 97F+25E/1755P), normalized:
baseline 117 red ids ⊇ migrated 65 = 59 inherited same-id + 6 ruled
scope-reds (asset_hubs probe green under the verified closure; rulings per
item in `docs/known-issues.md`). Evidence: `run6-server-red-ids.txt` +
`run6-server-full.log` (dumped in the run6 environment) and the
migration-time analysis (`ordessa-migration/backend/new-only.txt` + lead's
independent normalized diff). **"Zero unexplained new red IDs" rests on this
gate, not on run6.**

History of the gate itself: run3's "9/0" was **retracted by external review**
— its harness/server/acp steps never executed (collection errors: undeclared
pyyaml; starlette ≥1.8 needing httpx2; `import tests` needing cwd on
sys.path). Fixes: strict-gate script, `apps/server/lockfiles/server-linux-py312.txt`,
dev extras, `python -m pytest` from repo root. Intermediate runs kept as
evidence: run4 (pre-fix state honestly judged 5 FAIL), run5 (caught a
gate-parsing bug of the script itself).

| Other gates | Result |
| --- | --- |
| History preservation | 9 bundles (verify OK), 12 dirty-tree snapshots, control git checkpoint `4fc80571`; restore tests 5/5 byte-identical — batch: `/home/maoqh/projects/ordessa-preservation/20260925/` |
| Desktop suites (candidate repo, lead-reproduced) | 146 + 13 (native-bridge) + 79, builds + agent-shell/electron/extension smokes exit 0 |
| Bridge rebuild | byte-identical `5fd6a37b…bbc61ea` from the migrated tree (go1.24.13, recorded flags); no-model handshake evidence `plugins/harness/packaging/acp-adapter/evidence/handshake-migrated-20260925.json` (pi cli sha matches pin). Controlled main-chain scope: handshake + acp_orchestration 40P (real server↔harness↔ACP seams, fixture peer) + desktop agent-shell smoke. Real-model two-turn on the migrated tree: **waived by the user for this migration's acceptance** (2026-09-26); version-matched evidence = Round H acceptance 2026-09-25 |
| Naming | exact `agent_box` imports = 0 in active code; exceptions ledger in `docs/naming.md` |
| History restore loop | plain clone (main+tags only) + one fetch → +603 archive/reference refs, all key SHAs reachable; control checkpoint byte-identical vs the independent tar snapshot — commands in `docs/reference-index.md` |
| Dependency boundaries | `pacthold` imports nothing above it; server composes via plugin root; product never wires bridge internals — boundary suites green |

## Key documents

- `source-destination.md` — root-switch table v3 (rename-landing) + rollback (user confirmation required before execution)
- `backend-migration-table.md`, `desktop-migration-table.md` — per-path old→new maps (from the subagents, lead-verified)
- `backend-build-test.md`, `desktop-build-test.md` — commands, versions, results, red-ledger classification
- `independent-review.md` — lead-executed review record + external-review corrections
- `remote-plan.md` — reuse of the agent-box remote identity (prepared; **not executed**)
- `desktop-cp-candidate-readme.md` — the HD-002 CP candidate README (provenance)
- Preservation batch report (outside the repo):
  `/home/maoqh/projects/ordessa-preservation/20260925/REPORT.md`

## Facts the migration discovered (registered)

1. The desktop repo is a shallow clone; 3 release tags + upstream refs are
   not locally recoverable (see `../reference-index.md`).
2. `work/hd002-fc-functional` diverges from desktop `main` (not a descendant);
   desktop `main` is preserved as `archive/agent-box-desktop-next/heads/main`
   and curated `reference/hermes-desktop`.
3. Root-level `.git`/`.agents`/`.codex`: measured **absent** inside the
   workspace root on 2026-09-25 ~21:00 and again 2026-09-26 00:20. Present
   nearby (outside the switch scope, never touched): `/home/maoqh/projects/.git`
   (mimocode stub), `~/.agents`, `~/.codex` (active). Switch plan v3 handles
   either state: any entry inside the old root is carried into
   `ordessa-old-root/` by the rename.
4. Old trial servers 18790/18810 are stopped; the hd004b leg (57411) still
   runs from the frozen bc-native tree and was not touched.
