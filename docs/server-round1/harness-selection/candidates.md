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

The selected Harness Remote profile versions were independently resolved from
the npm registry during Stage C:

| Artifact | Registry license | Integrity / license caveat |
| --- | --- | --- |
| `@agentclientprotocol/codex-acp@1.1.14` | Apache-2.0 | `sha512-6JKLbGYH0/Gcz788U6KnljwSdNvUnXOyjJDOgsWsbwmXbxn/BXH+urF5AciACdgq13+KgAP9O96Kp6h33BgyKg==`; production lock resolves bundled `@openai/codex 0.147.0`. |
| `@automatalabs/pi-acp@0.5.0` | Apache-2.0 | `sha512-dyG1EBgY9SXjvYzu8fZieAYNnuXZGkXCUI0skKSzLDWNpW08mFnOEbWcZ+PPpoC8nUfcSXbtic2ceYUuv6vjIg==`; direct Pi packages `0.84.2` report MIT. |
| `@agentclientprotocol/claude-agent-acp@0.75.1` | Apache-2.0 | Registry metadata was saved and read three times with identical bytes; future production must take the full integrity from its committed lock. Its direct Claude Agent SDK `0.3.257` license says all rights reserved and refers to Anthropic legal terms, so the Claude profile is excluded until license review. |

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

`harness-remote` and `agent-controller` proceeded. The former was the strongest
complete multi-Harness product implementation; the latter had the cleanest
out-of-process runtime packages. `codex-acp` remained a fixed lower-component
reference and did not consume a third deep-candidate slot.

## Stage C disposition

- **Conditional recommendation:** Harness Remote `v3.0.2`, limited to the fixed
  source and artifact boundary in [boundary.md](boundary.md). Its immediate
  static approval response requires one narrow asynchronous resolver patch;
  broader lifecycle changes trigger `NO_FIT`.
- **Eliminated as full backup:** Agent Controller. Its Codex `exec` transport is
  a hard mismatch, and no existing ACP/app-server-to-ADL translator was found.
  Its other runtime packages remain informative component references.
- **Eliminated:** `twaldin/harness` for the live-backend gaps recorded above.
- **Lower component:** Codex ACP is included only inside the Harness Remote
  recommendation and remains insufficient as a multi-Harness project alone.

# Round-two candidate screen

## Why the first conclusion was reopened

The first screen compared the four candidates named in the work order and found
no qualified backup within that set. The phrase “no fully qualified backup” in
the first Stage C decision is therefore limited to those reviewed candidates.
It never established an ecosystem-wide `NO_FIT`. The second screen uses the
broader discovery record in [search-coverage.md](search-coverage.md) and applies
the same fixed-source, native-fidelity, thin-glue, ownership, and license rules.

## Same-standard comparison before experiments

