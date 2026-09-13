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

## First-round Stage C completion audit

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

# Round-two Stage B verification

## Isolation and fixed inputs

The second screen used the owned temporary root
`/tmp/agentbox-harness-selection-38-round2.3oxRoE`, marked by
`.agentbox-owner` with exact content
`agentbox-work-order-38-round2-research`. Candidate checkouts, dependency stores,
homes, XDG directories, logs, and generated builds stayed below that root,
except for two corrected operational deviations recorded below.

Platform: WSL2 Linux x86_64, Node `v22.23.2`, npm `10.9.8`, pnpm `11.26.0`.
No Go executable is installed on this host. All executable tests used `env -i`
with an explicit Node/system `PATH`, owned `HOME`, XDG and temporary paths, and
only the candidate/research variables required by the runner. No native Harness,
provider, model, login, or credential operation ran.

Round-two source inputs were:

- `beyond5959/acp-adapter` tag `v0.3.8`, peeled commit
  `491151b16846682396aca8c31e9285e414e4f3b8`;
- `openclaw/acpx` commit
  `ffbefbbb726b1fd4623b8e51708a17d21b10b576`, five days newer than the
  distinct `v0.15.1` tag while still declaring package version `0.15.1`.

The acpx lock was installed with scripts disabled into an owned pnpm store, then
its published runtime entry point and candidate-owned fake peer were built. The
committed experiment imports `dist/runtime.js`; it does not copy or replace the
candidate's ACP implementation.

## Commands and results

### `acp-adapter`

The intended candidate-owned fake suites could not start because the host has
no Go toolchain:

```text
cd /tmp/agentbox-harness-selection-38-round2.3oxRoE/checkouts/acp-adapter
env -i \
  HOME=/tmp/agentbox-harness-selection-38-round2.3oxRoE/acp-adapter/home \
  XDG_CONFIG_HOME=/tmp/agentbox-harness-selection-38-round2.3oxRoE/acp-adapter/xdg \
  GOCACHE=/tmp/agentbox-harness-selection-38-round2.3oxRoE/acp-adapter/gocache \
  GOMODCACHE=/tmp/agentbox-harness-selection-38-round2.3oxRoE/acp-adapter/gomodcache \
  GOPATH=/tmp/agentbox-harness-selection-38-round2.3oxRoE/acp-adapter/gopath \
  TMPDIR=/tmp/agentbox-harness-selection-38-round2.3oxRoE/acp-adapter/tmp \
  PATH=/usr/local/go/bin:/usr/bin:/bin \
  go test ./pkg/codexacp ./pkg/claudeacp ./pkg/piacp -count=1
result: exit 127; env: ‘go’: No such file or directory
```

The failure occurred before a test binary or fake peer ran. Static source review
confirmed the three embedded runtime APIs and their fixture suites, but this
round records every behavior as source-backed/unverified rather than passed.
The prepared narrow selectors deliberately exclude `*_real_e2e_test.go` and
all real-provider tests.

### `acpx`

```text
cd /tmp/agentbox-harness-selection-38-round2.3oxRoE/checkouts/acpx-review
env -i <owned HOME/XDG/cache/tmp and fixed Node PATH> \
  pnpm install --frozen-lockfile --ignore-scripts \
  --store-dir /tmp/agentbox-harness-selection-38-round2.3oxRoE/acpx/pnpm-store
result: exit 0; 395 packages installed from the fixed lock; lifecycle scripts disabled

env -i <same isolation> pnpm run build:quiet
result: exit 0

env -i <same isolation> pnpm run build:test
result: exit 0

env -i <same isolation> \
  ACPX_CHECKOUT=/tmp/agentbox-harness-selection-38-round2.3oxRoE/checkouts/acpx-review \
  AGENTBOX_RESEARCH_ROOT=/tmp/agentbox-harness-selection-38-round2.3oxRoE \
  node --test \
  docs/server-round1/harness-selection/experiments/acpx_round2_stage_b.test.mjs
first run: exit 1; 0 passed, 2 failed because the experiment expected the
           reconnect response to rewrite the public handle immediately and
           expected the asynchronous exit observer before it had settled
corrected run: exit 0; 2 passed, 0 failed
```

The corrected assertions follow candidate semantics: a reused persistent handle
keeps its checkpointed native id until the next prompt reconnects; `getStatus`
then reports the resume response's native id. The process exit observer is
best-effort asynchronous, so the experiment waits within a fixed two-second
bound instead of racing it. No candidate code or fixture was changed to make the
run pass.

Candidate-owned directed suites also passed:

```text
env -i <same isolation> node --test \
  --test-name-pattern='AcpClient (handlePermissionRequest short-circuits|onPermissionRequest decision short-circuits|onPermissionRequest cancels a late decision|onPermissionRequest treats abort rejections)' \
  dist-test/test/client.test.js
result: exit 0; 4 passed, 0 failed

env -i <same isolation> node --test dist-test/test/spawn-options.test.js
result: exit 0; 40 passed, 0 failed
```

The second suite covers child environment precedence/validation, protected auth
keys, actual controlled child spawning, Windows batch argv handling, WSL path
translation and bounded helper termination. Because the outer environment was
empty except for explicit test variables, it did not inspect or copy a real
credential.

## Observed behavior and limits

