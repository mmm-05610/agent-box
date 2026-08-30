# Web Host Plugin Migration Audit
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-30
Scope: read-only audit of the current Web Host, frontend, CLI entry points,
packaging and Web/browser tests. No implementation or Git operation was
performed.

## Verdict

The current Web vertical is already a coherent product boundary. It can move
to `plugins/agent-box-web` without changing Work Core or the Web API, provided
the move is treated as an ownership/package transfer rather than a redesign.

The exact current backend boundary is:

| Current path | Responsibility | Destination |
|---|---|---|
| `src/agent_box/application/__init__.py` | Host facade exports | `plugins/agent-box-web/src/agent_box_web/application/__init__.py` |
| `src/agent_box/application/facade.py` | Work/Execution use cases, drafts, selectors, controls, finish/finalization orchestration | `agent_box_web.application.facade` |
| `src/agent_box/application/operations.py` | Host-owned durable operation journal | `agent_box_web.application.operations` |
| `src/agent_box/application/ownership.py` | Per-home mutation lease | `agent_box_web.application.ownership` |
| `src/agent_box/server/host.py` | Loopback HTTP API and static fallback | `agent_box_web.server.host` |
| `src/agent_box/server/static.py` | Web build locator | `agent_box_web.server.static` |
| `src/agent_box/server/__init__.py` | Server exports | `agent_box_web.server.__init__` |
| `src/agent_box/cli/__init__.py:cmd_web` | CLI Web launcher | thin delegate to `agent_box_web.cli` |
| `src/agent_box/cli/__init__.py:cmd_doctor` | mixed generic/plugin/Web readiness check | generic parser remains; Web checks delegate to `agent_box_web.cli` |

`src/agent_box/extensions/*`, `src/agent_box/work_core/*`, resource
contracts, and `HostFinalizationCoordinator` remain root SDK/Core. The Web
plugin should not register itself in `agent_box.plugins`: it is a Host
distribution, not an ExecutionProvider or ResourceProvider.

## Existing Web behavior and ownership

`HostApplication` is provider-neutral at its public seam. At construction it
receives an `ExtensionRegistry` and `PluginLoadReport`, then derives three
maps from READY plugin registrations: `host_controls`, `resource_selectors`,
and `harness_managers`. Selectors and controls are bound to the registry; the
facade never names Git, Codex, tmux, or a concrete provider. This is the
correct discovery direction to preserve after the move.

The HTTP server currently owns only transport/routing concerns and passes all
mutations to the facade. The existing routes cover health, plugin/provider
read models, harness/profile operations, Work/Execution lifecycle, binding
draft/review/freeze, selectors, observe/finish, outputs/evidence, attach,
continuation, and operation polling. The frontend API client is centralized
in `gui-web/src/api/client.ts`; no component constructs API boilerplate.

The following should remain Web Host state, not Core entities:

- `AGENT_BOX_HOME/host/binding-drafts/*.json` and draft revisions;
- `AGENT_BOX_HOME/host/operations/*.json` and bounded operation progress;
- the mutation lock at `AGENT_BOX_HOME/host/mutation.lock`;
- in-memory command idempotency and finish worker coordination;
- frontend route/UI selection state.

Core remains authoritative after Freeze for Work, Execution, exact input
associations, Dispatch, terminal finalization, output Refs, and resource
observations. Moving these files does not justify adding Web schema or
operation tables to Core.

## Exact source migration set

### Python Host package

Move these files verbatim first, then change only package-local and import
paths (`agent_box.application` → `agent_box_web.application`,
`agent_box.server` → `agent_box_web.server`):

```text
src/agent_box/application/__init__.py       -> plugins/agent-box-web/src/agent_box_web/application/__init__.py
src/agent_box/application/facade.py         -> plugins/agent-box-web/src/agent_box_web/application/facade.py
src/agent_box/application/operations.py     -> plugins/agent-box-web/src/agent_box_web/application/operations.py
src/agent_box/application/ownership.py      -> plugins/agent-box-web/src/agent_box_web/application/ownership.py
src/agent_box/server/__init__.py             -> plugins/agent-box-web/src/agent_box_web/server/__init__.py
src/agent_box/server/host.py                 -> plugins/agent-box-web/src/agent_box_web/server/host.py
src/agent_box/server/static.py               -> plugins/agent-box-web/src/agent_box_web/server/static.py
```