| Candidate | Existing multi-Harness implementation | Native fidelity and Codex path | Reuse closure / ownership | Round-two Stage A result |
| --- | --- | --- | --- | --- |
| Harness Remote `v3.0.2` | ACP profiles for Codex/Claude/Pi/OMP plus native OpenCode HTTP/SSE | Codex delegates to fixed Codex ACP app-server; OMP actions and per-Harness native journals remain distinct | Smallest reviewed source slice, but must remove `npx`, isolate environment/home, exclude its task stores, and carry one approval callback patch | Retained first-screen benchmark and provisional leader; no new test in this round |
| Paseo `d1b705a` | Provider registry contains Codex app-server, OpenCode, Claude, Pi, OMP, and generic ACP implementations | Rich approvals, questions, reasoning, diffs, subagents, compaction, and native resume | Providers depend on Paseo AgentSession/timeline/workspace/process/history types; provider tree is about 105k lines | Source reference; do not experiment because extraction is not thin |
| LinkCode `22c337f` | Common `AgentAdapter` for Codex, Pi, OpenCode, Claude, and Grok | Real Codex app-server and native SDK/server paths; structured approvals/questions and adapter-specific options | About 55k relevant lines plus private workspace packages and daemon assumptions; BUSL-1.1 Competitive Offering clause is a potential applicability blocker for the contemplated paid hosted/embedded use | Do not recommend pending legal/product applicability review; no experiment |
| AgentPool `b6ddbea` | Codex, Claude, and ACP backends inside a large Python agent framework | Codex app-server exists, but approval denial maps to allow; EOF/cancel/finish-reason paths lose fidelity | 20k+ line lower-bound closure, 389 locked packages, storage/jobs/process control plane, import and real-home side effects | **NO_FIT** at fixed source |
| Mjolnir `3ec9163` | Rust ACP worker selects Codex, Claude, Kimi, Grok, DeepSeek, and Muse Harnesses | Real ACP streaming, approval, resume and branded branches | Published crates still pull relay/goal/memory/review/checkpoint/SQLite semantics; GPL-3.0-only | Source reference; extraction is a major separation and license obligations and product compatibility are unresolved |
| `acp-adapter v0.3.8` | Three aligned, embedded Go runtimes: Codex, Claude, Pi | Codex app-server; Pi RPC; Claude stream-json; fake fixtures cover native identity, stream, approval, cancel and errors | About 17.3k Go lines, no third-party Go module dependencies, and no product database/scheduler. Still needs an AgentBox ACP/Go boundary and host-injected native homes | **Stage B entrant 1** |
| `acpx ffbefbb` | Embeddable ACP runtime accepting any injected fixed adapter registry | Strong common session/event/permission/cancel contract; Codex is only indirect through a separately fixed Codex ACP artifact; arbitrary metadata is allowlisted/reduced | About 10.5k runtime/ACP TypeScript lines; store, env, registry, and process lifecycle are injectable. Default registry uses ranges and `npx -y` and must be excluded | **Stage B entrant 2** |
| CodexHost `38903be` | Excellent plugin interface and native Pi/OpenCode/Claude/OMP adapters | Codex app-server is the reserved official Desktop host, not a plugin adapter | Extracting Codex requires the host runtime, thread persistence, approvals/account/remote logic, renderer protocol and Rust shim; four other adapters plus generic runtime exceed 3.1 MB source | Eliminate as a complete candidate; retain contract/reference value |
| Agent API `v0.12.2` | Broad CLI facade plus experimental ACP | Most named CLIs use terminal screen parsing; ACP auto-allows permission and returns empty file/terminal success | No faithful native multi-Harness lifecycle closure | Eliminate |
| Agent Mux `4a27d5` | Go registry and adapters for several named CLIs | Codex hard-codes `codex exec --json`/`exec resume`; common events drop native capabilities | Small enough to inspect, but the required lifecycle is absent rather than merely needing glue | Eliminate |

## Round-two source paths behind the decisions

### Paseo

`packages/server/src/server/agent/provider-registry.ts` registers the actual
provider set. `packages/plugin/src/server/provider.ts` defines the provider
registration/connection lifecycle, while
`packages/plugin/src/server/acp-internal/connection.ts` implements ACP process,
session, prompt, permission, interrupt, configuration, archive, and close.
Codex in `codex-app-server-agent.ts` and `codex/app-server-transport.ts` starts
`codex app-server`, resumes threads, starts/interrupts turns, routes approvals,
and maps streaming reasoning/diff/error events. `opencode-agent.ts` uses the
native SDK/server and retains permission/question, subagent, compaction, todo,
image and error paths. These are real adapters, but they import Paseo session,
timeline, workspace-git, managed-process, MCP and history types throughout.

### LinkCode

`packages/host/agent-adapter/src/registry.ts::createAdapter` registers five
native backends. `adapter.ts` and `base.ts` define the common live lifecycle.
`native/codex/app-server.ts` starts app-server; `native/codex/adapter.ts` owns
thread start/resume, turn start/interrupt, item notifications, command/file
approvals, model/effort and diffs. OpenCode uses its server/SDK/SSE permission
and question APIs; Pi and Claude use native SDKs. The implementation meets the
technical fidelity test, but the private workspace closure and BUSL-1.1 terms
make it unsuitable for the current recommendation.

### AgentPool