| Required behavior | `acp-adapter v0.3.8` | `acpx ffbefbb` | Evidence limit |
| --- | --- | --- | --- |
| Event before run end | Source and fake tests exist; **not executed** | **PASS:** candidate runtime emitted `visible-before-result` while `turn.result` was unresolved | acpx used its own fake ACP peer, not a real Harness |
| Native identity/resume | Codex/Pi/Claude source paths present; **not executed** | **PASS at ACP host boundary:** exact backend session id survived close/reconnect and the resume response updated the namespaced native id after the next prompt | The fake labelled Cod native id; no Codex/Pi/Claude binary ran |
| Cancel versus disconnect | Separate source paths exist; **not executed** | **PASS:** explicit cancel returned `status=cancelled`; peer exit 91 returned `status=failed` and a lifecycle exit record | WSL/Windows descendant-tree cleanup remains unproven |
| Approval | Source permission bridges exist; **not executed** | **PASS:** host callback rejected an edit request and the peer observed `reject`; candidate tests prove stale decisions are cancelled | Production must use `deny-all` plus callback; callback failure otherwise falls through to the configured mode |
| Invalid capability/config | Source validation exists; **not executed** | **PASS:** an unadvertised config key was rejected; advertised reasoning effort was accepted and returned | Generic ACP configuration only |
| Two different Harness-specific capabilities | Codex, Pi and Claude paths are source-backed; **not executed** | **NOT PROVEN:** plans/config/commands are normalized, but the experiment used one generic ACP fixture and no second fixed native adapter | This blocks a fully qualified backup claim |
| Codex app-server | Implemented in `internal/codex`; **not executed** | **Inherited lower-component evidence only:** acpx does not implement it; its default Codex entry points to a ranged Codex ACP package | The first-screen fixed Codex ACP test is not rerun or reattributed to acpx |
| Isolation and supply chain | Host injection required; Windows installer unsupported | **PARTIAL:** injected absolute argv, in-memory store, outer `env -i`, owned homes, and lifecycle hooks worked; default ranges/`npx` were bypassed | acpx itself merges its parent environment, so the Worker must launch its sidecar with a minimal environment |

The experiment establishes that acpx is a credible embeddable ACP host. It does
not establish that acpx plus its default registry is a complete, pinned,
native-capability-preserving Harness implementation. Its public contract keeps
structured tools, plan snapshots, model/config controls, commands, permissions,
usage, selected turn `_meta`, and typed failure, while intentionally allowing
only selected origin metadata and reducing some command/config schemas. A full
backup qualification would still require two fixed lower adapters with distinct
native extension behavior and an exact offline artifact closure.

`acp-adapter` remains the strongest newly found source-level backup because its
three lower implementations and embedded APIs are in one MIT repository without
a product database or scheduler. The missing Go toolchain prevents it from
becoming behavior-qualified in this round.

## Operational deviations and cleanup evidence

- A Paseo install attempt created `/tmp/paseo-research-home.1m341Z`,
  `/tmp/paseo-research-cache.Bsmp5z`, `/tmp/wsl-rg.out`,
  `/tmp/windows-rg.out`, and `/tmp/install-rg.out` outside the owned root. The
  responsible reviewer stopped only its own npm processes, removed those exact
  paths, and verified each path absent. No global install completed.
- One acpx `build:test` invocation accidentally set `HOME` to the unique path
  `/tmp/DUMMY?`. pnpm created only `.local/state/pnpm` and `.local/share/pnpm`
  there. The path was identified as owned by this run, removed exactly with a
  Python directory operation, and verified absent. The build output itself
  stayed in the owned checkout.
- The first CodexHost shallow clone stalled in its owned process group. That
  exact group was terminated; a large archive request timed out and left a
  zero-byte file inside the owned root. Fixed-commit GitHub tree and raw files
  were then used for source review. No user or unrelated process was touched.
- Several low-priority partial clones were stopped only by their exact owned
  process groups after higher-signal source candidates were available. They
  remained below the marker-owned research root until the final cleanup.

The final process audit found zero live processes referencing the owned root.
The marker content (`agentbox-work-order-38-round2-research`) and pointer path
were validated exactly, then
`/tmp/agentbox-harness-selection-38-round2.3oxRoE` and
`/tmp/agentbox-harness-selection-38-round2.current` were removed. Both are
absent, as are every explicitly listed out-of-root deviation path. No user or
unrelated path was removed.

## Round-two completion audit

- Source versions and evidence levels agree across README, search coverage,
  candidate table, boundary, verification, and status.
- The diff from first-round checkpoint `3611d0e` contains only
  `docs/server-round1/harness-selection/**` and
  `docs/implementation/status.md`. Production source, dependency metadata,
  lockfiles, prior reports, and sibling repositories are unchanged.
- Work Orders 37 and 38 intersect only at the broad report/status declarations;
  37 remained paused and the status update was serialized. Desktop 36R has no
  shared write path.
- Repository-local Markdown links resolve, `git diff --check` succeeds, and
  explicit staging is limited to the six final Stage C document paths.
- The second-round research root and pointer are absent after marker-checked
  cleanup. The process audit found no owned live process, and all explicitly
  recorded out-of-root paths are absent.
- There were zero native Harness/provider/model/login calls and zero
  credential-content reads.
