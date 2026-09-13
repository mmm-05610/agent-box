# Work Order 38 verification log

## Research isolation

- Owned temporary root: `/tmp/agentbox-harness-selection-38.otEluD`
- Owner marker: `.agentbox-owner`, exact content
  `agentbox-work-order-38-research`
- Candidate checkouts: one directory per fixed repository under `checkouts/`
- Isolated home and log roots: `homes/` and `logs/`
- Baseline check: `git merge-base --is-ancestor 67c6b40 HEAD`, exit `0`
- Initial worktree: clean on `feature/server-http-codex-r1`

The root contains public third-party source and generated dependency trees only.
Experiments clear inherited provider/token/auth variables, set controlled HOME
and XDG roots, and do not issue login or model calls. It will be removed after
the committed evidence no longer depends on ephemeral files.

## Stage B method and platform

Platform: WSL2 Linux `6.18.33.2-microsoft-standard-WSL2`, x86_64, Node
`v22.23.2`, npm `10.9.8`, Python `3.12.3`.

Every Stage B runner used `env -i` with only a fixed `PATH` and controlled
`HOME`, `XDG_CONFIG_HOME`, and `XDG_DATA_HOME` under the owned research root.
This removes inherited provider, token, auth, proxy, and model configuration
without inspecting their values. Installs used the candidates' locks with
`npm ci --ignore-scripts --no-audit --no-fund`. No global package or user
configuration changed.

The committed experiments import the fixed third-party modules. Their fake
children are controlled protocol peers, not replacement adapter
implementations:

- [harness-remote experiment](experiments/harness_remote_stage_b.test.mjs)
- [agent-controller experiment](experiments/agent_controller_stage_b.test.mjs)
- [codex-acp app-server seam](experiments/codex_acp_stage_b.test.mjs)

## Behavior matrix

| Required behavior | `harness-remote v3.0.2` | `agent-controller` fixed commit | Evidence limit |
| --- | --- | --- | --- |
| Event before run end | PASS: imported `AcpClient` received `session/update` before the `session/prompt` response. Candidate test `omp-acp-lifecycle` also reads reasoning, tool activity, and text while the turn is running. | PASS at imported translator seams: Codex command events, OpenCode deltas/tools, and Claude text/tool calls precede terminal events. Pi's own package is imported. | Fake peer/translator behavior; no real provider or Harness timing claim. |
| Native resume parameter and identity | PASS: imported `AcpService` retains the native id and calls advertised `session/resume`; candidate tests cover `session/load` fallback and strict missing-session refusal. | PASS: Codex builds `exec resume <native-thread-id>`; Claude switches from deterministic first id to SDK-issued `Options.resume`; stable isolated state paths are verified. | Agent Controller's Codex identity is real CLI semantics but the transport violates the app-server target. |
| Cancel versus disconnect | PASS: `AcpService.abort` emits `session/cancel`; an ACP child exit rejects the in-flight request with an adapter-exited error. OMP candidate tests cover cancellation without inventing a transcript event. | PARTIAL: OpenCode source has a distinct signal/AbortController `cancelled` path and treats SSE EOF before idle as error. Its full fixed suite passed, but the added experiment only imports the translator and inspects the adapter source for this distinction. Pi/Codex/Claude have no cancellation parity. | Agent Controller real signal behavior and all Windows process behavior remain unproven. |
| Two Harness-specific capabilities | PASS: OMP native undo/redo accepts only matching process/runtime/session hash and revision authority; OpenCode starts a managed authenticated server with its HTTP/SSE contract and Windows command-tree branch. | PASS: OpenCode native permission/MCP config and tool states; Claude native SDK session/tool mapping; Pi's upstream subagent extension import; Codex native sandbox/MCP translation also pass. | Invocation and mapping are proven; no provider execution. |
| Unknown capability/invalid parameter rejection | PASS: an unadvertised model variant is rejected before `session/set_config_option`; unknown backend and unsupported agent requests are rejected by fixed source/tests. | PASS at adapter boundary for unsupported extensions, providers, MCP transports/names, and unsafe session ids. The higher RuntimeBinding capability matcher defaults to warn/proceed unless strict, so it cannot be AgentBox's enforcement authority. | AgentBox must validate its own system contract before dispatch while leaving branded validation in the third-party adapter. |

