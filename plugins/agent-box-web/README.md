# Agent-Box Web Host

`agent-box-web` is the optional local Web Workbench Host for Agent-Box. It
owns the HTTP API, Host operations, static asset locator, and production
frontend. It discovers execution, resource, and harness capabilities through
the provider-neutral Agent-Box extension registry.

Install it with the root CLI convenience extra:

```bash
pip install 'agent-box-cli[preview]'
agent-box web
```

For the governed shortcut workflow, use `agent-box launch` or open
`#/quick-launch` in the Workbench. Quick Launch creates a Work and Execution
draft, prepares exact plugin Refs, and opens Binding review; it never freezes
or dispatches without the explicit user action.

The package is a Host distribution and intentionally does not register an
`agent_box.plugins` entry point.

## Build the wheel

Build the production frontend first. Vite writes directly to the package-data
tree and clears it before each build; this is the only static synchronization
step:

```bash
cd plugins/agent-box-web/frontend
npm ci
npm run build
cd ..
python -m pip wheel . --no-deps --wheel-dir dist-wheels
```

The resulting wheel reads `src/agent_box_web/_static/`. Do not copy files by
hand. The build output includes `index.html`, `assets/`, `favicon.svg`,
`icons.svg`, `logo.png`, and `logos/`; prototype files and `node_modules` are
outside the wheel package-data path.
