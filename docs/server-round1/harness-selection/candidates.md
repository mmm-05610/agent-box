# Stage A — candidate screen and source lock

## Decision rule

A qualifying candidate must already implement multiple Harness lifecycles,
retain Harness-specific features behind its own adapter boundary, and be usable
without making AgentBox Core or Server implement branded protocol semantics.
An ACP SDK, one Codex adapter, or a collection of one-shot CLI command builders
does not qualify by itself. At most two candidates enter Stage B.

## Fixed-source comparison

| Candidate | Source pin and release evidence | License and extractable closure | Implemented Harness paths | Stage A result |
| --- | --- | --- | --- | --- |
| `giuliastro/harness-remote` | `21ce6db49af708c4c7c3f96ef6a50f62dced8dab`, tag `v3.0.2`, commit 2026-09-11 | Apache-2.0. `bridge` has no npm runtime dependencies, but its ACP profiles invoke versioned packages with `npx`; their transitive closure is not locked by this repository. | Codex, Claude, Pi, Oh My Pi through ACP; OpenCode through HTTP/SSE. No Hermes implementation found. | **Deep test.** It has real multi-Harness routing plus different proprietary implementations. Supply-chain extraction, inherited environment, static registration, and product-control-plane coupling remain risks. |
| `CCDevelopForFun/agent-controller` | `8b087c270d3b570f34772e2d2ea93a84dfa831ed`, commit 2026-08-28. No Git tag/release was returned; package manifests say `0.7.0`. | MIT at root and runtime packages. Lockfiles pin the four runtime dependency graphs. Main direct dependencies observed: Pi packages `0.84.3` (MIT), OpenCode SDK `1.15.12` (MIT), OpenTelemetry (Apache-2.0), Claude Agent SDK `0.3.220` with its own bundled license terms. | Pi SDK, OpenCode SDK/server, Claude Agent SDK, and Codex `exec --json`. No Hermes implementation. | **Deep test with a Codex hard caveat.** Its adapters are separable subprocess packages and preserve proprietary settings, but its Codex runtime uses `codex exec`, not app-server. A qualifying recommendation must replace only that lower adapter with an existing app-server adapter; rewriting its lifecycle is disallowed. |
| `twaldin/harness` | `f75dee4fd8f64d9357fb2862741f87ddb313250d`, commit 2026-09-10; no repository tag found. Python package `0.3.22`, TypeScript package `0.2.27`. | MIT. `uv.lock` and `ts/bun.lock` pin dependencies; third-party license texts are not vendored. | 26 one-shot CLI adapters. Live backends exist for Pi, OpenCode, Claude and others, but not Codex or Hermes. Codex uses `codex exec`; Hermes only parses a CLI session id. | **Eliminate.** Codex app-server is explicitly unsupported/deferred and Hermes has no live backend. The library has no unified live event/resume/approval/cancel boundary across the target set. |
| `agentclientprotocol/codex-acp` | Current reference: `effb0fe670a49dfbb5071764b5f8a2e3c09e2393`, tag `v1.11.1-preview.2`. The version actually selected by `harness-remote v3.0.2` is tag `v1.1.14`, peeled commit `5faefec5d55ded33c54b68ffec93def4f6c547f5`. | Apache-2.0. Selected `v1.1.14` requires `@openai/codex ^0.147.0` and ACP SDK `^1.3.0`; its lock resolves exactly `0.147.0` and `1.3.0`. | Codex only. Starts Codex app-server and translates its lifecycle to ACP. | **Reference/lower component only.** It cannot count as a multi-Harness solution. It closes the Codex app-server gap inside `harness-remote`; its custom `CODEX_PATH` has no runtime binary compatibility check. |

License observations are engineering inventory rather than legal advice. Before
distribution, the chosen fixed package tarballs and every production dependency
must be scanned from the final lockfile/SBOM; Stage A did not execute package
install scripts.

## Source call paths behind the decisions

### `harness-remote`

- `bridge/src/launcher.js::resolveLaunchPlan` and
  `bridge/src/harness-profiles.js` register and launch Codex, Claude, Pi, OMP,
  and OpenCode as distinct profiles. Codex delegates to `codex-acp`; OpenCode
  takes an independent managed HTTP/SSE path.