## Exact experiment commands

The `PATH` shown here was the WSL test host's fixed Node/system path. A repeat
may substitute an equivalent reviewed Node 22 path.

```text
env -i PATH=/home/maoqh/.nvm/versions/node/v22.23.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  HOME=/tmp/agentbox-harness-selection-38.otEluD/homes/stage-b \
  XDG_CONFIG_HOME=/tmp/agentbox-harness-selection-38.otEluD/homes/stage-b/config \
  XDG_DATA_HOME=/tmp/agentbox-harness-selection-38.otEluD/homes/stage-b/data \
  HARNESS_REMOTE_CHECKOUT=/tmp/agentbox-harness-selection-38.otEluD/checkouts/harness-remote \
  AGENTBOX_RESEARCH_ROOT=/tmp/agentbox-harness-selection-38.otEluD \
  node --test docs/server-round1/harness-selection/experiments/harness_remote_stage_b.test.mjs
result: exit 0; 6 passed, 0 failed

env -i <same PATH/HOME/XDG values> \
  AGENT_CONTROLLER_CHECKOUT=/tmp/agentbox-harness-selection-38.otEluD/checkouts/agent-controller \
  AGENTBOX_RESEARCH_ROOT=/tmp/agentbox-harness-selection-38.otEluD \
  node docs/server-round1/harness-selection/experiments/agent_controller_stage_b.test.mjs
result: exit 0; PASS

cd /tmp/agentbox-harness-selection-38.otEluD/checkouts/codex-acp-1.1.14
npm ci --ignore-scripts --no-audit --no-fund
npm run build
env -i <same PATH and controlled HOME/XDG values> \
  CODEX_ACP_CHECKOUT=$PWD \
  AGENTBOX_RESEARCH_ROOT=/tmp/agentbox-harness-selection-38.otEluD \
  node --import tsx \
  /home/maoqh/projects/agent-box-server-round1/docs/server-round1/harness-selection/experiments/codex_acp_stage_b.test.mjs
result: exits 0/0/0; fake app-server observed argv ["app-server"], initialize replied,
        thread/resume retained "thread-1", turn/interrupt produced an
        interrupted turn/completed notification
```

The first Codex ACP experiment was also run against the current reference
`v1.11.1-preview.2`; it passed. Qualification uses `v1.1.14` because that is
the exact package selected by `harness-remote v3.0.2`.

## Candidate-owned narrow tests

```text
harness-remote$ env -i <controlled PATH/HOME/XDG> node --test \
  bridge/test/acp-client.test.js \
  bridge/test/acp-prompt-idle-timeout.test.js \
  bridge/test/acp-provider-error.test.js \
  bridge/test/acp-service-model-variant.test.js \
  bridge/test/harness-capability-contract.test.js \
  bridge/test/omp-acp-lifecycle.test.js \
  bridge/test/opencode-host.test.js \
  bridge/test/task-launcher-resume.test.js \
  bridge/test/task-multiharness-handoff.test.js \
  bridge/test/task-multiharness-recovery.test.js \
  bridge/test/turn-failure-visibility.test.js
result: exit 0; 68 passed, 0 failed

agent-controller/runtime-codex$ env -i <controlled PATH/HOME/XDG> npm test
result: exit 0; build passed; 109 passed
agent-controller/runtime-opencode$ env -i <controlled PATH/HOME/XDG> npm test
result: exit 0; build passed; 103 passed
agent-controller/runtime-claude$ env -i <controlled PATH/HOME/XDG> npm test
result: exit 0; build passed; 95 passed
agent-controller/runtime$ env -i <controlled PATH/HOME/XDG> npm test
result: exit 0; 115 passed
```

The Pi suite emitted expected fixture warnings for intentionally missing fake
skill paths; all tests passed. The four Agent Controller suites total 422 tests.
The Harness Remote selection totals 68 candidate tests plus 6 external seam
tests.

## Codex app-server and binary version result