`src/agentpool/agents/{codex_agent,claude_code_agent,acp_agent}` contain genuine
integrations. The hard failures are source-visible: Codex maps `skip` and abort
outcomes to allow; its wrapper drops configured environment/binary/profile;
`codexed.Dispatch` leaves requests pending at EOF; cancel failures are swallowed;
and Claude constructs/scans its default `~/.claude` storage even when logging is
disabled. Importing the package also calls dotenv/global registration, while
registry preparation may fetch mutable `latest`, run `npx -y`/`uvx`, or write a
binary under the user home. Fixing all of these plus separating AgentPool's
storage, jobs, process and todo managers is a continuing fork.

### `acp-adapter`

`pkg/{codexacp,claudeacp,piacp}` each export `RunStdio` and
`NewEmbeddedRuntime`; their embedded runtimes use an in-process transport and
expose requests, subscriptions and permission responses. `internal/codex`
implements the app-server supervisor, thread/turn lifecycle, approval registry,
event coalescing and errors. `internal/pi` owns Pi RPC session state, tools,
permissions, commands and cancellation. `internal/claude` drives the
machine-readable `claude -p --output-format stream-json` path. This is a real
library boundary, but Windows installer support is absent, WSL is unverified,
and the host must inject all native state roots and bridge ACP into the Worker.

### `acpx`

`package.json` exports `./runtime`. `src/runtime.ts::createAcpRuntime`,
`src/runtime/public/contract.ts`, and `src/runtime/engine/manager.ts` separate
live events from terminal results and inject `AcpAgentRegistry`,
`AcpSessionStore`, child-only environment, permission policy and process
lifecycle. `src/acp/client.ts` implements initialize/new/load/resume/prompt,
steer, cancel, permission, client filesystem/terminal, models, config, plans,
commands and child-exit failure. `src/agent-registry.ts` is unacceptable in its
default production form because it contains ranges and dynamic `npx`; the
experiment must use only an injected absolute command. Codex app-server remains
a property of the separately supplied adapter, not of `acpx` itself.

### CodexHost

`packages/harness-adapter/src/{text-session,plugin}.ts` and
`packages/host-runtime/src/harness-plugin-loader.ts` form a strong factory and
manifest boundary. Pi, OpenCode, Claude and OMP each have native adapter
packages. However, `packages/shared-contracts/src/harness-plugins.ts` reserves
`codex`, and Codex lives in `host-runtime/src/app-server-host.ts`,
`official-app-server-connection.ts`, Desktop persistence/account control and a
Rust shim. There is no Codex plugin factory to extract alongside the others.

## Stage B entrants and limits

Only `acp-adapter` and `acpx` advance from the new screen. The former is tested
only through its own fake fixtures and only if an isolated Go 1.24 toolchain is
available. The latter may be built with its fixed lock under an isolated home
and exercised against its candidate-owned fake ACP peer with an injected
registry/store/environment. Neither experiment may use default registry
resolution, a native Harness, a provider, a login, or credentials.

A Stage B pass establishes only the behaviors actually observed. A candidate
cannot become a full backup unless two different Harness-specific capability
paths, Codex app-server, identity/resume, pre-terminal events, approvals,
cancel/disconnect distinction, isolation, and cleanup all have fixed-artifact
evidence. Missing toolchains and absent lower adapters remain unknowns rather
than inferred passes.

## Round-two Stage C disposition

- **Retain conditional leader:** Harness Remote `v3.0.2`. Its reviewed source
  closure still supplies the most complete fixed multi-Harness implementation
  and separately executed fixed-component evidence for Codex app-server, OMP,
  and OpenCode behavior. This applies to the reviewed set, not the whole ecosystem.
- **Defer prospective backup:** `acp-adapter v0.3.8`. The source boundary is
  credible and has no product control plane, but no Go fixture suite executed.
- **Keep as lower host component:** `acpx ffbefbb`. Its imported runtime passed
  common lifecycle tests, but fixed native adapters and two proprietary paths
  are missing from the qualification evidence.
- **Do not recommend:** LinkCode until legal/product review determines whether
  its BUSL-1.1
  Competitive Offering restriction applies; Paseo, Mjolnir and CodexHost
  because extraction is broad or the Codex plugin boundary is absent; AgentPool because current source has safety,
  isolation and lifecycle hard failures; all terminal/config/control-plane
  projects for the hard reasons in the search table.

No round-two result authorizes the Harness Remote extraction. The proposed next
slice in [boundary.md](boundary.md) still requires a new work order and user
decision.