`facade.py` imports only root `config`, `extensions.finalization`,
`work_core.Ref/RefType`, `work_core.repository`, `work_core.services`, and
its local `OperationStore`. Those are legitimate Host→Core/SDK dependencies.
`server/host.py` additionally imports root extension bootstrap and config;
these stay root. Do not move `extensions/finalization.py` with the Web code.

The target package should contain no direct SQLite access beyond the existing
Core repository/service API. The operation journal and drafts continue to use
their existing JSON files.

### Frontend and build metadata

Move the current production frontend from `gui-web/` to
`plugins/agent-box-web/frontend/`. The production source set is every listed
path below; preserve relative imports and the `base: './'` Vite setting:

```text
package.json                 package-lock.json
vite.config.ts               tailwind.config.ts
tsconfig.json                tsconfig.app.json
tsconfig.node.json           index.html
.npmrc                       .gitignore
.oxlintrc.json               .prettierrc
eslint.config.js             README.md
public/**                    src/** except src/prototype/**
```

The precise current production `src` groups are:

```text
src/App.tsx                  src/main.tsx
src/index.css                src/workbench.css
src/app/**                   src/api/**
src/features/works/**        src/features/executions/**
src/features/harnesses/**    src/shared/**
src/i18n/**                   src/icons/extracted/**
src/lib/**                   src/tokens/**
src/types/**                 src/test/setup.ts
```

`src/App.tsx` is already only a compatibility re-export of `app/App`; keep
it during the move so imports do not break, but do not make it a second app.
The existing frontend unit test is `src/lib/path.test.ts`; it moves with
`src/lib`.

Do not move generated or local files:

```text
dist/**, node_modules/**, __pycache__/**, *.pyc, nul
```

### Tests

The following tests are Web Host tests and should move to
`plugins/agent-box-web/tests/` (renaming only to avoid root-path assumptions):

```text
tests/test_host_operations.py       -> tests/test_operations.py
tests/test_web_static.py            -> tests/test_static.py
tests/test_web_product_loop.py     -> tests/test_product_loop.py
tests/test_web_harness_profile_e2e.py -> tests/test_harness_profile_e2e.py
```

The two browser tests are cross-plugin acceptance tests. They may live in the
Web plugin test package, but their test environment must explicitly install
or expose `agent-box-git` and `agent-box-harnesses`; they must not rely on
the repository root's accidental `sys.path` state. The existing frontend
`src/lib/path.test.ts` moves with the frontend. Core and extension tests stay
in root. `tests/test_plugins_cli.py` stays root because it tests the generic
plugin CLI, not Web behavior.

The browser tests currently import `create_server` from
`agent_box.server.host` and pass `gui-web/dist` explicitly. Update the
successor tests to import `agent_box_web.server.host` and pass
`frontend/dist` (or use the plugin locator); retain the same assertions and
E1→E2 facts. Do not weaken them to page-text-only tests.

## Target tree

```text
plugins/agent-box-web/
├── pyproject.toml
├── README.md
├── src/
│   └── agent_box_web/
│       ├── __init__.py
│       ├── application/
│       │   ├── __init__.py
│       │   ├── facade.py
│       │   ├── operations.py
│       │   └── ownership.py
│       ├── server/
│       │   ├── __init__.py
│       │   ├── host.py
│       │   └── static.py
│       └── cli.py
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── public/
│   ├── src/                  # production source only
│   └── vite.config.ts
├── prototype/                # optional retained research artifact; never wheel/build input
└── tests/
    ├── test_operations.py
    ├── test_static.py
    ├── test_product_loop.py
    └── test_harness_profile_e2e.py
```

