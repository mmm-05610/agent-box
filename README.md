# Ordessa

Ordessa is the agent-desktop product monorepo: one repository holding the
Electron desktop app, the Ordessa Server, the Pacthold governance kernel and
the plugin set that composes the product.

```text
apps/desktop              Electron shell + extension host boot
apps/server               Ordessa Server (ordessa_server)
packages/pacthold         governance kernel (pacthold) + plugin contracts
packages/desktop-platform extension api/loader/host, native bridge, contracts
plugins/harness           harness lifecycle, ACP adaptation, Go ACP bridge
plugins/…                 commands, workbench, connections, agent, connectors
products/desktop          default product assembly manifest
```

## Quick start

Desktop (Node ≥ 22, npm ≥ 9):

```sh
npm ci
npm run typecheck
npm test            # 146 tests
npm run build       # builds extensions + electron app
npm run test:agent-shell && npm run test:electron   # smoke (headless)
```

Backend ( Python ≥ 3.9, Go toolchain pinned — see `docs/baseline.md`):

```sh
python3.12 -m venv .venv && . .venv/bin/activate
pip install -e packages/pacthold -e apps/server -e plugins/harness
python -m ordessa_server --help
pytest packages/pacthold plugins/harness        # suites + known-red ledger
sh plugins/harness/packaging/acp-adapter/build-acp-adapter-round-h.sh   # reproducible bridge
```

Docs: [`docs/baseline.md`](docs/baseline.md) (versions, gates, how to verify),
[`docs/architecture.md`](docs/architecture.md) (components and dependency
direction), [`docs/known-issues.md`](docs/known-issues.md) (registered debts
and untested scope), [`docs/reference-index.md`](docs/reference-index.md)
(where the pre-monorepo history lives and how to restore it).

## Status

Development baseline established from the HD-002 candidates
(backend `a0b343e0`, desktop `450944bd`, ACP bridge `41d9d94`) with known
issues registered — see `docs/baseline.md` and `docs/known-issues.md`.
Real-model end-to-end acceptance is **not** part of this baseline (untested
scope listed there). The pre-migration repositories remain restorable from
archive refs and the preservation batch.
