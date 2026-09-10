<p align="center">
  <img src="assets/banner.png" alt="Hermes Agent" width="100%">
</p>

# Hermes Desktop

The native desktop client for Hermes Agent: an Electron + React app that talks
to a Hermes runtime running as a headless `hermes serve` process.

**This repository is the client only.** It ships no Hermes runtime, no CLI, no
terminal UI and no browser dashboard — those live in Hermes Agent itself. The
app finds an external `hermes` on your machine (or installs one for you on
first run) and drives it over HTTP + JSON-RPC/WebSocket.

## What's here

| Path | What it is |
|---|---|
| `apps/desktop/` | The Electron app: main process, preload bridge, React renderer, e2e suite |
| `apps/shared/` | Framework-agnostic JSON-RPC WebSocket transport (`JsonRpcGatewayClient`) + WS URL helpers |
| `tests-js/` | Root JS test workspace — cross-workspace contract tests and the Playwright mock server |
| `scripts/` | `dev-sandbox.sh` (isolated dev instance), the Desktop updater, and the Hermes installers the first-run bootstrap uses |
| `docs/` | Repository history: what was pruned and why (`desktop-pruning-*.md`) |

## Requirements

- Node.js 22.22+, 24.11+ or 26+
- Hermes Agent, available in one of these ways:
  - already on your `PATH` (a CLI or pip install),
  - a Desktop-managed install at `~/.hermes/hermes-agent`
    (`%LOCALAPPDATA%\hermes\hermes-agent` on Windows), or
  - nothing at all — the app offers to install it on first launch

## Getting started

```bash
npm install                       # workspace install at the repo root
npm run --workspace apps/desktop dev
```

The app resolves a runtime, spawns `hermes serve --host 127.0.0.1 --port 0`,
waits for readiness, then connects the renderer over WebSocket. If it cannot
find a Hermes anywhere it still starts and says so — it will not fall back to a
runtime bundled in this checkout, because there isn't one.

To run an isolated instance (its own `HERMES_HOME` and Electron user data, so it
cannot touch your real config):

```bash
scripts/dev-sandbox.sh -- npm run dev      # run from apps/desktop/
scripts/dev-sandbox.sh hermes serve        # any other command, same sandbox
```

## Pointing the app at a specific runtime

| Variable | Effect |
|---|---|
| `HERMES_DESKTOP_HERMES` | Use this exact executable (or a path resolvable on `PATH`) |
| `HERMES_DESKTOP_HERMES_ROOT` | Use the Hermes checkout at this directory |
| `HERMES_DESKTOP_IGNORE_EXISTING=1` | Skip the `hermes`-on-`PATH` rung, for testing the no-runtime path |

## Checks

```bash
npm run --workspace apps/desktop typecheck   # renderer + electron + e2e projects
npm run --workspace apps/desktop test        # vitest (ui + electron projects)
npm run --workspace apps/shared typecheck
npm run --workspace apps/desktop lint
npm test --prefix tests-js
```

## License

MIT — see [LICENSE](LICENSE). Hermes Desktop is part of the Hermes Agent
project by Nous Research.
