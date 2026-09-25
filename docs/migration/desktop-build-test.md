# Desktop migration — build & test record

Date: 2026-09-25. Environment: Linux 7.0.0-31-generic x64, Node v22.22.1, npm 9.2.0.
Tree under test: `/home/maoqh/projects/ordessa-migration/desktop/tree/` (no .git).
Source: fc-functional `450944bd7a3569f8e6733d8bdb333f1efaa981b5` via `git archive`.
No real model API was contacted (contract §5.5); all model-touching paths were left unrun.

## 1. Install

| Step | Command | Result |
| --- | --- | --- |
| Lockfile | started from frozen `package-lock.json` (root name updated to `ordessa` by npm), workspaces re-derived for the new globs | regenerated, committed into `tree/` |
| Install | `npm install --no-audit --no-fund` (root) | PASS — 277 packages |
| Workspace resolution | `npm ls --workspaces --depth=0` | PASS — all 14 packages link under new paths: 1 app, 4 platform, 2 contracts (foundation, agent-ui), 7 plugins |
| Isolated test rig | `npm ci` in `tests/acp-connector/` (own lock, pins `@agentclientprotocol/sdk` 1.5.0; not a root workspace, by design) | PASS — 2 packages |

Note: a first `npm install` attempt from scratch (lock deleted, free-range resolution) crashed
inside npm 9.2's arborist (`Cannot read properties of null (reading 'edgesOut')` in
`loadPeerSet` while resolving vitest-5-era peer chains). Restoring the frozen lockfile — which
pins vitest 4.1.10 / vite 8.2.0 / electron 40.10.2 / esbuild 0.28.1 — and installing against it
succeeded. The committed lockfile is therefore the frozen version set re-derived for the new
workspace paths, not a floating upgrade.

## 2. Build gates

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` (`tsc --noEmit`, apps/desktop, includes moved platform/contracts sources via updated tsconfig paths+include) | PASS, no output |
| Examples build | `npm run build:examples` (`tooling/build-examples.mjs` → `examples/dist`) | PASS — "Built standalone examples" |
| Extension build | `npm run build:foundations` (`tooling/build-all.mjs`) | PASS — "Built 9 enabled extensions into products/desktop/dist"; admission closure checks passed; `extensions.lock.json` regenerated |
| App build | `npm run build` (esbuild main/preload/renderer → `apps/desktop/dist`) | PASS — `electron-main.cjs`, `preload.cjs`, `renderer/` produced |

Build determinism note: after the move, exactly 4 of the 25 digests in
`products/desktop/extensions.lock.json` changed — `ordessa.contracts` and
`ordessa.agent-contracts` `contract.js`/`entry.js`. Cause verified: esbuild emits
`// <relative-source-path>` comments and the contract sources now live under
`packages/desktop-platform/contracts/...`; the bundle semantics are unchanged and a rebuild
reproduced the new hashes bit-for-bit (deterministic). All plugin/native bundles hash identical
to the frozen lock. The regenerated lock matches the new layout and is the one committed.

## 3. Tests (all controlled/fake; zero inherited-red, zero new-red)

| Suite | Command | Result |
| --- | --- | --- |
| App unit/component | `npm test` (vitest 4.1.10, serial, jsdom) | **13 files / 146 tests, all pass** (13.7s) |
| Native bridge | `npm run test --workspace @ordessa/native-bridge` | **1 file / 13 tests, all pass** |
| ACP connector seam | `npx vitest run` in `tests/acp-connector/` | **9 files / 79 tests, all pass** (11.5s; pre-existing `act()` stderr warnings only, tests green) |
| Extension discovery smoke | `xvfb-run -a npm run test:extensions` | PASS (exit 0; 9 scenarios incl. expected-negative ones — the logged "Duplicate extension id" line is the assertion target of scenario "duplicate identity rejected", not a failure) |
| Agent shell smoke | `xvfb-run -a npm run test:agent-shell` | PASS (exit 0; loopback fake answers `server.hello`; no-handoff vs authenticated-hello registration both verified; no model contact) |
| Electron boot smoke | `xvfb-run -a npm run test:electron` | PASS (exit 0; `ready:true`, empty host, no errors, bridge exposes only `read`) |

Electron smokes were run under a private `Xvfb` display (`xvfb-run -a`), NOT on the user's
live `:0` display, and used isolated temp `userData` per the repo's own convention. No ports
were parked; all spawned processes exited with the tests.

## 4. Untested items

| Item | Why |
| --- | --- |
| Full GUI acceptance (visual interaction, real mouse drag-resize, the two known inherited UI debts: approval card without timeout display, composer scrolling out of view) | inherited debt per task brief; GUI-level acceptance explicitly out of this round's scope |
| `npm run test:ui-preview` | controlled, but it regenerates the six committed evidence PNGs in `docs/ui-preview/` — skipped to avoid overwriting frozen-tree evidence; recorded here for the lead to decide |
| `test:native-two-turn`, `test:native-paired-no-send`, `test:ordessa-event-stream`, `test:pair-network-gate`, `diagnose-empty-host-network` (real Server + real model chain) | require a real model/Server leg — forbidden by contract §5.5; carried over as untested from the source tree's own README ("A real Server and native Agent are outside that test") |
| End-to-end paired Desktop+Server run | same as above; also listed as "Remaining acceptance" in the source README |

## 5. Clean-tree guarantee

After verification, all generated output was removed from `tree/`:
`node_modules/` (root, `apps/desktop/`, `tests/acp-connector/`), `apps/desktop/dist/`,
`examples/dist/`, `products/desktop/dist/`. A final `diff -rq src-tree tree` shows exactly
24 differing files — all in the intended update list of MIGRATION-TABLE.md §3 — plus the
intended moves (`platform/`+`contracts/` → `packages/desktop-platform/`, `products/agent-desktop`
→ `products/desktop`) and the regenerated `package-lock.json`. No other file differs from the
frozen commit; 189 files total in `tree/`.