`prototype/` is not part of the formal plugin runtime. The current
`gui-web/src/prototype/**` and `gui-web/prototype.html` can be retained there
for design/history, or deleted only under the already-approved retirement
ledger. In either case, Vite's production entry remains `src/main.tsx` and
the prototype is excluded from lint/build/test/package inputs. It must not be
silently reintroduced into the production frontend.

The old Python bridge files (`bridge.py`, `rpc_server.py`, `data_linux.py`,
`data_wsl.py`) and PyWebView artifacts are retired/deleted-as-replaced; they
are not a migration source for this plugin.

## CLI and compatibility seam

Keep the root `agent-box` parser and command names. Change only the Web
handler to a lazy delegate:

```python
def cmd_web(args):
    from agent_box_web.cli import run
    return run(host=args.host, port=args.port, open_browser=not args.no_browser)
```

`agent_box_web.cli` owns browser opening, `run_server`, Web static discovery,
and the Web-specific readiness checks. The root parser still defines
`web --host --port --no-browser`; this preserves shell compatibility and keeps
the root CLI a client/dispatcher. The root `doctor` command keeps its stable
JSON shape, but calls an optional Web readiness function when the Web package
is installed. If it is absent, `doctor` should report a stable
`web_plugin: missing`/`frontend_static_build: false` result rather than fail
with an import traceback.

During one compatibility release, root modules can be lazy shims:

```text
agent_box.application.* -> import/delegate to agent_box_web.application.*
agent_box.server.*      -> import/delegate to agent_box_web.server.*
```

They must contain no duplicate implementation and must emit an actionable
missing-extra error if `agent-box-web` is not installed. Move the Web tests to
the plugin so the root wheel no longer needs these shims for its own runtime.
Remove the shims after downstream import usage has been measured or the
compatibility window expires. Do not make root `agent-box-cli` depend directly
on the Web package (the Web package necessarily depends on the root SDK);
provide a root optional extra such as `agent-box-cli[web]` that installs
`agent-box-web`.

## Plugin/provider/selector/HostControl discovery

`agent-box-web` is not an `agent_box.plugins` entry point. Installed provider
plugins continue to be discovered by the root
`build_extension_registry(strict=False)`. The Web server receives the
resulting `(registry, report)` and the facade derives:

```text
READY PluginRegistration.resource_selectors -> selector choices/prepare
READY PluginRegistration.host_controls       -> observe/finish/attach
READY PluginRegistration.harness_managers    -> Harness/Profile API
registry.execution/resource providers        -> provider and dispatch APIs
```

This preserves the current generic behavior: a Web page sees selector IDs,
contract IDs, fields, provider descriptors, and harness descriptors, not
provider-specific Python modules. Web must never import `agent_box_git`,
`agent_box_codex`, `agent_box_tmux`, or `agent_box_harnesses` directly.

If a future Web plugin needs declarative UI metadata, add a bounded SDK
read-model protocol; do not add arbitrary frontend injection or a new Core
entity. The browser remains a client of the Web Host API.

## Facade, operation persistence, and mutation ownership

All three belong to the Web Host application package after migration:

- `HostApplication` owns use-case sequencing and read-model projection;
- `OperationStore` owns bounded, atomic JSON operation records and restart
  recovery to `interrupted`;
- `MutationOwner` admits exactly one mutating Host per Agent-Box home;
- Core services/repository remain the only writer of durable Core facts;
- plugin providers remain the authority for external effects and exact Refs.

No Web route should construct a Core repository independently, invoke a
provider without going through the facade, or treat operation status as Core
terminal truth. The existing `HostFinalizationCoordinator` remains in root
extensions because it is provider-neutral SDK orchestration used by any Host.

## Packaging and static assets

Create `plugins/agent-box-web/pyproject.toml` with a normal setuptools package
(`where = ["src"]`) and dependency `agent-box-cli>=1.9.0`. Add a `test` extra
for pytest/Playwright if desired. The Web distribution should own its static
build; remove the root `pyproject.toml` `share/agent-box/web` data-files rule
once the compatibility release is complete.