`harness-remote` launches `@agentclientprotocol/codex-acp@1.1.14`. The peeled
source commit is `5faefec5d55ded33c54b68ffec93def4f6c547f5`.
`CodexJsonRpcConnection.ts::startCodexConnection` launches the supplied Codex
path with exactly `app-server`, or uses the package's bundled Codex executable.
The imported implementation completed a controlled JSON-RPC initialize,
thread resume, interrupt, and terminal event round trip.

The adapter manifest permits `@openai/codex ^0.147.0`; its lock resolved
`0.147.0`, which provides a reproducible default. Supplying `CODEX_PATH`
bypasses that locked binary, and the adapter performs no explicit min/max or
protocol-version compatibility check before initialize. The proposed boundary
must therefore reject unapproved custom binaries and pin adapter plus bundled
Codex as one artifact until a future adapter exposes a reliable version gate.

## Unverified and negative results

- No experiment contacted a real provider or ran a real Harness turn. Fake-peer
  conformance establishes adapter behavior only.
- No Windows process ran. Harness Remote has tested Windows branches for
  `cmd.exe` and `taskkill /T`; actual Windows/WSL path, signals, and process-tree
  ownership remain an implementation acceptance gate.
- No disconnect/reconnect recovery was proven against a real ACP or OpenCode
  server. Harness Remote source has SSE reconnect and recovery code; the tests
  establish selected state transitions only.
- Harness Remote ACP processes inherit the supplied environment and its history
  loaders fall back to OS home. It is safe only when Worker always supplies a
  minimal environment plus isolated native home roots. This was a test harness
  condition, not an intrinsic guarantee.
- Harness Remote profiles are statically registered. Agent Controller supports
  manifest discovery and runtime-command override, but its Harness adapter set
  is still compiled and its capability matcher can warn rather than reject.
  A user extension marketplace and untrusted plugin sandbox are not present in
  either candidate.
- Hermes is absent from both deep candidates. This does not block a multi-
  Harness recommendation, but Hermes cannot be advertised until a separately
  reviewed existing adapter is registered.
- Agent Controller's Codex runtime uses `codex exec`, so that runtime is a hard
  fail for AgentBox. Replacing it with Codex ACP would require a new lifecycle
  translator from its ADL/wire protocol; Stage B found no existing source for
  that translator and does not treat writing one as thin glue.

## Stage C completion audit

- State and source versions agree across README, candidate table, boundary,
  status, and experiments: Harness Remote `v3.0.2` at
  `21ce6db49af708c4c7c3f96ef6a50f62dced8dab`; its selected Codex ACP
  `v1.1.14` at `5faefec5d55ded33c54b68ffec93def4f6c547f5` with locked bundled Codex
  `0.147.0`.
- Manifest collision review is declarative because no dedicated collision tool
  exists. Work Order 38 and paused 37 overlap only at the broad
  `docs/server-round1/**` report root and `docs/implementation/status.md`; 38
  created only `docs/server-round1/harness-selection/**` and serialized the
  status edit. Desktop 36R has no shared write path.
- Production `src/`, `plugins/`, `workers/`, `protocols/`, `tests/`, project
  metadata, and lockfiles were unchanged. No sibling repository was written.
- `git diff --check` exited `0`. All repository-local Markdown links in the
  Harness selection report resolved. Final staging used explicit Work Order 38
  paths only.
- The research root owner marker was verified before cleanup. The exact owned
  root `/tmp/agentbox-harness-selection-38.otEluD` and its pointer file were
  removed; neither exists after cleanup. No user cache or unrelated temporary
  directory was removed.
- One Stage C npm metadata lookup accidentally used the default npm cache before
  the cache override was applied. It may have updated `~/.npm/_cacache`; the
  exact debug log it created was removed after its path and metadata were
  verified. It did not install a package or change npm configuration. All
  subsequent lookups used the isolated research cache. Shared cache entries were
  left untouched because their ownership could not be proven.
- There were zero model/provider calls, login calls, and credential-content
  reads. All behavior evidence remains fake-peer or controlled-subprocess
  evidence with the limitations above.