- `bridge/src/acp-client.js` owns stdio JSON-RPC initialize/authenticate,
  notifications, permission requests, errors, and child exit.
  `bridge/src/acp-service.js` uses advertised `session/resume` or native
  `session/load`, forwards `session/prompt`, maps streaming updates, and sends
  native `session/cancel`.
- OpenCode-specific execution is in `bridge/src/opencode-host.js`,
  `agent-router.js`, and `managed-event-fanout.js`: managed server launch,
  authenticated health check, one daemon-owned `/global/event` stream, and
  reconnect.
- OMP-specific undo/redo flows through `extension-actions.js` and
  `omp-extension-action-state.js`; it checks the native advertised commands,
  runtime/session authority, and revision token before accepting the action.
- `codex-session-history.js`, `omp-session-history.js`, and
  `pi-session-history.js` read different native journals rather than flattening
  every Harness to prompt/result.

The source also establishes the main adaptation cost. ACP children inherit the
bridge environment; history readers default to user home locations; profiles
are static source objects; no WSL-specific lifecycle exists. AgentBox would
need a narrow extraction from a product control plane and strict Worker-owned
environment/process injection. Stage B must decide whether that remains thin.

### `agent-controller`

- Pi uses `runtime/src/adapter.ts` with `createAgentSession`, resource loaders,
  Pi extensions, MCP, skills, and subagents.
- OpenCode uses `runtime-opencode/src/index.ts::createOpencode`,
  `client.session.promptAsync`, and the SDK event stream.
  `opencode-config.ts` constructs native permissions, MCP, and agents; its event
  translator retains tool success and error events.
- Claude uses `runtime-claude/src/index.ts::query`; `claude-invocation.ts`
  maps SDK-native tools, MCP, subagents, and native session resume.
- Codex uses `runtime-codex/src/index.ts::spawn("codex", ...)`, with
  `codex-invocation.ts::buildCodexArgs` generating `exec`/`exec resume` and MCP
  TOML. This is an implemented adapter, but it violates the required app-server
  target and therefore cannot be used as the recommended Codex path.
- Each runtime reads a compiled spec from stdin and emits NDJSON on stdout.
  Runtime-specific compatibility checks reject fields they cannot preserve.
  This separate-process registration boundary is closer to AgentBox's Worker
  ownership than an in-process branded branch.

OpenCode and Codex adapters explicitly isolate HOME/XDG data in source, while
some fallback directory resolution still uses the operating-system home if
`XDG_DATA_HOME` is absent. The Worker must always supply controlled roots.
There is no WSL-specific implementation and no tagged source release.

### `twaldin/harness` elimination evidence

`src/harness/adapters/__init__.py` registers many one-shot adapters, and
`registry.py` routes their command building and output parsing. However,
`sessions.py::_SESSION_BACKENDS` omits both Codex and Hermes. Codex in
`adapters/codex.py` builds `codex exec --json`; Hermes in
`adapters/hermes.py` only builds `hermes chat` and extracts a session id from
stderr. Its release notes explicitly defer Codex app-server/SDK support. Those
facts are hard failures for the required reusable live lower implementation,
despite useful Pi and OpenCode live code.

## Stage A narrow checks

All commands ran under the owned temporary research root and made no model or
provider request.

```text
harness-remote$ node --test \
  bridge/test/acp-client.test.js \
  bridge/test/acp-session-claim.test.js \
  bridge/test/opencode-host.test.js \
  bridge/test/omp-extension-action-state.test.js
result: exit 0; 33 passed, 0 failed

twaldin-harness$ PYTHONPATH=src python3 -m pytest -q \
  tests/test_registry.py tests/test_new_adapters.py \
  tests/test_model_normalization.py
result: exit 0; 29 passed
```

These tests qualify source seams only. They do not prove behavior against a
real Harness. Stage B will record the already-run fixed dependency tests for
`agent-controller`, then add controlled experiments against the imported
third-party implementations for both deep candidates.

## Stage B entrants

`harness-remote` and `agent-controller` proceed. The former is the strongest
complete multi-Harness product implementation; the latter has the cleanest
out-of-process runtime packages. Neither is selected yet. `codex-acp` remains a
fixed lower-component reference and does not consume a third deep-candidate
slot.
