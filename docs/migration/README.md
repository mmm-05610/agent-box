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
| 1 | `cd24ddd87da556cf0df544d9611490e967df0dba` | desktop scaffold graft: tree of fc-functional@450944bd re-rooted (platform/ + contracts/ → packages/desktop-platform/, products/agent-desktop → products/desktop, root pkg `ordessa`); replaces the legacy agent-box main tree, parent `6c14ea8d` |
| 2 | `974e643a1067a56fcaf584ccd2bfb99bdccf3d3f` | backend split: packages/pacthold + apps/server (ordessa_server) + plugins/harness (ordessa_harness + adapters/acp-adapter@41d9d94 + packaging) from bc-native@a0b343e0 |
| 3 | `b6a08cec3f85` | root docs: README, AGENTS, architecture, baseline, known-issues, naming, reference-index, migration records |

## Verification gates (evidence files under `docs/migration/`)

| Gate | Result |
| --- | --- |
| History preservation | 9 bundles (verify OK), 12 dirty-tree snapshots, control git checkpoint `4fc80571`; restore tests 5/5 byte-identical — batch: `/home/maoqh/projects/ordessa-preservation/20260925/` |
| 4 | `db5ac119b0e4` | workspaces: exclude plugins/harness from npm discovery (found by clean-checkout gate: packaging closures desynced the root lockfile) |
| 5 | `f70829f84b32` | python3.12 pin in docs + backend red-ledger rulings |
| 6 | `df6327574d03` | restore 2 files missed by migration (server-windows lockfile record, native CLI fixture) — found by the independent file-integrity sweep |
| 7 | `c0ff0479e07b` | drop the vendored 7.4MB bridge binary from the tree (kept in archive, byte-reproducible) |

| Desktop: install/typecheck/tests/build/smoke | reproduced by lead on the integrated candidate: `npm ci` 277 pkgs, typecheck OK, 146+13+79 = 238 tests green, 9-extension assembly, electron/agent-shell/extension smokes exit 0 |
| Backend: install/imports/suites | see `backend-build-test.md` (inherited-red ledger discipline; pacthold suite green; harness suite 308 passed / 2 inherited failures) |
| Bridge rebuild | lead reproduced byte-identical artifact `5fd6a37b…bbc61ea` from the migrated tree with pinned go1.24.13 + recorded flags |
| Clean-checkout install & build | fresh clone of `c0ff0479e07b`: 9/0 gates green (npm ci, typecheck, 146 unit tests, 9-extension assembly, electron build, pip×3+imports, pacthold 238P, harness/server/acp suites per ledger, bridge sha256 byte-identical, /live smoke) — log `ordessa-migration/verify-clean-run3.log` |
| Naming | exact `agent_box` imports = 0 in active code; exceptions ledger in `docs/naming.md` |
| Dependency boundaries | `pacthold` imports nothing above it; server composes via plugin root; product never wires bridge internals — boundary test suites kept green |

## Key documents

- `source-destination.md` — root-switch table + recovery steps (user confirmation required before execution)
- `backend-migration-table.md`, `desktop-migration-table.md` — per-path old→new maps (from the subagents, lead-verified)
- `backend-build-test.md`, `desktop-build-test.md` — commands, versions, results, red-ledger classification
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
3. Old root `.git`/`.agents`/`.codex` (listed in the plan as protected) no
   longer exist at switch-time measurement — nothing had to be worked around.
4. Old trial servers 18790/18810 are stopped; the hd004b leg (57411) still
   runs from the frozen bc-native tree and was not touched.