The current root rule packages only `index.html` and `assets/*`, while the
current Vite output also contains root `icons.svg`, `logo.png`, and `logos/*`.
The successor must package the complete `frontend/dist/**`, not just the JS
asset directory. Recommended deterministic layout:

```text
frontend/dist/                 # generated and ignored
src/agent_box_web/_static/     # build-time copy, also generated/ignored
```

Copy the complete dist tree into `_static` as part of the wheel build (or use
a documented setuptools build hook), declare it with
`[tool.setuptools.package-data] agent_box_web = ["_static/**"]`, and have
`locate_web_static()` first honor `AGENT_BOX_WEB_STATIC`, then source
`frontend/dist`, then `importlib.resources` `_static`. A `data-files` layout
under `share/agent-box/web` is acceptable only if the recursive asset set is
explicitly covered and tested. Preserve the existing environment override.

Clean-wheel acceptance must prove:

1. root wheel has no Web Python implementation or frontend data;
2. Web wheel contains the complete static tree;
3. fresh venv installing `agent-box-cli[web]` (or both wheels) runs
   `agent-box web --no-browser` on loopback;
4. `/`, hashed routes, `/api/v1/health`, and plugin/provider/selector routes
   work without Vite or a source checkout;
5. `doctor --json` reports static readiness from the installed Web wheel;
6. no `prototype`, `node_modules`, `dist` source cache, PyWebView, TUI, or
   credentials enter either wheel.

## Migration order

1. Record a pre-migration file list and preserve the current behavior gate.
2. Scaffold `agent-box-web` and move backend files without semantic edits.
3. Move production frontend and update Vite paths; keep prototype isolated.
4. Add the plugin CLI and static locator; update root CLI to lazy delegates.
5. Add temporary root import shims only if compatibility is required.
6. Move Web operation/static/browser tests and update imports/path setup.
7. Remove root static data packaging and add Web wheel asset packaging.
8. Build frontend, build both wheels, and run fresh-venv smoke tests.
9. Run Python compile/tests, frontend test/lint/build, browser E1→E2, and
   `git diff --check`.
10. After a compatibility window, delete shims and stale root Web files;
    record every deletion in the legacy disposition ledger.

## Risks and required mitigations

| Risk | Mitigation |
|---|---|
| Existing users import `agent_box.server` or `agent_box.application` | one-release lazy shims; no second implementation |
| `agent-box web` installed without Web extra | stable actionable missing-plugin error |
| root wheel loses static assets or `doctor` reports false negative | Web wheel owns complete recursive dist; installed-wheel smoke test |
| source locator still points at `gui-web/dist` | transition fallback, then switch to `plugins/agent-box-web/frontend/dist` |
| tests accidentally rely on repo `sys.path` | install plugin wheels or set explicit plugin source paths in test config |
| browser API origin/hash fallback changes during move | keep endpoint paths and `base: './'`; rerun browser vertical |
| Web starts a second mutation owner during import | preserve lock acquisition before repository/migration/provider effects |
| provider-specific leakage enters Web | enforce generic registry/report injection and import audit |
| prototype or generated files enter wheel | separate prototype tree and explicit package/build exclusions |
| operation/draft files are mistaken for Core migrations | keep existing `$AGENT_BOX_HOME/host` locations and JSON formats |

## Acceptance matrix

```text
agent-box plugins list --json                         root CLI regression
agent-box doctor --json                               generic + Web readiness
agent-box web --no-browser                            lazy Web delegate
python -m compileall                                   root + Web package
pytest root Core/extension suite                       Core unchanged
pytest plugins/agent-box-web/tests                    Host/static/browser tests
cd plugins/agent-box-web/frontend && npm ci && npm run test:run
cd plugins/agent-box-web/frontend && npm run lint && npm run build
fresh venv + clean wheels                              installed static/API smoke
Playwright E1→E2                                      Work/Execution/evidence gate
git diff --check                                      whitespace gate
```

The browser vertical must retain its current durable assertions: E1 and E2
are distinct, output Ref identity equals E2 input Ref, Git worktrees remain
independent, and Evidence/finalization facts come from the Host/Core API.
